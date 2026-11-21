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

/* Un App Summary escaneado lleva unas 2 páginas por persona: el de una
   familia de 5 tiene 10, y con 6 se perdían los dos últimos hijos. Su texto
   del OCR está en "OC App Summary OCR Family" (extract.test.js). */
test("OCR: un PDF escaneado se lee hasta 20 páginas, lo que trae el App Summary de una familia grande", () => {
  assert.ok(O.MAX_PAGES >= 20, "MAX_PAGES = " + O.MAX_PAGES);
});

/* Cotizaciones de HealthSherpa (capturas de la cotización pública, con un
   hogar inventado): el OCR da las palabras con su posición y se lee cada plan
   de la pantalla con su compañía y la prima que paga el cliente. */
async function quote(name) {
  const e = await reader(), img = image(name);
  return X.extract(e.read(img), name, "oc", { words: e.words(img) });
}
const plansOf = (r) => r.fields.planes.map((p) => [p.compania, p.prima, p.plan]);

test("OCR: búsqueda de HealthSherpa: cada tarjeta con su prima, sin la barra de filtros", async () => {
  const r = await quote("healthsherpa-list.jpg");
  assert.equal(r.type, "oc_quote");
  assert.equal(r.line, "oc");
  const p = plansOf(r);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].slice(0, 2), ["FLORIDA BLUE", "$36.10"]);
  assert.match(p[0][2], /^myBlue Essentials Bronze \(HSA\) 27?M?07-30 \(Rewards\)$/);
  assert.deepEqual(p[1], ["OSCAR", "$40.94", "Bronze Simple Breathe Easy with Enhanced COPD Benefits"]);
});

test("OCR: búsqueda de HealthSherpa: la lista de compañías del filtro no son planes", async () => {
  assert.deepEqual(plansOf(await quote("healthsherpa-list-filters.jpg")), [
    ["OSCAR", "$40.94", "Bronze Simple Breathe Easy with Enhanced COPD Benefits"],
    ["OSCAR", "$66.86", "Bronze Classic 4700"]
  ]);
});

test("OCR: búsqueda de HealthSherpa: la barra de planes a comparar no son planes; Ambetter sale de su familia de planes", async () => {
  assert.deepEqual(plansOf(await quote("healthsherpa-list-compare-bar.jpg")), [
    ["UNITED HEALTHCARE", "$150.20", "UHC Sanitas Bronze Value ($0 Virtual Urgent Care, HSA, $0 Insulin)"],
    ["AMBETTER", "$153.45", "Fundamental Bronze"]
  ]);
});

test("OCR: búsqueda de HealthSherpa en español: Oscar sale de su logo", async () => {
  const p = plansOf(await quote("healthsherpa-list-es.jpg"));
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].slice(0, 2), ["FLORIDA BLUE", "$36.10"]);
  assert.deepEqual(p[1], ["OSCAR", "$40.94", "Respiración fácil de bronce con beneficios mejorados para la EPOC"]);
});

test("OCR: vista de un plan de HealthSherpa: el logo encima del título no es parte del nombre", async () => {
  assert.deepEqual(plansOf(await quote("healthsherpa-plan.jpg")), [
    ["FLORIDA BLUE", "$36.10", "myBlue Essentials Bronze (HSA) 27M07-30 (Rewards)"]
  ]);
});

test("OCR: vista de un plan de HealthSherpa en español: el nombre en dos líneas y la prima sin la tachada", async () => {
  const p = plansOf(await quote("healthsherpa-plan-es.jpg"));
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].slice(0, 2), ["OSCAR", "$40.94"]);
  assert.match(p[0][2], /^Respiración f[aá]cil de bronce con beneficios mejorados para la EPOC$/);
});

test("OCR: comparación de HealthSherpa: cada columna con su nombre (de una a tres líneas), compañía y prima", async () => {
  const expected = [
    ["FLORIDA BLUE", "$36.10", "myBlue Essentials Bronze (HSA) 27M07-30 (Rewards)"],
    ["OSCAR", "$40.94", "Bronze Simple Breathe Easy with Enhanced COPD Benefits"],
    ["AMBETTER", "$153.45", "Fundamental Bronze"],
    ["UNITED HEALTHCARE", "$150.20", "UHC Sanitas Bronze Value ($0 Virtual Urgent Care, HSA, $0 Insulin)"]
  ];
  assert.deepEqual(plansOf(await quote("healthsherpa-compare.jpg")), expected);
  /* en español, la compañía de Oscar sale de su nombre legal debajo del plan */
  const es = plansOf(await quote("healthsherpa-compare-es.jpg"));
  assert.deepEqual(es.map((p) => p.slice(0, 2)), expected.map((p) => p.slice(0, 2)));
  assert.match(es[1][2], /^Respiración fácil de bronce con beneficios mejorados/);
});

test("OCR: búsqueda de HealthSherpa: un nombre en dos líneas va completo, con la compañía que nombra", async () => {
  assert.deepEqual(plansOf(await quote("healthsherpa-list-two-lines.jpg")), [
    ["AMERIHEALTH CARITAS", "$96.30", "AmeriHealth Caritas Next Bronze Essential + Three Free PCP Visits + Free 24/7 Preferred Provider PCP/Urgent Virtual Care + No Referrals"],
    ["OSCAR", "$99.08", "Bronze Simple Diabetes with Adult Dental & Vision"]
  ]);
});
