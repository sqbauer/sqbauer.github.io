"use strict";
/* ---------- open a paper ---------- */
function openPaper(raw) {
  S.backTo = null;                                          // set again by whoever opened it to come back to (Browse cards)
  const prev = S.paper;
  S.paper = buildPaper(raw);
  // the previous paper's PDF stays in pdf.js's memory until destroyed
  if (prev && prev.doc && prev.doc !== S.paper.doc) { try { prev.doc.destroy(); } catch {} }
  const P = S.paper;
  if (!P.demo) {
    const c = recOf(P.id);                          // the database record (it has what sync brought in) before the local copy
    if (c) { P.tags = c.tags || []; P.primer = c.primer; P.briefs = c.briefs || {}; P.restate = c.restate; P.verdict = c.verdict; P.revealed = c.revealed; P.seen = new Set(c.seen || []); P.card = c.card || null; P.cards = c.cards || []; P.cardImg = c.cardImg || null; P.srs = c.srs || {}; P.figures.forEach(f => { if (c.figs && c.figs[f.n]) f.det = c.figs[f.n]; }); }
  } else { P.briefs = { ...raw.briefs }; }
  P.seen = P.seen || new Set(); P.lastOpened = Date.now(); P.notes = P.notes || []; P.tags = P.tags || [];
  if (S.chatBusy) { try { chatCtl && chatCtl.abort(); } catch {} S.chatBusy = false; }
  S.view = "background"; S.figIdx = 0; S.pinned = null; S.cardSel = null; S.cardFrom = null; S.hover = null; S.chat = [];
  // continue where you left off in this paper (kept with the reading positions, so it follows you across devices)
  if (!P.demo) { const w = stepLoad(P.id); if (w && ["background", "question", "figures", "card"].includes(w.view)) { S.view = w.view; S.figIdx = Math.max(0, Math.min(P.figures.length - 1, w.fig || 0)); if (S.view === "figures" && !P.figures.length) S.view = "background"; } }
  render(); renderChat();
  if (innerWidth > 1280 && $("#chat").hidden && (!PW.single || S.sample)) setChat(true);
  if (!P.demo) { saveCache(); hydrate(P); }
  window.scrollTo(0, 0);
  if (!P.demo && !P.primer && S.sample) genPrimer();
}
let OPEN_GEN = 0;
async function handleFile(file, canonicalId) {
  const gen = ++OPEN_GEN;                            // tap A, then B: whichever finishes last, B is the paper that opens
  if (!file || !/pdf$/i.test(file.type || file.name)) { toast("That isn't a PDF. Choose a .pdf file."); return; }
  const steps = ["Loading the PDF reader", "Reading text from each page", "Removing headers and footers", "Finding sections and figure legends", "Done"];
  const ui = $("#progress"); ui.hidden = false; $("#progTitle").textContent = (L.meta.items.find(x => x.id === canonicalId || x.name === file.name) || {}).title || file.name;
  const draw = (k, note) => { $("#progList").innerHTML = steps.slice(0, 4).map((s, i) => `<li class="${i < k ? "done" : i === k ? "run" : "todo"}">${s}</li>`).join(""); $("#progNote").textContent = note || ""; };
  draw(0);
  try {
    const raw = await parsePdfCached(file, draw); raw.fileName = file.name;
    if (gen !== OPEN_GEN) { try { raw.doc && raw.doc.destroy(); } catch {} return; }
    // same paper saved under another file (renamed copy, other folder, other version): reuse that record
    if (canonicalId) raw.id = canonicalId;
    if (!recOf(raw.id)) { const nt = normTitle(raw.title); const twin = nt.length >= 25 && allRecs().find(r => normTitle(r.title) === nt); if (twin) raw.id = twin.id; }
    // index it if it isn't yet: look up its own entry, not the whole index (tens of MB)
    if (typeof pwIndexPaper === "function") PW.be.get(IX_COL, raw.id).then(d => { if (!d || d.v !== IX_VER) setTimeout(() => ixLater(raw.id, raw), 1500); }).catch(() => {});
    if (!raw.figures.length) toast("No figure legends found. Text and chat still work.", 5000);
    ui.hidden = true;
    pageCache.clear();
    openPaper(raw);
    // a PDF that isn't in the library index yet (or the web version): read its authors from the first page
    const li = L.meta.items.find(x => x.id === raw.id);
    if ((!li || li.mv !== META_V) && typeof extractMeta === "function") extractMeta(file).then(m => {
      if (S.paper && S.paper.id === raw.id && m && m.year && !S.paper.yearPdf) { S.paper.yearPdf = m.year; renderPaperHead(S.paper); }
      if (S.paper && S.paper.id === raw.id && m && m.authors && m.authors.length > authorsFor(S.paper).length) { S.paper.authorsPdf = m.authors; renderPaperHead(S.paper); }
    }).catch(() => {});
  } catch (e) {
    if (gen !== OPEN_GEN) return;
    console.error(e); ui.hidden = true;
    toast(/load /.test(e.message || "") ? "Couldn't load the PDF reader. Check your connection and try again." : "Couldn't read this PDF. It may be scanned or protected.", 5000);
  }
}

