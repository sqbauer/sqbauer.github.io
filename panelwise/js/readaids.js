"use strict";
/* Reading aids for reading mode (js/readmode.js): line focus, key sentences in bold, acronyms the paper never
   spells out, and the extra display settings. Everything here works on the rendered text, after the terms,
   citations and highlights have been drawn in, and never changes that text: only wraps parts of it. */

/* ---- sentences of a rendered paragraph, as character offsets into its text ---- */
function rmSents(p) {
  // split on a copy with the citation chips ("refs") blanked out, as the long press does
  let split = ""; const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; split += n.parentElement.closest(".rdm-cite") ? "#".repeat(n.nodeValue.length) : n.nodeValue; }
  const out = []; let from = 0;
  for (const part of splitSentences(split)) {
    const i = split.indexOf(part, from); if (i < 0) continue;
    out.push({ a: i, b: i + part.length }); from = i + part.length;
  }
  return out;
}
const rmClean = t => t.replace(/\s*refs(?=[\s.,;:)]|$)/g, "").replace(/\s+/g, " ").trim();

/* ---- display settings beyond size, spacing and theme ---- */
const RM_FONTS = [["serif", "Serif", 'var(--f-read)'], ["sans", "Sans", 'var(--f-ui)'], ["verdana", "Verdana", 'Verdana,"Avenir Next",sans-serif']];
const RM_MARGINS = [["12", "Narrow"], ["20", "Normal"], ["32", "Wide"]];
const rmOn = k => rmPref(k, "0") === "1";
function rmMargin() { const m = +rmPref("margin", "20"); return RM_MARGINS.some(([v]) => +v === m) ? m : 20; }
function rmApplyAids() {
  const f = RM_FONTS.find(x => x[0] === rmPref("font", "serif")) || RM_FONTS[0];
  RM.flow.style.fontFamily = f[2];
  const wide = rmOn("ls");
  RM.flow.style.letterSpacing = wide ? ".035em" : ""; RM.flow.style.wordSpacing = wide ? ".12em" : "";
  RM.flow.style.textAlign = rmPref("align", "left") === "justify" ? "justify" : "";
  const fm = rmPref("focus", "0");                       // "0" off, "1" sentence by sentence, "line" line by line
  RM.lineMode = fm === "line" || fm === "word"; RM.wordMode = fm === "word"; RM.focusOn = fm !== "0";   // word: the line guide marks the place
  RM.el.classList.toggle("focus", fm === "1"); RM.el.classList.toggle("lfocus", RM.lineMode);
  RM.el.classList.toggle("spell", rmOn("spell"));
}
// Display sheet groups (js/readmode.js rmShowLook): seg(k, options, current) is a segmented control, row(label, control, note) a labelled row
function rmAidsTypeHTML(seg, row, lineHeight) {
  return row("Typeface", seg("font", RM_FONTS.map(([v, l]) => [v, l]), rmPref("font", "serif")))
    + (lineHeight || "")
    + row("Margins", seg("margin", RM_MARGINS, String(rmMargin())))
    + row("Letter spacing", seg("ls", [["0", "Normal"], ["1", "Wide"]], rmOn("ls") ? "1" : "0"))
    + row("Alignment", seg("align", [["left", "Left"], ["justify", "Justified"]], rmPref("align", "left")));
}
function rmAidsGuideHTML(seg, row) {
  const onoff = k => seg(k, [["0", "Off"], ["1", "On"]], rmOn(k) ? "1" : "0");
  const keysNote = rmOn("keys") ? rmKeysNote() : "";
  return row("Guide", seg("focus", [["0", "Off"], ["1", "Sentence"], ["line", "Line"], ["word", "Word"]], ["1", "line", "word"].includes(rmPref("focus", "0")) ? rmPref("focus", "0") : "0"),
      `Sentence and Line highlight where you are and dim the rest: tap to move on, the left edge to go back. Word shows the text one word at a time from the highlighted line: tap the page to start${matchMedia("(hover:hover)").matches ? ". On a keyboard: the arrow keys or the space bar" : ""}.`)
    + rmWordsWpmHTML(seg, row)
    + row("Key sentences in bold", onoff("keys"), `Claude picks the sentence that carries each paragraph's point, once per paper.${keysNote ? " " + keysNote : ""}`)
    + row("Spell out abbreviations", onoff("spell"), "Shows the full name after an abbreviation the first time it appears in each section.");
}
// a setting changed in the Display sheet: those that change the layout lay the text out again, keeping the place
function rmAidPref(k, v) {
  rmSetPref(k, v);
  const at = RM.pages > 1 ? RM.page / (RM.pages - 1) : 0;
  rmApplyLook(); rmRender(at);
  if (k === "keys" && v === "1") rmKeysMaybe();
  rmShowLook();
}

