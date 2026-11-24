#!/usr/bin/env node
"use strict";
/* Q Agency Toolbox: las seis plantillas de DocuSeal, desde el repositorio.
   La version gratuita de DocuSeal no crea plantillas por la API, pero si
   cambia todos los campos de una plantilla. Por eso, en un servidor nuevo:
     1. node tools/docuseal/plantillas.js pdfs <carpeta>
        escribe los seis PDF en blanco (de vendor/forms), cada uno con el
        nombre de su plantilla (consent-qa-es.pdf ...). Se suben a DocuSeal
        (Subir); la plantilla queda con el nombre del archivo.
     2. node tools/docuseal/plantillas.js aplicar
        en Cloud Shell, con el proyecto elegido: pone a cada plantilla sus
        firmantes y campos (plantillas.json) y muestra su numero para Ajustes.
   Y si alguien cambia una plantilla en DocuSeal:
     node tools/docuseal/plantillas.js exportar
        vuelve a escribir plantillas.json desde el servidor.
   --prefijo X trabaja con las plantillas que se llaman X<nombre> (para probar
   con copias sin tocar las de verdad).
   La clave de la API no sale del servidor: los pedidos van por SSH (IAP) a
   relevo.py, que corre alla y la lee de /srv/docuseal/pasarela.env. Antes de
   cambiar una plantilla se revisa que su PDF sea el de vendor/forms (sha256)
   y que no tenga envios: una plantilla ya usada no se toca. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const LAYOUT_FILE = path.join(__dirname, "plantillas.json");
const RELAY_FILE = path.join(__dirname, "relevo.py");
/* los mismos que tools/docuseal/crear-servidor.sh */
const NAME = "docuseal";
const ZONE = "us-central1-a";
const ROUND = 1e6;

function loadLayouts(file) { return JSON.parse(fs.readFileSync(file || LAYOUT_FILE, "utf8")); }

/* el PDF en blanco de una plantilla, como lo trae la herramienta */
function pdfBytes(key) {
  if (!/^[a-z]+(-[a-z]+)+$/.test(key)) { throw new Error("plantilla desconocida: " + key); }
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "vendor", "forms", key + ".js"), "utf8"), ctx);
  const b64 = ctx.window.QA_FORMS && ctx.window.QA_FORMS[key];
  if (typeof b64 !== "string") { throw new Error("sin PDF: " + key); }
  return Buffer.from(b64, "base64");
}
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

/* plantillas.json con una linea por campo, para que los cambios se lean bien */
function formatLayouts(data) {
  const t = data.templates.map(function (x) {
    return "    {\n" +
      "      \"key\": " + JSON.stringify(x.key) + ",\n" +
      "      \"label\": " + JSON.stringify(x.label) + ",\n" +
      "      \"sha256\": " + JSON.stringify(x.sha256) + ",\n" +
      "      \"roles\": " + JSON.stringify(x.roles) + ",\n" +
      "      \"fields\": [\n" + x.fields.map((f) => "        " + JSON.stringify(f)).join(",\n") + "\n      ]\n    }";
  });
  return "{\n  \"about\": " + JSON.stringify(data.about) + ",\n  \"templates\": [\n" + t.join(",\n") + "\n  ]\n}\n";
}

/* Las plantillas del servidor que se llaman como las del repositorio (con
   el prefijo). found: la unica con ese nombre; repeated: hay mas de una. */
function pickTemplates(list, keys, prefix) {
  const out = { found: {}, missing: [], repeated: [] };
  keys.forEach(function (key) {
    const hits = (list || []).filter((t) => t && t.name === (prefix || "") + key && !t.archived_at);
    if (hits.length === 1) { out.found[key] = hits[0]; } else if (hits.length) { out.repeated.push(key); } else { out.missing.push(key); }
  });
  return out;
}

/* El cuerpo de PUT /api/templates/:id: los firmantes en orden (el primero
   conserva el que ya tiene la plantilla) y los campos del repositorio, sobre
   el PDF de la plantilla. Reemplaza los campos que DocuSeal saco del PDF. */
function buildUpdate(layout, tpl, newId) {
  const make = newId || crypto.randomUUID;
  const att = tpl && tpl.schema && tpl.schema[0] && tpl.schema[0].attachment_uuid;
  if (!att || tpl.schema.length !== 1) { throw new Error("la plantilla debe tener un solo PDF"); }
  const first = tpl.submitters && tpl.submitters[0] && tpl.submitters[0].uuid;
  const submitters = layout.roles.map((name, i) => ({ name: name, uuid: i === 0 && first ? first : make() }));
  const byRole = Object.fromEntries(submitters.map((s) => [s.name, s.uuid]));
  const fields = layout.fields.map(function (f) {
    if (!byRole[f.role]) { throw new Error("firmante desconocido: " + f.role); }
    const o = { uuid: make(), submitter_uuid: byRole[f.role], name: f.name || "", type: f.type, required: !!f.required };
    if (f.readonly) { o.readonly = true; }
    ["default_value", "title", "description"].forEach(function (k) { if (f[k] !== undefined) { o[k] = f[k]; } });
    o.preferences = f.preferences || {};
    o.areas = f.areas.map(function (a) {
      const r = { x: a.x, y: a.y, w: a.w, h: a.h, page: a.page, attachment_uuid: att };
      if (a.cell_w !== undefined) { r.cell_w = a.cell_w; }
      return r;
    });
    return o;
  });
  return { submitters: submitters, fields: fields };
}

