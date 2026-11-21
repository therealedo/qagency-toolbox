/* Comprueba el llenado del Consent (Obamacare) y del SOA (Medicare): qué
   plantilla se usa según la oficina y el idioma, qué valor va en cada campo
   del PDF, el texto para Cliq y el enlace de firma de SignWell. */
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

test("valores del Consent: estado civil según el idioma y solo si hay cónyuge en el hogar", () => {
  const d = make({ line: "oc", outcome: "pendiente", personas: familia, planes: planes });
  assert.equal(F.consentValues(Object.assign({}, d, { genero: "o" })).marital, "Casado");
  assert.equal(F.consentValues(Object.assign({}, d, { idioma: "en" })).marital, "Married");
  assert.equal(F.consentValues(Object.assign({}, d, { personas: [familia[0], familia[2]] })).marital, "");
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
    "Enviar CONSENT a Diaz, Beatriz al bea@example.com y al (305) 555-0100 pls @Support QAgency");
  assert.equal(F.cliqText("consent", "Diaz, Beatriz", "bea@example.com", ""),
    "Enviar CONSENT a Diaz, Beatriz al bea@example.com pls @Support QAgency");
  assert.equal(F.cliqText("consent", "Diaz, Beatriz", " ", "(305) 555-0100"),
    "Enviar CONSENT a Diaz, Beatriz al (305) 555-0100 pls @Support QAgency");
  assert.equal(F.cliqText("soa", "Diaz, Beatriz", "", ""), "Enviar SOA a Diaz, Beatriz pls @Support QAgency");
  assert.equal(F.cliqText("soa", "", "bea@example.com", "(305) 555-0100"),
    "Enviar SOA a Apellido, Nombre al bea@example.com y al (305) 555-0100 pls @Support QAgency");
});

/* ------------------------------------------------------- enlace de firma -- */

test("enlace de firma: los IDs de SignWell en orden, codificados y sin los vacíos", () => {
  const url = F.signingUrl("https://www.signwell.com/new_doc/abc123/", "consent", Object.assign({}, consent, { clientName: "José Pérez", marital: "" }));
  assert.equal(url, "https://www.signwell.com/new_doc/abc123/?client_name=Jos%C3%A9%20P%C3%A9rez&client_name_sign=Jos%C3%A9%20P%C3%A9rez" +
    "&consent_date=02%2F01%2F2026&agent_name=Ana%20Torres&agent_npn=10000001&plan=Ambetter%20Silver%20Value&premium=%2445.00" +
    "&income=%2432%2C000&tax_people=3&covered_people=2");
});

test("enlace de firma: el SOA solo lo firma el cliente, así que su enlace no lleva datos", () => {
  assert.equal(F.signingUrl("https://www.signwell.com/new_doc/abc123/", "soa", soa), "https://www.signwell.com/new_doc/abc123/");
  assert.equal(F.signingUrl("https://example.com/t?ref=1#x", "soa", soa), "https://example.com/t?ref=1#x");
});

test("enlace de firma: con ? ya en el enlace se agrega con &; sin un enlace válido no hay enlace", () => {
  const v = { date: "02/01/2026" };
  assert.equal(F.signingUrl("https://example.com/t?ref=1", "consent", v), "https://example.com/t?ref=1&consent_date=02%2F01%2F2026");
  assert.equal(F.signingUrl("https://example.com/t?", "consent", v), "https://example.com/t?consent_date=02%2F01%2F2026");
  assert.equal(F.signingUrl("https://example.com/t#x", "consent", v), "https://example.com/t?consent_date=02%2F01%2F2026#x");
  assert.equal(F.signingUrl("  https://example.com/t  ", "consent", {}), "https://example.com/t");
  assert.equal(F.signingUrl("", "consent", v), "");
  assert.equal(F.signingUrl("www.signwell.com/x", "consent", v), "");
  assert.equal(F.signingUrl("javascript:alert(1)", "consent", v), "");
});

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

/* ------------------------------------------------------ nombre del archivo -- */

test("archivo: el PDF lleno se llama como el Consent o el SOA del Network", () => {
  assert.equal(F.downloadName(make({ line: "oc", outcome: "pendiente", compania: "AMBETTER" }), "consent"),
    "Diaz, Beatriz - OC_Consent Ambetter 2026 FEB.pdf");
  assert.equal(F.downloadName(make({ line: "mc", outcome: "enviada", compania: "HUMANA", soaFecha: "01/15/2026" }), "soa"),
    "Diaz, Beatriz - Medicare_Humana_SOA 2026 JAN.pdf");
  assert.equal(F.downloadName(make({ line: "mc", outcome: "sincambio", compania: "HUMANA", soaFecha: "01/15/2026" }), "soa"),
    "Diaz, Beatriz - Medicare_SOA 2026 JAN.pdf");
});

