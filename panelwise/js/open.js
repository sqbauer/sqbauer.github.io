"use strict";
/* ---------- open a paper ---------- */
function openPaper(raw) {
  S.paper = buildPaper(raw);
  const P = S.paper;
  if (!P.demo) {
    const c = store.get(cacheKey());
    if (c) { P.tags = c.tags || []; P.primer = c.primer; P.briefs = c.briefs || {}; P.restate = c.restate; P.verdict = c.verdict; P.revealed = c.revealed; P.seen = new Set(c.seen || []); P.card = c.card || null; P.cardImg = c.cardImg || null; P.srs = c.srs || {}; P.figures.forEach(f => { if (c.figs && c.figs[f.n]) f.det = c.figs[f.n]; }); }
  } else { P.briefs = { ...raw.briefs }; }
  P.seen = P.seen || new Set(); P.lastOpened = Date.now(); P.notes = P.notes || []; P.tags = P.tags || [];
  S.view = "background"; S.figIdx = 0; S.pinned = null; S.hover = null; S.chat = [];
  render(); renderChat();
  if (innerWidth > 1280 && $("#chat").hidden && (!PW.single || S.sample)) setChat(true);
  if (!P.demo) { saveCache(); hydrate(P).then(() => { if (P.doc && !P.phoneOff) setTimeout(() => syncPaper(P), 1200); }); }
  window.scrollTo(0, 0);
  if (!P.demo && !P.primer && S.sample) genPrimer();
}
async function handleFile(file, canonicalId) {
  if (!file || !/pdf$/i.test(file.type || file.name)) { toast("That isn't a PDF. Choose a .pdf file."); return; }
  const steps = ["Loading the PDF reader", "Reading text from each page", "Removing headers and footers", "Finding sections and figure legends", "Done"];
  const ui = $("#progress"); ui.hidden = false; $("#progTitle").textContent = file.name;
  const draw = (k, note) => { $("#progList").innerHTML = steps.slice(0, 4).map((s, i) => `<li class="${i < k ? "done" : i === k ? "run" : "todo"}">${s}</li>`).join(""); $("#progNote").textContent = note || ""; };
  draw(0);
  try {
    const raw = await parsePdf(file, draw); raw.fileName = file.name;
    // same paper saved under another file (renamed copy, other folder, other version): reuse that record
    if (canonicalId) raw.id = canonicalId;
    if (!recOf(raw.id)) { const nt = normTitle(raw.title); const twin = nt.length >= 25 && allRecs().find(r => normTitle(r.title) === nt); if (twin) raw.id = twin.id; }
    if (typeof pwIndexPaper === "function") ixLoad().then(() => { if (!IX.map.has(raw.id)) setTimeout(() => pwIndexPaper(raw.id, raw), 1500); });
    if (!raw.figures.length) toast("No figure legends found. Text and chat still work.", 5000);
    ui.hidden = true;
    pageCache.clear();
    openPaper(raw);
  } catch (e) {
    console.error(e); ui.hidden = true;
    toast(/load /.test(e.message || "") ? "Couldn't load the PDF reader. Check your connection and try again." : "Couldn't read this PDF. It may be scanned or protected.", 5000);
  }
}