/* Lo contrario: una plantilla del servidor como queda en plantillas.json */
function toLayout(tpl) {
  const roles = (tpl.submitters || []).map((s) => s.name);
  const names = Object.fromEntries((tpl.submitters || []).map((s) => [s.uuid, s.name]));
  const num = (v) => (typeof v === "number" ? Math.round(v * ROUND) / ROUND : v);
  const fields = (tpl.fields || []).map(function (f) {
    const o = {};
    ["name", "type", "required", "readonly", "title", "description", "default_value"].forEach(function (k) {
      const v = f[k];
      if (v === undefined || v === null || v === "" || (k === "readonly" && v === false)) { return; }
      o[k] = v;
    });
    o.role = names[f.submitter_uuid];
    if (f.preferences && Object.keys(f.preferences).length) { o.preferences = f.preferences; }
    o.areas = (f.areas || []).map(function (a) {
      const r = { page: a.page, x: num(a.x), y: num(a.y), w: num(a.w), h: num(a.h) };
      if (a.cell_w !== undefined && a.cell_w !== null) { r.cell_w = num(a.cell_w); }
      return r;
    });
    return o;
  });
  return { roles: roles, fields: fields };
}

async function listTemplates(rpc) {
  const r = await rpc({ op: "get", path: "/api/templates?limit=100" });
  if (r.status !== 200 || !r.json || !Array.isArray(r.json.data)) { throw new Error("DocuSeal no devolvio la lista de plantillas (" + (r.status || r.error) + ")"); }
  if (r.json.data.length >= 100) { throw new Error("hay 100 plantillas o mas: archive las que no se usan"); }
  return r.json.data;
}

/* Pone los campos del repositorio en las plantillas subidas. Devuelve los
   numeros de las que quedaron listas y cuantos problemas hubo. */
async function aplicar(rpc, data, opts, log) {
  const prefix = (opts && opts.prefix) || "";
  const say = log || console.log;
  const list = await listTemplates(rpc);
  const pick = pickTemplates(list, data.templates.map((t) => t.key), prefix);
  const ids = {};
  let problems = 0;
  for (const layout of data.templates) {
    const name = prefix + layout.key;
    if (pick.missing.indexOf(layout.key) >= 0) { say("Falta " + name + ": suba " + layout.key + ".pdf a DocuSeal con ese nombre."); problems++; continue; }
    if (pick.repeated.indexOf(layout.key) >= 0) { say("Hay mas de una plantilla " + name + ": archive las que sobran. No se cambio."); problems++; continue; }
    const tpl = pick.found[layout.key];
    if (!Array.isArray(tpl.documents) || tpl.documents.length !== 1 || !Array.isArray(tpl.schema) || tpl.schema.length !== 1) {
      say(name + " (" + tpl.id + ") debe tener solo su PDF. No se cambio."); problems++; continue;
    }
    const sha = await rpc({ op: "sha", url: tpl.documents[0].url });
    if (sha.sha256 !== layout.sha256) {
      say(name + " (" + tpl.id + ") no tiene el PDF de " + layout.key + ".pdf. No se cambio."); problems++; continue;
    }
    const subs = await rpc({ op: "get", path: "/api/submissions?template_id=" + tpl.id + "&limit=1" });
    if (subs.status !== 200 || !subs.json || !Array.isArray(subs.json.data)) { say(name + ": no se pudo revisar si tiene envios. No se cambio."); problems++; continue; }
    if (subs.json.data.length) { say(name + " (" + tpl.id + ") ya tiene envios: no se toca."); problems++; continue; }
    const put = await rpc({ op: "put", path: "/api/templates/" + tpl.id, body: buildUpdate(layout, tpl) });
    if (put.status !== 200) { say(name + ": DocuSeal no acepto los campos (" + (put.status || put.error) + ")."); problems++; continue; }
    ids[layout.key] = tpl.id;
    say(layout.label + ": plantilla " + tpl.id);
  }
  return { ids: ids, problems: problems };
}

/* Vuelve a leer las plantillas del servidor y devuelve plantillas.json al
   dia (sin escribirlo) y cuales cambiaron. */
async function exportar(rpc, data, opts, log) {
  const prefix = (opts && opts.prefix) || "";
  const say = log || console.log;
  const pick = pickTemplates(await listTemplates(rpc), data.templates.map((t) => t.key), prefix);
  const changed = [];
  let problems = 0;
  const templates = data.templates.map(function (layout) {
    const tpl = pick.found[layout.key];
    if (!tpl) { say("No se encontro una sola plantilla " + prefix + layout.key + ": queda como estaba."); problems++; return layout; }
    const now = toLayout(tpl);
    const next = Object.assign({}, layout, { roles: now.roles, fields: now.fields });
    if (JSON.stringify(next) !== JSON.stringify(layout)) { changed.push(layout.key); }
    return next;
  });
  return { data: Object.assign({}, data, { templates: templates }), changed: changed, problems: problems };
}

