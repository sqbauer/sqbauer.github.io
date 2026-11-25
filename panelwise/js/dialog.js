"use strict";
/* ---------- dialogs: one way to open a sheet on top of the app ----------
   pwModal(el) makes the page behind it unreachable (inert: no clicks, no Tab, hidden from VoiceOver) and keeps
   Tab inside the sheet; pwModalEnd(el) undoes that and returns focus to what opened it.
   The keyboard-shortcut sheet (press ?) is built on it. */
const PW_MODAL = { stack: [] };
function pwModal(el, back) {
  PW_MODAL.stack.push({ el, back: back || document.activeElement });
  $("#app").inert = true;
  pwTrapTab(el);
}
// Tab and Shift-Tab stay inside el (for a sheet that lives inside the page, like a card on the card grid)
function pwTrapTab(el) {
  if (el._trap) return;
  el._trap = e => {
    if (e.key !== "Tab") return;
    const f = [...el.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  };
  el.addEventListener("keydown", el._trap);
}
function pwModalEnd(el) {
  const k = PW_MODAL.stack.findIndex(x => x.el === el); if (k < 0) return;
  const [{ back }] = PW_MODAL.stack.splice(k, 1);
  if (!PW_MODAL.stack.some(x => x.el.closest && !x.el.closest("#app"))) $("#app").inert = false;
  if (back && back.isConnected) back.focus({ preventScroll: true });
}

// ----- keyboard shortcuts (a Mac or a keyboard only) -----
const KEYS = [
  ["Library", [["⌘K", "Search papers, terms and the text of every paper"], ["⌘O", "Open a PDF"], ["⌘R", "Rescan the Papers folder"], ["⌘B", "Mouse brain sections"], ["⌘,", "Settings"]]],
  ["Figures", [["← →", "Previous or next figure"], ["Click a panel", "Enlarge it; click again to go back"], ["Esc", "Clear the selected panel"]]],
  ["Reading mode", [["← → or Space", "Turn the page"], ["F", "The figure beside the text"], ["⌘F", "Search this paper"], ["Esc", "Close"]]],
  ["Review", [["Space", "Show the answer"], ["Enter", "Show the answer after typing yours"], ["1–4", "Again, Hard, Good, Easy"]]],
  ["Browse cards", [["← →", "Previous or next card"], ["Esc", "Close the card"]]],
  ["Anywhere", [["?", "This list"]]],
];
function showKeys() {
  let el = $("#keysSheet");
  if (!el) {
    el = document.createElement("div"); el.id = "keysSheet"; el.className = "au-wrap keys-wrap";
    el.innerHTML = `<div class="au-scrim" data-keys-close="1"></div><section class="au-sheet" role="dialog" aria-modal="true" aria-labelledby="keysT">
      <header class="au-h"><div><div class="eyebrow">Keyboard</div><h2 id="keysT">Shortcuts</h2></div><button type="button" class="btn quiet" data-keys-close="1" aria-label="Close">✕</button></header>
      <div class="au-body">${KEYS.map(([h, rows]) => `<h3>${h}</h3><dl class="keys">${rows.map(([k, d]) => `<dt><kbd>${k}</kbd></dt><dd>${d}</dd>`).join("")}</dl>`).join("")}</div></section>`;
    document.body.appendChild(el);
    el.addEventListener("click", e => { if (e.target.closest("[data-keys-close]")) hideKeys(); });
  }
  el.hidden = false; pwModal(el); document.documentElement.classList.add("keys-open");
  requestAnimationFrame(() => el.querySelector("button[data-keys-close]").focus());
}
function hideKeys() { const el = $("#keysSheet"); if (!el || el.hidden) return; el.hidden = true; document.documentElement.classList.remove("keys-open"); pwModalEnd(el); }
document.addEventListener("keydown", e => {
  const el = $("#keysSheet");
  if (el && !el.hidden && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hideKeys(); return; }
  if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault(); showKeys();
}, true);
