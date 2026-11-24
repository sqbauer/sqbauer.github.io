"use strict";
/* ---------- Mouse brain sections: the whole brain-sections app inside Panelwise ----------
   www/brain is sqbauer.github.io/brain-sections, bundled by scripts/brain.mjs (offline: sections at any coordinate,
   dorsal and 3D views, implants, SVG/PNG export). It runs in a full-screen frame; its own "Back to Panelwise" link
   and Escape close it. Its state lives in the frame's URL hash, so a region from a paper opens with it highlighted.
   The web version has no copy: it opens the site's page. */

const BRAIN = { el: null, frame: null, back: null };
const BRAIN_SITE = "https://sqbauer.github.io/brain-sections/";

function brainOpen(hash, from) {
  if (PW.single) { window.open(BRAIN_SITE + (hash ? "#" + hash : ""), "_blank", "noopener"); return; }
  if (!BRAIN.el) {
    BRAIN.el = document.createElement("div"); BRAIN.el.className = "brain-wrap"; BRAIN.el.hidden = true;
    BRAIN.el.setAttribute("role", "dialog"); BRAIN.el.setAttribute("aria-modal", "true"); BRAIN.el.setAttribute("aria-label", "Mouse brain sections");
    BRAIN.frame = document.createElement("iframe"); BRAIN.frame.title = "Mouse brain sections";
    BRAIN.el.appendChild(BRAIN.frame); document.body.appendChild(BRAIN.el);
  }
  BRAIN.back = from || document.activeElement;
  // the page reads its hash once when it loads: a new hash means a fresh load; no hash keeps where you were
  if (hash || !BRAIN.frame.src) BRAIN.frame.src = `brain/index.html?t=${Date.now()}` + (hash ? "#" + hash : "");
  BRAIN.el.hidden = false; document.documentElement.classList.add("brain-open");
  requestAnimationFrame(() => BRAIN.frame.focus());
}
function brainClose() {
  if (!BRAIN.el || BRAIN.el.hidden) return;
  BRAIN.el.hidden = true; document.documentElement.classList.remove("brain-open");
  if (BRAIN.back && BRAIN.back.isConnected) BRAIN.back.focus({ preventScroll: true });
}
// the page's SVG/PNG downloads: the Share sheet in the app (Save to Files, AirDrop, Mail…), a normal download in a browser
async function brainSaveFile(blob, name) {
  if (PW.native && PW.plugin && PW.plugin.shareFile) {
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
      await PW.plugin.shareFile({ name, data: b64 });
    } catch (e) { if (!/cancel/i.test((e && e.message) || "")) toast("Couldn't share the file."); }
    return;
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// a region's link into brain-sections, as atlas.js builds it: open that inside the app
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest(`a[href^="${BRAIN_SITE}"]`); if (!a || PW.single) return;
  e.preventDefault(); e.stopPropagation();
  brainOpen(a.getAttribute("href").split("#")[1] || "", a);
}, true);
document.addEventListener("keydown", e => { if (e.key === "Escape" && BRAIN.el && !BRAIN.el.hidden) { e.preventDefault(); brainClose(); } });

/* ---------- the region panel: papers that mention a region, and its inputs and outputs ----------
   Hovering a region in the brain sections shows it here (when nothing is pinned); clicking pins it and reads the
   papers that mention it for sentences that describe connections ("X projects to Y", "Y receives input from X").
   Regions per paper come from the library index (connect.js: ixRegions), so the paper list is instant. */
