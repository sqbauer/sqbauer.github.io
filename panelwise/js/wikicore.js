"use strict";
/* ---------- the wiki's term finder: which terms a paper is about, and a sentence for each ----------
   Three sources, merged into one set of keys:
     v:<name>   terms from the vocabulary in wikiterms.js (techniques, cell types, molecules, …)
     r:<ids>    brain regions, by the atlas's names and synonyms (atlasTerms in atlas.js)
     a:<form>   abbreviations a paper defines, "interpositus nucleus (IN)", that are neither of the above
   An abbreviation whose long form names a vocabulary term or a region joins that term, and its short form is
   counted too. No DOM here: tests/wiki.mjs runs the same code on the whole library in Node.
   wkExtract(raw) -> { key: [mentions, section, sentence, short form, long form] } */

const WK_SEC_ORDER = ["abstract", "intro", "results", "discussion", "other", "methods"];
// long forms that are statistics or bench routine, not neuroscience
const WK_STOP_WORDS = ["standard deviation", "standard error of the mean", "standard error", "analysis of variance", "confidence interval", "region of interest",
  "interquartile range", "area under the curve", "false discovery rate", "signal to noise ratio", "root mean square", "principal component", "independent component analysis",
  "phosphate buffered saline", "paraformaldehyde", "artificial cerebrospinal fluid", "room temperature", "inter stimulus interval", "interstimulus interval", "inter trial interval",
  "intertrial interval", "degree of freedom", "coefficient of variation", "mean squared error", "receiver operating characteristic", "post hoc", "bonferroni", "body weight",
  "intraperitoneal", "intraperitoneally", "subcutaneous", "dimethyl sulfoxide", "bovine serum albumin", "normal goat serum", "phosphate buffer", "tris buffered saline", "wild type",
  "wildtype", "experiment", "figure", "supplementary", "control", "baseline", "time", "trial", "session", "condition", "group", "left", "right", "number", "postnatal day",
  "embryonic day", "zeitgeber time", "light dark", "first", "second", "third", "high", "low", "central nervous system", "power spectral density", "power spectrum",
  "interspike interval", "inter spike interval", "mediolateral", "medio lateral", "anteroposterior", "anterior posterior", "rostrocaudal", "dorsoventral", "dorso ventral",
  "national institutes of health", "median absolute deviation", "numerical aperture", "front left", "front right", "hind left", "hind right", "repeated measure",
  "institutional animal care and use committee", "field of view", "body mass index", "fast fourier transform", "continuous wavelet transform", "peri event time histogram",
  "peristimulus time histogram", "peri stimulus time histogram", "root mean squared error", "center of mass", "cerebrospinal fluid", "diaminobenzidine",
  "diaminobenzidine tetrahydrochloride", "area under the psth curve", "standard error of mean", "mean square error", "short time fourier transform", "frame per second",
  "fluorescence", "relative fluorescence", "graphical user interface", "infrared", "false negative", "false positive", "medial lateral",
  "dorsal ventral", "anterior posterior", "probability density function", "singular value decomposition", "gene ontology", "linear discriminant analysis", "change in fluorescence", "inter quartile range", "normal donkey serum", "artificial csf", "odd ratio", "coefficient", "resistance", "spike", "layer 5", "post stimulus time histogram"];

