/* Q Agency Toolbox: la Hoja de cambios como PDF, para guardarla en su
   carpeta sin pasar por la ventana de imprimir.

   Toma lo que arma notes.changeSheet(d) y dibuja la misma hoja (mismos
   datos, mismas marcas: barra, rombo y negrita en lo que cambió) en una
   página carta con las fuentes estándar de PDF (Helvetica), así el texto se
   puede seleccionar y copiar. Si el hogar no cabe, la tabla sigue en otra
   página con su encabezado. Sin dependencias: escribe el PDF a mano. */
(function (root) {
  "use strict";

  var PAGE_W = 612, PAGE_H = 792, M = 36, W = PAGE_W - 2 * M;

  var C = {
    ink: [0.067, 0.106, 0.180], navy: [0.055, 0.184, 0.353], label: [0.318, 0.384, 0.478],
    line: [0.835, 0.863, 0.902], mark: [1, 0.953, 0.761], markLine: [0.541, 0.392, 0],
    markInk: [0.361, 0.263, 0], yes: [0.090, 0.408, 0.235], no: [0.337, 0.380, 0.451],
    soft: [0.957, 0.965, 0.976], white: [1, 1, 1]
  };

  /* Anchos de Helvetica y Helvetica-Bold (1/1000 del tamaño), del 32 al 126 */
  var W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
    667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556,
    333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  var W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722,
    667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611,
    389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  /* lo que no es ASCII y sí está en WinAnsi: byte y ancho */
  var EXTRA = { "—": [0x97, 1000], "–": [0x96, 556], "…": [0x85, 1000], "‘": [0x91, 222], "’": [0x92, 222],
    "“": [0x93, 333], "”": [0x94, 333], "•": [0x95, 350], "€": [0x80, 556], "·": [0xB7, 278], "°": [0xB0, 400] };

  function plain(ch) { return ch.normalize ? ch.normalize("NFD").replace(/[̀-ͯ]/g, "") : ch; }
  function charWidth(ch, bold) {
    var t = bold ? W_BOLD : W_REG, c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) { return t[c - 32]; }
    if (EXTRA[ch]) { return EXTRA[ch][1]; }
    var p = plain(ch);
    if (p && p !== ch && p.charCodeAt(0) >= 32 && p.charCodeAt(0) <= 126) { return t[p.charCodeAt(0) - 32]; }
    return 556;
  }
  function textWidth(s, size, bold) {
    var w = 0;
    for (var i = 0; i < s.length; i++) { w += charWidth(s[i], bold); }
    return w * size / 1000;
  }
  /* Texto en WinAnsi (un byte por letra), con ( ) \ escapados */
  function encode(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = ch.charCodeAt(0), b;
      if (c >= 32 && c <= 126) { b = c; }
      else if (EXTRA[ch]) { b = EXTRA[ch][0]; }
      else if (c >= 0xA0 && c <= 0xFF) { b = c; }
      else { b = 63; }
      var t = String.fromCharCode(b);
      out += (t === "(" || t === ")" || t === "\\") ? "\\" + t : t;
    }
    return out;
  }
  /* Recorta con "…" lo que no cabe en el ancho */
  function fit(s, max, size, bold) {
    s = String(s == null ? "" : s);
    if (textWidth(s, size, bold) <= max) { return s; }
    while (s.length > 1 && textWidth(s + "…", size, bold) > max) { s = s.slice(0, -1); }
    return s.replace(/\s+$/, "") + "…";
  }
  function n2(v) { return (Math.round(v * 100) / 100).toString(); }
  function rgb(c) { return c.map(n2).join(" "); }

  /* --------------------------------------------------------- una página -- */
  function Page() { this.ops = []; }
  /* y se mide desde arriba, como en la pantalla */
  Page.prototype.rect = function (x, y, w, h, fill) {
    this.ops.push(rgb(fill) + " rg " + n2(x) + " " + n2(PAGE_H - y - h) + " " + n2(w) + " " + n2(h) + " re f");
  };
  Page.prototype.box = function (x, y, w, h, stroke, lw) {
    this.ops.push(rgb(stroke) + " RG " + n2(lw) + " w " + n2(x) + " " + n2(PAGE_H - y - h) + " " + n2(w) + " " + n2(h) + " re S");
  };
  Page.prototype.line = function (x1, y1, x2, y2, color, lw) {
    this.ops.push(rgb(color) + " RG " + n2(lw) + " w " + n2(x1) + " " + n2(PAGE_H - y1) + " m " + n2(x2) + " " + n2(PAGE_H - y2) + " l S");
  };
  Page.prototype.text = function (x, y, s, size, bold, color) {
    if (!s) { return; }
    this.ops.push("BT " + rgb(color || C.ink) + " rg /" + (bold ? "F2" : "F1") + " " + n2(size) + " Tf " + n2(x) + " " + n2(PAGE_H - y) + " Td (" + encode(s) + ") Tj ET");
  };
  Page.prototype.textRight = function (xRight, y, s, size, bold, color) { this.text(xRight - textWidth(s, size, bold), y, s, size, bold, color); };
  Page.prototype.textCenter = function (xMid, y, s, size, bold, color) { this.text(xMid - textWidth(s, size, bold) / 2, y, s, size, bold, color); };
  /* el rombo de "cambió": un cuadrado de lado s girado 45°, centrado en (cx, cy) */
  Page.prototype.diamond = function (cx, cy, s, color) {
    var r = s / 2, Y = PAGE_H - cy;
    this.ops.push(rgb(color) + " rg " + n2(cx) + " " + n2(Y + r) + " m " + n2(cx + r) + " " + n2(Y) + " l " + n2(cx) + " " + n2(Y - r) + " l " + n2(cx - r) + " " + n2(Y) + " l f");
  };

  /* ------------------------------------------------------------- la hoja -- */
  var DASH = "—";
  function v(x) { return x == null || String(x).trim() === "" ? DASH : String(x); }

  function draw(s) {
    var pages = [new Page()], p = pages[0], y = M;

    /* encabezado */
    p.text(M, y + 15, fit(s.titulo, W - 120, 15, true), 15, true);
    if (s.anio) { p.text(M, y + 28, "Datos actualizados para " + s.anio, 8.5, false, C.label); }
    var fecha = v(s.fecha);
    p.textRight(M + W, y + 28, fecha, 8.5, true);
    p.textRight(M + W - textWidth(fecha, 8.5, true), y + 28, "Fecha: ", 8.5, false, C.label);
    p.line(M, y + 35, M + W, y + 35, C.ink, 1.5);
    y += 42;

    /* leyenda: la misma marca que los datos cambiados */
    p.rect(M, y + 4, 16, 9, C.mark);
    p.rect(M, y + 4, 2.2, 9, C.markLine);
    p.diamond(M + 8.5, y + 8.5, 4, C.ink);
    p.text(M + 23, y + 11.5, "Los datos resaltados indican cambios en relación con el proceso anterior" +
      (s.anioAnterior ? " (" + s.anioAnterior + ")" : "") + ".", 8, false, C.label);
    y += 19;

    /* portal */
    p.rect(M, y, W, 20, C.mark);
    p.box(M, y, W, 20, C.markLine, 0.75);
    p.rect(M, y, 3, 20, C.markLine);
    p.textCenter(M + W / 2, y + 13.6, "PROCESAR POR EL PORTAL: " + v(s.portal), 10, true);
    y += 27;

    /* tres columnas */
    function item(x, yy, w, label, value, mark, valueSize, valueBold) {
      if (mark) { p.rect(x, yy, w, 25, C.mark); p.rect(x, yy, 2.2, 25, C.markLine); }
      p.text(x + 6, yy + 9, label.toUpperCase(), 6.8, true, mark ? C.markInk : C.label);
      var tx = x + 6;
      if (mark) { p.diamond(x + 8.5, yy + 18, 4, C.ink); tx = x + 15; }
      p.text(tx, yy + 21, fit(v(value), w - (tx - x) - 4, valueSize, valueBold || mark), valueSize, valueBold || mark);
    }
    var cw = (W - 2 * 14) / 3;
    var cols = [
      [["Cliente", s.cliente], ["Colaborador", s.colaborador], ["Carta de consentimiento", s.consent]],
      [["Código de Zoho", s.codigo], ["NPN anterior", s.npnAnterior]],
      [["Agente", s.agente], ["NPN seleccionado", s.npnSeleccionado, true]]
    ];
    cols.forEach(function (col, i) {
      col.forEach(function (it, k) { item(M + i * (cw + 14), y + k * 28, cw, it[0], it[1], !!it[2], 10, true); });
    });
    y += 3 * 28 + 2;

    function section(title) {
      var t = title.toUpperCase();
      p.text(M, y + 9, t, 7.5, true, C.navy);
      p.line(M + textWidth(t, 7.5, true) + 7, y + 6.2, M + W, y + 6.2, C.line, 0.75);
      y += 15;
    }

    /* plan */
    section("Plan elegido");
    if (s.plan) {
      var h = 34, right2 = 96, right1 = 92;
      p.rect(M, y, W, h, C.mark);
      p.box(M, y, W, h, C.markLine, 0.75);
      p.rect(M, y, 3, h, C.markLine);
      var chip = "ELEGIDO", chipW = textWidth(chip, 6.8, true) + 9;
      p.rect(M + 10, y + 11, chipW, 12, C.yes);
      p.text(M + 14.5, y + 19.6, chip, 6.8, true, C.white);
      p.text(M + 18 + chipW, y + 21, fit(v(s.plan.nombre), W - right1 - right2 - chipW - 30, 11.5, true), 11.5, true);
      var x2 = M + W - right2, x1 = x2 - right1;
      [[x1, "Prima", s.plan.prima ? s.plan.prima + "/mo" : DASH, right1], [x2, "Inicia cobertura", v(s.plan.inicio), right2]].forEach(function (c) {
        p.line(c[0], y + 6, c[0], y + h - 6, C.markLine, 0.75);
        p.textRight(c[0] + c[3] - 10, y + 13, c[1].toUpperCase(), 6.8, true, C.markInk);
        p.textRight(c[0] + c[3] - 10, y + 27, c[2], 12.5, true);
      });
      y += h + 4;
    } else {
      p.text(M, y + 9, "Sin plan elegido: selecciona uno en Planes cotizados.", 8.5, false, C.label);
      y += 16;
    }

    /* contacto en dos columnas */
    section("Datos de contacto");
    var hw = (W - 16) / 2;
    (s.contacto || []).forEach(function (c, i) {
      item(M + (i % 2) * (hw + 16), y + Math.floor(i / 2) * 27, hw, c.label, c.value, !!c.cambio, 9.5, false);
    });
    y += Math.ceil((s.contacto || []).length / 2) * 27 + 2;

    /* hogar */
    section("Integrantes del hogar");
    var COLS = [
      { t: ["NOMBRE"], w: 140 }, { t: ["NAC. (DOB)"], w: 62 }, { t: ["SEXO"], w: 58 }, { t: ["EN", "TAXES"], w: 40, mid: true },
      { t: ["SOLICITA", "COBERTURA"], w: 56, mid: true }, { t: ["ESTATUS", "MIGRATORIO"], w: 84, num: false }, { t: ["INCOME ANUAL", "ESTIMADO"], w: 100, num: true }
    ];
    function colX(i) { var x = M; for (var k = 0; k < i; k++) { x += COLS[k].w; } return x; }
    function header() {
      COLS.forEach(function (c, i) {
        c.t.forEach(function (t, k) {
          var yy = y + (c.t.length === 1 ? 17 : 9 + k * 8);
          if (c.num) { p.textRight(colX(i) + c.w - 5, yy, t, 6.5, true, C.label); }
          else if (c.mid) { p.textCenter(colX(i) + c.w / 2, yy, t, 6.5, true, C.label); }
          else { p.text(colX(i) + 5, yy, t, 6.5, true, C.label); }
        });
      });
      p.line(M, y + 22, M + W, y + 22, C.ink, 1.1);
      y += 23;
    }
    var ROW = 17, BOTTOM = PAGE_H - M - 30;
    function room() {
      if (y + ROW <= BOTTOM) { return; }
      p = new Page(); pages.push(p); y = M;
      p.text(M, y + 10, fit(v(s.cliente), W, 8.5, true) + " · Integrantes del hogar (sigue)", 8.5, true, C.label);
      y += 16;
      header();
    }
    function cell(i, value, opts) {
      var c = COLS[i], x = colX(i), mark = opts && opts.mark, bold = (opts && opts.bold) || mark, color = (opts && opts.color) || C.ink;
      if (mark) { p.rect(x, y, c.w, ROW, C.mark); p.rect(x, y, 2.2, ROW, C.markLine); }
      var base = y + 11.6, pad = mark ? 13 : 5;
      if (mark) { p.diamond(x + 7.5, y + 8.8, 4, C.ink); }
      var s2 = fit(v(value), c.w - pad - 5 - ((opts && opts.reserve) || 0), 8.5, bold);
      if (c.num) { p.textRight(x + c.w - 5, base, s2, 8.5, bold, color); }
      else if (c.mid && !mark) { p.textCenter(x + c.w / 2, base, s2, 8.5, bold, color); }
      else { p.text(x + pad, base, s2, 8.5, bold, color); }
      return s2;
    }
    header();
    (s.personas || []).forEach(function (r) {
      room();
      if (r.nuevo) { p.rect(M, y, W, ROW, C.mark); p.rect(M, y, 2.2, ROW, C.markLine); }
      var tagW = r.nuevo ? textWidth("NUEVO", 6, true) + 8 : 0;
      var shown = cell(0, r.nombre, { bold: true, reserve: tagW ? tagW + 4 : 0 });
      if (r.nuevo) {
        var tx = colX(0) + 5 + textWidth(shown, 8.5, true) + 5;
        p.rect(tx, y + 4.5, tagW, 9, C.ink);
        p.text(tx + 4, y + 11.2, "NUEVO", 6, true, C.white);
      }
      var ch = r.cambio || {};
      cell(1, r.dob, { mark: ch.dob });
      cell(2, r.sexo);
      cell(3, r.taxes ? "Sí" : "No", { mark: ch.taxes, bold: true, color: r.taxes ? C.yes : C.no });
      cell(4, r.cobertura ? "Sí" : "No", { mark: ch.cobertura, bold: true, color: r.cobertura ? C.yes : C.no });
      cell(5, r.estatus, { mark: ch.estatus });
      cell(6, r.ingreso, { mark: ch.ingreso });
      p.line(M, y + ROW, M + W, y + ROW, C.line, 0.6);
      y += ROW;
    });
    (s.quitados || []).forEach(function (name) {
      room();
      p.rect(M, y, W, ROW, C.soft);
      var a = fit(v(name), COLS[0].w - 10, 8.5, true), b = "Se quita del hogar";
      p.text(M + 5, y + 11.6, a, 8.5, true, C.no);
      p.text(colX(1) + 5, y + 11.6, b, 8.5, false, C.no);
      p.line(M + 5, y + 8.6, M + 5 + textWidth(a, 8.5, true), y + 8.6, C.no, 0.6);
      p.line(colX(1) + 5, y + 8.6, colX(1) + 5 + textWidth(b, 8.5, false), y + 8.6, C.no, 0.6);
      p.line(M, y + ROW, M + W, y + ROW, C.line, 0.6);
      y += ROW;
    });
    room();
    p.line(M, y, M + W, y, C.ink, 1.1);
    p.textRight(colX(6) - 6, y + 13, ("Income anual estimado del hogar" + (s.anio ? " " + s.anio : "")).toUpperCase(), 7, true, C.label);
    p.textRight(M + W - 5, y + 13.5, v(s.total), 10, true);
    y += 20;

    /* pie, en cada página */
    pages.forEach(function (pg, i) {
      var fy = PAGE_H - M - 8;
      pg.line(M, fy - 10, M + W, fy - 10, C.line, 0.6);
      pg.text(M, fy, "Uso interno · sin SSN", 7.5, false, C.label);
      pg.textRight(M + W, fy, "Q Agency Toolbox · Verificación previa" + (pages.length > 1 ? " · Página " + (i + 1) + " de " + pages.length : ""), 7.5, false, C.label);
    });
    return pages;
  }

  /* ------------------------------------------------------ escribir el PDF -- */
  function sheetPdf(s) {
    var pages = draw(s);
    var objs = [];
    function add(body) { objs.push(body); return objs.length; }
    var catalog = add(null), pagesObj = add(null);
    var f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    var f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    var kids = pages.map(function (pg) {
      var content = pg.ops.join("\n");
      var c = add("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
      return add("<< /Type /Page /Parent " + pagesObj + " 0 R /MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "] /Resources << /Font << /F1 " + f1 +
        " 0 R /F2 " + f2 + " 0 R >> >> /Contents " + c + " 0 R >>");
    });
    objs[catalog - 1] = "<< /Type /Catalog /Pages " + pagesObj + " 0 R >>";
    objs[pagesObj - 1] = "<< /Type /Pages /Kids [" + kids.map(function (k) { return k + " 0 R"; }).join(" ") + "] /Count " + kids.length + " >>";
    var info = add("<< /Title (" + encode(String(s.archivo || "Hoja de cambios")) + ") /Producer (Q Agency Toolbox) >>");

    var out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", offsets = [];
    objs.forEach(function (body, i) { offsets.push(out.length); out += (i + 1) + " 0 obj\n" + body + "\nendobj\n"; });
    var xref = out.length;
    out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
    offsets.forEach(function (o) { out += ("0000000000" + o).slice(-10) + " 00000 n \n"; });
    out += "trailer\n<< /Size " + (objs.length + 1) + " /Root " + catalog + " 0 R /Info " + info + " 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";

    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) { bytes[i] = out.charCodeAt(i) & 0xFF; }
    return bytes;
  }

  var api = { sheetPdf: sheetPdf, textWidth: textWidth };
  root.QA = root.QA || {};
  root.QA.sheetpdf = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
