/* Lee el texto de los PDF de muestra (samples/, datos ficticios) y comprueba
   que se reconozca cada documento y se saquen los datos correctos. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const X = require("../js/extract.js");

const read = (name) => X.extract(fs.readFileSync(path.join(__dirname, "fixtures", name + ".txt"), "utf8"), name + ".pdf", "oc");

test("My Plans & Programs", () => {
  const r = read("My Plans and Programs");
  assert.equal(r.type, "oc_plans");
  assert.equal(r.line, "oc");
  assert.equal(r.net, "plans");
  assert.deepEqual(r.fields, {
    plan: "Ambetter Standard Silver", prima: "$25.40",
    miembros: "BEATRIZ DIAZ\nJUAN CARLOS DIAZ\nANA DIAZ", nombres: "BEATRIZ", apellidos: "DIAZ",
    efectiva: "01/01/2027", estado: "Active", compania: "AMBETTER", anio: "2027", plataforma: "MKPL"
  });
});

test("Eligibility Letter: ingreso, hogar y documentos pedidos con persona y fecha tope", () => {
  const r = read("Eligibility Letter");
  assert.equal(r.type, "oc_elig");
  assert.equal(r.net, "eligibility");
  assert.equal(r.fields.appId, "4412345678");
  assert.equal(r.fields.anio, "2027");
  assert.equal(r.fields.ingreso, "$32,000.00");
  assert.equal(r.fields.hogar, "4");
  assert.deepEqual(r.fields.docs, [{ cat: "income", persona: "BEATRIZ DIAZ", fecha: "02/12/2027" }]);
  assert.equal(r.fields.nombres + " " + r.fields.apellidos, "BEATRIZ DIAZ");
});

test("App Summary: nunca se toma el Seguro Social", () => {
  const r = read("App Summary");
  assert.equal(r.type, "oc_app");
  assert.equal(r.net, "appsummary");
  assert.equal(r.fields.appId, "4412345678");
  assert.equal(r.fields.ingreso, "$32,000.00");
  assert.equal(r.fields.hogar, "4");
  assert.equal(r.fields.dob, "03/14/1985");
  assert.equal(r.fields.direccion, "123 Main St, Miami, FL 33101");
  assert.doesNotMatch(JSON.stringify(r.fields), /1234"|\*\*\*/);
});

test("Aplicación de Medicare en español", () => {
  const r = read("Diaz Beatriz - Medicare App Summary ES");
  assert.equal(r.type, "mc_app");
  assert.equal(r.line, "mc");
  const f = r.fields;
  assert.equal(f.mbi, "1EG4TE5MK73");
  assert.equal(f.parteA, "01/01/2023");
  assert.equal(f.parteB, "02/01/2023");
  assert.equal(f.efectiva, "01/01/2027");
  /* el contrato (H-PBP) va dentro del nombre del plan */
  assert.equal(f.plan, "AARP Medicare Advantage from UHC FL-0020 (HMO-POS) H1045-012-000");
  assert.equal(f.contrato, undefined);
  assert.equal(f.periodoMC, "AEP");
  assert.equal(f.medicaid, "9876543210");
  assert.equal(f.pcp, "Dr. Carlos Rivera");
  assert.equal(f.pcpId, "000123456");
  assert.equal(f.confirmacion, "A1B2C3D4E5");
  assert.equal(f.escritura, "1234567");
  assert.equal(f.npn, "12345678");
  assert.equal(f.compania, "UNITED HEALTHCARE");
});

test("Aplicación de Medicare en inglés, en tabla", () => {
  const f = read("Humana Enrollment Confirmation").fields;
  assert.equal(f.compania, "HUMANA");
  assert.equal(f.mbi, "1EG4TE5MK73");
  assert.equal(f.parteA, "01/01/2023");
  assert.equal(f.parteB, "02/01/2023");
  assert.equal(f.efectiva, "01/01/2027");
  assert.equal(f.plan, "Humana Gold Plus H1036-077", "ya trae el contrato: no se repite");
  assert.equal(f.contrato, undefined);
  assert.equal(f.periodoMC, "AEP");
  assert.equal(f.pcp, "Carlos Rivera MD");
  assert.equal(f.confirmacion, "7H2K99Q1");
  assert.equal(f.medicaid, undefined, "un Medicaid vacío no debe tomar el dato de otra celda");
});

test("SOA", () => {
  const r = read("SOA Diaz Beatriz");
  assert.equal(r.type, "mc_soa");
  assert.equal(r.net, "soa");
  assert.equal(r.fields.soaEstado, "firmado");
  assert.equal(r.fields.soaFecha, "11/12/2026");
  assert.equal(r.fields.nombres, "BEATRIZ");
});

test("Comprobante de pago: método y autopay", () => {
  const r = read("Payment Receipt");
  assert.equal(r.type, "pay");
  assert.deepEqual(r.fields, {
    pagoEstado: "PAYMENT", pagoMonto: "$25.40", pagoConf: "PAY123456789", pagoFecha: "11/14/2026",
    pagoMetodo: "Tarjeta CC", autopay: "On"
  });
});

test("Aplicación dental", () => {
  const r = read("Dental Application");
  assert.equal(r.type, "supp_app");
  assert.equal(r.line, "supp");
  assert.equal(r.fields.producto, "Dental");
  assert.equal(r.fields.compania, "FLORIDA BLUE (FCL)");
  assert.equal(r.fields.prima, "$38.50");
  assert.equal(r.fields.efectiva, "12/01/2026");
  assert.equal(r.fields.appId, "2026111400123");
  assert.equal(r.fields.poliza, undefined);
});

test("Aplicación de vida: producto, App ID y beneficiario", () => {
  const text = "Occidental Life Insurance Company\nTerm Life Insurance Application\nApplication ID: OL-778899\n" +
    "First Name: Katherina\nLast Name: Collantes Vasquez\nMonthly Premium: $45.20\n" +
    "Primary Beneficiary: Collantes, Pedro (husband)\nRequested Effective Date: 05/15/2026";
  const r = X.extract(text, "app.pdf", "oc");
  assert.equal(r.type, "supp_app");
  assert.equal(r.fields.producto, "Life");
  assert.equal(r.fields.compania, "OCCIDENTAL");
  assert.equal(r.fields.appId, "OL-778899");
  assert.equal(r.fields.beneficiario, "Collantes, Pedro (husband)");
});

test("el nombre del archivo ayuda cuando el documento no trae texto", () => {
  assert.equal(X.extract("", "SOA_Diaz_Beatriz.pdf", "mc").type, "mc_soa");
  assert.equal(X.extract("", "Eligibility letter 2027.pdf", "oc").type, "oc_elig");
  assert.equal(X.extract("", "My Plans & Programs.png", "oc").type, "oc_plans");
  assert.equal(X.extract("", "Consent firmado.pdf", "oc").type, "consent");
  assert.equal(X.extract("", "scan0001.pdf", "oc").type, "unknown");
  assert.equal(X.extract("", "scan0001.pdf", "oc").count, 0);
});

test("un documento desconocido no inventa datos", () => {
  const r = X.extract("Lista de compras\nLeche 2\nPan 1\nHuevos 12\nGracias por su visita, vuelva pronto.", "nota.txt", "oc");
  assert.equal(r.type, "unknown");
  assert.deepEqual(r.fields, {});
});
