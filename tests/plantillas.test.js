"use strict";
/* Las plantillas de DocuSeal en el repositorio (tools/docuseal): los campos
   guardados, lo que se manda a DocuSeal para ponerlos y el relevo que corre
   en el servidor. Todo con un DocuSeal falso y datos de prueba. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const P = require("../tools/docuseal/plantillas.js");
const F = require("../js/forms.js");

const ROOT = path.join(__dirname, "..");
const JSON_FILE = path.join(ROOT, "tools", "docuseal", "plantillas.json");
const RELAY_FILE = path.join(ROOT, "tools", "docuseal", "relevo.py");
const data = P.loadLayouts();
const byKey = Object.fromEntries(data.templates.map((t) => [t.key, t]));
const flat = (v) => [].concat(v).flatMap((x) => (Array.isArray(x) ? x : [x]));

/* runs the command line in a scratch folder; nothing here reaches the relay */
function cli(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-plt-"));
  try {
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "docuseal", "plantillas.js")].concat(args),
      { cwd: dir, encoding: "utf8", env: Object.assign({}, process.env, { PATH: "" }) });
    return { status: r.status, out: r.stdout + r.stderr, files: fs.readdirSync(dir, { recursive: true }).sort() };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("la linea de comandos no sigue con una opcion que no conoce", () => {
  /* a typo like --prefix would otherwise run aplicar on the real templates */
  for (const args of [["aplicar", "--prefix", "prueba-"], ["exportar", "--prefijos", "x"], ["aplicar", "prueba-"],
    ["pdfs", "--prefix", "prueba-"], ["pdfs", "carpeta", "otra"], ["aplicar", "--prefijo", "prueba-", "-x"]]) {
    const r = cli(args);
    assert.equal(r.status, 1, args.join(" ") + ": " + r.out);
    assert.match(r.out, /Error: no se entiende ".+"\. Uso: node tools\/docuseal\/plantillas\.js pdfs <carpeta> \| aplicar \| exportar {2}\[--prefijo X\]/, args.join(" "));
    assert.deepEqual(r.files, [], args.join(" "));
  }
  assert.match(cli(["aplicar", "--prefijo"]).out, /Error: prefijo invalido/);
  /* what it knows still works as before */
  const ok = cli(["pdfs", "salida", "--prefijo", "prueba-"]);
  assert.equal(ok.status, 0, ok.out);
  assert.deepEqual(ok.files.filter((f) => f.endsWith(".pdf")), data.templates.map((t) => path.join("salida", "prueba-" + t.key + ".pdf")).sort());
  assert.equal(cli([]).status, 2);
});

function counter() { let n = 0; return () => "id-" + (++n); }
function uploaded(id, name, sha) {
  /* una plantilla recien subida: un firmante por defecto y los campos que
     DocuSeal saco del PDF */
  return { id: id, name: name, archived_at: null, schema: [{ attachment_uuid: "att-" + id, name: name }],
    submitters: [{ name: "First Party", uuid: "sub-" + id }], fields: [{ uuid: "f", submitter_uuid: "sub-" + id, name: "PDF", type: "text", areas: [] }],
    documents: [{ id: id, uuid: "att-" + id, url: "https://firmas.example.test/file/doc-" + id + "/" + name + ".pdf" }], _sha: sha };
}
/* un DocuSeal falso a la altura del relevo */
function fakeServer(templates, submissions) {
  const puts = [];
  const rpc = async function (req) {
    if (req.op === "get" && req.path === "/api/templates?limit=100") { return { status: 200, json: { data: templates } }; }
    let m;
    if (req.op === "get" && (m = /^\/api\/submissions\?template_id=(\d+)&limit=1$/.exec(req.path))) {
      return { status: 200, json: { data: (submissions && submissions[m[1]]) || [] } };
    }
    if (req.op === "sha") { const t = templates.find((x) => x.documents[0].url === req.url); return t ? { status: 200, sha256: t._sha } : { status: 404 }; }
    if (req.op === "put" && (m = /^\/api\/templates\/(\d+)$/.exec(req.path))) {
      puts.push({ id: Number(m[1]), body: req.body });
      const t = templates.find((x) => x.id === Number(m[1]));
      if (t._putStatus) { return { status: t._putStatus }; }
      Object.assign(t, { submitters: req.body.submitters, fields: req.body.fields });
      return { status: 200, json: { id: t.id } };
    }
    return { error: "ruta" };
  };
  return { rpc: rpc, puts: puts };
}
function freshSix(prefix, firstId) {
  return data.templates.map((t, i) => uploaded((firstId || 1) + i, (prefix || "") + t.key, t.sha256));
}

