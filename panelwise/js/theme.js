"use strict";
/* ---------- appearance: Automatic (follow the device), Light or Dark ----------
   Loaded in <head>, before the page is drawn, so a chosen theme shows without a flash of the other one.
   The CSS reads html[data-theme] (base.css); in the app, the native side also switches the window, so the
   status bar, the keyboard and system sheets match. Kept per device (an iPhone and a Mac can differ). */
(function () {
  const KEY = "pw:theme";
  const read = () => { try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "auto"; } catch { return "auto"; } };
  const mark = (root, v) => { if (v === "light" || v === "dark") root.setAttribute("data-theme", v); else root.removeAttribute("data-theme"); };
  function apply(v) {
    mark(document.documentElement, v);
    // the brain sections run in a frame with their own page: same choice there
    try { const f = document.querySelector(".brain-wrap iframe"); const d = f && f.contentDocument; if (d) mark(d.documentElement, v); } catch {}
    try { if (window.PW && PW.plugin && PW.plugin.setAppearance) PW.plugin.setAppearance({ style: v }).catch(() => {}); } catch {}
  }
  window.pwTheme = {
    get: read,
    set(v) { try { localStorage.setItem(KEY, v === "light" || v === "dark" ? v : "auto"); } catch {} apply(v); },
    apply: () => apply(read()),
  };
  apply(read());
})();
