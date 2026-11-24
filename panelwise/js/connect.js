"use strict";
/* ---------- connections between your papers ----------
   - a reference that is also a paper in your library gets an "Open" link in the citation sheet
   - each paper lists related papers in your library: ones it cites, ones citing it, ones on the same brain regions
     or topics
   - one search box looks inside every paper's text
   It all runs on the text the phone already keeps for each paper (the "_text" cache). A small index per paper
   (its reference list and the brain regions it names) lives in "_index": derived data, rebuilt when needed,
   not part of backups. Papers never opened are read in the background when you ask for it. */

const IX_COL = "_index", IX_VER = 2;   // 2: the wiki's terms (wikicore.js)
const IX = { map: new Map(), loaded: null, busy: false, queue: [], status: "", noText: new Set() };

/* ---- the library's papers, with what a reference to them would contain ---- */
function ixPapers() {
  return buildGroups().map(g => {
    const r = recOf(g.id) || {};
    const au = (g.authors && g.authors.length ? g.authors : r.authors) || [];
    const sur = s => String(s || "").trim().split(/\s+/).pop().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const title = g.title || r.title || "";
    const tn = normTitle(title);
    return { g, id: g.id, title: title || guessFromName(g.name).label, tn, tkey: tn.split(" ").slice(0, 7).join(" "), first: sur(au[0]), second: sur(au[1]), year: String(g.year || r.year || ""),
      label: (au.length ? sur(au[0]).replace(/^./, c => c.toUpperCase()) + (au.length > 2 ? " et al." : au.length === 2 ? " & " + sur(au[1]).replace(/^./, c => c.toUpperCase()) : "") : "") + (g.year || r.year ? " " + (g.year || r.year) : ""), tags: (r.tags || []).map(t => t.toLowerCase()) };
  });
}
const ixNorm = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* does this reference text (one entry, or a whole reference list) mention library paper L? */
function ixCites(refNorm, L) {
  if (!refNorm || !L) return false;
  if (L.tkey.length >= 28 && refNorm.includes(L.tkey)) return true;          // the title (most styles print it)
  if (!L.first || L.first.length < 3 || !/^\d{4}$/.test(L.year)) return false;
  // first author and year close together, and the second author too when there is one (styles without titles)
  let at = refNorm.indexOf(L.first + " ");
  while (at >= 0) {
    const win = refNorm.slice(at, at + 260);
    if (win.includes(L.year) && (!L.second || L.second.length < 3 || win.includes(L.second))) return true;
    at = refNorm.indexOf(L.first + " ", at + 1);
  }
  return false;
}
/* the library paper a single reference entry points to */
function ixMatchRef(entry) {
  const n = ixNorm(entry); if (n.length < 20) return null;
  const S_ = S.paper ? S.paper.id : null;
  return ixPapers().find(L => L.id !== S_ && ixCites(n, L)) || null;
}

