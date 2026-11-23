"use strict";
/* ---------- feed: swipe through the best bits of your papers ----------
   Each paper becomes a handful of cards: figure panels with one line on what they show, key findings, open
   questions and quiz questions, plus the sentences you highlighted. Cards are made once per paper (one Claude
   call; figure cards need no Claude) and saved in the database (collection "pwfeed", so they are in the backup),
   so the feed works offline afterwards. A session is a short, mixed run of cards that ends with a summary.
   Tapping a card opens the paper at that spot; closing the reader or figure viewer comes back to the feed.
   What you linger on, save or wave away nudges what comes next; that is kept on this phone only. */

const FEED_COL = "pwfeed", FEED_VER = 1, FEED_SESSION = 20;
const FEED = { el: null, list: null, docs: new Map(), session: [], i: -1, t0: 0, imgs: new Map(), pdfs: new Map(), chain: Promise.resolve(), from: "",
  queue: [], busy: false, status: "", stop: false, stats: null, open: false };
// problems that stop preparing more cards for now (the paper stays in the queue)
const FEED_STOP = { bad_key: "Claude key not accepted: check it in Settings", offline: "Offline: new cards when you're back online", rate_limited: "Claude is busy: more cards later", overloaded: "Claude is busy: more cards later" };
const FEED_KINDS = { figure: "Figure", finding: "Finding", question: "Open question", quiz: "Quiz", highlight: "Your highlight" };

/* ---- preferences learned on this phone (types you linger on, papers you wave away, cards already seen) ---- */
function feedPrefs() {
  try { const p = JSON.parse(localStorage.getItem("pwfeed:prefs") || "null"); if (p) return p; } catch {}
  return { w: { figure: 1, finding: 1, question: 1, quiz: 1, highlight: 1 }, paper: {}, seen: {} };
}
function feedSavePrefs(p) {
  const cut = Date.now() - 60 * 864e5;                       // forget cards seen more than two months ago
  for (const [k, t] of Object.entries(p.seen)) if (t < cut) delete p.seen[k];
  try { localStorage.setItem("pwfeed:prefs", JSON.stringify(p)); } catch {}
}

/* ---- papers that can go into the feed ---- */
function feedPapers() {
  const out = [];
  for (const g of buildGroups()) {
    if (!g.file) continue;
    const r = recOf(g.id) || {};
    const au = (g.authors && g.authors.length ? g.authors : r.authors) || [];
    const first = au.length ? String(au[0]).trim().split(/\s+/).pop() : "";
    const yr = g.year || r.year || "";
    const label = first ? `${first}${au.length > 2 ? " et al." : au.length === 2 ? " & " + String(au[1]).trim().split(/\s+/).pop() : ""}${yr ? " " + yr : ""}` : (g.title || guessFromName(g.name).label).slice(0, 60);
    out.push({ g, id: g.id, title: g.title || guessFromName(g.name).label, label, rec: r, mtime: g.mtime });
  }
  return out;
}