/* ---- line focus: one sentence bright, the rest dimmed; taps move sentence by sentence ---- */
function rmFocusWrap() {
  RM.sents = []; RM.fs = -1;
  if (!RM.focusOn || RM.lineMode) return;
  for (const p of RM.flow.querySelectorAll("p")) {
    if (p.closest(".rdm-more")) continue;
    for (const s of rmSents(p)) {
      const spans = rmWrap(p, s.a, s.b, () => { const e = document.createElement("span"); e.className = "rdm-s"; return e; });
      if (spans.length) RM.sents.push({ spans, start: 0, end: 0 });
    }
  }
}
function rmFocusPages() {            // which page each sentence starts and ends on (after every layout)
  if (RM.lineMode) { rmLines(); return; }
  if (!RM.focusOn || !RM.sents) return;
  const left = RM.flow.getBoundingClientRect().left;
  const pg = r => Math.max(0, Math.min(RM.pages - 1, Math.floor((r.left - left) / RM.step)));
  for (const s of RM.sents) {
    const a = s.spans[0].getClientRects(), z = s.spans[s.spans.length - 1].getClientRects();
    s.start = a.length ? pg(a[0]) : 0; s.end = z.length ? pg(z[z.length - 1]) : s.start;
  }
}
function rmFocusSet(i) {
  const old = RM.sents[RM.fs]; if (old) old.spans.forEach(x => x.classList.remove("cur"));
  RM.fs = i; const s = RM.sents[i]; if (s) s.spans.forEach(x => x.classList.add("cur"));
}
function rmFocusSync(p) {            // after a page turn by swipe, scrubber or contents: focus the first sentence shown
  if (RM.lineMode) { rmLineSync(p); return; }
  if (!RM.focusOn || RM.fsLock || !RM.sents || !RM.sents.length) return;
  const s = RM.sents[RM.fs]; if (s && s.start <= p && s.end >= p) return;
  const i = RM.sents.findIndex(x => x.end >= p); rmFocusSet(i < 0 ? RM.sents.length - 1 : i);
}
function rmFocusStep(d) {
  if (RM.wordMode && d > 0) { rmRsvpOpen(); return; }
  if (RM.lineMode) { rmLineStep(d); return; }
  const s = RM.sents && RM.sents[RM.fs];
  if (!s) { rmGo(RM.page + d); return; }
  const go = p => { RM.fsLock = true; try { rmGo(p); } finally { RM.fsLock = false; } };
  if (d > 0 && s.end > RM.page) { go(RM.page + 1); return; }      // the sentence goes on overleaf: show the rest first
  const n = RM.fs + d;
  if (n < 0 || n >= RM.sents.length) { rmGo(RM.page + d); return; }
  rmFocusSet(n);
  const t = RM.sents[n];
  if (t.start > RM.page || t.end < RM.page) go(d > 0 ? t.start : t.end);
}

/* ---- line guide: one printed line highlighted (headings included), the rest dimmed; taps move line by line (like Books).
   Lines exist only after layout, so they are measured from the laid-out text (every layout) and a band
   is moved over them: the text itself is never wrapped or changed. ---- */
