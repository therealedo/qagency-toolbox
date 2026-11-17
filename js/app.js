/* Q Agency Toolbox — pantalla.
   Mantiene un único estado (S) con los datos del caso; cada cambio vuelve a
   generar la nota, el task y el reporte. Los datos del cliente viven solo en
   memoria; en el navegador se guardan únicamente los ajustes (equipo, tema). */
(function () {
  "use strict";

  var C = window.QA.config, U = window.QA.util, N = window.QA.notes, X = window.QA.extract;
  /* Consent y SOA para firmar (F ya nombra a los campos del formulario) */
  var FM = window.QA.forms;
  /* OCR sin internet para escaneos y capturas; null si no se cargó */
  var OCR = window.QA.ocr || null;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* ------------------------------------------------------------ ajustes */

  var STORE = "qa.toolbox.v1";
  var SETTINGS_VERSION = 2;

  function loadSettings() {
    var def = {
      v: SETTINGS_VERSION, autor: "", team: clone(C.TEAM), oficina: C.OFFICES[0], telefonos: {},
      botonRojo: true, sinAcentos: false, theme: "", line: "oc",
      /* enlace de la plantilla de SignWell de cada formulario (FM.TEMPLATES) */
      signLinks: {},
      /* nombre de cada carpeta del Network elegida, para avisar cuál falta
         si el navegador deja de tenerla */
      netDirNames: {}
    };
    try {
      var saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && typeof saved === "object") {
        Object.keys(def).forEach(function (k) { if (k !== "v" && saved[k] !== undefined) { def[k] = saved[k]; } });
        /* un equipo ya guardado en este navegador se conserva tal cual */
        if (!Array.isArray(def.team) || !def.team.length) { def.team = clone(C.TEAM); }
      }
    } catch (e) { /* almacenamiento bloqueado: se sigue con los valores por defecto */ }
    if (!C.LINES[def.line]) { def.line = "oc"; }
    if (C.OFFICES.indexOf(def.oficina) < 0) { def.oficina = C.OFFICES[0]; }
    if (!def.telefonos || typeof def.telefonos !== "object") { def.telefonos = {}; }
    if (!def.signLinks || typeof def.signLinks !== "object") { def.signLinks = {}; }
    if (!def.netDirNames || typeof def.netDirNames !== "object") { def.netDirNames = {}; }
    return def;
  }

  function saveSettings() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* sin almacenamiento */ }
  }

  var settings = loadSettings();

  function memberByName(name) {
    var n = U.collapse(name).toLowerCase();
    if (!n) { return null; }
    for (var i = 0; i < settings.team.length; i++) {
      if (U.collapse(settings.team[i].name).toLowerCase() === n) { return settings.team[i]; }
    }
    return null;
  }
  function agentIniOf(m) { return m ? (m.agentIni || m.ini || "") : ""; }

  /* ------------------------------------------------------------- estado */

  function seasonDefaults() {
    var now = new Date(), m = now.getMonth() + 1, d = now.getDate();
    var aep = (m === 10 && d >= 15) || m === 11 || (m === 12 && d <= 7);
    var maOep = m >= 1 && m <= 3;
    var oep = m === 11 || m === 12 || (m === 1 && d <= 15);
    return { periodoMC: aep ? "AEP" : (maOep ? "OEP" : "SEP"), periodo: oep ? "OEP" : "SEP" };
  }

  function freshEdited() { return { note: false, task: false, report: false, sms: false, email1: false, email2: false }; }

  function freshFields() {
    var season = seasonDefaults();
    return {
      fecha: U.today(), genero: "o",
      canal: "Call", modalidad: "presencial", anio: U.defaultPlanYear(),
      codigoTipo: "Q", gestion: "", periodo: season.periodo, plataforma: "MKPL",
      periodoMC: season.periodoMC, soaFecha: "", tienePrima: false, esCliente: true, obsTags: [], producto: "Dental",
      metodo: "TEXT", intento: "1", hora: "09:00", net: {}, taskId: "", taskOwner: "",
      talker: "", npnAgente: "", colaborador: "", prefijo: "",
      personas: [{ titular: true, parentesco: "Titular", taxes: true, cobertura: true, ingreso: "", estatus: "", dob: "" }],
      docs: [], planes: [], revisaPlanes: false, motivoCancel: "", motivoOtro: "", hogarDoc: "",
      /* compañía elegida en el selector (Obamacare y Medicare) y estado de BCBS of */
      companiaSel: "", bcbsEstado: "", tipoCancel: "cancelled", fechaTermino: "",
      direccion: "", clienteTel: "", clienteEmail: "", idioma: "es",
      /* Cambios: personas de un documento que se quitaron y si el hogar vino de un documento */
      quitados: [], hogarPdf: false,
      /* filas de documentos o planes cotizados que el agente borró */
      descartados: []
    };
  }

  var S = {
    line: settings.line,
    outcome: C.LINES[settings.line].outcomes[0].id,
    f: freshFields(),
    auto: {},      /* true: leído de un documento; "calc": calculado o por defecto */
    rank: {},      /* prioridad del documento que llenó cada campo */
    base: {},      /* valor que trajo un documento, para saber qué cambió */
    files: [],
    edited: freshEdited(),
    /* valores del Consent o del SOA que se cambiaron a mano, por formulario */
    signEdits: {},
    /* la hora ya se puso: "doc" con el primer documento, "user" a mano */
    horaFrom: "",
    /* campos de MUST_CHOOSE que el agente ya eligió o confirmó */
    chosen: {},
    dirty: false
  };

  function L() { return C.LINES[S.line]; }
  function O() { return N.outcomeOf({ line: S.line, outcome: S.outcome }); }
  function isOC(id) { return S.line === "oc" && (!id || O().id === id); }
  function isSupp(id) { return S.line === "supp" && (!id || O().id === id); }
  /* Medicare sin cambios: solo el nombre del plan, sin datos de Medicare */
  function mcSin() { return S.line === "mc" && O().id === "sincambio"; }

  /* --------------------------------------------------------- formulario */

  var GROUPS = [
    { id: "contacto", title: "Contacto" },
    { id: "cliente", title: function () { return { oc: "Hogar", supp: "Members" }[S.line] || "Cliente"; } },
    { id: "cancelacion", title: "Cancelación" },
    { id: "gestion", title: "Gestión" },
    { id: "plan", title: function () { return isOC("pendiente") ? "Planes cotizados" : "Plan"; } },
    { id: "pago", title: "Pago" },
    { id: "docs", title: "Documentos que pide el Mercado", short: "Docs pedidos" },
    { id: "seguimiento", title: "Pendiente y próximo paso", short: "Seguimiento" },
    { id: "agente", title: function () { return S.line === "oc" ? "Agente y colaborador" : "Agente"; }, short: "Agente" },
    { id: "network", title: "Network: documentos y nombres de archivo", short: "Network" }
  ];

  var SEP_OC = ["Pérdida de cobertura", "Mudanza", "Matrimonio", "Nacimiento o adopción", "Divorcio o separación",
    "Cambio de ingresos", "Nuevo estatus migratorio o ciudadanía", "Pérdida de Medicaid o CHIP", "Salida del plan del empleador"];
  var SEP_MC = ["Dual / LIS (Medicaid o Extra Help)", "Mudanza", "Pérdida de cobertura", "Plan 5 estrellas",
    "Pérdida de Medicaid", "Condición crónica (C-SNP)", "Desastre declarado (FEMA)", "Salida de plan de empleador"];

  function quickDates() {
    return [
      { l: "Mañana", fn: function () { return U.addDays(U.today(), 1); } },
      { l: "+3 días", fn: function () { return U.addDays(U.today(), 3); } },
      { l: "+1 semana", fn: function () { return U.addDays(U.today(), 7); } },
      { l: "+2 semanas", fn: function () { return U.addDays(U.today(), 14); } },
      { l: "+1 mes", fn: function () { return U.addMonths(U.today(), 1); } }
    ];
  }

  function teamOptions(empty) {
    return [{ v: "", l: empty }].concat(settings.team.filter(function (t) { return t.name; })
      .map(function (t) { return { v: t.name, l: t.name + (t.ini ? " · " + t.ini : "") }; }));
  }
  /* Agentes con NPN, para elegir cuál se usó. Si un documento trae un agente
     que no está en el equipo, aparece también. */
  function npnOptions() {
    var out = [{ v: "", l: "Elige el agente" }];
    settings.team.forEach(function (t) { if (t.name && t.npn) { out.push({ v: t.name, l: t.name.toUpperCase() + " · " + t.npn }); } });
    var x = S.f.agenteExtra;
    if (x && (x.name || x.npn)) {
      out.push({ v: "__extra", l: (x.name ? x.name.toUpperCase() + (x.npn ? " · " + x.npn : "") : "NPN " + x.npn) + " (del documento)" });
    }
    return out;
  }

  /* Compañía en Obamacare y Medicare: la lista oficial de la agencia y «Otra»,
     que pide escribir el nombre. BCBS of pide además el estado. */
  function carrierSelectOptions() {
    return [{ v: "", l: "Elige la compañía" }]
      .concat(N.carrierOptions(S.line).map(function (o) { return { v: o.v, l: o.l }; }))
      .concat([{ v: N.CARRIER_OTHER, l: "Otra" }]);
  }
  function needsState(sel) { return N.carrierOptions(S.line).some(function (o) { return o.state && o.v === sel; }); }
  function otherCarrier(f) { return f.companiaSel === N.CARRIER_OTHER; }

  /* k        clave del control (única)
     store    clave en S.f si no es k (dos controles para el mismo dato)
     sec      sección (o lista de secciones) que debe estar activa
     lines    líneas en las que aplica (sin definir = todas)
     when     condición adicional sobre los datos
     w        ancho en la rejilla: w2, w3, full
     type     text, date, int, money, area, select, seg, check, slot (hora
              de media hora) o una lista: personas, docslist, planeslist */
  var FIELDS = [
    { k: "fecha", g: "contacto", type: "date", label: "Fecha de la nota" },
    { k: "anio", g: "contacto", type: "int", label: "Año del plan", max: 4 },
    { k: "canal", g: "contacto", type: "seg", label: "Canal", w: "w2", options: C.CHANNELS },
    { k: "hora", g: "contacto", type: "slot", label: "Hora de revisión del task", w: "w2",
      hint: "Se pone sola al cargar el primer documento. La nota lleva la hora exacta; el task, la hora en punto o y media de antes (9:13 → 9:00, 9:34 → 9:30)." },
    { k: "modalidad", g: "contacto", type: "select", label: "Modalidad de la cita", options: C.MODALIDADES,
      when: function (f) { return f.canal === "Appointment"; } },

    { k: "nombres", g: "cliente", sec: "cliente", type: "text", label: function () { return S.line !== "mc" ? "Nombre(s) del titular" : "Nombre(s)"; },
      w: "w2", upper: true, hint: "Como aparece en Zoho" },
    { k: "apellidos", g: "cliente", sec: "cliente", type: "text", label: "Apellido(s)", w: "w2", upper: true },
    { k: "genero", g: "cliente", sec: "cliente", type: "seg", label: "En la nota", w: "w2",
      options: [{ v: "o", l: "el cliente" }, { v: "a", l: "la cliente" }] },
    { k: "codigoTipo", g: "cliente", sec: "cliente", type: "seg", label: "Código en Zoho", w: "w2",
      options: [{ v: "Q", l: "Código Q" }, { v: "New", l: "New" }, { v: "Sin Code", l: "Sin Code" }] },
    { k: "codigoQ", g: "cliente", sec: "cliente", type: "text", label: "Número Q", ph: "1234", prefix: "Q",
      when: function (f) { return f.codigoTipo === "Q"; } },
    { k: "esCliente", g: "cliente", sec: "cliente", type: "check", w: "w2", lines: ["mc"],
      label: "Es cliente (si no, el task es FOLLOW UP LEAD_INACTIVE CLIENT MC)", when: mcSin },
    { k: "direccion", g: "cliente", sec: "cliente", type: "text", label: "Dirección", w: "full", lines: ["oc", "supp"],
      ph: "Calle, ciudad, estado y código postal", when: function () { return !isOC("cancelada"); } },
    /* en Medicare van al SOA y al texto para pedirlo en Cliq */
    { k: "clienteTel", g: "cliente", sec: "cliente", type: "text", w: "w2", mode: "tel", ph: "(305) 555-0100",
      label: function () { return S.line === "mc" ? "Teléfono del cliente" : "Teléfono del titular"; },
      when: function () { return !isOC("cancelada"); } },
    { k: "clienteEmail", g: "cliente", sec: "cliente", type: "text", w: "w2", mode: "email",
      label: function () { return S.line === "mc" ? "Email del cliente" : "Email del titular"; },
      when: function () { return !isOC("cancelada"); } },
    { k: "personas", g: "cliente", sec: "cliente", type: "personas", w: "full", lines: ["oc", "supp"] },
    { k: "adicionales", g: "cliente", sec: "cliente", type: "text", label: "Miembros ±", lines: ["supp"],
      hint: "Para el reporte: +2, o -1 si se quitó" },
    { k: "mbi", g: "cliente", sec: "medicare", type: "text", label: "Número de Medicare (MBI)", w: "w2", upper: true, lines: ["mc"] },
    { k: "medicaid", g: "cliente", sec: "medicare", type: "text", label: "ID de Medicaid", w: "w2", lines: ["mc"], hint: "Solo si tiene Medicaid" },
    { k: "parteA", g: "cliente", sec: "medicare", type: "date", label: "Parte A efectiva", lines: ["mc"] },
    { k: "parteB", g: "cliente", sec: "medicare", type: "date", label: "Parte B efectiva", lines: ["mc"] },

    { k: "motivoCancel", g: "cancelacion", sec: "cancelacion", type: "select", label: "Motivo", w: "w2",
      options: function () { return [{ v: "", l: "Elige el motivo" }].concat(C.CANCEL_REASONS.map(function (r) { return { v: r, l: r }; })); } },
    { k: "motivoOtro", g: "cancelacion", sec: "cancelacion", type: "text", label: "¿Cuál?", w: "w2",
      when: function (f) { return f.motivoCancel === "Otro"; } },
    { k: "gestionC", store: "gestion", g: "cancelacion", sec: "cancelacion", type: "seg", label: "Proceso que se cancela", w: "full",
      options: [{ v: "nueva", l: "App nueva" }, { v: "renovacion", l: "Renovación" }, { v: "cambio", l: "Póliza activa (Life Change)" }] },
    { k: "tipoCancel", g: "cancelacion", sec: "cancelacion", type: "seg", label: "Tipo de cancelación", w: "w2", options: C.CANCEL_TYPES },
    { k: "efectivaC", store: "efectiva", g: "cancelacion", sec: "cancelacion", type: "date", label: "Cobertura desde",
      hint: "El archivo CANCELLED lleva este mes", when: function (f) { return f.tipoCancel !== "terminated"; } },
    { k: "fechaTermino", g: "cancelacion", sec: "cancelacion", type: "date", label: "Fecha de terminación",
      hint: "El archivo TERMINATED lleva este mes", when: function (f) { return f.tipoCancel === "terminated"; } },
    { k: "companiaSelC", store: "companiaSel", g: "cancelacion", sec: "cancelacion", type: "select", label: "Compañía", w: "w2",
      options: carrierSelectOptions },
    { k: "companiaC", store: "compania", g: "cancelacion", sec: "cancelacion", type: "text", label: "Nombre de la compañía", w: "w2",
      when: otherCarrier },
    { k: "npnAgenteC", store: "npnAgente", g: "cancelacion", sec: "cancelacion", type: "select", label: "Agente (NPN)", w: "w2",
      options: npnOptions, hint: "Va entre paréntesis en el reporte" },

    { k: "gestion", g: "gestion", sec: "proceso", type: "seg", label: "Tipo de gestión", w: "w3",
      options: function () { return L().gestiones.map(function (x) { return { v: x.v, l: x.label }; }); } },
    { k: "recuperado", g: "gestion", sec: "proceso", type: "check", label: "Cliente recuperado" },
    { k: "producto", g: "gestion", sec: "proceso", type: "select", label: "Producto", lines: ["supp"],
      options: C.LINES.supp.productos.map(function (p) { return p.v; }) },
    { k: "periodo", g: "gestion", sec: "proceso", type: "seg", label: "Enrollment Period", w: "w2", lines: ["oc"], options: ["OEP", "SEP", "None"] },
    { k: "motivoSep", g: "gestion", sec: "proceso", type: "text", label: "Motivo del SEP", w: "w2", lines: ["oc"], list: SEP_OC,
      when: function (f) { return f.periodo === "SEP"; } },
    { k: "plataforma", g: "gestion", sec: "proceso", type: "select", label: "Plataforma", lines: ["oc"],
      options: ["MKPL", "HealthSherpa", "Portal de la compañía"] },
    { k: "appId", g: "gestion", sec: "proceso", type: "text", lines: ["oc"], label: "ID de aplicación (ID#)",
      when: function () { return !isOC("pendiente"); } },
    { k: "cuentaMkpl", g: "gestion", sec: "proceso", type: "seg", label: "Cuenta MKPL", w: "w2", lines: ["oc"], clearable: true,
      options: [{ v: "si", l: "Creada" }, { v: "no", l: "No creada" }],
      when: function () { return isOC("enviada"); } },
    { k: "periodoMC", g: "gestion", sec: "proceso", type: "select", label: "Período de elección", lines: ["mc"],
      options: ["AEP", "OEP", "ICEP / IEP", "SEP"] },
    { k: "motivoSepMC", g: "gestion", sec: "proceso", type: "text", label: "Motivo del SEP", w: "w2", lines: ["mc"], list: SEP_MC,
      when: function (f) { return f.periodoMC === "SEP"; } },
    { k: "soaFecha", g: "gestion", sec: "proceso", type: "date", label: "Fecha del SOA", lines: ["mc"],
      hint: "La de la nota, si no se cambia" },
    { k: "anterior", g: "gestion", sec: "proceso", type: "text", label: "Plan anterior", w: "w2", lines: ["mc"],
      when: function (f) { return f.gestion === "cambio"; } },
    { k: "metodo", g: "gestion", sec: "contacto", type: "seg", label: "Se le envió", w: "w2", options: ["TEXT", "EMAIL", "LETTER"] },
    { k: "intento", g: "gestion", sec: "contacto", type: "int", label: "Intento #", max: 2 },

    { k: "planes", g: "plan", sec: "planes", type: "planeslist", w: "full", lines: ["oc"] },
    { k: "companiaSel", g: "plan", sec: "plan", type: "select", label: "Compañía", w: "w2", lines: ["oc", "mc"],
      options: carrierSelectOptions, when: function () { return !mcSin(); } },
    { k: "bcbsEstado", g: "plan", sec: "plan", type: "text", label: "Estado de BCBS", ph: "GA", max: 2, upper: true, lines: ["mc"],
      hint: "Dos letras", when: function (f) { return !mcSin() && needsState(f.companiaSel); } },
    /* Suplementario escribe la compañía; Obamacare y Medicare, solo con «Otra» */
    { k: "compania", g: "plan", sec: "plan", type: "text", w: "w2",
      label: function () { return S.line === "supp" ? "Compañía" : "Nombre de la compañía"; },
      list: function () { return S.line === "supp" ? C.CARRIERS.supp.map(function (c) { return c.name; }) : []; },
      when: function (f) { return !mcSin() && (S.line === "supp" || otherCarrier(f)); } },
    { k: "plan", g: "plan", sec: "plan", type: "text", label: "Nombre del plan", w: "w2",
      hint: function () { return S.line === "mc" ? "Con el contrato (H-PBP): Humana Gold Plus H1036-077 (HMO)" : ""; } },
    { k: "estado", g: "plan", sec: "plan", type: "text", label: "Status", lines: ["oc"], list: ["Active", "Pending", "Unpaid binder", "Terminated"] },
    { k: "tienePrima", g: "plan", sec: "plan", type: "check", lines: ["mc"], label: "Tiene prima mensual (si no, Premium $0.00)",
      when: function () { return !mcSin(); } },
    { k: "prima", g: "plan", sec: "plan", type: "money", label: "Prima mensual",
      hint: function () { return S.line === "oc" ? "Lo que paga el cliente, ya con el subsidio" : ""; },
      when: function (f) { return S.line !== "mc" || (!!f.tienePrima && !mcSin()); } },
    { k: "efectiva", g: "plan", sec: ["plan", "planes"], type: "date",
      label: function () { return S.line === "oc" ? "Cobertura desde" : (isSupp("cotizacion") ? "Fecha efectiva estimada" : "Fecha efectiva"); },
      when: function () { return !mcSin(); } },
    { k: "revisaPlanes", g: "plan", sec: "planes", type: "check", w: "w3", lines: ["oc"],
      label: "Revisará los planes: se le envía o entrega la cotización" },
    { k: "poliza", g: "plan", sec: "plan", type: "text", label: "Policy #", lines: ["supp"], when: function () { return !isSupp("cotizacion"); } },
    { k: "plazo", g: "plan", sec: "plan", type: "text", label: "Periodo", ph: "3 years", lines: ["supp"],
      when: function (f) { return f.producto === "Short Term"; } },
    { k: "beneficiario", g: "plan", sec: "plan", type: "text", label: "Beneficiario", w: "w2", lines: ["supp"],
      ph: "Apellido, Nombre (parentesco)", when: function (f) { return f.producto === "Life" || f.producto === "Accident"; } },
    { k: "pcp", g: "plan", sec: "plan", type: "text", label: "PCP", w: "w2", lines: ["mc"], when: function () { return !mcSin(); } },
    { k: "pcpId", g: "plan", sec: "plan", type: "text", label: "ID del PCP", lines: ["mc"], when: function () { return !mcSin(); } },
    { k: "confirmacion", g: "plan", sec: "plan", type: "text", label: "App ID", lines: ["mc"], when: function () { return !mcSin(); } },
    { k: "afeccion", g: "plan", sec: "plan", type: "text", label: "Afección crónica que califica", w: "w2", lines: ["mc"], when: function () { return !mcSin(); } },
    { k: "cmd", g: "plan", sec: "plan", type: "check", w: "w2", lines: ["mc"], label: "Condiciones médicas diversas (task CMD)",
      when: function () { return O().task === "mc_mant" && !O().cancelled && !mcSin(); } },

    { k: "pagoEstado", g: "pago", sec: "pago", type: "seg", label: "Estado del pago", w: "full",
      options: function () {
        /* Suplementario solo ofrece Pago confirmado y Pendiente de pago */
        var allowed = S.line === "supp" ? C.LINES.supp.pagos : null;
        return C.PAYMENT.filter(function (p) { return !allowed || allowed.indexOf(p.v) >= 0; })
          .map(function (p) { return { v: p.v, l: p.label, t: p.hint }; });
      }, clearable: true },
    { k: "pagoMonto", g: "pago", sec: "pago", type: "money", label: "Monto",
      when: function (f) { return f.pagoEstado === "PAYMENT" || f.pagoEstado === "NO PAYMENT"; } },
    { k: "pagoFecha", g: "pago", sec: "pago", type: "date",
      label: function () { return S.f.pagoEstado === "NO PAYMENT" ? "El cliente paga el" : "Fecha del pago"; },
      when: function (f) { return f.pagoEstado === "PAYMENT" || f.pagoEstado === "NO PAYMENT"; } },
    { k: "pagoMetodo", g: "pago", sec: "pago", type: "select", label: "Método",
      options: function () { return [{ v: "", l: "—" }].concat(C.PAY_METHODS.map(function (m) { return { v: m, l: m }; })); },
      when: function (f) { return f.pagoEstado === "PAYMENT"; } },
    { k: "pagoConf", g: "pago", sec: "pago", type: "text", label: "No. de confirmación",
      when: function (f) { return f.pagoEstado === "PAYMENT"; } },
    { k: "autopay", g: "pago", sec: "pago", type: "seg", label: "AutoPay", options: ["On", "Off"], clearable: true,
      when: function (f) { return f.pagoEstado === "PAYMENT"; } },

    { k: "docs", g: "docs", sec: "docsreq", type: "docslist", w: "full", lines: ["oc"] },

    { k: "pendiente", g: "seguimiento", sec: "seguimiento", type: "text", label: "Pendiente", w: "full",
      ph: function () { return O().pendiente || "Ninguno"; } },
    { k: "proximo", g: "seguimiento", sec: "seguimiento", type: "text", label: "Próximo paso", w: "full",
      ph: function () { return (O().proximo || "").replace("{plataforma}", S.f.plataforma || "el Mercado"); } },
    { k: "fechaSeg", g: "seguimiento", sec: "seguimiento", type: "date", w: "full", quick: quickDates(),
      label: function () { return O().id === "cita" ? "Fecha de la cita" : "Fecha de seguimiento"; } },
    { k: "notas", g: "seguimiento", sec: "seguimiento", type: "area", label: "Observaciones", w: "full", rows: 2,
      ph: "Detalles del caso que no caben en los campos" },

    { k: "talker", g: "agente", sec: "agente", type: "select", label: "Habló con el cliente", w: "w2",
      options: function () { return teamOptions("—"); } },
    { k: "npnAgente", g: "agente", sec: "agente", type: "select", label: "Agente (NPN)", w: "w2",
      options: npnOptions, hint: "El NPN con el que se hace la app" },
    { k: "colaborador", g: "agente", sec: "agente", type: "select", label: "Colaborador", w: "w2", lines: ["oc"],
      hint: "Quién procesó la aplicación", options: function () { return teamOptions("—"); } }
  ];

  var FIELD = {};
  FIELDS.forEach(function (F) { FIELD[F.k] = F; });

  function resolve(v) { return typeof v === "function" ? v() : v; }
  function optList(F) {
    return (resolve(F.options) || []).map(function (o) { return typeof o === "string" ? { v: o, l: o || "—" } : o; });
  }

  function fillSeg(seg, options) {
    seg.textContent = "";
    options.forEach(function (o) {
      var b = el("button", null, o.l);
      b.type = "button"; b.dataset.v = o.v; b.setAttribute("role", "radio");
      if (o.t) { b.title = o.t; }
      seg.appendChild(b);
    });
  }

  function fillSelect(sel, options) {
    sel.textContent = "";
    options.forEach(function (o) { var op = el("option", null, o.l); op.value = o.v; sel.appendChild(op); });
  }

  function key(F) { return F.store || F.k; }

  function buildField(F) {
    var wrap = el("div", "fld" + (F.w ? " " + F.w : ""));
    wrap.dataset.k = F.k;
    var id = "f_" + F.k, ctl;

    if (F.type === "personas" || F.type === "docslist" || F.type === "planeslist") {
      wrap.appendChild(el("div", "list-box")).id = "list_" + F.k;
      return wrap;
    }

    if (F.type === "check") {
      var lab = el("label", "check");
      ctl = el("input"); ctl.type = "checkbox"; ctl.id = id;
      lab.appendChild(ctl); lab.appendChild(el("span", null, resolve(F.label)));
      wrap.appendChild(lab);
      return wrap;
    }

    var label = el(F.type === "seg" ? "div" : "label", "field-label", resolve(F.label));
    if (F.type !== "seg") { label.htmlFor = id; }
    label.dataset.label = F.k;
    wrap.appendChild(label);

    if (F.type === "seg") {
      ctl = el("div", "seg");
      ctl.setAttribute("role", "radiogroup");
      ctl.dataset.seg = F.k;
      fillSeg(ctl, optList(F));
    } else if (F.type === "select") {
      ctl = el("select");
      fillSelect(ctl, optList(F));
    } else if (F.type === "area") {
      ctl = el("textarea"); ctl.rows = F.rows || 2;
    } else {
      ctl = el("input"); ctl.type = "text";
      if (F.type === "money") { ctl.inputMode = "decimal"; ctl.placeholder = "$0.00"; ctl.classList.add("num"); }
      if (F.type === "date") { ctl.placeholder = "MM/DD/AAAA"; ctl.classList.add("num"); }
      if (F.type === "int") { ctl.inputMode = "numeric"; ctl.classList.add("num"); }
      if (F.max) { ctl.maxLength = F.max; }
      if (F.mode) { ctl.inputMode = F.mode; }
      if (F.list) { ctl.setAttribute("list", "dl_" + F.k); }
    }
    if (F.type !== "seg") { ctl.id = id; }
    if (F.upper) { ctl.classList.add("upper"); }
    if (F.ph && typeof F.ph === "string") { ctl.placeholder = F.ph; }

    if (F.type === "slot") {
      wrap.appendChild(slotPicker(ctl, function () { return S.f.hora; }, function (v) {
        S.f.hora = v; S.horaFrom = "user"; touched("hora"); refresh();
      }));
    } else if (F.prefix) {
      var box = el("div", "with-prefix");
      box.appendChild(el("span", "prefix", F.prefix));
      box.appendChild(ctl);
      wrap.appendChild(box);
    } else {
      wrap.appendChild(ctl);
    }

    if (F.list) { var dl = el("datalist"); dl.id = "dl_" + F.k; wrap.appendChild(dl); }
    if (F.quick) {
      var q = el("div", "quick");
      F.quick.forEach(function (item, i) {
        var b = el("button", "chip-mini", item.l);
        b.type = "button"; b.dataset.quick = F.k; b.dataset.i = i;
        q.appendChild(b);
      });
      wrap.appendChild(q);
    }
    if (F.hint) { var h = el("span", "hint", resolve(F.hint)); h.dataset.hint = F.k; wrap.appendChild(h); }
    return wrap;
  }

  /* ------------------------------------------------------- hora (media hora)
     Se puede escribir (2, 230, 2:30pm, 14:30) o elegir en la cuadrícula.
     Flechas arriba/abajo suben o bajan media hora. */
  var SLOT_COLS = [{ t: "Mañana", from: 7, to: 11 }, { t: "Tarde", from: 12, to: 16 }, { t: "Noche", from: 17, to: 21 }];

  function slotPicker(input, get, set) {
    var wrap = el("div", "slot");
    input.classList.add("slot-input", "num");
    input.autocomplete = "off";
    input.setAttribute("aria-haspopup", "listbox");
    input.placeholder = "9:00 AM";
    var pop = el("div", "slot-pop");
    pop.hidden = true;
    SLOT_COLS.forEach(function (c) {
      var col = el("div", "slot-col");
      col.appendChild(el("span", "slot-head", c.t));
      for (var h = c.from; h <= c.to; h++) {
        [0, 30].forEach(function (m) {
          var v = U.pad2(h) + ":" + U.pad2(m);
          var b = el("button", null, U.timeLabel(v).replace(/ (AM|PM)$/, ""));
          b.type = "button"; b.dataset.slot = v; b.title = U.timeLabel(v); b.tabIndex = -1;
          col.appendChild(b);
        });
      }
      pop.appendChild(col);
    });
    wrap.appendChild(input);
    wrap.appendChild(pop);

    function show() {
      each(pop.querySelectorAll("[data-slot]"), function (b) { b.classList.toggle("on", b.dataset.slot === U.floorSlot(get())); });
      pop.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    function hide() { pop.hidden = true; input.setAttribute("aria-expanded", "false"); }
    function commit(v) { if (v) { set(v); } input.value = U.timeLabel(get()); input.closest(".fld, .mini").classList.remove("bad"); }
    function typed() {
      if (!U.collapse(input.value)) { input.value = U.timeLabel(get()); return; }
      var v = U.parseClock(input.value);
      if (v) { commit(v); } else { input.closest(".fld, .mini").classList.add("bad"); }
    }
    function step(n) {
      var t = U.floorSlot(get()) || "09:00", mins = +t.slice(0, 2) * 60 + +t.slice(3) + n;
      mins = Math.max(0, Math.min(1410, mins));
      commit(U.pad2(Math.floor(mins / 60)) + ":" + U.pad2(mins % 60));
      show();
    }

    input.addEventListener("focus", function () { input.select(); show(); });
    input.addEventListener("click", show);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") { e.preventDefault(); step(30); }
      else if (e.key === "ArrowDown") { e.preventDefault(); step(-30); }
      else if (e.key === "Enter") { e.preventDefault(); typed(); hide(); }
      else if (e.key === "Escape") { input.value = U.timeLabel(get()); hide(); }
      else if (e.key === "Tab") { hide(); }
    });
    input.addEventListener("blur", function () { typed(); setTimeout(function () { if (document.activeElement !== input) { hide(); } }, 150); });
    /* mousedown en vez de click: así el campo no pierde el foco antes de tiempo */
    pop.addEventListener("mousedown", function (e) {
      var b = e.target.closest("[data-slot]");
      e.preventDefault();
      if (!b) { return; }
      commit(b.dataset.slot);
      hide();
    });
    document.addEventListener("mousedown", function (e) { if (!wrap.contains(e.target)) { hide(); } });
    input.value = U.timeLabel(get());
    return wrap;
  }

  /* ------------------------------------------------------------ listas
     Hogar, documentos que pide el Mercado y planes cotizados. Se vuelven a
     dibujar solo cuando cambia su estructura (agregar, quitar, abrir), para
     no perder el foco mientras se escribe. */

  function listItem(cls, i) { var d = el("div", cls); d.dataset.i = i; return d; }
  function itemInput(list, i, prop, value, opts) {
    opts = opts || {};
    var c = el(opts.area ? "textarea" : "input");
    if (!opts.area) { c.type = "text"; }
    c.value = value == null ? "" : value;
    c.dataset.list = list; c.dataset.i = i; c.dataset.prop = prop;
    if (opts.ph) { c.placeholder = opts.ph; }
    if (opts.cls) { c.className = opts.cls; }
    if (opts.listId) { c.setAttribute("list", opts.listId); }
    if (opts.mode) { c.inputMode = opts.mode; }
    if (opts.aria) { c.setAttribute("aria-label", opts.aria); }
    return c;
  }
  function itemSelect(list, i, prop, value, options, aria) {
    var c = el("select");
    fillSelect(c, options);
    c.value = value || "";
    c.dataset.list = list; c.dataset.i = i; c.dataset.prop = prop;
    if (aria) { c.setAttribute("aria-label", aria); }
    return c;
  }
  function labeled(text, control, cls) {
    var l = el("label", "mini" + (cls ? " " + cls : ""));
    l.appendChild(el("span", null, text));
    l.appendChild(control);
    return l;
  }
  function actBtn(act, i, text, cls, aria) {
    var b = el("button", cls || "icon-btn tiny", text);
    b.type = "button"; b.dataset.act = act; if (i != null) { b.dataset.i = i; }
    if (aria) { b.setAttribute("aria-label", aria); }
    return b;
  }

  function personLabel(p) {
    return p.titular ? (U.collapse((S.f.nombres || "") + " " + (S.f.apellidos || "")).toUpperCase() || "Sin nombre: escríbelo arriba") : (U.collapse(p.nombre).toUpperCase() || "Persona nueva");
  }

  function renderPersonas() {
    var box = $("list_personas");
    if (!box) { return; }
    box.textContent = "";
    var cancel = isOC("cancelada"), supp = S.line === "supp";
    var listEl = el("div", "people");
    S.f.personas.forEach(function (p, i) {
      var row = listItem("person" + (p.open ? " open" : "") + (toReview(p) ? " is-auto" : ""), i);
      var head = el("div", "person-head");
      var t = actBtn("toggle", i, "", "person-toggle");
      t.setAttribute("aria-expanded", p.open ? "true" : "false");
      t.appendChild(el("span", "chev"));
      var nm = el("span", "person-name", personLabel(p)); nm.dataset.nameFor = i;
      t.appendChild(nm);
      var rel = p.titular ? "Titular" : p.parentesco;
      if (rel) { t.appendChild(el("span", "person-rel", rel)); }
      head.appendChild(t);
      var tg = el("div", "person-tags");
      if (!cancel && !supp) {
        var tx = actBtn("taxes", i, "Taxes", "tog" + (p.taxes ? " on" : ""));
        tx.setAttribute("aria-pressed", p.taxes ? "true" : "false"); tx.title = "Está en la declaración de impuestos";
        tg.appendChild(tx);
      }
      var cv = actBtn("cobertura", i, cancel ? "Se cancela" : "Cobertura", "tog" + (p.cobertura ? " on" : ""));
      cv.setAttribute("aria-pressed", p.cobertura ? "true" : "false");
      cv.title = cancel ? "Está en la póliza que se cancela" : (supp ? "Tiene cobertura" : "Pide cobertura");
      tg.appendChild(cv);
      if (!cancel && !supp) { var inc = el("span", "person-inc num", U.parseMoney(p.ingreso) ? U.parseMoney(p.ingreso).replace(/\.00$/, "") : ""); inc.dataset.incFor = i; tg.appendChild(inc); }
      head.appendChild(tg);
      head.appendChild(p.titular ? el("span", "person-gap") : actBtn("remove-person", i, "✕", "icon-btn tiny", "Quitar a " + personLabel(p)));
      row.appendChild(head);

      if (p.open) {
        var body = el("div", "person-body");
        if (p.titular) {
          body.appendChild(el("p", "hint person-note", "El nombre del titular se escribe arriba, como aparece en Zoho."));
        } else {
          body.appendChild(labeled("Nombre completo", itemInput("personas", i, "nombre", p.nombre, { cls: "upper", ph: "Nombre y apellido" }), "grow"));
        }
        if (supp) {
          body.appendChild(labeled("DOB", itemInput("personas", i, "dob", p.dob, { cls: "num", ph: "MM/DD/AAAA" }), "w-date"));
          row.appendChild(body);
          listEl.appendChild(row);
          return;
        }
        body.appendChild(labeled("Parentesco", itemSelect("personas", i, "parentesco", p.parentesco,
          [{ v: "", l: "—" }].concat(C.PARENTESCOS.map(function (r) { return { v: r, l: r }; })))));
        if (!cancel) {
          body.appendChild(labeled("Estatus en EE. UU.", itemSelect("personas", i, "estatus", p.estatus,
            [{ v: "", l: "—" }].concat(C.ESTATUS))));
          if (p.estatus === "otro") {
            body.appendChild(labeled("¿Cuál?", itemInput("personas", i, "estatusOtro", p.estatusOtro, { ph: "TPS, asilo…" })));
          }
          body.appendChild(labeled("DOB", itemInput("personas", i, "dob", p.dob, { cls: "num", ph: "MM/DD/AAAA" }), "w-date"));
          body.appendChild(labeled("Ingreso anual", itemInput("personas", i, "ingreso", p.ingreso, { cls: "num", ph: "$0", mode: "decimal" })));
          var checks = el("div", "person-checks");
          [["taxes", "En los taxes"], ["cobertura", "Pide cobertura"]].forEach(function (c) {
            var l = el("label", "check");
            var x = el("input"); x.type = "checkbox"; x.checked = !!p[c[0]];
            x.dataset.list = "personas"; x.dataset.i = i; x.dataset.prop = c[0];
            l.appendChild(x); l.appendChild(el("span", null, c[1]));
            checks.appendChild(l);
          });
          body.appendChild(checks);
        }
        row.appendChild(body);
      }
      listEl.appendChild(row);
    });
    box.appendChild(listEl);
    var foot = el("div", "list-foot");
    foot.appendChild(actBtn("add-person", null, "+ Agregar persona", "btn small"));
    var sum = el("span", "list-sum"); sum.id = "peopleSum";
    foot.appendChild(sum);
    box.appendChild(foot);
    if (supp) {
      box.appendChild(el("p", "hint people-hint", "La nota nombra a quienes tienen cobertura, por su nombre de pila."));
    } else if (!cancel) {
      box.appendChild(el("p", "hint people-hint",
        "Sale en la nota como «Cambios» lo que quede distinto de los documentos, y la dirección, teléfono, email, estatus y DOB que llenes."));
    }
    updatePeopleSummary();
  }

  function updatePeopleSummary() {
    var sum = $("peopleSum");
    if (!sum) { return; }
    var ps = N.personas(data());
    var firsts = function (list) { return list.map(function (p) { return p.first; }).join(", "); };
    var tax = ps.filter(function (p) { return p.taxes; }), cov = ps.filter(function (p) { return p.cobertura; });
    var inc = tax.reduce(function (s, p) { return s + (p.ingreso || 0); }, 0);
    sum.textContent = isOC("cancelada")
      ? "Se cancelan " + cov.length + (cov.length ? " (" + firsts(cov) + ")" : "")
      : S.line === "supp" ? "Cobertura " + cov.length + (cov.length ? " (" + firsts(cov) + ")" : "")
      : "Taxes " + tax.length + (tax.length ? " (" + firsts(tax) + ")" : "") + " · Cobertura " + cov.length +
        (cov.length ? " (" + firsts(cov) + ")" : "") + (inc ? " · Ingreso " + U.parseMoney(inc).replace(/\.00$/, "") : "");
    each(document.querySelectorAll("[data-name-for]"), function (n) {
      var p = S.f.personas[+n.dataset.nameFor];
      if (!p) { return; }
      n.textContent = personLabel(p);
      n.classList.toggle("empty", p.titular ? !U.collapse(S.f.nombres + S.f.apellidos) : !U.collapse(p.nombre));
    });
  }

  function catOptions() {
    return [{ v: "", l: "Elige qué pide" }].concat(C.MKPL_DOCS.map(function (c) { return { v: c.v, l: c.label }; }));
  }
  function personOptions() {
    return [{ v: "", l: "—" }].concat(S.f.personas.filter(function (p) { return p.titular ? U.collapse(S.f.nombres + S.f.apellidos) : U.collapse(p.nombre); })
      .map(function (p) { var n = personLabel(p); return { v: n, l: U.titleCase(n) }; }));
  }

  function renderDocs() {
    var box = $("list_docs");
    if (!box) { return; }
    box.textContent = "";
    if (!S.f.docs.length) {
      box.appendChild(el("p", "list-empty", S.f.net.eligibility ? "El Mercado no pide documentos. Si pide alguno, agrégalo aquí." : "Si el Mercado pide documentos, agrégalos aquí con su fecha tope."));
    }
    S.f.docs.forEach(function (x, i) {
      var cat = N.docsOf({ docs: [x] })[0] ? C.MKPL_DOCS.filter(function (c) { return c.v === x.cat; })[0] : null;
      var item = listItem("doc-item" + (x.enviado ? " sent" : "") + (x.auto ? " is-auto" : ""), i);
      var row = el("div", "doc-row");
      row.appendChild(labeled("Qué pide", itemSelect("docs", i, "cat", x.cat, catOptions()), "grow"));
      /* la persona que trajo un documento (Docs Submitted) aunque no esté en el hogar */
      var people = personOptions();
      if (U.collapse(x.persona) && !people.some(function (o) { return o.v === x.persona; })) { people.push({ v: x.persona, l: U.titleCase(x.persona) }); }
      row.appendChild(labeled("Persona", itemSelect("docs", i, "persona", x.persona, people)));
      row.appendChild(labeled("Fecha tope", itemInput("docs", i, "fecha", x.fecha, { cls: "num", ph: "MM/DD/AAAA" }), "w-date"));
      row.appendChild(actBtn("remove-doc", i, "✕", "icon-btn tiny", "Quitar este documento"));
      item.appendChild(row);
      var row2 = el("div", "doc-row2");
      var l = el("label", "check doc-sent");
      var c = el("input"); c.type = "checkbox"; c.checked = !!x.enviado;
      c.dataset.list = "docs"; c.dataset.i = i; c.dataset.prop = "enviado";
      l.appendChild(c); l.appendChild(el("span", null, "Enviado"));
      row2.appendChild(l);
      if (x.enviado) {
        var opts = [{ v: "", l: cat ? "¿Qué documento se envió?" : "Elige primero qué pide" }];
        if (cat) { cat.docs.forEach(function (d) { opts.push({ v: d, l: d }); }); }
        row2.appendChild(itemSelect("docs", i, "doc", x.doc, opts, "Documento enviado"));
      }
      item.appendChild(row2);
      box.appendChild(item);
    });
    var foot = el("div", "list-foot");
    foot.appendChild(actBtn("add-doc", null, "+ Agregar documento pedido", "btn small"));
    box.appendChild(foot);
  }

  function renderPlanes() {
    var box = $("list_planes");
    if (!box) { return; }
    if (!S.f.planes.length) { S.f.planes.push({ compania: "", plan: "", prima: "", sel: false }); }
    box.textContent = "";
    var dlId = "dl_planCarriers";
    var dl = el("datalist"); dl.id = dlId;
    /* se sugieren las compañías oficiales; otra se puede escribir */
    N.carrierOptions("oc").forEach(function (c) { var o = el("option"); o.value = c.v; dl.appendChild(o); });
    box.appendChild(dl);
    S.f.planes.forEach(function (p, i) {
      var item = listItem("plan-item" + (p.sel ? " sel" : "") + (p.auto ? " is-auto" : ""), i);
      item.appendChild(labeled("Compañía", itemInput("planes", i, "compania", p.compania, { cls: "upper", listId: dlId })));
      item.appendChild(labeled("Nombre del plan", itemInput("planes", i, "plan", p.plan), "grow"));
      item.appendChild(labeled("Prima mensual", itemInput("planes", i, "prima", p.prima, { cls: "num", ph: "$0.00", mode: "decimal" }), "w-money"));
      var sel = actBtn("select-plan", i, p.sel ? "✓ Seleccionado" : "Seleccionar", "btn small sel-btn" + (p.sel ? " on" : ""));
      sel.setAttribute("aria-pressed", p.sel ? "true" : "false");
      item.appendChild(sel);
      item.appendChild(S.f.planes.length > 1 ? actBtn("remove-plan", i, "✕", "icon-btn tiny", "Quitar este plan") : el("span", "person-gap"));
      box.appendChild(item);
    });
    var foot = el("div", "list-foot");
    foot.appendChild(actBtn("add-plan", null, "+ Agregar plan", "btn small"));
    box.appendChild(foot);
  }

  function renderLists() { renderPersonas(); renderDocs(); renderPlanes(); }

  /* Datos que casi nunca vienen en un documento y que importan mucho: van en
     rojo hasta que el agente elige una opción (aunque sea la que ya estaba)
     o confirma la sección. */
  var MUST_CHOOSE = ["canal", "codigoTipo", "periodo", "periodoMC"];
  function mustChoose(F) {
    var k = key(F);
    return MUST_CHOOSE.indexOf(k) >= 0 && !S.chosen[k] && S.auto[k] !== true;
  }

  /* Una persona del hogar que llenó un documento queda en dorado hasta que se
     confirma (ok); si otro documento le trae un dato nuevo, vuelve a dorado. */
  function toReview(x) {
    return !!x && !x.ok && (!!x.auto || Object.keys(x.filled || {}).length > 0);
  }

  /* Confirma que lo leído de los documentos está bien, sin cambiarlo: en una
     sección (group) o en todo el formulario. */
  function confirmReviewed(group) {
    FIELDS.forEach(function (F) {
      if (group && F.g !== group) { return; }
      if (S.auto[key(F)] === true) { delete S.auto[key(F)]; }
      if (MUST_CHOOSE.indexOf(key(F)) >= 0 && fieldVisible(F)) { S.chosen[key(F)] = true; }
      if (Array.isArray(S.f[F.k])) {
        S.f[F.k].forEach(function (x) { if (x && typeof x === "object") { delete x.auto; if (F.k === "personas") { x.ok = true; } } });
      }
    });
    renderLists();
    refresh();
  }

  /* Cambio en un campo de una lista. */
  function listInput(t, committed) {
    var list = S.f[t.dataset.list], item = list && list[+t.dataset.i], prop = t.dataset.prop;
    if (!item) { return; }
    var v = t.type === "checkbox" ? t.checked : t.value;
    if (committed && prop === "ingreso") { v = U.parseMoney(v) || ""; t.value = v; }
    if (committed && prop === "prima") { v = U.parseMoney(v) || ""; t.value = v; }
    if (committed && (prop === "fecha" || prop === "dob")) {
      var dd = prop === "dob" ? U.parseBirth(v) : U.parseDate(v);
      t.closest(".mini").classList.toggle("bad", !!U.collapse(v) && !dd);
      if (dd || !U.collapse(v)) { v = dd; t.value = dd; }
    }
    if (committed && (prop === "nombre" || prop === "compania")) { v = U.collapse(v).toUpperCase(); t.value = v; }
    /* la fila de Docs Submitted sigue al documento aunque cambien su persona o su tipo */
    var keyBefore = t.dataset.list === "docs" ? N.docKey(item) : "";
    item[prop] = v;
    delete item.auto;
    /* elegir a una persona en un documento dice si es del titular */
    if (t.dataset.list === "docs" && prop === "persona") { item.titular = v === personLabel(S.f.personas[0]); }
    if (keyBefore) { N.moveDocKey(S.f, S.files, keyBefore, N.docKey(item)); }
    S.dirty = true;
    if (t.dataset.list === "personas") {
      if (prop === "taxes" || prop === "cobertura" || prop === "estatus") { renderPersonas(); }
      else if (prop === "ingreso") { var inc = document.querySelector('[data-inc-for="' + t.dataset.i + '"]'); if (inc) { inc.textContent = (U.parseMoney(v) || "").replace(/\.00$/, ""); } }
      if (committed && prop === "nombre") { renderDocs(); }
    }
    if (t.dataset.list === "docs" && (prop === "cat" || prop === "enviado")) { renderDocs(); }
    if (t.dataset.list === "planes" && item.sel) { copySelectedPlan(); }
    refresh();
  }

  /* El plan elegido pasa a la sección Plan, por si luego se envía la app. */
  function copySelectedPlan() {
    var p = S.f.planes.filter(function (x) { return x.sel; })[0];
    if (!p) { return; }
    S.f.compania = p.compania; S.f.plan = p.plan; S.f.prima = p.prima;
    syncCarrierChoice();
  }

  /* La opción del selector de compañía sale del nombre cuando este no lo
     escribió el agente: al leer un documento, al elegir un plan cotizado o
     al cambiar de línea. Lo leído queda en dorado en el selector o, con
     «Otra», en el campo del nombre. */
  function syncCarrierChoice() {
    var c = N.carrierChoice(S.line, S.f.compania);
    S.f.companiaSel = c.sel; S.f.bcbsEstado = c.state;
    if (S.auto.compania === true && c.sel && c.sel !== N.CARRIER_OTHER) { S.auto.companiaSel = true; }
    else { delete S.auto.companiaSel; }
  }

  /* El agente elige una compañía o escribe el estado de BCBS of. «Otra»
     empieza vacía, salvo que el nombre ya fuera de una compañía fuera de la lista. */
  function chooseCarrier() {
    var sel = S.f.companiaSel;
    if (sel === N.CARRIER_OTHER) {
      if (N.carrierChoice(S.line, S.f.compania).sel !== N.CARRIER_OTHER) { S.f.compania = ""; }
    } else {
      S.f.compania = N.carrierFromChoice(S.line, sel, S.f.bcbsEstado);
    }
    touched("compania");
    syncInputsLight();
  }

  function listAction(b) {
    var i = b.dataset.i != null ? +b.dataset.i : -1, act = b.dataset.act;
    var ps = S.f.personas;
    switch (act) {
      case "toggle": ps[i].open = !ps[i].open; renderPersonas(); return;
      case "taxes": case "cobertura": ps[i][act] = !ps[i][act]; delete ps[i].auto; renderPersonas(); break;
      case "remove-person":
        /* quitar a alguien que trajo un documento es un cambio */
        if (ps[i].orig && ps[i].orig.nombre) { S.f.quitados.push(ps[i].orig.nombre); }
        ps.splice(i, 1); renderPersonas(); renderDocs(); break;
      case "add-person":
        ps.forEach(function (p) { p.open = false; });
        ps.push({ nombre: "", parentesco: "", taxes: true, cobertura: true, ingreso: "", open: true });
        renderPersonas();
        var inp = document.querySelector('#list_personas [data-i="' + (ps.length - 1) + '"] input[data-prop="nombre"]');
        if (inp) { inp.focus(); }
        break;
      case "add-doc":
        S.f.docs.push({ cat: "", persona: U.collapse(S.f.nombres + S.f.apellidos) ? personLabel(ps[0]) : "", fecha: "", enviado: false, doc: "" });
        renderDocs();
        var sel = document.querySelector('#list_docs [data-i="' + (S.f.docs.length - 1) + '"] select[data-prop="cat"]');
        if (sel) { sel.focus(); }
        break;
      case "remove-doc": N.discardRow(S.f, S.f.docs[i]); S.f.docs.splice(i, 1); renderDocs(); break;
      case "add-plan": S.f.planes.push({ compania: "", plan: "", prima: "", sel: false }); renderPlanes(); break;
      case "remove-plan": N.discardRow(S.f, S.f.planes[i]); S.f.planes.splice(i, 1); renderPlanes(); break;
      case "select-plan":
        var on = !S.f.planes[i].sel;
        S.f.planes.forEach(function (p, j) { p.sel = on && j === i; });
        if (on) { copySelectedPlan(); }
        renderPlanes();
        break;
      default: return;
    }
    S.dirty = true;
    refresh();
  }

  function renderForm() {
    var form = $("form");
    form.textContent = "";
    GROUPS.forEach(function (G) {
      var sec = el("section", "card group");
      sec.id = "sec-" + G.id;
      sec.dataset.group = G.id;
      var head = el("div", "group-head");
      var h3 = el("h3"); h3.dataset.title = G.id;
      head.appendChild(h3);
      var badge = el("span", "review"); badge.hidden = true;
      head.appendChild(badge);
      /* confirma lo dorado de esta sección aunque no haya que cambiar nada */
      var ok = el("button", "link-btn review-ok", "Están bien");
      ok.type = "button"; ok.hidden = true;
      ok.title = "Quita el dorado de esta sección: los datos leídos están bien";
      ok.addEventListener("click", function () { confirmReviewed(G.id); });
      head.appendChild(ok);
      sec.appendChild(head);
      var grid = el("div", "grid");
      FIELDS.filter(function (F) { return F.g === G.id; }).forEach(function (F) { grid.appendChild(buildField(F)); });
      if (G.id === "network") {
        grid.id = "netGrid"; grid.className = "net";
        sec.appendChild(el("p", "hint net-hint", "Marca lo que guardaste: sale en la nota. El nombre ya viene en el formato de NOMBRE DE ARCHIVOS."));
      }
      sec.appendChild(grid);
      if (G.id === "network") {
        var foot = el("div", "net-foot"); foot.id = "netFoot"; foot.hidden = true;
        var all = el("button", "btn small", "Guardar todo en el Network"); all.type = "button"; all.id = "netSaveAll";
        foot.appendChild(all);
        var where = el("span", "muted"); where.id = "netWhere";
        foot.appendChild(where);
        sec.appendChild(foot);
      }
      form.appendChild(sec);
    });
    updateGroupTitles();
  }

  function updateGroupTitles() {
    GROUPS.forEach(function (G) {
      var sec = $("sec-" + G.id), t = resolve(G.title);
      sec.querySelector("[data-title]").textContent = t;
      sec.dataset.rail = G.short || t;
    });
  }

  /* Cada documento: casilla para la nota, su nombre de archivo y un botón
     para copiarlo. Copiar el nombre marca la casilla. */
  function renderNetwork() {
    var grid = $("netGrid");
    grid.textContent = "";
    N.networkOf(data()).forEach(function (n) {
      var row = el("div", "net-row");
      var lab = el("label", "check");
      var c = el("input"); c.type = "checkbox"; c.dataset.net = n.k; c.checked = !!S.f.net[n.k];
      lab.appendChild(c); lab.appendChild(el("span", null, n.label));
      row.appendChild(lab);
      var code = el("code", "net-file"); code.dataset.fileFor = n.k;
      row.appendChild(code);
      var acts = el("span", "net-acts");
      var b = el("button", "btn small", "Copiar");
      b.type = "button"; b.dataset.copyFile = n.k; b.dataset.label = "Copiar";
      b.setAttribute("aria-label", "Copiar el nombre de archivo de " + n.label);
      acts.appendChild(b);
      /* el documento que se soltó se guarda en la carpeta del Network con este nombre */
      if (canSave && savableFiles(n.k).length) {
        var sv = el("button", "btn small", "Guardar");
        sv.type = "button"; sv.dataset.saveFile = n.k; sv.dataset.label = "Guardar";
        var to = N.netDirFor(netDirs, S.line, n.k);
        sv.title = to.dir ? "Se guarda en: " + (to.dir.name || "la carpeta elegida") : "Elige la carpeta en Ajustes o al guardar";
        sv.setAttribute("aria-label", "Guardar " + n.label + (to.dir ? " en " + (to.dir.name || "la carpeta elegida") : " en la carpeta del Network"));
        acts.appendChild(sv);
      }
      row.appendChild(acts);
      grid.appendChild(row);
    });
    var keys = savableKeys();
    $("netFoot").hidden = !keys.length;
    var dir = N.netDirFor(netDirs, S.line);
    var own = keys.filter(function (k) { return N.netDirFor(netDirs, S.line, k).key !== dir.key; }).length;
    $("netWhere").textContent = (!dir.dir ? "Elige la carpeta en Ajustes o al guardar."
      : (dir.key === "general" ? "Carpeta: " : "Carpeta de " + netDirLabel(dir.key) + ": ") + (dir.dir.name || "elegida")) +
      (own ? " Algunos documentos van a su propia carpeta (pasa el ratón sobre Guardar)." : "");
    updateFileNames();
  }

  /* -------------------------------------------- carpetas del Network --
     Una general, una propia por línea si hace falta y, dentro de cada línea,
     una por clase de archivo (N.docKinds, N.netDirFor): por ejemplo OC/ para
     los documentos y "OC/OEP - Hoja de Cambios" para la hoja. Se eligen en
     Ajustes y el navegador las recuerda (IndexedDB guarda el permiso, no una
     ruta; la general sigue en la clave "network" de siempre). Solo Chrome y
     Edge pueden escribir en una carpeta. Un archivo con el mismo nombre se
     reemplaza solo si se confirma. */
  var canSave = typeof window.showDirectoryPicker === "function" && !!window.indexedDB;
  var netDirs = {};

  function lineKeys() { return Object.keys(C.LINES); }
  function allDirKeys() {
    return N.NET_DIRS.concat(lineKeys().reduce(function (all, l) {
      return all.concat(N.docKinds(l).map(function (k) { return l + ":" + k.k; }));
    }, []));
  }
  function netDirKey(k) { return k === "general" ? "network" : "network-" + k; }
  function kindLabel(line, kind) {
    var k = N.docKinds(line).filter(function (x) { return x.k === kind; })[0];
    return k ? k.label : kind;
  }
  function netDirLabel(k) {
    if (k === "general") { return "General"; }
    var parts = k.split(":");
    return parts[1] ? C.LINES[parts[0]].label + " · " + kindLabel(parts[0], parts[1]) : C.LINES[k].label;
  }
  function handleStore(mode, fn) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("qa-toolbox", 1);
      req.onupgradeneeded = function () { req.result.createObjectStore("handles"); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var db = req.result, tx = db.transaction("handles", mode), r = fn(tx.objectStore("handles"));
        tx.oncomplete = function () { db.close(); resolve(r); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      };
    });
  }
  function loadNetDirs() {
    renderNetDirs();
    if (!canSave) { return; }
    var errs = {};
    handleStore("readonly", function (st) {
      var reqs = {};
      allDirKeys().forEach(function (k) {
        var r = st.get(netDirKey(k));
        /* una carpeta que no se puede leer no se lleva a las demás */
        r.onerror = function (e) { errs[k] = (r.error && r.error.name) || "Error"; e.preventDefault(); e.stopPropagation(); };
        reqs[k] = r;
      });
      return reqs;
    }).then(function (reqs) {
      var names = settings.netDirNames, named = false;
      allDirKeys().forEach(function (k) {
        var h = !errs[k] && reqs[k].result;
        if (!h) { return; }
        netDirs[k] = h;
        /* las carpetas elegidas antes de guardar su nombre */
        if (h.name && names[k] !== h.name) { names[k] = h.name; named = true; }
      });
      if (named) { saveSettings(); }
    }).catch(function (e) { netDirs = {}; errs.all = (e && e.name) || "Error"; }).then(function () {
      renderNetDirs(); renderNetwork(); renderSheetWhere(); renderLostDirs(errs);
    });
  }
  /* Carpetas que se eligieron y el navegador ya no tiene: se dice cuáles
     eran y, si lo hubo, el error al leerlas, para elegirlas otra vez */
  function renderLostDirs(errs) {
    var names = settings.netDirNames, box = $("netDirLost");
    var lost = allDirKeys().filter(function (k) { return names[k] && !netDirs[k]; });
    box.hidden = !lost.length;
    if (!lost.length) { return; }
    var why = [];
    Object.keys(errs || {}).forEach(function (k) { if (why.indexOf(errs[k]) < 0) { why.push(errs[k]); } });
    box.textContent = "El navegador ya no tiene estas carpetas que habías elegido: " +
      lost.map(function (k) { return netDirLabel(k) + " («" + names[k] + "»)"; }).join(", ") +
      ". Elígelas otra vez." + (why.length ? " Detalle: " + why.join(", ") + "." : "");
  }
  function pickNetDir(k) {
    return window.showDirectoryPicker({ id: "qa-network", mode: "readwrite" }).then(function (h) {
      netDirs[k] = h;
      settings.netDirNames[k] = h.name; saveSettings();
      renderNetDirs(); renderNetwork(); renderSheetWhere(); renderLostDirs();
      return handleStore("readwrite", function (st) { return st.put(h, netDirKey(k)); }).then(function () { return h; }, function (e) {
        toast("La carpeta «" + h.name + "» se usará ahora, pero el navegador no la pudo recordar (" + ((e && e.name) || "error") + ").");
        return h;
      });
    });
  }
  function clearNetDir(k) {
    delete netDirs[k];
    delete settings.netDirNames[k]; saveSettings();
    renderNetDirs(); renderNetwork(); renderSheetWhere(); renderLostDirs();
    handleStore("readwrite", function (st) { return st.delete(netDirKey(k)); }).catch(function () {});
  }
  function netDirRow(k, label, cls) {
    var row = el("div", "netdir-row" + (cls ? " " + cls : ""));
    row.appendChild(el("span", "netdir-line", label));
    var name = el("strong"); name.dataset.netDirName = k;
    row.appendChild(name);
    var pick = el("button", "btn small", "Elegir carpeta"); pick.type = "button"; pick.dataset.netDirPick = k;
    pick.setAttribute("aria-label", "Elegir la carpeta de " + netDirLabel(k));
    row.appendChild(pick);
    var clear = el("button", "link-btn", "Quitar"); clear.type = "button"; clear.dataset.netDirClear = k;
    clear.setAttribute("aria-label", "Quitar la carpeta de " + netDirLabel(k));
    row.appendChild(clear);
    return row;
  }
  function renderNetDirs() {
    var box = $("netDirBox");
    box.hidden = !canSave; $("netDirHelp").hidden = !canSave; $("netDirNA").hidden = canSave;
    if (!box.children.length) {
      N.NET_DIRS.forEach(function (k) {
        box.appendChild(netDirRow(k, netDirLabel(k)));
        if (k === "general") { return; }
        /* cada clase de archivo de la línea puede ir a otra carpeta */
        var more = el("details", "netdir-kinds");
        more.dataset.netDirLine = k;
        more.appendChild(el("summary", null, "Carpeta por documento de " + C.LINES[k].label));
        N.docKinds(k).forEach(function (x) { more.appendChild(netDirRow(k + ":" + x.k, x.label, "netdir-kind")); });
        box.appendChild(more);
      });
    }
    allDirKeys().forEach(function (k) {
      var h = netDirs[k], line = k.split(":")[0];
      box.querySelector('[data-net-dir-name="' + k + '"]').textContent = h ? (h.name || "Elegida")
        : k === "general" ? "Sin elegir" : k.indexOf(":") < 0 ? "Usa la general" : "Usa la de " + C.LINES[line].label;
      box.querySelector('[data-net-dir-clear="' + k + '"]').hidden = !h;
    });
    /* una línea con carpetas por documento se muestra abierta */
    each(box.querySelectorAll("[data-net-dir-line]"), function (d) {
      if (N.docKinds(d.dataset.netDirLine).some(function (x) { return netDirs[d.dataset.netDirLine + ":" + x.k]; })) { d.open = true; }
    });
  }
  /* la carpeta de un archivo de la línea de ahora (su clase, la línea o la
     general); si no hay ninguna, se pide la general */
  function ensureNetDir(kind) {
    var t = N.netDirFor(netDirs, S.line, kind), dir = t.dir;
    if (!dir) { return pickNetDir("general"); }
    return dir.queryPermission({ mode: "readwrite" }).then(function (p) {
      if (p === "granted") { return dir; }
      return dir.requestPermission({ mode: "readwrite" }).then(function (q) {
        if (q !== "granted") { throw new Error("permiso"); }
        return dir;
      });
    });
  }
  function savableFiles(k) { return S.files.filter(function (f) { return f.file && f.res && f.res.net === k; }); }
  function savableKeys() {
    if (!canSave) { return []; }
    return N.networkOf(data()).map(function (n) { return n.k; }).filter(function (k) { return savableFiles(k).length; });
  }
  function fileExt(name) { var m = /\.[A-Za-z0-9]{1,5}$/.exec(name || ""); return m ? m[0].toLowerCase() : ""; }

  function writeOne(dir, job) {
    return dir.getFileHandle(job.name)
      .then(function () { return window.confirm("Ya existe «" + job.name + "» en la carpeta. ¿Reemplazarlo?"); }, function () { return true; })
      .then(function (go) {
        if (!go) { return false; }
        return dir.getFileHandle(job.name, { create: true })
          .then(function (h) { return h.createWritable(); })
          .then(function (w) { return w.write(job.file).then(function () { return w.close(); }); })
          .then(function () { return true; });
      });
  }
  function saveToNetwork(keys, btn) {
    var names = {};
    N.buildFileNames(data()).forEach(function (f) { names[f.k] = f.name; });
    var jobs = [];
    keys.forEach(function (k) {
      savableFiles(k).forEach(function (f, i) {
        jobs.push({ k: k, file: f.file, name: N.safeFileName(names[k] + (i ? " (" + (i + 1) + ")" : "")) + fileExt(f.name) });
      });
    });
    if (!jobs.length) { return; }
    /* cada archivo va a la carpeta de su clase (o de la línea, o la general) */
    jobs.reduce(function (p, job) {
      return p.then(function (saved) {
        return ensureNetDir(job.k).then(function (dir) { return writeOne(dir, job); })
          .then(function (ok) { if (ok) { S.f.net[job.k] = true; saved.push(job.name); } return saved; });
      });
    }, Promise.resolve([])).then(function (saved) {
      if (!saved || !saved.length) { return; }
      S.dirty = true;
      renderNetwork(); refresh();
      if (btn && btn.isConnected) { flashButton(btn); }
      toast(saved.length === 1 ? "Guardado en el Network: " + saved[0] : "Se guardaron " + saved.length + " archivos en el Network.");
    }).catch(function (e) {
      if (e && e.name === "AbortError") { return; }
      toast("No se pudo guardar en la carpeta del Network. Revisa el permiso o elige la carpeta otra vez en Ajustes.");
    });
  }

  function updateFileNames() {
    var list = N.buildFileNames(data());
    /* las filas de Docs Submitted cambian con los documentos enviados */
    var rows = Array.prototype.map.call($("netGrid").querySelectorAll(".net-row"), function (r) {
      return r.querySelector("[data-file-for]").dataset.fileFor + "|" + r.querySelector(".check span").textContent;
    }).join("\n");
    if (rows !== list.map(function (f) { return f.k + "|" + f.label; }).join("\n")) { renderNetwork(); return; }
    list.forEach(function (f) {
      var code = $("netGrid").querySelector('[data-file-for="' + f.k + '"]');
      if (code) { code.textContent = f.name; code.title = f.name; }
    });
  }

  function fieldVisible(F) {
    if (F.lines && F.lines.indexOf(S.line) < 0) { return false; }
    var secs = O().sections;
    if (F.sec && !(Array.isArray(F.sec) ? F.sec : [F.sec]).some(function (x) { return secs.indexOf(x) >= 0; })) { return false; }
    if (F.when && !F.when(S.f)) { return false; }
    return true;
  }

  /* Muestra solo lo que aplica a la línea y a la situación elegidas, y cuenta
     en cada sección los datos leídos de documentos que faltan por revisar. */
  function updateVisibility() {
    var form = $("form"), pending = {};
    FIELDS.forEach(function (F) {
      var wrap = form.querySelector('.fld[data-k="' + F.k + '"]');
      var visible = fieldVisible(F);
      wrap.hidden = !visible;
      var lab = wrap.querySelector("[data-label]");
      if (lab && typeof F.label === "function") { lab.textContent = F.label(); }
      var hint = wrap.querySelector("[data-hint]");
      if (hint && typeof F.hint === "function") { hint.textContent = F.hint(); hint.hidden = !hint.textContent; }
      var ctl = $("f_" + F.k);
      if (ctl && typeof F.ph === "function") { ctl.placeholder = F.ph(); }
      /* el dorado es solo para lo leído de un documento, no para lo calculado */
      var fromDoc = S.auto[key(F)] === true;
      wrap.classList.toggle("is-auto", fromDoc);
      var choose = mustChoose(F);
      wrap.classList.toggle("is-choose", choose);
      if ((fromDoc || choose) && visible) { pending[F.g] = (pending[F.g] || 0) + 1; }
      if (visible && Array.isArray(S.f[F.k])) {
        var n = S.f[F.k].filter(function (x) { return F.k === "personas" ? toReview(x) : x && x.auto; }).length;
        if (n) { pending[F.g] = (pending[F.g] || 0) + n; }
      }
    });
    var adic = $("f_adicionales");
    if (adic) { adic.placeholder = N.memberDelta(Object.assign({}, S.f, { line: S.line, adicionales: "" })) || "+0"; }
    updateGroupTitles();
    each(form.querySelectorAll(".group"), function (g) {
      var id = g.dataset.group;
      g.hidden = id === "network" ? (O().sections.indexOf("network") < 0 || !N.networkOf(data()).length) : !g.querySelector(".fld:not([hidden])");
      var badge = g.querySelector(".review"), n = pending[id] || 0;
      badge.hidden = !n;
      badge.textContent = n + " por revisar";
      g.querySelector(".review-ok").hidden = !n;
      g.dataset.pending = n;
    });
    var total = Object.keys(pending).reduce(function (s, k) { return s + pending[k]; }, 0);
    $("btnReviewed").hidden = !total;
  }

  function syncSeg(seg, value) {
    each(seg.querySelectorAll("button"), function (b) {
      var on = b.dataset.v === value;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  /* Controles que comparten un dato con otro (Compañía en Plan y en
     Cancelación, con su selector y el estado de BCBS) y nombres de personas,
     sin volver a dibujar las listas. */
  var CARRIER_KEYS = ["compania", "companiaSel", "bcbsEstado"];
  function syncInputsLight() {
    FIELDS.forEach(function (F) {
      if (!F.store && CARRIER_KEYS.indexOf(F.k) < 0) { return; }
      var ctl = $("f_" + F.k);
      if (ctl && document.activeElement !== ctl && F.type !== "seg") { ctl.value = S.f[key(F)] == null ? "" : S.f[key(F)]; }
    });
    updatePeopleSummary();
  }

  /* Vuelca el estado en los controles (tras leer un PDF, cambiar de línea…). */
  function syncInputs() {
    FIELDS.forEach(function (F) {
      if (F.type === "personas" || F.type === "docslist" || F.type === "planeslist") { return; }
      var v = S.f[key(F)];
      if (F.type === "seg") {
        var seg = $("form").querySelector('[data-seg="' + F.k + '"]');
        if (typeof F.options === "function") { fillSeg(seg, optList(F)); }
        syncSeg(seg, v || "");
        return;
      }
      var ctl = $("f_" + F.k);
      if (F.type === "check") { ctl.checked = !!v; return; }
      if (F.type === "slot") { if (document.activeElement !== ctl) { ctl.value = U.timeLabel(v); } return; }
      if (F.type === "select" && typeof F.options === "function") { fillSelect(ctl, optList(F)); }
      if (document.activeElement !== ctl) { ctl.value = v == null ? "" : v; }
      if (F.list) {
        var dl = $("dl_" + F.k);
        dl.textContent = "";
        resolve(F.list).forEach(function (x) { var o = el("option"); o.value = x; dl.appendChild(o); });
      }
    });
    renderLists();
    renderNetwork();
  }

  /* ------------------------------------------------- línea y situación */

  function renderPicker() {
    var seg = $("lineSeg");
    seg.textContent = "";
    Object.keys(C.LINES).forEach(function (k) {
      var b = el("button");
      b.type = "button"; b.dataset.line = k; b.setAttribute("role", "tab");
      b.appendChild(el("span", "tag", C.LINES[k].code));
      b.appendChild(document.createTextNode(C.LINES[k].label));
      b.classList.toggle("on", k === S.line);
      b.setAttribute("aria-selected", k === S.line ? "true" : "false");
      seg.appendChild(b);
    });

    var box = $("outcomes");
    box.textContent = "";
    L().outcomes.forEach(function (o) {
      var b = el("button", "chip", o.label);
      b.type = "button"; b.dataset.outcome = o.id; b.title = o.desc; b.setAttribute("role", "radio");
      b.classList.toggle("on", o.id === S.outcome);
      b.setAttribute("aria-checked", o.id === S.outcome ? "true" : "false");
      box.appendChild(b);
    });

    var hints = {
      oc: "App Summary, Eligibility Letter, My Plans & Programs o comprobante de pago. Los campos se llenan solos.",
      mc: "SOA y App Summary del portal de la compañía. Los campos se llenan solos.",
      supp: "Aplicación o comprobante de pago. Los campos se llenan solos."
    };
    $("dropHint").textContent = hints[S.line] + (ocrReady() ? " Los escaneos y las capturas (también pegadas con Ctrl + V) se leen con OCR." : "");
  }

  function setLine(line) {
    if (!C.LINES[line] || line === S.line) { return; }
    var keep = S.outcome;
    S.line = line;
    settings.line = line; saveSettings();
    var same = L().outcomes.filter(function (o) { return o.id === keep; })[0];
    S.outcome = same ? same.id : L().outcomes[0].id;
    S.f.gestion = "";
    S.f.taskId = "";
    /* cada línea tiene su lista oficial de compañías */
    syncCarrierChoice();
    afterOutcomeChange();
    renderPicker(); syncInputs(); refresh();
  }

  function setOutcome(id) {
    if (id === S.outcome) { return; }
    S.outcome = id;
    S.f.taskId = "";
    afterOutcomeChange();
    renderPicker(); syncInputs(); refresh();
  }

  function afterOutcomeChange() {
    var valid = L().gestiones.some(function (g) { return g.v === S.f.gestion; });
    if (!valid) { S.f.gestion = L().gestiones[0].v; }
  }

  /* ------------------------------------------------------------- carril */

  var railActive = "";

  function railTargets() {
    var out = [];
    each(document.querySelectorAll("#view-nota [data-rail]"), function (sec) {
      if (!sec.hidden) { out.push(sec); }
    });
    return out;
  }

  function renderRail() {
    var rail = $("rail");
    rail.textContent = "";
    railTargets().forEach(function (sec) {
      var b = el("button");
      b.type = "button"; b.dataset.target = sec.id;
      b.appendChild(el("span", "rail-label", sec.dataset.rail));
      var n = +sec.dataset.pending || 0;
      if (n) { var c = el("span", "rail-count", String(n)); c.title = n + " por revisar"; b.appendChild(c); }
      rail.appendChild(b);
    });
    markRail();
  }

  function markRail() {
    var targets = railTargets(), current = targets.length ? targets[0].id : "";
    targets.forEach(function (sec) { if (sec.getBoundingClientRect().top <= 150) { current = sec.id; } });
    /* al llegar al final, la última sección es la activa aunque no suba hasta arriba */
    if (targets.length && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = targets[targets.length - 1].id;
    }
    railActive = current;
    each($("rail").children, function (b) {
      var on = b.dataset.target === current;
      b.classList.toggle("on", on);
      if (on) { b.setAttribute("aria-current", "true"); } else { b.removeAttribute("aria-current"); }
    });
  }

  /* ------------------------------------------------------------ salidas */

  function hasClientData() {
    return ["nombres", "apellidos", "plan", "compania", "mbi", "appId", "notas", "pendiente", "codigoQ"]
      .some(function (k) { return U.collapse(S.f[k]); });
  }

  function isMoney(k) { return FIELD[k] && FIELD[k].type === "money"; }

  /* Valores que se deducen de otros. Nunca pisan lo que escribió el agente. */
  function derive() {
    var f = S.f;
    var pay = U.moneyNumber(f.prima);
    if (pay === 0 && !f.pagoEstado) { f.pagoEstado = "NO PREMIUM"; S.auto.pagoEstado = "calc"; }
    /* sin la prima en $0 (otra prima, o se borró o se quitó el documento que
       la trajo) el NO PREMIUM que se puso solo se quita */
    else if (pay !== 0 && f.pagoEstado === "NO PREMIUM" && S.auto.pagoEstado === "calc") { f.pagoEstado = ""; delete S.auto.pagoEstado; }
    var segPay = $("form").querySelector('[data-seg="pagoEstado"]');
    if (segPay) { syncSeg(segPay, f.pagoEstado || ""); }
    /* Medicare: el SOA es del día de la nota mientras nadie lo cambie */
    if (!U.collapse(f.soaFecha) || S.auto.soaFecha === "calc") {
      f.soaFecha = U.parseDate(f.fecha) || f.fecha; S.auto.soaFecha = "calc";
      var soa = $("f_soaFecha");
      if (soa && document.activeElement !== soa) { soa.value = f.soaFecha; }
    }
    /* Obamacare en OEP: Cobertura desde sale de la fecha de la nota (01/01
       o 02/01) mientras nadie la escriba ni la traiga un documento; sin OEP,
       la que se puso sola se quita */
    var oep = isOC() && !isOC("cancelada") && f.periodo === "OEP" ?N.oepStart(U.collapse(f.fecha) ? f.fecha : U.today()) : "";
    var ef = null;
    if (oep && (!U.collapse(f.efectiva) || S.auto.efectiva === "calc")) { f.efectiva = oep; S.auto.efectiva = "calc"; ef = oep; }
    else if (!oep && S.auto.efectiva === "calc") { f.efectiva = ""; delete S.auto.efectiva; ef = ""; }
    var efIn = ef === null ? null : $("f_efectiva");
    if (efIn && document.activeElement !== efIn) { efIn.value = ef; }
  }

  /* Quién escribe la nota, quién habló con el cliente, con qué NPN se hizo
     la app y quién la procesó. */
  function people() {
    var x = S.f.agenteExtra;
    return {
      me: memberByName(settings.autor),
      talker: memberByName(S.f.talker),
      agent: S.f.npnAgente === "__extra" && x ? { name: x.name, npn: x.npn, ini: U.initials(x.name) } : memberByName(S.f.npnAgente),
      /* en Medicare y Suplementario la app la hace quien escribe la nota */
      collab: S.line === "oc" ? memberByName(S.f.colaborador) : memberByName(settings.autor)
    };
  }

  function data() {
    var d = Object.assign({}, S.f), p = people();
    d.line = S.line; d.outcome = S.outcome;
    /* lo que el agente todavía no eligió ni confirmó (va en los avisos) */
    d.porElegir = FIELDS.filter(function (F) { return mustChoose(F) && fieldVisible(F); }).map(function (F) { return resolve(F.label); });
    d.ini = p.me ? p.me.ini : "";
    d.agente = p.agent ? p.agent.name : "";
    d.npn = p.agent ? p.agent.npn : "";
    d.agenteIni = p.agent ? agentIniOf(p.agent) : "";
    /* en la nota solo se nombra a quien no es el que la escribe */
    d.talkerNombre = p.talker && p.talker !== p.me ? p.talker.name : "";
    d.colaboradorNombre = p.collab && p.collab !== p.me ? p.collab.name : "";
    /* Reporte: si quien habló con el cliente no es quien procesó la app, sus
       iniciales van delante (DI: Q1234 - … (LI)). */
    var usePrefix = S.f.prefijo === "si" ? true : (S.f.prefijo === "no" ? false : !!(p.talker && p.collab && p.talker !== p.collab));
    d.reportPrefix = usePrefix && p.talker ? p.talker.ini : "";
    /* la agencia del agente cuyo NPN se usa, o la elegida arriba */
    d.oficina = N.officeFor(p.agent, settings.oficina);
    d.telefono = settings.telefonos[d.oficina] || "";
    d.botonRojo = settings.botonRojo;
    d.base = S.base;
    /* Medicare sin el interruptor de prima: el plan no cuesta nada */
    if (S.line === "mc" && !S.f.tienePrima) { d.prima = "0"; }
    /* el SMS y el email los firma quien habló con el cliente */
    var signer = p.talker || p.me;
    d.firmaNombre = signer ? signer.name : "";
    d.firmaTel = signer ? (signer.tel || "") : "";
    /* hoja de cambios: el agente que atiende, el colaborador, y el NPN del
       proceso anterior (el agente del último documento) junto al elegido */
    d.sheetAgente = signer ? signer.name : "";
    d.sheetColaborador = p.collab ? p.collab.name : "";
    d.npnSeleccionado = p.agent ? npnLabel(p.agent.npn, agentIniOf(p.agent)) : "";
    var prev = docAgent();
    if (prev) {
      var m = settings.team.filter(function (t) { return (prev.npn && t.npn === prev.npn) || (prev.name && sameName(t.name, prev.name)); })[0];
      d.npnAnterior = npnLabel(prev.npn || (m && m.npn), m ? agentIniOf(m) : U.initials(prev.name));
    }
    return d;
  }

  function npnLabel(npn, ini) { return [U.collapse(npn), ini ? "(" + ini + ")" : ""].filter(Boolean).join(" "); }

  /* el agente que trae el último documento leído (el App Summary del proceso anterior) */
  function docAgent() {
    for (var i = S.files.length - 1; i >= 0; i--) {
      var r = S.files[i].res, f = r && r.fields;
      if (f && (f.npn || f.agente)) { return { name: f.agente || "", npn: f.npn || "" }; }
    }
    return null;
  }

  /* el cuadro crece con el texto, para leerlo entero sin barra de scroll */
  function fitHeight(box) {
    if (!box.offsetParent) { return; }
    box.style.height = "auto";
    box.style.height = (box.scrollHeight + 2) + "px";
  }

  var OUT = { note: "note", task: "task", report: "report", sms: "sms", email1: "email1", email2: "email2" };
  var generated = { note: "", task: "", report: "", sms: "", email1: "", email2: "" };

  function setOut(key, text) {
    generated[key] = text;
    var box = $(OUT[key]);
    if (!S.edited[key]) { box.value = text; }
    var stale = S.edited[key] && box.value !== text;
    $(key + "Regen").hidden = !S.edited[key];
    if (key === "note") {
      $("noteEdited").hidden = !S.edited.note;
      $("noteEdited").textContent = stale ? "Editada a mano: los cambios en los campos no se aplican" : "Editada a mano";
    }
  }

  function renderStatus(warns) {
    var box = $("status");
    box.textContent = "";
    box.className = "status " + (warns.length ? "warn" : "ok");
    var head = el("div", "status-head");
    head.appendChild(el("span", "status-dot"));
    head.appendChild(el("strong", null, warns.length ? "Antes de copiar" : "Lista para copiar"));
    box.appendChild(head);
    if (warns.length) {
      var ul = el("ul");
      warns.forEach(function (w) { ul.appendChild(el("li", null, w)); });
      box.appendChild(ul);
    }
  }

  function refresh() {
    derive();
    updateVisibility();
    var d = data(), p = people();

    var task = N.buildTask(d);
    setOut("task", task);
    if (S.edited.task) { d.taskText = $("task").value; }

    var report = N.buildReport(d);
    var reportable = !!O().report;
    $("report").hidden = !reportable;
    $("copyReport").hidden = !reportable;
    $("reportNA").hidden = reportable;
    $("dockReport").hidden = !reportable;
    /* Medicare sin cambios va al canal NO CHANGE y no lleva iniciales delante */
    $("reportHint").hidden = !mcSin();
    $("prefixBox").hidden = !reportable || !p.talker || mcSin();
    $("prefix").checked = !!d.reportPrefix;
    $("prefixLabel").textContent = p.talker ? "Anteponer a quien habló con el cliente (" + p.talker.ini + ":)" : "Anteponer a quien habló con el cliente";
    setOut("report", report);

    setOut("note", N.buildNote(d, { sinAcentos: settings.sinAcentos }));

    var noSms = !!O().noSms;
    $("smsCard").hidden = noSms;
    $("dockSms").hidden = noSms;
    setOut("sms", N.buildSms(d));
    fitHeight($("sms"));
    var info = N.smsInfo($("sms").value);
    $("smsCount").textContent = info.length + " caracteres · " + info.parts + (info.parts === 1 ? " mensaje" : " mensajes");
    $("smsCount").title = info.unicode ? "Con acentos o emojis cada mensaje admite 70 caracteres; si no, 160." : "";

    /* SMS de una app enviada (Obamacare, Medicare o Suplementario) y email
       de una app de Obamacare o de Suplementario, o con la cotización de
       Obamacare si revisará los planes: en español o en inglés */
    var quote = isOC("pendiente") && !!S.f.revisaPlanes && !!N.buildEmail(d, 1);
    var smsLang = O().id === "enviada", email = isOC("enviada") || isSupp("enviada") || quote;
    each(document.querySelectorAll("[data-lang-seg]"), function (seg) {
      /* el Consent y el SOA siempre: su plantilla sale del idioma */
      seg.hidden = !(seg.closest("#sec-firma") || (seg.closest("#emailCard") ? email : smsLang));
      syncSeg(seg, S.f.idioma || "es");
    });
    $("emailCard").hidden = !email;
    if (email) {
      var one = isSupp() || quote;
      $("emailPart2").hidden = one;
      $("emailHead1").textContent = quote ? "Cotización" : one ? "Aplicación y póliza" : "1 · Documentos y plan";
      setOut("email1", N.buildEmail(d, 1));
      if (!one) { setOut("email2", N.buildEmail(d, 2)); }
      fitHeight($("email1")); if (!one) { fitHeight($("email2")); }
    }
    /* abrir el SMS en el teléfono y el email en el correo, si hay número o email */
    $("smsOpen").hidden = noSms || !N.smsLink(S.f.clienteTel, "x");
    $("emailOpen").hidden = !email || !N.mailtoLink(S.f.clienteEmail, "x");
    S.copyPos = 0;
    syncNext();
    updateFileNames();

    var shown = $("note").value;
    $("noteCount").textContent = shown.length + " caracteres";
    renderStatus(N.warnings(d, shown));
    $("autor").classList.toggle("needs", !d.ini);

    renderTaskOptions(d);
    updatePeopleSummary();
    $("outcomeDesc").textContent = O().desc + ".";
    renderSign(d);
    renderSheet(d);
    renderRail();
  }

  /* --------------------------------------------- Consent y SOA para firmar --
     En Obamacare Pendiente, el Consent; en Medicare, el SOA. La plantilla
     sale de la oficina de Ajustes y del idioma del cliente. Los valores se
     llenan con la nota y se pueden cambiar; lo cambiado a mano se queda hasta
     «Volver a los datos de la nota». El PDF se llena aquí mismo con PDF.js y
     se descarga (el SOA, sin llenar: solo el nombre y el teléfono del
     beneficiario, para Cliq y el SMS); el enlace de firma solo se arma, no
     se envía nada. */
  var signKind = "";

  function signValues(d, kind) { return Object.assign(FM.values(kind, d), S.signEdits[kind] || {}); }

  function buildSignGrid(kind) {
    var grid = $("signGrid");
    grid.textContent = "";
    FM.FIELDS[kind].forEach(function (x) {
      var wrap = el("div", "fld" + (x.w ? " " + x.w : ""));
      var lab = el("label", "field-label", x.l); lab.htmlFor = "sg_" + x.k;
      var inp = el("input"); inp.type = "text"; inp.id = "sg_" + x.k; inp.dataset.signK = x.k; inp.spellcheck = false;
      wrap.appendChild(lab); wrap.appendChild(inp);
      grid.appendChild(wrap);
    });
  }

  /* ------------------------------------------------------ hoja de cambios --
     Obamacare Pendiente: la hoja para el colaborador. Se dibuja con los datos
     de la nota; al imprimir, solo ella sale en el papel o en el PDF. */
  var sheetName = "";
  function renderSheet(d) {
    var on = N.needsSheet(d);
    $("sec-hoja").hidden = !on;
    if (!on) { return; }
    var s = N.changeSheet(d);
    sheetName = s.archivo;
    $("sheetFile").textContent = s.archivo + ".pdf";
    drawSheet($("sheetPreview"), s);
    fitSheet();
    renderSheetWhere();
  }

  /* Guardar la hoja como PDF en su carpeta (la de "Hoja de cambios" en
     Ajustes, si no la de OC, si no la general) */
  function renderSheetWhere() {
    var can = canSave && !!window.QA.sheetpdf;
    $("sheetSave").hidden = !can;
    $("sheetWhere").hidden = !can;
    if (!can) { return; }
    var t = N.netDirFor(netDirs, "oc", "hoja");
    $("sheetWhere").textContent = t.dir ? "«Guardar en la carpeta» la deja en: " + (t.dir.name || "la carpeta elegida") +
      (t.key === "oc:hoja" ? "." : ". Para usar otra, elígela en Ajustes > Carpetas del Network, en «Hoja de cambios».")
      : "Elige su carpeta en Ajustes > Carpetas del Network («Hoja de cambios»), o se pedirá al guardar.";
  }
  function saveSheet() {
    var s = N.changeSheet(data()), btn = $("sheetSave");
    var file = new Blob([window.QA.sheetpdf.sheetPdf(s)], { type: "application/pdf" });
    var job = { k: "hoja", file: file, name: N.safeFileName(s.archivo) + ".pdf" };
    ensureNetDir("hoja").then(function (dir) { return writeOne(dir, job); }).then(function (ok) {
      if (!ok) { return; }
      flashButton(btn);
      toast("Hoja de cambios guardada: " + job.name);
    }).catch(function (e) {
      if (e && e.name === "AbortError") { return; }
      toast("No se pudo guardar la hoja. Revisa el permiso o elige la carpeta otra vez en Ajustes.");
    });
  }

  /* la vista previa es la página entera, achicada al ancho de la tarjeta */
  var SHEET_WIDTH = 780;
  function fitSheet() {
    var frame = $("sheetPreview").parentNode;
    if (!frame.clientWidth) { return; }
    $("sheetPreview").style.zoom = String(Math.min(1, (frame.clientWidth - 2) / SHEET_WIDTH));
  }

  function drawSheet(box, s) {
    var dash = "—";
    function txt(tag, cls, t) { return el(tag, cls, U.collapse(t) ? t : dash); }
    function item(label, value, mark) {
      var w = el("div", "sh-item" + (mark ? " sh-mark" : ""));
      w.appendChild(el("div", "sh-label", label));
      w.appendChild(txt("div", "sh-value", value));
      return w;
    }
    box.textContent = "";
    var head = el("div", "sh-head");
    var ht = el("div");
    ht.appendChild(el("h1", "sh-title", s.titulo));
    if (s.anio) { ht.appendChild(el("div", "sh-sub", "Datos actualizados para " + s.anio)); }
    head.appendChild(ht);
    var date = el("div", "sh-date", "Fecha: ");
    date.appendChild(el("strong", null, s.fecha));
    head.appendChild(date);
    box.appendChild(head);

    var legend = el("p", "sh-legend");
    legend.appendChild(el("span", "sh-swatch"));
    legend.appendChild(document.createTextNode("Los datos resaltados indican cambios en relación con el proceso anterior" + (s.anioAnterior ? " (" + s.anioAnterior + ")" : "") + "."));
    box.appendChild(legend);
    box.appendChild(el("div", "sh-banner", "PROCESAR POR EL PORTAL: " + s.portal));

    var top = el("div", "sh-grid3");
    var c1 = el("div"), c2 = el("div"), c3 = el("div");
    c1.appendChild(item("Cliente", s.cliente));
    c1.appendChild(item("Colaborador", s.colaborador));
    c1.appendChild(item("Carta de consentimiento", s.consent));
    c2.appendChild(item("Código de Zoho", s.codigo));
    c2.appendChild(item("NPN anterior", s.npnAnterior));
    c3.appendChild(item("Agente", s.agente));
    c3.appendChild(item("NPN seleccionado", s.npnSeleccionado, true));
    [c1, c2, c3].forEach(function (c) { top.appendChild(c); });
    box.appendChild(top);

    box.appendChild(el("h2", "sh-h2", "Plan elegido"));
    if (s.plan) {
      var plan = el("div", "sh-plan");
      var pn = el("div", "sh-plan-name");
      pn.appendChild(el("span", "sh-chip", "ELEGIDO"));
      pn.appendChild(txt("span", null, s.plan.nombre));
      plan.appendChild(pn);
      var pr = el("div", "sh-plan-cell");
      pr.appendChild(el("div", "sh-plan-label", "Prima"));
      pr.appendChild(el("div", "sh-plan-big", s.plan.prima ? s.plan.prima + "/mo" : dash));
      plan.appendChild(pr);
      var st = el("div", "sh-plan-cell");
      st.appendChild(el("div", "sh-plan-label", "Inicia cobertura"));
      st.appendChild(el("div", "sh-plan-big", s.plan.inicio || dash));
      plan.appendChild(st);
      box.appendChild(plan);
    } else {
      box.appendChild(el("p", "sh-empty", "Sin plan elegido: selecciona uno en Planes cotizados."));
    }

    box.appendChild(el("h2", "sh-h2", "Datos de contacto"));
    var ct = el("div", "sh-grid2");
    s.contacto.forEach(function (c) { ct.appendChild(item(c.label, c.value, c.cambio)); });
    box.appendChild(ct);

    box.appendChild(el("h2", "sh-h2", "Integrantes del hogar"));
    var table = el("table", "sh-table"), thead = el("thead"), hr = el("tr");
    ["Nombre", "Nac. (DOB)", "Sexo", "En taxes", "Solicita cobertura", "Estatus migratorio", "Income anual estimado"].forEach(function (h, i) {
      hr.appendChild(el("th", i === 6 ? "num" : (i === 3 || i === 4 ? "mid" : null), h));
    });
    thead.appendChild(hr); table.appendChild(thead);
    var tb = el("tbody");
    s.personas.forEach(function (p) {
      var tr = el("tr", p.nuevo ? "sh-new" : null);
      var name = txt("td", "sh-name", p.nombre);
      if (p.nuevo) { name.appendChild(el("span", "sh-tag", "Nuevo")); }
      tr.appendChild(name);
      tr.appendChild(txt("td", p.cambio.dob ? "sh-mark" : null, p.dob));
      tr.appendChild(txt("td", null, p.sexo));
      tr.appendChild(el("td", "mid " + (p.taxes ? "sh-yes" : "sh-no") + (p.cambio.taxes ? " sh-mark" : ""), p.taxes ? "Sí" : "No"));
      tr.appendChild(el("td", "mid " + (p.cobertura ? "sh-yes" : "sh-no") + (p.cambio.cobertura ? " sh-mark" : ""), p.cobertura ? "Sí" : "No"));
      tr.appendChild(txt("td", p.cambio.estatus ? "sh-mark" : null, p.estatus));
      tr.appendChild(txt("td", "num" + (p.cambio.ingreso ? " sh-mark" : ""), p.ingreso));
      tb.appendChild(tr);
    });
    s.quitados.forEach(function (n) {
      var tr = el("tr", "sh-gone");
      tr.appendChild(el("td", "sh-name", n));
      var td = el("td", null, "Se quita del hogar");
      td.colSpan = 6;
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    var tf = el("tfoot"), fr = el("tr"), fl = el("td", "num", "Income anual estimado del hogar" + (s.anio ? " " + s.anio : ""));
    fl.colSpan = 6;
    fr.appendChild(fl);
    fr.appendChild(txt("td", "num", s.total));
    tf.appendChild(fr); table.appendChild(tf);
    box.appendChild(table);

    var foot = el("div", "sh-foot");
    foot.appendChild(el("span", null, "Uso interno · sin SSN"));
    foot.appendChild(el("span", null, "Q Agency Toolbox · Verificación previa"));
    box.appendChild(foot);
  }

  /* Imprime solo la hoja; el título de la página es el nombre que propone
     «Guardar como PDF». */
  function printSheet() {
    var d = data(), s = N.changeSheet(d), title = document.title;
    drawSheet($("printSheet"), s);
    document.title = s.archivo;
    document.body.classList.add("printing-sheet");
    var done = function () {
      document.title = title;
      document.body.classList.remove("printing-sheet");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  function renderSign(d) {
    var sec = $("sec-firma"), kind = FM.formKind(d);
    sec.hidden = !kind;
    if (!kind) { return; }
    var key = FM.templateKey(kind, d.oficina, S.f.idioma), T = FM.TEMPLATES[key];
    var title = kind === "soa" ? "SOA" : "Consent";
    sec.dataset.rail = title;
    $("signTitle").textContent = title + " para firmar";
    /* el Consent es de la agencia del agente del NPN, o de la oficina elegida
       arriba: se confirma cuál se usará y por qué */
    var tpl = $("signTemplate");
    tpl.textContent = "";
    tpl.classList.toggle("sign-office", kind === "consent");
    if (kind === "consent") {
      var ag = people().agent, byAgent = !!(ag && ag.oficina && ag.oficina === d.oficina && U.collapse(ag.npn));
      tpl.appendChild(document.createTextNode("Se usará el Consent de "));
      tpl.appendChild(el("strong", null, d.oficina));
      tpl.appendChild(document.createTextNode(" (" + T.label + "). " + (byAgent
        ? "Es la agencia de " + ag.name + ", el NPN de la app; se cambia en Ajustes > Equipo."
        : "Revisa que sea la oficina correcta; si no, cámbiala arriba, debajo de Q Agency Toolbox, o elige la agencia del agente en Ajustes > Equipo.")));
    } else {
      tpl.textContent = "Plantilla: " + T.label + ". Se descarga sin llenar: la sección del agente se completa y se firma después de que firme el cliente.";
    }
    /* el SOA no lleva datos: se descarga la plantilla tal cual */
    $("signDownload").textContent = kind === "soa" ? "Descargar PDF" : "Descargar PDF lleno";
    if (signKind !== kind) { buildSignGrid(kind); signKind = kind; }
    var v = signValues(d, kind), edits = S.signEdits[kind] || {};
    FM.FIELDS[kind].forEach(function (x) {
      var inp = $("sg_" + x.k);
      if (document.activeElement !== inp) { inp.value = v[x.k] || ""; }
      inp.closest(".fld").classList.toggle("is-edited", x.k in edits);
    });
    $("signReset").hidden = !Object.keys(edits).length;

    var phone = kind === "soa" ? v.beneficiaryPhone : S.f.clienteTel, email = S.f.clienteEmail;
    /* los mensajes internos (Cliq) nombran al cliente como en Zoho: "Apellido, Nombre" */
    $("signCliq").value = FM.cliqText(kind, N.zohoName(S.f) || (kind === "soa" ? v.beneficiaryName : v.clientName), email, phone);
    fitHeight($("signCliq"));
    var link = U.collapse(settings.signLinks[key]), url = FM.signingUrl(link, kind, v);
    $("signLinkBox").hidden = !url;
    $("signLinkHint").hidden = !!url;
    if (!url) {
      $("signLinkHint").textContent = link ? "El enlace de SignWell de «" + T.label + "» en Ajustes no es válido: debe empezar con https://."
        : "Para enviar un enlace de firma, agrega en Ajustes el enlace de SignWell de «" + T.label + "».";
      return;
    }
    var t = FM.signTexts(kind, d, url);
    $("signUrl").value = url;
    $("signSms").value = t.sms;
    $("signEmail").value = t.email;
    $("signSmsOpen").hidden = !N.smsLink(phone, "x");
    $("signEmailOpen").hidden = !N.mailtoLink(email, "x");
    fitHeight($("signSms")); fitHeight($("signEmail"));
  }

  function downloadSign(btn) {
    var d = data(), kind = FM.formKind(d);
    if (!kind) { return; }
    var key = FM.templateKey(kind, d.oficina, S.f.idioma), bytes = FM.templateBytes(key);
    if (!bytes || !window.pdfjsLib) { toast("Esta copia de la herramienta no trae la plantilla de " + FM.TEMPLATES[key].label + "."); return; }
    var name = FM.downloadName(d, kind);
    btn.disabled = true;
    FM.fillPdf(window.pdfjsLib, bytes, FM.fieldMap(key, signValues(d, kind))).then(function (out) {
      var a = el("a");
      a.href = URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
      toast("PDF listo: " + name);
    }, function () { toast("No se pudo llenar el PDF."); }).then(function () { btn.disabled = false; });
  }

  /* Ajustes: un enlace de plantilla de SignWell por formulario */
  function renderSignLinks() {
    var box = $("signLinkRows");
    box.textContent = "";
    Object.keys(FM.TEMPLATES).forEach(function (k) {
      var lab = el("label", "mini");
      lab.appendChild(el("span", null, FM.TEMPLATES[k].label));
      var inp = el("input"); inp.type = "text"; inp.inputMode = "url"; inp.spellcheck = false;
      inp.placeholder = "https://www.signwell.com/…"; inp.value = settings.signLinks[k] || ""; inp.dataset.signLink = k;
      lab.appendChild(inp);
      box.appendChild(lab);
    });
  }

  function renderTaskOptions(d) {
    var sel = $("taskId");
    var auto = N.taskById(N.autoTaskId(d));
    var current = S.f.taskId || "";
    if (sel.dataset.line !== S.line) {
      sel.textContent = "";
      sel.dataset.line = S.line;
      var first = el("option", null, "Automático"); first.value = ""; sel.appendChild(first);
      var groups = {}, cats = C.LINE_TASK_CATS[S.line] || [];
      C.TASKS.filter(function (t) { return cats.indexOf(t.cat) >= 0; }).forEach(function (t) {
        if (!groups[t.cat]) { groups[t.cat] = el("optgroup"); groups[t.cat].label = t.cat; sel.appendChild(groups[t.cat]); }
        var o = el("option", null, t.text.replace(/\{metodo\}/, "TEXT / EMAIL / LETTER").replace(/\{n\}/, "#").replace(/\{docFecha\}/, "(fecha)").replace(/\{taxYear\}/, "(año)"));
        o.value = t.id; if (t.hint) { o.title = t.hint; }
        groups[t.cat].appendChild(o);
      });
    }
    sel.value = current;
    if (sel.value !== current) { sel.value = ""; S.f.taskId = ""; }

    var owner = $("taskOwner"), cur = S.f.taskOwner || "";
    owner.textContent = "";
    var me = el("option", null, d.ini ? d.ini + " (yo)" : "—"); me.value = ""; owner.appendChild(me);
    var seen = {};
    settings.team.forEach(function (t) {
      if (!t.ini || t.ini === d.ini || seen[t.ini]) { return; }
      seen[t.ini] = true;
      var o = el("option", null, t.ini); o.value = t.ini; o.title = t.name; owner.appendChild(o);
    });
    owner.value = cur;
    if (owner.value !== cur) { owner.value = ""; S.f.taskOwner = ""; }

    var T = N.taskById(S.f.taskId) || auto;
    $("reviewBox").hidden = !(T && T.review);
    $("taxYearBox").hidden = !(T && T.extra === "tax");
    $("review").checked = !!S.f.review;
    each($("obsTags").querySelectorAll("button"), function (b) {
      var on = (S.f.obsTags || []).indexOf(b.dataset.v) >= 0;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (document.activeElement !== $("taxYear")) { $("taxYear").value = S.f.taxYear || ""; }
    $("taxYear").placeholder = String(new Date().getFullYear());
  }

  /* -------------------------------------------------------------- copiar */

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* win: la ventana que tiene el foco (la flotante, cuando se copia desde ella) */
  function copyText(text, onDone, win) {
    win = win || window;
    var doc = win.document;
    function fallback() {
      var ta = doc.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand("copy"); onDone(); } catch (e) { toast("No se pudo copiar. Selecciona el texto y usa Ctrl + C."); }
      doc.body.removeChild(ta);
    }
    if (win.navigator.clipboard && win.navigator.clipboard.writeText) {
      win.navigator.clipboard.writeText(text).then(onDone, fallback);
    } else { fallback(); }
  }

  function flashButton(btn) {
    if (!btn) { return; }
    var label = btn.dataset.label || btn.textContent;
    btn.dataset.label = label;
    btn.textContent = "Copiado ✓"; btn.classList.add("done");
    setTimeout(function () { btn.textContent = btn.dataset.label || label; btn.classList.remove("done"); }, 1600);
  }

  function copyOut(key, btn, win) {
    var text = $(OUT[key]).value;
    if (!text.trim()) { return; }
    copyText(text, function () { flashButton(btn); }, win);
    if (key === "note") { S.dirty = false; }
  }

  /* ------------------------------------------------- copiar siguiente --
     Nota, task, reporte, SMS y email, en orden, sin lo que la situación no
     muestra ni lo que está vacío. Vuelve a empezar cuando cambia un campo. */
  var COPY_LABEL = { note: "Nota", task: "Task", report: "Reporte", sms: "SMS", email1: "Email", email2: "Email 2" };
  function copyList() { return N.copyOrder(data()).filter(function (k) { return $(OUT[k]).value.trim(); }); }
  function copyLabel(k, list) { return k === "email1" && list.indexOf("email2") >= 0 ? "Email 1" : COPY_LABEL[k]; }
  function nextLabel() {
    var list = copyList();
    return list.length ? "Copiar siguiente: " + copyLabel(list[(S.copyPos || 0) % list.length], list) : "Copiar siguiente";
  }
  function copyNext(btn, win) {
    var list = copyList();
    if (!list.length) { return; }
    var i = (S.copyPos || 0) % list.length;
    S.copyPos = i + 1;
    if (btn) { btn.dataset.label = nextLabel(); }
    copyOut(list[i], btn, win);
    if (!pip) { toast("Copiado: " + copyLabel(list[i], list)); }
    syncNext();
  }
  function syncNext() {
    var b = $("copyNext");
    b.dataset.label = nextLabel();
    if (!b.classList.contains("done")) { b.textContent = b.dataset.label; }
    if (pip) { renderFloat(); }
  }

  /* ------------------------------------------------- ventana flotante --
     Document Picture-in-Picture: una ventana pequeña que queda encima de las
     demás, con los botones de copiar. Copia siempre el texto actual. El marco
     y la barra de título los dibuja el navegador; por dentro es una burbuja
     sin bordes. Sin el botón "volver a la pestaña": se vuelve con la barra de
     tareas. */
  var pip = null;
  function openFloat() {
    if (pip) { pip.focus(); return; }
    window.documentPictureInPicture.requestWindow({ width: 400, height: 140, disallowReturnToOpener: true }).then(function (w) {
      pip = w;
      each(document.styleSheets, function (sheet) {
        var css = "";
        try { css = Array.prototype.map.call(sheet.cssRules, function (r) { return r.cssText; }).join("\n"); } catch (e) { css = ""; }
        var st = w.document.createElement("style"); st.textContent = css; w.document.head.appendChild(st);
      });
      if (document.documentElement.hasAttribute("data-theme")) {
        w.document.documentElement.setAttribute("data-theme", document.documentElement.getAttribute("data-theme"));
      }
      w.document.title = "Q Agency Toolbox";
      w.document.body.className = "float-body";
      w.document.body.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) { return; }
        if (b.dataset.next) { copyNext(b, w); } else { copyOut(b.dataset.copy, b, w); }
      });
      w.addEventListener("pagehide", function () { pip = null; });
      renderFloat();
    }).catch(function () { toast("No se pudo abrir la ventana flotante."); });
  }
  /* se reconstruye solo si cambian los botones; si no, se actualizan los
     textos sin cortar el "Copiado ✓" de un botón recién usado */
  function renderFloat() {
    if (!pip) { return; }
    var doc = pip.document, body = doc.body, list = copyList(), sig = list.join(",");
    if (body.dataset.sig !== sig || !body.querySelector("[data-next]")) {
      body.textContent = "";
      var head = doc.createElement("div"); head.className = "float-head";
      var avatar = doc.createElement("span"); avatar.className = "float-avatar"; avatar.setAttribute("aria-hidden", "true");
      var name = doc.createElement("span"); name.className = "float-name";
      head.appendChild(avatar); head.appendChild(name);
      var row = doc.createElement("div"); row.className = "float-row";
      var next = doc.createElement("button"); next.type = "button"; next.className = "btn primary small"; next.dataset.next = "1";
      row.appendChild(next);
      list.forEach(function (k) {
        var b = doc.createElement("button"); b.type = "button"; b.className = "btn small"; b.dataset.copy = k;
        row.appendChild(b);
      });
      body.appendChild(head); body.appendChild(row);
      body.dataset.sig = sig;
    }
    var d = data(), initials = N.clientInitials(d), avatar = body.querySelector(".float-avatar");
    body.querySelector(".float-name").textContent = N.zohoName(d) || "Sin cliente";
    avatar.textContent = initials;
    avatar.hidden = !initials;
    var label = function (b, text) { b.dataset.label = text; if (!b.classList.contains("done")) { b.textContent = text; } };
    label(body.querySelector("[data-next]"), nextLabel());
    each(body.querySelectorAll("[data-copy]"), function (b) { label(b, copyLabel(b.dataset.copy, list)); });
  }

  /* ---------------------------------------------------------- documentos */

  var DEFAULTABLE = ["anio", "producto", "plataforma", "periodo", "periodoMC", "genero", "idioma"];
  var RANK = { oc_plans: 3, mc_app: 3, supp_app: 3, oc_elig: 2, pay: 2, oc_app: 1, oc_docs: 1, oc_quote: 1, mc_soa: 1, supp_card: 1 };

  /* Campos del producto: la compañía, el plan y el pago son de una línea.
     Cuando un documento cambia de línea (un dental después de un Obamacare)
     se vacían para que no pasen al producto nuevo. */
  var PRODUCT_KEYS = FIELDS.filter(function (F) { return F.g === "plan" || F.g === "pago"; }).map(key);

  function switchLine(line) {
    S.line = line; settings.line = line; saveSettings();
    var same = L().outcomes.filter(function (o) { return o.id === S.outcome; })[0];
    S.outcome = same ? same.id : L().outcomes[0].id;
    S.f.gestion = ""; S.f.taskId = "";
    var fresh = freshFields();
    PRODUCT_KEYS.forEach(function (k) { resetField(k, fresh); delete S.base[k]; });
    /* lo que los documentos marcaron o agregaron era de la otra línea: las
       casillas del Network y las personas del hogar que trajo un documento */
    S.f.net = {};
    S.f.personas = S.f.personas.filter(function (p) { return p.titular || !p.auto; });
    S.f.personas.forEach(function (p) {
      Object.keys(p.filled || {}).forEach(function (k) { if (!p.orig || p[k] === p.orig[k]) { p[k] = ""; } });
      delete p.filled; delete p.orig;
    });
    S.f.hogarPdf = false;
    afterOutcomeChange();
  }

  /* Un campo vuelve a como empieza una nota nueva (la mayoría no existe hasta
     que se llena). */
  function resetField(k, fresh) {
    if (k in fresh) { S.f[k] = fresh[k]; } else { delete S.f[k]; }
    delete S.auto[k]; delete S.rank[k];
  }

  function caseIdentity() {
    var f = S.f;
    return { nombres: f.nombres, apellidos: f.apellidos, compania: f.compania, confirmacion: f.confirmacion, appId: f.appId, poliza: f.poliza };
  }

  /* Usa un documento leído: si no coincide con el caso (otro cliente, otra
     compañía u otro número) se aparta con un aviso y no se usa, salvo que el
     agente pida usarlo igual. */
  function useFile(entry) {
    /* al volver a usarlo (después de quitar otro documento) la línea ya no
       cambia: se guarda a cuál volver */
    var hadLine = entry.lineFrom, hadOutcome = entry.outcomeFrom;
    delete entry.held; delete entry.lineFrom; delete entry.outcomeFrom;
    entry.applied = 0;
    if (!entry.res) { return; }
    /* un documento sin línea propia (un recibo de pago) se lee para la
       línea en la que está la nota */
    if (!entry.res.line && entry.text != null && entry.readFor !== S.line) { readEntry(entry); }
    var why = entry.force ? [] : N.docConflicts(caseIdentity(), S.line, entry.res);
    if (why.length) { entry.held = why; return; }
    var lineBefore = S.line, outcomeBefore = S.outcome;
    entry.applied = applyExtraction(entry.res);
    if (S.line !== lineBefore) {
      entry.lineFrom = lineBefore;
      /* los otros documentos sin línea propia se vuelven a leer y usar para
         la línea nueva: un recibo soltado antes que su aplicación */
      S.files.forEach(function (f) { if (f !== entry && f.res && !f.res.line) { useFile(f); } });
    } else if (S.outcome !== outcomeBefore) { entry.outcomeFrom = outcomeBefore; }
    else if (hadLine && S.line === entry.res.line) { entry.lineFrom = hadLine; }
    else if (hadOutcome && S.outcome !== hadOutcome) { entry.outcomeFrom = hadOutcome; }
  }

  function readEntry(entry) {
    entry.res = X.extract(entry.text, entry.name, S.line, entry.words ? { words: entry.words } : null);
    entry.readFor = S.line;
  }

  /* Quitar un documento deshace lo que llenó: se vacía lo que vino de
     documentos y el agente no tocó, y se vuelven a usar los que quedan, en
     el mismo orden. Lo escrito o corregido a mano se queda. */
  function removeFile(entry) {
    var i = S.files.indexOf(entry);
    if (i < 0) { return; }
    S.files.splice(i, 1);
    var fresh = freshFields();
    Object.keys(S.auto).forEach(function (k) {
      if (S.auto[k] !== true) { return; }
      resetField(k, fresh);
    });
    if (S.f.npnAgente === "" || S.f.npnAgente === fresh.npnAgente) { S.f.agenteExtra = null; }
    S.base = {};
    S.f.personas = S.f.personas.filter(function (p) { return p.titular || !p.auto; });
    S.f.personas.forEach(function (p) {
      /* lo que llenó un documento se vacía, salvo que el agente lo haya cambiado */
      Object.keys(p.filled || {}).forEach(function (k) { if (!p.orig || p[k] === p.orig[k]) { p[k] = ""; } });
      delete p.filled; delete p.orig;
    });
    S.f.docs = S.f.docs.filter(function (x) { return !x.auto; });
    S.f.planes = S.f.planes.filter(function (x) { return !x.auto; });
    S.f.hogarDoc = ""; S.f.hogarPdf = false;
    /* sin documentos no queda nadie que se haya quitado de ellos */
    if (!S.files.length) { S.f.quitados = []; S.f.descartados = []; }
    /* las casillas del Network que marcó un documento se vuelven a marcar
       solo si otro documento las marca */
    [entry].concat(S.files).forEach(function (f) { if (f.res && f.res.net) { S.f.net[f.res.net] = false; } });
    /* si ese documento había cambiado de línea y ningún otro es de esa línea,
       se vuelve a la de antes */
    if (entry.lineFrom && S.line === entry.res.line && !S.files.some(function (f) { return f.applied && f.res && f.res.line === S.line; })) {
      switchLine(entry.lineFrom);
    }
    /* lo mismo con una cotización que pasó la nota a Pendiente; si queda
       otra cotización, ella guarda a qué volver */
    var quoteLeft = S.files.filter(function (f) { return f.applied && f.res && f.res.type === "oc_quote"; })[0];
    if (entry.outcomeFrom && S.outcome === "pendiente" && !quoteLeft) {
      S.outcome = entry.outcomeFrom; S.f.taskId = ""; afterOutcomeChange();
    }
    S.files.forEach(useFile);
    if (entry.outcomeFrom && quoteLeft && quoteLeft.applied && !quoteLeft.outcomeFrom) { quoteLeft.outcomeFrom = entry.outcomeFrom; }
    syncCarrierChoice();
  }

  function afterFilesChanged() {
    S.dirty = true;
    defaultPeople(); renderLists(); renderFiles(); renderPicker(); syncInputs(); renderNetwork(); refresh();
  }

  function applyExtraction(res) {
    var lineBefore = S.line, carrierBefore = S.f.compania;
    /* solo se cambia de línea si el documento realmente aportó datos */
    if (res.line && res.line !== S.line && res.count > 0) { switchLine(res.line); }
    var rank = RANK[res.type] || 0, applied = 0;
    var fields = Object.assign({}, res.fields);
    /* el Writing ID ya no se usa (basta el NPN): si un documento lo trae, se ignora */
    delete fields.escritura;
    /* lo que va a las listas o a los selectores se aparta del resto */
    var special = {};
    ["miembros", "ingreso", "hogar", "docs", "agente", "npn", "dob", "planes", "personas"].forEach(function (k) {
      if (k in fields) { special[k] = fields[k]; delete fields[k]; }
    });
    /* Cotización de HealthSherpa: los planes van a Planes cotizados y la nota
       pasa a Pendiente. Con la app enviada y un solo plan en la pantalla (la
       vista del plan), ese plan va a la sección Plan. */
    if (special.planes && lineBefore === "oc" && S.outcome === "enviada" && special.planes.length === 1) {
      var one = special.planes[0];
      ["compania", "plan", "prima"].forEach(function (k) { if (one[k]) { fields[k] = one[k]; } });
      delete special.planes;
    }
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      if (isMoney(k)) { v = U.parseMoney(v); }
      /* lo que trae el documento queda como base para la lista de Cambios */
      if (!(k in S.base)) { S.base[k] = v; }
      var empty = S.f[k] == null || S.f[k] === "" || S.f[k] === false;
      /* lo que vino de otro documento se reemplaza si este manda igual o más
         (el último documento soltado gana); un campo que sigue en su valor de
         una nota nueva (año, producto, plataforma, periodo, género) también */
      var replaceable = S.auto[k] ? (S.auto[k] === "calc" || rank >= (S.rank[k] || 0))
        : DEFAULTABLE.indexOf(k) >= 0 && S.f[k] === freshFields()[k];
      if (!empty && !replaceable) { return; }
      /* en Obamacare Pendiente los documentos son del proceso anterior: su año
         no reemplaza un año del plan más nuevo (la renovación de 2027 con el
         App Summary de 2026) */
      if (k === "anio" && S.line === "oc" && S.outcome === "pendiente" && +v < +S.f.anio) { return; }
      S.f[k] = v; S.auto[k] = true; S.rank[k] = rank; S.base[k] = v; applied++;
    });
    if (special.miembros && S.line !== "mc") { applied += N.mergeMembers(S.f, U.parseList(special.miembros)); }
    if (special.planes && special.planes.length && S.line === "oc") {
      if (S.outcome !== "pendiente") { S.outcome = "pendiente"; S.f.taskId = ""; afterOutcomeChange(); }
      applied += mergePlanes(special.planes);
    }
    var sent = [];
    if (S.line === "oc") {
      /* las personas del App Summary: parentesco, estatus, ingreso anual y DOB */
      if (special.personas) { applied += N.mergeHousehold(S.f, special.personas, rank); }
      /* el DOB del documento es del titular; el ingreso, del hogar (la carta
         de elegibilidad): va al titular solo si nadie dijo el suyo */
      var dob = U.parseDate(special.dob), ing = U.parseMoney(special.ingreso);
      if (dob) { applied += N.mergeHousehold(S.f, [{ titular: true, dob: dob }], rank); }
      if (ing) { applied += N.mergeHousehold(S.f, [{ titular: true, ingreso: ing }], rank, true); }
      if (special.hogar) { S.f.hogarDoc = special.hogar; }
      if (special.docs) { applied += N.mergeDocs(S.f, special.docs, sent); }
    }
    /* Medicare: un documento con prima prende el interruptor de la prima */
    if (S.line === "mc" && fields.prima && U.moneyNumber(fields.prima) > 0 && !S.f.tienePrima) { S.f.tienePrima = true; S.auto.tienePrima = true; }
    if (special.agente || special.npn) { applied += mapAgent(special.agente, special.npn); }
    /* Docs Submitted: el archivo va a la fila del documento que se envió; una
       página sin documento abierto no tiene fila ni casilla */
    if (res.net === "docsub") { res.net = sent.length ? N.docKey(sent[0]) : ""; }
    if (res.net) { S.f.net[res.net] = true; }
    if (S.line !== lineBefore || S.f.compania !== carrierBefore) { syncCarrierChoice(); }
    return applied;
  }

  function sameName(a, b) { return U.stripAccents(U.collapse(a)).toUpperCase() === U.stripAccents(U.collapse(b)).toUpperCase(); }


  /* Planes de una cotización: se agregan a Planes cotizados en el orden de
     la pantalla, marcados como leídos. Un plan que ya está en la lista (el
     mismo nombre) no se repite, y la fila vacía del principio se reemplaza. */
  function planKey(s) { return U.stripAccents(U.collapse(s)).toUpperCase().replace(/[^A-Z0-9$]+/g, ""); }
  function mergePlanes(list) {
    var added = 0;
    S.f.planes = S.f.planes.filter(function (p) { return p.sel || U.collapse(p.compania) || U.collapse(p.plan) || U.collapse(p.prima); });
    list.forEach(function (q) {
      if (!U.collapse(q.plan) || S.f.planes.some(function (p) { return planKey(p.plan) === planKey(q.plan); })) { return; }
      /* un plan que el agente borró o corrigió no vuelve */
      var src = N.rowSource("plan", q.plan);
      if (N.discarded(S.f, src) || S.f.planes.some(function (p) { return p.src === src; })) { return; }
      S.f.planes.push({ compania: q.compania || "", plan: U.collapse(q.plan), prima: U.parseMoney(q.prima), sel: false, auto: true, src: src });
      added++;
    });
    return added;
  }

  /* El agente de un documento se busca en el equipo por NPN o por nombre. */
  function mapAgent(name, npn) {
    /* lo que eligió el agente a mano no se toca */
    if (U.collapse(S.f.npnAgente) && S.auto.npnAgente !== "calc" && S.auto.npnAgente !== true) { return 0; }
    var x = S.f.agenteExtra;
    if (S.f.npnAgente === "__extra" && x && !npn && name && sameName(x.name, name)) { return 0; }
    var m = settings.team.filter(function (t) { return (npn && t.npn === npn) || (name && sameName(t.name, name)); })[0];
    if (m) { S.f.npnAgente = m.name; }
    /* un agente que no está en el equipo queda como el del documento, aunque
       solo traiga el NPN */
    else if (name || npn) { S.f.agenteExtra = { name: U.collapse(name).toUpperCase(), npn: npn || "" }; S.f.npnAgente = "__extra"; }
    else { return 0; }
    S.auto.npnAgente = true;
    return 1;
  }

  function fileStatusText(f) {
    if (f.status === "reading") { return f.ocrStep || "Leyendo…"; }
    if (f.status === "error") { return f.ocr ? "El OCR no pudo leerlo. Usa «Pegar texto» o llena los datos a mano." : "No se pudo leer. Usa «Pegar texto»."; }
    if (f.ocr && (f.status === "image" || f.status === "scanned")) { return "El OCR no encontró texto: llena los datos a mano"; }
    if (f.status === "image" && f.other) { return "Este tipo de archivo no se lee: llena los datos a mano"; }
    if (f.status === "image") { return "Imagen: este navegador no tiene OCR, llena los datos a mano"; }
    if (f.status === "scanned") { return "PDF escaneado: este navegador no tiene OCR, llena los datos a mano"; }
    /* lo leído con OCR puede traer errores: se pide revisarlo */
    var tail = !f.ocr ? "" : f.ocrTotal > f.ocrPages ? " · OCR de las primeras " + f.ocrPages + " de " + f.ocrTotal + " páginas, revísalo" : " · leído con OCR, revísalo";
    if (f.held) { return "No coincide con el caso: " + f.held.join("; ") + ". No se usó."; }
    if (!f.applied) { return (f.res && f.res.type === "unknown" ? "No se reconoció el documento" : "Sin datos nuevos") + tail; }
    return f.applied + (f.applied === 1 ? " dato" : " datos") + tail;
  }

  function renderFiles() {
    var ul = $("files");
    ul.textContent = "";
    S.files.forEach(function (f, i) {
      var li = el("li", "file " + f.status + (f.held ? " held" : f.status === "ok" && !f.applied ? " none" : ""));
      li.appendChild(el("span", "file-type", f.res ? f.res.label : "Documento"));
      li.appendChild(el("span", "file-name", f.name));
      li.appendChild(el("span", "file-meta", fileStatusText(f)));
      if (f.held) {
        var use = el("button", "link-btn", "Usar igual");
        use.type = "button"; use.dataset.force = i;
        use.setAttribute("aria-label", "Usar " + f.name + " aunque no coincida con el caso");
        li.appendChild(use);
      }
      if (f.text) {
        var v = el("button", "link-btn", "Ver texto");
        v.type = "button"; v.dataset.view = i;
        li.appendChild(v);
      }
      var x = el("button", "icon-btn tiny", "✕");
      x.type = "button"; x.dataset.remove = i; x.setAttribute("aria-label", "Quitar " + f.name);
      li.appendChild(x);
      ul.appendChild(li);
    });
  }

  function finishFile(entry, text, status, words) {
    entry.text = text || "";
    var readable = entry.text.replace(/\s/g, "").length >= 40;
    if (words) { entry.words = words; }
    readEntry(entry);
    entry.status = status || (readable ? "ok" : "scanned");
    useFile(entry);
    renderFiles();
  }

  /* --------------------------------------------------------------- OCR --
     Un PDF escaneado (sin texto) o una imagen se leen con OCR dentro del
     navegador; el texto pasa por la misma extracción que un PDF con texto. */
  function ocrReady() { return !!(OCR && OCR.supported()); }
  function ocrStep(entry, text) { entry.ocrStep = text; renderFiles(); }
  /* lo leído con OCR cuenta aunque sea poco (una captura de una sola línea) */
  function ocrStatus(text, empty) { return String(text || "").replace(/\s/g, "").length < 4 ? empty : "ok"; }

  /* OCR para un escaneo sin texto, y también cuando el texto es tan poco que
     no se reconoce el documento (una tarjeta escaneada trae unas pocas
     palabras sueltas encima de la imagen). */
  function wantsOcr(text) {
    if (OCR.needsOcr(text)) { return true; }
    return String(text || "").replace(/\s/g, "").length < 200 && X.extract(text, "document.pdf", S.line).type === "unknown";
  }

  /* La hora de la nota es la exacta en que se carga el primer documento,
     salvo que el agente ya la haya puesto a mano. */
  function stampHora() {
    if (S.horaFrom) { return; }
    var now = new Date();
    S.f.hora = U.pad2(now.getHours()) + ":" + U.pad2(now.getMinutes());
    S.horaFrom = "doc";
  }

  function readFile(file) {
    var entry = { name: file.name, status: "reading", applied: 0, file: file };
    stampHora();
    S.files.push(entry);
    renderFiles();
    var isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
    var isText = /^text\//i.test(file.type) || /\.txt$/i.test(file.name);
    var isImage = /^image\//i.test(file.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
    function failed() { entry.status = "error"; renderFiles(); }
    if (isPdf) {
      if (!window.pdfjsLib) { failed(); return Promise.resolve(); }
      return file.arrayBuffer().then(function (buf) {
        /* PDF.js puede quedarse con los bytes: se le pasa una copia */
        return X.pdfToText(window.pdfjsLib, new Uint8Array(buf.slice(0))).then(function (text) {
          if (!OCR || !wantsOcr(text) || !ocrReady()) { finishFile(entry, text); return; }
          entry.ocr = true;
          ocrStep(entry, "Leyendo con OCR…");
          return OCR.readPdf(window.pdfjsLib, new Uint8Array(buf), function (i, n) {
            ocrStep(entry, n > 1 ? "Leyendo con OCR… página " + i + " de " + n : "Leyendo con OCR…");
          }).then(function (r) {
            entry.ocrPages = r.pages; entry.ocrTotal = r.total;
            finishFile(entry, r.text, ocrStatus(r.text, "scanned"));
          });
        });
      }).catch(failed);
    }
    if (isText) {
      return file.text().then(function (text) { finishFile(entry, text); }).catch(failed);
    }
    if (isImage && ocrReady()) {
      entry.ocr = true;
      ocrStep(entry, "Leyendo con OCR…");
      return OCR.readImage(file).then(function (text) {
        var status = ocrStatus(text, "image");
        if (X.detect(text, file.name) !== "oc_quote") { finishFile(entry, text, status); return; }
        /* una cotización de HealthSherpa se lee otra vez con la posición de
           cada palabra: así se separan las tarjetas, las columnas y los filtros */
        ocrStep(entry, "Leyendo los planes…");
        return OCR.readImage(file, { words: true }).then(function (words) {
          finishFile(entry, text, status, words);
        }, function () { finishFile(entry, text, status); });
      }).catch(failed);
    }
    entry.other = !isImage;
    finishFile(entry, "", "image");
    return Promise.resolve();
  }

  function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) { return; }
    if (currentView !== "nota") { setView("nota"); }
    var before = S.files.length;
    files.reduce(function (p, f) { return p.then(function () { return readFile(f); }); }, Promise.resolve())
      .then(function () {
        var added = S.files.slice(before);
        var total = added.reduce(function (s, f) { return s + (f.applied || 0); }, 0);
        var viaOcr = added.some(function (f) { return f.ocr && f.applied; });
        var held = added.filter(function (f) { return f.held; });
        S.dirty = true;
        renderPicker(); syncInputs(); renderNetwork(); refresh();
        if (held.length) {
          toast((held.length === 1 ? held[0].name + " no coincide" : held.length + " documentos no coinciden") +
                " con el caso y no se usaron. Revisa el aviso en la lista de documentos.");
          return;
        }
        toast(total ? "Se llenaron " + total + (total === 1 ? " campo" : " campos") + (viaOcr ? " con OCR. Revísalos con cuidado" : ". Revísalos") + " antes de copiar."
                    : "No se encontraron datos en " + (added.length === 1 ? "el documento" : "los documentos") + ".");
      });
  }

  /* --------------------------------------------------------------- tasks */

  var TK = {
    owner: "", ownerTouched: false, fecha: U.today(), hora: "09:00",
    pago: "", flags: {}, free: "", metodo: "TEXT", intento: "1", docFecha: "", taxYear: "", q: ""
  };

  function tkTags() {
    var tags = [];
    C.TASK_TAGS.forEach(function (t) {
      if (t.group === "pago" ? TK.pago === t.v : TK.flags[t.v]) { tags.push(t.v); }
    });
    if (U.collapse(TK.free)) { tags.push(TK.free); }
    return tags;
  }

  function tkText(T) {
    return N.formatTask(T, {
      owner: TK.owner, fecha: TK.fecha, hora: TK.hora, metodo: TK.metodo, intento: TK.intento,
      docFecha: TK.docFecha, taxYear: TK.taxYear, tags: tkTags()
    });
  }

  /* Resalta lo que el agente personalizó: iniciales, fecha, hora y etiquetas. */
  function tkPieces(T, text) {
    var m;
    if (!T.plain) {
      m = text.match(/^(\S+)(: .* - VER NOTA )(\S+)( \()([^)]+)(\))(.*)$/);
      if (m) {
        var out = [[m[1], "v"], [m[2]], [m[3], "v"], [m[4]], [m[5], "v"], [m[6]]];
        if (m[7]) { out.push([" "]); out.push([m[7].trim(), "t"]); }
        return out;
      }
    } else if (!T.noOwner) {
      m = text.match(/^(\S+)(: .*)$/);
      if (m) { return [[m[1], "v"], [m[2]]]; }
    }
    return [[text]];
  }

  function fold(s) { return U.stripAccents(String(s || "")).toLowerCase(); }

  function renderTaskList() {
    var list = $("tkList"), jump = $("tkJump");
    list.textContent = ""; jump.textContent = "";
    var q = fold(TK.q).trim(), cats = [], shown = 0;
    C.TASKS.forEach(function (T) { if (cats.indexOf(T.cat) < 0) { cats.push(T.cat); } });

    cats.forEach(function (cat, ci) {
      var rows = C.TASKS.filter(function (T) { return T.cat === cat; }).map(function (T) {
        return { T: T, text: tkText(T) };
      }).filter(function (r) {
        return !q || fold(r.text + " " + r.T.hint + " " + cat).indexOf(q) >= 0;
      });
      if (!rows.length) { return; }
      shown += rows.length;

      var sec = el("section", "tk-cat");
      sec.id = "tkcat-" + ci;
      sec.appendChild(el("h2", null, cat));
      var box = el("div", "card tk-rows");
      rows.forEach(function (r) {
        var b = el("button", "tk-row");
        b.type = "button"; b.dataset.text = r.text;
        var code = el("code", "tk-text");
        tkPieces(r.T, r.text).forEach(function (p) {
          if (p[1]) { code.appendChild(el("b", p[1], p[0])); } else { code.appendChild(document.createTextNode(p[0])); }
        });
        b.appendChild(code);
        b.appendChild(el("span", "tk-hint", r.T.hint || ""));
        b.appendChild(el("span", "tk-copy", "Copiar"));
        box.appendChild(b);
      });
      sec.appendChild(box);
      list.appendChild(sec);

      var j = el("button", "chip", cat);
      j.type = "button"; j.dataset.jump = sec.id;
      jump.appendChild(j);
    });
    $("tkEmpty").hidden = shown > 0;
  }

  function renderTaskControls() {
    var me = memberByName(settings.autor);
    if (!TK.ownerTouched) { TK.owner = me ? me.ini : ""; }
    var set = function (id, v) { var c = $(id); if (document.activeElement !== c) { c.value = v; } };
    set("tkOwner", TK.owner); set("tkFecha", TK.fecha); set("tkHora", U.timeLabel(TK.hora));
    set("tkIntento", TK.intento); set("tkDocFecha", TK.docFecha); set("tkTaxYear", TK.taxYear);
    $("tkTaxYear").placeholder = String(new Date().getFullYear());

    var dl = $("tkOwnerList"), seen = {};
    dl.textContent = "";
    settings.team.forEach(function (t) {
      if (!t.ini || seen[t.ini]) { return; }
      seen[t.ini] = true;
      var o = el("option"); o.value = t.ini; o.label = t.name; dl.appendChild(o);
    });

    var tags = $("tkTags");
    tags.textContent = "";
    C.TASK_TAGS.forEach(function (t) {
      var on = t.group === "pago" ? TK.pago === t.v : !!TK.flags[t.v];
      var b = el("button", "chip" + (on ? " on" : ""), t.v);
      b.type = "button"; b.dataset.tag = t.v; b.title = t.hint;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      tags.appendChild(b);
    });

    var seg = $("tkMetodo");
    if (!seg.children.length) { fillSeg(seg, ["TEXT", "EMAIL", "LETTER"].map(function (v) { return { v: v, l: v }; })); }
    syncSeg(seg, TK.metodo);

    var rules = $("tkRules");
    if (!rules.children.length) { C.TASK_RULES.forEach(function (r) { rules.appendChild(el("li", null, r)); }); }
  }

  function renderTasks() { renderTaskControls(); renderTaskList(); }

  function bindTasks() {
    function field(id, key, norm) {
      $(id).addEventListener("input", function () { TK[key] = this.value; if (key === "owner") { TK.ownerTouched = true; TK.owner = this.value.toUpperCase(); } renderTaskList(); });
      if (norm) {
        $(id).addEventListener("change", function () {
          var v = U.collapse(this.value) ? norm(this.value) : "";
          this.closest(".mini").classList.toggle("bad", !!U.collapse(this.value) && !v);
          if (v || !U.collapse(this.value)) { this.value = v; TK[key] = v; renderTaskList(); }
        });
      }
    }
    field("tkOwner", "owner");
    field("tkFecha", "fecha", U.parseDate);
    var tkh = $("tkHora"), parent = tkh.parentNode, next = tkh.nextSibling;
    parent.insertBefore(slotPicker(tkh, function () { return TK.hora; }, function (v) { TK.hora = v; renderTaskList(); }), next);
    field("tkDocFecha", "docFecha", U.parseDate);
    field("tkIntento", "intento");
    field("tkTaxYear", "taxYear");
    field("tkTagFree", "free");
    field("tkSearch", "q");

    $("tkTags").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tag]");
      if (!b) { return; }
      var tag = C.TASK_TAGS.filter(function (t) { return t.v === b.dataset.tag; })[0];
      if (tag.group === "pago") { TK.pago = TK.pago === tag.v ? "" : tag.v; }
      else { TK.flags[tag.v] = !TK.flags[tag.v]; }
      renderTasks();
    });
    $("tkMetodo").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) { TK.metodo = b.dataset.v; renderTasks(); }
    });
    $("tkJump").addEventListener("click", function (e) {
      var b = e.target.closest("[data-jump]");
      if (b) { $(b.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    $("tkList").addEventListener("click", function (e) {
      var row = e.target.closest(".tk-row");
      if (!row) { return; }
      copyText(row.dataset.text, function () {
        var label = row.querySelector(".tk-copy");
        row.classList.add("copied"); label.textContent = "Copiado ✓";
        setTimeout(function () { row.classList.remove("copied"); label.textContent = "Copiar"; }, 1500);
      });
    });
  }

  /* -------------------------------------------------------------- vistas */

  var currentView = "nota";

  function setView(name) {
    currentView = name === "tasks" ? "tasks" : "nota";
    $("view-nota").hidden = currentView !== "nota";
    $("view-tasks").hidden = currentView !== "tasks";
    document.body.dataset.view = currentView;
    each(document.querySelectorAll(".views a"), function (a) {
      if (a.dataset.view === currentView) { a.setAttribute("aria-current", "page"); } else { a.removeAttribute("aria-current"); }
    });
    if (currentView === "tasks") { renderTasks(); } else { markRail(); }
    window.scrollTo(0, 0);
  }

  function viewFromHash() { return location.hash.replace(/^#/, "") === "tasks" ? "tasks" : "nota"; }

  /* -------------------------------------------------------------- ajustes */

  function renderAuthor() {
    var sel = $("autor");
    sel.textContent = "";
    var ph = el("option", null, "Elige tu nombre"); ph.value = ""; sel.appendChild(ph);
    settings.team.forEach(function (t) {
      if (!t.name) { return; }
      var o = el("option", null, t.name + (t.ini ? " · " + t.ini : "")); o.value = t.name; sel.appendChild(o);
    });
    var add = el("option", null, "Agregar o editar…"); add.value = "__edit"; sel.appendChild(add);
    sel.value = memberByName(settings.autor) ? memberByName(settings.autor).name : "";
    renderOffice();
  }

  /* La oficina se elige arriba, sin abrir Ajustes: cambia el nombre del SMS,
     el teléfono de la oficina y el Consent que se llena. */
  function renderOffice() {
    var sel = $("oficinaTop");
    if (!sel.options.length) {
      C.OFFICES.forEach(function (o) { var op = el("option", null, o); op.value = o; sel.appendChild(op); });
    }
    sel.value = settings.oficina;
  }
  function setOffice(v) {
    if (C.OFFICES.indexOf(v) < 0 || v === settings.oficina) { renderOffice(); return; }
    settings.oficina = v; saveSettings();
    renderOffice();
    syncSeg($("officeSeg"), v);
    $("officeTel").value = settings.telefonos[v] || "";
    refresh();
  }

  /* Por defecto, quien hace la nota es el agente escritor (si tiene NPN) y
     también quien procesó la aplicación. */
  function defaultPeople() {
    var me = memberByName(settings.autor);
    /* por defecto, quien escribe habló con el cliente, procesó la app y,
       si tiene NPN, es el agente */
    ["talker", "colaborador"].forEach(function (k) {
      if (!S.f[k] || S.auto[k] === "calc") { S.f[k] = me ? me.name : ""; S.auto[k] = "calc"; }
      if (S.f[k] && !memberByName(S.f[k])) { S.f[k] = ""; }
    });
    if (!S.f.npnAgente || S.auto.npnAgente === "calc") {
      S.f.npnAgente = me && me.npn ? me.name : ""; S.auto.npnAgente = "calc";
    }
    if (S.f.npnAgente && S.f.npnAgente !== "__extra" && !memberByName(S.f.npnAgente)) { S.f.npnAgente = ""; }
  }

  var TEAM_COLS = [["name", "Nombre completo", "Nombre"], ["ini", "XX", "Notas"], ["agentIni", "Igual", "Agente"], ["npn", "Opcional", "NPN"],
    ["tel", "(305) 555-0100", "Directo"]];

  function renderTeam() {
    var box = $("teamRows");
    box.textContent = "";
    $("teamEmpty").hidden = settings.team.length > 0;
    box.hidden = !settings.team.length;
    var head = el("div", "team-row team-head");
    TEAM_COLS.forEach(function (c) { head.appendChild(el("span", null, c[2])); });
    head.appendChild(el("span", null, "Agencia"));
    head.appendChild(el("span"));
    box.appendChild(head);
    settings.team.forEach(function (t, i) {
      var row = el("div", "team-row");
      TEAM_COLS.forEach(function (c) {
        var inp = el("input"); inp.type = "text"; inp.value = t[c[0]] || ""; inp.placeholder = c[1];
        inp.dataset.team = i; inp.dataset.col = c[0];
        if (c[0] === "ini" || c[0] === "agentIni") { inp.maxLength = 3; inp.classList.add("upper"); }
        if (c[0] === "tel") { inp.inputMode = "tel"; }
        inp.setAttribute("aria-label", c[2] + " de " + (t.name || "la persona nueva"));
        row.appendChild(inp);
      });
      /* la agencia del agente: cuando su NPN se usa, el Consent y los
         mensajes salen de esa agencia */
      var ag = el("select");
      fillSelect(ag, [{ v: "", l: "La de arriba" }].concat(C.OFFICES.map(function (o) { return { v: o, l: o }; })));
      ag.value = C.OFFICES.indexOf(t.oficina) >= 0 ? t.oficina : "";
      ag.dataset.team = i; ag.dataset.col = "oficina";
      ag.title = "Cuando se usa el NPN de esta persona, el Consent, el SMS y el email son de esta agencia";
      ag.setAttribute("aria-label", "Agencia de " + (t.name || "la persona nueva"));
      row.appendChild(ag);
      var x = el("button", "icon-btn tiny", "✕");
      x.type = "button"; x.dataset.teamRemove = i; x.setAttribute("aria-label", "Quitar a " + (t.name || "esta persona"));
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  function installHelp() {
    var standalone = window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches;
    if (standalone) { return "La herramienta ya está instalada como aplicación en esta computadora."; }
    if (location.protocol === "file:") {
      return "Abierta como archivo. Si la instalaste con Instalar.bat, para actualizarla abre «Actualizar Q Agency Toolbox» en el Escritorio o en el menú Inicio: solo instala algo cuando hay una versión nueva. Si es el archivo suelto, ejecuta Instalar.bat del paquete de Windows para tenerla como aplicación, con su ícono y el actualizador.";
    }
    if (deferredInstall) { return "Pulsa «Instalar», arriba a la derecha, para tenerla como aplicación con su propio ícono. Funciona también sin internet."; }
    return "En el menú del navegador elige «Instalar Q Agency Toolbox» (o «Instalar página como aplicación»). Queda con su propio ícono y funciona sin internet.";
  }

  function openSettings() {
    renderTeam();
    var seg = $("officeSeg");
    fillSeg(seg, C.OFFICES.map(function (o) { return { v: o, l: o }; }));
    syncSeg(seg, settings.oficina);
    $("officeTel").value = settings.telefonos[settings.oficina] || "";
    $("optRojo").checked = settings.botonRojo;
    $("optAcentos").checked = settings.sinAcentos;
    renderSignLinks();
    $("installHelp").textContent = installHelp();
    $("versionTag").textContent = "Versión " + C.VERSION;
    $("dlgSettings").showModal();
  }

  function applyTheme() {
    if (settings.theme) { document.documentElement.setAttribute("data-theme", settings.theme); }
    else { document.documentElement.removeAttribute("data-theme"); }
  }

  /* ---------------------------------------------------------- instalación */

  var deferredInstall = null;

  function setupInstall() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredInstall = e;
      $("btnInstall").hidden = false;
    });
    window.addEventListener("appinstalled", function () {
      deferredInstall = null;
      $("btnInstall").hidden = true;
      toast("Instalada. Búscala en el menú de inicio y fíjala a la barra de tareas.");
    });
    $("btnInstall").addEventListener("click", function () {
      if (!deferredInstall) { return; }
      deferredInstall.prompt();
      deferredInstall = null;
      $("btnInstall").hidden = true;
    });

    /* Copia local para que abra sin internet (solo cuando está publicada). */
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register("sw.js").catch(function () { /* sin copia local: sigue funcionando en línea */ });
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (hadController) { $("updateBar").hidden = false; }
        hadController = true;
      });
    }
    $("btnReload").addEventListener("click", function () { location.reload(); });
    $("btnUpdateClose").addEventListener("click", function () { $("updateBar").hidden = true; });
    checkForUpdate();
  }

  /* Instalada con el paquete de Windows (abierta como archivo): pregunta a
     GitHub el número de la última versión y, si hay una más nueva, avisa que
     se use el acceso directo «Actualizar». La petición no lleva datos de
     clientes ni de quien la usa, y la política de seguridad de la página solo
     deja salir esta. Sin internet no pasa nada. */
  function checkForUpdate() {
    if (location.protocol !== "file:" || !window.fetch) { return; }
    fetch(C.UPDATE_URL, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (pkg) {
        var v = pkg && typeof pkg.version === "string" ? pkg.version : "";
        if (!U.newerVersion(v, C.VERSION)) { return; }
        $("updateText").textContent = "Hay una versión nueva (" + v + "). Cierra la herramienta y abre «Actualizar Q Agency Toolbox» en el Escritorio o en el menú Inicio.";
        $("btnReload").hidden = true;
        $("btnUpdateClose").hidden = false;
        $("updateBar").hidden = false;
      })
      .catch(function () { /* sin internet o GitHub no responde: se sigue igual */ });
  }

  /* -------------------------------------------------------------- eventos */

  function normalize(F, ctl) {
    var raw = ctl.value, out = raw, bad = false;
    if (!U.collapse(raw)) { out = ""; }
    else if (F.type === "money") { out = U.parseMoney(raw); bad = !out; }
    else if (F.type === "date") { out = U.parseDate(raw); bad = !out; }
    else if (F.type === "int") { out = raw.replace(/[^\d]/g, ""); }
    else if (F.upper && F.type !== "area") { out = U.collapse(raw).toUpperCase(); }
    else if (F.type !== "area") { out = U.collapse(raw); }
    ctl.closest(".fld").classList.toggle("bad", bad);
    if (!bad) { ctl.value = out; S.f[key(F)] = out; }
  }

  function touched(k) {
    delete S.auto[k]; delete S.rank[k];
    S.chosen[k] = true;
    S.dirty = true;
  }

  function bind() {
    var form = $("form");

    form.addEventListener("input", function (e) {
      var t = e.target;
      if (t.dataset.net) {
        S.f.net[t.dataset.net] = t.checked; S.dirty = true;
        if (t.dataset.net === "eligibility") { renderDocs(); }
        refresh(); return;
      }
      if (t.dataset.list) {
        /* los selectores y casillas de las listas se aplican al momento;
           el texto, al salir del campo */
        listInput(t, t.tagName === "SELECT" || t.type === "checkbox");
        return;
      }
      var k = (t.id || "").replace(/^f_/, "");
      var F = FIELD[k];
      if (!F || F.type === "slot") { return; }
      S.f[key(F)] = F.type === "check" ? t.checked : t.value;
      touched(key(F));
      if (k === "talker" || k === "colaborador") { S.f.prefijo = ""; }
      if (key(F) === "companiaSel" || k === "bcbsEstado") { chooseCarrier(); }
      if (k === "nombres" || k === "apellidos") { updatePeopleSummary(); }
      if (k === "nombres" || k === "apellidos" || k === "companiaC" || k === "compania") { syncInputsLight(); }
      refresh();
    });

    form.addEventListener("change", function (e) {
      var t = e.target;
      if (t.dataset.list && t.tagName === "INPUT" && t.type !== "checkbox") { listInput(t, true); return; }
      var k = (t.id || "").replace(/^f_/, "");
      var F = FIELD[k];
      if (!F || F.type === "check" || F.type === "select" || F.type === "slot") { return; }
      normalize(F, t);
      refresh();
    });

    form.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) { return; }
      if (b.dataset.act) { listAction(b); return; }
      var seg = b.closest("[data-seg]");
      if (seg) {
        var F = FIELD[seg.dataset.seg], k = key(F);
        S.f[k] = (F.clearable && S.f[k] === b.dataset.v) ? "" : b.dataset.v;
        touched(k);
        syncSeg(seg, S.f[k]);
        /* el mismo dato puede tener dos controles (p. ej. en Cancelación) */
        each($("form").querySelectorAll("[data-seg]"), function (o) { var G = FIELD[o.dataset.seg]; if (o !== seg && key(G) === k) { syncSeg(o, S.f[k]); } });
        /* CANCELLED o TERMINATED cambia el documento del Network */
        if (k === "tipoCancel") { renderNetwork(); }
        refresh();
        return;
      }
      if (b.dataset.saveFile) { saveToNetwork([b.dataset.saveFile], b); return; }
      if (b.id === "netSaveAll") { saveToNetwork(savableKeys(), b); return; }
      if (b.dataset.copyFile) {
        var k2 = b.dataset.copyFile;
        copyText($("netGrid").querySelector('[data-file-for="' + k2 + '"]').textContent, function () { flashButton(b); });
        S.f.net[k2] = true;
        $("netGrid").querySelector('[data-net="' + k2 + '"]').checked = true;
        S.dirty = true;
        refresh();
        return;
      }
      if (b.dataset.quick) {
        var Fq = FIELD[b.dataset.quick];
        S.f[Fq.k] = Fq.quick[+b.dataset.i].fn();
        $("f_" + Fq.k).value = S.f[Fq.k];
        $("f_" + Fq.k).closest(".fld").classList.remove("bad");
        touched(Fq.k);
        refresh();
      }
    });

    form.addEventListener("submit", function (e) { e.preventDefault(); });

    $("lineSeg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-line]");
      if (b) { setLine(b.dataset.line); }
    });
    $("outcomes").addEventListener("click", function (e) {
      var b = e.target.closest("[data-outcome]");
      if (b) { setOutcome(b.dataset.outcome); }
    });

    /* carril de secciones */
    $("rail").addEventListener("click", function (e) {
      var b = e.target.closest("[data-target]");
      if (b) { $(b.dataset.target).scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking || currentView !== "nota") { return; }
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; markRail(); });
    }, { passive: true });

    /* salidas editables */
    Object.keys(OUT).forEach(function (key) {
      $(OUT[key]).addEventListener("input", function () {
        /* el task y el reporte son de una sola línea aunque se muestren en dos */
        if ((key === "task" || key === "report") && /\n/.test(this.value)) { this.value = this.value.replace(/\s*\n\s*/g, " "); }
        S.edited[key] = this.value !== generated[key];
        refresh();
      });
      $(key + "Regen").addEventListener("click", function () { S.edited[key] = false; refresh(); });
    });
    $("copyNote").addEventListener("click", function () { copyOut("note", this); });
    $("copyTask").addEventListener("click", function () { copyOut("task", this); });
    $("copyReport").addEventListener("click", function () { copyOut("report", this); });
    $("copySms").addEventListener("click", function () { copyOut("sms", this); });
    $("copyEmail1").addEventListener("click", function () { copyOut("email1", this); });
    $("copyEmail2").addEventListener("click", function () { copyOut("email2", this); });
    each(document.querySelectorAll("[data-lang-seg]"), function (seg) {
      fillSeg(seg, [{ v: "es", l: "Español" }, { v: "en", l: "English" }]);
      seg.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-v]");
        if (!b || S.f.idioma === b.dataset.v) { return; }
        S.f.idioma = b.dataset.v;
        S.edited.sms = false; S.edited.email1 = false; S.edited.email2 = false;
        refresh();
      });
    });
    /* copiar siguiente, ventana flotante y abrir en el teléfono o el correo */
    $("copyNext").addEventListener("click", function () { copyNext(this); });
    $("btnFloat").hidden = !("documentPictureInPicture" in window);
    $("btnFloat").addEventListener("click", openFloat);
    $("smsOpen").addEventListener("click", function () { this.href = N.smsLink(S.f.clienteTel, $("sms").value); });
    $("emailOpen").addEventListener("click", function () {
      var body = $("email1").value + ($("emailPart2").hidden ? "" : "\n\n" + $("email2").value);
      this.href = N.mailtoLink(S.f.clienteEmail, body);
    });
    $("dock").addEventListener("click", function (e) {
      var b = e.target.closest("[data-copy]");
      if (b) { copyOut(b.dataset.copy, b); }
    });

    /* Consent y SOA para firmar */
    $("signGrid").addEventListener("input", function (e) {
      var k = e.target.dataset.signK;
      if (!k || !signKind) { return; }
      (S.signEdits[signKind] = S.signEdits[signKind] || {})[k] = e.target.value;
      S.dirty = true;
      renderSign(data());
    });
    $("signReset").addEventListener("click", function () { delete S.signEdits[signKind]; renderSign(data()); });
    $("signDownload").addEventListener("click", function () { downloadSign(this); });
    $("sheetPrint").addEventListener("click", printSheet);
    $("sheetSave").addEventListener("click", saveSheet);
    window.addEventListener("resize", fitSheet);
    [["copySignCliq", "signCliq"], ["copySignUrl", "signUrl"], ["copySignSms", "signSms"], ["copySignEmail", "signEmail"]].forEach(function (p) {
      $(p[0]).addEventListener("click", function () {
        var btn = this, text = $(p[1]).value;
        if (text.trim()) { copyText(text, function () { flashButton(btn); }); }
      });
    });
    $("signSmsOpen").addEventListener("click", function () {
      this.href = N.smsLink(signKind === "soa" ? $("sg_beneficiaryPhone").value : S.f.clienteTel, $("signSms").value);
    });
    $("signEmailOpen").addEventListener("click", function () { this.href = N.mailtoLink(S.f.clienteEmail, $("signEmail").value); });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter" && currentView === "nota") { e.preventDefault(); copyNext($("copyNext")); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && currentView === "nota") { e.preventDefault(); copyOut("note", $("copyNote")); }
    });

    /* opciones del task y del reporte */
    $("taskId").addEventListener("change", function () { S.f.taskId = this.value; S.edited.task = false; refresh(); });
    $("taskOwner").addEventListener("change", function () { S.f.taskOwner = this.value; S.edited.task = false; refresh(); });
    /* etiquetas al final: se pueden elegir varias (CRONIC URGENT) */
    C.OBS_TAGS.forEach(function (v) {
      var b = el("button", null, v);
      b.type = "button"; b.dataset.v = v; b.setAttribute("aria-pressed", "false");
      $("obsTags").appendChild(b);
    });
    $("obsTags").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-v]");
      if (!b) { return; }
      var list = (S.f.obsTags || []).slice(), i = list.indexOf(b.dataset.v);
      if (i >= 0) { list.splice(i, 1); } else { list.push(b.dataset.v); }
      S.f.obsTags = list; S.edited.task = false;
      refresh();
    });
    $("taxYear").addEventListener("input", function () { S.f.taxYear = this.value.replace(/[^\d]/g, ""); refresh(); });
    $("review").addEventListener("change", function () { S.f.review = this.checked; refresh(); });
    $("prefix").addEventListener("change", function () { S.f.prefijo = this.checked ? "si" : "no"; S.edited.report = false; refresh(); });

    $("btnReviewed").addEventListener("click", function () {
      Object.keys(S.auto).forEach(function (k) { if (S.auto[k] === true) { delete S.auto[k]; } });
      confirmReviewed("");
    });

    /* nueva nota */
    $("btnNew").addEventListener("click", function () {
      if (hasClientData() && S.dirty && !window.confirm("La nota actual no se ha copiado. ¿Empezar una nueva?")) { return; }
      S.f = freshFields(); S.auto = {}; S.rank = {}; S.base = {}; S.files = []; S.signEdits = {}; S.horaFrom = ""; S.chosen = {};
      $("taskId").dataset.line = "";
      S.edited = freshEdited(); S.dirty = false;
      S.outcome = L().outcomes[0].id;
      afterOutcomeChange(); defaultPeople();
      each(form.querySelectorAll(".bad"), function (x) { x.classList.remove("bad"); });
      renderFiles(); renderPicker(); syncInputs(); refresh();
      window.scrollTo(0, 0);
    });

    /* archivos */
    var input = $("fileInput"), depth = 0, veil = $("dropveil");
    $("btnBrowse").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { handleFiles(this.files); this.value = ""; });
    function isFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
    window.addEventListener("dragenter", function (e) { if (isFiles(e)) { depth++; veil.hidden = false; } });
    window.addEventListener("dragleave", function (e) { if (isFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) { veil.hidden = true; } } });
    /* soltar en cualquier parte cuenta; así el navegador no abre el PDF */
    window.addEventListener("dragover", function (e) { if (isFiles(e)) { e.preventDefault(); } });
    window.addEventListener("drop", function (e) {
      if (!isFiles(e)) { return; }
      e.preventDefault(); depth = 0; veil.hidden = true;
      handleFiles(e.dataTransfer.files);
    });
    /* una captura pegada con Ctrl + V en la vista de la nota se lee con OCR */
    document.addEventListener("paste", function (e) {
      if (currentView !== "nota" || !e.clipboardData || $("dlgPaste").open) { return; }
      /* Excel y otras apps copian el texto junto con una imagen: en un campo
         se pega el texto, como siempre */
      var t = e.target, editable = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (editable && Array.prototype.indexOf.call(e.clipboardData.types || [], "text/plain") >= 0) { return; }
      var imgs = Array.prototype.filter.call(e.clipboardData.files || [], function (f) { return /^image\//i.test(f.type); });
      /* algunas herramientas de captura dejan la imagen solo como elemento
         del portapapeles, sin la lista de archivos */
      if (!imgs.length) {
        imgs = Array.prototype.filter.call(e.clipboardData.items || [], function (it) { return it.kind === "file" && /^image\//i.test(it.type); })
          .map(function (it) { return it.getAsFile(); }).filter(Boolean);
      }
      if (!imgs.length) { return; }
      e.preventDefault();
      handleFiles(imgs.map(function (f, i) {
        var ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
        var name = "Captura pegada" + (imgs.length > 1 ? " " + (i + 1) : "") + "." + ext;
        try { return new File([f], name, { type: f.type }); } catch (err) { return f; }
      }));
    });
    $("files").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) { return; }
      if (b.dataset.remove != null) {
        var gone = S.files[+b.dataset.remove];
        removeFile(gone);
        afterFilesChanged();
        toast("Se quitó " + gone.name + " y lo que había llenado.");
      }
      if (b.dataset.force != null) {
        var f = S.files[+b.dataset.force];
        f.force = true; useFile(f);
        afterFilesChanged();
        toast(f.applied ? "Se usó " + f.name + ": " + f.applied + (f.applied === 1 ? " dato" : " datos") + ". Revísalos." : "El documento no trajo datos nuevos.");
      }
      if (b.dataset.view != null) { openPaste(S.files[+b.dataset.view]); }
    });

    /* pegar texto */
    $("btnPaste").addEventListener("click", function () { openPaste(null); });
    $("pasteGo").addEventListener("click", function () {
      var text = $("pasteText").value;
      if (text.replace(/\s/g, "").length < 40) { toast("Pega primero el texto del documento."); return; }
      var entry = { name: pasteSource ? pasteSource.name : "Texto pegado", status: "reading", applied: 0 };
      /* el texto pegado reemplaza al archivo: primero se deshace lo que llenó */
      if (pasteSource) { removeFile(pasteSource); }
      stampHora();
      S.files.push(entry);
      finishFile(entry, text);
      $("dlgPaste").close();
      S.dirty = true;
      renderPicker(); syncInputs(); refresh();
      toast(entry.applied ? "Se llenaron " + entry.applied + " campos. Revísalos antes de copiar." : "No se encontraron datos en el texto.");
    });

    /* ajustes */
    $("autor").addEventListener("change", function () {
      if (this.value === "__edit") { renderAuthor(); openSettings(); return; }
      settings.autor = this.value; saveSettings();
      defaultPeople(); syncInputs(); refresh();
      if (currentView === "tasks") { renderTasks(); }
    });
    $("btnSettings").addEventListener("click", openSettings);
    $("btnTheme").addEventListener("click", function () {
      var dark = settings.theme ? settings.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      settings.theme = dark ? "light" : "dark";
      saveSettings(); applyTheme();
    });
    $("officeSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) { return; }
      setOffice(b.dataset.v);
    });
    $("oficinaTop").addEventListener("change", function () { setOffice(this.value); });
    $("officeTel").addEventListener("input", function () {
      settings.telefonos[settings.oficina] = U.collapse(this.value);
      saveSettings();
    });
    $("signLinkRows").addEventListener("input", function (e) {
      var k = e.target.dataset.signLink;
      if (!k) { return; }
      settings.signLinks[k] = U.collapse(e.target.value);
      saveSettings();
    });
    $("teamRows").addEventListener("input", function (e) {
      var t = e.target;
      if (t.dataset.team == null) { return; }
      var row = settings.team[+t.dataset.team], col = t.dataset.col;
      var was = row.name;
      row[col] = (col === "ini" || col === "agentIni") ? t.value.toUpperCase().replace(/[^A-Z]/g, "") : U.collapse(t.value);
      if (col === "agentIni" && !row.agentIni) { delete row.agentIni; }
      if (col === "oficina" && !row.oficina) { delete row.oficina; }
      if (col === "name" && settings.autor && U.collapse(settings.autor).toLowerCase() === U.collapse(was).toLowerCase()) { settings.autor = row.name; }
      saveSettings();
    });
    $("teamRows").addEventListener("click", function (e) {
      var b = e.target.closest("[data-team-remove]");
      if (!b) { return; }
      settings.team.splice(+b.dataset.teamRemove, 1);
      saveSettings(); renderTeam();
    });
    $("teamAdd").addEventListener("click", function () {
      settings.team.push({ name: "", ini: "", npn: "" });
      renderTeam();
      var rows = $("teamRows").querySelectorAll(".team-row");
      rows[rows.length - 1].querySelector("input").focus();
    });
    /* El equipo no viene en el código (es público): se importa del archivo que
       comparte la oficina y se puede exportar para pasárselo a otra persona. */
    $("teamImport").addEventListener("click", function () { $("teamFile").click(); });
    $("teamFile").addEventListener("change", function () {
      var file = this.files && this.files[0], input = this;
      if (!file) { return; }
      file.text().then(function (text) {
        input.value = "";
        var r = U.parseTeam(text);
        if (r.error) { toast(r.error); return; }
        var current = settings.team.filter(function (t) { return t.name; });
        if (current.length && !window.confirm("¿Reemplazar el equipo de este navegador por el del archivo (" + r.team.length + " personas)?")) { return; }
        settings.team = r.team;
        saveSettings(); renderTeam();
        toast("Equipo importado: " + r.team.length + (r.team.length === 1 ? " persona." : " personas."));
      }, function () { input.value = ""; toast("No se pudo leer el archivo."); });
    });
    $("teamExport").addEventListener("click", function () {
      if (!settings.team.some(function (t) { return t.name; })) { toast("No hay nadie en el equipo para exportar."); return; }
      var a = el("a");
      a.href = URL.createObjectURL(new Blob([U.teamFile(settings.team)], { type: "application/json" }));
      a.download = "QAgency-Equipo.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
      toast("Archivo del equipo listo: QAgency-Equipo.json. Compártelo solo dentro de la oficina.");
    });
    ["optRojo", "optAcentos"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        settings.botonRojo = $("optRojo").checked;
        settings.sinAcentos = $("optAcentos").checked;
        saveSettings();
      });
    });
    $("dlgSettings").addEventListener("close", function () {
      settings.team = settings.team.filter(function (t) { return t.name; });
      settings.team.forEach(function (t) { if (!t.ini) { t.ini = U.initials(t.name); } });
      saveSettings();
      renderAuthor(); defaultPeople(); syncInputs(); refresh();
      if (currentView === "tasks") { renderTasks(); }
    });

    /* cambio de herramienta al instante, sin esperar al evento de la dirección */
    document.querySelector(".views").addEventListener("click", function (e) {
      var a = e.target.closest("a[data-view]");
      if (!a) { return; }
      e.preventDefault();
      setView(a.dataset.view);
      try { history.replaceState(null, "", "#" + a.dataset.view); } catch (err) { location.hash = a.dataset.view; }
    });
    window.addEventListener("hashchange", function () { setView(viewFromHash()); });
    window.addEventListener("beforeunload", function (e) {
      if (hasClientData() && S.dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  var pasteSource = null;
  function openPaste(source) {
    pasteSource = source;
    $("pasteTitle").textContent = source ? "Texto leído de " + source.name : "Pegar texto";
    $("pasteHelp").textContent = source
      ? "Esto es lo que se pudo leer del documento. Puedes corregirlo y volver a leerlo."
      : "Si un PDF no se deja leer, abre el documento, selecciona todo, copia y pega el texto aquí.";
    $("pasteText").value = source ? source.text : "";
    $("pasteGo").textContent = source ? "Volver a leer" : "Leer el texto";
    $("dlgPaste").showModal();
  }

  /* --------------------------------------------------------------- inicio */

  function init() {
    applyTheme();
    saveSettings();
    renderForm();
    renderAuthor();
    afterOutcomeChange();
    defaultPeople();
    renderPicker();
    syncInputs();
    bind();
    bindTasks();
    setupInstall();
    loadNetDirs();
    $("netDirBox").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) { return; }
      if (b.dataset.netDirPick) {
        pickNetDir(b.dataset.netDirPick).catch(function (err) { if (!err || err.name !== "AbortError") { toast("No se pudo usar esa carpeta."); } });
      }
      if (b.dataset.netDirClear) { clearNetDir(b.dataset.netDirClear); }
    });
    refresh();
    setView(viewFromHash());
  }

  init();
})();