/* ----------------------------------------------------------- plantillas -- */

test("plantillas.json: las seis de la herramienta, con su PDF y sin datos privados", () => {
  assert.deepEqual(data.templates.map((t) => t.key).sort(), Object.keys(F.TEMPLATES).sort());
  data.templates.forEach(function (t) {
    assert.equal(P.sha256(P.pdfBytes(t.key)), t.sha256, t.key + ": el PDF de vendor/forms");
    assert.deepEqual(t.roles, F.TEMPLATES[t.key].kind === "soa" ? ["Cliente", "Agente"] : ["Cliente"]);
    assert.ok(t.label, t.key);
    t.fields.forEach(function (f) {
      assert.ok(t.roles.indexOf(f.role) >= 0, t.key + " " + f.name);
      assert.ok(["text", "signature", "date", "cells"].indexOf(f.type) >= 0, f.type);
      assert.ok(f.areas.length > 0);
      f.areas.forEach(function (a) {
        assert.ok(a.page === 0 || a.page === 1);
        ["x", "y", "w", "h"].forEach((k) => assert.ok(a[k] >= 0 && a[k] <= 1, t.key + " " + k));
        assert.ok(a.x + a.w <= 1.0001 && a.y + a.h <= 1.0001);
      });
    });
    /* cada firmante firma algo */
    t.roles.forEach((r) => assert.ok(t.fields.some((f) => f.role === r && f.type === "signature"), t.key + " " + r));
  });
  const text = fs.readFileSync(JSON_FILE, "utf8");
  assert.ok(!/@/.test(text), "sin correos");
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(text), "sin uuid del servidor");
  assert.equal(P.formatLayouts(data), text.replace(/\r\n/g, "\n"), "el archivo tiene el formato de exportar");
});

test("plantillas.json: tiene cada campo que la herramienta llena, con el mismo nombre", () => {
  Object.keys(F.TEMPLATES).forEach(function (key) {
    const names = byKey[key].fields.map((f) => f.name);
    let wanted;
    if (F.TEMPLATES[key].kind === "soa") {
      wanted = F.SOA_AGENT[key].fields.flatMap((x) => flat(x[1])).concat(F.SOA_AGENT[key].dateField);
      /* los del agente son del Agente */
      wanted.forEach((n) => assert.equal(byKey[key].fields.find((f) => f.name === n).role, "Agente", n));
    } else {
      wanted = flat(Object.values(F.TEMPLATES[key].fields));
    }
    wanted.forEach((n) => assert.ok(names.indexOf(n) >= 0, key + ": falta " + n));
  });
});

