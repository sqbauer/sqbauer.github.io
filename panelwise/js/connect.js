"use strict";
/* ---------- connections between your papers ----------
   - a reference that is also a paper in your library gets an "Open" link in the citation sheet
   - each paper lists related papers in your library: ones it cites, ones citing it, ones on the same brain regions
     or topics
   - one search box looks inside every paper's text
   It all runs on the text the phone already keeps for each paper (the "_text" cache). A small index per paper
   (its reference list and the brain regions it names) lives in "_index": derived data, rebuilt when needed,
   not part of backups. Papers never opened are read in the background when you ask for it. */

const IX_COL = "_index", IX_VER = 1;
const IX = { map: new Map(), loaded: null, busy: false, queue: [], status: "" };

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
    const d = { v: IX_VER, updated: Date.now(), refs: ixNorm(refText).slice(0, 150000), regions: ixRegions(raw) };
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
      let raw = null;
      try { raw = await PW.be.get(PW_TEXT_COL, pwTextKey(file)); } catch {}
      if (!raw && read) { try { raw = await pwPaperText(file); } catch {} }
      if (raw) await pwIndexPaper(L.id, raw);
      k++; if (onStep) onStep(k, todo.length);
    }
  } finally { IX.busy = false; }
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
  for (const probe of [q, q.split(/\s+/).slice(0, 6).join(" ")]) {
    const el = [...RM.flow.querySelectorAll("p, h3, h4")].find(p => p.textContent.toLowerCase().includes(probe.toLowerCase()));
    if (!el) continue;
    const at = el.textContent.toLowerCase().indexOf(probe.toLowerCase());
    const r = rmTextRange(el, at, at + probe.length); if (!r) continue;
    const rect = r.getClientRects()[0] || r.getBoundingClientRect();
    rmGo(Math.max(0, Math.floor((rect.left - RM.flow.getBoundingClientRect().left) / RM.step)), true); rmSave();
    rmFlash(rmWrap(el, at, at + probe.length, () => { const m = document.createElement("mark"); m.className = "rdm-found"; return m; }));
    return;
  }
}

