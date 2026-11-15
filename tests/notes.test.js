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
  /* Liseth firma las notas como DI y figura como agente LI; sin prefijo */
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
    prima: "139.08", periodo: "None", agente: "Liseth Iznaga", agenteIni: "LI", plataforma: "HealthSherpa", cuentaMkpl: "no",
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
  assert.match(note, /\nLa app se hizo en el MKPL\.\nPago: Realizado - \$25\.40 - Tarjeta CC\nAutoPay: On/);
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
  assert.match(note, /\nSe firmó la carta de consentimiento en línea\.$/);
  /* en la oficina: se entrega la cotización y se firma en la oficina */
  const ofi = N.buildNote(Object.assign({}, sel, { canal: "Walk In", revisaPlanes: true }));
  assert.match(ofi, /desea cotizar/);
  assert.match(ofi, /\nSe le entrega la cotización para que revise los planes\.\nSe firmó la carta de consentimiento en la oficina\.$/);
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

test("nota: Medicare enviada como el template MEDICARE", () => {
  const note = N.buildNote(make({
    ini: "ER", line: "mc", outcome: "enviada", gestion: "nueva", nombres: "ANGEL", apellidos: "CASO",
    mbi: "6cx0x98vt11", parteA: "04/01/2025", parteB: "11/01/2025", compania: "Humana", medicaid: "12345678",
    plan: "Humana Gold Plus H1036-217-000 (HMO)", confirmacion: "0G3VPC082Z", soaFecha: "02/01/2026",
    periodoMC: "SEP", motivoSepMC: "DST - Disaster", efectiva: "10/01/2026", pcp: "Carmen M Fernandez (Millennium)",
    agente: "Liseth Iznaga", agenteIni: "LI", net: { soa: true, appsummary: true }
  }));
  assert.equal(note, [
    "ER_02/01/2026: Se procesa app de MC con Humana.",
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

test("nota: suplementario como el template ACCIDENTE", () => {
  const note = N.buildNote(make({
    ini: "ER", line: "supp", outcome: "enviada", gestion: "nueva", producto: "Accident", genero: "a",
    compania: "Allstate", plan: "Enhancer AME 17500", poliza: "2037288957", efectiva: "08/21/2026", prima: "12.89",
    beneficiario: "Sparling, Bryan (father)", pagoEstado: "PAYMENT", pagoMetodo: "CC", autopay: "On",
    agente: "Eduardo Chinea", agenteIni: "ER",
    /* ya no van en Suplementario */
    appId: "APP-998877", tipoPlan: "DPPO", colaboradorNombre: "My Access", notas: "Llamar el lunes", fechaSeg: "02/03/2026", pendiente: "Firma"
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
  /* Members: solo los nombres de pila de quienes tienen cobertura */
  const family = N.buildNote(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Hospital", nombres: "RAUL", apellidos: "GAVELA",
    compania: "Golden Rule", personas: [{ titular: true, cobertura: true, dob: "01/02/1980" }, { nombre: "MARIA GAVELA", cobertura: true },
      { nombre: "LUIS GAVELA", cobertura: true }, { nombre: "ANA GAVELA", cobertura: false }] }));
  assert.match(family, /^LI_02\/01\/2026: Se procesa app de Hospital de GR para el cliente, Maria y Luis\.$/m);
  const kids = N.buildNote(make({ line: "supp", outcome: "enviada", gestion: "renovacion", producto: "Dental", compania: "Cigna",
    personas: [{ titular: true, cobertura: false }, { nombre: "MARIA DIAZ", cobertura: true }] }));
  assert.match(kids, /^LI_02\/01\/2026: Se renueva app de Dental de Cigna para Maria\.$/m);
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
  const d = make({ line: "oc", outcome: "enviada", gestion: "nueva", agente: "Liseth Iznaga", agenteIni: "LI", net: {} });
  assert.match(N.buildNote(d), /\nNPN: LI(\n|$)/);
  assert.doesNotMatch(N.buildNote(d), /Habló|Colaborador/);
  assert.match(N.buildNote(Object.assign({}, d, { talkerNombre: "Fiorella Vieira", colaboradorNombre: "My Access" })),
    /\nNPN: LI\nHabló con el cliente: FIORELLA VIEIRA\nColaborador: MY ACCESS/);
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
  const tel = N.buildSms(make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Dental", oficina: "QAgency", telefono: "(305) 555-0100" }));
  assert.match(tel, /^Hola Beatriz, le saluda el equipo de QAgency\. .* Cualquier duda, llámenos al \(305\) 555-0100\.$/);
  Object.keys(C.LINES).forEach((line) => C.LINES[line].outcomes.forEach((o) => {
    const s = N.buildSms(make({ line, outcome: o.id, oficina: "QAgency" }));
    if (o.noSms) { assert.equal(s, "", line + "/" + o.id); return; }
    if (line === "oc" && o.id === "enviada") { assert.match(s, /^Estimado Beatriz: Somos QAgency Insurance\. /); return; }
    assert.match(s, /^Hola Beatriz, le saluda el equipo de QAgency\. \S/, line + "/" + o.id);
    assert.doesNotMatch(s, /undefined|null|NaN/, line + "/" + o.id);
  }));
});

test("SMS Obamacare enviada: formato de la agencia en español e inglés", () => {
  const d = make({ line: "oc", outcome: "enviada", gestion: "renovacion", anio: "2027", nombres: "MIGUEL", genero: "o", oficina: "QAgency",
    compania: "FLORIDA BLUE", plan: "myBlue Essentials Silver 27M07-01C", efectiva: "1/1/2027", prima: "85.4",
    firmaNombre: "EDUARDO CHINEA", firmaTel: "(239) 282-4226", telefono: "(239) 205-2047" });
  assert.equal(N.buildSms(d), [
    "Estimado Miguel: Somos QAgency Insurance. Hemos renovado su seguro de salud 2027 con Florida Blue.",
    "Plan: myBlue Essentials Silver 27M07-01C",
    "Inicio: 01/01/2027",
    "Premium: $85.40/mes",
    "Revise su email y para cualquier duda, comuníquese de inmediato con nosotros. Saludos Eduardo Chinea",
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
    "Eduardo Chinea",
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

test("email Obamacare: parte 1 con la póliza y parte 2 con lo que pide el Mercado", () => {
  const d = make({ line: "oc", outcome: "enviada", gestion: "nueva", anio: "2027", compania: "Florida Blue", plan: "myBlue Essentials Silver",
    efectiva: "01/01/2027", prima: "85.4", firmaNombre: "Eduardo Chinea", personas: familia,
    docs: [{ cat: "immigration", persona: "JUAN CARLOS DIAZ", fecha: "03/01/2027", enviado: true },
           { cat: "income", persona: "BEATRIZ DIAZ", fecha: "02/12/2027" }] });
  assert.equal(N.buildEmail(d, 1), [
    "Estimado Cliente:",
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
    "Eduardo Chinea"
  ].join("\n"));
  const en = Object.assign({}, d, { idioma: "en" });
  assert.equal(N.buildEmail(en, 1), [
    "Dear Client:",
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
    "Eduardo Chinea"
  ].join("\n"));
  /* una sola persona no lleva nombre; sin documentos pedidos la parte 2 es solo el cierre */
  assert.match(N.buildEmail(Object.assign({}, d, { docs: [{ cat: "income", persona: "BEATRIZ DIAZ", fecha: "02/12/2027" }] }), 2),
    /^MARKETPLACE SOLICITA:\nPruebas de Ingresos, fecha límite 02\/12\/2027\n\n/);
  assert.equal(N.buildEmail(Object.assign({}, d, { docs: [] }), 2), "Por favor comuníquese con nosotros por cualquier duda.\n\nSaludos\nEduardo Chinea");
  assert.match(N.buildEmail(Object.assign({}, d, { genero: "a" }), 1), /^Estimada Cliente:\n/);
  assert.equal(N.buildEmail(make({ line: "oc", outcome: "pendiente" }), 1), "", "solo para una app enviada");
  assert.equal(N.buildEmail(make({ line: "mc", outcome: "enviada" }), 2), "");
  assert.ok(C.MKPL_DOCS.every((c) => /^Pruebas de /.test(c.es) && /^Proof of /.test(c.en)), "las 11 en los dos idiomas");
});

test("email Suplementario: aplicación enviada en español e inglés", () => {
  const d = make({ line: "supp", outcome: "enviada", gestion: "nueva", producto: "Dental", compania: "FLORIDA BLUE (FCL)",
    poliza: "FB123456", efectiva: "12/01/2026", prima: "38.5", firmaNombre: "EDUARDO CHINEA" });
  assert.equal(N.buildEmail(d, 1), [
    "Estimado Cliente",
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
    "Eduardo Chinea"
  ].join("\n"));
  assert.equal(N.buildEmail(Object.assign({}, d, { idioma: "en" }), 1), [
    "Dear Client",
    "",
    "We attached the application for:",
    "Company Florida Blue",
    "ID # FB123456",
    "Effective date: 12/01/2026",
    "Monthly Premium: $38.50",
    "Please feel free to contact us, if you have any questions or concerns.",
    "",
    "Best regards,",
    "Eduardo Chinea"
  ].join("\n"));
  assert.match(N.buildEmail(Object.assign({}, d, { genero: "a" }), 1), /^Estimada Cliente\n/);
  /* una sola parte; sin póliza no hay línea de ID */
  assert.equal(N.buildEmail(d, 2), "");
  assert.doesNotMatch(N.buildEmail(Object.assign({}, d, { poliza: "" }), 1), /ID #/);
  assert.match(N.buildEmail(Object.assign({}, d, { compania: "UHC" }), 1), /\nCompañía UnitedHealthcare\n/);
  assert.equal(N.buildEmail(make({ line: "supp", outcome: "cotizacion" }), 1), "");
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
  assert.deepEqual(order({ line: "oc", outcome: "enviada", gestion: "nueva" }), ["note", "task", "report", "sms", "email1", "email2"]);
  assert.deepEqual(order({ line: "supp", outcome: "enviada", gestion: "nueva" }), ["note", "task", "report", "sms", "email1"]);
  assert.deepEqual(order({ line: "supp", outcome: "cotizacion" }), ["note", "task", "sms"]);
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

test("ventana flotante: iniciales del cliente, nombre y apellido", () => {
  assert.equal(N.clientInitials({ nombres: "beatriz elena", apellidos: "diaz lopez" }), "BD");
  assert.equal(N.clientInitials({ nombres: "  ángel ", apellidos: "ortiz" }), "ÁO");
  assert.equal(N.clientInitials({ nombres: "Beatriz" }), "B");
  assert.equal(N.clientInitials({ apellidos: "Diaz" }), "D");
  assert.equal(N.clientInitials({}), "");
});
