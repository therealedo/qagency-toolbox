/* Q Agency Toolbox — utilidades de fechas, dinero y texto. Sin dependencias. */
(function (root) {
  "use strict";

  function pad2(n) { return ("0" + n).slice(-2); }

  function fmtDate(d) {
    return pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + "/" + d.getFullYear();
  }

  function today() { return fmtDate(new Date()); }

  var MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
    septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    ene: 1, abr: 4, ago: 8, dic: 12
  };
  var MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  function validYMD(y, m, d) {
    if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31) || !(y >= 1900 && y <= 2100)) { return false; }
    var dt = new Date(y, m - 1, d);
    return dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  /* Convierte casi cualquier forma de escribir una fecha a MM/DD/YYYY.
     Devuelve "" si no la entiende. Acepta 1/5/27, 01-05-2027, 2027-01-05,
     01052027, "Jan 5, 2027" y "5 de enero de 2027". */
  function parseDate(input) {
    var t = String(input == null ? "" : input).trim();
    if (!t) { return ""; }
    var m, y, mo, d;

    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      y = +m[1]; mo = +m[2]; d = +m[3];
      return validYMD(y, mo, d) ? pad2(mo) + "/" + pad2(d) + "/" + y : "";
    }

    m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (m) {
      mo = +m[1]; d = +m[2]; y = +m[3];
      if (m[3].length === 2) { y += 2000; }
      return validYMD(y, mo, d) ? pad2(mo) + "/" + pad2(d) + "/" + y : "";
    }

    m = t.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (m) {
      mo = +m[1]; d = +m[2]; y = +m[3];
      return validYMD(y, mo, d) ? pad2(mo) + "/" + pad2(d) + "/" + y : "";
    }

    m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) {
      mo = +m[1]; d = +m[2]; y = new Date().getFullYear();
      return validYMD(y, mo, d) ? pad2(mo) + "/" + pad2(d) + "/" + y : "";
    }

    return parseDateWords(t);
  }

  /* Fechas con el mes en letras, en inglés o español. */
  function parseDateWords(t) {
    t = String(t || "");
    var m = t.match(/([A-Za-zÁÉÍÓÚáéíóú]{3,12})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(?:de\s+|del\s+)?(\d{4})/);
    var mo;
    if (m) {
      mo = MONTHS[m[1].toLowerCase()];
      if (mo && validYMD(+m[3], mo, +m[2])) { return pad2(mo) + "/" + pad2(+m[2]) + "/" + m[3]; }
    }
    m = t.match(/(\d{1,2})\s+(?:de\s+)?([A-Za-zÁÉÍÓÚáéíóú]{3,12})\.?,?\s+(?:de\s+|del\s+)?(\d{4})/);
    if (m) {
      mo = MONTHS[m[2].toLowerCase()];
      if (mo && validYMD(+m[3], mo, +m[1])) { return pad2(mo) + "/" + pad2(+m[1]) + "/" + m[3]; }
    }
    return "";
  }

  /* Primera fecha que aparezca dentro de un texto, en cualquier formato. */
  function findDate(text) {
    var t = String(text || "");
    var m = t.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-](?:\d{4}|\d{2}))\b/);
    var numeric = m ? parseDate(m[1]) : "";
    var words = parseDateWords(t);
    if (numeric && words) {
      /* gana la que aparezca primero */
      var wi = t.search(/[A-Za-zÁÉÍÓÚáéíóú]{3,12}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:de\s+)?\d{4}|\d{1,2}\s+(?:de\s+)?[A-Za-zÁÉÍÓÚáéíóú]{3,12}\.?,?\s+(?:de\s+)?\d{4}/);
      return (wi >= 0 && wi < m.index) ? words : numeric;
    }
    return numeric || words;
  }

  function toDateObj(mdy) {
    var p = parseDate(mdy);
    if (!p) { return null; }
    var a = p.split("/");
    return new Date(+a[2], +a[0] - 1, +a[1]);
  }

  function addDays(mdy, n) {
    var d = toDateObj(mdy) || new Date();
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }

  function addMonths(mdy, n) {
    var d = toDateObj(mdy) || new Date();
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return fmtDate(d);
  }

  /* 02/15/2027 -> FEB/15/2027, el formato del task FOLLOW UP DOCS BY. */
  function taskDate(mdy) {
    var p = parseDate(mdy);
    if (!p) { return ""; }
    var a = p.split("/");
    return MONTH_ABBR[+a[0] - 1] + "/" + a[1] + "/" + a[2];
  }

  /* 9, 930, 9:30, 2pm, 14:15 -> HH:MM en 24 horas. */
  function parseTime(input) {
    var t = String(input == null ? "" : input).trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
    if (!t) { return ""; }
    var m = t.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
    if (!m) { return ""; }
    var h = +m[1], mi = m[2] ? +m[2] : 0, ap = m[3] ? m[3][0] : "";
    if (ap === "p" && h < 12) { h += 12; }
    if (ap === "a" && h === 12) { h = 0; }
    if (h > 23 || mi > 59) { return ""; }
    return pad2(h) + ":" + pad2(mi);
  }

  /* Año de plan que toca vender hoy: desde octubre ya es el siguiente. */
  function defaultPlanYear(d) {
    d = d || new Date();
    return String(d.getFullYear() + (d.getMonth() >= 9 ? 1 : 0));
  }

  function moneyNumber(input) {
    var t = String(input == null ? "" : input).replace(/[^0-9.\-]/g, "");
    if (!t || t === "-" || t === ".") { return null; }
    var n = Number(t);
    return isFinite(n) ? n : null;
  }

  /* "850.1", "$1,200", "0" -> "$850.10", "$1,200.00", "$0.00". */
  function parseMoney(input) {
    var n = moneyNumber(input);
    if (n === null) { return ""; }
    var neg = n < 0;
    var s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-$" : "$") + s;
  }

  function stripAccents(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function collapse(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  var LOWER_WORDS = { de: 1, del: 1, la: 1, las: 1, los: 1, y: 1, da: 1, dos: 1, van: 1, von: 1 };

  /* "DIAZ PEREZ" -> "Diaz Perez", respetando partículas y apóstrofos. */
  function titleCase(s) {
    return collapse(s).toLowerCase().split(" ").map(function (w, i) {
      if (i > 0 && LOWER_WORDS[w]) { return w; }
      return w.replace(/(^|[-'’])([a-záéíóúñü])/g, function (_, a, b) { return a + b.toUpperCase(); });
    }).join(" ");
  }

  /* Iniciales por defecto: primera letra del nombre y del primer apellido. */
  function initials(name) {
    var parts = collapse(name).split(" ").filter(function (p) {
      return p.length > 1 && !LOWER_WORDS[p.toLowerCase()];
    });
    if (!parts.length) { return ""; }
    if (parts.length === 1) { return parts[0].slice(0, 2).toUpperCase(); }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /* Reparte un nombre completo en nombres y apellidos. Es una aproximación
     (2 palabras: 1+1, 3: 1+2, 4 o más: 2+resto) y el agente la confirma. */
  function splitName(full) {
    var t = collapse(String(full || "").replace(/,/g, " "));
    if (!t) { return { nombres: "", apellidos: "" }; }
    var raw = t.split(" "), w = [];
    /* las partículas se pegan a la palabra que sigue: "DE LA CRUZ" */
    for (var i = 0; i < raw.length; i++) {
      var piece = raw[i];
      while (LOWER_WORDS[raw[i].toLowerCase()] && i + 1 < raw.length) { i++; piece += " " + raw[i]; }
      w.push(piece);
    }
    if (w.length === 1) { return { nombres: w[0], apellidos: "" }; }
    if (w.length === 2) { return { nombres: w[0], apellidos: w[1] }; }
    if (w.length === 3) { return { nombres: w[0], apellidos: w[1] + " " + w[2] }; }
    return { nombres: w.slice(0, 2).join(" "), apellidos: w.slice(2).join(" ") };
  }

  /* Lista de miembros escrita con saltos de línea, comas o punto y coma. */
  function parseList(text) {
    return String(text || "").split(/[\n;,]+/).map(collapse).filter(Boolean);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var api = {
    pad2: pad2, fmtDate: fmtDate, today: today, parseDate: parseDate, parseDateWords: parseDateWords,
    findDate: findDate, toDateObj: toDateObj, addDays: addDays, addMonths: addMonths, taskDate: taskDate,
    parseTime: parseTime, defaultPlanYear: defaultPlanYear, moneyNumber: moneyNumber, parseMoney: parseMoney,
    stripAccents: stripAccents, collapse: collapse, titleCase: titleCase, initials: initials,
    splitName: splitName, parseList: parseList, escapeHtml: escapeHtml, MONTHS: MONTHS
  };
  root.QA = root.QA || {};
  root.QA.util = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
