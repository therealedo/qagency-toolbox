/* Comprueba que la nota, el task, el reporte, el SMS y los nombres de archivo
   salgan como en los documentos de la agencia: PROCESS TEMPLATES, TASK Q
   AGENCY, STANDARD FORMs - REPORT y NOMBRE DE ARCHIVOS. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../js/notes.js");
const C = require("../js/config.js");

const base = { ini: "LI", agenteIni: "LI", fecha: "02/01/2026", hora: "09:00", canal: "Call", nombres: "BEATRIZ", apellidos: "DIAZ", anio: "2026", codigoTipo: "Q" };
const make = (extra) => Object.assign({}, base, extra);

/* ------------------------------------------------------------- reporte -- */

test("reporte: casos nuevos", () => {
  assert.equal(N.buildReport(make({ line: "mc", outcome: "enviada", gestion: "nueva", codigoTipo: "New", compania: "Humana" })),
    "New - Diaz, Beatriz - App MC Humana 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "mc", outcome: "enviada", gestion: "nueva", compania: "AETNA", agenteIni: "FV", ini: "FV" })),
    "QXXXX - Diaz, Beatriz - App MC Aetna 2026 - Call (FV)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "nueva", codigoTipo: "New", compania: "Florida Blue" })),
    "New - Diaz, Beatriz - App OC FB 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "nueva", codigoQ: "1234", compania: "FLORIDA BLUE", miembros: "Beatriz Diaz\nJuan Diaz\nAna Diaz" })),
    "Q1234 - Diaz, Beatriz - App OC FB 2026 - Call (LI) +2");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "nueva", codigoTipo: "Sin Code", compania: "FB", canal: "Walk In" })),
    "Sin Code - Diaz, Beatriz - App OC FB 2026 - Walk In (LI)");
});

test("reporte: recuperados, renovaciones y cambios", () => {
  assert.equal(N.buildReport(make({ line: "mc", outcome: "enviada", gestion: "nueva", compania: "Aetna", recuperado: true })),
    "QXXXX - Diaz, Beatriz - App MC Aetna 2026_Recovered - Call (LI)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "renovacion", compania: "UnitedHealthcare", recuperado: true })),
    "QXXXX - Diaz, Beatriz - Renew OC UHC 2026_Recovered - Call (LI)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "renovacion", compania: "Ambetter", codigoTipo: "Sin Code", adicionales: "1" })),
    "Sin Code - Diaz, Beatriz - Renew OC Ambetter 2026 - Call (LI) +1");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "cambio", compania: "UHC", adicionales: "-2" })),
    "QXXXX - Diaz, Beatriz - OC Life Change UHC 2026 - Call (LI) -2");
  assert.equal(N.buildReport(make({ line: "mc", outcome: "enviada", gestion: "cambio", compania: "UHC" })),
    "QXXXX - Diaz, Beatriz - App MC UHC 2026_Change - Call (LI)");
});

test("reporte: supplemental y cancelados", () => {
  assert.equal(N.buildReport(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Dental", compania: "UHC" })),
    "QXXXX - Diaz, Beatriz - App Dental UHC 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Vision", compania: "UHC", codigoTipo: "Sin Code" })),
    "Sin Code - Diaz, Beatriz - App Vision UHC 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Dental + Vision", compania: "Cigna" })),
    "QXXXX - Diaz, Beatriz - App Dental Cigna 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "cancelada", gestion: "renovacion", compania: "UHC", adicionales: "+3" })),
    "QXXXX - Diaz, Beatriz - Renew OC UHC 2026_Cancelled - Call (LI) +3");
  assert.equal(N.buildReport(make({ line: "mc", outcome: "cancelada", gestion: "cambio", compania: "Humana" })),
    "QXXXX - Diaz, Beatriz - App MC Humana 2026_Change_Cancelled - Call (LI)");
});