test("al aplicar: los firmantes en orden y los campos sobre el PDF de la plantilla", () => {
  const tpl = uploaded(9, "soa-es", byKey["soa-es"].sha256);
  const body = P.buildUpdate(byKey["soa-es"], tpl, counter());
  /* el primero conserva el de la plantilla; el Agente es nuevo */
  assert.deepEqual(body.submitters, [{ name: "Cliente", uuid: "sub-9" }, { name: "Agente", uuid: "id-1" }]);
  assert.equal(body.fields.length, byKey["soa-es"].fields.length);
  assert.equal(new Set(body.fields.map((f) => f.uuid)).size, body.fields.length);
  body.fields.forEach((f) => f.areas.forEach((a) => assert.equal(a.attachment_uuid, "att-9")));
  const firma = body.fields[0];
  assert.deepEqual([firma.type, firma.submitter_uuid, firma.title, firma.required], ["signature", "sub-9", "Firma del beneficiario o representante autorizado", true]);
  const fecha = body.fields.find((f) => f.name === "Fecha de Hoy");
  assert.deepEqual([fecha.readonly, fecha.default_value, fecha.preferences.format], [true, "{{date}}", "MM/DD/YYYY"]);
  const celdas = body.fields.find((f) => f.type === "cells");
  assert.equal(celdas.submitter_uuid, "id-1");
  assert.ok(celdas.areas[0].cell_w > 0);
  /* una firma sin nombre va con nombre vacío */
  assert.equal(P.buildUpdate(byKey["consent-ath-en"], uploaded(3, "consent-ath-en"), counter()).fields.filter((f) => f.name === "").length, 1);
  assert.throws(() => P.buildUpdate(byKey["soa-es"], Object.assign({}, tpl, { schema: [{ attachment_uuid: "a" }, { attachment_uuid: "b" }] })), /un solo PDF/);
  assert.throws(() => P.buildUpdate({ roles: ["Cliente"], fields: [{ role: "Otro", type: "text", areas: [] }] }, tpl), /firmante desconocido/);
});

test("exportar y aplicar son inversos: lo aplicado vuelve igual a plantillas.json", () => {
  data.templates.forEach(function (t) {
    const stored = P.buildUpdate(t, uploaded(1, t.key), counter());
    const back = P.toLayout(stored);
    assert.equal(JSON.stringify(back), JSON.stringify({ roles: t.roles, fields: t.fields }), t.key);
  });
});

/* -------------------------------------------------------------- aplicar -- */

test("aplicar: pone los campos en las seis plantillas subidas y dice sus números", async () => {
  const tpls = freshSix("", 11).concat([uploaded(30, "otra", "x")]);
  const s = fakeServer(tpls);
  const log = [];
  const res = await P.aplicar(s.rpc, data, {}, (m) => log.push(m));
  assert.equal(res.problems, 0);
  assert.deepEqual(res.ids, { "consent-qa-es": 11, "consent-qa-en": 12, "consent-ath-es": 13, "consent-ath-en": 14, "soa-es": 15, "soa-en": 16 });
  assert.deepEqual(s.puts.map((p) => p.id), [11, 12, 13, 14, 15, 16], "la otra plantilla no se toca");
  assert.ok(log.indexOf("SOA Español: plantilla 15") >= 0);
  /* lo que quedó en el servidor es plantillas.json */
  data.templates.forEach((t, i) => assert.equal(JSON.stringify(P.toLayout(tpls[i])), JSON.stringify({ roles: t.roles, fields: t.fields })));
  /* otra vez: sin envíos todavía, queda igual */
  const again = await P.aplicar(s.rpc, data, {}, () => {});
  assert.equal(again.problems, 0);
});

test("aplicar: con prefijo usa solo las copias; las de verdad no se tocan", async () => {
  const real = freshSix("", 1);
  const copies = freshSix("prueba-", 21);
  const s = fakeServer(real.concat(copies));
  const res = await P.aplicar(s.rpc, data, { prefix: "prueba-" }, () => {});
  assert.equal(res.problems, 0);
  assert.deepEqual(s.puts.map((p) => p.id), [21, 22, 23, 24, 25, 26]);
});

