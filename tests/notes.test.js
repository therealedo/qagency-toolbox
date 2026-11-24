/* Comprueba que la nota, el task, el reporte, el SMS y los nombres de archivo
   salgan como en los documentos de la agencia: PROCESS TEMPLATES, TASK Q
   AGENCY, STANDARD FORMs - REPORT y NOMBRE DE ARCHIVOS. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../js/notes.js");
const C = require("../js/config.js");
const X = require("../js/extract.js");

const base = { ini: "LI", agenteIni: "LI", fecha: "02/01/2026", hora: "09:00", canal: "Call", nombres: "BEATRIZ", apellidos: "DIAZ", anio: "2026", codigoTipo: "Q" };
const make = (extra) => Object.assign({}, base, extra);
const familia = [
  { titular: true, taxes: true, cobertura: true, ingreso: "25000" },
  { nombre: "JUAN CARLOS DIAZ", taxes: true, cobertura: true, ingreso: "7000" },
  { nombre: "ANA DIAZ", taxes: true, cobertura: false }
];

/* ------------------------------------------------------------- reporte -- */

test("reporte: casos nuevos", () => {
  assert.equal(N.buildReport(make({ line: "mc", outcome: "enviada", gestion: "nueva", codigoTipo: "New", compania: "Humana" })),
    "New - Diaz, Beatriz - App MC Humana 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "mc", outcome: "enviada", gestion: "nueva", compania: "AETNA", agenteIni: "FV", ini: "FV" })),
    "QXXXX - Diaz, Beatriz - App MC Aetna 2026 - Call (FV)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "nueva", codigoTipo: "New", compania: "Florida Blue" })),
    "New - Diaz, Beatriz - App OC FB 2026 - Call (LI)");
  const tres = familia.map((p) => Object.assign({}, p, { cobertura: true }));
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "nueva", codigoQ: "1234", compania: "FLORIDA BLUE", personas: tres })),
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
  /* los miembros con cobertura además del titular */
  assert.equal(N.buildReport(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Dental", compania: "UHC",
    personas: [{ titular: true, cobertura: true }, { nombre: "JUAN DIAZ", cobertura: true }, { nombre: "ANA DIAZ", cobertura: false }] })),
    "QXXXX - Diaz, Beatriz - App Dental UHC 2026 - Call (LI) +1");
});

test("reporte: colaborador delante y situaciones que no se reportan", () => {
  /* Ana firma las notas como DI y figura como agente LI; sin prefijo */
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "renovacion", compania: "UHC", ini: "DI", agenteIni: "LI" })),
    "QXXXX - Diaz, Beatriz - Renew OC UHC 2026 - Call (LI)");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "enviada", gestion: "nueva", compania: "UHC", adicionales: "3", ini: "MA", agenteIni: "LI", reportPrefix: "ma" })),
    "MA: QXXXX - Diaz, Beatriz - App OC UHC 2026 - Call (LI) +3");
  assert.equal(N.buildReport(make({ line: "oc", outcome: "pendiente", gestion: "nueva", compania: "UHC" })), "");
});

test("reporte: Medicare sin cambios va al canal NO CHANGE", () => {
  assert.equal(N.buildReport(make({ line: "mc", outcome: "sincambio", plan: "Humana Gold Plus H1036-077 (HMO)", reportPrefix: "FV" })),
    "Diaz, Beatriz se quedara en su mismo plan Humana Gold Plus H1036-077 (HMO)");
});

/* --------------------------------------------------------------- tasks -- */

test("task: formato estándar por situación", () => {
  const t = (extra) => N.buildTask(make(Object.assign({ ini: "DI" }, extra)));
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "enviada" })), "FV: MC MANTENIMIENTO - VER NOTA 02/01/2026 (09:00)");
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "enviada", cmd: true })), "FV: MC MANTENIMIENTO CMD - VER NOTA 02/01/2026 (09:00)");
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "sincambio" })), "FV: MC MANTENIMIENTO - VER NOTA 02/01/2026 (09:00)");
  /* Es cliente apagado: ya no es cliente de la agencia */
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "sincambio", esCliente: false })),
    "FV: FOLLOW UP LEAD_INACTIVE CLIENT MC - VER NOTA 02/01/2026 (09:00)");
  assert.deepEqual(C.LINES.mc.outcomes.map((o) => o.id), ["enviada", "sincambio"], "Medicare solo tiene App enviada y Sin cambios");
  assert.equal(C.LINES.mc.label, "Medicare Advantage");
  assert.equal(C.LINES.mc.code, "MC");
  assert.deepEqual(C.LINES.supp.outcomes.map((o) => o.id), ["enviada", "cotizacion"], "Suplementario solo tiene App enviada y Cotización");
  assert.deepEqual(C.LINES.supp.gestiones.map((g) => g.v), ["nueva", "renovacion"], "sin cambio de plan");
  assert.deepEqual(C.LINES.supp.pagos, ["PAYMENT", "NO PAYMENT"], "solo Pago confirmado y Pendiente de pago");
  assert.equal(t({ line: "supp", outcome: "cotizacion" }), "DI: FOLLOW UP QUOTE SUPP - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "supp", outcome: "enviada", producto: "Life" }), "DI: LIFE INSURANCE REVIEW - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ line: "supp", outcome: "cotizacion", producto: "Life" }), "DI: LIFE INSURANCE PENDING - VER NOTA 02/01/2026 (09:00)");
});

test("task Obamacare: pendiente según el consent y si revisará los planes", () => {
  const t = (extra) => N.buildTask(make(Object.assign({ ini: "DI", line: "oc", outcome: "pendiente" }, extra)));
  assert.equal(t({ net: {} }), "DI: FOLLOW UP CONSENT - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ net: { consent: true } }), "DI: MKPL APP PENDING - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ net: { consent: true }, revisaPlanes: true }), "DI: FOLLOW UP OPEN ENROLLMENT OC - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ outcome: "cancelada" }), "DI: FOLLOW UP LEAD_INACTIVE CLIENT OC - VER NOTA 02/01/2026 (09:00)");
});

test("task Obamacare: mientras el Mercado pida documentos, FOLLOW UP DOCS BY la fecha más próxima de todos", () => {
  const t = (docs) => N.buildTask(make({ ini: "DI", line: "oc", outcome: "enviada", docs }));
  assert.equal(t([{ cat: "income", fecha: "03/01/2027" }, { cat: "immigration", fecha: "02/12/2027" }]),
    "DI: FOLLOW UP DOCS BY FEB/12/2027 - VER NOTA 02/01/2026 (09:00)");
  /* ya enviados siguen necesitando seguimiento */
  assert.equal(t([{ cat: "income", fecha: "03/01/2027", enviado: true }]), "DI: FOLLOW UP DOCS BY MAR/01/2027 - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t([{ cat: "income", fecha: "02/12/2027", enviado: true }, { cat: "immigration", fecha: "03/01/2027" }]),
    "DI: FOLLOW UP DOCS BY FEB/12/2027 - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t([]), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00)");
});

test("task FOLLOW UP DOCS: lleva la referencia de pago y las etiquetas al final, como Customer Service", () => {
  const docs = [{ cat: "income", fecha: "03/01/2027" }];
  ["PAYMENT", "NO PAYMENT", "PAYMENT NOT VERIFIED", "NO PREMIUM"].forEach((estado) => {
    assert.equal(N.buildTask(make({ ini: "DI", line: "oc", outcome: "enviada", docs, pagoEstado: estado, obsTags: ["URGENT", "CRONIC"] })),
      "DI: FOLLOW UP DOCS BY MAR/01/2027 - VER NOTA 02/01/2026 (09:00) " + estado + " CRONIC URGENT");
  });
  const w = N.warnings(make({ ini: "DI", line: "oc", outcome: "enviada", docs, prima: "25" }));
  assert.ok(w.some((x) => /Task: falta la referencia de pago/.test(x)));
});