test("reporte: colaborador delante y situaciones que no se reportan", () => {
  /* Liseth firma las notas como DI y figura como agente LI; sin prefijo */
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "renovacion", compania: "UHC", ini: "DI", agenteIni: "LI" })),
    "QXXXX - Diaz, Beatriz - Renew OC UHC 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "nueva", compania: "UHC", adicionales: "3", ini: "MA", agenteIni: "LI", reportPrefix: "ma" })),
    "MA: QXXXX - Diaz, Beatriz - App OC UHC 2026 - Call (LI) +3");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "consent", gestion: "nueva", compania: "UHC" })), "");
  assert.equal(N.buildReport(make({ line: "mc", outcome: "soa", gestion: "nueva" })), "");
});

/* --------------------------------------------------------------- tasks -- */

test("task: formato estándar por situación", () => {
  const t = (extra) => N.buildTask(make(Object.assign({ ini: "DI" }, extra)));
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "enviada" })), "FV: MC MANTENIMIENTO - VER NOTA 02/01/2026 (09:00)");
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "enviada", cmd: true })), "FV: MC MANTENIMIENTO CMD - VER NOTA 02/01/2026 (09:00)");
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "soa" })), "FV: SOA PENDING - VER NOTA 02/01/2026 (09:00)");
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "cita" })), "FV: FOLLOW UP OPEN ENROLLMENT MC - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "oc", outcome: "cotizacion" }), "DI: MKPL QUOTE PENDING - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "oc", outcome: "lista" }), "DI: MKPL APP PENDING - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "oc", outcome: "consent" }), "DI: FOLLOW UP CONSENT - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "oc", outcome: "docs", docFecha: "07/09/2024" }), "DI: FOLLOW UP DOCS BY JUL/09/2024 - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "oc", outcome: "sincontacto", metodo: "EMAIL", intento: "2" }), "DI: FOLLOW UP EMAIL OC 2 - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "supp", outcome: "cotizacion" }), "DI: FOLLOW UP QUOTE SUPP - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "supp", outcome: "enviada", producto: "Life" }), "DI: LIFE INSURANCE REVIEW - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "supp", outcome: "cotizacion", producto: "Life" }), "DI: LIFE INSURANCE PENDING - VER NOTA 02/01/2026 (09:00)");
});

test("task: referencia de pago, dependiente y etiquetas al final", () => {
  const t = (extra) => N.buildTask(make(Object.assign({ ini: "DI", line: "oc", outcome: "enviada" }, extra)));
  assert.equal(t({}), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ pagoEstado: "PAYMENT" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) PAYMENT");
  assert.equal(t({ pagoEstado: "PAYMENT NOT VERIFIED" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) PAYMENT NOT VERIFIED");
  assert.equal(t({ pagoEstado: "NO PREMIUM", obsTask: "urgent" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) NO PREMIUM URGENT");
  assert.equal(t({ dep: true, pagoEstado: "PAYMENT" }), "DI: FOLLOW UP CUSTOMER SERVICE DEP - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ hora: "2pm" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (14:00)");
});

test("task: elegido a mano del catálogo", () => {
  assert.equal(N.buildTask(make({ ini: "MA", line: "oc", outcome: "enviada", taskId: "md_fu", review: true })),
    "MA: FOLLOW UP MEDICAID - VER NOTA 02/01/2026 (09:00) REVIEW");
  assert.equal(N.buildTask(make({ ini: "PD", line: "oc", outcome: "enviada", taskId: "tx_oe", taxYear: "2026", fecha: "01/01/2026", hora: "11:00" })),
    "PD: FOLLOW UP OPEN ENROLLMENT TAX 2026 - VER NOTA 01/01/2026 (11:00)");
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "enviada", taskId: "in_home" })), "FV: HOME VISIT");
  assert.equal(N.buildTask(make({ ini: "ER", taskOwner: "DI", line: "oc", outcome: "consent" })), "DI: FOLLOW UP CONSENT - VER NOTA 02/01/2026 (09:00)");
});

