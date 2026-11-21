/* Q Agency Toolbox — copia local de la herramienta.
   Permite instalarla como aplicación y abrirla sin internet cuando está
   publicada en un servidor. Siempre intenta primero la red, para que cada
   quien reciba la última versión; si no hay conexión, usa la copia guardada.
   Aquí solo pasan los archivos de la propia herramienta: los documentos y los
   datos de los clientes nunca salen de la página. */
"use strict";

const VERSION = "1.25.11";
const CACHE = "qa-toolbox-" + VERSION;
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/config.js",
  "js/util.js",
  "js/notes.js",
  "js/forms.js",
  "js/sheetpdf.js",
  "js/extract.js",
  "js/ocr.js",
  "js/app.js",
  "vendor/pdfjs/pdf.min.js",
  "vendor/pdfjs/pdf.worker.min.js",
  "vendor/tesseract/ocr-loader.js",
  "vendor/tesseract/ocr-wasm.js",
  "vendor/tesseract/ocr-lang-spa.js",
  "vendor/tesseract/ocr-lang-eng.js",
  "vendor/forms/consent-qa-es.js",
  "vendor/forms/consent-qa-en.js",
  "vendor/forms/consent-ath-es.js",
  "vendor/forms/consent-ath-en.js",
  "vendor/forms/soa-es.js",
  "vendor/forms/soa-en.js",
  "vendor/fonts/inter-latin-wght-normal.woff2",
  "vendor/fonts/jetbrains-mono-latin-wght-normal.woff2",
  "assets/mark.png",
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-192.png",
  "assets/icon-256.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("qa-toolbox-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) { return; }
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