/* ---- making a paper's cards ---- */
async function feedPrepare(pp) {
  const file = fileForGroup(pp.g); if (!file) return null;
  const raw = await pwPaperText(file);
  if (typeof pwIndexPaper === "function") { await ixLoad(); if (!IX.map.has(pp.id)) await pwIndexPaper(pp.id, raw); }
  const figs = (raw.figures || []).map(f => {
    const t = (typeof splitLegend === "function" ? splitLegend(f.legend || "").title : "") || (f.legend || "").replace(/^\s*(?:Figure|Fig\.?)\s*\d+\s*[.:|—–]?\s*/i, "").split(/(?<=\.)\s/)[0];
    return { n: f.n, title: t.replace(/[\s,;:]+$/, "").slice(0, 220), page: f.page, autoBox: f.autoBox || null, letters: f.letters || [] };
  });
  const doc = { v: FEED_VER, textVer: PW_TEXT_VER, updated: Date.now(), title: raw.title || pp.title, figs, cards: [], claude: false };
  // the paper's text was re-read with a newer reader (e.g. tighter figure boxes): keep Claude's cards, refresh the figures
  const old = FEED.docs.get(pp.id);
  if (old && old.v === FEED_VER && old.claude && old.textVer !== PW_TEXT_VER) { doc.cards = old.cards; doc.claude = true; }
  else if (S.sample && PW.online()) {
    try { doc.cards = await feedAsk(raw, figs); doc.claude = true; }
    catch (e) { if (e && FEED_STOP[e.code]) throw e; console.warn("feed cards failed", e && (e.code || e.message)); }
  }
  await PW.be.put(FEED_COL, pp.id, doc);
  FEED.docs.set(pp.id, doc);
  return doc;
}
async function feedAsk(raw, figs) {
  const sec = raw.sections || {};
  const take = (arr, n) => (arr || []).join("\n").slice(0, n);
  const legends = figs.map(f => `Figure ${f.n}${f.letters.length ? ` (panels ${f.letters.join(", ")})` : ""}: ${f.title}`).join("\n").slice(0, 2500);
  const prompt = `You turn a scientific paper into short cards for a feed a researcher swipes through on their phone, one card per screen. Be precise and plain; no hype, no emojis. Never state a number or claim that is not in the text below.
Reply with only JSON: {"cards": [ ... ]} with 6 to 9 cards of these kinds:
- {"kind":"finding","title":"at most 8 words","text":"1 or 2 sentences, at most 40 words: one key result, with its key number if there is one","quote":"8 to 14 consecutive words copied exactly from the paper where this is stated"}  (2 or 3 cards)
- {"kind":"figure","fig":<figure number>,"panel":"<one panel letter, or empty for the whole figure>","title":"at most 8 words","text":"one sentence: what to look at in this panel and what it shows"}  (1 to 3 cards, only figures listed below, choose the most telling panels)
- {"kind":"question","title":"at most 8 words","text":"1 or 2 sentences: an open question, surprise or limitation the paper raises","quote":"8 to 14 consecutive words copied exactly from the paper"}  (1 card)
- {"kind":"quiz","q":"a question about the main finding, method or preparation","a":"the answer in at most 20 words"}  (2 cards)

Title: ${raw.title || ""}
Abstract: ${(raw.abstract || "").slice(0, 2500)}
Introduction (start): ${take(sec.intro, 1500)}
Results: ${take(sec.results, 6500)}
Discussion: ${take(sec.discussion, 3000)}
Methods (start): ${take(sec.methods, 1000)}
Figures:
${legends}`;
  const j = await S.sample.json(prompt, { maxTokens: 2000, cache: { gcTime: 864e5 * 60 } });
  const nums = new Set(figs.map(f => f.n));
  return (j && Array.isArray(j.cards) ? j.cards : []).filter(c => c && FEED_KINDS[c.kind] && c.kind !== "highlight").map(c => ({
    kind: c.kind, title: String(c.title || "").slice(0, 90), text: String(c.text || "").slice(0, 400), quote: String(c.quote || "").slice(0, 160),
    fig: c.kind === "figure" ? +c.fig || null : null, panel: c.kind === "figure" ? String(c.panel || "").trim().toUpperCase().slice(0, 2) : "",
    q: String(c.q || "").slice(0, 240), a: String(c.a || "").slice(0, 240),
  })).filter(c => c.kind !== "figure" || nums.has(c.fig)).filter(c => c.kind === "quiz" ? c.q && c.a : c.text);
}

/* papers still without cards: unread and recently added first */
function feedQueue(papers) {
  const need = papers.filter(p => { const d = FEED.docs.get(p.id); return !d || d.v !== FEED_VER || (!d.claude && S.sample) || d.textVer !== PW_TEXT_VER; });
  const read = id => { const s = typeof rmLoad === "function" ? rmLoad(id) : null; return s && s.at ? s.at : 0; };
  return need.sort((a, b) => (read(a.id) > 0) - (read(b.id) > 0) || b.mtime - a.mtime);
}
async function feedWork(limit) {
  if (FEED.busy) return; FEED.busy = true; FEED.stop = false;
  let done = 0;
  try {
    while (FEED.queue.length && done < limit && !FEED.stop) {
      const pp = FEED.queue.shift();
      feedStatus(`Preparing cards · ${pp.label}`);
      try { await feedPrepare(pp); done++; }
      catch (e) { if (e && FEED_STOP[e.code]) { FEED.queue.unshift(pp); feedStatus(FEED_STOP[e.code]); FEED.stopped = FEED_STOP[e.code]; break; } console.warn(e); }
      if (FEED.open) feedTopUp();
    }
  } finally { FEED.busy = false; if (!FEED.stopped) feedStatus(FEED.queue.length ? `${FEED.queue.length} papers still to prepare` : ""); FEED.stopped = ""; }
}
function feedStatus(t) { FEED.status = t; const s = FEED.el && FEED.el.querySelector(".fd-status"); if (s) { s.textContent = t; s.hidden = !t; } }