test("task: referencia de pago, dependiente y etiquetas al final", () => {
  const t = (extra) => N.buildTask(make(Object.assign({ ini: "DI", line: "oc", outcome: "enviada" }, extra)));
  assert.equal(t({}), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00)");
  assert.equal(t({ pagoEstado: "PAYMENT" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) PAYMENT");
  assert.equal(t({ pagoEstado: "PAYMENT NOT VERIFIED" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) PAYMENT NOT VERIFIED");
  assert.equal(t({ pagoEstado: "NO PREMIUM", obsTask: "urgent" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) NO PREMIUM URGENT");
  /* etiquetas finales de selección múltiple, siempre en el mismo orden */
  assert.equal(t({ pagoEstado: "PAYMENT", obsTags: ["URGENT", "CRONIC"] }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) PAYMENT CRONIC URGENT");
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "enviada", obsTags: ["CRONIC"] })), "FV: MC MANTENIMIENTO - VER NOTA 02/01/2026 (09:00) CRONIC");
  assert.deepEqual(C.OBS_TAGS, ["CRONIC", "URGENT"]);
  assert.ok(C.TASK_TAGS.some((x) => x.v === "CRONIC"), "también en la pestaña Tasks");
  /* ya no hay casilla de dependiente: la nota va siempre en el perfil del principal */
  assert.equal(t({ dep: true, pagoEstado: "PAYMENT" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) PAYMENT");
  assert.equal(t({ taskId: "oc_cs_dep" }), "DI: FOLLOW UP CUSTOMER SERVICE DEP - VER NOTA 02/01/2026 (09:00)", "sigue disponible a mano");
  /* en 12 horas, como en los templates: 2:30 PM sale (02:30) */
  assert.equal(t({ hora: "14:30" }), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (02:30)");
});

test("task: elegido a mano del catálogo", () => {
  assert.equal(N.buildTask(make({ ini: "MA", line: "oc", outcome: "enviada", taskId: "md_fu", review: true })),
    "MA: FOLLOW UP MEDICAID - VER NOTA 02/01/2026 (09:00) REVIEW");
  assert.equal(N.buildTask(make({ ini: "PD", line: "oc", outcome: "enviada", taskId: "tx_oe", taxYear: "2026", fecha: "01/01/2026", hora: "11:00" })),
    "PD: FOLLOW UP OPEN ENROLLMENT TAX 2026 - VER NOTA 01/01/2026 (11:00)");
  assert.equal(N.buildTask(make({ ini: "FV", line: "mc", outcome: "enviada", taskId: "in_home" })), "FV: HOME VISIT");
  assert.equal(N.buildTask(make({ ini: "ER", taskOwner: "DI", line: "oc", outcome: "pendiente", net: {} })), "DI: FOLLOW UP CONSENT - VER NOTA 02/01/2026 (09:00)");
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
    nombres: "JANNEL", apellidos: "BLANCO",
    personas: [{ titular: true, taxes: true, cobertura: true, ingreso: "40000" },
               { nombre: "PEDRO BLANCO", taxes: true, cobertura: false }, { nombre: "ANA BLANCO", taxes: true, cobertura: false }],
    appId: "7562778005", estado: "Active", compania: "UnitedHealthcare", plan: "UHC Silver-D Value", efectiva: "08/01/2026",
    prima: "139.08", periodo: "None", agente: "Ana Torres", agenteIni: "LI", plataforma: "HealthSherpa", cuentaMkpl: "no",
    net: { eligibility: true }
  }));
  assert.equal(note, [
    "ER_05/22/2025: Se actualiza app OC 2026 con UHC.",
    "Sus ingresos anuales son $40,000. Son 3 en los taxes (Jannel, Pedro, Ana) y 1 pidiendo cobertura (Jannel).",
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

test("nota: ingresos por persona, documentos pedidos y pago", () => {
  const note = N.buildNote(make({
    line: "oc", outcome: "enviada", gestion: "renovacion", personas: familia, plataforma: "MKPL", prima: "25.4",
    docs: [{ cat: "income", persona: "BEATRIZ DIAZ", fecha: "2/12/27", enviado: true, doc: "Pay stub" },
           { cat: "immigration", persona: "JUAN CARLOS DIAZ", fecha: "03/01/2027" }],
    pagoEstado: "PAYMENT", pagoMetodo: "Tarjeta CC", autopay: "On"
  }));
  assert.match(note, /\nSus ingresos anuales son \$32,000 \(Beatriz \$25,000, Juan \$7,000\)\. Son 3 en los taxes \(Beatriz, Juan, Ana\) y 2 pidiendo cobertura \(Beatriz, Juan\)\.\n/);
  assert.match(note, /\nMKPL pide docs:\n- Ingresos \(Beatriz\) - fecha tope 02\/12\/2027 - Enviado: Pay stub\n- Estatus migratorio \(Juan\) - fecha tope 03\/01\/2027 - Pendiente\n/);
  assert.match(note, /\nLa app se hizo en el MKPL\.\nPago: Realizado - \$25\.40 el 02\/01\/2026 - Tarjeta CC\nAutoPay: On/);
});

test("nota: solo Pago confirmado escribe en la nota; los demás estados van solo en el task", () => {
  ["NO PAYMENT", "PAYMENT NOT VERIFIED", "NO PREMIUM"].forEach((estado) => {
    const d = make({ ini: "DI", line: "oc", outcome: "enviada", plataforma: "MKPL", prima: "25.4",
      pagoEstado: estado, pagoMonto: "25.4", pagoFecha: "02/10/2026", autopay: "On" });
    const note = N.buildNote(d);
    assert.doesNotMatch(note, /\nPago:/, estado);
    assert.doesNotMatch(note, /\nAutoPay:/, estado);
    assert.equal(N.buildTask(d), "DI: FOLLOW UP CUSTOMER SERVICE - VER NOTA 02/01/2026 (09:00) " + estado);
  });
  const supp = (estado) => N.buildNote(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Accident",
    compania: "Allstate", prima: "12.89", pagoEstado: estado, pagoMetodo: "CC", autopay: "On" }));
  assert.doesNotMatch(supp("NO PAYMENT"), /\nPago:|\nAutoPay:/);
  assert.match(supp("PAYMENT"), /\nPago: Realizado - \$12\.89 el 02\/01\/2026 - CC\nAutoPay: On/);
  /* sin fecha del pago va la de la nota; con fecha, la suya */
  assert.match(N.buildNote(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Accident", compania: "Allstate",
    prima: "12.89", pagoEstado: "PAYMENT", pagoMetodo: "CC", pagoFecha: "02/03/2026" })), /\nPago: Realizado - \$12\.89 el 02\/03\/2026 - CC/);
});

test("nota: Cambios lista lo que quedó distinto de los PDF", () => {
  const note = N.buildNote(make({
    line: "oc", outcome: "enviada", gestion: "renovacion", appId: "4412345678", hogarPdf: true,
    personas: [
      { titular: true, taxes: true, cobertura: true, ingreso: "$25,000.00", estatus: "residente", dob: "03/14/1985",
        orig: { taxes: true, cobertura: true, ingreso: "$32,000.00", dob: "03/14/1985" } },
      { nombre: "JUAN CARLOS DIAZ", taxes: true, cobertura: false, ingreso: "", orig: { nombre: "JUAN CARLOS DIAZ", taxes: true, cobertura: true } },
      { nombre: "ANA DIAZ", parentesco: "Hijo/a", taxes: true, cobertura: true, dob: "5/2/2020", estatus: "ciudadano" }
    ],
    quitados: ["PEDRO DIAZ"],
    direccion: "456 Oak Ave, Miami, FL 33125", base: { direccion: "123 Main St, Miami, FL 33101" },
    clienteTel: "(305) 555-0199", clienteEmail: ""
  }));
  assert.ok(note.includes([
    "Son 3 en los taxes (Beatriz, Juan, Ana) y 2 pidiendo cobertura (Beatriz, Ana).",
    "Cambios:",
    "- Beatriz: ingreso anual $25,000 (antes $32,000), estatus Residente",
    "- Juan: no pide cobertura",
    "- Se agrega a ANA DIAZ (Hijo/a), DOB 05/02/2020, estatus Ciudadano",
    "- Se quita a PEDRO DIAZ",
    "- Dirección: 456 Oak Ave, Miami, FL 33125 (antes 123 Main St, Miami, FL 33101)",
    "- Teléfono: (305) 555-0199",
    "ID#: 4412345678"
  ].join("\n")), note);
  /* sin datos de un PDF solo cuentan dirección, teléfono, email, estatus y DOB */
  const manual = N.buildNote(make({ line: "oc", outcome: "enviada", personas: familia, clienteEmail: "bea@example.com" }));
  assert.match(manual, /\nCambios:\n- Email: bea@example\.com\n/);
  assert.doesNotMatch(manual, /Se agrega/);
  const otro = N.buildNote(make({ line: "oc", outcome: "enviada", personas: [{ titular: true, taxes: true, cobertura: true, estatus: "otro", estatusOtro: "TPS" }] }));
  assert.match(otro, /\nCambios:\n- Beatriz: estatus TPS\n/);
  assert.doesNotMatch(N.buildNote(make({ line: "oc", outcome: "enviada", personas: familia })), /Cambios/);
  assert.doesNotMatch(N.buildNote(make({ line: "oc", outcome: "cancelada", clienteTel: "(305) 555-0199" })), /Cambios/);
  const pend = N.buildNote(make({ line: "oc", outcome: "pendiente", personas: familia, clienteTel: "(305) 555-0199" }));
  assert.match(pend, /\nSolicitan cobertura: 2 \(Beatriz, Juan\)\.\nCambios:\n- Teléfono: \(305\) 555-0199\n/);
});

test("nota: pendiente como el template de cotización, con varios planes", () => {
  const d = make({
    ini: "ER", fecha: "11/09/2026", line: "oc", outcome: "pendiente", gestion: "nueva", genero: "a", hora: "14:30",
    nombres: "DAMARYS", apellidos: "BLANCO", personas: [{ titular: true, taxes: true, cobertura: true, ingreso: "22590" }],
    plataforma: "MKPL", efectiva: "01/01/2027", agenteIni: "", agente: "",
    planes: [{ compania: "Ambetter", plan: "Everyday Bronze", prima: "0" }, { compania: "Oscar", plan: "Silver Simple", prima: "45" }],
    net: {}
  });
  assert.equal(N.buildNote(d), [
    "ER_11/09/2026: Se conversa con la cliente (02:30), nos indicó que desea cotizar con los siguientes datos:",
    "PROCESAR POR EL PORTAL: MARKETPLACE.",
    "Income: $22,590.",
    "En taxes: 1 (Damarys).",
    "Solicitan cobertura: 1 (Damarys).",
    "Se explica y da detalles de los planes cotizados:",
    "Compañía_Plan: Ambetter_Everyday Bronze - $0",
    "Compañía_Plan: Oscar_Silver Simple - $45",
    "Inicia cobertura: 01/01/2027",
    "Carta de consentimiento enviada."
  ].join("\n"));
  /* plan elegido y consent firmado en una llamada */
  const sel = Object.assign({}, d, { planes: [Object.assign({}, d.planes[0], { sel: true }), d.planes[1]], net: { consent: true } });
  const note = N.buildNote(sel);
  assert.match(note, /desea aplicar con los siguientes datos:/);
  assert.match(note, /Compañía_Plan: Ambetter_Everyday Bronze - \$0 \(SELECCIONADO\)/);
  assert.match(note, /\nSe firmó la carta de consentimiento en línea, app pendiente\.$/);
  assert.match(N.buildNote(Object.assign({}, sel, { canal: "Walk In" })), /\nSe firmó la carta de consentimiento en la oficina, app pendiente\.$/);
  /* revisará los planes: la cotización cierra la nota; el consent todavía no se envía ni se firma */
  const ofi = N.buildNote(Object.assign({}, sel, { canal: "Walk In", revisaPlanes: true }));
  assert.match(ofi, /desea cotizar/);
  assert.match(ofi, /\nSe le entrega la cotización para que revise los planes\.$/);
  assert.doesNotMatch(ofi, /consentimiento/);
  const envia = N.buildNote(Object.assign({}, d, { revisaPlanes: true }));
  assert.match(envia, /\nInicia cobertura: 01\/01\/2027\nSe le envía la cotización para que revise los planes\.$/);
  assert.doesNotMatch(envia, /consentimiento/);
  /* con un solo plan cotizado, la cotización es para que revise el plan */
  const uno = N.buildNote(Object.assign({}, d, { planes: [d.planes[0]], revisaPlanes: true }));
  assert.match(uno, /\nSe le envía la cotización para que revise el plan\.$/);
  const unoOfi = N.buildNote(Object.assign({}, d, { planes: [d.planes[0], { compania: "", plan: "" }], canal: "Walk In", revisaPlanes: true }));
  assert.match(unoOfi, /\nSe le entrega la cotización para que revise el plan\.$/);
  assert.equal(N.buildSms(sel), "", "Pendiente no lleva SMS");
});

test("nota: cancelación con motivo y My Plans & Programs (CANCELLED)", () => {
  const d = make({ ini: "ER", line: "oc", outcome: "cancelada", gestion: "renovacion", genero: "a", compania: "UHC",
    personas: familia, motivoCancel: "Otro", motivoOtro: "Se mudó de estado", net: { plans: true } });
  assert.equal(N.buildNote(d), [
    "ER_02/01/2026: Se cancela la renovación OC 2026 con UHC a solicitud de la cliente.",
    "Motivo: Se mudó de estado",
    "Miembros en la cancelación: 2 (Beatriz, Juan).",
    "NPN: LI",
    "Docs en mi folder del NETW: My Plans & Programs (CANCELLED)."
  ].join("\n"));
  assert.equal(N.buildReport(d), "QXXXX - Diaz, Beatriz - Renew OC UHC 2026_Cancelled - Call (LI) +1");
  assert.equal(N.buildFileNames(d)[0].name, "Diaz, Beatriz - OC_My Plans & Programs UHC 2026 FEB CANCELLED");
  assert.match(N.buildNote(Object.assign({}, d, { motivoCancel: "Demasiado caro" })), /\nMotivo: Demasiado caro\n/);
});

test("Reporte de una cancelación TERMINATED: _Terminated; la CANCELLED sigue con _Cancelled", () => {
  const base = { ini: "ER", line: "oc", outcome: "cancelada", gestion: "renovacion", genero: "a", compania: "UHC",
    personas: familia, motivoCancel: "Otro", motivoOtro: "Se mudó de estado" };
  const term = make(Object.assign({}, base, { tipoCancel: "terminated", fechaTermino: "03/31/2026" }));
  assert.equal(N.buildReport(term), "QXXXX - Diaz, Beatriz - Renew OC UHC 2026_Terminated - Call (LI) +1");
  const canc = make(Object.assign({}, base, { tipoCancel: "cancelled" }));
  assert.equal(N.buildReport(canc), "QXXXX - Diaz, Beatriz - Renew OC UHC 2026_Cancelled - Call (LI) +1");
  /* recuperada y terminada: las dos marcas, en el mismo orden de siempre */
  assert.equal(N.buildReport(Object.assign({}, term, { recuperado: true })), "QXXXX - Diaz, Beatriz - Renew OC UHC 2026_Recovered_Terminated - Call (LI) +1");
});

test("nota: Medicare enviada como el template MEDICARE", () => {
  const note = N.buildNote(make({
    ini: "ER", line: "mc", outcome: "enviada", gestion: "nueva", nombres: "ANGEL", apellidos: "CASO",
    mbi: "6cx0x98vt11", parteA: "04/01/2025", parteB: "11/01/2025", compania: "Humana", medicaid: "12345678",
    plan: "Humana Gold Plus H1036-217-000 (HMO)", confirmacion: "0G3VPC082Z", soaFecha: "02/01/2026",
    periodoMC: "SEP", motivoSepMC: "DST - Disaster", efectiva: "10/01/2026", pcp: "Carmen M Fernandez (Millennium)",
    agente: "Ana Torres", agenteIni: "LI", net: { soa: true, appsummary: true }
  }));
  assert.equal(note, [
    "ER_02/01/2026: Se conversa con el cliente (09:00), se procesa app de MC con Humana.",
    "Name: Caso, Angel",
    "MC #: 6CX0X98VT11",
    "PART A: 04/01/2025",
    "PART B: 11/01/2025",
    "Plan: Humana Gold Plus H1036-217-000 (HMO)",
    "App ID: 0G3VPC082Z",
    "Election Period: SEP (DST - Disaster)",
    "Fecha de efectividad: 10/01/2026",
    "Medicaid ID: 12345678",
    "PCP: Carmen M Fernandez (Millennium)",
    "Premium: $0.00",
    "SOA firmado: 02/01/2026",
    "NPN: LI",
    "Docs en mi folder del NETW: SOA, App."
  ].join("\n"));
  /* la prima solo se escribe cuando el plan tiene prima */
  const conPrima = N.buildNote(make({ line: "mc", outcome: "enviada", tienePrima: true, prima: "45" }));
  assert.match(conPrima, /\nPremium: \$45\.00\n/);
  assert.doesNotMatch(N.buildNote(make({ line: "mc", outcome: "enviada", tienePrima: false, prima: "45" })), /\$45/);
  /* sin colaborador ni pendiente en Medicare */
  assert.doesNotMatch(N.buildNote(make({ line: "mc", outcome: "enviada", pendiente: "algo", fechaSeg: "02/03/2026", colaboradorNombre: "MY ACCESS" })),
    /Pendiente:|Seguimiento:|Colaborador:/);
});

test("nota: Medicare sin cambios con el plan al final y solo el SOA", () => {
  const d = make({ ini: "ER", fecha: "11/14/2026", line: "mc", outcome: "sincambio", anio: "2027", canal: "Appointment", modalidad: "telefónica",
    hora: "09:00", plan: "Humana Gold Plus H1036-077 (HMO)", mbi: "1EG4TE5MK73", medicaid: "123", compania: "Humana", efectiva: "01/01/2027",
    pcp: "Dr. X", pendiente: "algo", net: { soa: true, appsummary: true } });
  assert.equal(N.buildNote(d), [
    "ER_11/14/2026: Se atiende al cliente en cita telefónica (09:00), se revisan los beneficios de su plan para 2027 y decide mantenerse en su plan actual - Humana Gold Plus H1036-077 (HMO)",
    "Docs en mi folder del NETW: SOA."
  ].join("\n"));
  assert.deepEqual(N.networkOf(d).map((n) => n.k), ["soa"]);
  assert.equal(N.buildSms(d), "", "sin SMS");
  const w = N.warnings(make({ line: "mc", outcome: "sincambio", codigoQ: "" }), "");
  assert.ok(w.some((x) => /nombre del plan/.test(x)));
  assert.ok(!w.some((x) => /código Q|compañía|año del plan/.test(x)));
});

/* sin el teléfono de la agencia en Ajustes, el SMS sale sin la línea Oficina */
test("avisos: falta el teléfono de la oficina de la agencia del caso", () => {
  const re = /Falta el teléfono de la oficina de ATH Insurance en Ajustes/;
  const d = make({ line: "oc", outcome: "enviada", oficina: "ATH Insurance", telefono: "", firmaNombre: "Laura Ibarra", firmaTel: "(239) 555-0100" });
  assert.ok(N.warnings(d, "").some((x) => re.test(x)));
  assert.ok(!/Oficina:/.test(N.buildSms(d)));
  assert.ok(!N.warnings(Object.assign({}, d, { telefono: "(239) 555-0199" }), "").some((x) => /teléfono de la oficina/.test(x)));
  /* una gestión sin SMS no lo necesita */
  assert.ok(!N.warnings(make({ line: "mc", outcome: "sincambio", oficina: "ATH Insurance", telefono: "" }), "").some((x) => /teléfono de la oficina/.test(x)));
});

test("nota: suplementario como el template ACCIDENTE", () => {
  const note = N.buildNote(make({
    ini: "ER", line: "supp", outcome: "enviada", gestion: "nueva", producto: "Accident", genero: "a",
    compania: "Allstate", plan: "Enhancer AME 17500", poliza: "2037288957", efectiva: "08/21/2026", prima: "12.89",
    beneficiario: "Sparling, Bryan (father)", pagoEstado: "PAYMENT", pagoMetodo: "CC", autopay: "On",
    agente: "Daniel Rivas", agenteIni: "ER",
    /* ya no van en Suplementario */
    appId: "APP-998877", tipoPlan: "DPPO", colaboradorNombre: "My Access", notas: "Llamar el lunes", fechaSeg: "02/03/2026", pendiente: "Firma"
  }));
  assert.equal(note, [
    "ER_02/01/2026: Se procesa app de Accidente de Allstate, plan Enhancer AME 17500, para la cliente.",
    "Effective Date: 08/21/2026",
    "Monthly Premium: $12.89",
    "Policy #: 2037288957",
    "Beneficiario: Sparling, Bryan (father)",
    "Pago: Realizado - $12.89 el 02/01/2026 - CC",
    "AutoPay: On",
    "NPN: ER"
  ].join("\n"));
  /* Members: solo los nombres de pila de quienes tienen cobertura */
  const family = N.buildNote(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Hospital", nombres: "RAUL", apellidos: "GAVELA",
    compania: "Golden Rule", personas: [{ titular: true, cobertura: true, dob: "01/02/1980" }, { nombre: "MARIA GAVELA", cobertura: true },
      { nombre: "LUIS GAVELA", cobertura: true }, { nombre: "ANA GAVELA", cobertura: false }] }));
  assert.match(family, /^LI_02\/01\/2026: Se procesa app de Hospital de GR para el cliente, Maria y Luis\.$/m);
  const kids = N.buildNote(make({ line: "supp", outcome: "enviada", gestion: "renovacion", producto: "Dental", compania: "Cigna",
    personas: [{ titular: true, cobertura: false }, { nombre: "MARIA DIAZ", cobertura: true }] }));
  assert.match(kids, /^LI_02\/01\/2026: Se renueva app de Dental de Cigna para Maria\.$/m);
});

test("nota: el HRA hecho agrega su línea en Medicare, con el cliente en español o en inglés", () => {
  const extra = { gestion: "nueva", compania: "Humana", net: { soa: true }, botonRojo: false, hra: true };
  ["enviada", "sincambio"].forEach((outcome) => {
    ["es", "en"].forEach((idioma) => {
      const note = N.buildNote(make(Object.assign({ line: "mc", outcome, idioma }, extra)));
      assert.match(note, /\nSe completó el HRA \(Health Risk Assessment\)\.\nDocs en mi folder del NETW: SOA\.$/, outcome + "/" + idioma);
    });
  });
  /* sin la casilla no hay línea, y en Obamacare o Suplementario tampoco */
  assert.doesNotMatch(N.buildNote(make(Object.assign({ line: "mc", outcome: "enviada" }, extra, { hra: false }))), /HRA/);
  ["oc", "supp"].forEach((line) => {
    assert.doesNotMatch(N.buildNote(make(Object.assign({ line, outcome: "enviada" }, extra))), /HRA/, line);
  });
});

test("nota: el botón rojo solo cierra una aplicación enviada y el task nunca va en la nota", () => {
  const extra = { gestion: "nueva", compania: "UHC", net: {}, botonRojo: true };
  ["oc", "mc", "supp"].forEach((line) => {
    const sent = N.buildNote(make(Object.assign({ line, outcome: "enviada" }, extra)));
    assert.match(sent, /Se reporta en el botón rojo\.$/, line);
    assert.doesNotMatch(sent, /Task:/, line);
  });
  [["oc", "pendiente"], ["oc", "cancelada"], ["mc", "sincambio"], ["supp", "cotizacion"]].forEach(([line, outcome]) => {
    assert.doesNotMatch(N.buildNote(make(Object.assign({ line, outcome }, extra))), /botón rojo|Task:/, line + "/" + outcome);
  });
  assert.doesNotMatch(N.buildNote(make(Object.assign({ line: "oc", outcome: "enviada" }, extra, { botonRojo: false }))), /botón rojo/);
});

test("nota: NPN con las iniciales del agente; quién habló y quién procesó si no es quien escribe", () => {
  const d = make({ line: "oc", outcome: "enviada", gestion: "nueva", agente: "Ana Torres", agenteIni: "LI", net: {} });
  assert.match(N.buildNote(d), /\nNPN: LI(\n|$)/);
  assert.doesNotMatch(N.buildNote(d), /Habló|Colaborador/);
  assert.match(N.buildNote(Object.assign({}, d, { talkerNombre: "Rosa Mendez", colaboradorNombre: "My Access" })),
    /\nNPN: LI\nHabló con el cliente: ROSA MENDEZ\nColaborador: MY ACCESS/);
});

test("nota: todas empiezan igual", () => {
  Object.keys(C.LINES).forEach((line) => C.LINES[line].outcomes.forEach((o) => {
    const note = N.buildNote(make({ line, outcome: o.id, gestion: C.LINES[line].gestiones[0].v, net: {} }));
    assert.match(note.split("\n")[0], /^LI_02\/01\/2026: Se [a-záéíóú]+ /, line + "/" + o.id);
  }));
  /* Obamacare ya no lleva pendiente ni seguimiento */
  assert.doesNotMatch(N.buildNote(make({ line: "oc", outcome: "pendiente", gestion: "nueva", pendiente: "algo", fechaSeg: "02/03/2026", net: {} })), /Pendiente:|Seguimiento:/);
});

test("nota: al cliente / del cliente según el género", () => {
  const walk = (genero) => N.buildNote(make({ line: "oc", outcome: "pendiente", canal: "Walk In", genero, net: {} })).split("\n")[0];
  assert.match(walk("o"), /Se atiende al cliente en la oficina \(09:00\)/);
  assert.match(walk("a"), /Se atiende a la cliente en la oficina \(09:00\)/);
  const cancel = (genero) => N.buildNote(make({ line: "oc", outcome: "cancelada", compania: "UHC", genero })).split("\n")[0];
  assert.match(cancel("o"), /a solicitud del cliente\.$/);
  assert.match(cancel("a"), /a solicitud de la cliente\.$/);
});

test("hora exacta en la nota y en punto o y media de antes en el task", () => {
  const d = make({ line: "oc", outcome: "pendiente", hora: "09:34" });
  assert.match(N.buildNote(d), /\(09:34\)/);
  assert.match(N.buildTask(d), /VER NOTA 02\/01\/2026 \(09:30\)$/);
  const d2 = make({ line: "oc", outcome: "pendiente", hora: "14:13" });
  assert.match(N.buildNote(d2), /\(02:13\)/);
  assert.match(N.buildTask(d2), /VER NOTA 02\/01\/2026 \(02:00\)$/);
});

test("nota: hora de revisión en 12 horas; Suplementario ya no lleva seguimiento", () => {
  const tarde = N.buildNote(make({ line: "supp", outcome: "cotizacion", producto: "Dental", hora: "15:00" }));
  assert.match(tarde, /^LI_02\/01\/2026: Se conversa con el cliente \(03:00\), desea cotizar /);
  assert.doesNotMatch(tarde, /Seguimiento/);
  assert.match(N.buildTask(make({ line: "supp", outcome: "cotizacion", hora: "15:00" })), /VER NOTA 02\/01\/2026 \(03:00\)$/);
  const seg = N.buildNote(make({ line: "supp", outcome: "cotizacion", producto: "Dental", fechaSeg: "02/03/2026" }));
  assert.doesNotMatch(seg, /Seguimiento|Pendiente/);
});

test("nota: cotización de suplementario con los miembros y la fecha efectiva estimada", () => {
  const d = make({ line: "supp", outcome: "cotizacion", gestion: "nueva", producto: "Dental", compania: "Cigna", plan: "Dental Plus",
    prima: "30", efectiva: "03/01/2026", appId: "APP-1", poliza: "POL-1", tipoPlan: "DHMO",
    personas: [{ titular: true, cobertura: true }, { nombre: "MARIA DIAZ", cobertura: true }] });
  assert.equal(N.buildNote(d), [
    "LI_02/01/2026: Se conversa con el cliente (09:00), desea cotizar seguro dental para el cliente y Maria.",
    "Se explica y da detalles del plan cotizado:",
    "Compañía_Plan: Cigna_Dental Plus - $30.00",
    "Fecha efectiva estimada: 03/01/2026"
  ].join("\n"));
  /* solo el titular: no hace falta nombrarlo */
  assert.match(N.buildNote(make({ line: "supp", outcome: "cotizacion", producto: "Dental" })), /desea cotizar seguro dental\.$/m);
});

test("nota: sin acentos cuando se pide", () => {
  const note = N.buildNote(make({ line: "oc", outcome: "pendiente", gestion: "nueva", planes: [{ compania: "Ambetter", plan: "Bronze" }], net: {} }), { sinAcentos: true });
  assert.doesNotMatch(note, /[áéíóúñÁÉÍÓÚÑ]/);
  assert.match(note, /Compania_Plan: Ambetter/);
});

/* ----------------------------------------------------------------- SMS -- */

test("SMS: lleva la oficina, el nombre del cliente y el teléfono", () => {
  const sms = N.buildSms(make({ line: "oc", outcome: "cancelada", gestion: "nueva", anio: "2027", compania: "UHC", oficina: "ATH Insurance" }));
  assert.equal(sms, "Hola Beatriz, le saluda el equipo de ATH Insurance. Su seguro de Obamacare 2027 con UHC quedó cancelado según lo solicitado. Cualquier duda, estamos a la orden.");
  const tel = N.buildSms(make({ line: "supp", outcome: "cotizacion", gestion: "nueva", producto: "Dental", oficina: "QAgency", telefono: "(305) 555-0100" }));
  assert.match(tel, /^Hola Beatriz, le saluda el equipo de QAgency\. .* Cualquier duda, llámenos al \(305\) 555-0100\.$/);
  Object.keys(C.LINES).forEach((line) => C.LINES[line].outcomes.forEach((o) => {
    const s = N.buildSms(make({ line, outcome: o.id, oficina: "QAgency" }));
    if (o.noSms) { assert.equal(s, "", line + "/" + o.id); return; }
    if (line === "oc" && o.id === "enviada") { assert.match(s, /^Estimado Beatriz: Somos QAgency Insurance\. /); return; }
    if (o.id === "enviada") { assert.match(s, /^Estimado Beatriz:\nSomos QAgency Insurance\. /, line + "/" + o.id); return; }
    assert.match(s, /^Hola Beatriz, le saluda el equipo de QAgency\. \S/, line + "/" + o.id);
    assert.doesNotMatch(s, /undefined|null|NaN/, line + "/" + o.id);
  }));
});

test("SMS Obamacare enviada: formato de la agencia en español e inglés", () => {
  const d = make({ line: "oc", outcome: "enviada", gestion: "renovacion", anio: "2027", nombres: "MIGUEL", genero: "o", oficina: "QAgency",
    compania: "FLORIDA BLUE", plan: "myBlue Essentials Silver 27M07-01C", efectiva: "1/1/2027", prima: "85.4",
    firmaNombre: "DANIEL RIVAS", firmaTel: "(239) 282-4226", telefono: "(239) 205-2047" });
  assert.equal(N.buildSms(d), [
    "Estimado Miguel: Somos QAgency Insurance. Hemos renovado su seguro de salud 2027 con Florida Blue.",
    "Plan: myBlue Essentials Silver 27M07-01C",
    "Inicio: 01/01/2027",
    "Premium: $85.40/mes",
    "Revise su email y para cualquier duda, comuníquese de inmediato con nosotros. Saludos Daniel Rivas",
    "Directo: (239) 282-4226",
    "Oficina: (239) 205-2047",
    "🎁 ¡Por cada 4 personas que nos refiera, gana una GIFT CARD!"
  ].join("\n"));
  assert.equal(N.buildSms(Object.assign({}, d, { idioma: "en", oficina: "ATH Insurance", plan: "myBlue Bronze 2129", prima: "850.58" })), [
    "Dear Miguel:",
    "We are ATH Insurance. We have renewed your 2027 health insurance with Florida Blue.",
    "Plan: myBlue Bronze 2129",
    "Start: 01/01/2027",
    "Premium: $850.58/month",
    "Please check your email and, if you have any questions, contact us right away. Best regards",
    "Daniel Rivas",
    "Direct: (239) 282-4226",
    "Office: (239) 205-2047",
    "🎁 For every 4 people you refer to us, you get a GIFT CARD!"
  ].join("\n"));
  /* aplicación nueva para una cliente, sin plan, fecha, prima, firma ni teléfonos */
  assert.equal(N.buildSms(make({ line: "oc", outcome: "enviada", gestion: "nueva", genero: "a", oficina: "QAgency", compania: "Ambetter", anio: "2027" })), [
    "Estimada Beatriz: Somos QAgency Insurance. Hemos completado su inscripción al seguro de salud 2027 con Ambetter.",
    "Revise su email y para cualquier duda, comuníquese de inmediato con nosotros. Saludos",
    "🎁 ¡Por cada 4 personas que nos refiera, gana una GIFT CARD!"
  ].join("\n"));
  assert.match(N.buildSms(make({ line: "oc", outcome: "enviada", gestion: "nueva", idioma: "en", compania: "Ambetter", anio: "2027" })),
    /^Dear Beatriz:\nWe are QAgency Insurance\. We have completed your 2027 health insurance enrollment with Ambetter\.\n/);
  assert.match(N.buildSms(make({ line: "oc", outcome: "enviada", gestion: "cambio", idioma: "en", compania: "UHC", anio: "2027" })),
    /^Dear Beatriz:\nWe are QAgency Insurance\. We have updated your 2027 health insurance with UnitedHealthcare\.\n/);
  assert.match(N.buildSms(make({ line: "oc", outcome: "enviada", gestion: "cambio", compania: "UHC", anio: "2027" })),
    /^Estimado Beatriz: Somos QAgency Insurance\. Hemos actualizado su seguro de salud 2027 con UnitedHealthcare\.\n/);
});

test("SMS Medicare enviada: formato oficial de la agencia en español e inglés", () => {
  const d = make({ line: "mc", outcome: "enviada", gestion: "nueva", anio: "2027", nombres: "MIGUEL ANGEL", genero: "o", oficina: "ATH Insurance",
    compania: "HUMANA", plan: "Gold Plus - Diabetes and Heart (HMO C-SNP) H1036-311-000", efectiva: "1/1/2027", prima: "0",
    firmaNombre: "ANA RUIZ", firmaTel: "(305) 555-0101", telefono: "(305) 555-0100" });
  assert.equal(N.buildSms(d), [
    "Estimado Miguel:",
    "Somos ATH Insurance. Le confirmamos que su inscripción en Medicare para el 2027 se ha completado con éxito.",
    "Compañía: Humana",
    "Plan: Gold Plus - Diabetes and Heart (HMO C-SNP) H1036-311-000",
    "Fecha de efectividad: 01/01/2027",
    "Para cualquier duda, comuníquese de inmediato con nosotros. Saludos",
    "Ana Ruiz",
    "Directo: (305) 555-0101",
    "Oficina: (305) 555-0100",
    "🎁 ¡Por cada 4 personas que nos refiera, gana una GIFT CARD!"
  ].join("\n"));
  /* la agencia sale de la oficina elegida en Ajustes */
  assert.equal(N.buildSms(Object.assign({}, d, { idioma: "en", oficina: "QAgency" })), [
    "Dear Miguel:",
    "We are QAgency Insurance. We confirm that your 2027 Medicare enrollment has been completed successfully.",
    "Company: Humana",
    "Plan: Gold Plus - Diabetes and Heart (HMO C-SNP) H1036-311-000",
    "Effective date: 01/01/2027",
    "If you have any questions, contact us right away. Regards",
    "Ana Ruiz",
    "Direct: (305) 555-0101",
    "Office: (305) 555-0100",
    "🎁 For every 4 people you refer to us, you get a GIFT CARD!"
  ].join("\n"));
  /* sin año del plan, el de la fecha efectiva; sin ninguno de los dos, sin año */
  assert.match(N.buildSms(Object.assign({}, d, { anio: "", efectiva: "2/1/2027" })), /su inscripción en Medicare para el 2027 se ha completado/);
  assert.match(N.buildSms(Object.assign({}, d, { anio: "", efectiva: "", idioma: "en" })), /We confirm that your Medicare enrollment has been completed successfully\./);
  /* una cliente, sin compañía, plan, fecha, firma ni teléfonos */
  assert.equal(N.buildSms(make({ line: "mc", outcome: "enviada", gestion: "cambio", anio: "2027", genero: "a", oficina: "QAgency" })), [
    "Estimada Beatriz:",
    "Somos QAgency Insurance. Le confirmamos que su inscripción en Medicare para el 2027 se ha completado con éxito.",
    "Para cualquier duda, comuníquese de inmediato con nosotros. Saludos",
    "🎁 ¡Por cada 4 personas que nos refiera, gana una GIFT CARD!"
  ].join("\n"));
});

test("Medicare enviada: el canal abre la nota como en OC", () => {
  const d = make({ line: "mc", outcome: "enviada", gestion: "nueva", compania: "Humana", genero: "a", hora: "14:30" });
  const first = (x) => N.buildNote(Object.assign({}, d, x)).split("\n")[0];
  assert.equal(first({ canal: "Call" }), "LI_02/01/2026: Se conversa con la cliente (02:30), se procesa app de MC con Humana.");
  assert.equal(first({ canal: "Walk In" }), "LI_02/01/2026: Se atiende a la cliente en la oficina (02:30), se procesa app de MC con Humana.");
  assert.equal(first({ canal: "Appointment", modalidad: "Zoom" }), "LI_02/01/2026: Se atiende a la cliente en cita por Zoom (02:30), se procesa app de MC con Humana.");
  assert.equal(first({ canal: "Walk In", gestion: "cambio" }), "LI_02/01/2026: Se atiende a la cliente en la oficina (02:30), se procesa cambio de plan de MC a Humana.");
  /* OC enviada sigue igual */
  assert.equal(N.buildNote(make({ line: "oc", outcome: "enviada", gestion: "nueva", compania: "UHC", canal: "Walk In" })).split("\n")[0], "LI_02/01/2026: Se procesa app OC 2026 con UHC.");
});

test("SMS Medicare enviada: cierra con la gift card de los referidos", () => {
  const d = make({ line: "mc", outcome: "enviada", gestion: "nueva", anio: "2027", oficina: "QAgency", firmaNombre: "ANA RUIZ" });
  assert.match(N.buildSms(d), /\nAna Ruiz\n🎁 ¡Por cada 4 personas que nos refiera, gana una GIFT CARD!$/);
  assert.match(N.buildSms(Object.assign({}, d, { idioma: "en" })), /\nAna Ruiz\n🎁 For every 4 people you refer to us, you get a GIFT CARD!$/);
});

test("SMS Suplementario enviada: formato oficial de la agencia en español e inglés", () => {
  const d = make({ line: "supp", outcome: "enviada", gestion: "nueva", nombres: "ALEIDA", genero: "a", oficina: "ATH Insurance",
    producto: "Hospital", compania: "Golden Rule", plan: "AdvantageGuard Hospital", efectiva: "1/1/2027", prima: "78.03", poliza: "900000123",
    firmaNombre: "ANA RUIZ", firmaTel: "(305) 555-0101", telefono: "(305) 555-0100" });
  assert.equal(N.buildSms(d), [
    "Estimada Aleida:",
    "Somos ATH Insurance. Hemos completado la solicitud de su seguro de hospital con Golden Rule",
    "Plan: AdvantageGuard Hospital",
    "Inicio: 01/01/2027",
    "Premium: $78.03/mes",
    "Policy #: 900000123",
    "Detalles en su email. Si tiene dudas, llámeme de inmediato. Saludos",
    "Ana Ruiz",
    "Directo: (305) 555-0101",
    "Oficina: (305) 555-0100"
  ].join("\n"));
  assert.equal(N.buildSms(Object.assign({}, d, { idioma: "en", oficina: "QAgency" })), [
    "Dear Aleida:",
    "We are QAgency Insurance. We have completed the application for your hospital insurance with Golden Rule",
    "Plan: AdvantageGuard Hospital",
    "Start: 01/01/2027",
    "Premium: $78.03/month",
    "Policy #: 900000123",
    "Details in your email. If you have any questions, call me right away. Regards",
    "Ana Ruiz",
    "Direct: (305) 555-0101",
    "Office: (305) 555-0100"
  ].join("\n"));
  /* cada producto se nombra en los dos idiomas */
  C.LINES.supp.productos.forEach((p) => {
    const es = N.buildSms(make({ line: "supp", outcome: "enviada", producto: p.v, compania: "Allstate" }));
    const en = N.buildSms(make({ line: "supp", outcome: "enviada", producto: p.v, compania: "Allstate", idioma: "en" }));
    assert.match(es, new RegExp("la solicitud de su " + p.sms + " con Allstate\\n"), p.v);
    assert.ok(p.smsEn, p.v + " sin nombre en inglés");
    assert.match(en, new RegExp("the application for your " + p.smsEn + " with Allstate\\n"), p.v);
  });
  /* sin compañía, plan, fecha, prima, póliza, firma ni teléfonos */
  assert.equal(N.buildSms(make({ line: "supp", outcome: "enviada", producto: "Dental", oficina: "QAgency" })), [
    "Estimado Beatriz:",
    "Somos QAgency Insurance. Hemos completado la solicitud de su seguro dental",
    "Detalles en su email. Si tiene dudas, llámeme de inmediato. Saludos"
  ].join("\n"));
});

test("email Obamacare: parte 1 con la póliza y parte 2 con lo que pide el Mercado", () => {
  const d = make({ line: "oc", outcome: "enviada", gestion: "nueva", anio: "2027", compania: "Florida Blue", plan: "myBlue Essentials Silver",
    efectiva: "01/01/2027", prima: "85.4", firmaNombre: "Daniel Rivas", personas: familia,
    docs: [{ cat: "immigration", persona: "JUAN CARLOS DIAZ", fecha: "03/01/2027", enviado: true },
           { cat: "income", persona: "BEATRIZ DIAZ", fecha: "02/12/2027" }] });
  assert.equal(N.buildEmail(d, 1), [
    "Estimado Beatriz:",
    "Adjunto documentos por su póliza del 2027 con Florida Blue, ya la aplicación fue completada.",
    "Cobertura a partir del 01/01/2027",
    "PLAN: myBlue Essentials Silver",
    "Adjuntamos detalles de beneficios del plan",
    "Prima Mensual: $85.40"
  ].join("\n"));
  assert.equal(N.buildEmail(d, 2), [
    "MARKETPLACE SOLICITA:",
    "Pruebas de Estatus Migratorio (Juan), fecha límite 03/01/2027",
    "Pruebas de Ingresos (Beatriz), fecha límite 02/12/2027",
    "",
    "Por favor comuníquese con nosotros por cualquier duda.",
    "",
    "Saludos",
    "Daniel Rivas"
  ].join("\n"));
  const en = Object.assign({}, d, { idioma: "en" });
  assert.equal(N.buildEmail(en, 1), [
    "Dear Beatriz:",
    "Attached are documents for your 2027 policy with Florida Blue, your application is complete.",
    "Effective date: 01/01/2027",
    "PLAN: myBlue Essentials Silver",
    "Attached is a detailed description of your benefits with this plan.",
    "Premium Monthly Payment: $85.40"
  ].join("\n"));
  assert.equal(N.buildEmail(en, 2), [
    "MARKETPLACE IS REQUESTING:",
    "Proof of Immigration Status (Juan), Due Date 03/01/2027",
    "Proof of Income (Beatriz), Due Date 02/12/2027",
    "",
    "Please feel free to contact us, if you have any questions or concerns.",
    "",
    "Best Regards,",
    "Daniel Rivas"
  ].join("\n"));
  /* una sola persona no lleva nombre; sin documentos pedidos la parte 2 es solo el cierre */
  assert.match(N.buildEmail(Object.assign({}, d, { docs: [{ cat: "income", persona: "BEATRIZ DIAZ", fecha: "02/12/2027" }] }), 2),
    /^MARKETPLACE SOLICITA:\nPruebas de Ingresos, fecha límite 02\/12\/2027\n\n/);
  assert.equal(N.buildEmail(Object.assign({}, d, { docs: [] }), 2), "Por favor comuníquese con nosotros por cualquier duda.\n\nSaludos\nDaniel Rivas");
  assert.match(N.buildEmail(Object.assign({}, d, { genero: "a" }), 1), /^Estimada Beatriz:\n/);
  assert.equal(N.buildEmail(make({ line: "oc", outcome: "pendiente" }), 1), "", "solo para una app enviada");
  assert.equal(N.buildEmail(make({ line: "mc", outcome: "enviada" }), 2), "");
  assert.ok(C.MKPL_DOCS.every((c) => /^Pruebas de /.test(c.es) && /^Proof of /.test(c.en)), "las 11 en los dos idiomas");
});

test("email Obamacare: asunto, las dos líneas de Tener en cuenta y el teléfono de Customer Service", () => {
  const d = make({ line: "oc", outcome: "enviada", gestion: "nueva", anio: "2027", compania: "Florida Blue", efectiva: "01/01/2027", prima: "85.4" });
  const en = Object.assign({}, d, { idioma: "en" });
  assert.equal(N.buildEmail(d, "subject"), "LE: APLICACION - OBAMACARE 2027");
  assert.equal(N.buildEmail(en, "subject"), "LE: APPLICATION - OBAMACARE 2027");
  assert.equal(N.buildEmail(Object.assign({}, d, { gestion: "renovacion" }), "subject"), "LE: APLICACION - OBAMACARE 2027");
  assert.equal(N.buildEmail(Object.assign({}, d, { gestion: "cambio" }), "subject"), "LE: ACTUALIZACION - OBAMACARE 2027");
  assert.equal(N.buildEmail(Object.assign({}, en, { gestion: "cambio" }), "subject"), "LE: UPDATE - OBAMACARE 2027");
  /* sin año, el de la cobertura */
  assert.equal(N.buildEmail(Object.assign({}, d, { anio: "" }), "subject"), "LE: APLICACION - OBAMACARE 2027");
  assert.equal(N.buildEmail(d, "keep"), [
    "Si su plan tiene prima a pagar, favor hacer el pago de la prima antes del 01/01/2027 llamando a (800) 352-2583",
    "En caso de no recibir sus tarjetas a la fecha de inicio de la cobertura, debera comunicarse con FLORIDA BLUE para revisar el estatus del envío."
  ].join("\n"));
  assert.equal(N.buildEmail(en, "keep"), [
    "If you have a monthly premium payment, please make sure you make your first payment before 01/01/2027 by calling (800) 352-2583",
    "In case you have not received your Insurance cards by your effective date, you need to contact FLORIDA BLUE to verify your card's delivery status."
  ].join("\n"));
  assert.equal(N.buildEmail(d, "cs"), "(800) 352-2583");
  const tel = (compania) => N.buildEmail(Object.assign({}, d, { compania }), "cs");
  assert.equal(tel("Ambetter"), "(877) 687-1169");
  assert.equal(tel("UnitedHealthcare"), "(888) 200-0405");
  assert.equal(tel("Cigna"), "(866) 494-2111");
  assert.equal(tel("Oscar"), "(855) OSCAR-55");
  assert.match(N.buildEmail(Object.assign({}, d, { compania: "Ambetter" }), "keep"), /debera comunicarse con AMBETTER para revisar/);
  /* sin teléfono conocido: Wellpoint, y Florida Blue fuera de Florida */
  const falta = (extra) => N.warnings(Object.assign({}, d, extra), "").filter((x) => /falta el teléfono de la compañía/i.test(x));
  assert.equal(tel("Wellpoint"), "");
  assert.match(N.buildEmail(Object.assign({}, d, { compania: "Wellpoint" }), "keep"), /llamando a \.\.\.\.\.\.\.\.\.\.\.\n/);
  assert.equal(falta({ compania: "Wellpoint" }).length, 1);
  const ga = { direccion: "100 Peachtree St, Atlanta, GA 30301" };
  assert.equal(N.buildEmail(Object.assign({}, d, ga), "cs"), "");
  assert.equal(falta(ga).length, 1);
  assert.equal(N.buildEmail(Object.assign({}, d, { direccion: "123 Main St, Miami, FL 33101" }), "cs"), "(800) 352-2583");
  assert.equal(falta({}).length, 0);
  assert.equal(falta({ compania: "" }).length, 0, "sin compañía no se avisa del teléfono");
  /* solo en una app de Obamacare enviada */
  ["subject", "keep", "cs"].forEach((p) => {
    assert.equal(N.buildEmail(make({ line: "oc", outcome: "pendiente", compania: "Florida Blue" }), p), "", p);
    assert.equal(N.buildEmail(make({ line: "supp", outcome: "enviada", compania: "Florida Blue" }), p), "", p);
  });
  assert.equal(falta({ outcome: "pendiente" }).length + falta({ outcome: "pendiente", compania: "Wellpoint" }).length, 0);
});

test("email de cotización: Obamacare pendiente que revisará los planes", () => {
  const blue = { compania: "Florida Blue", plan: "Blue Care Silver 1477C", prima: "0" };
  const d = make({ line: "oc", outcome: "pendiente", revisaPlanes: true, efectiva: "01/01/2027", planes: [blue] });
  assert.equal(N.buildEmail(d, 1), [
    "Estimado Beatriz",
    "Adjunto cotizaciones para su plan médico a través de la compañía: FLORIDA BLUE",
    "NOMBRE DEL PLAN: BLUE CARE SILVER 1477C",
    "Prima Mensual: $0.00",
    "Cobertura a partir del 01/01/2027"
  ].join("\n"));
  assert.equal(N.buildEmail(d, 2), "", "una sola parte");
  assert.equal(N.buildEmail(Object.assign({}, d, { idioma: "en" }), 1), [
    "Dear Beatriz",
    "Attached is a quote for an Insurance Health Plan",
    "with the following company: FLORIDA BLUE",
    "Name of the plan: BLUE CARE SILVER 1477C",
    "Monthly Premium Payment: $0.00",
    "Effective Date: 01/01/2027"
  ].join("\n"));
  assert.match(N.buildEmail(Object.assign({}, d, { genero: "a" }), 1), /^Estimada Beatriz\n/);
  /* varios planes de la misma compañía: la compañía una vez y cada plan con su prima */
  const otro = { compania: "Florida Blue", plan: "myBlue Essentials Silver", prima: "45" };
  const dos = Object.assign({}, d, { planes: [blue, otro, { compania: "", plan: "" }] });
  assert.equal(N.buildEmail(dos, 1), [
    "Estimado Beatriz",
    "Adjunto cotizaciones para su plan médico a través de la compañía: FLORIDA BLUE",
    "",
    "NOMBRE DEL PLAN: BLUE CARE SILVER 1477C",
    "Prima Mensual: $0.00",
    "",
    "NOMBRE DEL PLAN: MYBLUE ESSENTIALS SILVER",
    "Prima Mensual: $45.00",
    "",
    "Cobertura a partir del 01/01/2027"
  ].join("\n"));
  assert.equal(N.buildEmail(Object.assign({}, dos, { idioma: "en" }), 1), [
    "Dear Beatriz",
    "Attached are quotes for Insurance Health Plans",
    "with the following company: FLORIDA BLUE",
    "",
    "Name of the plan: BLUE CARE SILVER 1477C",
    "Monthly Premium Payment: $0.00",
    "",
    "Name of the plan: MYBLUE ESSENTIALS SILVER",
    "Monthly Premium Payment: $45.00",
    "",
    "Effective Date: 01/01/2027"
  ].join("\n"));
  /* varias compañías: cada una con sus planes */
  const amb = { compania: "Ambetter", plan: "Everyday Bronze", prima: "12.5" };
  const tres = Object.assign({}, d, { planes: [blue, amb, otro] });
  assert.equal(N.buildEmail(tres, 1), [
    "Estimado Beatriz",
    "Adjunto cotizaciones para su plan médico a través de las compañías:",
    "",
    "Compañía: FLORIDA BLUE",
    "NOMBRE DEL PLAN: BLUE CARE SILVER 1477C",
    "Prima Mensual: $0.00",
    "NOMBRE DEL PLAN: MYBLUE ESSENTIALS SILVER",
    "Prima Mensual: $45.00",
    "",
    "Compañía: AMBETTER",
    "NOMBRE DEL PLAN: EVERYDAY BRONZE",
    "Prima Mensual: $12.50",
    "",
    "Cobertura a partir del 01/01/2027"
  ].join("\n"));
  assert.equal(N.buildEmail(Object.assign({}, tres, { idioma: "en" }), 1), [
    "Dear Beatriz",
    "Attached are quotes for Insurance Health Plans",
    "with the following companies:",
    "",
    "Company: FLORIDA BLUE",
    "Name of the plan: BLUE CARE SILVER 1477C",
    "Monthly Premium Payment: $0.00",
    "Name of the plan: MYBLUE ESSENTIALS SILVER",
    "Monthly Premium Payment: $45.00",
    "",
    "Company: AMBETTER",
    "Name of the plan: EVERYDAY BRONZE",
    "Monthly Premium Payment: $12.50",
    "",
    "Effective Date: 01/01/2027"
  ].join("\n"));
  /* sin marcar «Revisará los planes» o sin planes no hay email; entra en Copiar siguiente */
  assert.equal(N.buildEmail(Object.assign({}, d, { revisaPlanes: false }), 1), "");
  assert.equal(N.buildEmail(Object.assign({}, d, { planes: [] }), 1), "");
  assert.deepEqual(N.copyOrder(d).slice(-1), ["email1"]);
  assert.ok(!N.copyOrder(Object.assign({}, d, { revisaPlanes: false })).includes("email1"));
});

test("email Suplementario: aplicación enviada en español e inglés", () => {
  const d = make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Dental", compania: "FLORIDA BLUE (FCL)",
    poliza: "FB123456", efectiva: "12/01/2026", prima: "38.5", firmaNombre: "DANIEL RIVAS" });
  assert.equal(N.buildEmail(d, 1), [
    "Estimado Beatriz",
    "",
    "Se adjunta Aplicación al Plan:",
    "Compañía Florida Blue",
    "ID # FB123456",
    "Cobertura a partir del 12/01/2026",
    "Prima Mensual: $38.50",
    "Le llegará por correo postal la póliza, beneficios.",
    "Cualquier duda u observación se puede comunicar con nosotros.",
    "",
    "Saludos,",
    "Daniel Rivas"
  ].join("\n"));
  assert.equal(N.buildEmail(Object.assign({}, d, { idioma: "en" }), 1), [
    "Dear Beatriz",
    "",
    "We attached the application for:",
    "Company Florida Blue",
    "ID # FB123456",
    "Effective date: 12/01/2026",
    "Monthly Premium: $38.50",
    "Please feel free to contact us, if you have any questions or concerns.",
    "",
    "Best regards,",
    "Daniel Rivas"
  ].join("\n"));
  assert.match(N.buildEmail(Object.assign({}, d, { genero: "a" }), 1), /^Estimada Beatriz\n/);
  /* una sola parte; sin póliza no hay línea de ID */
  assert.equal(N.buildEmail(d, 2), "");
  assert.doesNotMatch(N.buildEmail(Object.assign({}, d, { poliza: "" }), 1), /ID #/);
  assert.match(N.buildEmail(Object.assign({}, d, { compania: "UHC" }), 1), /\nCompañía UnitedHealthcare\n/);
  /* la cotización tiene su propio email (abajo) */
  assert.match(N.buildEmail(make({ line: "supp", outcome: "cotizacion" }), 1), /^Estimado Beatriz\n\nSe envía cotización/);
});