/* El relevo: relevo.py corriendo en el servidor (o, en las pruebas, en esta
   computadora), un pedido por linea. */
function relay(child, code) {
  let buffer = "";
  const waiting = [];
  const lines = [];
  let closed = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", function (chunk) {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line.charAt(0) !== "{") { continue; }
      if (waiting.length) { waiting.shift().resolve(JSON.parse(line)); } else { lines.push(JSON.parse(line)); }
    }
  });
  function fail() { closed = true; while (waiting.length) { waiting.shift().reject(new Error("se corto la conexion con el servidor")); } }
  child.on("exit", fail);
  child.on("error", fail);
  function next() {
    if (lines.length) { return Promise.resolve(lines.shift()); }
    if (closed) { return Promise.reject(new Error("se corto la conexion con el servidor")); }
    return new Promise((resolve, reject) => waiting.push({ resolve: resolve, reject: reject }));
  }
  /* Python lee el codigo contando caracteres, con saltos de linea \n */
  if (code !== undefined) { const c = code.replace(/\r\n/g, "\n"); child.stdin.write(c.length + "\n" + c); }
  const ready = next().then(function (first) {
    if (!first.ok) { throw new Error(first.error === "sin-clave" ? "el servidor todavia no tiene la clave de DocuSeal (crear-servidor.sh)" : "el relevo no arranco"); }
  });
  const rpc = function (req) { child.stdin.write(JSON.stringify(req) + "\n"); return next(); };
  return { ready: ready, rpc: rpc, close: function () { child.stdin.end(); } };
}

function relayOverSsh() {
  const code = fs.readFileSync(RELAY_FILE, "utf8");
  if (!/^[\x00-\x7f]*$/.test(code)) { throw new Error("relevo.py debe ser solo ASCII"); }
  const child = spawn("gcloud", ["compute", "ssh", NAME, "--zone=" + ZONE, "--tunnel-through-iap", "--quiet",
    "--command=sudo python3 -u -c 'import sys; exec(sys.stdin.read(int(sys.stdin.readline())))'"], { stdio: ["pipe", "pipe", "inherit"] });
  return relay(child, code);
}

async function main(argv) {
  const args = argv.slice();
  const cmd = args.shift();
  let prefix = "";
  const p = args.indexOf("--prefijo");
  if (p >= 0) { prefix = args[p + 1] || ""; args.splice(p, 2); if (!/^[A-Za-z0-9_-]{1,40}$/.test(prefix)) { throw new Error("prefijo invalido"); } }
  const data = loadLayouts();
  if (cmd === "pdfs") {
    const dir = path.resolve(args[0] || "plantillas-pdf");
    fs.mkdirSync(dir, { recursive: true });
    data.templates.forEach(function (t) {
      const bytes = pdfBytes(t.key);
      if (sha256(bytes) !== t.sha256) { throw new Error(t.key + ": el PDF no coincide con plantillas.json"); }
      fs.writeFileSync(path.join(dir, prefix + t.key + ".pdf"), bytes);
    });
    console.log("Listo: " + data.templates.length + " PDF en " + dir + ". Subalos a DocuSeal (Subir) y despues corra: node tools/docuseal/plantillas.js aplicar" + (prefix ? " --prefijo " + prefix : ""));
    return 0;
  }
  if (cmd !== "aplicar" && cmd !== "exportar") {
    console.log("Uso: node tools/docuseal/plantillas.js pdfs <carpeta> | aplicar | exportar  [--prefijo X]");
    return 2;
  }
  const r = relayOverSsh();
  try {
    await r.ready;
    if (cmd === "aplicar") {
      const res = await aplicar(r.rpc, data, { prefix: prefix });
      if (!res.problems) { console.log("Listo. Escriba esos numeros en Ajustes > Envio a firmar, y exporte el archivo del equipo."); }
      return res.problems ? 1 : 0;
    }
    const res = await exportar(r.rpc, data, { prefix: prefix });
    if (res.changed.length) { fs.writeFileSync(LAYOUT_FILE, formatLayouts(res.data)); }
    console.log(res.changed.length ? "plantillas.json al dia; cambiaron: " + res.changed.join(", ") + "." : "plantillas.json ya estaba al dia.");
    return res.problems ? 1 : 0;
  } finally {
    r.close();
  }
}

module.exports = { NAME: NAME, ZONE: ZONE, loadLayouts: loadLayouts, pdfBytes: pdfBytes, sha256: sha256, formatLayouts: formatLayouts,
  pickTemplates: pickTemplates, buildUpdate: buildUpdate, toLayout: toLayout, aplicar: aplicar, exportar: exportar, relay: relay };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, function (e) { console.error("Error: " + e.message); process.exitCode = 1; });
}