test("catálogo de tasks: iniciales, fecha, hora y etiquetas personalizables", () => {
  const f = (id, o) => N.formatTask(N.taskById(id), o);
  assert.equal(f("oc_cs", { owner: "di", fecha: "2/1/26", hora: "9", tags: ["NO PREMIUM", "urgent"] }),
    "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) NO PREMIUM URGENT");
  assert.equal(f("md_fu", { owner: "MA", fecha: "02/01/2026", tags: ["REVIEW"] }), "MA: FOLLOW UP MEDICAID - VER NOTA 02/01/2026 (09:00) REVIEW");
  assert.equal(f("mc_lost", { owner: "FV", fecha: "02/01/2026", metodo: "LETTER", intento: "3" }), "FV: FOLLOW UP LETTER MC 3 - VER NOTA 02/01/2026 (09:00)");
  assert.equal(f("tx_pay", { owner: "PD", fecha: "01/01/2026", hora: "11:00", taxYear: "2026" }), "PD: FOLLOW UP PAY PENDING TAX 2026 - VER NOTA 01/01/2026 (11:00)");
  assert.equal(f("in_home", { owner: "FV", tags: ["URGENT"] }), "FV: HOME VISIT");
  assert.equal(f("ad_deceased", { owner: "JI" }), "DECEASED");
  /* las nueve secciones del documento, en su orden */
  assert.deepEqual([...new Set(C.TASKS.map((t) => t.cat))], ["Medicare (MC)", "Medicaid (MC)", "Medicaid (OC)", "Supp",
    "Life Insurance", "Marketplace (OC)", "Taxes", "Independientes", "Admin (solo JI)"]);
  assert.equal(new Set(C.TASKS.map((t) => t.id)).size, C.TASKS.length, "ids únicos");
});

/* ---------------------------------------------------------------- nota -- */

test("nota: Obamacare enviada como el template OBAMACARE APP", () => {
  const note = N.buildNote(make({
    ini: "ER", fecha: "05/22/2025", line: "oc", outcome: "enviada", gestion: "cambio", anio: "2026", genero: "a",
    ingreso: "40000", hogar: "3", miembros: "JANNEL BLANCO", appId: "7562778005", estado: "Active",
    compania: "UnitedHealthcare", plan: "UHC Silver-D Value", efectiva: "08/01/2026", primaPagar: "139.08",
    periodo: "None", agente: "Liseth Iznaga", agenteIni: "LI", plataforma: "HealthSherpa", cuentaMkpl: "no",
    net: { eligibility: true }
  }));
  assert.equal(note, [
    "ER_05/22/2025: Se actualiza app OC 2026 con UHC.",
    "Sus ingresos anuales son $40,000. Son 3 en los taxes y 1 pidiendo cobertura (JANNEL BLANCO).",
    "ID#: 7562778005   Status: Active",
    "Se inscribe en plan: UHC Silver-D Value",
    "Inicia cobertura: 08/01/2026",
    "Premium: $139.08",
    "Enrollment Period: None",
    "NPN: LI",
    "MKPL no pide docs.",
    "No hay cuenta MKPL creada. La app se hizo con HealthSherpa.",
    "Docs en mi folder del NETW: Eligibility Letter."
  ].join("\n"));
});

test("nota: cotización con consent como el template OC", () => {
  const note = N.buildNote(make({
    ini: "ER", fecha: "11/09/2026", line: "oc", outcome: "consent", gestion: "nueva", genero: "a", horaLlamada: "14:44",
    plataforma: "HealthCare.gov", ingreso: "22590", hogar: "1", miembros: "DAMARYS", compania: "Ambetter",
    plan: "Everyday Bronze", primaPagar: "0"
  }));
  assert.equal(note, [
    "ER_11/09/2026: Se conversa con la cliente (02:44), nos indicó que desea cotizar con los siguientes datos:",
    "PROCESAR POR EL PORTAL: MARKETPLACE.",
    "Income: $22,590.",
    "En taxes: 1.",
    "Solicitan cobertura: 1 (DAMARYS).",
    "Se explica y da detalles del plan cotizado:",
    "Compañía_Plan: Ambetter_Everyday Bronze - $0",
    "Se envía carta de consentimiento.",
    "Pendiente: Firma del consentimiento"
  ].join("\n"));
});

