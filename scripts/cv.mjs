#!/usr/bin/env node
// Builds the public CV PDF (assets/Staf_Bauer_CV.pdf) from a CV in Markdown.
//
//   npm run cv -- path/to/master-cv.md    sanitise the master CV into src/cv.md, then build the PDF
//   npm run cv                            rebuild the PDF from src/cv.md
//
// The master CV (private, with address/phone/birth date/email) lives outside this repo. Only the
// sanitised copy is committed. The script refuses to write anything if private details survive
// sanitising. Needs pandoc and Playwright with Chromium (local only, not used in CI).

import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_MD = path.join(ROOT, "src", "cv.md");
const OUT = path.join(ROOT, "assets", "Staf_Bauer_CV.pdf");
const SITE = "https://sqbauer.github.io";

const input = process.argv[2] ? path.resolve(process.argv[2]) : PUBLIC_MD;
let md = await readFile(input, "utf8");

// --- sanitise ---
md = md
  .split("\n")
  .map((line) => {
    // Contact line: keep only public profile links, add the website.
    if (/mailto:|tel:/.test(line) && line.includes("•")) {
      const keep = line.split("•").map((s) => s.trim()).filter((s) => /linkedin\.com|orcid\.org/i.test(s));
      return [`[${SITE.replace("https://", "")}](${SITE})`, ...keep].join(" • ");
    }
    if (/^\*Born\b/i.test(line.trim())) return null;
    return line;
  })
  .filter((l) => l !== null)
  // consecutive "**Label:** text" lines (e.g. Skills) need hard breaks, or pandoc merges them
  .map((l, i, a) => (/^\*\*[^*]+:\*\*/.test(l) && /^\*\*[^*]+:\*\*/.test(a[i + 1] || "") && !l.endsWith("\\") ? l + "\\" : l))
  .join("\n")
  .replace(/\n{3,}/g, "\n\n");

const leaks = [
  [/mailto:|@[a-z0-9-]+\.[a-z]{2,}/i, "email address"],
  [/tel:|\+\d{2}[\s\d]{6,}/, "phone number"],
  [/\bborn\b/i, "date of birth"],
  [/\b\d{4}\s?[A-Z]{2}\b/, "Dutch postal code"],
  [/straat|street|\blaan\b|\bweg\b/i, "street address"],
];
const found = leaks.filter(([re]) => re.test(md)).map(([, what]) => what);
if (found.length) {
  console.error(`Refusing to build: possible private details left (${found.join(", ")}). Fix the sanitiser or the source.`);
  process.exit(1);
}
if (input !== PUBLIC_MD) await writeFile(PUBLIC_MD, md);

// --- render ---
const name = (md.match(/^title:\s*"?([^"\n]+)"?/m) || [, "CV"])[1];
const body = execFileSync("pandoc", ["-f", "markdown", "-t", "html5", "--wrap=none"], { input: md }).toString();
const font = async (f) => "data:font/woff2;base64," + (await readFile(path.join(ROOT, "assets", "fonts", f))).toString("base64");
const [serif, sans] = await Promise.all([font("newsreader.woff2"), font("inter.woff2")]);

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${name} — CV</title><style>
@font-face{font-family:"Newsreader";src:url(${serif});font-weight:400 600}
@font-face{font-family:"Inter";src:url(${sans});font-weight:400 600}
@page{size:A4;margin:16mm 17mm 16mm}
body{font:9.6pt/1.45 "Inter",sans-serif;color:#17181c;margin:0}
h1{font:500 26pt/1 "Newsreader",serif;letter-spacing:-.01em;margin:0 0 6pt}
h2{font:600 8pt/1 "Inter",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#0b6363;
   margin:15pt 0 7pt;padding-bottom:4pt;border-bottom:.6pt solid #d9d5cb;break-after:avoid}
p{margin:0 0 5pt}
p:has(+ul){margin-bottom:2pt}
strong{font-weight:600}
em{color:#50535c}
a{color:#0b6363;text-decoration:none}
ul{margin:0 0 7pt;padding-left:13pt}
li{margin:0 0 1.5pt}
p, li{break-inside:avoid}
.contact{color:#50535c;margin-bottom:4pt}
</style></head><body>
<h1>${name}</h1>
${body.replace(/^<p>(<a href="https:\/\/sqbauer[^]*?)<\/p>/m, '<p class="contact">$1</p>')}
</body></html>`;

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: OUT, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`Wrote ${path.relative(ROOT, OUT)} from ${path.relative(ROOT, input) || input}`);
