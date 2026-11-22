"use strict";
/* El reporte diario de tasks (js/report.js): leer la tabla, encontrar la fila
   del cliente y resaltarla en el mismo PDF. Los reportes reales tienen datos
   de clientes: aquí se arma uno inventado con la misma forma. */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const zlib = require("node:zlib");
const R = require("../js/report.js");

function pdfjs() {
  const lib = require("../vendor/pdfjs/pdf.min.js");
  lib.GlobalWorkerOptions.workerSrc = path.join(__dirname, "../vendor/pdfjs/pdf.worker.min.js");
  return lib;
}

/* Columnas como en el reporte de Cliq: # / Code / Full Name / Date of Birth /
   Language / Subject / Due Date. La fila 2 tiene el Subject en dos líneas. */
const COLS = [40, 64, 130, 290, 360, 420, 540];
const ROWS = [
  ["1", "Q10001", "Testa, Ana", "01/02/1980", "Spanish", "OC Renewal", "11/22/2026"],
  ["2", "Q10002L", "Prueba, Luis", "03/04/1975", "English", ["OC Life change", "and docs"], "11/22/2026"],
  ["3", "", "Ejemplo, Rosa", "05/06/1990", "Spanish", "MC Review", "11/23/2026"],
  ["4", "Q10004", "Prueba, Luis", "07/08/1960", "Spanish", "Supp", "11/23/2026"]
];
function esc(s) { return String(s).replace(/[\\()]/g, "\\$&"); }
function pageContent(extra) {
  const t = (x, y, s, size) => `BT /F1 ${size || 9} Tf ${x} ${y} Td (${esc(s)}) Tj ET\n`;
  let c = t(40, 760, "JANE TESTER TASKS PENDING - UPDATE 11/22/2026", 12);
  ["#", "Code", "Full Name", "Date of Birth", "Language", "Subject", "Due Date"].forEach((h, i) => { c += t(COLS[i], 730, h); });
  let y = 712;
  ROWS.forEach((r) => {
    let deepest = y;
    r.forEach((cell, i) => {
      (Array.isArray(cell) ? cell : [cell]).forEach((ln, k) => { if (ln) { c += t(COLS[i], y - 11 * k, ln); deepest = Math.min(deepest, y - 11 * k); } });
    });
    y = deepest - 16;
  });
  return c + (extra || "");
}
/* objetos: textos después de «N 0 obj» */
function build(objs, { packed = [], existing } = {}) {
  let out = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const off = {};
  const plain = objs.map((o, i) => ({ num: i + 1, text: o })).filter((o) => !packed.includes(o.num));
  plain.forEach((o) => { off[o.num] = out.length; out += `${o.num} 0 obj\n${o.text}\nendobj\n`; });
  if (!packed.length) {
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= objs.length; n++) { out += `${String(off[n]).padStart(10, "0")} 00000 n \n`; }
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Uint8Array(Buffer.from(out, "latin1"));
  }
  /* los objetos de `packed` van comprimidos en un /ObjStm, con tabla de referencias en stream */
  const stmNum = objs.length + 1, xrefNum = objs.length + 2;
  let head = "", body = "";
  packed.forEach((n) => { head += `${n} ${body.length} `; body += objs[n - 1] + "\n"; });
  const raw = zlib.deflateSync(Buffer.from(head + body, "latin1"));
  off[stmNum] = out.length;
  out += `${stmNum} 0 obj\n<< /Type /ObjStm /N ${packed.length} /First ${head.length} /Filter /FlateDecode /Length ${raw.length} >>\nstream\n` +
    raw.toString("latin1") + "\nendstream\nendobj\n";
  const xrefAt = out.length;
  const rows = [];
  for (let n = 0; n <= xrefNum; n++) {
    if (n === 0) { rows.push([0, 0, 255]); } else if (packed.includes(n)) { rows.push([2, stmNum, packed.indexOf(n)]); } else if (n === xrefNum) { rows.push([1, xrefAt, 0]); } else { rows.push([1, off[n], 0]); }
  }
  const data = Buffer.concat(rows.map(([t, a, b]) => Buffer.from([t, (a >>> 24) & 255, (a >>> 16) & 255, (a >>> 8) & 255, a & 255, (b >>> 8) & 255, b & 255])));
  out += `${xrefNum} 0 obj\n<< /Type /XRef /Size ${xrefNum + 1} /Root 1 0 R /W [1 4 2] /Length ${data.length} >>\nstream\n` + data.toString("latin1") + "\nendstream\nendobj\nstartxref\n" + xrefAt + "\n%%EOF\n";
  return new Uint8Array(Buffer.from(out, "latin1"));
}
function report(opts = {}) {
  const content = pageContent(opts.extra);
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R${opts.annots || ""} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  ].concat(opts.more || []);
  return build(objs, opts);
}
async function highlights(bytes) {
  const pdf = await pdfjs().getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const page = await pdf.getPage(1);
  const list = (await page.getAnnotations()).filter((a) => a.subtype === "Highlight");
  pdf.destroy();
  return list;
}

test("reporte: título, nombre y fecha", () => {
  assert.deepEqual(R.reportTitle("JANE TESTER TASKS PENDING - UPDATE 11/22/2026 # Code"), { name: "JANE TESTER", date: "11/22/2026" });
  assert.deepEqual(R.reportTitle("ANA TASKS PENDING - UPDATE 1/5/2027"), { name: "ANA", date: "01/05/2027" });
  assert.ok(R.isReport("x TASKS PENDING - UPDATE"));
  assert.equal(R.reportTitle("App Summary 2027"), null);
});

