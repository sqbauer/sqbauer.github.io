"use strict";
/* ---------- saved work (db, with local fallback) ---------- */
const D = { col: null, ready: false, recs: new Map(), topics: new Map(), status: new Map(), chain: new Map(), tm: new Map() };
const keyOf = id => "p~" + String(id).replace(/[^A-Za-z0-9_\-.~:@+]/g, "_").slice(0, 180);
const topicKey = n => "t~" + (n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "topic");
async function initDb() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    if (!db || !user) return;
    const uid = await user.id(); if (!uid) return;
    D.col = db.collection("data/users/" + uid);
    const snap = await D.col.get();
    for (const d of snap.docs) { const v = d.data(); if (!v) continue; if (v.kind === "topic") D.topics.set(d.id, v); else if (v.kind === "paper") D.recs.set(d.id, v); else if (v.kind === "status" && v.id) D.status.set(v.id, v); else if (v.kind === "ask") (D.asks = D.asks || new Map()).set(d.id, v); else if (v.kind === "palace") D.palace = v; }
    D.ready = true;
    if (D.palace && (!S.pal || (D.palace.updated || 0) >= (S.pal.updated || 0))) S.pal = D.palace;
    else if (S.pal && S.pal.updated) savePalace();
    if (S.paper && !S.paper.demo) await hydrate(S.paper);
    render();
  } catch (e) { console.warn("Saved work unavailable", e); D.col = null; }
}
function enqueue(key, fn) {
  const prev = D.chain.get(key) || Promise.resolve();
  const p = prev.then(fn).catch(e => { console.warn("save failed", e); if (!enqueue.warned) { enqueue.warned = true; toast("Couldn't save to your account. Changes are kept in this browser only."); } });
  D.chain.set(key, p); return p;
}
function allTopics() {
  const names = new Map();
  for (const t of D.topics.values()) names.set(t.name.toLowerCase(), t.name);
  for (const r of allRecs()) for (const t of r.tags || []) if (!names.has(t.toLowerCase())) names.set(t.toLowerCase(), t);
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
function localRecs() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^pw:.+:\d+$/.test(k)) { const v = store.get(k); if (v && v.title) out.push({ kind: "paper", ...v, id: k.slice(3) }); } } } catch {} return out; }
function allRecs() { if (D.ready) return [...D.recs.values()]; return localRecs(); }
function recOf(id) { const r = D.recs.get(keyOf(id)); if (r) return r; const c = store.get("pw:" + id); return c ? { ...c, id } : null; }
function recordFor(P) {
  const it = L.meta.items.find(x => x.id === P.id) || {};
  return { kind: "paper", id: P.id, name: P.fileName || it.name || P.id.split(":")[0], title: P.title, year: it.year || null, folder: it.folder || "", authors: authorsFor(P),
    primer: P.primer || null, briefs: P.briefs || {}, judge: P.judge || recOf(P.id)?.judge || {}, stats: P.stats || recOf(P.id)?.stats || {}, figs: Object.fromEntries(P.figures.map(f => [f.n, f.det || null])), restate: P.restate || "", verdict: P.verdict || null,
    revealed: !!P.revealed, seen: [...(P.seen || [])], nfig: P.figures.length, lastOpened: P.lastOpened || Date.now(), tags: P.tags || [],
    // until the notes and chat have loaded (hydrate), keep the counts already saved instead of writing zeros
    nNotes: P.hydrated ? (P.notes || []).length : (recOf(P.id)?.nNotes || 0),
    nChat: P.hydrated ? S.chat.filter(m => m.content && !m.err).length : (recOf(P.id)?.nChat || 0), updated: Date.now(),
    card: P.card || null, cards: P.cards || recOf(P.id)?.cards || [], cardImg: P.cardImg || null, srs: P.srs || recOf(P.id)?.srs || {},
    phone: P.phone !== undefined ? P.phone : (recOf(P.id)?.phone || null), phoneOff: !!P.phoneOff };
}
function persistPaper(P) {
  if (!P || P.demo) return;
  if (typeof BG_MEMO !== "undefined") BG_MEMO = null;   // the library groups look at saved records
  const rec = recordFor(P);
  const { kind, ...local } = rec; if (D.col) delete local.cardImg; store.set("pw:" + P.id, local);
  if (!D.col) return;
  const key = keyOf(P.id); D.recs.set(key, rec);
  clearTimeout(D.tm.get(key));
  D.tm.set(key, setTimeout(() => enqueue(key, () => D.col.doc(key).set(rec)), 700));
}
async function addChild(P, sub, obj) {
  obj.at = Date.now(); if (typeof nbStale === "function") nbStale();
  if (P.demo) { obj._id = "d" + obj.at + Math.random(); return obj; }
  if (D.col) {
    const ref = D.col.doc(keyOf(P.id)).collection(sub).doc(); obj._id = ref.id;
    const { _id, ...body } = obj; enqueue(keyOf(P.id) + "/" + sub, () => ref.set(body));
  } else { const k = "pw:" + P.id + ":" + sub; const a = store.get(k) || []; obj._id = "l" + obj.at; a.push(obj); store.set(k, a.slice(-400)); }
  return obj;
}
async function delChild(P, sub, id) {
  if (P.demo) return;
  if (typeof nbStale === "function" && sub !== "chat" && S.view !== "library") nbStale();
  if (D.col) enqueue(keyOf(P.id) + "/" + sub, () => D.col.doc(keyOf(P.id)).collection(sub).doc(id).delete());
  else { const k = "pw:" + P.id + ":" + sub; store.set(k, (store.get(k) || []).filter(x => x._id !== id)); }
}
// change some fields of a note or highlight (by the paper's id, so it works without opening the paper)
async function updChild(paperId, sub, cid, patch) {
  if (D.col) {
    const ref = D.col.doc(keyOf(paperId)).collection(sub).doc(cid);
    await new Promise((res, rej) => enqueue(keyOf(paperId) + "/" + sub, async () => {
      try { const d = await ref.get(); if (d.exists) await ref.set({ ...d.data(), ...patch, edited: Date.now() }); res(); } catch (e) { rej(e); }
    }));
  } else { const k = "pw:" + paperId + ":" + sub; store.set(k, (store.get(k) || []).map(x => x._id === cid ? { ...x, ...patch, edited: Date.now() } : x)); }
}
async function listChildren(id, sub) {
  if (D.col) { try { const sn = await D.col.doc(keyOf(id)).collection(sub).orderBy("at").limit(500).get(); return sn.docs.map(d => ({ ...d.data(), _id: d.id })); } catch (e) { console.warn(e); return []; } }
  return store.get("pw:" + id + ":" + sub) || [];
}
async function hydrate(P) {
  const r = D.recs.get(keyOf(P.id));
  if (r) {
    // the saved record is the newest truth: every change here goes through persistPaper into it, and sync writes
    // the other device's newer edits into it. So it wins over what this open paper still holds in memory.
    P.primer = r.primer || P.primer; P.briefs = { ...(P.briefs || {}), ...(r.briefs || {}) }; P.judge = r.judge || P.judge || {}; P.stats = { ...(P.stats || {}), ...(r.stats || {}) }; P.restate = r.restate || P.restate; P.verdict = r.verdict || P.verdict;
    P.revealed = r.revealed || P.revealed; P.tags = r.tags || P.tags || []; (r.seen || []).forEach(n => P.seen.add(n));
    P.figures.forEach(f => { if (r.figs && r.figs[f.n]) f.det = r.figs[f.n]; });
    P.card = r.card || P.card || null; P.cards = r.cards || P.cards || []; P.cardImg = r.cardImg || P.cardImg || null; P.srs = r.srs || P.srs || {};
    if (P.phone === undefined) P.phone = r.phone || null; P.phoneOff = !!r.phoneOff;
  }
  const [chat, notes] = await Promise.all([listChildren(P.id, "chat"), listChildren(P.id, "notes")]);
  if (S.paper !== P) return;
  if (chat.length && !S.chat.length) S.chat = chat.map(m => ({ role: m.role, content: m.content, at: m.at, saved: m.saved, _id: m._id, old: true }));
  P.notes = notes; P.hydrated = true;
  // the library card shows the right note and chat counts again; only the counts, so re-saving doesn't stamp
  // older content with a newer time (which would undo the other device's edits on the next sync)
  const nNotes = notes.length, nChat = S.chat.filter(m => m.content && !m.err).length;
  if (!r) persistPaper(P);
  else if (r.nNotes !== nNotes || r.nChat !== nChat) patchRec(P.id, { nNotes, nChat });
  render(); renderChat();
}
async function setTags(P, tags) {
  P.tags = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
  for (const t of P.tags) { const k = topicKey(t); if (D.col && !D.topics.has(k)) { const v = { kind: "topic", name: t, created: Date.now() }; D.topics.set(k, v); enqueue(k, () => D.col.doc(k).set(v)); } }
  persistPaper(P); renderTags();
}
function renderTags() {
  // on a paper the topics sit under its title (#phTags); the bar's #pTags stays for the other views' own use
  const P = S.paper, onPaper = !!P && ["background", "question", "figures", "card"].includes(S.view);
  const old = $("#pTags"); if (old && old.querySelector(".tchip, [data-act=addtag], .taginput")) old.innerHTML = "";
  const box = $("#phTags"); if (!box) return;
  if (!onPaper || P.demo) { box.innerHTML = ""; box.hidden = true; return; }
  box.hidden = false;
  const tags = P.tags || [];
  // typing a topic: a re-render (figure ready, sync, primer) must not rebuild the field under your fingers
  if (S.tagEdit && box.querySelector("#tagIn")) return;
  box.innerHTML = tags.map(t => `<span class="tchip">${esc(t)}<button type="button" data-untag="${esc(t)}" aria-label="Remove topic ${esc(t)}">×</button></span>`).join("") +
    (S.tagEdit ? `<span class="tagedit"><input class="taginput" id="tagIn" placeholder="Topic, then Enter" aria-label="Add topic" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"><span class="tagsug" id="tagSug" role="listbox" aria-label="Your topics"></span></span>`
      : `<button type="button" class="btn quiet addtag" data-act="addtag"><span aria-hidden="true">+</span> Topic</button>`) +
    (P.synced ? `<span class="pill p1" title="Synced copy from your PC">Synced copy</span>` : "");
  if (S.tagEdit) setTimeout(() => $("#tagIn")?.focus(), 0);
}
// your earlier topics that match what you type (instead of a <datalist>, which misbehaves in the iPad web view on the Mac)
function tagSuggest() {
  const inp = $("#tagIn"), box = $("#tagSug"); if (!inp || !box || !S.paper) return;
  const q = inp.value.trim().toLowerCase(), have = S.paper.tags || [];
  const list = allTopics().filter(t => !have.includes(t) && (!q || t.toLowerCase().includes(q))).sort((a, b) => (b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q)) || a.localeCompare(b)).slice(0, 6);
  box.innerHTML = list.map(t => `<button type="button" role="option" data-tagsug="${esc(t)}">${esc(t)}</button>`).join("");
}
document.addEventListener("input", e => { if (e.target.id === "tagIn") tagSuggest(); });
document.addEventListener("focusin", e => { if (e.target.id === "tagIn") tagSuggest(); });
// mousedown, so the field keeps focus (its focusout would close it first)
document.addEventListener("mousedown", e => { if (e.target.closest && e.target.closest("[data-tagsug]")) e.preventDefault(); });
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-tagsug]"); if (!b || !S.paper) return;
  S.tagEdit = false; setTags(S.paper, [...(S.paper.tags || []), b.dataset.tagsug]);
});
function notesBox(P, figN) {
  const list = (P.notes || []).filter(n => figN === null ? true : n.fig === figN);
  const pinOn = figN && S.pinned && S.pinned.fig === figN ? `${figN}${S.pinned.panel}` : "";
  const where = P.demo ? "example paper: not kept" : D.col ? "saved to your account" : "saved in this browser";
  return `<div class="box notesbox"><h3><span>${figN ? `Your notes on Figure ${figN}` : "Your notes on this paper"}</span>${list.length ? `<span class="c">${list.length}</span>` : ""}</h3>
    <div class="notes">${list.map(n => noteHTML(n, true)).join("") || `<p class="note" style="margin:0">Nothing yet. Write what you conclude, doubt or want to check. Chat answers you save land here too.</p>`}</div>
    <div class="note-add"><textarea id="noteIn" aria-label="Your note" placeholder="${pinOn ? `A note on panel ${esc(pinOn)}…` : figN ? `A note on Figure ${figN}…` : "A note on this paper…"}"></textarea>
      <div class="nrow"><span class="note"><span id="noteWhere">${figN ? `Saved with ${pinOn ? `panel ${esc(pinOn)}` : `Figure ${figN}`}` : "Saved with this paper"}</span> · ${where}</span><button class="btn" type="button" data-act="addnote" data-fig="${figN || ""}">${pinOn ? `Save note on ${esc(pinOn)}` : "Save note"}</button></div></div></div>`;
}
function noteHTML(n, canDel, paperTitle) {
  const where = [n.fig ? `Fig. ${n.fig}${n.panel || ""}` : "", n.kind === "saved" ? "from chat" : "", fmtDate(n.at)].filter(Boolean).join(" · ");
  return `<div class="note-item"><div class="nm"><span>${paperTitle ? esc(paperTitle) + " · " : ""}${esc(where)}</span>${canDel ? `<button type="button" class="linkbtn danger" data-delnote="${esc(n._id)}" style="font-size:12px">Delete</button>` : ""}</div>${n.q ? `<div class="q">${esc(n.q)}</div>` : ""}<div>${n.kind === "saved" ? md(n.text) : esc(n.text).replace(/\n/g, "<br>")}</div></div>`;
}

