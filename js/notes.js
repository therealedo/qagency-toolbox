/* Q Agency Toolbox — generadores de texto.
   Cinco salidas a partir de los mismos datos:
     buildNote      nota para Zoho CRM, con la forma de PROCESS TEMPLATES
     buildTask      nombre del task (formato TASK Q AGENCY)
     buildReport    línea para el canal de Cliq (STANDARD FORMs - REPORT)
     buildSms       mensaje de texto para el cliente, con el nombre de la oficina
     buildEmail     email al cliente de una app de Obamacare, en dos partes
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
  function first(name) { return U.titleCase(val(name).split(" ")[0] || ""); }

  /* Personas del hogar (Obamacare). La primera es el titular: su nombre sale
     de los campos de Zoho. Cada una dice si está en los taxes, si pide
     cobertura y su ingreso anual. */
  function personas(d) {
    var list = Array.isArray(d.personas) && d.personas.length ? d.personas : [{ titular: true, taxes: true, cobertura: true }];
    return list.map(function (p) {
      var name = p.titular ? upper(val(d.nombres) + " " + val(d.apellidos)) : upper(p.nombre);
      return {
        name: name, first: p.titular ? (first(d.nombres) || "Titular") : first(p.nombre),
        titular: !!p.titular, taxes: !!p.taxes, cobertura: !!p.cobertura,
        ingreso: U.moneyNumber(p.ingreso), parentesco: val(p.parentesco)
      };
    }).filter(function (p) { return p.titular || p.name; });
  }
  function enTaxes(d) { return personas(d).filter(function (p) { return p.taxes; }); }
  function conCobertura(d) { return personas(d).filter(function (p) { return p.cobertura; }); }
  function names(list) { return list.length ? " (" + list.map(function (p) { return p.first; }).join(", ") + ")" : ""; }
  /* Suplementario: quienes tienen cobertura, el titular como "el cliente" y
     los demás por su nombre de pila: "el cliente, Maria y Luis" */
  function cubiertos(d) {
    var list = conCobertura(d).map(function (p) { return p.titular ? cliente(d) : p.first; });
    return list.length > 1 ? list.slice(0, -1).join(", ") + " y " + list[list.length - 1] : (list[0] || "");
  }
  /* Ingreso del hogar: la suma de lo que gana cada persona en los taxes. */
  function ingresoHogar(d) {
    return enTaxes(d).reduce(function (sum, p) { return p.ingreso ? (sum || 0) + p.ingreso : sum; }, null);
  }

  /* Documentos que pide el Mercado y si ya se enviaron. */
  function docCat(v) {
    for (var i = 0; i < C.MKPL_DOCS.length; i++) { if (C.MKPL_DOCS[i].v === v) { return C.MKPL_DOCS[i]; } }
    return null;
  }
  function docsOf(d) { return (Array.isArray(d.docs) ? d.docs : []).filter(function (x) { return docCat(x.cat); }); }
  function pendingDocs(d) { return docsOf(d).filter(function (x) { return !x.enviado; }); }
  function earliestDue(list) {
    var dates = list.map(function (x) { return U.parseDate(x.fecha); }).filter(Boolean);
    dates.sort(function (a, b) { var p = a.split("/"), q = b.split("/"); return (p[2] + p[0] + p[1]) < (q[2] + q[0] + q[1]) ? -1 : 1; });
    return dates[0] || "";
  }

  /* Planes que se cotizaron (Obamacare pendiente). */
  function planesOf(d) {
    return (Array.isArray(d.planes) ? d.planes : []).filter(function (p) { return val(p.compania) || val(p.plan); });
  }

  /* "Diaz, Beatriz": como se escriben los nombres en el reporte y los archivos */
  function zohoName(d) {
    var ap = U.titleCase(d.apellidos), no = U.titleCase(d.nombres);
    return ap && no ? ap + ", " + no : (ap || no);
  }

  /* "BD": inicial del nombre y del apellido, para la burbuja de la ventana flotante */
  function clientInitials(d) {
    var first = function (s) { return U.collapse(s).charAt(0).toUpperCase(); };
    return first(d.nombres) + first(d.apellidos);
  }

  /* Cómo se le escribe la compañía al cliente: "Florida Blue". */
  function carrierName(line, name) {
    var n = val(name);
    if (!n) { return ""; }
    var list = C.CARRIERS[line] || [];
    for (var i = 0; i < list.length; i++) { if (list[i].re.test(n)) { return list[i].display || U.titleCase(list[i].name); } }
    return n;
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
    var n = conCobertura(d).length;
    return n > 1 ? "+" + (n - 1) : "";
  }

  /* --------------------------------------------------------------- task -- */

  function autoTaskId(d) {
    var O = outcomeOf(d);
    var id = O.task;
    if (d.line === "oc") {
      /* mientras el Mercado pida documentos hay que darle seguimiento, aunque
         ya se hayan enviado */
      if (O.id === "enviada") { id = docsOf(d).length ? "oc_docs" : "oc_cs"; }
      /* pendiente: si va a pensarlo sigue en open enrollment; si ya firmó el
         consent solo falta procesar; si no, se espera el consent */
      if (O.id === "pendiente") { id = d.revisaPlanes ? "oc_oe" : (d.net && d.net.consent ? "oc_app_pending" : "oc_consent"); }
    }
    /* Medicare sin cambios de alguien que ya no es cliente de la agencia */
    if (d.line === "mc" && O.id === "sincambio" && d.esCliente === false) { id = "mc_inactive"; }
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
    /* etiquetas finales elegidas (CRONIC, URGENT), siempre en el mismo orden */
    var obs = Array.isArray(d.obsTags) ? d.obsTags : [];
    C.OBS_TAGS.forEach(function (x) { if (obs.indexOf(x) >= 0) { tags.push(x); } });
    if (val(d.obsTask)) { tags.push(d.obsTask); }
    return formatTask(T, {
      owner: d.taskOwner || d.ini, fecha: d.fecha, hora: d.hora, metodo: d.metodo, intento: d.intento,
      docFecha: d.docFecha || earliestDue(docsOf(d)), taxYear: d.taxYear, tags: tags
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
    /* Medicare sin cambios: para el canal NO CHANGE */
    if (d.line === "mc" && O.id === "sincambio") {
      return (zohoName(d) || "Apellido, Nombre") + " se quedara en su mismo plan" + (val(d.plan) ? " " + val(d.plan) : "");
    }
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
  /* contracciones: "al cliente", "del cliente" */
  function alCliente(d) { return d.genero === "a" ? "a la cliente" : "al cliente"; }
  function delCliente(d) { return d.genero === "a" ? "de la cliente" : "del cliente"; }

  var MODO_CITA = { "presencial": "en cita presencial", "telefónica": "en cita telefónica", "Zoom": "en cita por Zoom", "en casa": "en cita en su casa" };

  /* Cómo empieza una nota de conversación: "Se conversa con la cliente (02:30)".
     Entre paréntesis va la hora en que se debe revisar el task, la misma que
     lleva el task después de VER NOTA. */
  function talk(d) {
    var t = U.parseTime(d.hora) ? " (" + U.to12h(d.hora) + ")" : "";
    if (d.canal === "Appointment") { return "Se atiende " + alCliente(d) + " " + (MODO_CITA[d.modalidad] || "en cita") + t; }
    if (d.canal === "Walk In") { return "Se atiende " + alCliente(d) + " en la oficina" + t; }
    return "Se conversa con " + cliente(d) + t;
  }

  function year(d) { return val(d.anio) ? " " + val(d.anio) : ""; }

  function header(d) {
    var O = outcomeOf(d), G = gestionOf(d);
    var carrier = carrierShort(d.line, d.compania);
    var con = carrier ? " con " + carrier : "";
    var y = year(d);

    if (d.line === "oc") {
      switch (O.id) {
        case "enviada": return ({ renovacion: "Se renueva", cambio: "Se actualiza" }[G.v] || "Se procesa") + " app OC" + y + con + ".";
        case "cancelada":
          return ({ renovacion: "Se cancela la renovación OC", cambio: "Se cancela la póliza OC" }[G.v] || "Se cancela app OC") + y + con +
                 " a solicitud " + delCliente(d) + ".";
        case "pendiente":
          /* con un plan elegido ya quiere aplicar; si no, solo cotiza */
          var sel = planesOf(d).some(function (p) { return p.sel; }) && !d.revisaPlanes;
          return talk(d) + ", nos indicó que desea " +
                 (sel ? { nueva: "aplicar", renovacion: "renovar", cambio: "actualizar su app" }[G.v] : "cotizar") + " con los siguientes datos:";
      }
    }
    if (d.line === "mc") {
      switch (O.id) {
        case "enviada": return G.v === "cambio" ? "Se procesa cambio de plan de MC" + (carrier ? " a " + carrier : "") + "." : "Se procesa app de MC" + con + ".";
        /* el plan cierra la línea, sin punto, como en el formato de la agencia */
        case "sincambio": return talk(d) + ", se revisan los beneficios de su plan para" + (y || " el próximo año") +
                                 " y decide mantenerse en su plan actual" + (val(d.plan) ? " - " + val(d.plan) : "");
      }
    }
    if (d.line === "supp") {
      var P = productOf(d), who = cubiertos(d);
      var what = (P.es ? " de " + P.es : "") + (carrier ? " de " + carrier : "") + (val(d.plan) ? ", plan " + val(d.plan) + "," : "");
      switch (O.id) {
        case "enviada":
          return (G.v === "renovacion" ? "Se renueva app" : "Se procesa app") + what + (who ? " para " + who : "") + ".";
        /* en la cotización se nombra a los miembros solo si hay más que el titular */
        case "cotizacion":
          var otros = conCobertura(d).some(function (p) { return !p.titular; });
          return talk(d) + ", desea cotizar " + P.sms + (otros ? " para " + who : "") + ".";
      }
    }
    return talk(d) + ".";
  }

  function paymentLine(d) {
    var monto = U.parseMoney(d.pagoMonto) || U.parseMoney(d.prima);
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
    /* solo cuando no fue quien escribe la nota */
    add("Habló con el cliente", upper(d.talkerNombre));
    /* en Medicare y Suplementario la app la hace quien escribe la nota: no hay colaborador */
    if (d.line === "oc") { add("Colaborador", upper(d.colaboradorNombre)); }
  }

  /* ------------------------------------------------------------ cambios --
     Lo que quedó distinto de lo que llenaron los PDF. Cada persona guarda en
     `orig` los valores que puso un documento; `quitados` son las personas de
     un documento que se quitaron, `base` los datos de contacto leídos y
     `hogarPdf` dice si el hogar vino de un documento (entonces una persona
     agregada a mano es un cambio). La dirección, el teléfono, el email, el
     estatus y el DOB cuentan también cuando se llenan sin que un documento
     los trajera. */
  function estatusLabel(v, otro) {
    if (v === "otro") { return val(otro) || "Otro"; }
    for (var i = 0; i < C.ESTATUS.length; i++) { if (C.ESTATUS[i].v === v) { return C.ESTATUS[i].l; } }
    return "";
  }
  function antes(was) { return was ? " (antes " + was + ")" : ""; }
  function same(a, b) { return U.stripAccents(val(a)).toUpperCase() === U.stripAccents(val(b)).toUpperCase(); }
  function dateOrText(v) { return U.parseDate(v) || val(v); }

  /* el teléfono se compara por sus dígitos: (305) 555-0199 es 305-555-0199 */
  var CONTACTO = [
    { k: "direccion", label: "Dirección", eq: same },
    { k: "clienteTel", label: "Teléfono", eq: function (a, b) { return String(a || "").replace(/\D/g, "") === String(b || "").replace(/\D/g, ""); } },
    { k: "clienteEmail", label: "Email", eq: same }
  ];

  function cambios(d) {
    var out = [], base = d.base || {};
    (Array.isArray(d.personas) ? d.personas : []).forEach(function (p) {
      var o = p.orig || {}, ch = [];
      var dob = dateOrText(p.dob), est = estatusLabel(p.estatus, p.estatusOtro);
      if (!p.titular && !p.orig && d.hogarPdf && val(p.nombre)) {
        out.push("- Se agrega a " + upper(p.nombre) + (val(p.parentesco) ? " (" + val(p.parentesco) + ")" : "") +
                 (dob ? ", DOB " + dob : "") + (est ? ", estatus " + est : ""));
        return;
      }
      if (!p.titular && "nombre" in o && !same(o.nombre, p.nombre)) { ch.push("nombre " + (upper(p.nombre) || "sin dato") + antes(upper(o.nombre))); }
      if ("parentesco" in o && !same(o.parentesco, p.parentesco)) { ch.push("parentesco " + (val(p.parentesco) || "sin dato") + antes(val(o.parentesco))); }
      if ("taxes" in o && !!o.taxes !== !!p.taxes) { ch.push(p.taxes ? "está en los taxes" : "no está en los taxes"); }
      if ("cobertura" in o && !!o.cobertura !== !!p.cobertura) { ch.push(p.cobertura ? "pide cobertura" : "no pide cobertura"); }
      if ("ingreso" in o && U.moneyNumber(o.ingreso) !== U.moneyNumber(p.ingreso)) {
        ch.push("ingreso anual " + (moneyShort(p.ingreso) || "sin dato") + antes(moneyShort(o.ingreso)));
      }
      var oEst = "estatus" in o ? estatusLabel(o.estatus, o.estatusOtro) : "";
      if (!same(est, oEst)) { ch.push("estatus " + (est || "sin dato") + antes(oEst)); }
      var oDob = "dob" in o ? dateOrText(o.dob) : "";
      if (!same(dob, oDob)) { ch.push("DOB " + (dob || "sin dato") + antes(oDob)); }
      if (ch.length) {
        var who = p.titular ? (first(d.nombres) || "Titular") : (first(p.nombre) || "Persona sin nombre");
        out.push("- " + who + ": " + ch.join(", "));
      }
    });
    (Array.isArray(d.quitados) ? d.quitados : []).forEach(function (n) { if (val(n)) { out.push("- Se quita a " + upper(n)); } });
    CONTACTO.forEach(function (c) {
      var now = val(d[c.k]), was = val(base[c.k]);
      if (!c.eq(now, was)) { out.push("- " + c.label + ": " + (now || "sin dato") + antes(was)); }
    });
    return out;
  }

  function cambiosBlock(d, raw) {
    var list = cambios(d);
    if (list.length) { raw("Cambios:"); list.forEach(function (x) { raw(x); }); }
  }

  function bodyOC(d, add, raw) {
    var O = outcomeOf(d);
    var tax = enTaxes(d), cov = conCobertura(d), inc = ingresoHogar(d);

    if (O.id === "cancelada") {
      add("Motivo", d.motivoCancel === "Otro" ? val(d.motivoOtro) || "Otro" : d.motivoCancel);
      if (cov.length > 1) { raw("Miembros en la cancelación: " + cov.length + names(cov) + "."); }
      if (val(d.agente) || val(d.agenteIni)) { add("NPN", upper(d.agenteIni) || U.initials(d.agente)); }
      return;
    }

    if (O.id === "pendiente") {
      var portal = { "HealthSherpa": "HEALTHSHERPA", "Portal de la compañía": "PORTAL DE LA COMPAÑÍA" }[d.plataforma] || "MARKETPLACE";
      raw("PROCESAR POR EL PORTAL: " + portal + ".");
      if (inc !== null) { raw("Income: " + moneyShort(inc) + "."); }
      if (tax.length) { raw("En taxes: " + tax.length + names(tax) + "."); }
      if (cov.length) { raw("Solicitan cobertura: " + cov.length + names(cov) + "."); }
      cambiosBlock(d, raw);
      if (d.periodo === "SEP") { add("Enrollment Period", "SEP" + (val(d.motivoSep) ? " - " + val(d.motivoSep) : "")); }
      var plans = planesOf(d);
      if (plans.length) {
        raw(plans.length === 1 ? "Se explica y da detalles del plan cotizado:" : "Se explica y da detalles de los planes cotizados:");
        plans.forEach(function (p) {
          var prima = moneyShort(p.prima);
          raw("Compañía_Plan: " + [carrierShort("oc", p.compania), val(p.plan)].filter(Boolean).join("_") +
              (prima ? " - " + prima : "") + (p.sel ? " (SELECCIONADO)" : ""));
        });
      }
      add("Inicia cobertura", U.parseDate(d.efectiva));
      agentRows(d, add);
      return;
    }

    /* App enviada, como el template OBAMACARE APP */
    if (inc !== null || tax.length || cov.length) {
      var s = "";
      if (inc !== null) {
        var earners = tax.filter(function (p) { return p.ingreso; });
        s += "Sus ingresos anuales son " + moneyShort(inc) +
             (earners.length > 1 ? " (" + earners.map(function (p) { return p.first + " " + moneyShort(p.ingreso); }).join(", ") + ")" : "") + ". ";
      }
      if (tax.length) { s += (tax.length === 1 ? "Es " : "Son ") + tax.length + " en los taxes" + names(tax) + (cov.length ? " y " : "."); }
      if (cov.length) { s += cov.length + " pidiendo cobertura" + names(cov) + "."; }
      raw(s.trim());
    }
    cambiosBlock(d, raw);
    var idLine = [val(d.appId) ? "ID#: " + val(d.appId) : "", val(d.estado) ? "Status: " + val(d.estado) : ""].filter(Boolean).join("   ");
    raw(idLine);
    add("Se inscribe en plan", d.plan);
    add("Inicia cobertura", U.parseDate(d.efectiva));
    add("Premium", U.parseMoney(d.prima));
    add("Enrollment Period", d.periodo === "SEP" ? "SEP" + (val(d.motivoSep) ? " - " + val(d.motivoSep) : "") : d.periodo);
    agentRows(d, add);
    var docs = docsOf(d);
    if (docs.length) {
      raw("MKPL pide docs:");
      docs.forEach(function (x) {
        var who = val(x.persona) ? " (" + first(x.persona) + ")" : "";
        var due = U.parseDate(x.fecha) ? " - fecha tope " + U.parseDate(x.fecha) : "";
        raw("- " + docCat(x.cat).label + who + due + " - " + (x.enviado ? "Enviado" + (val(x.doc) ? ": " + val(x.doc) : "") : "Pendiente"));
      });
    } else if (d.net && d.net.eligibility) {
      raw("MKPL no pide docs.");
    }
    var acct = d.cuentaMkpl === "no" ? "No hay cuenta MKPL creada. " : (d.cuentaMkpl === "si" ? "Tiene cuenta MKPL creada. " : "");
    var how = { "HealthSherpa": "La app se hizo con HealthSherpa.", "MKPL": "La app se hizo en el MKPL.",
                "Portal de la compañía": "La app se hizo en el portal de la compañía." }[d.plataforma] || "";
    if (acct || how) { raw((acct + how).trim()); }
    add("Pago", paymentLine(d));
    if (d.pagoEstado === "PAYMENT") { add("AutoPay", d.autopay); }
  }

  /* Medicare: App enviada como el template MEDICARE. En Sin cambios el plan
     ya va en la primera línea y no lleva más datos. */
  function bodyMC(d, add) {
    if (outcomeOf(d).id === "sincambio") { return; }
    add("Name", zohoName(d));
    add("MC #", upper(d.mbi));
    add("PART A", U.parseDate(d.parteA) || d.parteA);
    add("PART B", U.parseDate(d.parteB) || d.parteB);
    /* el contrato (H-PBP) va dentro del nombre del plan */
    add("Plan", d.plan);
    add("App ID", d.confirmacion);
    if (val(d.periodoMC)) {
      add("Election Period", val(d.periodoMC) + (d.periodoMC === "SEP" && val(d.motivoSepMC) ? " (" + val(d.motivoSepMC) + ")" : ""));
    }
    add("Fecha de efectividad", U.parseDate(d.efectiva) || d.efectiva);
    add("Medicaid ID", d.medicaid);
    if (d.gestion === "cambio") { add("Plan anterior", d.anterior); }
    add("PCP", val(d.pcp) ? val(d.pcp) + (val(d.pcpId) ? " (ID " + val(d.pcpId) + ")" : "") : "");
    add("Afección crónica", d.afeccion);
    /* la mayoría de los planes no tienen prima: sin el interruptor es $0.00 */
    add("Premium", d.tienePrima ? U.parseMoney(d.prima) : "$0.00");
    /* la app enviada ya supone el SOA firmado */
    add("SOA firmado", U.parseDate(d.soaFecha));
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
      add("Fecha efectiva estimada", U.parseDate(d.efectiva) || d.efectiva);
      return;
    }
    if (has(O, "plan")) {
      add("Effective Date", U.parseDate(d.efectiva) || d.efectiva);
      add("Monthly Premium", U.parseMoney(d.prima));
      add("Policy #", d.poliza);
      add("Periodo", d.plazo);
      add("Beneficiario", d.beneficiario);
    }
    if (has(O, "pago")) { add("Pago", paymentLine(d)); add("AutoPay", d.autopay); }
    agentRows(d, add);
  }

  function networkOf(d) { var O = outcomeOf(d); return O.network || lineOf(d).network; }

  function networkDocs(d) {
    var O = outcomeOf(d);
    if (!has(O, "network") || !d.net) { return []; }
    return networkOf(d).filter(function (n) { return d.net[n.k]; }).map(function (n) { return n.label; });
  }

  var CONSENT_DONDE = { "Call": " en línea", "Walk In": " en la oficina" };
  var CONSENT_CITA = { "presencial": " en la oficina", "en casa": " en persona", "telefónica": " en línea", "Zoom": " en línea" };

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

    if (has(O, "seguimiento")) {
      String(d.notas || "").split(/\n/).map(U.collapse).filter(Boolean).forEach(function (x, i) {
        out.push(i === 0 ? "Observaciones: " + x : x);
      });
      var g = function (t) { return String(t || "").replace(/el cliente/g, cliente(d)); };
      add("Pendiente", val(d.pendiente) || g(O.pendiente));
      var f = U.parseDate(d.fechaSeg);
      var prox = val(d.proximo) || (f ? g(O.proximo) : "");
      if (O.id !== "cita" && (prox || f)) { add("Seguimiento", [prox, f].filter(Boolean).join(" - ")); }
    }

    if (d.line === "oc" && O.id === "pendiente") {
      /* la cotización y el consentimiento cierran la nota */
      if (d.revisaPlanes) {
        var entrega = (d.canal === "Walk In" || (d.canal === "Appointment" && (d.modalidad === "presencial" || d.modalidad === "en casa"))) ? "entrega" : "envía";
        out.push("Se le " + entrega + " la cotización para que revise los planes.");
      }
      out.push(d.net && d.net.consent
        ? "Se firmó la carta de consentimiento" + (d.canal === "Appointment" ? (CONSENT_CITA[d.modalidad] || "") : (CONSENT_DONDE[d.canal] || "")) + "."
        : "Carta de consentimiento enviada.");
    } else {
      var docs = networkDocs(d);
      if (docs.length) { out.push("Docs en mi folder del NETW: " + docs.join(", ") + "."); }
    }
    /* el botón rojo solo cierra la nota de una aplicación enviada */
    if (d.botonRojo && O.submission) { out.push("Se reporta en el botón rojo."); }

    var text = out.join("\n");
    return opts.sinAcentos ? U.stripAccents(text) : text;
  }

  /* ---------------------------------------------------------------- SMS -- */

  function firstName(d) { return U.titleCase(val(d.nombres).split(" ")[0] || ""); }

  var GIFT = "🎁";

  /* SMS de una app de Obamacare enviada, con el formato de la agencia en
     español o en inglés (d.idioma). Lo firma quien habló con el cliente, con
     su teléfono directo y el de la oficina. */
  function smsOC(d) {
    var en = d.idioma === "en", G = gestionOf(d);
    var name = firstName(d), oficina = val(d.oficina) || "QAgency";
    var office = C.OFFICE_NAMES[oficina] || oficina;
    var y = val(d.anio) ? " " + val(d.anio) : "", carrier = carrierName("oc", d.compania);
    var plan = val(d.plan), ef = U.parseDate(d.efectiva), pay = U.parseMoney(d.prima);
    var firma = U.titleCase(d.firmaNombre), direct = val(d.firmaTel), tel = val(d.telefono);
    var lines = [];
    if (en) {
      var what = { renovacion: "We have renewed your" + y + " health insurance", cambio: "We have updated your" + y + " health insurance" }[G.v] ||
                 "We have completed your" + y + " health insurance enrollment";
      lines.push("Dear " + (name || "client") + ":");
      lines.push("We are " + office + ". " + what + (carrier ? " with " + carrier : "") + ".");
      if (plan) { lines.push("Plan: " + plan); }
      if (ef) { lines.push("Start: " + ef); }
      if (pay) { lines.push("Premium: " + pay + "/month"); }
      lines.push("Please check your email and, if you have any questions, contact us right away. Best regards");
      if (firma) { lines.push(firma); }
      if (direct) { lines.push("Direct: " + direct); }
      if (tel) { lines.push("Office: " + tel); }
      lines.push(GIFT + " For every 4 people you refer to us, you get a GIFT CARD!");
    } else {
      var accion = { renovacion: "Hemos renovado su seguro de salud", cambio: "Hemos actualizado su seguro de salud" }[G.v] ||
                   "Hemos completado su inscripción al seguro de salud";
      lines.push((d.genero === "a" ? "Estimada " : "Estimado ") + (name || "cliente") + ": Somos " + office + ". " +
                 accion + y + (carrier ? " con " + carrier : "") + ".");
      if (plan) { lines.push("Plan: " + plan); }
      if (ef) { lines.push("Inicio: " + ef); }
      if (pay) { lines.push("Premium: " + pay + "/mes"); }
      lines.push("Revise su email y para cualquier duda, comuníquese de inmediato con nosotros. Saludos" + (firma ? " " + firma : ""));
      if (direct) { lines.push("Directo: " + direct); }
      if (tel) { lines.push("Oficina: " + tel); }
      lines.push(GIFT + " ¡Por cada 4 personas que nos refiera, gana una GIFT CARD!");
    }
    return lines.join("\n");
  }

  function buildSms(d) {
    var O = outcomeOf(d);
    if (O.noSms) { return ""; }
    if (d.line === "oc" && O.id === "enviada") {
      return smsOC(d);
    }
    var office = val(d.oficina) || "QAgency";
    var carrier = carrierShort(d.line, d.compania);
    var y = year(d);
    /* kind: cómo se nombra el producto; what: lo mismo con "su" delante */
    var kind = d.line === "mc" ? "Medicare" + y : (d.line === "supp" ? productOf(d).sms : "Obamacare" + y);
    var what = d.line === "mc" ? "su plan de Medicare" + y : (d.line === "supp" ? "su " + productOf(d).sms : "su seguro de Obamacare" + y);
    var plan = val(d.plan);
    var ef = U.parseDate(d.efectiva);
    var pay = U.parseMoney(d.prima);
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
        var pend = d.line === "oc" ? pendingDocs(d) : [];
        if (pend.length) {
          var due = earliestDue(pend);
          parts.push("El Mercado pide documentos de " + pend.map(function (x) {
            return docCat(x.cat).label.toLowerCase() + (val(x.persona) ? " (" + first(x.persona) + ")" : "");
          }).join(", ") + (due ? " antes del " + due : "") + "; envíenoslos lo antes posible.");
        }
        if (d.line === "mc") { parts.push("Cuando reciba su tarjeta nueva, úsela desde esa fecha."); }
        break;
      case "cotizacion":
        parts.push("Gracias por su tiempo. Le cotizamos " + (carrier || plan ? "el plan " + [carrier, plan].filter(Boolean).join(" ") : what) + (pay ? " por " + pay + " al mes" : "") + ". Avísenos si desea continuar con la aplicación.");
        break;
      case "cancelada":
        parts.push((what.charAt(0).toUpperCase() + what.slice(1)) + (carrier ? " con " + carrier : "") + " quedó cancelado según lo solicitado.");
        break;
    }

    var text = parts.join(" ");
    if (tel) { text += " Cualquier duda, llámenos al " + tel + "."; }
    else if (["enviada", "cancelada"].indexOf(O.id) >= 0) { text += " Cualquier duda, estamos a la orden."; }

    return text;
  }

  /* -------------------------------------------------------------- email --
     Email al cliente de una app de Obamacare enviada, en dos partes que se
     copian por separado: 1, la póliza y el plan; 2, lo que pide el Mercado
     (todo lo pedido, enviado o no) y la firma de quien habló con el cliente. */
  function buildEmail(d, part) {
    var O = outcomeOf(d);
    if (O.id !== "enviada") { return ""; }
    if (d.line === "supp") { return part === 1 ? emailSupp(d) : ""; }
    if (d.line !== "oc") { return ""; }
    var en = d.idioma === "en", lines = [];
    if (part === 1) {
      var y = val(d.anio), carrier = carrierName("oc", d.compania), plan = val(d.plan);
      var ef = U.parseDate(d.efectiva), pay = U.parseMoney(d.prima);
      if (en) {
        lines.push("Dear Client:");
        lines.push("Attached are documents for your" + (y ? " " + y : "") + " policy" + (carrier ? " with " + carrier : "") + ", your application is complete.");
        if (ef) { lines.push("Effective date: " + ef); }
        if (plan) { lines.push("PLAN: " + plan); }
        lines.push("Attached is a detailed description of your benefits with this plan.");
        if (pay) { lines.push("Premium Monthly Payment: " + pay); }
      } else {
        lines.push((d.genero === "a" ? "Estimada" : "Estimado") + " Cliente:");
        lines.push("Adjunto documentos por su póliza" + (y ? " del " + y : "") + (carrier ? " con " + carrier : "") + ", ya la aplicación fue completada.");
        if (ef) { lines.push("Cobertura a partir del " + ef); }
        if (plan) { lines.push("PLAN: " + plan); }
        lines.push("Adjuntamos detalles de beneficios del plan");
        if (pay) { lines.push("Prima Mensual: " + pay); }
      }
      return lines.join("\n");
    }
    var docs = docsOf(d), who = {};
    docs.forEach(function (x) { if (val(x.persona)) { who[upper(x.persona)] = true; } });
    /* el nombre solo hace falta cuando se pide para más de una persona */
    var named = Object.keys(who).length > 1;
    if (docs.length) {
      lines.push(en ? "MARKETPLACE IS REQUESTING:" : "MARKETPLACE SOLICITA:");
      docs.forEach(function (x) {
        var c = docCat(x.cat), due = U.parseDate(x.fecha);
        lines.push((en ? c.en : c.es) + (named && val(x.persona) ? " (" + first(x.persona) + ")" : "") +
                   (due ? (en ? ", Due Date " : ", fecha límite ") + due : ""));
      });
      lines.push("");
    }
    lines.push(en ? "Please feel free to contact us, if you have any questions or concerns." : "Por favor comuníquese con nosotros por cualquier duda.");
    lines.push("");
    lines.push(en ? "Best Regards," : "Saludos");
    if (val(d.firmaNombre)) { lines.push(U.titleCase(d.firmaNombre)); }
    return lines.join("\n");
  }

  /* Email de una app de Suplementario enviada: una sola parte, con la
     compañía, el Policy #, la fecha efectiva y la prima. */
  function emailSupp(d) {
    var en = d.idioma === "en", lines = [];
    var carrier = carrierName("supp", d.compania), id = val(d.poliza);
    var ef = U.parseDate(d.efectiva), pay = U.parseMoney(d.prima);
    if (en) {
      lines.push("Dear Client", "", "We attached the application for:");
      if (carrier) { lines.push("Company " + carrier); }
      if (id) { lines.push("ID # " + id); }
      if (ef) { lines.push("Effective date: " + ef); }
      if (pay) { lines.push("Monthly Premium: " + pay); }
      lines.push("Please feel free to contact us, if you have any questions or concerns.", "", "Best regards,");
    } else {
      lines.push((d.genero === "a" ? "Estimada" : "Estimado") + " Cliente", "", "Se adjunta Aplicación al Plan:");
      if (carrier) { lines.push("Compañía " + carrier); }
      if (id) { lines.push("ID # " + id); }
      if (ef) { lines.push("Cobertura a partir del " + ef); }
      if (pay) { lines.push("Prima Mensual: " + pay); }
      lines.push("Le llegará por correo postal la póliza, beneficios.", "Cualquier duda u observación se puede comunicar con nosotros.", "", "Saludos,");
    }
    if (val(d.firmaNombre)) { lines.push(U.titleCase(d.firmaNombre)); }
    return lines.join("\n");
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
    return networkOf(d).map(function (n) {
      var name = who + " - " + n.file.replace("{carrier}", carrier).replace("{product}", product) + " " +
                 U.yearMonth(dates[n.date] || base) + (n.suffix || "");
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
    var noChange = d.line === "mc" && O.id === "sincambio";
    if (noChange && !val(d.plan)) { w.push("Reporte: falta el nombre del plan."); }
    if (O.report && !noChange) {
      if (d.codigoTipo === "Q" && !val(d.codigoQ)) { w.push("Reporte: falta el código Q del cliente."); }
      if (!val(d.compania)) { w.push("Reporte: falta la compañía."); }
      if (!val(d.anio)) { w.push("Reporte: falta el año del plan."); }
    }
    var T = taskById(d.taskId) || taskById(autoTaskId(d));
    if (T && T.extra === "payment" && has(O, "pago") && !d.pagoEstado) {
      w.push("Task: falta la referencia de pago (PAYMENT, NO PAYMENT, PAYMENT NOT VERIFIED o NO PREMIUM).");
    }
    if (d.line === "oc" && O.id === "enviada") {
      docsOf(d).forEach(function (x) {
        if (!U.parseDate(x.fecha)) { w.push("Docs: falta la fecha tope de " + docCat(x.cat).label.toLowerCase() + (val(x.persona) ? " (" + first(x.persona) + ")" : "") + "."); }
      });
      if (!conCobertura(d).length) { w.push("Hogar: marca quién pide cobertura."); }
      var hd = parseInt(d.hogarDoc, 10);
      if (hd && hd !== enTaxes(d).length) { w.push("Hogar: el documento indica " + hd + " en los taxes y la lista tiene " + enTaxes(d).length + "."); }
    }
    if (d.line === "oc" && O.id === "cancelada" && !val(d.motivoCancel)) { w.push("Falta el motivo de la cancelación."); }
    if (noteText && SSN_RE.test(noteText)) { w.push("La nota parece contener un número de Seguro Social. Quítalo antes de pegarla."); }
    return w;
  }

  /* ------------------------------------------------------------ fase 1 --
     Orden de "Copiar siguiente": nota, task, reporte, SMS y email, sin lo que
     la situación no muestra. */
  function copyOrder(d) {
    var O = outcomeOf(d), list = ["note", "task"];
    if (O.report) { list.push("report"); }
    if (!O.noSms) { list.push("sms"); }
    if (buildEmail(d, 1)) { list.push("email1"); }
    if (buildEmail(d, 2)) { list.push("email2"); }
    return list;
  }

  /* Enlaces que abren el teléfono o el correo con el texto listo; sin un
     número de 10 dígitos o un email válido no hay enlace. */
  function smsLink(phone, text) {
    var digits = String(phone || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.charAt(0) === "1") { digits = digits.slice(1); }
    if (digits.length !== 10) { return ""; }
    return "sms:+1" + digits + "?body=" + encodeURIComponent(text || "");
  }
  function mailtoLink(email, body) {
    var to = val(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { return ""; }
    return "mailto:" + to + "?body=" + encodeURIComponent(String(body || "").replace(/\r?\n/g, "\r\n"));
  }

  /* Windows no admite \ / : * ? " < > | en un nombre de archivo, ni que
     termine en punto o espacio. */
  function safeFileName(name) {
    return String(name || "").replace(/[\\/:*?"<>|]/g, "-").replace(/[\s.]+$/, "").replace(/^\s+/, "");
  }

  /* Carpetas del Network: una general y, si hace falta, una propia por
     línea (por ejemplo una para OC y otra para MA). Una línea sin carpeta
     propia guarda en la general. */
  var NET_DIRS = ["general"].concat(Object.keys(C.LINES));
  function netDirFor(dirs, line) {
    var own = dirs && line !== "general" && dirs[line];
    if (own) { return { key: line, dir: own }; }
    return { key: "general", dir: (dirs && dirs.general) || null };
  }

  var api = {
    copyOrder: copyOrder, smsLink: smsLink, mailtoLink: mailtoLink, safeFileName: safeFileName,
    buildNote: buildNote, buildTask: buildTask, formatTask: formatTask, buildReport: buildReport,
    buildSms: buildSms, buildEmail: buildEmail, smsInfo: smsInfo, buildFileNames: buildFileNames, warnings: warnings, cambios: cambios,
    autoTaskId: autoTaskId, taskById: taskById, outcomeOf: outcomeOf, lineOf: lineOf, gestionOf: gestionOf,
    productOf: productOf, carrierShort: carrierShort, memberDelta: memberDelta, zohoName: zohoName, clientInitials: clientInitials,
    personas: personas, docsOf: docsOf, pendingDocs: pendingDocs, planesOf: planesOf, networkOf: networkOf,
    NET_DIRS: NET_DIRS, netDirFor: netDirFor
  };
  root.QA = root.QA || {};
  root.QA.notes = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
