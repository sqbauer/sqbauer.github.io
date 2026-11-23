"use strict";
/* ---------- the web version (sqbauer.github.io/panelwise): one PDF at a time ----------
   Built by scripts/web.mjs, which marks the page with <html data-pw="single">. There is no library,
   no folder and no Claude: you choose a PDF, it is read in this browser tab, and the brand button
   brings you back here to choose another. In the app this file does nothing. */
if (PW.single) {
  $("#brandBtn").title = "Open another PDF";
  $("#openBtn").textContent = "Open another PDF";
}

function renderUpload() {
  $("#pTitle").textContent = "Panelwise";
  $("#pSub").textContent = "Read a paper figure by figure";
  $("#main").innerHTML = `<section class="view">
    <div class="eyebrow">Web version</div>
    <h2>Read a scientific paper figure by figure</h2>
    <p class="lede">Choose a PDF. Panelwise finds the figures and their legends, links each panel to the sentences that describe it, and has a reading mode with a line guide, a word-by-word guide and read aloud.</p>
    <button class="webdrop" type="button" data-act="pickfile">
      <strong>Choose a PDF</strong>
      <span>or drop it anywhere on this page</span>
    </button>
    <p class="note webprivacy">The PDF never leaves your device: it is read in this browser tab and nothing is uploaded to a server. Works best with research articles that have figure legends; scanned PDFs without text can't be read.</p>
    <div class="libempty" style="margin-top:24px">
      <div class="card"><h3>Try it first</h3><p class="note" style="margin:6px 0 12px">A short fictional paper with two figures, to see how panels link to text.</p><button class="btn" type="button" data-act="demo">Open the example paper</button></div>
      ${S.paper ? `<div class="card"><h3>Back to your paper</h3><p class="note" style="margin:6px 0 12px">${esc(S.paper.title || "")}</p><button class="btn" type="button" data-go="background">Continue reading</button></div>` : ""}
    </div>
  </section>`;
}