test("nota: Medicare enviada como el template MEDICARE", () => {
  const note = N.buildNote(make({
    ini: "ER", line: "mc", outcome: "enviada", gestion: "nueva", nombres: "ANGEL", apellidos: "CASO",
    mbi: "6cx0x98vt11", parteA: "04/01/2025", parteB: "11/01/2025", compania: "Humana",
    plan: "Humana Gold Plus H1036-217 (HMO)", contrato: "H1036-217-000", confirmacion: "0G3VPC082Z",
    periodoMC: "SEP", motivoSepMC: "DST - Disaster", efectiva: "10/01/2026", pcp: "Carmen M Fernandez (Millennium)",
    agente: "Liseth Iznaga", agenteIni: "LI", net: { soa: true, appsummary: true }
  }));
  assert.equal(note, [
    "ER_02/01/2026: Se procesa app de MC con Humana.",
    "Name: Caso, Angel",
    "MC #: 6CX0X98VT11",
    "PART A: 04/01/2025",
    "PART B: 11/01/2025",
    "Plan: Humana Gold Plus H1036-217 (HMO) H1036-217-000",
    "Conf/App #: 0G3VPC082Z",
    "Election Period: SEP (DST - Disaster)",
    "Fecha de efectividad: 10/01/2026",
    "PCP: Carmen M Fernandez (Millennium)",
    "NPN: LI",
    "Docs en mi folder del NETW: SOA, App Summary."
  ].join("\n"));
});

test("nota: suplementario como el template ACCIDENTE", () => {
  const note = N.buildNote(make({
    ini: "ER", line: "supp", outcome: "enviada", gestion: "nueva", producto: "Accident", genero: "a",
    compania: "Allstate", plan: "Enhancer AME 17500", poliza: "2037288957", efectiva: "08/21/2026", prima: "12.89",
    beneficiario: "Sparling, Bryan (father)", pagoEstado: "PAYMENT", pagoMetodo: "CC", autopay: "On",
    agente: "Eduardo Chinea", agenteIni: "ER"
  }));
  assert.equal(note, [
    "ER_02/01/2026: Se procesa app de Accidente de Allstate, plan Enhancer AME 17500, para la cliente.",
    "Effective Date: 08/21/2026",
    "Monthly Premium: $12.89",
    "Policy #: 2037288957",
    "Beneficiario: Sparling, Bryan (father)",
    "Pago: Realizado - $12.89 - CC",
    "AutoPay: On",
    "NPN: ER"
  ].join("\n"));
  const family = N.buildNote(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Hospital",
    compania: "Golden Rule", miembros: "RAUL GAVELA\nMARIA GAVELA\nLUIS GAVELA" }));
  assert.match(family, /^LI_02\/01\/2026: Se procesa app de Hospital de GR para el cliente, MARIA GAVELA y LUIS GAVELA\.$/m);
});

test("nota: el task y el botón rojo solo cierran una aplicación enviada", () => {
  const extra = { gestion: "nueva", compania: "UHC", net: {}, botonRojo: true, incluirTask: true };
  ["oc", "mc", "supp"].forEach((line) => {
    const sent = N.buildNote(make(Object.assign({ line, outcome: "enviada" }, extra)));
    assert.match(sent, /Se reporta en el botón rojo\.\nTask: LI: /, line);
  });
  [["oc", "consent"], ["oc", "cotizacion"], ["oc", "cancelada"], ["oc", "pago"], ["mc", "soa"], ["mc", "sincambio"], ["supp", "cotizacion"]].forEach(([line, outcome]) => {
    const note = N.buildNote(make(Object.assign({ line, outcome }, extra)));
    assert.doesNotMatch(note, /botón rojo|Task:/, line + "/" + outcome);
  });
  const off = N.buildNote(make(Object.assign({ line: "oc", outcome: "enviada" }, extra, { botonRojo: false, incluirTask: false })));
  assert.doesNotMatch(off, /botón rojo|Task:/);
});

