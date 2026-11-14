/* Q Agency Toolbox — pantalla.
   Mantiene un único estado (S) con los datos del caso; cada cambio vuelve a
   generar la nota, el task y el reporte. Los datos del cliente viven solo en
   memoria; en el navegador se guardan únicamente los ajustes (equipo, tema). */
(function () {
  "use strict";

  var C = window.QA.config, U = window.QA.util, N = window.QA.notes, X = window.QA.extract;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }

  /* ------------------------------------------------------------ ajustes */

  var STORE = "qa.toolbox.v1";

  function loadSettings() {
    var def = {
      autor: "", team: JSON.parse(JSON.stringify(C.TEAM)),
      incluirTask: true, botonRojo: true, sinAcentos: false, theme: "", line: "oc"
    };
    try {
      var saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && typeof saved === "object") {
        Object.keys(def).forEach(function (k) { if (saved[k] !== undefined) { def[k] = saved[k]; } });
        if (!Array.isArray(def.team) || !def.team.length) { def.team = JSON.parse(JSON.stringify(C.TEAM)); }
      }
    } catch (e) { /* almacenamiento bloqueado: se sigue con los valores por defecto */ }
    if (!C.LINES[def.line]) { def.line = "oc"; }
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

  /* ------------------------------------------------------------- estado */

  function seasonDefaults() {
    var now = new Date(), m = now.getMonth() + 1, d = now.getDate();
    var aep = (m === 10 && d >= 15) || m === 11 || (m === 12 && d <= 7);
    var maOep = m >= 1 && m <= 3;
    var oep = m === 11 || m === 12 || (m === 1 && d <= 15);
    return { periodoMC: aep ? "AEP" : (maOep ? "OEP" : "SEP"), periodo: oep ? "OEP" : "SEP" };
  }

  function freshFields() {
    var season = seasonDefaults();
    return {
      fecha: U.today(), canal: "Call", modalidad: "presencial", anio: U.defaultPlanYear(),
      codigoTipo: "Q", gestion: "", periodo: season.periodo, plataforma: "HealthCare.gov",
      periodoMC: season.periodoMC, soaEstado: "firmado", producto: "Dental",
      metodo: "TEXT", intento: "1", hora: "09:00", net: {}, taskId: "", taskOwner: ""
    };
  }

  var S = {
    line: settings.line,
    outcome: C.LINES[settings.line].outcomes[0].id,
    f: freshFields(),
    auto: {},      /* campos llenados por un documento o por un cálculo */
    rank: {},      /* prioridad del documento que llenó cada campo */
    files: [],
    edited: { note: false, task: false, report: false },
    dirty: false
  };

  function L() { return C.LINES[S.line]; }
  function O() { return N.outcomeOf({ line: S.line, outcome: S.outcome }); }

  /* --------------------------------------------------------- formulario */

  var GROUPS = [
    { id: "contacto", title: "Contacto" },
    { id: "cliente", title: "Cliente" },
    { id: "gestion", title: "Gestión" },
    { id: "plan", title: "Plan" },
    { id: "pago", title: "Pago" },
    { id: "docs", title: "Documentos que pide el Mercado" },
    { id: "seguimiento", title: "Pendiente y próximo paso" },
    { id: "agente", title: "Agente escritor" },
    { id: "network", title: "Documentos guardados en Network" }
  ];

  var SEP_OC = ["Pérdida de cobertura", "Mudanza", "Matrimonio", "Nacimiento o adopción", "Divorcio o separación",
    "Cambio de ingresos", "Nuevo estatus migratorio o ciudadanía", "Pérdida de Medicaid o CHIP", "Salida del plan del empleador"];
  var SEP_MC = ["Dual / LIS (Medicaid o Extra Help)", "Mudanza", "Pérdida de cobertura", "Plan 5 estrellas",
    "Pérdida de Medicaid", "Condición crónica (C-SNP)", "Desastre declarado (FEMA)", "Salida de plan de empleador"];
  var DOCS = ["Prueba de ingresos", "Documentos migratorios", "Prueba de ciudadanía", "Prueba de Seguro Social", "Prueba de pérdida de cobertura"];

  function quickDates() {
    return [
      { l: "Mañana", fn: function () { return U.addDays(U.today(), 1); } },
      { l: "+3 días", fn: function () { return U.addDays(U.today(), 3); } },
      { l: "+1 semana", fn: function () { return U.addDays(U.today(), 7); } },
      { l: "+2 semanas", fn: function () { return U.addDays(U.today(), 14); } },
      { l: "+1 mes", fn: function () { return U.addMonths(U.today(), 1); } }
    ];
  }

  /* k        clave en S.f
     sec      sección que debe estar activa en la situación ("" = siempre)
     lines    líneas en las que aplica (sin definir = todas)
     when     condición adicional sobre los datos
     w        ancho en la rejilla: w2, w3, full */
  var FIELDS = [
    { k: "fecha", g: "contacto", type: "date", label: "Fecha de la nota" },
    { k: "anio", g: "contacto", type: "int", label: "Año del plan", max: 4 },
    { k: "canal", g: "contacto", type: "seg", label: "Canal", w: "w2", options: C.CHANNELS },
    { k: "modalidad", g: "contacto", type: "select", label: "Modalidad de la cita", options: C.MODALIDADES,
      when: function (f) { return f.canal === "Appointment"; } },

    { k: "nombres", g: "cliente", sec: "cliente", type: "text", label: "Nombre(s)", w: "w2", upper: true, hint: "Como aparece en Zoho" },
    { k: "apellidos", g: "cliente", sec: "cliente", type: "text", label: "Apellido(s)", w: "w2", upper: true },
    { k: "codigoTipo", g: "cliente", sec: "cliente", type: "seg", label: "Código en Zoho", w: "w2",
      options: [{ v: "Q", l: "Código Q" }, { v: "New", l: "New" }, { v: "Sin Code", l: "Sin Code" }] },
    { k: "codigoQ", g: "cliente", sec: "cliente", type: "text", label: "Número Q", ph: "1234", prefix: "Q",
      when: function (f) { return f.codigoTipo === "Q"; } },
    { k: "dep", g: "cliente", sec: "cliente", type: "check", w: "full", lines: ["oc"],
      label: "Es dependiente: está dentro de la cobertura, no es el principal",
      when: function () { return O().task === "oc_cs" && !O().cancelled; } },
    { k: "miembros", g: "cliente", sec: "cliente", type: "area", label: "Miembros en cobertura", w: "w3", rows: 3, upper: true,
      lines: ["oc", "supp"], hint: "Uno por línea, empezando por el titular" },
    { k: "adicionales", g: "cliente", sec: "cliente", type: "text", label: "Miembros ±", lines: ["oc", "supp"],
      hint: "Para el reporte: +2, o -1 si se quitó" },
    { k: "hogar", g: "cliente", sec: "hogar", type: "int", label: "Tamaño del hogar", lines: ["oc"], max: 2 },
    { k: "ingreso", g: "cliente", sec: "hogar", type: "money", label: "Ingreso anual estimado", lines: ["oc"] },
    { k: "mbi", g: "cliente", sec: "medicare", type: "text", label: "Número de Medicare (MBI)", w: "w2", upper: true, lines: ["mc"] },
    { k: "medicaid", g: "cliente", sec: "medicare", type: "text", label: "ID de Medicaid", w: "w2", lines: ["mc"], hint: "Solo si tiene Medicaid" },
    { k: "parteA", g: "cliente", sec: "medicare", type: "date", label: "Parte A efectiva", lines: ["mc"] },
    { k: "parteB", g: "cliente", sec: "medicare", type: "date", label: "Parte B efectiva", lines: ["mc"] },

    { k: "gestion", g: "gestion", sec: "proceso", type: "seg", label: "Tipo de gestión", w: "w3",
      options: function () { return L().gestiones.map(function (x) { return { v: x.v, l: x.label }; }); } },
    { k: "recuperado", g: "gestion", sec: "proceso", type: "check", label: "Cliente recuperado" },
    { k: "producto", g: "gestion", sec: "proceso", type: "select", label: "Producto", lines: ["supp"],
      options: C.LINES.supp.productos.map(function (p) { return p.v; }) },
    { k: "periodo", g: "gestion", sec: "proceso", type: "seg", label: "Tipo de inscripción", lines: ["oc"], options: ["OEP", "SEP"] },
    { k: "motivoSep", g: "gestion", sec: "proceso", type: "text", label: "Motivo del SEP", w: "w2", lines: ["oc"], list: SEP_OC,
      when: function (f) { return f.periodo === "SEP"; } },
    { k: "plataforma", g: "gestion", sec: "proceso", type: "select", label: "Plataforma", lines: ["oc"],
      options: ["HealthCare.gov", "HealthSherpa", "el portal de la compañía"] },
    { k: "appId", g: "gestion", sec: "proceso", type: "text", label: "ID de aplicación", lines: ["oc"] },
    { k: "periodoMC", g: "gestion", sec: "proceso", type: "select", label: "Período de elección", lines: ["mc"],
      options: ["AEP", "OEP", "ICEP / IEP", "SEP"] },
    { k: "motivoSepMC", g: "gestion", sec: "proceso", type: "text", label: "Motivo del SEP", w: "w2", lines: ["mc"], list: SEP_MC,
      when: function (f) { return f.periodoMC === "SEP"; } },
    { k: "soaEstado", g: "gestion", sec: "proceso", type: "seg", label: "SOA", lines: ["mc"],
      options: [{ v: "firmado", l: "Firmado" }, { v: "pendiente", l: "Pendiente" }] },
    { k: "soaFecha", g: "gestion", sec: "proceso", type: "date", label: "Fecha del SOA", lines: ["mc"],
      when: function (f) { return f.soaEstado === "firmado"; } },
    { k: "anterior", g: "gestion", sec: "proceso", type: "text", label: "Plan anterior", w: "w2", lines: ["mc"],
      when: function (f) { return f.gestion === "cambio"; } },
    { k: "metodo", g: "gestion", sec: "contacto", type: "seg", label: "Se le envió", w: "w2", options: ["TEXT", "EMAIL", "LETTER"] },
    { k: "intento", g: "gestion", sec: "contacto", type: "int", label: "Intento #", max: 2 },

    { k: "compania", g: "plan", sec: "plan", type: "text", label: "Compañía", w: "w2",
      list: function () { return C.CARRIERS[S.line].map(function (c) { return c.name; }); } },
    { k: "plan", g: "plan", sec: "plan", type: "text", label: "Nombre del plan", w: "w2" },
    { k: "planId", g: "plan", sec: "plan", type: "text", label: "ID del plan", lines: ["oc"], upper: true },
    { k: "metal", g: "plan", sec: "plan", type: "select", label: "Nivel", lines: ["oc"],
      options: ["", "Bronze", "Expanded Bronze", "Silver", "Gold", "Platinum", "Catastrophic"] },
    { k: "contrato", g: "plan", sec: "plan", type: "text", label: "Contrato (H-PBP)", ph: "H1036-077", lines: ["mc"], upper: true },
    { k: "tipoPlan", g: "plan", sec: "plan", type: "text", label: "Tipo de plan", lines: ["supp"], list: ["DHMO", "DPPO", "Indemnidad", "Copago"] },
    { k: "prima", g: "plan", sec: "plan", type: "money", label: "Prima mensual", lines: ["mc", "supp"] },
    { k: "efectiva", g: "plan", sec: "plan", type: "date",
      label: function () { return S.line === "oc" ? "Cobertura desde" : "Fecha efectiva"; } },
    { k: "fin", g: "plan", sec: "plan", type: "date", label: "Cobertura hasta", lines: ["oc"] },
    { k: "poliza", g: "plan", sec: "plan", type: "text", lines: ["oc", "supp"],
      label: function () { return S.line === "oc" ? "No. de póliza" : "No. de aplicación / póliza"; } },
    { k: "primaTotal", g: "plan", sec: "costos", type: "money", label: "Prima total", lines: ["oc"] },
    { k: "subsidio", g: "plan", sec: "costos", type: "money", label: "Subsidio (APTC)", lines: ["oc"] },
    { k: "primaPagar", g: "plan", sec: "costos", type: "money", label: "Prima a pagar", lines: ["oc"] },
    { k: "deducible", g: "plan", sec: "costos", type: "money", label: "Deducible", lines: ["oc"] },
    { k: "maximo", g: "plan", sec: "costos", type: "money", label: "Máximo de bolsillo", lines: ["oc"] },
    { k: "pcp", g: "plan", sec: "plan", type: "text", label: "PCP", w: "w2", lines: ["mc"] },
    { k: "pcpId", g: "plan", sec: "plan", type: "text", label: "ID del PCP", lines: ["mc"] },
    { k: "confirmacion", g: "plan", sec: "plan", type: "text", label: "No. de confirmación", lines: ["mc"] },
    { k: "afeccion", g: "plan", sec: "plan", type: "text", label: "Afección crónica que califica", w: "w2", lines: ["mc"] },
    { k: "cmd", g: "plan", sec: "plan", type: "check", w: "w2", lines: ["mc"], label: "Condiciones médicas diversas (task CMD)",
      when: function () { return O().task === "mc_mant" && !O().cancelled; } },

    { k: "pagoEstado", g: "pago", sec: "pago", type: "seg", label: "Estado del pago", w: "full",
      options: C.PAYMENT.map(function (p) { return { v: p.v, l: p.label, t: p.hint }; }), clearable: true },
    { k: "pagoMonto", g: "pago", sec: "pago", type: "money", label: "Monto",
      when: function (f) { return f.pagoEstado === "PAYMENT" || f.pagoEstado === "NO PAYMENT"; } },
    { k: "pagoFecha", g: "pago", sec: "pago", type: "date",
      label: function () { return S.f.pagoEstado === "NO PAYMENT" ? "El cliente paga el" : "Fecha del pago"; },
      when: function (f) { return f.pagoEstado === "PAYMENT" || f.pagoEstado === "NO PAYMENT"; } },
    { k: "pagoMetodo", g: "pago", sec: "pago", type: "text", label: "Método", ph: "Tarjeta ****1234",
      hint: "Solo los últimos 4 dígitos", when: function (f) { return f.pagoEstado === "PAYMENT"; } },
    { k: "pagoConf", g: "pago", sec: "pago", type: "text", label: "No. de confirmación",
      when: function (f) { return f.pagoEstado === "PAYMENT"; } },
    { k: "autopay", g: "pago", sec: "pago", type: "seg", label: "Autopay", options: ["SI", "NO"], clearable: true,
      when: function (f) { return f.pagoEstado === "PAYMENT"; } },

    { k: "docReq", g: "docs", sec: "docsreq", type: "text", label: "Qué documentos pide", w: "w3", list: DOCS },
    { k: "docFecha", g: "docs", sec: "docsreq", type: "date", label: "Fecha tope" },

    { k: "pendiente", g: "seguimiento", type: "text", label: "Pendiente", w: "full",
      ph: function () { return O().pendiente || "Ninguno"; } },
    { k: "proximo", g: "seguimiento", type: "text", label: "Próximo paso", w: "full",
      ph: function () { return O().proximo.replace("{plataforma}", S.f.plataforma || "el Mercado"); } },
    { k: "fechaSeg", g: "seguimiento", type: "date", w: "w3", quick: quickDates(),
      label: function () { return O().id === "cita" ? "Fecha de la cita" : "Fecha de seguimiento"; } },
    { k: "hora", g: "seguimiento", type: "time", label: "Hora de referencia" },
    { k: "notas", g: "seguimiento", type: "area", label: "Observaciones", w: "full", rows: 2,
      ph: "Detalles del caso que no caben en los campos" },

    { k: "agente", g: "agente", sec: "agente", type: "text", label: "Agente escritor", w: "w2", upper: true,
      list: function () { return settings.team.filter(function (t) { return t.npn; }).map(function (t) { return t.name.toUpperCase(); }); } },
    { k: "npn", g: "agente", sec: "agente", type: "text", label: "NPN" },
    { k: "escritura", g: "agente", sec: "agente", type: "text", label: "Writing ID", lines: ["mc"] }
  ];

  var FIELD = {};
  FIELDS.forEach(function (F) { FIELD[F.k] = F; });

  function resolve(v) { return typeof v === "function" ? v() : v; }
  function optList(F) {
    return (resolve(F.options) || []).map(function (o) { return typeof o === "string" ? { v: o, l: o || "—" } : o; });
  }

  function buildSeg(F) {
    var seg = el("div", "seg");
    seg.setAttribute("role", "radiogroup");
    seg.dataset.seg = F.k;
    optList(F).forEach(function (o) {
      var b = el("button", null, o.l);
      b.type = "button"; b.dataset.v = o.v; b.setAttribute("role", "radio");
      if (o.t) { b.title = o.t; }
      seg.appendChild(b);
    });
    return seg;
  }

  function buildField(F) {
    var wrap = el("div", "fld" + (F.w ? " " + F.w : ""));
    wrap.dataset.k = F.k;
    var id = "f_" + F.k, ctl;

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
      ctl = buildSeg(F);
    } else if (F.type === "select") {
      ctl = el("select");
      optList(F).forEach(function (o) { var op = el("option", null, o.l); op.value = o.v; ctl.appendChild(op); });
    } else if (F.type === "area") {
      ctl = el("textarea"); ctl.rows = F.rows || 2;
    } else {
      ctl = el("input"); ctl.type = "text";
      if (F.type === "money") { ctl.inputMode = "decimal"; ctl.placeholder = "$0.00"; }
      if (F.type === "date") { ctl.placeholder = "MM/DD/AAAA"; }
      if (F.type === "time") { ctl.placeholder = "09:00"; }
      if (F.type === "int") { ctl.inputMode = "numeric"; if (F.max) { ctl.maxLength = F.max; } }
      if (F.list) { ctl.setAttribute("list", "dl_" + F.k); }
    }
    if (F.type !== "seg") { ctl.id = id; }
    if (F.upper) { ctl.classList.add("upper"); }
    if (F.ph && typeof F.ph === "string") { ctl.placeholder = F.ph; }

    if (F.prefix) {
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
    if (F.hint) { wrap.appendChild(el("span", "hint", F.hint)); }
    return wrap;
  }

  function renderForm() {
    var form = $("form");
    form.textContent = "";
    GROUPS.forEach(function (G) {
      var sec = el("section", "card group");
      sec.dataset.group = G.id;
      sec.appendChild(el("h3", null, G.title));
      var grid = el("div", "grid");
      FIELDS.filter(function (F) { return F.g === G.id; }).forEach(function (F) { grid.appendChild(buildField(F)); });
      if (G.id === "network") { grid.id = "netGrid"; grid.className = "checks"; }
      sec.appendChild(grid);
      form.appendChild(sec);
    });
  }

  function renderNetwork() {
    var grid = $("netGrid");
    grid.textContent = "";
    L().network.forEach(function (n) {
      var lab = el("label", "check");
      var c = el("input"); c.type = "checkbox"; c.dataset.net = n.k; c.checked = !!S.f.net[n.k];
      lab.appendChild(c); lab.appendChild(el("span", null, n.label));
      grid.appendChild(lab);
    });
  }

  function fieldVisible(F) {
    if (F.lines && F.lines.indexOf(S.line) < 0) { return false; }
    if (F.sec && O().sections.indexOf(F.sec) < 0) { return false; }
    if (F.when && !F.when(S.f)) { return false; }
    return true;
  }

  /* Muestra solo lo que aplica a la línea y a la situación elegidas. */
  function updateVisibility() {
    var form = $("form");
    FIELDS.forEach(function (F) {
      var wrap = form.querySelector('.fld[data-k="' + F.k + '"]');
      wrap.hidden = !fieldVisible(F);
      var lab = wrap.querySelector("[data-label]");
      if (lab && typeof F.label === "function") { lab.textContent = F.label(); }
      var ctl = $("f_" + F.k);
      if (ctl && typeof F.ph === "function") { ctl.placeholder = F.ph(); }
      /* el dorado es solo para lo leído de un documento, no para lo calculado */
      wrap.classList.toggle("is-auto", S.auto[F.k] === true);
    });
    var adic = $("f_adicionales");
    if (adic) { adic.placeholder = N.memberDelta(Object.assign({}, S.f, { line: S.line, adicionales: "" })) || "+0"; }
    Array.prototype.forEach.call(form.querySelectorAll(".group"), function (g) {
      var id = g.dataset.group;
      if (id === "network") { g.hidden = O().sections.indexOf("network") < 0; return; }
      g.hidden = !g.querySelector(".fld:not([hidden])");
    });
  }

  function syncSeg(seg, value) {
    Array.prototype.forEach.call(seg.querySelectorAll("button"), function (b) {
      var on = b.dataset.v === value;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  /* Vuelca el estado en los controles (tras leer un PDF, cambiar de línea…). */
  function syncInputs() {
    FIELDS.forEach(function (F) {
      var v = S.f[F.k];
      if (F.type === "seg") {
        var seg = $("form").querySelector('[data-seg="' + F.k + '"]');
        if (typeof F.options === "function") {
          var fresh = buildSeg(F);
          seg.textContent = "";
          while (fresh.firstChild) { seg.appendChild(fresh.firstChild); }
        }
        syncSeg(seg, v || "");
        return;
      }
      var ctl = $("f_" + F.k);
      if (F.type === "check") { ctl.checked = !!v; return; }
      if (document.activeElement !== ctl) { ctl.value = v == null ? "" : v; }
      if (F.list) {
        var dl = $("dl_" + F.k);
        dl.textContent = "";
        resolve(F.list).forEach(function (x) { var o = el("option"); o.value = x; dl.appendChild(o); });
      }
    });
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
    $("dropHint").textContent = hints[S.line];
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
    if (S.line === "mc") {
      if (O().id === "soa") { S.f.soaEstado = "pendiente"; S.auto.soaEstado = true; }
      else if (S.f.soaEstado === "pendiente" && S.auto.soaEstado) { S.f.soaEstado = "firmado"; delete S.auto.soaEstado; }
    }
  }

  /* ------------------------------------------------------------ salidas */

  function hasClientData() {
    return ["nombres", "apellidos", "plan", "compania", "mbi", "appId", "miembros", "notas", "pendiente", "codigoQ"]
      .some(function (k) { return U.collapse(S.f[k]); });
  }

  function isMoney(k) { return FIELD[k] && FIELD[k].type === "money"; }

  /* Valores que se deducen de otros. Nunca pisan lo que escribió el agente. */
  function derive() {
    var f = S.f;
    var total = U.moneyNumber(f.primaTotal), sub = U.moneyNumber(f.subsidio);
    if (S.line === "oc" && total !== null && sub !== null && (!U.collapse(f.primaPagar) || S.auto.primaPagar === "calc")) {
      f.primaPagar = U.parseMoney(Math.max(0, total - sub));
      S.auto.primaPagar = "calc";
      var c1 = $("f_primaPagar"); if (c1 && document.activeElement !== c1) { c1.value = f.primaPagar; }
    }
    var pay = U.moneyNumber(S.line === "oc" ? f.primaPagar : f.prima);
    if (pay === 0 && !f.pagoEstado) { f.pagoEstado = "NO PREMIUM"; S.auto.pagoEstado = "calc"; }
    else if (pay !== null && pay > 0 && f.pagoEstado === "NO PREMIUM" && S.auto.pagoEstado === "calc") { f.pagoEstado = ""; delete S.auto.pagoEstado; }
    var segPay = $("form").querySelector('[data-seg="pagoEstado"]');
    if (segPay) { syncSeg(segPay, f.pagoEstado || ""); }

    var ag = memberByName(f.agente);
    if (ag && ag.npn && (!U.collapse(f.npn) || S.auto.npn === "calc")) {
      f.npn = ag.npn; S.auto.npn = "calc";
      var c2 = $("f_npn"); if (c2 && document.activeElement !== c2) { c2.value = f.npn; }
    }
  }

  function data() {
    var d = Object.assign({}, S.f);
    d.line = S.line; d.outcome = S.outcome;
    var me = memberByName(settings.autor);
    d.ini = me ? me.ini : "";
    var ag = memberByName(S.f.agente);
    d.agenteIni = ag ? ag.ini : (U.collapse(S.f.agente) ? U.initials(S.f.agente) : d.ini);
    d.colaborador = d.ini && d.agenteIni && d.ini !== d.agenteIni ? d.ini : "";
    d.incluirTask = settings.incluirTask;
    d.botonRojo = settings.botonRojo;
    return d;
  }

  var OUT = { note: "note", task: "task", report: "report" };
  var generated = { note: "", task: "", report: "" };

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

  function refresh() {
    derive();
    updateVisibility();
    var d = data();

    var task = N.buildTask(d);
    setOut("task", task);
    if (S.edited.task) { d.taskText = $("task").value; }

    var report = N.buildReport(d);
    var reportable = !!O().report;
    $("report").hidden = !reportable;
    $("copyReport").hidden = !reportable;
    $("reportNA").hidden = reportable;
    $("dockReport").hidden = !reportable;
    setOut("report", report);

    var note = N.buildNote(d, { sinAcentos: settings.sinAcentos });
    if (S.edited.task && settings.incluirTask) {
      note = note.replace(/^Task: .*$/m, "Task: " + (settings.sinAcentos ? U.stripAccents(d.taskText) : d.taskText));
    }
    setOut("note", note);

    var shown = $("note").value;
    $("noteCount").textContent = shown.length + " caracteres";

    var warns = N.warnings(d, shown);
    var ul = $("warnings");
    ul.textContent = "";
    warns.forEach(function (w) { ul.appendChild(el("li", null, w)); });
    $("autor").classList.toggle("needs", !d.ini);

    renderTaskOptions(d);
    var desc = O().desc + ".";
    $("outcomeDesc").textContent = desc;
  }

  function renderTaskOptions(d) {
    var sel = $("taskId");
    var auto = N.taskById(N.autoTaskId(d));
    var current = S.f.taskId || "";
    sel.textContent = "";
    var first = el("option", null, "Automático");
    first.value = "";
    sel.appendChild(first);
    var groups = {};
    C.TASKS.forEach(function (t) {
      if (!groups[t.cat]) { groups[t.cat] = el("optgroup"); groups[t.cat].label = t.cat; sel.appendChild(groups[t.cat]); }
      var o = el("option", null, t.text.replace(/\{metodo\}/, "TEXT / EMAIL / LETTER").replace(/\{n\}/, "#").replace(/\{docFecha\}/, "(fecha)").replace(/\{taxYear\}/, "(año)"));
      o.value = t.id; if (t.hint) { o.title = t.hint; }
      groups[t.cat].appendChild(o);
    });
    sel.value = current;

    var owner = $("taskOwner"), cur = S.f.taskOwner || "";
    owner.textContent = "";
    var me = el("option", null, d.ini ? d.ini + " (yo)" : "—"); me.value = ""; owner.appendChild(me);
    settings.team.forEach(function (t) {
      if (!t.ini || t.ini === d.ini) { return; }
      var o = el("option", null, t.ini); o.value = t.ini; o.title = t.name; owner.appendChild(o);
    });
    owner.value = cur;
    if (owner.value !== cur) { owner.value = ""; S.f.taskOwner = ""; }

    var T = N.taskById(S.f.taskId) || auto;
    $("reviewBox").hidden = !(T && T.review);
    $("taxYearBox").hidden = !(T && T.extra === "tax");
    $("review").checked = !!S.f.review;
    if (document.activeElement !== $("obsTask")) { $("obsTask").value = S.f.obsTask || ""; }
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

  function copyText(text, btn) {
    function done() {
      if (btn) {
        var label = btn.dataset.label || btn.textContent;
        btn.dataset.label = label;
        btn.textContent = "Copiado ✓"; btn.classList.add("done");
        setTimeout(function () { btn.textContent = label; btn.classList.remove("done"); }, 1600);
      }
    }
    function fallback() {
      var ta = el("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("No se pudo copiar. Selecciona el texto y usa Ctrl + C."); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
  }

  function copyOut(key, btn) {
    var text = $(OUT[key]).value;
    if (!text.trim()) { return; }
    copyText(text, btn);
    if (key === "note") { S.dirty = false; }
  }

  /* ---------------------------------------------------------- documentos */

  var RANK = { oc_plans: 3, mc_app: 3, supp_app: 3, oc_elig: 2, pay: 2, oc_app: 1, mc_soa: 1 };

  function applyExtraction(res) {
    /* solo se cambia de línea si el documento realmente aportó datos */
    if (res.line && res.line !== S.line && res.count > 0) {
      S.line = res.line; settings.line = res.line; saveSettings();
      var same = L().outcomes.filter(function (o) { return o.id === S.outcome; })[0];
      S.outcome = same ? same.id : L().outcomes[0].id;
      S.f.gestion = ""; S.f.taskId = "";
      afterOutcomeChange();
    }
    var rank = RANK[res.type] || 0, applied = 0;
    Object.keys(res.fields).forEach(function (k) {
      var v = res.fields[k];
      var empty = S.f[k] == null || S.f[k] === "" || S.f[k] === false;
      var replaceable = S.auto[k] && (S.auto[k] === "calc" || rank > (S.rank[k] || 0));
      if (!empty && !replaceable) { return; }
      if (isMoney(k)) { v = U.parseMoney(v); }
      S.f[k] = v; S.auto[k] = true; S.rank[k] = rank; applied++;
    });
    if (res.net) { S.f.net[res.net] = true; }
    if (res.type === "mc_app" && res.fields.confirmacion) { S.f.net.confirmation = true; }
    return applied;
  }

  function fileStatusText(f) {
    if (f.status === "reading") { return "Leyendo…"; }
    if (f.status === "error") { return "No se pudo leer. Usa «Pegar texto»."; }
    if (f.status === "image") { return "Imagen: no se puede leer, llena los datos a mano"; }
    if (f.status === "scanned") { return "PDF escaneado sin texto: llena los datos a mano"; }
    if (!f.applied) { return f.res && f.res.type === "unknown" ? "No se reconoció el documento" : "Sin datos nuevos"; }
    return f.applied + (f.applied === 1 ? " dato" : " datos");
  }

  function renderFiles() {
    var ul = $("files");
    ul.textContent = "";
    S.files.forEach(function (f, i) {
      var li = el("li", "file " + f.status + (f.status === "ok" && !f.applied ? " none" : ""));
      li.appendChild(el("span", "file-type", f.res ? f.res.label : "Documento"));
      li.appendChild(el("span", "file-name", f.name));
      li.appendChild(el("span", "file-meta", fileStatusText(f)));
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

  function finishFile(entry, text, status) {
    entry.text = text || "";
    var readable = entry.text.replace(/\s/g, "").length >= 40;
    entry.res = X.extract(entry.text, entry.name, S.line);
    entry.status = status || (readable ? "ok" : "scanned");
    entry.applied = applyExtraction(entry.res);
    renderFiles();
  }

  function readFile(file) {
    var entry = { name: file.name, status: "reading", applied: 0 };
    S.files.push(entry);
    renderFiles();
    var isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
    var isText = /^text\//i.test(file.type) || /\.txt$/i.test(file.name);
    if (isPdf) {
      if (!window.pdfjsLib) { entry.status = "error"; renderFiles(); return Promise.resolve(); }
      return file.arrayBuffer()
        .then(function (buf) { return X.pdfToText(window.pdfjsLib, new Uint8Array(buf)); })
        .then(function (text) { finishFile(entry, text); })
        .catch(function () { entry.status = "error"; renderFiles(); });
    }
    if (isText) {
      return file.text().then(function (text) { finishFile(entry, text); })
        .catch(function () { entry.status = "error"; renderFiles(); });
    }
    finishFile(entry, "", "image");
    return Promise.resolve();
  }

  function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) { return; }
    var before = S.files.length;
    files.reduce(function (p, f) { return p.then(function () { return readFile(f); }); }, Promise.resolve())
      .then(function () {
        var added = S.files.slice(before);
        var total = added.reduce(function (s, f) { return s + (f.applied || 0); }, 0);
        S.dirty = true;
        renderPicker(); syncInputs(); refresh();
        toast(total ? "Se llenaron " + total + (total === 1 ? " campo" : " campos") + ". Revísalos antes de copiar."
                    : "No se encontraron datos en " + (added.length === 1 ? "el documento" : "los documentos") + ".");
      });
  }

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
  }

  /* El agente escritor por defecto es quien hace la nota, si tiene NPN. */
  function defaultAgent() {
    var me = memberByName(settings.autor);
    if (me && me.npn && (!U.collapse(S.f.agente) || S.auto.agente === "calc")) {
      S.f.agente = me.name.toUpperCase(); S.auto.agente = "calc";
      S.f.npn = me.npn; S.auto.npn = "calc";
    }
  }

  function renderTeam() {
    var box = $("teamRows");
    box.textContent = "";
    var head = el("div", "team-row team-head");
    ["Nombre", "Iniciales", "NPN", ""].forEach(function (t) { head.appendChild(el("span", null, t)); });
    box.appendChild(head);
    settings.team.forEach(function (t, i) {
      var row = el("div", "team-row");
      [["name", "Nombre completo"], ["ini", "XX"], ["npn", "Opcional"]].forEach(function (c) {
        var inp = el("input"); inp.type = "text"; inp.value = t[c[0]] || ""; inp.placeholder = c[1];
        inp.dataset.team = i; inp.dataset.col = c[0];
        if (c[0] === "ini") { inp.maxLength = 3; inp.classList.add("upper"); }
        inp.setAttribute("aria-label", c[1]);
        row.appendChild(inp);
      });
      var x = el("button", "icon-btn tiny", "✕");
      x.type = "button"; x.dataset.teamRemove = i; x.setAttribute("aria-label", "Quitar a " + (t.name || "esta persona"));
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  function openSettings() {
    renderTeam();
    $("optTask").checked = settings.incluirTask;
    $("optRojo").checked = settings.botonRojo;
    $("optAcentos").checked = settings.sinAcentos;
    $("versionTag").textContent = "Versión " + C.VERSION;
    $("dlgSettings").showModal();
  }

  function applyTheme() {
    if (settings.theme) { document.documentElement.setAttribute("data-theme", settings.theme); }
    else { document.documentElement.removeAttribute("data-theme"); }
  }

  /* -------------------------------------------------------------- eventos */

  function normalize(F, ctl) {
    var raw = ctl.value, out = raw, bad = false;
    if (!U.collapse(raw)) { out = ""; }
    else if (F.type === "money") { out = U.parseMoney(raw); bad = !out; }
    else if (F.type === "date") { out = U.parseDate(raw); bad = !out; }
    else if (F.type === "time") { out = U.parseTime(raw); bad = !out; }
    else if (F.type === "int") { out = raw.replace(/[^\d]/g, ""); }
    else if (F.upper && F.type !== "area") { out = U.collapse(raw).toUpperCase(); }
    else if (F.type !== "area") { out = U.collapse(raw); }
    ctl.closest(".fld").classList.toggle("bad", bad);
    if (!bad) { ctl.value = out; S.f[F.k] = out; }
  }

  function touched(k) {
    delete S.auto[k]; delete S.rank[k];
    S.dirty = true;
  }

  function bind() {
    var form = $("form");

    form.addEventListener("input", function (e) {
      var t = e.target;
      if (t.dataset.net) { S.f.net[t.dataset.net] = t.checked; S.dirty = true; refresh(); return; }
      var k = (t.id || "").replace(/^f_/, "");
      var F = FIELD[k];
      if (!F) { return; }
      S.f[k] = F.type === "check" ? t.checked : t.value;
      touched(k);
      refresh();
    });

    form.addEventListener("change", function (e) {
      var k = (e.target.id || "").replace(/^f_/, "");
      var F = FIELD[k];
      if (!F || F.type === "check" || F.type === "select") { return; }
      normalize(F, e.target);
      refresh();
    });

    form.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) { return; }
      var seg = b.closest("[data-seg]");
      if (seg) {
        var k = seg.dataset.seg, F = FIELD[k];
        S.f[k] = (F.clearable && S.f[k] === b.dataset.v) ? "" : b.dataset.v;
        touched(k);
        syncSeg(seg, S.f[k]);
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

    /* salidas editables */
    Object.keys(OUT).forEach(function (key) {
      $(OUT[key]).addEventListener("input", function () {
        /* el task y el reporte son de una sola línea aunque se muestren en dos */
        if (key !== "note" && /\n/.test(this.value)) { this.value = this.value.replace(/\s*\n\s*/g, " "); }
        S.edited[key] = this.value !== generated[key];
        refresh();
      });
      $(key + "Regen").addEventListener("click", function () { S.edited[key] = false; refresh(); });
    });
    $("copyNote").addEventListener("click", function () { copyOut("note", this); });
    $("copyTask").addEventListener("click", function () { copyOut("task", this); });
    $("copyReport").addEventListener("click", function () { copyOut("report", this); });
    $("dock").addEventListener("click", function (e) {
      var b = e.target.closest("[data-copy]");
      if (b) { copyOut(b.dataset.copy, b); }
    });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); copyOut("note", $("copyNote")); }
    });

    /* opciones del task */
    $("taskId").addEventListener("change", function () { S.f.taskId = this.value; S.edited.task = false; refresh(); });
    $("taskOwner").addEventListener("change", function () { S.f.taskOwner = this.value; S.edited.task = false; refresh(); });
    $("obsTask").addEventListener("input", function () { S.f.obsTask = this.value; refresh(); });
    $("taxYear").addEventListener("input", function () { S.f.taxYear = this.value.replace(/[^\d]/g, ""); refresh(); });
    $("review").addEventListener("change", function () { S.f.review = this.checked; refresh(); });

    /* nueva nota */
    $("btnNew").addEventListener("click", function () {
      if (hasClientData() && S.dirty && !window.confirm("La nota actual no se ha copiado. ¿Empezar una nueva?")) { return; }
      S.f = freshFields(); S.auto = {}; S.rank = {}; S.files = [];
      S.edited = { note: false, task: false, report: false }; S.dirty = false;
      S.outcome = L().outcomes[0].id;
      afterOutcomeChange(); defaultAgent();
      Array.prototype.forEach.call(form.querySelectorAll(".bad"), function (x) { x.classList.remove("bad"); });
      renderFiles(); renderPicker(); syncInputs(); refresh();
      window.scrollTo(0, 0);
    });

    /* archivos */
    var drop = $("drop"), input = $("fileInput"), depth = 0;
    $("btnBrowse").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { handleFiles(this.files); this.value = ""; });
    function isFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
    window.addEventListener("dragenter", function (e) { if (isFiles(e)) { depth++; drop.classList.add("over"); } });
    window.addEventListener("dragleave", function (e) { if (isFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) { drop.classList.remove("over"); } } });
    /* soltar fuera del recuadro también cuenta; así el navegador no abre el PDF */
    window.addEventListener("dragover", function (e) { if (isFiles(e)) { e.preventDefault(); } });
    window.addEventListener("drop", function (e) {
      if (!isFiles(e)) { return; }
      e.preventDefault(); depth = 0; drop.classList.remove("over");
      handleFiles(e.dataTransfer.files);
    });
    $("files").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) { return; }
      if (b.dataset.remove != null) { S.files.splice(+b.dataset.remove, 1); renderFiles(); }
      if (b.dataset.view != null) { openPaste(S.files[+b.dataset.view]); }
    });

    /* pegar texto */
    $("btnPaste").addEventListener("click", function () { openPaste(null); });
    $("pasteGo").addEventListener("click", function () {
      var text = $("pasteText").value;
      if (text.replace(/\s/g, "").length < 40) { toast("Pega primero el texto del documento."); return; }
      var entry = { name: pasteSource ? pasteSource.name : "Texto pegado", status: "reading", applied: 0 };
      if (pasteSource) { S.files.splice(S.files.indexOf(pasteSource), 1); }
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
      defaultAgent(); syncInputs(); refresh();
    });
    $("btnSettings").addEventListener("click", openSettings);
    $("btnTheme").addEventListener("click", function () {
      var dark = settings.theme ? settings.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      settings.theme = dark ? "light" : "dark";
      saveSettings(); applyTheme();
    });
    $("teamRows").addEventListener("input", function (e) {
      var t = e.target;
      if (t.dataset.team == null) { return; }
      var row = settings.team[+t.dataset.team], col = t.dataset.col;
      var was = row.name;
      row[col] = col === "ini" ? t.value.toUpperCase().replace(/[^A-Z]/g, "") : U.collapse(t.value);
      if (col === "name" && !row.ini) { row.ini = U.initials(row.name); }
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
    $("teamReset").addEventListener("click", function () {
      if (!window.confirm("¿Restaurar la lista original del equipo? Se pierden los cambios hechos aquí.")) { return; }
      settings.team = JSON.parse(JSON.stringify(C.TEAM));
      saveSettings(); renderTeam();
    });
    ["optTask", "optRojo", "optAcentos"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        settings.incluirTask = $("optTask").checked;
        settings.botonRojo = $("optRojo").checked;
        settings.sinAcentos = $("optAcentos").checked;
        saveSettings();
      });
    });
    $("dlgSettings").addEventListener("close", function () {
      settings.team = settings.team.filter(function (t) { return t.name; });
      saveSettings();
      renderAuthor(); defaultAgent(); syncInputs(); refresh();
    });

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
    renderForm();
    renderAuthor();
    afterOutcomeChange();
    defaultAgent();
    renderPicker();
    syncInputs();
    bind();
    refresh();
  }

  init();
})();
