"use strict";
/* ---------- Ask your library: the search core (no screen code; tests/ask.mjs runs it in Node) ----------
   1. Passages: each paper is cut into its abstract, paragraphs (long ones in pieces) and figure legends; each
      passage remembers its section and the figure and panels it is about.
   2. A plan: what to look for, as concepts, each a list of words that mean it (from Claude, or made locally).
   3. One full-text query (SQLite FTS5, ranked by BM25) over every passage, then a re-ranking that rewards
      passages covering more of the concepts and figure legends and Results; the best few papers are kept,
      with their best passages. Only those are ever read (by Claude); the library is never scanned. */
const ASK_VER = 1;                                  // bump when askPassages changes: the index is rebuilt
const ASK_STOP = new Set(("a an and are as at be been but by can could did do does done for from had has have how if in into is it its " +
  "may might more most much no not of on or our so such than that the their them then there these they this those through to " +
  "was we were what when where which while who whom why will with would yes your via also only both each other any some very " +
  "mainly mostly largely primarily predominantly strongly weakly mice mouse rat rats animal animals study studies paper papers " +
  "show shows shown showed find found finding findings result results evidence known whether many number one two three " +
  "synapse synapses synaptic connected connection connections connect connects project projects projection projections").split(" "));
// words that carry meaning for the answer but are poor search terms on their own (kept when Claude plans)
const ASK_WEAK = new Set(["synapse", "synapses", "synaptic", "connected", "connection", "connections", "project", "projects", "projection", "projections", "mainly", "mice", "mouse"]);

