#!/usr/bin/env node
/* Copia las plantillas del Consent y del SOA dentro de vendor/forms/ como
   scripts, igual que el OCR (tools/vendor-ocr.js): así la herramienta las
   llena sin internet y sin fetch, abierta desde el archivo o en el paquete
   de un solo archivo. Cada script deja su PDF, en base64, en
   window.QA_FORMS["<clave>"]; la clave y el nombre del PDF son los de
   js/forms.js (TEMPLATES). Correrlo de nuevo solo para cambiar una plantilla.

     consent-qa-es.js    Consentimiento_2027_QA_Spa.pdf
     consent-qa-en.js    Consent_2027_QA_Eng.pdf
     consent-ath-es.js   Consentimiento_2027_ATH_Spa.pdf
     consent-ath-en.js   Consent_2027_ATH_Eng.pdf
     soa-es.js           SOA_Spanish_Agency.pdf
     soa-en.js           SOA_English_Agency_Fillable.pdf (de tools/make-fillable-soa.js)

   Uso: node tools/vendor-forms.js <carpeta con los 6 PDF> */
"use strict";

const fs = require("fs");
const path = require("path");
const F = require("../js/forms.js");

const dir = process.argv[2];
const keys = Object.keys(F.TEMPLATES);
const missing = dir ? keys.filter((k) => !fs.existsSync(path.join(dir, F.TEMPLATES[k].file))) : keys;
if (missing.length) {
  console.error("Uso: node tools/vendor-forms.js <carpeta con los 6 PDF>");
  console.error("Faltan: " + missing.map((k) => F.TEMPLATES[k].file).join(", "));
  process.exit(1);
}
const out = path.join(path.resolve(__dirname, ".."), "vendor", "forms");
fs.mkdirSync(out, { recursive: true });

keys.forEach((k) => {
  const T = F.TEMPLATES[k];
  const pdf = fs.readFileSync(path.join(dir, T.file));
  if (pdf.slice(0, 5).toString("latin1") !== "%PDF-") { throw new Error(T.file + " no es un PDF"); }
  const js = "/* " + T.label + " (" + T.file + "): plantilla de la agencia, generada por tools/vendor-forms.js. */\n" +
    "window.QA_FORMS = window.QA_FORMS || {};\n" +
    "window.QA_FORMS[\"" + k + "\"] = \"" + pdf.toString("base64") + "\";\n";
  fs.writeFileSync(path.join(out, k + ".js"), js);
  console.log("vendor/forms/" + k + ".js  " + Math.round(Buffer.byteLength(js) / 1024) + " KB");
});
