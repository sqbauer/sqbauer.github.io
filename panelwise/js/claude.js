"use strict";
/* ---------- Claude ---------- */
async function initClaude() {
  try {
    if (window.claude && window.claude.use) {
      const s = await window.claude.use("sample");
      S.sample = s || null;
      if (s) { try { const lim = await s.limits(); S.imagesOK = !!(lim && lim.images); } catch { S.imagesOK = false; } }
    }
  } catch { S.sample = null; }
  S.claudeChecked = true;
  render(); renderChat();
  const P = S.paper; if (P && !P.demo && !P.primer && S.sample) genPrimer();
}
// before a Claude request that writes into out: say why not, if Claude is off or there's no connection
function claudeReady(out, offlineToo) {
  if (!S.sample) { out.innerHTML = `<p class="note">${esc(NO_CLAUDE)}</p>`; return false; }
  if (!PW.online()) { out.innerHTML = `<p class="note">You're offline. Claude needs a connection${offlineToo ? "; " + esc(offlineToo) : ""}.</p>`; return false; }
  return true;
}
function claudeOff(e) {
  if (!e) return;
  if (e.code === "bad_key") {                          // a revoked or mistyped key: stop offering Claude until it's fixed
    if (S.sample) { S.sample = null; toast("Claude rejected your API key, so Claude is off. Check the key in Settings.", 7000); render(); if (typeof renderChat === "function") renderChat(); }
    return;
  }
  if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e.code)) { S.sample = null; render(); }
}

function cacheKey() { return "pw:" + (S.paper?.id || "none"); }
function saveCache() { persistPaper(S.paper); }

async function genPrimer(force) {
  const P = S.paper; if (!S.sample || P.primerBusy) return;
  P.primerBusy = true; P.primerErr = null; render();
  const intro = (P.sections.intro.join("\n\n") || P.sections.other.join("\n\n")).slice(0, 30000);
  const prompt = `You are helping a researcher understand a paper before they look at its figures. Using only the title, abstract and introduction below, reply with only this JSON:
{"field": "short phrase", "background": ["3-5 bullets on what was known, each under 30 words"], "gap": "what was unknown or contested, under 40 words", "goal": "what the authors set out to do, under 35 words", "coreQuestion": "the single core question, phrased as a question", "hypothesis": "their stated hypothesis or expectation, or null", "approach": "the approach in under 35 words", "keyTerms": [{"term": "...", "definition": "under 25 words"}]}
Give up to 6 key terms a reader outside the subfield would need. Be precise and plain.

TITLE: ${P.title}
ABSTRACT: ${P.abstract}
INTRODUCTION:
${intro}`;
  try {
    const j = await S.sample.json(prompt, { cache: force ? { gcTime: 86400000, refresh: true } : { gcTime: 86400000 } });
    if (!j || !Array.isArray(j.background)) throw { code: "invalid_json" };
    P.primer = j; persistPaper(P);
  } catch (e) { P.primerErr = errCopy(e); claudeOff(e); }
  P.primerBusy = false; render();
}
async function checkRestate() {
  const P = S.paper, txt = $("#restate").value.trim();
  if (!txt) { toast("Write the question in your own words first."); return; }
  P.restate = txt;
  if (!S.sample) { P.revealed = true; persistPaper(P); render(); return; }
  P.checkBusy = true; render();
  const ref = P.primer ? `Authors' goal: ${P.primer.goal}\nCore question: ${P.primer.coreQuestion}\nHypothesis: ${P.primer.hypothesis || "n/a"}` : "";
  const prompt = `A researcher read the introduction of a paper and wrote what they think its core question is. Judge whether they got it, as a rigorous but fair supervisor. Reply with only JSON: {"verdict": "match" | "partial" | "miss", "feedback": "2-3 sentences: what they got right and what is missing or off", "missing": "the key element they missed, or null"}

TITLE: ${P.title}
ABSTRACT: ${P.abstract}
${ref}
INTRODUCTION (excerpt):
${P.sections.intro.join("\n\n").slice(0, 12000)}

READER'S VERSION: ${txt}`;
  try { P.verdict = await S.sample.json(prompt, { cache: false }); P.revealed = true; }
  catch (e) { toast(errCopy(e)); claudeOff(e); }
  P.checkBusy = false; persistPaper(P); render();
}
async function genBrief(fig) {
  const P = S.paper; if (!S.sample) return;
  P.briefs = P.briefs || {}; fig.briefBusy = true; render();
  const paras = P.paras.filter(p => [...p.keys].some(k => parseInt(k) === fig.n)).map(p => p.text).join("\n\n").slice(0, 20000);
  const prompt = `You are a rigorous academic collaborator helping a researcher read Figure ${fig.n} of a paper. Reply with only JSON:
{"question": "the question this figure answers, one sentence", "claim": "the main claim the authors draw from it, one sentence", "read": [{"panel": "A", "what": "what to look at in this panel, under 18 words"}], "scrutinize": ["2-4 specific things to check: controls, n, statistics, confounds, alternative explanations"]}
Core question of the paper: ${P.primer?.coreQuestion || "(not given)"}
LEGEND: ${fig.legend}
TEXT CITING THIS FIGURE:
${paras}`;
  try { P.briefs[fig.n] = await S.sample.json(prompt, { cache: { gcTime: 86400000 } }); persistPaper(P); }
  catch (e) { toast(errCopy(e)); claudeOff(e); }
  fig.briefBusy = false; render();
}

