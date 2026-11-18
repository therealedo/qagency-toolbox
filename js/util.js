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
  /* Fecha de nacimiento: con el año en dos cifras ("5/2/80") no puede
     quedar en el futuro, así que es 1980 y no 2080 */
  function parseBirth(input) {
    var v = parseDate(input), y = v ? +v.slice(-4) : 0;
    return y > new Date().getFullYear() ? v.slice(0, 6) + (y - 100) : v;
  }

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

  /* Hora en formato de 12 horas sin am/pm, como va en las notas: 14:44 -> 02:44. */
  function to12h(input) {
    var t = input instanceof Date ? pad2(input.getHours()) + ":" + pad2(input.getMinutes()) : parseTime(input);
    if (!t) { return ""; }
    var h = +t.slice(0, 2) % 12;
    return pad2(h === 0 ? 12 : h) + t.slice(2);
  }

  /* Hora escrita como sea (9, 934, 2:30, 2pm, 14:30) -> HH:MM exacta en 24 h.
     Sin AM/PM, de 1 a 6 se entiende de la tarde, que es lo que cae en
     horario de oficina. */
  function parseClock(input) {
    var t = String(input == null ? "" : input).trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
    if (!t) { return ""; }
    var m = t.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
    if (!m) { return ""; }
    var h = +m[1], mi = m[2] ? +m[2] : 0, ap = m[3] ? m[3][0] : "";
    if (h > 23 || mi > 59) { return ""; }
    if (ap === "p" && h < 12) { h += 12; }
    if (ap === "a" && h === 12) { h = 0; }
    if (!ap && h >= 1 && h <= 6) { h += 12; }
    return pad2(h) + ":" + pad2(mi);
  }

  /* La misma hora, redondeada a la media hora más cercana. */
  function parseSlot(input) {
    var t = parseClock(input);
    if (!t) { return ""; }
    var total = Math.min(1410, Math.round((+t.slice(0, 2) * 60 + +t.slice(3)) / 30) * 30);
    return pad2(Math.floor(total / 60)) + ":" + pad2(total % 60);
  }

  /* La media hora en que cae una hora (la de antes): 09:34 -> 09:30. Es la
     hora que lleva el task; la nota lleva la exacta. */
  function floorSlot(input) {
    var t = parseTime(input);
    if (!t) { return ""; }
    return t.slice(0, 3) + (+t.slice(3) < 30 ? "00" : "30");
  }

  /* "14:30" -> "2:30 PM": para leerla sin dudas (citas, SMS, listas). */
  function timeLabel(input) {
    var t = parseTime(input);
    if (!t) { return ""; }
    var h = +t.slice(0, 2);
    return (h % 12 === 0 ? 12 : h % 12) + t.slice(2) + (h < 12 ? " AM" : " PM");
  }

  /* Horas de revisión del task: solo en punto y y media, de 7:00 AM a 9:30 PM.
     v se guarda en 24 h (sin ambigüedad); l es lo que se ve en la lista. */
  function halfHourSlots() {
    var out = [];
    for (var h = 7; h <= 21; h++) {
      [0, 30].forEach(function (m) {
        var v = pad2(h) + ":" + pad2(m);
        out.push({ v: v, l: to12h(v) + " · " + timeLabel(v) });
      });
    }
    return out;
  }

  /* "03/15/2026" -> "2026 MAR": año y mes como van en los nombres de archivo. */
  function yearMonth(mdy) {
    var p = parseDate(mdy);
    if (!p) { return ""; }
    var a = p.split("/");
    return a[2] + " " + MONTH_ABBR[+a[0] - 1];
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

  /* "DIAZ DE LA PENA" -> "Diaz De La Pena": cada palabra con mayúscula, que
     es como la agencia escribe los nombres en Zoho y en los archivos. */
  function titleCase(s) {
    return collapse(s).toLowerCase().split(" ").map(function (w) {
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

  /* Archivo del equipo (QAgency-Equipo.json). Los nombres y los NPN no van en
     el código, que es público: la oficina comparte este archivo y cada quien
     lo importa en Ajustes. parseTeam devuelve { team } o { error }; las
     personas sin nombre se descartan y un nombre repetido se queda con la
     primera vez que aparece. */
  var TEAM_APP = "qagency-toolbox-team";
  var TEAM_BAD = "Este no es un archivo del equipo válido (QAgency-Equipo.json).";

  function letters(s) { return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3); }

  function cleanMember(m) {
    if (!m || typeof m !== "object" || typeof m.name !== "string") { return null; }
    var name = collapse(m.name).slice(0, 80);
    if (!name) { return null; }
    var out = { name: name, ini: letters(m.ini) || initials(name) };
    var agent = letters(m.agentIni);
    if (agent && agent !== out.ini) { out.agentIni = agent; }
    out.npn = String(m.npn == null ? "" : m.npn).replace(/\D/g, "").slice(0, 10);
    var tel = collapse(m.tel).slice(0, 30);
    if (tel) { out.tel = tel; }
    /* la agencia con la que trabaja el agente (su Consent y sus mensajes) */
    var oficina = collapse(m.oficina).slice(0, 40);
    if (oficina) { out.oficina = oficina; }
    return out;
  }

  function cleanTeam(list) {
    var seen = {}, team = [];
    list.forEach(function (m) {
      var c = cleanMember(m);
      if (!c) { return; }
      var key = c.name.toLowerCase();
      if (seen[key]) { return; }
      seen[key] = true;
      team.push(c);
    });
    return team;
  }

  function parseTeam(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { error: TEAM_BAD }; }
    var list = Array.isArray(data) ? data : (data && typeof data === "object" && Array.isArray(data.team) ? data.team : null);
    if (!list) { return { error: TEAM_BAD }; }
    var team = cleanTeam(list);
    if (!team.length) { return { error: "El archivo del equipo no tiene ninguna persona con nombre." }; }
    return { team: team, signLinks: Array.isArray(data) ? {} : cleanLinks(data.signLinks) };
  }

  /* Los enlaces de las plantillas de SignWell van en el mismo archivo: son de
     la oficina, no de cada persona. Solo se guardan enlaces https. */
  function cleanLinks(links) {
    var out = {};
    if (!links || typeof links !== "object" || Array.isArray(links)) { return out; }
    Object.keys(links).forEach(function (k) {
      if (!/^[a-z0-9_-]{1,40}$/i.test(k) || typeof links[k] !== "string") { return; }
      var url = collapse(links[k]).slice(0, 500);
      if (/^https:\/\/\S+$/i.test(url)) { out[k] = url; }
    });
    return out;
  }

  function teamFile(team, signLinks) {
    var file = { app: TEAM_APP, version: 1, team: cleanTeam(team || []) };
    var links = cleanLinks(signLinks);
    if (Object.keys(links).length) { file.signLinks = links; }
    return JSON.stringify(file, null, 2) + "\n";
  }

  /* ¿La versión publicada (remote) es más nueva que la instalada (local)?
     Solo números separados por puntos; cualquier otra cosa no cuenta. */
  function newerVersion(remote, local) {
    var re = /^\d+(\.\d+)*$/;
    if (!re.test(String(remote || "")) || !re.test(String(local || ""))) { return false; }
    var a = String(remote).split(".").map(Number), b = String(local).split(".").map(Number);
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var x = a[i] || 0, y = b[i] || 0;
      if (x !== y) { return x > y; }
    }
    return false;
  }

  /* La copia instalada abre con su ícono, que lleva ?perfil=propio: así usa el
     perfil del navegador que es solo de la herramienta, donde están los
     ajustes. Abierta de otra forma (un ancla vieja de la barra de tareas, doble
     clic en el archivo) cae en otro perfil, que no tiene esos ajustes.
     "propio", "otro", o "" si no es la copia instalada. */
  function launchCheck(loc) {
    if (!loc || loc.protocol !== "file:") { return ""; }
    if (/(^|[?&])perfil=propio(&|$)/.test(String(loc.search || "").replace(/^\?/, ""))) { return "propio"; }
    var path = String(loc.pathname || "");
    try { path = decodeURIComponent(path); } catch (e) { /* se usa tal cual */ }
    return /\/QAgencyToolbox\/QAgency-Toolbox\.html$/i.test(path) ? "otro" : "";
  }

  /* Saludo de la pantalla de inicio: por la hora, con el primer nombre. */
  function greeting(hour, fullName) {
    var h = Number(hour), when = h >= 5 && h < 12 ? "Buenos días" : (h >= 12 && h < 19 ? "Buenas tardes" : "Buenas noches");
    var first = titleCase(collapse(fullName).split(" ")[0] || "");
    return when + (first ? ", " + first : "") + ".";
  }

  /* "App enviada, pendiente o cancelación": la primera como viene, las demás
     en minúscula, como se dice. */
  function joinOr(list) {
    var xs = (list || []).map(collapse).filter(Boolean).map(function (x, i) {
      return i ? x.charAt(0).toLowerCase() + x.slice(1) : x;
    });
    return xs.length < 2 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " o " + xs[xs.length - 1];
  }

  /* Resumen de una sección cerrada: sus valores en una línea, sin repetidos. */
  function summaryLine(values) {
    var seen = {}, out = [];
    (values || []).forEach(function (v) {
      var s = collapse(v), k = s.toLowerCase();
      if (s && !seen[k]) { seen[k] = true; out.push(s); }
    });
    return out.length ? out.join(" · ") : "Sin datos todavía";
  }

  var api = {
    pad2: pad2, fmtDate: fmtDate, today: today, parseDate: parseDate, parseBirth: parseBirth, parseDateWords: parseDateWords,
    findDate: findDate, toDateObj: toDateObj, addDays: addDays, addMonths: addMonths, taskDate: taskDate,
    parseTime: parseTime, parseSlot: parseSlot, parseClock: parseClock, floorSlot: floorSlot, to12h: to12h, timeLabel: timeLabel, halfHourSlots: halfHourSlots, yearMonth: yearMonth, defaultPlanYear: defaultPlanYear, moneyNumber: moneyNumber, parseMoney: parseMoney,
    stripAccents: stripAccents, collapse: collapse, titleCase: titleCase, initials: initials,
    splitName: splitName, parseList: parseList, escapeHtml: escapeHtml, MONTHS: MONTHS,
    parseTeam: parseTeam, teamFile: teamFile, newerVersion: newerVersion, launchCheck: launchCheck,
    greeting: greeting, joinOr: joinOr, summaryLine: summaryLine
  };
  root.QA = root.QA || {};
  root.QA.util = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
