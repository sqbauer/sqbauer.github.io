"use strict";
/* ---------- Notebook: everything you wrote or marked, across all papers ----------
   Notes (by a figure or from reading mode), chat answers you saved, and highlights with their comments.
   Filter by kind, group by paper or list newest first, edit a note or a comment in place, and open any item
   where it belongs: the figure it is about, or the sentence it quotes. Search ⌘K finds them too. */
const NB = { kind: "all", by: "paper", q: "", items: null, edit: null, loading: null };

async function nbLoad() {
  if (NB.loading) return NB.loading;
  NB.loading = (async () => {
    const out = [], recs = allRecs();
    await Promise.all(recs.map(async r => {
      const [ns, ms] = await Promise.all([r.nNotes > 0 || !D.col ? listChildren(r.id, "notes") : [], listChildren(r.id, "marks")]);
      for (const n of ns) out.push({ ...n, sub: "notes", kind: n.kind === "saved" ? "saved" : "note", paper: r });
      for (const m of ms) out.push({ ...m, sub: "marks", kind: "mark", paper: r });
    }));
    NB.items = out.sort((a, b) => (b.at || 0) - (a.at || 0));
    NB.loading = null;
    return NB.items;
  })();
  return NB.loading;
}
const nbStale = () => { NB.items = null; };
// a set of papers' notes and highlights (for the topic overview)
async function gatherNotes(recs) {
  const out = [];
  await Promise.all(recs.map(async r => {
    const [ns, ms] = await Promise.all([r.nNotes > 0 || !D.col ? listChildren(r.id, "notes") : [], listChildren(r.id, "marks")]);
    ns.forEach(n => out.push({ ...n, paper: r }));
    ms.forEach(m => out.push({ ...m, text: `Highlighted: “${m.text}”${m.comment ? ` Comment: ${m.comment}` : ""}`, paper: r }));
  }));
  return out.sort((a, b) => b.at - a.at);
}
// a highlight or note quoted from the text: the sentence to find again in reading mode
const nbQuote = it => it.kind === "mark" ? it.text : ((it.text || "").match(/^“([^”]{12,})”/) || [])[1] || it.quote || "";
const nbHay = it => [it.text, it.comment, it.q, it.paper.title, ...(it.paper.tags || [])].join(" ").toLowerCase();

