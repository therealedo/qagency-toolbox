/* El ayudante de firma (tools/windows/signing-helper.ps1) contra un SignWell
   de mentira: solo acepta la página de la herramienta (Host, token, JSON),
   envía en modo de prueba, guarda en el disco solo los números de documento,
   entrega el PDF firmado tal cual y lo borra en SignWell solo con /ack.
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

/* SignWell de mentira: guarda lo que recibe y responde como la API */
function fakeSignWell() {
  const calls = [];
  const state = { status: "Sent", meta: null };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      calls.push({ method: req.method, url: req.url, key: req.headers["x-api-key"], body: body ? JSON.parse(body) : null });
      const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(obj ? JSON.stringify(obj) : ""); };
      if (req.method === "POST" && req.url === "/api/v1/document_templates/documents") {
        state.meta = JSON.parse(body).metadata;
        return send(201, { id: "doc-1", status: "Sent", metadata: state.meta });
      }
      if (req.method === "GET" && req.url === "/api/v1/documents/doc-1") { return send(200, { id: "doc-1", status: state.status, metadata: state.meta }); }
      if (req.method === "GET" && req.url.startsWith("/api/v1/documents/doc-1/completed_pdf")) {
        res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(PDF);
      }
      if (req.method === "DELETE" && req.url === "/api/v1/documents/doc-1") { res.writeHead(204); return res.end(); }
      send(404, { error: "not found" });
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, calls, state, port: server.address().port })));
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

function writeKey(dir) {
  execFileSync("powershell.exe", ["-NoProfile", "-Command",
    "ConvertTo-SecureString $env:QA_TEST_KEY -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $env:QA_TEST_FILE"],
  { env: Object.assign({}, process.env, { QA_TEST_KEY: KEY, QA_TEST_FILE: path.join(dir, "clave.txt") }) });
}

const SEND = {
  templateId: "tpl-123", placeholder: "Cliente", recipient: { name: "Beatriz Diaz", email: "bea@example.com" },
  fields: [{ api_id: "client_name", value: "Beatriz Diaz" }, { api_id: "premium", value: "$45.00" }],
  language: "es", requester: "Ana Torres",
  meta: { kind: "consent", line: "oc", netKey: "consent", fileName: "Diaz, Beatriz - OC_Consent Ambetter 2026 FEB.pdf" }
};

async function waitFor(fn) {
  for (let i = 0; i < 50; i++) { const v = await fn(); if (v) { return v; } await new Promise((r) => setTimeout(r, 200)); }
  return null;
}