/* ---- the card pool and a session ---- */
async function feedPool(papers) {
  const pool = [];
  for (const pp of papers) {
    const d = FEED.docs.get(pp.id); if (!d) continue;
    const det = (pp.rec && pp.rec.figs) || {};
    const claudeFigs = new Set(d.cards.filter(c => c.kind === "figure").map(c => c.fig));
    d.cards.forEach((c, k) => pool.push({ ...c, id: `${pp.id}#${k}`, pp }));
    // figure cards from the legends (no Claude needed) for figures Claude didn't pick
    for (const f of d.figs) if (!claudeFigs.has(f.n) && f.title) pool.push({ kind: "figure", fig: f.n, panel: "", title: `Figure ${f.n}`, text: f.title, id: `${pp.id}#f${f.n}`, pp, legendOnly: true, det: det[f.n] || null });
  }
  // your highlights, from every paper
  for (const pp of papers) {
    let marks = [];
    try { marks = await listChildren(pp.id, "marks"); } catch {}
    for (const m of marks) if (m.text) pool.push({ kind: "highlight", text: m.text.replace(/\s*refs(?=[\s.,;:)]|$)/g, ""), quote: m.text, color: m.color, id: `${pp.id}#m${m._id}`, pp });
  }
  return pool;
}
function feedPick(pool, n) {
  const P = feedPrefs(), now = Date.now(), out = [], per = new Map();
  const read = id => { const s = typeof rmLoad === "function" ? rmLoad(id) : null; return s && s.at ? s.at : 0; };
  const fresh = pool.filter(c => !P.seen[c.id] || now - P.seen[c.id] > (c.kind === "quiz" || c.kind === "highlight" ? 5 : 21) * 864e5);
  const score = c => (P.w[c.kind] || 1) * (P.paper[c.pp.id] || 1) * (read(c.pp.id) ? 1 : 1.4) * (now - c.pp.mtime < 30 * 864e5 ? 1.25 : 1)
    * (c.legendOnly ? .55 : 1) * (.55 + Math.random());
  const cand = fresh.map(c => ({ c, s: score(c) })).sort((a, b) => b.s - a.s);
  while (out.length < n && cand.length) {
    const last = out[out.length - 1], prev = out[out.length - 2];
    let k = cand.findIndex(({ c }) => (!last || c.pp.id !== last.pp.id) && (per.get(c.pp.id) || 0) < 3 && !(last && prev && last.kind === c.kind && prev.kind === c.kind));
    if (k < 0) k = cand.findIndex(({ c }) => !last || c.pp.id !== last.pp.id);
    if (k < 0) break;
    const { c } = cand.splice(k, 1)[0];
    out.push(c); per.set(c.pp.id, (per.get(c.pp.id) || 0) + 1);
  }
  return out;
}