/* ---- per-paper index ---- */
async function ixLoad() {
  if (!IX.loaded) IX.loaded = (async () => { try { for (const { id, data } of await PW.be.all(IX_COL)) if (data && data.v === IX_VER) IX.map.set(id, data); } catch {} })();
  return IX.loaded;
}
function ixRegions(raw) {
  // brain regions named in the text, by how often: one pass with all region names (needs the atlas index)
  if (typeof atlasTerms !== "function" || !ATL.idx) return {};
  const text = [raw.abstract || "", ...Object.entries(raw.sections || {}).filter(([k]) => k !== "methods").flatMap(([, v]) => v)].join(" ");
  if (!IX.reCI) {
    const esc_ = w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), terms = atlasTerms().slice().sort((a, b) => b.word.length - a.word.length);
    IX.byCI = new Map(terms.filter(e => e.ci).map(e => [e.word.toLowerCase(), e]));
    IX.byCS = new Map(terms.filter(e => !e.ci).map(e => [e.word, e]));
    IX.reCI = new RegExp(`(?<![\\p{L}\\p{N}])(${[...IX.byCI.values()].map(e => esc_(e.word)).join("|")})(?![\\p{L}\\p{N}])`, "giu");
    IX.reCS = new RegExp(`(?<![\\p{L}\\p{N}])(${[...IX.byCS.values()].map(e => esc_(e.word)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  }
  const out = {};
  for (const [re, get] of [[IX.reCI, w => IX.byCI.get(w.toLowerCase())], [IX.reCS, w => IX.byCS.get(w)]]) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) { const e = get(m[1]); if (e) for (const id of e.ids) out[id] = (out[id] || 0) + 1; }
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25));
}
async function pwIndexPaper(id, raw) {
  if (!id || !raw) return;
  try {
    if (typeof atlasLoad === "function") await atlasLoad();
    // the reference list, or (when none was recognised) the whole text: in author-year styles the in-text citations
    // ("Dean et al., 2010") show what a paper cites just as well
    const refText = (raw.refList || "").length > 2000 ? raw.refList : [raw.refList || "", ...Object.values(raw.sections || {}).flat()].join(" ");
    const d = { v: IX_VER, updated: Date.now(), refs: ixNorm(refText).slice(0, 150000), regions: ixRegions(raw), wiki: typeof wkExtract === "function" ? wkExtract(raw) : null };
    if (typeof WKI !== "undefined") WKI.agg = null;           // the wiki gathers again next time
    IX.map.set(id, d);
    await PW.be.put(IX_COL, id, d);
  } catch (e) { console.warn("index failed", e && e.message); }
}
/* papers that aren't indexed yet; with read=true also those whose text was never read (slow: reads the PDF) */
async function ixFill(read, onStep) {
  await ixLoad();
  if (IX.busy) return; IX.busy = true;
  try {
    const todo = ixPapers().filter(L => L.g.file && !IX.map.has(L.id));
    let k = 0;
    for (const L of todo) {
      const file = fileForGroup(L.g); if (!file) continue;
      let raw = null; const key = pwTextKey(file);
      if (!read && IX.noText.has(key)) { k++; continue; }            // asked before this session: not read yet
      try { raw = await PW.be.get(PW_TEXT_COL, key); } catch {}
      if (!raw) IX.noText.add(key);
      if (!raw && read) { try { raw = await pwPaperText(file); } catch {} }
      if (raw) await pwIndexPaper(L.id, raw);
      k++; if (onStep) onStep(k, todo.length);
    }
  } finally { IX.busy = false; }
}
/* papers to index in the background: one at a time with a pause between, so the screen stays responsive */
function ixLater(id, raw) {
  if (IX.queue.some(q => q.id === id)) return;
  IX.queue.push({ id, raw });
  if (!IX.draining) ixDrain();
}
async function ixDrain() {
  IX.draining = true;
  try {
    while (IX.queue.length) {
      const { id, raw } = IX.queue.shift();
      if (!IX.map.has(id)) await pwIndexPaper(id, raw);
      await new Promise(r => setTimeout(r, 40));
    }
  } finally { IX.draining = false; }
}
function ixMissing() { return ixPapers().filter(L => L.g.file && !IX.map.has(L.id)).length; }

/* ---- related papers ---- */
async function ixRelated(P) {
  await ixFill(false);
  const lib = ixPapers(), me = lib.find(L => L.id === P.id);
  const myRefs = (P.refList || "").length > 2000 ? ixNorm(P.refList) : (IX.map.get(P.id) || {}).refs || ixNorm([P.refList || "", ...Object.values(P.sections || {}).flat()].join(" "));
  const myRegs = (IX.map.get(P.id) || {}).regions || {};
  const myTags = new Set(((recOf(P.id) || {}).tags || P.tags || []).map(t => t.toLowerCase()));
  const out = [];
  for (const L of lib) {
    if (L.id === P.id) continue;
    const why = []; let score = 0;
    if (ixCites(myRefs, L)) { why.push("cited here"); score += 3; }
    const theirs = IX.map.get(L.id);
    if (me && theirs && ixCites(theirs.refs, me)) { why.push("cites this paper"); score += 3; }
    if (theirs) {
      const shared = Object.keys(myRegs).filter(id => theirs.regions[id]).sort((a, b) => (myRegs[b] + theirs.regions[b]) - (myRegs[a] + theirs.regions[a]));
      // the region that sits highest in the hierarchy says little ("Cerebellum" in two cerebellum papers): weigh by specificity
      const specific = shared.filter(id => { const s = atlasS(+id); return s && !["CB", "grey", "root", "BS", "CH", "CTX", "MB", "HB", "P", "MY", "Isocortex", "CBX", "CBN", "HEM", "VERM", "TH", "HY"].includes(s.a); });
      if (specific.length) { why.push(specific.slice(0, 3).map(id => atlasS(+id).n.replace(/,.*$/, "")).join(", ")); score += Math.min(3, specific.length); }
    }
    const tagHit = L.tags.filter(t => myTags.has(t));
    if (tagHit.length) { why.push("topic: " + tagHit.join(", ")); score += 1; }
    if (score) out.push({ L, why, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}

/* ---- open a library paper, optionally at a quoted sentence ---- */
async function ixOpen(L, quote, onBack) {
  const file = fileForGroup(L.g); if (!file) { toast("This paper isn't in your Papers folder."); return; }
  if (typeof rmClose === "function" && RM.el && !RM.el.hidden) { RM.onClose = null; rmClose(); }
  if (!S.paper || S.paper.id !== L.id) await handleFile(file, L.id);
  if (!S.paper || S.paper.id !== L.id) return;
  await rmOpen(); RM.onClose = onBack || null;
  const q = (quote || "").trim(); if (!q) return;
  if (ixFindQuote(q)) return;
  // the quote may be in the Methods, which reading mode hides until asked
  if (!RM.showMethods && RM.flow.querySelector('[data-rm="methods"]')) {
    RM.showMethods = true; rmRender(null);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    ixFindQuote(q);
  }
}
function ixFindQuote(q) {
  for (const probe of [q, q.split(/\s+/).slice(0, 6).join(" ")]) {
    const el = [...RM.flow.querySelectorAll("p, h3, h4")].find(p => p.textContent.toLowerCase().includes(probe.toLowerCase()));
    if (!el) continue;
    const at = el.textContent.toLowerCase().indexOf(probe.toLowerCase());
    const r = rmTextRange(el, at, at + probe.length); if (!r) continue;
    const rect = r.getClientRects()[0] || r.getBoundingClientRect();
    rmGo(Math.max(0, Math.floor((rect.left - RM.flow.getBoundingClientRect().left) / RM.step)), true); rmSave();
    rmFlash(rmWrap(el, at, at + probe.length, () => { const m = document.createElement("mark"); m.className = "rdm-found"; return m; }));
    return true;
  }
  return false;
}

/* ---- search inside every paper ---- */
// "climbing fibre" also finds "climbing fiber" (and colour/color, behaviour/behavior, centre/center, -ise/-ize)
function lsPattern(q) {
  return q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
    .replace(/fib(?:re|er)/gi, "fib(?:re|er)").replace(/cent(?:re|er)/gi, "cent(?:re|er)")
    .replace(/(colo|behavio|favo|humo|tumo)u?r/gi, "$1u?r").replace(/([a-z]{3,})i[sz](e|ed|es|ing|ation)\b/gi, "$1i[sz]$2");
}
/* ---- one search for everything (design B): papers, wiki terms and sentences inside papers ----
   ⌘K / Ctrl+K from anywhere (not while typing in a field or reading), the library's "Everything" button, or Enter in
   the library's search field. Papers and terms appear as you type; sentences stream in as each paper's text is read
   (from the database, kept for the session). ↑/↓ move, Enter opens, Escape closes and returns focus. */
const LS = { el: null, gen: 0, texts: new Map(), sel: -1, open: false, ret: null, from: null, went: false, prep: null, hay: null, t: 0 };
const LS_SVG = {
  search: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>`,
  paper: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>`,
  term: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M9 9h6M9 13h4"/></svg>`,
  quote: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M7 7h4v4c0 3-1.5 5-4 6l-.7-1.2C7.8 15 8.6 13.8 8.7 12H7zm7 0h4v4c0 3-1.5 5-4 6l-.7-1.2c1.5-.8 2.3-2 2.4-3.8H14z"/></svg>`,
};
const LS_MAC = /Mac/.test(navigator.platform || "");
function lsBuild() {
  const el = document.createElement("div");
  el.className = "ls"; el.hidden = true;
  el.innerHTML = `<div class="ls-box" role="dialog" aria-modal="true" aria-label="Search everything">
    <div class="ls-top">${LS_SVG.search}<label for="lsQ" class="sr-only">Search papers, terms and sentences</label>
      <input type="search" class="ls-q" id="lsQ" role="combobox" aria-expanded="true" aria-controls="lsBody" aria-autocomplete="list" placeholder="Search papers, terms and sentences" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
      <button type="button" class="btn quiet ls-x" data-ls="close" aria-label="Close search"><span class="ls-cancel">Cancel</span><kbd class="ls-esc">esc</kbd></button></div>
    <div class="ls-body" id="lsBody" role="listbox" aria-label="Results"><div id="lsQuick"></div><div id="lsSents"></div></div>
    <div class="ls-foot" aria-hidden="true"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span><span class="ls-foot-r"><kbd>${LS_MAC ? "⌘" : "Ctrl "}K</kbd> from anywhere</span></div>
  </div>`;
  document.body.appendChild(el); LS.el = el;
  const q = el.querySelector("#lsQ");
  q.addEventListener("input", () => { clearTimeout(LS.t); LS.sel = -1; LS.t = setTimeout(() => lsRun(q.value), 120); });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); lsMove(e.key === "ArrowDown" ? 1 : -1); }
    else if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      const row = lsRows()[LS.sel];
      if (row) row.click(); else { clearTimeout(LS.t); lsRun(q.value); }
    }
  });
  el.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); lsClose(); return; }
    if (e.key === "Tab") {   // keep focus inside the dialog
      const f = [...el.querySelectorAll("input, button:not([disabled])")].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  el.addEventListener("click", async e => {
    e.stopPropagation();
    if (e.target === el) { lsClose(); return; }                 // a click on the dimmed backdrop
    const b = e.target.closest("[data-ls]"); if (!b) return;
    const a = b.dataset.ls;
    if (a === "close") lsClose();
    else if (a === "go") { const L_ = ixPapers().find(x => x.id === b.dataset.id); if (L_) { LS.went = true; lsHide(); await ixOpen(L_, b.dataset.q, lsBack); } }
    else if (a === "paper") {
      const L_ = ixPapers().find(x => x.id === b.dataset.id); if (!L_) return;
      lsClose(true);
      if (!L_.g.file && recOf(L_.id)) { S.recId = L_.id; S.view = "record"; render(); window.scrollTo(0, 0); }
      else openFromLibrary(L_.g.key);
    }
    else if (a === "brain") { lsClose(true); brainOpen(b.dataset.hash || ""); }
    else if (a === "term") { lsClose(true); S.wk = b.dataset.k; S.view = "wiki"; render(); window.scrollTo(0, 0); }
    else if (a === "lib") { const v = $("#lsQ").value.trim(); lsClose(true); L.q = v; L.tab = "papers"; L.folderSel = "*"; S.view = "library"; render(); window.scrollTo(0, 0); }
    else if (a === "read") {
      b.disabled = true;
      await ixFill(true, (k, n) => { b.textContent = `Reading papers… ${k} / ${n}`; });
      LS.texts.clear(); if (typeof WKI !== "undefined") WKI.agg = null; LS.prep = null; lsPrep(); lsRun($("#lsQ").value);
    }
  });
  el.addEventListener("mousemove", e => {   // the pointer moves the highlight too, so Enter opens what's under it
    const r = e.target.closest && e.target.closest("[data-lsi]"); if (!r) return;
    const i = lsRows().indexOf(r); if (i >= 0 && i !== LS.sel) { LS.sel = i; lsMark(false); }
  });
}
const lsRows = () => LS.el ? [...LS.el.querySelectorAll("[data-lsi]")] : [];
function lsMark(scroll) {
  const rows = lsRows(), q = $("#lsQ");
  if (LS.sel >= rows.length) LS.sel = rows.length - 1;
  rows.forEach((r, i) => { r.id = "ls-o" + i; r.classList.toggle("act", i === LS.sel); r.setAttribute("aria-selected", i === LS.sel ? "true" : "false"); });
  const cur = rows[LS.sel];
  if (cur) { q.setAttribute("aria-activedescendant", cur.id); if (scroll) cur.scrollIntoView({ block: "nearest" }); } else q.removeAttribute("aria-activedescendant");
}
function lsMove(d) { const n = lsRows().length; if (!n) return; LS.sel = LS.sel < 0 ? (d > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, LS.sel + d)); lsMark(true); }
function lsOpen(q) {
  if (typeof q !== "string") q = S.view === "library" ? L.q || "" : "";
  if (!LS.el) lsBuild();
  if (typeof closeMenu === "function") closeMenu();
  if (!LS.open || LS.el.hidden) { LS.ret = document.activeElement; LS.from = S.view; LS.went = false; }
  LS.open = true; LS.hay = null; LS.el.hidden = false; document.documentElement.classList.add("fd-on");
  const inp = LS.el.querySelector("#lsQ"); inp.value = q; LS.sel = -1;
  lsPrep(); lsRun(q);
  setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 30);
}
function lsHide() { LS.el.hidden = true; document.documentElement.classList.remove("fd-on"); }
function lsBack() { if (!LS.open) return; LS.el.hidden = false; document.documentElement.classList.add("fd-on"); setTimeout(() => { const i = $("#lsQ"); if (i) i.focus(); }, 30); }
// nav: a result took you somewhere (stay there); otherwise return focus to where it was
function lsClose(nav) {
  if (!LS.el) return;
  LS.open = false; LS.gen++; clearTimeout(LS.t); LS.texts.clear(); LS.prep = null; lsHide();
  if (nav) return;
  if (LS.went && LS.from === "library" && S.view !== "library") { S.view = "library"; render(); window.scrollTo(0, 0); }
  const r = LS.ret; LS.ret = null;
  if (r && r.isConnected && r !== document.body) r.focus({ preventScroll: true }); else { const i = $("#libQ"); if (i) i.focus({ preventScroll: true }); }
}
// what the quick groups need: the per-paper index, and the wiki's terms gathered from it
function lsPrep() {
  if (LS.prep) return LS.prep;
  LS.prep = (async () => {
    try { await ixFill(false); if (typeof wkReady === "function") await wkReady(); } catch (e) { console.warn("search prep", e && e.message); }
  })();
  LS.prep.then(() => { if (LS.open && !LS.el.hidden) { lsQuick($("#lsQ").value.trim()); lsMark(false); } });
  return LS.prep;
}
// highlight the query's words in plain text (escaped)
function lsHL(text, q) {
  const words = q.split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  text = String(text || "");
  if (!words.length) return esc(text);
  const re = new RegExp(`(${words.join("|")})`, "gi"); let out = "", at = 0, m;
  while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } out += esc(text.slice(at, m.index)) + "<mark>" + esc(m[0]) + "</mark>"; at = m.index + m[0].length; }
  return out + esc(text.slice(at));
}
function lsPapers(q) {
  const nq = ixNorm(q); if (!nq) return [];
  const toks = nq.split(" ");
  if (!LS.hay) LS.hay = ixPapers().map(L_ => ({ L: L_, t: ixNorm(L_.title), h: ixNorm([L_.title, (L_.g.authors || []).join(" "), (L_.g.members || []).map(m => m.name).join(" "), L_.year, L_.tags.join(" "), (L_.g.folders || []).join(" "), L_.g.doi || ""].join(" ")) }));
  return LS.hay.filter(x => toks.every(t => x.h.includes(t)))
    .map(x => ({ L: x.L, s: x.t.startsWith(nq) ? 0 : x.t.includes(nq) ? 1 : toks.every(t => x.t.includes(t)) ? 2 : 3 }))
    .sort((a, b) => a.s - b.s || (b.L.g.mtime || 0) - (a.L.g.mtime || 0)).map(x => x.L);
}
function lsTerms(q) {
  if (typeof WKI === "undefined" || !WKI.agg || q.length < 2) return [];
  const ql = q.toLowerCase(), nq = wkNorm(q);
  const out = [];
  for (const a of WKI.agg.values()) {
    if (!a.show) continue;
    const name = a.name.toLowerCase(), sfHit = [...a.sfs.keys()].some(s => s.toLowerCase() === ql);
    let s = -1;
    if (name === ql || sfHit) s = 0; else if (name.startsWith(ql)) s = 1; else if (name.includes(ql) || wkNorm(a.name).includes(nq)) s = 2; else if ([...a.lfs.keys()].some(l => wkNorm(l).includes(nq))) s = 3;
    if (s >= 0) out.push({ a, s });
  }
  return out.sort((x, y) => x.s - y.s || y.a.papers.length - x.a.papers.length).map(x => x.a);
}
const lsGroup = (title, count, body, id) => `<div class="ls-g" role="group" aria-labelledby="${id}"><div class="ls-gh"><span id="${id}">${title}</span><span>${count}</span></div>${body}</div>`;
// papers and terms: instant, from memory
function lsQuick(q) {
  const box = $("#lsQuick"); if (!box) return;
  if (!q) { box.innerHTML = ""; return; }
  const ps = lsPapers(q), ts = lsTerms(q), wkWait = typeof WKI !== "undefined" && !WKI.agg && LS.prep;
  const pRows = ps.slice(0, 5).map(L_ => { const pr = progressOf(L_.id);
    return `<button type="button" class="ls-row" role="option" data-lsi data-ls="paper" data-id="${esc(L_.id)}"><span class="ls-i">${LS_SVG.paper}</span><span class="ls-b"><span class="ls-h1">${lsHL(L_.title, q)}</span><span class="ls-h2">${esc([L_.label.trim(), pr.label !== "New" ? pr.label : "", !L_.g.file ? "not in folder" : ""].filter(Boolean).join(" · "))}</span></span><span class="ls-go">Open ↵</span></button>`; }).join("")
    + (ps.length > 5 ? `<button type="button" class="ls-row ls-more" role="option" data-lsi data-ls="lib">Show all ${ps.length} papers in the library</button>` : "");
  const tRows = ts.slice(0, 5).map(a => `<button type="button" class="ls-row" role="option" data-lsi data-ls="term" data-k="${esc(a.k)}"><span class="ls-i">${LS_SVG.term}</span><span class="ls-b"><span class="ls-h1">${lsHL(a.name, q)}${a.sf ? ` <span class="wk-abbr">${esc(a.sf)}</span>` : ""}</span><span class="ls-h2">${esc(a.cat)} · in ${a.papers.length} paper${a.papers.length === 1 ? "" : "s"}</span></span><span class="ls-go">Wiki ↵</span></button>`).join("");
  box.innerHTML = (ps.length ? lsGroup("Papers", ps.length > 5 ? `5 of ${ps.length}` : ps.length, pRows, "lsgP") : "")
    + (ts.length ? lsGroup("Wiki terms", ts.length > 5 ? `5 of ${ts.length}` : ts.length, tRows, "lsgT") : wkWait && q.length >= 2 ? `<p class="note ls-wait">Gathering wiki terms…</p>` : "")
    + lsBrainRow(q)
    + (typeof oaQueryFrom === "function" && !PW.single && (q.length >= 12 || /\b10\.\d{4,9}\//.test(q)) ? `<div class="oa-box ls-oa"><button type="button" class="ls-row ls-more" role="option" data-lsi data-oa="find" data-q="${esc(JSON.stringify(oaQueryFrom(q)))}">Find an open-access PDF for “${esc(q.slice(0, 60))}”</button></div>` : "");
}
// "Mouse brain sections": by name, or a brain region (shown highlighted in the region's best coronal section)
function lsBrainRow(q) {
  if (typeof brainOpen !== "function" || q.length < 2) return "";
  if (typeof atlasLoad === "function" && !ATL.idx) atlasLoad().catch(() => {});   // region names: ready from the next keystroke
  const named = /^(mouse |brain |atlas|sections?|ccf|stereota|coronal|sagittal)/i.test(q) || /brain sec|atlas/i.test(q);
  const reg = typeof atlasMatch === "function" && ATL.idx ? atlasMatch(q) : null;
  if (!named && !reg) return "";
  const hash = reg && reg.ids ? `plane=coronal&pos=${atlasAP(atlasS(reg.ids[0]).cp).toFixed(2)}&sys=dorr&lvl=summary&fill=none&hemi=both&lab=none&hl=${reg.ids.map(i => i + ".e0533b").join(",")}` : "";
  return lsGroup("Tools", "", `<button type="button" class="ls-row" role="option" data-lsi data-ls="brain" data-hash="${esc(hash)}"><span class="ls-i">${LS_SVG.term}</span><span class="ls-b"><span class="ls-h1">${reg && reg.ids ? `Show ${esc(atlasName(reg.ids))} in brain sections` : "Mouse brain sections"}</span><span class="ls-h2">Coronal, sagittal, dorsal and 3D views of the Allen mouse brain atlas</span></span><span class="ls-go">Open ↵</span></button>`, "lsgB");
}
async function lsIntro(q) {
  const box = $("#lsSents"); if (!box) return;
  const gen = LS.gen;
  box.innerHTML = q ? `<p class="note ls-note">Type at least 3 letters to search inside your papers.</p>` : `<p class="note ls-note">Search titles and authors, wiki terms, and every sentence of your papers.</p>`;
  await (LS.prep || ixFill(false));
  if (gen !== LS.gen || !LS.open) return;
  const miss = ixMissing();
  if (miss) box.insertAdjacentHTML("beforeend", `<p class="note ls-note">${miss} paper${miss === 1 ? " hasn't" : "s haven't"} been read yet, so ${miss === 1 ? "its" : "their"} text and terms aren't searched. <button type="button" class="btn ls-read" data-ls="read">Read them now</button></p>`);
}
async function lsRun(q) {
  q = q.trim(); const gen = ++LS.gen, body = $("#lsSents");
  lsQuick(q);
  if (LS.sel < 0 && q && lsRows().length) LS.sel = 0;
  lsMark(false);
  if (q.length < 3) { lsIntro(q); return; }
  body.innerHTML = lsGroup("Sentences in your papers", "searching…", "", "lsgS");
  const re = new RegExp(lsPattern(q), "gi");
  const results = []; let searched = 0, total = 0;
  for (const L of ixPapers()) {
    if (gen !== LS.gen) return;                       // a newer search started
    const file = L.g.file && fileForGroup(L.g); if (!file) continue;
    total++;
    if (total % 50 === 0) await new Promise(r => setTimeout(r, 0));   // let the screen breathe (and a newer query start)
    if (gen !== LS.gen) return;
    // the texts are read once per search session (from the database: slow on the phone) and kept until closed
    const key = pwTextKey(file); let paras = LS.texts.get(key);
    if (paras === undefined) {
      let raw = null; try { raw = await PW.be.get(PW_TEXT_COL, key); } catch {}
      paras = raw ? [["Abstract", raw.abstract || ""], ...Object.entries(raw.sections || {}).flatMap(([k, v]) => v.map(t => [SEC_NAMES[k] || k, t]))] : null;
      LS.texts.set(key, paras);
      if (raw && !IX.map.has(L.id)) ixLater(L.id, raw);  // index it while we have the text, one at a time in the background
    }
    if (!paras) continue; searched++;
    const hits = []; let n = 0;
    for (const [sec, t] of paras) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(t))) {
        n++;
        if (hits.length < 3) {
          const a = Math.max(0, m.index - 70), b = Math.min(t.length, m.index + m[0].length + 90);
          // the quote used to find the spot again when the paper opens
          const qa = Math.max(0, t.lastIndexOf(" ", Math.max(0, m.index - 25)) + 1);
          hits.push({ sec, html: (a > 0 ? "…" : "") + esc(t.slice(a, m.index)) + "<mark>" + esc(m[0]) + "</mark>" + esc(t.slice(m.index + m[0].length, b)) + (b < t.length ? "…" : ""), quote: t.slice(qa, m.index + m[0].length).replace(/\s*\[\d[\d,–\s]*\]/g, "") });
        }
      }
    }
    if (n) results.push({ L, n, hits });
    if (results.length && searched % 10 === 0) lsShow(results, 0, false, q, searched, total);
  }
  if (gen === LS.gen) lsShow(results, total - searched, true, q, searched, total);
}
function lsShow(results, miss, done, q) {
  const box = $("#lsSents"); if (!box) return;
  results.sort((a, b) => b.n - a.n);
  const nm = results.reduce((s, r) => s + r.n, 0);
  const shown = results.slice(0, 25);
  const rows = shown.map(r => r.hits.map(h => `<button type="button" class="ls-row ls-sent" role="option" data-lsi data-ls="go" data-id="${esc(r.L.id)}" data-q="${esc(h.quote)}"><span class="ls-i">${LS_SVG.quote}</span><span class="ls-b"><span class="ls-h1 serif">${h.html}</span><span class="ls-h2">${esc((r.L.label || "").trim() || r.L.title)} · ${esc(h.sec)}${r.n > r.hits.length ? ` · ${r.n} matches in this paper` : ""}</span></span><span class="ls-go">Read ↵</span></button>`).join("")).join("");
  const count = results.length ? `${nm} in ${results.length} paper${results.length === 1 ? "" : "s"}${done ? "" : " so far…"}` : done ? "none" : "searching…";
  box.innerHTML = lsGroup("Sentences in your papers", count, rows, "lsgS")
    + (results.length > shown.length ? `<p class="note ls-note">And ${results.length - shown.length} more papers. Add words to narrow down.</p>` : "")
    + (done && !results.length && !lsRows().length ? `<p class="note ls-note">No matches for “${esc(q)}”. Try fewer words, or a related term.</p>` : "")
    + (done && miss ? `<p class="note ls-note">${miss} paper${miss === 1 ? " wasn't" : "s weren't"} searched because ${miss === 1 ? "it hasn't" : "they haven't"} been read yet. <button type="button" class="btn ls-read" data-ls="read">Read them now</button></p>` : "");
  if (LS.sel < 0 && lsRows().length) LS.sel = 0;
  lsMark(false);
}
// ⌘K / Ctrl+K from anywhere: not while typing in a field (except the library's search), reading, or in the one-PDF web version
document.addEventListener("keydown", e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || (e.key || "").toLowerCase() !== "k" || PW.single) return;
  const de = document.documentElement;
  if (LS.open && LS.el && !LS.el.hidden) { e.preventDefault(); const i = $("#lsQ"); i.focus(); i.select(); return; }
  if (de.classList.contains("rdm-open") || de.classList.contains("fd-on")) return;
  const t = e.target;
  if (t && t.id !== "libQ" && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  e.preventDefault(); lsOpen(t && t.id === "libQ" ? t.value : "");
});
