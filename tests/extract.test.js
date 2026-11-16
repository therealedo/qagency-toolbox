/* Lee el texto de los PDF de muestra (samples/, datos ficticios) y comprueba
   que se reconozca cada documento y se saquen los datos correctos. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const X = require("../js/extract.js");
const C = require("../js/config.js");

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

/* Aviso de muestra de CMS (nombres e IDs ficticios): cada fila de ACTION
   pide un documento, con un punto debajo de cada persona que debe enviarlo. */
test("Eligibility Notice: los documentos que pide el Mercado, con persona y fecha tope", () => {
  const r = read("OC Eligibility Notice Docs");
  assert.equal(r.type, "oc_elig");
  assert.equal(r.net, "eligibility");
  assert.deepEqual(r.fields.docs, [
    { cat: "citizenship", persona: "LAURA RAMOS", fecha: "02/20/2023" },
    { cat: "citizenship", persona: "DIEGO RAMOS", fecha: "02/20/2023" },
    { cat: "income", persona: "LAURA RAMOS", fecha: "02/15/2023" }
  ]);
});

/* El aviso de la agencia pone los nombres en dos filas: nombres y apellidos. */
const eligPage = (rows) => X.itemsToText([
  textItem("Primary contact", 39, 700), textItem("Marketplace Eligibility Notice", 300, 700),
  textItem("Laura Ramos", 39, 688),
  textItem("$31,200/year", 40, 600),
  textItem("Laura", 440, 580), textItem("Diego", 490, 580), textItem("Sofia", 540, 580),
  textItem("Ramos", 440, 568), textItem("Ramos", 490, 568), textItem("Ramos", 540, 568),
  textItem("Applied for coverage.", 40, 550), textItem("•", 505, 550), textItem("•", 555, 550),
  textItem("ACTION: Next steps", 40, 500)
].concat(rows));

test("Eligibility Notice: con nombres y apellidos en dos filas, el documento es de quien tiene el punto", () => {
  const text = eligPage([
    textItem("By January 31, 2027, submit documents to confirm immigration status. See Submitting", 40, 480),
    textItem("Documents, attached.", 40, 468), textItem("•", 555, 468),
    textItem("By January 15, 2027, submit documents to confirm Social Security number. See", 40, 450),
    textItem("Submitting Documents, attached.", 40, 438), textItem("•", 505, 438), textItem("•", 555, 438)
  ]);
  const r = X.extract(text, "document.pdf", "oc");
  assert.equal(r.type, "oc_elig");
  assert.deepEqual(r.fields.docs, [
    { cat: "immigration", persona: "SOFIA RAMOS", fecha: "01/31/2027" },
    { cat: "ssn", persona: "DIEGO RAMOS", fecha: "01/15/2027" },
    { cat: "ssn", persona: "SOFIA RAMOS", fecha: "01/15/2027" }
  ]);
});

test("Eligibility Notice en español: «Antes del … envíe documentos para confirmar …»", () => {
  const text = eligPage([
    textItem("Antes del 31 de enero de 2027, envíe documentos para confirmar su ciudadanía.", 40, 480),
    textItem("•", 505, 480)
  ]);
  assert.deepEqual(X.extract(text, "document.pdf", "oc").fields.docs, [{ cat: "citizenship", persona: "DIEGO RAMOS", fecha: "01/31/2027" }]);
});

test("Eligibility Notice pegado sin columnas: sin saber de quién es, la persona queda vacía", () => {
  const text = [
    "Marketplace Eligibility Notice", "Application ID # 4412345678",
    "Laura        Diego", "Ramos        Ramos",
    "Applied for coverage.                              •      •",
    "ACTION: Next steps",
    "By February 15, 2027, submit documents to confirm household income. See",
    "Submitting Documents, attached.                              •",
    "By February 20, 2027, submit documents to confirm citizenship. See Submitting",
    "Documents, attached.                              •      •"
  ].join("\n");
  assert.deepEqual(X.extract(text, "document.pdf", "oc").fields.docs, [
    { cat: "income", persona: "", fecha: "02/15/2027" },
    { cat: "citizenship", persona: "LAURA RAMOS", fecha: "02/20/2027" },
    { cat: "citizenship", persona: "DIEGO RAMOS", fecha: "02/20/2027" }
  ]);
});

