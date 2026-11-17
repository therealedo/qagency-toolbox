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
        ingreso: U.moneyNumber(p.ingreso), parentesco: val(p.parentesco),
        dependiente: typeof p.dependiente === "boolean" ? p.dependiente : null
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
  /* El ingreso de un dependiente (hijo, padre, hermano u otro en los taxes)
     solo cuenta en el MAGI del hogar si tiene que declarar impuestos: "Count
     their income only if they need to file a federal tax return"
     (healthcare.gov). Con un solo ingreso anual por persona se toma como
     ingreso de trabajo, cuyo límite es la deducción estándar de una persona
     sola en el año del plan (IRS). Si el App Summary dice quién es
     dependiente ("Will be claimed as a tax dependent") se usa eso; si no, el
     parentesco. El titular, el cónyuge y quien no tiene parentesco elegido
     siempre cuentan. */
  var DEDUCCION_ESTANDAR = { 2025: 15750, 2026: 16100, 2027: 16600 };
  var DEPENDIENTES = ["Hijo/a", "Padre/Madre", "Hermano/a", "Otro"];
  function limiteDeclarar(d) {
    var years = Object.keys(DEDUCCION_ESTANDAR).map(Number).sort();
    var y = +val(d.anio) || years[years.length - 1];
    y = Math.max(years[0], Math.min(years[years.length - 1], y));
    return DEDUCCION_ESTANDAR[y];
  }
  function esDependiente(p) {
    if (p.titular) { return false; }
    return p.dependiente != null ? p.dependiente : DEPENDIENTES.indexOf(p.parentesco) >= 0;
  }
  function cuentaIngreso(d, p) { return !esDependiente(p) || p.ingreso > limiteDeclarar(d); }
  /* Dependientes con ingreso que no llega al límite: no suman al hogar. */
  function ingresoSinContar(d) {
    return enTaxes(d).filter(function (p) { return p.ingreso && !cuentaIngreso(d, p); });
  }
  /* Ingreso del hogar: la suma de lo que gana cada persona en los taxes,
     menos los dependientes que no tienen que declarar. */
  function ingresoHogar(d) {
    return enTaxes(d).reduce(function (sum, p) { return p.ingreso && cuentaIngreso(d, p) ? (sum || 0) + p.ingreso : sum; }, null);
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

  /* Inicio de la cobertura de una app de Obamacare hecha en el Open
     Enrollment (1 de noviembre al 15 de enero): hasta el 15 de diciembre
     empieza el 01/01 del año siguiente; del 16 de diciembre al 15 de enero,
     el 02/01. Fuera del Open Enrollment no hay fecha. */
  function oepStart(fecha) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(U.parseDate(fecha) || "");
    if (!m) { return ""; }
    var mo = +m[1], day = +m[2], y = +m[3];
    if (mo === 11 || (mo === 12 && day <= 15)) { return "01/01/" + (y + 1); }
    if (mo === 12) { return "02/01/" + (y + 1); }
    if (mo === 1 && day <= 15) { return "02/01/" + y; }
    return "";
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

  /* ---------------------------------------------------------- compañías --
     d.compania es el nombre que usan la nota, el reporte y los archivos. En
     Obamacare y Medicare el formulario lo elige de la lista oficial (las
     compañías con `option`) o, con «Otra», lo escribe el agente. */
  var CARRIER_OTHER = "__other";

  function carrierEntry(line, n) {
    var list = C.CARRIERS[line] || [];
    for (var i = 0; i < list.length; i++) { if (list[i].re.test(n)) { return list[i]; } }
    return null;
  }

  /* "BCBS of" + el estado en dos letras, si lo tiene: "BCBS of GA" */
  function withState(e, n, text) {
    var m = e.state ? n.match(e.state) : null;
    return m ? text + " " + m[1].toUpperCase() : text;
  }

  /* Cómo se le escribe la compañía al cliente: "Florida Blue". */
  function carrierName(line, name) {
    var n = val(name);
    if (!n) { return ""; }
    var e = carrierEntry(line, n);
    return e ? withState(e, n, e.display || U.titleCase(e.name)) : n;
  }

  function carrierShort(line, name) {
    var n = val(name);
    if (!n) { return ""; }
    var e = carrierEntry(line, n);
    if (e) { return withState(e, n, e.short); }
    /* sin coincidencia: el nombre tal cual, con mayúscula inicial */
    return n.length <= 5 ? n.toUpperCase() : U.titleCase(n);
  }

  /* Opciones oficiales de la línea, en su orden: { v: nombre, l: texto } */
  function carrierOptions(line) {
    return (C.CARRIERS[line] || []).filter(function (c) { return c.option; })
      .map(function (c) { return { v: c.name, l: c.option, state: !!c.state }; });
  }

  /* Qué opción corresponde a un nombre (escrito o leído de un documento):
     la oficial que lo reconoce, con su estado si es BCBS of, o «Otra». */
  function carrierChoice(line, name) {
    var n = val(name);
    if (!n) { return { sel: "", state: "" }; }
    var e = carrierEntry(line, n);
    if (!e || !e.option) { return { sel: CARRIER_OTHER, state: "" }; }
    var m = e.state ? n.match(e.state) : null;
    return { sel: e.name, state: m ? m[1].toUpperCase() : "" };
  }

  /* Lo contrario: el nombre que sale de una opción oficial y su estado. */
  function carrierFromChoice(line, sel, state) {
    var e = (C.CARRIERS[line] || []).filter(function (c) { return c.name === sel; })[0];
    if (!e || !e.state) { return sel || ""; }
    var st = String(state || "").replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
    return st ? e.name + " " + st : e.name;
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
              " (" + (U.to12h(U.floorSlot(o.hora)) || "09:00") + ")";
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
    /* la cobertura que no empezó se cancela; la que termina en un mes, TERMINATED */
    if (O.cancelled) { s += d.tipoCancel === "terminated" ? "_Terminated" : "_Cancelled"; }
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

  /* Cómo empieza una nota de conversación: "Se conversa con la cliente (02:34)".
     Entre paréntesis va la hora exacta (la del primer documento); el task
     lleva la media hora en que cae (02:30). */
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

  /* el NPN se anota con las iniciales del agente, como en los templates; un
     agente del documento que solo trae el número se anota con el número */
  function npnText(d) { return upper(d.agenteIni) || U.initials(d.agente) || val(d.npn); }

  function agentRows(d, add) {
    var O = outcomeOf(d);
    if (!has(O, "agente")) { return; }
    if (npnText(d)) { add("NPN", npnText(d)); }
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

  /* el teléfono se compara por sus dígitos, sin el 1 del país:
     (305) 555-0199 es 305-555-0199 y +1 305 555 0199 */
  function phoneDigits(v) { return String(v || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); }
  var CONTACTO = [
    { k: "direccion", label: "Dirección", eq: same },
    { k: "clienteTel", label: "Teléfono", eq: function (a, b) { return phoneDigits(a) === phoneDigits(b); } },
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
      if (npnText(d)) { add("NPN", npnText(d)); }
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
        var earners = tax.filter(function (p) { return p.ingreso && cuentaIngreso(d, p); });
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

  /* Una cancelación de Obamacare guarda My Plans & Programs como CANCELLED o
     como TERMINATED, según lo que se eligió (CANCELLED si no se eligió). */
  function networkOf(d) {
    var O = outcomeOf(d), tipo = d.tipoCancel || "cancelled", out = [];
    (O.network || lineOf(d).network).forEach(function (n) {
      if (n.tipoCancel && n.tipoCancel !== tipo) { return; }
      if (!n.perDoc) { out.push(n); return; }
      docsOf(d).filter(function (x) { return x.enviado; }).forEach(function (x) {
        var c = docCat(x.cat), who = docTitular(d, x) ? "" : first(x.persona);
        out.push({ k: docKey(x), label: n.label + ": " + c.label + (who ? " (" + who + ")" : ""), date: n.date,
                   file: n.file.replace("{doc}", (who ? who + "_" : "") + (c.file || c.label)) });
      });
    });
    return out;
  }

  /* Docs Submitted: cada documento enviado es una fila del Network, con
     clave propia por tipo y persona. */
  function docKey(x) { return "docsub:" + x.cat + ":" + upper(x.persona).replace(/[^A-Z0-9ÁÉÍÓÚÑÜ]+/g, "-"); }

  /* Un documento es del titular si se marcó como suyo (titular: lo leyó así
     o se eligió a él en Persona; sigue siéndolo aunque luego se corrija el
     nombre), si no dice de quién es, o si trae su nombre completo o solo su
     nombre de pila ("ROSA"), sin mirar acentos. */
  function docTitular(d, x) {
    if (x.titular) { return true; }
    var plain = function (v) { return U.stripAccents(upper(v)); };
    var p = plain(x.persona), no = plain(d.nombres);
    return !p || p === plain(val(d.nombres) + " " + val(d.apellidos)) || (p.indexOf(" ") < 0 && p === no.split(" ")[0]);
  }

  /* --------------------------------------------- documentos leídos (app) */

  function sameName(a, b) { return U.stripAccents(val(a)).toUpperCase() === U.stripAccents(val(b)).toUpperCase(); }
  /* El nombre de una persona del hogar como lo muestra la lista; el titular
     sin nombre queda vacío. */
  function personaLabel(f, p) { return p.titular ? upper(val(f.nombres) + " " + val(f.apellidos)) : upper(p.nombre); }

  /* La persona del hogar con ese nombre; con solo el nombre de pila
     ("YANET"), la única cuyo nombre empieza así. */
  function findPersona(f, name) {
    var list = f.personas || [];
    var ps = list.filter(function (p) { return sameName(personaLabel(f, p), name); });
    if (!ps.length && val(name).indexOf(" ") < 0) {
      ps = list.filter(function (p) { return sameName(personaLabel(f, p).split(" ")[0], name); });
    }
    return ps.length === 1 ? ps[0] : null;
  }

  /* Documentos pedidos o enviados (carta de elegibilidad, Docs Submitted)
     que entran a la lista f.docs. Uno enviado marca como enviado al que ya
     estaba pedido; `sent` recibe los que se enviaron. Devuelve cuántos datos
     nuevos hubo. Sin el nombre del titular su documento queda sin persona
     (es del titular), no "Sin nombre: escríbelo arriba". */
  /* De qué documento salió una fila (un documento pedido, un plan cotizado):
     si el agente la borra, queda en `descartados` y ningún documento la
     vuelve a agregar. */
  function rowSource(kind, key) { return kind + ":" + U.stripAccents(val(key)).toUpperCase().replace(/[^A-Z0-9$|]+/g, ""); }
  function discarded(f, src) { return (f.descartados || []).indexOf(src) >= 0; }
  function discardRow(f, row) {
    if (!row || !row.src) { return; }
    f.descartados = f.descartados || [];
    if (f.descartados.indexOf(row.src) < 0) { f.descartados.push(row.src); }
  }

  function mergeDocs(f, list, sent) {
    var added = 0, tit = (f.personas || [])[0], titName = tit && val(val(f.nombres) + val(f.apellidos)) ? personaLabel(f, tit) : "";
    list.forEach(function (x) {
      var persona = "", isTit = !!x.titular || !x.persona;
      if (x.titular) { persona = titName; }
      else if (x.persona) {
        var match = findPersona(f, x.persona);
        persona = match ? personaLabel(f, match) : upper(x.persona);
        isTit = match === tit;
      }
      persona = persona || titName;
      var dup = f.docs.filter(function (y) { return y.cat === x.cat && sameName(y.persona, persona); })[0];
      if (dup) {
        if (x.enviado && !dup.enviado) { dup.enviado = true; dup.doc = dup.doc || x.doc || ""; added++; }
        if (isTit) { dup.titular = true; }
        if (x.enviado) { sent.push(dup); }
        return;
      }
      /* la fila que el agente borró o cambió (otro tipo, otra persona) no
         vuelve cuando los documentos se usan de nuevo */
      var src = rowSource("doc", x.cat + "|" + persona);
      if (discarded(f, src) || f.docs.some(function (y) { return y.src === src; })) { return; }
      /* titular: el documento es del titular aunque luego se corrija su nombre */
      var item = { cat: x.cat, persona: persona, fecha: x.fecha || "", enviado: !!x.enviado, doc: x.doc || "", auto: true, titular: isTit, src: src };
      f.docs.push(item);
      if (x.enviado) { sent.push(item); }
      added++;
    });
    return added;
  }

  /* La misma persona escrita de dos maneras: "BEATRIZ MARIA DIAZ" en Zoho y
     "BEATRIZ DIAZ" en el documento (mismo primer nombre y mismo último
     apellido), o solo el nombre de pila ("DIEGO"). */
  function words(s) { return U.stripAccents(val(s)).toUpperCase().split(/\s+/).filter(Boolean); }
  function samePerson(a, b) {
    var x = words(a), y = words(b);
    if (!x.length || !y.length || x[0] !== y[0]) { return false; }
    return x.length === 1 || y.length === 1 || x[x.length - 1] === y[y.length - 1];
  }
  /* La persona del hogar que es la del documento: el titular si el nombre
     es el suyo; si no, quien tiene ese nombre, o el único con ese primer
     nombre (el agente pudo corregir el apellido). */
  function findMember(f, name, titular) {
    var list = f.personas || [], tit = list.filter(function (p) { return p.titular; })[0];
    if (titular) { return tit || null; }
    var titName = tit ? personaLabel(f, tit) : "";
    if (titName && samePerson(titName, name)) { return tit; }
    var others = list.filter(function (p) { return !p.titular; });
    var ps = others.filter(function (p) { return sameName(p.nombre, name); });
    if (!ps.length) { ps = others.filter(function (p) { return samePerson(p.nombre, name); }); }
    if (!ps.length) { ps = others.filter(function (p) { return words(p.nombre)[0] === words(name)[0]; }); }
    return ps.length === 1 ? ps[0] : null;
  }
  function removedByAgent(f, name) { return (f.quitados || []).some(function (q) { return sameName(q, name) || samePerson(q, name); }); }

  /* Lo que el documento dice de quien ya está en la lista: su nombre (si
     trae nombre y apellido) y que está en los taxes y pide cobertura. */
  function confirmMember(p, name) {
    p.orig = p.orig || {};
    if (!p.titular && !("nombre" in p.orig) && words(name).length > 1 && words(p.nombre).length > 1) { p.orig.nombre = upper(name); }
    if (!("taxes" in p.orig)) { p.orig.taxes = true; p.orig.cobertura = true; }
  }

  /* Nombres de los miembros de un documento (My Plans & Programs, una
     aplicación): quien ya está se confirma; quien falta se agrega con taxes
     y cobertura, salvo que el agente lo haya quitado. El primero es el
     titular cuando todavía no hay nombre en Zoho. */
  function mergeMembers(f, names) {
    var added = 0;
    f.personas = f.personas || [];
    if (names.length) { f.hogarPdf = true; }
    names.forEach(function (n, idx) {
      var found = findMember(f, n);
      if (found) { confirmMember(found, n); return; }
      if (idx === 0 && !val(f.nombres)) { return; }
      if (removedByAgent(f, n)) { return; }
      var nombre = upper(n);
      f.personas.push({ nombre: nombre, parentesco: "", taxes: true, cobertura: true, ingreso: "", estatus: "", dob: "", auto: true,
                        orig: { nombre: nombre, taxes: true, cobertura: true } });
      added++;
    });
    return added;
  }

  /* Personas del hogar de un documento (App Summary, el ingreso y DOB del
     titular de otros): cada una recibe lo que el documento dice de ella
     (parentesco, estatus, ingreso anual, DOB); quien falta se agrega, salvo
     que el agente lo haya quitado.
     - Un campo vacío se llena. Uno que llenó un documento y nadie tocó se
       reemplaza si este documento manda igual o más (`rank`): el último
       soltado gana. Lo escrito a mano no se toca.
     - Lo que dice el documento queda en `orig`, así lo que difiera sale en
       Cambios; `filled` guarda qué campos llenó y con qué rango, para
       vaciarlos si se quita el documento.
     - `weak`: un dato que no es de la persona sino del hogar (el ingreso del
       hogar de la carta de elegibilidad, puesto en el titular): solo llena
       un campo vacío y cede ante cualquier dato de la persona. */
  /* `sexo` ("a" / "o") no tiene campo en el hogar: sale en la hoja de cambios */
  var HOGAR_KEYS = ["parentesco", "estatus", "ingreso", "dob", "sexo"];
  var FLAG_KEYS = ["cobertura", "dependiente"];
  function sameValue(k, a, b) {
    if (k === "ingreso") { return U.moneyNumber(a) === U.moneyNumber(b); }
    if (k === "dob") { return same(dateOrText(a), dateOrText(b)); }
    return same(a, b);
  }
  function mergeHousehold(f, list, rank, weak) {
    var n = 0, r = weak ? 0 : (rank == null ? 1 : rank);
    f.personas = f.personas || [];
    /* una lista de personas con nombre es el hogar del documento */
    if (!weak && (list || []).some(function (x) { return val(x.nombre); })) { f.hogarPdf = true; }
    (list || []).forEach(function (x) {
      var keys = HOGAR_KEYS.filter(function (k) { return val(x[k]) && !(k === "parentesco" && x.titular); });
      var p = findMember(f, x.nombre, x.titular);
      if (!p) {
        if (x.titular || !val(x.nombre) || removedByAgent(f, x.nombre)) { return; }
        var nombre = upper(x.nombre), orig = { nombre: nombre, taxes: true, cobertura: true };
        p = { nombre: nombre, parentesco: "", taxes: true, cobertura: true, ingreso: "", estatus: "", dob: "", auto: true, orig: orig };
        keys.forEach(function (k) { p[k] = x[k]; orig[k] = x[k]; });
        FLAG_KEYS.forEach(function (k) { if (typeof x[k] === "boolean") { p[k] = x[k]; orig[k] = x[k]; } });
        f.personas.push(p);
        n++;
        return;
      }
      if (!weak) { confirmMember(p, x.nombre); }
      p.orig = p.orig || {};
      p.filled = p.filled || {};
      keys.forEach(function (k) {
        var had = p.filled[k], untouched = had != null && p.orig && sameValue(k, p[k], p.orig[k]);
        if (!val(p[k]) || (untouched && r >= had && (!weak || had === 0))) {
          /* un dato nuevo vuelve a pedir revisión */
          if (!sameValue(k, p[k], x[k])) { n++; delete p.ok; }
          p[k] = x[k]; p.orig[k] = x[k]; p.filled[k] = r;
          return;
        }
        /* lo escrito a mano se queda; lo que dice el documento es la base */
        if (had == null && !weak) { p.orig[k] = x[k]; }
      });
      /* sí/no del documento (pide cobertura, es dependiente en los taxes):
         se aplica salvo que el agente ya lo haya cambiado a mano */
      FLAG_KEYS.forEach(function (k) {
        if (typeof x[k] !== "boolean" || weak) { return; }
        var had = p.filled[k];
        if (had != null && (p[k] !== p.orig[k] || r < had)) { return; }
        if (p[k] !== x[k]) { n++; delete p.ok; }
        p[k] = x[k]; p.orig[k] = x[k]; p.filled[k] = r;
      });
    });
    return n;
  }

  /* La fila de Docs Submitted de un documento cambia de clave al cambiar su
     persona o su tipo: su casilla y el archivo soltado pasan a la clave nueva. */
  function moveDocKey(f, files, from, to) {
    if (from === to) { return; }
    f.net = f.net || {};
    if (from in f.net) { if (f.net[from]) { f.net[to] = true; } delete f.net[from]; }
    (files || []).forEach(function (x) { if (x.res && x.res.net === from) { x.res.net = to; } });
  }

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
      /* la cotización o el consentimiento cierran la nota: si revisará los
         planes, todavía no hay plan elegido y el consent no se envía; con el
         consent firmado queda la app pendiente */
      if (d.revisaPlanes) {
        var entrega = (d.canal === "Walk In" || (d.canal === "Appointment" && (d.modalidad === "presencial" || d.modalidad === "en casa"))) ? "entrega" : "envía";
        out.push("Se le " + entrega + " la cotización para que revise " + (planesOf(d).length === 1 ? "el plan." : "los planes."));
      } else {
        out.push(d.net && d.net.consent
          ? "Se firmó la carta de consentimiento" + (d.canal === "Appointment" ? (CONSENT_CITA[d.modalidad] || "") : (CONSENT_DONDE[d.canal] || "")) + ", app pendiente."
          : "Carta de consentimiento enviada.");
      }
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

  /* Saludo y agencia con que abren los SMS oficiales de Medicare y de
     Suplementario; la agencia es la oficina elegida en Ajustes. */
  function smsGreeting(d) {
    var en = d.idioma === "en", oficina = val(d.oficina) || "QAgency", name = firstName(d);
    var office = C.OFFICE_NAMES[oficina] || oficina;
    return {
      hello: en ? "Dear " + (name || "client") + ":" : (d.genero === "a" ? "Estimada " : "Estimado ") + (name || "cliente") + ":",
      we: (en ? "We are " : "Somos ") + office + ". "
    };
  }

  /* Firma de los SMS oficiales: quien habló con el cliente, su teléfono
     directo y el de la oficina, cada uno en su línea. */
  function smsSignature(d, lines) {
    var en = d.idioma === "en", firma = U.titleCase(d.firmaNombre), direct = val(d.firmaTel), tel = val(d.telefono);
    if (firma) { lines.push(firma); }
    if (direct) { lines.push((en ? "Direct: " : "Directo: ") + direct); }
    if (tel) { lines.push((en ? "Office: " : "Oficina: ") + tel); }
  }

  /* SMS de una solicitud de Medicare enviada, con el formato oficial de la
     agencia en español o en inglés. El año es el del plan o, si falta, el
     de la fecha efectiva. */
  function smsMC(d) {
    var en = d.idioma === "en", g = smsGreeting(d);
    var ef = U.parseDate(d.efectiva), carrier = carrierName("mc", d.compania), plan = val(d.plan);
    var yr = /^\d{4}$/.test(val(d.anio)) ? val(d.anio) : (ef ? ef.split("/")[2] : "");
    var lines = [g.hello];
    if (en) {
      lines.push(g.we + "We confirm that your " + (yr ? yr + " " : "") + "Medicare enrollment has been completed successfully.");
      if (carrier) { lines.push("Company: " + carrier); }
      if (plan) { lines.push("Plan: " + plan); }
      if (ef) { lines.push("Effective date: " + ef); }
      lines.push("If you have any questions, contact us right away. Regards");
    } else {
      lines.push(g.we + "Le confirmamos que su inscripción en Medicare" + (yr ? " para el " + yr : "") + " se ha completado con éxito.");
      if (carrier) { lines.push("Compañía: " + carrier); }
      if (plan) { lines.push("Plan: " + plan); }
      if (ef) { lines.push("Fecha de efectividad: " + ef); }
      lines.push("Para cualquier duda, comuníquese de inmediato con nosotros. Saludos");
    }
    smsSignature(d, lines);
    return lines.join("\n");
  }

  /* SMS de una aplicación de Suplementario enviada, con el formato oficial
     de la agencia en español (de usted) o en inglés. */
  function smsSupp(d) {
    var en = d.idioma === "en", g = smsGreeting(d), P = productOf(d);
    var carrier = carrierName("supp", d.compania), plan = val(d.plan), id = val(d.poliza);
    var ef = U.parseDate(d.efectiva), pay = U.parseMoney(d.prima);
    var lines = [g.hello];
    if (en) {
      lines.push(g.we + "We have completed the application for your " + P.smsEn + (carrier ? " with " + carrier : ""));
      if (plan) { lines.push("Plan: " + plan); }
      if (ef) { lines.push("Start: " + ef); }
      if (pay) { lines.push("Premium: " + pay + "/month"); }
      if (id) { lines.push("Policy #: " + id); }
      lines.push("Details in your email. If you have any questions, call me right away. Regards");
    } else {
      lines.push(g.we + "Hemos completado la solicitud de su " + P.sms + (carrier ? " con " + carrier : ""));
      if (plan) { lines.push("Plan: " + plan); }
      if (ef) { lines.push("Inicio: " + ef); }
      if (pay) { lines.push("Premium: " + pay + "/mes"); }
      if (id) { lines.push("Policy #: " + id); }
      lines.push("Detalles en su email. Si tiene dudas, llámeme de inmediato. Saludos");
    }
    smsSignature(d, lines);
    return lines.join("\n");
  }

  function buildSms(d) {
    var O = outcomeOf(d);
    if (O.noSms) { return ""; }
    if (O.id === "enviada") {
      if (d.line === "oc") { return smsOC(d); }
      if (d.line === "mc") { return smsMC(d); }
      if (d.line === "supp") { return smsSupp(d); }
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
    if (d.line === "oc" && O.id === "pendiente" && d.revisaPlanes) { return part === 1 ? emailCotizacion(d) : ""; }
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

  /* Email con la cotización de Obamacare cuando el cliente revisará los
     planes: un plan, varios de una compañía o varias compañías, cada una
     con sus planes y la prima de cada uno. */
  function emailCotizacion(d) {
    var plans = planesOf(d);
    if (!plans.length) { return ""; }
    var en = d.idioma === "en", groups = [], byCarrier = {};
    plans.forEach(function (p) {
      var c = upper(carrierName("oc", p.compania));
      if (!byCarrier[c]) { byCarrier[c] = { carrier: c, plans: [] }; groups.push(byCarrier[c]); }
      byCarrier[c].plans.push(p);
    });
    var many = plans.length > 1, carriers = groups.length > 1, lines = [];
    var only = carriers ? "" : groups[0].carrier;
    if (en) {
      lines.push("Dear Client");
      lines.push(many ? "Attached are quotes for Insurance Health Plans" : "Attached is a quote for an Insurance Health Plan");
      lines.push(carriers ? "with the following companies:" : "with the following company:" + (only ? " " + only : ""));
    } else {
      lines.push((d.genero === "a" ? "Estimada" : "Estimado") + " Cliente");
      lines.push("Adjunto cotizaciones para su plan médico a través de " +
        (carriers ? "las compañías:" : "la compañía:" + (only ? " " + only : "")));
    }
    groups.forEach(function (g, gi) {
      if (carriers || (many && gi === 0)) { lines.push(""); }
      if (carriers && g.carrier) { lines.push((en ? "Company: " : "Compañía: ") + g.carrier); }
      g.plans.forEach(function (p, pi) {
        if (many && !carriers && pi > 0) { lines.push(""); }
        if (val(p.plan)) { lines.push((en ? "Name of the plan: " : "NOMBRE DEL PLAN: ") + upper(p.plan)); }
        var pay = U.parseMoney(p.prima);
        if (pay) { lines.push((en ? "Monthly Premium Payment: " : "Prima Mensual: ") + pay); }
      });
    });
    var ef = U.parseDate(d.efectiva);
    if (ef) {
      if (many) { lines.push(""); }
      lines.push(en ? "Effective Date: " + ef : "Cobertura a partir del " + ef);
    }
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
      payment: U.parseDate(d.pagoFecha) || base,
      termination: U.parseDate(d.fechaTermino) || base
    };
    /* año del plan: el del campo, si no el de la cobertura y si no el de la nota */
    var planYear = /^\d{4}$/.test(val(d.anio)) ? val(d.anio) : dates.effective.split("/")[2];
    return networkOf(d).map(function (n) {
      var when = n.date === "plan" ? planYear : U.yearMonth(dates[n.date] || base);
      var name = who + " - " + n.file.replace("{carrier}", carrier).replace("{product}", product) + " " + when + (n.suffix || "");
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
    if (d.line === "oc") {
      ingresoSinContar(d).forEach(function (p) {
        w.push("El ingreso de " + p.first + " (" + moneyShort(p.ingreso) + ") no suma al hogar: un dependiente solo cuenta si tiene que declarar impuestos (más de " +
               moneyShort(limiteDeclarar(d)) + " de trabajo; con ingresos de inversiones o trabajo propio el límite es menor).");
      });
    }
        if (Array.isArray(d.porElegir) && d.porElegir.length) { w.push("Elige o confirma: " + d.porElegir.join(", ") + "."); }
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
    if (d.line === "oc" && O.id === "cancelada" && d.tipoCancel === "terminated" && !U.parseDate(d.fechaTermino)) {
      w.push("Falta la fecha de terminación de la cobertura (va en el nombre del archivo).");
    }
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
  /* Clases de archivo de una línea, cada una con su carpeta opcional: los
     documentos de su Network (los Docs Submitted son una sola clase) y, en
     OC, la Hoja de cambios. */
  function docKinds(line) {
    var L = C.LINES[line];
    if (!L) { return []; }
    var seen = {}, out = [];
    function push(k, label) { if (!seen[k]) { seen[k] = true; out.push({ k: k, label: label }); } }
    L.network.forEach(function (n) { push(n.k, n.label); });
    L.outcomes.forEach(function (o) { (o.network || []).forEach(function (n) { push(n.k, n.label.replace(/\s*\(.*\)$/, "")); }); });
    if (line === "oc") { push("hoja", "Hoja de cambios"); }
    return out;
  }
  /* "docsub:income:ANA" es de la clase "docsub" */
  function kindOf(k) { return String(k || "").split(":")[0]; }
  /* La carpeta de un archivo: la de su clase, la de su línea o la general */
  function netDirFor(dirs, line, kind) {
    var byKind = kind && dirs && line !== "general" && dirs[line + ":" + kindOf(kind)];
    if (byKind) { return { key: line + ":" + kindOf(kind), dir: byKind }; }
    var own = dirs && line !== "general" && dirs[line];
    if (own) { return { key: line, dir: own }; }
    return { key: "general", dir: (dirs && dirs.general) || null };
  }

  /* ----------------------------------------- documento que no es del caso --
     Antes de usar un documento se compara con lo que ya tiene el caso: el
     cliente siempre; la compañía y los números de la aplicación solo si el
     documento es de la misma línea (un comprobante de pago no tiene línea y
     se compara con la compañía del caso). Devuelve los motivos, vacío si
     coincide o si no hay con qué comparar. */
  var NAME_SKIP = { DE: 1, DEL: 1, LA: 1, LAS: 1, LOS: 1, Y: 1 };
  function nameWords(s) {
    return U.stripAccents(val(s)).toUpperCase().split(/[^A-Z]+/).filter(function (w) { return w.length > 1 && !NAME_SKIP[w]; });
  }
  function disjoint(a, b) { return a.length && b.length && !a.some(function (w) { return b.indexOf(w) >= 0; }); }
  function fullName(n, a) { return val([val(n), val(a)].join(" ")).toUpperCase(); }
  function idKey(s) { return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, ""); }

  function sameCarrier(line, a, b) {
    var ea = carrierEntry(line, a), eb = carrierEntry(line, b);
    if (ea && eb) { return ea.name === eb.name; }
    var first = function (s) { return nameWords(s)[0] || ""; };
    return first(a) === first(b);
  }

  var DOC_IDS = [["confirmacion", "otro App ID"], ["appId", "otro número de aplicación"], ["poliza", "otra póliza"]];

  function docConflicts(f, line, res) {
    var d = (res && res.fields) || {}, out = [];
    f = f || {};
    var apCase = nameWords(f.apellidos), apDoc = nameWords(d.apellidos);
    var other = apCase.length && apDoc.length ? disjoint(apCase, apDoc) : disjoint(nameWords(f.nombres), nameWords(d.nombres));
    if (other) { out.push("otro cliente (" + fullName(d.nombres, d.apellidos) + ", el caso es de " + fullName(f.nombres, f.apellidos) + ")"); }
    var sameLine = !res.line || res.line === line;
    if (sameLine && val(f.compania) && val(d.compania) && !sameCarrier(line, f.compania, d.compania)) {
      out.push("otra compañía (" + val(d.compania) + ", el caso es de " + val(f.compania) + ")");
    }
    if (res.line && res.line === line) {
      DOC_IDS.forEach(function (x) {
        var a = idKey(f[x[0]]), b = idKey(d[x[0]]);
        if (a && b && a !== b) { out.push(x[1] + " (" + val(d[x[0]]) + ", el caso tiene " + val(f[x[0]]) + ")"); }
      });
    }
    return out;
  }

  /* ------------------------------------------------------ hoja de cambios --
     Resumen de una página (Obamacare Pendiente) para el colaborador que
     completa la aplicación: se imprime o se guarda en PDF. `cambio` marca lo
     que quedó distinto de los documentos del proceso anterior, con la misma
     base que «Cambios» en la nota. */
  var SEXO = { a: "Femenino", o: "Masculino" };
  var PORTAL = { "HealthSherpa": "HEALTHSHERPA", "Portal de la compañía": "PORTAL DE LA COMPAÑÍA" };

  function changeSheet(d) {
    var base = d.base || {}, list = Array.isArray(d.personas) && d.personas.length ? d.personas : [{ titular: true, taxes: true, cobertura: true }];
    var anio = /^\d{4}$/.test(val(d.anio)) ? val(d.anio) : "";
    var sel = planesOf(d).filter(function (p) { return p.sel; })[0] || (planesOf(d).length === 1 ? planesOf(d)[0] : null);
    var consent = d.net && d.net.consent ? "Recibida" : d.revisaPlanes ? "No enviada (revisará los planes)" : "Enviada";
    var contacto = CONTACTO.map(function (c) {
      var now = val(d[c.k]), was = val(base[c.k]);
      return { label: { direccion: "Dirección postal", clienteTel: "Teléfono", clienteEmail: "Email" }[c.k], value: now, cambio: !c.eq(now, was) };
    });
    contacto.push({ label: "Idioma", value: d.idioma === "en" ? "English" : "Spanish", cambio: false });
    var people = list.map(function (p) {
      var o = p.orig || {}, nuevo = !p.titular && !p.orig && !!d.hogarPdf && !!val(p.nombre);
      var name = p.titular ? U.titleCase(val(d.nombres) + " " + val(d.apellidos)) : U.titleCase(val(p.nombre));
      var dob = dateOrText(p.dob), est = estatusLabel(p.estatus, p.estatusOtro);
      var ing = U.moneyNumber(p.ingreso);
      var changed = function (k, now, was, eq) { return nuevo || (k in o ? !eq(now, was) : false); };
      return {
        nombre: name, titular: !!p.titular, nuevo: nuevo,
        dob: dob, sexo: SEXO[p.titular ? d.genero : p.sexo] || "",
        taxes: !!p.taxes, cobertura: !!p.cobertura, estatus: est,
        ingreso: ing ? U.parseMoney(p.ingreso) : (val(p.ingreso) ? "$0.00" : ""),
        cambio: {
          dob: nuevo || !same(dob, "dob" in o ? dateOrText(o.dob) : ""),
          taxes: changed("taxes", !!p.taxes, !!o.taxes, function (a, b) { return a === b; }),
          cobertura: changed("cobertura", !!p.cobertura, !!o.cobertura, function (a, b) { return a === b; }),
          estatus: nuevo || !same(est, "estatus" in o ? estatusLabel(o.estatus, o.estatusOtro) : ""),
          ingreso: changed("ingreso", ing, U.moneyNumber(o.ingreso), function (a, b) { return a === b; })
        }
      };
    }).filter(function (p) { return p.titular || p.nombre; });
    var total = ingresoHogar(d);
    var inicio = U.parseDate(d.efectiva) || (d.periodo === "OEP" && anio ? "01/01/" + anio : "");
    return {
      titulo: "Hoja de cambios · Verificación previa",
      fecha: U.parseDate(d.fecha) || U.today(),
      anio: anio, anioAnterior: anio ? String(+anio - 1) : "",
      portal: PORTAL[d.plataforma] || "MARKETPLACE",
      cliente: zohoName(d), codigo: d.codigoTipo === "Q" && !val(d.codigoQ) ? "" : reportCode(d),
      agente: U.titleCase(val(d.sheetAgente)), colaborador: U.titleCase(val(d.sheetColaborador)),
      npnAnterior: val(d.npnAnterior), npnSeleccionado: val(d.npnSeleccionado),
      consent: consent,
      plan: sel ? { nombre: [carrierName("oc", sel.compania), val(sel.plan)].filter(Boolean).join(" · "),
                    prima: U.parseMoney(sel.prima), inicio: inicio } : null,
      contacto: contacto,
      personas: people,
      quitados: (Array.isArray(d.quitados) ? d.quitados : []).filter(val).map(function (n) { return U.titleCase(n); }),
      total: total !== null ? U.parseMoney(String(total)) : "",
      archivo: safeFileName(U.stripAccents(zohoName(d) || "Apellido, Nombre") + " - OC_Change Sheet " + (anio || U.today().slice(-4)))
    };
  }

  var api = {
    changeSheet: changeSheet,
    docConflicts: docConflicts,
    copyOrder: copyOrder, smsLink: smsLink, mailtoLink: mailtoLink, safeFileName: safeFileName,
    buildNote: buildNote, buildTask: buildTask, formatTask: formatTask, buildReport: buildReport,
    buildSms: buildSms, buildEmail: buildEmail, smsInfo: smsInfo, buildFileNames: buildFileNames, warnings: warnings, cambios: cambios,
    autoTaskId: autoTaskId, taskById: taskById, outcomeOf: outcomeOf, lineOf: lineOf, gestionOf: gestionOf,
    productOf: productOf, carrierShort: carrierShort, carrierName: carrierName, carrierOptions: carrierOptions,
    carrierChoice: carrierChoice, carrierFromChoice: carrierFromChoice, CARRIER_OTHER: CARRIER_OTHER, memberDelta: memberDelta, zohoName: zohoName, clientInitials: clientInitials,
    personas: personas, docsOf: docsOf, pendingDocs: pendingDocs, planesOf: planesOf, networkOf: networkOf, docKey: docKey,
    mergeDocs: mergeDocs, rowSource: rowSource, discarded: discarded, discardRow: discardRow, mergeMembers: mergeMembers, mergeHousehold: mergeHousehold, samePerson: samePerson, moveDocKey: moveDocKey,
    enTaxes: enTaxes, conCobertura: conCobertura, ingresoHogar: ingresoHogar, ingresoSinContar: ingresoSinContar, limiteDeclarar: limiteDeclarar, moneyShort: moneyShort,
    NET_DIRS: NET_DIRS, netDirFor: netDirFor, docKinds: docKinds, kindOf: kindOf, oepStart: oepStart
  };
  root.QA = root.QA || {};
  root.QA.notes = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
