/* El ayudante de firma (tools/windows/signing-helper.ps1) contra un SignWell
   de mentira: solo acepta la página de la herramienta (Host, token, JSON),
   envía en modo de prueba, guarda en el disco solo números de documento,
   fechas y estados, entrega el PDF firmado tal cual, deja el historial en
   SignWell (guardar no borra) y borra solo lo que no se firmó (/delete).
   Corre solo en Windows (necesita Windows PowerShell y DPAPI). */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const WIN = process.platform === "win32";
const SCRIPT = path.join(__dirname, "..", "tools", "windows", "signing-helper.ps1");
const KEY = "sw-test-key-0123456789";
const TOKEN = "a".repeat(16) + "0123456789abcdef0123456789abcdef";
const PDF = Buffer.from("%PDF-1.7\nsellado por SignWell\n%%EOF");

function freePort() {
  return new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
}

/* SignWell de mentira: guarda lo que recibe y responde como la API.
   docs[id] = { status, meta, name, email } */
function fakeSignWell(seed) {
  const calls = [];
  const docs = Object.assign({}, seed || {});
  let next = 1;
  const view = (id) => {
    const d = docs[id];
    return { id, status: d.status, metadata: d.meta, created_at: "2026-11-20T14:00:00Z", updated_at: "2026-11-20T15:30:00Z",
      recipients: [{ name: d.name, email: d.email, status: "sent" }] };
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      calls.push({ method: req.method, url: req.url, key: req.headers["x-api-key"], body: body ? JSON.parse(body) : null });
      const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(obj ? JSON.stringify(obj) : ""); };
      if (req.method === "POST" && req.url === "/api/v1/document_templates/documents") {
        const b = JSON.parse(body), id = "doc-" + next++;
        docs[id] = { status: "Sent", meta: b.metadata, name: b.recipients[0].name, email: b.recipients[0].email };
        return send(201, view(id));
      }
      const m = /^\/api\/v1\/documents\/([^/?]+)(\/completed_pdf)?/.exec(req.url);
      if (!m || !docs[m[1]]) { return send(404, { error: "not found" }); }
      if (req.method === "GET" && m[2]) { res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(PDF); }
      if (req.method === "GET") { return send(200, view(m[1])); }
      if (req.method === "DELETE") { delete docs[m[1]]; res.writeHead(204); return res.end(); }
      send(404, { error: "not found" });
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, calls, docs, port: server.address().port })));
}

function call(port, method, p, opts) {
  const o = opts || {};
  const headers = Object.assign({ Host: "127.0.0.1:" + port }, o.headers || {});
  const data = o.body === undefined ? null : Buffer.from(typeof o.body === "string" ? o.body : JSON.stringify(o.body));
  if (data) { headers["Content-Length"] = data.length; }
  return new Promise((ok, fail) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString("utf8")); } catch (e) { /* no es JSON */ }
        ok({ status: res.statusCode, headers: res.headers, buf, json });
      });
    });
    req.on("error", fail);
    if (data) { req.write(data); }
    req.end();
  });
}
const auth = (extra) => Object.assign({ "X-Helper-Token": TOKEN, "Content-Type": "application/json", Origin: "null" }, extra || {});
const post = (port, p, body) => call(port, "POST", p, { headers: auth(), body: body || {} });

async function startHelper(dir, apiPort) {
  const port = await freePort();
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT,
    "-Port", String(port), "-Dir", dir, "-ApiBase", "http://127.0.0.1:" + apiPort + "/api/v1", "-PollSeconds", "1"], { stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try { const r = await call(port, "GET", "/health"); if (r.status === 200) { return { port, child }; } } catch (e) { /* aún no abre */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error("el ayudante no abrió");
}
async function stopHelper(h) { if (h) { h.child.kill(); await new Promise((r) => setTimeout(r, 500)); } }

function writeKey(dir) {
  execFileSync("powershell.exe", ["-NoProfile", "-Command",
    "ConvertTo-SecureString $env:QA_TEST_KEY -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $env:QA_TEST_FILE"],
  { env: Object.assign({}, process.env, { QA_TEST_KEY: KEY, QA_TEST_FILE: path.join(dir, "clave.txt") }) });
}
const readStore = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "documentos.json"), "utf8").replace(/^\uFEFF/, ""));