test("Eligibility Letter: el rótulo de una fila nunca se toma como persona", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "Eligibility Letter.txt"), "utf8").replace(
    "Beatriz Diaz                         Proof of yearly income",
    "Proof of yearly income               Proof of yearly income");
  const docs = X.extract(text, "document.pdf", "oc").fields.docs;
  assert.deepEqual(docs, [{ cat: "income", persona: "", fecha: "02/12/2027" }]);
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
  /* el Writing ID ya no se lee: basta con el NPN */
  assert.equal(f.escritura, undefined);
  assert.doesNotMatch(JSON.stringify(f), /1234567"/);
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

/* Aplicaciones reales de Medicare (texto sacado del PDF por pdfToText, con
   nombres e IDs ficticios). Cada una se reconoce sin ayuda del nombre del
   archivo y da sus datos; un campo que el documento no trae queda vacío. */
const mcCarrier = (word) => C.CARRIERS.mc.find((c) => c.re.test(word)).name;
const MC_APPS = {
  Humana: {
    nombres: "ANDRES FELIPE", apellidos: "MORALES", mbi: "4CD5EF6GH78", parteA: "09/01/2010", parteB: "10/01/2010",
    efectiva: "01/01/2027", plan: "Humana Gold Plus - Diabetes and Heart (HMO C-SNP) H1036-311-000", periodoMC: "AEP",
    pcp: "RIVAS TOMAS J MD", pcpId: "731902", confirmacion: "H4QW27XTRA", prima: "$0.00", agente: "MARTA QUINTERO",
    compania: mcCarrier("Humana"), cmd: true
  },
  UHC: {
    nombres: "ELENA", apellidos: "NAVARRO", mbi: "5EF6GH7JK89", parteA: "11/01/2003", parteB: "11/01/2003",
    efectiva: "01/01/2027", plan: "IND - UHC Dual Complete FL-Y5 (HMO-POS D-SNP) (MAPD) H1045-073-000",
    medicaid: "1234509876", periodoMC: "AEP", pcp: "Hector Villalba", pcpId: "001234567890", prima: "$0.00",
    agente: "MARTA QUINTERO LUGO", npn: "19876543", compania: mcCarrier("UnitedHealthcare")
  },
  Aetna: {
    nombres: "GLORIA", apellidos: "PAREDES", mbi: "6GH7JK8MN90", parteA: "08/01/2016", parteB: "08/01/2016",
    efectiva: "01/01/2027", plan: "Aetna Medicare Select (HMO) H1609-027", periodoMC: "AEP",
    pcp: "Benitez, Ramon, MD", pcpId: "506070", confirmacion: "T9876543210987A", prima: "$0.00",
    agente: "MARTA QUINTERO", compania: mcCarrier("Aetna")
  },
  /* Freedom solo muestra "PQ22" como MBI, no trae fechas de Parte A/B y
     marca el período con casillas dibujadas: esos campos quedan vacíos */
  Freedom: {
    nombres: "NORA", apellidos: "BELTRAN", efectiva: "01/01/2027", plan: "Freedom Medi-Medi Partial (HMO D-SNP)",
    medicaid: "2345678901", confirmacion: "N10102026123456789", prima: "$0.00", agente: "LUCIA FERRER CAMPOS",
    compania: mcCarrier("Freedom Health")
  },
  /* Devoted deja la Parte A/B, el PCP y la prima en "-" */
  Devoted: {
    nombres: "PABLO", apellidos: "ANDRES RUIZ", mbi: "7JK8MN9PQ01", efectiva: "01/01/2027",
    plan: "DEVOTED CHOICE GIVEBACK 016 FL (PPO) (H9884-016)", periodoMC: "AEP", confirmacion: "KZPTRWM5N2Q",
    agente: "LUCIA FERRER CAMPOS", npn: "18765432", compania: mcCarrier("Devoted Health")
  }
};

for (const [carrier, expected] of Object.entries(MC_APPS)) {
  test("Aplicación de Medicare " + carrier + ": tipo y datos", () => {
    const text = fs.readFileSync(path.join(__dirname, "fixtures", "Medicare App " + carrier + ".txt"), "utf8");
    const r = X.extract(text, "Medicare App " + carrier + ".pdf", "mc");
    assert.equal(r.type, "mc_app");
    assert.equal(r.line, "mc");
    assert.deepEqual(r.fields, expected);
  });

  test("Aplicación de Medicare " + carrier + ": se reconoce sin el nombre del archivo", () => {
    const text = fs.readFileSync(path.join(__dirname, "fixtures", "Medicare App " + carrier + ".txt"), "utf8");
    assert.equal(X.extract(text, "document.pdf", "oc").type, "mc_app");
    assert.equal(X.extract(text, "scan0001.pdf", "supp").type, "mc_app");
  });
}

test("Aplicación de Medicare: un rótulo nunca se toma como valor", () => {
  const text = "Medicare Number: 1EG4TE5MK73\nPart A effective date\n01/01/2020\nProposed effective date\n01/01/2027\n" +
    "Primary Care Physician (PCP)\nPCP ID:\nPCP Name:\nCurrent Patient of PCP?\n" +
    "If you do not complete the Provider ID, a Primary Care provider will be\nselected for you by the Plan.\n" +
    "Election Type:     ICEP/IEP   AEP   MA OEP    SEP (type)\nWriting ID: 7654321";
  const f = X.extract(text, "document.pdf", "mc").fields;
  assert.equal(f.efectiva, "01/01/2027", "la fecha de la Parte A no es la fecha efectiva");
  assert.equal(f.pcp, undefined);
  assert.equal(f.pcpId, undefined);
  assert.equal(f.periodoMC, undefined, "una lista de opciones sin marcar no es el período");
  assert.equal(f.escritura, undefined);
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
    pagoMetodo: "Tarjeta CC", autopay: "On", compania: "AMBETTER"
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
  /* Suplementario solo guarda el Policy #: ni App ID ni tipo de plan */
  assert.equal(r.fields.appId, undefined);
  assert.equal(r.fields.poliza, undefined);
  assert.equal(r.fields.tipoPlan, undefined);
});

test("Aplicación de vida: producto, App ID y beneficiario", () => {
  const text = "Occidental Life Insurance Company\nTerm Life Insurance Application\nApplication ID: OL-778899\n" +
    "First Name: Katherina\nLast Name: Collantes Vasquez\nMonthly Premium: $45.20\n" +
    "Primary Beneficiary: Collantes, Pedro (husband)\nRequested Effective Date: 05/15/2026";
  const r = X.extract(text, "app.pdf", "oc");
  assert.equal(r.type, "supp_app");
  assert.equal(r.fields.producto, "Life");
  assert.equal(r.fields.compania, "OCCIDENTAL");
  assert.equal(r.fields.appId, undefined);
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

/* ------------------------------------------------ Suplementario y pagos */

/* Un PDF con formulario (AcroForm) guarda lo que se escribió en sus campos,
   no en el texto de la página: pdfToText los agrega al final, uno por línea. */
const fakePdf = (pages) => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: (i) => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: pages[i - 1].items }),
        getAnnotations: () => Promise.resolve(pages[i - 1].annots || [])
      })
    })
  })
});
const textItem = (str, x, y) => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10 });

