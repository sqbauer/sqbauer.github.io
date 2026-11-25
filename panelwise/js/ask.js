"use strict";
/* ---------- Ask your library: a question or a statement, answered from your own papers ----------
   1. Claude (the fast model) turns the words into search terms: synonyms, abbreviations, subregions. Without a
      key the atlas and the words themselves are used.
   2. The full-text index (askindex.js) returns the best passages of the best ~8 papers: milliseconds.
   3. Claude reads only those passages and answers (or, for a statement, says whether they support it), citing
      them by number. Quotes are checked against the passages, so nothing it cites can be made up.
   Each result opens at its figure and panel, or at its sentence. Questions and results are saved ("ask~"
   documents, synced). Beyond the library: OpenAlex and Europe PMC suggestions, and known brain connections. */
const ASK = { q: "", cur: null, busy: false, stage: "", ctl: null, outside: null };
D.asks = D.asks || new Map();
const askId = q => "ask~" + Array.from(askClean(q).toLowerCase()).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36) + "-" + askClean(q).length;
const askList = () => [...D.asks.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
const VERDICTS = { supported: ["Supported", "j-yes"], partly: ["Partly supported", "j-part"], contradicted: ["Contradicted", "j-no"], not_found: ["Not found in your library", "st-aside"] };

function askOpen(q) {
  S.view = "ask"; ASK.cur = null; ASK.outside = null;
  if (q) { ASK.q = q; const saved = D.asks.get(askId(q)); if (saved) ASK.cur = saved; else { render(); askRun(q); return; } }
  render(); window.scrollTo(0, 0);
}

/* ---- 1. the search plan ---- */
// atlas: regions named in the text, with their names, acronyms and (for a big region) its main parts
async function askAtlasExpand(q) {
  if (typeof atlasLoad !== "function") return [];
  try { await atlasLoad(); } catch { return []; }
  if (!ATL.idx) return [];
  const out = [];
  for (const e of atlasFindIn(q).slice(0, 4)) {
    const terms = new Set([e.word]);
    for (const id of e.ids) {
      const s = atlasS(id); if (!s) continue;
      terms.add(s.n.replace(/\s*\([^)]*\)\s*$/, "")); if (s.a && s.a.length >= 2) terms.add(s.a);
      // children one level down (the cerebellum's nuclei, the thalamus' nuclei groups), named ones only
      for (const [cid, c] of Object.entries(ATL.idx.structures)) if (c.p === +id && c.n && terms.size < 14) terms.add(c.n.replace(/\s*\([^)]*\)\s*$/, ""));
    }
    out.push({ name: e.word, terms: [...terms].filter(t => t.length > 1) });
  }
  return out;
}
async function askPlan(q) {
  const regs = await askAtlasExpand(q);
  const local = askLocalPlan(q, () => regs);
  if (!S.sample) return local;
  const prompt = `Turn a neuroscience researcher's question or statement into a search plan for full-text search over their papers. Reply with only JSON:
{"kind": "question" or "claim", "concepts": [{"name": "short name", "w": 1 or 0.5, "terms": ["..."]}]}
Rules:
- 2 to 5 concepts. The essential ones w=1; supporting ones (a direction such as ipsilateral, a method, a body part when the brain region is the point) w=0.5.
- Each concept 3 to 12 terms: the words and phrases papers actually use for it, synonyms, abbreviations, singular and plural, adjective forms (cerebellum, cerebellar), British and US spelling. A stem may end with * (at least 5 letters before it).
- For a brain region include its subregions and their abbreviations (e.g. cerebellar output: deep cerebellar nuclei, DCN, interpositus, interposed nucleus, dentate nucleus, fastigial nucleus). Write lobules both ways (lobule IV/V, lobules 4/5, anterior vermis).
- No generic words (study, mice, show, effect).
TEXT: ${q}`;
  try {
    const p = await S.sample.json(prompt, { model: PW_MODEL_FAST, maxTokens: 1500, effort: "low", cache: { gcTime: 864e5 * 90 } });
    const concepts = (p.concepts || []).filter(c => c && Array.isArray(c.terms) && c.terms.length).map(c => ({ name: String(c.name || c.terms[0]), w: c.w === 0.5 ? 0.5 : 1, terms: c.terms.map(String).slice(0, 14) }));
    if (!concepts.length) return local;
    // the atlas' names join the concept they belong to (or come as their own)
    for (const r of regs) {
      const c = concepts.find(c => c.terms.some(t => r.terms.some(x => x.toLowerCase() === String(t).toLowerCase())));
      if (c) c.terms = [...new Set([...c.terms, ...r.terms])].slice(0, 20); else concepts.push({ name: r.name, w: 1, terms: r.terms });
    }
    return { kind: p.kind === "question" ? "question" : p.kind === "claim" ? "claim" : local.kind, concepts };
  } catch (e) { if (e && e.code === "cancelled") throw e; PW.log.error("ask plan", e); return local; }
}

