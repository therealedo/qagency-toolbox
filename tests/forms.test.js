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
const FIRMAS = ["Signature1_es_:signer:signature", "Signature2_es_:signer:signature", "Firma", "Fecha de la Firma",
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
  assert.equal(F.formKind({ line: "oc", outcome: "enviada" }), "");
  assert.equal(F.formKind({ line: "oc", outcome: "cancelada" }), "");
  assert.equal(F.formKind({ line: "mc", outcome: "enviada" }), "soa");
  assert.equal(F.formKind({ line: "mc", outcome: "sincambio" }), "soa");
  assert.equal(F.formKind({ line: "supp", outcome: "enviada" }), "");
  assert.equal(F.formKind({ line: "supp", outcome: "cotizacion" }), "");
});

/* ------------------------------------------------------- campos del PDF -- */

test("campos: Consent QAgency en inglés (PREMIUM en mayúsculas, la fecha de la página 2 también)", () => {
  assert.deepEqual(F.fieldMap("consent-qa-en", consent), {
    "Todays Date": "02/01/2026", "agentsEnes on the date of": "02/01/2026", "Fecha": "02/01/2026",
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
  assert.equal(Object.keys(m).length, 13);
});

test("campos: Consent QAgency en español (Premium; Fecha es la de arriba y la de la página 2)", () => {
  assert.deepEqual(F.fieldMap("consent-qa-es", consent), {
    "Fecha": "02/01/2026", "mencionados a connuación en la fecha de": "02/01/2026",
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
  assert.equal(Object.keys(m).length, 12);
});

test("campos: SOA en español, sin tocar las 5 casillas ni los datos del representante autorizado", () => {
  assert.deepEqual(F.fieldMap("soa-es", soa), {
    "Nombre del beneficiario nombre y apellidos": "Beatriz Diaz",
    "Teléfono del beneficiario": "(305) 555-0100",
    "Nombre del Representante de Ventas con Licencia nombre y apellidos": "Ana Torres",
    "ID del Representante de Ventas con Licencia": "10000001",
    "Método de contacto inicial": "Llamada telefónica",
    "Planes que el Representante de Ventas con Licencia explicará durante la reunión": "Humana Gold Plus H1036-311 (HMO)"
  });
});

test("campos: SOA en inglés, con el teléfono repartido en sus casillas", () => {
  assert.deepEqual(F.fieldMap("soa-en", soa), {
    "Beneficiary Name": "Beatriz Diaz",
    "Beneficiary Phone Area": "305", "Beneficiary Phone Prefix": "555", "Beneficiary Phone Line": "0100",
    "Licensed Sales Representative Name": "Ana Torres",
    "Licensed Sales Representative ID": "10000001",
    "Initial Method of Contact": "Llamada telefónica",
    "Plans the Licensed Sales Representative Will Represent": "Humana Gold Plus H1036-311 (HMO)"
  });
  const m = F.fieldMap("soa-en", Object.assign({}, soa, { beneficiaryPhone: "+1 305.555.0199" }));
  assert.deepEqual([m["Beneficiary Phone Area"], m["Beneficiary Phone Prefix"], m["Beneficiary Phone Line"]], ["305", "555", "0199"]);
});

test("campos: las firmas quedan vacías y un valor vacío no se escribe", () => {
  Object.keys(F.TEMPLATES).forEach((key) => {
    const m = F.fieldMap(key, Object.assign({}, consent, soa));
    FIRMAS.forEach((n) => assert.equal(m[n], undefined, key + ": " + n));
  });
  const m = F.fieldMap("consent-qa-es", Object.assign({}, consent, { marital: "", premium: " " }));
  assert.equal("Estatus marital" in m, false);
  assert.equal("Premium" in m, false);
  assert.equal(F.fieldMap("soa-en", Object.assign({}, soa, { beneficiaryPhone: "" }))["Beneficiary Phone Area"], undefined);
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

test("valores del SOA: beneficiario, teléfono, agente, método de contacto según el canal y planes", () => {
  const d = make({ line: "mc", outcome: "enviada", clienteTel: "(305) 555-0100", compania: "HUMANA", plan: "Humana Gold Plus H1036-311 (HMO)" });
  assert.deepEqual(F.soaValues(d), soa);
  assert.equal(F.soaValues(Object.assign({}, d, { idioma: "en" })).contactMethod, "Phone call");
  assert.equal(F.soaValues(Object.assign({}, d, { canal: "Walk In" })).contactMethod, "En la oficina");
  assert.equal(F.soaValues(Object.assign({}, d, { canal: "Walk In", idioma: "en" })).contactMethod, "Walk-in");
  assert.equal(F.soaValues(Object.assign({}, d, { canal: "Appointment", modalidad: "Zoom" })).contactMethod, "Cita por Zoom");
  assert.equal(F.soaValues(Object.assign({}, d, { canal: "Appointment", modalidad: "en casa", idioma: "en" })).contactMethod, "Home visit");
  /* la compañía va delante si el nombre del plan no la trae */
  assert.equal(F.soaValues(Object.assign({}, d, { compania: "AETNA", plan: "Medicare Eagle (PPO)" })).plans, "Aetna Medicare Eagle (PPO)");
  assert.equal(F.soaValues(Object.assign({}, d, { compania: "", plan: "" })).plans, "Medicare Advantage (Parte C)");
  assert.equal(F.soaValues(Object.assign({}, d, { compania: "", plan: "", idioma: "en" })).plans, "Medicare Advantage (Part C)");
});

/* ---------------------------------------------------------------- Cliq -- */

test("Cliq: Enviar CONSENT / SOA, sin el email o el teléfono que falte", () => {
  assert.equal(F.cliqText("consent", "Beatriz Diaz", "bea@example.com", "(305) 555-0100"),
    "Enviar CONSENT a Beatriz Diaz al bea@example.com y al (305) 555-0100 pls @Support QAgency");
  assert.equal(F.cliqText("consent", "Beatriz Diaz", "bea@example.com", ""),
    "Enviar CONSENT a Beatriz Diaz al bea@example.com pls @Support QAgency");
  assert.equal(F.cliqText("consent", "Beatriz Diaz", " ", "(305) 555-0100"),
    "Enviar CONSENT a Beatriz Diaz al (305) 555-0100 pls @Support QAgency");
  assert.equal(F.cliqText("soa", "Beatriz Diaz", "", ""), "Enviar SOA a Beatriz Diaz pls @Support QAgency");
  assert.equal(F.cliqText("soa", "", "bea@example.com", "(305) 555-0100"),
    "Enviar SOA a Nombre Apellido al bea@example.com y al (305) 555-0100 pls @Support QAgency");
});

/* ------------------------------------------------------- enlace de firma -- */

test("enlace de firma: los IDs de SignWell en orden, codificados y sin los vacíos", () => {
  const url = F.signingUrl("https://www.signwell.com/new_doc/abc123/", "consent", Object.assign({}, consent, { clientName: "José Pérez", marital: "" }));
  assert.equal(url, "https://www.signwell.com/new_doc/abc123/?client_name=Jos%C3%A9%20P%C3%A9rez&client_name_sign=Jos%C3%A9%20P%C3%A9rez" +
    "&consent_date=02%2F01%2F2026&agent_name=Ana%20Torres&agent_npn=10000001&plan=Ambetter%20Silver%20Value&premium=%2445.00" +
    "&income=%2432%2C000&tax_people=3&covered_people=2");
  assert.equal(F.signingUrl("https://www.signwell.com/new_doc/abc123/", "soa", soa),
    "https://www.signwell.com/new_doc/abc123/?beneficiary_name=Beatriz%20Diaz&beneficiary_phone=(305)%20555-0100" +
    "&agent_name=Ana%20Torres&agent_npn=10000001&contact_method=Llamada%20telef%C3%B3nica&plans=Humana%20Gold%20Plus%20H1036-311%20(HMO)");
});

test("enlace de firma: con ? ya en el enlace se agrega con &; sin un enlace válido no hay enlace", () => {
  const v = { beneficiaryName: "Ana Ruiz" };
  assert.equal(F.signingUrl("https://example.com/t?ref=1", "soa", v), "https://example.com/t?ref=1&beneficiary_name=Ana%20Ruiz");
  assert.equal(F.signingUrl("https://example.com/t?", "soa", v), "https://example.com/t?beneficiary_name=Ana%20Ruiz");
  assert.equal(F.signingUrl("https://example.com/t#x", "soa", v), "https://example.com/t?beneficiary_name=Ana%20Ruiz#x");
  assert.equal(F.signingUrl("  https://example.com/t  ", "soa", {}), "https://example.com/t");
  assert.equal(F.signingUrl("", "soa", v), "");
  assert.equal(F.signingUrl("www.signwell.com/x", "soa", v), "");
  assert.equal(F.signingUrl("javascript:alert(1)", "soa", v), "");
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

test("campos de la pantalla: cada valor tiene su etiqueta y su ID de SignWell", () => {
  assert.deepEqual(F.FIELDS.consent.map((x) => x.k), Object.keys(consent));
  assert.deepEqual(F.FIELDS.soa.map((x) => x.k), Object.keys(soa));
  assert.deepEqual(F.SIGN_IDS.consent.map((x) => x[0]), ["client_name", "client_name_sign", "consent_date", "agent_name", "agent_npn",
    "plan", "premium", "marital_status", "income", "tax_people", "covered_people"]);
  assert.deepEqual(F.SIGN_IDS.soa.map((x) => x[0]), ["beneficiary_name", "beneficiary_phone", "agent_name", "agent_npn", "contact_method", "plans"]);
});
