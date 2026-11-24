# Q Agency Toolbox: relevo para tools/docuseal/plantillas.js.
# Corre en el servidor de firma (sudo python3, enviado por SSH con IAP) y
# pasa unos pocos pedidos a la API de DocuSeal con la clave, que lee de
# /srv/docuseal/pasarela.env: la clave nunca sale del servidor.
# Protocolo: un pedido JSON por linea en stdin, una respuesta JSON por linea
# en stdout. La primera linea dice si hay clave: {"ok": true} o un error.
#   {"op": "get", "path": "/api/templates?limit=100"}
#   {"op": "put", "path": "/api/templates/7", "body": {...}}
#   {"op": "sha", "url": "https://<servidor>/file/..."}  (sha256 de un PDF)
# Solo esas rutas; cualquier otra cosa recibe {"error": "ruta"}.
# Solo ASCII: plantillas.js lo envia contando caracteres.
# Para las pruebas: RELEVO_DIR cambia la carpeta y RELEVO_BASE la direccion.
import hashlib
import http.client
import json
import os
import re
import socket
import ssl
import sys
import urllib.parse

DIR = os.environ.get("RELEVO_DIR", "/srv/docuseal")
BASE = os.environ.get("RELEVO_BASE", "")

GET_OK = [
    re.compile(r"^/api/templates\?limit=[0-9]{1,3}$"),
    re.compile(r"^/api/templates/[0-9]{1,12}$"),
    re.compile(r"^/api/submissions\?template_id=[0-9]{1,12}&limit=1$"),
]
PUT_OK = re.compile(r"^/api/templates/[0-9]{1,12}$")
FILE_OK = re.compile(r"^/(file|blobs|disk|rails/active_storage)/[A-Za-z0-9_.%=/+-]{1,800}$")
REDIRECT = (301, 302, 303, 307, 308)


def read_value(name, key):
    try:
        with open(os.path.join(DIR, name), encoding="utf-8") as f:
            for line in f:
                if line.startswith(key + "="):
                    return line[len(key) + 1:].strip()
    except OSError:
        pass
    return ""


HOST = read_value(".env", "HOST")
KEY = read_value("pasarela.env", "DOCUSEAL_KEY")


def connect():
    # DocuSeal detras de Caddy en esta misma maquina: el puerto 443 de
    # 127.0.0.1, con el nombre del servidor, asi se revisa el certificado.
    if BASE:
        u = urllib.parse.urlsplit(BASE)
        return http.client.HTTPConnection(u.hostname, u.port, timeout=60)
    ctx = ssl.create_default_context()
    conn = http.client.HTTPSConnection(HOST, 443, timeout=60, context=ctx)
    sock = socket.create_connection(("127.0.0.1", 443), timeout=60)
    conn.sock = ctx.wrap_socket(sock, server_hostname=HOST)
    return conn


def call(method, path, body=None, auth=True):
    conn = connect()
    headers = {"Accept": "application/json", "Host": HOST}
    if auth:
        headers["X-Auth-Token"] = KEY
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body=data, headers=headers)
    res = conn.getresponse()
    raw = res.read()
    location = res.getheader("Location") or ""
    conn.close()
    return res.status, raw, location


def file_path(url):
    # Solo archivos de este mismo servidor.
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ("https", "http") or u.hostname != HOST or len(u.query) > 800:
        return None
    if not FILE_OK.match(u.path):
        return None
    return u.path + ("?" + u.query if u.query else "")


def handle(req):
    op = req.get("op")
    path = str(req.get("path") or "")
    if op == "get" and any(p.match(path) for p in GET_OK):
        status, raw, _ = call("GET", path)
    elif op == "put" and PUT_OK.match(path) and isinstance(req.get("body"), dict):
        status, raw, _ = call("PUT", path, req["body"])
    elif op == "sha":
        path = file_path(str(req.get("url") or ""))
        if not path:
            return {"error": "ruta"}
        # El enlace del documento redirige al archivo, en este mismo servidor.
        for _ in range(4):
            status, raw, location = call("GET", path, auth=False)
            if status not in REDIRECT or not location:
                break
            path = file_path(urllib.parse.urljoin("https://" + HOST + path, location))
            if not path:
                return {"error": "ruta"}
        if status != 200:
            return {"status": status}
        return {"status": 200, "sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}
    else:
        return {"error": "ruta"}
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else None
    except ValueError:
        payload = None
    return {"status": status, "json": payload}


def main():
    if not HOST or not KEY:
        print(json.dumps({"error": "sin-clave"}), flush=True)
        return
    print(json.dumps({"ok": True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            answer = handle(json.loads(line))
        except Exception as e:  # un pedido que falla no corta el relevo
            answer = {"error": "fallo", "detail": type(e).__name__}
        print(json.dumps(answer), flush=True)


if __name__ == "__main__":
    main()
