/* El ayudante de firma (tools/windows/signing-helper.ps1) contra un DocuSeal
   de mentira: solo acepta la página de la herramienta (Host, token, JSON),
   crea los envíos sin correos, lista los del equipo desde el servidor,
   entrega el PDF firmado tal cual, marca el guardado en el servidor,
   archiva solo lo que no se firmó y, en el SOA, llena y bloquea los datos
   del agente recién cuando el cliente firmó. El ayudante no tiene la clave
   de DocuSeal: pasa el código de la oficina que le da la página, y la
   pasarela del servidor (aquí, el DocuSeal de mentira) pone la clave.
   Corre solo en Windows (necesita Windows PowerShell). */
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
const CODE = "QAgency_codigo-de-prueba_0123456789abcdefABCDEF";
const TOKEN = "a".repeat(16) + "0123456789abcdef0123456789abcdef";
const PDF = Buffer.from("%PDF-1.7\nfirmado en DocuSeal\n%%EOF");

function freePort() {
  return new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
}

/* DocuSeal de mentira: guarda lo que recibe y responde como la API.
   subs[id] = { template, created, archived, submitters: [{ id, role, name, email, slug, metadata, values, opened, completed, declined }] } */
function fakeDocuSeal(opts) {
  const o = opts || {};
  const calls = [];
  const subs = {};
  const files = [];
  let nextSub = 1, nextSubmitter = 1;
  let port = 0;
  const base = () => "http://127.0.0.1:" + port;
  const submitterView = (s) => ({ id: s.id, role: s.role, name: s.name, email: s.email, slug: s.slug, metadata: s.metadata,
    status: s.completed ? "completed" : (s.declined ? "declined" : (s.opened ? "opened" : "sent")),
    opened_at: s.opened, completed_at: s.completed, declined_at: s.declined, values: s.values });
  const view = (id) => {
    const x = subs[id];
    const done = x.submitters.every((s) => s.completed);
    return { id, status: done ? "completed" : "pending", created_at: x.created, updated_at: x.created, completed_at: done ? x.submitters[x.submitters.length - 1].completed : null,
      expire_at: x.expire || null, archived_at: x.archived, template: { id: x.template }, submitters: x.submitters.map(submitterView) };
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const u = new URL(req.url, base());
      calls.push({ method: req.method, url: req.url, path: u.pathname, key: req.headers["x-auth-token"], code: req.headers["x-office-code"], type: req.headers["content-type"], body: body ? JSON.parse(body) : null });
      const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
      if (u.pathname.startsWith("/files/")) {
        files.push({ url: req.url, key: req.headers["x-auth-token"], code: req.headers["x-office-code"] });
        if (o.redirectFile && u.pathname === "/files/merged.pdf") { res.writeHead(302, { Location: base() + "/files/blob.pdf?sig=1" }); return res.end(); }
        res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(PDF);
      }
      /* como la pasarela: solo con el código de la oficina, y el ayudante nunca manda una clave */
      if (req.headers["x-office-code"] !== CODE || req.headers["x-auth-token"] !== undefined) { return send(403, { error: "codigo" }); }
      if (o.reject && req.method === "POST") { return send(o.reject[0], o.reject[1]); }
      if (req.method === "POST" && u.pathname === "/api/submissions") {
        const b = JSON.parse(body), id = nextSub++;
        subs[id] = { template: b.template_id, created: "2026-11-21T14:0" + id + ":00.000Z", archived: null,
          submitters: b.submitters.map((s) => ({ id: nextSubmitter++, role: s.role, name: s.name, email: s.email || null, slug: "slug" + nextSubmitter,
            metadata: s.metadata || {}, values: (s.fields || []).map((f) => ({ field: f.name, value: f.default_value })), opened: null, completed: null, declined: null })) };
        return send(200, subs[id].submitters.map((s) => Object.assign(submitterView(s), { submission_id: id, embed_src: base() + "/s/" + s.slug })));
      }
      if (req.method === "GET" && u.pathname === "/api/submissions") {
        let ids = Object.keys(subs).map(Number).sort((a, b) => b - a).filter((id) => !subs[id].archived);
        if (u.searchParams.get("status") === "pending") { ids = ids.filter((id) => view(id).status === "pending"); }
        if (u.searchParams.get("after")) { ids = ids.filter((id) => id < Number(u.searchParams.get("after"))); }
        const limit = Number(u.searchParams.get("limit") || 10);
        const page = ids.slice(0, limit);
        return send(200, { data: page.map(view), pagination: { count: page.length, next: page.length ? page[page.length - 1] : null, prev: page[0] || null } });
      }
      let m = /^\/api\/submissions\/(\d+)(\/documents)?$/.exec(u.pathname);
      if (m) {
        const id = Number(m[1]);
        if (!subs[id]) { return send(404, { error: "Not found" }); }
        if (req.method === "GET" && m[2]) { return send(200, { id, documents: [{ name: "merged", url: base() + "/files/merged.pdf" }] }); }
        if (req.method === "GET") { return send(200, view(id)); }
        if (req.method === "DELETE") { subs[id].archived = "2026-11-21T20:00:00.000Z"; return send(200, { id, archived_at: subs[id].archived }); }
      }
      m = /^\/api\/submitters\/(\d+)$/.exec(u.pathname);
      if (m && req.method === "PUT") {
        const s = Object.values(subs).flatMap((x) => x.submitters).find((y) => y.id === Number(m[1]));
        if (!s) { return send(404, { error: "Not found" }); }
        const b = JSON.parse(body);
        if (b.metadata) { s.metadata = b.metadata; }
        for (const f of b.fields || []) { s.values = s.values.filter((v) => v.field !== f.name).concat([{ field: f.name, value: f.default_value, readonly: f.readonly }]); }
        return send(200, submitterView(s));
      }
      send(404, { error: "Not found" });
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => { port = server.address().port; ok({ server, calls, subs, files, port }); }));
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
const auth = (extra) => Object.assign({ "X-Helper-Token": TOKEN, "X-Office-Code": CODE, "Content-Type": "application/json", Origin: "null" }, extra || {});
const post = (port, p, body) => call(port, "POST", p, { headers: auth(), body: body || {} });