/* ---- 3. Claude reads the passages ---- */
const askLabelOf = id => { const L_ = ixPapers().find(x => x.id === id); return L_ ? (L_.label || L_.title) : (recOf(id) || {}).title || "A paper"; };
const askTitleOf = id => { const L_ = ixPapers().find(x => x.id === id); return L_ ? L_.title : (recOf(id) || {}).title || ""; };
const SEC_LABEL = { abstract: "Abstract", intro: "Introduction", results: "Results", discussion: "Discussion", methods: "Methods", other: "Text", legend: "Figure legend" };
function askWhere(p) { return [SEC_LABEL[p.sec] || "Text", p.fig ? `Fig. ${p.fig}${p.panels || ""}` : ""].filter(Boolean).join(" · "); }
async function askAnswer(q, plan, passages, refresh) {
  const list = passages.map((p, i) => `[${i + 1}] ${askLabelOf(p.paper)} — ${askTitleOf(p.paper)} · ${askWhere(p)}\n${p.text}`).join("\n\n");
  const prompt = `A neuroscience researcher ${plan.kind === "claim" ? "wants to check a STATEMENT they are writing" : "asks a QUESTION"}. Use ONLY the numbered passages below, from papers in their own library. Do not use outside knowledge for facts; if the passages don't settle it, say so.
Reply with only JSON:
{"verdict": ${plan.kind === "claim" ? `"supported" | "partly" | "contradicted" | "not_found"` : "null"},
 "answer": "2 to 6 plain sentences. Cite passages like [3]. ${plan.kind === "claim" ? "Say what in the statement is backed, what differs (direction, region, species, method) and what isn't covered." : "Answer directly first."}",
 "steps": [{"text": "one link of a pathway or chain of reasoning", "cites": [3]}],
 "evidence": [{"p": 3, "quote": "words copied exactly from passage 3, at most 40 words", "stance": "supports" | "contradicts" | "context"}],
 "caveats": ["at most 3 short caveats that matter, e.g. species, method, the passages being reviews"],
 "missing": "what the passages don't cover, or empty"}
"steps" only when the answer is a chain (for example how many synapses a pathway has, each step with its own passage); otherwise []. "evidence": the 2 to 6 most useful passages.
${plan.kind === "claim" ? "STATEMENT" : "QUESTION"}: ${q}

PASSAGES
${list}`;
  ASK.ctl = new AbortController();
  return S.sample.json(prompt, { maxTokens: 4000, effort: "medium", signal: ASK.ctl.signal, cache: { gcTime: 864e5 * 30, refresh: !!refresh } });
}
// keep only quotes that really are in the passage (whitespace, case and dashes aside)
const askNorm = t => String(t || "").toLowerCase().replace(/[‐-―−]/g, "-").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function askVerify(ans, passages) {
  const ev = [];
  for (const e of ans.evidence || []) {
    const p = passages[(+e.p || 0) - 1]; if (!p) continue;
    const ok = e.quote && askNorm(p.text).includes(askNorm(e.quote));
    ev.push({ i: +e.p, quote: ok ? String(e.quote).trim() : "", stance: ["supports", "contradicts", "context"].includes(e.stance) ? e.stance : "context" });
  }
  const valid = n => Number.isInteger(+n) && passages[+n - 1];
  return {
    verdict: VERDICTS[ans.verdict] ? ans.verdict : null,
    answer: String(ans.answer || "").replace(/\s*\[(\d+)\]/g, (m, n) => valid(n) ? m : ""),
    steps: (ans.steps || []).filter(s => s && s.text).map(s => ({ text: String(s.text), cites: (s.cites || []).filter(valid).map(Number) })),
    evidence: ev, caveats: (ans.caveats || []).map(String).slice(0, 3), missing: String(ans.missing || ""),
  };
}