/* ---- the screen ---- */
function feedBuild() {
  const el = document.createElement("div");
  el.className = "fd"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Feed");
  el.innerHTML = `<div class="fd-top"><button type="button" class="fd-x" data-f="close" aria-label="Close the feed">✕</button><span class="fd-count" id="fdCount"></span><span class="fd-status" hidden></span></div>
    <div class="fd-list" id="fdList"></div>`;
  document.body.appendChild(el);
  FEED.el = el; FEED.list = el.querySelector("#fdList");
  el.addEventListener("click", e => {
    e.stopPropagation();
    const b = e.target.closest("[data-f]");
    if (!b) {                                          // double-tap a card to save it
      const card = e.target.closest(".fd-card"); if (!card) return;
      const now = Date.now();
      if (FEED.lastTap && now - FEED.lastTap.t < 320 && FEED.lastTap.i === +card.dataset.i) { feedSave(+card.dataset.i); FEED.lastTap = null; }
      else FEED.lastTap = { t: now, i: +card.dataset.i };
      return;
    }
    const f = b.dataset.f, i = +(b.closest(".fd-card")?.dataset.i ?? -1);
    if (f === "close") feedClose();
    else if (f === "open") feedOpenAt(i);
    else if (f === "save") feedSave(i);
    else if (f === "less") feedLess(i);
    else if (f === "reveal") { b.closest(".fd-card").classList.add("shown"); }
    else if (f === "again") feedStart();
    else if (f === "prep") { FEED.queue = feedQueue(feedPapers()); feedWork(1e9); }
    else if (f === "read") { const pp = FEED.session.find(c => c.pp.id === b.dataset.id)?.pp; if (pp) feedOpenPaper(pp, null); }
  });
  let raf = 0;
  FEED.list.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(feedOnScroll); }, { passive: true });
}
async function feedOpen() {
  if (!FEED.el) feedBuild();
  if (!FEED.open) FEED.from = S.view;
  FEED.open = true; FEED.el.hidden = false; document.documentElement.classList.add("fd-on");
  if (typeof PWZoomLock !== "undefined") PWZoomLock.set(true);
  if (FEED.session.length && FEED.i >= 0 && FEED.i <= FEED.session.length) { feedShowAgain(); return; }
  await feedStart();
}
async function feedStart() {
  FEED.list.innerHTML = `<section class="fd-card fd-loading"><div class="fd-body"><div class="fd-kind">Feed</div><h3>Getting your cards ready…</h3><p class="fd-sub">The first time, each paper is read and turned into a few cards. That takes a little while; after that the feed opens instantly and works offline.</p></div></section>`;
  for (const { id, data } of await PW.be.all(FEED_COL).catch(() => [])) FEED.docs.set(id, data);
  const papers = feedPapers();
  if (!papers.length) { FEED.list.innerHTML = `<section class="fd-card"><div class="fd-body"><h3>No papers yet</h3><p class="fd-sub">Choose your Papers folder in the library first.</p></div></section>`; return; }
  FEED.queue = feedQueue(papers);
  // enough cards to start with? if not, prepare a few papers first
  let pool = await feedPool(papers);
  if (feedPick(pool, FEED_SESSION).length < 8 && FEED.queue.length) { await feedWork(3); pool = await feedPool(papers); }
  FEED.session = feedPick(pool, FEED_SESSION);
  FEED.stats = { seen: new Set(), saved: 0, dwell: new Map() };
  feedRender();
  feedWork(6);                                        // keep preparing a few more in the background
}
function feedTopUp() { /* new cards become part of the next session; nothing to do mid-session */ }