test("nota: NPN con las iniciales del agente y colaborador cuando es otra persona", () => {
  const d = make({ line: "oc", outcome: "enviada", gestion: "nueva", agente: "Liseth Iznaga", agenteIni: "LI", net: {} });
  assert.match(N.buildNote(d), /\nNPN: LI(\n|$)/);
  assert.doesNotMatch(N.buildNote(d), /Colaborador/);
  assert.match(N.buildNote(Object.assign({}, d, { colaboradorNombre: "My Access" })), /\nNPN: LI\nColaborador: MY ACCESS/);
});

test("nota: todas empiezan igual y sin contacto lleva intento", () => {
  Object.keys(C.LINES).forEach((line) => C.LINES[line].outcomes.forEach((o) => {
    const note = N.buildNote(make({ line, outcome: o.id, gestion: C.LINES[line].gestiones[0].v, net: {} }));
    assert.match(note.split("\n")[0], /^LI_02\/01\/2026: Se [a-záéíóú]+ /, line + "/" + o.id);
  }));
  assert.equal(N.buildNote(make({ line: "oc", outcome: "sincontacto", gestion: "renovacion", genero: "a", metodo: "TEXT", intento: "2" })),
    "LI_02/01/2026: Se llama a la cliente para la renovación de su OC 2026, sin respuesta. Se le envía un mensaje de texto. Intento #2.\n" +
    "Pendiente: Lograr contacto con la cliente");
});

test("nota: cita con fecha y hora, y seguimiento solo si hay fecha", () => {
  const cita = N.buildNote(make({ line: "oc", outcome: "cita", gestion: "renovacion", fechaSeg: "02/05/2026", hora: "10:30", plan: "Plan X" }));
  assert.match(cita, /desea renovar su OC 2026\. Se agenda cita para el 02\/05\/2026 a las 10:30\./);
  assert.doesNotMatch(cita, /Plan X|Seguimiento/);
  const seg = N.buildNote(make({ line: "oc", outcome: "consent", gestion: "nueva", fechaSeg: "02/03/2026" }));
  assert.match(seg, /\nSeguimiento: Procesar la app al recibir el consent - 02\/03\/2026$/);
});

test("nota: sin acentos cuando se pide", () => {
  const note = N.buildNote(make({ line: "oc", outcome: "consent", gestion: "nueva", compania: "Ambetter" }), { sinAcentos: true });
  assert.doesNotMatch(note, /[áéíóúñÁÉÍÓÚÑ]/);
  assert.match(note, /Compania_Plan: Ambetter/);
});

/* ----------------------------------------------------------------- SMS -- */

test("SMS: lleva la oficina, el nombre del cliente y el teléfono", () => {
  const sms = N.buildSms(make({ line: "oc", outcome: "consent", gestion: "nueva", anio: "2027", oficina: "ATH Insurance" }));
  assert.equal(sms, "Hola Beatriz, le saluda el equipo de ATH Insurance. Le enviamos la carta de consentimiento para su seguro de Obamacare 2027. Por favor fírmela cuando pueda para continuar con el proceso.");
  const tel = N.buildSms(make({ line: "oc", outcome: "sincontacto", oficina: "QAgency", telefono: "(305) 555-0100" }));
  assert.match(tel, /^Hola Beatriz, le saluda el equipo de QAgency\. .*llámenos al \(305\) 555-0100 o responda/);
  const sent = N.buildSms(make({ line: "oc", outcome: "enviada", gestion: "nueva", oficina: "QAgency", compania: "UHC", primaPagar: "0", efectiva: "1/1/26" }));
  assert.match(sent, /Su aplicación de Obamacare 2026 con UHC quedó procesada\. No tiene pago mensual\. Su cobertura inicia el 01\/01\/2026\./);
  Object.keys(C.LINES).forEach((line) => C.LINES[line].outcomes.forEach((o) => {
    const s = N.buildSms(make({ line, outcome: o.id, oficina: "QAgency" }));
    assert.match(s, /^Hola Beatriz, le saluda el equipo de QAgency\. \S/, line + "/" + o.id);
    assert.doesNotMatch(s, /undefined|null|NaN/, line + "/" + o.id);
  }));
});

