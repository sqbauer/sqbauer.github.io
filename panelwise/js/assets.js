"use strict";
/* ----- phone copies (assets) ----- */
const A = { api: null, usage: null, usageAt: 0 };
async function initAssets() { try { if (window.claude && window.claude.use) A.api = await window.claude.use("assets"); } catch { A.api = null; } if (S.paper) renderTags(); }
function dataUrlToBlob(u) { const [h, b] = u.split(","); const mime = (h.match(/:(.*?);/) || [])[1] || "image/jpeg"; const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }
async function shrinkToBlob(src, maxW = 1600, q = .84) {
  const im = new Image(); im.src = src; await im.decode();
  const sc = Math.min(1, maxW / im.naturalWidth), c = document.createElement("canvas");
  c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, "image/jpeg", q)) || dataUrlToBlob(c.toDataURL("image/jpeg", q));
}
async function syncPaper(P) {
  if (!A.api || !P || P.demo || !P.doc || P.phoneOff) return;
  if (P.syncing) { P.syncAgain = true; return; }
  P.syncing = true; P.syncErr = null; if (S.paper === P) renderTags();
  try {
    const ph = { ...(P.phone || {}), figs: { ...((P.phone || {}).figs || {}) } };
    for (const f of P.figures) {
      let img = f.img, cropped = !!f.cropped, panels = f.panels || null;
      if (!img) { try { const cv = await pageCanvas(f.det?.page || f.page); if (f.det) { img = cropTo(cv, f.det.box); cropped = true; panels = f.det.panels; } else if (f.autoBox) { img = cropTo(cv, f.autoBox); cropped = true; } else img = cv.toDataURL("image/jpeg", .85); } catch { continue; } }
      const sig = (cropped ? "c" : "p") + (panels || []).length + ":" + img.length;
      const cur = ph.figs[f.n]; if (cur && cur.sig === sig) continue;
      const up = await A.api.upload(await shrinkToBlob(img));
      if (cur?.asset) A.api.delete(cur.asset).catch(() => {});
      ph.figs[f.n] = { asset: up.id, sig, panels, cropped };
    }
    const bundle = { v: 1, id: P.id, title: P.title, sub: P.sub, abstract: P.abstract, sections: P.sections, fileName: P.fileName, figures: P.figures.map(f => ({ n: f.n, legend: f.legend, page: f.page })) };
    const json = JSON.stringify(bundle);
    if (ph.bsig !== json.length) { const up = await A.api.upload(new Blob([json], { type: "application/json" })); if (ph.bundle) A.api.delete(ph.bundle).catch(() => {}); ph.bundle = up.id; ph.bsig = json.length; }
    ph.at = Date.now(); P.phone = ph; persistPaper(P); A.usageAt = 0;
  } catch (e) { console.warn("phone sync", e); P.syncErr = e && e.code === "quota_or_state" ? "Phone storage is full" : e && e.code === "rate_limited" ? "Busy, will retry" : "Couldn't sync to phone"; if (e && e.code === "rate_limited") setTimeout(() => syncPaper(P), 20000); }
  P.syncing = false; if (S.paper === P) renderTags();
  if (P.syncAgain) { P.syncAgain = false; syncPaper(P); }
}
async function phoneToggle() {
  const P = S.paper; if (!P || P.demo) return;
  if (P.phoneOff) { P.phoneOff = false; persistPaper(P); syncPaper(P); toast("Syncing this paper to your phone"); return; }
  const ph = P.phone; P.phoneOff = true; P.phone = null; persistPaper(P); renderTags();
  if (A.api && ph) { for (const f of Object.values(ph.figs || {})) A.api.delete(f.asset).catch(() => {}); if (ph.bundle) A.api.delete(ph.bundle).catch(() => {}); }
  toast("Removed from your phone");
}
async function openSynced(r) {
  const ui = $("#progress"); ui.hidden = false; $("#progTitle").textContent = r.title || "Paper"; $("#progList").innerHTML = `<li class="run">Loading your synced copy</li>`; $("#progNote").textContent = "";
  try {
    const res = await fetch("/_blob/" + r.phone.bundle); if (!res.ok) throw new Error("bundle " + res.status);
    const b = await res.json();
    const raw = { ...b, id: r.id, synced: true, figures: b.figures.map(f => { const x = (r.phone.figs || {})[f.n]; return { ...f, img: x ? "/_blob/" + x.asset : null, panels: x?.panels || null, cropped: !!x?.cropped }; }) };
    ui.hidden = true; openPaper(raw);
  } catch (e) { console.warn(e); ui.hidden = true; toast("Couldn't load the synced copy. Open the paper on your PC to sync it again.", 5000); }
}
async function refreshUsage() {
  if (!A.api || Date.now() - A.usageAt < 60000) return;
  A.usageAt = Date.now();
  try { const l = await A.api.list(); A.usage = l.usage; const el = $("#storeMeter"); if (el) el.innerHTML = usageHTML(); } catch {}
}
const fmtMB = b => b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(.1, b / 1e6).toFixed(b < 1e7 ? 1 : 0) + " MB";
function usageHTML() { const u = A.usage; if (!u) return ""; return `Phone copies: ${fmtMB(u.bytes)}${u.maxBytes ? ` of ${fmtMB(u.maxBytes)}` : ""}${u.maxBytes ? ` <span class="meter" style="display:inline-block;width:120px;vertical-align:middle;margin-left:6px"><i style="width:${Math.min(100, u.bytes / u.maxBytes * 100).toFixed(1)}%"></i></span>` : ""}`; }
function openFromLibrary(keyOrId) {
  const groups = buildGroups();
  const gr = groups.find(g => g.key === keyOrId) || groups.find(g => g.id === keyOrId || g.members.some(m => m.id === keyOrId));
  const f = gr ? fileForGroup(gr) : null;
  if (!f) {
    const id = gr ? gr.id : String(keyOrId).replace(/^r:/, "");
    const r = recOf(id) || (gr && gr.members.map(m => recOf(m.id)).find(x => x?.phone?.bundle));
    if (r?.phone?.bundle) { openSynced(r); return; }
    toast(PW.native ? "This paper isn't in your Papers folder." : "Re-select the folder to open this paper."); if (!PW.native) pickFolderAction(); return;
  }
  handleFile(f, gr.id);
}

