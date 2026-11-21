/* Comprueba el llenado del Consent (Obamacare) y del SOA (Medicare): qué
   plantilla se usa según la oficina y el idioma, qué valor va en cada campo
   del PDF, el texto para Cliq y lo que se envía a firmar. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../js/forms.js");

const base = { fecha: "02/01/2026", nombres: "BEATRIZ", apellidos: "DIAZ", genero: "a", idioma: "es", oficina: "QAgency",
  agente: "ANA TORRES", npn: "10000001", canal: "Call", modalidad: "presencial" };
const make = (extra) => Object.assign({}, base, extra);
const familia = [
  { titular: true, taxes: true, cobertura: true, ingreso: "25000" },
  { nombre: "JUAN CARLOS DIAZ", parentesco: "Cónyuge", taxes: true, cobertura: true, ingreso: "7000" },
  { nombre: "ANA DIAZ", parentesco: "Hijo/a", taxes: true, cobertura: false }
];
const planes = [
  { compania: "AMBETTER", plan: "Silver Value", prima: "$45.00", sel: true },
  { compania: "OSCAR", plan: "Bronze Classic", prima: "$12.00", sel: false }
];

const consent = { clientName: "Beatriz Diaz", date: "02/01/2026", agentName: "Ana Torres", npn: "10000001", marital: "Casada",
  income: "$32,000", taxPeople: "3", coveredPeople: "2", plan: "Ambetter Silver Value", premium: "$45.00" };
const soa = { beneficiaryName: "Beatriz Diaz", beneficiaryPhone: "(305) 555-0100", agentName: "Ana Torres", npn: "10000001",
  contactMethod: "Llamada telefónica", plans: "Humana Gold Plus H1036-311 (HMO)" };
const soaNote = { beneficiaryName: "Beatriz Diaz", beneficiaryPhone: "(305) 555-0100" };
const FIRMAS = ["Signature1_es_:signer:signature", "Firma",
  "Firma del solicitantemiembrorepresentante autorizado", "Firma del Representante de Ventas con Licencia"];

/* ------------------------------------------------------------ plantilla -- */

test("plantilla: el Consent sale de la oficina de Ajustes y del idioma del cliente", () => {
  assert.equal(F.templateKey("consent", "QAgency", "es"), "consent-qa-es");
  assert.equal(F.templateKey("consent", "QAgency", "en"), "consent-qa-en");
  assert.equal(F.templateKey("consent", "ATH Insurance", "es"), "consent-ath-es");
  assert.equal(F.templateKey("consent", "ATH Insurance", "en"), "consent-ath-en");
  /* sin idioma elegido, español */
  assert.equal(F.templateKey("consent", "QAgency", ""), "consent-qa-es");
  assert.equal(F.TEMPLATES["consent-qa-es"].file, "Consentimiento_2027_QA_Spa.pdf");
  assert.equal(F.TEMPLATES["consent-qa-en"].file, "Consent_2027_QA_Eng.pdf");
  assert.equal(F.TEMPLATES["consent-ath-es"].file, "Consentimiento_2027_ATH_Spa.pdf");
  assert.equal(F.TEMPLATES["consent-ath-en"].file, "Consent_2027_ATH_Eng.pdf");
});

test("plantilla: el SOA solo depende del idioma", () => {
  assert.equal(F.templateKey("soa", "QAgency", "es"), "soa-es");
  assert.equal(F.templateKey("soa", "ATH Insurance", "es"), "soa-es");
  assert.equal(F.templateKey("soa", "ATH Insurance", "en"), "soa-en");
  assert.equal(F.TEMPLATES["soa-es"].file, "SOA_Spanish_Agency.pdf");
  assert.equal(F.TEMPLATES["soa-en"].file, "SOA_English_Agency_Fillable.pdf");
  assert.deepEqual(Object.keys(F.TEMPLATES).sort(), ["consent-ath-en", "consent-ath-es", "consent-qa-en", "consent-qa-es", "soa-en", "soa-es"]);
});

