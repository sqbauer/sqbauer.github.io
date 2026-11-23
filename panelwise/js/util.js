"use strict";
/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
function toast(msg, ms = 3200) { toastDone(); const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }
/* a toast with an Undo button: undo() runs if it's tapped, done() when the toast goes (time up, or another toast) */
function toastUndo(msg, undo, done, ms = 6000) {
  toastDone();
  const t = $("#toast"); t.textContent = msg + " "; t.hidden = false;
  const b = document.createElement("button"); b.type = "button"; b.className = "toast-act"; b.textContent = "Undo";
  let settled = false;
  const finish = fn => { if (settled) return; settled = true; toast._pending = null; clearTimeout(toast._t); t.hidden = true; fn && fn(); };
  b.onclick = e => { e.stopPropagation(); finish(undo); };
  t.appendChild(b);
  toast._pending = () => finish(done);
  clearTimeout(toast._t); toast._t = setTimeout(() => finish(done), ms);
}
/* the More menu: openMenu(button, [{ label, key?, danger?, run }] | "-" for a divider). A popover under the button,
   a bottom sheet on a phone; Escape or a tap outside closes it, arrow keys move between items. */
function openMenu(anchor, items) {
  closeMenu();
  const scrim = document.createElement("div"); scrim.className = "pwmenu-scrim";
  const m = document.createElement("div"); m.className = "pwmenu"; m.setAttribute("role", "menu");
  m.innerHTML = items.map((it, i) => it === "-" ? "<hr>" : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? "danger" : ""}"><span>${esc(it.label)}</span>${it.key ? `<span class="k">${esc(it.key)}</span>` : ""}</button>`).join("");
  document.body.append(scrim, m);
  const r = anchor.getBoundingClientRect();
  m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6) + "px";
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + "px";
  anchor.setAttribute("aria-expanded", "true");
  openMenu.cur = { m, scrim, anchor };
  const btns = [...m.querySelectorAll("button")];
  scrim.onclick = () => closeMenu();
  m.onclick = e => { const b = e.target.closest("button[data-i]"); if (!b) return; const it = items[+b.dataset.i]; closeMenu(); it.run && it.run(); };
  m.onkeydown = e => {
    const i = btns.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  };
  requestAnimationFrame(() => btns[0] && btns[0].focus());
}
function closeMenu() {
  const c = openMenu.cur; if (!c) return; openMenu.cur = null;
  c.m.remove(); c.scrim.remove(); c.anchor.setAttribute("aria-expanded", "false");
  if (c.anchor.isConnected) c.anchor.focus({ preventScroll: true });
}
function toastDone() { const p = toast._pending; if (p) p(); }
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
function errCopy(e) {
  const c = e && e.code;
  return ({
    not_granted: "Claude isn't allowed for this page. You can still read everything here.",
    sampling_disabled: "Claude isn't available on this account.",
    rate_limited: "Too many requests just now. Try again in a minute.",
    session_expired: "Your session expired. Sign in again, then retry.",
    prompt_too_large: "The paper is too long to send in one go.",
    image_rejected: "Claude couldn't read the page image.",
    invalid_json: "Claude's answer came back malformed. Try again.",
    refused: "Claude declined this request.",
    cancelled: "Stopped.",
    // codes from the on-device adapter (js/platform/sample.js)
    offline: "You're offline. Claude needs a connection; everything you've saved still opens.",
    network: "Couldn't reach Claude. Check your connection and try again.",
    bad_key: "Claude rejected your API key. Check it in Settings.",
    overloaded: "Claude is busy right now. Try again in a minute.",
    bad_request: "Claude couldn't process this request."
  })[c] || "Something went wrong reaching Claude. Try again.";
}

// the paper's sections by their key, as shown everywhere (the figure view's in-text list says "Text" for "other")
const SEC_NAMES = { abstract: "Abstract", intro: "Introduction", results: "Results", discussion: "Discussion", methods: "Methods", other: "Other text" };
const NO_CLAUDE = PW.single ? "Claude is off. To turn it on, add your own Anthropic API key in Settings (the gear at the top)." : "Claude is off until you add your API key in Settings.";

/* ---------- state ---------- */
const S = {
  paper: null, view: "background", figIdx: 0,
  pinned: null, hover: null, textHover: null,
  sample: null, imagesOK: false, claudeChecked: false,
  chat: [], chatBusy: false, outlines: false
};

