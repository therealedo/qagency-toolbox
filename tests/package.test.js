/* Comprueba que lo necesario para instalar la herramienta esté completo y
   que las versiones no se desincronicen. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../js/config.js");

const root = path.join(__dirname, "..");
const exists = (p) => fs.existsSync(path.join(root, p));

test("la copia local (sw.js) lleva la misma versión y archivos que existen", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.equal(sw.match(/const VERSION = "([^"]+)"/)[1], C.VERSION);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version, C.VERSION);
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].match(/"[^"]+"/g).map((x) => x.slice(1, -1));
  shell.filter((f) => f !== "./").forEach((f) => assert.ok(exists(f), "falta " + f));
  /* todo lo que carga la página debe estar en la copia local */
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  (html.match(/(?:src|href)="(?!#|data:)([^"]+)"/g) || []).map((m) => m.replace(/^.*?="|"$/g, ""))
    .forEach((f) => assert.ok(shell.includes(f), f + " no está en SHELL"));
  const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
  (css.match(/url\("\.\.\/([^"]+)"\)/g) || []).map((m) => m.replace(/^url\("\.\.\/|"\)$/g, ""))
    .forEach((f) => assert.ok(shell.includes(f), f + " no está en SHELL"));
});

test("las plantillas del Consent y del SOA van dentro de la herramienta, como scripts", () => {
  const F = require("../js/forms.js");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  /* forms.js necesita notes.js y lo usa app.js */
  assert.ok(html.indexOf('<script src="js/notes.js">') < html.indexOf('<script src="js/forms.js">'));
  assert.ok(html.indexOf('<script src="js/forms.js">') < html.indexOf('<script src="js/app.js">'));
  Object.keys(F.TEMPLATES).forEach((k) => {
    const f = "vendor/forms/" + k + ".js";
    assert.ok(html.includes('<script src="' + f + '"></script>'), f);
    const m = fs.readFileSync(path.join(root, f), "utf8").match(/window\.QA_FORMS\["([^"]+)"\] = "([A-Za-z0-9+/=]+)";/);
    assert.equal(m[1], k);
    assert.equal(Buffer.from(m[2].slice(0, 8), "base64").toString("latin1").slice(0, 5), "%PDF-", f + " lleva un PDF");
  });
});

test("el manifiesto apunta a íconos que existen", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"));
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  m.icons.forEach((i) => assert.ok(exists(i.src), "falta " + i.src));
});

test("el equipo no viene en el código: se importa del archivo de la oficina", () => {
  assert.deepEqual(C.TEAM, []);
  assert.deepEqual(C.OFFICES, ["QAgency", "ATH Insurance"]);
  /* ningún NPN de 8 dígitos en la configuración */
  assert.doesNotMatch(fs.readFileSync(path.join(root, "js", "config.js"), "utf8"), /npn\s*:\s*"\d{6,}"/i);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  ["teamImport", "teamExport", "teamFile", "teamEmpty"].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
});

test("el instalador prefiere Chrome, luego Edge, y Brave al final (Brave no deja elegir carpetas)", () => {
  const ps = fs.readFileSync(path.join(root, "tools", "windows", "instalar.ps1"), "utf8");
  const exes = ps.match(/\$navegadores = @\(([\s\S]*?)\r?\n\)/)[1].match(/[a-z]+\.exe/g);
  assert.equal(exes.length, 8, "las mismas rutas de siempre");
  assert.deepEqual(exes.filter((x, i) => exes.indexOf(x) === i), ["chrome.exe", "msedge.exe", "brave.exe"]);
  assert.match(ps, /No se encontro Chrome, Edge ni Brave/);
});

test("la página solo puede pedir el número de versión: el OCR solo agrega 'wasm-unsafe-eval'", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(C.UPDATE_URL, "https://raw.githubusercontent.com/therealedo/qagency-toolbox/main/package.json");
  assert.equal(csp, "default-src 'self' 'unsafe-inline' data: blob: file: 'wasm-unsafe-eval'; connect-src " + C.UPDATE_URL + "; object-src 'none'; base-uri 'self'; form-action 'none'");
  /* el motor y los modelos del OCR van dentro de la herramienta */
  ["vendor/tesseract/ocr-loader.js", "vendor/tesseract/ocr-wasm.js", "vendor/tesseract/ocr-lang-spa.js",
    "vendor/tesseract/ocr-lang-eng.js", "js/ocr.js"].forEach((f) => assert.ok(html.includes('<script src="' + f + '"></script>'), f));
});

test("el actualizador: misma fuente que la página, revisa la versión del paquete y se instala con la herramienta", () => {
  const win = (f) => fs.readFileSync(path.join(root, "tools", "windows", f), "utf8");
  const ps = win("actualizar.ps1");
  const base = C.UPDATE_URL.replace(/\/package\.json$/, "");
  assert.ok(ps.includes('"' + base + '"'), "la fuente por defecto es el repositorio");
  assert.match(ps, /\/package\.json/);
  assert.match(ps, /\/dist\/QAgency-Toolbox-Windows\.zip/);
  assert.match(ps, /-le \$local/, "solo instala si la de GitHub es más nueva");
  assert.match(ps, /-ne \$remota/, "rechaza un paquete con otra versión");
  assert.match(win("Actualizar.bat"), /actualizar\.ps1/);
  const inst = win("instalar.ps1");
  assert.match(inst, /actualizar\.ps1/);
  assert.match(inst, /Actualizar \$nombre\.lnk/);
  const build = fs.readFileSync(path.join(root, "tools", "build.js"), "utf8");
  assert.match(build, /tools\/windows\/Actualizar\.bat/);
  assert.match(build, /tools\/windows\/actualizar\.ps1/);
  /* la página avisa, solo abierta como archivo */
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  ["updateBar", "updateText", "btnUpdateClose"].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
  assert.ok(fs.readFileSync(path.join(root, "js", "app.js"), "utf8").includes('fetch(C.UPDATE_URL, { cache: "no-store", credentials: "omit"'));
});