test("pdfToText: los valores de un formulario PDF van al final del texto", async () => {
  const lib = fakePdf([
    { items: [textItem("Name (Last, First)", 10, 700)], annots: [
      { subtype: "Widget", fieldName: "Last1", fieldValue: "Doe" },
      { subtype: "Widget", fieldName: "First1", fieldValue: "  Jane  " },
      { subtype: "Widget", fieldName: "Empty", fieldValue: "" },
      { subtype: "Widget", fieldName: "Agree", fieldValue: "Off", checkBox: true },
      { subtype: "Widget", fieldName: "Plan", fieldValue: "Plan100Max", radioButton: true },
      { subtype: "Widget", fieldName: "Plan", fieldValue: "Plan100Max", radioButton: true },
      { subtype: "Widget", fieldName: "Sign", fieldValue: { sig: true } },
      { subtype: "Link", url: "https://example.com" }
    ] },
    { items: [textItem("Page two", 10, 700)], annots: [{ subtype: "Widget", fieldName: "Last1", fieldValue: "Doe" }] }
  ]);
  const text = await X.pdfToText(lib, new Uint8Array());
  assert.equal(text, "Name (Last, First)\n\nPage two\n\nCampos del formulario:\nLast1: Doe\nFirst1: Jane\nPlan: Plan100Max");
});

/* El aviso de elegibilidad pone un punto debajo de cada persona: el texto
   conserva esas columnas (x / 4) para saber de quién es cada fila. */
