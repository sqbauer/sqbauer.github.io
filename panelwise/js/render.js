"use strict";
/* ---------- rendering ---------- */
function render() {
  const lib = ["library", "topic", "record", "review", "palace", "settings", "upload"].includes(S.view);
  $("#steps").hidden = lib; $("#chatBtn").hidden = lib; if (RM.btn) RM.btn.hidden = lib; $("#libBtn").hidden = S.view === "library" || PW.single; $("#setBtn").hidden = S.view === "settings";
  $("#openBtn").hidden = S.view === "upload";
  if (S.view === "upload") { renderUpload(); return; }
  renderTags();
  if (lib) { if (!$("#chat").hidden) setChat(false); if (S.view === "settings") renderSettings(); else if (S.view === "topic") renderTopic(); else if (S.view === "record") renderRecord(); else if (S.view === "review") renderReview(); else if (S.view === "palace") renderPalace(); else renderLibrary(); return; }
  const P = S.paper; if (!P) return;
  $("#pTitle").textContent = P.title;
  $("#pSub").innerHTML = (P.demo ? `<span class="tag">example</span>` : "") + esc(P.sub);
  const nf = P.figures.length;
  const tabs = [["background", "1", "Background"], ["question", "2", "Goal & question"], ["figures", "3", nf ? `Figures <span class="mono" style="font-size:12px;color:var(--muted)">${nf}</span>` : "Figures"], ["card", "4", "Your card"]];
  $("#steps").innerHTML = tabs.map(([v, n, l]) => `<button class="step" role="tab" type="button" data-view="${v}" aria-selected="${S.view === v}"><span class="n">${n}</span>${l}${v === "question" && P.revealed || v === "card" && P.card ? '<span class="ok">✓</span>' : ""}</button>`).join("");
  const m = $("#main");
  if (S.view === "background") m.innerHTML = viewBackground(P);
  else if (S.view === "question") m.innerHTML = viewQuestion(P);
  else if (S.view === "card") { m.innerHTML = viewCard(P); updateWC(); }
  else m.innerHTML = viewFigures(P);
  if (S.view === "figures" && P.figures[S.figIdx]) { P.seen.add(P.figures[S.figIdx].n); if (!P.demo && P.seen.size !== P._savedSeen) { P._savedSeen = P.seen.size; saveCache(); } }
  { const im = $("#frame img"); if (im) { const set = () => im.naturalWidth && $("#frame")?.style.setProperty("--ar", (im.naturalWidth / im.naturalHeight).toFixed(3)); im.complete ? set() : im.addEventListener("load", set, { once: true }); } }
  if (S.view === "figures") { applyHL(); const f = P.figures[S.figIdx]; if (f && !P.demo && !f.img && !f.busy && !f.tried) { f.tried = true; prepareFigure(f); } }
  updateChatCtx();
}
function primerHTML(P) {
  const pr = P.primer;
  if (!pr) {
    if (P.primerBusy) return `<div class="card"><div class="thinking"><span class="dot"></span>Claude is reading the introduction…</div></div>`;
    if (!S.claudeChecked) return `<div class="card"><div class="thinking"><span class="dot"></span>Connecting to Claude…</div></div>`;
    if (!S.sample) return `<div class="card"><h3>Primer</h3><p class="note">${NO_CLAUDE} No primer yet. Read the abstract and introduction on the right; the figures and linked text still work.</p></div>`;
    return `<div class="card"><h3>Primer</h3><p class="note">${esc(P.primerErr || "Claude can summarise the background, gap and key terms before you start.")}</p><button class="btn primary" type="button" data-act="primer">Write the primer</button></div>`;
  }
  return `<div class="primer">
   <div class="card" style="display:flex;flex-direction:column;gap:16px">
    <div><div class="lbl">Field</div><div style="font-weight:600">${esc(pr.field)}</div></div>
    <div><div class="lbl">What was known</div><ul>${(pr.background || []).map(b => `<li>${esc(b)}</li>`).join("")}</ul></div>
    <div><div class="lbl">The gap</div><div>${esc(pr.gap)}</div></div>
   </div>
   ${(pr.keyTerms || []).length ? `<div class="card"><div class="lbl">Key terms</div><dl class="terms">${pr.keyTerms.map(t => `<dt>${esc(t.term)}</dt><dd>${esc(t.definition)}</dd>`).join("")}</dl></div>` : ""}
   ${!P.demo && S.sample ? `<button class="linkbtn" type="button" data-act="primer-redo" style="align-self:flex-start">Regenerate primer</button>` : ""}
  </div>`;
}
function viewBackground(P) {
  const intro = P.sections.intro.length ? P.sections.intro : P.sections.other.slice(0, 4);
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
   <div class="nextbar"><button class="btn primary" type="button" data-go="question">Next: goal and question →</button></div>
  </section>`;
}
function viewQuestion(P) {
  const pr = P.primer, revealed = P.revealed || !pr;
  const v = P.verdict;
  const vtxt = v ? { match: "You've got it", partial: "Partly there", miss: "Not quite" }[v.verdict] || "Feedback" : "";
  const cards = pr ? `
    <div class="card wide"><div class="eyebrow">Core question</div><div class="big">${esc(pr.coreQuestion)}</div></div>
    <div class="card"><div class="eyebrow">Goal</div><p style="margin:6px 0 0">${esc(pr.goal)}</p></div>
    <div class="card"><div class="eyebrow">Hypothesis</div><p style="margin:6px 0 0">${esc(pr.hypothesis || "Not stated explicitly.")}</p></div>
    <div class="card wide"><div class="eyebrow">Approach</div><p style="margin:6px 0 0">${esc(pr.approach)}</p></div>` : "";
  return `<section class="view"><div class="qwrap">
   <div><div class="eyebrow">Step 2 · Goal and core question</div>
   <h2>What question is this paper trying to answer?</h2>
   <p class="lede">Write it in your own words before you look. ${S.sample ? "Claude will compare your version with the paper." : ""}</p></div>
   <div class="card" style="display:flex;flex-direction:column;gap:10px">
     <label for="restate" class="eyebrow">Your version</label>
     <textarea id="restate" placeholder="e.g. Does X cause Y, and is it specific to Z?">${esc(P.restate || "")}</textarea>
     <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
       <button class="btn primary" type="button" data-act="check" ${P.checkBusy ? "disabled" : ""}>${P.checkBusy ? "Checking…" : S.sample ? "Check my understanding" : "Save and reveal"}</button>
       ${!revealed ? `<button class="btn ghost" type="button" data-act="reveal">Reveal without checking</button>` : ""}
     </div>
     ${v ? `<div class="verdict"><div class="v v-${esc(v.verdict)}">${esc(vtxt)}</div><div>${esc(v.feedback)}</div>${v.missing ? `<div class="note" style="margin-top:6px">Missing: ${esc(v.missing)}</div>` : ""}</div>` : ""}
   </div>
   ${pr ? `<div class="reveal ${revealed ? "" : "locked"}">${revealed ? cards : `<div class="blur reveal" style="grid-column:1/-1">${cards}</div><div class="veil"><span class="btn" style="pointer-events:none">Hidden until you write your version</span></div>`}</div>`
        : `<p class="note">${S.sample ? "The primer isn't ready yet, so there's nothing to compare against." : NO_CLAUDE + " Use the abstract as your check."}</p>`}
   <div class="nextbar"><button class="btn" type="button" data-go="background">← Background</button><button class="btn primary" type="button" data-go="figures">Start with Figure 1 →</button></div>
  </div></section>`;
}
function viewFigures(P) {
  if (!P.figures.length) return `<section class="view"><div class="card"><h3>No figures found</h3><p class="note">No figure legends were detected in this PDF. You can still ask about the results in the chat.</p></div></section>`;
  const f = P.figures[S.figIdx], L = f.L;
  const hasPanels = f.panels && f.panels.length;
  const title = L.title || f.legend.slice(0, 120);
  const stage = f.img
    ? `<div class="frame ${S.outlines ? "outlines" : ""}" id="frame"><img src="${f.img}" alt="Figure ${f.n}">${hasPanels ? f.panels.map(p => `<button type="button" class="hot" data-panel="${esc(p.label)}" style="left:${p.x * 100}%;top:${p.y * 100}%;width:${p.w * 100}%;height:${p.h * 100}%" aria-label="Panel ${esc(p.label)}"><span class="badge">${esc(p.label)}</span></button>`).join("") : ""}</div>`
    : `<div class="frame"><div class="pagewait">${f.busy ? `<div class="thinking"><span class="dot"></span>${S.sample && S.imagesOK ? "Claude is locating the panels…" : "Rendering the page…"}</div>` : P.doc || P.demo || P.docReady ? "Preparing figure…" : "This figure isn't on your phone yet. Open the paper once on your PC to sync it."}</div></div>`;
  let status = "";
  if (P.demo) status = "Hover a panel to light up its text. Click to pin it.";
  else if (f.busy) status = "Locating panels…";
  else if (hasPanels) status = `Panels located by Claude. Hover to link, click to pin.`;
  else if (!S.sample || !S.imagesOK) status = "Full page shown. Claude can't see images here, so use the panel buttons.";
  else status = f.err || "No panels found. Use the panel buttons.";
  const brief = P.briefs?.[f.n];
  const briefHTML = brief ? `<details class="brief" open><summary>Figure ${f.n} at a glance <span class="note">${P.demo ? "example" : "by Claude"}</span></summary><div class="bd">
      <div><div class="lbl">Question it answers</div>${esc(brief.question)}</div>
      <div><div class="lbl">Claim</div>${esc(brief.claim)}</div>
      ${(brief.read || []).length ? `<div><div class="lbl">How to read it</div><ul>${brief.read.map(r => `<li><button type="button" class="ref" data-fig="${f.n}" data-panel="${esc(String(r.panel).toUpperCase())}">${f.n}${esc(r.panel)}</button> ${esc(r.what)}</li>`).join("")}</ul></div>` : ""}
      ${(brief.scrutinize || []).length ? `<div><div class="lbl">Check before you believe it</div><ul>${brief.scrutinize.map(s => `<li>${renderRefs(s)}</li>`).join("")}</ul></div>` : ""}
    </div></details>`
    : S.sample ? `<div class="brief"><div style="padding:12px 16px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span><strong>Figure ${f.n} at a glance</strong><br><span class="note">The question it answers, its claim, and what to scrutinise.</span></span><button class="btn" type="button" data-act="brief" ${f.briefBusy ? "disabled" : ""}>${f.briefBusy ? "Writing…" : "Brief me"}</button></div></div>` : "";
  const legend = `<div class="legend"><span class="ttl">${esc(L.head || `Figure ${f.n}. `)}${esc(L.title)}</span> ${L.segs.map(s => `<span class="seg" data-letters="${s.letters.join("")}">${renderRefs(s.text)}</span>`).join(" ")}</div>`;
  const rel = P.paras.filter(p => [...p.keys].some(k => parseInt(k) === f.n));
  const secName = { intro: "Introduction", results: "Results", discussion: "Discussion", methods: "Methods", other: "Text" };
  let lastSec = null;
  const textHTML = rel.length ? rel.map(p => {
    const lab = p.sec !== lastSec ? `<span class="secl">${secName[p.sec] || p.sec}</span>` : ""; lastSec = p.sec;
    return `<p>${lab}${splitSentences(p.text).map(s => { const k = [...refKeys(s)]; return `<span class="sent${k.length ? " has" : ""}" data-k="${k.join(" ")}">${renderRefs(s)}</span>`; }).join(" ")}</p>`;
  }).join("") : `<p class="note">No sentences citing Figure ${f.n} were found in the text.</p>`;
  const letters = f.letters.length ? f.letters : [];
  return `<section class="view">
   <div class="fighead">
     <div style="min-width:0"><div class="eyebrow">Step 3 · Figure ${f.n} of ${P.figures.length}</div><h2>${esc(title)}</h2></div>
     <div class="fignav">${P.figures.map((g, i) => `<button type="button" class="fchip" data-fig-idx="${i}" aria-current="${i === S.figIdx}" aria-label="Figure ${g.n}">${g.n}</button>`).join("")}</div>
   </div>
   <div class="figbody">
     <div class="stage">
       ${stage}
       ${letters.length ? `<div class="panelrow"><span class="note">Panels</span>${letters.map(l => `<button type="button" class="pchip" data-panel="${esc(l)}">${esc(l)}</button>`).join("")}<button type="button" class="linkbtn" data-act="unpin" style="margin-left:6px" hidden>Clear pin</button></div>` : ""}
       <div class="stagebar"><span>${esc(status)}</span><span style="display:flex;gap:14px">${hasPanels ? `<button class="linkbtn" type="button" data-act="outlines">${S.outlines ? "Hide" : "Show"} panel outlines</button>` : ""}${!P.demo && S.sample && S.imagesOK && !f.busy ? `<button class="linkbtn" type="button" data-act="redetect">Re-detect panels</button>` : ""}</span></div>
     </div>
     <div class="figtext" id="figtext">
       ${briefHTML}
       <div class="box"><h3><span>Legend</span></h3>${legend}</div>
       <div class="box"><h3><span>In the text</span><span class="mono" style="text-transform:none;letter-spacing:0">${rel.length} paragraph${rel.length === 1 ? "" : "s"}</span></h3><div class="ptext">${textHTML}</div></div>
       ${notesBox(P, f.n)}
       <div class="figfoot">
         ${S.figIdx > 0 ? `<button class="btn" type="button" data-fig-idx="${S.figIdx - 1}">← Figure ${P.figures[S.figIdx - 1].n}</button>` : `<button class="btn" type="button" data-go="question">← Question</button>`}
         ${S.figIdx < P.figures.length - 1 ? `<button class="btn primary" type="button" data-fig-idx="${S.figIdx + 1}">Figure ${P.figures[S.figIdx + 1].n} →</button>` : `<button class="btn primary" type="button" data-go="card">Write your card →</button>`}
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
    el.classList.toggle("pin", p === pin);
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
  updateChatCtx();
}
function pin(panel, scroll = true) {
  const f = S.paper.figures[S.figIdx];
  if (S.pinned && S.pinned.fig === f.n && S.pinned.panel === panel) S.pinned = null;
  else S.pinned = { fig: f.n, panel };
  applyHL();
  if (S.pinned && scroll) {
    const target = $(".sent.pin") || $(".seg.pin");
    if (target) target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }
}
function goFigure(n, panel) {
  const P = S.paper; const idx = P.figures.findIndex(f => f.n === n);
  if (idx < 0) { toast(`Figure ${n} isn't in this paper's main figures.`); return; }
  S.view = "figures"; const changed = S.figIdx !== idx; S.figIdx = idx; S.hover = null; S.textHover = null;
  S.pinned = panel ? { fig: n, panel } : (changed ? null : S.pinned);
  if (changed) { render(); window.scrollTo({ top: 0 }); } else applyHL();
  if (panel) { const t = $(".sent.pin") || $(".seg.pin"); if (t) t.scrollIntoView({ block: "center" }); }
}

