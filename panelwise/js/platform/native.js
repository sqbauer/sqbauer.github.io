"use strict";
/* ---------- platform: native bridge (Capacitor) with browser fallbacks ----------
   PW is the one global the adapter adds. In the iOS app it talks to the Swift plugin
   PanelwiseNative (ios/App/App/PanelwiseNativePlugin.swift); in a desktop browser the same
   calls fall back to web APIs so the UI can be tested without a phone. */
const PW = window.PW = {
  native: !!(window.PWDeps && window.PWDeps.Capacitor.isNativePlatform()),
  plugin: null,
  // the web version on sqbauer.github.io/panelwise: one PDF at a time, no library, no Claude
  single: document.documentElement.dataset.pw === "single",
};
if (PW.native) PW.plugin = window.PWDeps.registerPlugin("PanelwiseNative");

/* API key: iOS Keychain in the app. In a browser it is kept in memory only (dev/testing), except in the
   web version, where a visitor can choose to remember it in this browser's localStorage. */
const PW_KEY_LS = "pw:anthropic-key";
PW.keys = {
  _mem: null,
  async get() {
    if (!PW.native) { if (this._mem) return this._mem; if (!PW.single) return null; try { return localStorage.getItem(PW_KEY_LS) || null; } catch { return null; } }
    try { const r = await PW.plugin.keychainGet({ key: "anthropic_api_key" }); return r.value || null; } catch { return null; }
  },
  remembered() { if (!PW.single) return false; try { return !!localStorage.getItem(PW_KEY_LS); } catch { return false; } },
  async set(v, remember) {
    v = (v || "").trim();
    if (!PW.native) {
      this._mem = v || null;
      if (PW.single) { try { if (v && remember) localStorage.setItem(PW_KEY_LS, v); else localStorage.removeItem(PW_KEY_LS); } catch {} }
      return;
    }
    if (v) await PW.plugin.keychainSet({ key: "anthropic_api_key", value: v });
    else await PW.plugin.keychainRemove({ key: "anthropic_api_key" });
  },
  // for display only: never show or log the key itself
  mask(v) { return v ? v.slice(0, 7) + "…" + v.slice(-4) : ""; }
};

/* connection state, shown on Claude buttons and used to fail fast */
PW.online = () => navigator.onLine !== false;
function pwNetChanged() {
  const bar = document.getElementById("offline"); if (bar) bar.hidden = PW.online();
  if (typeof render === "function" && S.view === "settings") render();
}
addEventListener("online", pwNetChanged);
addEventListener("offline", pwNetChanged);
addEventListener("DOMContentLoaded", pwNetChanged);