/* figure location on a PDF page */
async function renderPage(pg, width = 1500) {
  const page = await S.paper.doc.getPage(pg);
  const vp0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp0.width });
  const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}
// rendered pages of the open paper: each is a ~1500 px canvas (about 12 MB), so keep only the last few
const pageCache = new Map(), PAGE_CACHE_MAX = 3;
async function pageCanvas(pg) {
  let p = pageCache.get(pg);
  if (p) { pageCache.delete(pg); pageCache.set(pg, p); return p; }                  // most recently used last
  p = renderPage(pg);
  p.catch(() => { if (pageCache.get(pg) === p) pageCache.delete(pg); });          // a failed render is tried again next time
  pageCache.set(pg, p);
  // drop the oldest; a caller still holding one keeps it until it's done (it is freed when no longer used)
  while (pageCache.size > PAGE_CACHE_MAX) pageCache.delete(pageCache.keys().next().value);
  return p;
}
function cropTo(canvas, b) {
  const x = Math.round(b.x * canvas.width), y = Math.round(b.y * canvas.height), w = Math.max(20, Math.round(b.w * canvas.width)), h = Math.max(20, Math.round(b.h * canvas.height));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c.toDataURL("image/jpeg", .92);
}
/* Panel detection, in two steps:
   1. find the figure on its page (whole page image, as before), trying up to three candidate pages;
   2. crop just the figure, render it larger, and ask only for the panel boxes.
   On a whole page shrunk to fit, panel letters are a few pixels tall and are easily missed or merged; on the
   cropped figure they are several times larger. If step 2 fails, the boxes from step 1 are used. */
async function renderRegion(pg, box, longSide = 1800) {
  const page = await S.paper.doc.getPage(pg);
  const v1 = page.getViewport({ scale: 1 });
  const rw = box.w * v1.width, rh = box.h * v1.height;
  const scale = Math.min(longSide / Math.max(rw, rh), 6);
  const c = document.createElement("canvas"); c.width = Math.max(20, Math.round(rw * scale)); c.height = Math.max(20, Math.round(rh * scale));
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale, offsetX: -box.x * v1.width * scale, offsetY: -box.y * v1.height * scale }) }).promise;
  try { page.cleanup(); } catch {}
  return c;
}
/* Claude's figure box sometimes stops a row of panels short (Ratliff 2026, Fig. 4: rows h and i left out). Below the box,
   the figure can only continue until the first line of running text or the caption ("Fig. 4 | …"), so: find that line
   in the page's text, then move the bottom edge down to the last drawn pixels above it, within the box's width. */
