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

test("el manifiesto apunta a íconos que existen", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"));
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  m.icons.forEach((i) => assert.ok(exists(i.src), "falta " + i.src));
});

test("el equipo por defecto: iniciales de notas y de agente", () => {
  const liseth = C.TEAM.find((t) => t.name === "Ana Torres");
  assert.equal(liseth.ini, "DI");
  assert.equal(liseth.agentIni, "LI");
  assert.ok(C.TEAM.some((t) => t.ini === "MA" && !t.npn));
  assert.ok(!C.TEAM.some((t) => t.ini === "JI"));
  assert.deepEqual(C.OFFICES, ["QAgency", "ATH Insurance"]);
});

test("la página sigue sin conexiones: el OCR solo agrega 'wasm-unsafe-eval'", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(csp, "default-src 'self' 'unsafe-inline' data: blob: file: 'wasm-unsafe-eval'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'");
  /* el motor y los modelos del OCR van dentro de la herramienta */
  ["vendor/tesseract/ocr-loader.js", "vendor/tesseract/ocr-wasm.js", "vendor/tesseract/ocr-lang-spa.js",
    "vendor/tesseract/ocr-lang-eng.js", "js/ocr.js"].forEach((f) => assert.ok(html.includes('<script src="' + f + '"></script>'), f));
});