test("SMS: cuenta caracteres y mensajes", () => {
  assert.deepEqual(N.smsInfo("Hola"), { length: 4, parts: 1, unicode: false });
  assert.deepEqual(N.smsInfo("Señor ¿listo?"), { length: 13, parts: 1, unicode: false });
  assert.equal(N.smsInfo("aplicación").unicode, true);
  assert.equal(N.smsInfo("a".repeat(161)).parts, 2);
  assert.equal(N.smsInfo("á".repeat(71)).parts, 2);
});

/* --------------------------------------------------- nombres de archivo -- */

test("nombres de archivo que no cambian: My Plans & Programs, SOA sin cambios y Suplementario", () => {
  const names = (d) => Object.fromEntries(N.buildFileNames(d).map((f) => [f.k, f.name]));
  const oc = names(make({ line: "oc", nombres: "KARLA ALEJANDRA", apellidos: "AGUILAR", fecha: "03/20/2026", compania: "Ambetter", efectiva: "04/01/2026", pagoFecha: "09/01/2026" }));
  assert.equal(oc.plans, "Aguilar, Karla Alejandra - OC_My Plans & Programs Ambetter 2026 APR");

  /* SOA de Medicare sin cambios: sin la compañía */
  const mc = names(make({ line: "mc", outcome: "sincambio", nombres: "ANGEL", apellidos: "CASO", fecha: "09/15/2026", soaFecha: "09/10/2026", compania: "Humana", efectiva: "10/01/2026" }));
  assert.deepEqual(mc, { soa: "Caso, Angel - Medicare_SOA 2026 SEP" });

  const accident = names(make({ line: "supp", producto: "Accident", nombres: "BEATRIZ ELENA", apellidos: "DIAZ", compania: "ALLSTATE", efectiva: "01/01/2027" }));
  assert.equal(accident.appsummary, "Diaz, Beatriz Elena - Accident_Allstate 2027 JAN");

  const dental = names(make({ line: "supp", producto: "Dental", nombres: "ADNIE VIRGEN", apellidos: "TELLEZ ARMAS", compania: "Florida Blue", pagoFecha: "07/02/2026", efectiva: "07/01/2026" }));
  assert.equal(dental.payment, "Tellez Armas, Adnie Virgen - Payment Confirmation - Dental_FB 2026 JUL");
  assert.equal(dental.card, "Tellez Armas, Adnie Virgen - Dental_FB - CARD 2026 JUL");

  const st = names(make({ line: "supp", producto: "Short Term", nombres: "FLORINDA", apellidos: "VARONA DE LA PEÑA", compania: "Golden Rule", efectiva: "12/31/2026" }));
  assert.equal(st.appsummary, "Varona De La Pena, Florinda - Short Term_GR 2026 DEC");
  const life = names(make({ line: "supp", producto: "Life", nombres: "KATHERINA", apellidos: "COLLANTES VASQUEZ", compania: "Occidental", efectiva: "05/15/2026" }));
  assert.equal(life.appsummary, "Collantes Vasquez, Katherina - Life_Occidental 2026 MAY");
});