function rmLines() {
  const vp = RM.vp, vr = vp.getBoundingClientRect(), left = RM.flow.getBoundingClientRect().left, sl = vp.scrollLeft + rmSlideX();
  const rects = [];
  for (const p of RM.flow.querySelectorAll("p, li, h2, h3, h4")) {
    if (p.closest(".rdm-more, .rdm-figcard")) continue;
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), rg = document.createRange();
    while (w.nextNode()) {
      const n = w.currentNode; if (!n.nodeValue.trim()) continue;
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 1 && r.height > 4) rects.push(r);
    }
  }
  // one line: the text fragments on the same page that overlap vertically (a superscript just widens it)
  const lines = [], byPage = new Map();                    // lines per page: a fragment is only compared with its own page's
  rects.sort((a, b) => a.left - b.left);
  for (const r of rects) {
    const page = Math.max(0, Math.min(RM.pages - 1, Math.floor((r.left - left + 1) / RM.step)));
    const mid = (r.top + r.bottom) / 2;
    let pl = byPage.get(page); if (!pl) byPage.set(page, pl = []);
    const L = pl.find(l => mid > l.top && mid < l.bottom && r.left - l.right < 60);
    if (L) { L.left = Math.min(L.left, r.left); L.right = Math.max(L.right, r.right); if (r.height <= L.h * 1.1) { L.top = Math.min(L.top, r.top); L.bottom = Math.max(L.bottom, r.bottom); L.h = Math.max(L.h, r.height); } }
    else { const l = { page, left: r.left, right: r.right, top: r.top, bottom: r.bottom, h: r.height }; lines.push(l); pl.push(l); }
  }
  lines.sort((a, b) => a.page - b.page || a.top - b.top);   // one column per page
  RM.lines = lines.map(l => ({ page: l.page, x: l.left - vr.left + sl, y: l.top - vr.top, w: l.right - l.left, h: l.bottom - l.top }));
  if (!RM.band) { RM.band = document.createElement("div"); RM.band.className = "rdm-band"; RM.band.setAttribute("aria-hidden", "true"); }
  if (RM.band.parentNode !== vp) vp.appendChild(RM.band);
  RM.ln = -1;
  if (RM.lines.length) {                                  // the layout keeps the page: start at its first line
    const i = RM.lines.findIndex(l => l.page >= RM.page);
    rmLineSet(i < 0 ? RM.lines.length - 1 : i, true);
  } else RM.band.hidden = true;
}
function rmLineSet(i, quiet) {
  const l = RM.lines && RM.lines[i]; if (!l || !RM.band) return;
  RM.ln = i; const pad = Math.max(3, Math.round(l.h * .18));
  RM.band.hidden = false;
  RM.band.classList.toggle("quiet", !!quiet);           // no slide when it jumps (layout, page turn by swipe)
  RM.band.dataset.x = l.x - 8; RM.band.style.transition = "";   // line to line: the CSS animation
  Object.assign(RM.band.style, { left: (l.x - 8 - rmSlideX()) + "px", top: (l.y - pad) + "px", width: (l.w + 16) + "px", height: (l.h + 2 * pad) + "px" });
}
function rmLineSync(p) {
  if (RM.fsLock || !RM.lines || !RM.lines.length) return;
  const l = RM.lines[RM.ln]; if (l && l.page === p) return;
  const i = RM.lines.findIndex(x => x.page >= p); rmLineSet(i < 0 ? RM.lines.length - 1 : i, true);
}
function rmLineStep(d) {
  if (!RM.lines || !RM.lines.length || RM.ln < 0) { rmGo(RM.page + d); return; }
  const n = RM.ln + d;
  if (n < 0 || n >= RM.lines.length) { rmGo(RM.page + d); return; }
  const t = RM.lines[n];
  if (t.page !== RM.page) { RM.fsLock = true; try { rmGo(t.page); } finally { RM.fsLock = false; } rmLineSet(n, true); return; }
  rmLineSet(n);
}

