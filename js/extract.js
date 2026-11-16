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
    oc_docs: { label: "Docs Submitted", line: "oc", net: "docsub" },
    oc_quote: { label: "Cotización de HealthSherpa", line: "oc", net: "" },
    pay: { label: "Comprobante de pago", line: "", net: "payment" },
    supp_app: { label: "Aplicación suplementaria", line: "supp", net: "appsummary" },
    supp_card: { label: "ID card", line: "supp", net: "card" },
    consent: { label: "Consent", line: "", net: "consent" },
    unknown: { label: "Documento", line: "", net: "" }
  };

  var MBI_RE = /\b([1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d)[-\s]?([AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d)[-\s]?([AC-HJKMNP-RT-Y]{2}\d{2})\b/;
  var HIOS_RE = /\b(\d{5}[A-Z]{2}\d{7})(?:-?\d{2})?\b/;
  var CONTRACT_RE = /\b([HRS]\d{4})\s?-\s?(\d{3})(?:\s?-\s?(\d{1,3}))?\b/;
  var MONEY_RE = /\$\s?(-?[\d,]+(?:\.\d{2})?)/;

  /* ------------------------------------------------------ modelo de texto */

  /* Encabezado del bloque de campos de formulario que agrega pdfToText */
  var FORM_HEAD = "Campos del formulario:";

  function makeDoc(text) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n")
      .map(function (l) { return l.replace(/\s+$/, ""); });
    /* campos del formulario que agrega pdfToText: { nombre: valor } */
    var form = {}, head = lines.lastIndexOf(FORM_HEAD);
    for (var i = head + 1; head >= 0 && i < lines.length; i++) {
      var m = lines[i].match(/^(.+?): (.*)$/);
      if (m && !(m[1] in form)) { form[m[1]] = m[2].trim(); }
    }
    return {
      lines: lines,
      form: form,
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

  /* Como `after`, pero el orden de los rótulos es su prioridad: el primero
     que dé un valor válido gana, aunque otro rótulo aparezca antes en el
     documento ("Part A effective date" antes de "Proposed effective date"). */
  function afterFirst(doc, labels, validate, look) {
    for (var k = 0; k < labels.length; k++) {
      var v = after(doc, [labels[k]], validate, look);
      if (v) { return v; }
    }
    return "";
  }

  function find(doc, re, group) {
    var m = doc.flat.match(re);
    return m ? String(m[group == null ? 1 : group]).trim() : "";
  }

  /* ---------------------------------------------------------- validadores */

  function vDate(t) { return U.findDate(firstCell(t)) || U.findDate(String(t).slice(0, 40)); }

  /* Fecha de nacimiento: con el año en dos cifras ("2/17/41") no puede
     quedar en el futuro */
  function vBirth(t) {
    var v = vDate(t), y = v ? +v.slice(-4) : 0;
    return y > new Date().getFullYear() ? v.slice(0, 6) + (y - 100) : v;
  }

  /* Sexo del cliente: decide "el cliente" o "la cliente" en la nota */
  function vSex(t) {
    var c = firstCell(t).toLowerCase();
    if (/^(f|female|femenino|mujer)$/.test(c)) { return "a"; }
    if (/^(m|male|masculino|hombre)$/.test(c)) { return "o"; }
    return "";
  }
  var SEX_LABEL = /^\s*(Sex|Gender|Sexo|G[eé]nero)\b/i;

  /* el "$" tiene que estar al principio (40 caracteres); el número se lee
     entero aunque pase de ahí */
  function vMoney(t) {
    var m = String(t).match(MONEY_RE);
    if (m && m.index > 40) { m = null; }
    m = m || firstCell(t).match(/^(-?[\d,]+\.\d{2})$/);
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

  /* Nombre completo con cada palabra en mayúscula inicial ("Jamila Orosco",
     "ANA TORRES", "Ana Maria de la Cruz"): descarta frases sueltas como
     "Paperless consent agreement signed" o "No Dependents added". */
  function vPerson(t) {
    var c = vFullName(t);
    return c && c.split(/\s+/).every(function (w) { return /^[A-ZÁÉÍÓÚÑÜ]/.test(w) || /^(de|del|la|las|los|y|da|dos|van|von)$/i.test(w); }) ? c : "";
  }

  /* "Apellido(s), Nombre(s)" como lo escriben las aplicaciones en papel */
  function vLastFirst(t) {
    var m = firstCell(t).match(/^([^,]+),\s*([^,]+)$/);
    return m && vPerson(m[2] + " " + m[1]) ? m[1].trim() + ", " + m[2].trim() : "";
  }

  /* Un beneficiario es una persona, con o sin el parentesco entre paréntesis:
     "Collantes, Pedro (husband)", "Osvaldo Molina". */
  function vBeneficiary(t) {
    var c = firstCell(t), name = c.replace(/\s*\([^)]*\)\s*$/, "");
    return vLastFirst(name) || vPerson(name) ? c : "";
  }

  /* Nombre de un médico tal como lo escribe la aplicación ("Dr. Ana Ruiz",
     "RUIZ ANA MD", "Ruiz, Ana, MD"). Rechaza rótulos y frases sueltas
     ("PCP ID", "(PCP)", "will be"). */
  var NOT_DOCTOR = /\b(pcp|npi|id|number|primary|care|physician|provider|doctor|patient|current|clinic|center|location|will|be|you|your|the|or|if|this|select|choose|auto|assigned|yes|no|none)\b/i;

  function vDoctor(t) {
    var c = firstCell(t).replace(/[,;:]+$/, "");
    if (/[:?()]/.test(c) || NOT_DOCTOR.test(c)) { return ""; }
    return vFullName(c.replace(/,\s*/g, " ")) ? c : "";
  }

  /* Nombre de un plan de Medicare: trae el tipo (HMO, PPO, SNP…) o el
     contrato; se quita el precio que algunas aplicaciones ponen al lado. */
  var PLAN_KIND = /\b(HMO|PPO|PDP|PFFS|MSA|SNP|MAPD)\b|medicare advantage|\b[HRS]\d{4}\s?-\s?\d{3}\b/i;

  function vPlan(t) {
    var c = firstCell(t).replace(/\s+\$\s?[\d,]+(\.\d{2})?\b.*$/, "").trim();
    if (c.length < 5 || c.length > 100 || /[:?]$/.test(c) || /\b(you|your|will|would|if|please)\b/i.test(c)) { return ""; }
    return PLAN_KIND.test(c) ? c : "";
  }

  /* Un ID con puntuación pegada al final ("…EAXH6K4Y.") */
  function vId(t) { return vCode(5, 24)(firstCell(t).replace(/[.,;:]+$/, "")); }

  /* ------------------------------------------------------- piezas comunes */

  /* "Parent/Legal Guardian", "Guardian’s Signature": es el tutor, no la
     compañía Guardian */
  var GUARDIAN_PERSON = /\b(?:parent|legal)\s*(?:\/|or|and)?\s*(?:legal\s*)?guardian\b|\bguardian(?=\s*(?:['’`]s\b|if\b|\(|of\b|signature))|guardianship/gi;

  function carrierIn(line, text) {
    var list = C.CARRIERS[line] || [];
    var best = null, bestAt = Infinity;
    text = String(text).replace(GUARDIAN_PERSON, "");
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
    var npn = find(doc, /\bNPN\b(?:\s*(?:#|number|no\.?|n[uú]mero))?\s*[:#]?\s*(\d{5,12})\b/i) ||
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

  function periodsIn(t) {
    var out = [];
    PERIODS.forEach(function (p) { if (p[0].test(t) && out.indexOf(p[1]) < 0) { out.push(p[1]); } });
    return out;
  }

  /* El valor de "Election period": un período, no la lista de opciones
     ("ICEP/IEP  AEP  MA OEP  SEP", con la casilla dibujada) ni una frase. */
  function vPeriod(t) {
    var c = firstCell(t);
    return periodsIn(t).length === 1 && c.length <= 40 ? periodFrom(c) : "";
  }

  var PERIOD_CODE = /\b(AEP|ICEP|IEP|MA[\s-]?OEP|OEP|SEP)\b/;

  function mcPeriod(doc) {
    var per = afterFirst(doc, [/(?:^\s*|\s{2,})Per[ií]odo de elecci[oó]n/i, /(?:^\s*|\s{2,})Election\s*(period|type)\b/i,
      /(?:^\s*|\s{2,})(Proposed\s*)?Enrollment\s*period\b/i], vPeriod, 1);
    if (per) { return per; }
    var marked = doc.flat.match(/(annual|initial|special|open)[^\n]{0,40}(election|enrollment)\s*period[^\n]{0,12}\b(yes|s[ií]|x|✔|selected)\b/i);
    if (marked) { return periodFrom(marked[0]); }
    /* el código solo en una línea corta ("AEP" en el encabezado) */
    for (var i = 0; i < doc.lines.length; i++) {
      var l = doc.lines[i].trim();
      if (l.length <= 30 && PERIOD_CODE.test(l) && periodsIn(l).length === 1) { return periodFrom(l); }
    }
    return "";
  }

  /* Nombre del agente en formatos que agentInfo no cubre: "Agent Signature :
     Nombre", un bloque "Agent" seguido de "Name …", o la tabla de dos
     columnas donde el rótulo "Agent First / Name:" ocupa dos líneas y el
     apellido de la otra columna queda partido arriba y abajo:
       Agent First            APELLIDO1
       NOMBRE         Agent Last Name:
       Name:                  APELLIDO2 */
  function mcAgent(doc) {
    var a = after(doc, [/^\s*Agent\s*Signature\s*:/i], vFullName, 0) ||
            after(doc, [/^\s*Agent\s*:?\s*$/i], function (t) { return vFullName(String(t).replace(/^Name\b\s*:?\s*/i, "")); }, 1);
    if (a) { return a; }
    for (var i = 0; i + 2 < doc.lines.length; i++) {
      var top = doc.lines[i].match(/^\s*Agent\s*First\s*:?\s*(.*)$/i);
      var mid = top && doc.lines[i + 1].match(/^\s*(.*?)\s{2,}Agent\s*Last\s*Name\s*:?\s*$/i);
      var low = mid && doc.lines[i + 2].match(/^\s*Name\s*:?\s*(.*)$/i);
      var first = low ? vName(mid[1]) : "";
      var last = first ? [vName(top[1]), vName(low[1])].filter(Boolean).join(" ") : "";
      if (last) { return first + " " + last; }
    }
    return "";
  }

  function extractMcApp(doc) {
    var f = {};
    personName(doc, f);
    if (!f.nombres) {
      /* resumen en dos columnas: "Beneficiary  Nombre Apellido" */
      var ben = after(doc, [/^\s*Beneficiary\s+(?=\S)/i], vFullName, 0);
      if (ben) { setName(f, ben); }
    }

    var mbi = doc.flat.match(MBI_RE);
    if (mbi) { f.mbi = (mbi[1] + mbi[2] + mbi[3]).toUpperCase(); }

    f.parteA = after(doc, [/\(?\bPart(e)?\s*A\b\)?/i, /Hospital\s*\(Part(e)?\s*A\)/i], vDate, 1);
    f.parteB = after(doc, [/\(?\bPart(e)?\s*B\b\)?/i, /Medical\s*\(Part(e)?\s*B\)/i], vDate, 1);

    /* la fecha propuesta manda; "Effective date" a secas no vale si es la
       de la Parte A o B */
    f.efectiva = afterFirst(doc, [/Fecha de entrada en vigencia propuesta/i,
      /\b(Requested|Proposed)\s*(effective|start|coverage\s*start)\s*date\b/i,
      /\bCoverage\s*(start|effective)\s*date\b/i, /Fecha de inicio de (la )?cobertura/i,
      /^(?!.*\b(Part(e)?\s*[AB]|Hospital|Medical)\b).*?\bEffective\s*date\b/i, /Fecha efectiva/i], vDate, 1);

    f.plan = afterFirst(doc, [/Nombre del plan/i, /\bPlan\s*name\b/i, /\b(Selected\s*plan|Plan\s*selected)\b/i,
      /Plan (elegido|seleccionado)/i, /\bselected the following plan\b/i], vPlan, 1) ||
      after(doc, [/(?:^|\s{2,})Plan\b\s*:?(?=\s+\S)/], vPlan, 0);
    if (!f.plan) {
      /* sin rótulo: una línea corta del encabezado que nombre el tipo de plan */
      for (var i = 0; i < doc.lines.length && i < 15; i++) {
        var l = doc.lines[i].trim();
        if (l.length > 8 && l.length < 90 && /\((HMO|PPO|PDP|HMO[\s-]?POS|HMO[\s-]?D-?SNP|HMO[\s-]?C-?SNP|PPO[\s-]?D-?SNP|RPPO|PFFS)\)|\b(HMO|PPO|PDP|D-SNP|C-SNP)\b/.test(l) && !/^[^a-z]+$/.test(l)) {
          f.plan = firstCell(l); break;
        }
      }
    }

    /* el contrato (H-PBP) va dentro del nombre del plan, si no lo trae ya */
    var ct = doc.flat.match(CONTRACT_RE);
    if (ct) {
      var contrato = ct[1] + "-" + ct[2] + (ct[3] ? "-" + ct[3] : "");
      var base = ct[1] + "-" + ct[2];
      if (!f.plan) { f.plan = contrato; }
      else if (f.plan.toUpperCase().replace(/\s+/g, "").indexOf(base.toUpperCase()) < 0) { f.plan += " " + contrato; }
    }

    f.medicaid = after(doc, [/N[uú]mero de (ID de )?Medicaid/i, /\bMedicaid\s*(ID|number|#)/i], vCode(6, 14), 1);

    var per = mcPeriod(doc);
    if (per) { f.periodoMC = per; }

    f.pcp = afterFirst(doc, [/Nombre del PCP/i, /\bPCP\s*name\b/i, /\bPrimary\s*care\s*(physician|provider|doctor)(\s*name)?\b/i,
      /M[eé]dico de atenci[oó]n primaria/i], vDoctor, 1);
    f.pcpId = afterFirst(doc, [/ID del PCP/i, /\bPCP\s*(ID|number|#)/i, /\bPrimary\s*Care\s*ID\b/i, /\bProvider\s*ID\b/i], vCode(4, 16), 1);

    /* App ID: el número de confirmación o el código de la aplicación */
    f.confirmacion = afterFirst(doc, [/\bConfirmation\s*(number|#|no\.?|ID)/i, /N[uú]mero de confirmaci[oó]n/i,
      /\bconfirmation\s*code(\s*is)?\b/i, /\bEnrollment\s*code\b/i, /\bApplication\s*ID\b/i], vId, 1);
    f.prima = afterFirst(doc, [/Prima mensual total/i, /Prima del plan/i, /\b(Total\s*)?monthly\s*(plan\s*)?premium\b/i,
      /\bPlan\s*premium\b/i, /^\s*Premium\b/i], vMoney, 1);
    if (!f.prima) {
      var pm = find(doc, /\$\s?([\d,]+\.\d{2})\s*(?:per\s*month|\/\s*mo(?:nth)?)\b/i);
      if (pm) { f.prima = U.parseMoney(pm); }
    }

    var sex = after(doc, [SEX_LABEL], vSex, 1);
    if (sex) { f.genero = sex; }
    contactInfo(doc, f);
    agentInfo(doc, f);
    if (!f.agente) {
      var ag = mcAgent(doc);
      if (ag) { f.agente = ag.toUpperCase(); }
    }
    f.compania = carrierIn("mc", (f.plan || "") + "\n" + doc.flat);
    /* CMD: plan para condiciones crónicas (C-SNP). Con el plan leído manda
       su nombre: un D-SNP no lo es aunque la aplicación hable de C-SNP. */
    var csnp = f.plan ? /\bC-?SNP\b/i.test(f.plan) : /chronic|cr[oó]nica/i.test(doc.flat) && /C-?SNP/i.test(doc.flat);
    if (csnp) { f.cmd = true; }
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

  /* Tipo de inconsistencia (como en config.MKPL_DOCS) según las palabras
     que usa la carta del Mercado. */
  var DOC_KINDS = [
    [/income|ingresos?/i, "income"],
    [/citizenship|ciudadan[ií]a/i, "citizenship"],
    [/immigration|inmigraci[oó]n|migratori/i, "immigration"],
    [/social security number|\bSSN\b|n[uú]mero de seguro social/i, "ssn"],
    [/american indian|alaska native|ind[ií]gena/i, "aian"],
    [/job[\s-]based|employer|empleador|cobertura del trabajo/i, "esi"],
    [/medicaid|\bCHIP\b/i, "medicaid"],
    [/medicare/i, "medicare"],
    [/tricare/i, "tricare"],
    [/veterans|\bVA\b/i, "va"],
    [/peace corps/i, "peace"]
  ];

  function kindOf(text) {
    var k = DOC_KINDS.filter(function (x) { return x[0].test(text); })[0];
    return k ? k[1] : "";
  }

  /* Celdas de una línea (separadas por 2 o más espacios) con su columna. */
  function cellsAt(line) {
    var out = [], re = /\S+(?: \S+)*/g, m;
    while ((m = re.exec(line)) !== null) { out.push({ text: m[0], col: m.index }); }
    return out;
  }

  /* Columnas de los puntos (•) que siguen a un texto en la línea. */
  function bulletCols(line) {
    var out = [];
    for (var i = 1; i < line.length; i++) {
      if (/[•●]/.test(line[i]) && /\s/.test(line[i - 1]) && /\S/.test(line.slice(0, i))) { out.push(i); }
    }
    return out;
  }

  /* Las personas de la tabla de resultados: la fila (o las dos filas, nombres
     y apellidos) justo encima de la primera línea con puntos. */
  function noticePeople(doc) {
    var g = -1;
    for (var i = 0; i < doc.lines.length; i++) { if (bulletCols(doc.lines[i]).length) { g = i; break; } }
    var isNames = function (l) {
      var cs = l != null ? cellsAt(l) : [];
      return cs.length && cs.every(function (c) { return !/[\d$:\/]/.test(c.text) && vName(c.text); }) ? cs : null;
    };
    var last = g > 0 ? isNames(doc.lines[g - 1]) : null;
    if (!last) { return []; }
    var firsts = g > 1 ? isNames(doc.lines[g - 2]) : null;
    if (firsts && firsts.length === last.length) {
      return firsts.map(function (c, k) { return { name: c.text + " " + last[k].text, col: c.col }; });
    }
    return last.map(function (c) { return { name: c.text, col: c.col }; });
  }

  /* De quién es una fila: con las columnas de pdfToText (los nombres no
     empiezan al margen), quien está a la izquierda de cada punto; sin ellas
     (texto pegado), todos si hay un punto por persona, la única persona del
     hogar, o nadie si no se sabe. */
  function rowPeople(people, cols) {
    var placed = people.length && people[0].col >= 20;
    if (placed) {
      return cols.map(function (b) {
        var p = people.filter(function (x) { return x.col <= b + 3; }).pop();
        return p ? p.name : "";
      });
    }
    if (people.length && cols.length === people.length) { return people.map(function (p) { return p.name; }); }
    return [people.length === 1 ? people[0].name : ""];
  }

  /* Filas de ACTION del aviso: "By February 20, 2027, submit documents to
     confirm citizenship." o "Antes del 20 de febrero de 2027, envíe
     documentos para confirmar su ciudadanía.", con el punto en la misma
     línea o en las dos siguientes. */
  var DMI_ROWS = [
    /\bBy\s+([A-Za-z]{3,12}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(?:submit|send|upload)\s+(?:the\s+)?documents?\s+to\s+confirm\s+([^.]+)/i,
    /\bAntes del?\s+(\d{1,2}\s+de\s+[A-Za-záéíóú]{3,12}\s+de\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(?:env[ií]e|presente|suba)\s+(?:los\s+)?documentos?\s+para\s+confirmar\s+([^.]+)/i
  ];
  function actionDocs(doc) {
    var people = noticePeople(doc), docs = [];
    doc.lines.forEach(function (l, i) {
      var head = l.replace(/\s{2,}[•●][\s•●]*$/, "");
      var text = head + " " + (doc.lines[i + 1] || "").replace(/\s{2,}[•●][\s•●]*$/, "");
      var m = null;
      /* la fila empieza en esta línea; la siguiente solo completa el tipo */
      DMI_ROWS.some(function (re) { m = text.match(re); if (m && m.index >= head.length) { m = null; } return !!m; });
      var cat = m ? kindOf(m[2]) : "";
      if (!cat) { return; }
      var cols = [];
      for (var j = i; j <= i + 2 && j < doc.lines.length && !cols.length; j++) {
        if (j > i && DMI_ROWS.some(function (re) { return re.test(doc.lines[j]); })) { break; }
        cols = bulletCols(doc.lines[j]);
      }
      var fecha = U.parseDate(m[1]) || U.parseDateWords(m[1]);
      rowPeople(people, cols).forEach(function (name) {
        var persona = name.toUpperCase();
        if (docs.some(function (x) { return x.cat === cat && x.persona === persona; })) { return; }
        docs.push({ cat: cat, persona: persona, fecha: fecha });
      });
    });
    return docs;
  }

  /* La carta trae detrás la guía (MARKETPLACE ELIGIBILITY GUIDE): sus
     ejemplos hablan de ingresos y de documentos que nadie pidió. Los datos
     se buscan antes de la guía. */
  function noticePart(doc) {
    for (var i = 0; i < doc.lines.length; i++) {
      if (/^\s*MARKETPLACE ELIGIBILITY GUIDE\s*$/.test(doc.lines[i])) { return makeDoc(doc.lines.slice(0, i).join("\n")); }
    }
    return doc;
  }

  function extractElig(doc) {
    var f = {};
    f.appId = appId(doc);
    doc = noticePart(doc);
    /* "Estimated 2027 income used to determine eligibility" */
    f.anio = planYear(doc) || find(doc, /\bEstimated[ \t]+(20[2-4]\d)[ \t]+income\b/i);

    var dear = find(doc, /(?:^|\n)\s*(?:Dear|Estimad[oa](?:\(a\))?)\s+([^\n:,]{3,60})[:,]/i);
    if (dear && vFullName(dear)) { setName(f, dear); }
    else {
      /* "Primary contact" con el nombre en la línea de abajo */
      var pc = after(doc, [/^\s*(Primary contact|Contacto principal)\b/i], vPerson, 1);
      if (pc) { setName(f, pc); }
    }

    var inc = doc.flat.match(/(?:yearly|annual)\s*(?:household\s*)?income\s*(?:of|is|:)?\s*\$\s?([\d,]+(?:\.\d{2})?)/i) ||
              doc.flat.match(/ingresos?\s*anual(?:es)?(?:\s*del\s*hogar)?\s*(?:de|es|:)?\s*\$\s?([\d,]+(?:\.\d{2})?)/i) ||
              /* el ingreso estimado va unas líneas abajo, como "$31,200/year" */
              doc.flat.match(/\bEstimated[^\n]{0,12}income used to determine[^\n]*(?:\n[^\n]*){0,3}?\n\$\s?([\d,]+(?:\.\d{2})?)\s*\/\s*year\b/i);
    if (inc) { f.ingreso = U.parseMoney(inc[1]); }
    var size = find(doc, /household size (?:of|is|:)?\s*(\d{1,2})\b/i) || find(doc, /tama[nñ]o del hogar (?:de|es|:)?\s*(\d{1,2})\b/i);
    if (size) { f.hogar = size; }

    /* Documentos que pide el Mercado: las filas de ACTION del aviso o, en
       otras cartas, por cada fila, la persona, el tipo y la fecha tope. Si
       la carta no trae tabla, la fecha general. */
    var action = actionDocs(doc);
    if (action.length) { f.docs = action; return f; }
    var ask = /send (the marketplace )?(us )?(more information|documents|proof)|data matching|we need more information|env[ií]e(nos)? .{0,30}(documentos|informaci[oó]n|prueba)|necesitamos m[aá]s informaci[oó]n/i;
    if (ask.test(doc.flat)) {
      var by = doc.flat.match(/(?:send|submit|upload|provide)[^\n.]{0,80}?\b(?:by|before|no later than)\s+([A-Za-z]{3,12}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i) ||
               doc.flat.match(/(?:env[ií]e|enviar|presentar|suba)[^\n.]{0,80}?\b(?:antes del?|a m[aá]s tardar el?|hasta el?)\s+(\d{1,2}\s+de\s+[A-Za-záéíóú]{3,12}\s+de\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      var general = by ? (U.parseDate(by[1]) || U.parseDateWords(by[1])) : "";
      var docs = [];
      doc.lines.forEach(function (l) {
        if (!/proof|document|verify|confirm|prueba|verificar|confirmar|deadline|fecha/i.test(l)) { return; }
        DOC_KINDS.forEach(function (k) {
          if (!k[0].test(l)) { return; }
          /* el rótulo de la fila ("Proof of yearly income") no es una persona */
          var person = vPerson(firstCell(l));
          if (/proof|document|verify|confirm|prueba|verificar|confirmar|deadline|fecha/i.test(person) || kindOf(person)) { person = ""; }
          var ds = datesIn(l);
          if (docs.some(function (x) { return x.cat === k[1] && x.persona === person; })) { return; }
          docs.push({ cat: k[1], persona: person.toUpperCase(), fecha: ds.length ? ds[ds.length - 1].value : general });
        });
      });
      if (docs.length) { f.docs = docs; }
    }
    return f;
  }

  var PLAN_STOP = /^(status|estado|active|activo|pending|pendiente|terminated|cancell?ed|health|salud|dental|marketplace|mercado|plans?|planes|my plans|mis planes|members?|miembros?|coverage|cobertura|view|ver|change|cambiar|go to|ir a|premium|prima|you pay|usted paga|plan id|id del plan)\b/i;

  /* Enlaces y menú de la cuenta del Mercado que quedan entre el nombre del
     plan y su ID ("Go to my plan benefits", "Communication preferences" a la
     izquierda): se saltan, no son el plan. */
  var PLAN_SKIP = /^(go to my plan benefits|communication|preferences|communication preferences|exemptions|mailing address|tax forms|report a life change|eligibility & appeals|applications? details|my plan profile|marketplace plans)$/i;

  /* El nombre del plan está justo encima de su ID; puede ocupar dos líneas
     cuando trae la descripción de beneficios entre paréntesis. */
  function planAboveId(doc) {
    for (var i = 0; i < doc.lines.length; i++) {
      var m = doc.lines[i].match(HIOS_RE);
      if (!m) { continue; }
      var before = doc.lines[i].slice(0, m.index).replace(/(plan\s*id|id del plan)\s*[:#]?\s*$/i, "").trim();
      var parts = [];
      if (before.length > 4 && !PLAN_STOP.test(before) && !PLAN_SKIP.test(before)) { parts.push(before); }
      for (var j = i - 1; !parts.length && j >= 0 && j >= i - 4; j--) {
        var c = firstCell(doc.lines[j]);
        if (!c || PLAN_SKIP.test(c)) { continue; }
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
    if (p && p.name) { f.plan = p.name; }
    if (!f.plan) { f.plan = after(doc, [/\bPlan\s*name\b/i, /Nombre del plan/i, /\bSelected\s*plan\b/i], vText(90), 1); }

    /* Prima mensual: lo que paga el cliente; si no aparece, prima menos crédito */
    var pay = after(doc, [/\bYou\s*pay\b/i, /Usted\s*paga/i, /\bYour\s*(monthly\s*)?(payment|cost|premium)\b/i, /(Prima|Monto)\s*a\s*pagar/i], vMoney, 1);
    if (!pay) {
      var total = U.moneyNumber(after(doc, [/\b(Base|Total|Full|Monthly)\s*premium\b/i, /Prima\s*(total|mensual|base)/i, /^\s*Premium\b(?!\s*tax)/i], vMoney, 1));
      var credit = U.moneyNumber(after(doc, [/Premium\s*tax\s*credit/i, /\bAPTC\b/, /Cr[eé]dito\s*(fiscal|tributario)/i], vMoney, 1)) || 0;
      if (total !== null) { pay = U.parseMoney(Math.max(0, total - credit)); }
    }
    if (pay) { f.prima = pay; }
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
    } else {
      f.efectiva = after(doc, [/\b(Coverage\s*)?start\s*date\b/i, /\bEffective\s*date\b/i, /Fecha de inicio/i, /Fecha efectiva/i], vDate, 1);
    }

    var st = doc.flat.match(/(?:^|\n)\s*(?:status:\s*|estado:\s*)?(active|activo|pending|pendiente|unpaid binder|terminated|cancell?ed|canceled)\s*(?:\n|$)/i);
    if (st) { f.estado = { activo: "Active", pendiente: "Pending" }[st[1].toLowerCase()] || U.titleCase(st[1]).replace("Binder", "binder"); }
    f.compania = carrierIn("oc", (f.plan || "") + "\n" + doc.flat);
    f.anio = planYear(doc) || (f.efectiva ? f.efectiva.slice(-4) : "");
    if (/healthsherpa/i.test(doc.flat)) { f.plataforma = "HealthSherpa"; }
    else if (/healthcare\.gov|cuidadodesalud\.gov/i.test(doc.flat)) { f.plataforma = "MKPL"; }
    return f;
  }

  function extractOcApp(doc) {
    var f = {};
    f.appId = appId(doc);
    /* el resumen impreso de HealthCare.gov dice el año en el ingreso o en
       los taxes: "Estimated income next year (2027)", "Filing a 2027 tax return" */
    f.anio = planYear(doc) || find(doc, /\bincome next year \((20[2-4]\d)\)/i) || find(doc, /\bFiling a (20[2-4]\d) tax return\b/i);
    personName(doc, f);
    if (!f.nombres) {
      var full = after(doc, [/^\s*Full\s*name\s*$/i], vPerson, 1);
      if (full) { setName(f, full); }
    }
    f.ingreso = annualIncome(doc);
    f.hogar = after(doc, [/\bHousehold\s*size\b/i, /\bTax\s*household\s*size\b/i, /Tama[nñ]o del hogar/i,
      /Personas en (el|su) hogar/i], vDigits(1, 2), 1);
    /* fecha de nacimiento y dirección del contacto del hogar (el titular):
       sirven de base para saber qué cambió */
    f.dob = after(doc, [/\bDate\s*of\s*birth\b/i, /Fecha\s*de\s*nacimiento/i], vBirth, 1);
    f.direccion = after(doc, [/\bHome\s*address\b/i, /Direcci[oó]n\s*(de\s*(la\s*)?casa|del\s*hogar|residencial)/i], vAddress, 1);
    /* teléfono y email del contacto del hogar: van a Teléfono y Email del
       titular, y quedan como base para Cambios */
    contactInfo(doc, f);
    if (/healthsherpa/i.test(doc.flat)) { f.plataforma = "HealthSherpa"; }
    else if (/healthcare\.gov|cuidadodesalud\.gov/i.test(doc.flat)) { f.plataforma = "MKPL"; }
    /* el agente o broker que envió la aplicación, con su NPN */
    agentInfo(doc, f);
    if (f.npn && !f.agente) {
      var ag = nameBeforeNpn(doc);
      if (ag) { f.agente = ag.toUpperCase(); }
    }
    var ps = householdPeople(doc, f);
    if (ps.length) {
      f.personas = ps;
      /* con una sección por persona, el ingreso y el DOB del titular son los
         de su sección: los primeros del documento pueden ser de otro */
      var tp = ps.filter(function (p) { return p.titular; })[0] || {};
      f.ingreso = tp.ingreso || "";
      f.dob = tp.dob || "";
    }
    return f;
  }

  /* El ingreso anual: el estimado para el año que viene manda; nunca el del
     mes ("This month's total income (November 2026)  $2,600.00"). */
  /* "month" también como lo lee mal el OCR ("rnonth") */
  var MONTHLY = /\b(m|rn)onth|\bmes\b|\bmensual/i;

  /* Teléfono, email y dirección del cliente: se buscan antes del bloque del
     agente, que trae los suyos. */
  var AGENT_BLOCK = /^\s*(Agent|Broker|Agente|Producer)\b|agent\s*or\s*broker|Informaci[oó]n del agente|agente\s*o\s*corredor/i;
  function contactInfo(doc, f) {
    var stop = -1;
    for (var i = 0; i < doc.lines.length; i++) { if (AGENT_BLOCK.test(doc.lines[i])) { stop = i; break; } }
    var d = stop > 0 ? makeDoc(doc.lines.slice(0, stop).join("\n")) : doc;
    var email = after(d, [/\bE-?mail(\s*address)?\b/i, /Correo\s*electr[oó]nico/i], vEmail, 1);
    var tel = after(d, [/\bPhone\s*numbers?,?(\s*\(s\))?(\s*including\s*area\s*code)?/i, /\b(Primary\s*)?Phone\b/i, /Tel[eé]fonos?(\s*\(s\))?/i], vPhone, 1);
    if (email) { f.clienteEmail = email; }
    if (tel) { f.clienteTel = tel; }
  }

  /* "4. Resident Address: 700 Palmetto Rd     Venice     FL     34285" */
  function vAddressRow(t) {
    var cells = String(t || "").trim().split(/\s{2,}|\t/);
    var n = cells.length;
    if (n >= 4 && /^[A-Z]{2}$/.test(cells[n - 2]) && /^\d{5}(-\d{4})?$/.test(cells[n - 1]) && vAddress(cells[0])) {
      return cells[0] + ", " + cells[n - 3] + ", " + cells[n - 2] + " " + cells[n - 1];
    }
    return vAddress(t);
  }
  function annualIncome(doc) {
    var v = afterFirst(doc, [/\bEstimated\s*income\s*next\s*year\b/i, /\bIngresos?\s*estimados?\s*(para\s*)?el\s*pr[oó]ximo\s*a[nñ]o\b/i], vMoney, 1);
    if (v) { return v; }
    var yearly = { lines: doc.lines.map(function (l) { return MONTHLY.test(l) ? "" : l; }) };
    /* "Annual income" es el título: el monto viene debajo de su rótulo */
    return afterFirst(yearly, [/^\s*(Annual|Yearly)\s*income\s*$/i, /^\s*Ingresos?\s*anual(es)?\s*$/i], vMoney, 2) ||
      afterFirst(yearly, [/\b(Expected\s*)?(yearly|annual|total)\s*(household\s*)?income\b/i, /\bHousehold\s*income\b/i,
        /Ingresos?\s*(anual(es)?|total(es)?|del hogar)/i], vMoney, 1);
  }

  /* El nombre del agente justo encima de su NPN ("Full name  Laura Gomez") */
  function nameBeforeNpn(doc) {
    for (var i = 0; i < doc.lines.length; i++) {
      if (!/\bNPN\b|National Producer Number/i.test(doc.lines[i])) { continue; }
      for (var j = i - 1; j >= 0 && j >= i - 3; j--) {
        var n = vPerson(cleanLead(doc.lines[j].replace(/^\s*(Full\s*)?name\b|^\s*Nombre(\s*completo)?\b/i, "")));
        if (n) { return n; }
      }
    }
    return "";
  }

  /* Parentesco: "Luis's spouse" dice qué es esa persona de Luis. */
  var KIN = [[/^(spouse|husband|wife|domestic partner)$/, "Cónyuge"], [/^(child|son|daughter|stepchild|stepson|stepdaughter)$/, "Hijo/a"],
    [/^(parent|mother|father|stepparent|stepmother|stepfather)$/, "Padre/Madre"], [/^(sibling|brother|sister|stepbrother|stepsister)$/, "Hermano/a"]];
  /* y al revés: si el titular es "Sofia's parent", Sofia es su hija */
  var KIN_BACK = { "Cónyuge": "Cónyuge", "Hijo/a": "Padre/Madre", "Padre/Madre": "Hijo/a", "Hermano/a": "Hermano/a" };
  function kinOf(word) {
    var w = String(word || "").toLowerCase();
    for (var i = 0; i < KIN.length; i++) { if (KIN[i][0].test(w)) { return KIN[i][1]; } }
    return w ? "Otro" : "";
  }
  function relations(lines) {
    var out = [];
    lines.forEach(function (l) {
      var m = l.trim().match(/^([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñü\-]+)['’]s\s+([a-z]+(?:\s+partner)?)\b/);
      if (m && !/^(tax|ZUZ)$/i.test(m[2])) { out.push({ of: m[1], kin: kinOf(m[2]) }); }
    });
    return out;
  }

  /* Estatus en EE. UU.: ciudadano, o el documento migratorio */
  function usStatus(sec) {
    var c = after(sec, [/\bU\.?\s?S\.?\s*citizen\s*or\s*U\.?\s?S\.?\s*national\b/i, /ciudadano\s*(estadounidense|de\s*(los\s*)?(EE\.?\s?UU|Estados\s*Unidos))/i],
      function (t) { var m = firstCell(t).match(/^(yes|no|s[ií])$/i); return m ? m[1].toLowerCase() : ""; }, 1);
    if (c === "yes" || c === "sí" || c === "si") { return "ciudadano"; }
    if (/I-?551\b|Permanent\s*Resident|Green\s*Card|Residente\s*permanente|Tarjeta\s*verde/i.test(sec.flat)) { return "residente"; }
    if (/I-?766\b|Employment\s*Authori[sz]ation|Autorizaci[oó]n\s*de\s*empleo|Permiso\s*de\s*trabajo/i.test(sec.flat)) { return "permiso"; }
    return "";
  }

  /* Las personas del hogar del resumen de HealthCare.gov: cada una tiene su
     sección, que empieza con su nombre y el rótulo "Name". La primera que
     coincide con el contacto del hogar es el titular. */
  function householdPeople(doc, f) {
    var starts = [];
    doc.lines.forEach(function (l, i) { if (/^\s*(Name|Nombre)\s*$/i.test(l)) { starts.push(i); } });
    var titFirst = U.stripAccents(f.nombres || "").split(" ")[0];
    var people = starts.map(function (s, k) {
      var end = k + 1 < starts.length ? starts[k + 1] - 1 : doc.lines.length;
      var lines = doc.lines.slice(s, end);
      var sec = makeDoc(lines.join("\n"));
      var name = vName(cleanLead(lines[1] || "")) || "";
      var dob = after(sec, [/\bDate\s*of\s*birth\b/i, /Fecha\s*de\s*nacimiento/i], vBirth, 1);
      return { name: name, first: U.stripAccents(name.split(" ")[0]), rel: relations(lines), estatus: usStatus(sec), ingreso: annualIncome(sec), dob: dob,
               sex: after(sec, [SEX_LABEL], vSex, 1) };
    });
    var t = 0;
    for (var i = 0; i < people.length; i++) { if (titFirst && people[i].first.toUpperCase() === titFirst.toUpperCase()) { t = i; break; } }
    var tit = people[t];
    if (tit && tit.sex) { f.genero = tit.sex; }
    return people.map(function (p, i) {
      var o = {};
      if (i === t) {
        o.nombre = U.collapse((f.nombres || "") + " " + (f.apellidos || "")) || p.name.toUpperCase();
        o.titular = true;
      } else {
        if (!p.name) { return null; }
        o.nombre = p.name.toUpperCase();
        var mine = tit && p.rel.filter(function (r) { return r.of.toUpperCase() === tit.first.toUpperCase(); })[0];
        var theirs = tit && tit.rel.filter(function (r) { return r.of.toUpperCase() === p.first.toUpperCase(); })[0];
        var kin = mine ? mine.kin : theirs ? (KIN_BACK[theirs.kin] || "Otro") : "";
        if (kin) { o.parentesco = kin; }
      }
      if (p.dob) { o.dob = p.dob; }
      if (p.estatus) { o.estatus = p.estatus; }
      if (p.ingreso) { o.ingreso = p.ingreso; }
      return o;
    }).filter(Boolean);
  }

  /* "beatriz.diaz@example.com"; uno mal leído por el OCR no pasa */
  function vEmail(t) {
    var m = String(t || "").match(/(^|[\s:<(])([A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(?=$|[\s>),;])/);
    return m ? m[2].toLowerCase() : "";
  }

  /* "Mobile: (305) 555-0147", "305.555.0147", "+1 305-555-0147" -> "(305) 555-0147" */
  function vPhone(t) {
    var c = String(t || "").replace(/^\s*(mobile|cell|home|work|m[oó]vil|celular|casa|trabajo)\s*:?\s*/i, "");
    var m = c.match(/^(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/);
    /* un 800, 888… es la línea del Mercado o de la compañía, no el cliente */
    if (!m || /^8(00|33|44|55|66|77|88)$/.test(m[1])) { return ""; }
    return "(" + m[1] + ") " + m[2] + "-" + m[3];
  }

  /* una dirección tiene número y calle: "123 Main St, Miami, FL 33101" */
  function vAddress(t) {
    var c = firstCell(t);
    return c.length >= 6 && c.length <= 120 && /\d/.test(c) && /[A-Za-z]{2}/.test(c) && !LABELISH.test(c) ? c : "";
  }

  /* ------------------------------------------------------- Docs Submitted */

  function sameFirst(a, b) {
    var w = function (s) { return U.stripAccents(String(s || "")).trim().split(/\s+/)[0].toUpperCase(); };
    return !!w(a) && w(a) === w(b);
  }

  /* La página dibuja íconos con letras de uso privado (U+E000–U+F8FF)
     pegadas al texto: "Rosa  " seguido del ícono del menú. */
  function noIcons(s) {
    return String(s || "").split("").filter(function (c) { var k = c.charCodeAt(0); return k < 0xE000 || k > 0xF8FF; }).join("");
  }

  /* El nombre de pila de quien abrió la cuenta (el titular): debajo de
     "Logout" o delante de "Menu", arriba de la página. */
  function accountName(doc) {
    for (var i = 0; i < doc.lines.length && i < 8; i++) {
      var line = noIcons(doc.lines[i]), m = line.match(/^\s*(\S+)\s{2,}Menu\s*$/i);
      if (m) { return vName(m[1]); }
      if (/^\s*Log\s?out\b/i.test(line)) {
        var n = firstCell(noIcons(doc.lines[i + 1]));
        return n.indexOf(" ") < 0 ? vName(n) : "";
      }
    }
    return "";
  }

  /* El punto abierto de la lista: "Yanet - You need to send proof of your
     immigration status" o "Confirm Yanet's immigration status   Collapse -".
     Da el nombre de pila y el tipo de documento (como en config.MKPL_DOCS). */
  function openItem(doc) {
    var name = "([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñü'’\\-]*)";
    var m = doc.flat.match(new RegExp("(?:^|\\n)" + name + " - You need to send proof of (?:your )?([^.\\n]+)")) ||
            doc.flat.match(new RegExp("(?:^|\\n)Confirm " + name + "['’]s ([^\\n]+?) Collapse\\b"));
    var kind = m ? DOC_KINDS.filter(function (k) { return k[0].test(m[2]); })[0] : null;
    return kind ? { first: m[1], cat: kind[1] } : null;
  }

  /* El archivo subido, en la tabla "Document Name  Document Type": la agencia
     lo nombra "Apellidos, Nombre - …" y puede quedar partido en dos líneas. */
  function uploadedName(doc, first) {
    for (var i = doc.lines.length - 1; i >= 0; i--) {
      if (!/^\s*Document Name\s{2,}Document Type\b/i.test(doc.lines[i])) { continue; }
      var cells = [];
      for (var j = i + 1; j < doc.lines.length && cells.length < 3; j++) {
        var c = firstCell(noIcons(doc.lines[j]));
        if (c) { cells.push(c); }
      }
      var m = cells.join(" ").match(/^([^,\d]{2,40}),\s*([^,\d\-]{2,40}?)\s+-(?:\s|$)/);
      return m && vLastFirst(m[1] + ", " + m[2]) && sameFirst(m[2], first) ? { last: m[1].trim(), first: m[2].trim() } : null;
    }
    return null;
  }

  /* "Permanent Resident/Green Card" es "Permanent Resident Card, Green Card
     (I-551)" en config.MKPL_DOCS: el que tiene todas sus palabras y menos de más. */
  function docName(cat, text) {
    var words = function (s) { return String(s).toLowerCase().replace(/\([^)]*\)/g, " ").match(/[a-z0-9]+/g) || []; };
    var want = words(text), entry = C.MKPL_DOCS.filter(function (c) { return c.v === cat; })[0], best = "", extra = Infinity;
    (want.length && entry ? entry.docs : []).forEach(function (d) {
      var have = words(d);
      if (want.every(function (w) { return have.indexOf(w) >= 0; }) && have.length - want.length < extra) { best = d; extra = have.length - want.length; }
    });
    return best;
  }

  /* Docs Submitted: la página "Upload documents" del Mercado con el documento
     ya subido. Es del titular si el punto abierto es de quien abrió la cuenta;
     si no, de otra persona del hogar (cónyuge o dependiente). */
  function extractDocsSub(doc) {
    var f = {};
    f.appId = appId(doc) || find(doc, /\bapplication\b[^\n]{0,60}\(ID#:?\s*(\d{8,12})\)/i);
    f.anio = planYear(doc);
    var item = openItem(doc);
    if (!item) { return f; }
    var owner = accountName(doc), up = uploadedName(doc, item.first);
    var x = { cat: item.cat, persona: (up ? up.first + " " + up.last : item.first).toUpperCase() };
    if (owner) { x.titular = sameFirst(owner, item.first); }
    x.enviado = true;
    var sent = docName(item.cat, after(doc, [/^\s*Document type\s*:/i], vText(80), 0));
    if (sent) { x.doc = sent; }
    /* el nombre completo del titular solo aparece cuando el documento es suyo */
    if (x.titular && up) { f.nombres = up.first.toUpperCase(); f.apellidos = up.last.toUpperCase(); }
    f.docs = [x];
    return f;
  }

  /* ----------------------------------------------------------------- pago */

  var CARD_PAY = /card|tarjeta|visa|mastercard|amex|american express|discover/i;
  var BANK_PAY = /checking|savings|bank account|cuenta (de banco|bancaria|corriente|de ahorros)|\bACH\b|routing/i;

  /* El método escrito junto a su rótulo ("Debit - Visa - 0933"); "•••• 8935"
     no dice si es tarjeta o cuenta. */
  function vPayMethod(t) {
    var c = firstCell(t);
    return CARD_PAY.test(c) || /\b(credit|debit|d[eé]bito|cr[eé]dito)\b/i.test(c) ? "Tarjeta CC" : (BANK_PAY.test(c) || /\bbank\b|e-?check/i.test(c) ? "Cuenta de banco" : "");
  }

  /* Fecha del encabezado que pone el navegador al imprimir la página del
     pago: "9/28/26, 1:36 PM   Result" */
  function printDate(doc) {
    var m = (doc.lines[0] || "").match(/^\s*(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+\d{1,2}:\d{2}\s*[AP]M\b/i);
    return m ? U.parseDate(m[1]) : "";
  }

  function extractPay(doc, line) {
    var f = { pagoEstado: "PAYMENT" };
    /* lo pagado; un "Amount" o "Total" suelto solo si no hay rótulo de pago,
       y nunca lo que se debe ("Amount due", "Total premium due") */
    f.pagoMonto = after(doc, [/\bAmount\s*charged\b/i, /\b(Payment\s*amount|Amount\s*paid|Total\s*paid|Total\s*payment)\b/i, /Monto\s*(pagado|del pago)/i,
      /Importe\s*(pagado|del pago)?/i], vMoney, 1) ||
      after(doc, [/^\s*(Amount|Monto|Total)\b(?![^\n]*\b(due|pendiente|a\s*pagar|adeudado)\b)/i], vMoney, 1);
    /* Oscar: "Payment #<código> has been submitted for processing" */
    f.pagoConf = after(doc, [/\b(Confirmation|Reference|Transaction|Receipt)\s*(number|#|no\.?|ID|code)/i,
      /N[uú]mero de (confirmaci[oó]n|referencia|transacci[oó]n)/i, /^\s*Confirmation\s*:/i], vCode(5, 24), 1) ||
      find(doc, /\bPayment\s*#\s?([A-Za-z0-9]{6,64})\s+has been submitted/i);
    f.pagoFecha = afterFirst(doc, [/\bPayment\s*date\b/i, /\bDate\s*(paid|of payment)\b/i, /Fecha\s*(del|de)\s*pago/i,
      /\bPayment\s*Details\b/i, /^\s*(Date|Fecha)\b(?!\s*(of\s*birth|de\s*nacimiento))/i], vDate, 1) || printDate(doc);
    f.pagoMetodo = after(doc, [/\bPayment\s*method\b/i, /M[eé]todo de pago/i], vPayMethod, 1);
    if (!f.pagoMetodo && CARD_PAY.test(doc.flat)) { f.pagoMetodo = "Tarjeta CC"; }
    else if (!f.pagoMetodo && BANK_PAY.test(doc.flat)) { f.pagoMetodo = "Cuenta de banco"; }
    if (/auto\s*pay|autopay|pago autom[aá]tico|recurring/i.test(doc.flat)) {
      if (/(enrolled|enabled|activ[eo]|on)\b[^\n]{0,20}(auto\s*pay|autopay)|(auto\s*pay|autopay|pago autom[aá]tico)[^\n]{0,25}\b(yes|s[ií]|enrolled|enabled|activ[eo]|on)\b|\bPayment\s*Details\s*:?\s*Auto\s*pay/i.test(doc.flat)) { f.autopay = "On"; }
    }
    f.compania = carrierIn(C.CARRIERS[line] ? line : "oc", doc.flat);
    /* el miembro o asegurado, no quien paga ("Name on Account") */
    var who = after(doc, [/^\s*Member(\s*Name)?\b(?!\s*(ID|#|number|services))\s*:?/i, /^\s*Insured\b\s*:?/i], vHolder, 0);
    if (who) { setName(f, who); }
    if (line === "supp") {
      /* el comprobante de Suplementario también dice qué se compró */
      f.producto = suppProduct(doc);
      f.plan = suppPlan(doc);
      f.efectiva = suppDate(doc);
      f.poliza = after(doc, POLICY_LABELS, vCode(5, 24), 1);
    }
    return f;
  }

  /* -------------------------------------------------------- suplementario */

  function productIn(text) {
    var dental = /\bdental\b/i.test(text), vision = /\bvisi[oó]n\b/i.test(text);
    if (/hospital\s*indemnity|indemnizaci[oó]n\s*hospitalaria|hospital\s*(cash|confinement)|fixed\s*indemnity/i.test(text)) { return "Hospital"; }
    if (/\baccident(al)?\b|accidentes/i.test(text) && !dental) { return "Accident"; }
    if (/\bcancer\b|c[aá]ncer|critical\s*illness/i.test(text) && !dental) { return "Cancer"; }
    if (/short[\s-]?term/i.test(text)) { return "Short Term"; }
    if (/\b(term|whole|universal|final expense)\s*life\b|life\s*insurance\s*(application|policy)|seguro de vida/i.test(text)) { return "Life"; }
    if (/international|travel\s*medical|coverage\s*for\s*travel|geo\s*blue|seguro internacional/i.test(text)) { return "International"; }
    if (/discount\s*(medical\s*)?(plan|card|program)|plan de descuento/i.test(text)) { return "Discount Plan"; }
    if (dental && vision && /dental\s*(and|&|\+|y|\/)\s*visi[oó]n/i.test(text)) { return "Dental + Vision"; }
    if (dental) { return "Dental"; }
    if (vision) { return "Vision"; }
    return "";
  }

  var POLICY_LABELS = [/\bPolicy\s*(ID|number|#|no\.?)/i, /\bCertificate\s*(number|#)/i, /N[uú]mero de p[oó]liza/i];

  /* El título manda: "APPLICATION FOR HOSPITAL INDEMNITY INSURANCE". El resto
     del texto nombra otros productos (preguntas de reemplazo, avisos). */
  function suppProduct(doc) {
    var title = "";
    for (var i = 0; i < doc.lines.length && !title; i++) {
      if (/^\s*application for\b/i.test(doc.lines[i])) { title = firstCell(doc.lines[i]); }
    }
    return productIn(title) || productIn(doc.flat);
  }

  /* Un titular escrito sin rótulo de nombre: "Jose Rondon Vallejo, 3/28/1962" */
  function vHolder(t) { return vPerson(firstCell(t).replace(/,?\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, "")); }

  /* El titular cuando no hay "First name / Last name": "1. Primary  Apellido,
     Nombre" (Allstate), el bloque "Primary Subscriber" (Cigna) o "Member" (la
     tarjeta). */
  function suppHolder(doc, f) {
    var lf = after(doc, [/^\s*1\.\s*Primary\b(\s*Proposed)?/i], vLastFirst, 1);
    if (lf) {
      var p = lf.split(/,\s*/);
      f.apellidos = p[0].toUpperCase(); f.nombres = p[1].toUpperCase();
      return;
    }
    var full = after(doc, [/^\s*Primary\s*Subscriber\s*$/i], vPerson, 2) ||
               after(doc, [/^\s*Member\b(?!\s*(ID|#|number|services|since))\s*:?/i, /^\s*Insured\b\s*:?/i], vHolder, 0);
    if (full) { setName(f, full); }
  }

  /* Tabla de pagos con columnas: "Initial Premium:  Annual  Monthly" sobre
     "Accident Medical Expense Plan  $154.68  $12.89" y "Initial Total Premium
     ...", o "Initial Payment  Monthly Payment" sobre "$62.66  $62.66". La
     prima es la columna mensual de la fila del total (o de la única fila). */
  function monthlyColumn(doc) {
    var cells = function (l) { return l.trim().split(/\s{2,}|\t/); };
    for (var i = 0; i < doc.lines.length; i++) {
      var head = cells(doc.lines[i]);
      var col = -1;
      head.forEach(function (c, k) { if (/^(monthly|mensual)(\s+(premium|payment|prima|pago))?$/i.test(c)) { col = k; } });
      if (col < 1 || MONEY_RE.test(doc.lines[i]) || !head.some(function (c) { return /\b(annual|anual|quarterly|semi|initial|inicial)\b/i.test(c); })) { continue; }
      var rows = [];
      for (var j = i + 1; j < doc.lines.length && j <= i + 4; j++) {
        var r = cells(doc.lines[j]);
        if (r.length === head.length && MONEY_RE.test(r[col])) { rows.push(r); } else if (rows.length) { break; }
      }
      if (!rows.length) { continue; }
      var total = rows.filter(function (r) { return /total/i.test(r[0]); })[0] || rows[0];
      var first = rows[0][0];
      return { prima: vMoney(total[col]), plan: !/total/i.test(first) && !MONEY_RE.test(first) ? vText(70)(first) : "" };
    }
    return { prima: "", plan: "" };
  }

  /* Encabezado en columnas "Plan Selection  Location  Start Date": el plan
     ocupa las líneas de abajo en la primera columna ("Cigna Dental Vision" /
     "Hearing 3500"); la letra chica ("for you") ya no es parte del nombre. */
  function planBelow(doc) {
    for (var i = 0; i < doc.lines.length; i++) {
      if (!/^\s*Plan\s*Selection\s{2,}\S/i.test(doc.lines[i])) { continue; }
      var parts = [];
      for (var j = i + 1; j < doc.lines.length && parts.length < 3; j++) {
        var c = firstCell(doc.lines[j]);
        if (!c || !/^[A-Z0-9]/.test(c) || /[:?]/.test(c)) { break; }
        parts.push(c);
      }
      var name = vText(80)(parts.join(" "));
      if (name) { return name; }
    }
    return "";
  }

  /* El nombre del plan en el encabezado, sin rótulo: una celda que nombra
     el producto y el tipo de plan ("BlueDental Copayment QF", "Select Dental
     PPO Plan"). Los títulos en mayúsculas no cuentan. */
  function planCell(doc) {
    for (var i = 0; i < doc.lines.length && i < 12; i++) {
      var cs = doc.lines[i].trim().split(/\s{2,}|\t/);
      for (var k = 0; k < cs.length; k++) {
        var c = cs[k].trim();
        if (c.length >= 6 && c.length <= 60 && /dental|vision|hospital|accident|indemnity/i.test(c) &&
            /\b(plan|ppo|hmo|dppo|dhmo|copay(ment)?|choice|value|select|plus|preferred|premier|basic|max)\b/i.test(c) &&
            !/[:?]|^(application|solicitud|insurance)\b/i.test(c) && /[a-z]/.test(c)) { return c; }
      }
    }
    return "";
  }

  function suppPlan(doc) {
    return after(doc, [/\bPlan\s*name\b/i, /Nombre del plan/i, /\b(Selected\s*plan|Plan\s*selected)\b/i, /\bProduct\s*name\b/i,
      /^\s*Plan\s*(:|\s{2,})/i], vText(70), 1) || monthlyColumn(doc).plan || planBelow(doc) || planCell(doc);
  }

  function suppPremium(doc) {
    return monthlyColumn(doc).prima ||
      after(doc, [/\b(Total\s*)?monthly\s*premium\b/i, /Prima\s*mensual/i, /\bPremium\b/i, /\bPrima\b/i], vMoney, 1);
  }

  /* Fecha bajo un encabezado de columna: "Plan Selection  Location  Start
     Date" sobre "Cigna Dental Vision  33907  Sep 01, 2026" */
  function columnDate(doc, re) {
    for (var i = 0; i < doc.lines.length; i++) {
      var m = doc.lines[i].match(re);
      if (!m || m.index === 0 || !/\S\s{2,}/.test(doc.lines[i].slice(0, m.index))) { continue; }
      for (var j = i + 1; j < doc.lines.length && j <= i + 2; j++) {
        var ds = datesIn(doc.lines[j]);
        if (ds.length) {
          ds.sort(function (a, b) { return Math.abs(a.index - m.index) - Math.abs(b.index - m.index); });
          return ds[0].value;
        }
      }
    }
    return "";
  }

  function suppDate(doc) {
    return after(doc, [/\b(Requested\s*)?effective\s*date\b/i, /\bCoverage\s*start\s*date\b/i, /Fecha efectiva/i,
      /Fecha (solicitada )?de entrada en vigencia/i, /Fecha de vigencia/i], vDate, 1) || columnDate(doc, /\bStart\s*Date\b/i);
  }

  function suppBeneficiary(doc) {
    if (!/beneficiar/i.test(doc.flat)) { return ""; }
    return after(doc, [/\bPrimary\s*beneficiary(\s*name)?\b/i, /^\s*Beneficiary(\s*Name)?\b(\s*\([^)]*\))?/i,
      /^\s*Beneficiario(\s*principal)?\b/i], vBeneficiary, 1);
  }

  /* El agente cuando no hay "Agent name: …": "Yo, Nombre Apellido," en el
     reconocimiento del agente (Florida Blue, donde "Agent Name" se corta en
     dos líneas), "Writing agent/Producer name" (Cigna) o el nombre escrito
     encima de su rótulo ("Agent Name  Agent License…"). */
  function suppAgent(doc) {
    var ack = after(doc, [/Reconocimientos? del Agente|Agent Acknowledgements?/i], function (t) {
      var m = String(t).match(/^(?:Yo|I),\s*([^,]+),?\s*$/);
      return m ? vPerson(m[1]) : "";
    }, 6);
    if (ack) { return ack; }
    var a = after(doc, [/\bWriting\s*agent\s*\/\s*Producer\s*name\b/i, /\bProducer['’]?s?\s*name\b/i], vPerson, 1);
    for (var i = 1; !a && i < doc.lines.length; i++) {
      if (/^\s*(Print\s*)?Agent['’]?s?\s*Name\b(?!\s*:\s*\S)/i.test(doc.lines[i])) { a = vPerson(doc.lines[i - 1]); }
    }
    return a;
  }

  /* Golden Rule llena un formulario PDF: los datos vienen de sus campos.
     El plan es la opción marcada (el valor "Select2000" del botón coincide
     con "Health ProtectorGuard Select 2000") o el encabezado "AdvantageGuard
     Plans" de la sección Plan Selection. */
  function grPlan(doc, form, producto) {
    var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); };
    var start = -1;
    for (var i = 0; i < doc.lines.length && start < 0; i++) { if (/^\s*Plan Selection\b/i.test(doc.lines[i])) { start = i; } }
    if (start < 0) { return ""; }
    var cells = [];
    for (var j = start + 1; j < doc.lines.length && j < start + 25; j++) {
      if (/Application Questions|Initial Payment|Estimated Monthly/i.test(doc.lines[j])) { break; }
      /* sin la casilla dibujada que va delante de cada opción */
      doc.lines[j].trim().split(/\s{2,}|\t/).forEach(function (c) { if (/[A-Za-z]/.test(c)) { cells.push(c.replace(/^[^A-Za-z0-9(]+/, "").trim()); } });
    }
    var picks = Object.keys(form).map(function (k) { return norm(form[k]); })
      .filter(function (v) { return v.length >= 5 && /[a-z]/.test(v) && /\d/.test(v) && !/^\d/.test(v); });
    for (var k = 0; k < cells.length; k++) {
      var c = norm(cells[k]);
      if (picks.some(function (v) { return c.length >= v.length && c.slice(-v.length) === v; })) { return cells[k]; }
    }
    for (k = 0; k < cells.length; k++) {
      var m = cells[k].match(/^(.+?)\s+Plans$/);
      if (m) { return m[1] + (producto && m[1].toLowerCase().indexOf(producto.toLowerCase()) < 0 ? " " + producto : ""); }
    }
    return "";
  }

  function goldenRule(doc, f) {
    var form = doc.form;
    var first = [form.First1, form.MI1].filter(Boolean).join(" ");
    if (vName(first) && vName(form.Last1)) { f.nombres = first.toUpperCase(); f.apellidos = form.Last1.toUpperCase(); }
    f.plan = grPlan(doc, form, f.producto);
    f.prima = vMoney(form.BaseTotal || "");
    f.efectiva = U.parseDate([form.ReqDt1, form.ReqDt2, form.ReqDt3].join("/"));
    /* el CustID es el que va en "Policy ID Number" */
    f.poliza = vCode(5, 24)(form.CustID || "");
    var ben = vPerson(form.YourBeneName || "");
    if (ben) { f.beneficiario = ben + (form.YourBeneRelation ? " (" + form.YourBeneRelation + ")" : ""); }
    var ag = vFullName(form.BrokerName || form.AgentPrintSign || "");
    if (ag) { f.agente = ag.toUpperCase(); }
    /* "Agent Number (NPN)" */
    var npn = String(form.BRIDNumber || form.AgentNumber || "");
    if (/^\d{5,12}$/.test(npn)) { f.npn = npn; }
  }

  function extractSupp(doc) {
    var f = {};
    f.compania = carrierIn("supp", doc.flat);
    f.producto = suppProduct(doc);
    if (/golden\s*rule/i.test(doc.flat) && doc.form.Last1) {
      goldenRule(doc, f);
      return f;
    }
    personName(doc, f);
    if (!f.nombres) { suppHolder(doc, f); }
    f.plan = suppPlan(doc);
    f.prima = suppPremium(doc);
    f.efectiva = suppDate(doc);
    /* Suplementario solo guarda el Policy #; el número de la aplicación se
       lee para no confundirlo con la póliza */
    var app = after(doc, [/\bApplication\s*(ID|number|#|no\.?)/i, /\bApp\s*ID\b/i,
      /N[uú]mero de (solicitud|aplicaci[oó]n)/i, /\bConfirmation\s*(number|#)/i], vCode(5, 24), 1);
    f.poliza = after(doc, POLICY_LABELS, vCode(5, 24), 1);
    if (f.poliza && f.poliza === app) { delete f.poliza; }
    var ben = suppBeneficiary(doc);
    if (ben) { f.beneficiario = ben; }
    contactInfo(doc, f);
    var home = after(doc, [/\bResident(ial)?\s*Address\b/i, /\bHome\s*address\b/i], vAddressRow, 0);
    if (home) { f.direccion = home; }
    var ag = suppAgent(doc);
    agentInfo(doc, f);
    if (ag) { f.agente = ag.toUpperCase(); }
    /* el NPN en el enlace de la herramienta de inscripción ("…&npn=12345678") */
    var npn = find(doc, /[?&]npn=(\d{5,12})\b/i);
    if (npn && !f.npn) { f.npn = npn; }
    return f;
  }

  /* ------------------------------------------ cotizaciones de HealthSherpa

     La búsqueda de planes (tarjetas, con los filtros a la izquierda), la vista
     de un plan y la comparación. Cada plan tiene su etiqueta "Monthly premium"
     ("Prima mensual"): la prima va justo encima (tarjetas) o a su derecha
     (vista del plan: una; comparación: una por columna). La prima es la que
     paga el cliente; la de antes del subsidio va tachada ("was $555.10") o
     sin centavos debajo, y no se usa.

     En una captura el OCR da cada palabra con su posición (quotePlans): así
     no se mezclan los filtros, el logo ni las columnas. Con el texto copiado
     de la página se lee el texto (extractQuote). La compañía casi nunca va en
     texto (es el logo): sale del nombre del plan, del nombre legal que la
     comparación pone debajo de cada plan, del texto del logo o de las
     familias de planes de Oscar y Ambetter. */
  var QUOTE_LABEL = /^(month\w*\s+pr\w*m\w*|prima\s+mens\w*)$/i;
  var QUOTE_MONEY = /(?:\$|\bS(?=\d))\s?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/;
  /* la fila del tipo y el nivel va en mayúsculas: "HMO • BRONZE",
     "EXPANDED BRONZE", "BRONCE AMPLIADO" (el nombre dice "Bronze") */
  var QUOTE_METAL_ROW = /\b(BRONZE|SILVER|GOLD|PLATINUM|CATASTROPHIC|EXPANDED|BRONCE|PLATA|ORO|PLATINO|CATASTR[OÓ]FICO|AMPLIADO)\b|^\W{0,2}(HMO|PPO|EPO|POS)\b/;
  /* botones y títulos de la página: nunca son el nombre de un plan */
  var QUOTE_UI = /^\W*(compare|comparar|details|detalles|enroll|inscr[ií]b|most affordable|lowest premium|all plans|m[aá]s accesible|prima m[aá]s baja|todos los planes|show all plans|mostrar todos|go back|volver|overview|costos del plan|showing coverage|mostrar la cobertura|plan year|a[nñ]o del plan|\d+\s+plan|remove|eliminar|cancel|share|compartir|print|imprimir)/i;
  /* palabras de los logos ("Florida Blue", "United Healthcare") */
  var QUOTE_BRAND = /^\W*(florida|blue|oscar|ambetter|wellpoint|avmed|united|healthcare|amerihealth|caritas|next)\b/i;
  /* el nombre legal de la compañía, debajo de cada plan en la comparación */
  var QUOTE_ISSUER = /\b(inc\.?|llc|company|compa[nñ][ií]\w*|corp\w*|insurance)\b|(\.\.\.|…)$/i;
  var QUOTE_FAMILIES = [
    [/^(bronze|silver|gold|platinum)\s+(simple|classic|elite|basic|core)\b/i, "Oscar"],
    [/^(fundamental|everyday|signature(\s+expanded)?|thrive|focused|complete|enhanced\s+diabetes\s+care)\s+(bronze|silver|gold|platinum)\b/i, "Ambetter"]
  ];

  function median(a) {
    if (!a.length) { return 0; }
    var s = a.slice().sort(function (x, y) { return x - y; });
    return s[Math.floor(s.length / 2)];
  }

  function quoteMoney(t) {
    var m = String(t || "").match(QUOTE_MONEY);
    return m ? U.parseMoney(m[1].replace(/,/g, "") + "." + m[2]) : "";
  }

  function quoteCarrier(name, around) {
    var c = carrierIn("oc", name) || carrierIn("oc", around || "");
    for (var i = 0; !c && i < QUOTE_FAMILIES.length; i++) {
      if (QUOTE_FAMILIES[i][0].test(name)) { c = carrierIn("oc", QUOTE_FAMILIES[i][1]); }
    }
    return c;
  }

  /* "UHC Sanitas Bronze Value (SO Virtual…": el OCR lee "$0" como "SO" y
     "$5" como "S5"; las rayas sueltas son bordes de la página */
  function quoteName(s) {
    return U.collapse(String(s || "")
      .replace(/(^|[\s(])[S$][O0](?=[\s,)]|$)/g, "$1$$0")
      .replace(/(^|[\s(\/])S(?=\d)/g, "$1$$")
      .replace(/(^|\s)[|®©¦]+(?=\s|$)/g, " ")
      .replace(/^[^A-Za-z0-9$(¿¡]+/, "")
      .replace(/[\s\-–—•·|]+$/, ""));
  }

  /* Palabras del OCR -> frases: palabras de la misma línea sin un hueco
     ancho entre ellas (una columna o una etiqueta y su valor quedan aparte). */
  function quotePhrases(words) {
    var ws = (words || []).map(function (w) {
      return { x: +w.x, y: +w.y, w: +w.w, h: +w.h, t: String(w.text == null ? "" : w.text).trim(), c: w.conf == null ? 100 : +w.conf };
    }).filter(function (w) { return w.t && w.h > 0 && w.w > 0; });
    var H = median(ws.map(function (w) { return w.h; })) || 10;
    ws.sort(function (a, b) { return a.x - b.x; });
    var out = [];
    ws.forEach(function (w) {
      var cy = w.y + w.h / 2, best = null;
      out.forEach(function (p) {
        var gap = w.x - p.x1, tall = Math.max(p.h, w.h);
        if (cy < p.y0 - 0.2 * H || cy > p.y1 + 0.2 * H || gap > 1.6 * tall || gap < -0.5 * tall) { return; }
        if (!best || Math.abs(p.cy - cy) < Math.abs(best.cy - cy)) { best = p; }
      });
      if (best) {
        best.ws.push(w);
        best.x1 = Math.max(best.x1, w.x + w.w);
        best.y0 = Math.min(best.y0, w.y); best.y1 = Math.max(best.y1, w.y + w.h);
      } else {
        out.push({ ws: [w], x0: w.x, x1: w.x + w.w, y0: w.y, y1: w.y + w.h, cy: cy, h: w.h });
      }
    });
    out.forEach(function (p) {
      p.text = p.ws.map(function (w) { return w.t; }).join(" ");
      p.h = median(p.ws.map(function (w) { return w.h; }));
      p.cy = (p.y0 + p.y1) / 2;
      p.conf = p.ws.reduce(function (s, w) { return s + w.c; }, 0) / p.ws.length;
      p.letters = (p.text.match(/[A-Za-zÁÉÍÓÚÑáéíóúñü]/g) || []).length;
    });
    return { list: out, H: H };
  }

  /* Una línea que sirve como parte del nombre de un plan. */
  function quoteText(p) {
    return p.letters >= 3 && p.conf >= 55 && !QUOTE_UI.test(p.text) && !(QUOTE_MONEY.test(p.text) && p.letters < 4);
  }

  function quotePlans(words) {
    var pp = quotePhrases(words), P = pp.list, H = pp.H;
    var near = function (a, b) { return Math.abs(a - b) <= 2 * H; };
    var isMoney = function (p) { return QUOTE_MONEY.test(p.text) && !/^\W*(was|antes)\b/i.test(p.text); };
    /* líneas alineadas a la izquierda con x0, encima de y, la más cercana primero */
    function stackAbove(x0, y, maxDist) {
      return P.filter(function (p) { return near(p.x0, x0) && p.y1 <= y + 0.3 * H && y - p.y1 <= maxDist; })
        .sort(function (a, b) { return b.y1 - a.y1; });
    }
    /* el nombre está encima de la fila del nivel ("HMO • BRONZE"); puede
       ocupar dos o tres líneas seguidas */
    function nameAbove(x0, y, maxDist) {
      var stack = stackAbove(x0, y, maxDist);
      var metal = stack.filter(function (p) { return QUOTE_METAL_ROW.test(p.text) && p.text.length < 50; })[0];
      var from = metal ? stack.filter(function (p) { return p.y1 <= metal.y0 + 0.3 * H; }) : stack;
      /* fila del nivel mal leída ("WMO e a"): va en letra más chica, justo
         debajo del nombre */
      if (!metal && from.length > 1 && from[0].h < 0.8 * from[1].h && from[1].y0 - from[0].y1 > -0.5 * H) { from = from.slice(1); }
      var lines = [];
      for (var i = 0; i < from.length && lines.length < 3; i++) {
        var p = from[i], prev = lines[0];
        if (prev && prev.y0 - p.y1 > 1.3 * Math.max(prev.h, p.h)) { break; }
        /* el logo encima del título: letra de otro tamaño, o solo la marca */
        if (prev && Math.min(prev.h, p.h) < 0.75 * Math.max(prev.h, p.h)) { break; }
        if (prev && p.ws.length <= 3 && (carrierIn("oc", p.text) || QUOTE_BRAND.test(p.text))) { break; }
        if (!quoteText(p)) { if (lines.length) { break; } continue; }
        lines.unshift(p);
      }
      return { lines: lines, metal: metal };
    }

    var plans = [];
    function add(name, prima, around, order) {
      name = quoteName(name);
      if (!name || !prima) { return; }
      plans.push({ compania: quoteCarrier(name, around), plan: name, prima: prima, order: order });
    }
    function textOf(list) { return list.map(function (p) { return p.text; }).join(" "); }

    /* tarjeta de la búsqueda: el nombre encima de la fila del nivel y el logo
       a la derecha del nombre */
    var taken = [];
    function cardPlan(x0, money) {
      if (taken.indexOf(money) >= 0) { return; }
      var card = nameAbove(x0, money.y0, 12 * H);
      if (!card.lines.length) { return; }
      taken.push(money);
      var top = card.lines[0].y0, bottom = (card.metal || card.lines[card.lines.length - 1]).y1;
      var right = Math.max.apply(null, card.lines.map(function (p) { return p.x1; }));
      var logo = P.filter(function (p) { return p.x0 > right + 2 * H && p.cy >= top - 1.5 * H && p.cy <= bottom + 1.5 * H; });
      add(textOf(card.lines), quoteMoney(money.text), textOf(logo), money.y0);
    }

    P.filter(function (p) { return QUOTE_LABEL.test(p.text); }).forEach(function (L) {
      /* tarjeta: la prima justo encima de la etiqueta, alineada a la izquierda */
      var up = P.filter(function (p) {
        return isMoney(p) && near(p.x0, L.x0) && p.y1 <= L.y0 + 0.3 * L.h && L.y0 - p.y1 <= 2.5 * Math.max(L.h, p.h);
      }).sort(function (a, b) { return b.y1 - a.y1; })[0];
      if (up) { cardPlan(L.x0, up); return; }
      /* a la derecha: una prima por columna (la de arriba; la tachada va debajo) */
      var cols = [];
      P.filter(function (p) {
        return isMoney(p) && p.x0 > L.x1 && p.cy >= L.cy - 2.2 * L.h && p.cy <= L.cy + 1.2 * L.h;
      }).sort(function (a, b) { return a.x0 - b.x0; }).forEach(function (p) {
        var c = cols[cols.length - 1];
        if (c && p.x0 - c.x0 <= 4 * H) { if (p.cy < c.cy) { cols[cols.length - 1] = p; } return; }
        cols.push(p);
      });
      if (cols.length === 1) {
        /* vista de un plan: el título está más arriba, con el logo encima */
        var one = nameAbove(L.x0, L.y0, 30 * H);
        if (!one.lines.length) { return; }
        var logoUp = stackAbove(one.lines[0].x0, one.lines[0].y0, 4 * H);
        add(textOf(one.lines), quoteMoney(cols[0].text), textOf(logoUp), cols[0].y0);
        return;
      }
      if (cols.length > 1) { compareHeads(L, cols); }
    });

    /* una tarjeta cuya etiqueta el OCR no leyó: la prima es la primera cifra
       con centavos debajo de la fila del nivel, alineada con ella */
    P.filter(function (p) { return QUOTE_METAL_ROW.test(p.text) && p.text.length < 50; }).forEach(function (M) {
      var money = P.filter(function (p) { return isMoney(p) && near(p.x0, M.x0) && p.y0 >= M.y1 && p.y0 - M.y1 <= 8 * H; })
        .sort(function (a, b) { return a.y0 - b.y0; })[0];
      if (money) { cardPlan(M.x0, money); }
    });

    /* Comparación: encima de cada columna, el logo, el nombre (una a tres
       líneas) y el nombre legal de la compañía. */
    function compareHeads(L, cols) {
      var step = cols.length > 1 ? (cols[cols.length - 1].x0 - cols[0].x0) / (cols.length - 1) : 20 * H;
      var limit = Math.min.apply(null, cols.map(function (c) { return c.y0; })) - 6 * H;
      var per = cols.map(function (c, i) {
        var x0 = c.x0 - 1.5 * H, x1 = (i + 1 < cols.length ? cols[i + 1].x0 : c.x0 + step) - 1.5 * H;
        return P.filter(function (p) { return p.x0 >= x0 && p.x0 < x1 && p.y1 <= limit && quoteText(p); })
          .sort(function (a, b) { return a.cy - b.cy; });
      });
      /* el primer renglón del nombre está a la misma altura en todas las
         columnas; lo de arriba es el logo */
      var firsts = per.map(function (lines) {
        var f = lines.filter(function (p) { return p.ws.length >= 2; })[0];
        return f ? f.cy : null;
      }).filter(function (v) { return v != null; });
      var startAt = null, votes = -1;
      firsts.forEach(function (v) {
        var n = firsts.filter(function (u) { return Math.abs(u - v) <= 0.8 * H; }).length;
        if (n > votes || (n === votes && v > startAt)) { startAt = v; votes = n; }
      });
      if (startAt == null) { return; }
      per.forEach(function (lines, i) {
        var name = [], issuer = "", prev = null;
        lines.filter(function (p) { return p.cy >= startAt - 0.8 * H; }).some(function (p) {
          if (prev && p.y0 - prev.y1 > 2.2 * H) { return true; }
          prev = p;
          if (name.length && (carrierIn("oc", p.text) || QUOTE_ISSUER.test(p.text))) { issuer = p.text; return true; }
          name.push(p);
          return name.length >= 4;
        });
        add(textOf(name), quoteMoney(cols[i].text), issuer, cols[i].x0);
      });
    }

    /* en orden de lectura; un plan repetido (dos etiquetas) va una vez */
    var seen = {};
    return plans.sort(function (a, b) { return a.order - b.order; }).filter(function (p) {
      var k = p.plan.toUpperCase() + "|" + p.prima;
      if (seen[k]) { return false; }
      seen[k] = true;
      delete p.order;
      return true;
    });
  }

  /* Texto copiado de la página (o leído sin posiciones): la etiqueta con la
     prima en la misma línea (vista del plan) o en la de arriba (tarjeta); el
     nombre es la línea de texto encima de la fila del nivel. */
  function extractQuote(doc) {
    var lines = doc.lines.map(function (l) { return U.collapse(l); });
    var plans = [], seen = {};
    function nameAbove(i) {
      var k = -1;
      for (var j = i - 1; j >= 0 && j >= i - 8; j--) {
        if (QUOTE_METAL_ROW.test(lines[j]) && lines[j].length < 50) { k = j; break; }
      }
      for (var n = (k >= 0 ? k : i) - 1; n >= 0 && n >= (k >= 0 ? k : i) - 3; n--) {
        var t = lines[n];
        if (!t || QUOTE_METAL_ROW.test(t) || QUOTE_UI.test(t) || /^[\d$.,\s]+$/.test(t)) { continue; }
        return k >= 0 || n === i - 1 ? t : "";
      }
      return "";
    }
    lines.forEach(function (l, i) {
      var m = l.match(/^(monthly\s+premium|prima\s+mensual)\b\s*(.*)$/i);
      if (!m) { return; }
      var prima = quoteMoney(m[2]), at = i;
      if (!prima) {
        for (var j = i - 1; j >= 0 && !lines[j]; j--) { /* línea vacía */ }
        if (j < 0 || !/^\$/.test(lines[j])) { return; }
        prima = quoteMoney(lines[j]); at = j;
      }
      var name = quoteName(nameAbove(at));
      if (!name || !prima || seen[name + prima]) { return; }
      seen[name + prima] = true;
      plans.push({ compania: quoteCarrier(name, lines.slice(Math.max(0, at - 6), at).join("\n")), plan: name, prima: prima });
    });
    return plans.length ? { planes: plans } : {};
  }

  /* ------------------------------------------------------------ detección */

  /* Título de una aplicación suplementaria: "APPLICATION FOR HOSPITAL
     INDEMNITY INSURANCE", "Application for Accident Medical Expense" */
  var SUPP_TITLE = /(^|\n)[ \t]*application for [^\n]{0,60}(indemnity|accident|dental|vision|cancer|critical illness|short[\s-]?term|life|hospital)/i;

  var SIGNALS = {
    mc_soa: [[/scope of (sales )?appointment/i, 4], [/alcance de la cita/i, 4], [/\bSOA\b/, 1],
      [/products? (to be )?discussed|productos (a|que se) (tratar|discutir)/i, 1]],
    mc_app: [[MBI_RE, 3], [/medicare (number|claim)|n[uú]mero de medicare/i, 2], [/H-PBP|\b[HR]\d{4}\s?-\s?\d{3}\b/i, 2],
      [/election period|per[ií]odo de elecci[oó]n/i, 2], [/\bpart(e)? [AB]\b/i, 1],
      [/medicare advantage|\b(MAPD|D-SNP|C-SNP|PDP)\b/i, 1],
      [/enrollment (application|request|form|confirmation)|solicitud de inscripci[oó]n/i, 1]],
    oc_elig: [[/eligibility (notice|results|determination)/i, 4], [/aviso de elegibilidad|resultados de (su )?elegibilidad/i, 4],
      [/eligible (to purchase|for advance|for cost|for a tax|to enroll in a marketplace plan|to use the premium tax credit)/i, 2],
      [/elegible para (comprar|pagos|un cr[eé]dito|cr[eé]ditos|reducciones)/i, 2],
      [/cost-sharing reductions|reducciones de costos compartidos/i, 1], [/eligibility guide|gu[ií]a de elegibilidad/i, 2]],
    oc_plans: [[/my plans (&|and) programs/i, 4], [/mis planes y programas/i, 4], [/\byou pay\b|usted paga/i, 2],
      [HIOS_RE, 2], [/plan id|id del plan/i, 1], [/status:\s*active|estado:\s*activo/i, 1],
      [/start date[\s\S]{0,40}end date|fecha de inicio[\s\S]{0,40}fecha de finalizaci/i, 1]],
    oc_app: [[/review (and|&) (sign|confirm|submit)|review your application|application summary|revise su solicitud|resumen de (la|su) solicitud/i, 4],
      [/sign (and|&) submit|firm(e|ar) y env[ií](e|ar)/i, 2], [/tax (filer|household|return)|declaraci[oó]n de impuestos/i, 1],
      [/healthcare\.gov|cuidadodesalud\.gov|health insurance marketplace|mercado de seguros/i, 1],
      [/household (income|information|members)|ingresos del hogar/i, 1]],
    /* búsqueda, vista de un plan o comparación de planes de HealthSherpa */
    oc_quote: [[/\bmonth\w*\s+prem\w*|\bprima\s+mensual\b/i, 2],
      [/\b(H?MO|PPO|EPO|POS)\b[\s\S]{0,14}?\b(BRONZE|SILVER|GOLD|PLATINUM|CATASTROPHIC|EXPANDED|BRONCE|PLATA|ORO|PLATINO)\b/, 2],
      [/\$\d[\d,]*\.\d{2}\s?\/\s?mo\b/, 2],
      /* la tarjeta: "Monthly premium   Deductible" en la misma línea */
      [/\bmonth\w*\s+prem\w*[ \t]+deductible\b|\bprima\s+mensual[ \t]+deducible\b/i, 2],
      [/\bdrug deductible\b|\bgeneric drugs\b|deducible de medicamentos|medicamentos gen[eé]ricos/i, 1],
      [/show all plans|mostrar todos los planes|compare plans|comparar planes|enroll now|inscribirse ahora|metal tier|nivel de metal|estimated all-in|c[aá]lculo total|most affordable|m[aá]s accesible|healthsherpa/i, 1]],
    /* la página "Upload documents" del Mercado con el documento subido */
    oc_docs: [[/select file to upload/i, 3], [/document name\s+document type/i, 3], [/you can upload more than one document/i, 2],
      [/\bconfirm\s+\S+['’]s\s+(immigration|income|citizenship|social security|american indian|job[\s-]based|medicaid|medicare|tricare|veterans|peace corps)/i, 2],
      [/you need to send proof of/i, 2], [/\bupload documents\b/i, 1]],
    pay: [[/payment (confirmation|receipt|successful|received|complete)|confirmaci[oó]n de(l)? pago|recibo de pago|pago (recibido|exitoso|realizado)/i, 4],
      [/thank you for your payment|gracias por su pago/i, 4], [/amount paid|monto pagado|payment amount/i, 1],
      [/payment (submitted|is confirmed)|submitted for processing|amount charged/i, 4], [/\bpayment\s*(date|method|details)\b/i, 1]],
    supp_app: [[/\bdental\b/i, 1], [/\bvisi[oó]n\b/i, 1], [/hospital indemnity|indemnizaci[oó]n hospitalaria/i, 3],
      [/accident(al)? (insurance|coverage|plan)|seguro de accidentes/i, 3], [/cancer (insurance|plan)|critical illness/i, 3],
      [/short[\s-]?term (medical|health)/i, 3], [/waiting period|per[ií]odo de espera/i, 1], [/\b(DHMO|DPPO)\b/, 2],
      [/life insurance|seguro de vida|death benefit|face amount/i, 3], [/international|travel medical|geo\s*blue/i, 3],
      [/discount (medical )?(plan|card|program)/i, 3], [SUPP_TITLE, 5],
      [/\b(dental|vision)\s+(insurance|plan|policy|coverage|ppo|hmo|value|choice|copay(ment)?)\b|seguro dental|p[oó]liza dental|bluedental/i, 2]],
    supp_card: [[/\b(this|the)\s+card\s+(is|does)\s+not\s+(a\s+)?(guarantee|proof|verification)/i, 4],
      [/\b[1Il]D\s*card\b|\bmember\s*(ID\s*)?card\b|tarjeta de (identificaci[oó]n|miembro)/i, 2],
      [/claims\s*(correspondence|address)|send claims|electronic claims|payer\s*ID/i, 2]],
    /* el PDF del Consent de la agencia pierde la ligadura "ti" (queda un carácter que no es letra) */
    consent: [[/consent (form|to act|for)|consen(?:ti|\W)miento/i, 3], [/authorize|autorizo|autorizaci[oó]n/i, 1],
      [/agent of record|agente de registro/i, 1],
      [/to\s+act\s+as\s+(a\s+)?(health\s+insurance\s+)?agent\s+or\s+broker|para\s+actuar\s+como\s+agente\s+o\s+corredor/i, 3],
      [/have\s+given\s+consent\b|he\s+dado\s+mi\s+consen(?:ti|\W)miento/i, 2]]
  };

  var FILE_HINTS = [
    [/docs?[\s_\-]*submitted/i, "oc_docs"],
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
    var medicare = scores.mc_app + scores.mc_soa, market = scores.oc_elig + scores.oc_plans + scores.oc_app + scores.oc_docs;
    /* "dental" aparece en casi todo: solo cuenta si no es Medicare ni Mercado,
       salvo que el título diga que es una aplicación suplementaria */
    if ((medicare >= 3 || market >= 3) && !SUPP_TITLE.test(flat)) { scores.supp_app = 0; }
    /* una tarjeta de Suplementario nombra su producto y no es de Medicare */
    if (medicare >= 3 || market >= 3 || /\bmedicare\b/i.test(flat) || !productIn(flat)) { scores.supp_card = 0; }
    /* un consent suele mencionar el Mercado; manda si el resto es débil. Las
       aplicaciones suplementarias piden consentimiento para firmar en línea:
       ahí no manda. */
    if (scores.consent >= 4 && market < 5 && medicare < 5 && scores.supp_app < 4) { scores.consent += 3; }
    /* una página de pago es corta y nombra el producto que se paga: si dice
       que el pago se hizo, manda */
    if (scores.pay >= 4 && flat.length < 4000) { scores.pay += 3; }
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
    oc_app: extractOcApp, oc_docs: extractDocsSub, oc_quote: extractQuote, pay: extractPay, supp_app: extractSupp, supp_card: extractSupp
  };
  var FALLBACK = { mc: "mc_app", oc: "oc_plans", supp: "supp_app" };

  /* Lee un documento. `currentLine` solo se usa cuando no se reconoce el
     tipo: entonces se intenta con el lector principal de esa línea.
     `opts.words`: las palabras de una captura con su posición (OCR); una
     cotización de HealthSherpa se lee con ellas. */
  function extract(text, fileName, currentLine, opts) {
    var type = detect(text, fileName);
    var doc = makeDoc(text);
    var fields = {}, guessed = false;
    var words = opts && opts.words;
    if (type === "oc_quote" && words && words.length) {
      var planes = quotePlans(words);
      fields = planes.length ? { planes: planes } : extractQuote(doc);
    } else if (EXTRACTORS[type]) {
      fields = EXTRACTORS[type](doc, currentLine);
    } else if (type === "unknown" && FALLBACK[currentLine] && doc.flat.replace(/\s/g, "").length > 40) {
      fields = EXTRACTORS[FALLBACK[currentLine]](doc, currentLine);
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
  /* Tabla de puntos, como la del aviso de elegibilidad del Mercado: cada fila
     lleva un punto (•) debajo de cada persona a la que se aplica, y los
     nombres van en la fila de arriba. Separar con 30 espacios como mucho
     pierde la columna, así que los puntos que siguen a un texto y los nombres
     (las una o dos filas justo encima de la primera fila con puntos, si
     empiezan en la mitad derecha de la tabla y solo traen palabras, sin
     cifras ni "$ : /") se ponen en su columna, a GRID_PT puntos por
     carácter. De los nombres solo se mueve el comienzo de cada celda. Una
     viñeta al empezar la línea no cuenta. */
  var GRID_PT = 4;
  var BULLET = /^[•●]$/;
  function gridColumns(rows) {
    var marks = {}, maxX = 0, firstRow = -1;
    rows.forEach(function (r, ri) {
      r.items.forEach(function (it, ii) {
        if (ii === 0 || !BULLET.test(it.str.trim())) { return; }
        marks[ri + ":" + ii] = true;
        maxX = Math.max(maxX, it.x);
        if (firstRow < 0) { firstRow = ri; }
      });
    });
    for (var h = firstRow - 1; h >= 0 && h >= firstRow - 2; h--) {
      var its = rows[h].items;
      if (its[0].x < maxX * 0.5 || its.some(function (it) { return /[\d$:\/]/.test(it.str); })) { break; }
      its.forEach(function (it, ii) {
        var prev = its[ii - 1], cw = it.str.length ? Math.max(2.5, it.w / it.str.length) : 5;
        if (!prev || it.x - (prev.x + prev.w) > cw * 1.8) { marks[h + ":" + ii] = true; }
      });
    }
    return { at: function (ri, ii) { return !!marks[ri + ":" + ii]; } };
  }

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
    rows.forEach(function (r) { r.items.sort(function (a, b) { return a.x - b.x; }); });
    var grid = gridColumns(rows);
    return rows.map(function (r, ri) {
      var line = "", end = null;
      r.items.forEach(function (it, ii) {
        var cw = it.str.length ? Math.max(2.5, it.w / it.str.length) : 5;
        if (grid.at(ri, ii)) {
          /* columna de una tabla de puntos: va donde está en la página */
          var pad = Math.round(it.x / GRID_PT) - line.length;
          line += new Array(Math.max(line ? 2 : 0, pad) + 1).join(" ");
        } else if (end !== null) {
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

  /* Lo escrito en un formulario PDF (AcroForm) no está en el texto de la
     página: cada campo con valor va al final, una vez, como "Campo: valor"
     (las casillas sin marcar y las firmas no). */
  function formLines(perPage) {
    var seen = {}, out = [];
    perPage.forEach(function (annots) {
      (annots || []).forEach(function (a) {
        var name = a && a.subtype === "Widget" ? String(a.fieldName || "").replace(/\s+/g, " ").trim() : "";
        var v = name && !seen[name] ? a.fieldValue : null;
        if (Array.isArray(v)) { v = v.join(", "); }
        if (v == null || typeof v === "object") { return; }
        v = String(v).replace(/\s+/g, " ").trim();
        if (!v || /^off$/i.test(v)) { return; }
        seen[name] = true;
        out.push(name + ": " + v);
      });
    });
    return out;
  }

  function pdfToText(pdfjsLib, data) {
    return pdfjsLib.getDocument({ data: data, isEvalSupported: false, disableFontFace: true }).promise.then(function (pdf) {
      var pages = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        pages.push(pdf.getPage(i).then(function (pg) {
          var annots = pg.getAnnotations ? pg.getAnnotations().catch(function () { return []; }) : [];
          return Promise.all([pg.getTextContent(), annots]);
        }));
      }
      return Promise.all(pages).then(function (contents) {
        var text = contents.map(function (c) { return itemsToText(c[0].items); }).join("\n\n");
        var form = formLines(contents.map(function (c) { return c[1]; }));
        return form.length ? text + "\n\n" + FORM_HEAD + "\n" + form.join("\n") : text;
      });
    });
  }

  var api = {
    extract: extract, detect: detect, fileHint: fileHint, pdfToText: pdfToText, itemsToText: itemsToText,
    TYPES: TYPES, makeDoc: makeDoc, quotePlans: quotePlans
  };
  root.QA = root.QA || {};
  root.QA.extract = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
