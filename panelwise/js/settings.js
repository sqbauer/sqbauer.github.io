"use strict";
/* ---------- settings: API key, Papers folder, backups ---------- */
async function renderSettings() {
  if (PW.single) return renderWebSettings();
  $("#pTitle").textContent = "Settings"; $("#pSub").textContent = "Claude key, Papers folder, backups"; $("#pTags").innerHTML = "";
  const key = await PW.keys.get();
  if (S.view !== "settings") return;   // the Keychain read is async: the user may have moved on meanwhile
  const folder = PW.files.folderName;
  const nRecs = allRecs().length;
  $("#main").innerHTML = `<section class="view settings">
    <div class="eyebrow">Settings</div><h2>Settings</h2>

    <div class="card"><h3>Claude</h3>
      <p class="note">Summaries, panel detection, chat and card checks use your own Anthropic API key with ${esc(PW_MODEL)}. The key is stored in the ${PW.sync.deviceName === "Mac" ? "Keychain" : "iPhone Keychain"} and is only sent to api.anthropic.com.</p>
      <p>${key ? `Key saved: <span class="mono">${esc(PW.keys.mask(key))}</span>` : `<strong>No key saved.</strong> Reading works without one; Claude features stay off.`}</p>
      <form id="keyForm" class="setrow" autocomplete="off">
        <input id="keyIn" type="password" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Anthropic API key">
        <button class="btn primary" type="submit">${key ? "Replace key" : "Save key"}</button>
        ${key ? `<button class="btn" type="button" data-act="key-test">Test</button><button class="btn ghost" type="button" data-act="key-remove">Remove</button>` : ""}
      </form>
      <p class="note" id="keyNote">${PW.online() ? "" : "You're offline. Claude features need a connection; reading still works."}</p>
      ${PW.native ? "" : `<p class="note">Browser test mode: the key is kept in memory only and forgotten on reload.</p>`}
    </div>

    <div class="card"><h3>Papers folder</h3>
      ${PW.native
        ? `<p>${folder ? `Connected: <strong>${esc(folder)}</strong> · ${L.meta.items.length} PDFs` : "No folder connected yet."}</p>
           <p class="note">Pick your Papers folder in iCloud Drive once. Panelwise keeps access to it and scans it and its subfolders each time it opens. Folders starting with "_" and "Claude outputs" are skipped.</p>
           <div class="setrow"><button class="btn ${folder ? "" : "primary"}" type="button" data-act="pickdir">${folder ? "Choose another folder" : "Choose Papers folder"}</button>${folder ? `<button class="btn" type="button" data-act="rescan">Rescan now</button>` : ""}</div>`
        : `<p class="note">In a browser, pick the folder from the library each session.</p><div class="setrow"><button class="btn" type="button" data-act="pickdir">Choose Papers folder</button></div>`}
    </div>

    ${typeof oaMineHTML === "function" ? oaMineHTML() : ""}

    <div class="card"><h3>Saved work and backups</h3>
      <p>${nRecs} papers with saved work on this ${PW.native ? (PW.sync.deviceName === "Mac" ? "Mac" : "iPhone") : "browser"}.</p>
      ${PW.native ? `<p class="note">A backup is written to <span class="mono">${esc(folder || "Papers")}/_panelwise/backup.json</span> when the app goes to the background${PW.backup.lastAt ? `, last at ${new Date(PW.backup.lastAt).toLocaleTimeString()}` : ""}. iCloud Drive keeps it in sync with your other devices.</p>
      <p class="note"><strong>Sync between your iPhone and Mac.</strong> Each device writes its changes to <span class="mono">_panelwise/sync/</span> in the same folder and reads the other's, keeping the newest copy of everything. ${esc(PW.sync.status())}</p>
      <div class="setrow"><button class="btn" type="button" data-act="sync-now">Sync now</button></div>` : ""}
      ${healthHTML()}
      <div class="setrow">
        <button class="btn" type="button" data-act="export">Export backup</button>
        <button class="btn" type="button" data-act="import">Import backup…</button>
        <button class="btn" type="button" data-biball="1">Export BibTeX</button>
        <button class="btn" type="button" data-nbexport="all">Export notes as Markdown</button>
        <input type="file" id="importIn" accept="application/json,.json" hidden>
      </div>
      <p class="note">Import accepts the claude.ai export (panelwise_data.json) and this app's backups. Records are merged: the most recently updated copy wins.</p>
    </div>
  </section>`;
}