async function growDown(pg, box) {
  try {
    const page = await S.paper.doc.getPage(pg), v1 = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    const bottom = box.y + box.h; let stop = .94;   // .94: above the page footer
    for (const it of tc.items) {
      if (typeof it.str !== "string") continue;
      const t = it.str.trim(), x0 = it.transform[4] / v1.width, x1 = (it.transform[4] + (it.width || 0)) / v1.width, y = 1 - (it.transform[5] + Math.abs(it.transform[3] || 10)) / v1.height;
      if (y <= bottom || y >= stop) continue;
      if (/^(Fig(ure)?\.?|Extended Data Fig)\s*\d/i.test(t) || (t.length >= 40 && x1 > box.x && x0 < box.x + box.w)) stop = y;
    }
    const cv = await pageCanvas(pg), W = cv.width, H = cv.height;
    const x0 = Math.max(0, Math.round(box.x * W)), x1 = Math.min(W, Math.round((box.x + box.w) * W));
    const y0 = Math.round(bottom * H), y1 = Math.round(stop * H) - 2; if (y1 - y0 < 4 || x1 - x0 < 4) return box;
    const d = cv.getContext("2d", { willReadFrequently: true }).getImageData(x0, y0, x1 - x0, y1 - y0).data, rw = x1 - x0;
    let last = -1;
    for (let r = 0; r < y1 - y0; r++) {
      let ink = 0;
      for (let c = 0; c < rw; c += 2) { const i = (r * rw + c) * 4; if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) { ink++; if (ink > 2) break; } }
      if (ink > 2) last = r;
    }
    if (last < 0) return box;
    const nb = Math.min(1, (y0 + last + 1) / H + .006);
    return nb > bottom ? { ...box, h: nb - box.y } : box;
  } catch { return box; }
}
const toPanels = (list, map) => (list || []).filter(p => p && Array.isArray(p.box) && p.label).map(p => {
  const [x0, y0, x1, y1] = p.box.map(clamp01);
  const r = map(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  const px = Math.max(0, r.x), py = Math.max(0, r.y);
  return { label: String(p.label).trim().toUpperCase().slice(0, 2), x: px, y: py, w: Math.min(1 - px, r.w), h: Math.min(1 - py, r.h) };
}).filter(p => p.w > .02 && p.h > .02);
async function detectPanels(fig, redetect) {
  const labels = fig.letters.join(", ");
  const cache = redetect ? false : { gcTime: 86400000 };
  let det = null;
  for (const pg of fig.pages.slice(0, 3)) {
    const cv = await pageCanvas(pg);
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .88));
    const prompt = `This image is page ${pg} of a scientific paper. Locate Figure ${fig.n} on it.
Its legend begins: "${fig.legend.slice(0, 280).replace(/"/g, "'")}"
Panel labels expected from the legend: ${labels || "unknown"}.
Reply with only JSON: {"found": true, "figure": [x0, y0, x1, y1], "panels": [{"label": "A", "box": [x0, y0, x1, y1]}]}
Coordinates are fractions of the full page image: 0 = left/top edge, 1 = right/bottom edge. "figure" bounds the graphic only; exclude the legend paragraph, page header and body text. Give one box per lettered panel, covering that panel's plots and its letter. Panels should not overlap much. If Figure ${fig.n} is not drawn on this page, reply {"found": false}.`;
    let j;
    try { j = await S.sample.json(prompt, { images: [blob], cache }); }
    catch (e) { if (e.code === "images_unavailable") { S.imagesOK = false; return null; } throw e; }
    if (j && j.found && Array.isArray(j.figure)) { det = { page: pg, raw: j }; break; }
  }
  if (!det) return null;
  const [a, b, c, d] = det.raw.figure.map(clamp01);
  const pad = .008, fx = Math.max(0, Math.min(a, c) - pad), fy = Math.max(0, Math.min(b, d) - pad), fx1 = Math.min(1, Math.max(a, c) + pad), fy1 = Math.min(1, Math.max(b, d) + pad);
  const box = await growDown(det.page, { x: fx, y: fy, w: fx1 - fx, h: fy1 - fy });
  // step 1's boxes, mapped from page fractions to figure fractions: the fallback
  let panels = toPanels(det.raw.panels, (x, y, w, h) => ({ x: (x - fx) / box.w, y: (y - fy) / box.h, w: w / box.w, h: h / box.h }));
  // step 2: the figure on its own, larger
  let cv2 = null;
  try {
    cv2 = await renderRegion(det.page, box);
    const blob2 = await new Promise(r => cv2.toBlob(r, "image/jpeg", .9));
    const prompt2 = `This image is Figure ${fig.n} of a scientific paper, cropped from its page.
Its legend begins: "${fig.legend.slice(0, 400).replace(/"/g, "'")}"
Panel labels expected from the legend: ${labels || "unknown"}.
Find each lettered panel. Reply with only JSON: {"panels": [{"label": "A", "box": [x0, y0, x1, y1]}]}
Coordinates are fractions of this image: 0 = left/top edge, 1 = right/bottom edge. Each box covers one panel: its plots, axes, axis labels and its letter, but not neighbouring panels. Panels sit in a grid of rows and columns and may differ in size; boxes should not overlap much. Include every label you can see, using the letter exactly as printed. Sub-panels inside one lettered panel belong to that panel.`;
    const j2 = await S.sample.json(prompt2, { images: [blob2], cache });
    const fine = toPanels(j2 && j2.panels, (x, y, w, h) => ({ x, y, w, h }));
    if (fine.length >= Math.max(1, panels.length * .6)) panels = fine;
  } catch (e) {
    if (e && e.code && !["invalid_json", "refused"].includes(e.code)) throw e;   // network or key problems: report them
  } finally { if (cv2) cv2.width = cv2.height = 0; }
  return { page: det.page, box, panels, grown: 1 };
}
async function prepareFigure(fig, redetect) {
  const P = S.paper; if (P.demo || fig.busy || !P.doc) return;
  fig.busy = true; fig.err = null; render();
  try {
    if (!fig.det || redetect) {
      if (S.sample && S.imagesOK) {
        const det = await detectPanels(fig, redetect);
        if (det) fig.det = det;
        else if (!S.imagesOK) { fig.det = null; } else { fig.err = "Claude couldn't find this figure on its page; showing the full page."; }
      }
    }
    // boxes saved before growDown existed: extend them once, keeping the panel boxes where they were on the page
    if (fig.det && !fig.det.grown) {
      const b = fig.det.box, g = await growDown(fig.det.page, b), k = b.h / g.h;
      fig.det = { ...fig.det, box: g, grown: 1, panels: (fig.det.panels || []).map(q => ({ ...q, y: q.y * k, h: q.h * k })) };
    }
    const pg = fig.det?.page || fig.page;
    const cv = await pageCanvas(pg);
    if (fig.det) { fig.img = cropTo(cv, fig.det.box); fig.panels = fig.det.panels; fig.cropped = true; }
    else if (fig.autoBox) { fig.img = cropTo(cv, fig.autoBox); fig.panels = null; fig.cropped = true; }
    else { fig.img = cv.toDataURL("image/jpeg", .9); fig.panels = null; fig.cropped = false; }
    fig.letters = [...new Set([...fig.letters, ...(fig.panels || []).map(p => p.label)])].sort();
    persistPaper(P);
  } catch (e) { fig.err = errCopy(e); claudeOff(e); try { const cv = await pageCanvas(fig.page); fig.img = cv.toDataURL("image/jpeg", .9); } catch {} }
  fig.busy = false; render();
}