test("itemsToText: los puntos de una tabla y los nombres de arriba quedan en su columna", () => {
  const text = X.itemsToText([
    textItem("Primary contact", 39, 650), textItem("Marketplace Eligibility Notice", 300, 650),
    textItem("help: $31,200/year", 40, 590),
    textItem("Laura Ramos", 455, 565), textItem("Diego Ramos", 526, 565),
    textItem("Applied for coverage.", 40, 542), textItem("•", 470, 540), textItem("•", 538, 540),
    textItem("submit documents to confirm household income.", 40, 260), textItem("•", 470, 260),
    textItem("•", 40, 200), textItem("Bring your ID", 50, 200)
  ]);
  const lines = text.split("\n");
  /* sin puntos, la separación de siempre (como mucho 30 espacios) */
  assert.equal(lines[0], "Primary contact" + " ".repeat(30) + "Marketplace Eligibility Notice");
  assert.equal(lines[1], "help: $31,200/year");
  assert.equal(lines[2].indexOf("Laura Ramos"), 114);
  assert.equal(lines[2].indexOf("Diego Ramos"), 132);
  assert.equal(lines[3].indexOf("•"), 118);
  assert.equal(lines[3].lastIndexOf("•"), 135);
  assert.equal(lines[4].indexOf("•"), 118);
  /* un punto al empezar la línea es una viñeta, no una columna */
  assert.equal(lines[5], "• Bring your ID");
});

test("itemsToText: la primera fila con puntos en la segunda línea de la página no rompe la lectura", () => {
  /* la fila de arriba (nombres al principio de una página) es la única que hay encima */
  const text = X.itemsToText([
    textItem("Laura Ramos", 455, 700),
    textItem("Applied for coverage.", 40, 680), textItem("•", 470, 680)
  ]);
  const lines = text.split("\n");
  assert.equal(lines[0].indexOf("Laura Ramos"), 114);
  assert.equal(lines[1].indexOf("•"), 118);
});

test("pdfToText: un PDF sin formulario da solo el texto de sus páginas", async () => {
  const lib = fakePdf([{ items: [textItem("Payment receipt", 10, 700)] }, { items: [textItem("Total: $27.65", 10, 700)] }]);
  assert.equal(await X.pdfToText(lib, new Uint8Array()), "Payment receipt\n\nTotal: $27.65");
});

/* Documentos reales de Suplementario y comprobantes de pago (texto sacado
   del PDF por pdfToText; nombres, IDs, teléfonos y direcciones ficticios).
   Cada uno se reconoce sin ayuda del nombre del archivo y da sus datos; un
   campo que el documento no muestra queda vacío. `read` es la pestaña
   abierta al soltar el documento. */