test("plantilla: Consent en Obamacare Pendiente y SOA en las situaciones de Medicare que guardan SOA", () => {
  assert.equal(F.formKind({ line: "oc", outcome: "pendiente" }), "consent");
  assert.equal(F.formKind({ line: "oc", outcome: "pendiente", net: { consent: true } }), "", "consent ya recibido");
  assert.equal(F.formKind({ line: "oc", outcome: "pendiente", net: { consent: false } }), "consent");
  assert.equal(F.formKind({ line: "oc", outcome: "pendiente", revisaPlanes: true }), "", "revisará los planes: el consent no se envía");
  assert.equal(F.formKind({ line: "oc", outcome: "enviada" }), "");
  assert.equal(F.formKind({ line: "oc", outcome: "cancelada" }), "");
  assert.equal(F.formKind({ line: "mc", outcome: "enviada" }), "soa");
  assert.equal(F.formKind({ line: "mc", outcome: "sincambio" }), "soa");
  assert.equal(F.formKind({ line: "mc", outcome: "enviada", net: { soa: true } }), "", "SOA ya guardado");
  assert.equal(F.formKind({ line: "mc", outcome: "sincambio", net: { soa: true } }), "", "SOA ya guardado");
  assert.equal(F.formKind({ line: "mc", outcome: "enviada", net: { soa: false } }), "soa");
  assert.equal(F.formKind({ line: "supp", outcome: "enviada" }), "");
  assert.equal(F.formKind({ line: "supp", outcome: "cotizacion" }), "");
});

/* ------------------------------------------------------- campos del PDF -- */

test("campos: Consent QAgency en inglés (PREMIUM en mayúsculas, la fecha de la página 2 también)", () => {
  assert.deepEqual(F.fieldMap("consent-qa-en", consent), {
    "Todays Date": "02/01/2026", "agentsEnes on the date of": "02/01/2026", "Fecha": "02/01/2026",
    "Signature2_es_:signer:signature": "02/01/2026",
    "Ms": "Beatriz Diaz", "Full Name": "Beatriz Diaz", "Agents andor Enes": "Ana Torres", "NPN_2": "10000001",
    "Marital status": "Casada", "Projected Annual Family Income": "$32,000", "Number of people on your 2023 tax return": "3",
    "People with medical coverage": "2", "Health Plan": "Ambetter Silver Value", "PREMIUM": "$45.00"
  });
});

test("campos: Consent ATH en inglés (Premium)", () => {
  const m = F.fieldMap("consent-ath-en", consent);
  assert.equal(m.Premium, "$45.00");
  assert.equal(m.PREMIUM, undefined);
  assert.equal(m["Health Plan"], "Ambetter Silver Value");
  assert.equal(Object.keys(m).length, 14);
});

test("campos: Consent QAgency en español (Premium; Fecha es la de arriba y la de la página 2)", () => {
  assert.deepEqual(F.fieldMap("consent-qa-es", consent), {
    "Fecha": "02/01/2026", "mencionados a connuación en la fecha de": "02/01/2026", "Fecha de la Firma": "02/01/2026",
    "Yo SrSra": "Beatriz Diaz", "Nombre y Apellido": "Beatriz Diaz", "Agentes yo Endades": "Ana Torres", "NPN": "10000001",
    "Estatus marital": "Casada", "Ingreso proyectado anual familiar": "$32,000",
    "Candad de personas en su declaración de impuestos 2023": "3", "Personas con cobertura médica": "2",
    "Plan": "Ambetter Silver Value", "Premium": "$45.00"
  });
});

test("campos: Consent ATH en español (Pago)", () => {
  const m = F.fieldMap("consent-ath-es", consent);
  assert.equal(m.Pago, "$45.00");
  assert.equal(m.Premium, undefined);
  assert.equal(Object.keys(m).length, 13);
});

test("campos: el SOA no se llena: la sección del agente la completa y la firma el agente después del cliente", () => {
  assert.deepEqual(F.fieldMap("soa-es", soa), {});
  assert.deepEqual(F.fieldMap("soa-en", soa), {});
});

test("campos: las firmas quedan vacías (su fecha es la del día) y un valor vacío no se escribe", () => {
  Object.keys(F.TEMPLATES).forEach((key) => {
    const m = F.fieldMap(key, Object.assign({}, consent, soa));
    FIRMAS.forEach((n) => assert.equal(m[n], undefined, key + ": " + n));
  });
  const m = F.fieldMap("consent-qa-es", Object.assign({}, consent, { marital: "", premium: " " }));
  assert.equal("Estatus marital" in m, false);
  assert.equal("Premium" in m, false);
});

/* ------------------------------------------------- valores de la cotización -- */

test("valores del Consent: cliente, fecha de la nota, agente con NPN, hogar, ingreso y el plan seleccionado", () => {
  assert.deepEqual(F.consentValues(make({ line: "oc", outcome: "pendiente", personas: familia, planes: planes })), consent);
});