test("aplicar: no toca una plantilla con otro PDF, con envíos, repetida o que no está", async () => {
  const tpls = freshSix("", 1);
  tpls[5]._sha = byKey["soa-es"].sha256; /* soa-en con el PDF del SOA en español */
  tpls.push(uploaded(40, "consent-qa-en", byKey["consent-qa-en"].sha256)); /* repetida */
  tpls.push(Object.assign(uploaded(41, "consent-qa-es", byKey["consent-qa-es"].sha256), { archived_at: "2026-11-20T00:00:00Z" })); /* archivada: no cuenta */
  tpls.splice(2, 1); /* consent-ath-es no se subió */
  const s = fakeServer(tpls, { 4: [{ id: 99 }] }); /* consent-ath-en ya tiene envíos */
  const log = [];
  const res = await P.aplicar(s.rpc, data, {}, (m) => log.push(m));
  assert.equal(res.problems, 4);
  assert.deepEqual(s.puts.map((p) => p.id), [1, 5]);
  assert.deepEqual(res.ids, { "consent-qa-es": 1, "soa-es": 5 });
  assert.ok(log.some((m) => /^Falta consent-ath-es: suba consent-ath-es\.pdf/.test(m)));
  assert.ok(log.some((m) => /mas de una plantilla consent-qa-en/.test(m)));
  assert.ok(log.some((m) => /consent-ath-en \(4\) ya tiene envios/.test(m)));
  assert.ok(log.some((m) => /soa-en \(6\) no tiene el PDF de soa-en\.pdf/.test(m)));
});

test("aplicar: si DocuSeal no acepta los campos, lo dice y sigue con las demás", async () => {
  const tpls = freshSix("", 1);
  tpls[0]._putStatus = 422;
  const s = fakeServer(tpls);
  const log = [];
  const res = await P.aplicar(s.rpc, data, {}, (m) => log.push(m));
  assert.equal(res.problems, 1);
  assert.equal(Object.keys(res.ids).length, 5);
  assert.ok(log.some((m) => /consent-qa-es: DocuSeal no acepto los campos \(422\)/.test(m)));
});

test("exportar: trae lo que cambió en el servidor y deja igual lo que no encuentra", async () => {
  const tpls = freshSix("", 1);
  const s = fakeServer(tpls);
  await P.aplicar(s.rpc, data, {}, () => {});
  let res = await P.exportar(s.rpc, data, {}, () => {});
  assert.deepEqual([res.changed, res.problems], [[], 0]);
  tpls[4].fields[0].areas[0].y = 0.5;
  tpls.splice(1, 1);
  const log = [];
  res = await P.exportar(s.rpc, data, {}, (m) => log.push(m));
  assert.deepEqual(res.changed, ["soa-es"]);
  assert.equal(res.problems, 1);
  assert.equal(res.data.templates.find((t) => t.key === "soa-es").fields[0].areas[0].y, 0.5);
  assert.deepEqual(res.data.templates.find((t) => t.key === "consent-qa-en"), byKey["consent-qa-en"]);
  assert.equal(res.data.templates.find((t) => t.key === "soa-es").sha256, byKey["soa-es"].sha256);
  assert.ok(log.some((m) => /consent-qa-en: queda como estaba/.test(m)));
  assert.equal(byKey["soa-es"].fields[0].areas[0].y, 0.48637, "no cambia lo cargado");
});

test("el comando usa la misma máquina y zona que crear-servidor.sh", () => {
  const script = fs.readFileSync(path.join(ROOT, "tools", "docuseal", "crear-servidor.sh"), "utf8");
  assert.ok(script.includes('NAME="' + P.NAME + '"'));
  assert.ok(script.includes('ZONE="' + P.ZONE + '"'));
  assert.ok(/^[\x00-\x7f]*$/.test(fs.readFileSync(RELAY_FILE, "utf8")), "relevo.py es solo ASCII");
});

/* --------------------------------------------------------------- relevo -- */

const PY = ["python3", "python"].find((c) => spawnSync(c, ["-c", "import sys; assert sys.version_info >= (3, 8)"]).status === 0);
const KEY = "fake_docuseal_key_0123456789";
const BOOT = "import sys; exec(sys.stdin.read(int(sys.stdin.readline())))";