// is everything working? the last good sync and backup, and the last error, from PW.log
function healthHTML() {
  const ago = t => { if (!t) return "not yet"; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
  const e = PW.log.last(), ok = PW.log.ok;
  return `<div class="health">
    ${PW.native ? `<p class="note">Last sync: <strong>${ago(ok.sync)}</strong> · last backup: <strong>${ago(ok.backup)}</strong></p>` : ""}
    ${PW.dbFallback ? `<p class="note warn"><strong>Your saved work couldn't be opened</strong>, so this session uses a temporary store. Restart the app; your backups are kept.</p>` : ""}
    <p class="note">${e ? `Last problem (${ago(e.t)}): ${esc(e.where)}: ${esc(e.msg)}` : "No problems logged."} ${PW.log.items.length ? `<button type="button" class="linkbtn" data-act="copylog">Copy the log</button>` : ""}</p></div>`;
}

async function settingsAction(act) {
  if (act === "key-remove") { await PW.keys.set(""); await PW.reloadClaude(); toast("API key removed"); renderSettings(); }
  else if (act === "key-test") {
    const n = $("#keyNote"); n.textContent = "Testing…";
    try { const s = await window.claude.use("sample"); const r = await s("Reply with the single word OK.", { maxTokens: 20 }); n.textContent = /ok/i.test(r.text) ? "Connected to Claude ✓" : "Connected, but the answer was unexpected."; }
    catch (e) { n.textContent = errCopy(e); }
  }
  else if (act === "rescan") { await PW.files.scan(); }
  else if (act === "sync-now") {
    toast("Syncing…");
    const n = await PW.sync.run(); await PW.sync.write(true);
    if (!n) toast("Up to date. Your changes are in the sync folder for your other devices.");
    renderSettings();
  }
  else if (act === "export") {
    const data = JSON.stringify(await PW.backup.exportData());
    const name = `panelwise-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (PW.native) {
      if (!PW.files.folderName) { toast("Choose your Papers folder first; the backup is saved there."); return; }
      await PW.files.writeText(PW.backup.DIR + "/" + name, data);
      toast(`Saved ${PW.files.folderName}/${PW.backup.DIR}/${name}`, 5000);
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "application/json" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  }
  else if (act === "import") $("#importIn").click();
  else if (act === "copylog") { try { await navigator.clipboard.writeText(PW.log.text()); toast("Log copied"); } catch { toast("Couldn't copy the log."); } }
}

document.addEventListener("submit", async e => {
  if (e.target.id !== "keyForm") return;
  e.preventDefault();
  const v = $("#keyIn").value.trim(); $("#keyIn").value = "";
  if (!/^sk-ant-/.test(v)) { toast("That doesn't look like an Anthropic API key (it starts with sk-ant-)."); return; }
  try { await PW.keys.set(v, !!$("#keyRemember")?.checked); }
  catch (err) { toast("Couldn't save the key" + (err && err.message ? `: ${err.message}` : "."), 6000); return; }
  await PW.reloadClaude(); toast("API key saved"); renderSettings();
});
document.addEventListener("change", async e => {
  if (e.target.id !== "importIn" || !e.target.files[0]) return;
  const f = e.target.files[0]; e.target.value = "";
  try { const n = await PW.backup.importData(await f.text(), { manual: true }); await PW.reloadSaved(); toast(`Imported ${n} records`); renderSettings(); }
  catch (err) { console.warn(err); toast("Couldn't read that file as a Panelwise backup."); }
});
