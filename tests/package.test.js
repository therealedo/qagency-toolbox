/* Comprueba que lo necesario para instalar la herramienta esté completo y
   que las versiones no se desincronicen. */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../js/config.js");

const root = path.join(__dirname, "..");
const exists = (p) => fs.existsSync(path.join(root, p));

test("la copia local (sw.js) lleva la misma versión y archivos que existen", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.equal(sw.match(/const VERSION = "([^"]+)"/)[1], C.VERSION);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version, C.VERSION);
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].match(/"[^"]+"/g).map((x) => x.slice(1, -1));
  shell.filter((f) => f !== "./").forEach((f) => assert.ok(exists(f), "falta " + f));
  /* todo lo que carga la página debe estar en la copia local */
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  (html.match(/(?:src|href)="(?!#|data:|qagency-toolbox-update:)([^"]+)"/g) || []).map((m) => m.replace(/^.*?="|"$/g, ""))
    .forEach((f) => assert.ok(shell.includes(f), f + " no está en SHELL"));
  const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
  (css.match(/url\("\.\.\/([^"]+)"\)/g) || []).map((m) => m.replace(/^url\("\.\.\/|"\)$/g, ""))
    .forEach((f) => assert.ok(shell.includes(f), f + " no está en SHELL"));
});

test("las plantillas del Consent y del SOA van dentro de la herramienta, como scripts", () => {
  const F = require("../js/forms.js");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  /* forms.js necesita notes.js y lo usa app.js */
  assert.ok(html.indexOf('<script src="js/notes.js">') < html.indexOf('<script src="js/forms.js">'));
  assert.ok(html.indexOf('<script src="js/forms.js">') < html.indexOf('<script src="js/app.js">'));
  Object.keys(F.TEMPLATES).forEach((k) => {
    const f = "vendor/forms/" + k + ".js";
    assert.ok(html.includes('<script src="' + f + '"></script>'), f);
    const m = fs.readFileSync(path.join(root, f), "utf8").match(/window\.QA_FORMS\["([^"]+)"\] = "([A-Za-z0-9+/=]+)";/);
    assert.equal(m[1], k);
    assert.equal(Buffer.from(m[2].slice(0, 8), "base64").toString("latin1").slice(0, 5), "%PDF-", f + " lleva un PDF");
  });
});

test("el manifiesto apunta a íconos que existen", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"));
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  m.icons.forEach((i) => assert.ok(exists(i.src), "falta " + i.src));
});

test("el equipo no viene en el código: se importa del archivo de la oficina", () => {
  assert.deepEqual(C.TEAM, []);
  assert.deepEqual(C.OFFICES, ["QAgency", "ATH Insurance"]);
  /* ningún NPN de 8 dígitos en la configuración */
  assert.doesNotMatch(fs.readFileSync(path.join(root, "js", "config.js"), "utf8"), /npn\s*:\s*"\d{6,}"/i);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  ["teamImport", "teamExport", "teamFile", "teamEmpty"].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
});

test("el instalador prefiere Chrome, luego Edge, y Brave al final (Brave no deja elegir carpetas)", () => {
  const ps = fs.readFileSync(path.join(root, "tools", "windows", "instalar.ps1"), "utf8");
  const exes = ps.match(/\$navegadores = @\(([\s\S]*?)\r?\n\)/)[1].match(/[a-z]+\.exe/g);
  assert.equal(exes.length, 8, "las mismas rutas de siempre");
  assert.deepEqual(exes.filter((x, i) => exes.indexOf(x) === i), ["chrome.exe", "msedge.exe", "brave.exe"]);
  assert.match(ps, /No se encontro Chrome, Edge ni Brave/);
});

test("al actualizar, el instalador mantiene el navegador del acceso directo que ya existe (ahí están los ajustes)", () => {
  const ps = fs.readFileSync(path.join(root, "tools", "windows", "instalar.ps1"), "utf8");
  const keep = ps.indexOf("$previo = $lnk.TargetPath");
  assert.ok(keep > ps.indexOf("$navegador = $navegadores"), "se lee después de elegir el primero que exista");
  assert.ok(keep < ps.indexOf("$s.TargetPath = $navegador"), "y antes de escribir los accesos directos");
  assert.ok(ps.includes("(chrome|msedge|brave)\\.exe$"), "solo si sigue siendo uno de los navegadores conocidos");
});