const carrierOf = (line, word) => (C.CARRIERS[line].find((c) => c.re.test(word)) || { name: "(sin compañía para " + word + ")" }).name;
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name + ".txt"), "utf8");
const GR = carrierOf("supp", "Golden Rule");
const ALLSTATE = carrierOf("supp", "Integon Indemnity Corporation");
const AGENT_GR = { agente: "MARTA R QUINTERO", npn: "19876543" };
const SUPP_APP = { type: "supp_app", line: "supp", net: "appsummary", read: "supp" };
const PAY = { type: "pay", line: "", net: "payment" };
const SUPP_DOCS = {
  "Supp App Golden Rule Hospital AdvantageGuard": Object.assign({}, SUPP_APP, { fields: Object.assign({
    nombres: "ROSA", apellidos: "MEDINA", compania: GR, producto: "Hospital", plan: "AdvantageGuard Hospital", prima: "$78.03",
    efectiva: "01/01/2027", poliza: "900123456", beneficiario: "Hector Medina (Spouse)" }, AGENT_GR) }),
  "Supp App Golden Rule Short Term": Object.assign({}, SUPP_APP, { fields: Object.assign({
    nombres: "DANIEL E", apellidos: "VEGA CASTILLO", compania: GR, producto: "Short Term", plan: "Plan 100 Max", prima: "$367.00",
    efectiva: "01/01/2027", poliza: "900234567" }, AGENT_GR) }),
  "Supp App Golden Rule ProtectorGuard": Object.assign({}, SUPP_APP, { fields: Object.assign({
    nombres: "NICOLAS", apellidos: "SALINAS MORA", compania: GR, producto: "Hospital", plan: "Health ProtectorGuard Select 2000",
    prima: "$59.66", efectiva: "01/01/2027", poliza: "900345678", beneficiario: "Paula Rios (Significant other)" }, AGENT_GR) }),
  "Supp App Golden Rule Hospital Indemnity": Object.assign({}, SUPP_APP, { fields: Object.assign({
    nombres: "SILVIA", apellidos: "LUNA PRIETO", compania: GR, producto: "Hospital", plan: "Hospital Indemnity", prima: "$38.38",
    efectiva: "01/01/2027", poliza: "900456789" }, AGENT_GR) }),
  /* la prima es el total mensual de la tabla, no un rider ni "Premium Amount Sent" */
  "Supp App Allstate Accident": Object.assign({}, SUPP_APP, { fields: {
    nombres: "JULIO", apellidos: "MENA DUARTE", compania: ALLSTATE, producto: "Accident", plan: "Accident Medical Expense Plan",
    prima: "$12.89", efectiva: "01/01/2027", beneficiario: "Mena Ochoa, Alba", agente: "LUCIA FERRER CAMPOS" } }),
  "Supp App Allstate Accident Spouse": Object.assign({}, SUPP_APP, { fields: {
    nombres: "SILVIA", apellidos: "LUNA PRIETO", compania: ALLSTATE, producto: "Accident", plan: "Accident Medical Expense Plan",
    prima: "$26.61", efectiva: "01/01/2027", beneficiario: "Luna Prieto, Ramon", agente: "LUCIA FERRER CAMPOS" } }),
  /* Florida Blue no muestra la prima en la aplicación */
  "Supp App Dental Florida Blue": Object.assign({}, SUPP_APP, { fields: {
    nombres: "MARIO", apellidos: "BENITEZ", compania: carrierOf("supp", "Florida Combined Life"), producto: "Dental",
    plan: "BlueDental Copayment QF", efectiva: "10/01/2026", agente: "LUCIA FERRER CAMPOS" } }),
  "Supp App Dental Cigna": Object.assign({}, SUPP_APP, { fields: {
    nombres: "LAURA", apellidos: "PINEDA", compania: carrierOf("supp", "Cigna"), producto: "Dental", plan: "Cigna Dental Vision Hearing 3500",
    prima: "$62.66", efectiva: "09/01/2026", agente: "MARTA QUINTERO" } }),
  /* "No Dependents added" no es un beneficiario; el NPN viene en el enlace */
  "Supp App Dental Humana": Object.assign({}, SUPP_APP, { fields: {
    nombres: "TOMAS", apellidos: "IBARRA", compania: carrierOf("supp", "Humana"), producto: "Dental", plan: "Dental Value HI215",
    prima: "$11.99", efectiva: "08/01/2026", agente: "MARTA QUINTERO", npn: "19876543" } }),
  "Supp App Dental Allstate": Object.assign({}, SUPP_APP, { fields: {
    nombres: "ANDRES", apellidos: "FERRO LIMA", compania: carrierOf("supp", "National Health Insurance Company"), producto: "Dental",
    plan: "Copay Plan 2", efectiva: "07/03/2026", agente: "LUCIA FERRER CAMPOS" } }),
  /* la tarjeta es un escaneo: este es el texto que da el OCR */
  "Supp ID Card Allstate Dental OCR": { type: "supp_card", line: "supp", net: "card", read: "supp", fields: {
    nombres: "ANDRES", apellidos: "FERRO LIMA", compania: carrierOf("supp", "Allstate"), producto: "Dental", plan: "Select Dental PPO Plan",
    poliza: "2011223344", efectiva: "07/03/2026" } },
  "Payment Oscar": Object.assign({}, PAY, { read: "oc", fields: {
    pagoEstado: "PAYMENT", pagoMonto: "$530.95", pagoFecha: "10/19/2026", pagoConf: "0Qk3TzWbN7pLs2HdVx9RfM4cYa6EuJ1oGi8BnK5wPq3Z",
    compania: carrierOf("oc", "Oscar"), nombres: "VICTOR", apellidos: "PAZ" } }),
  "Payment UHC": Object.assign({}, PAY, { read: "oc", fields: {
    pagoEstado: "PAYMENT", pagoMonto: "$27.65", pagoFecha: "10/19/2026", pagoConf: "301928374655", autopay: "On",
    compania: carrierOf("oc", "UHC"), nombres: "ANA DEL CARMEN", apellidos: "RIOS SOTO" } }),
  /* Wellpoint no muestra ni el monto ni la fecha */
  "Payment Wellpoint": Object.assign({}, PAY, { read: "oc", fields: {
    pagoEstado: "PAYMENT", pagoConf: "PSTG261001QWERTY7Z", compania: carrierOf("oc", "Wellpoint") } }),
  /* la fecha es la del encabezado que pone el navegador al imprimir */
  "Payment Ambetter": Object.assign({}, PAY, { read: "oc", fields: {
    pagoEstado: "PAYMENT", pagoMonto: "$79.15", pagoFecha: "09/28/2026", pagoConf: "817263540", pagoMetodo: "Tarjeta CC",
    compania: carrierOf("oc", "Ambetter") } }),
  /* en Suplementario el comprobante trae también producto, plan y póliza */
  "Payment GeoBlue International": Object.assign({}, PAY, { read: "supp", fields: {
    pagoEstado: "PAYMENT", pagoMonto: "$149.94", compania: carrierOf("supp", "Blue Cross Blue Shield Global Solutions"),
    producto: "International", plan: "Medical Coverage for Travel - Single Trip Platinum", poliza: "905512348", efectiva: "09/10/2026",
    nombres: "RAUL", apellidos: "PONCE MEDINA" } }),
  "Payment Florida Blue Dental": Object.assign({}, PAY, { read: "supp", fields: {
    pagoEstado: "PAYMENT", pagoMonto: "$69.46", pagoFecha: "08/14/2026", pagoConf: "150099887", pagoMetodo: "Tarjeta CC",
    compania: carrierOf("supp", "Florida Combined Life"), producto: "Dental", plan: "BlueDental Copayment QF", efectiva: "09/01/2026" } })
};