const BR = { el: null, id: null, pinned: false, conn: new Map(), gen: 0 };
const BR_CUE = /\b(project\w*|efferent\w*|afferent\w*|inputs?|outputs?|innervat\w*|targets?|targeted|targeting|terminals?|axons?|sends?|sent|sending|receiv\w*|relay\w*|monosynaptic|disynaptic|connect\w*|pathways?|fib(?:er|re)s)\b/i;
const brSub = id => { const s = new Set([+id]); for (const [k] of Object.entries(ATL.idx.structures)) if (atlasLineage(+k).includes(+id)) s.add(+k); return s; };
// papers whose indexed regions fall in this region (or its subregions), most mentions first
function brPapers(id) {
  const D = brSub(id), out = [];
  for (const L of ixPapers()) {
    const regs = (IX.map.get(L.id) || {}).regions || {}; let n = 0;
    for (const [k, c] of Object.entries(regs)) if (D.has(+k)) n += c;
    if (n) out.push({ L, n });
  }
  return out.sort((a, b) => b.n - a.n);
}
// region names in a sentence, with where they are: [{ i, ids }]
function brMentions(t) {
  if (!IX.reCI) ixRegions({ abstract: "", sections: {} });             // builds the region-name patterns
  const out = [];
  for (const [re, get] of [[IX.reCI, w => IX.byCI.get(w.toLowerCase())], [IX.reCS, w => IX.byCS.get(w)]]) {
    if (!re) continue; re.lastIndex = 0; let m;
    while ((m = re.exec(t))) { const e = get(m[1]); if (e) out.push({ i: m.index, end: m.index + m[1].length, ids: e.ids, word: m[1] }); }
  }
  return out.sort((a, b) => a.i - b.i);
}
// which way: "out" (the region sends to the other), "in" (it receives from it), or null
function brDir(t, r, o) {
  const before = x => t.slice(Math.max(0, x.i - 40), x.i);
  if (/\bfrom\s+(?:the\s+|its\s+|both\s+|contralateral\s+|ipsilateral\s+)?$/i.test(before(o))) return "in";
  if (/\bfrom\s+(?:the\s+|its\s+|both\s+|contralateral\s+|ipsilateral\s+)?$/i.test(before(r))) return "out";
  if (/\b(?:to|onto|into|towards?|in)\s+(?:the\s+|its\s+|both\s+|contralateral\s+|ipsilateral\s+)?$/i.test(before(o)) && r.i < o.i) return "out";
  if (/\b(?:to|onto|into|towards?)\s+(?:the\s+|its\s+|both\s+|contralateral\s+|ipsilateral\s+)?$/i.test(before(r)) && o.i < r.i) return "in";
  const mid = t.slice(Math.min(r.end, o.end), Math.max(r.i, o.i));
  if (/\breceiv\w*/i.test(mid)) return r.i < o.i ? "in" : "out";
  if (/\b(project\w*|sends?|sent|innervat\w*|targets?|efferents?|outputs?|axons?)\b/i.test(mid)) return r.i < o.i ? "out" : "in";
  return null;
}
async function brConnections(id, gen) {
  const D = brSub(id), up = new Set(atlasLineage(+id)), res = { in: new Map(), out: new Map(), read: 0 };
  const papers = brPapers(id).slice(0, 60);
  for (const { L } of papers) {
    if (gen !== BR.gen) return null;
    const file = L.g.file && fileForGroup(L.g); if (!file) continue;
    let raw = null; try { raw = await PW.be.get(PW_TEXT_COL, pwTextKey(file)); } catch {}
    if (!raw) continue; res.read++;
    const paras = [raw.abstract || "", ...Object.entries(raw.sections || {}).filter(([k]) => k !== "methods").flatMap(([, v]) => v)];
    for (const p of paras) for (const t of p.split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
      if (t.length > 450 || !BR_CUE.test(t)) continue;
      const ms = brMentions(t), rs = ms.filter(m => m.ids.some(x => D.has(+x))); if (!rs.length) continue;
      for (const o of ms) {
        if (o.ids.some(x => D.has(+x) || up.has(+x))) continue;
        const dir = rs.map(r => brDir(t, r, o)).find(Boolean); if (!dir) continue;
        const key = o.ids.join(","), m = res[dir];
        if (!m.has(key)) m.set(key, { ids: o.ids, papers: new Map() });
        const e = m.get(key); if (!e.papers.has(L.id)) e.papers.set(L.id, { L, quote: t });
      }
    }
    await new Promise(r => setTimeout(r, 0));
  }
  return res;
}
function brRowsHTML(m, dir) {
  const list = [...m.values()].sort((a, b) => b.papers.size - a.papers.size);
  if (!list.length) return `<p class="note">None found in your papers.</p>`;
  return `<ul class="br-conn">${list.slice(0, 25).map(e => `<li><details><summary><button type="button" class="br-reg" data-br-go="${e.ids[0]}">${esc(atlasName(e.ids))}</button><span class="note">${e.papers.size} paper${e.papers.size === 1 ? "" : "s"}</span></summary>
    <ul>${[...e.papers.values()].slice(0, 8).map(p => `<li><button type="button" class="br-paper" data-br-open="${esc(p.L.id)}" data-q="${esc(p.quote.slice(0, 120))}"><span class="t">${esc(p.L.title || p.L.g.name)}</span><span class="q">“${esc(p.quote.length > 220 ? p.quote.slice(0, 210) + "…" : p.quote)}”</span></button></li>`).join("")}</ul></details></li>`).join("")}</ul>`;
}
function brPanel() {
  if (BR.el) return BR.el;
  BR.el = document.createElement("aside"); BR.el.className = "brain-reg"; BR.el.hidden = true; BR.el.setAttribute("aria-label", "Brain region");
  BRAIN.el.appendChild(BR.el);
  BR.el.addEventListener("click", e => {
    const t = e.target.closest("button, [data-br-close]"); if (!t || t.tagName === "A") return;
    if (t.dataset.brClose) { brColour(null); BR.el.hidden = true; BR.pinned = false; BR.id = null; BRAIN.el.classList.remove("reg-open"); return; }
    if (t.dataset.brGo) { e.preventDefault(); brainRegion(+t.dataset.brGo, "click"); return; }
    if (t.dataset.brOpen) { const L_ = ixPapers().find(x => x.id === t.dataset.brOpen); if (L_) { brainClose(); ixOpen(L_, t.dataset.q || ""); } return; }
    if (t.dataset.brClaude) brClaude(BR.id, t);
    if (t.dataset.brCol) brColour(t.dataset.brCol);
  });
  return BR.el;
}
// from the brain-sections frame (panelwise.js): a region under the pointer, or clicked
async function brainRegion(id, kind) {
  if (kind === "hover" && BR.pinned) return;
  await Promise.all([atlasLoad(), ixLoad()]);
  const s = atlasS(id); if (!s) return;
  if (kind === "hover" && BR.id === id) return;
  BR.id = id; BR.pinned = kind === "click"; const gen = ++BR.gen, el = brPanel();
  const path = atlasLineage(id).slice(1).reverse().map(i => atlasS(i)).filter(x => x && x.a !== "root" && x.a !== "grey").map(x => x.n);
  let ps = brPapers(id), note = "";
  if (!ps.length) { const up = atlasLineage(id).slice(1).find(u => atlasS(u) && atlasS(u).a !== "root" && brPapers(u).length); if (up) { ps = brPapers(up); note = `No paper names ${s.n} itself; these mention ${atlasS(up).n}.`; } }
  const nIx = IX.map.size, nLib = ixPapers().length;
  el.innerHTML = `<header class="br-h"><div><div class="eyebrow">${BR.pinned ? "Brain region" : "Brain region · click to keep it here"}</div><h2>${esc(s.n)} <span class="br-acr">${esc(s.a)}</span></h2>${path.length ? `<div class="note">${esc(path.slice(-3).join(" › "))}</div>` : ""}</div><button type="button" class="btn quiet" data-br-close="1" aria-label="Close">✕</button></header>
    <div class="br-body"><h3>Papers that mention it <span>${ps.length}</span></h3>${note ? `<p class="note">${esc(note)}</p>` : ""}
    ${ps.length ? `<ul class="br-list">${ps.slice(0, 40).map(p => `<li><button type="button" class="br-paper" data-br-open="${esc(p.L.id)}" data-q=""><span class="t">${esc(p.L.title || p.L.g.name)}</span><span class="note">${esc([p.L.year, p.n + " mention" + (p.n === 1 ? "" : "s")].filter(Boolean).join(" · "))}</span></button></li>`).join("")}</ul>` : `<p class="note">No paper in your library mentions it${nIx < nLib ? ` yet (${nIx} of ${nLib} papers are indexed; Search inside all papers reads the rest)` : ""}.</p>`}
    <div id="brConn">${BR.pinned ? `<div class="thinking"><span class="dot"></span>Reading these papers for its inputs and outputs…</div>` : `<p class="note">Click the region to see its inputs and outputs in these papers.</p>`}</div>
    <div id="brClaude"></div></div>`;
  el.hidden = false; BRAIN.el.classList.add("reg-open");
  if (BR.on.in || BR.on.out) brColour(null);                           // a new region: earlier input/output colours go
  if (!BR.pinned) return;
  brKnownShow(id);
  const key = id + "|" + nIx;
  let res = BR.conn.get(key); if (!res) { res = await brConnections(id, gen); if (!res) return; BR.conn.set(key, res); }
  if (gen !== BR.gen) return;
  BR.lib = res; brColourButtons();
  const box = $("#brConn", el); if (!box) return;
  box.innerHTML = `<h3>In your papers: inputs <span>regions that project to it</span></h3>${brRowsHTML(res.in, "in")}
    <h3>In your papers: outputs <span>regions it projects to</span></h3>${brRowsHTML(res.out, "out")}
    <p class="note br-how">From sentences in ${res.read} of your papers that name both regions with a word like “projects”, “input” or “receives”. Open a sentence to check it.</p>`;
}