/* Formatos oficiales de la agencia (Lastname, Firstname OptionalMiddleName - …). */
const cliente = { nombres: "BEATRIZ ELENA", apellidos: "DIAZ", fecha: "11/15/2026" };
const conCliente = (extra) => make(Object.assign({}, cliente, extra));
const fileOf = (extra, k) => (N.buildFileNames(conCliente(extra)).find((f) => f.k === k) || {}).name;

test("archivo oficial: App Summary (OC) con el año del plan", () => {
  assert.equal(fileOf({ line: "oc", anio: "2027", efectiva: "01/01/2027" }, "appsummary"), "Diaz, Beatriz Elena - OC_App Summary 2027");
  /* sin año del plan: el de la cobertura y, si tampoco hay, el de la nota */
  assert.equal(fileOf({ line: "oc", anio: "", efectiva: "01/01/2027" }, "appsummary"), "Diaz, Beatriz Elena - OC_App Summary 2027");
  assert.equal(fileOf({ line: "oc", anio: "", efectiva: "" }, "appsummary"), "Diaz, Beatriz Elena - OC_App Summary 2026");
});

test("archivo oficial: Consent (OC) con la compañía y el mes de la nota", () => {
  assert.equal(fileOf({ line: "oc", compania: "AMBETTER" }, "consent"), "Diaz, Beatriz Elena - OC_Consent Ambetter 2026 NOV");
  assert.equal(fileOf({ line: "oc", outcome: "pendiente", compania: "AMBETTER" }, "consent"), "Diaz, Beatriz Elena - OC_Consent Ambetter 2026 NOV");
});

test("archivo oficial: Eligibility letter (OC) con el año del plan", () => {
  assert.equal(fileOf({ line: "oc", anio: "2027", efectiva: "01/01/2027" }, "eligibility"), "Diaz, Beatriz Elena - OC_EligibilityNotice 2027");
});

test("archivo oficial: Cancelled OC con el mes en que iba a empezar la cobertura", () => {
  assert.equal(fileOf({ line: "oc", outcome: "cancelada", compania: "AMBETTER", efectiva: "01/01/2027" }, "plans"),
    "Diaz, Beatriz Elena - OC_My Plans & Programs Ambetter 2027 JAN CANCELLED");
});

test("archivo oficial: Terminated OC con el mes en que termina la cobertura", () => {
  const d = conCliente({ line: "oc", outcome: "cancelada", gestion: "cambio", tipoCancel: "terminated", compania: "AMBETTER",
    efectiva: "01/01/2026", fechaTermino: "01/31/2027", motivoCancel: "Seguro por el trabajo", net: { plans: true } });
  assert.deepEqual(N.buildFileNames(d).map((f) => [f.k, f.label, f.name]),
    [["plans", "My Plans & Programs (TERMINATED)", "Diaz, Beatriz Elena - OC_My Plans & Programs Ambetter 2027 JAN TERMINATED"]]);
  assert.match(N.buildNote(d), /\nDocs en mi folder del NETW: My Plans & Programs \(TERMINATED\)\.$/);
  /* sin la fecha de terminación, se avisa */
  assert.ok(N.warnings(Object.assign({}, d, { fechaTermino: "" }), "").some((x) => /fecha de terminación/.test(x)));
  assert.ok(!N.warnings(d, "").some((x) => /fecha de terminación/.test(x)));
});

