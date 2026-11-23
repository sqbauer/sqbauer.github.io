"use strict";
/* ---------- the wiki: one page per term, built from your papers ----------
   The terms come from wikicore.js, run on each paper's text when it is indexed (connect.js, pwIndexPaper), and are
   gathered here across the library. A page shows what the term means (how papers spell it out, Claude's primer
   definitions you already have, the atlas for regions), every paper that mentions it with a sentence that opens the
   paper at that spot, related terms, and where your papers disagree: one short form for different things, or
   definitions that don't match. Nothing here calls Claude. */

const WKI = { agg: null, defs: null, q: "", cat: "all", sort: "papers", busy: false };
const WK_ALL_CATS = ["Brain region", ...Object.keys(WK_VOCAB), "Other terms"];

/* ---- gather the index across the library ---- */
async function wkGather(onStep) {
  if (typeof atlasLoad === "function") await atlasLoad();
  await ixFill(false, onStep);
  wkBuild();
  const agg = new Map(), lib = ixPapers();
  for (const L of lib) {
    const d = IX.map.get(L.id); if (!d || !d.wiki) continue;
    for (const [k, [n, sec, q, sf, lf]] of Object.entries(d.wiki)) {
      let a = agg.get(k); if (!a) agg.set(k, a = { k, papers: [], n: 0, sfs: new Map(), lfs: new Map() });
      a.papers.push({ L: wkLabel(L), n, sec, q, sf, lf }); a.n += n;
      if (sf) a.sfs.set(sf, (a.sfs.get(sf) || 0) + 1);
      if (lf) a.lfs.set(lf, (a.lfs.get(lf) || 0) + 1);
    }
  }
  for (const a of agg.values()) {
    a.papers.sort((x, y) => y.n - x.n);
    a.cat = a.k.startsWith("v:") ? WK.terms.get(a.k).cat : a.k.startsWith("r:") ? "Brain region" : "Other terms";
    a.name = wkName(a);
    const sfs = wkTop(a.sfs);
    // the short form to show next to the name: the one most papers use, if more than one paper does (or it's an abbreviation's own page)
    a.sf = sfs.length && (a.k.startsWith("a:") || a.sfs.get(sfs[0]) >= 2) ? sfs[0] : null;
    a.show = !a.k.startsWith("a:") || a.papers.length >= 2;
  }
  WKI.agg = agg; WKI.nPapers = lib.filter(L => IX.map.get(L.id)?.wiki).length; WKI.nLib = lib.filter(L => L.g.file).length;
  WKI.clash = wkClashes(agg); WKI.defs = wkPrimerDefs(agg);
  return agg;
}
// the terms, gathered once and shared (the universal search asks for them too)
function wkReady() {
  if (WKI.agg) return Promise.resolve(WKI.agg);
  return WKI.pending || (WKI.pending = wkGather().finally(() => { WKI.pending = null; }));
}
// a paper's short label; the file name when the author couldn't be read ("1983", "Phd & Phd 2017")
function wkLabel(L) {
  const l = (L.label || "").trim();
  if (l.length >= 6 && /[A-Za-z]{3}/.test(l) && !/^(phd|md|dr)\b/i.test(l)) return L;
  return { ...L, label: typeof guessFromName === "function" ? guessFromName(L.g.name).label : L.g.name };
}
const wkTop = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
const wkCap = s => /^[a-z]/.test(s) && !/^[a-z]+[A-Z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s;
function wkName(a) {
  if (a.k.startsWith("v:")) return WK.terms.get(a.k).name;
  if (a.k.startsWith("r:")) {
    const ids = a.k.slice(2).split("+").map(Number);
    if (ids.length === 1 && atlasS(ids[0])) return atlasS(ids[0]).n;
    // several atlas areas under one name ("amygdala"): the name the papers use
    const w = wkTop(a.lfs).find(x => !/^[A-Z0-9]+$/.test(x));
    return w ? wkCap(w) : atlasName(ids);
  }
  return wkCap(wkTop(a.lfs)[0] || a.k.slice(2));
}
/* one short form, different terms: "IN" is interneuron in some papers and interposed nucleus in others */
function wkClashes(agg) {
  const by = new Map();
  for (const a of agg.values()) {
    if (!a.show) continue;
    for (const [sf, c] of a.sfs) { if (sf.length < 2) continue; let l = by.get(sf); if (!l) by.set(sf, l = []); l.push({ a, c }); }
  }
  const out = new Map();
  for (const [sf, l] of by) if (l.length > 1) out.set(sf, l.sort((x, y) => y.c - x.c));
  return out;
}
/* definitions from the primers Claude already wrote for your papers (saved with each paper; nothing new is asked) */
function wkPrimerDefs(agg) {
  const out = new Map(), lib = new Map(ixPapers().map(L => [L.id, L]));
  for (const r of allRecs()) {
    for (const t of (r.primer && r.primer.keyTerms) || []) {
      if (!t || !t.term || !t.definition) continue;
      const base = t.term.replace(/\s*\(([^)]*)\)\s*$/, ""), paren = (t.term.match(/\(([^)]*)\)\s*$/) || [])[1];
      const n = wkNorm(base);
      let k = WK.normKey.get(n) || wkRegionOf(base) || (agg.has("a:" + n) ? "a:" + n : null);
      if (!k && paren) for (const a of agg.values()) if (a.show && a.sfs.has(paren.trim())) { k = a.k; break; }
      if (!k && agg.has("v:" + n)) k = "v:" + n;
      if (!k) continue;
      let l = out.get(k); if (!l) out.set(k, l = []);
      l.push({ term: t.term, def: t.definition, L: lib.get(r.id) || { id: r.id, label: r.title || r.name, title: r.title || "" } });
    }
  }
  return out;
}
// two definitions that share few content words probably mean different things
function wkDiffer(defs) {
  const words = d => new Set(wkNorm(d).split(" ").filter(w => w.length > 3 && !/^(that|with|from|which|this|their|these|when|into|than|used|refer|refers|such)$/.test(w)));
  for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) {
    const A = words(defs[i].def), B = words(defs[j].def);
    const inter = [...A].filter(w => B.has(w)).length, uni = new Set([...A, ...B]).size;
    if (uni && inter / uni < .12) return true;
  }
  return false;
}

