/* Q Agency Toolbox: el reporte diario de tasks («<NOMBRE> TASKS PENDING -
   UPDATE MM/DD/YYYY») que llega por Cliq.

   El agente marca en ese PDF las filas que ya trabajó, con el mismo
   resaltado verde que pone Edge o Acrobat (una anotación /Highlight sobre
   toda la fila), y devuelve el mismo archivo a Cliq. Aquí se lee la tabla
   (las posiciones del texto, que da PDF.js), se busca la fila del cliente
   por su código Q o por su nombre como en Zoho («Apellido, Nombre») y se
   agrega el resaltado al final del archivo, sin tocar lo que ya tenía: los
   objetos nuevos, la página (o su lista de anotaciones) otra vez con el
   resaltado y una tabla de referencias nueva. Quitar el último resaltado es
   otra actualización igual, con la lista sin él. Sin dependencias. */
(function (root) {
  "use strict";

  var TITLE_RE = /TASKS\s+PENDING\s*-\s*UPDATE\b/i;

  /* --------------------------------------------------------- el título -- */

  /* «JANE DOE TASKS PENDING - UPDATE 11/22/2026»: el nombre y la fecha */
  function reportTitle(text) {
    var t = String(text || "").replace(/\s+/g, " ");
    var m = /(?:^|\s)([A-Za-zÁÉÍÓÚÑáéíóúñ.' -]*?)\s*TASKS\s+PENDING\s*-\s*UPDATE\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
    if (!m) { return TITLE_RE.test(t) ? { name: "", date: "" } : null; }
    var pad = function (n) { return ("0" + n).slice(-2); };
    return { name: m[1].trim(), date: pad(m[2]) + "/" + pad(m[3]) + "/" + m[4] };
  }
  function isReport(text) { return TITLE_RE.test(String(text || "")); }

  /* ------------------------------------------------------------ la tabla --
     `pages`: [{ index, items: [{ str, x, y, w, h }] }] en puntos del PDF (y
     hacia arriba, la línea base del texto). Encabezados: # / Code / Full
     Name / Date of Birth / Language / Subject / Due Date. Cada fila empieza
     con su número en la columna # y puede ocupar varias líneas (un Subject
     largo). El resaltado cubre el alto del texto de la fila, como el que se
     pone a mano en Edge, y va a lo ancho de la tabla. */
  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  }
  function lines(items) {
    var sorted = items.filter(function (it) { return String(it.str).trim(); }).slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var out = [];
    sorted.forEach(function (it) {
      var tol = Math.max(2, (it.h || 8) * 0.4);
      var ln = out.filter(function (l) { return Math.abs(l.y - it.y) <= tol; })[0];
      if (!ln) { ln = { y: it.y, items: [] }; out.push(ln); }
      ln.items.push(it);
    });
    out.forEach(function (l) { l.items.sort(function (a, b) { return a.x - b.x; }); });
    out.sort(function (a, b) { return b.y - a.y; });
    return out;
  }
  function headerOf(ls) {
    for (var i = 0; i < ls.length; i++) {
      var its = ls[i].items, at = function (re) {
        for (var k = 0; k < its.length; k++) { if (re.test(norm(its[k].str))) { return its[k]; } }
        return null;
      };
      var code = at(/^CODE\b/), name = at(/^FULL\s*NAME\b|^NAME\b/);
      if (code && name) {
        var later = its.filter(function (it) { return it.x > name.x + 1; });
        var left = Math.min.apply(null, its.map(function (it) { return it.x; }));
        var right = Math.max.apply(null, its.map(function (it) { return it.x + (it.w || 0); }));
        return { line: i, y: ls[i].y, code: code.x, name: name.x, after: later[0] ? later[0].x : Infinity,
                 afterDob: later[1] ? later[1].x : Infinity, left: left, right: right };
      }
    }
    return null;
  }
  function cellText(items, from, to) {
    return items.filter(function (it) { return it.x >= from - 2 && it.x < to - 2; })
      .map(function (it) { return String(it.str).trim(); }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function reportRows(pages) {
    var rows = [], head = null;
    (pages || []).forEach(function (pg) {
      var ls = lines(pg.items || []);
      var h = headerOf(ls) || head;
      if (!h) { return; }
      head = h;
      var start = headerOf(ls) ? h.line + 1 : 0, cur = null, pageRows = [];
      for (var i = start; i < ls.length; i++) {
        var its = ls[i].items, first = its[0];
        var isNew = first && /^\d{1,4}$/.test(String(first.str).trim()) && first.x < h.code - 2;
        if (isNew) {
          cur = { page: pg.index, n: +String(first.str).trim(), lines: [] };
          pageRows.push(cur);
        }
        if (cur) { cur.lines.push(ls[i]); }
      }
      pageRows.forEach(function (r, k) {
        var all = [];
        r.lines.forEach(function (l) { all = all.concat(l.items); });
        var top = Math.max.apply(null, all.map(function (it) { return it.y + (it.h || 8) * 0.8; }));
        var bottom = Math.min.apply(null, all.map(function (it) { return it.y - (it.h || 8) * 0.25; }));
        r.code = cellText(all, h.code, h.name).replace(/\s+/g, "");
        r.name = cellText(all, h.name, h.after);
        /* la fecha de nacimiento distingue a dos personas con el mismo nombre */
        r.dob = cellText(all, h.after, h.afterDob);
        /* como el resaltado a mano de Edge: el alto del texto de la fila
           (todas sus líneas), desde la columna # hasta pasar Due Date */
        r.rect = [h.left, bottom - 0.5, h.right + 5, top + 1.5];
        delete r.lines;
        rows.push(r);
      });
    });
    return rows;
  }

  /* --------------------------------------------------------- la búsqueda --
     Por el código («Q12345», a veces con una L al final) y, si el caso no
     tiene o no aparece, por el nombre exacto como en Zoho, sin mirar
     mayúsculas ni acentos. Devuelve todas las filas que coinciden: con más
     de una se pregunta. */
  function codeKey(s) { return norm(s).replace(/[^A-Z0-9]/g, ""); }
  function nameKey(s) { return norm(s).replace(/\s*,\s*/g, ", ").replace(/[^A-Z, '-]/g, ""); }
  function findRows(rows, q) {
    q = q || {};
    var code = codeKey(q.code), name = nameKey(q.name);
    var byCode = code ? rows.filter(function (r) { var c = codeKey(r.code); return c && (c === code || c.replace(/L$/, "") === code.replace(/L$/, "")); }) : [];
    if (byCode.length) { return byCode; }
    return name ? rows.filter(function (r) { return nameKey(r.name) === name; }) : [];
  }
  /* lo que escribe el agente a mano: un código Q o «Apellido, Nombre» */
  function parseQuery(text) {
    var t = String(text || "").trim();
    return /^Q?\s*\d{3,}\s*L?$/i.test(t) ? { code: /^Q/i.test(t) ? t : "Q" + t } : { name: t };
  }

  /* ------------------------------------------------- objetos del archivo -- */
  var WS = /[\0\t\n\f\r ]/, DELIM = /[\0\t\n\f\r ()<>\[\]{}\/%]/;
  function skipWs(s, i) { while (i < s.length && WS.test(s.charAt(i))) { i++; } return i; }
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
    while (i < s.length && !DELIM.test(s.charAt(i))) { i++; }
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
  function toStr(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 8192) { s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); }
    return s;
  }
  function fromStr(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) { out[i] = s.charCodeAt(i) & 255; }
    return out;
  }
  function inflate(bytes) {
    if (typeof DecompressionStream === "undefined") { return Promise.reject(new Error("sin DecompressionStream")); }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  /* Cada «N G obj» del archivo, con su posición: el último de cada número
     es el vigente (las actualizaciones van al final). */
  function plainObjects(s) {
    var re = /(^|[^0-9])(\d+)[\0\t\n\f\r ]+(\d+)[\0\t\n\f\r ]+obj\b/g, m, map = {};
    while ((m = re.exec(s))) {
      var at = m.index + m[1].length, body = re.lastIndex;
      map[m[2]] = { num: +m[2], gen: +m[3], at: at, body: body };
    }
    return map;
  }
  function streamOf(s, o, dict) {
    var i = s.indexOf("stream", dict.end);
    if (i < 0) { return null; }
    i += 6;
    if (s.charAt(i) === "\r") { i++; }
    if (s.charAt(i) === "\n") { i++; }
    var len = parseInt(dict.raw["/Length"], 10);
    if (!/^\d+$/.test(dict.raw["/Length"] || "")) {
      var end = s.indexOf("endstream", i);
      len = end < 0 ? NaN : end - i;
      while (len > 0 && /[\r\n]/.test(s.charAt(i + len - 1))) { len--; }
    }
    return isNaN(len) ? null : s.slice(i, i + len);
  }

  /* El archivo leído: los objetos sueltos y, de ser necesario, los que van
     comprimidos dentro de un /ObjStm (con su posición, la del /ObjStm). */
  function openPdf(bytes) {
    var s = toStr(bytes), objs = plainObjects(s), packed = {}, jobs = [];
    Object.keys(objs).forEach(function (k) {
      var o = objs[k], dict = readDict(s, o.body);
      o.dict = dict;
      if (!dict || !/\/ObjStm\b/.test(dict.raw["/Type"] || "")) { return; }
      if (!/^\/FlateDecode$|^\[\s*\/FlateDecode\s*\]$/.test(dict.raw["/Filter"] || "") || dict.raw["/DecodeParms"]) { return; }
      var data = streamOf(s, o, dict);
      if (data == null) { return; }
      jobs.push(inflate(fromStr(data)).then(function (raw) {
        var t = toStr(raw), n = parseInt(dict.raw["/N"], 10), first = parseInt(dict.raw["/First"], 10);
        var nums = t.slice(0, first).trim().split(/\s+/).map(Number);
        for (var j = 0; j < n; j++) {
          var num = nums[2 * j], off = first + nums[2 * j + 1];
          var end = j + 1 < n ? first + nums[2 * j + 3] : t.length;
          var prev = packed[num];
          if (!prev || prev.at < o.at) { packed[num] = { num: num, gen: 0, at: o.at, text: t.slice(off, end).trim() }; }
        }
      }, function () {}));
    });
    return Promise.all(jobs).then(function () { return { bytes: bytes, s: s, objs: objs, packed: packed }; });
  }
  /* El texto vigente de un objeto: «<< … >>» o «[ … ]». */
  function objectText(doc, num) {
    var o = doc.objs[num], p = doc.packed[num];
    if (o && (!p || o.at > p.at)) {
      var i = skipWs(doc.s, o.body), e = skipValue(doc.s, i);
      return e < 0 ? null : doc.s.slice(i, e);
    }
    return p ? p.text : null;
  }

  function trailerOf(s) {
    var sx = s.lastIndexOf("startxref"), prev = sx < 0 ? NaN : parseInt(s.slice(sx + 9, sx + 40).trim(), 10);
    if (isNaN(prev)) { return null; }
    var classic = /^xref\b/.test(s.slice(prev, prev + 4));
    var at = classic ? s.indexOf("trailer", prev) + 7 : s.indexOf("obj", prev) + 3;
    var t = at > 6 && readDict(s, at);
    if (!t || !t.raw["/Size"] || !t.raw["/Root"] || t.raw["/Encrypt"]) { return null; }
    return { prev: prev, classic: classic, raw: t.raw, size: parseInt(t.raw["/Size"], 10) };
  }

  /* La actualización: objetos { num, gen, text } (texto completo después de
     «obj»), con la tabla de referencias del mismo tipo que la anterior. */
  function appendUpdate(doc, objects) {
    var s = doc.s, tr = trailerOf(s);
    if (!tr) { throw new Error("El PDF no se puede actualizar (sin tabla de referencias o cifrado)."); }
    var body = s.charAt(s.length - 1) === "\n" ? "" : "\n", entries = [];
    objects.forEach(function (o) {
      entries.push({ num: o.num, gen: o.gen, off: s.length + body.length });
      body += o.num + " " + o.gen + " obj\n" + o.text + "\nendobj\n";
    });
    var size = Math.max(tr.size, objects.reduce(function (m, o) { return Math.max(m, o.num + 1); }, 0));
    var keep = ["/Root", "/Info", "/ID"].filter(function (k) { return tr.raw[k]; }).map(function (k) { return " " + k + " " + tr.raw[k]; }).join("");
    var xrefAt = s.length + body.length;
    if (tr.classic) {
      entries.sort(function (a, b) { return a.num - b.num; });
      body += "xref\n" + entries.map(function (e) {
        return e.num + " 1\n" + ("000000000" + e.off).slice(-10) + " " + ("0000" + e.gen).slice(-5) + " n \n";
      }).join("") + "trailer\n<< /Size " + size + " /Prev " + tr.prev + keep + " >>\nstartxref\n" + xrefAt + "\n%%EOF\n";
    } else {
      entries.push({ num: size, gen: 0, off: xrefAt });
      entries.sort(function (a, b) { return a.num - b.num; });
      var data = entries.map(function (e) {
        return String.fromCharCode(1, (e.off >>> 24) & 255, (e.off >>> 16) & 255, (e.off >>> 8) & 255, e.off & 255, (e.gen >>> 8) & 255, e.gen & 255);
      }).join("");
      body += size + " 0 obj\n<< /Type /XRef /Size " + (size + 1) + " /Prev " + tr.prev + keep +
        " /Index [" + entries.map(function (e) { return e.num + " 1"; }).join(" ") + "] /W [1 4 2] /Length " + data.length +
        " >>\nstream\n" + data + "\nendstream\nendobj\nstartxref\n" + xrefAt + "\n%%EOF\n";
    }
    var out = new Uint8Array(doc.bytes.length + body.length);
    out.set(doc.bytes);
    out.set(fromStr(body), doc.bytes.length);
    return out;
  }

  /* -------------------------------------------------------- el resaltado -- */
  var GREEN = [0.5647, 0.9333, 0.5647];
  function num(n) { return String(Math.round(n * 100) / 100); }
  function refsIn(arr) { return (String(arr).match(/\d+\s+\d+\s+R/g) || []).map(function (r) { return r.replace(/\s+/g, " "); }); }

  /* El color de los resaltados que ya tiene el reporte, para que el nuevo
     se vea igual; si no tiene, verde claro. */
  function highlightColor(doc) {
    var texts = Object.keys(doc.objs).map(function (k) { return objectText(doc, k); })
      .concat(Object.keys(doc.packed).map(function (k) { return doc.packed[k].text; }));
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (t && /\/Subtype\s*\/Highlight\b/.test(t)) {
        var m = /\/C\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(t);
        if (m) { return [+m[1], +m[2], +m[3]]; }
      }
    }
    return GREEN;
  }
  function pdfDate(d) {
    var p = function (n) { return ("0" + n).slice(-2); };
    return "D:" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  /* Agrega un resaltado por cada marca { pageRef: { num, gen }, rect }. Da
     el archivo nuevo y las referencias de las anotaciones («12 0 R»). */
  function addHighlights(bytes, marks, opts) {
    opts = opts || {};
    return openPdf(bytes).then(function (doc) {
      var tr = trailerOf(doc.s);
      if (!tr) { throw new Error("El PDF no se puede actualizar (sin tabla de referencias o cifrado)."); }
      var next = tr.size, color = opts.color || highlightColor(doc), objects = [], added = [], byPage = {};
      var c = color.map(function (v) { return String(Math.round(v * 10000) / 10000); }).join(" "), when = pdfDate(opts.now || new Date());
      marks.forEach(function (mk, i) {
        var r = mk.rect.map(Number), x1 = num(r[0]), y1 = num(r[1]), x2 = num(r[2]), y2 = num(r[3]);
        var apNum = next++, anNum = next++;
        var ap = "/G0 gs " + c + " rg " + x1 + " " + y1 + " " + num(r[2] - r[0]) + " " + num(r[3] - r[1]) + " re f";
        objects.push({ num: apNum, gen: 0, text: "<< /Type /XObject /Subtype /Form /BBox [" + [x1, y1, x2, y2].join(" ") +
          "] /Resources << /ExtGState << /G0 << /BM /Multiply /CA 1 >> >> >> /Length " + ap.length + " >>\nstream\n" + ap + "\nendstream" });
        objects.push({ num: anNum, gen: 0, text: "<< /Type /Annot /Subtype /Highlight /Rect [" + [x1, y1, x2, y2].join(" ") +
          "] /QuadPoints [" + [x1, y2, x2, y2, x1, y1, x2, y1].join(" ") + "] /C [" + c + "] /CA 1 /F 4 /P " +
          mk.pageRef.num + " " + mk.pageRef.gen + " R /M (" + when + ") /NM (qa-hl-" + when.slice(2) + "-" + i + ") /T (QAgency Toolbox)" +
          " /AP << /N " + apNum + " 0 R >> >>" });
        var key = mk.pageRef.num + " " + mk.pageRef.gen;
        (byPage[key] = byPage[key] || { ref: mk.pageRef, refs: [] }).refs.push(anNum + " 0 R");
        added.push({ pageRef: mk.pageRef, ref: anNum + " 0 R" });
      });
      Object.keys(byPage).forEach(function (k) {
        objects.push.apply(objects, withAnnots(doc, byPage[k].ref, function (refs) { return refs.concat(byPage[k].refs); }));
      });
      return { bytes: appendUpdate(doc, objects), added: added };
    });
  }
  /* Quita una anotación de su página (deshacer). */
  function removeHighlight(bytes, mark) {
    return openPdf(bytes).then(function (doc) {
      var ref = mark.ref.replace(/\s+/g, " ");
      return appendUpdate(doc, withAnnots(doc, mark.pageRef, function (refs) { return refs.filter(function (r) { return r !== ref; }); }));
    });
  }
  /* La página (o su arreglo /Annots aparte) otra vez, con la lista nueva. */
  function withAnnots(doc, pageRef, change) {
    var page = objectText(doc, pageRef.num);
    var dict = page && readDict(page, 0);
    if (!dict) { throw new Error("No se pudo leer la página " + pageRef.num + " del PDF."); }
    var cur = dict.raw["/Annots"], m = cur && /^(\d+)\s+(\d+)\s+R$/.exec(cur);
    if (m) {
      var arr = objectText(doc, +m[1]);
      if (arr == null) { throw new Error("No se pudo leer la lista de anotaciones del PDF."); }
      return [{ num: +m[1], gen: +m[2], text: "[" + change(refsIn(arr)).join(" ") + "]" }];
    }
    var list = change(cur ? refsIn(cur) : []);
    var parts = dict.keys.filter(function (k) { return k !== "/Annots"; }).map(function (k) { return k + " " + dict.raw[k]; });
    if (list.length) { parts.push("/Annots [" + list.join(" ") + "]"); }
    return [{ num: pageRef.num, gen: pageRef.gen, text: "<< " + parts.join(" ") + " >>" }];
  }

  /* ------------------------------------------------- leer con PDF.js --
     El título, las filas (con la referencia de su página) y cuáles ya están
     resaltadas: una anotación /Highlight que cubre el centro de la fila. */
  function readReport(lib, bytes) {
    return lib.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise.then(function (pdf) {
      var pages = [], marks = [], chain = Promise.resolve();
      for (var n = 1; n <= pdf.numPages; n++) {
        (function (n) {
          chain = chain.then(function () { return pdf.getPage(n); }).then(function (page) {
            return Promise.all([page.getTextContent(), page.getAnnotations()]).then(function (res) {
              pages.push({
                index: n - 1, ref: page.ref ? { num: page.ref.num, gen: page.ref.gen } : null,
                items: res[0].items.map(function (it) {
                  return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) };
                })
              });
              res[1].forEach(function (a) { if (a.subtype === "Highlight" && a.rect) { marks.push({ page: n - 1, rect: a.rect }); } });
            });
          });
        })(n);
      }
      return chain.then(function () {
        var text = pages.length ? pages[0].items.map(function (it) { return it.str; }).join(" ") : "";
        var rows = reportRows(pages);
        rows.forEach(function (r) {
          r.pageRef = pages[r.page].ref;
          var mid = (r.rect[1] + r.rect[3]) / 2;
          r.marked = marks.some(function (m) { return m.page === r.page && m.rect[1] <= mid && m.rect[3] >= mid; });
        });
        pdf.destroy();
        return { title: reportTitle(text), rows: rows };
      }, function (e) { pdf.destroy(); throw e; });
    });
  }

  /* Solo el título de la primera página: para saber, entre los archivos
     soltados, cuál es el reporte sin leer todo cada documento del caso. */
  function peekTitle(lib, bytes) {
    return lib.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise.then(function (pdf) {
      return pdf.getPage(1).then(function (p) { return p.getTextContent(); }).then(function (tc) {
        pdf.destroy();
        return reportTitle(tc.items.map(function (it) { return it.str; }).join(" "));
      }, function (e) { pdf.destroy(); throw e; });
    });
  }

  var api = {
    reportTitle: reportTitle, isReport: isReport, reportRows: reportRows, findRows: findRows, parseQuery: parseQuery,
    addHighlights: addHighlights, removeHighlight: removeHighlight, readReport: readReport, peekTitle: peekTitle
  };
  root.QA = root.QA || {};
  root.QA.report = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
