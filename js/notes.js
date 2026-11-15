/* Q Agency Toolbox — generadores de texto.
   Cinco salidas a partir de los mismos datos:
     buildNote      nota para Zoho CRM, con la forma de PROCESS TEMPLATES
     buildTask      nombre del task (formato TASK Q AGENCY)
     buildReport    línea para el canal de Cliq (STANDARD FORMs - REPORT)
     buildSms       mensaje de texto para el cliente, con el nombre de la oficina
     buildFileNames nombres para guardar los documentos (NOMBRE DE ARCHIVOS)
   Son funciones puras: no tocan la pantalla, así que se pueden probar solas. */
(function (root) {
  "use strict";

  var C = (root.QA && root.QA.config) || require("./config.js");
  var U = (root.QA && root.QA.util) || require("./util.js");

  /* ------------------------------------------------------------ comunes -- */

  function lineOf(d) { return C.LINES[d.line] || C.LINES.oc; }

  function outcomeOf(d) {
    var L = lineOf(d);
    for (var i = 0; i < L.outcomes.length; i++) {
      if (L.outcomes[i].id === d.outcome) { return L.outcomes[i]; }
    }
    return L.outcomes[0];
  }

  function gestionOf(d) {
    var L = lineOf(d);
    for (var i = 0; i < L.gestiones.length; i++) {
      if (L.gestiones[i].v === d.gestion) { return L.gestiones[i]; }
    }
    return L.gestiones[0];
  }

  function productOf(d) {
    var list = C.LINES.supp.productos;
    for (var i = 0; i < list.length; i++) { if (list[i].v === d.producto) { return list[i]; } }
    return list[list.length - 1];
  }

  function taskById(id) {
    for (var i = 0; i < C.TASKS.length; i++) { if (C.TASKS[i].id === id) { return C.TASKS[i]; } }
    return null;
  }

  function has(O, section) { return O.sections.indexOf(section) >= 0; }
  function val(v) { return U.collapse(v); }
  function upper(v) { return val(v).toUpperCase(); }
  function members(d) { return U.parseList(d.miembros).map(function (x) { return x.toUpperCase(); }); }

  /* "Diaz, Beatriz": como se escriben los nombres en el reporte y los archivos */
  function zohoName(d) {
    var ap = U.titleCase(d.apellidos), no = U.titleCase(d.nombres);
    return ap && no ? ap + ", " + no : (ap || no);
  }

  function carrierShort(line, name) {
    var n = val(name);
    if (!n) { return ""; }
    var list = C.CARRIERS[line] || [];
    for (var i = 0; i < list.length; i++) { if (list[i].re.test(n)) { return list[i].short; } }
    /* sin coincidencia: el nombre tal cual, con mayúscula inicial */
    return n.length <= 5 ? n.toUpperCase() : U.titleCase(n);
  }

  /* Montos redondos sin centavos, como se escriben los ingresos: $22,590 */
  function moneyShort(v) {
    var s = U.parseMoney(v);
    return s.replace(/\.00$/, "");
  }

  /* +N miembros adicionales con cobertura (o -N si se quitaron). */
  function memberDelta(d) {
    var manual = val(d.adicionales).replace(/\s+/g, "");
    if (manual) {
      var m = manual.match(/^([+-]?)(\d{1,2})$/);
      if (!m || +m[2] === 0) { return ""; }
      return (m[1] === "-" ? "-" : "+") + (+m[2]);
    }
    if (d.line === "mc") { return ""; }
    var n = members(d).length;
    return n > 1 ? "+" + (n - 1) : "";
  }

  /* --------------------------------------------------------------- task -- */

  function autoTaskId(d) {
    var O = outcomeOf(d);
    var id = O.task;
    if (id === "oc_cs" && d.dep) { id = "oc_cs_dep"; }
    if (id === "mc_mant" && d.cmd) { id = "mc_mant_cmd"; }
    /* el seguro de vida tiene sus propios tasks */
    if (d.line === "supp" && d.producto === "Life") {
      if (O.id === "enviada") { id = "li_review"; }
      if (O.id === "cotizacion") { id = "li_pending"; }
    }
    return id;
  }

  /* Arma el nombre de un task del catálogo. `o` trae las partes variables:
     owner, fecha, hora, metodo, intento, docFecha, taxYear y tags (lista de
     etiquetas que van al final, después de la hora y sin paréntesis). */
  function formatTask(T, o) {
    o = o || {};
    var owner = upper(o.owner) || "XX";
    var text = T.text
      .replace("{metodo}", val(o.metodo) || "TEXT")
      .replace("{n}", val(o.intento) || "1")
      .replace("{docFecha}", U.taskDate(o.docFecha) || "MMM/DD/YYYY")
      .replace("{taxYear}", val(o.taxYear) || String(new Date().getFullYear()));

    if (T.plain) { return (T.noOwner ? "" : owner + ": ") + text; }

    var out = owner + ": " + text + " - VER NOTA " + (U.parseDate(o.fecha) || "MM/DD/YYYY") +
              " (" + (U.to12h(o.hora) || "09:00") + ")";
    (o.tags || []).forEach(function (t) { if (val(t)) { out += " " + upper(t); } });
    return out;
  }

  function buildTask(d) {
    var O = outcomeOf(d);
    var T = taskById(d.taskId) || taskById(autoTaskId(d));
    if (!T) { return ""; }
    var tags = [];
    if (T.extra === "payment" && has(O, "pago") && d.pagoEstado) { tags.push(d.pagoEstado); }
    if (T.review && d.review) { tags.push("REVIEW"); }
    if (val(d.obsTask)) { tags.push(d.obsTask); }
    return formatTask(T, {
      owner: d.taskOwner || d.ini, fecha: d.fecha, hora: d.hora, metodo: d.metodo, intento: d.intento,
      docFecha: d.docFecha, taxYear: d.taxYear, tags: tags
    });
  }

  /* ------------------------------------------------------------- report -- */

  function reportCode(d) {
    if (d.codigoTipo === "New") { return "New"; }
    if (d.codigoTipo === "Sin Code") { return "Sin Code"; }
    var q = upper(d.codigoQ).replace(/^Q/, "").replace(/[^0-9A-Z]/g, "");
    return "Q" + (q || "XXXX");
  }

  function reportProcess(d) {
    var O = outcomeOf(d), G = gestionOf(d);
    var proc = G.proc;
    if (d.line === "supp") { proc += " " + productOf(d).file; }
    var carrier = val(d.reportCarrier) || carrierShort(d.line, d.compania);
    var parts = [proc];
    if (carrier) { parts.push(carrier); }
    if (val(d.anio)) { parts.push(val(d.anio)); }
    var s = parts.join(" ");
    if (G.suffix) { s += G.suffix; }
    if (d.recuperado) { s += "_Recovered"; }
    if (O.cancelled) { s += "_Cancelled"; }
    return s;
  }

  function buildReport(d) {
    var O = outcomeOf(d);
    if (!O.report) { return ""; }
    var agentIni = upper(d.agenteIni || d.ini) || "XX";
    var s = reportCode(d) + " - " + (zohoName(d) || "Apellido, Nombre") + " - " + reportProcess(d) + " - " +
            (d.canal || "Call") + " (" + agentIni + ")";
    var delta = memberDelta(d);
    if (delta) { s += " " + delta; }
    /* Si la aplicación la procesó un colaborador, sus iniciales van delante. */
    var col = upper(d.reportPrefix);
    if (col) { s = col + ": " + s; }
    return s;
  }

  /* --------------------------------------------------------------- nota -- */

  function cliente(d) { return d.genero === "a" ? "la cliente" : "el cliente"; }
  /* "interesado" -> "interesada" cuando es una cliente */
  function adj(d, word) { return d.genero === "a" ? word.replace(/o$/, "a") : word; }

  var MODO_CITA = { "presencial": "en cita presencial", "telefónica": "en cita telefónica", "Zoom": "en cita por Zoom", "en casa": "en cita en su casa" };

  /* Cómo empieza una nota de conversación: "Se conversa con la cliente (02:30)".
     Entre paréntesis va la hora en que se debe revisar el task, la misma que
     lleva el task después de VER NOTA. */
  function talk(d) {
    var t = U.parseTime(d.hora) ? " (" + U.to12h(d.hora) + ")" : "";
    if (d.canal === "Appointment") { return "Se atiende a " + cliente(d) + " " + (MODO_CITA[d.modalidad] || "en cita") + t; }
    if (d.canal === "Walk In") { return "Se atiende a " + cliente(d) + " en la oficina" + t; }
    return "Se conversa con " + cliente(d) + t;
  }

  function lineLabel(d) {
    if (d.line === "mc") { return "MC"; }
    if (d.line === "supp") { return productOf(d).es || "suplementario"; }
    return "OC";
  }

  function year(d) { return val(d.anio) ? " " + val(d.anio) : ""; }

  function citaWhen(d) {
    var f = U.parseDate(d.fechaSeg), h = U.timeLabel(d.hora);
    return f ? " para el " + f + (h ? " a las " + h : "") : "";
  }

  var METODO_ES = { TEXT: "un mensaje de texto", EMAIL: "un correo electrónico", LETTER: "una carta" };

  function header(d) {
    var O = outcomeOf(d), G = gestionOf(d);
    var carrier = carrierShort(d.line, d.compania);
    var con = carrier ? " con " + carrier : "";
    var lbl = lineLabel(d), y = year(d);

    if (d.line === "oc") {
      switch (O.id) {
        case "enviada": return ({ renovacion: "Se renueva", cambio: "Se actualiza" }[G.v] || "Se procesa") + " app OC" + y + con + ".";
        case "cancelada": return "Se cancela app OC" + y + con + " a solicitud de " + cliente(d) + ".";
        case "cotizacion":
        case "consent": return talk(d) + ", nos indicó que desea cotizar con los siguientes datos:";
        case "lista": return talk(d) + ", nos indicó que desea " + { nueva: "aplicar", renovacion: "renovar", cambio: "actualizar su app" }[G.v] + " con los siguientes datos:";
        case "docs": return talk(d) + " sobre los documentos que pide el MKPL para su app OC" + y + ".";
        case "pago": return talk(d) + " sobre el pago de su plan OC" + y + con + ".";
        case "cita": return talk(d) + ", " + { nueva: "está " + adj(d, "interesado") + " en aplicar al OC", renovacion: "desea renovar su OC", cambio: "desea actualizar su app OC" }[G.v] + y + ". Se agenda cita" + citaWhen(d) + ".";
        case "nointeresado": return talk(d) + ", indica que no está " + adj(d, "interesado") + " por el momento.";
      }
    }
    if (d.line === "mc") {
      switch (O.id) {
        case "enviada": return G.v === "cambio" ? "Se procesa cambio de plan de MC" + (carrier ? " a " + carrier : "") + "." : "Se procesa app de MC" + con + ".";
        case "cancelada": return "Se cancela app de MC" + con + " a solicitud de " + cliente(d) + ".";
        case "soa": return talk(d) + " sobre su plan de MC" + y + ". Se envía el SOA para firma antes de revisar los planes.";
        case "cita": return talk(d) + ", desea revisar su plan de MC" + y + ". Se agenda cita" + citaWhen(d) + ".";
        case "sincambio": return talk(d) + ", se revisan los beneficios de su plan para" + (y || " el próximo año") + " y decide mantenerse en su plan actual.";
        case "interesado": return talk(d) + ", está " + adj(d, "interesado") + " en aplicar al MC con la agencia.";
        case "nointeresado": return talk(d) + ", indica que no está " + adj(d, "interesado") + " por el momento.";
      }
    }
    if (d.line === "supp") {
      var P = productOf(d), others = members(d).slice(1);
      var who = cliente(d) + (others.length ? (others.length === 1 ? " y " + others[0] : ", " + others.slice(0, -1).join(", ") + " y " + others[others.length - 1]) : "");
      var what = (P.es ? " de " + P.es : "") + (carrier ? " de " + carrier : "") + (val(d.plan) ? ", plan " + val(d.plan) + "," : "");
      switch (O.id) {
        case "enviada":
          return ({ renovacion: "Se renueva app", cambio: "Se procesa cambio de plan" }[G.v] || "Se procesa app") + what + " para " + who + ".";
        case "cancelada": return "Se cancela" + (P.es ? " " + P.es : " el plan") + (carrier ? " de " + carrier : "") + " a solicitud de " + cliente(d) + ".";
        case "cotizacion": return talk(d) + ", desea cotizar " + P.sms + ".";
        case "pago": return talk(d) + " sobre el pago de su " + P.sms + (carrier ? " con " + carrier : "") + ".";
        case "shortterm": return talk(d) + " sobre la renovación de su Short Term" + (carrier ? " de " + carrier : "") + ".";
      }
    }
    /* sin contacto: igual para todas las líneas */
    var por = { nueva: "su app " + lbl, renovacion: "la renovación de su " + lbl, cambio: "su " + lbl }[G.v] || ("su " + lbl);
    if (d.line === "mc") { por = "revisar su plan de MC"; }
    var s = "Se llama a " + cliente(d) + " para " + por + y + ", sin respuesta.";
    if (METODO_ES[d.metodo]) { s += " Se le envía " + METODO_ES[d.metodo] + "."; }
    if (val(d.intento)) { s += " Intento #" + val(d.intento) + "."; }
    return s;
  }

  function paymentLine(d) {
    var monto = U.parseMoney(d.pagoMonto) || (d.line === "oc" ? U.parseMoney(d.primaPagar) : U.parseMoney(d.prima));
    var fecha = U.parseDate(d.pagoFecha);
    switch (d.pagoEstado) {
      case "PAYMENT":
        return ["Realizado" + (monto ? " - " + monto : "") + (fecha ? " el " + fecha : ""),
                val(d.pagoMetodo), val(d.pagoConf) ? "Conf. " + val(d.pagoConf) : ""].filter(Boolean).join(" - ");
      case "NO PAYMENT":
        return "Pendiente" + (monto ? " - prima de " + monto : "") + (fecha ? " - " + cliente(d) + " paga el " + fecha : "");
      case "PAYMENT NOT VERIFIED":
        return "No verificado - " + cliente(d) + " no contestó para confirmar";
      case "NO PREMIUM":
        return "No aplica - plan sin prima";
      default:
        return val(d.pagoMetodo);
    }
  }

  function agentRows(d, add) {
    var O = outcomeOf(d);
    if (!has(O, "agente")) { return; }
    /* el NPN se anota con las iniciales del agente, como en los templates */
    if (val(d.agente) || val(d.agenteIni)) { add("NPN", upper(d.agenteIni) || U.initials(d.agente)); }
    if (d.line === "mc") { add("Writing ID", d.escritura); }
    add("Colaborador", upper(d.colaboradorNombre));
  }

  function bodyOC(d, add, raw) {
    var O = outcomeOf(d), m = members(d);
    var nTax = val(d.hogar), nCov = m.length;
    var names = nCov ? " (" + m.join(", ") + ")" : "";
    var cov = nCov ? nCov + names : "";
    var quoteLike = O.id === "cotizacion" || O.id === "consent" || O.id === "lista";

    if (quoteLike) {
      var portal = { "HealthSherpa": "HEALTHSHERPA", "el portal de la compañía": "PORTAL DE LA COMPAÑÍA" }[d.plataforma] || "MARKETPLACE";
      raw("PROCESAR POR EL PORTAL: " + portal + ".");
      if (val(d.ingreso)) { raw("Income: " + moneyShort(d.ingreso) + "."); }
      if (nTax) { raw("En taxes: " + nTax + "."); }
      if (cov) { raw("Solicitan cobertura: " + cov + "."); }
      add("ID#", d.appId);
      if (d.periodo === "SEP") { add("Enrollment Period", "SEP" + (val(d.motivoSep) ? " - " + val(d.motivoSep) : "")); }
      var carrier = carrierShort("oc", d.compania), prima = moneyShort(d.primaPagar);
      if (carrier || val(d.plan)) {
        raw("Se explica y da detalles del plan cotizado:");
        raw("Compañía_Plan: " + [carrier, val(d.plan)].filter(Boolean).join("_") + (prima ? " - " + prima : ""));
      }
      if (O.id === "consent") { raw("Se envía carta de consentimiento."); }
      if (O.id === "lista") { raw("Se recibe la carta de consentimiento firmada."); agentRows(d, add); }
      return;
    }

    if (has(O, "hogar") && (val(d.ingreso) || nTax || nCov)) {
      var s = val(d.ingreso) ? "Sus ingresos anuales son " + moneyShort(d.ingreso) + ". " : "";
      if (nTax && nCov) { s += (nTax === "1" ? "Es " : "Son ") + nTax + " en los taxes y " + nCov + " pidiendo cobertura" + names + "."; }
      else if (nTax) { s += (nTax === "1" ? "Es " : "Son ") + nTax + " en los taxes."; }
      else if (nCov) { s += nCov + " pidiendo cobertura" + names + "."; }
      raw(s.trim());
    }
    var idLine = [val(d.appId) ? "ID#: " + val(d.appId) : "", val(d.estado) ? "Status: " + val(d.estado) : ""].filter(Boolean).join("   ");
    if (idLine && (has(O, "proceso") || O.id === "pago")) { raw(idLine); }
    if (has(O, "plan")) {
      add(O.id === "enviada" ? "Se inscribe en plan" : "Plan", d.plan);
      add("Plan ID", upper(d.planId));
      if (val(d.metal) && val(d.plan).toLowerCase().indexOf(val(d.metal).toLowerCase()) < 0) { add("Nivel", d.metal); }
      var ef = U.parseDate(d.efectiva), fin = U.parseDate(d.fin);
      if (ef) { add("Inicia cobertura", ef + (fin ? " (hasta " + fin + ")" : "")); }
    }
    if (has(O, "costos")) {
      var pay = U.parseMoney(d.primaPagar), tot = U.parseMoney(d.primaTotal), sub = U.parseMoney(d.subsidio);
      if (pay || tot) {
        add("Premium", (pay || tot) + (pay && tot && sub ? " (prima " + tot + " - APTC " + sub + ")" : ""));
      }
      var ded = U.parseMoney(d.deducible), max = U.parseMoney(d.maximo);
      if (ded || max) { raw([ded ? "Deducible: " + ded : "", max ? "Máx. de bolsillo: " + max : ""].filter(Boolean).join(" / ")); }
    }
    if (has(O, "plan")) { add("Póliza #", d.poliza); }
    if (has(O, "proceso") && O.id === "enviada") {
      add("Enrollment Period", d.periodo === "SEP" ? "SEP" + (val(d.motivoSep) ? " - " + val(d.motivoSep) : "") : d.periodo);
    }
    agentRows(d, add);
    if (has(O, "docsreq")) {
      if (val(d.docReq)) { raw("MKPL pide docs: " + val(d.docReq) + (U.parseDate(d.docFecha) ? " antes del " + U.parseDate(d.docFecha) : "") + "."); }
      else if (O.id === "enviada" && d.net && d.net.eligibility) { raw("MKPL no pide docs."); }
    }
    if (O.id === "enviada") {
      var acct = d.cuentaMkpl === "no" ? "No hay cuenta MKPL creada. " : (d.cuentaMkpl === "si" ? "Tiene cuenta MKPL creada. " : "");
      var how = { "HealthSherpa": "La app se hizo con HealthSherpa.", "HealthCare.gov": "La app se hizo en el MKPL (HealthCare.gov).",
                  "el portal de la compañía": "La app se hizo en el portal de la compañía." }[d.plataforma] || "";
      if (acct || how) { raw((acct + how).trim()); }
    }
    if (has(O, "pago")) { add("Pago", paymentLine(d)); add("AutoPay", d.pagoEstado === "PAYMENT" ? d.autopay : ""); }
  }

  function bodyMC(d, add) {
    var O = outcomeOf(d);
    if (has(O, "cliente")) { add("Name", zohoName(d)); }
    if (has(O, "medicare")) {
      add("MC #", upper(d.mbi));
      add("PART A", U.parseDate(d.parteA) || d.parteA);
      add("PART B", U.parseDate(d.parteB) || d.parteB);
    }
    if (has(O, "plan")) {
      var contrato = upper(d.contrato), plan = val(d.plan);
      var fullPlan = plan ? plan + (contrato && plan.toUpperCase().indexOf(contrato) < 0 ? " " + contrato : "") : contrato;
      add(O.id === "enviada" || O.id === "cancelada" ? "Plan" : "Plan actual", fullPlan);
      add("Conf/App #", d.confirmacion);
    }
    if (has(O, "proceso") && val(d.periodoMC) && O.id !== "sincontacto") {
      add("Election Period", val(d.periodoMC) + (d.periodoMC === "SEP" && val(d.motivoSepMC) ? " (" + val(d.motivoSepMC) + ")" : ""));
    }
    if (has(O, "plan")) { add("Fecha de efectividad", U.parseDate(d.efectiva) || d.efectiva); }
    if (has(O, "medicare")) { add("Medicaid", val(d.medicaid) ? "SI - ID " + val(d.medicaid) : ""); }
    if (has(O, "proceso") && d.gestion === "cambio") { add("Plan anterior", d.anterior); }
    if (has(O, "plan")) {
      add("PCP", val(d.pcp) ? val(d.pcp) + (val(d.pcpId) ? " (ID " + val(d.pcpId) + ")" : "") : "");
      add("Afección crónica", d.afeccion);
      add("Premium", U.parseMoney(d.prima));
    }
    if (has(O, "proceso") && O.id !== "soa" && O.id !== "sincontacto" && d.soaEstado === "firmado" && U.parseDate(d.soaFecha)) {
      add("SOA firmado", U.parseDate(d.soaFecha));
    }
    agentRows(d, add);
  }

  function bodySupp(d, add, raw) {
    var O = outcomeOf(d);
    if (O.id === "cotizacion") {
      var carrier = carrierShort("supp", d.compania), prima = U.parseMoney(d.prima);
      if (carrier || val(d.plan)) {
        raw("Se explica y da detalles del plan cotizado:");
        raw("Compañía_Plan: " + [carrier, val(d.plan)].filter(Boolean).join("_") + (prima ? " - " + prima : ""));
      }
      return;
    }
    if (has(O, "plan")) {
      if (O.id !== "enviada") { add("Plan", d.plan); }
      add("Effective Date", U.parseDate(d.efectiva) || d.efectiva);
      add("Monthly Premium", U.parseMoney(d.prima));
      add("App ID", d.appId);
      add("Policy #", d.poliza);
      add("Periodo", d.plazo);
      add("Tipo de plan", d.tipoPlan);
      add("Beneficiario", d.beneficiario);
    }
    if (has(O, "pago")) { add("Pago", paymentLine(d)); add("AutoPay", d.autopay); }
    agentRows(d, add);
  }

  function networkDocs(d) {
    var L = lineOf(d), O = outcomeOf(d);
    if (!has(O, "network") || !d.net) { return []; }
    return L.network.filter(function (n) { return d.net[n.k]; }).map(function (n) { return n.label; });
  }

  function buildNote(d, opts) {
    opts = opts || {};
    var O = outcomeOf(d);
    var ini = upper(d.ini) || "XX";
    var out = [ini + "_" + (U.parseDate(d.fecha) || "MM/DD/YYYY") + ": " + header(d)];

    function add(label, value) { if (val(value)) { out.push(label + ": " + val(value)); } }
    function raw(text) { if (val(text)) { out.push(text); } }

    if (d.line === "mc") { bodyMC(d, add, raw); }
    else if (d.line === "supp") { bodySupp(d, add, raw); }
    else { bodyOC(d, add, raw); }

    String(d.notas || "").split(/\n/).map(U.collapse).filter(Boolean).forEach(function (x, i) {
      out.push(i === 0 ? "Observaciones: " + x : x);
    });

    var g = function (t) { return String(t || "").replace(/el cliente/g, cliente(d)); };
    add("Pendiente", val(d.pendiente) || g(O.pendiente));
    var f = U.parseDate(d.fechaSeg);
    var prox = val(d.proximo) || (f ? g(O.proximo) : "");
    if (O.id !== "cita" && (prox || f)) { add("Seguimiento", [prox, f].filter(Boolean).join(" - ")); }

    var docs = networkDocs(d);
    if (docs.length) { out.push("Docs en mi folder del NETW: " + docs.join(", ") + "."); }
    /* el botón rojo y el task solo cierran la nota de una aplicación enviada */
    if (d.botonRojo && O.submission) { out.push("Se reporta en el botón rojo."); }
    if (d.incluirTask && O.submission) { var t = buildTask(d); if (t) { out.push("Task: " + t); } }

    var text = out.join("\n");
    return opts.sinAcentos ? U.stripAccents(text) : text;
  }

  /* ---------------------------------------------------------------- SMS -- */

  function firstName(d) { return U.titleCase(val(d.nombres).split(" ")[0] || ""); }

  function buildSms(d, opts) {
    opts = opts || {};
    var O = outcomeOf(d);
    var office = val(d.oficina) || "QAgency";
    var carrier = carrierShort(d.line, d.compania);
    var y = year(d);
    /* kind: cómo se nombra el producto; what: lo mismo con "su" delante */
    var kind = d.line === "mc" ? "Medicare" + y : (d.line === "supp" ? productOf(d).sms : "Obamacare" + y);
    var what = d.line === "mc" ? "su plan de Medicare" + y : (d.line === "supp" ? "su " + productOf(d).sms : "su seguro de Obamacare" + y);
    var plan = val(d.plan);
    var ef = U.parseDate(d.efectiva);
    var pay = d.line === "oc" ? U.parseMoney(d.primaPagar) : U.parseMoney(d.prima);
    var name = firstName(d);
    var tel = val(d.telefono);
    var parts = [];

    parts.push("Hola" + (name ? " " + name : "") + ", le saluda el equipo de " + office + ".");

    switch (O.id) {
      case "enviada":
        parts.push((d.line === "mc" ? "Su solicitud de " : "Su aplicación de ") + kind + (carrier ? " con " + carrier : "") +
                   (d.line === "mc" ? " quedó enviada." : " quedó procesada."));
        if (plan) { parts.push("Plan: " + plan + "."); }
        if (pay) { parts.push(U.moneyNumber(pay) === 0 ? "No tiene pago mensual." : "Pago mensual: " + pay + "."); }
        if (ef) { parts.push("Su cobertura inicia el " + ef + "."); }
        if (d.pagoEstado === "NO PAYMENT") {
          parts.push("Recuerde hacer su primer pago para activar la cobertura" + (U.parseDate(d.pagoFecha) ? " (fecha acordada: " + U.parseDate(d.pagoFecha) + ")" : "") + ".");
        }
        if (d.line === "oc" && val(d.docReq)) {
          parts.push("El Mercado pide " + val(d.docReq).toLowerCase() + (U.parseDate(d.docFecha) ? " antes del " + U.parseDate(d.docFecha) : "") + "; envíenoslo lo antes posible.");
        }
        if (d.line === "mc") { parts.push("Cuando reciba su tarjeta nueva, úsela desde esa fecha."); }
        break;
      case "lista":
        parts.push("Recibimos su consentimiento firmado. Procesaremos " + what + " y le avisaremos cuando quede listo.");
        break;
      case "consent":
        parts.push("Le enviamos la carta de consentimiento para " + what + ". Por favor fírmela cuando pueda para continuar con el proceso.");
        break;
      case "cotizacion":
        parts.push("Gracias por su tiempo. Le cotizamos " + (carrier || plan ? "el plan " + [carrier, plan].filter(Boolean).join(" ") : what) + (pay ? " por " + pay + " al mes" : "") + ". Avísenos si desea continuar con la aplicación.");
        break;
      case "docs":
        parts.push("El Mercado necesita " + (val(d.docReq) ? val(d.docReq).toLowerCase() : "unos documentos") + " para " + what + (U.parseDate(d.docFecha) ? ", con fecha límite el " + U.parseDate(d.docFecha) : "") + ". Por favor envíenoslos lo antes posible para mantener su cobertura.");
        break;
      case "pago":
        var plano = what + (carrier ? " con " + carrier : "");
        parts.push({
          "PAYMENT": "Confirmamos el pago de " + plano + (U.parseMoney(d.pagoMonto) ? " por " + U.parseMoney(d.pagoMonto) : "") + ". ¡Gracias!",
          "NO PAYMENT": "Le recordamos realizar el pago de " + plano + (pay ? " por " + pay : "") + (U.parseDate(d.pagoFecha) ? " el " + U.parseDate(d.pagoFecha) : "") + ".",
          "PAYMENT NOT VERIFIED": "Queremos confirmar el pago de " + plano + ". Por favor llámenos cuando pueda.",
          "NO PREMIUM": plano.charAt(0).toUpperCase() + plano.slice(1) + " no tiene pago mensual; no necesita pagar nada."
        }[d.pagoEstado] || "Le escribimos sobre el pago de " + plano + ".");
        break;
      case "soa":
        parts.push("Le enviamos el formulario de alcance de la cita (SOA) de Medicare. Por favor fírmelo antes de nuestra conversación para poder revisar los planes con usted.");
        break;
      case "cita":
        var f = U.parseDate(d.fechaSeg), h = U.timeLabel(d.hora);
        parts.push("Le confirmamos su cita" + (f ? " para el " + f + (h ? " a las " + h : "") : "") + " para revisar " + what + ". Si necesita cambiarla, avísenos.");
        break;
      case "sincambio":
        parts.push("Como conversamos, usted se mantiene en su plan actual" + (plan ? " (" + plan + ")" : "") + (y ? " para" + y : "") + ".");
        break;
      case "interesado":
        parts.push("Gracias por su interés. Le contactaremos cuando se abra su período para inscribirse en Medicare.");
        break;
      case "sincontacto":
        parts.push("Intentamos comunicarnos con usted sobre " + what + ". Por favor llámenos o responda este mensaje cuando pueda.");
        break;
      case "nointeresado":
        parts.push("Gracias por atendernos. Si más adelante necesita ayuda con su seguro, con gusto le atendemos.");
        break;
      case "cancelada":
        parts.push((what.charAt(0).toUpperCase() + what.slice(1)) + (carrier ? " con " + carrier : "") + " quedó cancelado según lo solicitado.");
        break;
      case "shortterm":
        parts.push("Su plan Short Term" + (plan ? " " + plan : "") + " está por vencer. Llámenos para renovarlo a tiempo.");
        break;
    }

    var text = parts.join(" ");
    /* el teléfono va donde ya se le pide que llame; si no, al final */
    if (tel && /llámenos/.test(text)) { text = text.replace("llámenos", "llámenos al " + tel); }
    else if (tel) { text += " Cualquier duda, llámenos al " + tel + "."; }
    else if (["enviada", "sincambio", "cancelada", "lista"].indexOf(O.id) >= 0) { text += " Cualquier duda, estamos a la orden."; }

    return opts.sinAcentos ? U.stripAccents(text) : text;
  }

  /* Caracteres y cantidad de mensajes. Con letras fuera del alfabeto GSM
     (á, í, ó, ú…) cada mensaje admite 70 caracteres en vez de 160. */
  var GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  function smsInfo(text) {
    var t = String(text || ""), gsm = true;
    for (var i = 0; i < t.length; i++) { if (GSM.indexOf(t.charAt(i)) < 0) { gsm = false; break; } }
    var single = gsm ? 160 : 70, multi = gsm ? 153 : 67;
    var parts = t.length <= single ? 1 : Math.ceil(t.length / multi);
    return { length: t.length, parts: t.length ? parts : 0, unicode: !gsm };
  }

  /* ----------------------------------------------------- nombres archivo -- */

  function buildFileNames(d) {
    var L = lineOf(d);
    var carrier = carrierShort(d.line, d.compania) || "Compania";
    var product = productOf(d).file;
    var who = U.stripAccents(zohoName(d)) || "Apellido, Nombre";
    var base = U.parseDate(d.fecha) || U.today();
    var dates = {
      note: base,
      effective: U.parseDate(d.efectiva) || base,
      soa: U.parseDate(d.soaFecha) || base,
      payment: U.parseDate(d.pagoFecha) || base
    };
    return L.network.map(function (n) {
      var name = who + " - " + n.file.replace("{carrier}", carrier).replace("{product}", product) + " " + U.yearMonth(dates[n.date] || base);
      return { k: n.k, label: n.label, name: U.stripAccents(name).replace(/[\\/:*?"<>|]/g, "") };
    });
  }

  /* ------------------------------------------------------------- avisos -- */

  var SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;

  /* Cosas que conviene revisar antes de copiar. No bloquean nada. */
  function warnings(d, noteText) {
    var O = outcomeOf(d), w = [];
    if (!val(d.ini)) { w.push("Elige quién hace la nota (arriba a la derecha)."); }
    if (!val(d.nombres) && !val(d.apellidos)) { w.push("Falta el nombre del cliente."); }
    if (O.report) {
      if (d.codigoTipo === "Q" && !val(d.codigoQ)) { w.push("Reporte: falta el código Q del cliente."); }
      if (!val(d.compania)) { w.push("Reporte: falta la compañía."); }
      if (!val(d.anio)) { w.push("Reporte: falta el año del plan."); }
    }
    var T = taskById(d.taskId) || taskById(autoTaskId(d));
    if (T && T.extra === "payment" && has(O, "pago") && !d.pagoEstado) {
      w.push("Task: falta la referencia de pago (PAYMENT, NO PAYMENT, PAYMENT NOT VERIFIED o NO PREMIUM).");
    }
    if (T && T.extra === "docs" && !U.parseDate(d.docFecha)) { w.push("Task: falta la fecha tope de los documentos."); }
    if (O.id === "cita" && !U.parseDate(d.fechaSeg)) { w.push("Falta la fecha de la cita."); }
    if (noteText && SSN_RE.test(noteText)) { w.push("La nota parece contener un número de Seguro Social. Quítalo antes de pegarla."); }
    return w;
  }

  var api = {
    buildNote: buildNote, buildTask: buildTask, formatTask: formatTask, buildReport: buildReport,
    buildSms: buildSms, smsInfo: smsInfo, buildFileNames: buildFileNames, warnings: warnings,
    autoTaskId: autoTaskId, taskById: taskById, outcomeOf: outcomeOf, lineOf: lineOf, gestionOf: gestionOf,
    productOf: productOf, carrierShort: carrierShort, memberDelta: memberDelta, zohoName: zohoName
  };
  root.QA = root.QA || {};
  root.QA.notes = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