test("reporte: lee las filas, con el código y el nombre, aunque una fila ocupe dos líneas", async () => {
  const rep = await R.readReport(pdfjs(), report());
  assert.deepEqual(rep.title, { name: "JANE TESTER", date: "11/22/2026" });
  assert.deepEqual(rep.rows.map((r) => [r.n, r.code, r.name, r.marked]), [
    [1, "Q10001", "Testa, Ana", false], [2, "Q10002L", "Prueba, Luis", false], [3, "", "Ejemplo, Rosa", false], [4, "Q10004", "Prueba, Luis", false]
  ]);
  /* las franjas no se tocan y la fila de dos líneas es más alta */
  const [a, b, c] = rep.rows.map((r) => r.rect);
  assert.ok(a[1] >= b[3] && b[1] >= c[3], "sin superponerse");
  assert.ok(b[3] - b[1] > a[3] - a[1] + 8, "la fila 2 cubre sus dos líneas");
  assert.ok(a[0] <= 40 && a[2] > 540, "a lo ancho de la tabla");
  assert.deepEqual(rep.rows[0].pageRef, { num: 3, gen: 0 });
  assert.deepEqual(rep.rows.map((r) => r.dob), ["01/02/1980", "03/04/1975", "05/06/1990", "07/08/1960"]);
});

test("reporte: busca por código Q (con o sin la L) y si no, por el nombre exacto", async () => {
  const rows = (await R.readReport(pdfjs(), report())).rows;
  const find = (q) => R.findRows(rows, q).map((r) => r.n);
  assert.deepEqual(find({ code: "Q10001", name: "Otro, Nombre" }), [1]);
  assert.deepEqual(find({ code: "Q10002" }), [2], "la L del final no cuenta");
  assert.deepEqual(find({ code: "q10002l" }), [2]);
  assert.deepEqual(find({ code: "Q99999", name: "EJEMPLO, ROSA" }), [3], "sin código en el reporte, por el nombre");
  assert.deepEqual(find({ name: "ejemplo,rosa" }), [3]);
  assert.deepEqual(find({ name: "Prueba, Luis" }), [2, 4], "dos filas con el mismo nombre: se pregunta");
  assert.deepEqual(find({ name: "Nadie, Aqui" }), [], "no está en el reporte");
  assert.deepEqual(find({ name: "Prueba" }), [], "solo el nombre completo");
  assert.deepEqual(R.parseQuery(" q10004 "), { code: "q10004" });
  assert.deepEqual(R.parseQuery("10004"), { code: "Q10004" });
  assert.deepEqual(R.parseQuery("Testa, Ana"), { name: "Testa, Ana" });
  /* un código que empieza con L (L0534) también es un código, no un nombre */
  assert.deepEqual(R.parseQuery("L0534"), { code: "L0534" });
  assert.deepEqual(R.parseQuery("l0534"), { code: "l0534" });
});

for (const [label, opts] of [["sin comprimir", {}], ["con la página comprimida en un /ObjStm", { packed: [2, 3, 5] }]]) {
  test("reporte " + label + ": resalta la fila en el mismo archivo y se puede deshacer", async () => {
    const lib = pdfjs(), bytes = report(opts);
    const row = (await R.readReport(lib, bytes)).rows[1];
    const res = await R.addHighlights(bytes, [{ pageRef: row.pageRef, rect: row.rect }], { now: new Date(2026, 10, 22, 9, 30, 0) });
    /* lo de antes queda igual: la actualización va al final */
    assert.deepEqual(Buffer.from(res.bytes.slice(0, bytes.length)), Buffer.from(bytes));
    const hl = await highlights(res.bytes);
    assert.equal(hl.length, 1);
    assert.deepEqual(hl[0].rect.map(Math.round), row.rect.map(Math.round));
    assert.deepEqual(Array.from(hl[0].color), [144, 238, 144], "verde claro");
    const again = await R.readReport(lib, res.bytes);
    assert.deepEqual(again.rows.map((r) => r.marked), [false, true, false, false]);
    /* otra marca después: se suman */
    const r4 = again.rows[3];
    const two = await R.addHighlights(res.bytes, [{ pageRef: r4.pageRef, rect: r4.rect }]);
    assert.deepEqual((await R.readReport(lib, two.bytes)).rows.map((r) => r.marked), [false, true, false, true]);
    /* deshacer quita solo la última */
    const undone = await R.removeHighlight(two.bytes, two.added[0]);
    assert.deepEqual((await R.readReport(lib, undone)).rows.map((r) => r.marked), [false, true, false, false]);
  });
}

test("reporte: usa el color de los resaltados que ya tiene y conserva sus anotaciones", async () => {
  const lib = pdfjs();
  const bytes = report({ annots: " /Annots [6 0 R]", more: ["<< /Type /Annot /Subtype /Highlight /Rect [36 700 560 720] /QuadPoints [36 720 560 720 36 700 560 700] /C [0.6 0.9 0.4] /CA 0.5 >>"] });
  const rows = (await R.readReport(lib, bytes)).rows;
  assert.equal(rows[0].marked, true, "la que ya estaba resaltada");
  const res = await R.addHighlights(bytes, [{ pageRef: rows[2].pageRef, rect: rows[2].rect }]);
  const hl = await highlights(res.bytes);
  assert.equal(hl.length, 2);
  assert.deepEqual(Array.from(hl[1].color), [153, 230, 102]);
  /* /Annots en un objeto aparte: se reescribe ese arreglo */
  const sep = report({ annots: " /Annots 6 0 R", more: ["[]"] });
  const r2 = (await R.readReport(lib, sep)).rows[0];
  const out = await R.addHighlights(sep, [{ pageRef: r2.pageRef, rect: r2.rect }]);
  assert.equal((await highlights(out.bytes)).length, 1);
  assert.match(Buffer.from(out.bytes).toString("latin1").slice(sep.length), /\n6 0 obj\n\[\d+ 0 R\]\nendobj/);
});
