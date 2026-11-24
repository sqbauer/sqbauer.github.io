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
    const ab = a.k.startsWith("a:") ? wkAbbrDef(a.k) : null;
    if (ab && ab.title) a.name = ab.title;              // the cleaned-up name ("Adeno-associated virus", not "adeno associated viruse")
    const sfs = wkTop(a.sfs);
    // the short form to show next to the name: the one most papers use, if more than one paper does (or it's an abbreviation's own page)
    a.sf = sfs.length && (a.k.startsWith("a:") || a.sfs.get(sfs[0]) >= 2) ? sfs[0] : null;
    // abbreviation pages: from 2 papers on, unless the entry says it's statistics or lab routine rather than a concept
    a.show = !a.k.startsWith("a:") || (a.papers.length >= 2 && !(ab && ab.skip));
  }
  // every described term gets a page, also when none of your papers mentions it yet (links never lead nowhere);
  // those stay out of the list
  if (typeof WK_DEFS !== "undefined") for (const name of Object.keys(WK_DEFS)) {
    const k = "v:" + wkNorm(name); if (agg.has(k) || !WK.terms.has(k)) continue;
    agg.set(k, { k, papers: [], n: 0, sfs: new Map(), lfs: new Map(), cat: WK.terms.get(k).cat, name: WK.terms.get(k).name, sf: null, show: false, stub: true });
  }
  // an abbreviation that is the same concept as another page ("long-term synaptic depression" = Long-term depression):
  // its papers join that page, and it has none of its own
  for (const a of [...agg.values()]) {
    const ab = a.k.startsWith("a:") ? wkAbbrDef(a.k) : null; if (!ab || !ab.same || ab.same === a.k) continue;
    const t = agg.get(ab.same); if (!t) continue;
    for (const p of a.papers) { const q = t.papers.find(x => x.L.id === p.L.id); if (q) q.n += p.n; else t.papers.push(p); }
    t.n += a.n; for (const [w, c] of a.sfs) t.sfs.set(w, (t.sfs.get(w) || 0) + c); for (const [w, c] of a.lfs) t.lfs.set(w, (t.lfs.get(w) || 0) + c);
    t.papers.sort((x, y) => y.n - x.n);
    if (t.stub) { t.stub = false; t.show = true; }
    agg.delete(a.k);
  }
  WKI.linker = null;
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
  if (!S.wkHist || S.wkHist[S.wkPos ?? -1] !== a.k) { S.wkHist = [...(S.wkHist || []).slice(0, (S.wkPos ?? -1) + 1), a.k]; S.wkPos = S.wkHist.length - 1; }
  const lfs = wkTop(a.lfs).filter(l => wkNorm(l) !== wkNorm(a.name) && !/^[A-Z0-9]+$/.test(l));
  const clash = [...a.sfs.keys()].filter(sf => WKI.clash.has(sf)).map(sf => [sf, WKI.clash.get(sf).filter(x => x.a !== a)]);
  const defs = WKI.defs.get(a.k) || [], differ = defs.length > 1 && wkDiffer(defs);
  const ids = a.k.startsWith("r:") ? a.k.slice(2).split("+").map(Number) : null;
  const atlasOK = ids && ids.every(i => atlasS(i));
  const info = ids ? ids.map(i => ATL_INFO[atlasS(i)?.a]).filter(Boolean)[0] : null;
  const own = a.k.startsWith("v:") ? (typeof WK_DEFS !== "undefined" ? WK_DEFS[a.name] : null) : a.k.startsWith("a:") ? wkAbbrDef(a.k) : null;
  const canWrite = a.k.startsWith("a:") && !(own && own.d);
  // how your papers describe it: sentences that say what it is
  const desc = a.papers.filter(p => /\b(?:is|are|refers? to|consists? of|known as|defined as|termed|called)\b/.test(p.q) && p.q.length < 320).slice(0, 3);
  const rels = wkRelsOf(a), co = wkRelated(a);
  const seen = new Set();                              // link each term once on the page's descriptive text
  const relGroups = new Map(); for (const r of rels) { if (!relGroups.has(r.type)) relGroups.set(r.type, []); relGroups.get(r.type).push(r.k); }
  const hist = S.wkHist || [], pos = S.wkPos ?? hist.length - 1;
  const prev = pos > 0 ? WKI.agg.get(hist[pos - 1]) : null, next = pos < hist.length - 1 ? WKI.agg.get(hist[pos + 1]) : null;
  const trail = hist.slice(Math.max(0, pos - 4), pos).map(k => WKI.agg.get(k)).filter(Boolean);
  $("#main").innerHTML = `<section class="view wk">
    <div class="wk-nav">
      <button class="backlink" type="button" data-ltab="wiki">Wiki</button>
      <span class="wk-hist">
        <button type="button" class="btn quiet icon" data-wkhist="-1" ${prev ? "" : "disabled"} aria-label="Back${prev ? ": " + esc(prev.name) : ""}" title="${prev ? "Back to " + esc(prev.name) : "Back"}">‹</button>
        <button type="button" class="btn quiet icon" data-wkhist="1" ${next ? "" : "disabled"} aria-label="Forward${next ? ": " + esc(next.name) : ""}" title="${next ? "Forward to " + esc(next.name) : "Forward"}">›</button>
      </span>
      ${trail.length ? `<nav class="wk-trail" aria-label="Terms you came from">${trail.map((t, i) => `<button type="button" class="linkbtn" data-wkhist="${i - trail.length}">${esc(t.name)}</button>`).join(" › ")} › <span>${esc(a.name)}</span></nav>` : ""}
    </div>
    <div class="eyebrow" style="margin-top:10px">${esc(a.cat)}</div>
    <h2>${esc(a.name)}${a.sf ? ` <span class="wk-abbr big">${esc(a.sf)}</span>` : ""}</h2>
    <p class="lede">${a.papers.length ? `In ${a.papers.length} of your papers, ${a.n} mention${a.n === 1 ? "" : "s"}.` : "Not in your papers yet."}${lfs.length ? ` Also written as ${lfs.slice(0, 4).map(l => `<em>${esc(l)}</em>`).join(", ")}.` : ""}</p>
    ${clash.map(([sf, xs]) => `<div class="card wk-flag"><h3>${esc(sf)} means different things in your papers</h3><p class="note">Here it is ${esc(a.name)} (${a.sfs.get(sf)} paper${a.sfs.get(sf) === 1 ? "" : "s"}). Elsewhere: ${xs.map(x => `<button type="button" class="linkbtn" data-wk="${esc(x.a.k)}">${esc(x.a.name)}</button> (${x.c})`).join(", ")}.</p></div>`).join("")}
    ${(own && own.d) || info || defs.length || desc.length || canWrite ? `<div class="card wk-what"><h3>What it is</h3>
      ${own && own.d ? `<p class="wk-def">${wkLinkify(wkSentenceCase(own.d), a.k, seen)}</p><p class="note wk-src">Description written by Claude${own.by === "app" ? " in the app" : ""}; check it against your papers.</p>` : ""}
      ${canWrite ? `<div id="wkWrite" class="wk-write">${S.sample ? `<p class="note">No description yet for this term from your papers.</p><button type="button" class="btn" data-wkwrite="${esc(a.k)}">Write a description with Claude</button>` : `<p class="note">No description yet. With your API key in Settings, Claude can write one.</p>`}</div>` : ""}
      ${info ? `<p class="wk-def">${wkLinkify(info, a.k, seen)}</p>` : ""}
      ${defs.length ? `<h4>In Claude's primers for your papers</h4>${differ ? `<p class="wk-warn" style="margin:6px 0">These definitions don't agree. Check which one fits the paper you're reading.</p>` : ""}
        <ul class="wk-defs">${defs.slice(0, 6).map(d => `<li><span>${wkLinkify(d.def, a.k, seen)}</span> <span class="note">${esc(d.L.label || d.L.title)}</span></li>`).join("")}</ul>` : ""}
      ${desc.length ? `<h4>How your papers describe it</h4><ul class="wk-defs">${desc.map(p => `<li><span>${wkRich(p.q, a, seen)}</span> <button type="button" class="linkbtn note" data-wkopen="${esc(p.L.id)}" data-q="${esc(p.q)}">${esc(p.L.label || p.L.title)}</button></li>`).join("")}</ul>` : ""}
    </div>` : ""}
    ${rels.length || co.length ? `<div class="card wk-conn"><h3>How it connects</h3>
      ${relGroups.size ? `<dl class="wk-rels">${[...relGroups].map(([type, ks]) => `<dt>${esc(type[0].toUpperCase() + type.slice(1))}</dt><dd>${ks.map(k => `<a href="#" class="wk-link" data-wk="${esc(k)}">${esc(WKI.agg.get(k).name)}</a>`).join(", ")}</dd>`).join("")}</dl>` : ""}
      ${wkMapSVG(a, rels, co)}
      ${co.length ? `<p class="note wk-maplegend"><span class="sw rel"></span> how they relate <span class="sw co"></span> often in the same papers</p>
        <div class="wk-co"><span class="note">Often in the same papers:</span> ${co.slice(0, 10).map(c => `<a href="#" class="chip" data-wk="${esc(c.a.k)}">${esc(c.a.name)} <span class="c">${c.both}</span></a>`).join("")}</div>` : ""}
    </div>` : ""}
    ${atlasOK ? `<div class="card wk-atlas" id="wkAtlas">${atlasSheetHTML({ ids, word: a.name })}</div>` : ""}
    ${a.papers.length ? `<div class="card"><h3>In your papers</h3><div class="wk-papers">${a.papers.slice(0, 60).map(p => `<div class="wk-paper">
        <div class="wk-ph"><button type="button" class="linkbtn" data-wkopen="${esc(p.L.id)}"><strong>${esc(p.L.label || p.L.title)}</strong></button><span class="note">${p.n} mention${p.n === 1 ? "" : "s"}${p.sf && p.lf && !a.k.startsWith("a:") ? ` · ${esc(p.sf)} = ${esc(p.lf)}` : ""}</span></div>
        <div class="wk-pt">${esc(p.L.title)}</div>
        <div class="ls-hit wk-quote" role="button" tabindex="0" data-wkopen="${esc(p.L.id)}" data-q="${esc(p.q)}" aria-label="Open ${esc(p.L.label || p.L.title)} at this sentence"><span class="ls-sec">${esc({ ...SEC_NAMES, other: "Text" }[p.sec] || p.sec)}</span>${wkRich(p.q, a, null)}</div>
      </div>`).join("")}${a.papers.length > 60 ? `<p class="note">And ${a.papers.length - 60} more.</p>` : ""}</div></div>` : ""}
  </section>`;
  const at = $("#wkAtlas"); if (at) atlasFill(at, { ids });
}

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
  return spans;
}
// a sentence from a paper: this term in bold, other wiki terms as links
function wkRich(q, a, seen) {
  const self = wkMark(q, a).map(([x, y]) => [x, y, null]);
  const links = [];
  // reuse the linker: collect its spans by rendering into a throwaway set, then merge (self wins over links)
  const tmp = document.createElement("div"); tmp.innerHTML = wkLinkify(q, a.k, new Set(seen));
  let pos = 0; for (const n of tmp.childNodes) { const len = n.textContent.length; if (n.nodeType === 1 && n.dataset.wk) links.push([pos, pos + len, n.dataset.wk]); pos += len; }
  const all = [...self, ...links].sort((x, y) => x[0] - y[0] || (x[2] === null ? -1 : 1));
  let out = "", at = 0;
  for (const [x, y, k] of all) {
    if (x < at) continue;
    if (k && seen && seen.has(k)) continue;
    out += esc(q.slice(at, x)) + (k ? `<a href="#" class="wk-link" data-wk="${esc(k)}">${esc(q.slice(x, y))}</a>` : `<b>${esc(q.slice(x, y))}</b>`); at = y;
    if (k && seen) seen.add(k);
  }
  return out + esc(q.slice(at));
}
// terms that share papers with this one, more than their size alone would explain
/* ---- the hand-written descriptions name other terms as their pages are titled ("fire Simple spike and Complex spike
   activity"); mid-sentence they read better in lower case, except names (Purkinje, Golgi, Parkinson's…) and acronyms ---- */
