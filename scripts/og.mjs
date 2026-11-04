#!/usr/bin/env node
// Generates assets/og.png (1200x630 social preview) and assets/apple-touch-icon.png (180x180)
// with a headless browser. Needs Playwright with Chromium installed (dev only; not used in CI).
// Run: npm run og

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const site = JSON.parse(await readFile(path.join(ROOT, "_data", "site.json"), "utf8"));
const font = async (f) => "data:font/woff2;base64," + (await readFile(path.join(ROOT, "assets", "fonts", f))).toString("base64");
const [serif, sans] = await Promise.all([font("newsreader.woff2"), font("inter.woff2")]);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const W = 1200, cyc = 22, bout = 400, mid = 60;
let d = "";
for (let x = 0; x <= W; x += 2) {
  const env = 0.12 + 0.88 * Math.sin((Math.PI * x) / bout) ** 4;
  d += `${x ? "L" : "M"}${x} ${(mid - 44 * env * Math.sin((2 * Math.PI * x) / cyc)).toFixed(1)}`;
}

const og = `<!doctype html><html><head><style>
@font-face{font-family:N;src:url(${serif});font-weight:400 600}@font-face{font-family:I;src:url(${sans});font-weight:400 600}
body{margin:0;width:1200px;height:630px;background:radial-gradient(900px 420px at 88% -10%,#dcecea,transparent 70%),#f6f4ef;color:#17181c;font-family:I;position:relative;overflow:hidden}
.c{padding:92px 96px}.e{font:600 22px I;letter-spacing:.14em;text-transform:uppercase;color:#0b6363;margin:0 0 22px}
h1{font:500 104px/1 N;letter-spacing:-.02em;margin:0 0 30px}p{font:400 38px/1.35 N;margin:0;max-width:900px}
svg{position:absolute;left:0;bottom:40px;width:1200px;height:120px}path{fill:none;stroke:#0b6363;stroke-width:2.4;opacity:.55}
</style></head><body><div class="c"><p class="e">Cerebellar neuroscience</p><h1>${esc(site.name)}</h1>
<p>How the cerebellum shapes rhythmic movements</p></div>
<svg viewBox="0 0 1200 120"><path d="${d}"/></svg></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(ROOT, "assets", "og.png") });

const icon = await readFile(path.join(ROOT, "assets", "favicon.svg"), "utf8");
const p2 = await browser.newPage({ viewport: { width: 180, height: 180 } });
await p2.setContent(`<body style="margin:0">${icon.replace("<svg ", '<svg width="180" height="180" ')}</body>`);
await p2.screenshot({ path: path.join(ROOT, "assets", "apple-touch-icon.png") });
await browser.close();
console.log("Wrote assets/og.png and assets/apple-touch-icon.png");
