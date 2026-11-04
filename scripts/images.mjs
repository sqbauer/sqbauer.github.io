#!/usr/bin/env node
// Converts originals in src/images/ (jpg/jpeg/png) to AVIF + WebP + JPEG in assets/img/,
// and records output dimensions in _data/images.json (render.mjs uses them for width/height).
// "photo.*" is sized for the hero (440 px wide = 2x display); everything else max 1200 px.
// Run: npm run images

import { readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src", "images");
const OUT = path.join(ROOT, "assets", "img");
await mkdir(OUT, { recursive: true });

const manifest = {};
for (const file of (await readdir(SRC)).sort()) {
  const m = file.match(/^(.+)\.(jpe?g|png)$/i);
  if (!m) continue;
  const name = m[1].toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const maxW = name === "photo" ? 440 : 1200;
  const base = sharp(path.join(SRC, file)).rotate().resize({ width: maxW, withoutEnlargement: true });
  const { width, height } = await base.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  await base.clone().avif({ quality: 55 }).toFile(path.join(OUT, `${name}.avif`));
  await base.clone().webp({ quality: 78 }).toFile(path.join(OUT, `${name}.webp`));
  await base.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, `${name}.jpg`));
  manifest[name] = { width, height, formats: ["avif", "webp", "jpg"], fallback: "jpg" };
  console.log(`${file} -> assets/img/${name}.{avif,webp,jpg} (${width}x${height})`);
}
await writeFile(path.join(ROOT, "_data", "images.json"), JSON.stringify(manifest, null, 2) + "\n");
