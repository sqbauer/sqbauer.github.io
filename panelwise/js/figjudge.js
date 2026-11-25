"use strict";
/* ---------- your verdict on a figure, and a methods & statistics check ----------
   Under each figure: are you convinced by the authors' claim (yes, partly, no) and one line of why. It shows on
   the paper's saved work, in topic tables and in the Markdown export. Optionally Claude reads the legend, the text
   citing the figure and the Methods, and lists the sample sizes (and what n counts), the tests, and anything to
   worry about. Both are saved with the paper (P.judge, P.stats), keyed by figure number. */
const JUDGE_NAMES = { yes: "Convinced", part: "Partly", no: "Not convinced" };

function judgeHTML(P, f) {
  const j = (P.judge || {})[f.n] || {};
  return `<div class="judge" aria-label="Your verdict on Figure ${f.n}">
    <div class="lbl">Your verdict on the claim</div>
    <div class="tags" role="group" aria-label="Your verdict">${Object.entries(JUDGE_NAMES).map(([k, l]) => `<button type="button" class="chip j-${k}" data-judge="${k}" aria-pressed="${j.v === k}">${l}</button>`).join("")}</div>
    ${j.v ? `<input id="judgeWhy" class="judge-why" value="${esc(j.why || "")}" placeholder="Why, in one line (saved when you leave the field)" aria-label="Why" autocomplete="off" enterkeyhint="done">` : ""}
  </div>`;
}
function setJudge(v) {
  const P = S.paper, f = P && P.figures[S.figIdx]; if (!f) return;
  P.judge = { ...(P.judge || {}) };
  const cur = P.judge[f.n] || {};
  if (cur.v === v) delete P.judge[f.n];                              // tap again to clear
  else P.judge[f.n] = { ...cur, v, at: Date.now() };
  persistPaper(P); render();
  if (P.judge[f.n] && !cur.v) requestAnimationFrame(() => $("#judgeWhy")?.focus({ preventScroll: true }));
}
function setJudgeWhy(text) {
  const P = S.paper, f = P && P.figures[S.figIdx]; if (!f || !(P.judge || {})[f.n]) return;
  if ((P.judge[f.n].why || "") === text) return;
  P.judge = { ...P.judge, [f.n]: { ...P.judge[f.n], why: text, at: Date.now() } }; persistPaper(P);
}

function statsHTML(P, f) {
  const st = (P.stats || {})[f.n];
  if (st) return `<details class="brief stats" open><summary>Methods &amp; statistics <span class="note">by Claude · check against the paper</span></summary><div class="bd">
      ${st.n ? `<div><div class="lbl">Sample sizes (what n counts)</div>${esc(st.n)}</div>` : ""}
      ${st.tests ? `<div><div class="lbl">Tests and corrections</div>${esc(st.tests)}</div>` : ""}
      ${st.subjects ? `<div><div class="lbl">Subjects</div>${esc(st.subjects)}</div>` : ""}
      <div><div class="lbl">Worth checking</div>${(st.flags || []).length ? `<ul>${st.flags.map(x => `<li>${renderRefs(String(x))}</li>`).join("")}</ul>` : `<span class="note">Nothing stood out.</span>`}</div>
      <div><button type="button" class="linkbtn" data-act="stats" ${f.statsBusy ? "disabled" : ""}>${f.statsBusy ? "Checking…" : "Check again"}</button></div></div></details>`;
  if (!S.sample || P.demo) return "";
  return `<div class="brief"><div class="brief-ask"><span><strong>Methods &amp; statistics</strong><br><span class="note">n and what it counts, the tests, and what to be wary of (pseudoreplication, missing corrections…).</span></span><button class="btn" type="button" data-act="stats" ${f.statsBusy ? "disabled" : ""}>${f.statsBusy ? "Checking…" : "Check"}</button></div></div>`;
}
async function genStats(f) {
  const P = S.paper; if (!S.sample || !f) return;
  P.stats = P.stats || {}; f.statsBusy = true; render();
  const cites = P.paras.filter(p => [...p.keys].some(k => parseInt(k) === f.n)).map(p => p.text).join("\n\n").slice(0, 15000);
  // the Methods: paragraphs about statistics or this figure first, then the rest, within the budget
  const meth = (P.sections.methods || []).map(String);
  const near = meth.filter(t => new RegExp(`statist|n\\s*=|t-test|anova|wilcoxon|mann|mixed|regression|bonferroni|correct|fig(?:ure|\\.)\\s*${f.n}\\b`, "i").test(t));
  const methods = [...new Set([...near, ...meth])].join("\n\n").slice(0, 30000);
  const prompt = `You check the methods and statistics behind one figure of a scientific paper for a researcher. Use only what the paper says; when something isn't stated, say "not stated". Reply with only JSON:
{"n": "sample sizes per panel and what each n counts (animals, cells, trials, sessions), one or two sentences", "tests": "the statistical tests, what was compared, and any correction for multiple comparisons, one or two sentences", "subjects": "species, strain, sex and age if stated, one sentence", "flags": ["0-4 specific, concrete concerns, e.g. cells or trials treated as independent samples (pseudoreplication), n missing, many comparisons without correction, the legend and the Methods disagree, p values without effect sizes, one sex only. Cite panels like Fig. ${f.n}B. Empty list if none."]}
FIGURE ${f.n} LEGEND: ${f.legend}
TEXT CITING THIS FIGURE:
${cites}
METHODS:
${methods || "(no Methods section found)"}`;
  try { P.stats[f.n] = { ...(await S.sample.json(prompt, { cache: { gcTime: 864e5 * 30 } })), at: Date.now() }; persistPaper(P); }
  catch (e) { toast(errCopy(e)); claudeOff(e); }
  f.statsBusy = false; render();
}

document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-judge]"); if (!t || S.view !== "figures") return;
  setJudge(t.dataset.judge);
});
document.addEventListener("change", e => { if (e.target.id === "judgeWhy") setJudgeWhy(e.target.value.trim()); });
document.addEventListener("keydown", e => { if (e.target.id === "judgeWhy" && e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