const WK_PROPER = /^(Purkinje|Golgi|Lugaro|Bergmann|Parkinson|Alzheimer|Huntington|Rett|Angelman|Fragile X|Granger|Drosophila|Cre|DREADD|GABA|NMDA|AMPA|REM|NREM|ADHD|K-complex|VIP|c-Fos|HCN|Pavlov)/;
function wkSentenceCase(text) {
  if (!WKI.nameRe) {
    const names = new Set(Object.keys(typeof WK_DEFS !== "undefined" ? WK_DEFS : {}));
    if (typeof WK_DEFS !== "undefined") for (const d of Object.values(WK_DEFS)) for (const [, t] of d.rel || []) names.add(t);
    if (typeof WK_REGION_REL !== "undefined") for (const l of Object.values(WK_REGION_REL)) for (const [, t] of l) names.add(t);
    const list = [...names].filter(n => /^[A-Z][a-z]/.test(n) && !WK_PROPER.test(n)).sort((x, y) => y.length - x.length);
    WKI.nameRe = list.length ? new RegExp(`(?<=[a-z0-9,;:)] )(?:${list.map(wkEsc).join("|")})(?![\\p{L}\\p{N}])`, "gu") : null;
  }
  return WKI.nameRe ? String(text).replace(WKI.nameRe, m => m[0].toLowerCase() + m.slice(1)) : text;
}
/* ---- descriptions of abbreviation terms: written in advance for the terms your papers have now (wikidefs-abbr.js),
   or by Claude in the app for new ones (kept under "pwread:wkdef:", so they sync with the reading positions) ---- */
