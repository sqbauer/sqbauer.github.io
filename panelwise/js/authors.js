"use strict";
/* ---------- authors: the full author list in a paper's header, and a sheet per author ----------
   Clicking an author shows their papers in your library and, through OpenAlex, their other papers with any legal
   open-access copy (saved into Papers/Open access like the reference sheet does). "Their lab" keeps the papers where
   they are the last author, which in neuroscience is usually the lab head.
   Only the paper's DOI or title and the author's name are sent to OpenAlex. */

const AU = { el: null, back: null, name: "", lab: false, works: null, aid: null, token: 0 };

// "Rebecca P. Ratliff" / "Ratliff, R. P." -> { sur: "ratliff", ini: "r" }
function auKey(n) {
  const s = String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[*†‡§¶#\d]+/g, "").trim();
  let sur, first;
  if (s.includes(",")) { [sur, first] = s.split(",").map(x => x.trim()); }
  else { const t = s.split(/\s+/); sur = t.pop() || ""; first = t[0] || ""; }
  return { sur: sur.toLowerCase().replace(/[^a-z'-]/g, ""), ini: (first[0] || "").toLowerCase() };
}
function auSame(a, b) {
  const x = auKey(a), y = auKey(b);
  return !!x.sur && x.sur === y.sur && (!x.ini || !y.ini || x.ini === y.ini);
}
const auPos = (list, name) => (list || []).findIndex(a => auSame(a, name));

// the author list for the paper header: every name a button; long lists show the first five and the last author
function authorsLine(au) {
  if (!au.length) return "";
  const btn = (a, i) => `<button type="button" class="au" data-au="${esc(a)}" title="Papers by ${esc(a)}">${esc(a)}${i === au.length - 1 && au.length > 2 ? '<span class="au-last" aria-label="last author"> ★</span>' : ""}</button>`;
  if (au.length <= 8 || AU.allShown) return `<div class="ph-authors">${au.map(btn).join('<span class="au-sep">, </span>')}</div>`;
  return `<div class="ph-authors">${au.slice(0, 5).map(btn).join('<span class="au-sep">, </span>')}<span class="au-sep">, </span><button type="button" class="au au-more" data-au-more="1">+${au.length - 6} more</button><span class="au-sep">, </span>${btn(au[au.length - 1], au.length - 1)}</div>`;
}

function auOpen(name, from) {
  AU.name = name; AU.lab = false; AU.works = null; AU.aid = null; AU.back = from || document.activeElement; AU.token++;
  if (!AU.el) {
    AU.el = document.createElement("div"); AU.el.className = "au-wrap"; AU.el.hidden = true;
    AU.el.innerHTML = `<div class="au-scrim" data-au-close="1"></div><section class="au-sheet" role="dialog" aria-modal="true" aria-labelledby="auName"><header class="au-h"><div><div class="eyebrow">Author</div><h2 id="auName"></h2><div class="note" id="auRole"></div></div><button type="button" class="btn quiet" data-au-close="1" aria-label="Close">✕</button></header>
      <div class="au-tools"><div class="seg" role="group" aria-label="Which papers"><button type="button" data-au-lab="0" aria-pressed="true">All papers</button><button type="button" data-au-lab="1" aria-pressed="false">Their lab (last author)</button></div></div>
      <div class="au-body"><h3>In your library</h3><div id="auLib"></div><h3>More from OpenAlex</h3><div id="auWeb"></div></div></section>`;
    document.body.appendChild(AU.el);
  }
  const P = S.paper, au = P && !P.demo ? authorsFor(P) : [], i = auPos(au, name);
  $("#auName").textContent = name;
  $("#auRole").textContent = i < 0 ? "" : i === au.length - 1 && au.length > 1 ? `Last author of this paper (usually the lab head) · ${au.length} authors` : i === 0 ? `First author of this paper · ${au.length} authors` : `Author ${i + 1} of ${au.length} on this paper`;
  AU.el.hidden = false; document.documentElement.classList.add("au-open");
  auRender();
  auLoadWeb(AU.token);
  requestAnimationFrame(() => AU.el.querySelector('[data-au-close]:not(.au-scrim)').focus({ preventScroll: true }));
}
function auClose() {
  if (!AU.el || AU.el.hidden) return;
  AU.el.hidden = true; AU.token++; document.documentElement.classList.remove("au-open");
  if (AU.back && AU.back.isConnected) AU.back.focus({ preventScroll: true });
}

// papers in the library with this author (and, for "their lab", as last author)
function auLibrary() {
  const cur = S.paper && S.paper.id;
  return ixPapers().map(L_ => ({ L: L_, au: L_.g.authors && L_.g.authors.length ? L_.g.authors : (recOf(L_.id) || {}).authors || [] }))
    .map(x => ({ ...x, i: auPos(x.au, AU.name) })).filter(x => x.i >= 0 && (!AU.lab || (x.i === x.au.length - 1 && x.au.length > 1)))
    .map(x => ({ ...x, cur: x.L.id === cur })).sort((a, b) => (+b.L.year || 0) - (+a.L.year || 0));
}
function auRender() {
  if (!AU.el || AU.el.hidden) return;
  $$("[data-au-lab]", AU.el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.auLab === (AU.lab ? "1" : "0"))));
  const lib = auLibrary();
  $("#auLib").innerHTML = lib.length ? `<ul class="au-list">${lib.map(x => `<li><button type="button" class="au-row" data-au-open="${esc(x.L.id)}" ${x.cur ? "disabled" : ""}><span class="t">${esc(x.L.title || x.L.g.name)}</span><span class="note">${esc([shortAuthors(x.au), x.L.year, x.cur ? "this paper" : null].filter(Boolean).join(" · "))}</span></button></li>`).join("")}</ul>`
    : `<p class="note">${AU.lab ? "No papers in your library with them as last author." : "No other papers by them in your library."}</p>`;
  auRenderWeb();
}
// OpenAlex: find this exact author through the open paper (its DOI or title), else by name; then their works
async function auLoadWeb(tok) {
  const box = $("#auWeb");
  if (!PW.online()) { box.innerHTML = `<p class="note">You're offline. Their other papers need a connection.</p>`; return; }
  box.innerHTML = `<div class="thinking"><span class="dot"></span>Looking them up in OpenAlex…</div>`;
  try {
    const P = S.paper; let aid = null, how = "";
    if (P && !P.demo) {
      const it = L.meta.items.find(x => x.id === P.id), doi = it && it.doi;
      const hit = await oaFind(doi ? { doi } : { text: P.title }).catch(() => null);
      const a = hit && (hit.w.authorships || []).find(x => x.author && auSame(x.author.display_name, AU.name));
      if (a) aid = a.author.id.split("/").pop();
    }
    if (!aid) {
      const j = await oaJSON(`${OA_API}/authors?search=${encodeURIComponent(AU.name)}&per-page=1&select=id,display_name,works_count`);
      const a = (j.results || [])[0]; if (a && auSame(a.display_name, AU.name)) { aid = a.id.split("/").pop(); how = "name"; }
    }
    if (tok !== AU.token) return;
    if (!aid) { box.innerHTML = `<p class="note">OpenAlex doesn't know this author.</p>`; return; }
    const j = await oaJSON(`${OA_API}/works?filter=author.id:${aid}&per-page=100&sort=publication_year:desc&select=${OA_FIELDS}`);
    if (tok !== AU.token) return;
    AU.aid = aid; AU.how = how;
    AU.works = (j.results || []).filter(w => w.title && !["peer-review", "erratum", "paratext", "dataset", "other"].includes(w.type) && w.title.length > 12);
    auRenderWeb();
  } catch { if (tok === AU.token) box.innerHTML = `<p class="note">Couldn't reach OpenAlex. Try again in a moment.</p>`; }
}
function auRenderWeb() {
  const box = $("#auWeb"); if (!box || !AU.works) return;
  const isLast = w => { const a = w.authorships || []; return a.length > 1 && (a[a.length - 1].author || {}).id?.endsWith(AU.aid); };
  const rows = AU.works.filter(w => !AU.lab || isLast(w)).filter(w => !S.paper || normTitle(w.title) !== normTitle(S.paper.title)).map(w => ({ w, pdf: oaPdfOf(w), have: oaInLibrary(w) })).filter(r => !r.have);
  const save = PW.native && PW.files.folderName ? "Save to Papers and open" : "Open the PDF";
  box.innerHTML = (AU.how === "name" ? `<p class="note">Matched by name only, so some papers may be by someone else with the same name.</p>` : "")
    + (rows.length ? `<ul class="au-list">${rows.map((r, k) => `<li class="oa-box" data-au-k="${k}"><div class="oa-hit"><strong>${esc(r.w.title)}</strong><span class="note">${esc([oaAuthors(r.w), r.w.publication_year].filter(Boolean).join(" "))}${r.pdf ? " · open access: " + esc(oaWhere(r.pdf)) : ""}</span></div>${r.pdf ? `<button type="button" class="btn" data-oa="get">${save}</button>` : r.w.doi ? `<a class="note" href="${esc(r.w.doi)}" target="_blank" rel="noopener">No open-access copy · publisher page ↗</a>` : `<span class="note">No open-access copy known</span>`}</li>`).join("")}</ul>`
      : `<p class="note">${AU.lab ? "No other papers with them as last author." : "No other papers found."}</p>`);
  // the shared open-access click handler (oa.js) reads what to get from the box
  $$("li.oa-box", box).forEach(li => { const r = rows[+li.dataset.auK]; li._found = { w: r.w, pdf: r.pdf }; });
}

document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-au], [data-au-more], [data-au-close], [data-au-lab], [data-au-open]"); if (!t) return;
  if (t.dataset.auMore) { AU.allShown = true; renderPaperHead(S.paper); return; }
  if (t.dataset.au) { e.preventDefault(); auOpen(t.dataset.au, t); return; }
  if (t.dataset.auClose) { auClose(); return; }
  if (t.dataset.auLab) { AU.lab = t.dataset.auLab === "1"; auRender(); return; }
  if (t.dataset.auOpen) { const L_ = ixPapers().find(x => x.id === t.dataset.auOpen); auClose(); if (L_) ixOpen(L_, ""); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && AU.el && !AU.el.hidden) { e.stopPropagation(); auClose(); } }, true);
