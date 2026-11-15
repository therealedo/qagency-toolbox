/* Q Agency Toolbox — lectura de escaneos y capturas (OCR) sin internet.
   El motor (Tesseract en WebAssembly) y los modelos de español e inglés van
   dentro de la herramienta (vendor/tesseract) y corren en un worker creado
   desde un Blob: no se descarga nada y la página sigue sin conexiones
   (connect-src 'none'). Necesita WebAssembly SIMD: Chrome o Edge al día. */
(function (root) {
  "use strict";

  var LANGS = ["spa", "eng"];
  var MAX_PAGES = 6;          /* páginas de un PDF escaneado que se leen */
  var PAGE_SCALE = 3;         /* unos 216 dpi: buena lectura sin ser lento */
  var MAX_PIXELS = 12e6;      /* tope de tamaño de cada imagen que se lee */
  var IDLE_MS = 120000;       /* el worker se cierra tras 2 min sin uso */

  /* Un PDF sin capa de texto (o casi) es un escaneo. */
  function needsOcr(text) { return String(text || "").replace(/\s/g, "").length < 40; }

  /* Corre dentro del worker y en las pruebas de Node, por eso no usa nada de
     fuera de la función. TesseractCore es la fábrica de ocr-loader.js. */
  function makeEngine(TesseractCore) {
    var mod = null, api = null, loaded = "";

    /* Rehace cada línea con la posición de sus palabras: un hueco ancho (como
       entre una etiqueta y la siguiente en un formulario) queda como varios
       espacios, igual que en el texto de un PDF. Se quitan las rayas sueltas
       que el OCR ve en esos huecos o en las casillas vacías. */
    function layout(tsv) {
      var lines = [], cur = null;
      String(tsv || "").split("\n").forEach(function (row) {
        var c = row.split("\t");
        if (c[0] !== "5" || c.length < 12) { return; }
        var text = c.slice(11).join("\t").trim();
        if (!text || /^[—–|_~]+$/.test(text)) { return; }
        var key = c[1] + "." + c[2] + "." + c[3] + "." + c[4];
        if (!cur || cur.key !== key) { cur = { key: key, words: [] }; lines.push(cur); }
        cur.words.push({ x: +c[6], w: +c[8], h: +c[9], text: text });
      });
      return lines.map(function (l) {
        var hs = l.words.map(function (w) { return w.h; }).sort(function (a, b) { return a - b; });
        var wide = 0.9 * hs[Math.floor(hs.length / 2)], out = "", end = 0;
        l.words.sort(function (a, b) { return a.x - b.x; }).forEach(function (w, i) {
          out += (i ? (w.x - end > wide ? "   " : " ") : "") + w.text;
          end = w.x + w.w;
        });
        return out;
      }).join("\n");
    }

    return {
      started: function () { return !!mod; },
      start: function (wasmBinary) {
        if (mod) { return Promise.resolve(); }
        /* sin el aviso de resolución que Tesseract da en cada imagen */
        var quiet = function (s) { if (!/^Estimating resolution/.test(s)) { console.warn(s); } };
        return TesseractCore({ wasmBinary: wasmBinary, printErr: quiet }).then(function (M) { mod = M; });
      },
      languages: function (langs) {
        var key = langs.map(function (l) { return l.code; }).join("+");
        if (key === loaded) { return; }
        langs.forEach(function (l) { mod.FS.writeFile(l.code + ".traineddata", l.data); });
        if (api) { api.End(); api["delete"](); }
        api = new mod.TessBaseAPI();
        /* 1 = solo el motor LSTM, el de los modelos incluidos */
        if (api.Init(null, key, 1) !== 0) { throw new Error("OCR: could not load " + key); }
        /* 4 = una sola columna: cada etiqueta queda en la línea de su valor
           aunque haya mucho espacio entre las dos, como en los formularios */
        api.SetVariable("tessedit_pageseg_mode", "4");
        loaded = key;
      },
      read: function (image) {
        if (!api) { throw new Error("OCR: languages not loaded"); }
        mod.FS.writeFile("/input", image instanceof Uint8Array ? image : new Uint8Array(image));
        if (api.SetImageFile(1, 0) === 1) { throw new Error("OCR: could not read the image"); }
        api.Recognize(null);
        var text = layout(api.GetTSVText(0));
        api.Clear();
        return text;
      }
    };
  }

  /* El worker: recibe el motor y los modelos comprimidos la primera vez, y
     después solo las imágenes. */
  function workerMain(makeEngine) {
    "use strict";
    /* global TesseractCore */
    var engine = makeEngine(TesseractCore);
    function gunzip(u8) {
      var s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    self.onmessage = function (e) {
      var m = e.data;
      var ready = engine.started() ? Promise.resolve() : gunzip(m.wasm).then(function (b) { return engine.start(b); });
      ready.then(function () {
        if (!m.langs.length) { return; }
        return Promise.all(m.langs.map(function (l) {
          return gunzip(l.data).then(function (d) { return { code: l.code, data: d }; });
        })).then(function (langs) { engine.languages(langs); });
      }).then(function () {
        self.postMessage({ id: m.id, text: engine.read(new Uint8Array(m.image)) });
      }).catch(function (err) {
        self.postMessage({ id: m.id, error: String((err && err.message) || err) });
      });
    };
  }

  /* ------------------------------------------------------- en la página */

  var SIMD_PROBE = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
  var worker = null, workerUrl = "", primed = false, seq = 0, pending = {}, idle = 0;

  function supported() {
    try {
      return !!(root.QA_OCR_CORE && root.QA_OCR_WASM && root.QA_OCR_LANG && root.Worker && root.Blob && root.URL &&
        root.DecompressionStream && root.createImageBitmap && typeof WebAssembly === "object" &&
        WebAssembly.validate(new Uint8Array(SIMD_PROBE)));
    } catch (e) { return false; }
  }

  function bytesOf(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
  }

  function stopWorker(reason) {
    clearTimeout(idle);
    if (worker) { worker.terminate(); }
    if (workerUrl) { URL.revokeObjectURL(workerUrl); }
    worker = null; workerUrl = ""; primed = false;
    Object.keys(pending).forEach(function (k) { pending[k].reject(new Error(reason || "OCR stopped")); delete pending[k]; });
  }

  function getWorker() {
    if (worker) { return worker; }
    var src = root.QA_OCR_CORE + "\n;(" + workerMain.toString() + ")(" + makeEngine.toString() + ");";
    workerUrl = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    worker = new Worker(workerUrl);
    worker.onmessage = function (e) {
      var m = e.data, p = pending[m.id];
      if (!p) { return; }
      delete pending[m.id];
      if (m.error) {
        /* el motor queda en un estado dudoso: el siguiente empieza de cero */
        stopWorker(m.error);
        p.reject(new Error(m.error));
        return;
      }
      p.resolve(m.text || "");
      if (!Object.keys(pending).length) { clearTimeout(idle); idle = setTimeout(function () { stopWorker(); }, IDLE_MS); }
    };
    worker.onerror = function (e) {
      if (e && e.preventDefault) { e.preventDefault(); }
      stopWorker((e && e.message) || "OCR worker failed");
    };
    return worker;
  }

  /* bytes: PNG o JPEG (ArrayBuffer). La primera vez van también el motor y
     los modelos; se transfieren, no se copian. */
  function recognize(bytes) {
    var w = getWorker(), id = ++seq, msg = { id: id, image: bytes, langs: [], wasm: null }, moved = [bytes];
    if (!primed) {
      msg.wasm = bytesOf(root.QA_OCR_WASM);
      msg.langs = LANGS.map(function (c) { return { code: c, data: bytesOf(root.QA_OCR_LANG[c]) }; });
      moved.push(msg.wasm.buffer);
      msg.langs.forEach(function (l) { moved.push(l.data.buffer); });
      primed = true;
    }
    clearTimeout(idle);
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      w.postMessage(msg, moved);
    });
  }

  function pngOf(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { if (b) { resolve(b); } else { reject(new Error("OCR: canvas")); } }, "image/png");
    }).then(function (b) { return b.arrayBuffer(); });
  }

  /* Una imagen (archivo o captura pegada). Las capturas de pantalla tienen
     letra pequeña: se agrandan hasta 2 veces, sin pasar de MAX_PIXELS. */
  function readImage(blob) {
    return root.createImageBitmap(blob).then(function (bmp) {
      var s = Math.min(2, Math.sqrt(MAX_PIXELS / (bmp.width * bmp.height)));
      var c = root.document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
      var g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) { bmp.close(); }
      return pngOf(c);
    }).then(recognize);
  }

  /* Un PDF escaneado: cada página se dibuja con PDF.js y se lee, hasta
     MAX_PAGES. onPage(i, n) avisa qué página va. */
  function readPdf(pdfjsLib, data, onPage) {
    return pdfjsLib.getDocument({ data: data, isEvalSupported: false, disableFontFace: true }).promise.then(function (pdf) {
      var n = Math.min(pdf.numPages, MAX_PAGES), texts = [], chain = Promise.resolve();
      function page(i) {
        return function () {
          if (onPage) { onPage(i, n); }
          return pdf.getPage(i).then(function (pg) {
            var base = pg.getViewport({ scale: 1 });
            var vp = pg.getViewport({ scale: Math.min(PAGE_SCALE, Math.sqrt(MAX_PIXELS / (base.width * base.height))) });
            var c = root.document.createElement("canvas");
            c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
            var g = c.getContext("2d");
            g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
            /* "print": sin requestAnimationFrame, que se detiene si la pestaña
               queda en segundo plano (por ejemplo, al volver a Zoho) */
            return pg.render({ canvasContext: g, viewport: vp, intent: "print" }).promise.then(function () {
              pg.cleanup();
              return pngOf(c);
            });
          }).then(recognize).then(function (t) { texts.push(t); });
        };
      }
      for (var i = 1; i <= n; i++) { chain = chain.then(page(i)); }
      return chain.then(function () {
        pdf.destroy();
        return { text: texts.join("\n\n"), pages: n, total: pdf.numPages };
      }, function (err) { pdf.destroy(); throw err; });
    });
  }

  var api = {
    LANGS: LANGS, MAX_PAGES: MAX_PAGES, needsOcr: needsOcr, makeEngine: makeEngine,
    supported: supported, readImage: readImage, readPdf: readPdf
  };
  root.QA = root.QA || {};
  root.QA.ocr = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