for (const [name, exp] of Object.entries(SUPP_DOCS)) {
  test(name + ": tipo y datos", () => {
    const r = X.extract(fixture(name), name + ".pdf", exp.read);
    assert.equal(r.type, exp.type);
    assert.equal(r.line, exp.line);
    assert.equal(r.net, exp.net);
    assert.deepEqual(r.fields, exp.fields);
  });

  test(name + ": se reconoce sin el nombre del archivo", () => {
    assert.equal(X.extract(fixture(name), "document.pdf", "oc").type, exp.type);
    assert.equal(X.extract(fixture(name), "scan0001.pdf", "mc").type, exp.type);
  });
}

/* -------------------------------------------- documentos de Obamacare */

/* Documentos reales de Obamacare (texto de pdfToText o del OCR; nombres, IDs,
   direcciones y montos ficticios). Se leen sin el nombre del archivo. */
const OC_DOCS = {
  /* el plan es "Clarity Silver", no "Communication" (el menú de la izquierda) */
  "OC My Plans & Programs Ambetter": { type: "oc_plans", net: "plans", fields: {
    plan: "Clarity Silver", prima: "$1.40", appId: "4412345678", miembros: "LAURA RAMOS\nDIEGO RAMOS",
    nombres: "LAURA", apellidos: "RAMOS", efectiva: "01/01/2027", estado: "Active", compania: "AMBETTER", anio: "2027" } },
  /* la guía que viene detrás de la carta habla de documentos: nadie los pidió */
  "OC Eligibility Notice": { type: "oc_elig", net: "eligibility", fields: {
    appId: "4412345678", anio: "2027", nombres: "LAURA", apellidos: "RAMOS", ingreso: "$31,200.00" } },
  /* escaneo: texto del OCR. El ingreso es el anual, no el del mes; "2/17/41"
     es una fecha de nacimiento, no puede ser de 2041 */
  "OC App Summary OCR": { type: "oc_app", net: "appsummary", fields: {
    nombres: "LAURA", apellidos: "RAMOS", anio: "2027", ingreso: "$31,200.00", dob: "02/17/1941",
    direccion: "Fort Myers, FL 33901-", plataforma: "MKPL",
    personas: [{ nombre: "LAURA RAMOS", titular: true, dob: "02/17/1941", estatus: "ciudadano", ingreso: "$31,200.00" },
      { nombre: "DIEGO", parentesco: "Hijo/a", ingreso: "$0.00" }] } },
  /* Docs Submitted: el punto abierto es de quien abrió la cuenta (el titular) */
  "OC Docs Submitted Principal": { type: "oc_docs", net: "docsub", fields: {
    appId: "4498765432", anio: "2027", nombres: "ROSA", apellidos: "PEREZ LIMA",
    docs: [{ cat: "immigration", persona: "ROSA PEREZ LIMA", titular: true, enviado: true, doc: "Permanent Resident Card, Green Card (I-551)" }] } },
  /* …o de otra persona del hogar: el nombre completo del titular no aparece */
  "OC Docs Submitted Dependent": { type: "oc_docs", net: "docsub", fields: {
    appId: "4498765432", anio: "2027",
    docs: [{ cat: "immigration", persona: "YANET SOTO MESA", titular: false, enviado: true, doc: "Employment Authorization Card (I-766)" }] } }
};

for (const [name, exp] of Object.entries(OC_DOCS)) {
  test(name + ": tipo y datos sin el nombre del archivo", () => {
    const r = X.extract(fixture(name), "document.pdf", "oc");
    assert.equal(r.type, exp.type);
    assert.equal(r.line, "oc");
    assert.equal(r.net, exp.net);
    assert.deepEqual(r.fields, exp.fields);
    assert.equal(X.extract(fixture(name), "scan0001.pdf", "mc").type, exp.type);
  });
}