test("archivo oficial: App MC con la compañía", () => {
  assert.equal(fileOf({ line: "mc", compania: "HUMANA", efectiva: "01/01/2027" }, "appsummary"), "Diaz, Beatriz Elena - Medicare_Humana_App 2027 JAN");
});

test("archivo oficial: SOA de MC con app o cambio lleva la compañía", () => {
  assert.equal(fileOf({ line: "mc", outcome: "enviada", gestion: "nueva", compania: "HUMANA", soaFecha: "11/10/2026" }, "soa"),
    "Diaz, Beatriz Elena - Medicare_Humana_SOA 2026 NOV");
  assert.equal(fileOf({ line: "mc", outcome: "enviada", gestion: "cambio", compania: "HUMANA", soaFecha: "11/10/2026" }, "soa"),
    "Diaz, Beatriz Elena - Medicare_Humana_SOA 2026 NOV");
});

test("archivo oficial: Payment confirmation (OC)", () => {
  assert.equal(fileOf({ line: "oc", compania: "FLORIDA BLUE", pagoFecha: "07/02/2026" }, "payment"),
    "Diaz, Beatriz Elena - Payment Confirmation - OC_FB 2026 JUL");
});

/* Docs Submitted: un archivo por documento enviado, con el mes de la nota. */
const rosa = { line: "oc", outcome: "enviada", nombres: "ROSA", apellidos: "PEREZ LIMA", fecha: "11/15/2026" };
const docsub = (docs, extra) => N.buildFileNames(make(Object.assign({}, rosa, { docs }, extra))).filter((f) => /^docsub/.test(f.k));

test("archivo oficial: Docs submitted (OC) del titular", () => {
  const doc = { cat: "immigration", persona: "ROSA PEREZ LIMA", enviado: true, doc: "Permanent Resident Card, Green Card (I-551)" };
  assert.deepEqual(docsub([doc]).map((f) => [f.k, f.label, f.name]), [[N.docKey(doc), "Docs Submitted: Estatus migratorio",
    "Perez Lima, Rosa - OC_Docs Submitted_Immigration status 2026 NOV"]]);
  /* sin persona, o con solo el nombre de pila del titular, también es del titular */
  assert.equal(docsub([{ cat: "immigration", persona: "", enviado: true }])[0].name, "Perez Lima, Rosa - OC_Docs Submitted_Immigration status 2026 NOV");
  assert.equal(docsub([{ cat: "immigration", persona: "ROSA", enviado: true }])[0].name, "Perez Lima, Rosa - OC_Docs Submitted_Immigration status 2026 NOV");
});

test("archivo oficial: Docs submitted (OC) de un dependiente o cónyuge, con su nombre", () => {
  const doc = { cat: "immigration", persona: "YANET SOTO MESA", enviado: true, doc: "Employment Authorization Card (I-766)" };
  assert.deepEqual(docsub([doc]).map((f) => [f.k, f.label, f.name]), [[N.docKey(doc), "Docs Submitted: Estatus migratorio (Yanet)",
    "Perez Lima, Rosa - OC_Docs Submitted_Yanet_Immigration status 2026 NOV"]]);
});

test("Docs submitted: el documento del titular sigue siendo suyo aunque se corrija el nombre", () => {
  const principal = /- OC_Docs Submitted_Immigration status 2026 NOV$/;
  const leido = { cat: "immigration", persona: "ROSA PEREZ LIMA", enviado: true, titular: true };
  /* con acento o con segundo nombre después de leer el documento */
  assert.match(docsub([leido], { apellidos: "PÉREZ LIMA" })[0].name, principal);
  assert.match(docsub([leido], { nombres: "ROSA MARIA" })[0].name, principal);
  /* leído antes de escribir el nombre del cliente */
  assert.match(docsub([Object.assign({}, leido, { persona: "" })])[0].name, principal);
  /* sin la marca, el nombre se compara sin acentos */
  assert.match(docsub([{ cat: "immigration", persona: "ROSA PÉREZ LIMA", enviado: true }])[0].name, principal);
  /* el de un dependiente sigue siendo suyo */
  assert.match(docsub([{ cat: "immigration", persona: "YANET SOTO MESA", enviado: true, titular: false }])[0].name, /_Yanet_Immigration status/);
});

test("Docs submitted: solo lo enviado, uno por documento, y va a la nota si se marca", () => {
  const titular = { cat: "immigration", persona: "ROSA PEREZ LIMA", enviado: true };
  const dep = { cat: "immigration", persona: "YANET SOTO MESA", enviado: true };
  const pend = { cat: "income", persona: "ROSA PEREZ LIMA", fecha: "02/12/2027" };
  assert.deepEqual(docsub([titular, pend, dep]).map((f) => f.name), [
    "Perez Lima, Rosa - OC_Docs Submitted_Immigration status 2026 NOV",
    "Perez Lima, Rosa - OC_Docs Submitted_Yanet_Immigration status 2026 NOV"]);
  assert.notEqual(N.docKey(titular), N.docKey(dep));
  assert.deepEqual(docsub([pend]), []);
  const d = make(Object.assign({}, rosa, { docs: [dep], net: { [N.docKey(dep)]: true } }));
  assert.match(N.buildNote(d), /\nDocs en mi folder del NETW: Docs Submitted: Estatus migratorio \(Yanet\)\.$/);
});

test("Docs submitted: sin documentos enviados, los archivos de Obamacare no cambian", () => {
  const d = make(Object.assign({}, rosa, { docs: [{ cat: "income", persona: "ROSA PEREZ LIMA" }] }));
  assert.deepEqual(N.buildFileNames(d).map((f) => f.k), ["appsummary", "eligibility", "plans", "payment", "consent"]);
  assert.deepEqual(N.networkOf(d).map((n) => n.k), ["appsummary", "eligibility", "plans", "payment", "consent"]);
});

/* ----------------------------------------------------------- compañías -- */

test("compañías oficiales de Obamacare y Medicare, en el orden de la agencia", () => {
  assert.deepEqual(N.carrierOptions("oc").map((o) => o.l), ["Florida Blue", "BCBS of", "Ambetter", "Wellpoint", "UHC", "Oscar", "Cigna"]);
  assert.deepEqual(N.carrierOptions("mc").map((o) => o.l),
    ["Humana", "UHC", "Aetna", "Florida Blue", "BCBS of", "Healthspring", "Devoted", "Freedom", "Simply"]);
});

test("compañía leída de un documento: su opción oficial, o Otra con el nombre", () => {
  const sel = (line, name) => N.carrierChoice(line, name).sel;
  ["FLORIDA BLUE", "AMBETTER", "WELLPOINT", "UNITED HEALTHCARE", "OSCAR", "CIGNA"].forEach((n) => assert.equal(sel("oc", n), n, n));
  ["HUMANA", "UNITED HEALTHCARE", "AETNA", "FLORIDA BLUE", "HEALTHSPRING", "DEVOTED HEALTH", "FREEDOM HEALTH", "SIMPLY HEALTHCARE"]
    .forEach((n) => assert.equal(sel("mc", n), n, n));
  /* Healthspring ya no es Cigna */
  assert.equal(sel("mc", "CIGNA HEALTHSPRING"), "HEALTHSPRING");
  ["MOLINA", "AVMED", "AETNA CVS HEALTH", "HUMANA"].forEach((n) => assert.equal(sel("oc", n), N.CARRIER_OTHER, n));
  ["WELLCARE", "MOLINA", "CIGNA"].forEach((n) => assert.equal(sel("mc", n), N.CARRIER_OTHER, n));
  assert.deepEqual(N.carrierChoice("mc", "BCBS OF GA"), { sel: "BCBS OF", state: "GA" });
  assert.deepEqual(N.carrierChoice("oc", ""), { sel: "", state: "" });
  /* lo elegido vuelve a ser el nombre que usan la nota, el reporte y los archivos */
  assert.equal(N.carrierFromChoice("mc", "BCBS OF", "ga"), "BCBS OF GA");
  assert.equal(N.carrierFromChoice("mc", "BCBS OF", ""), "BCBS OF");
  assert.equal(N.carrierFromChoice("oc", "AMBETTER", "GA"), "AMBETTER");
});

test("Obamacare fuera de Florida: Blue Cross Blue Shield de otro estado es BCBS of con su estado", () => {
  assert.deepEqual(N.carrierChoice("oc", "BCBS OF NC"), { sel: "BCBS OF", state: "NC" });
  assert.equal(N.carrierFromChoice("oc", "BCBS OF", "nc"), "BCBS OF NC");
  assert.equal(N.carrierShort("oc", "BCBS OF NC"), "BCBS of NC");
  assert.equal(N.carrierName("oc", "BCBS OF NC"), "BCBS of NC");
  assert.equal(fileOf({ line: "oc", compania: "BCBS OF NC", efectiva: "01/01/2027" }, "plans"), "Diaz, Beatriz Elena - OC_My Plans & Programs BCBS of NC 2027 JAN");
  /* leída de un documento */
  const leida = (t) => X.extract("My plans & programs\nPlan ID: 11512NC0400099\n" + t + "\nYou pay $10.00/month", "document.pdf", "oc").fields.compania;
  assert.equal(leida("Blue Cross and Blue Shield of NC"), "BCBS OF NC");
  assert.equal(leida("Blue Cross Blue Shield of Texas"), "BCBS OF TX");
  assert.equal(leida("BlueCross BlueShield of North Carolina"), "BCBS OF NC");
  assert.equal(leida("Blue Cross and Blue Shield of Florida"), "FLORIDA BLUE", "la de Florida es Florida Blue");
  assert.equal(leida("Florida Blue"), "FLORIDA BLUE");
  /* el teléfono de la compañía que trae el documento va en el email, antes que el de la lista */
  const d = make({ line: "oc", outcome: "enviada", gestion: "nueva", anio: "2027", compania: "BCBS OF NC", efectiva: "01/01/2027" });
  assert.equal(N.buildEmail(d, "cs"), "");
  assert.ok(N.warnings(d, "").some((x) => /falta el teléfono de la compañía \(BCBS of NC\)/.test(x)));
  const conTel = Object.assign({}, d, { telCompania: "1-800-324-4973" });
  assert.equal(N.buildEmail(conTel, "cs"), "(800) 324-4973");
  assert.match(N.buildEmail(conTel, "keep"), /llamando a \(800\) 324-4973\nEn caso .* comunicarse con BCBS OF NC para/);
  assert.ok(!N.warnings(conTel, "").some((x) => /teléfono de la compañía/.test(x)));
  assert.equal(N.buildEmail(Object.assign({}, conTel, { compania: "Florida Blue", direccion: "1 Main St, Atlanta, GA 30301" }), "cs"), "(800) 324-4973");
});

test("BCBS of, Healthspring y Otra en la nota, el reporte y los archivos", () => {
  const d = conCliente({ line: "mc", outcome: "enviada", gestion: "nueva", codigoQ: "1234", compania: "BCBS OF GA",
    efectiva: "01/01/2027", soaFecha: "11/10/2026" });
  assert.match(N.buildNote(d), /^LI_11\/15\/2026: Se conversa con .+, se procesa app de MC con BCBS of GA\.\n/);
  assert.equal(N.buildReport(d), "Q1234 - Diaz, Beatriz Elena - App MC BCBS of GA 2026 - Call (LI)");
  assert.deepEqual(N.buildFileNames(d).map((f) => f.name), [
    "Diaz, Beatriz Elena - Medicare_BCBS of GA_SOA 2026 NOV",
    "Diaz, Beatriz Elena - Medicare_BCBS of GA_App 2027 JAN"
  ]);
  assert.equal(N.carrierShort("mc", "HEALTHSPRING"), "Healthspring");
  assert.equal(N.buildReport(Object.assign({}, d, { compania: "HEALTHSPRING" })), "Q1234 - Diaz, Beatriz Elena - App MC Healthspring 2026 - Call (LI)");
  /* una compañía fuera de la lista va con su nombre */
  assert.equal(fileOf({ line: "oc", compania: "MOLINA", efectiva: "01/01/2027" }, "plans"), "Diaz, Beatriz Elena - OC_My Plans & Programs Molina 2027 JAN");
  assert.equal(fileOf({ line: "mc", compania: "SUNRISE HEALTH", efectiva: "01/01/2027" }, "appsummary"), "Diaz, Beatriz Elena - Medicare_Sunrise Health_App 2027 JAN");
  /* las formas cortas de siempre */
  assert.equal(N.carrierShort("oc", "FLORIDA BLUE"), "FB");
  assert.equal(N.carrierShort("mc", "UNITED HEALTHCARE"), "UHC");
  assert.equal(N.carrierShort("mc", "CIGNA"), "Cigna");
  assert.equal(N.carrierShort("supp", "GOLDEN RULE"), "GR");
});

test("nota de Medicare: NPN y sin Writing ID", () => {
  const note = N.buildNote(make({ line: "mc", outcome: "enviada", gestion: "nueva", agente: "Ana Torres", agenteIni: "LI", escritura: "1234567" }));
  assert.match(note, /\nNPN: LI(\n|$)/);
  assert.doesNotMatch(note, /Writing ID|1234567/);
});

/* -------------------------------------------------------------- avisos -- */

test("documentos del Mercado: las 11 inconsistencias de healthcare.gov", () => {
  assert.deepEqual(C.MKPL_DOCS.map((c) => c.v), ["income", "immigration", "citizenship", "ssn", "esi", "medicaid", "medicare", "aian", "tricare", "va", "peace"]);
  assert.ok(C.MKPL_DOCS.find((c) => c.v === "income").docs.includes("Pay stub"));
  assert.ok(C.MKPL_DOCS.find((c) => c.v === "immigration").docs.includes("Employment Authorization Card (I-766)"));
  assert.ok(C.MKPL_DOCS.every((c) => c.docs.length >= 2));
});

test("avisos de Obamacare: fecha tope, cobertura, conteo de taxes y motivo de cancelación", () => {
  const w = N.warnings(make({ line: "oc", outcome: "enviada", codigoQ: "1", compania: "UHC", pagoEstado: "PAYMENT", hogarDoc: "4",
    personas: [{ titular: true, taxes: true, cobertura: false }], docs: [{ cat: "income", persona: "BEATRIZ DIAZ" }] }), "");
  assert.ok(w.some((x) => /fecha tope de ingresos \(Beatriz\)/.test(x)));
  const sent = N.warnings(make({ line: "oc", outcome: "enviada", docs: [{ cat: "immigration", persona: "BEATRIZ DIAZ", enviado: true }] }), "");
  assert.ok(sent.some((x) => /fecha tope de estatus migratorio/.test(x)), "también si ya se envió");
  assert.ok(w.some((x) => /quién pide cobertura/.test(x)));
  assert.ok(w.some((x) => /indica 4 en los taxes y la lista tiene 1/.test(x)));
  assert.ok(N.warnings(make({ line: "oc", outcome: "cancelada", compania: "UHC" }), "").some((x) => /motivo de la cancelación/.test(x)));
});

test("avisos: faltantes y Seguro Social en la nota", () => {
  const w = N.warnings(make({ line: "oc", outcome: "enviada", ini: "", nombres: "", apellidos: "" }), "SSN 123-45-6789");
  assert.ok(w.some((x) => /quién hace la nota/.test(x)));
  assert.ok(w.some((x) => /nombre del cliente/.test(x)));
  assert.ok(w.some((x) => /código Q/.test(x)));
  assert.ok(w.some((x) => /referencia de pago/.test(x)));
  assert.ok(w.some((x) => /Seguro Social/.test(x)));
  assert.deepEqual(N.warnings(make({ line: "oc", outcome: "pendiente" }), "todo bien"), []);
});

/* ------------------------------------------------------------- fase 1 -- */

test("copiar siguiente: el orden salta lo que la situación no muestra", () => {
  const order = (extra) => N.copyOrder(make(extra));
  assert.deepEqual(order({ line: "oc", outcome: "enviada", gestion: "nueva", compania: "Florida Blue" }),
    ["note", "task", "report", "emailSubject", "email1", "emailKeep", "emailCs", "email2", "sms"]);
  /* sin teléfono de la compañía no hay Customer Service que copiar */
  assert.deepEqual(order({ line: "oc", outcome: "enviada", gestion: "nueva", compania: "Wellpoint" }),
    ["note", "task", "report", "emailSubject", "email1", "emailKeep", "email2", "sms"]);
  assert.deepEqual(order({ line: "supp", outcome: "enviada", gestion: "nueva" }), ["note", "task", "report", "email1", "sms"]);
  assert.deepEqual(order({ line: "supp", outcome: "cotizacion" }), ["note", "task", "email1", "sms"]);
  /* el SMS le dice al cliente que revise el email: va después del email (en Medicare no hay email) */
  assert.deepEqual(order({ line: "mc", outcome: "enviada", gestion: "nueva" }).slice(-1), ["sms"]);
  assert.deepEqual(order({ line: "mc", outcome: "sincambio" }), ["note", "task", "report"]);
  assert.deepEqual(order({ line: "oc", outcome: "pendiente" }), ["note", "task"]);
});

