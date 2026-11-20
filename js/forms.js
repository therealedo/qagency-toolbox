/* Q Agency Toolbox — formularios para firmar.
   El Consent de Obamacare y el SOA de Medicare se llenan con los datos de la
   nota: se elige la plantilla (oficina e idioma), se arma el valor de cada
   campo del PDF, el texto para pedirlo en Cliq y el enlace de firma de
   SignWell con su SMS y su email. Todo esto son funciones puras, que se
   prueban solas; el PDF se llena con el PDF.js de la herramienta (fillPdf),
   sin conexiones. Las plantillas viajan dentro de la herramienta, en
   vendor/forms/ (tools/vendor-forms.js). */
(function (root) {
  "use strict";

  var C = (root.QA && root.QA.config) || require("./config.js");
  var U = (root.QA && root.QA.util) || require("./util.js");
  var N = (root.QA && root.QA.notes) || require("./notes.js");

  function val(v) { return U.collapse(v); }

  /* --------------------------------------------------------- plantillas --
     fields: dato → nombres de los campos del PDF que lo llevan (un mismo dato
     puede ir en varios: la fecha arriba y en la página 2). Las firmas no se
     nombran: quedan vacías. Los nombres son los del PDF, tal cual (algunos
     perdieron la ligadura «ti»: «connuación», «Endades», «Candad»). */
  var CONSENT_EN = {
    /* la fecha de la firma es la del día: va en la casilla de "Date of
       Signature", que en el PDF se llama "Signature2_es_:signer:signature" */
    date: ["Todays Date", "agentsEnes on the date of", "Fecha", "Signature2_es_:signer:signature"], clientName: ["Ms", "Full Name"],
    agentName: ["Agents andor Enes"], npn: ["NPN_2"], marital: ["Marital status"],
    income: ["Projected Annual Family Income"], taxPeople: ["Number of people on your 2023 tax return"],
    coveredPeople: ["People with medical coverage"], plan: ["Health Plan"]
  };
  var CONSENT_ES = {
    date: ["Fecha", "mencionados a connuación en la fecha de", "Fecha de la Firma"], clientName: ["Yo SrSra", "Nombre y Apellido"],
    agentName: ["Agentes yo Endades"], npn: ["NPN"], marital: ["Estatus marital"],
    income: ["Ingreso proyectado anual familiar"], taxPeople: ["Candad de personas en su declaración de impuestos 2023"],
    coveredPeople: ["Personas con cobertura médica"], plan: ["Plan"]
  };
  /* la prima se llama distinto en cada Consent */
  function withPremium(fields, name) { var f = Object.assign({}, fields); f.premium = [name]; return f; }

  /* El SOA en inglés no traía campos: tools/make-fillable-soa.js se los
     agrega con estos nombres, en los mismos lugares que el de español. La
     herramienta no los llena (el SOA se descarga sin llenar), pero así el
     agente puede escribir su sección en el PDF después. */
  var SOA_EN_FIELDS = {
    beneficiaryName: "Beneficiary Name",
    beneficiaryPhone: ["Beneficiary Phone Area", "Beneficiary Phone Prefix", "Beneficiary Phone Line"],
    agentName: "Licensed Sales Representative Name",
    npn: "Licensed Sales Representative ID",
    contactMethod: "Initial Method of Contact",
    plans: "Plans the Licensed Sales Representative Will Represent",
    /* solo si firma un representante autorizado: quedan vacíos */
    repName: "Authorized Representative Name",
    repRelation: "Relationship to Beneficiary"
  };

  var TEMPLATES = {
    "consent-qa-es": { kind: "consent", office: "QAgency", lang: "es", label: "Consent QAgency Español",
      file: "Consentimiento_2027_QA_Spa.pdf", fields: withPremium(CONSENT_ES, "Premium") },
    "consent-qa-en": { kind: "consent", office: "QAgency", lang: "en", label: "Consent QAgency English",
      file: "Consent_2027_QA_Eng.pdf", fields: withPremium(CONSENT_EN, "PREMIUM") },
    "consent-ath-es": { kind: "consent", office: "ATH Insurance", lang: "es", label: "Consent ATH Español",
      file: "Consentimiento_2027_ATH_Spa.pdf", fields: withPremium(CONSENT_ES, "Pago") },
    "consent-ath-en": { kind: "consent", office: "ATH Insurance", lang: "en", label: "Consent ATH English",
      file: "Consent_2027_ATH_Eng.pdf", fields: withPremium(CONSENT_EN, "Premium") },
    /* El SOA se descarga sin llenar: todo lo que se escribe está en la
       sección del agente, que el agente completa y firma después de que
       firme el cliente. Las 5 casillas siguen marcadas como en la plantilla. */
    "soa-es": { kind: "soa", lang: "es", label: "SOA Español", file: "SOA_Spanish_Agency.pdf", fields: {} },
    "soa-en": { kind: "soa", lang: "en", label: "SOA English", file: "SOA_English_Agency_Fillable.pdf", fields: {} }
  };

  /* Datos que se muestran en la pantalla, en orden, con su etiqueta. */
  var FIELDS = {
    consent: [
      { k: "clientName", l: "Nombre del cliente", w: "w2" }, { k: "date", l: "Fecha del consent" },
      { k: "agentName", l: "Agente" }, { k: "npn", l: "NPN" }, { k: "marital", l: "Estado civil" },
      { k: "income", l: "Ingreso anual" }, { k: "taxPeople", l: "En los taxes" },
      { k: "coveredPeople", l: "Con cobertura" }, { k: "plan", l: "Plan", w: "w2" }, { k: "premium", l: "Prima mensual" }
    ],
    /* del SOA solo a quién se le envía: van en la línea de Cliq y en el SMS, no en el PDF */
    soa: [
      { k: "beneficiaryName", l: "Nombre del beneficiario", w: "w2" }, { k: "beneficiaryPhone", l: "Teléfono del beneficiario", w: "w2" }
    ]
  };

  /* IDs de los campos en las plantillas de SignWell (los escribió el usuario
     en SignWell): el enlace los llena con los mismos datos. El SOA de
     SignWell solo tiene la firma y la fecha del cliente (la parte del agente
     se llena y se firma después), así que su enlace va sin datos. */
  var SIGN_IDS = {
    consent: [["client_name", "clientName"], ["client_name_sign", "clientName"], ["consent_date", "date"], ["agent_name", "agentName"],
      ["agent_npn", "npn"], ["plan", "plan"], ["premium", "premium"], ["marital_status", "marital"], ["income", "income"],
      ["tax_people", "taxPeople"], ["covered_people", "coveredPeople"]],
    soa: []
  };

  /* Consent en Obamacare Pendiente (cotización); SOA en las situaciones de
     Medicare que guardan un SOA en el Network. */
  function formKind(d) {
    /* con la carta de consentimiento ya recibida no hay nada que firmar, y si
       revisará los planes el consent todavía no se envía */
    if (d.line === "oc") { return N.outcomeOf(d).id === "pendiente" && !(d.net && d.net.consent) && !d.revisaPlanes ? "consent" : ""; }
    /* igual en Medicare: con el SOA ya marcado en el Network no hay nada que firmar */
    if (d.line === "mc") { return N.networkOf(d).some(function (n) { return n.k === "soa"; }) && !(d.net && d.net.soa) ? "soa" : ""; }
    return "";
  }

  function templateKey(kind, oficina, idioma) {
    var lang = idioma === "en" ? "en" : "es";
    if (kind === "soa") { return "soa-" + lang; }
    return "consent-" + (oficina === "ATH Insurance" ? "ath" : "qa") + "-" + lang;
  }

  /* ------------------------------------------------------------ valores -- */

  function fullName(d) { return U.titleCase(val(d.nombres) + " " + val(d.apellidos)); }
  function count(n) { return n ? String(n) : ""; }

  /* El plan que se va a aplicar: el seleccionado o, si solo se cotizó uno, ese. */
  function quotedPlan(d) {
    var list = N.planesOf(d), sel = list.filter(function (p) { return p.sel; })[0];
    return sel || (list.length === 1 ? list[0] : null);
  }

  /* Estado civil: casado o casada si en el hogar hay un cónyuge; si no, el que
     leyó el App Summary (dicho o interpretado). Sin ninguno, se deja para
     escribirlo. */
  var CIVIL = {
    casado: ["Married", "Casado", "Casada"], soltero: ["Single", "Soltero", "Soltera"], divorciado: ["Divorced", "Divorciado", "Divorciada"],
    viudo: ["Widowed", "Viudo", "Viuda"], separado: ["Separated", "Separado", "Separada"]
  };
  function maritalOf(d) {
    var married = N.personas(d).some(function (p) { return !p.titular && p.parentesco === "Cónyuge"; });
    var w = CIVIL[married ? "casado" : val(d.estadoCivil)];
    if (!w) { return ""; }
    return d.idioma === "en" ? w[0] : (d.genero === "a" ? w[2] : w[1]);
  }

  function consentValues(d) {
    var plan = quotedPlan(d), inc = N.ingresoHogar(d);
    return {
      clientName: fullName(d),
      date: U.parseDate(d.fecha) || "",
      agentName: U.titleCase(d.agente),
      npn: val(d.npn),
      marital: maritalOf(d),
      income: inc !== null ? N.moneyShort(inc) : "",
      taxPeople: count(N.enTaxes(d).length),
      coveredPeople: count(N.conCobertura(d).length),
      plan: plan ? [N.carrierName("oc", plan.compania), val(plan.plan)].filter(Boolean).join(" ") : "",
      premium: plan ? U.parseMoney(plan.prima) : ""
    };
  }

  function soaValues(d) {
    return { beneficiaryName: fullName(d), beneficiaryPhone: val(d.clienteTel) };
  }

  function values(kind, d) { return kind === "soa" ? soaValues(d) : consentValues(d); }

  /* { nombre del campo del PDF: valor }. Lo vacío no se escribe. */
  function fieldMap(key, v) {
    var T = TEMPLATES[key], out = {};
    if (!T) { return out; }
    Object.keys(T.fields).forEach(function (k) {
      var value = val(v[k]);
      if (value) { T.fields[k].forEach(function (name) { out[name] = value; }); }
    });
    return out;
  }

  /* ---------------------------------------------------------------- Cliq -- */

  function cliqText(kind, name, email, phone) {
    var to = [val(email), val(phone)].filter(Boolean).map(function (x) { return "al " + x; });
    return "Enviar " + (kind === "soa" ? "SOA" : "CONSENT") + " a " + (val(name) || "Apellido, Nombre") +
           (to.length ? " " + to.join(" y ") : "") + " pls @Support QAgency";
  }

  /* Los campos de la plantilla de SignWell con su valor, en el orden de
     SIGN_IDS y sin los vacíos: los usan el enlace y el envío por la API. */
  function signFields(kind, v) {
    return (SIGN_IDS[kind] || []).filter(function (x) { return val(v[x[1]]); }).map(function (x) {
      return { api_id: x[0], value: val(v[x[1]]) };
    });
  }

  /* ----------------------------------------------------- enlace de firma --
     El enlace de la plantilla (Template Link) de SignWell más los datos como
     parámetros, con el ID de cada campo. Sin un enlace http(s) no hay enlace. */
  function signingUrl(base, kind, v) {
    var b = val(base);
    if (!/^https?:\/\/\S+$/i.test(b)) { return ""; }
    var hash = "", h = b.indexOf("#");
    if (h >= 0) { hash = b.slice(h); b = b.slice(0, h); }
    var q = signFields(kind, v).map(function (f) {
      return encodeURIComponent(f.api_id) + "=" + encodeURIComponent(f.value);
    });
    if (!q.length) { return b + hash; }
    var sep = b.indexOf("?") < 0 ? "?" : (/[?&]$/.test(b) ? "" : "&");
    return b + sep + q.join("&") + hash;
  }

  /* SMS y email con el enlace, en el idioma del cliente (de usted), firmados
     con el nombre de la oficina. */
  var SIGN_TEXT = {
    consent: {
      es: { sms: "Para continuar con su seguro de salud, firme la carta de consentimiento en este enlace:",
            email: "Para continuar con su seguro de salud, necesitamos que firme la carta de consentimiento. Puede revisarla y firmarla en este enlace:" },
      en: { sms: "To continue with your health insurance, please sign the consent form at this link:",
            email: "To continue with your health insurance, we need you to sign the consent form. You can review and sign it at this link:" }
    },
    soa: {
      es: { sms: "Antes de su cita de Medicare, firme el formulario de Alcance de la Cita (SOA) en este enlace:",
            email: "Antes de su cita de Medicare, necesitamos que firme el formulario de Alcance de la Cita (SOA). Puede revisarlo y firmarlo en este enlace:" },
      en: { sms: "Before your Medicare appointment, please sign the Scope of Appointment (SOA) form at this link:",
            email: "Before your Medicare appointment, we need you to sign the Scope of Appointment (SOA) form. You can review and sign it at this link:" }
    }
  };

  function signTexts(kind, d, url) {
    var en = d.idioma === "en", t = SIGN_TEXT[kind === "soa" ? "soa" : "consent"][en ? "en" : "es"];
    var oficina = val(d.oficina) || C.OFFICES[0], office = C.OFFICE_NAMES[oficina] || oficina;
    var name = U.titleCase(val(d.nombres).split(" ")[0] || "");
    var hello = en ? "Dear " + (name || "client") + ":" : (d.genero === "a" ? "Estimada " : "Estimado ") + (name || "cliente") + ":";
    return {
      sms: [hello, t.sms, url, en ? "If you have any questions, contact us." : "Si tiene dudas, comuníquese con nosotros.", office].join("\n"),
      email: [hello, "", t.email, url, "", en ? "If you have any questions, please contact us." : "Si tiene alguna duda, comuníquese con nosotros.",
        "", en ? "Best regards," : "Saludos,", office].join("\n")
    };
  }

  /* El PDF lleno se descarga con el nombre del Consent o del SOA del Network. */
  function downloadName(d, kind) {
    var k = kind === "soa" ? "soa" : "consent";
    var f = N.buildFileNames(d).filter(function (x) { return x.k === k; })[0];
    return (f ? f.name : k.toUpperCase()) + ".pdf";
  }

  /* ------------------------------------------------ envío por la API --
     Lo que la herramienta le pasa al ayudante de firma (signing-helper.ps1),
     que guarda la clave de SignWell y hace la llamada: los datos van en un
     cuerpo JSON, nunca en un enlace. El firmante de cada plantilla de SignWell
     se llama SIGN_PLACEHOLDER. meta viaja con el documento en SignWell y dice
     con qué nombre y en qué carpeta del Network se guarda el PDF firmado.
     Sin plantilla, sin un email válido o sin el nombre del cliente no hay
     envío: { ok: false, missing: [...] }. */
  var SIGN_PLACEHOLDER = "Cliente";
  function buildSendPayload(kind, d, v, opts) {
    var o = opts || {}, soa = kind === "soa";
    var templateId = val(o.templateId), email = val(d.clienteEmail), name = val(soa ? v.beneficiaryName : v.clientName);
    var missing = [];
    if (!/^[A-Za-z0-9_-]+$/.test(templateId)) { missing.push("plantilla"); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { missing.push("email"); }
    if (!name) { missing.push("nombre"); }
    if (missing.length) { return { ok: false, missing: missing }; }
    var oficina = val(d.oficina) || C.OFFICES[0], k = soa ? "soa" : "consent";
    return { ok: true, body: {
      templateId: templateId,
      placeholder: SIGN_PLACEHOLDER,
      recipient: { name: name, email: email },
      fields: signFields(k, v),
      language: d.idioma === "en" ? "en" : "es",
      requester: val(o.requester) || C.OFFICE_NAMES[oficina] || oficina,
      meta: { kind: k, line: val(d.line), netKey: k, fileName: downloadName(d, k) }
    } };
  }

  /* --------------------------------------------- solo en el navegador --
     templateBytes: los bytes de una plantilla (vendor/forms/*.js las deja en
     window.QA_FORMS, en base64). fillPdf: llena los campos con el PDF.js de
     la herramienta y devuelve el PDF nuevo; un campo con varios lugares
     (Fecha) se llena en todos. Los demás campos quedan como estaban. */
  function templateBytes(key) {
    var b64 = root.QA_FORMS && root.QA_FORMS[key];
    if (!b64) { return null; }
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
  }

  function fillPdf(pdfjsLib, bytes, map) {
    return pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise.then(function (pdf) {
      var parents = [];
      return pdf.getFieldObjects().then(function (objs) {
        Object.keys(map).forEach(function (name) {
          ((objs && objs[name]) || []).forEach(function (o) {
            if (o.id && o.type) { pdf.annotationStorage.setValue(o.id, { value: map[name] }); }
            else if (o.id && o.kidIds) { parents.push({ ref: o.id, value: map[name] }); }
          });
        });
        return pdf.saveDocument();
      }).then(function (out) {
        pdf.destroy();
        return setFieldValues(out, parents);
      });
    });
  }

  /* --------------------------------------------- valor en el campo padre --
     Cuando un campo tiene sus lugares aparte (la Fecha del Consent, en dos
     páginas), PDF.js guarda el valor en cada lugar pero no en el campo. Si
     el PDF pide que el visor redibuje los campos (pasa cuando la letra del
     formulario no tiene «é» o «ñ»), Chrome los dibuja con el valor del
     campo, que queda vacío. Por eso se agrega al final del archivo una
     actualización con el valor en cada campo (sus objetos, otra vez, y una
     tabla de referencias nueva). Si el archivo no es como se espera (por
     ejemplo, el campo va comprimido dentro de otro objeto, como en el SOA en
     inglés, que no pide redibujar), sale tal como lo guardó PDF.js. */
  var PDF_WS = /[\0\t\n\f\r ]/, PDF_DELIM = /[\0\t\n\f\r ()<>\[\]{}\/%]/;

  function skipWs(s, i) { while (i < s.length && PDF_WS.test(s.charAt(i))) { i++; } return i; }

  /* Fin del valor que empieza en i (diccionario, arreglo, texto, nombre,
     número, referencia «12 0 R» o palabra), o -1 si no se entiende. */
  function skipValue(s, i) {
    i = skipWs(s, i);
    var c = s.charAt(i), depth = 0, m;
    if (c === "(") {
      for (; i < s.length; i++) {
        c = s.charAt(i);
        if (c === "\\") { i++; } else if (c === "(") { depth++; } else if (c === ")" && --depth === 0) { return i + 1; }
      }
      return -1;
    }
    if (c === "<" && s.charAt(i + 1) === "<") { return skipList(s, i + 2, ">>", true); }
    if (c === "<") { var e = s.indexOf(">", i); return e < 0 ? -1 : e + 1; }
    if (c === "[") { return skipList(s, i + 1, "]", false); }
    var start = i;
    if (c === "/") { i++; }
    while (i < s.length && !PDF_DELIM.test(s.charAt(i))) { i++; }
    if (i === start) { return -1; }
    m = /^\d+$/.test(s.slice(start, i)) && /^[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+R(?![^\0\t\n\f\r ()<>\[\]{}\/%])/.exec(s.slice(i, i + 32));
    return m ? i + m[0].length : i;
  }
  function skipList(s, i, close, pairs) {
    for (;;) {
      i = skipWs(s, i);
      if (s.substr(i, close.length) === close) { return i + close.length; }
      if (i >= s.length) { return -1; }
      if (pairs) { i = skipValue(s, i); if (i < 0) { return -1; } }
      i = skipValue(s, i);
      if (i < 0) { return -1; }
    }
  }
  /* Las entradas de un diccionario que empieza en i: { clave: texto }, en orden, y su fin. */
  function readDict(s, i) {
    i = skipWs(s, i);
    if (s.substr(i, 2) !== "<<") { return null; }
    var keys = [], raw = {};
    i += 2;
    for (;;) {
      i = skipWs(s, i);
      if (s.substr(i, 2) === ">>") { return { keys: keys, raw: raw, end: i + 2 }; }
      if (s.charAt(i) !== "/") { return null; }
      var k = skipValue(s, i), v = k < 0 ? -1 : skipValue(s, k);
      if (v < 0) { return null; }
      var key = s.slice(i, k);
      keys.push(key); raw[key] = s.slice(k, v).trim();
      i = v;
    }
  }

  /* Texto de PDF: ASCII entre paréntesis; si no, UTF-16 en hexadecimal. */
  function pdfText(v) {
    v = String(v);
    if (/^[\x20-\x7e]*$/.test(v)) { return "(" + v.replace(/[\\()]/g, "\\$&") + ")"; }
    var hex = "FEFF";
    for (var i = 0; i < v.length; i++) { hex += ("000" + v.charCodeAt(i).toString(16).toUpperCase()).slice(-4); }
    return "<" + hex + ">";
  }

  function setFieldValues(bytes, parents) {
    if (!parents.length) { return bytes; }
    var s = "", i;
    for (i = 0; i < bytes.length; i += 8192) { s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); }
    var sx = s.lastIndexOf("startxref"), prev = sx < 0 ? NaN : parseInt(s.slice(sx + 9, sx + 40).trim(), 10);
    if (isNaN(prev)) { return bytes; }
    var at = /^xref\b/.test(s.slice(prev, prev + 4)) ? s.indexOf("trailer", prev) + 7 : s.indexOf("obj", prev) + 3;
    var trailer = at > 6 && readDict(s, at);
    if (!trailer || !trailer.raw["/Size"] || !trailer.raw["/Root"] || trailer.raw["/Encrypt"]) { return bytes; }

    var size = parseInt(trailer.raw["/Size"], 10), body = "\n", entries = [];
    parents.forEach(function (p) {
      var ref = /^(\d+)R(\d*)$/.exec(p.ref);
      if (!ref) { return; }
      var num = +ref[1], gen = +(ref[2] || 0), re = new RegExp("(^|[^0-9])" + num + "[\\0\\t\\n\\f\\r ]+" + gen + "[\\0\\t\\n\\f\\r ]+obj\\b", "g");
      var m, last = -1;
      while ((m = re.exec(s))) { last = m.index + m[1].length; }
      var dict = last >= 0 && readDict(s, s.indexOf("obj", last) + 3);
      if (!dict || !/^[\0\t\n\f\r ]*endobj/.test(s.slice(dict.end, dict.end + 16))) { return; }
      var parts = dict.keys.filter(function (k) { return k !== "/V"; }).map(function (k) { return k + " " + dict.raw[k]; });
      parts.push("/V " + pdfText(p.value));
      entries.push({ num: num, gen: gen, off: s.length + body.length });
      body += num + " " + gen + " obj\n<<" + parts.join(" ") + ">>\nendobj\n";
    });
    if (!entries.length) { return bytes; }

    /* tabla de referencias como objeto (como la que escribe PDF.js): tipo, posición y generación */
    var xrefAt = s.length + body.length;
    entries.push({ num: size, gen: 0, off: xrefAt });
    entries.sort(function (a, b) { return a.num - b.num; });
    var data = entries.map(function (e) {
      return String.fromCharCode(1, (e.off >>> 24) & 255, (e.off >>> 16) & 255, (e.off >>> 8) & 255, e.off & 255, (e.gen >>> 8) & 255, e.gen & 255);
    }).join("");
    var index = entries.map(function (e) { return e.num + " 1"; }).join(" ");
    body += size + " 0 obj\n<< /Type /XRef /Size " + (size + 1) + " /Prev " + prev + " /Root " + trailer.raw["/Root"] +
      (trailer.raw["/Info"] ? " /Info " + trailer.raw["/Info"] : "") + (trailer.raw["/ID"] ? " /ID " + trailer.raw["/ID"] : "") +
      " /Index [" + index + "] /W [1 4 2] /Length " + data.length + " >>\nstream\n" + data + "\nendstream\nendobj\nstartxref\n" +
      xrefAt + "\n%%EOF\n";

    var out = new Uint8Array(bytes.length + body.length);
    out.set(bytes);
    for (i = 0; i < body.length; i++) { out[bytes.length + i] = body.charCodeAt(i) & 255; }
    return out;
  }

  var api = {
    TEMPLATES: TEMPLATES, FIELDS: FIELDS, SIGN_IDS: SIGN_IDS, SOA_EN_FIELDS: SOA_EN_FIELDS,
    formKind: formKind, templateKey: templateKey, consentValues: consentValues, soaValues: soaValues, values: values,
    fieldMap: fieldMap, cliqText: cliqText, signFields: signFields, signingUrl: signingUrl, signTexts: signTexts, downloadName: downloadName,
    SIGN_PLACEHOLDER: SIGN_PLACEHOLDER, buildSendPayload: buildSendPayload,
    templateBytes: templateBytes, fillPdf: fillPdf
  };
  root.QA = root.QA || {};
  root.QA.forms = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
