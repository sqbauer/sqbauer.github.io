"use strict";
/* ---------- events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, .seg, .sent.has, [data-record]"); if (!t) return;
  if (t.dataset.open) { openFromLibrary(t.dataset.open); return; }
  if (t.dataset.untag) { setTags(S.paper, (S.paper.tags || []).filter(x => x !== t.dataset.untag)); return; }
  if (t.dataset.ltab) { S.view = "library"; L.tab = t.dataset.ltab; render(); return; }
  if (t.dataset.topic) { S.topic = t.dataset.topic; S.view = "topic"; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.record) { S.recId = t.dataset.record; S.view = "record"; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.delnote) { const P = S.paper; if (!P) return; P.notes = P.notes.filter(n => n._id !== t.dataset.delnote); delChild(P, "notes", t.dataset.delnote); persistPaper(P); render(); return; }
  if (t.dataset.savemsg !== undefined) { saveMsg(+t.dataset.savemsg); return; }
  if (t.dataset.grade) { gradeCard(+t.dataset.grade); return; }
  if (t.dataset.place) { placePaper(t.dataset.place); return; }
  if (t.dataset.unpin) { const w = pal().wings[S.wing]; for (const [k, v] of Object.entries(w.place || {})) if (v === t.dataset.unpin) delete w.place[k]; savePalace(); renderPalace(); return; }
  if (t.dataset.wing !== undefined) { S.wing = +t.dataset.wing; S.room = 0; S.locus = null; S.walk = null; renderPalace(); window.scrollTo(0, 0); return; }
  if (t.dataset.walk !== undefined) { walkGrade(+t.dataset.walk); return; }
  if (t.dataset.folder !== undefined) { L.folderSel = t.dataset.folder; renderLibrary(); return; }
  if (t.matches(".step")) { S.view = t.dataset.view; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.go) { S.view = t.dataset.go; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.figIdx !== undefined) { S.figIdx = +t.dataset.figIdx; S.view = "figures"; S.hover = null; S.textHover = null; render(); window.scrollTo(0, 0); return; }
  if (t.matches(".ref")) { e.stopPropagation(); goFigure(+t.dataset.fig, t.dataset.panel || null); if (t.closest("#chat") && innerWidth <= 1100) setChat(false); return; }
  if (t.matches(".hot, .pchip")) { pin(t.dataset.panel); return; }
  if (t.matches(".seg")) { const l = (t.dataset.letters || "")[0]; if (l) pin(l, false); return; }
  if (t.matches(".sent.has")) { const f = S.paper.figures[S.figIdx]; const ks = t.dataset.k.split(" ").filter(k => parseInt(k) === f.n && !k.endsWith("*")); if (ks.length) pin(ks[0].replace(/^\d+/, ""), false); return; }
  const act = t.dataset.act;
  if (act === "feed") feedOpen();
  else if (act === "lsearch") lsOpen();
  else if (act === "primer") genPrimer(false);
  else if (act === "primer-redo") genPrimer(true);
  else if (act === "check") checkRestate();
  else if (act === "reveal") { S.paper.revealed = true; saveCache(); render(); }
  else if (act === "brief") genBrief(S.paper.figures[S.figIdx]);
  else if (act === "unpin") { S.pinned = null; applyHL(); }
  else if (act === "outlines") { S.outlines = !S.outlines; render(); }
  else if (act === "redetect") prepareFigure(S.paper.figures[S.figIdx], true);
  else if (act === "openchat") setChat(true);
  else if (act === "pickdir") pickFolderAction();
  else if (["key-test", "key-remove", "rescan", "export", "import", "sync-now"].includes(act)) settingsAction(act);
  else if (act === "pickfile") $("#fileIn").click();
  else if (act === "tosettings") { S.view = "settings"; render(); window.scrollTo(0, 0); }
  else if (act === "tostart") { S.view = "upload"; render(); window.scrollTo(0, 0); }
  else if (act === "demo") openPaper(DEMO);
  else if (act === "addtag") { S.tagEdit = true; renderTags(); }
  else if (act === "phonetoggle") { if (S.paper?.syncErr) { S.paper.syncErr = null; syncPaper(S.paper); } else phoneToggle(); }
  else if (act === "savecard") saveCard();
  else if (act === "checkcard") checkCard();
  else if (act === "review") startReview(false);
  else if (act === "palace") { S.view = "palace"; S.walk = null; S.wing = null; render(); window.scrollTo(0, 0); }
  else if (act === "palhome") { S.wing = null; S.walk = null; renderPalace(); }
  else if (act === "newwing") newWing();
  else if (act === "unlockroom") unlockNext();
  else if (act === "walk") startWalk();
  else if (act === "walk-reveal") { S.walk.shown = true; renderPalace(); }
  else if (act === "walk-stop") { S.walk = null; renderPalace(); }
  else if (act === "practice") startReview(true);
  else if (act === "reveal-card") { S.rv.typed = $("#rvIn")?.value || ""; S.rv.shown = true; renderReview(); }
  else if (act === "addnote") addNote(t.dataset.fig ? +t.dataset.fig : null);
  else if (act === "synth") synthTopic(S.topic);
  else if (act === "tolib") { S.view = "library"; render(); window.scrollTo(0, 0); }
  else if (act === "openrec") openFromLibrary(S.recId);
  else if (act === "sug") sendChat(t.dataset.q);
});
document.addEventListener("click", e => {
  if (S.view !== "palace" || S.wing == null) return;
  const go = e.target.closest && e.target.closest("[data-go-room]");
  if (go && !go.matches("button")) { const w = pal().wings[S.wing], r = +go.dataset.goRoom; if (S.walk) return; if (r < w.unlocked) { S.room = r; S.locus = null; renderPalace(); } else if (r === w.unlocked) unlockNext(); return; }
  if (go) { if (S.walk) return; S.room = +go.dataset.goRoom; S.locus = null; renderPalace(); return; }
  const lc = e.target.closest && e.target.closest("#roomview [data-locus]");
  if (lc && !S.walk) { const li = +lc.dataset.locus; S.locus = S.locus === li ? null : li; renderPalace(); }
});
document.addEventListener("keydown", e => {
  if (S.view !== "palace" || S.wing == null || /TEXTAREA|INPUT|SELECT/.test(e.target.tagName) && !(S.walk && e.target.id === "walkIn" && e.key === "Enter")) return;
  const w = pal().wings[S.wing];
  if (S.walk) {
    if (!S.walk.shown && e.key === "Enter") { e.preventDefault(); S.walk.shown = true; renderPalace(); }
    else if (S.walk.shown && (e.key === "1" || e.key === "2")) { e.preventDefault(); walkGrade(e.key === "2" ? 1 : 0); }
    return;
  }
  if (e.key === "ArrowRight" && S.room < w.unlocked - 1) { e.preventDefault(); S.room++; S.locus = null; renderPalace(); }
  else if (e.key === "ArrowLeft" && S.room > 0) { e.preventDefault(); S.room--; S.locus = null; renderPalace(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const d = e.key === "ArrowDown" ? 1 : 4; S.locus = S.locus == null ? 0 : (S.locus + d) % 5; renderPalace(); }
  else if (e.key === "Escape") { S.locus = null; renderPalace(); }
});
const PW_TOUCH = matchMedia("(hover: none)").matches; // phone: taps pin panels; no hover highlight
document.addEventListener("mouseover", e => {
  if (S.view !== "figures" || PW_TOUCH) return;
  const p = e.target.closest(".hot, .pchip, .seg");
  const s = e.target.closest(".sent.has");
  const nh = p ? (p.dataset.panel || (p.dataset.letters || "")[0] || null) : null;
  let nt = null;
  if (s) { const f = S.paper.figures[S.figIdx]; nt = s.dataset.k.split(" ").filter(k => parseInt(k) === f.n && !k.endsWith("*")).map(k => k.replace(/^\d+/, "")); }
  if (nh !== S.hover || JSON.stringify(nt) !== JSON.stringify(S.textHover)) { S.hover = nh; S.textHover = nt; applyHL(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "cFind") updateWC();
  if (e.target.id === "cFig" && S.paper) { const f = S.paper.figures.find(x => x.n === +e.target.value); const sel = $("#cPanel"); if (sel) sel.innerHTML = `<option value="">Whole figure</option>` + (f?.letters || []).map(l => `<option>${esc(l)}</option>`).join(""); } if (e.target.id === "restate" && S.paper) S.paper.restate = e.target.value; if (e.target.id === "libQ") { L.q = e.target.value; renderLibList(); } if (e.target.id === "nbQ") { L.nbq = e.target.value; clearTimeout(L.nbt); L.nbt = setTimeout(renderNotebook, 200); } });
document.addEventListener("keydown", e => {
  if (S.view === "review" && S.rv && S.rv.i < S.rv.q.length) {
    const typing = e.target.id === "rvIn";
    if (!S.rv.shown && e.key === " " && !typing) { e.preventDefault(); S.rv.typed = ""; S.rv.shown = true; renderReview(); return; }
    if (!S.rv.shown && e.key === "Enter" && typing && !e.shiftKey) { e.preventDefault(); S.rv.typed = e.target.value; S.rv.shown = true; renderReview(); return; }
    if (S.rv.shown && /^[1-4]$/.test(e.key)) { e.preventDefault(); gradeCard(+e.key); return; }
  }
  if (e.target.id === "tagIn") {
    if (e.key === "Enter") { e.preventDefault(); const v = e.target.value.trim(); S.tagEdit = false; if (v) setTags(S.paper, [...(S.paper.tags || []), v]); else renderTags(); }
    if (e.key === "Escape") { S.tagEdit = false; renderTags(); }
  }
  if (e.key === "Enter" && e.target.matches("[data-record]")) e.target.click();
});
document.addEventListener("focusout", e => { if (e.target.id === "tagIn" && !e.target.value.trim()) setTimeout(() => { if (S.tagEdit && document.activeElement?.id !== "tagIn") { S.tagEdit = false; renderTags(); } }, 150); });
document.addEventListener("change", e => { if (e.target.id === "libSort") { L.sort = e.target.value; renderLibList(); } if (e.target.id === "libField") { L.field = e.target.value; const i = $("#libQ"); if (i) i.placeholder = L.field === "authors" ? "Author name, e.g. Romano" : "Search titles, authors, file names, topics"; renderLibList(); } });
$("#dirIn").onchange = e => { const fs = e.target.files; if (fs && fs.length) onFolderPicked(fs); e.target.value = ""; };
const toLibrary = () => { if (PW.single) { S.view = "upload"; render(); window.scrollTo(0, 0); return; } S.view = "library"; render(); window.scrollTo(0, 0); runMetaQueue(); };
$("#brandBtn").onclick = toLibrary; $("#libBtn").onclick = toLibrary;
$("#openBtn").onclick = () => $("#fileIn").click();
$("#fileIn").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) handleFile(f); };
let dragN = 0;
addEventListener("dragenter", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { dragN++; $("#drop").hidden = false; } });
addEventListener("dragleave", () => { dragN = Math.max(0, dragN - 1); if (!dragN) $("#drop").hidden = true; });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => { e.preventDefault(); dragN = 0; $("#drop").hidden = true; const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); });
addEventListener("keydown", e => {
  if (S.view !== "figures" || /TEXTAREA|INPUT/.test(document.activeElement?.tagName)) return;
  if (e.key === "ArrowRight" && S.figIdx < S.paper.figures.length - 1) { S.figIdx++; S.pinned = null; render(); }
  if (e.key === "ArrowLeft" && S.figIdx > 0) { S.figIdx--; S.pinned = null; render(); }
  if (e.key === "Escape" && S.pinned) { S.pinned = null; applyHL(); }
});

