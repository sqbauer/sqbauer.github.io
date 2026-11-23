"use strict";
/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
function toast(msg, ms = 3200) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }
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

const NO_CLAUDE = PW.single ? "Claude is off. To turn it on, add your own Anthropic API key in Settings (the gear at the top)." : "Claude is off until you add your API key in Settings.";

/* ---------- state ---------- */
const S = {
  paper: null, view: "background", figIdx: 0,
  pinned: null, hover: null, textHover: null,
  sample: null, imagesOK: false, claudeChecked: false,
  chat: [], chatBusy: false, outlines: false
};

