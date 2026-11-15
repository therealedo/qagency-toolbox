/* OCR sin internet: el mismo motor y los mismos modelos que van en la
   herramienta (vendor/tesseract) leen un escaneo y una captura, y la
   extracción llena los mismos datos que con el PDF con texto. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const X = require("../js/extract.js");
const O = require("../js/ocr.js");

const root = path.join(__dirname, "..");
/* cada archivo de vendor/tesseract deja su dato en window */
function vendor(name) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "vendor", "tesseract", name), "utf8"), ctx);
  return ctx.window;
}
const unzip = (b64) => zlib.gunzipSync(Buffer.from(b64, "base64"));

let engine = null;
async function reader() {
  if (engine) { return engine; }
  const src = vendor("ocr-loader.js").QA_OCR_CORE;
  /* el cargador de Emscripten usa require y module cuando corre en Node */
  const TesseractCore = new Function("require", "module", "exports", "__filename", "__dirname", src + "\nreturn TesseractCore;")(
    require, { exports: {} }, {}, __filename, __dirname);
  engine = O.makeEngine(TesseractCore);
  await engine.start(unzip(vendor("ocr-wasm.js").QA_OCR_WASM));
  const langs = Object.assign({}, vendor("ocr-lang-spa.js").QA_OCR_LANG, vendor("ocr-lang-eng.js").QA_OCR_LANG);
  engine.languages(O.LANGS.map((code) => ({ code: code, data: unzip(langs[code]) })));
  return engine;
}
const image = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name));

test("OCR: lee en español e inglés con el motor incluido", () => {
  assert.deepEqual(O.LANGS, ["spa", "eng"]);
});

test("OCR: un SOA escaneado (inglés) da los mismos datos que el PDF", async () => {
  const text = (await reader()).read(image("scan-soa.jpg"));
  const r = X.extract(text, "scan-soa.jpg", "mc");
  assert.equal(r.type, "mc_soa");
  assert.equal(r.net, "soa");
  assert.equal(r.fields.soaEstado, "firmado");
  assert.equal(r.fields.soaFecha, "11/12/2026");
  assert.equal(r.fields.nombres, "BEATRIZ");
});

test("OCR: una captura del resumen de la aplicación (español, dos columnas) da los mismos datos", async () => {
  const text = (await reader()).read(image("captura-resumen-es.png"));
  assert.match(text, /Información del solicitante/);
  const r = X.extract(text, "captura-resumen-es.png", "mc");
  assert.equal(r.type, "mc_app");
  const f = r.fields;
  assert.equal(f.mbi, "1EG4TE5MK73");
  assert.equal(f.parteA, "01/01/2023");
  assert.equal(f.parteB, "02/01/2023");
  assert.equal(f.efectiva, "01/01/2027");
  assert.equal(f.plan, "AARP Medicare Advantage from UHC FL-0020 (HMO-POS) H1045-012-000");
  assert.equal(f.medicaid, "9876543210");
  assert.equal(f.pcp, "Dr. Carlos Rivera");
  assert.equal(f.confirmacion, "A1B2C3D4E5");
  assert.equal(f.npn, "12345678");
});

test("OCR: un PDF escaneado se lee con OCR solo si casi no trae texto", () => {
  assert.equal(O.needsOcr(""), true);
  assert.equal(O.needsOcr("  \n Page 1  \n"), true);
  assert.equal(O.needsOcr("Scope of Sales Appointment Confirmation Form, Beneficiary Name: Beatriz Diaz"), false);
});