const wkDefKey = k => "pwread:wkdef:" + k;
function wkAbbrDef(k) {
  if (typeof WK_ABBR_DEFS !== "undefined" && WK_ABBR_DEFS[k]) return WK_ABBR_DEFS[k];
  try { return JSON.parse(localStorage.getItem(wkDefKey(k)) || "null"); } catch { return null; }
}
async function wkWriteDef(k) {
  const a = WKI.agg && WKI.agg.get(k), out = $("#wkWrite"); if (!a || !out) return;
  if (!claudeReady(out)) return;
  out.innerHTML = `<div class="thinking"><span class="dot"></span>Claude is writing a description of ${esc(a.name)}…</div>`;
  const names = Object.keys(typeof WK_DEFS !== "undefined" ? WK_DEFS : {});
  const prompt = `Write a short reference entry for a personal neuroscience wiki. The term is an abbreviation defined in the reader's papers.
Term: ${a.name}${a.sf ? ` (${a.sf})` : ""}
How the papers use it:
${a.papers.slice(0, 4).map(p => "- " + p.q).join("\n")}

Reply with only JSON: {"title": "the long form in sentence case, singular, properly hyphenated", "d": "2-3 sentences (35-70 words): what it is and why it matters in neuroscience research, in the meaning the papers use; plain English, no citations", "rel": [["type", "target"]]}
rel: 0-4 relations; type is one of: type of, part of, has part, made by, releases, acts on, measured with, used to study, involved in, disrupted in, projects to, receives from, opposite of, related to. target must be exactly one of these wiki terms: ${names.join("; ")}.`;
  try {
    const j = await S.sample.json(prompt, { maxTokens: 600, cache: { gcTime: 864e5 * 365 } });
    if (!j || typeof j.d !== "string") throw { code: "invalid_json" };
    const rel = (Array.isArray(j.rel) ? j.rel : []).filter(r => Array.isArray(r) && WK_INVERSE[r[0]] && names.includes(r[1])).slice(0, 4);
    try { localStorage.setItem(wkDefKey(k), JSON.stringify({ t: Date.now(), title: typeof j.title === "string" ? j.title.trim() : "", d: j.d.trim(), rel, by: "app" })); } catch {}
    WKI.rels = null; WKI.agg = null; await wkReady();
    if (S.view === "wiki" && S.wk === k) render();
  } catch (e) { out.innerHTML = `<p class="note">${esc(errCopy(e))}</p><button type="button" class="btn" data-wkwrite="${esc(k)}">Try again</button>`; claudeOff(e); }
}
/* ---- links: wiki terms inside any wiki text become links to their pages (the first mention of each, like Wikipedia) ---- */
function wkLinker() {
  if (WKI.linker) return WKI.linker;
  const reg = wkRegions(), lfAlt = [], lfKey = new Map();
  // abbreviation pages: by their usual long form
  for (const a of WKI.agg.values()) if (a.k.startsWith("a:") && a.show) for (const l of wkTop(a.lfs).slice(0, 2)) if (l.length > 5) { lfKey.set(wkNorm(l), a.k); lfAlt.push(l); }
  const lfRe = lfAlt.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...new Set(lfAlt)].sort((x, y) => y.length - x.length).map(wkPat).join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
  WKI.linker = { reg, lfRe, lfKey };
  return WKI.linker;
}
const wkHas = k => k && WKI.agg && WKI.agg.has(k);
function wkLinkify(text, selfKey, seen) {
  const t = String(text || ""); if (!WKI.agg) return esc(t);
  const { reg, lfRe, lfKey } = wkLinker(), spans = [];
  const add = (re, keyOf) => { if (!re) return; re.lastIndex = 0; let m; while ((m = re.exec(t))) { const k = keyOf(m[0]); if (wkHas(k) && k !== selfKey) spans.push([m.index, m.index + m[0].length, k]); } };
  add(WK.reCI, w => WK.normKey.get(wkNorm(w)));
  add(WK.reCS, w => WK.cond.has(w) ? null : WK.cs.get(w));          // ambiguous short forms (CS, PD…) aren't linked
  if (reg) { add(reg.reCI, w => { const e = reg.byCI.get(w.toLowerCase()); return e && wkRegionKey(e); }); add(reg.reCS, w => { const e = reg.byCS.get(w); return e && wkRegionKey(e); }); }
  add(lfRe, w => lfKey.get(wkNorm(w)));
  spans.sort((x, y) => x[0] - y[0] || (y[1] - y[0]) - (x[1] - x[0]));
  seen = seen || new Set();
  let out = "", at = 0;
  for (const [a, b, k] of spans) {
    if (a < at) continue;
    if (seen.has(k)) continue;                          // link a term once per text block
    seen.add(k);
    out += esc(t.slice(at, a)) + `<a href="#" class="wk-link" data-wk="${esc(k)}">${esc(t.slice(a, b))}</a>`; at = b;
  }
  return out + esc(t.slice(at));
}
/* ---- connections: typed relations (hand-written, wikidefs.js), both directions, and the atlas hierarchy ---- */
const WK_INVERSE = { "type of": "kinds", "part of": "has part", "has part": "part of", "made by": "makes", "releases": "released by", "acts on": "acted on by",
  "measured with": "measures", "used to study": "studied with", "involved in": "involves", "disrupted in": "disrupts", "projects to": "receives from",
  "receives from": "projects to", "opposite of": "opposite of", "related to": "related to" };