test("la página solo puede pedir el número de versión: el OCR solo agrega 'wasm-unsafe-eval'", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(C.UPDATE_URL, "https://raw.githubusercontent.com/therealedo/qagency-toolbox/main/package.json");
  assert.equal(csp, "default-src 'self' 'unsafe-inline' data: blob: file: 'wasm-unsafe-eval'; connect-src " + C.UPDATE_URL + "; object-src 'none'; base-uri 'self'; form-action 'none'");
  /* el motor y los modelos del OCR van dentro de la herramienta */
  ["vendor/tesseract/ocr-loader.js", "vendor/tesseract/ocr-wasm.js", "vendor/tesseract/ocr-lang-spa.js",
    "vendor/tesseract/ocr-lang-eng.js", "js/ocr.js"].forEach((f) => assert.ok(html.includes('<script src="' + f + '"></script>'), f));
});

test("el actualizador: misma fuente que la página, revisa la versión del paquete y se instala con la herramienta", () => {
  const win = (f) => fs.readFileSync(path.join(root, "tools", "windows", f), "utf8");
  const ps = win("actualizar.ps1");
  const base = C.UPDATE_URL.replace(/\/package\.json$/, "");
  assert.ok(ps.includes('"' + base + '"'), "la fuente por defecto es el repositorio");
  assert.match(ps, /\/package\.json/);
  assert.match(ps, /\/dist\/QAgency-Toolbox-Windows\.zip/);
  assert.match(ps, /-le \$local/, "solo instala si la de GitHub es más nueva");
  assert.match(ps, /-ne \$remota/, "rechaza un paquete con otra versión");
  assert.match(win("Actualizar.bat"), /actualizar\.ps1/);
  const inst = win("instalar.ps1");
  assert.match(inst, /actualizar\.ps1/);
  assert.match(inst, /Actualizar \$nombre\.lnk/);
  const build = fs.readFileSync(path.join(root, "tools", "build.js"), "utf8");
  assert.match(build, /tools\/windows\/Actualizar\.bat/);
  assert.match(build, /tools\/windows\/actualizar\.ps1/);
  /* la página avisa, solo abierta como archivo */
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  ["updateBar", "updateText", "btnUpdateClose"].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
  assert.ok(fs.readFileSync(path.join(root, "js", "app.js"), "utf8").includes('fetch(C.UPDATE_URL, { cache: "no-store", credentials: "omit"'));
});

test("el botón Actualizar de la barra abre el actualizador con un enlace propio que no le pasa nada", () => {
  const win = (f) => fs.readFileSync(path.join(root, "tools", "windows", f), "utf8");
  const inst = win("instalar.ps1");
  const scheme = C.UPDATE_LINK.split(":")[0];
  assert.equal(C.UPDATE_LINK, "qagency-toolbox-update:run");
  /* el instalador registra el enlace para el usuario, sin permisos de administrador */
  assert.ok(inst.includes('"HKCU:\\Software\\Classes\\' + scheme + '"'), "registra el enlace en HKCU");
  assert.match(inst, /URL Protocol/);
  assert.match(inst, /shell\\open\\command/);
  /* el comando corre el actualizador instalado y no recibe la dirección (%1) */
  const cmd = inst.match(/\$comandoActualizar = (.+)/);
  assert.ok(cmd, "arma el comando del enlace");
  assert.match(cmd[1], /actualizar\.ps1/);
  assert.doesNotMatch(inst, /%1/, "el enlace no le pasa nada al actualizador");
  /* desinstalar quita el enlace; el acceso del Escritorio ya no hace falta */
  assert.match(inst.slice(inst.indexOf("if ($Quitar)"), inst.indexOf("exit 0")), /\$claveEnlace/);
  const desde = inst.indexOf("$accesosActualizar = @(");
  const lista = inst.slice(desde, inst.indexOf("\n)", desde));
  assert.doesNotMatch(lista, /Desktop/, "ya no crea Actualizar en el Escritorio");
  assert.match(inst, /\$actualizarEscritorio/, "quita el Actualizar del Escritorio de las versiones anteriores");
  /* la barra de arriba tiene el botón, que abre ese enlace */
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, new RegExp('id="btnUpdateApp"[^>]*href="' + C.UPDATE_LINK + '"'));
});

test("el enlace de firma avisa que es solo para datos de prueba hasta el BAA", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const box = html.match(/<div class="sign-block" id="signLinkBox"[\s\S]*?id="signUrl"/)[0];
  assert.match(box, /id="signWarn"/);
  assert.match(box, /Solo con datos de prueba/);
  assert.match(box, /BAA/);
});

