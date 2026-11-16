#!/usr/bin/env node
/* Firma del paquete de Windows. El actualizador solo instala un paquete cuya
   firma se verifica con la llave pública que lleva adentro, así que alguien
   que entre a la cuenta de GitHub no puede repartir un paquete propio: la
   llave privada vive solo en la computadora de quien publica, fuera de git
   (private/update-signing-key.pem, o la ruta en QA_SIGNING_KEY).

     node tools/sign.js --new-key   crea la llave (una sola vez) y escribe la
                                    parte pública en tools/windows/actualizar.ps1
     node tools/build.js            arma el paquete y lo firma si encuentra la llave

   Firma RSA de 3072 bits con SHA-256 (PKCS#1 v1.5), la que Windows
   PowerShell 5 verifica sin instalar nada. */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const KEY_PATH = process.env.QA_SIGNING_KEY || path.join(root, "private", "update-signing-key.pem");
const UPDATER = path.join(root, "tools", "windows", "actualizar.ps1");

function sign(data, privatePem) {
  return crypto.sign("sha256", data, { key: privatePem, padding: crypto.constants.RSA_PKCS1_PADDING }).toString("base64");
}

function verify(data, signatureB64, publicKey) {
  try {
    return crypto.verify("sha256", data, { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(signatureB64).trim(), "base64"));
  } catch (e) { return false; }
}

/* La llave pública como la lee .NET: módulo y exponente en base64. */
function publicParts(publicKey) {
  const key = publicKey instanceof crypto.KeyObject && publicKey.type === "public" ? publicKey : crypto.createPublicKey(publicKey);
  const jwk = key.export({ format: "jwk" });
  const b64 = (u) => Buffer.from(u, "base64url").toString("base64");
  return { modulus: b64(jwk.n), exponent: b64(jwk.e) };
}

function keyFromParts(parts) {
  const url = (b) => Buffer.from(b, "base64").toString("base64url");
  return crypto.createPublicKey({ key: { kty: "RSA", n: url(parts.modulus), e: url(parts.exponent) }, format: "jwk" });
}

/* Lo que el actualizador tiene escrito como llave pública. */
function updaterKey(ps1Text) {
  const m = /\$llaveModulo\s*=\s*"([A-Za-z0-9+/=]+)"[\s\S]*?\$llaveExponente\s*=\s*"([A-Za-z0-9+/=]+)"/.exec(ps1Text);
  return m ? { modulus: m[1], exponent: m[2] } : null;
}

/* Firma el archivo y deja la firma al lado (archivo.sig). Sin llave no firma
   y borra una firma vieja: un paquete sin firma el actualizador lo rechaza. */
function signFile(file) {
  const sigPath = file + ".sig";
  if (!fs.existsSync(KEY_PATH)) {
    if (fs.existsSync(sigPath)) { fs.unlinkSync(sigPath); }
    return { signed: false, reason: "no se encontró la llave privada (" + path.relative(root, KEY_PATH) + ")" };
  }
  const pem = fs.readFileSync(KEY_PATH, "utf8");
  const pub = publicParts(crypto.createPublicKey(pem));
  const inUpdater = updaterKey(fs.readFileSync(UPDATER, "utf8"));
  if (!inUpdater || inUpdater.modulus !== pub.modulus || inUpdater.exponent !== pub.exponent) {
    throw new Error("La llave privada no corresponde a la llave pública de tools/windows/actualizar.ps1.");
  }
  const sig = sign(fs.readFileSync(file), pem);
  fs.writeFileSync(sigPath, sig + "\n");
  return { signed: true, sigPath: sigPath };
}

function newKey() {
  if (fs.existsSync(KEY_PATH)) { throw new Error("Ya existe una llave en " + KEY_PATH + ". No se reemplaza."); }
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 3072 });
  fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
  fs.writeFileSync(KEY_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const pub = publicParts(publicKey);
  let ps = fs.readFileSync(UPDATER, "utf8");
  ps = ps.replace(/(\$llaveModulo\s*=\s*")[A-Za-z0-9+/=]*(")/, "$1" + pub.modulus + "$2")
         .replace(/(\$llaveExponente\s*=\s*")[A-Za-z0-9+/=]*(")/, "$1" + pub.exponent + "$2");
  fs.writeFileSync(UPDATER, ps);
  return KEY_PATH;
}

module.exports = { sign, verify, publicParts, keyFromParts, updaterKey, signFile, KEY_PATH };

if (require.main === module) {
  if (process.argv.includes("--new-key")) {
    const where = newKey();
    console.log("Llave privada: " + where);
    console.log("Guárdala también en un lugar seguro fuera de esta computadora. Nunca la subas a GitHub.");
    console.log("La llave pública quedó en tools/windows/actualizar.ps1.");
  } else {
    console.log("Uso: node tools/sign.js --new-key  (la firma la hace node tools/build.js)");
  }
}
