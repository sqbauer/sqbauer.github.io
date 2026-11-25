"use strict";
/* ---------- rendering ---------- */
const PAPER_VIEWS = ["background", "question", "figures", "card"];
const chev = (d = "r") => `<svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${d === "r" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const askShown = () => !PW.single || !!S.sample;        // the web version has chat only with the visitor's own key
// the header: on a paper, a back link, the title block and the steps; elsewhere the library header as before
function renderHeader(onPaper) {
  document.documentElement.classList.toggle("pw-paper", onPaper);
  $("#top").classList.toggle("paper", onPaper);
  $("#paperHead").hidden = !onPaper; $("#steps").hidden = !onPaper;
  $("#brandBtn").hidden = onPaper; $("#backBtn").hidden = !onPaper; $("#moreBtn").hidden = !onPaper;
  $("#backBtn").textContent = PW.single ? "Start" : "Library";
  $("#backBtn").title = PW.single ? "Back to the start page" : "Back to your library";
  $("#chatBtn").hidden = !onPaper || !askShown(); if (RM.btn) RM.btn.hidden = !onPaper;
  $("#libBtn").hidden = onPaper || S.view === "library" || PW.single; $("#setBtn").hidden = onPaper || S.view === "settings" || (S.view === "library" && !PW.single);
  // on the library, Open one PDF and Settings are in its More menu (one place for rare actions)
  $("#openBtn").hidden = onPaper || S.view === "upload" || (S.view === "library" && !PW.single);
  renderBar(onPaper);
  if (!onPaper) $("#top").classList.remove("scrolled");
}
function shortAuthors(au) { if (!au.length) return ""; const fam = a => String(a).trim().split(/\s+/).pop(); return au.length === 1 ? au[0] : au.length === 2 ? `${fam(au[0])} & ${fam(au[1])}` : `${fam(au[0])} et al.`; }
function paperYear(P) { return P.card?.year || L.meta.items.find(x => x.id === P.id)?.year || recOf(P.id)?.year || P.yearPdf || ((P.fileName || "").match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/) || [])[1] || ""; }
function renderPaperHead(P) {
  const au = P.demo ? [] : authorsFor(P), yr = P.demo ? "" : paperYear(P);
  const meta = [yr, P.sub].filter(Boolean).map(esc).join(" · ");
  const oi = !P.demo && typeof oaInfo === "function" ? oaInfo(P.fileName) : null;
  if (AU.pid !== P.id) { AU.pid = P.id; AU.allShown = false; }
  const pa = $("#phAuthors"); if (pa) pa.innerHTML = authorsLine(au);
  $("#phMeta").innerHTML = (P.demo ? `<span class="tag">example</span>` : "") + meta
    + (oi ? ` <span class="pill p3" title="Saved by Panelwise from ${esc(oi.url || "")}">Open access · ${esc(oaWhere(oi))}</span>` : "");
  if ($("#phTitle").textContent !== P.title) $("#phTitle").textContent = P.title;
  $("#phTitle").title = P.title;
  // compact title in the bar, shown once the big one has scrolled away
  $("#pTitle").textContent = P.title;
  const f = P.figures[S.figIdx];
  $("#pSub").textContent = [shortAuthors(au) + (yr ? " " + yr : ""), S.view === "figures" && f ? `Figure ${f.n}` : { background: "Background", question: "Goal & question", card: "Your card" }[S.view]].filter(s => s && s.trim()).join(" · ");
  const nf = P.figures.length;
  const tabs = [["background", "Background", "Background", false], ["question", "Goal & question", "Question", !!P.revealed], ["figures", "Figures", "Figures", false], ["card", "Your card", "Card", !!P.card]];
  $("#steps").innerHTML = tabs.map(([v, full, short, done], i) => `${i ? '<i class="sj" aria-hidden="true"></i>' : ""}<button class="step${done ? " done" : ""}" role="tab" type="button" data-view="${v}" aria-selected="${S.view === v}">` +
    `<span class="sd" aria-hidden="true">${done ? `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : i + 1}</span>` +
    `<span class="sl"><span class="full">${full}</span><span class="short" aria-hidden="true">${short}</span>${done ? '<span class="sr"> (done)</span>' : ""}</span>` +
    `${v === "figures" && nf ? `<span class="sx" aria-label="figure ${Math.min(S.figIdx + 1, nf)} of ${nf}">${Math.min(S.figIdx + 1, nf)}/${nf}</span>` : ""}</button>`).join("");
}
// the next step, as the one primary action (in the page and, on a phone, in the bottom bar)
function nextStep(P) {
  const nf = P.figures.length, f = P.figures[S.figIdx];
  if (S.view === "background") return { a: 'data-go="question"', l: "Next: Question", ll: "Next: goal and question" };
  if (S.view === "question") return nf ? { a: 'data-go="figures"', l: `Figure ${f.n}`, ll: S.figIdx ? `Back to Figure ${f.n}` : `Start with Figure ${f.n}` } : { a: 'data-go="card"', l: "Write your card", ll: "Write your card" };
  if (S.view === "figures" && S.figIdx < nf - 1) { const g = P.figures[S.figIdx + 1]; return { a: `data-fig-idx="${S.figIdx + 1}"`, l: `Figure ${g.n}`, ll: `Figure ${g.n}` }; }
  if (S.view === "figures") return { a: 'data-go="card"', l: "Write your card", ll: "Write your card" };
  return P.card ? { a: 'data-bar="lib"', l: PW.single ? "Done" : "Library", ll: PW.single ? "Done" : "Back to library" } : { a: 'data-act="savecard"', l: "Save card", ll: "Save card" };
}
// phone: one bottom bar (Read · Ask · next step) instead of two floating buttons
function renderBar(onPaper) {
  let bar = $("#actbar");
  if (!bar) { bar = document.createElement("nav"); bar.id = "actbar"; bar.className = "actbar"; bar.setAttribute("aria-label", "Paper actions"); document.body.appendChild(bar); }
  bar.hidden = !onPaper; if (!onPaper) { bar.innerHTML = ""; return; }
  const n = nextStep(S.paper);
  bar.innerHTML = `<button class="btn" type="button" data-bar="read">Read</button>${askShown() ? `<button class="btn" type="button" data-bar="ask" aria-expanded="${!$("#chat").hidden}">Ask</button>` : ""}<button class="btn primary" type="button" ${n.a}><span class="bl">${esc(n.l)}</span>${/savecard/.test(n.a) ? "" : chev()}</button>`;
}
function render() {
  const lib = ["library", "topic", "record", "review", "palace", "settings", "upload", "wiki"].includes(S.view);
  renderHeader(!lib && !!S.paper);
  if (S.view === "upload") { renderUpload(); return; }
  if (S.view === "wiki") { if (!$("#chat").hidden) setChat(false); renderWikiTerm(); return; }
  renderTags();
  if (lib) { if (!$("#chat").hidden) setChat(false); if (S.view === "settings") renderSettings(); else if (S.view === "topic") renderTopic(); else if (S.view === "record") renderRecord(); else if (S.view === "review") renderReview(); else if (S.view === "palace") renderPalace(); else renderLibrary(); return; }
  const P = S.paper; if (!P) return;
  renderPaperHead(P);
  const m = $("#main");
  const typing = draftFocus();
  if (!P.demo) stepSave(P.id, S.view, S.figIdx);
  if (S.view === "background") m.innerHTML = viewBackground(P);
  else if (S.view === "question") m.innerHTML = viewQuestion(P);
  else if (S.view === "card") { m.innerHTML = viewCard(P); updateWC(); }
  else m.innerHTML = viewFigures(P);
  if (S.view === "figures" && P.figures[S.figIdx]) { P.seen.add(P.figures[S.figIdx].n); if (!P.demo && P.seen.size !== P._savedSeen) { P._savedSeen = P.seen.size; saveCache(); } }
  { const im = $("#frame img"); if (im) { const set = () => im.naturalWidth && $("#frame")?.style.setProperty("--ar", (im.naturalWidth / im.naturalHeight).toFixed(3)); im.complete ? set() : im.addEventListener("load", set, { once: true }); } }
  if (S.view === "figures") { figFit(); $("#frame img")?.addEventListener("load", figFit, { once: true }); applyHL(); const f = P.figures[S.figIdx]; if (f && !P.demo && !f.img && !f.busy && !f.tried && P.doc) { f.tried = true; prepareFigure(f); } }
  draftsRestore(typing);
  updateChatCtx();
  topScrolled();
}
// the bar's compact title fades in once the big title is under the bar
function topScrolled() {
  const top = $("#top"); if (!top.classList.contains("paper")) return;
  const t = $("#phTitle"); top.classList.toggle("scrolled", !!t && t.getBoundingClientRect().bottom < top.getBoundingClientRect().bottom);
}
addEventListener("scroll", () => { if (topScrolled.raf) return; topScrolled.raf = requestAnimationFrame(() => { topScrolled.raf = 0; topScrolled(); }); }, { passive: true });
$("#backBtn").onclick = () => $("#brandBtn").click();     // the same as the brand button: library, or the start page on the web
$("#moreBtn").onclick = e => {
  const P = S.paper; if (!P) return;
  const f = S.view === "figures" ? P.figures[S.figIdx] : null, items = [];
  items.push({ label: PW.single ? "Open another PDF…" : "Open a PDF…", run: () => $("#fileIn").click() });
  if (!P.demo) items.push({ label: "Add a topic", run: () => { S.tagEdit = true; renderTags(); } });
  if (f && f.panels && f.panels.length) items.push({ label: S.outlines ? "Hide panel outlines" : "Show panel outlines", run: () => { S.outlines = !S.outlines; render(); } });
  if (f && !P.demo && S.sample && S.imagesOK && !f.busy) items.push({ label: "Re-detect panels", run: () => prepareFigure(f, true) });
  items.push({ label: "Mouse brain sections", run: () => brainOpen("") });
  items.push("-", { label: "Settings", run: () => $("#setBtn").click() });
  openMenu(e.currentTarget, items);
};
// a panel picked from the legend also brings its sentence into view (events.js calls pin(letter, false) for both legend and sentence clicks)
let pinFrom = null;
document.addEventListener("click", e => { pinFrom = e.target.closest && e.target.closest(".legend .seg") ? "legend" : null; }, true);
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-bar], [data-pstep]"); if (!b) return;
  if (b.dataset.bar === "read") rmOpen();
  else if (b.dataset.bar === "ask") setChat($("#chat").hidden);
  else if (b.dataset.bar === "lib") $("#brandBtn").click();
  else if (b.dataset.pstep && S.paper) {
    const f = S.paper.figures[S.figIdx], ls = panelLetters(f); if (!ls.length) return;
    const cur = S.pinned && S.pinned.fig === f.n ? ls.indexOf(S.pinned.panel) : -1;
    const i = cur < 0 ? 0 : Math.max(0, Math.min(ls.length - 1, cur + +b.dataset.pstep));
    if (ls[i] !== (S.pinned && S.pinned.panel)) pin(ls[i]);
    const nb = $(`#pcard [data-pstep="${b.dataset.pstep}"]:not([disabled])`) || $("#pcard [data-pstep]:not([disabled])");   // the card was redrawn: keep focus on its arrows
    if (nb) nb.focus({ preventScroll: true });
  }
});
// the figure column (wide windows) must fit the window: the room left for the image, from the real window height
function figFit() {
  const st = document.querySelector(".stage"); if (!st) return;
  const top = parseFloat(getComputedStyle(st).top) || 0, frame = st.querySelector(".frame");
  const other = frame ? st.getBoundingClientRect().height - frame.getBoundingClientRect().height : 120;   // panel row, bar
  document.documentElement.style.setProperty("--fig-max", Math.max(220, Math.floor(innerHeight - top - other - 16)) + "px");
}
addEventListener("resize", () => { if (S.view === "figures") figFit(); });
// where you are in a paper (step and figure), so reopening it continues there
const stepKey = id => "pwread:step:" + id;
function stepLoad(id) { try { return JSON.parse(localStorage.getItem(stepKey(id)) || "null"); } catch { return null; } }
function stepSave(id, view, fig) {
  const cur = stepLoad(id); if (cur && cur.view === view && cur.fig === fig) return;
  try { localStorage.setItem(stepKey(id), JSON.stringify({ t: Date.now(), view, fig })); } catch {}
}
// after moving to another step or figure: focus its heading, so keyboard and screen-reader users land on the new view
// (the button they pressed was replaced by the re-render)
function viewFocus() {
  const h = $("#main h2"); if (!h) return;
  h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true });
}
/* ---- drafts: a note or card being typed survives a re-render (panels found, PDF loaded, sync) ---- */
const DRAFT_IDS = ["noteIn", "cLab", "cYear", "cPrep", "cFind", "cCav", "cFig", "cPanel"];
const draftKey = id => `${S.paper ? S.paper.id : ""}|${S.view}|${id === "noteIn" ? S.figIdx : ""}|${id}`;
const draftKeep = e => { if (DRAFT_IDS.includes(e.target.id) && S.paper) (S.drafts = S.drafts || {})[draftKey(e.target.id)] = e.target.value; };
document.addEventListener("input", draftKeep);
document.addEventListener("change", draftKeep);
function draftFocus() {
  const a = document.activeElement;
  return a && DRAFT_IDS.includes(a.id) ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
}
function draftsRestore(typing) {
  if (S.drafts) for (const id of DRAFT_IDS) {
    const el = document.getElementById(id), k = draftKey(id);
    if (el && k in S.drafts && el.value !== S.drafts[k]) { el.value = S.drafts[k]; if (id === "cFind" && typeof updateWC === "function") updateWC(); }
  }
  // keep typing where you were
  if (typing) { const el = document.getElementById(typing.id); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(typing.s, typing.e); } catch {} } }
}
// saved: the draft is done
function draftsClear(ids) { if (S.drafts) for (const id of ids) delete S.drafts[draftKey(id)]; }
function primerHTML(P) {
  const pr = P.primer;
  if (!pr) {
    if (P.primerBusy) return `<div class="card"><div class="thinking"><span class="dot"></span>Claude is reading the introduction…</div></div>`;
    if (!S.claudeChecked) return `<div class="card"><div class="thinking"><span class="dot"></span>Connecting to Claude…</div></div>`;
    if (!S.sample) return `<div class="card"><h3>Primer</h3><p class="note">${NO_CLAUDE} No primer yet. Read the abstract and introduction on the right; the figures and linked text still work.</p></div>`;
    return `<div class="card"><h3>Primer</h3><p class="note">${esc(P.primerErr || "Claude can summarise the background, gap and key terms before you start.")}</p><button class="btn" type="button" data-act="primer">Write the primer</button></div>`;
  }
  return `<div class="primer">
   <div class="card" style="display:flex;flex-direction:column;gap:16px">
    <div><div class="lbl">Field</div><div style="font-weight:600">${esc(pr.field)}</div></div>
    <div><div class="lbl">What was known</div><ul>${(pr.background || []).map(b => `<li>${esc(b)}</li>`).join("")}</ul></div>
    <div><div class="lbl">The gap</div><div>${esc(pr.gap)}</div></div>
   </div>
   ${(pr.keyTerms || []).length ? `<div class="card"><div class="lbl">Key terms</div><dl class="terms">${pr.keyTerms.map(t => `<dt>${esc(t.term)}</dt><dd>${esc(t.definition)}</dd>`).join("")}</dl></div>` : ""}
   ${!P.demo && S.sample ? `<button class="btn quiet" type="button" data-act="primer-redo" style="align-self:flex-start;margin-left:-10px">Regenerate primer</button>` : ""}
  </div>`;
}
function viewBackground(P) {
  const intro = P.sections.intro.length ? P.sections.intro : P.sections.other.slice(0, 4), n = nextStep(P);
  return `<section class="view">
   <div class="eyebrow">Step 1 · Background</div>
   <h2>Understand the background before the figures</h2>
   <p class="lede">Read the abstract and introduction. The primer lists what was already known, the gap the authors address, and terms you'll meet later.</p>
   <div class="cols">
    ${primerHTML(P)}
    <article class="card reading">
      <h4>Abstract</h4>${P.abstract ? `<p>${esc(P.abstract)}</p>` : `<p class="note">No abstract was detected.</p>`}
      <h4>Introduction</h4>${intro.length ? intro.map(t => `<p>${renderRefs(t)}</p>`).join("") : `<p class="note">No introduction section was detected. Ask in the chat for a summary of the background.</p>`}
    </article>
   </div>
   <div style="margin-top:24px;max-width:760px">${notesBox(P, null)}</div>
   <div class="nextbar"><button class="btn primary" type="button" ${n.a}>${esc(n.ll)}${chev()}</button></div>
  </section>`;
}
function viewQuestion(P) {
  const pr = P.primer, revealed = P.revealed || !pr;
  const v = P.verdict, n = nextStep(P);
  const vtxt = v ? { match: "You've got it", partial: "Partly there", miss: "Not quite" }[v.verdict] || "Feedback" : "";
  const cards = pr ? `
    <div class="card wide"><div class="eyebrow">Core question</div><div class="big">${esc(pr.coreQuestion)}</div></div>
    <div class="card"><div class="eyebrow">Goal</div><p style="margin:6px 0 0">${esc(pr.goal)}</p></div>
    <div class="card"><div class="eyebrow">Hypothesis</div><p style="margin:6px 0 0">${esc(pr.hypothesis || "Not stated explicitly.")}</p></div>
    <div class="card wide"><div class="eyebrow">Approach</div><p style="margin:6px 0 0">${esc(pr.approach)}</p></div>` : "";
  // one primary at a time: checking your version until the answer is shown, then the next step
  return `<section class="view"><div class="qwrap">
   <div><div class="eyebrow">Step 2 · Goal and core question</div>
   <h2>What question is this paper trying to answer?</h2>
   <p class="lede">Write it in your own words before you look. ${S.sample ? "Claude will compare your version with the paper." : ""}</p></div>
   <div class="card" style="display:flex;flex-direction:column;gap:10px">
     <label for="restate" class="eyebrow">Your version</label>
     <textarea id="restate" placeholder="e.g. Does X cause Y, and is it specific to Z?">${esc(P.restate || "")}</textarea>
     <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
       <button class="btn ${revealed && !P.checkBusy ? "" : "primary"}" type="button" data-act="check" ${P.checkBusy ? "disabled" : ""}>${P.checkBusy ? "Checking…" : S.sample ? "Check my understanding" : "Save and reveal"}</button>
       ${!revealed ? `<button class="btn quiet" type="button" data-act="reveal">Reveal without checking</button>` : ""}
     </div>
     ${v ? `<div class="verdict"><div class="v v-${esc(v.verdict)}">${esc(vtxt)}</div><div>${esc(v.feedback)}</div>${v.missing ? `<div class="note" style="margin-top:6px">Missing: ${esc(v.missing)}</div>` : ""}</div>` : ""}
   </div>
   ${pr ? `<div class="reveal ${revealed ? "" : "locked"}">${revealed ? cards : `<div class="blur reveal" style="grid-column:1/-1">${cards}</div><div class="veil"><span class="btn" style="pointer-events:none">Hidden until you write your version</span></div>`}</div>`
        : `<p class="note">${S.sample ? "The primer isn't ready yet, so there's nothing to compare against." : NO_CLAUDE + " Use the abstract as your check."}</p>`}
   <div class="nextbar"><button class="btn" type="button" data-go="background">${chev("l")}Background</button><button class="btn ${revealed ? "primary" : ""}" type="button" ${n.a}>${esc(n.ll)}${chev()}</button></div>
  </div></section>`;
}
// the panel letters of a figure: from the legend and from the located panels
function panelLetters(f) { return f ? [...new Set([...(f.letters || []), ...(f.panels || []).map(p => p.label)])].sort() : []; }
function viewFigures(P) {
  if (!P.figures.length) return `<section class="view"><div class="card"><h3>No figures found</h3><p class="note">No figure legends were detected in this PDF. You can still ask about the results in the chat.</p></div><div class="nextbar"><button class="btn primary" type="button" data-go="card">Write your card${chev()}</button></div></section>`;
  const f = P.figures[S.figIdx], L = f.L, n = nextStep(P);
  const hasPanels = f.panels && f.panels.length;
  const title = L.title || f.legend.slice(0, 120);
  const stage = f.img
    ? `<div class="frame ${S.outlines ? "outlines" : ""}" id="frame"><div class="zw" id="zw"><img src="${f.img}" alt="Figure ${f.n}">${hasPanels ? f.panels.map(p => `<button type="button" class="hot" data-panel="${esc(p.label)}" style="left:${p.x * 100}%;top:${p.y * 100}%;width:${p.w * 100}%;height:${p.h * 100}%" aria-label="Panel ${esc(p.label)}" aria-pressed="false"><span class="badge" aria-hidden="true">${esc(p.label)}</span></button>`).join("") : ""}</div></div>`
    : `<div class="frame"><div class="pagewait">${f.busy ? `<div class="thinking"><span class="dot"></span>${S.sample && S.imagesOK ? "Claude is locating the panels…" : "Rendering the page…"}</div>` : P.docFailed ? "Couldn't load this PDF to draw the figure. Close the paper and open it again." : P.doc || P.demo || P.docReady ? "Preparing figure…" : "This figure isn't on your phone yet. Open the paper once on your PC to sync it."}</div></div>`;
  let status = "";
  if (P.demo) status = "Hover a panel or a dotted sentence to link them; click to keep it selected.";
  else if (f.busy) status = "Locating panels…";
  else if (hasPanels) status = "Panels located by Claude. Hover to link them to the text, click to keep one selected.";
  else if (!S.sample || !S.imagesOK) status = "Full page shown. Claude can't see images here, so use the panel letters.";
  else status = f.err || "No panels found. Use the panel letters.";
  const brief = P.briefs?.[f.n];
  const briefHTML = brief ? `<details class="brief" open><summary>Figure ${f.n} at a glance <span class="note">${P.demo ? "example" : "by Claude"}</span></summary><div class="bd">
      <div><div class="lbl">Question it answers</div>${esc(brief.question)}</div>
      <div><div class="lbl">Claim</div>${esc(brief.claim)}</div>
      ${(brief.read || []).length ? `<div><div class="lbl">How to read it</div><ul>${brief.read.map(r => `<li><button type="button" class="ref" data-fig="${f.n}" data-panel="${esc(String(r.panel).toUpperCase())}">${f.n}${esc(r.panel)}</button> ${esc(r.what)}</li>`).join("")}</ul></div>` : ""}
      ${(brief.scrutinize || []).length ? `<div><div class="lbl">Check before you believe it</div><ul>${brief.scrutinize.map(s => `<li>${renderRefs(s)}</li>`).join("")}</ul></div>` : ""}
    </div></details>`
    : S.sample ? `<div class="brief"><div class="brief-ask"><span><strong>Figure ${f.n} at a glance</strong><br><span class="note">The question it answers, its claim, and what to scrutinise.</span></span><button class="btn" type="button" data-act="brief" ${f.briefBusy ? "disabled" : ""}>${f.briefBusy ? "Writing…" : "Brief me"}</button></div></div>` : "";
  const legend = `<div class="legend"><span class="ttl">${esc(L.head || `Figure ${f.n}. `)}${esc(L.title)}</span> ${L.segs.map(s => `<span class="seg" data-letters="${s.letters.join("")}">${renderRefs(s.text)}</span>`).join(" ")}</div>`;
  const rel = P.paras.filter(p => [...p.keys].some(k => parseInt(k) === f.n));
  const secName = { ...SEC_NAMES, other: "Text" };
  let lastSec = null;
  const textHTML = rel.length ? rel.map(p => {
    const lab = p.sec !== lastSec ? `<span class="secl">${secName[p.sec] || p.sec}</span>` : ""; lastSec = p.sec;
    return `<p>${lab}${splitSentences(p.text).map(s => { const k = [...refKeys(s)]; return `<span class="sent${k.length ? " has" : ""}" data-k="${k.join(" ")}">${renderRefs(s)}</span>`; }).join(" ")}</p>`;
  }).join("") : `<p class="note">No sentences citing Figure ${f.n} were found in the text.</p>`;
  const letters = panelLetters(f);
  return `<section class="view">
   <div class="fighead">
     <div style="min-width:0"><div class="eyebrow">Figure ${f.n} of ${P.figures.length}</div><h2 title="${esc(title)}">${esc(title)}</h2></div>
     <div class="fignav" role="group" aria-label="Figures">${P.figures.map((g, i) => `<button type="button" class="chip fchip mono" data-fig-idx="${i}" aria-current="${i === S.figIdx}" aria-label="Figure ${g.n}">${g.n}</button>`).join("")}</div>
   </div>
   <div class="figbody">
     <div class="stage">
       ${stage}
       ${letters.length ? `<div class="panelrow" role="group" aria-label="Panels"><span class="eyebrow">Panels</span>${letters.map(l => `<button type="button" class="chip pchip mono" data-panel="${esc(l)}" aria-pressed="false" aria-label="Panel ${esc(l)}">${esc(l)}</button>`).join("")}<button type="button" class="btn quiet clearpin" data-act="unpin" hidden>Clear</button></div>` : ""}
       <div class="stagebar"><span>${esc(status)}</span>${P.figures.length ? `<button type="button" class="btn quiet figcard" data-act="figcard">+ Card from this figure</button>` : ""}</div>
     </div>
     <div class="figtext" id="figtext">
       ${letters.length ? `<section class="box pcard" id="pcard" aria-live="polite" aria-label="Selected panel"></section>` : ""}
       <div class="box"><h3><span>In the text</span><span class="c">${rel.length} paragraph${rel.length === 1 ? "" : "s"}</span></h3><div class="ptext">${textHTML}</div></div>
       <div class="box"><h3><span>Legend</span></h3>${legend}</div>
       ${briefHTML}
       ${notesBox(P, f.n)}
       <div class="figfoot">
         ${S.figIdx > 0 ? `<button class="btn" type="button" data-fig-idx="${S.figIdx - 1}">${chev("l")}Figure ${P.figures[S.figIdx - 1].n}</button>` : `<button class="btn" type="button" data-go="question">${chev("l")}Goal &amp; question</button>`}
         <button class="btn primary" type="button" ${n.a}>${esc(n.ll)}${chev()}</button>
       </div>
     </div>
   </div>
  </section>`;
}