/* ---- key sentences: Claude picks the sentence carrying each paragraph's point; kept with the reading state ---- */
function rmKeysKey() { return "pwread:key:" + RM.paperId; }
function rmKeys() { try { const o = JSON.parse(localStorage.getItem(rmKeysKey()) || "null"); return o && o.k; } catch { return null; } }
function rmKeysNote() {
  const P = S.paper;
  if (P && P.demo) return "Not for the example paper.";
  if (RM.keysBusy === RM.paperId) return "Claude is picking them now…";
  if (RM.paperId && rmKeys()) return "Done for this paper.";
  if (!S.sample) return "Needs your API key in Settings.";
  return "";
}
function rmApplyKeys() {
  if (!rmOn("keys") || !RM.paperId) return;
  const K = rmKeys(); if (!K) return;
  for (const p of RM.flow.querySelectorAll("p[data-k]")) {
    const picks = K[p.dataset.k]; if (!picks || !picks.length) continue;
    const text = p.textContent, sents = rmSents(p);
    const tag = s => rmClean(text.slice(s.a, s.b)).slice(0, 24);
    for (const k of picks) {
      // the sentence by its number, checked against its first words (the text clean-up may change between versions)
      const s = sents[k.i] && tag(sents[k.i]) === k.f ? sents[k.i] : sents.find(x => tag(x) === k.f);
      if (s) rmWrap(p, s.a, s.b, () => { const e = document.createElement("span"); e.className = "rdm-key"; return e; });
    }
  }
}
async function rmKeysMaybe() {
  const P = S.paper, id = RM.paperId;
  if (!rmOn("keys") || !P || P.demo || !id || rmKeys() || RM.keysBusy === id) return;
  if (!S.sample) { toast("Key sentences need your API key in Settings."); return; }
  if (!PW.online()) { toast("You're offline. Claude picks the key sentences once you're back online."); return; }
  const paras = [...RM.flow.querySelectorAll("p[data-k]")].filter(p => !/^methods:/.test(p.dataset.k));
  const rows = []; let size = 0;
  for (const p of paras) {
    const text = p.textContent, sents = rmSents(p).map(s => rmClean(text.slice(s.a, s.b))).filter(Boolean);
    if (!sents.length) continue;
    const line = `P${rows.length}: ` + sents.map((s, i) => `[${i}] ${s}`).join(" ");
    if (size + line.length > 90000) break;
    size += line.length; rows.push({ k: p.dataset.k, sents, line });
  }
  if (!rows.length) return;
  RM.keysBusy = id; toast("Claude is picking the key sentences…");
  if (RM.sheetKind === "look" && !RM.sheet.hidden) rmShowLook();
  const prompt = `A researcher reads this scientific paper on their phone. To help them skim, the sentence that carries each paragraph's main point will be shown in bold. For each paragraph below, pick that sentence: a finding, claim or conclusion a skimming reader should not miss. Pick two only when a paragraph of six or more sentences makes two separate points. Give [] for a paragraph that is only background detail, procedure or a transition. Sentences are numbered [0], [1], ... within each paragraph.
Reply with only JSON mapping each paragraph to the chosen sentence numbers, e.g. {"P0": [1], "P1": [], "P2": [0, 4]}.
Paper: ${P.title || ""}

${rows.map(r => r.line).join("\n")}`;
  try {
    const j = await S.sample.json(prompt, { maxTokens: Math.min(8000, 400 + rows.length * 12), cache: { gcTime: 864e5 * 30 } });
    const k = {};
    rows.forEach((r, i) => {
      const v = j && Array.isArray(j["P" + i]) ? j["P" + i] : [];
      const picks = [...new Set(v.map(Number))].filter(n => Number.isInteger(n) && n >= 0 && n < r.sents.length).slice(0, 2);
      if (picks.length) k[r.k] = picks.map(n => ({ i: n, f: r.sents[n].slice(0, 24) }));
    });
    if (!Object.keys(k).length) throw { code: "invalid_json" };
    try { localStorage.setItem("pwread:key:" + id, JSON.stringify({ t: Date.now(), k })); } catch {}
    RM.keysBusy = null;
    if (RM.paperId === id && !RM.el.hidden) { rmRender(); toast("Key sentences are in bold"); }
  } catch (e) {
    RM.keysBusy = null;
    toast(typeof errCopy === "function" ? errCopy(e) : "Couldn't reach Claude.");
  }
  if (RM.sheetKind === "look" && !RM.sheet.hidden) rmShowLook();
}

