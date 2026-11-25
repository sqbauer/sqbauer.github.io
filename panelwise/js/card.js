"use strict";
/* ----- your card ----- */
function onelinerHTML(c) {
  return `<div class="oneliner"><span class="lab">${esc(c.lab)}</span>${c.year ? ` · ${esc(c.year)}` : ""}${c.prep ? ` · ${esc(c.prep)}` : ""}<br>${esc(c.finding)}${c.caveat ? `<div class="note" style="margin-top:6px;font-family:var(--f-ui)">Caveat: ${esc(c.caveat)}</div>` : ""}</div>`;
}
// the longest list we have: the saved record's can be older than the library's (author lists used to be cut off at about ten)
function authorsFor(P) {
  const r = recOf(P.id), it = L.meta.items.find(x => x.id === P.id || normTitle(x.title) === normTitle(P.title));
  return [r?.authors, it?.authors, P.authorsPdf].filter(a => a && a.length).sort((a, b) => b.length - a.length)[0] || [];
}
// all cards of a paper: the first one (P.card, as before: Review, palace and sync read it) and any more (P.cards)
const cardList = P => [P.card, ...(P.cards || [])].filter(Boolean);
const lastName = n => String(n || "").replace(/,.*$/, "").trim().split(/\s+/).pop() || "";
// which card the form is for: 0 = the first, k = P.cards[k-1], "new" = a new one
function cardSelOf(P) {
  const n = cardList(P).length;
  if (S.cardSel === "new" || !n) return "new";
  return Number.isInteger(S.cardSel) && S.cardSel < n ? S.cardSel : 0;
}
function viewCard(P) {
  const cards = cardList(P), sel = cardSelOf(P), c = sel === "new" ? {} : cards[sel], au = authorsFor(P);
  const from = sel === "new" ? S.cardFrom || null : null;
  const lab = c.lab || lastName(au[au.length - 1]), yr = c.year || paperYear(P) || "";
  const kf = c.fig || from?.fig || (S.pinned ? S.pinned.fig : P.figures[0]?.n) || "";
  const kp = c.panel || from?.panel || (!c.fig && S.pinned && S.pinned.fig === +kf ? S.pinned.panel : "");
  const fig = P.figures.find(f => f.n === +kf), isNew = sel === "new", idx = isNew ? cards.length : sel;
  const saved = cards.length ? `<div class="cardlist"><div class="eyebrow" style="margin-bottom:6px">Your cards for this paper${P.demo ? " (example paper: not kept)" : ""} · ${cards.length}</div>
    ${cards.map((x, i) => `<div class="cardrow ${i === sel ? "on" : ""}">${onelinerHTML(x)}<div class="cardrow-a">${x.fig ? `<span class="note">Figure ${esc(x.fig)}${x.panel ? esc(x.panel) : ""}</span>` : ""}<button type="button" class="btn quiet" data-cardsel="${i}" ${i === sel ? "disabled" : ""}>${i === sel ? "Editing" : "Edit"}</button>${i > 0 ? `<button type="button" class="btn quiet" data-carddel="${i}">Delete</button>` : ""}</div></div>`).join("")}
    ${isNew ? "" : `<button type="button" class="btn" data-cardsel="new">+ Another card</button>`}</div>` : "";
  return `<section class="view"><div class="qwrap">
   <div><div class="eyebrow">Step 4 · Your card${cards.length ? ` · ${isNew ? "new card" : `card ${idx + 1} of ${cards.length}`}` : ""}</div><h2>Put the paper in one line, in your own words</h2>
   <p class="lede">Write it from memory first, then check it. A paper can have several cards, for example one per key figure.${PW.single ? "" : " Cards go into Review, where you'll be quizzed on the finding, the lab and the key panel."}</p></div>
   <div class="card"><div class="cform">
     <label>Lab · last author<input id="cLab" value="${esc(lab)}" placeholder="e.g. Romano" autocomplete="off"></label>
     <label>Year<input id="cYear" value="${esc(yr)}" inputmode="numeric" autocomplete="off"></label>
     <label class="full">Preparation &amp; method<input id="cPrep" value="${esc(c.prep || "")}" placeholder="e.g. head-fixed mice · optogenetics of PCs, CN, RN, SC · bilateral whisker tracking"></label>
     <label class="full"><span class="cf-l">Finding <span class="cf-h">aim for 15 words or fewer</span><span class="wc" id="wc"></span></span><textarea id="cFind" placeholder="The one thing this paper showed">${esc(c.finding || "")}</textarea></label>
     <label class="full">The one caveat<input id="cCav" value="${esc(c.caveat || "")}" placeholder="Main confound, missing control or limit"></label>
     <label>Key figure<select id="cFig">${P.figures.map(f => `<option value="${f.n}" ${+kf === f.n ? "selected" : ""}>Figure ${f.n}</option>`).join("")}</select></label>
     <label>Panel<select id="cPanel"><option value="">Whole figure</option>${(fig?.letters || []).map(l => `<option ${kp === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
   </div>
   ${au.length ? `<p class="note cf-check">Lab and year are filled in from the paper (last author: <strong>${esc(au[au.length - 1])}</strong>).</p>` : ""}
   <div class="cf-acts">
     <button class="btn ${isNew ? "primary cf-save" : ""}" type="button" data-act="savecard">${isNew ? (cards.length ? "Save as a new card" : "Save card") : "Update card"}</button>
     ${isNew && cards.length ? `<button class="btn quiet" type="button" data-cardsel="0">Cancel</button>` : ""}
     ${S.sample ? `<button class="btn" type="button" data-act="checkcard" ${P.cardBusy ? "disabled" : ""}>${P.cardBusy ? "Checking…" : "Check against the paper"}</button>` : ""}
   </div>
   ${P.cardCheck ? `<div class="verdict" style="margin-top:12px"><div class="v ${P.cardCheck.ok ? "v-match" : "v-partial"}">${P.cardCheck.ok ? "No factual errors found" : "Check these"}</div>${(P.cardCheck.issues || []).length ? `<ul style="margin:6px 0 0;padding-left:18px">${P.cardCheck.issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}</div>` : ""}
   </div>
   ${saved}
   <div class="nextbar"><button class="btn" type="button" data-go="figures">${chev("l")}Figures</button>${P.card ? `<button class="btn primary" type="button" data-bar="lib">${PW.single ? "Done" : "Back to library"}${chev()}</button>` : ""}</div>
  </div></section>`;
}
const CARD_FIELDS = ["cLab", "cYear", "cPrep", "cFind", "cCav", "cFig", "cPanel"];
// switch the form to another card (or a new one): what was typed for the previous one is not carried over
function cardSelect(v, from) {
  S.cardSel = v; S.cardFrom = from || null; if (S.paper) S.paper.cardCheck = null;
  draftsClear(CARD_FIELDS); render(); window.scrollTo(0, 0);
}
// "Make a card from this figure": a new card with the figure (and the selected panel) filled in
function cardFromFigure() {
  const P = S.paper, f = P && P.figures[S.figIdx]; if (!f) return;
  S.view = "card"; cardSelect("new", { fig: f.n, panel: S.pinned && S.pinned.fig === f.n ? S.pinned.panel : "" });
}
function deleteCard(i) {
  const P = S.paper, x = (P.cards || [])[i - 1]; if (!x) return;
  if (!confirm("Delete this card? Its review history goes too.")) return;
  P.cards.splice(i - 1, 1);
  if (x.at && P.srs) for (const k of Object.keys(P.srs)) if (k.startsWith("c" + x.at + ":")) delete P.srs[k];
  S.cardSel = 0; persistPaper(P); render(); toast("Card deleted.");
}
function readCardForm() {
  return { lab: $("#cLab").value.trim(), year: $("#cYear").value.trim(), prep: $("#cPrep").value.trim(), finding: $("#cFind").value.trim().replace(/\s+/g, " "), caveat: $("#cCav").value.trim(), fig: +$("#cFig")?.value || null, panel: $("#cPanel")?.value || "" };
}
function updateWC() { const t = $("#cFind"); if (!t) return; const n = (t.value.trim().match(/\S+/g) || []).length; const w = $("#wc"); w.textContent = `${n} words`; w.classList.toggle("over", n > 15); }
async function panelImage(P, figN, panel) {
  const f = P.figures.find(x => x.n === figN); if (!f) return null;
  for (let i = 0; i < 60 && f.busy; i++) await new Promise(r => setTimeout(r, 250));   // the figure is still being drawn (just opened)
  if (!f.img && !P.demo) { await prepareFigure(f); }
  if (!f.img) return null;
  const im = new Image(); im.src = f.img; await im.decode().catch(() => {});
  if (!im.naturalWidth) return null;
  const pb = panel && f.panels ? f.panels.find(x => x.label === panel) : null;
  const b = pb ? { x: Math.max(0, pb.x - .01), y: Math.max(0, pb.y - .01), w: Math.min(1, pb.w + .02), h: Math.min(1, pb.h + .02) } : { x: 0, y: 0, w: 1, h: 1 };
  const sw = b.w * im.naturalWidth, sh = b.h * im.naturalHeight, sc = Math.min(1, 720 / sw);
  const c = document.createElement("canvas"); c.width = Math.round(sw * sc); c.height = Math.round(sh * sc);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(im, b.x * im.naturalWidth, b.y * im.naturalHeight, sw, sh, 0, 0, c.width, c.height);
  let q = .82, url = c.toDataURL("image/jpeg", q);
  while (url.length > 140000 && q > .4) { q -= .12; url = c.toDataURL("image/jpeg", q); }
  return url;
}
async function saveCard() {
  const P = S.paper, c = readCardForm(), sel = cardSelOf(P);
  if (!c.lab || !c.finding) { toast("Fill in at least the lab and the finding."); return; }
  P.srs = P.srs || {};
  if (sel === "new" && P.card) {                                   // another card: stored with its own key panel and schedule
    const x = { ...c, at: Date.now() };
    if (c.fig) { toast("Saving the key panel…"); x.img = await panelImage(P, c.fig, c.panel); }
    P.cards = [...(P.cards || []), x];
    for (const t of reviewTypes(x, x.img)) P.srs["c" + x.at + ":" + t] = P.srs["c" + x.at + ":" + t] || { due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0 };
    S.cardSel = P.cards.length;
  } else if (sel === "new" || sel === 0) {                         // the first card (as before)
    const changedFig = !P.card || P.card.fig !== c.fig || P.card.panel !== c.panel || !P.cardImg;
    P.card = { ...c, at: P.card?.at || Date.now() };
    if (changedFig && c.fig) { toast("Saving the key panel…"); P.cardImg = await panelImage(P, c.fig, c.panel); }
    for (const t of reviewTypes(P.card, P.cardImg)) if (!P.srs[t]) P.srs[t] = { due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0 };
    S.cardSel = 0;
  } else {                                                          // editing another card
    const old = P.cards[sel - 1], x = { ...old, ...c };
    if ((old.fig !== c.fig || old.panel !== c.panel || !old.img) && c.fig) { toast("Saving the key panel…"); x.img = await panelImage(P, c.fig, c.panel); }
    P.cards = P.cards.map((y, i) => i === sel - 1 ? x : y);
    for (const t of reviewTypes(x, x.img)) P.srs["c" + x.at + ":" + t] = P.srs["c" + x.at + ":" + t] || { due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0 };
  }
  S.cardFrom = null;
  draftsClear(DRAFT_IDS.filter(id => id !== "noteIn"));
  persistPaper(P); render();
  toast(P.demo ? "Card saved for this session (example paper)" : "Card saved. It's now in Review.");
}
async function checkCard() {
  const P = S.paper, c = readCardForm(); if (!S.sample) return;
  if (!c.finding) { toast("Write the finding first."); return; }
  P.cardBusy = true; P.cardCheck = null; render();
  const prompt = `A researcher wrote a one-line memory card for the paper below. Check ONLY for factual errors against the paper: wrong lab or last author, wrong year, wrong preparation or method, a finding the paper does not support or overstates, a caveat that is wrong. Do not rewrite the card, do not suggest style changes, do not add missing details unless their absence makes the card wrong. Reply with only JSON: {"ok": true|false, "issues": ["short, specific issue with the evidence from the paper"]}

CARD
Lab / last author: ${c.lab}
Year: ${c.year}
Preparation & method: ${c.prep}
Finding: ${c.finding}
Caveat: ${c.caveat}
Key panel: Fig. ${c.fig}${c.panel}

AUTHORS ON THE PAPER: ${authorsFor(P).join(", ") || "unknown"}
${P.fullText.slice(0, 150000)}`;
  try { P.cardCheck = await S.sample.json(prompt, { cache: false }); } catch (e) { toast(errCopy(e)); claudeOff(e); }
  P.cardBusy = false; render();
}

