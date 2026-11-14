/* Q Agency Toolbox — generadores de texto.
   Tres salidas a partir de los mismos datos:
     buildNote    nota para Zoho CRM
     buildTask    nombre del task (formato TASK Q AGENCY)
     buildReport  línea para el canal de Cliq (formato STANDARD FORMs - REPORT)
   Son funciones puras: no tocan la pantalla, así que se pueden probar solas. */
(function (root) {
  "use strict";

  var C = (root.QA && root.QA.config) || require("./config.js");
  var U = (root.QA && root.QA.util) || require("./util.js");

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

  function taskById(id) {
    for (var i = 0; i < C.TASKS.length; i++) { if (C.TASKS[i].id === id) { return C.TASKS[i]; } }
    return null;
  }

  function has(O, section) { return O.sections.indexOf(section) >= 0; }
  function val(v) { return U.collapse(v); }

  function fullName(d) { return U.collapse((d.nombres || "") + " " + (d.apellidos || "")).toUpperCase(); }

  function productName(d) {
    var L = lineOf(d);
    if (d.line === "mc") { return "plan de Medicare"; }
    if (d.line === "supp") {
      for (var i = 0; i < L.productos.length; i++) {
        if (L.productos[i].v === d.producto) { return L.productos[i].note; }
      }
      return L.product;
    }
    return L.product;
  }

  function carrierShort(line, name) {
    var n = val(name);
    if (!n) { return ""; }
    var list = C.CARRIERS[line] || [];
    for (var i = 0; i < list.length; i++) { if (list[i].re.test(n)) { return list[i].short; } }
    /* sin coincidencia: el nombre tal cual, con mayúscula inicial */
    return n.length <= 5 ? n.toUpperCase() : U.titleCase(n);
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
    var n = U.parseList(d.miembros).length;
    return n > 1 ? "+" + (n - 1) : "";
  }

  /* ------------------------------------------------------------- task -- */

  function autoTaskId(d) {
    var O = outcomeOf(d);
    var id = O.task;
    if (id === "oc_cs" && d.dep) { id = "oc_cs_dep"; }
    if (id === "mc_mant" && d.cmd) { id = "mc_mant_cmd"; }
    return id;
  }

  function buildTask(d) {
    var O = outcomeOf(d);
    var T = taskById(d.taskId) || taskById(autoTaskId(d));
    if (!T) { return ""; }
    var owner = val(d.taskOwner || d.ini).toUpperCase() || "XX";
    var text = T.text
      .replace("{metodo}", val(d.metodo) || "TEXT")
      .replace("{n}", val(d.intento) || "1")
      .replace("{docFecha}", U.taskDate(d.docFecha) || "MMM/DD/YYYY")
      .replace("{taxYear}", val(d.taxYear) || String(new Date().getFullYear()));

    if (T.plain) { return (T.noOwner ? "" : owner + ": ") + text; }

    var out = owner + ": " + text + " - VER NOTA " + (U.parseDate(d.fecha) || "MM/DD/YYYY") +
              " (" + (U.parseTime(d.hora) || "09:00") + ")";
    /* Las observaciones van al final, después de la hora y sin paréntesis. */
    if (T.extra === "payment" && has(O, "pago") && d.pagoEstado) { out += " " + d.pagoEstado; }
    if (T.review && d.review) { out += " REVIEW"; }
    if (val(d.obsTask)) { out += " " + val(d.obsTask).toUpperCase(); }
    return out;
  }

  /* ----------------------------------------------------------- report -- */

  function reportCode(d) {
    if (d.codigoTipo === "New") { return "New"; }
    if (d.codigoTipo === "Sin Code") { return "Sin Code"; }
    var q = val(d.codigoQ).toUpperCase().replace(/^Q/, "").replace(/[^0-9A-Z]/g, "");
    return "Q" + (q || "XXXX");
  }

  function reportProcess(d) {
    var O = outcomeOf(d), G = gestionOf(d);
    var proc = G.proc;
    if (d.line === "supp") {
      var prod = val(d.producto);
      proc += " " + (prod && prod !== "Otro" ? prod : "Supp");
    }
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
    var ap = U.titleCase(d.apellidos), no = U.titleCase(d.nombres);
    var name = ap && no ? ap + ", " + no : (ap || no || "Apellido, Nombre");
    var agentIni = val(d.agenteIni || d.ini).toUpperCase() || "XX";
    var s = reportCode(d) + " - " + name + " - " + reportProcess(d) + " - " +
            (d.canal || "Call") + " (" + agentIni + ")";
    var delta = memberDelta(d);
    if (delta) { s += " " + delta; }
    /* Si quien reporta es un colaborador, sus iniciales van delante. */
    var col = val(d.colaborador).toUpperCase();
    if (col && col !== agentIni) { s = col + ": " + s; }
    return s;
  }

  /* ------------------------------------------------------------- nota -- */

  function opening(d) {
    if (d.canal === "Appointment") {
      return "Se atiende al cliente en cita agendada (" + (d.modalidad || "presencial") + ")";
    }
    if (d.canal === "Walk In") { return "Se atiende al cliente en la oficina (walk-in)"; }
    return "Se atiende al cliente por llamada";
  }

  function motive(d) {
    var O = outcomeOf(d), G = gestionOf(d);
    var prod = productName(d);
    var y = val(d.anio) ? " " + val(d.anio) : "";
    switch (O.id) {
      case "pago": return "para gestionar el pago de su " + prod + y;
      case "docs": return "para dar seguimiento a los documentos que requiere el Mercado en su aplicación" + y;
      case "cancelada": return "para cancelar su " + prod + y;
      case "sincambio": return "para la revisión anual de su plan de Medicare" + y;
      case "interesado": return "para orientarlo sobre sus opciones de Medicare";
      case "shortterm": return "para la renovación de su " + prod;
      default: return G.motivo.replace("{producto}", prod) + y;
    }
  }

  var PAGO_CIERRE = {
    "PAYMENT": "Se realiza el pago con el cliente.",
    "NO PAYMENT": "El cliente queda en realizar el pago.",
    "PAYMENT NOT VERIFIED": "No se logra confirmar el pago con el cliente.",
    "NO PREMIUM": "Se verifica que el plan no tiene prima."
  };

  var METODO_ES = { TEXT: "un mensaje de texto", EMAIL: "un correo electrónico", LETTER: "una carta" };

  function followUpStamp(d) {
    var f = U.parseDate(d.fechaSeg), h = U.parseTime(d.hora);
    if (!f) { return ""; }
    return f + (h ? " (" + h + ")" : "");
  }

  function narrative(d) {
    var O = outcomeOf(d);
    if (O.id === "sincontacto") {
      var s = "Se intenta contactar al cliente por llamada " + motive(d) + ", sin respuesta.";
      if (METODO_ES[d.metodo]) { s += " Se le envía " + METODO_ES[d.metodo] + "."; }
      if (val(d.intento)) { s += " Intento #" + val(d.intento) + "."; }
      return s;
    }
    var out = opening(d) + " " + motive(d) + ".";
    if (d.line === "mc" && has(O, "proceso") && d.soaEstado === "firmado" && O.id !== "soa") {
      out += " Se firma el SOA previo a la cita" + (U.parseDate(d.soaFecha) ? " (" + U.parseDate(d.soaFecha) + ")" : "") + ".";
    }
    var f = U.parseDate(d.fechaSeg), h = U.parseTime(d.hora);
    var seg = f ? " para el " + f + (h ? " a las " + h : "") : "";
    var plat = val(d.plataforma) || "el Mercado";
    var cierre = O.cierre.replace("{plataforma}", plat).replace("{seg}", seg);
    if (O.id === "pago") { cierre = PAGO_CIERRE[d.pagoEstado] || ""; }
    if (cierre) { out += " " + cierre; }
    return out;
  }

  function paymentLine(d) {
    var monto = U.parseMoney(d.pagoMonto) || (d.line === "oc" ? U.parseMoney(d.primaPagar) : U.parseMoney(d.prima));
    var fecha = U.parseDate(d.pagoFecha);
    switch (d.pagoEstado) {
      case "PAYMENT":
        return "Realizado" + (monto ? " - " + monto : "") + (fecha ? " el " + fecha : "") +
               (val(d.pagoMetodo) ? " - " + val(d.pagoMetodo) : "") +
               (val(d.pagoConf) ? " - Conf. " + val(d.pagoConf) : "") +
               (d.autopay === "SI" ? " - Autopay activo" : (d.autopay === "NO" ? " - Sin autopay" : ""));
      case "NO PAYMENT":
        return "Pendiente" + (monto ? " - prima de " + monto : "") + (fecha ? " - el cliente paga el " + fecha : "");
      case "PAYMENT NOT VERIFIED":
        return "No verificado - el cliente no contestó para confirmar";
      case "NO PREMIUM":
        return "No aplica - plan sin prima";
      default:
        return "";
    }
  }

  /* Lo que queda pendiente: lo que escribió el agente (o lo sugerido para la
     situación) más lo que se deduce del pago y de los documentos. */
  function pendingItems(d) {
    var O = outcomeOf(d), items = [];
    var typed = val(d.pendiente);
    if (typed) { items.push(typed); } else if (O.pendiente) { items.push(O.pendiente); }
    if (has(O, "pago")) {
      var monto = U.parseMoney(d.pagoMonto) || (d.line === "oc" ? U.parseMoney(d.primaPagar) : U.parseMoney(d.prima));
      if (d.pagoEstado === "NO PAYMENT") {
        items.push("Pago de la prima" + (monto ? " (" + monto + ")" : "") +
                   (U.parseDate(d.pagoFecha) ? " - el cliente paga el " + U.parseDate(d.pagoFecha) : ""));
      } else if (d.pagoEstado === "PAYMENT NOT VERIFIED") {
        items.push("Confirmar el pago con el cliente");
      }
    }
    if (has(O, "docsreq") && val(d.docReq) && O.id !== "docs") {
      items.push("Enviar al Mercado: " + val(d.docReq) +
                 (U.parseDate(d.docFecha) ? " antes del " + U.parseDate(d.docFecha) : ""));
    }
    return items;
  }

  function dataRows(d) {
    var O = outcomeOf(d), rows = [];
    function add(label, value) { if (val(value)) { rows.push(label + ": " + val(value)); } }

    var name = fullName(d);
    var members = U.parseList(d.miembros).map(function (x) { return x.toUpperCase(); });

    if (has(O, "cliente")) {
      add("Solicitante", name);
      if (d.line !== "mc" && members.length) {
        add("Miembros en cobertura", members.length + " - " + members.join(", "));
      }
    }

    if (d.line === "oc") {
      if (has(O, "hogar")) {
        add("Tamaño del hogar", d.hogar);
        add("Ingreso anual estimado", U.parseMoney(d.ingreso));
      }
      if (has(O, "proceso")) {
        add("ID de aplicación", d.appId);
        if (d.periodo === "SEP") {
          add("Tipo de inscripción", "Special Enrollment (SEP)" + (val(d.motivoSep) ? " - Motivo: " + val(d.motivoSep) : ""));
        } else if (d.periodo === "OEP") {
          add("Tipo de inscripción", "Open Enrollment (OEP)");
        }
      }
      if (has(O, "plan")) {
        add("Compañía", val(d.compania).toUpperCase());
        add("Plan", d.plan);
        add("ID del plan", val(d.planId).toUpperCase());
        if (val(d.metal) && val(d.plan).toLowerCase().indexOf(val(d.metal).toLowerCase()) < 0) { add("Nivel", d.metal); }
        var ef = U.parseDate(d.efectiva), fin = U.parseDate(d.fin);
        add("Cobertura", ef ? ef + (fin ? " - " + fin : "") : "");
        add("No. de póliza", d.poliza);
      }
      if (has(O, "costos")) {
        add("Prima total", U.parseMoney(d.primaTotal));
        add("Subsidio (APTC)", U.parseMoney(d.subsidio));
        add("Prima a pagar", U.parseMoney(d.primaPagar));
        add("Deducible", U.parseMoney(d.deducible));
        add("Máximo de bolsillo", U.parseMoney(d.maximo));
      }
      if (has(O, "docsreq")) {
        add("Documentos requeridos", val(d.docReq) ? val(d.docReq) + (U.parseDate(d.docFecha) ? " - fecha tope " + U.parseDate(d.docFecha) : "") : "");
      }
    }

    if (d.line === "mc") {
      if (has(O, "medicare")) {
        add("Número de Medicare (MBI)", val(d.mbi).toUpperCase());
        add("Parte A efectiva", U.parseDate(d.parteA) || d.parteA);
        add("Parte B efectiva", U.parseDate(d.parteB) || d.parteB);
        add("Medicaid", val(d.medicaid) ? "SI - ID " + val(d.medicaid) : "");
      }
      if (has(O, "proceso")) {
        if (val(d.periodoMC)) {
          add("Período de elección", val(d.periodoMC) + (d.periodoMC === "SEP" && val(d.motivoSepMC) ? " - Motivo: " + val(d.motivoSepMC) : ""));
        }
        if (d.soaEstado === "firmado") { add("SOA", "Firmado" + (U.parseDate(d.soaFecha) ? " el " + U.parseDate(d.soaFecha) : "")); }
        else if (d.soaEstado === "pendiente") { add("SOA", "Pendiente de firma"); }
        add("Plan anterior", d.anterior);
      }
      if (has(O, "plan")) {
        add("Compañía", val(d.compania).toUpperCase());
        var contrato = val(d.contrato).toUpperCase();
        var yaEsta = contrato && val(d.plan).toUpperCase().indexOf(contrato.split("-").slice(0, 2).join("-")) >= 0;
        add("Plan", val(d.plan) ? val(d.plan) + (contrato && !yaEsta ? " (" + contrato + ")" : "") : "");
        add("Prima mensual", U.parseMoney(d.prima));
        add("Fecha efectiva", U.parseDate(d.efectiva) || d.efectiva);
        add("PCP", val(d.pcp) ? val(d.pcp) + (val(d.pcpId) ? " (ID " + val(d.pcpId) + ")" : "") : "");
        add("Afección crónica que califica", d.afeccion);
        add("No. de confirmación", d.confirmacion);
      }
    }

    if (d.line === "supp") {
      if (has(O, "proceso")) { add("Producto", d.producto === "Otro" ? "" : d.producto); }
      if (has(O, "plan")) {
        add("Compañía", val(d.compania).toUpperCase());
        add("Plan", d.plan);
        add("Tipo de plan", d.tipoPlan);
        add("Prima mensual", U.parseMoney(d.prima));
        add("Fecha efectiva", U.parseDate(d.efectiva) || d.efectiva);
        add("No. de aplicación / póliza", d.poliza);
      }
    }

    if (has(O, "pago")) { add("Pago", paymentLine(d)); }

    if (has(O, "agente") && val(d.agente)) {
      add("Agente escritor", val(d.agente).toUpperCase() + (val(d.npn) ? " - NPN " + val(d.npn) : ""));
      if (d.line === "mc") { add("Writing ID", d.escritura); }
    }
    return rows;
  }

  function networkDocs(d) {
    var L = lineOf(d), O = outcomeOf(d);
    if (!has(O, "network") || !d.net) { return []; }
    return L.network.filter(function (n) { return d.net[n.k]; }).map(function (n) { return n.label; });
  }

  function buildNote(d, opts) {
    opts = opts || {};
    var O = outcomeOf(d);
    var ini = val(d.ini).toUpperCase() || "XX";
    var out = [];

    out.push(ini + "_" + (U.parseDate(d.fecha) || "MM/DD/YYYY") + ": " + narrative(d));
    out.push("");

    out.push("ESTATUS: " + O.estatus + (d.recuperado && has(O, "proceso") ? " (RECUPERADO)" : ""));
    var pend = pendingItems(d);
    out.push("PENDIENTE: " + (pend.length ? pend.join("; ") : "Ninguno"));
    var prox = val(d.proximo) || O.proximo.replace("{plataforma}", val(d.plataforma) || "el Mercado");
    var stamp = followUpStamp(d);
    if (prox || stamp) { out.push("PRÓXIMO PASO: " + [prox, stamp].filter(Boolean).join(" - ")); }

    var rows = dataRows(d);
    if (rows.length) { out.push(""); rows.forEach(function (r) { out.push(r); }); }

    var obs = String(d.notas || "").split(/\n/).map(U.collapse).filter(Boolean);
    if (obs.length) {
      out.push("");
      out.push("Observaciones: " + obs[0]);
      obs.slice(1).forEach(function (x) { out.push(x); });
    }

    var tail = [];
    var docs = networkDocs(d);
    if (docs.length) { tail.push("Documentos en Network: " + docs.join(", ") + "."); }
    if (d.botonRojo && O.report) { tail.push("Se reporta en el botón rojo."); }
    if (d.incluirTask) { var t = buildTask(d); if (t) { tail.push("Task: " + t); } }
    if (tail.length) { out.push(""); tail.forEach(function (x) { out.push(x); }); }

    var text = out.join("\n");
    return opts.sinAcentos ? U.stripAccents(text) : text;
  }

  /* ----------------------------------------------------------- avisos -- */

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
    buildNote: buildNote, buildTask: buildTask, buildReport: buildReport, warnings: warnings,
    autoTaskId: autoTaskId, taskById: taskById, outcomeOf: outcomeOf, lineOf: lineOf, gestionOf: gestionOf,
    carrierShort: carrierShort, memberDelta: memberDelta, pendingItems: pendingItems, narrative: narrative
  };
  root.QA = root.QA || {};
  root.QA.notes = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
