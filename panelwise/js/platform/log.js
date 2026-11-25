"use strict";
/* ---------- platform: a small log of what went wrong, kept on the device ----------
   The app logs nothing to Xcode in release builds, so failures in sync, backups or anywhere else were invisible.
   PW.log keeps the last 50 errors (and the last successful sync and backup) in the "_log" collection, which
   stays on this device. Settings shows the latest, and "Copy the log" puts it on the clipboard. */
PW.log = {
  items: [], ok: {}, _saveT: 0,
  error(where, e) {
    const msg = String((e && (e.message || e.text || e.code)) || e || "unknown").slice(0, 300);
    this.items.push({ t: Date.now(), where, msg });
    if (this.items.length > 50) this.items.splice(0, this.items.length - 50);
    console.warn(`[${where}]`, msg);
    this.save();
  },
  success(what) { this.ok[what] = Date.now(); this.save(); },
  last() { return this.items[this.items.length - 1] || null; },
  save() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => { PW.kv?.put("_log", "recent", { items: this.items, ok: this.ok }).catch(() => {}); }, 1000);
  },
  async load() {
    try { const v = await PW.kv.get("_log", "recent"); if (v) { this.items = [...(v.items || []), ...this.items].slice(-50); this.ok = { ...(v.ok || {}), ...this.ok }; } } catch {}
  },
  text() { return this.items.map(x => `${new Date(x.t).toISOString()} [${x.where}] ${x.msg}`).join("\n") || "No errors logged."; },
};
addEventListener("error", e => PW.log.error("script", e.error || e.message));
addEventListener("unhandledrejection", e => PW.log.error("promise", e.reason));
