#!/usr/bin/env node
/* Agrega campos de formulario al SOA en inglés de la agencia, que vino sin
   campos (sus widgets se borraron), en los mismos lugares que tiene el SOA en
   español: nombre y teléfono del beneficiario, nombre e ID (NPN) del agente,
   método de contacto inicial, planes que se explicarán y, solo para un
   representante autorizado, su nombre y su relación con el beneficiario. El
   teléfono va en sus casillas (área, prefijo y línea). Las 5 casillas de
   productos son parte del dibujo de la página y no se tocan; tampoco se
   agregan firmas. Los nombres de los campos salen de js/forms.js.

   Se corre una sola vez; el resultado lo empaqueta tools/vendor-forms.js.
   Usa pdf-lib 1.17.1 desde una carpeta aparte (npm install pdf-lib@1.17.1
   --prefix <carpeta>): no es dependencia de la herramienta.

   Uso: node tools/make-fillable-soa.js <SOA_English_Agency.pdf> <salida.pdf> [carpeta node_modules con pdf-lib]
        (o NODE_PATH=<carpeta node_modules> sin el tercer argumento) */
"use strict";

const fs = require("fs");
const path = require("path");
const F = require("../js/forms.js");

const [src, out, nm] = process.argv.slice(2);
if (!src || !out || !fs.existsSync(src)) {
  console.error("Uso: node tools/make-fillable-soa.js <SOA_English_Agency.pdf> <salida.pdf> [carpeta node_modules con pdf-lib]");
  process.exit(1);
}
const { PDFDocument, PDFName, PDFString } = require(nm ? path.join(path.resolve(nm), "pdf-lib") : "pdf-lib");

/* Posiciones en puntos (página 1 de 630 x 810, origen abajo a la izquierda),
   medidas sobre la página dibujada: cada campo ocupa el espacio en blanco
   bajo su etiqueta. El teléfono usa una casilla por dígito (cada 15.5 pt). */
const N = F.SOA_EN_FIELDS;
const BOXES = [
  { name: N.repName, x: 64, y: 347, w: 212, h: 15 },
  { name: N.repRelation, x: 283, y: 347, w: 283, h: 15 },
  { name: N.agentName, x: 64, y: 282, w: 188, h: 15 },
  { name: N.npn, x: 458, y: 282, w: 108, h: 15 },
  { name: N.beneficiaryName, x: 64, y: 241, w: 188, h: 15 },
  { name: N.beneficiaryPhone[0], x: 258.625, y: 241.25, w: 46.5, h: 18, comb: 3 },
  { name: N.beneficiaryPhone[1], x: 314.125, y: 241.25, w: 46.5, h: 18, comb: 3 },
  { name: N.beneficiaryPhone[2], x: 369.375, y: 241.25, w: 62, h: 18, comb: 4 },
  { name: N.contactMethod, x: 64, y: 164, w: 122, h: 15 },
  { name: N.plans, x: 192, y: 164, w: 374, h: 15 }
];

(async () => {
  const doc = await PDFDocument.load(fs.readFileSync(src));
  const page = doc.getPage(0);
  const form = doc.getForm();
  if (form.getFields().length) { throw new Error("El PDF ya tiene campos: " + form.getFields().map((f) => f.getName()).join(", ")); }

  /* Helvetica estándar (/Helv) en los recursos del formulario: el lector y el
     PDF.js de la herramienta la usan para dibujar lo que se escriba. */
  const helv = doc.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" });
  form.acroForm.dict.set(PDFName.of("DR"), doc.context.obj({ Font: { Helv: doc.context.register(helv) } }));
  form.acroForm.dict.set(PDFName.of("DA"), PDFString.of("/Helv 0 Tf 0 g"));

  BOXES.forEach((b) => {
    const field = form.createTextField(b.name);
    if (b.comb) { field.setMaxLength(b.comb); field.enableCombing(); }
    field.addToPage(page, { x: b.x, y: b.y, width: b.w, height: b.h, borderWidth: 0, borderColor: undefined, backgroundColor: undefined });
    /* tamaño automático (0): la letra se achica si el texto es largo */
    field.acroField.setDefaultAppearance("/Helv " + (b.comb ? 11 : 0) + " Tf 0 g");
  });
  /* sin valores todavía: los lectores dibujan cada campo al llenarlo */
  form.acroForm.dict.set(PDFName.of("NeedAppearances"), doc.context.obj(false));
  const bytes = await doc.save({ updateFieldAppearances: false });
  fs.writeFileSync(out, bytes);
  console.log(out + "  " + Math.round(bytes.length / 1024) + " KB, " + BOXES.length + " campos");
})().catch((e) => { console.error(e.message || e); process.exit(1); });