const askClean = t => String(t || "").replace(/\s+/g, " ").trim();
// split text into sentences (keeps "Fig. 3", "et al.", "e.g." together)
function askSentences(t) {
  const out = [], re = /[^.!?]+(?:[.!?]+(?=\s+[A-Z(\[]|$)|$)/g;
  let buf = "";
  for (const m of t.match(re) || [t]) {
    buf += m;
    if (/(?:\b(?:Fig|Figs|al|e\.g|i\.e|vs|ca|approx|resp|Eq|Ref|No|Suppl|ref)\.\s*$)|(?:\b[A-Z]\.\s*$)/.test(buf)) continue;
    out.push(buf.trim()); buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
// "Fig. 3C" mentions in a passage: { fig: the most mentioned figure, panels: its panels }
function askFigOf(text, refKeysFn) {
  if (!refKeysFn) return { fig: null, panels: "" };
  const keys = [...refKeysFn(text)], by = new Map();
  for (const k of keys) { const n = parseInt(k); if (!n) continue; const p = k.replace(/^\d+/, "").replace("*", ""); const e = by.get(n) || new Set(); if (p) e.add(p); by.set(n, e); }
  let best = null, bn = -1;
  for (const [n, ps] of by) if (ps.size > bn) { best = n; bn = ps.size; }
  return best == null ? { fig: null, panels: "" } : { fig: best, panels: [...by.get(best)].sort().join("") };
}
// the passages of one paper (raw = the parsed PDF as stored in "_text")
function askPassages(raw, refKeysFn) {
  const out = [], MAX = 1300;
  const push = (kind, sec, text, fig, panels) => { text = askClean(text); if (text.length < 60) return; out.push({ kind, sec, text, fig: fig ?? null, panels: panels || "" }); };
  if (raw.abstract) push("abstract", "abstract", raw.abstract);
  for (const [sec, list] of Object.entries(raw.sections || {})) {
    if (sec === "refs") continue;
    for (const para of list || []) {
      const t = askClean(para);
      const parts = [];
      if (t.length <= MAX) parts.push(t);
      else { let cur = ""; for (const s of askSentences(t)) { if (cur && (cur + " " + s).length > MAX * 0.75) { parts.push(cur); cur = s; } else cur = cur ? cur + " " + s : s; } if (cur) parts.push(cur); }
      for (const p of parts) { const f = askFigOf(p, refKeysFn); push("text", sec, p, f.fig, f.panels); }
    }
  }
  for (const f of raw.figures || []) if (f && f.legend) push("legend", "legend", f.legend.slice(0, 2500), f.n, "");
  return out;
}

// a plan without Claude: the question's content words, each a concept; regions get their atlas names (expand)
function askLocalPlan(q, expand) {
  const words = askClean(q).toLowerCase().replace(/[^\p{L}\p{N}\s/-]/gu, " ").split(/\s+/).filter(w => w.length > 2 && !ASK_STOP.has(w));
  const concepts = [], seen = new Set();
  const regs = expand ? expand(q) : [];                       // [{ name, terms }] from the atlas
  for (const r of regs) { concepts.push({ name: r.name, terms: r.terms, w: 1 }); r.terms.join(" ").toLowerCase().split(/\s+/).forEach(x => seen.add(x)); }
  for (const w of words) {
    if (seen.has(w)) continue; seen.add(w);
    const stem = w.length >= 7 ? w.slice(0, Math.max(5, w.length - 3)) + "*" : w;
    concepts.push({ name: w, terms: [w, ...(stem !== w ? [stem] : [])], w: ASK_WEAK.has(w) ? 0.4 : 1 });
  }
  return { kind: /\?\s*$/.test(q) || /^(is|are|does|do|how|what|which|where|when|who|why|can)\b/i.test(q.trim()) ? "question" : "claim", concepts, local: true };
}

// FTS5 query text: every term of every concept, OR-ed (the ranking decides how many concepts a passage covers)
function askTermFts(t) {
  t = String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\s*-]/gu, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const pre = t.endsWith("*"); t = t.replace(/\*+$/, "").trim(); if (!t || (pre && t.length < 4)) return null;
  return `"${t.replace(/"/g, "")}"${pre ? "*" : ""}`;
}
function askFtsQuery(plan) {
  const terms = new Set();
  for (const c of plan.concepts || []) for (const t of c.terms || []) { const f = askTermFts(t); if (f) terms.add(f); }
  return [...terms].join(" OR ");
}
// does a passage contain a term? (lower-case text; prefix terms end in *, multi-word terms as a phrase)
function askHas(lt, term) {
  let t = String(term || "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const pre = t.endsWith("*"); t = t.replace(/\*+$/, "");
  if (!t) return false;
  const e = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // whole words; a plain word also matches its plural and simple forms (nucleus/nuclei, project/projects)
  const tail = pre ? "[\\p{L}\\p{N}]*" : "(?:s|es|ed|ing|al|ar)?";
  return new RegExp(`(?<![\\p{L}\\p{N}])${e}${tail}(?![\\p{L}\\p{N}])`, "u").test(lt);
}
const ASK_KIND_W = { legend: 1.35, abstract: 1.15 }, ASK_SEC_W = { results: 1.25, discussion: 1.0, intro: 0.8, methods: 0.65, other: 0.85, abstract: 1.15, legend: 1.35 };
// rows: [{ paper, kind, sec, fig, panels, text, bm25 }] (bm25 from SQLite: lower is better) -> papers with passages
function askRank(rows, plan, { papers = 8, perPaper = 3 } = {}) {
  const cs = (plan.concepts || []).filter(c => (c.terms || []).length);
  const total = cs.reduce((a, c) => a + (c.w ?? 1), 0) || 1;
  const scored = rows.map(r => {
    const lt = r.text.toLowerCase().replace(/-/g, " ");
    const hit = cs.filter(c => c.terms.some(t => askHas(lt, t)));
    const cov = hit.reduce((a, c) => a + (c.w ?? 1), 0) / total;
    const w = r.kind === "text" ? (ASK_SEC_W[r.sec] ?? 0.85) : (ASK_KIND_W[r.kind] ?? 1);
    return { ...r, cov, hits: hit.map(c => c.name), score: Math.max(0.01, -r.bm25) * Math.pow(cov, 2.2) * w };
  }).filter(r => r.cov > 0);
  const by = new Map();
  for (const r of scored) { const a = by.get(r.paper) || []; a.push(r); by.set(r.paper, a); }
  const out = [];
  for (const [paper, list] of by) {
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, perPaper);
    // a paper is as good as its best passage, plus a little for more good passages and for covering concepts across them
    const across = new Set(list.slice(0, 6).flatMap(r => r.hits)).size / Math.max(1, cs.length);
    const score = top[0].score + 0.35 * (top[1]?.score || 0) + 0.15 * (top[2]?.score || 0) + 0.2 * top[0].score * across;
    out.push({ paper, score, passages: top });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, papers);
}
// the words to highlight in a passage
function askMarkTerms(plan) { return [...new Set((plan.concepts || []).flatMap(c => c.terms || []))].filter(Boolean); }

if (typeof module !== "undefined") module.exports = { ASK_VER, askPassages, askLocalPlan, askFtsQuery, askRank, askHas, askSentences, askMarkTerms };