test("valores del Consent: estado civil según el idioma; casado si hay cónyuge en el hogar", () => {
  const d = make({ line: "oc", outcome: "pendiente", personas: familia, planes: planes });
  assert.equal(F.consentValues(Object.assign({}, d, { genero: "o" })).marital, "Casado");
  assert.equal(F.consentValues(Object.assign({}, d, { idioma: "en" })).marital, "Married");
  assert.equal(F.consentValues(Object.assign({}, d, { personas: [familia[0], familia[2]] })).marital, "Soltera");
});

test("valores del Consent: un caso hecho a mano, sin cónyuge y sin documento, es soltero", () => {
  /* solo el titular, sin App Summary que diga el estado civil */
  const solo = make({ line: "oc", outcome: "pendiente", personas: [{ titular: true, taxes: true, cobertura: true }], planes: planes });
  assert.equal(F.consentValues(Object.assign({}, solo, { genero: "o" })).marital, "Soltero");
  assert.equal(F.consentValues(Object.assign({}, solo, { genero: "a" })).marital, "Soltera");
  assert.equal(F.consentValues(Object.assign({}, solo, { idioma: "en" })).marital, "Single");
  /* sin la lista de personas (nota recién empezada) también */
  assert.equal(F.consentValues(make({ line: "oc", outcome: "pendiente", planes: planes, genero: "o" })).marital, "Soltero");
});

test("valores del Consent: sin cónyuge, el estado civil que leyó el App Summary, en el idioma y género del cliente", () => {
  const d = make({ line: "oc", outcome: "pendiente", personas: [familia[0], familia[2]], planes: planes });
  assert.equal(F.consentValues(Object.assign({}, d, { estadoCivil: "soltero", genero: "a" })).marital, "Soltera");
  assert.equal(F.consentValues(Object.assign({}, d, { estadoCivil: "viudo", genero: "o" })).marital, "Viudo");
  assert.equal(F.consentValues(Object.assign({}, d, { estadoCivil: "divorciado", idioma: "en" })).marital, "Divorced");
  /* un cónyuge en el hogar manda sobre lo leído */
  assert.equal(F.consentValues(Object.assign({}, d, { personas: familia, estadoCivil: "soltero", genero: "o" })).marital, "Casado");
});

test("valores del Consent: sin plan seleccionado se usa el único cotizado; con varios, ninguno", () => {
  const uno = F.consentValues(make({ line: "oc", outcome: "pendiente", planes: [Object.assign({}, planes[1])] }));
  assert.equal(uno.plan, "Oscar Bronze Classic");
  assert.equal(uno.premium, "$12.00");
  const varios = F.consentValues(make({ line: "oc", outcome: "pendiente", planes: planes.map((p) => Object.assign({}, p, { sel: false })) }));
  assert.equal(varios.plan, "");
  assert.equal(varios.premium, "");
  /* el titular solo, sin ingreso */
  const solo = F.consentValues(make({ line: "oc", outcome: "pendiente", agente: "", npn: "" }));
  assert.equal(solo.taxPeople, "1");
  assert.equal(solo.coveredPeople, "1");
  assert.equal(solo.income, "");
  assert.equal(solo.agentName, "");
});

test("valores del SOA: solo el beneficiario y su teléfono, para la línea de Cliq y el SMS", () => {
  const d = make({ line: "mc", outcome: "enviada", clienteTel: "(305) 555-0100", compania: "HUMANA", plan: "Humana Gold Plus H1036-311 (HMO)" });
  assert.deepEqual(F.soaValues(d), soaNote);
});

/* ---------------------------------------------------------------- Cliq -- */

test("Cliq: Enviar CONSENT / SOA, sin el email o el teléfono que falte", () => {
  assert.equal(F.cliqText("consent", "Diaz, Beatriz", "bea@example.com", "(305) 555-0100"),
    "Enviar CONSENT a Diaz, Beatriz al bea@example.com y al (305) 555-0100 pls @Support Agency");
  assert.equal(F.cliqText("consent", "Diaz, Beatriz", "bea@example.com", ""),
    "Enviar CONSENT a Diaz, Beatriz al bea@example.com pls @Support Agency");
  assert.equal(F.cliqText("consent", "Diaz, Beatriz", " ", "(305) 555-0100"),
    "Enviar CONSENT a Diaz, Beatriz al (305) 555-0100 pls @Support Agency");
  assert.equal(F.cliqText("soa", "Diaz, Beatriz", "", ""), "Enviar SOA a Diaz, Beatriz pls @Support Agency");
  assert.equal(F.cliqText("soa", "", "bea@example.com", "(305) 555-0100"),
    "Enviar SOA a Apellido, Nombre al bea@example.com y al (305) 555-0100 pls @Support Agency");
});