test("ayudante de firma: solo la herramienta, en modo de prueba; guarda solo números; PDF tal cual; borra solo con /ack", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-helper-"));
  const sw = await fakeSignWell();
  let helper;
  try {
    writeKey(dir);
    fs.writeFileSync(path.join(dir, "token.txt"), TOKEN);
    helper = await startHelper(dir, sw.port);
    const port = helper.port;

    const health = await call(port, "GET", "/health");
    assert.deepEqual([health.json.ok, health.json.testMode], [true, true]);

    /* la frontera: Host, Origin, token, tipo de contenido, preflight */
    assert.equal((await call(port, "POST", "/list", { headers: auth({ Host: "evil.example:" + port }), body: {} })).status, 403);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ Origin: "https://evil.example" }), body: {} })).status, 403);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "X-Helper-Token": "" }), body: {} })).status, 401);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "X-Helper-Token": TOKEN.replace(/.$/, "x") }), body: {} })).status, 401);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "Content-Type": "text/plain" }), body: "{}" })).status, 415);
    assert.equal((await call(port, "GET", "/list", { headers: auth() })).status, 405);
    const pre = await call(port, "OPTIONS", "/send", { headers: { Origin: "null", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-helper-token", "Access-Control-Request-Private-Network": "true" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers["access-control-allow-origin"], "null");
    assert.equal(pre.headers["access-control-allow-private-network"], "true");
    assert.match(pre.headers["access-control-allow-headers"], /X-Helper-Token/);
    assert.equal(sw.calls.length, 0, "nada rechazado llega a SignWell");

    /* datos inválidos no salen */
    const bad = await call(port, "POST", "/send", { headers: auth(), body: Object.assign({}, SEND, { recipient: { name: "B", email: "no" } }) });
    assert.equal(bad.status, 400);
    assert.equal(sw.calls.length, 0);

    /* envío: modo de prueba, la clave en el encabezado, los datos en el cuerpo */
    const sent = await call(port, "POST", "/send", { headers: auth(), body: SEND });
    assert.equal(sent.status, 200);
    assert.equal(sent.headers["access-control-allow-origin"], "null");
    assert.deepEqual(sent.json, { id: "doc-1", status: "sent", testMode: true });
    const post = sw.calls.find((c) => c.method === "POST");
    assert.equal(post.key, KEY);
    assert.equal(post.url, "/api/v1/document_templates/documents");
    assert.deepEqual(post.body, {
      test_mode: true, template_id: "tpl-123",
      recipients: [{ id: "1", placeholder_name: "Cliente", name: "Beatriz Diaz", email: "bea@example.com" }],
      template_fields: [{ api_id: "client_name", value: "Beatriz Diaz" }, { api_id: "premium", value: "$45.00" }],
      language: "es",
      metadata: { qa_kind: "consent", qa_line: "oc", qa_net: "consent", qa_file: SEND.meta.fileName },
      custom_requester_name: "Ana Torres"
    });
    assert.equal(fs.readFileSync(path.join(dir, "pendientes.json"), "utf8").replace(/^﻿/, "").trim(), '["doc-1"]');

    /* antes de firmar: listado, pero sin PDF */
    assert.equal((await call(port, "POST", "/pdf", { headers: auth(), body: { id: "doc-1" } })).status, 409);
    assert.equal((await call(port, "POST", "/pdf", { headers: auth(), body: { id: "otro" } })).status, 404);

    /* firmado: el sondeo lo ve, con su nombre y carpeta del Network */
    sw.state.status = "Completed";
    const done = await waitFor(async () => {
      const r = await call(port, "POST", "/list", { headers: auth(), body: {} });
      return r.json.docs[0] && r.json.docs[0].status === "completed" ? r.json : null;
    });
    assert.deepEqual(done, { docs: [{ id: "doc-1", status: "completed",
      meta: { kind: "consent", line: "oc", netKey: "consent", fileName: SEND.meta.fileName } }] });
    const pdf = await call(port, "POST", "/pdf", { headers: auth(), body: { id: "doc-1" } });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers["content-type"], "application/pdf");
    assert.ok(pdf.buf.equals(PDF), "el PDF sellado llega byte por byte");
    assert.ok(!sw.calls.some((c) => c.method === "DELETE"), "sin /ack no se borra");

    /* /ack: se borra en SignWell y se olvida */
    const ack = await call(port, "POST", "/ack", { headers: auth(), body: { id: "doc-1" } });
    assert.deepEqual([ack.status, ack.json], [200, { ok: true }]);
    assert.ok(sw.calls.some((c) => c.method === "DELETE" && c.url === "/api/v1/documents/doc-1"));
    assert.deepEqual((await call(port, "POST", "/list", { headers: auth(), body: {} })).json, { docs: [] });
    assert.equal(fs.readFileSync(path.join(dir, "pendientes.json"), "utf8").replace(/^﻿/, "").trim(), "[]");

    /* el registro no tiene datos del cliente, ni la clave, ni el token */
    const log = fs.readFileSync(path.join(dir, "registro.log"), "utf8");
    for (const secret of [KEY, TOKEN, "Beatriz", "bea@example.com", "Ambetter"]) { assert.ok(!log.includes(secret), "el registro no lleva " + secret); }
    assert.match(log, /send doc-1 test=True/);
  } finally {
    if (helper) { helper.child.kill(); }
    sw.server.close();
    await new Promise((r) => setTimeout(r, 300));
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
    assert.deepEqual((await call(helper.port, "GET", "/health")).json, { ok: false, testMode: true, version: "1", error: "sin-clave" });
    assert.equal((await call(helper.port, "POST", "/send", { headers: auth(), body: SEND })).status, 503);
    helper.child.kill();
    await new Promise((r) => setTimeout(r, 500));

    writeKey(dir);
    fs.writeFileSync(path.join(dir, "ajustes.json"), '{"testMode": false}');
    helper = await startHelper(dir, sw.port);
    assert.equal((await call(helper.port, "GET", "/health")).json.testMode, false);
    const sent = await call(helper.port, "POST", "/send", { headers: auth(), body: SEND });
    assert.equal(sent.json.testMode, false);
    assert.equal(sw.calls.find((c) => c.method === "POST").body.test_mode, false);
  } finally {
    if (helper) { helper.child.kill(); }
    sw.server.close();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: si SignWell redirige el PDF a otro servidor, la clave no viaja con la redirección", { skip: !WIN, timeout: 60000 }, async () => {
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
    await waitFor(async () => {
      const r = await call(helper.port, "POST", "/list", { headers: auth(), body: {} });
      return r.json.docs[0] && r.json.docs[0].status === "completed";
    });
    const pdf = await call(helper.port, "POST", "/pdf", { headers: auth(), body: { id: "doc-9" } });
    assert.equal(pdf.status, 200);
    assert.ok(pdf.buf.equals(PDF));
    assert.deepEqual(seen, [{ url: "/signed.pdf?sig=1", key: undefined }]);
  } finally {
    if (helper) { helper.child.kill(); }
    sw.close(); files.close();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