function feedCardHTML(c, i) {
  const k = FEED_KINDS[c.kind] || "";
  const meta = `<div class="fd-meta"><span class="fd-kind k-${c.kind}">${esc(c.kind === "figure" ? `Figure ${c.fig}${c.panel ? c.panel : ""}` : k)}</span><span class="fd-paper">${esc(c.pp.label)}</span></div>`;
  const acts = `<div class="fd-acts"><button type="button" class="fd-b primary" data-f="open">${c.kind === "figure" ? "Open figure" : "Open in paper"}</button><button type="button" class="fd-b" data-f="save" aria-label="Save to notes">♡ Save</button><button type="button" class="fd-b ghost" data-f="less">Less like this</button></div>`;
  const ptitle = `<p class="fd-ptitle">${esc(c.pp.title)}</p>`;
  let body = "";
  if (c.kind === "figure") body = `<div class="fd-img" data-img="${i}"><span class="fd-wait">Drawing figure…</span></div>${c.legendOnly ? "" : `<h3>${esc(c.title)}</h3>`}<p class="fd-text${c.legendOnly ? " legend" : ""}">${esc(c.text)}</p>`;
  else if (c.kind === "quiz") body = `<h3 class="fd-q">${esc(c.q)}</h3><button type="button" class="fd-b fd-reveal" data-f="reveal">Show the answer</button><p class="fd-a">${esc(c.a)}</p>`;
  else if (c.kind === "highlight") body = `<blockquote class="fd-quote c-${esc(c.color || "y")}">${esc(c.text)}</blockquote>`;
  else body = `<h3>${esc(c.title)}</h3><p class="fd-text big">${esc(c.text)}</p>`;
  return `<section class="fd-card k-${c.kind}" data-i="${i}"><div class="fd-body">${meta}${body}${ptitle}</div>${acts}</section>`;
}
function feedRender() {
  const s = FEED.session;
  if (!s.length) {
    FEED.list.innerHTML = `<section class="fd-card"><div class="fd-body"><div class="fd-kind">Feed</div><h3>Nothing new right now</h3><p class="fd-sub">${S.sample ? "You've seen the cards prepared so far." : "Add your Claude API key in Settings for findings, questions and quizzes; without it the feed only has figures and your highlights."}</p>${FEED.queue.length ? `<button type="button" class="fd-b primary" data-f="prep">Prepare cards for ${FEED.queue.length} more papers</button>` : ""}</div></section>`;
    return;
  }
  FEED.list.innerHTML = s.map(feedCardHTML).join("") + `<section class="fd-card fd-end" data-i="${s.length}"><div class="fd-body" id="fdEnd"></div></section>`;
  FEED.list.scrollTop = 0; FEED.i = -1; feedOnScroll();
}
function feedShowAgain() { feedOnScroll(true); }

function feedOnScroll(force) {
  const h = FEED.list.clientHeight || 1, i = Math.round(FEED.list.scrollTop / h);
  if (i === FEED.i && !force) return;
  // time spent on the card we leave tells what you find interesting
  const prev = FEED.session[FEED.i];
  if (prev && FEED.t0) {
    const dt = (Date.now() - FEED.t0) / 1000, P = feedPrefs();
    FEED.stats.dwell.set(prev.pp.id, (FEED.stats.dwell.get(prev.pp.id) || 0) + dt);
    const w = P.w[prev.kind] || 1;
    P.w[prev.kind] = Math.min(2, Math.max(.4, dt > 8 ? w * 1.04 : dt < 1.5 ? w * .97 : w));
    P.seen[prev.id] = Date.now(); feedSavePrefs(P);
  }
  FEED.i = i; FEED.t0 = Date.now();
  const n = FEED.session.length;
  const cnt = FEED.el.querySelector("#fdCount"); if (cnt) cnt.textContent = i < n ? `${i + 1} / ${n}` : "Done";
  if (FEED.session[i]) FEED.stats.seen.add(FEED.session[i].pp.id);
  if (i >= n) feedEnd();
  // figure images: the card in view and its neighbours only (a phone can't hold twenty large images)
  for (const [k, url] of FEED.imgs) if (Math.abs(k - i) > 1) { const box = FEED.list.querySelector(`[data-img="${k}"]`); if (box) box.innerHTML = `<span class="fd-wait">Drawing figure…</span>`; FEED.imgs.delete(k); }
  FEED.chain = FEED.chain.then(async () => { for (const k of [FEED.i, FEED.i + 1, FEED.i - 1]) await feedImage(k); }).catch(() => {});   // one render at a time
}

