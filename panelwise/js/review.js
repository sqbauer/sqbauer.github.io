"use strict";
/* ----- review (spaced retrieval) ----- */
const DAY = 864e5;
function reviewTypes(card, img) { const t = []; if (img) t.push("fig"); t.push("who", "lab"); if (card.caveat) t.push("caveat"); return t; }
function processedRecs() { return allRecs().filter(r => r.card && r.card.finding); }
// a paper's cards: the first (r.card, its schedule under srs[type]) and any more (r.cards, under srs["c<at>:type"])
function cardsOfRec(r) {
  const out = r.card && r.card.finding ? [{ card: r.card, img: r.cardImg, pre: "" }] : [];
  for (const x of r.cards || []) if (x && x.finding && x.at) out.push({ card: x, img: x.img || null, pre: "c" + x.at + ":" });
  return out;
}
function reviewItems() {
  const out = [];
  for (const r of processedRecs()) for (const cd of cardsOfRec(r)) {
    const rr = cd.pre ? { ...r, card: cd.card, cardImg: cd.img } : r;   // the review screens read .card and .cardImg
    for (const t of reviewTypes(cd.card, cd.img)) out.push({ r: rr, t, key: cd.pre + t, s: (r.srs || {})[cd.pre + t] || { due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0 } });
  }
  return out;
}
const dueItems = () => reviewItems().filter(i => i.s.due <= Date.now());
function interleave(items) {
  const a = [...items].sort(() => Math.random() - .5), out = [];
  while (a.length) { const last = out[out.length - 1]; let k = a.findIndex(x => !last || x.r.id !== last.r.id); if (k < 0) k = 0; out.push(a.splice(k, 1)[0]); }
  return out;
}
// the library's review card: what's due, about how long it takes, and one button; the memory palace as a quiet link
function reviewBanner({ primary = false } = {}) {
  const n = processedRecs().length; if (!n) return "";
  const d = dueItems().length, papers = new Set(dueItems().map(i => i.r.id)).size;
  const mins = Math.max(1, Math.round(d * 30 / 60));   // about 30 seconds a card
  const pts = pal().pts - pal().spent;
  return `<article class="card lrev" aria-label="Review">
    <div class="lrev-t"><b>${d ? `${d} review card${d === 1 ? "" : "s"} due` : "Review: all caught up"}</b><span class="note">${d ? `From ${papers} paper${papers === 1 ? "" : "s"} · about ${mins} min` : `${n} processed paper${n === 1 ? "" : "s"} · practise any time`}</span></div>
    <div class="lrev-a"><button class="btn ${primary && d ? "primary" : ""}" type="button" data-act="review">${d ? "Review" : "Open review"}</button><button class="btn quiet" type="button" data-act="palace">Memory palace${pts ? ` · ${pts} pts` : ""}</button></div>
  </article>`;
}
function schedule(s, g) {
  s = { ...s };
  if (g === 1) { s.lapses = (s.lapses || 0) + 1; s.reps = 0; s.ease = Math.max(1.3, s.ease - .2); s.ivl = 0; s.due = Date.now() + 10 * 60e3; return s; }
  if (g === 2) { s.ivl = Math.max(1, Math.round((s.ivl || 1) * 1.2)); s.ease = Math.max(1.3, s.ease - .15); }
  if (g === 3) s.ivl = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.ivl * s.ease);
  if (g === 4) { s.ivl = s.reps === 0 ? 3 : Math.round(Math.max(1, s.ivl) * s.ease * 1.3); s.ease += .15; }
  s.reps = (s.reps || 0) + 1; s.due = Date.now() + s.ivl * DAY; return s;
}
const ivlLabel = (s, g) => { const n = schedule(s, g); return g === 1 ? "10 min" : n.ivl === 1 ? "1 day" : n.ivl < 30 ? n.ivl + " days" : Math.round(n.ivl / 30) + " mo"; };
function patchRec(id, patch) {
  const key = keyOf(id), cur = recOf(id) || {};
  const r = { ...cur, ...patch, kind: "paper", id };
  if (D.col) { D.recs.set(key, r); enqueue(key, () => D.col.doc(key).update(patch)); }
  const { kind, ...loc } = r; if (D.col) delete loc.cardImg; store.set("pw:" + id, loc);
  if (S.paper && S.paper.id === id) Object.assign(S.paper, patch);
}
function startReview(practice) {
  let q = practice ? interleave(reviewItems()).slice(0, 12) : interleave(dueItems());
  S.rv = { q, i: 0, shown: false, done: 0, practice, total: q.length };
  S.view = "review"; render(); window.scrollTo(0, 0);
}
function cueFor(it) {
  const c = it.r.card, title = esc(it.r.title);
  if (it.t === "fig") return { type: "Key panel", q: "What does this show, and what did the authors conclude? Whose paper is it?", cue: `<div class="rvimg"><img src="${it.r.cardImg}" alt="Key panel, legend hidden"></div>` };
  if (it.t === "who") return { type: "Who found this", q: "Which lab, which year, which paper?", cue: `<div class="rvcue">${esc(c.finding)}</div>${c.prep ? `<div class="note">${esc(c.prep)}</div>` : ""}` };
  if (it.t === "lab") return { type: "Lab → finding", q: `What did the ${esc(c.lab)} lab show here?`, cue: `<div class="rvcue"><strong>${esc(c.lab)}</strong>${c.year ? ` · ${esc(c.year)}` : ""}</div><div class="note">${title}</div>` };
  return { type: "Caveat", q: "What's the main caveat or missing control?", cue: `<div class="rvcue">${title}</div><div class="note">${esc(c.finding)}</div>` };
}
function labsOverview() {
  const labs = new Map();
  for (const r of processedRecs()) { const k = r.card.lab.trim(); if (!labs.has(k)) labs.set(k, []); labs.get(k).push(r); }
  const list = [...labs.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return `<div class="box"><h3><span>Labs you know</span><span class="mono" style="text-transform:none;letter-spacing:0">${list.length}</span></h3><div class="labs">${list.map(([lab, rs]) =>
    `<div><div class="lb">${esc(lab)}</div><ul>${rs.sort((a, b) => (b.card.year || 0) - (a.card.year || 0)).map(r => `<li>${esc(r.card.year || "")} ${esc(r.card.finding)}</li>`).join("")}</ul></div>`).join("") || `<p class="note" style="margin:0">None yet.</p>`}</div></div>`;
}
function renderReview() {
  $("#pTitle").textContent = "Review"; $("#pSub").textContent = `${processedRecs().length} processed papers`;
  const R = S.rv, m = $("#main");
  const head = `<button class="linkbtn" type="button" data-act="tolib">← Library</button><div class="eyebrow" style="margin-top:12px">Spaced review</div><h2>Recall first, then look</h2>`;
  if (!processedRecs().length) {
    m.innerHTML = `<section class="view" style="max-width:980px">${head}<div class="card" style="margin-top:18px"><h3>Nothing to review yet</h3><p class="note">Review only uses papers you've processed. Open a paper, work through it, and write <strong>Your card</strong> in step 4: lab, finding, caveat and key panel. Then it shows up here.</p></div></section>`;
    return;
  }
  if (!R || R.i >= R.q.length) {
    const next = reviewItems().map(i => i.s.due).filter(d => d > Date.now()).sort((a, b) => a - b)[0];
    m.innerHTML = `<section class="view" style="max-width:1100px">${head}<div class="rvwrap"><div class="rvcard" style="min-height:0">
      <div class="rvq">${R && R.total ? `Done: ${R.done} card${R.done === 1 ? "" : "s"} reviewed.` : "All caught up."}${R && R.earned ? ` <span class="ptsfx">+${R.earned} pts</span>` : ""}</div>
      ${R && R.earned && canAffordAny() ? `<div class="duebanner" style="margin:0"><span>You can unlock a new room.</span><button class="btn primary" type="button" data-act="palace">Go to the palace</button></div>` : ""}
      <p class="note" style="margin:0">${dueItems().length ? `${dueItems().length} still due.` : next ? `Next card is due ${new Date(next).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""} Short daily sessions work better than long occasional ones.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${dueItems().length ? `<button class="btn primary" type="button" data-act="review">Review ${dueItems().length} due</button>` : ""}<button class="btn" type="button" data-act="practice">Practice 12 random cards</button></div>
    </div>${labsOverview()}</div></section>`;
    return;
  }
  const it = R.q[R.i], cu = cueFor(it), c = it.r.card;
  const ans = `<div class="rvans">
      ${R.typed ? `<div class="note">Your answer: <span style="color:var(--ink)">${esc(R.typed)}</span></div>` : ""}
      ${onelinerHTML(c)}
      <div class="note">${esc(it.r.title)}${it.r.authors?.length ? ` · ${esc(shortAuthors(it.r.authors))}` : ""}${c.fig ? ` · key panel Fig. ${esc(c.fig)}${esc(c.panel || "")}` : ""}</div>
      ${whereIs(it.r.id) ? `<div class="note">Lives in: <strong style="color:var(--ink)">${esc(whereIs(it.r.id))}</strong></div>` : ""}
      ${it.t !== "fig" && it.r.cardImg ? `<div class="rvimg"><img src="${it.r.cardImg}" alt="Key panel" style="max-height:220px"></div>` : ""}
      <div class="grades">${[[1, "Again"], [2, "Hard"], [3, "Good"], [4, "Easy"]].map(([g, l]) => `<button type="button" class="grade g${g}" data-grade="${g}">${l}<span>${R.practice ? "" : ivlLabel(it.s, g)}</span></button>`).join("")}</div>
      <div class="note">Keys: 1–4 to grade.</div></div>`;
  m.innerHTML = `<section class="view" style="max-width:1100px">${head}
    <div class="rvbar" style="margin-top:14px"><span>${R.practice ? "Practice (no points, schedule unchanged)" : "Due cards"} · ${R.i + 1} of ${R.q.length}${R.earned ? ` · <span class="ptsfx">+${R.earned} pts</span>` : ""}</span><div class="meter"><i style="width:${Math.round(R.i / R.q.length * 100)}%"></i></div></div>
    <div class="rvwrap"><div class="rvcard">
      <div class="rvtype">${esc(cu.type)}</div>
      <div class="rvq">${cu.q}</div>
      ${cu.cue}
      ${R.shown ? ans : `<textarea id="rvIn" aria-label="Your answer" placeholder="Type your answer (optional, but recalling it in words sticks better)">${esc(R.typed || "")}</textarea>
        <div><button class="btn primary" type="button" data-act="reveal-card">Show answer</button> <span class="note">or press Enter</span></div>`}
    </div>${labsOverview()}</div></section>`;
  // the answer box takes focus on a computer; on a touch screen that would pop up the keyboard for every card
  if (!R.shown && !matchMedia("(hover:none) and (pointer:coarse)").matches) setTimeout(() => $("#rvIn")?.focus(), 0);
}
function gradeCard(g) {
  const R = S.rv; if (!R || !R.shown) return;
  const it = R.q[R.i];
  const cur = (recOf(it.r.id) || {}).srs || it.r.srs || {};       // the record's latest schedule (other cards of the paper may just have been graded)
  const before = { srs: cur, qLen: R.q.length, earned: R.earned || 0, typed: R.typed };   // for Undo
  let earned = 0;
  if (!R.practice) {
    const ns = schedule(it.s, g), srs = { ...cur, [it.key || it.t]: ns };
    patchRec(it.r.id, { srs }); it.r.srs = srs;
    if (g === 1) R.q.push({ ...it, s: ns });
    earned = [0, 0, 1, 2, 3][g]; if (earned) { const P = pal(); P.pts += earned; R.earned = (R.earned || 0) + earned; savePalace(); }
  }
  R.done++; R.i++; R.shown = false; R.typed = "";
  renderReview(); window.scrollTo(0, 0);
  // a mis-tap on the wrong grade: put the card and its schedule back
  toastUndo(`Graded ${["", "Again", "Hard", "Good", "Easy"][g]}.`, () => {
    if (S.rv !== R) return;
    if (!R.practice) {
      patchRec(it.r.id, { srs: before.srs || {} }); it.r.srs = before.srs;
      R.q.length = before.qLen;
      if (earned) { const P = pal(); P.pts -= earned; savePalace(); }
      R.earned = before.earned;
    }
    R.done--; R.i--; R.shown = true; R.typed = before.typed;
    if (S.view === "review") { renderReview(); window.scrollTo(0, 0); }
  }, null, 5000);
}