test("SMS: cuenta caracteres y mensajes", () => {
  assert.deepEqual(N.smsInfo("Hola"), { length: 4, parts: 1, unicode: false });
  assert.deepEqual(N.smsInfo("Señor ¿listo?"), { length: 13, parts: 1, unicode: false });
  assert.equal(N.smsInfo("aplicación").unicode, true);
  assert.equal(N.smsInfo("a".repeat(161)).parts, 2);
  assert.equal(N.smsInfo("á".repeat(71)).parts, 2);
});

/* --------------------------------------------------- nombres de archivo -- */

test("nombres de archivo como en NOMBRE DE ARCHIVOS", () => {
  const names = (d) => Object.fromEntries(N.buildFileNames(d).map((f) => [f.k, f.name]));
  const oc = names(make({ line: "oc", nombres: "KARLA ALEJANDRA", apellidos: "AGUILAR", fecha: "03/20/2026", compania: "Ambetter", efectiva: "04/01/2026", pagoFecha: "09/01/2026" }));
  assert.equal(oc.appsummary, "Aguilar, Karla Alejandra - OC_App Summary 2026 MAR");
  assert.equal(oc.eligibility, "Aguilar, Karla Alejandra - OC_EligibilityNotice 2026 MAR");
  assert.equal(oc.plans, "Aguilar, Karla Alejandra - OC_My Plans & Programs Ambetter 2026 APR");
  assert.equal(oc.payment, "Aguilar, Karla Alejandra - OC_Ambetter Payment 2026 SEP");

  const mc = names(make({ line: "mc", nombres: "ANGEL", apellidos: "CASO", fecha: "09/15/2026", soaFecha: "09/10/2026", compania: "Humana", efectiva: "10/01/2026" }));
  assert.equal(mc.appsummary, "Caso, Angel - Medicare_Humana 2026 OCT");
  assert.equal(mc.soa, "Caso, Angel - Medicare_SOA 2026 SEP");

  const dental = names(make({ line: "supp", producto: "Dental", nombres: "ADNIE VIRGEN", apellidos: "TELLEZ ARMAS", compania: "Florida Blue", pagoFecha: "07/02/2026", efectiva: "07/01/2026" }));
  assert.equal(dental.payment, "Tellez Armas, Adnie Virgen - Payment Confirmation - Dental_FB 2026 JUL");
  assert.equal(dental.card, "Tellez Armas, Adnie Virgen - Dental_FB - CARD 2026 JUL");

  const st = names(make({ line: "supp", producto: "Short Term", nombres: "FLORINDA", apellidos: "VARONA DE LA PEÑA", compania: "Golden Rule", efectiva: "12/31/2026" }));
  assert.equal(st.appsummary, "Varona De La Pena, Florinda - Short Term_GR 2026 DEC");
  const life = names(make({ line: "supp", producto: "Life", nombres: "KATHERINA", apellidos: "COLLANTES VASQUEZ", compania: "Occidental", efectiva: "05/15/2026" }));
  assert.equal(life.appsummary, "Collantes Vasquez, Katherina - Life_Occidental 2026 MAY");
});

/* -------------------------------------------------------------- avisos -- */

test("avisos: faltantes y Seguro Social en la nota", () => {
  const w = N.warnings(make({ line: "oc", outcome: "enviada", ini: "", nombres: "", apellidos: "" }), "SSN 123-45-6789");
  assert.ok(w.some((x) => /quién hace la nota/.test(x)));
  assert.ok(w.some((x) => /nombre del cliente/.test(x)));
  assert.ok(w.some((x) => /código Q/.test(x)));
  assert.ok(w.some((x) => /referencia de pago/.test(x)));
  assert.ok(w.some((x) => /Seguro Social/.test(x)));
  assert.deepEqual(N.warnings(make({ line: "oc", outcome: "consent" }), "todo bien"), []);
});