test("enlaces para abrir el SMS y el email con el texto listo", () => {
  assert.equal(N.smsLink("(305) 555-0100", "Hola á"), "sms:+13055550100?body=Hola%20%C3%A1");
  assert.equal(N.smsLink("1 305 555 0100", "x"), "sms:+13055550100?body=x");
  assert.equal(N.smsLink("555-0100", "x"), "", "sin un número completo no hay enlace");
  assert.equal(N.mailtoLink("cliente@example.com", "Línea 1\nLínea 2"), "mailto:cliente@example.com?body=L%C3%ADnea%201%0D%0AL%C3%ADnea%202");
  assert.equal(N.mailtoLink("no es un email", "x"), "");
});

test("nombre de archivo válido en Windows", () => {
  assert.equal(N.safeFileName("Diaz, Beatriz - OC_My Plans & Programs FB 2026 NOV"), "Diaz, Beatriz - OC_My Plans & Programs FB 2026 NOV");
  assert.equal(N.safeFileName('Diaz, Beatriz - Dental_A/B: "Plus"?'), "Diaz, Beatriz - Dental_A-B- -Plus--");
  assert.equal(N.safeFileName("  Diaz.  "), "Diaz");
});

test("carpeta del Network: cada línea usa la suya y, si no tiene, la general", () => {
  assert.deepEqual(N.NET_DIRS, ["general", "oc", "mc", "supp"]);
  const general = { name: "NETW" }, oc = { name: "OC" };
  const own = N.netDirFor({ general: general, oc: oc }, "oc");
  assert.equal(own.key, "oc");
  assert.equal(own.dir, oc);
  const shared = N.netDirFor({ general: general, oc: oc }, "mc");
  assert.equal(shared.key, "general");
  assert.equal(shared.dir, general);
  assert.deepEqual(N.netDirFor({ oc: oc }, "supp"), { key: "general", dir: null });
  assert.deepEqual(N.netDirFor({}, "mc"), { key: "general", dir: null });
});

test("carpeta por documento: la de su clase, si no la de la línea, si no la general", () => {
  assert.deepEqual(N.docKinds("oc").map((k) => k.k), ["appsummary", "eligibility", "plans", "payment", "consent", "docsub", "hoja"]);
  assert.equal(N.docKinds("oc").find((k) => k.k === "hoja").label, "Hoja de cambios");
  assert.deepEqual(N.docKinds("mc").map((k) => k.k), ["soa", "appsummary"]);
  const general = { name: "NETW" }, oc = { name: "OC" }, hoja = { name: "OEP - Hoja de Cambios" }, docs = { name: "Docs" };
  const dirs = { general, oc, "oc:hoja": hoja, "oc:docsub": docs };
  assert.deepEqual(N.netDirFor(dirs, "oc", "hoja"), { key: "oc:hoja", dir: hoja });
  assert.deepEqual(N.netDirFor(dirs, "oc", "docsub:income:ANA-DIAZ"), { key: "oc:docsub", dir: docs }, "un Docs Submitted usa la de su clase");
  assert.deepEqual(N.netDirFor(dirs, "oc", "eligibility"), { key: "oc", dir: oc }, "sin carpeta propia, la de OC");
  assert.deepEqual(N.netDirFor(dirs, "mc", "soa"), { key: "general", dir: general });
  assert.deepEqual(N.netDirFor({ general }, "oc", "hoja"), { key: "general", dir: general });
});

test("ventana flotante: iniciales del cliente, nombre y apellido", () => {
  assert.equal(N.clientInitials({ nombres: "beatriz elena", apellidos: "diaz lopez" }), "BD");
  assert.equal(N.clientInitials({ nombres: "  ángel ", apellidos: "ortiz" }), "ÁO");
  assert.equal(N.clientInitials({ nombres: "Beatriz" }), "B");
  assert.equal(N.clientInitials({ apellidos: "Diaz" }), "D");
  assert.equal(N.clientInitials({}), "");
});

test("Medicare: el teléfono y el email del cliente (para el SOA) no cambian la nota, el SMS ni el reporte", () => {
  ["enviada", "sincambio"].forEach((outcome) => {
    const d = make({ line: "mc", outcome: outcome, gestion: "nueva", compania: "Humana", plan: "Gold Plus", efectiva: "01/01/2027", oficina: "ATH Insurance" });
    const con = Object.assign({}, d, { clienteTel: "(305) 555-0100", clienteEmail: "bea@example.com" });
    assert.equal(N.buildNote(con), N.buildNote(d));
    assert.equal(N.buildSms(con), N.buildSms(d));
    assert.equal(N.buildReport(con), N.buildReport(d));
    assert.deepEqual(N.warnings(con, ""), N.warnings(d, ""));
  });
});

/* Documentos leídos de una carta o de Docs Submitted que entran a la lista
   de documentos (antes en app.js, sin pruebas). */
const hogar = (extra) => Object.assign({
  nombres: "ROSA", apellidos: "PEREZ LIMA", docs: [],
  personas: [{ titular: true, taxes: true, cobertura: true }, { nombre: "YANET SOTO MESA", taxes: true, cobertura: true }]
}, extra);

test("mergeDocs: el documento del titular lleva su nombre y queda marcado como suyo", () => {
  const f = hogar(), sent = [];
  assert.equal(N.mergeDocs(f, [{ cat: "immigration", persona: "ROSA PEREZ LIMA", titular: true, enviado: true, doc: "Permanent Resident Card, Green Card (I-551)" }], sent), 1);
  assert.deepEqual(f.docs, [{ cat: "immigration", persona: "ROSA PEREZ LIMA", fecha: "", enviado: true, doc: "Permanent Resident Card, Green Card (I-551)", auto: true, titular: true, src: "doc:IMMIGRATION|ROSAPEREZLIMA" }]);
  assert.deepEqual(sent, f.docs);
});

test("mergeDocs: sin el nombre del titular la persona queda vacía, no «Sin nombre»", () => {
  const f = hogar({ nombres: "", apellidos: "" }), sent = [];
  N.mergeDocs(f, [{ cat: "income", persona: "", fecha: "02/15/2027" }], sent);
  assert.deepEqual(f.docs, [{ cat: "income", persona: "", fecha: "02/15/2027", enviado: false, doc: "", auto: true, titular: true, src: "doc:INCOME|" }]);
  assert.deepEqual(sent, []);
});

test("mergeDocs: un nombre de pila es de la persona del hogar que empieza así", () => {
  const f = hogar(), sent = [];
  N.mergeDocs(f, [{ cat: "immigration", persona: "YANET", fecha: "01/31/2027" }], sent);
  assert.equal(f.docs[0].persona, "YANET SOTO MESA");
  assert.equal(f.docs[0].titular, false);
});

test("mergeDocs: alguien fuera del hogar entra con su nombre, sin ser el titular", () => {
  const f = hogar(), sent = [];
  N.mergeDocs(f, [{ cat: "ssn", persona: "Diego Ramos" }], sent);
  assert.equal(f.docs[0].persona, "DIEGO RAMOS");
  assert.equal(f.docs[0].titular, false);
});

test("mergeDocs: el documento enviado marca como enviado al que ya estaba pedido, sin repetirlo", () => {
  const f = hogar(), sent = [];
  N.mergeDocs(f, [{ cat: "immigration", persona: "YANET SOTO MESA", fecha: "01/31/2027" }], sent);
  assert.equal(N.mergeDocs(f, [{ cat: "immigration", persona: "YANET SOTO MESA", enviado: true, doc: "Employment Authorization Card (I-766)" }], sent), 1);
  assert.equal(f.docs.length, 1);
  assert.deepEqual(f.docs[0], { cat: "immigration", persona: "YANET SOTO MESA", fecha: "01/31/2027", enviado: true, doc: "Employment Authorization Card (I-766)", auto: true, titular: false, src: "doc:IMMIGRATION|YANETSOTOMESA" });
  assert.deepEqual(sent, [f.docs[0]]);
  /* la misma carta otra vez no agrega nada */
  assert.equal(N.mergeDocs(f, [{ cat: "immigration", persona: "YANET SOTO MESA", enviado: true }], []), 0);
  assert.equal(f.docs.length, 1);
});

/* "Upload documents" leído antes que la carta: aún no se sabe el nombre del
   titular, así que su fila queda sin persona; la carta después pide lo mismo
   con fecha y es la misma fila, ya con el nombre. */
test("mergeDocs: el enviado sin nombre del titular y el pedido con fecha son una sola fila", () => {
  const f = hogar({ nombres: "", apellidos: "", net: {} }), sent = [];
  N.mergeDocs(f, [{ cat: "immigration", persona: "ROSA", titular: true, enviado: true, doc: "Permanent Resident Card, Green Card (I-551)" }], sent);
  assert.equal(f.docs[0].persona, "");
  const keyBefore = N.docKey(f.docs[0]);
  f.net[keyBefore] = true;
  const files = [{ res: { net: keyBefore } }];
  f.nombres = "ROSA"; f.apellidos = "PEREZ LIMA";
  assert.equal(N.mergeDocs(f, [{ cat: "immigration", persona: "", fecha: "02/24/2027" }], [], files), 2);
  assert.equal(f.docs.length, 1);
  assert.deepEqual(f.docs[0], { cat: "immigration", persona: "ROSA PEREZ LIMA", fecha: "02/24/2027", enviado: true, doc: "Permanent Resident Card, Green Card (I-551)",
    auto: true, titular: true, src: "doc:IMMIGRATION|" });
  /* su casilla y su archivo de Docs Submitted siguen a la fila */
  assert.deepEqual(f.net, { [N.docKey(f.docs[0])]: true });
  assert.equal(files[0].res.net, N.docKey(f.docs[0]));
  /* al revés: la carta sin nombre primero y el enviado después */
  const g = hogar({ nombres: "", apellidos: "" });
  N.mergeDocs(g, [{ cat: "immigration", persona: "", fecha: "02/24/2027" }], []);
  g.nombres = "ROSA"; g.apellidos = "PEREZ LIMA";
  const sent2 = [];
  N.mergeDocs(g, [{ cat: "immigration", persona: "ROSA", titular: true, enviado: true, doc: "Permanent Resident Card, Green Card (I-551)" }], sent2);
  assert.equal(g.docs.length, 1);
  assert.deepEqual([g.docs[0].persona, g.docs[0].fecha, g.docs[0].enviado], ["ROSA PEREZ LIMA", "02/24/2027", true]);
  assert.deepEqual(sent2, [g.docs[0]]);
});

test("mergeDocs: el documento del titular y el de otra persona del hogar siguen siendo dos filas", () => {
  const f = hogar(), sent = [];
  N.mergeDocs(f, [{ cat: "immigration", persona: "", fecha: "02/24/2027" }], sent);
  N.mergeDocs(f, [{ cat: "immigration", persona: "YANET", enviado: true }], sent);
  assert.deepEqual(f.docs.map((x) => [x.persona, x.titular, x.enviado]), [["ROSA PEREZ LIMA", true, false], ["YANET SOTO MESA", false, true]]);
});

test("mergeDocs: los acentos no cuentan al buscar a la persona", () => {
  const f = hogar({ nombres: "JOSÉ", apellidos: "NÚÑEZ", personas: [{ titular: true }] }), sent = [];
  N.mergeDocs(f, [{ cat: "income", persona: "JOSE NUNEZ" }], sent);
  assert.equal(f.docs[0].persona, "JOSÉ NÚÑEZ");
  assert.equal(f.docs[0].titular, true);
});

test("moveDocKey: cambiar la persona de un documento enviado conserva su casilla y su archivo", () => {
  const f = hogar({ net: { "docsub:immigration:YANET": true, plans: true } });
  const files = [{ res: { net: "docsub:immigration:YANET" } }, { res: { net: "plans" } }, { res: null }];
  N.moveDocKey(f, files, "docsub:immigration:YANET", "docsub:immigration:YANET-SOTO-MESA");
  assert.deepEqual(f.net, { plans: true, "docsub:immigration:YANET-SOTO-MESA": true });
  assert.deepEqual(files.map((x) => x.res && x.res.net), ["docsub:immigration:YANET-SOTO-MESA", "plans", null]);
  /* la misma clave no cambia nada */
  N.moveDocKey(f, files, "plans", "plans");
  assert.equal(f.net.plans, true);
});

test("documento que no coincide con el caso: otro cliente, otra compañía u otro número", () => {
  const caso = { nombres: "BEATRIZ", apellidos: "DIAZ", compania: "UHC", confirmacion: "U1234567", appId: "", poliza: "" };
  const humana = { line: "mc", type: "mc_app", fields: { nombres: "Beatriz", apellidos: "Diaz", compania: "Humana", confirmacion: "H7654321" } };
  assert.deepEqual(N.docConflicts(caso, "mc", humana), ["otra compañía (Humana, el caso es de UHC)", "otro App ID (H7654321, el caso tiene U1234567)"]);
  /* la misma compañía escrita de otra forma y el mismo número: coincide */
  assert.deepEqual(N.docConflicts(caso, "mc", { line: "mc", type: "mc_app", fields: { compania: "UnitedHealthcare", confirmacion: "U1234567" } }), []);
  /* otro cliente */
  assert.deepEqual(N.docConflicts(caso, "mc", { line: "mc", type: "mc_soa", fields: { nombres: "Juan", apellidos: "Perez Gil" } }),
    ["otro cliente (JUAN PEREZ GIL, el caso es de BEATRIZ DIAZ)"]);
  /* un apellido de más no es otro cliente */
  assert.deepEqual(N.docConflicts(caso, "mc", { line: "mc", type: "mc_soa", fields: { nombres: "Beatriz Maria", apellidos: "Diaz Lopez" } }), []);
  /* caso vacío: nada que comparar */
  assert.deepEqual(N.docConflicts({}, "mc", humana), []);
  /* otra línea (un dental después de Obamacare): solo se compara el cliente */
  const oc = { nombres: "BEATRIZ", apellidos: "DIAZ", compania: "Ambetter", appId: "1234567890" };
  assert.deepEqual(N.docConflicts(oc, "oc", { line: "supp", type: "supp_app", fields: { nombres: "Beatriz", apellidos: "Diaz", compania: "Ameritas" } }), []);
  /* Obamacare: otro número de aplicación */
  assert.deepEqual(N.docConflicts(oc, "oc", { line: "oc", type: "oc_elig", fields: { appId: "9999999999" } }), ["otro número de aplicación (9999999999, el caso tiene 1234567890)"]);
  /* un comprobante de pago no tiene línea: se compara con la compañía del caso */
  assert.deepEqual(N.docConflicts(oc, "oc", { line: "", type: "pay", fields: { compania: "Oscar" } }), ["otra compañía (Oscar, el caso es de Ambetter)"]);
});

test("Cambios: el teléfono y el email que trajo el App Summary no son un cambio; uno distinto sí", () => {
  const base = { clienteTel: "(305) 555-0147", clienteEmail: "beatriz.diaz@example.com" };
  const same = N.cambios({ line: "oc", base, clienteTel: "305-555-0147", clienteEmail: "Beatriz.Diaz@example.com", personas: [] });
  assert.ok(!same.some((x) => /Teléfono|Email/.test(x)), same.join(" / "));
  const changed = N.cambios({ line: "oc", base, clienteTel: "(786) 555-0199", clienteEmail: "beatriz.diaz@example.com", personas: [] });
  assert.ok(changed.some((x) => /^- Teléfono: \(786\) 555-0199/.test(x)), changed.join(" / "));
});

/* Las personas que trae un App Summary llenan su parentesco, estatus,
   ingreso anual y DOB; lo que el documento dice queda como base, así que lo
   que el agente cambie después sale en Cambios. */
const DOC_HOGAR = [
  { nombre: "ANA TORRES", titular: true, dob: "05/02/1980", estatus: "ciudadano", ingreso: "$42,000.00" },
  { nombre: "LUIS TORRES", dob: "08/21/1978", parentesco: "Cónyuge", estatus: "residente", ingreso: "$22,500.00" },
  { nombre: "SOFIA TORRES", dob: "03/09/2012", parentesco: "Hijo/a", estatus: "ciudadano", ingreso: "$0.00" }
];
const casa = (personas) => ({ nombres: "ANA", apellidos: "TORRES", quitados: [], personas });

test("mergeHousehold: llena los datos de quien ya está y agrega a quien falta", () => {
  const f = casa([{ titular: true, taxes: true, cobertura: true, ingreso: "", estatus: "", dob: "" },
    { nombre: "LUIS", parentesco: "", taxes: true, cobertura: true, ingreso: "", estatus: "", dob: "" }]);
  assert.equal(N.mergeHousehold(f, DOC_HOGAR), 3 + 4 + 1);
  const [tit, luis, sofia] = f.personas;
  assert.deepEqual([tit.estatus, tit.ingreso, tit.dob], ["ciudadano", "$42,000.00", "05/02/1980"]);
  assert.deepEqual([luis.nombre, luis.parentesco, luis.estatus, luis.ingreso, luis.dob], ["LUIS", "Cónyuge", "residente", "$22,500.00", "08/21/1978"]);
  assert.equal(luis.auto, undefined);
  assert.deepEqual(luis.filled, { parentesco: 1, estatus: 1, ingreso: 1, dob: 1 });
  assert.deepEqual(sofia, { nombre: "SOFIA TORRES", parentesco: "Hijo/a", taxes: true, cobertura: true, ingreso: "$0.00", estatus: "ciudadano",
    dob: "03/09/2012", auto: true, orig: { nombre: "SOFIA TORRES", taxes: true, cobertura: true, parentesco: "Hijo/a", estatus: "ciudadano", ingreso: "$0.00", dob: "03/09/2012" } });
  assert.equal(f.hogarPdf, true);
  assert.deepEqual(N.cambios(Object.assign(f, { base: {} })), []);
});

