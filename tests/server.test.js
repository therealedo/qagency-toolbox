"use strict";
/* The signing server script (tools/docuseal/crear-servidor.sh): the gateway
   that keeps the DocuSeal API key on the server. The Caddyfile step of the
   startup script runs here in bash with fake values. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const script = fs.readFileSync(path.join(__dirname, "..", "tools", "docuseal", "crear-servidor.sh"), "utf8");
const startup = script.slice(script.indexOf("<<'INICIO'\n") + 11, script.indexOf("\nINICIO\n"));
const gateway = startup.slice(startup.indexOf("# --- pasarela ---"), startup.indexOf("# --- fin pasarela ---"));
const hasBash = spawnSync("bash", ["-c", "true"]).status === 0;

const KEY = "fake_docuseal_key_0123456789";
const QA = "a".repeat(40);
const ATH = "b".repeat(40);

/* runs the gateway step in a scratch folder and returns the Caddyfile */
function caddyfile(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-gw-"));
  try {
    if (env !== null) { fs.writeFileSync(path.join(dir, "pasarela.env"), env); }
    const r = spawnSync("bash", ["-c", "set -euo pipefail\nHOST=firmas.example.test\n" + gateway], { cwd: dir, encoding: "utf8" });
    assert.strictEqual(r.status, 0, r.stderr);
    return fs.readFileSync(path.join(dir, "Caddyfile"), "utf8");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const goodEnv = "DOCUSEAL_KEY=" + KEY + "\nCODIGO_QAGENCY=" + QA + "\nCODIGO_ATH=" + ATH + "\n";

test("la pasarela solo deja pasar, con la clave, los pedidos del ayudante y con el código de una oficina", { skip: !hasBash && "no bash" }, function () {
  const c = caddyfile(goodEnv);
  assert.match(c, /^firmas\.example\.test \{/);
  assert.ok(c.includes("@codigo header X-Office-Code *"));
  assert.ok(c.includes("@oficina header_regexp X-Office-Code ^(?:" + QA + "|" + ATH + ")$"));
  assert.ok(c.includes("request_header -X-Office-Code"));
  assert.ok(c.includes('request_header X-Auth-Token "' + KEY + '"'));
  assert.ok(c.includes('respond `{"error":"codigo"}` 403'));
  assert.ok(c.includes('respond `{"error":"ruta"}` 403'));
  /* a request without a code still reaches DocuSeal as before */
  assert.match(c, /\}\n\treverse_proxy app:3000\n\}\n$/);

  /* the allowed routes, as the helper calls them */
  const routes = [];
  const re = /method (\w+)\n\s+(path|path_regexp) (\S+)/g;
  let m;
  while ((m = re.exec(c))) {
    const exact = m[3], rx = new RegExp(m[3]);
    routes.push({ method: m[1], test: m[2] === "path" ? (p) => p === exact : (p) => rx.test(p) });
  }
  assert.strictEqual(routes.length, 4);
  const allowed = (method, p) => routes.some((r) => r.method === method && r.test(p));
  assert.ok(allowed("POST", "/api/submissions"));
  assert.ok(allowed("GET", "/api/submissions"));
  assert.ok(allowed("GET", "/api/submissions/42"));
  assert.ok(allowed("GET", "/api/submissions/42/documents"));
  assert.ok(allowed("PUT", "/api/submitters/7"));
  assert.ok(allowed("DELETE", "/api/submissions/42"));
  assert.ok(!allowed("GET", "/api/templates"));
  assert.ok(!allowed("GET", "/api/submitters/7"));
  assert.ok(!allowed("DELETE", "/api/templates/1"));
  assert.ok(!allowed("POST", "/api/submissions/42"));
  assert.ok(!allowed("GET", "/api/submissions/42/documents/x"));
  assert.ok(!allowed("PUT", "/api/users/1"));
  /* the helper's calls are all in that list */
  const helper = fs.readFileSync(path.join(__dirname, "..", "tools", "windows", "signing-helper.ps1"), "utf8");
  const calls = [...helper.matchAll(/Invoke-DocuSeal "(\w+)" \(?"([^"]+)"/g)].map((x) => [x[1], x[2]]);
  assert.ok(calls.length >= 6);
  calls.forEach(([method, p]) => {
    const sample = ("/api" + p).replace(/\?.*$/, "").replace(/\/$/, "/42");
    assert.ok(allowed(method, sample), method + " " + p);
  });
});

test("sin la clave y los dos códigos válidos, la pasarela no reenvía nada con código", { skip: !hasBash && "no bash" }, function () {
  const bad = [
    null,
    "",
    "DOCUSEAL_KEY=" + KEY + "\nCODIGO_QAGENCY=" + QA + "\n",
    "DOCUSEAL_KEY=" + KEY + "\nCODIGO_QAGENCY=" + QA + "\nCODIGO_ATH=" + QA + "\n",
    "DOCUSEAL_KEY=clave con espacios\nCODIGO_QAGENCY=" + QA + "\nCODIGO_ATH=" + ATH + "\n",
    "DOCUSEAL_KEY=" + KEY + "\nCODIGO_QAGENCY=corto\nCODIGO_ATH=" + ATH + "\n",
    "DOCUSEAL_KEY=" + KEY + "\nCODIGO_QAGENCY=" + QA + "|.*\nCODIGO_ATH=" + ATH + "\n"
  ];
  bad.forEach(function (env) {
    const c = caddyfile(env);
    assert.ok(c.includes('respond `{"error":"pasarela"}` 503'), String(env));
    assert.ok(!c.includes("X-Auth-Token"), String(env));
    assert.ok(!c.includes("header_regexp"), String(env));
    assert.match(c, /\treverse_proxy app:3000\n\}\n$/);
  });
});

test("el servidor lee el Caddyfile, guarda la clave aparte y la pide sin mostrarla", function () {
  /* the startup script mounts the Caddyfile and never rewrites pasarela.env */
  assert.ok(startup.includes("./Caddyfile:/etc/caddy/Caddyfile:ro"));
  assert.ok(startup.includes("caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"));
  assert.ok(!startup.includes("reverse-proxy --from"));
  assert.ok(!/>\s*pasarela\.env/.test(startup));
  assert.ok(startup.includes("docker compose restart caddy"));
  /* an existing machine gets this version's startup script */
  assert.ok(script.includes("gcloud compute instances add-metadata"));
  /* the key is typed hidden, checked, and goes through stdin, never argv or a file */
  assert.ok(script.includes('read -r -s -p "Clave: " CLAVE'));
  assert.ok(script.includes('[[ "$CLAVE" =~ ^[A-Za-z0-9_-]{16,200}$ ]]'));
  const ssh = script.slice(script.indexOf("} | gcloud compute ssh"));
  assert.ok(ssh.startsWith('} | gcloud compute ssh "$NAME" --zone="$ZONE" --tunnel-through-iap --quiet \\\n  --command="sudo bash -s"'));
  assert.ok(!/gcloud[^\n]*\$CLAVE/.test(script));
  /* the codes are made on the server and only replaced with --codigos-nuevos */
  assert.ok(script.includes("od -An -tx1 -N20 /dev/urandom"));
  assert.ok(script.includes('if [ "$NUEVOS" = 1 ] || [ -z "$CQ" ]; then CQ="$(nuevo)"; fi'));
});