const SEND = {
  templateId: "tpl-123", placeholder: "Cliente", recipient: { name: "Beatriz Diaz", email: "bea@example.com" },
  fields: [{ api_id: "client_name", value: "Beatriz Diaz" }, { api_id: "premium", value: "$45.00" }],
  language: "es", requester: "Ana Torres",
  meta: { kind: "consent", line: "oc", netKey: "consent", fileName: "Diaz, Beatriz - OC_Consent Ambetter 2026 FEB.pdf" }
};
const META = { kind: "consent", line: "oc", netKey: "consent", fileName: SEND.meta.fileName };

async function waitFor(fn) {
  for (let i = 0; i < 50; i++) { const v = await fn(); if (v) { return v; } await new Promise((r) => setTimeout(r, 200)); }
  return null;
}

test("ayudante de firma: solo la herramienta, en modo de prueba; guarda solo números; PDF tal cual; historial en SignWell; cancela y borra solo lo no firmado", { skip: !WIN, timeout: 90000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-helper-"));
  const sw = await fakeSignWell();
  let helper;
  try {
    writeKey(dir);
    fs.writeFileSync(path.join(dir, "token.txt"), TOKEN);
    helper = await startHelper(dir, sw.port);
    let port = helper.port;

    const health = await call(port, "GET", "/health");
    assert.deepEqual([health.json.ok, health.json.testMode, health.json.version], [true, true, "2"]);

    /* la frontera: Host, Origin, token, tipo de contenido, preflight */
    assert.equal((await call(port, "POST", "/list", { headers: auth({ Host: "evil.example:" + port }), body: {} })).status, 403);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ Origin: "https://evil.example" }), body: {} })).status, 403);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "X-Helper-Token": "" }), body: {} })).status, 401);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "X-Helper-Token": TOKEN.replace(/.$/, "x") }), body: {} })).status, 401);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "Content-Type": "text/plain" }), body: "{}" })).status, 415);
    assert.equal((await call(port, "GET", "/list", { headers: auth() })).status, 405);
    assert.equal((await call(port, "POST", "/delete", { headers: auth({ "X-Helper-Token": "" }), body: { id: "doc-1" } })).status, 401);
    const pre = await call(port, "OPTIONS", "/send", { headers: { Origin: "null", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-helper-token", "Access-Control-Request-Private-Network": "true" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers["access-control-allow-origin"], "null");
    assert.equal(pre.headers["access-control-allow-private-network"], "true");
    assert.match(pre.headers["access-control-allow-headers"], /X-Helper-Token/);
    assert.equal(sw.calls.length, 0, "nada rechazado llega a SignWell");

    /* datos inválidos no salen */
    const bad = await post(port, "/send", Object.assign({}, SEND, { recipient: { name: "B", email: "no" } }));
    assert.equal(bad.status, 400);
    assert.equal(sw.calls.length, 0);

    /* envío: modo de prueba, la clave en el encabezado, los datos en el cuerpo */
    const sent = await post(port, "/send", SEND);
    assert.equal(sent.status, 200);
    assert.equal(sent.headers["access-control-allow-origin"], "null");
    assert.deepEqual(sent.json, { id: "doc-1", status: "sent", testMode: true });
    const created = sw.calls.find((c) => c.method === "POST");
    assert.equal(created.key, KEY);
    assert.equal(created.url, "/api/v1/document_templates/documents");
    assert.deepEqual(created.body, {
      test_mode: true, template_id: "tpl-123",
      recipients: [{ id: "1", placeholder_name: "Cliente", name: "Beatriz Diaz", email: "bea@example.com" }],
      template_fields: [{ api_id: "client_name", value: "Beatriz Diaz" }, { api_id: "premium", value: "$45.00" }],
      language: "es",
      metadata: { qa_kind: "consent", qa_line: "oc", qa_net: "consent", qa_file: SEND.meta.fileName },
      custom_requester_name: "Ana Torres"
    });

    /* en el disco: número, fecha de envío, estado final y si se guardó; nada del cliente */
    const store = readStore(dir);
    assert.equal(store.length, 1);
    assert.deepEqual([store[0].id, store[0].saved, store[0].status], ["doc-1", false, ""]);
    assert.match(store[0].sent, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
    const raw = fs.readFileSync(path.join(dir, "documentos.json"), "utf8");
    for (const s of ["Beatriz", "bea@example.com", "Ambetter", "tpl-123"]) { assert.ok(!raw.includes(s), "el disco no lleva " + s); }

    /* el tablero: lo pendiente con el cliente, el estado y las fechas de SignWell */
    const list1 = (await post(port, "/list", { refresh: true })).json;
    assert.deepEqual(list1, { docs: [{ id: "doc-1", status: "sent", saved: false, sent: store[0].sent, meta: META,
      name: "Beatriz Diaz", email: "bea@example.com", created: "2026-11-20T14:00:00Z", updated: "2026-11-20T15:30:00Z" }], total: 0 });

    /* antes de firmar: sin PDF y sin marcar guardado */
    assert.equal((await post(port, "/pdf", { id: "doc-1" })).status, 409);
    assert.equal((await post(port, "/pdf", { id: "otro" })).status, 404);
    assert.equal((await post(port, "/saved", { id: "doc-1" })).status, 409);

    /* firmado: el sondeo lo ve; el PDF llega byte por byte */
    sw.docs["doc-1"].status = "Completed";
    assert.ok(await waitFor(async () => (await post(port, "/list")).json.docs[0].status === "completed"));
    assert.equal(readStore(dir)[0].status, "completed");
    const pdf = await post(port, "/pdf", { id: "doc-1" });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers["content-type"], "application/pdf");
    assert.ok(pdf.buf.equals(PDF), "el PDF sellado llega byte por byte");

    /* un firmado no se borra; guardarlo solo lo marca y queda en el historial */
    const refused = await post(port, "/delete", { id: "doc-1" });
    assert.deepEqual([refused.status, refused.json], [409, { error: "firmado" }]);
    assert.deepEqual((await post(port, "/saved", { id: "doc-1" })).json, { ok: true });
    assert.equal(readStore(dir)[0].saved, true);
    assert.ok(!sw.calls.some((c) => c.method === "DELETE"), "guardar no borra en SignWell");
    const list2 = (await post(port, "/list")).json;
    assert.deepEqual([list2.total, list2.docs.length, list2.docs[0].saved, list2.docs[0].status], [1, 1, true, "completed"]);
    assert.equal((await post(port, "/ack", { id: "doc-1" })).status, 404, "/ack ya no existe");

    /* enviado por error: se cancela (DELETE en SignWell) y sale del tablero */
    const second = await post(port, "/send", SEND);
    assert.equal(second.json.id, "doc-2");
    assert.equal((await post(port, "/delete", { id: "nada" })).status, 404);
    assert.deepEqual((await post(port, "/delete", { id: "doc-2" })).json, { ok: true });
    assert.ok(sw.calls.some((c) => c.method === "DELETE" && c.url === "/api/v1/documents/doc-2"));
    assert.deepEqual(readStore(dir).map((x) => x.id), ["doc-1"]);

    /* vencido: se puede borrar */
    await post(port, "/send", SEND);
    sw.docs["doc-3"].status = "Expired";
    assert.ok(await waitFor(async () => (await post(port, "/list")).json.docs.some((x) => x.id === "doc-3" && x.status === "expired")));
    assert.deepEqual((await post(port, "/delete", { id: "doc-3" })).json, { ok: true });
    assert.ok(!(await post(port, "/list")).json.docs.some((x) => x.id === "doc-3"));

    /* al reabrir: el historial sigue, y un final no se vuelve a sondear */
    await stopHelper(helper);
    const before = sw.calls.length;
    helper = await startHelper(dir, sw.port);
    port = helper.port;
    const list3 = (await post(port, "/list")).json;
    assert.deepEqual([list3.docs[0].id, list3.docs[0].status, list3.docs[0].saved, list3.docs[0].name], ["doc-1", "completed", true, "Beatriz Diaz"]);
    await new Promise((r) => setTimeout(r, 2500));
    await post(port, "/list");
    assert.equal(sw.calls.slice(before).filter((c) => c.url === "/api/v1/documents/doc-1").length, 1, "un firmado se pide a SignWell una sola vez");

    /* el registro no tiene datos del cliente, ni la clave, ni el token */
    const log = fs.readFileSync(path.join(dir, "registro.log"), "utf8");
    for (const secret of [KEY, TOKEN, "Beatriz", "bea@example.com", "Ambetter"]) { assert.ok(!log.includes(secret), "el registro no lleva " + secret); }
    assert.match(log, /send doc-1 test=True/);
    assert.match(log, /delete doc-2 sent/);
  } finally {
    await stopHelper(helper);
    sw.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: el historial llega de a partes, lo más nuevo primero, y lo pendiente siempre", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-helper-"));
  const doc = (status) => ({ status, meta: {}, name: "Cliente de prueba", email: "c@example.com" });
  const sw = await fakeSignWell({ "d-1": doc("Completed"), "d-2": doc("Completed"), "d-3": doc("Expired"), "d-4": doc("Sent") });
  let helper;
  try {
    writeKey(dir);
    fs.writeFileSync(path.join(dir, "token.txt"), TOKEN);
    const at = (n) => "2026-11-0" + n + "T10:00:00.0000000Z";
    fs.writeFileSync(path.join(dir, "documentos.json"), JSON.stringify([
      { id: "d-1", sent: at(1), saved: true, status: "completed" }, { id: "d-2", sent: at(2), saved: true, status: "completed" },
      { id: "d-3", sent: at(3), saved: false, status: "expired" }, { id: "d-4", sent: at(4), saved: false, status: "" }]));
    helper = await startHelper(dir, sw.port);
    const one = (await post(helper.port, "/list", { limit: 1 })).json;
    assert.deepEqual([one.total, one.docs.map((x) => x.id)], [3, ["d-4", "d-3"]]);
    const all = (await post(helper.port, "/list", { limit: 25 })).json;
    assert.deepEqual(all.docs.map((x) => x.id), ["d-4", "d-3", "d-2", "d-1"]);
    assert.equal((await post(helper.port, "/list", { limit: "x" })).status, 400);
  } finally {
    await stopHelper(helper);
    sw.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: sin clave no envía nada; con testMode false en ajustes.json envía de verdad", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-helper-"));
  const sw = await fakeSignWell();
  let helper;
  try {
    fs.writeFileSync(path.join(dir, "token.txt"), TOKEN);
    helper = await startHelper(dir, sw.port);
    assert.deepEqual((await call(helper.port, "GET", "/health")).json, { ok: false, testMode: true, version: "2", error: "sin-clave" });
    assert.equal((await post(helper.port, "/send", SEND)).status, 503);
    await stopHelper(helper);

    writeKey(dir);
    fs.writeFileSync(path.join(dir, "ajustes.json"), '{"testMode": false}');
    helper = await startHelper(dir, sw.port);
    assert.equal((await call(helper.port, "GET", "/health")).json.testMode, false);
    const sent = await post(helper.port, "/send", SEND);
    assert.equal(sent.json.testMode, false);
    assert.equal(sw.calls.find((c) => c.method === "POST").body.test_mode, false);
  } finally {
    await stopHelper(helper);
    sw.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: los pendientes de la versión 1 pasan al historial; la clave no viaja con una redirección", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-helper-"));
  const seen = [];
  const files = http.createServer((req, res) => { seen.push({ url: req.url, key: req.headers["x-api-key"] }); res.writeHead(200, { "Content-Type": "application/pdf" }); res.end(PDF); });
  await new Promise((r) => files.listen(0, "127.0.0.1", r));
  const sw = http.createServer((req, res) => {
    if (req.url === "/api/v1/documents/doc-9") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ id: "doc-9", status: "Completed", metadata: {} })); }
    if (req.url.startsWith("/api/v1/documents/doc-9/completed_pdf")) { res.writeHead(302, { Location: "http://127.0.0.1:" + files.address().port + "/signed.pdf?sig=1" }); return res.end(); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => sw.listen(0, "127.0.0.1", r));
  let helper;
  try {
    writeKey(dir);
    fs.writeFileSync(path.join(dir, "token.txt"), TOKEN);
    fs.writeFileSync(path.join(dir, "pendientes.json"), '["doc-9"]');
    helper = await startHelper(dir, sw.address().port);
    assert.deepEqual(readStore(dir), [{ id: "doc-9", sent: "", saved: false, status: "" }]);
    assert.ok(!fs.existsSync(path.join(dir, "pendientes.json")));
    await waitFor(async () => {
      const r = await post(helper.port, "/list");
      return r.json.docs[0] && r.json.docs[0].status === "completed";
    });
    const pdf = await post(helper.port, "/pdf", { id: "doc-9" });
    assert.equal(pdf.status, 200);
    assert.ok(pdf.buf.equals(PDF));
    assert.deepEqual(seen, [{ url: "/signed.pdf?sig=1", key: undefined }]);
  } finally {
    await stopHelper(helper);
    sw.close(); files.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