/* ---- figure images, drawn from the PDF (one open PDF at a time) ---- */
async function feedDocFor(pp) {
  if (FEED.pdfs.has(pp.id)) { const d = FEED.pdfs.get(pp.id); FEED.pdfs.delete(pp.id); FEED.pdfs.set(pp.id, d); return d; }
  const file = fileForGroup(pp.g); if (!file) return null;
  const d = await pwLoadDoc(file);
  FEED.pdfs.set(pp.id, d);
  while (FEED.pdfs.size > 3) { const [k, old] = FEED.pdfs.entries().next().value; FEED.pdfs.delete(k); try { old.destroy(); } catch {} }
  return d;
}
function feedDropPdfs() { for (const d of FEED.pdfs.values()) { try { d.destroy(); } catch {} } FEED.pdfs.clear(); }
async function feedImage(i) {
  const c = FEED.session[i]; if (!c || c.kind !== "figure" || FEED.imgs.has(i) || Math.abs(i - FEED.i) > 1) return;
  FEED.imgs.set(i, "…");
  try {
    const d = FEED.docs.get(c.pp.id), f = d && d.figs.find(x => x.n === c.fig); if (!f) throw new Error("no figure");
    const det = c.det || (c.pp.rec && c.pp.rec.figs && c.pp.rec.figs[c.fig]) || null;
    let page = (det && det.page) || f.page, box = (det && det.box) || f.autoBox || { x: 0, y: 0, w: 1, h: 1 };
    const pan = c.panel && det && (det.panels || []).find(p => p.label === c.panel);
    if (pan) box = { x: box.x + pan.x * box.w, y: box.y + pan.y * box.h, w: pan.w * box.w, h: pan.h * box.h };
    const doc = await feedDocFor(c.pp); if (!doc) throw new Error("no file");
    const pg = await doc.getPage(page), v1 = pg.getViewport({ scale: 1 });
    const rw = box.w * v1.width, rh = box.h * v1.height, longSide = Math.min(1400, Math.round(Math.max(innerWidth, innerHeight) * (devicePixelRatio || 2)));
    const scale = Math.min(longSide / Math.max(rw, rh), 6);
    const cv = document.createElement("canvas"); cv.width = Math.max(20, Math.round(rw * scale)); cv.height = Math.max(20, Math.round(rh * scale));
    const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: pg.getViewport({ scale, offsetX: -box.x * v1.width * scale, offsetY: -box.y * v1.height * scale }) }).promise;
    try { pg.cleanup(); } catch {}
    const url = cv.toDataURL("image/jpeg", .86); cv.width = cv.height = 0;
    if (!FEED.imgs.has(i)) return;                    // scrolled away meanwhile
    FEED.imgs.set(i, url);
    const holder = FEED.list.querySelector(`[data-img="${i}"]`);
    if (holder) holder.innerHTML = `<img src="${url}" alt="Figure ${c.fig}${c.panel || ""}">${c.panel && !pan ? `<span class="fd-hint">Panel ${esc(c.panel)}</span>` : ""}`;
  } catch (e) {
    FEED.imgs.delete(i);
    const holder = FEED.list.querySelector(`[data-img="${i}"]`); if (holder) holder.innerHTML = `<span class="fd-wait">Figure not available offline</span>`;
  }
}

/* ---- actions ---- */
async function feedSave(i) {
  const c = FEED.session[i]; if (!c) return;
  const text = c.kind === "quiz" ? `Q: ${c.q}\nA: ${c.a}` : c.kind === "highlight" ? `“${c.text}”` : `${c.title ? c.title + ": " : ""}${c.text}`;
  try {
    await addChild({ id: c.pp.id, demo: false }, "notes", { kind: "saved", text: text + "\n\n(from the feed)", fig: c.fig || null, panel: c.panel || null });
    FEED.stats.saved++;
    const P = feedPrefs(); P.w[c.kind] = Math.min(2, (P.w[c.kind] || 1) * 1.08); P.paper[c.pp.id] = Math.min(2, (P.paper[c.pp.id] || 1) * 1.1); feedSavePrefs(P);
    const b = FEED.list.querySelector(`.fd-card[data-i="${i}"] [data-f="save"]`); if (b) { b.textContent = "♥ Saved"; b.classList.add("on"); }
    toast("Saved to the paper's notes");
  } catch { toast("Couldn't save."); }
}
function feedLess(i) {
  const c = FEED.session[i]; if (!c) return;
  const P = feedPrefs(); P.w[c.kind] = Math.max(.4, (P.w[c.kind] || 1) * .85); P.paper[c.pp.id] = Math.max(.2, (P.paper[c.pp.id] || 1) * .5); P.seen[c.id] = Date.now(); feedSavePrefs(P);
  toast("Fewer cards like this");
  FEED.list.scrollTo({ top: (i + 1) * FEED.list.clientHeight, behavior: "smooth" });
}
function feedEnd() {
  const box = FEED.el.querySelector("#fdEnd"); if (!box || !FEED.stats) return;
  const top = [...FEED.stats.dwell.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, t]) => t > 6);
  const ppOf = id => FEED.session.find(c => c.pp.id === id)?.pp;
  box.innerHTML = `<div class="fd-kind">Session done</div><h3>${FEED.stats.seen.size} paper${FEED.stats.seen.size === 1 ? "" : "s"} · ${FEED.session.length} cards${FEED.stats.saved ? ` · ${FEED.stats.saved} saved` : ""}</h3>
    ${top.length ? `<p class="fd-sub">Worth reading in full, by the time you spent on them:</p>${top.map(([id]) => { const pp = ppOf(id); return pp ? `<button type="button" class="fd-row" data-f="read" data-id="${esc(id)}"><strong>${esc(pp.label)}</strong><span>${esc(pp.title)}</span></button>` : ""; }).join("")}` : ""}
    <div class="fd-acts end"><button type="button" class="fd-b primary" data-f="again">Another round</button><button type="button" class="fd-b" data-f="close">Back to the library</button></div>
    ${FEED.queue.length ? `<p class="fd-sub small">${FEED.queue.length} papers don't have cards yet.${FEED.busy ? " Preparing them now…" : ""}</p>${FEED.busy ? "" : `<button type="button" class="fd-b ghost" data-f="prep">Prepare cards for all of them</button>`}` : ""}`;
}

