"use strict";
/* ----- your card ----- */
function onelinerHTML(c) {
  return `<div class="oneliner"><span class="lab">${esc(c.lab)}</span>${c.year ? ` · ${esc(c.year)}` : ""}${c.prep ? ` · ${esc(c.prep)}` : ""}<br>${esc(c.finding)}${c.caveat ? `<div class="note" style="margin-top:6px;font-family:var(--f-ui)">Caveat: ${esc(c.caveat)}</div>` : ""}</div>`;
}
function authorsFor(P) { const r = recOf(P.id); if (r?.authors?.length) return r.authors; const it = L.meta.items.find(x => x.id === P.id || normTitle(x.title) === normTitle(P.title)); return it?.authors || []; }
function viewCard(P) {
  const c = P.card || {}, au = authorsFor(P);
  const yr = c.year || L.meta.items.find(x => x.id === P.id)?.year || "";
  const kf = c.fig || (S.pinned ? S.pinned.fig : P.figures[0]?.n) || "", kp = c.panel || (S.pinned && S.pinned.fig === +kf ? S.pinned.panel : "");
  const fig = P.figures.find(f => f.n === +kf);
  return `<section class="view"><div class="qwrap">
   <div><div class="eyebrow">Step 4 · Your card</div><h2>Put the paper in one line, in your own words</h2>
   <p class="lede">Write it from memory first, then check it.${PW.single ? "" : " Only papers with a card go into Review, where you'll be quizzed on the finding, the lab and the key panel."}</p></div>
   <div class="card"><div class="cform">
     <label>Lab · last author<input id="cLab" value="${esc(c.lab || "")}" placeholder="e.g. Romano" autocomplete="off"></label>
     <label>Year<input id="cYear" value="${esc(yr)}" inputmode="numeric"></label>
     <label class="full">Preparation &amp; method<input id="cPrep" value="${esc(c.prep || "")}" placeholder="e.g. head-fixed mice · optogenetics of PCs, CN, RN, SC · bilateral whisker tracking"></label>
     <label class="full"><span style="display:flex;justify-content:space-between">Finding · aim for 15 words or fewer <span class="wc" id="wc"></span></span><textarea id="cFind" placeholder="The one thing this paper showed">${esc(c.finding || "")}</textarea></label>
     <label class="full">The one caveat<input id="cCav" value="${esc(c.caveat || "")}" placeholder="Main confound, missing control or limit"></label>
     <label>Key figure<select id="cFig">${P.figures.map(f => `<option value="${f.n}" ${+kf === f.n ? "selected" : ""}>Figure ${f.n}</option>`).join("")}</select></label>
     <label>Panel<select id="cPanel"><option value="">Whole figure</option>${(fig?.letters || []).map(l => `<option ${kp === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
   </div>
   ${au.length ? `<p class="note" style="margin:12px 0 0">Check yourself: the author list on the paper ends with <strong>${esc(au[au.length - 1])}</strong>.</p>` : ""}
   <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
     <button class="btn primary" type="button" data-act="savecard">${P.card ? "Update card" : "Save card"}</button>
     ${S.sample ? `<button class="btn" type="button" data-act="checkcard" ${P.cardBusy ? "disabled" : ""}>${P.cardBusy ? "Checking…" : "Check against the paper"}</button>` : ""}
   </div>
   ${P.cardCheck ? `<div class="verdict" style="margin-top:12px"><div class="v ${P.cardCheck.ok ? "v-match" : "v-partial"}">${P.cardCheck.ok ? "No factual errors found" : "Check these"}</div>${(P.cardCheck.issues || []).length ? `<ul style="margin:6px 0 0;padding-left:18px">${P.cardCheck.issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}</div>` : ""}
   </div>
   ${P.card ? `<div><div class="eyebrow" style="margin-bottom:6px">Saved card${P.demo ? " (example paper: not kept)" : ""}</div>${onelinerHTML(P.card)}${P.cardImg ? `<div class="rvimg" style="margin-top:10px"><img src="${P.cardImg}" alt="Key panel"></div>` : ""}</div>` : ""}
   <div class="nextbar"><button class="btn" type="button" data-go="figures">← Figures</button>${P.card ? `<button class="btn primary" type="button" data-act="tolib">Back to library</button>` : ""}</div>
  </div></section>`;
}
function readCardForm() {
  return { lab: $("#cLab").value.trim(), year: $("#cYear").value.trim(), prep: $("#cPrep").value.trim(), finding: $("#cFind").value.trim().replace(/\s+/g, " "), caveat: $("#cCav").value.trim(), fig: +$("#cFig")?.value || null, panel: $("#cPanel")?.value || "" };
}
function updateWC() { const t = $("#cFind"); if (!t) return; const n = (t.value.trim().match(/\S+/g) || []).length; const w = $("#wc"); w.textContent = `${n} words`; w.classList.toggle("over", n > 15); }
async function panelImage(P, figN, panel) {
  const f = P.figures.find(x => x.n === figN); if (!f) return null;
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
  const P = S.paper, c = readCardForm();
  if (!c.lab || !c.finding) { toast("Fill in at least the lab and the finding."); return; }
  const changedFig = !P.card || P.card.fig !== c.fig || P.card.panel !== c.panel || !P.cardImg;
  P.card = { ...c, at: Date.now() };
  if (changedFig && c.fig) { toast("Saving the key panel…"); P.cardImg = await panelImage(P, c.fig, c.panel); }
  P.srs = P.srs || {};
  for (const t of reviewTypes(P.card, P.cardImg)) if (!P.srs[t]) P.srs[t] = { due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0 };
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