function wkTargetKey(name) {
  const v = "v:" + wkNorm(name); if (WK.terms.has(v)) return v;
  const r = typeof wkRegionOf === "function" ? wkRegionOf(name) : null; if (r) return r;
  for (const a of WKI.agg.values()) if (a.name === name) return a.k;
  return null;
}
function wkRelsOf(a) {
  if (!WKI.rels) {                                    // all hand-written relations as edges between keys, built once
    const edges = [];
    const push = (from, list) => { for (const [type, target] of list || []) { const to = wkTargetKey(target); if (from && to && from !== to) edges.push({ from, to, type }); } };
    if (typeof WK_DEFS !== "undefined") for (const [name, d] of Object.entries(WK_DEFS)) push("v:" + wkNorm(name), d.rel);
    for (const a of WKI.agg.values()) if (a.k.startsWith("a:")) { const ab = wkAbbrDef(a.k); if (ab && ab.rel) push(a.k, ab.rel); }
    if (typeof WK_REGION_REL !== "undefined") for (const [acr, list] of Object.entries(WK_REGION_REL)) { const id = ATL.byA && ATL.byA[acr]; if (id != null) push(wkRegionKey({ ids: [id] }), list); }
    WKI.rels = edges;
  }
  const out = [], seen = new Set();
  const keysOf = k => { const ks = [k]; if (k.startsWith("r:")) for (const id of k.slice(2).split("+")) ks.push("r:" + id); return ks; };
  const mine = new Set(keysOf(a.k));
  for (const e of WKI.rels) {
    // each connected term once: its own relation first, then the other side's (GABA "made by" Purkinje cell = Purkinje cell "releases" GABA)
    if (mine.has(e.from)) { if (!seen.has(e.to)) { seen.add(e.to); out.push({ type: e.type, k: e.to }); } }
  }
  for (const e of WKI.rels) if (mine.has(e.to) && !seen.has(e.from)) { seen.add(e.from); out.push({ type: WK_INVERSE[e.type] || "related to", k: e.from }); }
  // brain regions: where it sits in the atlas, and its parts that your papers mention
  if (a.k.startsWith("r:")) {
    const ids = a.k.slice(2).split("+").map(Number), lin = atlasLineage(ids[0]).slice(1);
    const parent = lin.map(id => [...WKI.agg.keys()].find(k => k.startsWith("r:") && k.slice(2).split("+").map(Number).includes(id))).find(Boolean);
    if (parent && !seen.has(parent)) { seen.add(parent); out.push({ type: "part of", k: parent }); }
    for (const b of WKI.agg.values()) if (b.show && b.k.startsWith("r:") && b !== a) { const bid = +b.k.slice(2).split("+")[0]; const l = atlasLineage(bid); if (l[1] != null && ids.includes(l[1]) && !seen.has(b.k)) { seen.add(b.k); out.push({ type: "has part", k: b.k }); } }
  }
  return out.filter(r => wkHas(r.k));
}
// a small map: the term in the middle, its relations (solid) and the terms most often in the same papers (dashed)
function wkMapSVG(a, rels, co) {
  const nodes = [], have = new Set([a.k]);
  for (const r of rels) if (!have.has(r.k) && nodes.length < 8) { have.add(r.k); nodes.push({ k: r.k, label: WKI.agg.get(r.k).name, kind: "rel", type: r.type }); }
  for (const c of co) if (!have.has(c.a.k) && nodes.length < 10) { have.add(c.a.k); nodes.push({ k: c.a.k, label: c.a.name, kind: "co", type: `${c.both} shared papers` }); }
  if (!nodes.length) return "";
  const W = 660, H = 420, cx = W / 2, cy = H / 2, rx = 245, ry = 165;
  const short = s => s.length > 22 ? s.slice(0, 21) + "…" : s;
  const pts = nodes.map((n, i) => { const ang = -Math.PI / 2 + i * 2 * Math.PI / nodes.length; return { ...n, x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) }; });
  return `<svg class="wk-map" viewBox="0 0 ${W} ${H}" role="group" aria-label="How ${esc(a.name)} connects to other terms">
    ${pts.map(p => `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" class="${p.kind}"/>`).join("")}
    ${pts.map(p => p.kind === "rel" ? `<text class="lbl" x="${((cx + p.x) / 2).toFixed(1)}" y="${((cy + p.y) / 2 - 4).toFixed(1)}" text-anchor="middle">${esc(p.type)}</text>` : "").join("")}
    <g class="me"><rect x="${cx - 90}" y="${cy - 17}" width="180" height="34" rx="17"/><text x="${cx}" y="${cy + 5}" text-anchor="middle">${esc(short(a.name))}</text></g>
    ${pts.map(p => `<a href="#" data-wk="${esc(p.k)}" class="node ${p.kind}"><title>${esc(p.label)} · ${esc(p.type)}</title><rect x="${(p.x - 78).toFixed(1)}" y="${(p.y - 15).toFixed(1)}" width="156" height="30" rx="15"/><text x="${p.x.toFixed(1)}" y="${(p.y + 5).toFixed(1)}" text-anchor="middle">${esc(short(p.label))}</text></a>`).join("")}
  </svg>`;
}
/* ---- moving between terms: back and forward, like a browser ---- */
function wkGo(k, fromHistory) {
  if (!fromHistory) {
    S.wkHist = (S.wkHist || []).slice(0, (S.wkPos ?? -1) + 1);
    if (S.wkHist[S.wkHist.length - 1] !== k) S.wkHist.push(k);
    if (S.wkHist.length > 50) S.wkHist.shift();
    S.wkPos = S.wkHist.length - 1;
  }
  S.wk = k; S.view = "wiki"; render(); window.scrollTo(0, 0);
}
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
  const t = e.target.closest && e.target.closest("[data-wk], [data-wkwrite], [data-wkhist], [data-wkcat], [data-wkopen], [data-wk-read], .wk .atl-view");
  if (!t) return;
  if (t.matches(".atl-view")) { atlasZoom(t); return; }
  if (t.dataset.wk !== undefined) { e.preventDefault(); wkGo(t.dataset.wk); return; }
  if (t.dataset.wkwrite !== undefined) { e.preventDefault(); wkWriteDef(t.dataset.wkwrite); return; }
  if (t.dataset.wkhist !== undefined) { const p = (S.wkPos ?? 0) + +t.dataset.wkhist; if (S.wkHist && S.wkHist[p]) { S.wkPos = p; wkGo(S.wkHist[p], true); } return; }
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
// the quoted sentences open their paper: by keyboard too
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".wk-quote")) { e.preventDefault(); e.target.click(); } });
document.addEventListener("input", e => { if (e.target.id === "wkQ") { WKI.q = e.target.value; clearTimeout(WKI.t); WKI.t = setTimeout(wkList, 150); } });
document.addEventListener("change", e => { if (e.target.id === "wkSort") { WKI.sort = e.target.value; wkList(); } });