/* ---- the Wiki tab ---- */
async function renderWikiTab() {
  const box = $("#wkBox"); if (!box) return;
  if (!WKI.agg) {
    box.innerHTML = `<div class="thinking"><span class="dot"></span><span id="wkWait">Gathering terms from your papers…</span></div>`;
    await wkGather((k, n) => { const w = $("#wkWait"); if (w && n > 5) w.textContent = `Finding terms in your papers… ${k} / ${n}`; });
    if (!$("#wkBox") || L.tab !== "wiki" || S.view !== "library") return;
    const c = document.querySelector('[role="tab"][data-ltab="wiki"] .c'); if (c) c.textContent = [...WKI.agg.values()].filter(a => a.show).length;
  }
  const miss = WKI.nLib - WKI.nPapers;
  box.innerHTML = `<div class="wk-top">
      <input type="search" id="wkQ" class="search" placeholder="Search terms, e.g. climbing fiber or IN" value="${esc(WKI.q)}" autocomplete="off" spellcheck="false">
      <select class="sort" id="wkSort" aria-label="Sort terms"><option value="papers" ${WKI.sort === "papers" ? "selected" : ""}>Most papers</option><option value="az" ${WKI.sort === "az" ? "selected" : ""}>A–Z</option></select>
    </div>
    <div class="wk-cats">${["all", ...WK_ALL_CATS, "clash"].map(c => { const n = c === "clash" ? WKI.clash.size : c === "all" ? null : [...WKI.agg.values()].filter(a => a.show && a.cat === c).length; return n === 0 ? "" : `<button type="button" class="chip wk-cat ${c === "clash" ? "warn" : ""}" data-wkcat="${esc(c)}" aria-pressed="${WKI.cat === c}">${c === "all" ? "All" : c === "clash" ? "Clashes" : esc(c)}${n != null ? ` <span class="c">${n}</span>` : ""}</button>`; }).join("")}</div>
    <p class="note wk-status">Built from ${WKI.nPapers} of ${WKI.nLib} papers.${miss > 0 ? ` ${miss} haven't been read yet and aren't included.` : ""}
      ${miss > 0 ? `<button type="button" class="linkbtn" data-wk-read>Read them now</button>` : ""}</p>
    <div id="wkList" class="wk-list"></div>`;
  wkList();
}
function wkList() {
  const box = $("#wkList"); if (!box || !WKI.agg) return;
  if (WKI.cat === "clash") {
    const l = [...WKI.clash.entries()].filter(([sf, xs]) => !WKI.q || sf.toLowerCase().includes(WKI.q.toLowerCase()) || xs.some(x => x.a.name.toLowerCase().includes(WKI.q.toLowerCase())));
    box.innerHTML = `<p class="note">The same short form stands for different things in your papers. Worth checking when you read one of them.</p>` +
      (l.length ? l.map(([sf, xs]) => `<div class="wk-clash"><div class="wk-sf">${esc(sf)}</div><div>${xs.map(x => `<button type="button" class="linkbtn" data-wk="${esc(x.a.k)}">${esc(x.a.name)}</button> <span class="note">${x.c} paper${x.c === 1 ? "" : "s"}</span>`).join("<br>")}</div></div>`).join("") : `<p class="note">No clashes match.</p>`);
    return;
  }
  const q = WKI.q.trim().toLowerCase(), nq = q ? wkNorm(q) : "";
  let items = [...WKI.agg.values()].filter(a => a.show && (WKI.cat === "all" || a.cat === WKI.cat));
  if (q) items = items.filter(a => a.name.toLowerCase().includes(q) || (a.sf && a.sf.toLowerCase() === q) || [...a.sfs.keys()].some(s => s.toLowerCase() === q) || wkNorm(a.name).includes(nq) || [...a.lfs.keys()].some(l => wkNorm(l).includes(nq)));
  items.sort(WKI.sort === "az" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.papers.length - a.papers.length || b.n - a.n);
  box.innerHTML = items.length ? items.slice(0, 500).map(a => {
    const clash = a.sf && WKI.clash.has(a.sf);
    return `<button type="button" class="row wk-row" data-wk="${esc(a.k)}"><div style="min-width:0"><div class="rt">${esc(a.name)}${a.sf ? ` <span class="wk-abbr">${esc(a.sf)}</span>` : ""}</div><div class="rm">${esc(a.cat)}${clash ? ` · <span class="wk-warn">${esc(a.sf)} also means something else</span>` : ""}${WKI.defs.get(a.k) && wkDiffer(WKI.defs.get(a.k)) ? ` · <span class="wk-warn">definitions differ</span>` : ""}</div></div>
      <div class="rr"><span class="pill">${a.papers.length} paper${a.papers.length === 1 ? "" : "s"}</span></div></button>`;
  }).join("") + (items.length > 500 ? `<div class="row note">Showing 500 of ${items.length}. Search to narrow down.</div>` : "") : `<div class="row note">No terms match.</div>`;
}

