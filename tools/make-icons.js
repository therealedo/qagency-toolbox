/* Renders every app icon from assets/mark.svg, so each size is drawn sharp
   instead of being shrunk from one blurry image. Needs Chrome or Edge
   installed (headless screenshots). Run: node tools/make-icons.js */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "assets", "mark.svg"), "utf8");
const svgUri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium"
];
const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) { console.error("No se encontró Chrome ni Edge."); process.exit(1); }

/* the shield is 128 x 140 */
const ASPECT = 128 / 140;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const jobs = [
  { file: "mark.png", w: 112, h: 122, fill: 1, bg: null },
  ...ICO_SIZES.map((s) => ({ file: "icon-" + s + ".png", w: s, h: s, fill: s <= 32 ? 1 : 0.94, bg: null })),
  { file: "icon-192.png", w: 192, h: 192, fill: 0.94, bg: null },
  { file: "icon-512.png", w: 512, h: 512, fill: 0.94, bg: null },
  /* maskable: the safe zone is the middle 80 %, on a solid background */
  { file: "icon-maskable-512.png", w: 512, h: 512, fill: 0.6, bg: "#FFFFFF" }
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qa-icons-"));
try {
  jobs.forEach((j) => {
    const h = Math.round(j.h * j.fill), w = Math.round(h * ASPECT);
    const html = '<!doctype html><html><head><style>html,body{margin:0;width:' + j.w + "px;height:" + j.h + "px;overflow:hidden;background:" +
      (j.bg || "transparent") + "}body{display:flex;align-items:center;justify-content:center}</style></head><body>" +
      '<img src="' + svgUri + '" width="' + w + '" height="' + h + '"></body></html>';
    const page = path.join(tmp, j.file + ".html"), out = path.join(tmp, j.file);
    fs.writeFileSync(page, html);
    execFileSync(browser, ["--headless=new", "--user-data-dir=" + path.join(tmp, "profile"), "--hide-scrollbars",
      "--default-background-color=00000000", "--force-device-scale-factor=1",
      "--window-size=" + j.w + "," + j.h, "--screenshot=" + out, "file:///" + page.replace(/\\/g, "/")], { stdio: "ignore" });
    fs.copyFileSync(out, path.join(root, "assets", j.file));
    console.log("assets/" + j.file, j.w + "x" + j.h);
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

module.exports = { ICO_SIZES };