/* ---- abbreviations the paper uses but never spells out: listed, and explained by Claude on request ---- */
const RM_NOT_ABBR = /^(?:[IVXLC]+|[A-Z]\d?|AND|OR|NOT|THE|FOR|ALL|NEW|USA|UK|EU|KEY|STAR|TABLE|LEAD|DATA|CODE|NOTE|FIGURE|SOURCE|RESULTS|METHODS|MATLAB)$/;
function rmUndefined(text, known) {
  const n = new Map(); let m; const re = /(?<![\p{L}\p{N}\-])([A-Z][A-Z0-9]*[A-Z][A-Z0-9]*)(?:s)?(?![\p{L}\p{N}\-])/gu;
  while ((m = re.exec(text))) {
    const w = m[1];
    if (w.length < 2 || w.length > 7 || RM_NOT_ABBR.test(w) || /^[A-Z]\d+[A-Z]?$/.test(w) || known.has(w.toLowerCase())) continue;   // "A1E": a figure panel
    n.set(w, (n.get(w) || 0) + 1);
  }
  return [...n].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w]) => w);
}
function rmAbbrCache(pid = RM.paperId) { try { return JSON.parse(localStorage.getItem("pwread:abbr:" + pid) || "null") || {}; } catch { return {}; } }
async function rmAskAbbr(gi) {
  const out = $("#rmExplain"), P = S.paper, pid = RM.paperId; if (!out || !P) return;
  if (!claudeReady(out)) return;
  const list = RM.gloss.filter(g => g.undef && !g.def);
  if (!list.length) return;
  out.innerHTML = `<div class="thinking"><span class="dot"></span>Claude is looking up ${list.length} abbreviation${list.length > 1 ? "s" : ""} in this paper…</div>`;
  // a sentence where each one is used, so Claude reads it in context
  const ctx = w => { const i = RM.allText.search(new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u")); return i < 0 ? "" : RM.allText.slice(Math.max(0, i - 120), i + 120).replace(/\s+/g, " "); };
  const prompt = `These abbreviations appear in a scientific paper but the paper never spells them out. For each, give the full form as used in this field, and one short plain sentence on what it is. If you are not sure in this context, say so in the sentence.
Reply with only JSON: {"ABBR": {"full": "...", "what": "..."}, ...}
Paper: ${P.title || ""}
${list.map(g => `${g.word}: …${ctx(g.word)}…`).join("\n")}`;
  try {
    const j = await S.sample.json(prompt, { maxTokens: 300 + list.length * 60, cache: { gcTime: 864e5 * 30 } });
    const cache = rmAbbrCache(pid);
    for (const g of list) { const v = j && j[g.word]; if (v && typeof v.full === "string") cache[g.word] = { full: v.full.trim(), what: String(v.what || "").trim() }; }
    try { localStorage.setItem("pwread:abbr:" + pid, JSON.stringify(cache)); } catch {}
    if (RM.paperId !== pid) return;                   // another paper is open now: saved for when this one is back
    for (const g of RM.gloss) if (g.undef && cache[g.word]) { g.def = cache[g.word].full; g.what = cache[g.word].what; }
    rmShowTerm(gi);
  } catch (e) {
    const o = $("#rmExplain"); if (o) o.innerHTML = `<p class="note">${esc(typeof errCopy === "function" ? errCopy(e) : "Couldn't reach Claude.")}</p>`;
  }
}
// all abbreviations in the paper, for the Contents sheet
function rmAbbrListHTML() {
  const list = (RM.gloss || []).map((g, i) => ({ g, i })).filter(x => x.g.abbr).sort((a, b) => a.g.word.localeCompare(b.g.word));
  if (!list.length) return "";
  return `<h3 class="rdm-toc-h">Abbreviations <span>${list.length}</span></h3>` + list.map(({ g, i }, n) =>
    `<button type="button" class="rdm-toc-i sub rdm-abbr${n >= 12 ? " rdm-more-abbr" : ""}" data-sheet="reg-open" data-v="${i}"${n >= 12 ? " hidden" : ""}><span><strong>${esc(g.word)}</strong> ${g.def ? esc(g.def) : `<span class="muted">not spelled out in the paper</span>`}</span><span class="pg">›</span></button>`).join("")
    + (list.length > 12 ? `<button type="button" class="rdm-btn rdm-sumbtn" data-sheet="abbr-all">Show all ${list.length}</button>` : "");
}

/* everything above that draws into the text, in order; called after the text, terms and highlights are in */
function rmAids() { rmWordsReset(); rmApplyKeys(); rmFocusWrap(); }
