/* Q Agency Toolbox — lectura de documentos.
   Recibe el texto de un PDF (o texto pegado), decide qué documento es y saca
   los datos que sirven para la nota. Regla general: es preferible dejar un
   campo vacío que llenarlo con algo dudoso, así que todo valor pasa por un
   validador antes de aceptarse. Nada de esto sale del navegador. */
(function (root) {
  "use strict";

  var C = (root.QA && root.QA.config) || require("./config.js");
  var U = (root.QA && root.QA.util) || require("./util.js");

  /* Tipos de documento: a qué línea pertenecen y qué casilla de
     "Documentos en Network" marcan. */
  var TYPES = {
    mc_soa: { label: "SOA", line: "mc", net: "soa" },
    mc_app: { label: "Aplicación de Medicare", line: "mc", net: "appsummary" },
    oc_elig: { label: "Eligibility Letter", line: "oc", net: "eligibility" },
    oc_plans: { label: "My Plans & Programs", line: "oc", net: "plans" },
    oc_app: { label: "App Summary", line: "oc", net: "appsummary" },
    pay: { label: "Comprobante de pago", line: "", net: "payment" },
    supp_app: { label: "Aplicación suplementaria", line: "supp", net: "appsummary" },
    consent: { label: "Consent", line: "", net: "consent" },
    unknown: { label: "Documento", line: "", net: "" }
  };

  var MBI_RE = /\b([1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d)[-\s]?([AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d)[-\s]?([AC-HJKMNP-RT-Y]{2}\d{2})\b/;
  var HIOS_RE = /\b(\d{5}[A-Z]{2}\d{7})(?:-?\d{2})?\b/;
  var CONTRACT_RE = /\b([HRS]\d{4})\s?-\s?(\d{3})(?:\s?-\s?(\d{1,3}))?\b/;
  var MONEY_RE = /\$\s?(-?[\d,]+(?:\.\d{2})?)/;

  /* ------------------------------------------------------ modelo de texto */

  function makeDoc(text) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n")
      .map(function (l) { return l.replace(/\s+$/, ""); });
    return {
      lines: lines,
      /* mismo texto con los espacios colapsados, para buscar frases */
      flat: lines.map(function (l) { return l.replace(/[ \t]+/g, " ").trim(); }).join("\n")
    };
  }

  function firstCell(t) { return String(t || "").trim().split(/\s{2,}|\t/)[0].trim(); }
  function cleanLead(t) { return String(t || "").replace(/^[\s:#*\-–—.)\]]+/, "").trim(); }

  /* Busca un rótulo y devuelve el primer valor válido que encuentre después:
     en la misma línea o en las líneas siguientes. `validate` recibe el texto
     candidato y devuelve el valor limpio o "". */
  function after(doc, labels, validate, look) {
    look = look == null ? 2 : look;
    for (var i = 0; i < doc.lines.length; i++) {
      for (var k = 0; k < labels.length; k++) {
        var m = doc.lines[i].match(labels[k]);
        if (!m) { continue; }
        var rest = cleanLead(doc.lines[i].slice(m.index + m[0].length));
        var v = rest ? validate(rest) : "";
        if (v) { return v; }
        var seen = 0;
        for (var j = i + 1; j < doc.lines.length && seen < look; j++) {
          var next = doc.lines[j].trim();
          if (!next) { continue; }
          seen++;
          v = validate(cleanLead(next));
          if (v) { return v; }
        }
      }
    }
    return "";
  }

  function find(doc, re, group) {
    var m = doc.flat.match(re);
    return m ? String(m[group == null ? 1 : group]).trim() : "";
  }

  /* ---------------------------------------------------------- validadores */

  function vDate(t) { return U.findDate(firstCell(t)) || U.findDate(String(t).slice(0, 40)); }

  function vMoney(t) {
    var m = String(t).slice(0, 40).match(MONEY_RE) || firstCell(t).match(/^(-?[\d,]+\.\d{2})$/);
    return m ? U.parseMoney(m[1]).replace("-", "") : "";
  }

  function vDigits(min, max) {
    return function (t) {
      var m = firstCell(t).match(new RegExp("^#?\\s*(\\d{" + min + "," + max + "})\\b"));
      return m ? m[1] : "";
    };
  }

  function vCode(min, max) {
    return function (t) {
      var m = firstCell(t).match(new RegExp("^#?\\s*([A-Z0-9][A-Z0-9\\-]{" + (min - 1) + "," + (max - 1) + "})$", "i"));
      return m && /\d/.test(m[1]) ? m[1].toUpperCase() : "";
    };
  }

  var LABELISH = /[:?]\s*$|^(yes|no|s[ií]|n\/a|none|ninguno|select|seleccione)$/i;

  function vText(max) {
    return function (t) {
      var c = firstCell(t);
      if (c.length < 2 || c.length > (max || 70)) { return ""; }
      if (LABELISH.test(c) || !/[A-Za-z]/.test(c)) { return ""; }
      return c;
    };
  }

  var NAME_JUNK = /\b(start|end|date|fecha|coverage|cobertura|premium|prima|status|estado|members?|miembros?|plan|plans|planes|active|activo|health|salud|marketplace|mercado|remove|action|view|change|name|nombre|applicant|solicitante|signature|firma|phone|address|medicare|medicaid|enrollment|application|page|total|credit|you|usted|agent|agente|menu|logout|help|privacy|contact|information|required|optional)\b/i;

  function vName(t) {
    var c = firstCell(t).replace(/[,.;:]+$/, "");
    if (c.length < 3 || c.length > 60) { return ""; }
    if (/[\d$@\/]/.test(c) || NAME_JUNK.test(c)) { return ""; }
    if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü'’\-.]+(?:\s+[A-Za-zÁÉÍÓÚÑÜáéíóúñü'’\-.]+){0,4}$/.test(c)) { return ""; }
    return c;
  }

  function vFullName(t) {
    var c = vName(t);
    return c && c.split(/\s+/).length >= 2 ? c : "";
  }

  /* ------------------------------------------------------- piezas comunes */

  function carrierIn(line, text) {
    var list = C.CARRIERS[line] || [];
    var best = null, bestAt = Infinity;
    for (var i = 0; i < list.length; i++) {
      var m = text.match(list[i].re);
      if (m && m.index < bestAt) { best = list[i]; bestAt = m.index; }
    }
    return best ? best.name : "";
  }

  function setName(f, full) {
    var s = U.splitName(full);
    if (s.nombres) { f.nombres = s.nombres.toUpperCase(); }
    if (s.apellidos) { f.apellidos = s.apellidos.toUpperCase(); }
  }

  function personName(doc, f) {
    var no = after(doc, [/\bFirst\s*name\b\*?/i, /^\s*Nombre\(s\)/i, /^\s*Nombre\s*:/i, /\bGiven\s*name\b/i, /\bPrimer\s*nombre\b/i], vName, 1);
    var ap = after(doc, [/\bLast\s*name\b\*?/i, /^\s*Apellido\(s\)/i, /^\s*Apellidos?\s*:/i, /\bSurname\b/i], vName, 1);
    if (no && ap) { f.nombres = no.toUpperCase(); f.apellidos = ap.toUpperCase(); return; }
    var full = after(doc, [/Nombre del (solicitante|beneficiario|miembro|afiliado)/i,
      /\b(Applicant|Beneficiary|Member|Enrollee|Subscriber|Primary contact)('s)?\s*(full\s*)?name\b/i,
      /Contacto principal/i], vFullName, 1);
    if (full) { setName(f, full); }
  }

  function agentInfo(doc, f) {
    var a = after(doc, [/Nombre del agente/i, /\b(Writing\s*)?Agent('s)?\s*name\b/i, /\bBroker('s)?\s*name\b/i,
      /\bAgent of record\b/i, /Agente (de registro|escritor)/i], vFullName, 1);
    if (a) { f.agente = a.toUpperCase(); }
    var npn = find(doc, /\bNPN\b\s*[:#]?\s*(\d{5,12})\b/i) ||
              after(doc, [/\bNPN\b/i, /National Producer Number/i], vDigits(5, 12), 1);
    if (npn) { f.npn = npn; }
  }

  var DATE_TOKEN = /[A-Za-zÁÉÍÓÚáéíóú]{3,12}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:de\s+)?\d{4}|\d{1,2}\s+(?:de\s+)?[A-Za-zÁÉÍÓÚáéíóú]{3,12}\.?,?\s+(?:de\s+)?\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-](?:\d{4}|\d{2})\b/g;

  function datesIn(line) {
    var out = [], m;
    DATE_TOKEN.lastIndex = 0;
    while ((m = DATE_TOKEN.exec(line)) !== null) {
      var v = U.parseDate(m[0]) || U.parseDateWords(m[0]);
      if (v) { out.push({ value: v, index: m.index }); }
    }
    return out;
  }

  function sortKey(mdy) { var p = mdy.split("/"); return p[2] + p[0] + p[1]; }

  /* ------------------------------------------------------------- Medicare */

  var PERIODS = [
    [/\bAEP\b|annual\s*(election|enrollment)\s*period|per[ií]odo de (elecci[oó]n|inscripci[oó]n) anual/i, "AEP"],
    [/\bMA[\s-]?OEP\b|medicare advantage open enrollment/i, "OEP"],
    [/\bICEP\b|\bIEP\b|initial\s*(coverage\s*)?(election|enrollment)\s*period|per[ií]odo (de inscripci[oó]n )?inicial/i, "ICEP / IEP"],
    [/\bSEP\b|special\s*(election|enrollment)\s*period|per[ií]odo (de (elecci[oó]n|inscripci[oó]n) )?especial/i, "SEP"],
    [/\bOEP\b|open enrollment period/i, "OEP"]
  ];

  function periodFrom(t) {
    for (var i = 0; i < PERIODS.length; i++) { if (PERIODS[i][0].test(t)) { return PERIODS[i][1]; } }
    return "";
  }

  function extractMcApp(doc) {
    var f = {};
    personName(doc, f);

    var mbi = doc.flat.match(MBI_RE);
    if (mbi) { f.mbi = (mbi[1] + mbi[2] + mbi[3]).toUpperCase(); }

    f.parteA = after(doc, [/\(?\bPart(e)?\s*A\b\)?/i, /Hospital\s*\(Part(e)?\s*A\)/i], vDate, 1);
    f.parteB = after(doc, [/\(?\bPart(e)?\s*B\b\)?/i, /Medical\s*\(Part(e)?\s*B\)/i], vDate, 1);

    f.efectiva = after(doc, [/Fecha de entrada en vigencia propuesta/i, /\b(Requested|Proposed)\s*effective\s*date\b/i,
      /\bCoverage\s*(start|effective)\s*date\b/i, /Fecha de inicio de (la )?cobertura/i,
      /\bEffective\s*date\b/i, /Fecha efectiva/i], vDate, 1);

    f.plan = after(doc, [/Nombre del plan/i, /\bPlan\s*name\b/i, /\b(Selected\s*plan|Plan\s*selected)\b/i, /Plan (elegido|seleccionado)/i], vText(90), 1);
    if (!f.plan) {
      /* sin rótulo: una línea corta del encabezado que nombre el tipo de plan */
      for (var i = 0; i < doc.lines.length && i < 15; i++) {
        var l = doc.lines[i].trim();
        if (l.length > 8 && l.length < 90 && /\((HMO|PPO|PDP|HMO[\s-]?POS|HMO[\s-]?D-?SNP|HMO[\s-]?C-?SNP|PPO[\s-]?D-?SNP|RPPO|PFFS)\)|\b(HMO|PPO|PDP|D-SNP|C-SNP)\b/.test(l) && !/^[^a-z]+$/.test(l)) {
          f.plan = firstCell(l); break;
        }
      }
    }

    var ct = doc.flat.match(CONTRACT_RE);
    if (ct) { f.contrato = ct[1] + "-" + ct[2] + (ct[3] ? "-" + ct[3] : ""); }

    f.medicaid = after(doc, [/N[uú]mero de (ID de )?Medicaid/i, /\bMedicaid\s*(ID|number|#)/i], vCode(6, 14), 1);

    var per = after(doc, [/Per[ií]odo de elecci[oó]n/i, /\b(Election|Enrollment)\s*period\b/i], function (t) { return periodFrom(t); }, 1);
    if (!per) {
      var marked = doc.flat.match(/(annual|initial|special|open)[^\n]{0,40}(election|enrollment)\s*period[^\n]{0,12}\b(yes|s[ií]|x|✔|selected)\b/i);
      per = marked ? periodFrom(marked[0]) : "";
    }
    if (!per) { per = periodFrom(find(doc, /\b(AEP|ICEP|IEP|MA-OEP)\b/)); }
    if (per) { f.periodoMC = per; }

    f.pcp = after(doc, [/Nombre del PCP/i, /\bPCP\s*name\b/i, /\bPrimary\s*care\s*(physician|provider|doctor)(\s*name)?\b/i,
      /M[eé]dico de atenci[oó]n primaria/i], vText(60), 1);
    f.pcpId = after(doc, [/ID del PCP/i, /\bPCP\s*(ID|number|#)/i, /\bProvider\s*ID\b/i], vCode(4, 16), 1);

    f.confirmacion = after(doc, [/\bConfirmation\s*(number|#|no\.?|ID|code)?/i, /N[uú]mero de confirmaci[oó]n/i], vCode(5, 24), 1);
    f.escritura = after(doc, [/Id\. de escritura/i, /\bWriting\s*(agent\s*)?(ID|number|#)/i, /\bAgent\s*(writing\s*)?(ID|number)\b/i], vCode(4, 16), 1);
    f.prima = after(doc, [/Prima mensual total/i, /Prima del plan/i, /\b(Total\s*)?monthly\s*(plan\s*)?premium\b/i, /\bPlan\s*premium\b/i], vMoney, 1);

    agentInfo(doc, f);
    f.compania = carrierIn("mc", doc.flat);
    if (/chronic|cr[oó]nica/i.test(doc.flat) && /C-?SNP/i.test(doc.flat)) { f.cmd = true; }
    return f;
  }

  function extractSoa(doc) {
    var f = {};
    var full = after(doc, [/Nombre del beneficiario/i, /\bBeneficiary('s)?\s*(full\s*)?name\b/i,
      /\bBeneficiary or authorized representative\b/i], vFullName, 2);
    if (full) { setName(f, full); } else { personName(doc, f); }
    f.soaFecha = after(doc, [/Fecha de (la )?firma/i, /\b(Signature\s*date|Date\s*signed|Date of signature)\b/i,
      /\bDate\s*(appointment\s*)?completed\b/i, /\bSigned\s*(on)?\b/i], vDate, 2);
    f.soaEstado = "firmado";
    agentInfo(doc, f);
    return f;
  }

  /* ---------------------------------------------------------- Marketplace */

  function appId(doc) {
    return find(doc, /(?:Application\s*(?:ID|number|#|no\.?)|ID de (?:la )?solicitud|N[uú]mero de (?:la )?solicitud)\s*[:#]?\s*(\d{8,12})\b/i);
  }

  /* Los espacios se buscan dentro de la misma línea: "…, 2026" seguido de
     "Application ID" en la línea de abajo no es un año de plan. */
  function planYear(doc) {
    return find(doc, /\b(20[2-4]\d)[ \t]+(?:health[ \t]+)?(?:coverage|application|plan year)/i) ||
           find(doc, /(?:coverage|plan) year[ \t]*[:#]?[ \t]*(20[2-4]\d)/i) ||
           find(doc, /(?:cobertura(?:[ \t]+m[eé]dica)?|solicitud|a[nñ]o del plan)[ \t]*:?[ \t]+(?:de[ \t]+|para[ \t]+|del[ \t]+)?(20[2-4]\d)\b/i);
  }

  var DOC_KINDS = [
    [/income|ingresos?/i, "Prueba de ingresos"],
    [/citizenship|ciudadan[ií]a/i, "Prueba de ciudadanía"],
    [/immigration|inmigraci[oó]n|migratori/i, "Documentos migratorios"],
    [/social security number|\bSSN\b|n[uú]mero de seguro social/i, "Prueba de Seguro Social"],
    [/american indian|alaska native/i, "Prueba de estatus tribal"],
    [/incarcerat|encarcela/i, "Prueba de no encarcelamiento"]
  ];

  function extractElig(doc) {
    var f = {};
    f.appId = appId(doc);
    f.anio = planYear(doc);

    var dear = find(doc, /(?:^|\n)\s*(?:Dear|Estimad[oa](?:\(a\))?)\s+([^\n:,]{3,60})[:,]/i);
    if (dear && vFullName(dear)) { setName(f, dear); }

    var credit = doc.flat.match(/\$\s?([\d,]+(?:\.\d{2})?)\s*(?:each|per|a|every)\s*month/i) ||
                 doc.flat.match(/\$\s?([\d,]+(?:\.\d{2})?)\s*(?:cada|por|al)\s*mes/i);
    if (credit && /tax credit|cr[eé]dito (fiscal|tributario)/i.test(doc.flat)) { f.subsidio = U.parseMoney(credit[1]); }

    var inc = doc.flat.match(/(?:yearly|annual)\s*(?:household\s*)?income\s*(?:of|is|:)?\s*\$\s?([\d,]+(?:\.\d{2})?)/i) ||
              doc.flat.match(/ingresos?\s*anual(?:es)?(?:\s*del\s*hogar)?\s*(?:de|es|:)?\s*\$\s?([\d,]+(?:\.\d{2})?)/i);
    if (inc) { f.ingreso = U.parseMoney(inc[1]); }
    var size = find(doc, /household size (?:of|is|:)?\s*(\d{1,2})\b/i) || find(doc, /tama[nñ]o del hogar (?:de|es|:)?\s*(\d{1,2})\b/i);
    if (size) { f.hogar = size; }

    /* Documentos que pide el Mercado y su fecha tope */
    var ask = /send (the marketplace )?(us )?(more information|documents|proof)|data matching|we need more information|env[ií]e(nos)? .{0,30}(documentos|informaci[oó]n|prueba)|necesitamos m[aá]s informaci[oó]n/i;
    if (ask.test(doc.flat)) {
      var kinds = [];
      doc.lines.forEach(function (l) {
        if (!/proof|document|verify|confirm|prueba|document|verificar|confirmar/i.test(l)) { return; }
        DOC_KINDS.forEach(function (k) { if (k[0].test(l) && kinds.indexOf(k[1]) < 0) { kinds.push(k[1]); } });
      });
      if (kinds.length) { f.docReq = kinds.join(", "); }
      var by = doc.flat.match(/(?:send|submit|upload|provide)[^\n.]{0,80}?\b(?:by|before|no later than)\s+([A-Za-z]{3,12}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i) ||
               doc.flat.match(/(?:env[ií]e|enviar|presentar|suba)[^\n.]{0,80}?\b(?:antes del?|a m[aá]s tardar el?|hasta el?)\s+(\d{1,2}\s+de\s+[A-Za-záéíóú]{3,12}\s+de\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (by) { f.docFecha = U.parseDate(by[1]) || U.parseDateWords(by[1]); }
    }
    return f;
  }

  var PLAN_STOP = /^(status|estado|active|activo|pending|pendiente|terminated|cancell?ed|health|salud|dental|marketplace|mercado|plans?|planes|my plans|mis planes|members?|miembros?|coverage|cobertura|view|ver|change|cambiar|go to|ir a|premium|prima|you pay|usted paga|plan id|id del plan)\b/i;

  /* El nombre del plan está justo encima de su ID; puede ocupar dos líneas
     cuando trae la descripción de beneficios entre paréntesis. */
  function planAboveId(doc) {
    for (var i = 0; i < doc.lines.length; i++) {
      var m = doc.lines[i].match(HIOS_RE);
      if (!m) { continue; }
      var before = doc.lines[i].slice(0, m.index).replace(/(plan\s*id|id del plan)\s*[:#]?\s*$/i, "").trim();
      var parts = [];
      if (before.length > 4 && !PLAN_STOP.test(before)) { parts.push(before); }
      for (var j = i - 1; !parts.length && j >= 0 && j >= i - 4; j--) {
        var c = firstCell(doc.lines[j]);
        if (!c) { continue; }
        if (PLAN_STOP.test(c) || datesIn(c).length || c.length > 110 || !/[A-Za-z]/.test(c)) { break; }
        var chunk = [c];
        /* continuación de un paréntesis abierto más arriba */
        if (c.indexOf(")") >= 0 && c.indexOf("(") < 0) {
          for (var k = j - 1; k >= 0 && k >= j - 2; k--) {
            var up = firstCell(doc.lines[k]);
            if (!up || PLAN_STOP.test(up)) { break; }
            chunk.unshift(up);
            if (up.indexOf("(") >= 0) { break; }
          }
        }
        parts = chunk;
      }
      var name = parts.join(" ").replace(/\s*\(.*$/, "").replace(/\s+/g, " ").replace(/[\s,;\-–]+$/, "").trim();
      return { id: m[1], name: name.length > 4 ? name : "" };
    }
    return null;
  }

  function extractPlans(doc) {
    var f = {};
    var p = planAboveId(doc);
    if (p) { f.planId = p.id; if (p.name) { f.plan = p.name; } }
    if (!f.plan) { f.plan = after(doc, [/\bPlan\s*name\b/i, /Nombre del plan/i, /\bSelected\s*plan\b/i], vText(90), 1); }

    f.primaTotal = after(doc, [/\b(Base|Total|Full|Monthly)\s*premium\b/i, /Prima\s*(total|mensual|base)/i, /^\s*Premium\b(?!\s*tax)/i, /^\s*Prima\b(?!\s*a\s*pagar)/i], vMoney, 1);
    f.subsidio = after(doc, [/Premium\s*tax\s*credit/i, /\bTax\s*credit\b/i, /\bAPTC\b/, /Cr[eé]dito\s*(fiscal|tributario)/i], vMoney, 1);
    f.primaPagar = after(doc, [/\bYou\s*pay\b/i, /Usted\s*paga/i, /\bYour\s*(monthly\s*)?(payment|cost|premium)\b/i, /(Prima|Monto)\s*a\s*pagar/i], vMoney, 1);
    f.deducible = after(doc, [/\bDeductible\b/i, /\bDeducible\b/i], vMoney, 1);
    f.maximo = after(doc, [/Out[\s-]of[\s-]pocket\s*(max\w*|limit)?/i, /M[aá]ximo de (gastos de )?bolsillo/i], vMoney, 1);
    f.poliza = after(doc, [/\bPolicy\s*(ID|number|#|no\.?)/i, /\b(Member|Subscriber)\s*ID\b/i, /N[uú]mero de p[oó]liza/i], vCode(6, 20), 1);
    f.appId = appId(doc);

    /* Tabla de miembros: nombre seguido de las fechas de cobertura */
    var names = [], all = [];
    doc.lines.forEach(function (l) {
      var ds = datesIn(l);
      if (!ds.length) { return; }
      var name = vFullName(l.slice(0, ds[0].index));
      if (!name) { return; }
      name = name.toUpperCase();
      if (names.indexOf(name) < 0) { names.push(name); }
      ds.forEach(function (d) { all.push(d.value); });
    });
    if (names.length) {
      f.miembros = names.join("\n");
      setName(f, names[0]);
      all.sort(function (a, b) { return sortKey(a) < sortKey(b) ? -1 : 1; });
      f.efectiva = all[0];
      if (all.length > 1 && all[all.length - 1] !== all[0]) { f.fin = all[all.length - 1]; }
    } else {
      f.efectiva = after(doc, [/\b(Coverage\s*)?start\s*date\b/i, /\bEffective\s*date\b/i, /Fecha de inicio/i, /Fecha efectiva/i], vDate, 1);
      f.fin = after(doc, [/\b(Coverage\s*)?end\s*date\b/i, /Fecha de finalizaci[oó]n/i], vDate, 1);
    }

    f.compania = carrierIn("oc", (f.plan || "") + "\n" + doc.flat);
    var metal = ((f.plan || "") + " " + doc.flat).match(/\b(expanded bronze|bronze|silver|gold|platinum|catastrophic)\b/i);
    if (metal) { f.metal = U.titleCase(metal[1]); }
    f.anio = planYear(doc) || (f.efectiva ? f.efectiva.slice(-4) : "");
    if (/healthsherpa/i.test(doc.flat)) { f.plataforma = "HealthSherpa"; }
    else if (/healthcare\.gov|cuidadodesalud\.gov/i.test(doc.flat)) { f.plataforma = "HealthCare.gov"; }
    return f;
  }

  function extractOcApp(doc) {
    var f = {};
    f.appId = appId(doc);
    f.anio = planYear(doc);
    personName(doc, f);
    f.ingreso = after(doc, [/\b(Expected\s*)?(yearly|annual|total)\s*(household\s*)?income\b/i, /\bHousehold\s*income\b/i,
      /Ingresos?\s*(anual(es)?|total(es)?|del hogar)/i], vMoney, 1);
    f.hogar = after(doc, [/\bHousehold\s*size\b/i, /\bTax\s*household\s*size\b/i, /Tama[nñ]o del hogar/i,
      /Personas en (el|su) hogar/i], vDigits(1, 2), 1);
    if (/healthsherpa/i.test(doc.flat)) { f.plataforma = "HealthSherpa"; }
    else if (/healthcare\.gov|cuidadodesalud\.gov/i.test(doc.flat)) { f.plataforma = "HealthCare.gov"; }
    return f;
  }

  /* ----------------------------------------------------------------- pago */

  function extractPay(doc) {
    var f = { pagoEstado: "PAYMENT" };
    f.pagoMonto = after(doc, [/\b(Payment\s*amount|Amount\s*paid|Total\s*paid|Total\s*payment)\b/i, /Monto\s*(pagado|del pago)/i,
      /Importe\s*(pagado|del pago)?/i, /^\s*(Amount|Monto|Total)\b/i], vMoney, 1);
    f.pagoConf = after(doc, [/\b(Confirmation|Reference|Transaction|Receipt)\s*(number|#|no\.?|ID|code)/i,
      /N[uú]mero de (confirmaci[oó]n|referencia|transacci[oó]n)/i], vCode(5, 24), 1);
    f.pagoFecha = after(doc, [/\bPayment\s*date\b/i, /\bDate\s*(paid|of payment)\b/i, /Fecha\s*(del|de)\s*pago/i,
      /^\s*(Date|Fecha)\b/i], vDate, 1);
    var last4 = doc.flat.match(/(?:ending in|terminad[ao] en|\*{2,}|x{3,}|•{2,})\s*-?\s*(\d{4})\b/i);
    if (last4) {
      var kind = /checking|savings|bank|account|cuenta|ACH|routing/i.test(doc.flat) && !/card|tarjeta|visa|mastercard|amex|discover/i.test(doc.flat) ? "Cuenta" : "Tarjeta";
      f.pagoMetodo = kind + " ****" + last4[1];
    }
    if (/auto\s*pay|autopay|pago autom[aá]tico|recurring/i.test(doc.flat)) {
      if (/(enrolled|enabled|activ[eo]|on)\b[^\n]{0,20}(auto\s*pay|autopay)|(auto\s*pay|autopay|pago autom[aá]tico)[^\n]{0,25}\b(yes|s[ií]|enrolled|enabled|activ[eo]|on)\b/i.test(doc.flat)) { f.autopay = "SI"; }
    }
    return f;
  }

  /* -------------------------------------------------------- suplementario */

  function productIn(text) {
    var dental = /\bdental\b/i.test(text), vision = /\bvisi[oó]n\b/i.test(text);
    if (/hospital\s*indemnity|indemnizaci[oó]n\s*hospitalaria|hospital\s*(cash|confinement)/i.test(text)) { return "Hospital"; }
    if (/\baccident(al)?\b|accidentes/i.test(text) && !dental) { return "Accident"; }
    if (/\bcancer\b|c[aá]ncer|critical\s*illness/i.test(text) && !dental) { return "Cancer"; }
    if (/short[\s-]?term/i.test(text)) { return "Short Term"; }
    if (dental && vision && /dental\s*(and|&|\+|y|\/)\s*visi[oó]n/i.test(text)) { return "Dental + Vision"; }
    if (dental) { return "Dental"; }
    if (vision) { return "Vision"; }
    return "";
  }

  function extractSupp(doc) {
    var f = {};
    personName(doc, f);
    f.compania = carrierIn("supp", doc.flat);
    f.producto = productIn(doc.flat);
    f.plan = after(doc, [/\bPlan\s*name\b/i, /Nombre del plan/i, /\b(Selected\s*plan|Plan\s*selected)\b/i, /\bProduct\s*name\b/i], vText(70), 1);
    f.prima = after(doc, [/\b(Total\s*)?monthly\s*premium\b/i, /Prima\s*mensual/i, /\bPremium\b/i, /\bPrima\b/i], vMoney, 1);
    f.efectiva = after(doc, [/\b(Requested\s*)?effective\s*date\b/i, /\bCoverage\s*start\s*date\b/i, /Fecha efectiva/i], vDate, 1);
    f.poliza = after(doc, [/\bApplication\s*(ID|number|#|no\.?)/i, /\bPolicy\s*(ID|number|#|no\.?)/i,
      /N[uú]mero de (solicitud|aplicaci[oó]n|p[oó]liza)/i, /\bConfirmation\s*(number|#)/i], vCode(5, 24), 1);
    if (/\bDHMO\b/.test(doc.flat)) { f.tipoPlan = "DHMO"; }
    else if (/\bDPPO\b|\bPPO\b/.test(doc.flat)) { f.tipoPlan = "DPPO"; }
    agentInfo(doc, f);
    return f;
  }

  /* ------------------------------------------------------------ detección */

  var SIGNALS = {
    mc_soa: [[/scope of (sales )?appointment/i, 4], [/alcance de la cita/i, 4], [/\bSOA\b/, 1],
      [/products? (to be )?discussed|productos (a|que se) (tratar|discutir)/i, 1]],
    mc_app: [[MBI_RE, 3], [/medicare (number|claim)|n[uú]mero de medicare/i, 2], [/H-PBP|\b[HR]\d{4}\s?-\s?\d{3}\b/i, 2],
      [/election period|per[ií]odo de elecci[oó]n/i, 2], [/\bpart(e)? [AB]\b/i, 1],
      [/medicare advantage|\b(MAPD|D-SNP|C-SNP|PDP)\b/i, 1],
      [/enrollment (application|request|form|confirmation)|solicitud de inscripci[oó]n/i, 1]],
    oc_elig: [[/eligibility (notice|results|determination)/i, 4], [/aviso de elegibilidad|resultados de (su )?elegibilidad/i, 4],
      [/eligible (to purchase|for advance|for cost|for a tax)/i, 2], [/elegible para (comprar|pagos|un cr[eé]dito|cr[eé]ditos|reducciones)/i, 2],
      [/cost-sharing reductions|reducciones de costos compartidos/i, 1]],
    oc_plans: [[/my plans (&|and) programs/i, 4], [/mis planes y programas/i, 4], [/\byou pay\b|usted paga/i, 2],
      [HIOS_RE, 2], [/plan id|id del plan/i, 1], [/status:\s*active|estado:\s*activo/i, 1],
      [/start date[\s\S]{0,40}end date|fecha de inicio[\s\S]{0,40}fecha de finalizaci/i, 1]],
    oc_app: [[/review (and|&) (sign|confirm|submit)|review your application|application summary|revise su solicitud|resumen de (la|su) solicitud/i, 4],
      [/sign (and|&) submit|firm(e|ar) y env[ií](e|ar)/i, 2], [/tax (filer|household|return)|declaraci[oó]n de impuestos/i, 1],
      [/healthcare\.gov|cuidadodesalud\.gov|health insurance marketplace|mercado de seguros/i, 1],
      [/household (income|information|members)|ingresos del hogar/i, 1]],
    pay: [[/payment (confirmation|receipt|successful|received|complete)|confirmaci[oó]n de(l)? pago|recibo de pago|pago (recibido|exitoso|realizado)/i, 4],
      [/thank you for your payment|gracias por su pago/i, 4], [/amount paid|monto pagado|payment amount/i, 1]],
    supp_app: [[/\bdental\b/i, 1], [/\bvisi[oó]n\b/i, 1], [/hospital indemnity|indemnizaci[oó]n hospitalaria/i, 3],
      [/accident(al)? (insurance|coverage|plan)|seguro de accidentes/i, 3], [/cancer (insurance|plan)|critical illness/i, 3],
      [/short[\s-]?term (medical|health)/i, 3], [/waiting period|per[ií]odo de espera/i, 1], [/\b(DHMO|DPPO)\b/, 2]],
    consent: [[/consent (form|to act|for)|consentimiento/i, 3], [/authorize|autorizo|autorizaci[oó]n/i, 1],
      [/agent of record|agente de registro/i, 1]]
  };

  var FILE_HINTS = [
    [/\bSOA\b|scope/i, "mc_soa"],
    [/elig/i, "oc_elig"],
    [/my[\s_\-]*plans?|plans?[\s_\-]*(and|&|y|n)?[\s_\-]*programs?/i, "oc_plans"],
    [/consent|consentimiento/i, "consent"],
    [/pay(ment)?|pago|receipt|recibo/i, "pay"],
    [/app[\s_\-]*summary|summary|resumen/i, "app"]
  ];

  function fileHint(name) {
    var n = String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-.]+/g, " ");
    for (var i = 0; i < FILE_HINTS.length; i++) { if (FILE_HINTS[i][0].test(n)) { return FILE_HINTS[i][1]; } }
    return "";
  }

  function detect(text, fileName) {
    var scores = {}, flat = String(text || "");
    Object.keys(SIGNALS).forEach(function (t) {
      scores[t] = SIGNALS[t].reduce(function (s, sig) { return s + (sig[0].test(flat) ? sig[1] : 0); }, 0);
    });
    var medicare = scores.mc_app + scores.mc_soa, market = scores.oc_elig + scores.oc_plans + scores.oc_app;
    /* "dental" aparece en casi todo: solo cuenta si no es Medicare ni Mercado */
    if (medicare >= 3 || market >= 3) { scores.supp_app = 0; }
    /* un consent suele mencionar el Mercado; manda si el resto es débil */
    if (scores.consent >= 4 && market < 5 && medicare < 5) { scores.consent += 3; }
    /* un SOA también habla de Medicare Advantage */
    if (scores.mc_soa >= 4) { scores.mc_soa += 3; }

    var hint = fileHint(fileName);
    if (hint === "app") { hint = medicare > market ? "mc_app" : (market > 0 ? "oc_app" : ""); }
    if (hint && scores[hint] != null) { scores[hint] += 3; }

    var best = "unknown", top = 2;
    Object.keys(scores).forEach(function (t) { if (scores[t] > top) { best = t; top = scores[t]; } });
    return best;
  }

  /* ------------------------------------------------------------- entrada */

  var EXTRACTORS = {
    mc_soa: extractSoa, mc_app: extractMcApp, oc_elig: extractElig, oc_plans: extractPlans,
    oc_app: extractOcApp, pay: extractPay, supp_app: extractSupp
  };
  var FALLBACK = { mc: "mc_app", oc: "oc_plans", supp: "supp_app" };

  /* Lee un documento. `currentLine` solo se usa cuando no se reconoce el
     tipo: entonces se intenta con el lector principal de esa línea. */
  function extract(text, fileName, currentLine) {
    var type = detect(text, fileName);
    var doc = makeDoc(text);
    var fields = {}, guessed = false;
    if (EXTRACTORS[type]) {
      fields = EXTRACTORS[type](doc);
    } else if (type === "unknown" && FALLBACK[currentLine] && doc.flat.replace(/\s/g, "").length > 40) {
      fields = EXTRACTORS[FALLBACK[currentLine]](doc);
      guessed = true;
    }
    Object.keys(fields).forEach(function (k) { if (fields[k] === "" || fields[k] == null) { delete fields[k]; } });
    var info = TYPES[type];
    return {
      type: type, label: info.label, line: info.line, net: info.net, guessed: guessed,
      fields: fields, count: Object.keys(fields).length
    };
  }

  /* ------------------------------------------------------- PDF -> texto */

  /* Reconstruye las líneas por su altura en la página y conserva los huecos
     horizontales como espacios, para que las tablas mantengan sus columnas. */
  function itemsToText(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) { return; }
      var x = it.transform[4], y = it.transform[5];
      var h = it.height || Math.abs(it.transform[3]) || 10;
      var row = null;
      for (var i = rows.length - 1; i >= 0 && i >= rows.length - 40; i--) {
        if (Math.abs(rows[i].y - y) <= Math.max(2, h * 0.35)) { row = rows[i]; break; }
      }
      if (!row) { row = { y: y, items: [] }; rows.push(row); }
      row.items.push({ x: x, w: it.width || 0, str: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.items.sort(function (a, b) { return a.x - b.x; });
      var line = "", end = null;
      r.items.forEach(function (it) {
        var cw = it.str.length ? Math.max(2.5, it.w / it.str.length) : 5;
        if (end !== null) {
          var gap = it.x - end;
          if (gap > cw * 1.8) { line += new Array(Math.min(30, Math.max(2, Math.round(gap / cw))) + 1).join(" "); }
          else if (gap > cw * 0.25 && !/\s$/.test(line) && !/^\s/.test(it.str)) { line += " "; }
        }
        line += it.str;
        end = it.x + it.w;
      });
      return line.replace(/\s+$/, "");
    }).join("\n");
  }

  function pdfToText(pdfjsLib, data) {
    return pdfjsLib.getDocument({ data: data, isEvalSupported: false, disableFontFace: true }).promise.then(function (pdf) {
      var pages = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }));
      }
      return Promise.all(pages).then(function (contents) {
        return contents.map(function (c) { return itemsToText(c.items); }).join("\n\n");
      });
    });
  }

  var api = {
    extract: extract, detect: detect, fileHint: fileHint, pdfToText: pdfToText, itemsToText: itemsToText,
    TYPES: TYPES, makeDoc: makeDoc
  };
  root.QA = root.QA || {};
  root.QA.extract = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