async function renderNotebook() {
  const box = $("#nbBox"); if (!box) return;
  if (!NB.items) { box.innerHTML = `<div class="thinking"><span class="dot"></span>Gathering your notes…</div>`; await nbLoad(); }
  if (L.tab !== "notebook" || S.view !== "library" || !$("#nbBox")) return;
  const all = NB.items, q = NB.q.trim().toLowerCase();
  if (!all.length) {
    $("#nbBox").innerHTML = `<div class="card"><h3>Your notebook is empty</h3><p class="note">Notes you write next to a figure, chat answers you save, and sentences you highlight in reading mode collect here across all papers.</p></div>`;
    return;
  }
  const count = k => all.filter(x => k === "all" || x.kind === k).length;
  const list = all.filter(x => (NB.kind === "all" || x.kind === NB.kind) && (!q || nbHay(x).includes(q)));
  const kinds = [["all", "All"], ["note", "Notes"], ["mark", "Highlights"], ["saved", "From chat"]].filter(([k]) => k === "all" || count(k));
  let body;
  if (!list.length) body = `<p class="note">Nothing matches.</p>`;
  else if (NB.by === "paper") {
    const groups = new Map();
    for (const it of list) { const g = groups.get(it.paper.id) || []; g.push(it); groups.set(it.paper.id, g); }
    body = [...groups.values()].map(g => `<section class="nb-paper"><button type="button" class="nb-ph" data-record="${esc(g[0].paper.id)}">${esc(g[0].paper.title || "Untitled paper")}<span class="note">${g.length}</span></button>
      ${g.sort((a, b) => (a.fig || 99) - (b.fig || 99) || (a.at || 0) - (b.at || 0)).map(it => nbItemHTML(it, false)).join("")}</section>`).join("");
  } else body = list.map(it => nbItemHTML(it, true)).join("");
  $("#nbBox").innerHTML = `<div class="nb-tools">
      <input class="search" id="nbQ" type="search" placeholder="Search notes, highlights and comments" value="${esc(NB.q)}" aria-label="Search your notebook" autocomplete="off" spellcheck="false">
      <div class="nb-row"><div class="tags" role="group" aria-label="Show">${kinds.map(([k, l]) => `<button type="button" class="chip" data-nbkind="${k}" aria-pressed="${NB.kind === k}">${l} <span class="c">${count(k)}</span></button>`).join("")}</div>
      <label class="nb-by">Order <select id="nbBy"><option value="paper" ${NB.by === "paper" ? "selected" : ""}>By paper</option><option value="new" ${NB.by === "new" ? "selected" : ""}>Newest first</option></select></label>
      <button type="button" class="btn quiet" data-nbexport="all" title="One Markdown file per paper, in your Papers folder">Export as Markdown</button></div>
    </div><div class="nb-list">${body}</div>`;
}
function nbItemHTML(it, withPaper) {
  const where = [it.fig ? `Fig. ${it.fig}${it.panel || ""}` : "", it.kind === "saved" ? "from chat" : it.kind === "mark" ? "highlight" : "", fmtDate(it.at)].filter(Boolean).join(" · ");
  const editing = NB.edit === it._id;
  const main = it.kind === "mark"
    ? `<blockquote class="nb-quote"><i class="rdm-dot c-${esc(it.color || "y")}"></i>${esc(it.text)}</blockquote>${editing ? "" : it.comment ? `<div class="nb-comment">${esc(it.comment)}</div>` : ""}`
    : editing ? "" : `<div class="nb-text">${esc(it.text)}</div>`;
  const editor = editing ? `<div class="nb-edit"><textarea id="nbEditIn" rows="${it.kind === "mark" ? 2 : 4}" aria-label="${it.kind === "mark" ? "Your comment" : "Your note"}" placeholder="${it.kind === "mark" ? "Why this sentence matters…" : ""}">${esc(it.kind === "mark" ? it.comment || "" : it.text)}</textarea>
      <div class="nb-acts"><button type="button" class="btn primary" data-nbsave="${esc(it._id)}">Save</button><button type="button" class="btn quiet" data-nbcancel="1">Cancel</button></div></div>` : "";
  const canGo = it.fig || nbQuote(it);
  return `<article class="nb-item" data-nbid="${esc(it._id)}">
    <div class="nm"><span>${withPaper ? esc(it.paper.title || "") + " · " : ""}${esc(where)}</span></div>
    ${main}${editor}
    ${editing ? "" : `<div class="nb-acts">${canGo ? `<button type="button" class="linkbtn" data-nbgo="${esc(it._id)}">${it.fig ? `Open Fig. ${esc(it.fig)}${esc(it.panel || "")}` : "Open at this sentence"}</button>` : `<button type="button" class="linkbtn" data-record="${esc(it.paper.id)}">Open saved work</button>`}
      <button type="button" class="linkbtn" data-nbedit="${esc(it._id)}">${it.kind === "mark" ? (it.comment ? "Edit comment" : "Add comment") : "Edit"}</button>
      <button type="button" class="linkbtn danger" data-nbdel="${esc(it._id)}">Delete</button></div>`}
  </article>`;
}
const nbFind = id => (NB.items || []).find(x => x._id === id);