test("mergeHousehold: lo que el agente ya escribió se queda, y la diferencia con el documento es un Cambio", () => {
  const f = casa([{ titular: true, taxes: true, cobertura: true, ingreso: "$45,000.00", estatus: "", dob: "" },
    { nombre: "LUIS TORRES", parentesco: "Cónyuge", taxes: true, cobertura: true, ingreso: "", estatus: "ciudadano", dob: "" },
    { nombre: "SOFIA TORRES", parentesco: "Hijo/a", taxes: true, cobertura: true, ingreso: "", estatus: "", dob: "" }]);
  N.mergeHousehold(f, DOC_HOGAR);
  assert.equal(f.personas[0].ingreso, "$45,000.00");
  assert.equal(f.personas[1].estatus, "ciudadano");
  assert.deepEqual(N.cambios(Object.assign(f, { base: {} })), [
    "- Ana: ingreso anual $45,000 (antes $42,000)",
    "- Luis: estatus Ciudadano (antes Residente)"
  ]);
});

test("mergeHousehold: una persona ya confirmada vuelve a revisión solo si el documento trae un dato nuevo", () => {
  const f = casa([{ titular: true, taxes: true, cobertura: true, ingreso: "", estatus: "", dob: "" }]);
  N.mergeHousehold(f, DOC_HOGAR);
  f.personas.forEach((p) => { p.ok = true; });
  /* el mismo documento otra vez: nada nuevo, sigue confirmada */
  N.mergeHousehold(f, DOC_HOGAR);
  assert.ok(f.personas.every((p) => p.ok));
  /* otro documento con otro ingreso para el titular: vuelve a revisión */
  N.mergeHousehold(f, DOC_HOGAR.map((x) => (x.titular ? Object.assign({}, x, { ingreso: "$50,000.00" }) : x)), 2);
  assert.equal(f.personas[0].ingreso, "$50,000.00");
  assert.equal(f.personas[0].ok, undefined);
  assert.ok(f.personas.slice(1).every((p) => p.ok));
});

test("mergeHousehold: a quien el agente quitó no se le vuelve a agregar", () => {
  const f = casa([{ titular: true, taxes: true, cobertura: true }]);
  f.quitados = ["SOFIA TORRES"];
  N.mergeHousehold(f, DOC_HOGAR);
  assert.deepEqual(f.personas.map((p) => p.nombre || "TIT"), ["TIT", "LUIS TORRES"]);
});

const titOnly = () => casa([{ titular: true, taxes: true, cobertura: true, ingreso: "", estatus: "", dob: "" }]);
const LETTER = [{ titular: true, ingreso: "$64,500.00" }];

test("mergeHousehold: el ingreso del hogar de la carta no se suma al de cada persona del App Summary, en cualquier orden", () => {
  for (const order of [["letter", "app"], ["app", "letter"]]) {
    const f = titOnly();
    order.forEach((d) => d === "letter" ? N.mergeHousehold(f, LETTER, 2, true) : N.mergeHousehold(f, DOC_HOGAR, 1));
    assert.deepEqual(f.personas.map((p) => p.ingreso), ["$42,000.00", "$22,500.00", "$0.00"], order.join(" → "));
    assert.deepEqual(N.cambios(Object.assign(f, { base: {} })), [], order.join(" → "));
  }
});

test("mergeHousehold: con dos aplicaciones gana la última soltada, y lo escrito a mano se queda", () => {
  const f = titOnly();
  N.mergeHousehold(f, [{ titular: true, ingreso: "$30,000.00", dob: "05/02/1980" }], 1);
  f.personas[0].dob = "05/03/1980";
  N.mergeHousehold(f, [{ titular: true, ingreso: "$42,000.00", dob: "05/02/1980" }], 1);
  assert.equal(f.personas[0].ingreso, "$42,000.00");
  assert.equal(f.personas[0].dob, "05/03/1980");
  assert.deepEqual(N.cambios(Object.assign(f, { base: {} })), ["- Ana: DOB 05/03/1980 (antes 05/02/1980)"]);
});

test("mergeHousehold: una aplicación solo del titular deja como cambio a quien se agregue a mano", () => {
  const f = titOnly();
  N.mergeHousehold(f, [DOC_HOGAR[0]], 1);
  f.personas.push({ nombre: "LUIS TORRES", parentesco: "Cónyuge", taxes: true, cobertura: true });
  assert.deepEqual(N.cambios(Object.assign(f, { base: {} })), ["- Se agrega a LUIS TORRES (Cónyuge)"]);
});

test("mergeMembers: la misma persona escrita de otra manera no se repite", () => {
  const f = { nombres: "BEATRIZ MARIA", apellidos: "DIAZ", quitados: [], personas: [{ titular: true, taxes: true, cobertura: true }] };
  N.mergeMembers(f, ["BEATRIZ DIAZ", "JUAN CARLOS DIAZ", "ANA DIAZ"]);
  assert.deepEqual(f.personas.map((p) => p.nombre || "TIT"), ["TIT", "JUAN CARLOS DIAZ", "ANA DIAZ"]);
  const g = { nombres: "LAURA", apellidos: "RAMOS", quitados: [], personas: [{ titular: true, taxes: true, cobertura: true }] };
  N.mergeHousehold(g, [{ nombre: "LAURA RAMOS", titular: true }, { nombre: "DIEGO", parentesco: "Hijo/a" }], 1);
  N.mergeMembers(g, ["LAURA RAMOS", "DIEGO RAMOS"]);
  assert.deepEqual(g.personas.map((p) => p.nombre || "TIT"), ["TIT", "DIEGO"]);
  g.personas[1].nombre = "DIEGO RAMIREZ";
  N.mergeMembers(g, ["LAURA RAMOS", "DIEGO RAMOS"]);
  assert.equal(g.personas.length, 2);
});

test("mergeHousehold: al volver a usar el documento (después de quitar otro) los Cambios siguen", () => {
  const f = titOnly();
  N.mergeHousehold(f, DOC_HOGAR, 1);
  f.personas[1].cobertura = false; delete f.personas[1].auto;
  f.personas[2].nombre = "SOFIA TORREZ"; delete f.personas[2].auto;
  const before = N.cambios(Object.assign(f, { base: {} }));
  assert.deepEqual(before, ["- Luis: no pide cobertura", "- Sofia: nombre SOFIA TORREZ (antes SOFIA TORRES)"]);
  /* lo que hace removeFile con quien queda: sin orig ni filled */
  f.personas.forEach((p) => { delete p.orig; delete p.filled; });
  N.mergeHousehold(f, DOC_HOGAR, 1);
  assert.deepEqual(N.cambios(f), before);
});

test("cambios: el teléfono con o sin el +1 del país es el mismo", () => {
  const d = { line: "oc", base: { clienteTel: "(305) 555-0123" }, personas: [] };
  assert.deepEqual(N.cambios(Object.assign({ clienteTel: "+1 305 555 0123" }, d)), []);
  assert.deepEqual(N.cambios(Object.assign({ clienteTel: "1-305-555-0123" }, d)), []);
  assert.deepEqual(N.cambios(Object.assign({ clienteTel: "(786) 555-0123" }, d)), ["- Teléfono: (786) 555-0123 (antes (305) 555-0123)"]);
});

test("mergeDocs: un documento que el agente borró o cambió de tipo no vuelve al usar los documentos de nuevo", () => {
  const f = hogar(), pedidos = [{ cat: "income", titular: true, fecha: "02/15/2027" }, { cat: "ssn", titular: true, fecha: "02/15/2027" }];
  N.mergeDocs(f, pedidos, []);
  N.discardRow(f, f.docs[1]); f.docs.splice(1, 1);
  f.docs[0].cat = "citizenship"; delete f.docs[0].auto;
  /* lo que hace removeFile: quedan las filas que el agente tocó */
  f.docs = f.docs.filter((x) => !x.auto);
  assert.equal(N.mergeDocs(f, pedidos, []), 0);
  assert.deepEqual(f.docs.map((x) => x.cat), ["citizenship"]);
});

test("NPN: un agente del documento que solo trae el número se anota con el número", () => {
  const d = { line: "mc", outcome: "enviada", agente: "", agenteIni: "", npn: "18765432" };
  assert.match(N.buildNote(d), /^NPN: 18765432$/m);
  assert.match(N.buildNote(Object.assign({}, d, { agente: "LUCIA FERRER CAMPOS" })), /^NPN: LF$/m);
});

/* ---------------------------------------------------- hoja de cambios -- */

const hojaBase = () => make({
  line: "oc", outcome: "pendiente", anio: "2027", codigoQ: "5393", genero: "a", periodo: "OEP", plataforma: "MKPL",
  sheetAgente: "EDUARDO CHINEA", sheetColaborador: "", npnAnterior: "20586009 (FV)", npnSeleccionado: "20586009 (FV)",
  direccion: "910 Apple Ave, Lehigh Acres, FL 33971-6441", clienteTel: "(305) 784-5644", clienteEmail: "mary@example.com", idioma: "es",
  base: { direccion: "910 Apple Ave, Lehigh Acres, FL 33971-6441", clienteTel: "305-784-5644", clienteEmail: "mary@example.com" },
  hogarPdf: true, net: {},
  planes: [{ compania: "AMBETTER", plan: "Clarity Silver", prima: "27.43", sel: true }],
  personas: [
    { titular: true, taxes: true, cobertura: true, ingreso: "$35,000.00", dob: "12/02/1977", estatus: "residente",
      orig: { ingreso: "$35,000.00", dob: "12/02/1977", estatus: "ciudadano" } },
    { nombre: "KATHERINA SERRANO", taxes: true, cobertura: false, dob: "06/02/2006", sexo: "a",
      orig: { nombre: "KATHERINA SERRANO", taxes: true, cobertura: true, dob: "06/02/2006" } }
  ]
});

test("hoja de cambios: los datos del caso como en la hoja de la agencia", () => {
  const s = N.changeSheet(hojaBase());
  assert.equal(s.titulo, "Hoja de cambios · Verificación previa");
  assert.equal(s.anio, "2027");
  assert.equal(s.anioAnterior, "2026");
  assert.equal(s.portal, "MARKETPLACE");
  assert.equal(s.cliente, "Diaz, Beatriz");
  assert.equal(s.codigo, "Q5393");
  assert.equal(s.agente, "Eduardo Chinea");
  assert.equal(s.colaborador, "");
  assert.equal(s.npnAnterior, "20586009 (FV)");
  assert.equal(s.npnSeleccionado, "20586009 (FV)");
  assert.equal(s.consent, "Enviada");
  assert.deepEqual(s.plan, { nombre: "Ambetter · Clarity Silver", prima: "$27.43", inicio: "01/01/2027" });
  assert.equal(s.total, "$35,000.00");
  assert.equal(s.archivo, "Diaz, Beatriz - OC_Change Sheet 2027");
});

test("hoja de cambios: lo resaltado es lo que cambió respecto a los documentos", () => {
  const s = N.changeSheet(hojaBase());
  const [tit, hija] = s.personas;
  assert.equal(tit.sexo, "Femenino");
  assert.equal(tit.estatus, "Residente");
  assert.equal(tit.cambio.estatus, true);
  assert.equal(tit.cambio.ingreso, false);
  assert.equal(tit.cambio.dob, false);
  assert.equal(hija.nombre, "Katherina Serrano");
  assert.equal(hija.sexo, "Femenino");
  assert.equal(hija.cobertura, false);
  assert.equal(hija.cambio.cobertura, true);
  assert.equal(hija.cambio.taxes, false);
  /* el teléfono con otro formato no es un cambio; el email distinto sí */
  const d = hojaBase();
  d.clienteEmail = "otra@example.com";
  const c = N.changeSheet(d).contacto;
  assert.deepEqual(c.map((x) => [x.label, x.cambio]), [["Dirección postal", false], ["Teléfono", false], ["Email", true], ["Idioma", false]]);
});

test("hoja de cambios: persona agregada, quitada, consent recibido y sin plan elegido", () => {
  const d = hojaBase();
  d.personas.push({ nombre: "ELIJAH ORELLANA", taxes: true, cobertura: false, auto: false });
  d.quitados = ["LUIS DIAZ"];
  d.net = { consent: true };
  d.planes = [{ compania: "AMBETTER", plan: "Clarity Silver", prima: "27.43" }, { compania: "OSCAR", plan: "Silver Simple", prima: "30" }];
  d.codigoQ = "";
  d.periodo = "SEP";
  const s = N.changeSheet(d);
  assert.equal(s.personas[2].nuevo, true);
  assert.equal(s.personas[2].cambio.estatus, true);
  assert.deepEqual(s.quitados, ["Luis Diaz"]);
  assert.equal(s.consent, "Recibida");
  assert.equal(s.plan, null);
  assert.equal(s.codigo, "");
  /* un solo plan cotizado es el elegido; fuera de OEP la cobertura no se supone */
  d.planes = d.planes.slice(0, 1);
  assert.equal(N.changeSheet(d).plan.inicio, "");
  assert.equal(N.changeSheet(Object.assign(hojaBase(), { revisaPlanes: true })).consent, "No enviada (revisará los planes)");
});

test("avisos: lo que el agente todavía no eligió ni confirmó (Canal, Código en Zoho, Enrollment Period)", () => {
  const w = N.warnings(make({ line: "oc", outcome: "pendiente", porElegir: ["Canal", "Enrollment Period"] }), "");
  assert.ok(w.includes("Elige o confirma: Canal, Enrollment Period."));
  assert.ok(!N.warnings(make({ line: "oc", outcome: "pendiente", porElegir: [] }), "").some((x) => /Elige o confirma/.test(x)));
});

/* El ingreso de un dependiente solo cuenta si tiene que declarar impuestos
   (healthcare.gov): más que la deducción estándar del año del plan (IRS:
   $16,100 en 2026, $16,600 en 2027). */
test("ingreso del hogar: un dependiente que no tiene que declarar no suma; el cónyuge siempre", () => {
  const casa = (hijo, anio) => make({ line: "oc", outcome: "pendiente", anio, personas: [
    { titular: true, taxes: true, cobertura: true, ingreso: "30000" },
    { nombre: "LUIS PEREZ", parentesco: "Cónyuge", taxes: true, cobertura: true, ingreso: "9000" },
    { nombre: "SOFIA PEREZ", parentesco: "Hijo/a", taxes: true, cobertura: true, ingreso: hijo }] });
  assert.equal(N.ingresoHogar(casa("12000", "2027")), 39000, "hija con $12,000: no declara");
  assert.equal(N.ingresoHogar(casa("16600", "2027")), 39000, "justo en el límite: no declara");
  assert.equal(N.ingresoHogar(casa("16601", "2027")), 55601, "más del límite: declara y suma");
  assert.equal(N.ingresoHogar(casa("16500", "2026")), 55500, "en 2026 el límite es $16,100");
  assert.equal(N.limiteDeclarar({ anio: "2030" }), 16600, "un año sin dato usa el último conocido");
  const d = casa("12000", "2027");
  assert.match(N.buildNote(d), /\nIncome: \$39,000\.\n/);
  assert.ok(N.warnings(d, "").some((x) => /El ingreso de Sofia \(\$12,000\) no suma al hogar/.test(x)));
  assert.ok(!N.warnings(casa("20000", "2027"), "").some((x) => /no suma al hogar/.test(x)));
  /* en la nota de app enviada, el desglose solo lleva lo que suma */
  const env = N.buildNote(Object.assign({}, d, { outcome: "enviada" }));
  assert.match(env, /Sus ingresos anuales son \$39,000 \([^)]*Luis \$9,000\)\./);
  assert.doesNotMatch(env, /Sofia \$12,000/);
});


test("OEP: la cobertura empieza el 01/01 si se procesa hasta el 15 de diciembre, y el 02/01 hasta el 15 de enero", () => {
  assert.equal(N.oepStart("11/01/2026"), "01/01/2027");
  assert.equal(N.oepStart("12/15/2026"), "01/01/2027");
  assert.equal(N.oepStart("12/16/2026"), "02/01/2027");
  assert.equal(N.oepStart("01/10/2027"), "02/01/2027");
  assert.equal(N.oepStart("01/15/2027"), "02/01/2027");
  /* fuera del Open Enrollment no hay fecha que poner */
  assert.equal(N.oepStart("01/16/2027"), "");
  assert.equal(N.oepStart("10/31/2026"), "");
  assert.equal(N.oepStart(""), "");
});

test("Hoja de cambios: solo en Obamacare Pendiente, y no si revisará los planes", () => {
  assert.equal(N.needsSheet({ line: "oc", outcome: "pendiente" }), true);
  assert.equal(N.needsSheet({ line: "oc", outcome: "pendiente", revisaPlanes: true }), false);
  assert.equal(N.needsSheet({ line: "oc", outcome: "enviada" }), false);
  assert.equal(N.needsSheet({ line: "mc", outcome: "enviada" }), false);
});