test("Docs Submitted: la etiqueta del tipo y el nombre del archivo como pista", () => {
  assert.equal(X.TYPES.oc_docs.label, "Docs Submitted");
  assert.equal(X.extract("", "Perez Lima, Rosa - OC_Docs Submitted_Immigration status 2026 NOV.png", "oc").type, "oc_docs");
});

test("Docs Submitted: sin un punto abierto no hay documento enviado", () => {
  const text = fixture("OC Docs Submitted Principal").replace("Collapse -", "Expand +").replace(/^Rosa - You need.*$/m, "");
  const r = X.extract(text, "document.pdf", "oc");
  assert.equal(r.type, "oc_docs");
  assert.equal(r.fields.docs, undefined);
});

test("los documentos de Obamacare de antes se siguen reconociendo sin el nombre del archivo", () => {
  assert.equal(X.extract(fixture("My Plans and Programs"), "document.pdf", "oc").type, "oc_plans");
  assert.equal(X.extract(fixture("Eligibility Letter"), "document.pdf", "oc").type, "oc_elig");
  assert.equal(X.extract(fixture("App Summary"), "document.pdf", "oc").type, "oc_app");
});

/* Los Consent de la agencia (QAgency y ATH, inglés y español). El PDF pierde
   la ligadura "ti": queda un carácter que no es letra ("consen?miento"). */
for (const name of ["Consent QA English", "Consent ATH English", "Consent QA Spanish", "Consent ATH Spanish"]) {
  test(name + ": es un Consent sin el nombre del archivo", () => {
    const r = X.extract(fixture(name), "document.pdf", "oc");
    assert.equal(r.type, "consent");
    assert.equal(r.net, "consent");
    assert.deepEqual(r.fields, {});
    assert.equal(X.extract(fixture(name), "scan0001.pdf", "mc").type, "consent");
  });
}

test("una firma de tutor (Parent/Legal Guardian) no es la compañía Guardian", () => {
  const text = "Application for Dental Insurance\nSignature of Parent/Legal Guardian\nGuardian’s Signature\n" +
    "Underwritten by Ameritas Life Insurance Corp.\nFirst Name: Rosa\nLast Name: Medina\nMonthly Premium: $30.10";
  assert.equal(X.extract(text, "document.pdf", "supp").fields.compania, carrierOf("supp", "Ameritas"));
});

test("App Summary: el teléfono y el email del contacto del hogar van a Teléfono y Email del titular", () => {
  const head = "HealthCare.gov\nReview your application\n2027 application for individual & family coverage\nApplication ID: 4412345678\n" +
    "Review your contact information\nFull name\nBeatriz Diaz\n";
  /* el valor en la línea siguiente, como en el resumen impreso */
  let r = X.extract(head + "Email address\nbeatriz.diaz@example.com\nPhone number(s)\nMobile: (305) 555-0147\nPreferred written language\nSpanish\n", "App Summary.pdf", "oc");
  assert.equal(r.type, "oc_app");
  assert.equal(r.fields.clienteEmail, "beatriz.diaz@example.com");
  assert.equal(r.fields.clienteTel, "(305) 555-0147");
  /* en la misma línea, con otro formato */
  r = X.extract(head + "Email   Beatriz.Diaz@Example.com\nPhone   305.555.0147\n", "App Summary.pdf", "oc");
  assert.equal(r.fields.clienteEmail, "beatriz.diaz@example.com");
  assert.equal(r.fields.clienteTel, "(305) 555-0147");
  /* con el 1 delante */
  r = X.extract(head + "Phone number(s)\nHome: +1 305-555-0147\n", "App Summary.pdf", "oc");
  assert.equal(r.fields.clienteTel, "(305) 555-0147");
});

test("App Summary leído con OCR: un teléfono o email mal leído no se llena", () => {
  const r = read("OC App Summary OCR");
  assert.equal(r.fields.clienteEmail, undefined);
  assert.equal(r.fields.clienteTel, undefined);
});

test("App Summary: el número gratuito del Mercado no es el teléfono del cliente", () => {
  const r = X.extract("HealthCare.gov\nReview your application\nApplication ID: 4412345678\nFull name\nBeatriz Diaz\n" +
    "Phone\n1-800-318-2596\n", "App Summary.pdf", "oc");
  assert.equal(r.fields.clienteTel, undefined);
});

test("HealthSherpa: el texto copiado de la búsqueda da cada plan con su compañía y prima; los filtros no son planes", () => {
  const r = read("HealthSherpa Plans Copied");
  assert.equal(r.type, "oc_quote");
  assert.equal(r.line, "oc");
  assert.equal(r.net, "");
  assert.deepEqual(r.fields, { planes: [
    { compania: "FLORIDA BLUE", plan: "myBlue Essentials Bronze (HSA) 27M07-30 (Rewards)", prima: "$36.10" },
    { compania: "OSCAR", plan: "Bronze Simple Breathe Easy with Enhanced COPD Benefits", prima: "$40.94" },
    { compania: "OSCAR", plan: "Bronze Classic 4700", prima: "$66.86" }
  ] });
});