test("campos de la pantalla: cada valor tiene su etiqueta; el Consent, su ID de SignWell", () => {
  assert.deepEqual(F.FIELDS.consent.map((x) => x.k), Object.keys(consent));
  assert.deepEqual(F.FIELDS.soa.map((x) => x.k), Object.keys(soaNote));
  assert.deepEqual(F.SIGN_IDS.consent.map((x) => x[0]), ["client_name", "client_name_sign", "consent_date", "agent_name", "agent_npn",
    "plan", "premium", "marital_status", "income", "tax_people", "covered_people"]);
  assert.deepEqual(F.SIGN_IDS.soa, []);
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

/* Envío por la API de SignWell (a través del ayudante local): el cuerpo que
   la herramienta le pasa al ayudante. Los datos van en JSON, nunca en un enlace. */
test("envío por la API: el Consent lleva la plantilla, el cliente, los campos con su ID de SignWell, el idioma y adónde va en el Network", () => {
  const d = make({ line: "oc", clienteEmail: " bea@example.com " });
  const v = Object.assign({}, consent, { marital: "" });
  const r = F.buildSendPayload("consent", d, v, { templateId: "tpl-123", requester: "Ana Torres" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {
    templateId: "tpl-123",
    placeholder: "Cliente",
    recipient: { name: "Beatriz Diaz", email: "bea@example.com" },
    fields: [
      { api_id: "client_name", value: "Beatriz Diaz" }, { api_id: "client_name_sign", value: "Beatriz Diaz" },
      { api_id: "consent_date", value: "02/01/2026" }, { api_id: "agent_name", value: "Ana Torres" },
      { api_id: "agent_npn", value: "10000001" }, { api_id: "plan", value: "Ambetter Silver Value" },
      { api_id: "premium", value: "$45.00" }, { api_id: "income", value: "$32,000" },
      { api_id: "tax_people", value: "3" }, { api_id: "covered_people", value: "2" }
    ],
    language: "es",
    requester: "Ana Torres",
    meta: { kind: "consent", line: "oc", netKey: "consent", fileName: F.downloadName(d, "consent") }
  });
});

test("envío por la API: el SOA va sin campos, a nombre del beneficiario, en inglés si el cliente habla inglés", () => {
  const d = make({ line: "mc", idioma: "en", clienteEmail: "bea@example.com" });
  const r = F.buildSendPayload("soa", d, soaNote, { templateId: "soa-en", requester: "" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.body.fields, []);
  assert.deepEqual(r.body.recipient, { name: "Beatriz Diaz", email: "bea@example.com" });
  assert.equal(r.body.language, "en");
  assert.equal(r.body.requester, "QAgency Insurance");
  assert.deepEqual(r.body.meta, { kind: "soa", line: "mc", netKey: "soa", fileName: F.downloadName(d, "soa") });
});

test("envío por la API: sin plantilla, sin un email válido o sin nombre no hay envío, y se dice qué falta", () => {
  const ok = make({ line: "oc", clienteEmail: "bea@example.com" });
  assert.deepEqual(F.buildSendPayload("consent", ok, consent, { templateId: "" }), { ok: false, missing: ["plantilla"] });
  assert.deepEqual(F.buildSendPayload("consent", ok, consent, { templateId: "a b" }), { ok: false, missing: ["plantilla"] });
  assert.deepEqual(F.buildSendPayload("consent", make({ clienteEmail: "bea@" }), consent, { templateId: "t1" }), { ok: false, missing: ["email"] });
  assert.deepEqual(F.buildSendPayload("soa", make({}), { beneficiaryName: " " }, {}), { ok: false, missing: ["plantilla", "email", "nombre"] });
});

test("enviados a firmar: qué dice cada estado de SignWell y en qué grupo del tablero va", () => {
  assert.deepEqual(F.signedStatus("completed"), { label: "Firmado", done: true, final: true, group: "signed" });
  assert.deepEqual(F.signedStatus("Completed"), F.signedStatus("completed"));
  assert.deepEqual(F.signedStatus("declined"), { label: "El cliente no lo firmó", done: false, final: true, group: "unsigned" });
  assert.deepEqual(F.signedStatus("expired"), { label: "Venció sin firmar", done: false, final: true, group: "unsigned" });
  assert.deepEqual(F.signedStatus("canceled"), { label: "Cancelado en SignWell", done: false, final: true, group: "unsigned" });
  assert.deepEqual(F.signedStatus("missing"), { label: "Ya no está en SignWell", done: false, final: true, group: "unsigned" });
  assert.deepEqual(F.signedStatus("viewed"), { label: "El cliente lo abrió, falta firmar", done: false, final: false, group: "pending" });
  ["sent", "pending", "created", "unknown", "", undefined].forEach((s) =>
    assert.deepEqual(F.signedStatus(s), { label: "Esperando la firma", done: false, final: false, group: "pending" }));
});

test("tablero Firmas: qué se puede hacer con cada documento; un firmado nunca se borra", () => {
  assert.deepEqual(F.signActions({ status: "sent" }), ["cancel"]);
  assert.deepEqual(F.signActions({ status: "viewed" }), ["cancel"]);
  assert.deepEqual(F.signActions({ status: "completed", saved: false }), ["save", "download"]);
  assert.deepEqual(F.signActions({ status: "completed", saved: true }), ["download"]);
  ["expired", "canceled", "declined", "missing"].forEach((s) => assert.deepEqual(F.signActions({ status: s }), ["delete"]));
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

test("tablero Firmas: fechas de SignWell como MM/DD/AAAA", () => {
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
