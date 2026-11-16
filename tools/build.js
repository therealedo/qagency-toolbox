#!/usr/bin/env node
/* Empaqueta la herramienta para repartirla. Genera en dist/:

     QAgency-Toolbox.html          un solo archivo con todo adentro (estilos,
                                   código, lector de PDF, OCR, plantillas
                                   del Consent y del SOA, fuentes y logo);
                                   se abre con doble clic, sin internet
     QAgency-Toolbox-Windows.zip   ese archivo más un instalador que crea el
                                   acceso directo con ícono en Windows y un
                                   actualizador que la baja de GitHub

   No usa dependencias. Uso: node tools/build.js */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const bytes = (p) => fs.readFileSync(path.join(root, p));
const dataUri = (p, mime) => "data:" + mime + ";base64," + bytes(p).toString("base64");

/* ------------------------------------------------------- un solo archivo */

let html = read("index.html");
let inlined = 0;

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  inlined++;
  /* las fuentes van dentro de la hoja de estilos */
  const css = read(href).replace(/url\("\.\.\/(vendor\/fonts\/[^"]+\.woff2)"\)/g, (m, font) => {
    inlined++;
    return 'url("' + dataUri(font, "font/woff2") + '")';
  });
  return "<style>\n" + css + "\n</style>";
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  inlined++;
  /* un "</script" dentro del código cerraría la etiqueta antes de tiempo */
  return "<script>\n" + read(src).replace(/<\/script/gi, "<\\/script") + "\n</script>";
});

/* el manifiesto solo sirve cuando la herramienta está publicada */
html = html.replace(/<link rel="manifest"[^>]*>\n?/, "");
html = html.split('href="assets/icon-192.png"').join('href="' + dataUri("assets/icon-192.png", "image/png") + '"');
html = html.split('src="assets/mark.png"').join('src="' + dataUri("assets/mark.png", "image/png") + '"');

const leftovers = html.match(/(?:src|href)="(?!data:|#)[^"]+"/g);
if (leftovers) {
  console.error("Quedaron referencias a archivos externos:", leftovers);
  process.exit(1);
}

const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, "QAgency-Toolbox.html"), html);
console.log("dist/QAgency-Toolbox.html          " + kb(Buffer.byteLength(html)) + "  (" + inlined + " archivos integrados)");

/* ---------------------------------------------------- paquete de Windows */

/* Ícono .ico con una sola imagen PNG de 256 px (válido desde Windows Vista). */
function ico(png) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0);            /* reservado */
  head.writeUInt16LE(1, 2);            /* tipo: ícono */
  head.writeUInt16LE(1, 4);            /* una imagen */
  head.writeUInt8(0, 6);               /* ancho 256 se escribe como 0 */
  head.writeUInt8(0, 7);               /* alto 256 */
  head.writeUInt16LE(1, 10);           /* planos */
  head.writeUInt16LE(32, 12);          /* bits por píxel */
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);          /* dónde empieza la imagen */
  return Buffer.concat([head, png]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* Escribe un .zip estándar. La fecha es fija para que el archivo no cambie
   de una compilación a otra si el contenido es el mismo. */
function zip(files) {
  const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals = [], centrals = [];
  let offset = 0;
  files.forEach((f) => {
    const name = Buffer.from(f.name, "utf8");
    const comp = zlib.deflateRawSync(f.data, { level: 9 });
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);    /* nombres en UTF-8 */
    local.writeUInt16LE(8, 8);         /* deflate */
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + comp.length;
  });
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([dir, end]));
}

/* Los .bat y .ps1 necesitan saltos de línea de Windows; el .ps1 lleva además
   la marca UTF-8 para que PowerShell 5 lo lea bien. */
const crlf = (p) => read(p).replace(/\r?\n/g, "\r\n");
const folder = "QAgency-Toolbox/";
const pack = zip([
  { name: folder + "QAgency-Toolbox.html", data: Buffer.from(html, "utf8") },
  { name: folder + "toolbox.ico", data: ico(bytes("assets/icon-256.png")) },
  { name: folder + "Instalar.bat", data: Buffer.from(crlf("tools/windows/Instalar.bat"), "latin1") },
  { name: folder + "Desinstalar.bat", data: Buffer.from(crlf("tools/windows/Desinstalar.bat"), "latin1") },
  { name: folder + "Actualizar.bat", data: Buffer.from(crlf("tools/windows/Actualizar.bat"), "latin1") },
  { name: folder + "instalar.ps1", data: Buffer.from("﻿" + crlf("tools/windows/instalar.ps1"), "utf8") },
  { name: folder + "actualizar.ps1", data: Buffer.from("﻿" + crlf("tools/windows/actualizar.ps1"), "utf8") },
  { name: folder + "LEEME.txt", data: Buffer.from("﻿" + crlf("tools/windows/LEEME.txt"), "utf8") }
]);
fs.writeFileSync(path.join(dist, "QAgency-Toolbox-Windows.zip"), pack);
console.log("dist/QAgency-Toolbox-Windows.zip   " + kb(pack.length));

/* El actualizador solo instala un paquete firmado (tools/sign.js). Sin la
   llave privada el paquete queda sin firma y el actualizador lo rechaza. */
const signed = require("./sign.js").signFile(path.join(dist, "QAgency-Toolbox-Windows.zip"));
if (signed.signed) {
  console.log("dist/QAgency-Toolbox-Windows.zip.sig  firmado");
} else {
  console.warn("AVISO: el paquete quedó SIN FIRMA: " + signed.reason + ". El actualizador no lo instalará.");
}

function kb(n) { return (n / 1024).toFixed(0) + " KB"; }