/* palabras como las da el OCR: { x, y, w, h, text, conf } */
function words(rows) {
  const out = [];
  rows.forEach(([x, y, text, h]) => {
    let at = x;
    text.split(" ").forEach((t) => { out.push({ x: at, y, w: t.length * 7, h: h || 10, text: t, conf: 95 }); at += t.length * 7 + 5; });
  });
  return out;
}

test("HealthSherpa: la etiqueta del filtro de prima (sin centavos) no es un plan", () => {
  assert.deepEqual(X.quotePlans(words([
    [259, 313, "Monthly premium"], [424, 329, "$3477"],
    [259, 398, "Deductible"], [420, 414, "$12000"],
    [283, 367, "Ambetter Health"], [283, 397, "AmeriHealth Caritas Next"]
  ])), []);
});

test("HealthSherpa: una tarjeta en español, con la etiqueta mal leída, se lee por la fila del nivel", () => {
  assert.deepEqual(X.quotePlans(words([
    [562, 250, "Signature Silver + Vision + Adult Dental"],
    [562, 270, "HMO • PLATA"],
    [1180, 258, "ambetter"],
    [562, 350, "$120.55", 16], [740, 350, "$4,000", 16],
    [562, 372, "Prma rnensual"], [562, 388, "$600"]
  ])), [{ compania: "AMBETTER", plan: "Signature Silver + Vision + Adult Dental", prima: "$120.55" }]);
});

test("HealthSherpa: con las palabras del OCR, otros documentos se leen igual que sin ellas", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "My Plans and Programs.txt"), "utf8");
  const plain = X.extract(text, "captura.png", "oc");
  const withWords = X.extract(text, "captura.png", "oc", { words: words([[100, 100, "Monthly premium"]]) });
  assert.deepEqual(withWords, plain);
});

/* App Summary de HealthCare.gov con todo el hogar: cada persona trae su
   fecha de nacimiento, parentesco, estatus e ingreso anual; el agente va al
   final con su NPN. */
test("App Summary: cada persona del hogar con su parentesco, estatus e ingreso anual, y el agente", () => {
  const r = X.extract(fixture("OC App Summary Household"), "document.pdf", "oc");
  assert.equal(r.type, "oc_app");
  assert.equal(r.fields.ingreso, "$42,000.00");
  assert.deepEqual(r.fields.personas, [
    { nombre: "ANA TORRES", titular: true, dob: "05/02/1980", estatus: "ciudadano", ingreso: "$42,000.00" },
    { nombre: "LUIS TORRES", dob: "08/21/1978", parentesco: "Cónyuge", estatus: "residente", ingreso: "$22,500.00" },
    { nombre: "SOFIA TORRES", dob: "03/09/2012", parentesco: "Hijo/a", estatus: "ciudadano", ingreso: "$0.00" }
  ]);
  assert.equal(r.fields.agente, "LAURA GOMEZ");
  assert.equal(r.fields.npn, "12345678");
});

test("App Summary: sin «Estimated income next year» legible el ingreso sigue siendo el anual, no el del mes", () => {
  const text = fixture("OC App Summary Household").replace(/Estimated income next year/g, "Estimated incone next yeer");
  const r = X.extract(text, "document.pdf", "oc");
  assert.equal(r.fields.ingreso, "$42,000.00");
  assert.deepEqual(r.fields.personas.map((p) => p.ingreso), ["$42,000.00", "$22,500.00", "$0.00"]);
});

test("App Summary: el parentesco sale también de lo que dice el titular de cada uno", () => {
  const text = fixture("OC App Summary Household").replace("Ana's child\nLuis's child\n", "");
  const r = X.extract(text, "document.pdf", "oc");
  assert.equal(r.fields.personas[2].parentesco, "Hijo/a");
});

test("aplicación de Medicare: el NPN se lee también como «NPN #:» o «Agent NPN»", () => {
  const base = fixture("Diaz Beatriz - Medicare App Summary ES");
  for (const line of ["NPN #: 12345678", "Agent NPN 12345678", "NPN Number: 12345678"]) {
    const r = X.extract(base.replace(/^NPN:.*$/m, line), "document.pdf", "mc");
    assert.equal(r.fields.npn, "12345678", line);
  }
});