/* ------------------------------------------------------- enlace de firma -- */

test("enlace de firma: SMS y email en el idioma del cliente, de usted y firmados por la oficina", () => {
  const url = "https://example.com/t?a=1";
  const es = F.signTexts("consent", make({ oficina: "QAgency" }), url);
  assert.equal(es.sms, "Estimada Beatriz:\nPara continuar con su seguro de salud, firme la carta de consentimiento en este enlace:\n" + url +
    "\nSi tiene dudas, comuníquese con nosotros.\nQAgency Insurance");
  assert.equal(es.email, "Estimada Beatriz:\n\nPara continuar con su seguro de salud, necesitamos que firme la carta de consentimiento. " +
    "Puede revisarla y firmarla en este enlace:\n" + url + "\n\nSi tiene alguna duda, comuníquese con nosotros.\n\nSaludos,\nQAgency Insurance");
  const en = F.signTexts("soa", make({ idioma: "en", oficina: "ATH Insurance", genero: "o", nombres: "JUAN CARLOS" }), url);
  assert.equal(en.sms, "Dear Juan:\nBefore your Medicare appointment, please sign the Scope of Appointment (SOA) form at this link:\n" + url +
    "\nIf you have any questions, contact us.\nATH Insurance");
  assert.equal(en.email, "Dear Juan:\n\nBefore your Medicare appointment, we need you to sign the Scope of Appointment (SOA) form. " +
    "You can review and sign it at this link:\n" + url + "\n\nIf you have any questions, please contact us.\n\nBest regards,\nATH Insurance");
  const soaEs = F.signTexts("soa", make({ genero: "o", nombres: "" }), url);
  assert.equal(soaEs.sms.split("\n")[0], "Estimado cliente:");
  assert.equal(soaEs.sms.split("\n")[1], "Antes de su cita de Medicare, firme el formulario de Alcance de la Cita (SOA) en este enlace:");
});

test("enlace de firma: el SMS lleva el teléfono de la oficina cuando está en Ajustes, en los dos idiomas", () => {
  const url = "https://example.com/t?a=1";
  const es = F.signTexts("consent", make({ oficina: "QAgency", telefono: "(305) 555-0199" }), url);
  assert.equal(es.sms, "Estimada Beatriz:\nPara continuar con su seguro de salud, firme la carta de consentimiento en este enlace:\n" + url +
    "\nSi tiene dudas, comuníquese con nosotros.\nQAgency Insurance\nOficina: (305) 555-0199");
  const en = F.signTexts("soa", make({ idioma: "en", oficina: "ATH Insurance", genero: "o", nombres: "JUAN", telefono: "(305) 555-0199" }), url);
  assert.equal(en.sms, "Dear Juan:\nBefore your Medicare appointment, please sign the Scope of Appointment (SOA) form at this link:\n" + url +
    "\nIf you have any questions, contact us.\nATH Insurance\nOffice: (305) 555-0199");
  /* el email no cambia */
  assert.ok(!es.email.includes("555-0199"));
});

/* ------------------------------------------------------ nombre del archivo -- */

test("archivo: el PDF lleno se llama como el Consent o el SOA del Network", () => {
  assert.equal(F.downloadName(make({ line: "oc", outcome: "pendiente", compania: "AMBETTER" }), "consent"),
    "Diaz, Beatriz - OC_Consent Ambetter 2026 FEB.pdf");
  assert.equal(F.downloadName(make({ line: "mc", outcome: "enviada", compania: "HUMANA", soaFecha: "01/15/2026" }), "soa"),
    "Diaz, Beatriz - Medicare_Humana_SOA 2026 JAN.pdf");
  assert.equal(F.downloadName(make({ line: "mc", outcome: "sincambio", compania: "HUMANA", soaFecha: "01/15/2026" }), "soa"),
    "Diaz, Beatriz - Medicare_SOA 2026 JAN.pdf");
});

test("campos de la pantalla: cada valor tiene su etiqueta", () => {
  assert.deepEqual(F.FIELDS.consent.map((x) => x.k), Object.keys(consent));
  assert.deepEqual(F.FIELDS.soa.map((x) => x.k), Object.keys(soaNote));
});

/* ------------------------------------------------ PDF lleno (con PDF.js) -- */

const fs = require("node:fs");
const path = require("node:path");

