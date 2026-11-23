"use strict";
/* ---------- saved work (db, with local fallback) ---------- */
const D = { col: null, ready: false, recs: new Map(), topics: new Map(), chain: new Map(), tm: new Map() };
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
    for (const d of snap.docs) { const v = d.data(); if (!v) continue; if (v.kind === "topic") D.topics.set(d.id, v); else if (v.kind === "paper") D.recs.set(d.id, v); else if (v.kind === "palace") D.palace = v; }
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
  return { kind: "paper", id: P.id, name: P.fileName || it.name || P.id.split(":")[0], title: P.title, year: it.year || null, folder: it.folder || "", authors: it.authors || recOf(P.id)?.authors || [],
    primer: P.primer || null, briefs: P.briefs || {}, figs: Object.fromEntries(P.figures.map(f => [f.n, f.det || null])), restate: P.restate || "", verdict: P.verdict || null,
    revealed: !!P.revealed, seen: [...(P.seen || [])], nfig: P.figures.length, lastOpened: P.lastOpened || Date.now(), tags: P.tags || [],
    // until the notes and chat have loaded (hydrate), keep the counts already saved instead of writing zeros
    nNotes: P.hydrated ? (P.notes || []).length : (recOf(P.id)?.nNotes || 0),
    nChat: P.hydrated ? S.chat.filter(m => m.content && !m.err).length : (recOf(P.id)?.nChat || 0), updated: Date.now(),
    card: P.card || null, cardImg: P.cardImg || null, srs: P.srs || recOf(P.id)?.srs || {},
    phone: P.phone !== undefined ? P.phone : (recOf(P.id)?.phone || null), phoneOff: !!P.phoneOff };
}
function persistPaper(P) {
  if (!P || P.demo) return;
  const rec = recordFor(P);
  const { kind, ...local } = rec; if (D.col) delete local.cardImg; store.set("pw:" + P.id, local);
  if (!D.col) return;
  const key = keyOf(P.id); D.recs.set(key, rec);
  clearTimeout(D.tm.get(key));
  D.tm.set(key, setTimeout(() => enqueue(key, () => D.col.doc(key).set(rec)), 700));
}
async function addChild(P, sub, obj) {
  obj.at = Date.now();
  if (P.demo) { obj._id = "d" + obj.at + Math.random(); return obj; }
  if (D.col) {
    const ref = D.col.doc(keyOf(P.id)).collection(sub).doc(); obj._id = ref.id;
    const { _id, ...body } = obj; enqueue(keyOf(P.id) + "/" + sub, () => ref.set(body));
  } else { const k = "pw:" + P.id + ":" + sub; const a = store.get(k) || []; obj._id = "l" + obj.at; a.push(obj); store.set(k, a.slice(-400)); }
  return obj;
}
async function delChild(P, sub, id) {
  if (P.demo) return;
  if (D.col) enqueue(keyOf(P.id) + "/" + sub, () => D.col.doc(keyOf(P.id)).collection(sub).doc(id).delete());
  else { const k = "pw:" + P.id + ":" + sub; store.set(k, (store.get(k) || []).filter(x => x._id !== id)); }
}
async function listChildren(id, sub) {
  if (D.col) { try { const sn = await D.col.doc(keyOf(id)).collection(sub).orderBy("at").limit(500).get(); return sn.docs.map(d => ({ ...d.data(), _id: d.id })); } catch (e) { console.warn(e); return []; } }
  return store.get("pw:" + id + ":" + sub) || [];
}
async function hydrate(P) {
  const r = D.recs.get(keyOf(P.id));
  if (r) {
    P.primer = P.primer || r.primer; P.briefs = { ...(r.briefs || {}), ...(P.briefs || {}) }; P.restate = P.restate || r.restate; P.verdict = P.verdict || r.verdict;
    P.revealed = P.revealed || r.revealed; P.tags = r.tags || P.tags || []; (r.seen || []).forEach(n => P.seen.add(n));
    P.figures.forEach(f => { if (!f.det && r.figs && r.figs[f.n]) f.det = r.figs[f.n]; });
    P.card = P.card || r.card || null; P.cardImg = P.cardImg || r.cardImg || null; P.srs = r.srs || P.srs || {};
    if (P.phone === undefined) P.phone = r.phone || null; P.phoneOff = !!r.phoneOff;
  }
  const [chat, notes] = await Promise.all([listChildren(P.id, "chat"), listChildren(P.id, "notes")]);
  if (S.paper !== P) return;
  if (chat.length && !S.chat.length) S.chat = chat.map(m => ({ role: m.role, content: m.content, at: m.at, saved: m.saved, _id: m._id, old: true }));
  P.notes = notes; P.hydrated = true;
  persistPaper(P);                                   // the library card shows the right note and chat counts again
  render(); renderChat();
}
async function setTags(P, tags) {
  P.tags = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
  for (const t of P.tags) { const k = topicKey(t); if (D.col && !D.topics.has(k)) { const v = { kind: "topic", name: t, created: Date.now() }; D.topics.set(k, v); enqueue(k, () => D.col.doc(k).set(v)); } }
  persistPaper(P); renderTags();
}
function renderTags() {
  const P = S.paper, box = $("#pTags");
  if (!P || P.demo || ["library", "topic", "record", "review", "palace"].includes(S.view)) { box.innerHTML = ""; return; }
  const tags = P.tags || [];
  box.innerHTML = tags.map(t => `<span class="tchip">${esc(t)}<button type="button" data-untag="${esc(t)}" aria-label="Remove topic ${esc(t)}">×</button></span>`).join("") +
    (S.tagEdit ? `<input class="taginput" id="tagIn" list="tagList" placeholder="Topic, then Enter" aria-label="Add topic"><datalist id="tagList">${allTopics().filter(t => !tags.includes(t)).map(t => `<option value="${esc(t)}">`).join("")}</datalist>`
      : `<button type="button" class="linkbtn" data-act="addtag" style="font-size:12px">+ topic</button>`) +
    (P.synced ? `<span class="pill p1" title="Synced copy from your PC">Synced copy</span>`
      : A.api && P.doc ? (P.syncing ? `<span class="pill">Syncing to phone…</span>` : P.syncErr ? `<button type="button" class="pill" data-act="phonetoggle" title="Retry">${esc(P.syncErr)}</button>` : P.phoneOff ? `<button type="button" class="linkbtn" data-act="phonetoggle" style="font-size:12px">Not on phone · sync</button>` : P.phone?.bundle ? `<button type="button" class="pill p3" data-act="phonetoggle" title="Click to remove from phone">On phone ✓</button>` : "") : "");
  if (S.tagEdit) setTimeout(() => $("#tagIn")?.focus(), 0);
}
function notesBox(P, figN) {
  const list = (P.notes || []).filter(n => figN === null ? true : n.fig === figN);
  const pinTxt = figN && S.pinned && S.pinned.fig === figN ? ` on ${figN}${S.pinned.panel}` : "";
  return `<div class="box"><h3><span>${figN ? `Your notes on Figure ${figN}` : "Your notes on this paper"}</span><span class="savebadge">${P.demo ? "example paper: not saved" : D.col ? "saved to your account" : "saved in this browser"}</span></h3>
    <div class="notes">${list.map(n => noteHTML(n, true)).join("") || `<p class="note" style="margin:0">Nothing yet. Write what you conclude, doubt or want to check. Chat answers you save land here too.</p>`}
    <div class="note-add"><textarea id="noteIn" placeholder="Your note${esc(pinTxt)}…"></textarea><div><button class="btn" type="button" data-act="addnote" data-fig="${figN || ""}">Save note${esc(pinTxt)}</button></div></div></div></div>`;
}
function noteHTML(n, canDel, paperTitle) {
  const where = [n.fig ? `Fig. ${n.fig}${n.panel || ""}` : "", n.kind === "saved" ? "from chat" : "", fmtDate(n.at)].filter(Boolean).join(" · ");
  return `<div class="note-item"><div class="nm"><span>${paperTitle ? esc(paperTitle) + " · " : ""}${esc(where)}</span>${canDel ? `<button type="button" class="linkbtn" data-delnote="${esc(n._id)}" style="font-size:12px">Delete</button>` : ""}</div>${n.q ? `<div class="q">${esc(n.q)}</div>` : ""}<div>${n.kind === "saved" ? md(n.text) : esc(n.text).replace(/\n/g, "<br>")}</div></div>`;
}

