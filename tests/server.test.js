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
function caddyfile(env, alias) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-gw-"));
  try {
    if (env !== null) { fs.writeFileSync(path.join(dir, "pasarela.env"), env); }
    const vars = "HOST=firmas.example.test\n" + (alias !== undefined ? "ALIAS='" + alias + "'\n" : "");
    const r = spawnSync("bash", ["-c", "set -euo pipefail\n" + vars + gateway], { cwd: dir, encoding: "utf8" });
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
  /* Caddy matches the decoded path but DocuSeal gets the raw one, so a raw
     URI with %, /. or // is refused before any route (and before the key) */
  assert.ok(c.includes("@raro vars_regexp {http.request.uri} (%|/[.]|//)"));
  assert.ok(c.includes('respond @raro `{"error":"ruta"}` 400'));
  assert.ok(c.indexOf("respond @raro") < c.indexOf("reverse_proxy @enviar"));
  const raro = new RegExp(c.match(/@raro vars_regexp \{http\.request\.uri\} (\S+)/)[1]);
  ["/api/templates/5%2F%2e%2e%2F%2e%2e%2Fsubmitters%2F7", "/api/submissions/1%2F..%2F..%2Ftemplates%2F2", "//api/submissions",
    "/api/templates/../submissions/1", "/api/submissions/./1", "/api/submissions?q=%2E"].forEach((u) => assert.ok(raro.test(u), u));
  ["/api/submissions", "/api/submissions?limit=25&after=12&status=pending", "/api/submissions/42/documents?merge=true", "/api/submissions/42?include=combined_document_url",
    "/api/submitters/7"].forEach((u) => assert.ok(!raro.test(u), u));
  /* the helper's calls are all in that list */
  const helper = fs.readFileSync(path.join(__dirname, "..", "tools", "windows", "signing-helper.ps1"), "utf8");
  const calls = [...helper.matchAll(/Invoke-DocuSeal "(\w+)" \(?"([^"]+)"/g)].map((x) => [x[1], x[2]]);
  assert.ok(calls.length >= 5);
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
  /* a Caddyfile Caddy rejects falls back to the plain proxy, so DocuSeal stays online */
  assert.ok(startup.includes("caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile"));
  assert.ok(startup.includes("printf '%s {\\n\\treverse_proxy app:3000\\n}\\n' \"$SITES\" > Caddyfile"));
  assert.ok(startup.indexOf("caddy validate") < startup.indexOf("docker compose up -d"));
  assert.ok(script.includes('if ! grep -q "header_regexp X-Office-Code" Caddyfile; then'));
  /* the server script comes by stdin: nothing it runs may read the rest of it */
  assert.ok(script.includes("google_metadata_script_runner startup </dev/null"));
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

test("con un dominio, la pasarela responde igual en ese nombre y en el de la IP", { skip: !hasBash && "no bash" }, function () {
  const both = caddyfile(goodEnv, "34-1-2-3.sslip.io");
  assert.match(both, /^firmas\.example\.test, 34-1-2-3\.sslip\.io \{\n/);
  /* un solo bloque: el mismo código, la misma clave y las mismas rutas para los dos nombres */
  assert.equal((both.match(/request_header X-Auth-Token/g) || []).length, 1);
  /* sin dominio el nombre de la IP es el del servidor: un solo nombre */
  assert.match(caddyfile(goodEnv, "firmas.example.test"), /^firmas\.example\.test \{\n/);
  assert.match(caddyfile(goodEnv, ""), /^firmas\.example\.test \{\n/);
  /* algo que no es un nombre no entra al Caddyfile */
  assert.match(caddyfile(goodEnv, "x { respond 200 }"), /^firmas\.example\.test \{\n/);
  /* sin clave tambien responde en los dos, con 503 */
  const sinClave = caddyfile(null, "34-1-2-3.sslip.io");
  assert.match(sinClave, /^firmas\.example\.test, 34-1-2-3\.sslip\.io \{\n/);
  assert.ok(sinClave.includes('respond `{"error":"pasarela"}` 503'));
});

test("--dominio: un nombre del dominio de la agencia, en minúsculas; lo demás no sigue", { skip: !hasBash && "no bash" }, function () {
  const parse = script.slice(script.indexOf("NUEVOS=0\n"), script.indexOf("\ndone\n", script.indexOf("NUEVOS=0\n")) + 6);
  const run = (args) => spawnSync("bash", ["-c", "set -euo pipefail\n" + parse + 'echo "D=$DOMINIO N=$NUEVOS"', "x"].concat(args), { encoding: "utf8" });
  assert.equal(run(["--dominio", "Firmas.Ejemplo.COM"]).stdout.trim(), "D=firmas.ejemplo.com N=0");
  assert.equal(run(["--codigos-nuevos", "--dominio", "firmas.mi-agencia.com"]).stdout.trim(), "D=firmas.mi-agencia.com N=1");
  assert.equal(run([]).stdout.trim(), "D= N=0");
  for (const bad of [[], ["firmas"], ["-x.com"], ["a..com"], ["firmas.ejemplo.com;rm"], ["34-1-2-3.sslip.io"], ["firmas ejemplo.com"]]) {
    const r = run(["--dominio"].concat(bad));
    assert.equal(r.status, 1, String(bad));
    assert.match(r.stdout, /no parece un nombre de dominio/);
  }
  assert.match(run(["--otra"]).stdout, /Opcion desconocida: --otra/);
});

test("el nombre del servidor: queda guardado en la máquina y DocuSeal hace sus enlaces con él", function () {
  /* DocuSeal toma su dirección de APP_URL: los enlaces siguen al nombre del servidor */
  assert.ok(startup.includes("      - APP_URL=https://${HOST}\n"));
  assert.ok(startup.includes('ALIAS="$(md docuseal-alias 2>/dev/null || true)"'));
  assert.ok(script.includes('METADATA="docuseal-host=$HOST,docuseal-alias=$ALIAS,'));
  /* sin --dominio se queda el nombre que ya tenía la máquina */
  assert.ok(script.includes('sed -n \'s/^docuseal-host,//p\''));
  assert.ok(script.includes('HOST="${DOMINIO:-$ALIAS}"'));
  /* avisa si el registro A todavía no apunta a la IP */
  assert.ok(script.includes('echo "En el DNS del dominio, cree o cambie el registro A: $DOMINIO -> $IP"'));
});
