#!/usr/bin/env node
/* Empaqueta la herramienta en un solo archivo HTML: dist/QAgency-Toolbox.html.
   Ese archivo se puede copiar a cualquier computadora y abrir con doble clic;
   lleva dentro los estilos, el código, el lector de PDF y el logo.
   Uso: node tools/build.js */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const dataUri = (p, mime) => "data:" + mime + ";base64," + fs.readFileSync(path.join(root, p)).toString("base64");

let html = read("index.html");
let inlined = 0;

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  inlined++;
  return "<style>\n" + read(href) + "\n</style>";
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  inlined++;
  /* un "</script" dentro del código cerraría la etiqueta antes de tiempo */
  return "<script>\n" + read(src).replace(/<\/script/gi, "<\\/script") + "\n</script>";
});

html = html.replace(/<link rel="manifest"[^>]*>\n?/, "");
html = html.replace('href="assets/icon-192.png"', 'href="' + dataUri("assets/icon-192.png", "image/png") + '"');
html = html.replace('src="assets/mark.png"', 'src="' + dataUri("assets/mark.png", "image/png") + '"');

const leftovers = html.match(/(?:src|href)="(?!data:|#)[^"]+"/g);
if (leftovers) {
  console.error("Quedaron referencias a archivos externos:", leftovers);
  process.exit(1);
}

const out = path.join(root, "dist", "QAgency-Toolbox.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log("dist/QAgency-Toolbox.html  " + (fs.statSync(out).size / 1024).toFixed(0) + " KB  (" + inlined + " archivos integrados)");
