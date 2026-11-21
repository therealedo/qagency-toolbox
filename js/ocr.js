/* Q Agency Toolbox — lectura de escaneos y capturas (OCR) sin internet.
   El motor (Tesseract en WebAssembly) y los modelos de español e inglés van
   dentro de la herramienta (vendor/tesseract) y corren en un worker creado
   desde un Blob: no se descarga nada y la página sigue sin conexiones
   (connect-src 'none'). Necesita WebAssembly SIMD: Chrome o Edge al día. */
(function (root) {
  "use strict";

  var LANGS = ["spa", "eng"];
  var MAX_PAGES = 20;         /* páginas de un PDF escaneado que se leen: un App
                                 Summary lleva unas 2 por persona */
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
      },
      /* Cada palabra con su posición, buscando texto suelto por toda la
         imagen (11 = texto disperso): para páginas con columnas y tarjetas,
         como las cotizaciones de HealthSherpa, donde el orden de las líneas
         no sirve y sí dónde está cada cosa. */
      words: function (image) {
        if (!api) { throw new Error("OCR: languages not loaded"); }
        mod.FS.writeFile("/input", image instanceof Uint8Array ? image : new Uint8Array(image));
        if (api.SetImageFile(1, 0) === 1) { throw new Error("OCR: could not read the image"); }
        api.SetVariable("tessedit_pageseg_mode", "11");
        var tsv = "";
        try { api.Recognize(null); tsv = api.GetTSVText(0); } finally { api.SetVariable("tessedit_pageseg_mode", "4"); api.Clear(); }
        var out = [];
        String(tsv || "").split("\n").forEach(function (row) {
          var c = row.split("\t");
          if (c[0] !== "5" || c.length < 12) { return; }
          var text = c.slice(11).join("\t").trim();
          if (text) { out.push({ x: +c[6], y: +c[7], w: +c[8], h: +c[9], conf: +c[10], text: text }); }
        });
        return out;
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
    var queue = Promise.resolve();
    self.onmessage = function (e) {
      queue = queue.then(function () { return handle(e.data); });
    };
    function handle(m) {
      var ready = engine.started() ? Promise.resolve() : gunzip(m.wasm).then(function (b) { return engine.start(b); });
      return ready.then(function () {
        if (!m.langs.length) { return; }
        return Promise.all(m.langs.map(function (l) {
          return gunzip(l.data).then(function (d) { return { code: l.code, data: d }; });
        })).then(function (langs) { engine.languages(langs); });
      }).then(function () {
        var image = new Uint8Array(m.image);
        self.postMessage(m.words ? { id: m.id, words: engine.words(image) } : { id: m.id, text: engine.read(image) });
      }).catch(function (err) {
        self.postMessage({ id: m.id, error: String((err && err.message) || err) });
      });
    }
  }

  /* ------------------------------------------- una línea partida en dos --
     Al imprimir una página web a PDF (el App Summary de HealthCare.gov), una
     línea puede quedar cortada: la parte de arriba al final de una página y
     la de abajo al empezar la siguiente. Cada parte sola se lee mal
     ("$20,000.00" salía "$70.000.00"), así que la parte de abajo se pega
     debajo de la de arriba y se borra de la página siguiente. Las imágenes
     son { width, height, data } en RGBA, como las da getImageData. */
  var INK = 160;   /* más oscuro que esto es tinta (las rayas grises no) */
  var EDGE = 0.3;  /* una parte cortada termina o empieza con mucha tinta */

  function isInk(d, i) { return d[i] < INK && d[i + 1] < INK && d[i + 2] < INK; }

  function inkRows(img) {
    var rows = [], d = img.data, w = img.width * 4;
    for (var y = 0; y < img.height; y++) {
      var k = 0;
      for (var i = y * w, end = i + w; i < end; i += 4) { if (isInk(d, i)) { k++; } }
      rows.push(k);
    }
    return rows;
  }

  /* las franjas de filas con tinta, de arriba abajo */
  function inkBands(rows) {
    var out = [], top = -1;
    for (var y = 0; y <= rows.length; y++) {
      var ink = y < rows.length && rows[y] > 0;
      if (ink && top < 0) { top = y; }
      if (!ink && top >= 0) { out.push({ top: top, end: y }); top = -1; }
    }
    return out;
  }

  function peak(rows, b) {
    var m = 0;
    for (var y = b.top; y < b.end; y++) { m = Math.max(m, rows[y]); }
    return m;
  }

  function inkSpan(img, b) {
    var d = img.data, w = img.width, lo = w, hi = -1;
    for (var y = b.top; y < b.end; y++) {
      for (var x = 0; x < w; x++) {
        if (isInk(d, (y * w + x) * 4)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      }
    }
    return { lo: lo, hi: hi };
  }

  /* prev: el final de una página; next: el principio de la siguiente (el
     mismo ancho). Si la última línea de prev y la primera de next son las
     dos mitades de una sola, las junta en prev, la borra de next y da true. */
  function joinCut(prev, next) {
    if (prev.width !== next.width) { return false; }
    var rp = inkRows(prev), rn = inkRows(next), bp = inkBands(rp), bn = inkBands(rn);
    var a = bp[bp.length - 1], b = bn[0];
    if (!a || !b) { return false; }
    var ha = a.end - a.top, hb = b.end - b.top;
    /* una línea entera termina y empieza con poca tinta (las curvas de las letras) */
    if (rp[a.end - 1] < EDGE * peak(rp, a) || rn[b.top] < EDGE * peak(rn, b)) { return false; }
    /* las dos partes suman una línea, no dos (sin contar rayas ni puntos) */
    var hs = bp.concat(bn).map(function (x) { return x.end - x.top; })
      .filter(function (h) { return h >= 4; }).sort(function (x, y) { return x - y; });
    var line = hs[Math.floor(hs.length / 2)] || 0;
    if (!line || ha + hb < 0.6 * line || ha + hb > 1.4 * line || a.end + hb > prev.height) { return false; }
    var sa = inkSpan(prev, a), sb = inkSpan(next, b);
    if (sb.lo > sa.hi || sb.hi < sa.lo) { return false; }
    var w = prev.width * 4;
    for (var r = 0; r < hb; r++) {
      var from = (b.top + r) * w, to = (a.end + r) * w;
      prev.data.set(next.data.subarray(from, from + w), to);
      next.data.fill(255, from, from + w);
    }
    return true;
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
      p.resolve(m.words || m.text || "");
      if (!Object.keys(pending).length) { clearTimeout(idle); idle = setTimeout(function () { stopWorker(); }, IDLE_MS); }
    };
    worker.onerror = function (e) {
      if (e && e.preventDefault) { e.preventDefault(); }
      stopWorker((e && e.message) || "OCR worker failed");
    };
    return worker;
  }

  /* bytes: PNG o JPEG (ArrayBuffer). La primera vez van también el motor y
     los modelos; se transfieren, no se copian. Con `words` devuelve las
     palabras con su posición en vez del texto. */
  function recognize(bytes, words) {
    var w = getWorker(), id = ++seq, msg = { id: id, image: bytes, langs: [], wasm: null, words: !!words }, moved = [bytes];
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
     letra pequeña: se agrandan hasta 2 veces, sin pasar de MAX_PIXELS.
     Con { words: true } da las palabras con su posición (en la imagen
     agrandada) en vez del texto. */
  function readImage(blob, opts) {
    var words = !!(opts && opts.words);
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
    }).then(function (png) { return recognize(png, words); });
  }

  /* Una línea partida entre dos páginas dibujadas se junta en la primera.
     Basta mirar el último tercio de una y el primero de la otra. */
  function joinPages(a, b) {
    var h = Math.min(a.height, b.height, Math.ceil(a.height / 3)), ga = a.getContext("2d"), gb = b.getContext("2d");
    var ia = ga.getImageData(0, a.height - h, a.width, h), ib = gb.getImageData(0, 0, b.width, h);
    if (joinCut(ia, ib)) { ga.putImageData(ia, 0, a.height - h); gb.putImageData(ib, 0, 0); }
  }

  /* Un PDF escaneado: cada página se dibuja con PDF.js y se lee, hasta
     MAX_PAGES. Se dibuja una página antes de leer la anterior, para juntar
     una línea partida entre las dos. onPage(i, n) avisa qué página va. */
  function readPdf(pdfjsLib, data, onPage) {
    return pdfjsLib.getDocument({ data: data, isEvalSupported: false, disableFontFace: true }).promise.then(function (pdf) {
      var n = Math.min(pdf.numPages, MAX_PAGES), texts = [], held = null, chain = Promise.resolve();
      function draw(i) {
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
            return c;
          });
        });
      }
      function read(i, c) {
        if (onPage) { onPage(i, n); }
        return pngOf(c).then(recognize).then(function (t) { texts.push(t); });
      }
      function page(i) {
        return function () {
          return draw(i).then(function (c) {
            var prev = held;
            held = c;
            if (!prev) { return; }
            joinPages(prev, c);
            return read(i - 1, prev);
          });
        };
      }
      for (var i = 1; i <= n; i++) { chain = chain.then(page(i)); }
      chain = chain.then(function () { if (held) { return read(n, held); } });
      return chain.then(function () {
        pdf.destroy();
        return { text: texts.join("\n\n"), pages: n, total: pdf.numPages };
      }, function (err) { pdf.destroy(); throw err; });
    });
  }

  var api = {
    LANGS: LANGS, MAX_PAGES: MAX_PAGES, needsOcr: needsOcr, makeEngine: makeEngine, joinCut: joinCut,
    supported: supported, readImage: readImage, readPdf: readPdf
  };
  root.QA = root.QA || {};
  root.QA.ocr = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
