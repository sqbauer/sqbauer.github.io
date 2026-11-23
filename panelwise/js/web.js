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
    <div class="libempty webcards" style="margin-top:24px">
      <div class="card"><h3>Try it first</h3><p class="note" style="margin:6px 0 12px">A short fictional paper with two figures, to see how panels link to text.</p><button class="btn" type="button" data-act="demo">Open the example paper</button></div>
      <div class="card"><h3>Claude (optional)</h3><p class="note" style="margin:6px 0 12px">${S.sample ? "Claude is on with your API key: primer, figure explanations and chat." : "Add your own Anthropic API key to get a primer, figure explanations and a chat about the paper. Only then is the paper's text sent to Anthropic."}</p><button class="btn" type="button" data-act="tosettings">${S.sample ? "Key settings" : "Add your API key"}</button></div>
      ${S.paper ? `<div class="card"><h3>Back to your paper</h3><p class="note" style="margin:6px 0 12px">${esc(S.paper.title || "")}</p><button class="btn" type="button" data-go="background">Continue reading</button></div>` : ""}
    </div>
  </section>`;
}

/* Settings in the web version: only the visitor's own Anthropic API key */
async function renderWebSettings() {
  $("#pTitle").textContent = "Settings"; $("#pSub").textContent = "Your Claude key"; $("#pTags").innerHTML = "";
  const key = await PW.keys.get();
  if (S.view !== "settings") return;
  const kept = PW.keys.remembered();
  $("#main").innerHTML = `<section class="view settings">
    <div class="eyebrow">Settings</div><h2>Turn on Claude with your own API key</h2>
    <p class="lede">With a key, Claude writes the primer, explains figures and answers questions about the paper. Without one, everything else still works.</p>
    <div class="card"><h3>Your Anthropic API key</h3>
      <p>${key ? `Key ${kept ? "saved in this browser" : "in use until you reload or close this page"}: <span class="mono">${esc(PW.keys.mask(key))}</span>` : `<strong>No key yet.</strong> Claude is off.`}</p>
      <form id="keyForm" class="setrow" autocomplete="off">
        <input id="keyIn" type="password" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Anthropic API key">
        <button class="btn primary" type="submit">${key ? "Replace key" : "Save key"}</button>
        ${key ? `<button class="btn" type="button" data-act="key-test">Test</button><button class="btn ghost" type="button" data-act="key-remove">Remove</button>` : ""}
      </form>
      <label class="webremember"><input type="checkbox" id="keyRemember" ${key && !kept ? "" : "checked"}> Remember the key in this browser, so it still works when you come back</label>
      <p class="note" id="keyNote">${PW.online() ? "" : "You're offline. Claude needs a connection; reading still works."}</p>
    </div>
    <div class="card"><h3>How it works</h3>
      <ul class="webfacts">
        <li>Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Use is billed to your Anthropic account; a paper typically costs a few cents.</li>
        <li>The key goes only from your browser to api.anthropic.com. This site has no server and never sees it.</li>
        <li>When Claude is used, the paper's text (and for figures, the figure image) is sent to Anthropic. The PDF itself stays in your browser.</li>
        <li>A remembered key is kept in this browser's storage for this site until you remove it here or clear your browsing data. Don't remember it on a shared computer.</li>
      </ul>
    </div>
    ${S.paper ? `<div class="nextbar"><button class="btn primary" type="button" data-go="background">Back to the paper</button></div>` : `<div class="nextbar"><button class="btn primary" type="button" data-act="tostart">Choose a PDF</button></div>`}
  </section>`;
}
