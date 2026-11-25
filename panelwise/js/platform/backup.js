"use strict";
/* ---------- platform: import / export / automatic backup ----------
   Free Apple IDs can't use the iCloud entitlement, so instead of iCloud sync the app writes a JSON
   backup into your Papers folder (Papers/_panelwise/backup.json). iCloud Drive syncs that file like
   any other, and the scanner skips "_" folders.
   Import accepts both the claude.ai export ({papers, topics}) and this app's own backups ({docs}). */
PW.backup = {
  DIR: "_panelwise",

  async hasPapers() { return (await PW.be.all(PW.USER_COL)).some(r => r.data && r.data.kind === "paper"); },

  // merge: keep whichever copy of a record was updated last
  // manual (Settings): the copy updated last wins, also over changes made since sync began, and the result syncs.
  // automatic (first run on a new device): never over anything changed here or synced in.
  async importData(json, { manual = false } = {}) {
    const d = typeof json === "string" ? JSON.parse(json) : json;
    let n = 0;
    const metas = PW.be.metas ? await PW.be.metas() : new Map();
    const put = async (parent, id, data) => {
      const cur = await PW.be.get(parent, id);
      if (cur && (cur.updated || 0) > (data.updated || 0)) return;
      // changed on this device (or synced from another) since sync began: that copy is newer than any backup
      if (!manual) { const m = PW.be.key && metas.get(PW.be.key(parent, id)); if (m && m.t > 0) return; }
      await PW.be.putAt(parent, id, data, manual ? Date.now() : 0); n++;   // automatic: time 0, newer work on any device wins
    };
    if (d.reading) this.restoreReading(d.reading);
    if (Array.isArray(d.docs)) {
      for (const r of d.docs) if (r.parent && r.id && r.data) await put(r.parent, r.id, r.data);
    } else {
      for (const p of d.papers || []) { const { key, ...rest } = p; if (key) await put(PW.USER_COL, key, rest); }
      for (const t of d.topics || []) { const { key, ...rest } = t; if (key) await put(PW.USER_COL, key, rest); }
      if (d.palace) await put(PW.USER_COL, "palace", d.palace);
    }
    if (n) PW.sync?.changed();                           // include what came in, in this device's sync file
    return n;
  },

  async exportData() {
    return { exported: new Date().toISOString(), source: "Panelwise iOS", version: 1, docs: await PW.be.dump(), reading: this.readingState() };
  },

  // reading mode keeps each paper's position and the display settings in local storage ("pwread:..."):
  // carry them in the backup so a reinstall or a new phone opens every paper where you left off
  readingState() {
    const out = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("pwread:")) out[k] = localStorage.getItem(k); } } catch {}
    return out;
  },
  restoreReading(r) {
    if (!r || typeof r !== "object") return 0;
    let n = 0;
    const tOf = v => { try { const o = JSON.parse(v); return o && typeof o === "object" ? +o.t || 0 : null; } catch { return null; } };
    try {
      for (const [k, v] of Object.entries(r)) {
        if (!k.startsWith("pwread:") || typeof v !== "string") continue;
        const cur = localStorage.getItem(k), tIn = tOf(v);
        // positions: the most recent wins; display settings: only fill in what isn't set here
        if (cur == null || (tIn != null && tIn > (tOf(cur) || 0))) { localStorage.setItem(k, v); n++; }
      }
    } catch {}
    return n;
  },

  // first launch: look for the claude.ai export in the Papers folder
  async firstRunImport() {
    if (await this.hasPapers()) return 0;
    for (const rel of [this.DIR + "/panelwise_data.json", "panelwise_data.json", this.DIR + "/backup.json"]) {
      const txt = await PW.files.readText(rel);
      if (!txt) continue;
      const n = await this.importData(txt);
      toast(`Imported ${n} saved records from ${rel}`, 4500);
      await PW.reloadSaved();
      return n;
    }
    return 0;
  },

  async writeAuto() {
    if (!PW.native || !PW.files.folderName) return;
    try {
      const data = await this.exportData(), json = JSON.stringify(data);
      if (json === this._last) return;
      const prev = await PW.files.readText(this.DIR + "/backup.json");
      // never replace a backup with a much smaller one: an empty or damaged database must not wipe the good copies
      let had = 0; try { had = prev ? (JSON.parse(prev).docs || []).length : 0; } catch {}
      if (had >= 10 && data.docs.length < had * 0.5) {
        PW.log.error("backup", `skipped: ${data.docs.length} records here, ${had} in the last backup`);
        if (!this._warned) { this._warned = true; toast(`Backup paused: this device has far fewer saved records (${data.docs.length}) than the last backup (${had}). Your backups are kept.`, 8000); }
        return;
      }
      if (prev) await PW.files.writeText(this.DIR + "/backup.prev.json", prev);
      await PW.files.writeText(this.DIR + "/backup.json", json);
      // plus one copy per weekday, so a week of earlier versions is always there
      const day = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
      await PW.files.writeText(`${this.DIR}/backups/backup-${day}.json`, json);
      this._last = json; this.lastAt = Date.now(); PW.log.success("backup");
    } catch (e) { PW.log.error("backup", e); }
  },
};

// back up when the app goes to the background, and every 10 minutes while in use
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") PW.backup.writeAuto(); });
setInterval(() => PW.backup.writeAuto(), 10 * 60 * 1000);