/* ---- the whole run ---- */
async function askRun(q, { refresh = false } = {}) {
  q = askClean(q); if (q.length < 3 || ASK.busy) return;
  ASK.q = q; ASK.busy = true; ASK.outside = null; ASK.cur = null;
  const step = s => { ASK.stage = s; if (S.view === "ask") renderAsk(); };
  try {
    step(S.sample ? "Working out what to look for…" : "Looking for the words in your question…");
    const plan = await askPlan(q);
    step("Searching your library…");
    await aixInit();
    if (!AIX.done.size) { step("Building the search index (once)…"); await aixFill(); }
    const ranked = await aixSearch(plan, { papers: 8, perPaper: 3 });
    const passages = ranked.flatMap(r => r.passages).slice(0, 24);
    const counts = aixCounts();
    const res = { id: askId(q), kind: "ask", q, at: Date.now(), plan, local: !!plan.local || !S.sample, lib: counts.done,
      passages: passages.map(p => ({ paper: p.paper, kind: p.kind, sec: p.sec, fig: p.fig, panels: p.panels, text: p.text, hits: p.hits })) };
    if (passages.length && S.sample) {
      step(`Reading ${passages.length} passages from ${ranked.length} papers…`);
      try { Object.assign(res, askVerify(await askAnswer(q, plan, res.passages, refresh), res.passages)); }
      catch (e) { if (e && e.code === "cancelled") throw e; res.err = errCopy(e); }
    } else if (!passages.length) res.verdict = plan.kind === "claim" ? "not_found" : null;
    ASK.cur = res;
    if (D.col) { D.asks.set(res.id, res); enqueue(res.id, () => D.col.doc(res.id).set(res)); }
  } catch (e) {
    if (!(e && e.code === "cancelled")) { PW.log.error("ask", e); toast("Couldn't search: " + (e && e.message || "unknown error")); }
  } finally { ASK.busy = false; ASK.stage = ""; if (S.view === "ask") renderAsk(); }
}

