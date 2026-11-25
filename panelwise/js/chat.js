"use strict";
/* ---------- chat ---------- */
function setChat(open) {
  const inside = $("#chat").contains(document.activeElement);
  $("#chat").hidden = !open; $("#app").classList.toggle("chat-open", open);
  document.documentElement.classList.toggle("pw-chat", open);
  // "Ask" in the header (wide screens) and in the phone's bottom bar; pressed while the chat is open
  for (const b of [$("#chatBtn"), $('#actbar [data-bar="ask"]')]) if (b) { b.setAttribute("aria-expanded", open); b.title = open ? "Hide the chat" : "Ask about the paper"; }
  if (open) { renderChat(); setTimeout(() => $("#chatIn").focus(), 30); }
  else if (inside) { const back = [$('#actbar [data-bar="ask"]'), $("#chatBtn")].find(b => b && !b.hidden && b.getClientRects().length); if (back) back.focus({ preventScroll: true }); }
}
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || $("#chat").hidden || document.documentElement.classList.contains("rdm-open") || document.documentElement.classList.contains("fd-on")) return;
  if (typeof FV !== "undefined" && FV.el && !FV.el.hidden) return;
  setChat(false); e.preventDefault();
});
$("#chatBtn").onclick = () => setChat($("#chat").hidden);
$("#chatClose").onclick = () => setChat(false);
function ctxLine() {
  const P = S.paper; if (!P) return "";
  if (S.view === "figures" && P.figures[S.figIdx]) { const f = P.figures[S.figIdx]; return `Viewing Figure ${f.n}` + (S.pinned && S.pinned.fig === f.n ? `, panel ${f.n}${S.pinned.panel} pinned` : ""); }
  return S.view === "question" ? "Viewing goal and question" : S.view === "card" ? "Writing a card" : "Viewing background";
}
function updateChatCtx() {
  $("#chatCtx").textContent = ctxLine();
  const P = S.paper; if (!P) return;
  const f = P.figures[S.figIdx];
  let sugs;
  if (S.view === "figures" && f) {
    sugs = S.pinned && S.pinned.fig === f.n
      ? [`Explain panel ${f.n}${S.pinned.panel}: what's plotted and what it shows`, `What controls or statistics support ${f.n}${S.pinned.panel}?`, `Could anything else explain ${f.n}${S.pinned.panel}?`]
      : [`Walk me through Figure ${f.n}`, `What's the weakest part of Figure ${f.n}?`, `Which methods matter for Figure ${f.n}?`];
  } else sugs = ["Explain the key terms in plain language", "What gap does this paper fill?", "Summarise the main methods", "What are the main limitations?"];
  $("#sugs").innerHTML = S.chat.length > 6 ? "" : sugs.map(q => `<button type="button" class="sug" data-act="sug" data-q="${esc(q)}">${esc(q)}</button>`).join("");
}
function md(text) {
  const lines = text.replace(/\r/g, "").split("\n"); let html = "", list = false, para = [];
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const flush = () => { if (para.length) { html += `<p>${inl(para.join(" "))}</p>`; para = []; } };
  for (const ln of lines) {
    const b = ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/), h = ln.match(/^#{1,4}\s+(.*)/);
    if (b) { flush(); if (!list) { html += "<ul>"; list = true; } html += `<li>${inl(b[1])}</li>`; continue; }
    if (list) { html += "</ul>"; list = false; }
    if (h) { flush(); html += `<h5>${inl(h[1])}</h5>`; continue; }
    if (!ln.trim()) { flush(); continue; }
    para.push(ln.trim());
  }
  flush(); if (list) html += "</ul>";
  return html;
}
function linkify(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const nodes = [];
  while (w.nextNode()) if (/Fig/i.test(w.currentNode.nodeValue)) nodes.push(w.currentNode);
  for (const n of nodes) { if (n.parentElement.closest("code")) continue; const h = renderRefs(n.nodeValue); if (h === esc(n.nodeValue)) continue; const t = document.createElement("template"); t.innerHTML = h; n.replaceWith(t.content); }
}
function renderChat() {
  const box = $("#msgs"); if (!box) return;
  if (!S.chat.length) {
    box.innerHTML = `<div class="empty-chat">${S.sample ? "Ask anything about this paper: methods, statistics, a panel, how it fits the field. Answers cite figures like <span class=\"ref\" style=\"pointer-events:none\">Fig. 1D</span>, which you can click." : S.claudeChecked ? NO_CLAUDE + " Chat is off; everything else works." : "Connecting to Claude…"}</div>`;
  } else {
    box.innerHTML = S.chat.map((m, i) => m.role === "user" ? `<div class="msg u">${esc(m.content)}</div>` : `<div class="msg a" data-i="${i}">${m.content ? md(m.content) : `<div class="thinking"><span class="dot"></span>Thinking…</div>`}${m.err ? `<div class="err">${esc(m.err)}</div>` : ""}${m.content && !(S.chatBusy && i === S.chat.length - 1) ? `<div class="mact">${m.saved ? `<span class="note">Saved to notes ✓</span>` : `<button type="button" class="linkbtn" data-savemsg="${i}">Save to notes</button>`}</div>` : ""}</div>`).join("");
    $$(".msg.a", box).forEach(linkify);
  }
  box.scrollTop = box.scrollHeight;
  $("#sendBtn").textContent = S.chatBusy ? "Stop" : "Send";
  $("#chatIn").disabled = !S.sample && S.claudeChecked;
  updateChatCtx();
}
let chatCtl = null;
async function sendChat(q) {
  if (S.chatBusy) { chatCtl?.abort(); return; }
  q = (q || "").trim(); if (!q || !S.paper) return;
  if (!S.sample) { toast(NO_CLAUDE); return; }
  if ($("#chat").hidden) setChat(true);
  $("#chatIn").value = "";
  const um = { role: "user", content: q }; S.chat.push(um);
  const ans = { role: "assistant", content: "" }; S.chat.push(ans);
  addChild(S.paper, "chat", { role: "user", content: q, ctx: ctxLine() }).then(o => um._id = o._id);
  S.chatBusy = true; renderChat();
  const P = S.paper;
  const rules = `You are a rigorous, unsentimental reading companion for the scientific paper below. The reader is a neuroscience researcher.
- Answer from the paper. When the paper doesn't say something, say so plainly, then give general knowledge clearly marked as such.
- Cite where an answer comes from: figure panels as "Fig. 2C", or the section name.
- Surface confounds, missing controls and statistical issues when relevant. Don't flatter the paper.
- Be concise: short paragraphs or bullets, no preamble.

<paper>
${P.fullText}
</paper>`;
  const hist = S.chat.slice(0, -1).filter(m => m.content && !m.err).slice(-12);
  const turns = [{ role: "user", content: rules }, ...hist.slice(0, -1), { role: "user", content: `[${ctxLine()}]\n\n${q}` }];
  chatCtl = new AbortController();
  let last = 0;
  try {
    await S.sample(turns, { cache: false, signal: chatCtl.signal, onText: ({ text }) => { ans.content = text; const now = performance.now(); if (now - last > 120) { last = now; renderChat(); } } });
  } catch (e) {
    ans.content = e.text || ans.content || ""; if (e.code !== "cancelled") ans.err = errCopy(e); claudeOff(e);
  }
  if (S.paper === P) { S.chatBusy = false; renderChat(); }       // after a paper switch, the new paper's chat is its own
  if (ans.content && !ans.err && S.paper === P) { addChild(P, "chat", { role: "assistant", content: ans.content }).then(o => ans._id = o._id); persistPaper(P); }
}
$("#composer").onsubmit = e => { e.preventDefault(); sendChat($("#chatIn").value); };
$("#chatIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat($("#chatIn").value); } });
$("#chatIn").addEventListener("input", e => { e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; });

