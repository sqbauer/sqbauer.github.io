"use strict";
/* ---------- platform: your Papers folder ----------
   In the app: pick a folder once (e.g. iCloud Drive/Papers), keep access through a security-scoped
   bookmark, scan it recursively and read a PDF only when it is opened. The scan returns lightweight
   File-like objects so library.js (onFolderPicked, extractMeta, handleFile) runs unchanged.
   In a browser: the original <input webkitdirectory> picker. */

function pwLazyFile(e) {
  // e: { path: "Papers/Imported/x.pdf", name, size, mtime }
  return {
    name: e.name, size: e.size, lastModified: e.mtime, type: "application/pdf", webkitRelativePath: e.path,
    async arrayBuffer() {
      const r = await PW.plugin.readFile({ path: e.path });          // copies the file into the app's temp folder
      const res = await fetch(window.PWDeps.Capacitor.convertFileSrc(r.url));
      if (!res.ok) throw new Error("read " + res.status);
      return res.arrayBuffer();
    }
  };
}

PW.files = {
  folderName: null,
  // returns true when a folder is connected (after picking it, or restored from the bookmark)
  async restore() {
    if (!PW.native) return false;
    try { const r = await PW.plugin.restoreFolder(); this.folderName = r.name || null; return !!r.name; } catch { return false; }
  },
  async pick() {
    if (!PW.native) { $("#dirIn").click(); return; }
    try {
      const r = await PW.plugin.pickFolder();
      if (!r || !r.name) return;                                   // cancelled
      this.folderName = r.name;
      await this.scan();
      // a folder picked for the first time on this device: bring in what the other devices have synced
      PW.sync.run().then(() => PW.backup.firstRunImport()).catch(e => console.warn("import", e));
    } catch (e) { console.warn(e); toast("Couldn't open that folder. Try picking it again." + (e && e.message ? ` (${e.message})` : ""), 8000); }
  },
  async scan() {
    if (!PW.native || !this.folderName) return false;
    const ui = $("#progress"); ui.hidden = S.view !== "library" && S.view !== "settings"; $("#progTitle").textContent = "Scanning " + this.folderName; $("#progList").innerHTML = `<li class="run">Listing PDFs in the folder and its subfolders</li>`; $("#progNote").textContent = "";
    try {
      const t0 = Date.now();
      const r = await PW.plugin.scanFolder();
      ui.hidden = true;
      // A scan can finish long after it started (a large iCloud folder). If a paper has been opened meanwhile,
      // update the library quietly: onFolderPicked would otherwise switch the screen back to the library.
      const keep = S.view, away = keep !== "library" && keep !== "settings";
      if (away) {
        const real = window.render;
        window.render = () => {};
        try { onFolderPicked(r.files.map(pwLazyFile)); } finally { window.render = real; S.view = keep; }
      } else onFolderPicked(r.files.map(pwLazyFile));
      return true;
    } catch (e) {
      ui.hidden = true; console.warn(e);
      toast(/bookmark|access|permission/i.test(e.message || "") ? "Lost access to your Papers folder. Pick it again in Settings." : "Couldn't scan the Papers folder.", 5000);
      return false;
    }
  },
  // text files inside the picked folder, used for _panelwise/backup.json and the first-run import
  async readText(rel) { if (!PW.native) return null; try { return (await PW.plugin.readText({ path: rel })).text; } catch { return null; } },
  async writeText(rel, text) { if (!PW.native) return false; await PW.plugin.writeText({ path: rel, text }); return true; },
};

function pickFolderAction() { PW.files.pick(); }