// open an item where it belongs: its figure (and panel), else the sentence it quotes, else the saved work
async function nbGo(it) {
  const L_ = ixPapers().find(x => x.id === it.paper.id);
  if (!L_ || !L_.g.file) { S.recId = it.paper.id; S.view = "record"; render(); window.scrollTo(0, 0); toast("The PDF isn't in your Papers folder, so here is your saved work."); return; }
  if (it.fig) {
    const file = fileForGroup(L_.g); if (!S.paper || S.paper.id !== L_.id) await handleFile(file, L_.id);
    const P = S.paper; if (!P || P.id !== L_.id) return;
    const i = P.figures.findIndex(f => f.n === +it.fig); if (i < 0) return;
    S.view = "figures"; S.figIdx = i; S.pinned = it.panel ? { fig: +it.fig, panel: it.panel } : null; render(); window.scrollTo(0, 0);
  } else await ixOpen(L_, nbQuote(it));
}
async function nbSave(it, val) {
  const patch = it.kind === "mark" ? { comment: val } : { text: val };
  if (it.kind !== "mark" && !val.trim()) { toast("A note can't be empty. Use Delete to remove it."); return; }
  await updChild(it.paper.id, it.sub, it._id, patch);
  Object.assign(it, patch); NB.edit = null; renderNotebook();
  if (S.paper && S.paper.id === it.paper.id && it.sub === "notes") S.paper.notes = (S.paper.notes || []).map(n => n._id === it._id ? { ...n, ...patch } : n);
  toast("Saved");
}
function nbDelete(it) {
  NB.items = NB.items.filter(x => x !== it); renderNotebook();
  toastUndo(it.kind === "mark" ? "Highlight deleted." : "Note deleted.", () => { NB.items = [...NB.items, it].sort((a, b) => (b.at || 0) - (a.at || 0)); renderNotebook(); },
    async () => {
      await delChild({ id: it.paper.id }, it.sub, it._id);
      if (it.sub === "notes") {
        const n = Math.max(0, (recOf(it.paper.id)?.nNotes || 1) - 1); patchRec(it.paper.id, { nNotes: n });
        if (S.paper && S.paper.id === it.paper.id) S.paper.notes = (S.paper.notes || []).filter(x => x._id !== it._id);
      }
    });
}

document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-nbkind], [data-nbgo], [data-nbedit], [data-nbsave], [data-nbcancel], [data-nbdel], [data-nbexport]"); if (!t) return;
  if (t.dataset.nbkind) { NB.kind = t.dataset.nbkind; renderNotebook(); return; }
  if (t.dataset.nbexport) { mdExportAll(); return; }
  if (t.dataset.nbcancel) { NB.edit = null; renderNotebook(); return; }
  const it = nbFind(t.dataset.nbgo || t.dataset.nbedit || t.dataset.nbsave || t.dataset.nbdel); if (!it) return;
  if (t.dataset.nbgo) nbGo(it);
  else if (t.dataset.nbedit) { NB.edit = it._id; renderNotebook(); requestAnimationFrame(() => { const i = $("#nbEditIn"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }
  else if (t.dataset.nbsave) nbSave(it, $("#nbEditIn")?.value || "");
  else if (t.dataset.nbdel) nbDelete(it);
});
document.addEventListener("input", e => {
  if (e.target.id !== "nbQ") return;
  NB.q = e.target.value; renderNotebook().then(() => { const i = $("#nbQ"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
});
document.addEventListener("change", e => { if (e.target.id === "nbBy") { NB.by = e.target.value; renderNotebook(); } });
document.addEventListener("keydown", e => {
  if (e.target.id !== "nbEditIn") return;
  if (e.key === "Escape") { NB.edit = null; renderNotebook(); }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { const it = nbFind(NB.edit); if (it) nbSave(it, e.target.value); }
});

// ⌘K: your own notes and highlights, as a group in the search results
function lsNotes(q) {
  if (!NB.items || q.length < 3) return [];
  const s = q.toLowerCase(); return NB.items.filter(it => nbHay(it).includes(s)).slice(0, 4);
}
function lsNotesHTML(q) {
  const hits = lsNotes(q); if (!hits.length) return "";
  return lsGroup("Your notes", hits.length, hits.map(it => `<button type="button" class="ls-row" role="option" data-lsi data-ls="note" data-nb="${esc(it._id)}"><span class="ls-i">${LS_SVG.term}</span><span class="ls-b"><span class="ls-h1">${lsHL((it.kind === "mark" ? (it.comment ? it.comment + " · " : "") + it.text : it.text).slice(0, 140), q)}</span><span class="ls-h2">${esc(it.paper.title || "")}</span></span></button>`).join(""), "lsgN");
}