/* ---- known connections with the papers that show them: bundled (brainconn.json, made with Claude and every
   reference checked against OpenAlex) or from a deep search in the app (stored in the "brainconn" collection, which
   syncs between your devices). One shape: {inputs: [{acronym, region, note, refs: [{doi, title, first_author, year}]}], outputs} ---- */
let BR_BUNDLE = null;
const brBundle = () => BR_BUNDLE || (BR_BUNDLE = fetch("brainconn.json").then(r => r.ok ? r.json() : {}).catch(() => ({})));
async function brKnown(id) {
  const a = atlasS(id).a;
  let mine = null; try { mine = PW.be && await PW.be.get("brainconn", a); } catch {}
  if (mine) return mine;
  const b = await brBundle(); return b.regions && b.regions[a] ? { ...b.regions[a], source: "bundled", date: b.date } : null;
}
const brPartner = c => { const id = c.acronym && ATL.byA[c.acronym] != null ? ATL.byA[c.acronym] : (typeof atlasMatch === "function" && atlasMatch(c.region || "") || {}).ids?.[0]; return id != null ? +id : null; };
// a reference: open it from the library when you have it, else its DOI page
function brRefHTML(r) {
  const have = typeof oaInLibrary === "function" ? oaInLibrary({ doi: r.doi ? "https://doi.org/" + r.doi : "", title: r.title || "" }) : null;
  const label = `${esc(r.first_author || "")}${r.year ? " " + esc(String(r.year)) : ""}`;
  return have ? `<button type="button" class="br-ref have" data-br-open="${esc(have.id)}" data-q="" title="${esc(r.title || "")}">${label} <span>in your library</span></button>`
    : `<a class="br-ref" href="https://doi.org/${esc(r.doi || "")}" target="_blank" rel="noopener" title="${esc(r.title || "")}">${label} ↗</a>`;
}
function brKnownHTML(k) {
  const rows = list => list && list.length ? `<ul class="br-known">${list.map(c => { const pid = brPartner(c);
    return `<li><div>${pid != null ? `<button type="button" class="br-reg" data-br-go="${pid}">${esc(c.region || c.acronym)}</button>` : `<b>${esc(c.region || c.acronym)}</b>`}${c.acronym ? ` <span class="br-acr">${esc(c.acronym)}</span>` : ""}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}<div class="br-refs">${(c.refs || []).map(brRefHTML).join("")}</div></li>`; }).join("")}</ul>` : `<p class="note">None listed.</p>`;
  const src = k.source === "bundled" ? "Prepared with Claude; every paper checked against OpenAlex" : `Deep search with Claude${k.date ? ", " + new Date(k.date).toLocaleDateString() : ""}; every paper checked against OpenAlex`;
  return `<h3>Known inputs <span>with the papers that show them</span></h3>${rows(k.inputs)}<h3>Known outputs</h3>${rows(k.outputs)}<p class="note br-how">${src}${k.dropped ? ` (${k.dropped} references that couldn't be found were left out)` : ""}. Check the papers; a connection can be species- or method-specific.</p>`;
}
async function brKnownShow(id) {
  const box = $("#brClaude", BR.el); if (!box) return;
  const k = await brKnown(id); if (BR.id !== id) return;
  BR.known = k; brColourButtons();
  box.innerHTML = (k ? brKnownHTML(k) : "") + (S.sample ? `<button type="button" class="btn" data-br-claude="1">${k ? "Deep search again (Claude)" : "Deep search for inputs and outputs (Claude)"}</button><p class="note br-how">Uses your Claude key: lists the region's inputs and outputs with the papers that show them, checks each paper in OpenAlex and saves the result.</p>` : k ? "" : `<p class="note">Add a Claude key in Settings for a deep search of its inputs and outputs.</p>`);
}
// verify references through OpenAlex: keep the ones whose DOI exists with a matching title
async function brVerify(conns) {
  const refs = conns.flatMap(c => c.refs || []).filter(r => r && r.doi);
  const dois = [...new Set(refs.map(r => r.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, "")))], found = new Map();
  for (let i = 0; i < dois.length; i += 40) {
    try {
      const j = await oaJSON(`${OA_API}/works?filter=doi:${dois.slice(i, i + 40).map(encodeURIComponent).join("|")}&per-page=50&select=doi,title,publication_year,authorships`);
      for (const w of j.results || []) found.set((w.doi || "").toLowerCase().replace(/^https?:\/\/doi\.org\//, ""), w);
    } catch {}
  }
  let dropped = 0;
  for (const c of conns) c.refs = (c.refs || []).filter(r => {
    const w = r && r.doi && found.get(r.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, ""));
    if (!w || inRefOf(w, r.title || "") < .6) { dropped++; return false; }
    const au = (w.authorships || [])[0]; r.title = w.title; r.year = w.publication_year || r.year;
    if (au && au.author) r.first_author = au.author.display_name.split(/\s+/).pop(); r.doi = r.doi.replace(/^https?:\/\/doi\.org\//i, ""); return true;
  });
  return dropped;
}
async function brClaude(id, btn) {
  const s = atlasS(id); if (!s || !S.sample) return;
  btn.disabled = true; btn.textContent = "Claude is searching…";
  try {
    const j = await S.sample.json(`For the mouse brain region "${s.n}" (${s.a}, Allen Mouse Brain Atlas): list its main established INPUT regions (that project to it) and OUTPUT regions (that it projects to), mouse first, rat where mouse data is lacking. For each connection give 1-3 key papers that show it (tracing or anatomy studies, or authoritative reviews), with DOI.
Reply with only JSON: {"inputs": [{"acronym": "Allen acronym", "region": "Allen atlas name", "note": "under 12 words: cell type, pathway or what it carries", "refs": [{"doi": "10....", "title": "...", "first_author": "Surname", "year": 2015}]}], "outputs": [...]}
Up to 12 of each, best established first. Only papers you are sure exist with the correct DOI: each one is checked and unmatched ones are dropped.`, { maxTokens: 4000 });
    if (!j || (!j.inputs && !j.outputs)) throw new Error("empty");
    btn.textContent = "Checking the papers in OpenAlex…";
    const all = [...(j.inputs || []), ...(j.outputs || [])], dropped = await brVerify(all);
    const k = { inputs: j.inputs || [], outputs: j.outputs || [], source: "claude", date: Date.now(), dropped };
    try { await PW.be.put("brainconn", s.a, k); } catch {}
    if (BR.id === id) brKnownShow(id);
  } catch (e) { btn.disabled = false; btn.textContent = "Deep search for inputs and outputs (Claude)"; toast((e && e.code && errCopy(e)) || "The deep search didn't work just now. Try again."); }
}

/* ---- colour the inputs or outputs in the drawing (brain-sections' own highlights, through panelwise.js) ---- */
const BR_COL = { in: "#2f6fdb", out: "#e8902a" };
BR.on = { in: false, out: false };
function brIds(dir) {
  const ids = new Set();
  for (const c of (BR.known && BR.known[dir === "in" ? "inputs" : "outputs"]) || []) { const p = brPartner(c); if (p != null) ids.add(p); }
  for (const e of ((BR.lib && BR.lib[dir]) || new Map()).values()) ids.add(+e.ids[0]);
  ids.delete(+BR.id); return [...ids];
}
function brColour(dir) {
  const w = BRAIN.frame && BRAIN.frame.contentWindow; if (!w || !w.pwHighlight) return;
  if (dir == null) { BR.on = { in: false, out: false }; w.pwHighlight("in", [], BR_COL.in); w.pwHighlight("out", [], BR_COL.out); brColourButtons(); return; }
  BR.on[dir] = !BR.on[dir]; w.pwHighlight(dir, BR.on[dir] ? brIds(dir) : [], BR_COL[dir]); brColourButtons();
}
function brColourButtons() {
  const el = BR.el; if (!el || !BR.pinned) return;
  let bar = $(".br-colour", el);
  if (!bar) { bar = document.createElement("div"); bar.className = "br-colour"; $(".br-body", el)?.prepend(bar); }
  const n = { in: brIds("in").length, out: brIds("out").length };
  bar.innerHTML = ["in", "out"].map(d => `<button type="button" class="btn ${BR.on[d] ? "on" : ""}" data-br-col="${d}" ${n[d] ? "" : "disabled"} aria-pressed="${BR.on[d]}"><i style="background:${BR_COL[d]}"></i>${BR.on[d] ? "Uncolour" : "Colour"} ${d === "in" ? "inputs" : "outputs"} (${n[d]})</button>`).join("");
}