test("Network: si revisará los planes no hay carta de consentimiento que guardar", () => {
  const d = { line: "oc", outcome: "pendiente", docs: [], net: {} };
  assert.deepEqual(N.networkOf(d).map((n) => n.k), ["consent"]);
  assert.deepEqual(N.networkOf(Object.assign({}, d, { revisaPlanes: true })), []);
  assert.deepEqual(N.buildFileNames(Object.assign({}, d, { revisaPlanes: true })), []);
  /* las demás situaciones siguen igual */
  assert.ok(N.networkOf({ line: "oc", outcome: "enviada", docs: [], net: {}, revisaPlanes: true }).length > 0);
});

test("2027: aviso para revisar el subsidio de quien pide cobertura sin ser ciudadano ni residente", () => {
  const d = { line: "oc", outcome: "pendiente", anio: "2027", nombres: "Ana", apellidos: "Ruiz", ini: "TA", net: {}, docs: [], planes: [],
    personas: [
      { titular: true, taxes: true, cobertura: true, estatus: "permiso" },
      { nombre: "LUIS RUIZ", taxes: true, cobertura: true, estatus: "otro", estatusOtro: "TPS" },
      { nombre: "ROSA RUIZ", taxes: true, cobertura: true, estatus: "residente" },
      { nombre: "PEDRO RUIZ", taxes: true, cobertura: false, estatus: "permiso" },
      { nombre: "EVA RUIZ", taxes: true, cobertura: true, estatus: "ciudadano" },
      { nombre: "JUAN RUIZ", taxes: true, cobertura: true, estatus: "" }
    ] };
  const alert = (x) => N.warnings(x, "").filter((t) => /2027/.test(t));
  assert.deepEqual(alert(d), [
    "Revisa el subsidio de Ana (Permiso de trabajo) y Luis (TPS): desde 2027 solo lo tienen los ciudadanos, los residentes permanentes, los Cuban/Haitian entrants y los migrantes de COFA."
  ]);
  /* un año antes de 2027, otra línea o una cancelación no llevan el aviso */
  assert.deepEqual(alert(Object.assign({}, d, { anio: "2026" })), []);
  assert.deepEqual(alert(Object.assign({}, d, { outcome: "cancelada" })), []);
  assert.deepEqual(alert(Object.assign({}, d, { line: "mc" })), []);
  /* sin año todavía, se avisa igual */
  assert.equal(alert(Object.assign({}, d, { anio: "" })).length, 1);
  /* una sola persona */
  assert.match(alert(Object.assign({}, d, { personas: [d.personas[0]] }))[0], /^Revisa el subsidio de Ana \(Permiso de trabajo\): /);
});

test("agencia: la del agente cuyo NPN se usa; si no tiene, la elegida arriba", () => {
  const ath = { name: "Laura Gomez", npn: "12345678", oficina: "ATH Insurance" };
  assert.equal(N.officeFor(ath, "QAgency"), "ATH Insurance");
  assert.equal(N.officeFor({ name: "Rosa Mendez", npn: "87654321" }, "ATH Insurance"), "ATH Insurance");
  assert.equal(N.officeFor(null, "ATH Insurance"), "ATH Insurance");
  /* sin NPN o con una agencia que no existe, manda la de arriba */
  assert.equal(N.officeFor({ name: "X", npn: "", oficina: "ATH Insurance" }, "QAgency"), "QAgency");
  assert.equal(N.officeFor({ name: "X", npn: "1", oficina: "Otra" }, "QAgency"), "QAgency");
  assert.equal(N.officeFor(null, ""), C.OFFICES[0]);
  /* el SMS se presenta con esa agencia */
  const sms = (oficina) => N.buildSms({ line: "oc", outcome: "enviada", nombres: "Ana", apellidos: "Ruiz", oficina: oficina, net: {}, docs: [] });
  assert.notEqual(sms(N.officeFor(ath, "QAgency")), sms("QAgency"));
});

test("Medicare: la dirección es solo para confirmar, no sale en la nota, el task, el reporte ni los mensajes", () => {
  const dir = "1200 SAMPLE BLVD, NAPLES, FL 34100";
  ["enviada", "pendiente", "sin"].forEach((outcome) => {
    const d = make({ line: "mc", outcome: outcome, gestion: "nueva", compania: "Aetna", direccion: dir });
    const out = [N.buildNote(d), N.buildTask(d), N.buildReport(d), N.buildSms(d), N.buildEmail(d, 1), N.buildEmail(d, 2)];
    out.forEach((t) => assert.doesNotMatch(String(t || ""), /SAMPLE BLVD/i, outcome));
  });
});

test("email: el saludo lleva el primer nombre del titular, o Cliente si no hay nombre", () => {
  const oc = make({ line: "oc", outcome: "enviada", nombres: "MARIA ELENA", genero: "a" });
  assert.match(N.buildEmail(oc, 1), /^Estimada Maria:\n/);
  assert.match(N.buildEmail(Object.assign({}, oc, { idioma: "en" }), 1), /^Dear Maria:\n/);
  assert.match(N.buildEmail(Object.assign({}, oc, { nombres: "" }), 1), /^Estimada Cliente:\n/);
  assert.match(N.buildEmail(Object.assign({}, oc, { nombres: "", idioma: "en" }), 1), /^Dear Client:\n/);
  const supp = make({ line: "supp", outcome: "enviada", nombres: "" });
  assert.match(N.buildEmail(supp, 1), /^Estimado Cliente\n/);
  const cot = make({ line: "oc", outcome: "pendiente", revisaPlanes: true, nombres: "LUIS", planes: [{ compania: "Ambetter", plan: "Silver", prima: "10" }] });
  assert.match(N.buildEmail(cot, 1), /^Estimado Luis\n/);
});

/* El email de la cotización de Suplementario, como las plantillas de la
   agencia de Accidente y de Hospital, en español y en inglés: solo el texto,
   para pegarlo. */
test("email Suplementario: cotización de Accidente y de Hospital, en español e inglés", () => {
  const d = make({ line: "supp", outcome: "cotizacion", producto: "Accident", genero: "a", compania: "UHC",
    plan: "Accident Protection Plus", prima: "24.5", firmaNombre: "IRMA MORA" });
  assert.equal(N.buildEmail(d, 1), [
    "Estimada Beatriz",
    "",
    "Se envía cotización del Plan de Accidente Accident Protection Plus de la compañía UnitedHealthcare",
    "Prima Mensual Estimada: $24.50",
    "Envío Brochure con los detalles y beneficios del plan (Ver adjunto)",
    "",
    "¡Los mejores ahorros son nuestras mejores opciones!",
    "",
    "Cualquier duda u observación se puede comunicar con nosotros de inmediato y hacer su aplicación.",
    "",
    "Saludos,",
    "Irma Mora"
  ].join("\n"));
  assert.equal(N.buildEmail(Object.assign({}, d, { idioma: "en" }), 1), [
    "Dear Beatriz",
    "",
    "Here is your quote for the Accident Plan Accident Protection Plus from UnitedHealthcare",
    "Estimated Monthly Premium: $24.50",
    "Attached is a brochure with the plan's details and benefits (see attachment)",
    "",
    "The best savings are our best options!",
    "",
    "If you have any questions or comments, contact us right away to start your application.",
    "",
    "Best regards,",
    "Irma Mora"
  ].join("\n"));
  const h = make({ line: "supp", outcome: "cotizacion", producto: "Hospital", compania: "UHC", firmaNombre: "IRMA MORA" });
  assert.equal(N.buildEmail(h, 1).split("\n")[2], "Se envía cotización del Plan de Hospital de la compañía UnitedHealthcare");
  assert.equal(N.buildEmail(Object.assign({}, h, { idioma: "en" }), 1).split("\n")[2],
    "Here is your quote for the Hospital Plan from UnitedHealthcare");
  /* sin prima no va la línea de la prima; otro producto se nombra como en el SMS */
  assert.ok(!/Prima Mensual/.test(N.buildEmail(h, 1)));
  assert.equal(N.buildEmail(make({ line: "supp", outcome: "cotizacion", producto: "Dental", compania: "Cigna", plan: "Dental Plus" }), 1).split("\n")[2],
    "Se envía cotización del seguro dental Dental Plus de la compañía Cigna");
  assert.equal(N.buildEmail(make({ line: "supp", outcome: "cotizacion", producto: "Dental", idioma: "en", compania: "Cigna", plan: "Dental Plus" }), 1).split("\n")[2],
    "Here is your quote for the dental insurance Dental Plus from Cigna");
  /* una sola parte */
  assert.equal(N.buildEmail(d, 2), "");
});

/* ---------------------------------------------- adjuntos y Summary of Benefits -- */

test("Copiar adjuntos: solo My Plans & Programs, Eligibility, Docs Submitted y el pago, y solo los marcados", () => {
  const d = make({ line: "oc", outcome: "enviada", compania: "Ambetter", efectiva: "01/01/2027", anio: "2027", fecha: "11/20/2026",
    docs: [{ cat: "income", persona: "BEATRIZ DIAZ", fecha: "02/12/2027", enviado: true }],
    net: { appsummary: true, consent: true, eligibility: true, plans: true, "docsub:income:BEATRIZ-DIAZ": true } });
  const files = N.attachmentFiles(d);
  assert.deepEqual(files.map((f) => f.k), ["eligibility", "plans", "docsub:income:BEATRIZ-DIAZ"]);
  assert.ok(files.every((f) => /^Diaz, Beatriz - OC_.*\.pdf$/.test(f.name)), files.map((f) => f.name).join(" | "));
  assert.equal(N.quotedNames(["a b.pdf", "c.pdf"]), "\"a b.pdf\" \"c.pdf\"");
  /* el pago, si se guardó */
  assert.ok(N.attachmentFiles(Object.assign({}, d, { net: { payment: true } }))[0].name.startsWith("Diaz, Beatriz - Payment Confirmation - OC_"));
  /* nada fuera de App enviada de Obamacare */
  assert.deepEqual(N.attachmentFiles(Object.assign({}, d, { outcome: "pendiente" })), []);
  assert.deepEqual(N.attachmentFiles(Object.assign({}, d, { line: "mc" })), []);
});

test("SoB: nivel de costos compartidos sugerido por el ingreso y la línea de pobreza del año anterior", () => {
  /* 2027 usa la de 2026: $15,960 por una persona, $5,680 por cada otra */
  const csr = (ingreso, extra) => N.csrSuggest(make(Object.assign({ line: "oc", plan: "Clarity Silver", anio: "2027",
    personas: [{ titular: true, taxes: true, cobertura: true, ingreso: String(ingreso) }] }, extra)));
  assert.equal(N.fplFor(1, 2027, "FL"), 15960);
  assert.equal(N.fplFor(3, 2027, ""), 15960 + 2 * 5680);
  assert.equal(N.fplFor(1, 2026, "AK"), 19550);
  assert.equal(csr(23940), "06");
  assert.equal(csr(23941), "05");
  assert.equal(csr(31920), "05");
  assert.equal(csr(39900), "04");
  assert.equal(csr(39901), "01");
  assert.equal(csr(20000, { plan: "Clarity Bronze" }), "01");
  assert.equal(N.csrSuggest(make({ line: "oc", plan: "Clarity Silver", anio: "2027" })), "");
});

test("SoB: el archivo se busca por el HIOS ID y el nivel, no por el nombre del plan", () => {
  const names = ["SBC-49004FL0010031-01-2027.pdf", "SBC-49004FL0010031-05-2027.pdf", "SBC-49004FL0010031-06-2027.pdf",
    "SBC-49004FL0010031-06-2026.pdf", "SBC-49004FL0010032-06-2027.pdf", "Clarity Silver.pdf"];
  const d = make({ line: "oc", plan: "Clarity Silver", planId: "49004FL0010031", anio: "2027",
    personas: [{ titular: true, taxes: true, cobertura: true, ingreso: "30000" }] });
  const m = N.sobMatches(names, d);
  assert.deepEqual(m.map((x) => x.name), ["SBC-49004FL0010031-01-2027.pdf", "SBC-49004FL0010031-05-2027.pdf", "SBC-49004FL0010031-06-2027.pdf"]);
  assert.deepEqual(m.map((x) => x.label), ["Estándar", "CSR 87% AV", "CSR 94% AV"]);
  /* $30,000 para uno es el 188%: -05 */
  assert.equal(N.sobPick(m, d), "SBC-49004FL0010031-05-2027.pdf");
  /* sin ingreso no se adivina */
  assert.equal(N.sobPick(m, Object.assign({}, d, { personas: [] })), "");
  /* si el documento traía el nivel, solo ese */
  assert.deepEqual(N.sobMatches(names, Object.assign({}, d, { planId: "49004FL0010031-06" })).map((x) => x.name), ["SBC-49004FL0010031-06-2027.pdf"]);
  /* un solo archivo del plan: ese */
  assert.equal(N.sobPick(N.sobMatches(["49004FL0010032-06 2027.pdf"], Object.assign({}, d, { planId: "49004FL0010032" })), d), "49004FL0010032-06 2027.pdf");
  assert.deepEqual(N.sobMatches(names, Object.assign({}, d, { planId: "" })), []);
});

test("SoB: el Plan ID se lee dentro del PDF cuando el archivo se llama como el plan (Ambetter/2027/Clarity Silver.pdf)", () => {
  assert.deepEqual(N.sobIdsIn("Summary of Benefits and Coverage  SBC-49004FL0010031-05-2027\n87% AV  Clarity Silver"), ["49004FL0010031-05-2027"]);
  const items = [
    { name: "Clarity Silver.pdf", path: "Ambetter/2027", ids: ["49004FL0010031-01-2027"] },
    { name: "Clarity Silver 87.pdf", path: "Ambetter/2027", ids: ["49004FL0010031-05-2027"] },
    { name: "Clarity Silver 94.pdf", path: "Ambetter/2027", ids: ["49004FL0010031-06"] },
    { name: "Clarity Silver 94.pdf", path: "Ambetter/2026", ids: ["49004FL0010031-06"] },
    { name: "Clarity Gold.pdf", path: "Ambetter/2027", ids: ["49004FL0010040-01-2027"] }
  ];
  const d = make({ line: "oc", plan: "Clarity Silver", planId: "49004FL0010031", anio: "2027",
    personas: [{ titular: true, taxes: true, cobertura: true, ingreso: "20000" }] });
  const m = N.sobMatches(items, d);
  assert.deepEqual(m.map((x) => x.key), ["Ambetter/2027/Clarity Silver.pdf", "Ambetter/2027/Clarity Silver 87.pdf", "Ambetter/2027/Clarity Silver 94.pdf"]);
  assert.deepEqual(m.map((x) => x.variant), ["01", "05", "06"]);
  /* el año sale de la subcarpeta cuando el Plan ID no lo trae */
  assert.equal(m[2].year, "2027");
  /* $20,000 para uno es el 125%: -06 */
  assert.equal(N.sobPick(m, d), "Ambetter/2027/Clarity Silver 94.pdf");
});

test("SoB: sin Plan ID en ningún archivo, los que se llaman como el plan, marcados y sin elegir solos en una Plata", () => {
  const items = [{ name: "Clarity Silver.pdf", path: "Ambetter/2027", ids: [] }, { name: "Clarity Gold.pdf", path: "Ambetter/2027", ids: [] }];
  const d = make({ line: "oc", plan: "Clarity Silver", planId: "49004FL0010031", anio: "2027" });
  const m = N.sobMatches(items, d);
  assert.deepEqual(m.map((x) => [x.key, x.label, x.byName]), [["Ambetter/2027/Clarity Silver.pdf", "Por el nombre del plan", true]]);
  assert.equal(N.sobPick(m, d), "", "una Plata por nombre puede ser de otro nivel: se elige a mano");
  const gold = Object.assign({}, d, { plan: "Clarity Gold" });
  assert.equal(N.sobPick(N.sobMatches(items, gold), gold), "Ambetter/2027/Clarity Gold.pdf");
});

test("SoB: sin Plan ID, también el archivo que se llama como el código del plan (FB/2027/HMO/2129.pdf)", () => {
  const items = [{ name: "2129.pdf", path: "FB/2027/HMO", ids: [] }, { name: "2130.pdf", path: "FB/2027/HMO", ids: [] },
    { name: "2129.pdf", path: "FB/2026/HMO", ids: [] }];
  const d = make({ line: "oc", plan: "myBlue Bronze (HSA) 2129", planId: "30252FL0070031", anio: "2027" });
  const m = N.sobMatches(items, d);
  assert.deepEqual(m.map((x) => [x.key, x.byName]), [["FB/2027/HMO/2129.pdf", true]]);
  assert.equal(N.sobPick(m, d), "FB/2027/HMO/2129.pdf");
  /* un código con letras también: "myBlue Essentials Silver 27M07-01C" */
  const s = make({ line: "oc", plan: "myBlue Essentials Silver 27M07-01C", planId: "30252FL0210001", anio: "2027" });
  assert.deepEqual(N.sobMatches([{ name: "27M07-01C.pdf", path: "FB/2027", ids: [] }], s).map((x) => x.key), ["FB/2027/27M07-01C.pdf"]);
  /* una palabra sin números no es un código */
  assert.deepEqual(N.sobMatches([{ name: "Silver.pdf", path: "", ids: [] }], make({ line: "oc", plan: "Clarity Silver", planId: "49004FL0010031" })), []);
});