/* ---- search inside every paper ---- */
// "climbing fibre" also finds "climbing fiber" (and colour/color, behaviour/behavior, centre/center, -ise/-ize)
function lsPattern(q) {
  return q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
    .replace(/fib(?:re|er)/gi, "fib(?:re|er)").replace(/cent(?:re|er)/gi, "cent(?:re|er)")
    .replace(/(colo|behavio|favo|humo|tumo)u?r/gi, "$1u?r").replace(/([a-z]{3,})i[sz](e|ed|es|ing|ation)\b/gi, "$1i[sz]$2");
}
const LS = { el: null, gen: 0 };
function lsBuild() {
  const el = document.createElement("div");
  el.className = "ls"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Search inside papers");
  el.innerHTML = `<div class="ls-top"><input type="search" class="ls-q" id="lsQ" placeholder="Search inside all papers" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"><button type="button" class="btn" data-ls="close">Done</button></div>
    <div class="ls-body" id="lsBody"></div>`;
  document.body.appendChild(el); LS.el = el;
  const q = el.querySelector("#lsQ");
  q.addEventListener("input", () => { clearTimeout(LS.t); LS.t = setTimeout(() => lsRun(q.value), 300); });
  q.addEventListener("keydown", e => { if (e.key === "Enter") { q.blur(); clearTimeout(LS.t); lsRun(q.value); } });
  el.addEventListener("click", async e => {
    e.stopPropagation();
    const b = e.target.closest("[data-ls]"); if (!b) return;
    const a = b.dataset.ls;
    if (a === "close") lsClose();
    else if (a === "go") { const L = ixPapers().find(x => x.id === b.dataset.id); if (L) { lsHide(); await ixOpen(L, b.dataset.q, lsBack); } }
    else if (a === "read") { b.disabled = true; await ixFill(true, (k, n) => { b.textContent = `Reading papers… ${k} / ${n}`; }); lsRun($("#lsQ").value); }
  });
}
function lsOpen() {
  if (!LS.el) lsBuild();
  LS.open = true; LS.el.hidden = false; document.documentElement.classList.add("fd-on");
  lsIntro(); setTimeout(() => LS.el.querySelector("#lsQ").focus(), 50);
}
function lsHide() { LS.el.hidden = true; document.documentElement.classList.remove("fd-on"); }
function lsBack() { if (!LS.open) return; LS.el.hidden = false; document.documentElement.classList.add("fd-on"); }
function lsClose() { LS.open = false; lsHide(); if (S.view !== "library") { S.view = "library"; render(); } }
async function lsIntro() {
  await ixFill(false);
  const miss = ixMissing();
  $("#lsBody").innerHTML = `<p class="note">Searches the full text of your papers: every word, not just titles.</p>${miss ? `<p class="note">${miss} paper${miss === 1 ? " hasn't" : "s haven't"} been read yet and won't be searched until then.</p><button type="button" class="btn" data-ls="read">Read them now</button>` : ""}`;
}
async function lsRun(q) {
  q = q.trim(); const gen = ++LS.gen, body = $("#lsBody");
  if (q.length < 3) { lsIntro(); return; }
  body.innerHTML = `<p class="note">Searching…</p>`;
  const re = new RegExp(lsPattern(q), "gi");
  const results = []; let searched = 0, total = 0;
  for (const L of ixPapers()) {
    if (gen !== LS.gen) return;                       // a newer search started
    const file = L.g.file && fileForGroup(L.g); if (!file) continue;
    total++;
    let raw = null; try { raw = await PW.be.get(PW_TEXT_COL, pwTextKey(file)); } catch {}
    if (!raw) continue; searched++;
    if (!IX.map.has(L.id)) pwIndexPaper(L.id, raw);    // index it while we have the text
    const paras = [["Abstract", raw.abstract || ""], ...Object.entries(raw.sections || {}).flatMap(([k, v]) => v.map(t => [{ intro: "Introduction", results: "Results", discussion: "Discussion", methods: "Methods", other: "Other text" }[k] || k, t]))];
    const hits = []; let n = 0;
    for (const [sec, t] of paras) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(t))) {
        n++;
        if (hits.length < 3) {
          const a = Math.max(0, m.index - 70), b = Math.min(t.length, m.index + m[0].length + 90);
          // the quote used to find the spot again when the paper opens
          const qa = Math.max(0, t.lastIndexOf(" ", Math.max(0, m.index - 25)) + 1);
          hits.push({ sec, html: (a > 0 ? "…" : "") + esc(t.slice(a, m.index)) + "<b>" + esc(m[0]) + "</b>" + esc(t.slice(m.index + m[0].length, b)) + (b < t.length ? "…" : ""), quote: t.slice(qa, m.index + m[0].length).replace(/\s*\[\d[\d,–\s]*\]/g, "") });
        }
      }
    }
    if (n) results.push({ L, n, hits });
    if (results.length && searched % 10 === 0) lsShow(results, 0, false, q);
  }
  if (gen === LS.gen) lsShow(results, total - searched, true, q);
}
function lsShow(results, miss, done, q) {
  results.sort((a, b) => b.n - a.n);
  $("#lsBody").innerHTML = `<p class="note">${results.length ? `${results.reduce((s, r) => s + r.n, 0)} matches in ${results.length} paper${results.length === 1 ? "" : "s"}` : done ? "No matches" : "Searching…"}${done ? "" : " so far…"}</p>` +
    results.map(r => `<div class="ls-paper"><div class="ls-h"><strong>${esc(r.L.label || r.L.title)}</strong><span>${r.n} match${r.n === 1 ? "" : "es"}</span></div><div class="ls-t">${esc(r.L.title)}</div>` +
      r.hits.map(h => `<button type="button" class="ls-hit" data-ls="go" data-id="${esc(r.L.id)}" data-q="${esc(h.quote)}"><span class="ls-sec">${esc(h.sec)}</span>${h.html}</button>`).join("") + `</div>`).join("") +
    (done && miss ? `<p class="note">${miss} paper${miss === 1 ? " wasn't" : "s weren't"} searched because they haven't been read yet.</p><button type="button" class="btn" data-ls="read">Read them now</button>` : "");
}