/* ---- the screen ---- */
function askHL(text, plan) {
  let h = esc(text);
  const terms = askMarkTerms(plan).map(t => String(t).toLowerCase().replace(/\*+$/, "")).filter(t => t.length > 2).sort((a, b) => b.length - a.length).slice(0, 40);
  if (!terms.length) return h;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${terms.map(t => esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s-]+")).join("|")})[\\p{L}]*`, "giu");
  return h.replace(re, "<mark>$&</mark>");
}
function askPassageHTML(p, i, plan, ev) {
  const quote = ev && ev.quote;
  const body = quote ? `<blockquote class="ask-quote">${askHL(quote, plan)}</blockquote><details class="ask-more"><summary>The whole passage</summary><p>${askHL(p.text, plan)}</p></details>`
    : `<p class="ask-text">${askHL(p.text.length > 600 ? p.text.slice(0, 600) + "…" : p.text, plan)}</p>`;
  const stance = ev ? { supports: ["supports", "j-yes"], contradicts: ["contradicts", "j-no"], context: ["context", "st-skimmed"] }[ev.stance] : null;
  return `<article class="ask-ev" id="askev-${i}">
    <div class="ask-evh"><span class="ask-n">${i}</span><button type="button" class="linkbtn ask-paper" data-record="${esc(p.paper)}">${esc(askLabelOf(p.paper))}</button>${stance ? `<span class="pill ${stance[1]}">${stance[0]}</span>` : ""}<span class="note">${esc(askWhere(p))}</span></div>
    <div class="note ask-title">${esc(askTitleOf(p.paper))}</div>
    ${body}
    <div class="ask-acts">${p.fig ? `<button type="button" class="btn" data-askgo="${i}" data-mode="fig">Open at Fig. ${esc(p.fig)}${esc((p.panels || "")[0] || "")}</button>` : ""}<button type="button" class="btn quiet" data-askgo="${i}" data-mode="text">Open at this ${p.kind === "legend" ? "legend" : "passage"}</button></div>
  </article>`;
}
function renderAsk() {
  $("#pTitle").textContent = "Ask your library"; const c = aixCounts();
  $("#pSub").textContent = `${c.done} of ${c.total} papers searchable`;
  const R = ASK.cur, P = R && R.plan;
  const cite = s => esc(s).replace(/\[(\d+)\]/g, (m, n) => `<a class="ask-cite" href="#askev-${n}" data-askev="${n}">[${n}]</a>`);
  let res = "";
  if (ASK.busy) res = `<div class="thinking" style="margin-top:18px"><span class="dot"></span>${esc(ASK.stage)}</div><button type="button" class="btn quiet" data-askstop="1" style="margin-top:8px">Stop</button>`;
  else if (R) {
    const used = new Map((R.evidence || []).map(e => [e.i, e]));
    const evList = (R.evidence || []).filter(e => R.passages[e.i - 1]);
    const rest = R.passages.map((p, k) => [p, k + 1]).filter(([, i]) => !used.has(i));
    const v = R.verdict && VERDICTS[R.verdict];
    res = `<section class="ask-res">
      <div class="ask-q"><span class="eyebrow">${P.kind === "claim" ? "Your statement" : "Your question"}</span><div>${esc(R.q)}</div>${R.at ? `<span class="note">${fmtDate(R.at)}${R.local ? " · searched without Claude" : ""}</span>` : ""}</div>
      ${v ? `<div class="ask-verdict"><span class="pill ${v[1]}">${v[0]}</span></div>` : ""}
      ${R.answer ? `<div class="ask-answer">${cite(R.answer)}</div>` : R.err ? `<p class="note">${esc(R.err)} The passages below are the best matches.</p>` : !S.sample && R.passages.length ? `<p class="note">These are the passages that match best. With your API key, Claude reads them and answers. ${ADD_KEY_BTN}</p>` : ""}
      ${(R.steps || []).length ? `<ol class="ask-steps">${R.steps.map(s => `<li>${esc(s.text)} ${s.cites.map(n => `<a class="ask-cite" href="#askev-${n}" data-askev="${n}">[${n}]</a>`).join("")}</li>`).join("")}</ol>` : ""}
      ${(R.caveats || []).length ? `<ul class="ask-cav">${R.caveats.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${R.missing ? `<p class="note">Not covered: ${esc(R.missing)}</p>` : ""}
      ${!R.passages.length ? `<div class="card"><h3>Nothing in your library matches</h3><p class="note">${c.done < c.total ? `${c.total - c.done} papers aren't searchable yet (their text hasn't been read). You can read them in Settings, or ` : ""}look beyond your library below.</p></div>` : ""}
      <div class="ask-tools">
        ${R.passages.length ? `<button type="button" class="btn" data-askcopy="1">Copy with citation${evList.length > 1 ? "s" : ""}</button>` : ""}
        <button type="button" class="btn" data-askout="1" ${ASK.outside === "busy" ? "disabled" : ""}>${ASK.outside === "busy" ? "Searching…" : "Search beyond your library"}</button>
        <button type="button" class="btn quiet" data-askagain="1">Ask again</button>
        <button type="button" class="btn quiet danger" data-askdel="${esc(R.id)}">Delete</button>
      </div>
      <div id="askOut">${ASK.outside && ASK.outside !== "busy" ? ASK.outside : ""}</div>
      ${evList.length ? `<h3 class="ask-h">Evidence</h3>${evList.map(e => askPassageHTML(R.passages[e.i - 1], e.i, P, e)).join("")}` : ""}
      ${rest.length ? `<details class="ask-rest" ${evList.length ? "" : "open"}><summary>${evList.length ? "Other matching passages" : "Best matching passages"} · ${rest.length}</summary>${rest.map(([p, i]) => askPassageHTML(p, i, P, null)).join("")}</details>` : ""}
    </section>`;
  } else {
    const past = askList();
    res = past.length ? `<h3 class="ask-h">Earlier questions</h3><ul class="ask-hist">${past.slice(0, 40).map(a => `<li><button type="button" class="ask-past" data-askpast="${esc(a.id)}"><span>${esc(a.q)}</span><span class="note">${fmtDate(a.at)}${a.verdict && VERDICTS[a.verdict] ? " · " + VERDICTS[a.verdict][0] : ""}</span></button></li>`).join("")}</ul>`
      : `<div class="card ask-intro"><h3>Ask a question, or check a statement</h3><p class="note">For example “Is the cerebellum connected to the thalamus, and through how many synapses?” or “The anterior vermis (lobule IV/V) projects mainly to the ipsilateral forelimb.” Panelwise finds the passages in your papers that answer it and opens the figure or sentence.</p></div>`;
  }
  const busyIdx = AIX.busy && AIX.step ? ` · indexing ${AIX.step}` : "";
  $("#main").innerHTML = `<section class="view ask-view" style="max-width:900px">
    <button class="backlink" type="button" data-act="tolib">Library</button>
    <div class="eyebrow" style="margin-top:12px">Ask your library</div><h2>What do your papers say?</h2>
    <form id="askForm" class="ask-form"><textarea id="askIn" rows="2" placeholder="A question or a statement you are writing" aria-label="Your question or statement" enterkeyhint="search">${esc(ASK.q)}</textarea>
      <button class="btn primary" type="submit" ${ASK.busy ? "disabled" : ""}>Ask</button></form>
    <p class="note ask-scope">Searches ${c.done} of ${c.total} papers${busyIdx}.${c.done < c.total && !AIX.busy ? ` <button type="button" class="linkbtn" data-act="tosettings">Make the rest searchable</button>` : ""}${S.sample ? "" : " Without an API key the best passages are shown, without an answer."}</p>
    ${res}</section>`;
}

/* ---- going to the evidence ---- */
async function askGo(i, mode) {
  const R = ASK.cur, p = R && R.passages[i - 1]; if (!p) return;
  const L_ = ixPapers().find(x => x.id === p.paper);
  if (!L_ || !L_.g.file) { S.recId = p.paper; S.view = "record"; render(); window.scrollTo(0, 0); toast("The PDF isn't in your Papers folder, so here is your saved work."); return; }
  ASK.y = window.scrollY;
  if (mode === "fig" && p.fig) {
    if (!S.paper || S.paper.id !== L_.id) await handleFile(fileForGroup(L_.g), L_.id);
    const P = S.paper; if (!P || P.id !== L_.id) return;
    const k = P.figures.findIndex(f => f.n === +p.fig); if (k < 0) { toast(`Figure ${p.fig} wasn't found in this paper.`); return; }
    S.view = "figures"; S.figIdx = k; S.pinned = p.panels ? { fig: +p.fig, panel: p.panels[0] } : null; S.backTo = "ask"; render(); window.scrollTo(0, 0);
  } else {
    // the passage's first sentence finds the spot in reading mode
    const q = (askSentences(p.text)[0] || p.text).slice(0, 160);
    await ixOpen(L_, q, () => { if (S.backTo === "ask") askBack(); });
    S.backTo = "ask"; render();
  }
}
function askBack() { S.backTo = null; S.view = "ask"; render(); requestAnimationFrame(() => window.scrollTo(0, ASK.y || 0)); }

// for writing: the statement (or the answer) with author-year citations and the references
async function askCopy() {
  const R = ASK.cur; if (!R) return;
  const ids = [...new Set((R.evidence && R.evidence.length ? R.evidence.filter(e => e.stance !== "contradicts").map(e => R.passages[e.i - 1]) : R.passages.slice(0, 3)).filter(Boolean).map(p => p.paper))];
  toast("Looking up the citations…");
  const cs = []; for (const id of ids) cs.push(await citeData(id));
  const short = c => { const au = c.authors || []; const sur = n => String(n).replace(/,.*$/, "").trim().split(/\s+/).pop(); return `${au.length ? sur(au[0]) + (au.length > 2 ? " et al." : au.length === 2 ? " & " + sur(au[1]) : "") : "Anon."}, ${c.year || "n.d."}`; };
  const text = `${R.plan.kind === "claim" ? R.q.replace(/[.\s]+$/, "") : (R.answer || R.q).replace(/\s*\[\d+\]/g, "").replace(/[.\s]+$/, "")} (${cs.map(short).join("; ")}).\n\n${cs.map(citeText).join("\n")}`;
  try { await navigator.clipboard.writeText(text); toast("Copied with citations"); } catch { toast(text, 12000); }
}

/* ---- beyond the library: OpenAlex, Europe PMC (full text of open-access papers), known brain connections ---- */
async function askOutside() {
  const R = ASK.cur; if (!R) return;
  if (!PW.online()) { toast("You're offline."); return; }
  ASK.outside = "busy"; renderAsk();
  const P = R.plan, core = (P.concepts || []).filter(c => (c.w ?? 1) >= 1);
  const first = c => String((c.terms || [])[0] || c.name).replace(/\*+$/, "");
  const parts = [];
  try {
    // Europe PMC: every core concept, any of its terms, in the full text
    const epq = core.slice(0, 4).map(c => "(" + c.terms.slice(0, 6).map(t => `"${String(t).replace(/["*]/g, "")}"`).join(" OR ") + ")").join(" AND ");
    const [oa, ep] = await Promise.all([
      oaJSON(`${OA_API}/works?search=${encodeURIComponent(core.map(first).join(" "))}&filter=type:article&per-page=8&select=${OA_FIELDS}`).catch(() => ({ results: [] })),
      fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(epq)}&format=json&pageSize=8&resultType=lite`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]);
    const works = new Map((oa.results || []).filter(w => w.title).map(w => [w.id, w]));
    const dois = ((ep.resultList || {}).result || []).map(x => x.doi).filter(Boolean).slice(0, 8);
    if (dois.length) {
      const j = await oaJSON(`${OA_API}/works?filter=doi:${dois.map(encodeURIComponent).join("|")}&per-page=10&select=${OA_FIELDS}`).catch(() => ({ results: [] }));
      for (const w of j.results || []) if (w.title && !works.has(w.id)) works.set(w.id, { ...w, _epmc: true });
    }
    const rows = [...works.values()].filter(w => !oaInLibrary(w)).slice(0, 12).map(w => ({ w, pdf: oaPdfOf(w) }));
    const save = PW.native && PW.files.folderName ? "Save to Papers" : "Open the PDF";
    parts.push(`<div class="ask-outbox"><h3 class="ask-h">Not in your library</h3>${rows.length ? `<ul class="au-list" id="askOutList">${rows.map((r, k) => `<li class="oa-box" data-ao="${k}"><div class="oa-hit"><strong>${esc(r.w.title)}</strong><span class="note">${esc([oaAuthors(r.w), r.w.publication_year].filter(Boolean).join(" "))}${r.w._epmc ? " · found in the full text" : ""}${r.pdf ? " · open access" : ""}</span></div>${r.pdf ? `<button type="button" class="btn" data-oa="get">${save}</button>` : r.w.doi ? `<a class="note" href="${esc(r.w.doi)}" target="_blank" rel="noopener">Publisher page ↗</a>` : ""}</li>`).join("")}</ul><p class="note">After saving a PDF, ask again: it is searched too.</p>` : `<p class="note">OpenAlex and Europe PMC found nothing new.</p>`}</div>`);
    ASK.outRows = rows;
  } catch (e) { PW.log.error("ask outside", e); parts.push(`<p class="note">Couldn't reach OpenAlex or Europe PMC.</p>`); }
  parts.unshift(await askKnownConnections(R.q));
  ASK.outside = parts.join("");
  renderAsk();
  $$("#askOutList li.oa-box").forEach(li => { const r = ASK.outRows[+li.dataset.ao]; if (r) li._found = { w: r.w, pdf: r.pdf }; });
}
// two brain regions in the text: what the bundled brain-sections data says about a connection between them
async function askKnownConnections(q) {
  try {
    if (typeof brBundle !== "function") return "";
    await atlasLoad(); if (!ATL.idx) return "";
    const regs = atlasFindIn(q).slice(0, 4); if (regs.length < 2) return "";
    const B = (await brBundle()).regions || {};
    const acr = id => (atlasS(id) || {}).a;
    const related = (x, y) => { const ix = ATL.byA[x], iy = ATL.byA[y]; if (ix == null || iy == null) return x === y; return atlasLineage(ix).includes(iy) || atlasLineage(iy).includes(ix); };
    const lines = [];
    for (const a of regs) for (const b of regs) {
      if (a === b) continue;
      const A = a.ids.map(acr).filter(Boolean), Bb = b.ids.map(acr).filter(Boolean);
      for (const [key, data] of Object.entries(B)) {
        if (!A.some(x => related(key, x))) continue;
        for (const o of data.outputs || []) if (Bb.some(y => related(o.acronym, y))) lines.push({ from: key, to: o.acronym, note: o.note, refs: o.refs || [] });
      }
    }
    if (!lines.length) return "";
    const seen = new Set(), uniq = lines.filter(l => { const k = l.from + ">" + l.to; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
    return `<div class="ask-known"><h3 class="ask-h">Known connections <span class="note">brain-sections data, checked against OpenAlex</span></h3><ul>${uniq.map(l => `<li><strong>${esc(ATL.byA[l.from] != null ? atlasName([ATL.byA[l.from]]) : l.from)} → ${esc(ATL.byA[l.to] != null ? atlasName([ATL.byA[l.to]]) : l.to)}</strong>${l.note ? ` <span class="note">${esc(l.note)}</span>` : ""}<div class="br-refs">${l.refs.slice(0, 4).map(r => `<a class="br-ref" href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">${esc(r.first_author)} ${esc(r.year)}</a>`).join("")}</div></li>`).join("")}</ul></div>`;
  } catch (e) { PW.log.error("ask known", e); return ""; }
}

document.addEventListener("submit", e => { if (e.target.id !== "askForm") return; e.preventDefault(); const v = $("#askIn").value.trim(); if (v) askRun(v); });
document.addEventListener("keydown", e => { if (e.target.id === "askIn" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); const v = e.target.value.trim(); if (v) askRun(v); } });
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-askgo], [data-askev], [data-askcopy], [data-askout], [data-askagain], [data-askdel], [data-askpast], [data-askstop]"); if (!t || S.view !== "ask") return;
  if (t.dataset.askgo) askGo(+t.dataset.askgo, t.dataset.mode);
  else if (t.dataset.askev) { e.preventDefault(); const el = $("#askev-" + t.dataset.askev); if (el) { el.closest("details")?.setAttribute("open", ""); el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } }
  else if (t.dataset.askcopy) askCopy();
  else if (t.dataset.askout) askOutside();
  else if (t.dataset.askagain) askRun(ASK.q, { refresh: true });
  else if (t.dataset.askstop) { ASK.ctl?.abort(); }
  else if (t.dataset.askpast) { const a = D.asks.get(t.dataset.askpast); if (a) { ASK.cur = a; ASK.q = a.q; ASK.outside = null; renderAsk(); window.scrollTo(0, 0); } }
  else if (t.dataset.askdel) {
    const id = t.dataset.askdel, a = D.asks.get(id); D.asks.delete(id); ASK.cur = null; renderAsk();
    toastUndo("Question deleted.", () => { if (a) { D.asks.set(id, a); ASK.cur = a; renderAsk(); } }, () => { if (D.col) enqueue(id, () => D.col.doc(id).delete()); });
  }
});
