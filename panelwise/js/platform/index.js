"use strict";
/* ---------- platform: window.claude.use() ----------
   The app was written against claude.ai's window.claude.use(name). This shim answers the same
   calls from on-device services, so the app code barely changes:
     sample -> Anthropic Messages API (null until an API key is saved in Settings)
     db     -> SQLite (app) / IndexedDB (browser)
     user   -> one local user
     assets -> not needed (PDFs are read straight from the Papers folder) */
window.claude = {
  async use(name) {
    if (name === "sample") { const key = await PW.keys.get(); await PW.dbReady; return key ? PW.makeSample(key, PW.kv) : null; }
    if (name === "db") return PW.dbReady;
    if (name === "user") return { id: async () => "local" };
    return null;
  }
};

// re-read saved work after an import or a key change
PW.reloadSaved = async function () {
  D.recs.clear(); D.topics.clear(); D.status.clear(); D.palace = null;
  await initDb();
};
PW.reloadClaude = async function () { S.claudeChecked = false; await initClaude(); };

// boot order: database -> folder access -> saved work (shown at once) -> Claude -> folder scan; then, in the
// background, the other devices' changes (iCloud can be slow or offline) and the first-run import, which refresh
// the screen when anything comes in
PW.boot = async function () {
  window.pwTheme && pwTheme.apply();                       // the native window (status bar, keyboard) too
  await PW.dbReady;
  const hasFolder = await PW.files.restore();
  await initDb();
  initClaude();
  setTimeout(() => PW.tidy().catch(e => PW.log.error("tidy", e)), 8000);
  PW.keepDeviceId().catch(() => {});
  if (hasFolder) {
    PW.files.scan();
    (async () => {
      const n = await PW.sync.read().catch(e => { PW.log.error("sync", e); return 0; });
      const imported = await PW.backup.firstRunImport().catch(e => { PW.log.error("import", e); return 0; });   // reloads by itself
      if (n && !imported) {
        await PW.reloadSaved();
        if (S.paper && !S.paper.demo) await hydrate(S.paper);
        if (S.view !== "settings") render();
        toast(`Synced ${n} change${n === 1 ? "" : "s"} from your ${PW.sync.lastPeerName()}`);
      }
      setTimeout(() => PW.sync.write(), 3000);
    })();
  }
};

/* housekeeping, at most once a week: parsed text from older parser versions (each version re-reads the
   library under new keys) and Claude responses older than six months */
PW.tidy = async function () {
  const last = await PW.kv.get("_meta", "tidied");
  if (last && Date.now() - last.t < 7 * 864e5) return;
  const raw = PW.be.raw || PW.be;
  let n = 0;
  if (raw.keys) for (const k of await raw.keys("_text")) if (!k.startsWith(PW_TEXT_VER + "|")) { await raw.del("_text", k); n++; }
  const old = Date.now() - 182 * 864e5;
  for (const r of await raw.all("_cache")) if (!r.data || (r.data.at || 0) < old) { await raw.del("_cache", r.id); n++; }
  await PW.kv.put("_meta", "tidied", { t: Date.now(), n });
};
// the sync device id lives in local storage, which iOS may clear: keep a copy in the database too
PW.keepDeviceId = async function () {
  let ls = null; try { ls = localStorage.getItem("pw:device"); } catch {}
  const db = await PW.kv.get("_meta", "device");
  if (!ls && db && db.id) { try { localStorage.setItem("pw:device", db.id); } catch {} }
  else if (ls && (!db || db.id !== ls)) await PW.kv.put("_meta", "device", { id: ls });
};
