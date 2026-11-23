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
  D.recs.clear(); D.topics.clear(); D.palace = null;
  await initDb();
};
PW.reloadClaude = async function () { S.claudeChecked = false; await initClaude(); };

// boot order: database -> folder access -> saved work (shown at once) -> Claude -> folder scan; then, in the
// background, the other devices' changes (iCloud can be slow or offline) and the first-run import, which refresh
// the screen when anything comes in
PW.boot = async function () {
  await PW.dbReady;
  const hasFolder = await PW.files.restore();
  await initDb();
  initClaude();
  if (hasFolder) {
    PW.files.scan();
    (async () => {
      const n = await PW.sync.read().catch(e => { console.warn("sync", e); return 0; });
      const imported = await PW.backup.firstRunImport().catch(e => { console.warn("import", e); return 0; });   // reloads by itself
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