let WK_STOP = null;                                     // normalised on first use (wkNorm is defined below)
const wkStop = n => (WK_STOP || (WK_STOP = new Set(WK_STOP_WORDS.map(wkNorm)))).has(n);
function wkSing(w) {
  const irr = { nuclei: "nucleus", stimuli: "stimulus", ganglia: "ganglion", foci: "focus", loci: "locus", criteria: "criterion", phenomena: "phenomenon" };
  if (irr[w]) return irr[w];
  if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(ch|sh|x|ss|us)es$/.test(w)) return w.slice(0, -2);
  if (/^(iliopsoas|gas|pancreas|bias|atlas|canvas|alias|whereas|has|was|as|its|this|thus)$/.test(w)) return w;
  if (w.length > 3 && /s$/.test(w) && !/(ss|us|is|ys)$/.test(w)) return w.slice(0, -1);
  return w;
}
// "Climbing fibres" -> "climbing fiber"; the key under which spellings of one term meet.
// Called for every term found in every sentence, with the same few hundred spellings over and over: remembered.
const WK_NORM_MEMO = new Map();
function wkNorm(s) {
  s = String(s || "");
  let n = WK_NORM_MEMO.get(s);
  if (n === undefined) { n = wkNormNow(s); if (WK_NORM_MEMO.size > 50000) WK_NORM_MEMO.clear(); WK_NORM_MEMO.set(s, n); }
  return n;
}
function wkNormNow(s) {
  let t = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[–—]/g, "-").replace(/['’]/g, "")
    .replace(/fibre/g, "fiber").replace(/centre/g, "center").replace(/behaviour/g, "behavior").replace(/colour/g, "color").replace(/anaesth/g, "anesth")
    .replace(/([a-z]{3,})is(e|ed|es|ing|ation|ations)\b/g, "$1iz$2")
    .replace(/[-/]/g, " ").replace(/[^a-z0-9+αβγδθ ]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b(inter|intra|non|post|pre|peri|sub|multi|anti|long|short) (?=[a-z])/g, "$1");   // "inter spike" = "interspike"
  return t.split(" ").map(wkSing).join(" ");
}
const wkEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a case-insensitive alias as a pattern that also takes the other spellings and the plural
function wkPat(alias) {
  let p = wkEsc(alias)
    .replace(/fib(?:er|re)/gi, "fib(?:er|re)").replace(/cent(?:er|re)/gi, "cent(?:er|re)").replace(/behaviou?r/gi, "behaviou?r").replace(/colou?r/gi, "colou?r")
    .replace(/ana?esth/gi, "ana?esth").replace(/([a-z]{3,})i[sz](e|ed|es|ing|ation)\b/gi, "$1i[sz]$2")
    .replace(/'/g, "['’]?").replace(/[\s\-–]+/g, "[\\s\\-–]+");
  if (/y$/i.test(alias)) p = p.slice(0, -1) + "(?:y|ies)";
  else if (/[a-z]$/i.test(alias) && !/s$/i.test(alias)) p += "(?:s|es)?";
  return p;
}

const WK = { built: false, terms: new Map(), normKey: new Map(), cs: new Map(), cond: new Map(), reCI: null, reCS: null, reg: null };
function wkBuild() {
  if (WK.built) return;
  const ci = [], cs = [];
  for (const [cat, list] of Object.entries(WK_VOCAB)) for (const [name, aliases] of list) {
    const key = "v:" + wkNorm(name);
    WK.terms.set(key, { key, name, cat });
    for (let a of [name, ...aliases.split("|")]) {
      a = a.trim(); if (!a) continue;
      if (/[*?]$/.test(a)) { const w = a.slice(0, -1); WK.cs.set(w, key); if (a.endsWith("?")) WK.cond.set(w, key); cs.push(w); }
      else { if (!WK.normKey.has(wkNorm(a))) WK.normKey.set(wkNorm(a), key); ci.push(a); }
    }
  }
  const alt = (list, f) => [...new Set(list)].sort((a, b) => b.length - a.length).map(f).join("|");
  WK.reCI = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt(ci, wkPat)})(?![\\p{L}\\p{N}])`, "giu");
  WK.reCS = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt(cs, wkEsc)})(?![\\p{L}\\p{N}+])`, "gu");
  WK.built = true;
}
// brain regions: the atlas's names (needs the atlas index, so built on first use after it loads)
function wkRegions() {
  if (WK.reg || typeof atlasTerms !== "function") return WK.reg;
  const terms = atlasTerms(); if (!terms.length) return null;
  const byCI = new Map(), byCS = new Map();
  for (const e of terms) (e.ci ? byCI : byCS).set(e.ci ? e.word.toLowerCase() : e.word, e);
  const alt = m => [...m.values()].sort((a, b) => b.word.length - a.word.length).map(e => wkEsc(e.word)).join("|");
  WK.reg = { byCI, byCS, reCI: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt(byCI)})(?![\\p{L}\\p{N}])`, "giu"), reCS: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt(byCS)})(?![\\p{L}\\p{N}])`, "gu") };
  return WK.reg;
}
const wkRegionKey = e => "r:" + e.ids.join("+");
function wkRegionOf(text) {
  if (typeof atlasMatch !== "function") return null;
  const e = atlasMatch(text) || atlasMatch(String(text).replace(/s$/, ""));
  return e ? wkRegionKey(e) : null;
}

