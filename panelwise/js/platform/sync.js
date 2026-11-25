"use strict";
/* ---------- platform: sync between your devices through the Papers folder ----------
   No server and no account: each device writes everything it has to its own file,
   Papers/_panelwise/sync/<device>.json, and iCloud Drive carries the folder to your other devices. Each device
   reads the others' files and keeps, record by record, whichever copy changed last (deletions included).
   A device only ever writes its own file, so two devices never overwrite each other's.
   What travels: saved papers, notes, chats, highlights, topics, feed cards, and reading positions and
   key sentences ("pwread:"). Caches ("_" collections: parsed text, Claude responses) stay on each device. */
PW.sync = {
  DIR: "_panelwise/sync",
  dirty: true,           // something changed since this device last wrote its file
  lastWrite: 0, lastRead: 0, peers: {},

  get device() {
    let d = null; try { d = localStorage.getItem("pw:device"); } catch {}
    if (!d) { d = Math.random().toString(36).slice(2, 10); try { localStorage.setItem("pw:device", d); } catch {} }
    return d;
  },
  // a Mac running the iPad app has a mouse or trackpad; the phone doesn't
  get deviceName() { return matchMedia("(hover: hover) and (pointer: fine)").matches ? "Mac" : "iPhone"; },
  ready() { return PW.native && PW.files.folderName && PW.be && PW.be.metas; },

  changed() { this.dirty = true; clearTimeout(this._t); this._t = setTimeout(() => this.write(), 5000); },

  /* ---- write this device's file ---- */
  async write(force) {
    if (!this.ready() || this._busy) return;
    const reading = PW.backup.readingState(), rkey = JSON.stringify(reading);
    if (!this.dirty && !force && rkey === this._lastReading) return;
    this._busy = true;
    try {
      const metas = await PW.be.metas(), docs = [];
      for (const r of await PW.be.dump()) {
        const m = metas.get(PW.be.key(r.parent, r.id));
        docs.push({ p: r.parent, i: r.id, t: m ? m.t : 0, d: r.data });
      }
      for (const [k, m] of metas) if (m.del) { const [p, i] = k.split("\u0001"); docs.push({ p, i, t: m.t, del: 1 }); }
      const file = { v: 1, device: this.device, name: this.deviceName, at: Date.now(), docs, reading };
      await PW.files.writeText(`${this.DIR}/${this.device}.json`, JSON.stringify(file));
      this.dirty = false; this._lastReading = rkey; this.lastWrite = Date.now(); PW.log.success("sync");
    } catch (e) { PW.log.error("sync", "write: " + (e && e.message)); }
    finally { this._busy = false; }
  },

  /* ---- read the other devices' files and keep the newest copy of each record ---- */
  async read() {
    if (!this.ready() || this._reading) return 0;
    this._reading = true; let n = 0;
    try {
      let list = [];
      try { list = (await PW.plugin.listDir({ path: this.DIR })).files || []; } catch { return 0; }   // no sync folder yet
      const metas = await PW.be.metas();
      let have = null;                                    // records that exist here without a time (older than sync)
      for (const f of list) {
        if (!/\.json$/.test(f.name) || f.name === this.device + ".json") continue;
        const seen = this.peers[f.name];
        if (seen && seen.mtime === f.mtime) continue;     // unchanged since the last read
        const txt = await PW.files.readText(`${this.DIR}/${f.name}`);
        if (!txt) continue;                               // iCloud is still downloading it: next time
        let file; try { file = JSON.parse(txt); } catch { continue; }
        if (!file || !Array.isArray(file.docs)) continue;
        if (!have) { have = new Set(); for (const r of await PW.be.dump()) have.add(PW.be.key(r.parent, r.id)); }
        for (const e of file.docs) {
          if (!e || !e.p || !e.i || e.p.startsWith("_")) continue;
          const k = PW.be.key(e.p, e.i), m = metas.get(k);
          const mine = m ? m.t : have.has(k) ? 0 : -1;
          if (!(e.t > mine)) continue;                     // ours is as new or newer
          if (e.del) { if (m && m.del) continue; await PW.be.delAt(e.p, e.i, e.t); }
          else await PW.be.putAt(e.p, e.i, e.d, e.t);
          metas.set(k, { t: e.t, del: e.del ? 1 : undefined }); n++;
        }
        if (file.reading) n += PW.backup.restoreReading(file.reading);
        this.peers[f.name] = { mtime: f.mtime, name: file.name || "another device", at: file.at };
      }
      this.lastRead = Date.now();
    } catch (e) { PW.log.error("sync", "read: " + (e && e.message)); }
    finally { this._reading = false; }
    return n;
  },

  // read, and if anything came in, show it; then write our own file
  async run() {
    const n = await this.read();
    if (n) {
      await PW.reloadSaved();
      if (S.paper && !S.paper.demo && typeof hydrate === "function") await hydrate(S.paper);
      if (typeof render === "function" && S.view !== "settings") render();
      toast(`Synced ${n} change${n === 1 ? "" : "s"} from your ${this.lastPeerName()}`);
    }
    await this.write();
    return n;
  },
  lastPeerName() { const p = Object.values(this.peers).sort((a, b) => (b.at || 0) - (a.at || 0))[0]; return p ? p.name : "other device"; },
  status() {
    const peers = Object.values(this.peers);
    if (!peers.length) return "No other device has synced yet.";
    return peers.map(p => `${p.name}: last change ${p.at ? new Date(p.at).toLocaleString() : "unknown"}`).join(" · ");
  },
};

// sync when the app comes to the front, when it goes to the background, and every two minutes while open
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") PW.sync.run(); else PW.sync.write();
});
setInterval(() => { if (document.visibilityState === "visible") PW.sync.run(); }, 2 * 60 * 1000);
