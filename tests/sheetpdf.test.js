"use strict";
/* La Hoja de cambios como PDF (js/sheetpdf.js): un PDF válido, con el texto
   de la hoja seleccionable y más páginas si el hogar no cabe. */
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../js/notes.js");
const P = require("../js/sheetpdf.js");

const base = {
  ini: "ER", agenteIni: "ER", fecha: "11/16/2026", hora: "09:00", canal: "Call", nombres: "BEATRIZ", apellidos: "DIAZ", codigoTipo: "Q",
  line: "oc", outcome: "pendiente", anio: "2027", codigoQ: "5393", genero: "a", periodo: "OEP", plataforma: "MKPL",
  sheetAgente: "EDUARDO CHINEA", sheetColaborador: "", npnAnterior: "20586009 (FV)", npnSeleccionado: "20586009 (FV)",
  direccion: "910 Apple Ave, Lehigh Acres, FL 33971-6441", clienteTel: "(305) 784-5644", clienteEmail: "mary@example.com", idioma: "es",
  base: { direccion: "88 Old Rd, Fort Myers, FL 33901" }, hogarPdf: true, net: {}, quitados: ["JORGE DIAZ"],
  planes: [{ compania: "AMBETTER", plan: "Clarity Silver", prima: "27.43", sel: true }],
  personas: [{ titular: true, taxes: true, cobertura: true, ingreso: "$35,000.00", dob: "12/02/1977", estatus: "residente",
    orig: { ingreso: "$35,000.00", dob: "12/02/1977", estatus: "ciudadano" } }]
};
const latin1 = (bytes) => Buffer.from(bytes).toString("latin1");

test("hoja de cambios en PDF: estructura válida y las referencias de la tabla xref apuntan a cada objeto", () => {
  const pdf = latin1(P.sheetPdf(N.changeSheet(base)));
  assert.match(pdf, /^%PDF-1\.4\n/);
  assert.match(pdf, /%%EOF\n$/);
  const xref = +pdf.match(/startxref\n(\d+)\n%%EOF/)[1];
  assert.equal(pdf.slice(xref, xref + 4), "xref");
  const offsets = pdf.slice(xref).match(/^(\d{10}) 00000 n $/gm).map((l) => +l.slice(0, 10));
  offsets.forEach((o, i) => assert.equal(pdf.slice(o, o + String(i + 1).length + 6), (i + 1) + " 0 obj"));
  /* cada stream mide lo que dice /Length */
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(pdf.slice(start + +m[1], start + +m[1] + 10), "\nendstream");
  }
  assert.match(pdf, /\/Count 1 >>/);
  assert.match(pdf, /\/Title \(Diaz, Beatriz - OC_Change Sheet 2027\)/);
});

test("hoja de cambios en PDF: el texto de la hoja, con acentos en WinAnsi", () => {
  const pdf = latin1(P.sheetPdf(N.changeSheet(base)));
  ["(PROCESAR POR EL PORTAL: MARKETPLACE)", "(Diaz, Beatriz)", "(Q5393)", "(Ambetter \xB7 Clarity Silver)", "($27.43/mo)",
    "(01/01/2027)", "(910 Apple Ave, Lehigh Acres, FL 33971-6441)", "(Se quita del hogar)", "($35,000.00)",
    "(Hoja de cambios \xB7 Verificaci\xF3n previa)"].forEach((t) => assert.ok(pdf.includes(t), t));
});

test("hoja de cambios en PDF: un hogar largo sigue en otra página con su encabezado", () => {
  const many = Object.assign({}, base, { personas: base.personas.concat(Array.from({ length: 30 }, (_, i) => (
    { nombre: "PERSONA " + (i + 1), parentesco: "Hijo/a", taxes: true, cobertura: true, dob: "01/01/2010", sexo: "o", ingreso: "$0.00", estatus: "ciudadano" }))) });
  const pdf = latin1(P.sheetPdf(N.changeSheet(many)));
  assert.match(pdf, /\/Count 2 >>/);
  assert.ok(pdf.includes("(Diaz, Beatriz \xB7 Integrantes del hogar \\(sigue\\))"));
  assert.ok(pdf.includes("P\xE1gina 2 de 2"));
  assert.ok(pdf.includes("(Persona 30)"));
});
