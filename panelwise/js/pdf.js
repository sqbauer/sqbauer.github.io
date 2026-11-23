"use strict";
/* ---------- PDF parsing ---------- */
let pdfLibReady = null;
// options for every getDocument: the standard fonts let pdf.js draw PDFs that use the built-in Symbol/Dingbats fonts
const PDF_OPTS = { isEvalSupported: false, disableFontFace: false, standardFontDataUrl: "vendor/pdfjs/standard_fonts/" };
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); }); }
function ensurePdfJs() {
  if (!pdfLibReady) pdfLibReady = (async () => {
    const base = "vendor/pdfjs/"; // bundled locally (was cdnjs), works offline
    await loadScript(base + "pdf.min.js");
    // pdf.js parses in its own worker thread, so reading a PDF doesn't freeze the screen. (Loading the worker file
    // as a page script, as before, made pdf.js fall back to a "fake worker" on the main thread.)
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(base + "pdf.worker.min.js", document.baseURI).href;
    return window.pdfjsLib;
  })();
  return pdfLibReady;
}
const HEAD_RE = /^(?:\d+(?:\.\d+)*\.?\s*|[IVX]+\.\s*)?(abstract|summary|introduction|background|results(?: and discussion)?|discussion|conclusions?|(?:materials and |star\s*[★+*]?\s*)?methods|experimental procedures|online methods|references(?: and notes)?|bibliography|acknowledge?ments?|supplementary (?:information|materials?)|author contributions?|competing interests|conflicts? of interest|data availability(?: statement)?|code availability|ethics statement|funding|publisher'?’?s note|generative ai statement|footnotes|keywords|additional information|reporting summary|peer review information|author information|declaration of interests)\s*:?\s*$/i;
// "Figure 2. ", "Fig 2: ", "Figure 2 | ", and "Figure 2—" (Sleep and others); not eLife's "Figure 2—figure supplement 1"
const CAP_RE = /^(?:Figure|Fig\s?\.?)\s*(\d{1,2})\s*(?:[.:|]|[—–]\s*(?!figure supplement|source (?:data|code)|video|animation)|\s{2,}|\s+(?=[A-Z][a-z])|$)/i;
const CAP_LABEL_ONLY = /^(?:Figure|Fig\s?\.?)\s*\d{1,2}\s*[.:|—–]?\s*$/i;
const META_RE = /copyright|creative commons|licen[cs]e|citation|received|accepted|published|correspondence|edited by|reviewed by|open access|doi[: ]|©|this article is/gi;
const LIGS = ["ff", "fi", "fl", "ffi", "ffl"];
const LIG_WORDS = "different difference differ effect effects affect affected efficient coefficient sufficient diffuse offset office offer suffer staff off significant significantly specific specifically identified identify field fields first find found figure fixed final finally filter filtered fiber fibre fibers fire firing defined define classified modified amplified verified quantified artificial profile confirm confirmed configuration fit fitted fifth flow flat flex flexion reflect reflects reflex conflict influence influenced fluorescent fluorescence flip flipped float flank inflow outflow efficacy differentiated differential sniffing".split(" ");
function fixLigatures(lines) {
  for (const l of lines) l.text = l.text.replace(/([a-z])\u00FF(?=[a-z])/g, "$1ffi").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g, "");
  const pua = /[\uE000-\uF8FF]/g, votes = {};
  for (const l of lines) for (const w of l.text.match(/[A-Za-z\uE000-\uF8FF]*[\uE000-\uF8FF][A-Za-z\uE000-\uF8FF]*/g) || []) {
    for (const ch of new Set(w.match(pua))) { votes[ch] = votes[ch] || {};
      for (const lig of LIGS) { const cand = w.split(ch).join(lig).toLowerCase(); if (LIG_WORDS.some(x => cand === x || cand.startsWith(x) && x.length > 4 || x.startsWith(cand) && cand.length > 4)) votes[ch][lig] = (votes[ch][lig] || 0) + 1; } }
  }
  const map = {};
  for (const [ch, v] of Object.entries(votes)) { const best = Object.entries(v).sort((a, b) => b[1] - a[1])[0]; if (best) map[ch] = best[0]; }
  for (const l of lines) l.text = l.text.replace(pua, c => map[c] ?? "");
}
function secOf(h) {
  h = h.toLowerCase();
  if (/abstract|^summary/.test(h.replace(/^[\d.\sivx]+/, ""))) return "abstract";
  if (/introduction|background/.test(h)) return "intro";
  if (/results/.test(h)) return "results";
  if (/discussion|conclusion/.test(h)) return "discussion";
  if (/methods|procedures/.test(h)) return "methods";
  if (/references|bibliography/.test(h)) return "refs";
  return "skip";
}
function graphicsOf(ol, vp, O, imgOps) {
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const tr = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  let ctm = [1, 0, 0, 1, 0, 0]; const st = [], bx = [];
  const add = (x0, y0, x1, y1, isPath) => { const p = [tr(ctm, x0, y0), tr(ctm, x1, y0), tr(ctm, x0, y1), tr(ctm, x1, y1)]; const r = vp.convertToViewportRectangle([Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]);
    const b = [Math.min(r[0], r[2]) / vp.width, Math.min(r[1], r[3]) / vp.height, Math.max(r[0], r[2]) / vp.width, Math.max(r[1], r[3]) / vp.height].map(v => Math.max(0, Math.min(1, v)));
    const w = b[2] - b[0], h = b[3] - b[1]; if (w < .004 || h < .004 || w > .985 && h > .985 || b[3] < .06 || b[1] > .94 || isPath && w * h > .45) return;
    if (isPath && (h < .012 && w > .45 || w < .012 && h > .45)) return;   // long thin rules: page headers, footers, column lines and frames, not figure content
    bx.push(b); };
  for (let i = 0; i < ol.fnArray.length; i++) { const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === O.save) st.push(ctm.slice()); else if (fn === O.restore) ctm = st.pop() || ctm; else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.paintFormXObjectBegin) { st.push(ctm.slice()); if (a && Array.isArray(a[0]) && a[0].length === 6) ctm = mul(ctm, a[0]); }
    else if (fn === O.paintFormXObjectEnd) ctm = st.pop() || ctm;
    else if (imgOps.has(fn) || fn === O.paintImageMaskXObject) add(0, 0, 1, 1);
    else if (fn === O.constructPath) {
      const nx = ol.fnArray[i + 1], nx2 = ol.fnArray[i + 2];
      if (nx === O.clip || nx === O.eoClip || nx2 === O.clip || nx2 === O.eoClip || nx === O.endPath) continue; // clipping, not drawing
      const mm = a && a[2]; if (mm && mm.length === 4 && isFinite(mm[0]) && isFinite(mm[2])) add(mm[0], mm[1], mm[2], mm[3], true); } }
  if (!bx.length) return { area: 0, box: null };
  // coverage on a coarse grid (so overlapping elements aren't double counted), and the box around the covered cells
  const G = 40, cells = new Uint8Array(G * G);
  for (const b of bx) for (let y = Math.floor(b[1] * G); y < Math.min(G, Math.ceil(b[3] * G)); y++) for (let x = Math.floor(b[0] * G); x < Math.min(G, Math.ceil(b[2] * G)); x++) cells[y * G + x] = 1;
  // rows at the top and bottom with only a stray mark or two (a logo, a link box, a page header) are not the figure
  const rowN = y => { let k = 0; for (let x = 0; x < G; x++) k += cells[y * G + x]; return k; };
  let top = 0, bot = G - 1;
  const filled = []; for (let y = 0; y < G; y++) { const k = rowN(y); if (k) filled.push(k); }
  filled.sort((a, b) => a - b);
  const need = Math.max(3, Math.round(.25 * (filled[filled.length >> 1] || 0)));   // a quarter of a typical row of this figure
  while (top < bot && rowN(top) < need) top++;
  while (bot > top && rowN(bot) < need) bot--;
  if (top > 0 && rowN(top - 1)) top--; if (bot < G - 1 && rowN(bot + 1)) bot++;
  if (rowN(top) < need && top === bot) { top = 0; bot = G - 1; }   // nothing substantial anywhere: keep everything
  let n = 0, x0 = G, y0 = G, x1 = 0, y1 = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (cells[y * G + x]) { n++; if (y < top || y > bot) continue; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  // a little margin: panel letters and axis labels are text, not graphics, and sit just outside
  const box = { x: Math.max(0, x0 / G - .02), y: Math.max(0, y0 / G - .012), w: Math.min(1, (x1 - x0) / G + .04), h: Math.min(1, (y1 - y0) / G + .024) };
  box.w = Math.min(box.w, 1 - box.x); box.h = Math.min(box.h, 1 - box.y);
  return { area: n / (G * G), box: box.w * box.h > .03 ? box : null };
}
async function parsePdf(file, prog) {
  const lib = await ensurePdfJs(); prog(0);
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data, ...PDF_OPTS }).promise;
  prog(1);
  const lines = [], pageInfo = [], OPS = lib.OPS;
  const imgOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat, OPS.paintJpegXObject].filter(v => v !== undefined));
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let imgs = 0, paths = 0, g = { area: 0, box: null };
    try { const ol = await page.getOperatorList(); for (const fn of ol.fnArray) { if (imgOps.has(fn)) imgs++; else if (fn === OPS.constructPath) paths++; } g = graphicsOf(ol, page.getViewport({ scale: 1 }), OPS, imgOps); } catch {}
    let chars = 0, cur = null;
    // bold text, used to recognise run-in subheadings ("Sst-Chodl cells are long-range projecting INs")
    const boldOf = new Map(), isBold = fn => {
      if (!boldOf.has(fn)) { let b = false; try { if (page.commonObjs.has(fn)) { const f = page.commonObjs.get(fn); b = !!(f && (f.bold || /bold|black|heavy|semibold|demi/i.test(f.name || ""))); } } catch {} boldOf.set(fn, b); }
      return boldOf.get(fn);
    };
    const push = () => { if (cur && cur.text.trim()) { cur.text = cur.text.replace(/\s+/g, " ").trim(); cur.bold = cur.bc > .8 * cur.text.replace(/\s/g, "").length; lines.push(cur); chars += cur.text.length; } cur = null; };
    for (const it of tc.items) {
      if (typeof it.str !== "string") continue;
      if (Math.abs(it.transform[1]) > Math.abs(it.transform[0]) + .01) continue;   // rotated text: margin stamps and watermarks, not the paper
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
      // Superscripts and subscripts (citation numbers like ¹⁶⁻²⁵, gene names like Sst^flp, PC_mcMAO): smaller text set
      // just above or below the line, right after the previous word. They used to start a "line" of their own, which
      // split the sentence and got dropped. Keep them in the line: citation numbers as [16–25] (the reading mode
      // collapses these into a "refs" chip), anything else attached to the word it belongs to.
      if (cur && cur.text && it.str.trim() && h < .85 * cur.h && x > cur.xEnd - .6 * cur.h && x < cur.xEnd + 1.2 * cur.h) {
        const dy = y - cur.y;
        if ((dy > .12 * cur.h && dy < .9 * cur.h) || (dy < -.08 * cur.h && dy > -.6 * cur.h)) {
          const t = it.str.trim();
          if (dy > 0 && /^[\d,\u2013\u2014\u2212\-\s]+$/.test(t) && /\d/.test(t)) cur.text = cur.text.replace(/\s+$/, "") + "[" + t.replace(/\s+/g, "").replace(/[\u2014\u2212-]/g, "\u2013").replace(/,$/, "") + "]";
          else cur.text = cur.text.replace(/\s+$/, "") + t;
          cur.xEnd = Math.max(cur.xEnd, x + (it.width || 0));
          continue;
        }
      }
      if (cur && (Math.abs(y - cur.y) > Math.max(2, .55 * Math.min(h, cur.h)) || x < cur.xEnd - 4 * h)) push();
      if (!cur) cur = { text: "", x, y, h, xEnd: x, page: p, bc: 0 };
      if (it.fontName && isBold(it.fontName)) cur.bc += it.str.replace(/\s/g, "").length;
      if (cur.text && x > cur.xEnd + .18 * h && !/\s$/.test(cur.text)) cur.text += " ";
      cur.text += it.str; cur.xEnd = x + (it.width || 0); cur.h = Math.max(cur.h, h);
      if (it.hasEOL) push();
    }
    push();
    const vp1 = page.getViewport({ scale: 1 });
    pageInfo[p] = { imgs, paths, chars, gArea: g.area, gBox: g.box, W: vp1.width, H: vp1.height };
    if (p % 3 === 0) prog(1, `Page ${p} of ${doc.numPages}`);
  }
  prog(2);
  fixLigatures(lines);
  // drop running headers/footers
  const norm = t => t.replace(/\d+/g, "#").toLowerCase();
  const cnt = new Map();
  for (const l of lines) { const k = norm(l.text); if (!cnt.has(k)) cnt.set(k, new Set()); cnt.get(k).add(l.page); }
  const thr = Math.max(3, doc.numPages * .3);
  const CLUTTER = /downloaded from https?:|see the terms and conditions|wiley online library for rules of use|oa articles are governed by|applicable creative commons licen[cs]e|^\d{6,9}, \d{1,4}, downloaded|this article is protected by copyright|all rights reserved\.?$|^accepted article$/i;
  const kept = lines.filter(l => !CLUTTER.test(l.text) && !(l.text.length < 140 && cnt.get(norm(l.text)).size >= thr && !CAP_LABEL_ONLY.test(l.text) && !HEAD_RE.test(l.text)) && !/^\d{1,4}$/.test(l.text));
  const hs = kept.map(l => l.h).sort((a, b) => a - b); const medH = hs[Math.floor(hs.length / 2)] || 10;
  // title: biggest text on page 1
  const p1 = kept.filter(l => l.page === 1 && l.text.length > 3);
  const p1t = p1.filter(l => l.text.trim().split(/\s+/).length >= 3 && !/journal|^(article|research|original|review|report|letter)s?\b|www\.|doi|©|received/i.test(l.text));
  const maxH = Math.max(...(p1t.length ? p1t : p1).map(l => l.h), 0);
  const title = p1.filter(l => l.h >= maxH * .92 && !/journal|www\.|doi/i.test(l.text)).filter((l, i, a) => !(i === 0 && a.length > 1 && l.text.trim().split(/\s+/).length === 1)).slice(0, 7).map(l => l.text).join(" ").replace(/\s+/g, " ").slice(0, 300) || file.name.replace(/\.pdf$/i, "");
  // paragraphs
  // typical baseline-to-baseline distance (handles double-spaced preprints)
  const gaps = []; for (let i = 1; i < kept.length; i++) { const a = kept[i - 1], b = kept[i]; const g = a.y - b.y; if (a.page === b.page && g > .5 * medH && g < 4 * medH) gaps.push(g); }
  gaps.sort((a, b) => a - b); const medGap = gaps[Math.floor(gaps.length / 2)] || medH * 1.2;
  const paras = []; let cp = null;
  const startP = (l, kind) => { cp = { text: l.text, page: l.page, kind, h: l.h, x: l.x, y: l.y }; paras.push(cp); };
  for (let i = 0; i < kept.length; i++) {
    const l = kept[i], prev = kept[i - 1];
    if (HEAD_RE.test(l.text) && l.text.length < 60) { paras.push({ text: l.text, page: l.page, kind: "head" }); cp = null; continue; }
    if (CAP_RE.test(l.text)) { startP(l, "cap"); cp.labelOnly = CAP_LABEL_ONLY.test(l.text); continue; }
    const next = kept[i + 1];
    if (l.bold && l.text.length < 140 && /[A-Za-z]{3,}\S*\s+\S*[A-Za-z]{3,}/.test(l.text) && !/[.:;,]$/.test(l.text) && !(prev && prev.bold && prev.page === l.page) && !(next && next.bold)) {
      paras.push({ text: l.text, page: l.page, kind: "subhead" }); cp = null; continue;   // a heading on its own line
    }
    if (/^\d+(?:\.\d+){1,2}\.?\s+[A-Z]/.test(l.text) && l.text.length < 220 && !/[.]$/.test(l.text)) { paras.push({ text: l.text, page: l.page, kind: "sub" }); cp = null; continue; }
    if (!cp || !prev) { startP(l, "body"); continue; }
    let brk = false;
    if (cp.labelOnly) { cp.labelOnly = false; cp.h = l.h; cp.text += " " + l.text; continue; }
    if (l.page === prev.page) {
      const gap = prev.y - l.y;
      if (gap > Math.max(1.75 * Math.max(prev.h, medH), 1.45 * medGap)) brk = true;
      else if (gap > 0 && l.x - prev.x > .7 * l.h && l.x - prev.x < 4 * l.h && /[.!?)]$/.test(prev.text)) brk = true;
      else if (gap < -medH) brk = /[.:!?]["')\]]?$/.test(cp.text);
    } else brk = /[.:!?]["')\]]?$/.test(cp.text);
    if (Math.abs(l.h - cp.h) > .28 * cp.h) brk = true;
    if (brk) { startP(l, "body"); continue; }
    if (/[A-Za-z]-$/.test(cp.text) && /^[a-z]/.test(l.text)) cp.text = cp.text.slice(0, -1) + l.text; else cp.text += " " + l.text;
  }
  prog(3);
  // sections
  const sections = { intro: [], results: [], discussion: [], methods: [], other: [] };
  let abstract = "", sec = "front", sawHead = false; const front = []; const refList = [], heads = [];
  const captions = new Map();
  for (const p of paras) {
    if (p.kind === "head") { sec = secOf(p.text); sawHead = true; continue; }
    if (p.kind === "sub") continue;
    if (p.kind === "subhead") { if (sections[sec]) heads.push({ sec, i: sections[sec].length, text: p.text.trim() }); continue; }
    if (p.kind === "cap") {
      const n = +p.text.match(CAP_RE)[1];
      const prevCap = captions.get(n);
      if (!prevCap || p.text.length > prevCap.text.length) captions.set(n, { text: p.text.slice(0, 4000), page: p.page, x: p.x, y: p.y });
      continue;
    }
    const t = p.text.trim();
    // A numbered reference list without its own heading (Nature puts it straight after the main text): from
    // "1. Harris, K. D. & ..." on, with "2. Name, X." following, the rest is references until the next heading.
    if (sec !== "refs" && sec !== "methods" && !refList.length) {
      const m = /(?:^|\s)1\.\s+[A-Z][\p{L}'’\-]+,\s+(?:[A-Z]\.\s?){1,3}/u.exec(t);
      if (m && /\s2\.\s+[A-Z][\p{L}'’\-]+,\s+[A-Z]\./u.test(t.slice(m.index, m.index + 900))) {
        const before = t.slice(0, m.index).trim();
        if (before.length > 40 && sections[sec]) sections[sec].push(before);
        refList.push(t.slice(m.index).trim()); sec = "refs"; continue;
      }
    }
    if (sec === "refs") { if (t.length > 20) refList.push(t); continue; }   // kept for showing citations in reading mode
    // an appendix or supplementary legends inside a section: the rest of that section is "other text"
    if (/^(?:appendix|supplementary (?:information|materials?|figures?|data|methods)|extended data|supporting information)\b/i.test(t) && sec !== "front") {
      sec = "other"; const rest = t.replace(/^(?:appendix|supplementary (?:information|materials?|figures?|data|methods)|extended data|supporting information)\s*[:.\-–]?\s*/i, "");
      if (rest.length > 40) sections.other.push(rest);
      continue;
    }
    // author biographies (journals print them beside the introduction)
    if (/^\s*\d*\s*[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3}\s+(?:is|was|received|obtained|completed|holds|joined)\b/u.test(t) &&
        /\b(?:PhD|Ph\.D\.|doctoral|postdoc\w*|professor|bachelor\S*|master\S* degree|graduate student|research (?:interests?|focuses))\b/i.test(t.slice(0, 300))) continue;
    // labels from inside a figure ("Med. Lat. Int.", "Position Velocity *** Pos. Vel."): short, without ordinary words
    if (t.length < 80 && !/\b(?:the|of|and|in|to|was|were|we|is|are|a|an|for|with|that|this|by|on|as)\b/i.test(t)) continue;
    if (t.length < 130 && !/[.!?)]$/.test(t)) continue;
    if (sec === "abstract") { abstract += (abstract ? " " : "") + t; continue; }
    if (sec === "refs" || sec === "skip") continue;
    if (/^abbreviations?\s*:/i.test(t)) continue;
    // stray text from inside figures and tables (axis ticks, "Table 3 continued"), author and e-mail lines
    if (!/[.!?]["')\]\u201D]?$/.test(t) && ((t.match(/[\d\u2013\u2212%.,()\-]/g) || []).length > .25 * t.length || /@|\u2709|continued on next page/i.test(t))) continue;
    if (sec === "front") { if (t.length > 200 && new Set((t.match(META_RE) || []).map(x => x.toLowerCase())).size < 2) front.push(p); continue; }
    sections[sec].push(t);
  }
  // not the author list: names with affiliation numbers, envelope marks and e-mail addresses
  const authorish = t => /\u2709|@/.test(t) || (t.match(/\[\d[\d,\u2013]*\]/g) || []).length >= 3;
  if (!abstract) { const a = front.findIndex(p => p.text.length > 400 && p.page <= 2 && !authorish(p.text)); if (a >= 0) abstract = front.splice(a, 1)[0].text; }
  abstract = abstract.replace(/^\s*(?:abstract|summary)\s*[:.\-–]?\s+(?=[A-Z])/i, "");
  // Paragraphs cut where the PDF changes column or page: a piece that doesn't end a sentence, followed by one that
  // carries on in lower case (or after an open bracket or a comma), is one paragraph.
  for (const k of Object.keys(sections)) {
    const out = [], at = [], hs = new Set(heads.filter(h => h.sec === k).map(h => h.i));
    for (const [j, t] of sections[k].entries()) {
      const prev = hs.has(j) ? null : out[out.length - 1];   // never merge across a subheading
      at[j] = out.length;
      // a lone panel letter at the end ("... specifically in A") is a figure label that landed in the text
      if (prev && /\s[A-H]$/.test(prev) && !/[.!?:]["')\]\u201D\u2019]?$/.test(prev.slice(0, -2))) out[out.length - 1] = prev.slice(0, -2);
      const pv = prev ? out[out.length - 1] : null;
      if (pv && !/[.!?:]["')\]\u201D\u2019]?$/.test(pv) && (/^[a-z(\[,;\u2013]/.test(t) || /[(\[,;\u2013-]$/.test(pv) || /\s(?:in|of|the|and|to|with|from|by|for|at|on|as|or|a|an)$/i.test(pv))) {
        out[out.length - 1] = /[A-Za-z]-$/.test(pv) && /^[a-z]/.test(t) ? pv.slice(0, -1) + t : pv + " " + t;
        at[j] = out.length - 1;
      } else out.push(t);
    }
    heads.forEach(h => { if (h.sec === k) h.i = h.i < at.length ? at[h.i] : out.length; });
    sections[k] = out.map(t => t.replace(/\s+([.,;:)])/g, "$1").replace(/\(\s+/g, "("));
  }
  const frontText = front.map(p => p.text.trim());
  if (!sections.intro.length) sections.intro = frontText; else sections.other.push(...frontText);
  if (!sawHead && !sections.results.length) { sections.results = sections.other.splice(0); }
  // figures
  // Pick each figure's page: the caption page or a neighbour, whichever carries the most graphics.
  // Figures collected at the end of a document (preprints) are assigned in order.
  const figures = [];
  const ns = [...captions.keys()].sort((a, b) => a - b);
  const capPage = new Map(ns.map(n => [n, captions.get(n).page])), capPages = new Set(capPage.values());
  const gA = pg => (pageInfo[pg] || {}).gArea || 0, claimed = new Map(), pending = [];
  // two or more captions on one page that carries graphics: those figures share it, split by where their captions sit
  // a figure printed above its own caption: the figure box stops where the caption starts (graphics drawn behind or
  // around the caption, such as a background panel, would otherwise pull the caption text into the figure)
  const belowCaption = (n, pg, b) => {
    const c = captions.get(n), info = pageInfo[pg] || {};
    if (!b || !c || c.page !== pg || !info.H) return b;
    const top = 1 - (c.y + 10) / info.H;                       // top of the caption's first line, from the top of the page
    if (top > b.y + .2 && top < b.y + b.h) return { ...b, h: Math.max(.05, top - b.y - .004) };
    // a short figure whose box only reaches the caption through the margin added around it: stop above the caption
    if (top > b.y + .05 && top < b.y + b.h && top > b.y + b.h - .04) return { ...b, h: top - b.y - .004 };
    return b;
  };
  const byCap = new Map(); for (const n of ns) { const c = capPage.get(n); if (!byCap.has(c)) byCap.set(c, []); byCap.get(c).push(n); }
  const shared = new Map();
  for (const [pg, list] of byCap) {
    const info = pageInfo[pg] || {}; if (list.length < 2 || (info.gArea || 0) < .15 || !info.gBox) continue;
    const pos = list.map(n => { const c = captions.get(n); return { n, x: (c.x || 0) / (info.W || 1), y: 1 - (c.y || 0) / (info.H || 1) }; });
    const xs = pos.map(q => q.x), side = Math.max(...xs) - Math.min(...xs) > .3, b = info.gBox, k = list.length;
    pos.sort((a, b2) => side ? a.x - b2.x : a.y - b2.y).forEach((q, i) => shared.set(q.n, { page: pg, box: side ? { x: b.x + b.w * i / k, y: b.y, w: b.w / k, h: b.h } : { x: b.x, y: b.y + b.h * i / k, w: b.w, h: b.h / k } }));
    claimed.set(pg, k);
  }
  for (const n of ns) {
    if (shared.has(n)) { const sh = shared.get(n); figures.push({ n, legend: captions.get(n).text, pages: [sh.page], page: sh.page, panels: null, autoBox: sh.box }); continue; }
    const cap = capPage.get(n), cands = new Set([cap - 1, cap, cap + 1].filter(pg => pg >= 1 && pg <= doc.numPages));
    for (const l of kept) if (l.text.length < 24 && new RegExp(`^Fig(?:ure)?\\.?\\s*${n}\\b`, "i").test(l.text)) cands.add(l.page);
    // a small figure (one column) still belongs to its caption's page when its graphics end right above the caption
    // or start right below it
    const hugs = pg => {
      const c = captions.get(n), info = pageInfo[pg] || {}, b = info.gBox;
      if (!b || !info.H || gA(pg) < .03) return false;
      // ...unless a neighbouring page is a large figure without a caption of its own: the caption ran over from it
      if ([pg - 1, pg + 1].some(q => gA(q) >= .4 && !capPages.has(q) && !claimed.has(q))) return false;
      const top = 1 - (c.y + 10) / info.H;
      return Math.abs(top - (b.y + b.h)) < .07 || Math.abs(b.y - (top + .02)) < .07;
    };
    // the caption's own page wins when it carries a real graphic and is still free; otherwise the best free neighbour (previous page preferred)
    if (![...cands].some(pg => !claimed.has(pg) && (gA(pg) >= .15 || pg === cap && hugs(pg)))) [cap - 2, cap + 2].forEach(pg => { if (pg >= 1 && pg <= doc.numPages) cands.add(pg); });
    const score = pg => (pg === cap && (gA(pg) >= .15 || hugs(pg)) && !claimed.has(pg) ? 10 : 0) + gA(pg) - (pg !== cap && capPages.has(pg) ? .25 : 0) - (claimed.has(pg) ? 1 : 0) + (pg === cap - 1 ? .1 : 0) - Math.abs(pg - cap) * .02;
    const ranked = [...cands].sort((a, b) => score(b) - score(a));
    const fig = { n, legend: cap ? captions.get(n).text : "", pages: ranked, page: ranked[0], panels: null };
    if (gA(ranked[0]) < .06) pending.push(fig); else { claimed.set(ranked[0], (claimed.get(ranked[0]) || 0) + 1); fig.autoBox = belowCaption(n, ranked[0], (pageInfo[ranked[0]] || {}).gBox || null); }
    figures.push(fig);
  }
  if (pending.length) {
    const lastCap = Math.max(...capPages);
    const pool = []; for (let pg = 1; pg <= doc.numPages; pg++) { const i = pageInfo[pg] || {}; if (!claimed.has(pg) && (i.gArea || 0) > .2 && (i.chars || 0) < 1500 && pg > Math.min(...pending.map(f => capPage.get(f.n)))) pool.push(pg); }
    const after = pool.filter(pg => pg > lastCap), use = after.length >= pending.length ? after : pool;
    pending.forEach((f, k) => { if (use[k]) { f.page = use[k]; f.pages = [use[k], ...f.pages.filter(x => x !== use[k])]; f.autoBox = pageInfo[use[k]].gBox || null; } });
  }
  prog(4);
  return { id: `${file.name}:${file.size}`, title, sub: `${file.name} · ${doc.numPages} pages`, abstract, sections, figures, refList: refList.join(" ").slice(0, 200000), heads, doc };
}