// the paper's text as sentences, sections in the order a quote is chosen from
function wkSentences(raw) {
  const out = [];
  const add = (sec, para) => {
    const t = String(para || "").replace(/\s*\[\d[\d,–\-\s]*\]/g, "").replace(/\s+/g, " ").trim(); if (!t) return;
    // split after . ! ? followed by a capital, not after "et al.", "Fig.", "e.g.", "i.e.", initials
    for (const s of t.split(/(?<=[.!?])\s+(?=[A-Z(\[])(?<!\b(?:al|Fig|Figs|e\.g|i\.e|vs|ca|approx|resp|Eq|No|cf|[A-Z])\.\s+)/)) if (s.length > 2) out.push({ sec, t: s });
  };
  add("abstract", raw.abstract);
  for (const sec of WK_SEC_ORDER.slice(1)) for (const p of (raw.sections || {})[sec] || []) add(sec, p);
  return out;
}

// how well a sentence reads on its own: prose of a sensible length, not a table row, a citation or a figure label
function wkProse(s) {
  const t = s.t, len = t.length;
  let sc = len < 40 ? -3 : len > 360 ? -2 : len < 70 ? 0 : 1;
  const letters = (t.match(/[a-z]/g) || []).length, digits = (t.match(/[0-9]/g) || []).length, caps = (t.match(/\b[A-Z][A-Za-z]*\b/g) || []).length;
  if (letters / len < .6) sc -= 3;
  if (digits / len > .08) sc -= 2;
  if (caps / Math.max(1, t.split(/\s+/).length) > .4) sc -= 2;            // table rows, author lists
  if (!/^[A-Z(]/.test(t) || !/[.!?]["”)]?$/.test(t)) sc -= 1;
  if (/\b(?:et al|doi|https?:|vol\.|pp\.|ISBN|©|Copyright)\b/i.test(t)) sc -= 2;
  sc += { abstract: 1.5, intro: 1, discussion: .5, results: .3, other: 0, methods: -1 }[s.sec] || 0;
  if (/\b(?:is|are|refers to|consists? of|known as|defined as)\b/.test(t)) sc += .5;
  return sc;
}

// how often a short form occurs as a word ("SF" or "SFs"), the same as /(?<![\p{L}\p{N}])SFs?(?![\p{L}\p{N}])/gu but
// without a regex (this runs for every abbreviation on every sentence that contains it)
const WK_WORDCH = /[\p{L}\p{N}]/u;
function wkCountSf(t, sf) {
  let n = 0, i = t.indexOf(sf);
  while (i >= 0) {
    const before = i > 0 ? t[i - 1] : "", j = i + sf.length;
    if (!before || !WK_WORDCH.test(before)) {
      const a = t[j], b = t[j + 1];
      if (a === "s" && !(b && WK_WORDCH.test(b))) { n++; i = t.indexOf(sf, j + 1); continue; }
      if (!a || !WK_WORDCH.test(a)) { n++; i = t.indexOf(sf, j); continue; }
    }
    i = t.indexOf(sf, i + 1);
  }
  return n;
}

function wkExtract(raw) {
  wkBuild();
  const sents = wkSentences(raw); if (!sents.length) return {};
  const found = new Map();                                   // key -> { n, qi, score, sf, lf, words }
  const score = sents.map(wkProse);
  const hit = (key, i, how, word) => {
    let f = found.get(key); if (!f) found.set(key, f = { n: 0, qi: -1, score: -1e9, words: null });
    f.n++;
    if (word) { f.words = f.words || new Map(); f.words.set(word, (f.words.get(word) || 0) + 1); }
    // the sentence shown for this paper: readable prose, early in the paper, a definition if there is one
    const sc = score[i] + (how === "def" ? 3 : 0);
    if (sc > f.score) { f.qi = i; f.score = sc; }
  };
  // abbreviations this paper defines
  const full = sents.map(s => s.t).join(" ");
  const abbr = typeof rmAbbrevs === "function" ? rmAbbrevs(full) : new Map();
  const abKeys = [];                                         // [{ sf, lf, key, re }]
  const condOK = new Set();                                  // ambiguous acronyms this paper defines as that term
  for (const [sf0, lf0] of abbr) {
    const sf = /[A-Z0-9]s$/.test(sf0) ? sf0.slice(0, -1) : sf0;
    const lf = lf0.replace(/^(?:(?:in(?! (?:situ|vivo|vitro|silico)\b)|the|of|a|an|and|with|from|to|by|for|on|at|as|or|that|this|these|we|our|its|their|between|during|within)\s+)+/i, "");
    const n = wkNorm(lf); if (!n || n.length < 4 || wkStop(n) || /^\d/.test(n)) continue;
    const key = WK.normKey.get(n) || wkRegionOf(lf) || "a:" + n;
    if (WK.cond.has(sf) && WK.cond.get(sf) === key) condOK.add(sf);
    if (WK.cond.has(sf0) && WK.cond.get(sf0) === key) condOK.add(sf0);
    const words = lf.trim().split(/\s+/);
    const lfPat = words.length > 1 || lf.length >= 6 ? wkPat(lf.trim()) : null;
    // a vocabulary or region term already counts its long form: then only the short form is counted here
    const own = key.startsWith("a:") && lfPat;
    // a cheap pre-check per sentence: the start of the long form's longest word, cut before any spot where the
    // pattern allows other spellings (fibre/fiber, centre/center, behaviour/behavior, colour/color, anaesth/anesth,
    // -ise/-ize, plurals), so every spelling the pattern matches contains it
    const tokW = own ? lf.trim().toLowerCase().split(/[^a-z]+/).sort((x, y) => y.length - x.length)[0] || "" : "";
    let cut = Math.min(6, Math.max(1, tokW.length - 3));
    for (const re of [/fib(?:er|re)/, /cent(?:er|re)/, /behaviou?r/, /colou?r/, /ana?esth/, /i[sz](?:e|ed|es|ing|ation)$/]) { const m = re.exec(tokW); if (m) cut = Math.min(cut, m.index + (re.source.startsWith("fib") ? 3 : re.source.startsWith("cent") ? 4 : re.source.startsWith("behav") ? 7 : re.source.startsWith("colo") ? 4 : re.source.startsWith("ana") ? 2 : 0)); }
    const lfTok = tokW.slice(0, Math.max(1, cut));
    abKeys.push({ sf, sfLow: sf.toLowerCase(), lfTok, lf: lf.trim(), key, re: new RegExp(`(?<![\\p{L}\\p{N}])${wkEsc(sf)}s?(?![\\p{L}\\p{N}])`, "gu"),
      lfRe: own ? new RegExp(`(?<![\\p{L}\\p{N}])${lfPat}(?![\\p{L}\\p{N}])`, "giu") : null,
      defRe: new RegExp(`${lfPat || wkEsc(lf.trim())}\\s*\\(\\s*${wkEsc(sf0)}`, "iu") });
  }
  const reg = wkRegions();
  sents.forEach((s, i) => {
    let m;
    WK.reCI.lastIndex = 0;
    while ((m = WK.reCI.exec(s.t))) { const k = WK.normKey.get(wkNorm(m[0])); if (k) hit(k, i); }
    WK.reCS.lastIndex = 0;
    while ((m = WK.reCS.exec(s.t))) { const k = WK.cs.get(m[0]); if (!k || (WK.cond.has(m[0]) && !condOK.has(m[0]))) continue; hit(k, i); }
    if (reg) for (const [re, get] of [[reg.reCI, w => reg.byCI.get(w.toLowerCase())], [reg.reCS, w => reg.byCS.get(w)]]) {
      re.lastIndex = 0;
      while ((m = re.exec(s.t))) { const e = get(m[0]); if (e) hit(wkRegionKey(e), i, null, m[0]); }
    }
    // cheap exact pre-checks, so each abbreviation's patterns only run on sentences that can match them:
    // the short form (case-sensitive, as counted), the start of the long form, or "(" plus the short form in any
    // case (the definition pattern "long form (SF" ignores case)
    const low = abKeys.length ? s.t.toLowerCase() : "", paren = s.t.includes("(");
    for (const a of abKeys) {
      const hasSf = s.t.includes(a.sf), hasLf = !!a.lfRe && low.includes(a.lfTok), mayDef = paren && low.includes(a.sfLow);
      if (!hasSf && !hasLf && !mayDef) continue;
      let c = 0;
      if (hasSf) c += wkCountSf(s.t, a.sf);
      if (hasLf) { a.lfRe.lastIndex = 0; while (a.lfRe.exec(s.t)) c++; }
      const isDef = mayDef && a.defRe.test(s.t);
      if (c) for (let j = 0; j < c; j++) hit(a.key, i, j === 0 && isDef ? "def" : null);
      else if (isDef) hit(a.key, i, "def");
    }
  });
  // what each abbreviation stands for, kept with its term
  for (const a of abKeys) { const f = found.get(a.key); if (f && !f.sf) { f.sf = a.sf; f.lf = a.lf; } }
  const out = {};
  [...found.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 80).forEach(([k, f]) => {
    const s = sents[f.qi]; let q = s.t;
    if (q.length > 360) q = q.slice(0, 357).replace(/\s+\S*$/, "") + "…";
    // a region found by name keeps the name used ("amygdala"), to title a page that groups several atlas areas
    const word = f.words ? [...f.words.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    out[k] = [f.n, s.sec, q, f.sf || null, f.lf || word || null];
  });
  return out;
}