function pdfjs() {
  const lib = require("../vendor/pdfjs/pdf.min.js");
  lib.GlobalWorkerOptions.workerSrc = path.join(__dirname, "../vendor/pdfjs/pdf.worker.min.js");
  return lib;
}
function template(key) {
  const src = fs.readFileSync(path.join(__dirname, "../vendor/forms/" + key + ".js"), "utf8");
  return new Uint8Array(Buffer.from(src.match(/"([A-Za-z0-9+/=]{1000,})"/)[1], "base64"));
}
async function fieldObjects(lib, bytes) {
  const pdf = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const objs = await pdf.getFieldObjects();
  pdf.destroy();
  return objs;
}
/* El objeto al que apunta la última tabla de referencias del archivo (la que leen los visores). */
function latestObject(s, num) {
  const start = +s.slice(s.lastIndexOf("startxref") + 9).trim().split(/\s/)[0];
  const head = s.slice(start, s.indexOf("stream", start));
  assert.match(head, /\/Type\s*\/XRef/);
  const w = head.match(/\/W\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s*\]/).slice(1).map(Number);
  const index = head.match(/\/Index\s*\[([^\]]*)\]/)[1].trim().split(/\s+/).map(Number);
  let pos = s.indexOf("stream", start) + 6;
  pos += s[pos] === "\r" ? 2 : 1;
  const num2 = (n) => { let v = 0; for (let k = 0; k < n; k++) { v = v * 256 + s.charCodeAt(pos++); } return v; };
  for (let i = 0; i < index.length; i += 2) {
    for (let n = index[i]; n < index[i] + index[i + 1]; n++) {
      const type = num2(w[0]), off = num2(w[1]); num2(w[2]);
      if (n === num && type === 1) { return s.slice(off, s.indexOf("endobj", off)); }
    }
  }
  return null;
}

test("PDF lleno: la Fecha del Consent (un campo con dos lugares) queda también en el campo, que es lo que Chrome dibuja", async () => {
  const lib = pdfjs(), bytes = template("consent-qa-es");
  const parent = (await fieldObjects(lib, bytes)).Fecha.find((o) => o.kidIds);
  const map = F.fieldMap("consent-qa-es", Object.assign({}, consent, { clientName: "José Pérez Núñez", date: "11/15/2026" }));
  const out = await F.fillPdf(lib, bytes.slice(), map);
  const obj = latestObject(Buffer.from(out).toString("latin1"), parseInt(parent.id, 10));
  assert.match(obj, /\/T\s*\(Fecha\)/);
  assert.match(obj, /\/V\s*\(11\/15\/2026\)/);
  const objs = await fieldObjects(lib, new Uint8Array(out));
  assert.deepEqual(objs.Fecha.filter((o) => o.type).map((o) => o.value), ["11/15/2026", "11/15/2026"]);
  assert.equal(objs["Yo SrSra"][0].value, "José Pérez Núñez");
});

test("PDF del SOA: se descarga la plantilla tal cual, con las 5 casillas marcadas y nada más", async () => {
  const lib = pdfjs();
  for (const key of ["soa-es", "soa-en"]) {
    const bytes = template(key);
    const out = await F.fillPdf(lib, bytes.slice(), F.fieldMap(key, Object.assign({}, soa, soaNote)));
    assert.deepEqual(Buffer.from(out), Buffer.from(bytes), key);
  }
});

test("PDF lleno: sin campos con varios lugares, el PDF sale como lo guarda PDF.js, con los valores", async () => {
  const lib = pdfjs(), bytes = template("consent-qa-en");
  const out = await F.fillPdf(lib, bytes.slice(), F.fieldMap("consent-qa-en", consent));
  const count = (b) => Buffer.from(b).toString("latin1").split("startxref").length - 1;
  assert.equal(count(out), count(bytes) + 1);
  const objs = await fieldObjects(lib, new Uint8Array(out));
  assert.equal(objs["Full Name"][0].value, consent.clientName);
  assert.equal(objs["Health Plan"][0].value, consent.plan);
});

test("SOA: la dirección de Medicare no va al formulario", () => {
  const d = Object.assign({}, base, { line: "mc", direccion: "1200 Sample Blvd, Naples, FL 34100" });
  assert.doesNotMatch(JSON.stringify(F.soaValues(d)), /Sample Blvd/);
});

/* Envío a firmar por DocuSeal (a través del ayudante local): el cuerpo que
   la herramienta le pasa al ayudante. Los datos van en JSON, nunca en un enlace. */
const pairs = (map) => Object.keys(map).map((name) => ({ name: name, value: map[name] }));