/* apiPort: un DocuSeal de mentira (-ApiBase). Sin él, el ayudante usa el
   servidor de firmas que trae adentro. */
async function startHelper(dir, apiPort) {
  const port = await freePort();
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-Port", String(port), "-Dir", dir];
  if (apiPort) { args.push("-ApiBase", "http://127.0.0.1:" + apiPort + "/api"); }
  const child = spawn("powershell.exe", args, { stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try { const r = await call(port, "GET", "/health"); if (r.status === 200) { return { port, child }; } } catch (e) { /* aún no abre */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error("el ayudante no abrió");
}
async function stopHelper(h) { if (h) { h.child.kill(); await new Promise((r) => setTimeout(r, 500)); } }

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-helper-"));
  fs.writeFileSync(path.join(dir, "token.txt"), TOKEN);
  return dir;
}

const FILE = "Diaz, Beatriz - OC_Consent Ambetter 2026 FEB.pdf";
const SEND = {
  templateId: "1", recipient: { name: "Beatriz Diaz", email: "bea@example.com" },
  fields: [{ name: "Yo SrSra", value: "Beatriz Diaz" }, { name: "Premium", value: "$45.00" }],
  requester: "Ana Torres",
  meta: { kind: "consent", line: "oc", netKey: "consent", fileName: FILE }
};
const META = { kind: "consent", line: "oc", netKey: "consent", fileName: FILE };
const SOA_FILE = "Diaz, Beatriz - Medicare_Humana_SOA 2026 NOV.pdf";
const SOA = {
  templateId: "5", recipient: { name: "Beatriz Diaz", email: "bea@example.com" },
  fields: [], requester: "Ana Torres",
  meta: { kind: "soa", line: "mc", netKey: "soa", fileName: SOA_FILE },
  agent: { name: "Ana Torres", email: "ana@example.com", dateField: "Fecha de la cita",
    fields: [{ name: "ID del Representante de Ventas con Licencia", value: "10000001" },
      { name: "Direccion del beneficiario", value: "123 Calle Falsa" }, { name: "Planes que explicará", value: "" }] }
};

async function waitFor(fn) {
  for (let i = 0; i < 50; i++) { const v = await fn(); if (v) { return v; } await new Promise((r) => setTimeout(r, 200)); }
  return null;
}

test("ayudante de firma: solo la herramienta; envía sin correos; lista del servidor; PDF tal cual; guardado en el servidor; archiva solo lo no firmado", { skip: !WIN, timeout: 90000 }, async () => {
  const dir = setup();
  const ds = await fakeDocuSeal();
  let helper;
  try {
    helper = await startHelper(dir, ds.port);
    const port = helper.port;

    assert.deepEqual((await call(port, "GET", "/health")).json, { ok: true, version: "4", error: null });

    /* la frontera: Host, Origin, token, tipo de contenido, preflight */
    assert.equal((await call(port, "POST", "/list", { headers: auth({ Host: "evil.example:" + port }), body: {} })).status, 403);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ Origin: "https://evil.example" }), body: {} })).status, 403);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "X-Helper-Token": "" }), body: {} })).status, 401);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "X-Helper-Token": TOKEN.replace(/.$/, "x") }), body: {} })).status, 401);
    assert.equal((await call(port, "POST", "/list", { headers: auth({ "Content-Type": "text/plain" }), body: "{}" })).status, 415);
    assert.equal((await call(port, "GET", "/list", { headers: auth() })).status, 405);
    assert.equal((await call(port, "POST", "/agent", { headers: auth({ "X-Helper-Token": "" }), body: { id: "1" } })).status, 401);
    const pre = await call(port, "OPTIONS", "/send", { headers: { Origin: "null", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-helper-token,x-office-code", "Access-Control-Request-Private-Network": "true" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers["access-control-allow-origin"], "null");
    assert.equal(pre.headers["access-control-allow-private-network"], "true");
    assert.match(pre.headers["access-control-allow-headers"], /X-Helper-Token/);
    assert.match(pre.headers["access-control-allow-headers"], /X-Office-Code/);
    assert.equal(ds.calls.length, 0, "nada rechazado llega al servidor");

    /* datos inválidos no salen */
    for (const wrong of [{ recipient: { name: "B", email: "no" } }, { templateId: "tpl-1" }, { fields: [{ name: "", value: "x" }] },
      { meta: Object.assign({}, SEND.meta, { kind: "otro" }) }]) {
      assert.equal((await post(port, "/send", Object.assign({}, SEND, wrong))).status, 400);
    }
    assert.equal(ds.calls.length, 0);

    /* envío: sin correos, el código de la oficina (nunca una clave), los campos llenos y bloqueados */
    const sent = await post(port, "/send", SEND);
    assert.equal(sent.status, 200);
    assert.equal(sent.headers["access-control-allow-origin"], "null");
    assert.deepEqual(sent.json, { id: "1", link: "http://127.0.0.1:" + ds.port + "/s/slug2" });
    const created = ds.calls.find((c) => c.method === "POST");
    assert.equal(created.code, CODE);
    assert.equal(created.key, undefined, "el ayudante no tiene clave");
    assert.ok(ds.calls.every((c) => c.code === CODE && c.key === undefined));
    assert.equal(created.type, "application/json");
    assert.equal(created.path, "/api/submissions");
    assert.deepEqual(created.body, {
      template_id: 1, send_email: false, order: "preserved",
      submitters: [{ role: "Cliente", name: "Beatriz Diaz", email: "bea@example.com", order: 0,
        metadata: { qa_kind: "consent", qa_line: "oc", qa_net: "consent", qa_file: FILE, qa_agent: "Ana Torres" },
        fields: [{ name: "Yo SrSra", default_value: "Beatriz Diaz", readonly: true }, { name: "Premium", default_value: "$45.00", readonly: true }] }]
    });

    /* en el disco: nada de los envíos */
    assert.ok(!fs.existsSync(path.join(dir, "documentos.json")));

    /* el tablero: lo del servidor, con quién lo envió y el enlace mientras espera */
    const list1 = (await post(port, "/list")).json;
    assert.deepEqual(list1, { docs: [{ id: "1", status: "sent", saved: false, meta: META, agent: "Ana Torres",
      name: "Beatriz Diaz", email: "bea@example.com", created: "2026-11-21T14:01:00.000Z", link: "http://127.0.0.1:" + ds.port + "/s/slug2" }], more: false });

    /* antes de firmar: sin PDF, sin guardado, sin paso del agente */
    assert.equal((await post(port, "/pdf", { id: "1" })).status, 409);
    assert.equal((await post(port, "/pdf", { id: "99" })).status, 404);
    assert.equal((await post(port, "/pdf", { id: "1;x" })).status, 400);
    assert.equal((await post(port, "/saved", { id: "1" })).status, 409);

    /* abierto, y después firmado: el PDF llega byte por byte, sin la clave */
    ds.subs[1].submitters[0].opened = "2026-11-21T15:00:00.000Z";
    assert.equal((await post(port, "/list")).json.docs[0].status, "viewed");
    ds.subs[1].submitters[0].completed = "2026-11-21T15:05:00.000Z";
    const done = (await post(port, "/list")).json.docs[0];
    assert.deepEqual([done.status, done.link], ["completed", undefined]);
    const pdf = await post(port, "/pdf", { id: "1" });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers["content-type"], "application/pdf");
    assert.ok(pdf.buf.equals(PDF), "el PDF firmado llega byte por byte");
    assert.ok(ds.calls.some((c) => c.path === "/api/submissions/1/documents" && /merge=true/.test(c.url)));
    assert.deepEqual(ds.files, [{ url: "/files/merged.pdf", key: undefined, code: undefined }], "el código no va al enlace del PDF");

    /* un firmado no se archiva; guardarlo lo marca en el servidor para todo el equipo */
    const refused = await post(port, "/delete", { id: "1" });
    assert.deepEqual([refused.status, refused.json], [409, { error: "firmado" }]);
    assert.deepEqual((await post(port, "/saved", { id: "1" })).json, { ok: true });
    const put = ds.calls.find((c) => c.method === "PUT");
    assert.equal(put.path, "/api/submitters/" + ds.subs[1].submitters[0].id);
    assert.deepEqual(put.body, { metadata: { qa_kind: "consent", qa_line: "oc", qa_net: "consent", qa_file: FILE, qa_agent: "Ana Torres", qa_saved: "1" } });
    assert.equal((await post(port, "/list")).json.docs[0].saved, true);

    /* enviado por error: se archiva en el servidor y sale del tablero */
    const second = await post(port, "/send", SEND);
    assert.equal(second.json.id, "2");
    assert.equal((await post(port, "/delete", { id: "77" })).status, 404);
    assert.deepEqual((await post(port, "/delete", { id: "2" })).json, { ok: true });
    assert.ok(ds.calls.some((c) => c.method === "DELETE" && c.path === "/api/submissions/2"));
    assert.deepEqual((await post(port, "/list")).json.docs.map((x) => x.id), ["1"]);

    /* el registro no tiene datos del cliente, ni el código, ni el token */
    const log = fs.readFileSync(path.join(dir, "registro.log"), "utf8");
    for (const secret of [CODE, TOKEN, "Beatriz", "bea@example.com", "Ambetter", "slug2"]) { assert.ok(!log.includes(secret), "el registro no lleva " + secret); }
    assert.match(log, /send 1\b/);
    assert.match(log, /delete 2 sent/);
  } finally {
    await stopHelper(helper);
    ds.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: SOA con dos firmas; los datos del agente se llenan y bloquean recién cuando el cliente firmó", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = setup();
  const ds = await fakeDocuSeal();
  let helper;
  try {
    helper = await startHelper(dir, ds.port);
    const port = helper.port;
    assert.equal((await post(port, "/send", Object.assign({}, SOA, { agent: undefined }))).status, 400, "un SOA sin agente no sale");
    const sent = await post(port, "/send", SOA);
    assert.equal(sent.status, 200);
    const body = ds.calls.find((c) => c.method === "POST").body;
    assert.equal(body.order, "preserved");
    assert.deepEqual(body.submitters.map((s) => [s.role, s.order]), [["Cliente", 0], ["Agente", 1]]);
    const agente = body.submitters[1];
    assert.deepEqual([agente.name, agente.email, agente.fields], ["Ana Torres", "ana@example.com", undefined], "al enviar, el agente no lleva campos");
    assert.deepEqual(JSON.parse(agente.metadata.qa_fields), [{ name: "ID del Representante de Ventas con Licencia", value: "10000001" },
      { name: "Direccion del beneficiario", value: "123 Calle Falsa" }]);
    assert.equal(agente.metadata.qa_date_field, "Fecha de la cita");

    /* antes de que firme el cliente: no hay paso del agente */
    const early = await post(port, "/agent", { id: "1" });
    assert.deepEqual([early.status, early.json], [409, { error: "cliente" }]);
    assert.ok(!ds.calls.some((c) => c.method === "PUT"));

    /* el cliente firmó: falta el agente */
    ds.subs[1].submitters[0].completed = "2026-11-21T23:30:00.000Z";
    assert.equal((await post(port, "/list")).json.docs[0].status, "agent");
    const step = await post(port, "/agent", { id: "1" });
    assert.equal(step.status, 200);
    assert.deepEqual(step.json, { link: "http://127.0.0.1:" + ds.port + "/s/slug3" });
    const put = ds.calls.find((c) => c.method === "PUT");
    assert.equal(put.path, "/api/submitters/" + ds.subs[1].submitters[1].id);
    /* la fecha de la cita es el día en que firmó el cliente, en la hora de esta computadora */
    const expected = execFileSync("powershell.exe", ["-NoProfile", "-Command",
      "([datetime]::Parse('2026-11-21T23:30:00.000Z')).ToLocalTime().ToString('MM/dd/yyyy', [Globalization.CultureInfo]::InvariantCulture)"]).toString().trim();
    assert.deepEqual(put.body, { fields: [
      { name: "ID del Representante de Ventas con Licencia", default_value: "10000001", readonly: true },
      { name: "Direccion del beneficiario", default_value: "123 Calle Falsa", readonly: true },
      { name: "Fecha de la cita", default_value: expected, readonly: true }] });

    /* el agente firmó: ya no hay paso, y el SOA queda firmado */
    ds.subs[1].submitters[1].completed = "2026-11-22T00:10:00.000Z";
    assert.deepEqual((await post(port, "/agent", { id: "1" })).json, { error: "firmado" });
    assert.equal((await post(port, "/list")).json.docs[0].status, "completed");
    /* un Consent no tiene paso del agente */
    await post(port, "/send", SEND);
    ds.subs[2].submitters[0].completed = "2026-11-22T01:00:00.000Z";
    assert.deepEqual((await post(port, "/agent", { id: "2" })).json, { error: "no-soa" });
  } finally {
    await stopHelper(helper);
    ds.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: el historial llega de a partes, lo más nuevo primero, y lo pendiente siempre", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = setup();
  const ds = await fakeDocuSeal();
  let helper;
  try {
    helper = await startHelper(dir, ds.port);
    const port = helper.port;
    for (let i = 0; i < 5; i++) { await post(port, "/send", SEND); }
    ds.subs[2].submitters[0].completed = "2026-11-21T16:00:00.000Z";
    ds.subs[3].submitters[0].completed = "2026-11-21T16:00:00.000Z";
    ds.subs[4].submitters[0].completed = "2026-11-21T16:00:00.000Z";
    ds.subs[5].submitters[0].completed = "2026-11-21T16:00:00.000Z";
    /* 1 espera la firma y es el más viejo: igual aparece */
    const one = (await post(port, "/list", { limit: 1 })).json;
    assert.deepEqual([one.more, one.docs.map((x) => x.id)], [true, ["5", "1"]]);
    const all = (await post(port, "/list", { limit: 25 })).json;
    assert.deepEqual([all.more, all.docs.map((x) => x.id)], [false, ["5", "4", "3", "2", "1"]]);
    assert.equal((await post(port, "/list", { limit: "x" })).status, 400);
    assert.equal((await post(port, "/list", { limit: 1001 })).status, 400);
    /* más de 100: se pide de a 100 páginas */
    const big = (await post(port, "/list", { limit: 300 })).json;
    assert.equal(big.docs.length, 5);
    assert.ok(ds.calls.filter((c) => c.path === "/api/submissions").every((c) => Number(new URL(c.url, "http://x").searchParams.get("limit")) <= 100));
  } finally {
    await stopHelper(helper);
    ds.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: «hay más» también justo en 100 o 200, y solo se listan los envíos de la herramienta", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = setup();
  const ds = await fakeDocuSeal();
  const meta = { qa_kind: "consent", qa_line: "oc", qa_net: "consent", qa_file: "Prueba, Ana - OC_Consent.pdf" };
  const add = (id, role, metadata) => {
    ds.subs[id] = { template: 1, created: "2026-11-21T14:00:00.000Z", archived: null, submitters: [{ id: 5000 + id, role, name: "Ana Prueba",
      email: "ana@example.com", slug: "s" + id, metadata, values: [], opened: null, completed: "2026-11-21T16:00:00.000Z", declined: null }] };
  };
  for (let i = 1; i <= 200; i++) { add(i, "Cliente", meta); }
  let helper;
  try {
    helper = await startHelper(dir, ds.port);
    const port = helper.port;
    const hundred = (await post(port, "/list", { limit: 100 })).json;
    assert.deepEqual([hundred.docs.length, hundred.more], [100, true], "quedan 100 más viejos");
    const twoHundred = (await post(port, "/list", { limit: 200 })).json;
    assert.deepEqual([twoHundred.docs.length, twoHundred.more], [200, false], "no queda nada");
    /* lo que no envió la herramienta (sin sus datos, o sin el firmante Cliente) no se lista */
    add(201, "Cliente", {});
    add(202, "Signer", meta);
    add(203, "Cliente", Object.assign({}, meta, { qa_kind: "otro" }));
    const newest = (await post(port, "/list", { limit: 25 })).json;
    assert.equal(newest.docs.length, 25);
    assert.equal(newest.docs[0].id, "200");
    assert.equal(newest.docs.some((x) => ["201", "202", "203"].includes(x.id)), false);
    const again = (await post(port, "/list", { limit: 200 })).json;
    assert.deepEqual([again.docs.length, again.more], [200, false]);
  } finally {
    await stopHelper(helper);
    ds.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: si el servidor rechaza el envío, la herramienta ve por qué; el registro no", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = setup();
  const ds = await fakeDocuSeal({ reject: [422, { error: "Template not found" }] });
  let helper;
  try {
    helper = await startHelper(dir, ds.port);
    const r = await post(helper.port, "/send", SEND);
    assert.deepEqual([r.status, r.json], [502, { error: "docuseal", status: 422, detail: "Template not found" }]);
    const log = fs.readFileSync(path.join(dir, "registro.log"), "utf8");
    assert.match(log, /send http 422/);
    assert.ok(!log.includes("Template not found"), "el registro no lleva el texto del servidor");
  } finally {
    await stopHelper(helper);
    ds.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: sin el código de la oficina no sale nada, y un código que el servidor no acepta se avisa", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = setup();
  const ds = await fakeDocuSeal();
  let helper;
  try {
    /* la clave y el servidor que dejó la versión 1.25.0 ya no se usan */
    fs.writeFileSync(path.join(dir, "clave.txt"), "basura-de-una-version-vieja");
    fs.writeFileSync(path.join(dir, "ajustes.json"), '{"server": "https://otro.example.com"}');
    helper = await startHelper(dir, ds.port);
    const port = helper.port;
    assert.deepEqual((await call(port, "GET", "/health")).json, { ok: true, version: "4", error: null });
    for (const code of [undefined, "", "corto", "con espacios " + "x".repeat(40), "x".repeat(129), "tiene/barra" + "x".repeat(40)]) {
      const headers = auth({ "X-Office-Code": code });
      if (code === undefined) { delete headers["X-Office-Code"]; }
      const r = await call(port, "POST", "/send", { headers, body: SEND });
      assert.deepEqual([r.status, r.json], [400, { error: "sin-codigo" }], String(code));
    }
    assert.equal(ds.calls.length, 0, "sin un código válido no se llama al servidor");
    /* el código tiene la forma correcta, pero la pasarela no lo acepta */
    const other = auth({ "X-Office-Code": "ATH_codigo-viejo_" + "z".repeat(30) });
    for (const [p, body] of [["/send", SEND], ["/list", {}], ["/pdf", { id: "1" }], ["/delete", { id: "1" }], ["/agent", { id: "1" }], ["/saved", { id: "1" }]]) {
      const r = await call(port, "POST", p, { headers: other, body });
      assert.deepEqual([r.status, r.json], [403, { error: "codigo" }], p);
    }
    const log = fs.readFileSync(path.join(dir, "registro.log"), "utf8");
    assert.ok(!log.includes("codigo-viejo"), "el registro no lleva el código");
    /* sin -ApiBase el ayudante usa el servidor que trae adentro, no el de ajustes.json */
    await stopHelper(helper);
    helper = await startHelper(dir);
    assert.deepEqual((await call(helper.port, "GET", "/health")).json, { ok: true, version: "4", error: null });
  } finally {
    await stopHelper(helper);
    ds.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ayudante de firma: el código no viaja al enlace del PDF ni con una redirección", { skip: !WIN, timeout: 60000 }, async () => {
  const dir = setup();
  const ds = await fakeDocuSeal({ redirectFile: true });
  let helper;
  try {
    helper = await startHelper(dir, ds.port);
    await post(helper.port, "/send", SEND);
    ds.subs[1].submitters[0].completed = "2026-11-21T15:05:00.000Z";
    const pdf = await post(helper.port, "/pdf", { id: "1" });
    assert.equal(pdf.status, 200);
    assert.ok(pdf.buf.equals(PDF));
    assert.deepEqual(ds.files, [{ url: "/files/merged.pdf", key: undefined, code: undefined }, { url: "/files/blob.pdf?sig=1", key: undefined, code: undefined }]);
  } finally {
    await stopHelper(helper);
    ds.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