/* ---- into the paper and back ---- */
function feedHide() { FEED.el.hidden = true; document.documentElement.classList.remove("fd-on"); }
function feedClose() {
  FEED.open = false; feedHide();
  if (typeof PWZoomLock !== "undefined") PWZoomLock.set(false);
  feedDropPdfs(); FEED.imgs.clear();
  if (FEED.i >= FEED.session.length) FEED.session = [];   // finished: a fresh session next time
  if (FEED.from === "library" && S.view !== "library") { S.view = "library"; render(); window.scrollTo(0, 0); }
}
function feedBack() { if (!FEED.open) return; FEED.el.hidden = false; document.documentElement.classList.add("fd-on"); if (typeof PWZoomLock !== "undefined") PWZoomLock.set(true); feedOnScroll(true); }
async function feedOpenPaper(pp, then) {
  const file = fileForGroup(pp.g); if (!file) { toast("This paper isn't in your Papers folder."); return; }
  feedDropPdfs(); FEED.imgs.clear();
  feedHide();
  if (!S.paper || S.paper.id !== pp.id) await handleFile(file, pp.id);
  if (!S.paper || S.paper.id !== pp.id) { feedBack(); return; }
  if (then) await then(S.paper);
  else { await rmOpen(); RM.onClose = feedBack; }
}
async function feedOpenAt(i) {
  const c = FEED.session[i]; if (!c) return;
  await feedOpenPaper(c.pp, async P => {
    if (c.kind === "figure") {
      const f = P.figures.find(x => x.n === c.fig);
      if (f) { fvOpenFig(f, c.panel || null, feedBack); return; }
    }
    await rmOpen(); RM.onClose = feedBack;
    const q = (c.quote || "").trim();
    if (q && typeof rmFind === "function") {
      // find the quoted words (or their first part) and go to that page
      for (const probe of [q, q.split(/\s+/).slice(0, 6).join(" ")]) {
        const el = [...RM.flow.querySelectorAll("p")].find(p => p.textContent.toLowerCase().includes(probe.toLowerCase()));
        if (!el) continue;
        const at = el.textContent.toLowerCase().indexOf(probe.toLowerCase());
        const r = rmTextRange(el, at, at + probe.length); if (!r) continue;
        const rect = r.getClientRects()[0] || r.getBoundingClientRect();
        rmGo(Math.max(0, Math.floor((rect.left - RM.flow.getBoundingClientRect().left) / RM.step)), true); rmSave();
        rmFlash(rmWrap(el, at, at + probe.length, () => { const m = document.createElement("mark"); m.className = "rdm-found"; return m; }));
        break;
      }
    }
  });
}