test("envío: el Consent va con el número de la plantilla, el cliente y cada campo del PDF ya lleno, y adónde va en el Network", () => {
  const d = make({ line: "oc", clienteEmail: " bea@example.com " });
  const v = Object.assign({}, consent, { marital: "" });
  const r = F.buildSendPayload("consent", d, v, { templateId: " 12 ", requester: "Luis Gomez" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {
    templateId: "12",
    recipient: { name: "Beatriz Diaz", email: "bea@example.com" },
    fields: pairs(F.fieldMap("consent-qa-es", v)),
    requester: "Luis Gomez",
    meta: { kind: "consent", line: "oc", netKey: "consent", fileName: F.downloadName(d, "consent") }
  });
  const byName = Object.fromEntries(r.body.fields.map((f) => [f.name, f.value]));
  assert.equal(byName["Yo SrSra"], "Beatriz Diaz");
  assert.equal(byName["Fecha de la Firma"], "02/01/2026");
  assert.equal(byName["Premium"], "$45.00");
  assert.equal("Estatus marital" in byName, false, "lo vacío no se envía");
  assert.equal(r.body.agent, undefined, "el Consent solo lo firma el cliente");
});

test("envío: el Consent usa los campos de la plantilla de la oficina y el idioma del cliente", () => {
  const d = make({ line: "oc", idioma: "en", oficina: "ATH Insurance", clienteEmail: "bea@example.com" });
  const r = F.buildSendPayload("consent", d, consent, { templateId: "3" });
  assert.deepEqual(r.body.fields, pairs(F.fieldMap("consent-ath-en", consent)));
  assert.equal(r.body.fields.some((f) => f.name === "Full Name"), true);
  assert.equal(r.body.requester, "ATH Insurance");
});

test("envío: el SOA va sin campos del cliente, y lleva los del agente para llenarlos cuando el cliente firme", () => {
  const d = make({ line: "mc", idioma: "en", clienteEmail: "bea@example.com", clienteTel: "1 (305) 555-0100",
    direccion: "123 Main St, Miami, FL 33101", compania: "HUMANA" });
  const r = F.buildSendPayload("soa", d, soaNote, { templateId: "6", requester: "Luis Gomez", agentTel: "(305) 555-0199" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.body.fields, []);
  assert.deepEqual(r.body.recipient, { name: "Beatriz Diaz", email: "bea@example.com" });
  assert.deepEqual(r.body.meta, { kind: "soa", line: "mc", netKey: "soa", fileName: F.downloadName(d, "soa") });
  assert.deepEqual(r.body.agent, {
    name: "Ana Torres",
    dateField: "Date Appointment will be Completed",
    fields: [
      { name: "Licensed Sales Representative Name", value: "Ana Torres" },
      { name: "Licensed Sales Representative ID", value: "10000001" },
      { name: "Licensed Sales Representative Phone Area", value: "305" },
      { name: "Licensed Sales Representative Phone Prefix", value: "555" },
      { name: "Licensed Sales Representative Phone Line", value: "0199" },
      { name: "Beneficiary Name", value: "Beatriz Diaz" },
      { name: "Beneficiary Phone Area", value: "305" },
      { name: "Beneficiary Phone Prefix", value: "555" },
      { name: "Beneficiary Phone Line", value: "0100" },
      { name: "Beneficiary Address", value: "123 Main St, Miami, FL 33101" },
      { name: "Initial Method of Contact", value: "Book of Business" },
      { name: "Plans the Licensed Sales Representative Will Represent", value: "Humana" }
    ]
  });
});

test("envío: en el SOA en español lo que no tiene dato no se envía (el agente lo llena), y un teléfono sin 10 dígitos tampoco", () => {
  const d = make({ line: "mc", clienteEmail: "bea@example.com", clienteTel: "555-0100" });
  const r = F.buildSendPayload("soa", d, soaNote, { templateId: "5" });
  assert.deepEqual(r.body.agent, {
    name: "Ana Torres",
    dateField: "Fecha de la cita",
    fields: [
      { name: "Nombre del Representante de Ventas con Licencia nombre y apellidos", value: "Ana Torres" },
      { name: "ID del Representante de Ventas con Licencia", value: "10000001" },
      { name: "Nombre del beneficiario nombre y apellidos", value: "Beatriz Diaz" },
      { name: "Método de contacto inicial", value: "Book of Business" }
    ]
  });
  const tel = F.buildSendPayload("soa", make({ line: "mc", clienteEmail: "bea@example.com", clienteTel: "3055550100" }), soaNote,
    { templateId: "5", agentTel: "305 555 0199" }).body.agent.fields.map((f) => f.name + "=" + f.value);
  assert.deepEqual(tel.filter((x) => /^Teléfono/.test(x)), ["Teléfono del Representante (área)=305", "Teléfono del Representante (prefijo)=555",
    "Teléfono del Representante (número)=0199", "Teléfono del beneficiario (área)=305", "Teléfono del beneficiario (prefijo)=555",
    "Teléfono del beneficiario (número)=0100"]);
});

test("envío: sin plantilla (un número), sin un email válido, sin nombre o, en el SOA, sin agente del NPN no hay envío", () => {
  const ok = make({ line: "oc", clienteEmail: "bea@example.com" });
  assert.deepEqual(F.buildSendPayload("consent", ok, consent, { templateId: "" }), { ok: false, missing: ["plantilla"] });
  assert.deepEqual(F.buildSendPayload("consent", ok, consent, { templateId: "tpl-123" }), { ok: false, missing: ["plantilla"] });
  assert.deepEqual(F.buildSendPayload("consent", ok, consent, { templateId: "1234567890123" }), { ok: false, missing: ["plantilla"] });
  assert.deepEqual(F.buildSendPayload("consent", make({ clienteEmail: "bea@" }), consent, { templateId: "4" }), { ok: false, missing: ["email"] });
  assert.deepEqual(F.buildSendPayload("soa", make({ agente: "" }), { beneficiaryName: " " }, {}),
    { ok: false, missing: ["plantilla", "email", "nombre", "agente"] });
  assert.equal(F.buildSendPayload("consent", make({ agente: "", clienteEmail: "bea@example.com" }), consent, { templateId: "4" }).ok, true,
    "el Consent no necesita agente para enviarse");
});

test("enviados a firmar: qué dice cada estado y en qué grupo del tablero va", () => {
  assert.deepEqual(F.signedStatus("completed"), { label: "Firmado", done: true, final: true, group: "signed" });
  assert.deepEqual(F.signedStatus("Completed"), F.signedStatus("completed"));
  assert.deepEqual(F.signedStatus("declined"), { label: "El cliente no lo firmó", done: false, final: true, group: "unsigned" });
  assert.deepEqual(F.signedStatus("expired"), { label: "Venció sin firmar", done: false, final: true, group: "unsigned" });
  assert.deepEqual(F.signedStatus("viewed"), { label: "El cliente lo abrió, falta firmar", done: false, final: false, group: "pending" });
  assert.deepEqual(F.signedStatus("agent"), { label: "Firmó el cliente: falta que firme el agente", done: false, final: false, group: "pending" });
  ["sent", "pending", "created", "unknown", "", undefined].forEach((s) =>
    assert.deepEqual(F.signedStatus(s), { label: "Esperando la firma", done: false, final: false, group: "pending" }));
});

test("tablero Firmas: qué se puede hacer con cada documento; un firmado nunca se borra", () => {
  assert.deepEqual(F.signActions({ status: "sent" }), ["cancel"]);
  assert.deepEqual(F.signActions({ status: "sent", link: "https://firmas.example.com/s/abc" }), ["link", "cancel"]);
  assert.deepEqual(F.signActions({ status: "viewed", link: "https://firmas.example.com/s/abc" }), ["link", "cancel"]);
  assert.deepEqual(F.signActions({ status: "agent" }), ["agent", "cancel"]);
  assert.deepEqual(F.signActions({ status: "completed", saved: false }), ["save", "download"]);
  assert.deepEqual(F.signActions({ status: "completed", saved: true }), ["download"]);
  ["expired", "declined"].forEach((s) => assert.deepEqual(F.signActions({ status: s }), ["delete"]));
  assert.deepEqual(F.signActions({ status: "sent", link: "javascript:alert(1)" }), ["cancel"], "lo que no es un enlace no se copia");
});

test("código de firma: el de la oficina elegida; si no tiene, el de la otra; sin uno válido, nada", () => {
  const qa = "Qa_" + "a1B2-c3".repeat(6), ath = "ATH-" + "z9_Y8".repeat(8);
  const offices = ["QAgency", "ATH Insurance"];
  assert.equal(F.officeCode({ QAgency: qa, "ATH Insurance": ath }, "ATH Insurance", offices), ath);
  assert.equal(F.officeCode({ QAgency: qa, "ATH Insurance": ath }, "QAgency", offices), qa);
  assert.equal(F.officeCode({ QAgency: qa }, "ATH Insurance", offices), qa);
  assert.equal(F.officeCode({ QAgency: " " + qa + " " }, "QAgency", offices), qa);
  assert.equal(F.officeCode({ QAgency: "corto", "ATH Insurance": "" }, "QAgency", offices), "");
  assert.equal(F.officeCode({ Otra: qa }, "Otra", offices), "", "solo las oficinas de la herramienta");
  assert.equal(F.officeCode(null, "QAgency", offices), "");
});

test("enlace de firma: solo http(s), sin espacios ni comillas; lo demás no es un enlace", () => {
  assert.equal(F.signLink("https://firmas.example.com/s/abc123"), "https://firmas.example.com/s/abc123");
  assert.equal(F.signLink("http://127.0.0.1:3000/s/abc"), "http://127.0.0.1:3000/s/abc");
  ["javascript:alert(1)", "https://x.com/s/a b", "https://x.com/\"onclick", "ftp://x.com/s/a", "", null, undefined, 5].forEach((u) =>
    assert.equal(F.signLink(u), "", String(u)));
});

test("tablero Firmas: cuenta por grupo, filtra y deja el orden del ayudante", () => {
  const docs = [{ id: "a", status: "sent" }, { id: "b", status: "completed", saved: false }, { id: "c", status: "expired" },
    { id: "d", status: "completed", saved: true }, { id: "e", status: "viewed" }];
  const all = F.signDashboard(docs, "all");
  assert.deepEqual(all.counts, { pending: 2, signed: 2, unsigned: 1, all: 5, toSave: 1 });
  assert.deepEqual(all.rows.map((x) => x.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(F.signDashboard(docs, "pending").rows.map((x) => x.id), ["a", "e"]);
  assert.deepEqual(F.signDashboard(docs, "signed").rows.map((x) => x.id), ["b", "d"]);
  assert.deepEqual(F.signDashboard(docs, "unsigned").rows.map((x) => x.id), ["c"]);
  assert.deepEqual(F.signDashboard(docs, "otro").rows.map((x) => x.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(F.signDashboard([], "all"), { counts: { pending: 0, signed: 0, unsigned: 0, all: 0, toSave: 0 }, rows: [] });
});

test("tablero Firmas: «Ver más» sube de a 25 y nunca pasa el tope del ayudante (1000)", () => {
  assert.equal(F.SIGN_HISTORY_MAX, 1000);
  assert.equal(F.nextHistoryLimit(25), 50);
  assert.equal(F.nextHistoryLimit(975), 1000);
  assert.equal(F.nextHistoryLimit(990), 1000);
  assert.equal(F.nextHistoryLimit(1000), 1000);
});

test("tablero Firmas: fechas del servidor como MM/DD/AAAA", () => {
  assert.equal(F.signDate("2026-11-20T12:00:00Z"), "11/20/2026");
  assert.equal(F.signDate("2026-03-05T12:00:00.0000000Z"), "03/05/2026");
  ["", null, undefined, "ayer"].forEach((v) => assert.equal(F.signDate(v), ""));
});

test("vista previa: una imagen por página, al ancho pedido y con los campos llenos dibujados", async () => {
  const made = [];
  const rendered = [];
  global.document = { createElement: (tag) => { const c = { tag, style: {}, getContext: () => ({ id: made.length }) }; made.push(c); return c; } };
  let destroyed = false;
  const pdfjs = {
    AnnotationMode: { ENABLE: 1, ENABLE_FORMS: 2 },
    getDocument: ({ data }) => ({ promise: Promise.resolve({
      numPages: 2,
      getPage: (n) => Promise.resolve({
        getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
        render: (args) => { rendered.push({ n, mode: args.annotationMode, w: args.viewport.width }); return { promise: Promise.resolve() }; }
      }),
      destroy: () => { destroyed = true; }
    }), data })
  };
  try {
    const pages = await F.renderPreview(pdfjs, new Uint8Array([37, 80, 68, 70]), 306, 2);
    assert.equal(pages.length, 2);
    /* nítida en pantallas de alta densidad: el doble de píxeles, mismo tamaño en pantalla */
    assert.deepEqual(pages.map((c) => [c.tag, c.width, c.height, c.style.aspectRatio]), [["canvas", 612, 792, "612 / 792"], ["canvas", 612, 792, "612 / 792"]]);
    /* los campos se dibujan como saldrán impresos (no como cajas para escribir) */
    assert.deepEqual(rendered.map((r) => [r.n, r.mode]), [[1, 1], [2, 1]]);
    assert.ok(destroyed, "el documento se suelta al terminar");
  } finally { delete global.document; }
});