test("el paquete de Windows va firmado con la llave que el actualizador acepta", () => {
  const S = require("../tools/sign.js");
  const ps = fs.readFileSync(path.join(root, "tools", "windows", "actualizar.ps1"), "utf8");
  const parts = S.updaterKey(ps);
  assert.ok(parts, "el actualizador trae la llave pública");
  assert.equal(Buffer.from(parts.modulus, "base64").length, 384, "RSA de 3072 bits");
  const zip = fs.readFileSync(path.join(root, "dist", "QAgency-Toolbox-Windows.zip"));
  const sig = fs.readFileSync(path.join(root, "dist", "QAgency-Toolbox-Windows.zip.sig"), "utf8");
  assert.ok(S.verify(zip, sig, S.keyFromParts(parts)), "la firma de dist corresponde al paquete y a la llave del actualizador");
  /* un byte cambiado ya no pasa */
  const bad = Buffer.from(zip); bad[bad.length - 100] ^= 1;
  assert.equal(S.verify(bad, sig, S.keyFromParts(parts)), false);
  /* la firma se revisa antes de abrir el paquete, y sin firma no se instala */
  assert.ok(ps.indexOf("Firma-Valida $zip $firma") > 0 && ps.indexOf("Firma-Valida $zip $firma") < ps.indexOf("Expand-Archive"));
  assert.match(ps, /\.zip\.sig/);
});

test("firma: lo firmado con una llave solo lo acepta esa llave", () => {
  const S = require("../tools/sign.js");
  const crypto = require("node:crypto");
  const a = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }), b = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const data = Buffer.from("paquete");
  const sig = S.sign(data, a.privateKey.export({ type: "pkcs8", format: "pem" }));
  assert.equal(S.verify(data, sig, S.keyFromParts(S.publicParts(a.publicKey))), true);
  assert.equal(S.verify(data, sig, b.publicKey), false);
  assert.equal(S.verify(Buffer.from("otro"), sig, a.publicKey), false);
  assert.equal(S.verify(data, "no es base64 válido!!", a.publicKey), false);
});

test("íconos: el .ico lleva una imagen por tamaño, dibujadas desde mark.svg (no una de 256 px achicada)", () => {
  const build = fs.readFileSync(path.join(root, "tools", "build.js"), "utf8");
  assert.match(build, /const ICO_SIZES = \[16, 24, 32, 48, 64, 128, 256\];/);
  [16, 24, 32, 48, 64, 128, 256].forEach((n) => {
    const b = fs.readFileSync(path.join(root, "assets", "icon-" + n + ".png"));
    assert.equal(b.readUInt32BE(16), n, "icon-" + n + ".png mide " + n + " px");
  });
  assert.ok(fs.existsSync(path.join(root, "assets", "mark.svg")));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /<link rel="icon" href="assets\/icon-32.png" sizes="32x32">/);
});

test("los accesos directos abren siempre el mismo perfil del navegador, propio de la herramienta", () => {
  const ps = fs.readFileSync(path.join(root, "tools", "windows", "instalar.ps1"), "utf8");
  /* sin perfil fijo, Chrome la abre en el último perfil usado y los ajustes "desaparecen" */
  assert.match(ps, /\$perfil = Join-Path \$destino "Navegador"/);
  const args = ps.match(/\$argumentos = "(--user-data-dir[^\n]*--app=[^\n]*)"/);
  assert.ok(args, "el acceso directo de la herramienta lleva --user-data-dir antes de --app");
  assert.match(args[1], /--user-data-dir=`"\$perfil`"/);
  assert.match(args[1], /--no-first-run/);
  assert.match(ps, /\$s\.Arguments = \$argumentos/);
  /* el ícono marca la página para que sepa que la abrió con su perfil */
  assert.match(ps, /\.AbsoluteUri \+ "\?perfil=propio"/);
  /* quien venía del perfil compartido recibe el aviso de qué volver a configurar */
  assert.match(ps, /\$propioAntes/);
  assert.match(ps, /Importar equipo/);
});

test("las anclas viejas de la barra de tareas se apuntan al perfil propio", () => {
  const ps = fs.readFileSync(path.join(root, "tools", "windows", "instalar.ps1"), "utf8");
  assert.match(ps, /\$anclas = Join-Path \$env:APPDATA "Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar"/);
  /* solo las que abren la copia instalada, y solo si no están ya bien */
  assert.match(ps, /\$s\.Arguments -match 'QAgencyToolbox\[\\\\\/\]\+QAgency-Toolbox\\\.html'/);
  assert.match(ps, /\$s\.Arguments -ne \$argumentos -or \$s\.TargetPath -ne \$navegador/);
  /* un ancla que abre el archivo con otro programa (un editor) no se toca */
  assert.match(ps, /\$abreNavegador = \$s\.TargetPath -match '\\\\\(chrome\|msedge\|brave\)\(_proxy\)\?\\\.exe\$'/);
  assert.match(ps, /if \(\$abreNavegador -and /);
  assert.match(ps, /Apuntar-Acceso \$s/);
});