/* ---------- linking highlight ---------- */
function applyHL() {
  if (S.view !== "figures" || !S.paper) return;
  const f = S.paper.figures[S.figIdx]; if (!f) return;
  const hov = S.hover, pin = S.pinned && S.pinned.fig === f.n ? S.pinned.panel : null;
  const lit = S.textHover || [];
  $$(".hot, .pchip").forEach(el => {
    const p = el.dataset.panel;
    el.classList.toggle("on", p === hov);
    el.classList.toggle("pin", p === pin); el.setAttribute("aria-pressed", p === pin);
    el.classList.toggle("lit", lit.includes(p) && p !== pin);
  });
  $$(".sent").forEach(el => {
    const keys = (el.dataset.k || "").split(" ");
    el.classList.toggle("hl", !!hov && keys.includes(f.n + hov));
    el.classList.toggle("pin", !!pin && keys.includes(f.n + pin));
    el.classList.toggle("whole", keys.includes(f.n + "*") && !keys.some(k => parseInt(k) === f.n && !k.endsWith("*")));
  });
  const ub = $('[data-act="unpin"]'); if (ub) ub.hidden = !pin;
  $$(".seg").forEach(el => {
    const ls = el.dataset.letters || "";
    el.classList.toggle("hl", !!hov && ls.includes(hov));
    el.classList.toggle("pin", !!pin && ls.includes(pin));
  });
  panelCard(f, pin);
  figZoom(f, pin);
  noteTarget(f, pin);
  updateChatCtx();
}
// Mac (mouse): clicking a panel on the figure enlarges it inside the figure's own box (never over the text);
// another click goes back. While enlarged, choosing another panel (panel row, arrows, a sentence) moves to it.
function figZoom(f, pin) {
  const zw = $("#zw"), frame = $("#frame"); if (!zw || !frame) return;
  const p = S.zoom && pin && (f.panels || []).find(q => q.label === pin);
  if (!p) { if (S.zoom && !pin) S.zoom = false; zw.style.transform = ""; frame.classList.remove("zoomed"); zw.style.removeProperty("--zs"); return; }
  const s = Math.max(1, Math.min(4, 0.94 / Math.max(p.w, p.h)));
  const cl = (v, lo) => Math.min(0, Math.max(lo, v));
  const tx = cl(50 - s * (p.x + p.w / 2) * 100, 100 - 100 * s), ty = cl(50 - s * (p.y + p.h / 2) * 100, 100 - 100 * s);
  zw.style.transform = `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(${s.toFixed(3)})`;
  zw.style.setProperty("--zs", s.toFixed(3)); frame.classList.add("zoomed");
}
// the selected-panel card: what the panel shows (its legend part), how many sentences cite it, and arrows to the neighbours
function panelCard(f, pin) {
  const el = $("#pcard"); if (!el) return;
  const k = f.n + "|" + (pin || ""); if (el.dataset.k === k) return; el.dataset.k = k;
  const ls = panelLetters(f), i = pin ? ls.indexOf(pin) : -1, tap = PW_TOUCH_UI() ? "Tap" : "Click";
  const nav = `<span class="pnav"><button type="button" class="btn quiet" data-pstep="-1" ${i <= 0 ? "disabled" : ""} aria-label="${i > 0 ? `Previous panel, ${esc(ls[i - 1])}` : "Previous panel"}">${chev("l")}${i > 0 ? esc(ls[i - 1]) : ""}</button><button type="button" class="btn quiet" data-pstep="1" ${i >= ls.length - 1 ? "disabled" : ""} aria-label="${i < 0 ? `First panel, ${esc(ls[0])}` : i < ls.length - 1 ? `Next panel, ${esc(ls[i + 1])}` : "Next panel"}">${i < ls.length - 1 ? esc(ls[i + 1]) : ""}${chev()}</button></span>`;
  if (!pin) { el.innerHTML = `<div class="pl none" aria-hidden="true">?</div><div class="pb"><div class="eyebrow">No panel selected</div><p class="pw">${tap} a panel letter, a part of the legend or a dotted sentence to link them.</p></div><div class="pm"><span class="note">${ls.length} panel${ls.length === 1 ? "" : "s"}</span>${nav}</div>`; return; }
  const seg = f.L.segs.find(s => s.letters.includes(pin)), br = (S.paper.briefs?.[f.n]?.read || []).find(r => String(r.panel).toUpperCase() === pin);
  let d = (seg ? seg.text : br ? br.what : "").replace(/^\s*\(?[A-Za-z](?:\s*[–,-]\s*[A-Za-z])*\)\s*/, "").replace(new RegExp(`^\\s*${pin.replace(/[^A-Za-z0-9]/g, "")}[\\s.:]+`, "i"), "").trim();
  if (d.length > 220) d = d.slice(0, 210).replace(/\s+\S*$/, "") + "…";
  const nS = $$(".ptext .sent.pin").length;
  el.innerHTML = `<div class="pl" aria-hidden="true">${esc(pin)}</div><div class="pb"><div class="eyebrow">Figure ${f.n} · Panel ${esc(pin)}</div><p class="pw">${d ? esc(d) : `<span class="note">The legend doesn't describe this panel separately.</span>`}</p></div>
    <div class="pm"><span class="note">${nS ? `${nS} sentence${nS === 1 ? "" : "s"} in the text cite${nS === 1 ? "s" : ""} it` : "Not cited in the text; see the legend"}</span>${nav}</div>`;
}
const PW_TOUCH_UI = () => matchMedia("(hover: none)").matches;
// the note box says what a new note will be saved with
function noteTarget(f, pin) {
  const w = $("#noteWhere"), ta = $("#noteIn"), b = $('[data-act="addnote"]'); if (!w || !b || +b.dataset.fig !== f.n) return;
  const on = pin ? `${f.n}${pin}` : "";
  w.textContent = `Saved with ${on ? `panel ${on}` : `Figure ${f.n}`}`;
  if (ta) ta.placeholder = on ? `A note on panel ${on}…` : `A note on Figure ${f.n}…`;
  b.textContent = on ? `Save note on ${on}` : "Save note";
}
// bring an element into the part of the screen that isn't covered by the sticky header, the sticky figure (phone) or the bottom bar
function revealLinked(el, smooth = true) {
  if (!el) return;
  const r = el.getBoundingClientRect(); let top = 0, bot = innerHeight, topStuck = 0;
  const bar = $("#top"); if (bar && getComputedStyle(bar).position === "sticky") { top = Math.max(top, bar.getBoundingClientRect().bottom); topStuck = bar.offsetHeight + (parseFloat(getComputedStyle(bar).top) || 0); }
  const st = $(".stage");
  if (st && getComputedStyle(st).position === "sticky") {
    const sr = st.getBoundingClientRect();
    if (sr.left < r.right && sr.right > r.left) { top = Math.max(top, sr.bottom); topStuck = Math.max(topStuck, (parseFloat(getComputedStyle(st).top) || 0) + st.offsetHeight); }
  }
  const ab = $("#actbar"); if (ab && !ab.hidden && ab.getClientRects().length) bot = Math.min(bot, ab.getBoundingClientRect().top);
  if (r.top >= top + 4 && r.bottom <= bot - 4) return;            // already in view
  const t0 = topStuck || top, band = bot - t0;                   // where the sticky parts end once they have stuck
  const y = scrollY + r.top - t0 - (r.height < band ? (band - r.height) / 2 : 8);
  window.scrollTo({ top: Math.max(0, y), behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
}
function pin(panel, scroll = true) {
  const f = S.paper.figures[S.figIdx];
  if (S.pinned && S.pinned.fig === f.n && S.pinned.panel === panel) S.pinned = null;
  else S.pinned = { fig: f.n, panel };
  applyHL();
  if (S.pinned && (scroll || pinFrom === "legend")) revealLinked($(".ptext .sent.pin") || $(".seg.pin"));
  pinFrom = null;
}
function goFigure(n, panel) {
  const P = S.paper; const idx = P.figures.findIndex(f => f.n === n);
  if (idx < 0) { toast(`Figure ${n} isn't in this paper's main figures.`); return; }
  S.view = "figures"; const changed = S.figIdx !== idx; S.figIdx = idx; S.hover = null; S.textHover = null;
  S.pinned = panel ? { fig: n, panel } : (changed ? null : S.pinned);
  if (changed || !$("#figtext")) { render(); window.scrollTo({ top: 0 }); } else applyHL();
  if (panel) revealLinked($(".ptext .sent.pin") || $(".seg.pin"), false);
}