/* ---- a term's page ---- */
function renderWikiTerm() {
  const a = WKI.agg && WKI.agg.get(S.wk);
  $("#pTitle").textContent = "Wiki"; $("#pTags").innerHTML = "";
  if (!a) { S.view = "library"; L.tab = "wiki"; render(); return; }
  $("#pSub").textContent = a.name;
  const lfs = wkTop(a.lfs).filter(l => wkNorm(l) !== wkNorm(a.name) && !/^[A-Z0-9]+$/.test(l));
  const clash = [...a.sfs.keys()].filter(sf => WKI.clash.has(sf)).map(sf => [sf, WKI.clash.get(sf).filter(x => x.a !== a)]);
  const defs = WKI.defs.get(a.k) || [], differ = defs.length > 1 && wkDiffer(defs);
  const ids = a.k.startsWith("r:") ? a.k.slice(2).split("+").map(Number) : null;
  const atlasOK = ids && ids.every(i => atlasS(i));
  const info = ids && !atlasOK ? ids.map(i => ATL_INFO[atlasS(i)?.a]).filter(Boolean)[0] : null;   // the atlas card shows it otherwise
  const rel = wkRelated(a);
  $("#main").innerHTML = `<section class="view wk">
    <button class="backlink" type="button" data-ltab="wiki">Wiki</button>
    <div class="eyebrow" style="margin-top:10px">${esc(a.cat)}</div>
    <h2>${esc(a.name)}${a.sf ? ` <span class="wk-abbr big">${esc(a.sf)}</span>` : ""}</h2>
    <p class="lede">In ${a.papers.length} of your papers, ${a.n} mention${a.n === 1 ? "" : "s"}.${lfs.length ? ` Also written as ${lfs.slice(0, 4).map(l => `<em>${esc(l)}</em>`).join(", ")}.` : ""}</p>
    ${clash.map(([sf, xs]) => `<div class="card wk-flag"><h3>${esc(sf)} means different things in your papers</h3><p class="note">Here it is ${esc(a.name)} (${a.sfs.get(sf)} paper${a.sfs.get(sf) === 1 ? "" : "s"}). Elsewhere: ${xs.map(x => `<button type="button" class="linkbtn" data-wk="${esc(x.a.k)}">${esc(x.a.name)}</button> (${x.c})`).join(", ")}.</p></div>`).join("")}
    ${info || defs.length ? `<div class="card"><h3>What it is</h3>
      ${info ? `<p>${esc(info)}</p>` : ""}
      ${defs.length ? `${differ ? `<p class="wk-warn" style="margin:6px 0">These definitions don't agree. Check which one fits the paper you're reading.</p>` : ""}
        <ul class="wk-defs">${defs.slice(0, 6).map(d => `<li><span>${esc(d.def)}</span> <span class="note">Primer for ${esc(d.L.label || d.L.title)}</span></li>`).join("")}</ul>` : ""}
    </div>` : ""}
    ${atlasOK ? `<div class="card wk-atlas" id="wkAtlas">${atlasSheetHTML({ ids, word: a.name })}</div>` : ""}
    <div class="card"><h3>In your papers</h3><div class="wk-papers">${a.papers.slice(0, 60).map(p => `<div class="wk-paper">
        <div class="wk-ph"><button type="button" class="linkbtn" data-wkopen="${esc(p.L.id)}"><strong>${esc(p.L.label || p.L.title)}</strong></button><span class="note">${p.n} mention${p.n === 1 ? "" : "s"}${p.sf && p.lf && !a.k.startsWith("a:") ? ` · ${esc(p.sf)} = ${esc(p.lf)}` : ""}</span></div>
        <div class="wk-pt">${esc(p.L.title)}</div>
        <button type="button" class="ls-hit" data-wkopen="${esc(p.L.id)}" data-q="${esc(p.q)}"><span class="ls-sec">${esc({ ...SEC_NAMES, other: "Text" }[p.sec] || p.sec)}</span>${wkMark(p.q, a)}</button>
      </div>`).join("")}${a.papers.length > 60 ? `<p class="note">And ${a.papers.length - 60} more.</p>` : ""}</div></div>
    ${rel.length ? `<div class="card"><h3>Often together with</h3><div class="wk-rel">${rel.map(r => `<button type="button" class="tchip" data-wk="${esc(r.a.k)}">${esc(r.a.name)} <span class="c">${r.both}</span></button>`).join("")}</div></div>` : ""}
  </section>`;
  const at = $("#wkAtlas"); if (at) atlasFill(at, { ids });
}
// the term in its sentence, marked
function wkMark(q, a) {
  const words = [a.name, ...a.sfs.keys(), ...a.lfs.keys()].filter(w => w && w.length > 1);
  if (a.k.startsWith("v:")) for (const [w, k] of WK.cs) if (k === a.k) words.push(w);
  // short forms ("IN") match case-sensitively, so "in" isn't marked; names and long forms in any case
  const acr = w => /^[A-Za-z]{0,2}[A-Z][A-Za-z0-9+\-]*$/.test(w) && w.length <= 8 && /[A-Z].*[A-Z0-9]|^[A-Z]{2,}/.test(w);
  const uniq = [...new Set(words)].sort((x, y) => y.length - x.length);
  const mk = (list, f, flags) => list.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(f).join("|")})(?![\\p{L}\\p{N}])`, flags) : null;
  const spans = [];
  for (const re of [mk(uniq.filter(w => !acr(w)), wkPat, "giu"), mk(uniq.filter(acr), w => wkEsc(w) + "s?", "gu")]) {
    if (!re) continue; let m;
    while ((m = re.exec(q))) { if (!m[0]) { re.lastIndex++; continue; } spans.push([m.index, m.index + m[0].length]); }
  }
  spans.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
  let out = "", at = 0;
  for (const [a0, b0] of spans) { if (a0 < at) continue; out += esc(q.slice(at, a0)) + "<b>" + esc(q.slice(a0, b0)) + "</b>"; at = b0; }
  return out + esc(q.slice(at));
}
// terms that share papers with this one, more than their size alone would explain
function wkRelated(a) {
  const mine = new Set(a.papers.map(p => p.L.id)), out = [];
  for (const b of WKI.agg.values()) {
    if (b === a || !b.show || b.papers.length < 2) continue;
    let both = 0; for (const p of b.papers) if (mine.has(p.L.id)) both++;
    if (both < 2) continue;
    out.push({ a: b, both, score: both / Math.sqrt(b.papers.length * mine.size) });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 14);
}

/* ---- events ---- */
document.addEventListener("click", async e => {
  const t = e.target.closest && e.target.closest("[data-wk], [data-wkcat], [data-wkopen], [data-wk-read], .wk .atl-view");
  if (!t) return;
  if (t.matches(".atl-view")) { atlasZoom(t); return; }
  if (t.dataset.wk !== undefined) { S.wk = t.dataset.wk; S.view = "wiki"; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.wkcat !== undefined) { WKI.cat = t.dataset.wkcat; document.querySelectorAll("[data-wkcat]").forEach(b => b.setAttribute("aria-pressed", b.dataset.wkcat === WKI.cat)); wkList(); return; }
  if (t.dataset.wkopen !== undefined) {
    const L_ = ixPapers().find(x => x.id === t.dataset.wkopen); if (!L_) return;
    const back = S.wk;
    await ixOpen(L_, t.dataset.q || "", () => { S.wk = back; S.view = "wiki"; render(); window.scrollTo(0, 0); });
    return;
  }
  if (t.dataset.wkRead !== undefined) {
    t.disabled = true;
    await ixFill(true, (k, n) => { t.textContent = `Reading papers… ${k} / ${n}`; });
    WKI.agg = null; renderWikiTab();
  }
});
document.addEventListener("input", e => { if (e.target.id === "wkQ") { WKI.q = e.target.value; clearTimeout(WKI.t); WKI.t = setTimeout(wkList, 150); } });
document.addEventListener("change", e => { if (e.target.id === "wkSort") { WKI.sort = e.target.value; wkList(); } });
