/* Comprueba que el task y el reporte salgan exactamente como en los
   documentos de la agencia (TASK Q AGENCY y STANDARD FORMs - REPORT). */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../js/notes.js");

const base = { ini: "LI", agenteIni: "LI", fecha: "02/01/2026", hora: "09:00", canal: "Call", nombres: "BEATRIZ", apellidos: "DIAZ", anio: "2026", codigoTipo: "Q" };
const make = (extra) => Object.assign({}, base, extra);

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
  assert.equal(N.buildReport(make({ line: "oc", outcome: "cancelada", gestion: "renovacion", compania: "UHC", adicionales: "+3" })),
    "QXXXX - Diaz, Beatriz - Renew OC UHC 2026_Cancelled - Call (LI) +3");
  assert.equal(N.buildReport(make({ line: "mc", outcome: "cancelada", gestion: "cambio", compania: "Humana" })),
    "QXXXX - Diaz, Beatriz - App MC Humana 2026_Change_Cancelled - Call (LI)");
});

test("reporte: colaborador delante y situaciones que no se reportan", () => {
  /* Ana firma las notas como DI y figura como agente LI */
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "renovacion", compania: "UHC", adicionales: "2", ini: "DI", agenteIni: "LI", reportPrefix: "DI" })),
    "DI: QXXXX - Diaz, Beatriz - Renew OC UHC 2026 - Call (LI) +2");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "nueva", compania: "UHC", adicionales: "3", ini: "MA", agenteIni: "LI", reportPrefix: "ma" })),
    "MA: QXXXX - Diaz, Beatriz - App OC UHC 2026 - Call (LI) +3");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "renovacion", compania: "UHC", ini: "DI", agenteIni: "LI" })),
    "QXXXX - Diaz, Beatriz - Renew OC UHC 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "consent", gestion: "nueva", compania: "UHC" })), "");
  assert.equal(N.buildReport(make({ line: "mc", outcome: "soa", gestion: "nueva" })), "");
});

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
});

test("task: referencia de pago, dependiente y observaciones al final", () => {
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

test("nota: misma estructura en todas las situaciones", () => {
  const cases = [
    { line: "oc", outcome: "enviada" }, { line: "oc", outcome: "consent" }, { line: "oc", outcome: "cotizacion" },
    { line: "oc", outcome: "sincontacto" }, { line: "mc", outcome: "enviada" }, { line: "mc", outcome: "soa" },
    { line: "supp", outcome: "enviada" }
  ];
  cases.forEach((c) => {
    const lines = N.buildNote(make(Object.assign({ gestion: "nueva", net: {} }, c))).split("\n");
    assert.match(lines[0], /^LI_02\/01\/2026: Se /, c.line + "/" + c.outcome);
    assert.equal(lines[1], "");
    assert.match(lines[2], /^ESTATUS: [A-ZÁÉÍÓÚÑ -]+$/);
    assert.match(lines[3], /^PENDIENTE: /);
    assert.match(lines[4], /^PRÓXIMO PASO: /);
  });
});

test("nota: pendientes deducidos del pago y de los documentos", () => {
  const note = N.buildNote(make({
    line: "oc", outcome: "enviada", gestion: "renovacion", primaPagar: "25.4", pagoEstado: "NO PAYMENT", pagoFecha: "12/15/2026",
    docReq: "Prueba de ingresos", docFecha: "2/15/27", fechaSeg: "12/16/2026", net: { plans: true }, botonRojo: true, incluirTask: true
  }));
  assert.match(note, /PENDIENTE: Pago de la prima \(\$25\.40\) - el cliente paga el 12\/15\/2026; Enviar al Mercado: Prueba de ingresos antes del 02\/15\/2027/);
  assert.match(note, /PRÓXIMO PASO: Seguimiento de servicio al cliente - 12\/16\/2026 \(09:00\)/);
  assert.match(note, /Documentos en Network: My Plans & Programs\./);
  assert.match(note, /Se reporta en el botón rojo\./);
  assert.match(note, /Task: LI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02\/01\/2026 \(09:00\) NO PAYMENT$/);
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

test("nota: el colaborador sale cuando no es el propio agente", () => {
  const d = make({ line: "oc", outcome: "enviada", gestion: "nueva", agente: "Ana Torres", npn: "10000001", net: {} });
  assert.doesNotMatch(N.buildNote(d), /Colaborador/);
  const note = N.buildNote(Object.assign({}, d, { colaboradorNombre: "My Access" }));
  assert.match(note, /Agente escritor: ANA TORRES - NPN 10000001\nColaborador: MY ACCESS/);
});

test("catálogo de tasks: iniciales, fecha, hora y etiquetas personalizables", () => {
  const C = require("../js/config.js");
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

test("nota: solo salen los datos de las secciones visibles", () => {
  const d = make({ line: "oc", outcome: "cita", gestion: "renovacion", plan: "Plan X", primaPagar: "10", pagoEstado: "PAYMENT", fechaSeg: "02/05/2026", hora: "10:30", net: { plans: true } });
  const note = N.buildNote(d);
  assert.doesNotMatch(note, /Plan X|Pago:|Network/);
  assert.match(note, /se agenda cita para el 02\/05\/2026 a las 10:30\./);
});

test("nota: sin acentos cuando se pide", () => {
  const note = N.buildNote(make({ line: "oc", outcome: "enviada", gestion: "renovacion", hogar: "3" }), { sinAcentos: true });
  assert.doesNotMatch(note, /[áéíóúñÁÉÍÓÚÑ]/);
  assert.match(note, /PROXIMO PASO/);
});

test("avisos: faltantes y Seguro Social en la nota", () => {
  const w = N.warnings(make({ line: "oc", outcome: "enviada", ini: "", nombres: "", apellidos: "" }), "SSN 123-45-6789");
  assert.ok(w.some((x) => /quién hace la nota/.test(x)));
  assert.ok(w.some((x) => /nombre del cliente/.test(x)));
  assert.ok(w.some((x) => /código Q/.test(x)));
  assert.ok(w.some((x) => /referencia de pago/.test(x)));
  assert.ok(w.some((x) => /Seguro Social/.test(x)));
  assert.deepEqual(N.warnings(make({ line: "oc", outcome: "consent" }), "todo bien"), []);
});
