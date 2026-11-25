"use strict";
/* ---------- reading status: what you mean to do with each paper ----------
   To read, Reading, Read, Skimmed or Set aside, set by you (the progress pill still shows how far you got).
   It works for papers you haven't opened yet: each status is its own small saved document ("st~<paper>"),
   so it syncs on its own and never touches the paper's saved work. Set it in the paper's More menu, on its
   saved-work page, or with a right-click on the library row (Mac); filter the library by it. */
const STATUS_NAMES = { toread: "To read", reading: "Reading", read: "Read", skimmed: "Skimmed", aside: "Set aside" };
const stKey = id => "st~" + keyOf(id).slice(2);
const statusOf = id => (D.status && D.status.get(id) || {}).s || (recOf(id) || {}).status || "";
function setStatus(id, s) {
  D.status = D.status || new Map();
  const k = stKey(id);
  if (!s) { D.status.delete(id); if (D.col) enqueue(k, () => D.col.doc(k).delete()); }
  else { const v = { kind: "status", id, s, at: Date.now() }; D.status.set(id, v); if (D.col) enqueue(k, () => D.col.doc(k).set(v)); }
  if (typeof BG_MEMO !== "undefined") BG_MEMO = null;
  toast(s ? `Marked “${STATUS_NAMES[s]}”` : "Status cleared");
  if (S.view === "library") renderLibList(); else if (S.view === "record") renderRecord(); else render();
}
const statusPill = id => { const s = statusOf(id); return s ? `<span class="pill st-${s}">${STATUS_NAMES[s]}</span>` : ""; };
// menu items for openMenu(): one per status, the current one ticked, plus Clear
function statusItems(id) {
  const cur = statusOf(id);
  return [...Object.entries(STATUS_NAMES).map(([k, l]) => ({ label: (cur === k ? "✓ " : "") + l, run: () => setStatus(id, cur === k ? "" : k) })),
    ...(cur ? [{ label: "Clear status", run: () => setStatus(id, "") }] : [])];
}
function statusSelectHTML(id) {
  const cur = statusOf(id);
  return `<label class="st-sel">Status <select data-status-for="${esc(id)}" aria-label="Reading status"><option value="">None</option>${Object.entries(STATUS_NAMES).map(([k, l]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
}
document.addEventListener("change", e => { const id = e.target.dataset && e.target.dataset.statusFor; if (id) setStatus(id, e.target.value); });
// the Mac: right-click a paper in the library
document.addEventListener("contextmenu", e => {
  const row = e.target.closest && e.target.closest("#libList .row[data-open], #libList .row[data-record]"); if (!row) return;
  const id = row.dataset.record || (libItems().find(x => x.key === row.dataset.open) || {}).id; if (!id) return;
  e.preventDefault(); openMenu(row, statusItems(id));
});