function relayDir(key) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-relevo-"));
  fs.writeFileSync(path.join(dir, ".env"), "HOST=firmas.example.test\nDOCUSEAL_VERSION=3.3.7\n");
  fs.writeFileSync(path.join(dir, "pasarela.env"), key ? "DOCUSEAL_KEY=" + key + "\nCODIGO_QAGENCY=x\n" : "");
  return dir;
}
function startRelay(dir, port) {
  /* el mismo arranque que por SSH: el código llega por stdin */
  const child = spawn(PY, ["-u", "-c", BOOT], { env: Object.assign({}, process.env, { RELEVO_DIR: dir, RELEVO_BASE: "http://127.0.0.1:" + port }), stdio: ["pipe", "pipe", "pipe"] });
  return P.relay(child, fs.readFileSync(RELAY_FILE, "utf8"));
}

test("relevo: pasa solo esos pedidos, con la clave del servidor, y nunca la manda a un archivo", { skip: !PY && "sin python" }, async () => {
  const seen = [];
  const pdf = Buffer.from("%PDF-1.7 prueba");
  const server = http.createServer(function (req, res) {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", function () {
      seen.push({ method: req.method, url: req.url, key: req.headers["x-auth-token"], host: req.headers.host, body: body });
      if (req.url === "/api/templates?limit=100") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"data":[{"id":1}]}'); }
      if (req.url === "/api/templates/7" && req.method === "PUT") { res.writeHead(200); return res.end('{"id":7}'); }
      if (req.url === "/file/doc-1/a.pdf") { res.writeHead(302, { Location: "https://firmas.example.test/disk/abc/a.pdf?disposition=inline" }); return res.end(); }
      if (req.url === "/disk/abc/a.pdf?disposition=inline") { res.writeHead(200); return res.end(pdf); }
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const dir = relayDir(KEY);
  const r = startRelay(dir, server.address().port);
  try {
    await r.ready;
    assert.deepEqual(await r.rpc({ op: "get", path: "/api/templates?limit=100" }), { status: 200, json: { data: [{ id: 1 }] } });
    assert.deepEqual([seen[0].key, seen[0].host], [KEY, "firmas.example.test"]);
    assert.deepEqual(await r.rpc({ op: "put", path: "/api/templates/7", body: { fields: [] } }), { status: 200, json: { id: 7 } });
    assert.deepEqual([seen[1].method, JSON.parse(seen[1].body)], ["PUT", { fields: [] }]);
    /* el PDF: sigue el enlace dentro del mismo servidor, sin la clave */
    const sha = await r.rpc({ op: "sha", url: "https://firmas.example.test/file/doc-1/a.pdf" });
    assert.deepEqual(sha, { status: 200, sha256: P.sha256(pdf), size: pdf.length });
    assert.deepEqual(seen.slice(2).map((x) => [x.url, x.key]), [["/file/doc-1/a.pdf", undefined], ["/disk/abc/a.pdf?disposition=inline", undefined]]);
    /* lo demás no sale del relevo */
    const before = seen.length;
    for (const bad of [{ op: "get", path: "/api/users" }, { op: "get", path: "/api/templates/7/clone" }, { op: "put", path: "/api/submissions/1", body: {} },
      { op: "put", path: "/api/templates/7" }, { op: "delete", path: "/api/templates/7" }, { op: "sha", url: "https://otro.example.test/file/x/a.pdf" },
      { op: "sha", url: "https://firmas.example.test/api/templates" }, { op: "get", path: "/api/templates?limit=100&q=x" }]) {
      assert.deepEqual(await r.rpc(bad), { error: "ruta" }, JSON.stringify(bad));
    }
    assert.equal(seen.length, before);
    /* un pedido roto no corta el relevo */
    assert.equal((await r.rpc({ op: "sha", url: "https://firmas.example.test/file/missing/a.pdf" })).status, 404);
    assert.equal((await r.rpc({ op: "get", path: "/api/templates?limit=100" })).status, 200);
  } finally {
    r.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("relevo: sin la clave en el servidor no arranca", { skip: !PY && "sin python" }, async () => {
  const dir = relayDir("");
  const r = startRelay(dir, 9);
  try {
    await assert.rejects(r.ready, /todavia no tiene la clave/);
  } finally {
    r.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
