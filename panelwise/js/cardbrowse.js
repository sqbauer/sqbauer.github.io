"use strict";
/* ---------- Browse cards: every card's key panel in one scrolling grid ----------
   The grid shows only the figures and panels, so you can test yourself; clicking one opens the card: lab, year,
   method, finding and caveat, with the paper. Arrows (or ← →) step through the cards. Replaces the memory palace
   in the app for now (palace.js and its saved data are untouched). */
const CB = { q: "", open: -1 };
function cbCards() {
  const out = [];
  for (const r of processedRecs()) for (const cd of cardsOfRec(r)) out.push({ r, card: cd.card, img: safeImg(cd.img), at: cd.card.at || r.updated || 0 });
  return out.sort((a, b) => b.at - a.at);
}
function cbFiltered() {
  const q = CB.q.trim().toLowerCase(), all = cbCards();
  if (!q) return all;
  return all.filter(x => [x.card.lab, x.card.year, x.card.finding, x.card.prep, x.card.caveat, x.r.title, ...(x.r.tags || [])].join(" ").toLowerCase().includes(q));
}
function renderCardBrowse() {
  $("#pTitle").textContent = "Your cards"; const all = cbCards(), list = cbFiltered();
  $("#pSub").textContent = `${all.length} card${all.length === 1 ? "" : "s"} from ${new Set(all.map(x => x.r.id)).size} papers`;
  const head = `<button class="backlink" type="button" data-act="tolib">Library</button><div class="eyebrow" style="margin-top:12px">Your cards</div><h2>Figures you made cards of</h2>`;
  if (!all.length) {
    $("#main").innerHTML = `<section class="view" style="max-width:1100px">${head}<div class="card" style="margin-top:18px"><h3>No cards yet</h3><p class="note">Open a paper and write a card in step 4, or use “+ Card from this figure” under a figure.</p></div></section>`;
    return;
  }
  $("#main").innerHTML = `<section class="view" style="max-width:1100px">${head}
    <p class="lede">Scroll through the key panels and recall each one; click a panel to see its card.</p>
    <div class="cb-tools"><input id="cbQ" type="search" placeholder="Filter by lab, finding, paper or topic" value="${esc(CB.q)}" autocomplete="off" spellcheck="false" aria-label="Filter cards"><button class="btn" type="button" data-act="review">Review</button></div>
    <div class="cb-grid" id="cbGrid">${cbGridHTML(list)}</div>
    <div class="cb-detail" id="cbDetail" hidden></div></section>`;
  if (CB.open >= 0 && !CB_FEED()) cbOpen(CB.open);
}
const CB_FEED = () => matchMedia("(max-width: 700px)").matches;    // phone: a feed, one card per screen
function cbTextHTML(x) {
  return `${onelinerHTML(x.card)}<div class="cb-paper note">${x.card.fig ? `Figure ${esc(x.card.fig)}${esc(x.card.panel || "")} · ` : ""}${esc(x.r.title || x.r.name || "")}</div>`;
}
function cbGridHTML(list) {
  if (!list.length) return `<p class="note">No card matches.</p>`;
  return list.map((x, i) => `<article class="cb-tile" data-cbi="${i}">
    <button type="button" class="cb-face" data-cb="${i}" aria-label="Card ${i + 1} of ${list.length}: show the card">${x.img ? `<img src="${x.img}" alt="" loading="lazy">` : `<span class="cb-noimg">No key panel<br><small>Figure ${esc(x.card.fig || "?")}${esc(x.card.panel || "")}</small></span>`}<span class="cb-hint">Tap to see the card</span></button>
    <div class="cb-back" hidden>${cbTextHTML(x)}<div class="cb-acts"><button type="button" class="btn" data-cbedit="${esc(x.r.id)}" data-cbat="${esc(String(x.card.at || ""))}">Edit card</button><button type="button" class="btn primary" data-cbpaper="${esc(x.r.id)}" data-cbfig="${esc(String(x.card.fig || ""))}">Open paper</button></div></div>
    <span class="cb-count">${i + 1} / ${list.length}</span></article>`).join("");
}
function cbOpen(i) {
  const list = cbFiltered(), x = list[i], box = $("#cbDetail"); if (!x || !box) { CB.open = -1; return; }
  CB.open = i;
  box.innerHTML = `<div class="cb-scrim" data-cbclose="1"></div><article class="cb-card" role="dialog" aria-modal="true" aria-label="Card">
    <header><span class="note">Card ${i + 1} of ${list.length}</span><button type="button" class="btn quiet" data-cbclose="1" aria-label="Close">✕</button></header>
    ${x.img ? `<div class="cb-img"><img src="${x.img}" alt="Key panel"></div>` : ""}
    ${cbTextHTML(x)}
    <div class="cb-acts"><button type="button" class="btn" data-cbstep="-1" ${i ? "" : "disabled"} aria-label="Previous card">${chev("l")}</button><button type="button" class="btn" data-cbstep="1" ${i < list.length - 1 ? "" : "disabled"} aria-label="Next card">${chev()}</button>
      <span style="flex:1"></span><button type="button" class="btn" data-cbedit="${esc(x.r.id)}" data-cbat="${esc(String(x.card.at || ""))}">Edit card</button><button type="button" class="btn primary" data-cbpaper="${esc(x.r.id)}" data-cbfig="${esc(String(x.card.fig || ""))}">Open paper</button></div>
  </article>`;
  box.hidden = false; document.documentElement.classList.add("cb-open"); pwTrapTab(box);
  requestAnimationFrame(() => box.querySelector("[data-cbclose]:not(.cb-scrim)")?.focus({ preventScroll: true }));
}
function cbClose() {
  const box = $("#cbDetail"); const i = CB.open; CB.open = -1;
  if (box) box.hidden = true; document.documentElement.classList.remove("cb-open");
  $(`[data-cb="${i}"]`)?.focus({ preventScroll: true });
}
// open the paper (at the card's figure, or at the card itself to edit it)
async function cbOpenPaper(id, then) {
  const L_ = ixPapers().find(x => x.id === id);
  CB.y = window.scrollY; CB.back = CB.open;                 // where to come back to
  if (!L_ || !L_.g.file) { cbClose(); S.recId = id; S.view = "record"; render(); window.scrollTo(0, 0); return; }
  cbClose(); await ixOpen(L_, ""); if (S.paper && S.paper.id === id) { S.backTo = "cards"; then(S.paper); render(); }
}
// back from a paper opened here: the grid or feed where you were, with the same card open on larger screens
function cbBack() {
  S.view = "cards"; CB.open = CB_FEED() ? -1 : (CB.back ?? -1); render();
  requestAnimationFrame(() => window.scrollTo(0, CB.y || 0));
}
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-cb], [data-cbclose], [data-cbstep], [data-cbedit], [data-cbpaper]"); if (!t || S.view !== "cards") return;
  if (t.dataset.cb !== undefined) {
    // phone: the card turns over in place (keep scrolling for the next); larger screens: a card on top of the grid
    if (CB_FEED()) { const tile = t.closest(".cb-tile"), back = tile.querySelector(".cb-back"); back.hidden = !back.hidden; tile.classList.toggle("shown", !back.hidden); return; }
    cbOpen(+t.dataset.cb); return;
  }
  if (t.dataset.cbclose) { cbClose(); return; }
  if (t.dataset.cbstep) { cbOpen(CB.open + +t.dataset.cbstep); return; }
  if (t.dataset.cbedit) { const at = +t.dataset.cbat; cbOpenPaper(t.dataset.cbedit, P => { const k = cardList(P).findIndex(c => (c.at || 0) === at); S.view = "card"; cardSelect(k < 0 ? 0 : k); }); return; }
  if (t.dataset.cbpaper) { const fig = +t.dataset.cbfig; cbOpenPaper(t.dataset.cbpaper, P => { const i = P.figures.findIndex(f => f.n === fig); if (i >= 0) { S.view = "figures"; S.figIdx = i; render(); window.scrollTo(0, 0); } }); }
});
document.addEventListener("input", e => { if (e.target.id === "cbQ") { CB.q = e.target.value; CB.open = -1; const g = $("#cbGrid"); if (g) g.innerHTML = cbGridHTML(cbFiltered()); } });
document.addEventListener("keydown", e => {
  if (S.view !== "cards" || CB.open < 0) return;
  if (e.key === "Escape") { e.preventDefault(); cbClose(); }
  else if (e.key === "ArrowRight" && CB.open < cbFiltered().length - 1) { e.preventDefault(); cbOpen(CB.open + 1); }
  else if (e.key === "ArrowLeft" && CB.open > 0) { e.preventDefault(); cbOpen(CB.open - 1); }
});
