"use strict";
/* ---------- reading mode: the paper as pages, like an e-reader ----------
   A "Read" button sits next to "Ask about the paper" whenever a paper is open. It shows the whole
   text (abstract, introduction, results, discussion, methods, legends) one screen at a time:
   tap the right side or swipe left for the next page, the left side or swipe right to go back.
   Figure references in the text are buttons: tapping one opens that panel in the figure viewer
   (js/figview.js), or the whole figure when the panel's position isn't known. Closing the viewer
   returns to the same page. Your place and text size are remembered per paper on this device.
   Self-contained: it adds its own button and overlay and leaves the reader's other views alone. */
const RM = { cites: [], refList: "", sheet: null, el: null, flow: null, vp: null, btn: null, page: 0, pages: 1, heads: [], paperId: null, down: null, swiped: false, size: 18 };
const RM_SIZES = [15, 16.5, 18, 20, 22, 25];
// toolbar icons (24 px grid, drawn with the text colour)
const RM_IC = {
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>', chevD: '<path d="M6 9l6 6 6-6"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>', chevR: '<path d="M9 18l6-6-6-6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  speaker: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>', pause: '<path d="M9 5v14M15 5v14"/>',
  figure: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const rmIc = (n, s = 20) => `<svg class="rdm-ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${RM_IC[n]}</svg>`;

function rmKey(id) { return "pwread:" + id; }
function rmLoad(id) { try { return JSON.parse(localStorage.getItem(rmKey(id)) || "null"); } catch { return null; } }
function rmSave() {
  if (!RM.paperId || S.paper?.demo) return;
  let sec = ""; for (const hd of RM.heads || []) if (hd.page <= RM.page) sec = hd.name;
  try { localStorage.setItem(rmKey(RM.paperId), JSON.stringify({ at: RM.pages > 1 ? RM.page / (RM.pages - 1) : 0, sec, t: Date.now() })); } catch {}
}

/* ---- citations: collapsed to a small "refs" chip; tapping it lists them, with the matching reference-list entries ---- */
const RM_CITE = /\(([^()]{3,600})\)|\[(\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)\]/g;
const RM_YEAR = /\b(?:19|20)\d{2}[a-z]?\b/;
const RM_AUTHOR_YEAR = /[A-Z][\p{L}'’\-]+(?:\s+(?:et\s+al\.?|(?:and|&)\s+[A-Z][\p{L}'’\-]+))?,?\s*\(?(?:19|20)\d{2}/u;
function rmIsCite(inner) {
  if (/\bFig(?:ure)?s?\.?\s*\d|\bTable\s*\d|[<>=±%]|\bp\s*[<=]/i.test(inner)) return false;   // figure refs and statistics stay as they are
  return RM_YEAR.test(inner) && RM_AUTHOR_YEAR.test(inner);
}
function rmCiteItems(m) {
  if (m[2]) {   // numbered: [3], [12-15], [4, 7]
    const out = [];
    for (const part of m[2].split(",")) {
      const r = part.split(/[-–]/).map(x => +x.trim());
      if (r.length === 2 && r[1] >= r[0] && r[1] - r[0] < 40) for (let n = r[0]; n <= r[1]; n++) out.push(String(n)); else out.push(String(r[0]));
    }
    return out;
  }
  return m[1].split(";").map(x => x.replace(/^\s*(?:e\.g\.|i\.e\.|see(?: also)?|reviewed (?:in|by)|cf\.)\s*,?\s*/i, "").trim()).filter(Boolean);
}
function rmText(t) {
  let out = "", pos = 0; RM_CITE.lastIndex = 0; let m;
  while ((m = RM_CITE.exec(t))) {
    if (m[1] !== undefined && !rmIsCite(m[1])) continue;
    const items = rmCiteItems(m); if (!items.length) continue;
    out += renderRefs(t.slice(pos, m.index).replace(/\s+$/, "")) + " ";
    RM.cites.push({ raw: m[0], items, numbered: !!m[2] });
    out += `<button type="button" class="rdm-cite" data-ci="${RM.cites.length - 1}" aria-label="${items.length} reference${items.length > 1 ? "s" : ""}">refs</button>`;
    pos = m.index + m[0].length;
    const sp = /^\s+(?=[.,;:)])/.exec(t.slice(pos)); if (sp) pos += sp[0].length;   // no gap between the chip and a following full stop
  }
  return out + renderRefs(t.slice(pos));
}
/* find a citation's entry in the reference list: author and year, or its number. A best effort, since the list's
   layout varies a lot between journals. */
function rmFindRef(item, numbered) {
  // the reference list, or (when its heading wasn't recognised) the paper's whole text, where the entries ended up
  const L = RM.refList || RM.allText || ""; if (!L) return null;
  const cut = (start, from) => {
    let end = L.length;
    const next = /\.\s+(?=(?:\[?\d{1,3}[.\]]\s+)?[A-Z][\p{L}'’\-]+,?\s+(?:[A-Z]\.|[A-Z]{1,3}[,.\s]))/gu; next.lastIndex = from;
    const n = next.exec(L); if (n && n.index - start < 700) end = n.index + 1;
    return L.slice(start, Math.min(end, start + 500)).trim();
  };
  if (numbered) {
    // "16. Gent, T. C. ..." (or "[16] ..."). Search the reference list, then the whole text, in case the list's
    // heading wasn't recognised and the entries ended up among the paragraphs.
    for (const T of [L, RM.allText]) {
      if (!T) continue;
      const re = new RegExp(`(?:^|[\\s.)])\\[?${item}[.\\]]\\s*(?=[A-Z\\u00C0-\\u024F])`, "g");
      let m;
      while ((m = re.exec(T))) {
        const start = m.index + (/^[\s.)]/.test(m[0]) ? 1 : 0), body = m.index + m[0].length;
        // the entry should look like a reference: an author list followed by a year within a few hundred characters
        if (!/\b(?:19|20)\d{2}\b/.test(T.slice(body, body + 400))) continue;
        const nxt = new RegExp(`\\s\\[?${+item + 1}[.\\]]\\s*[A-Z]`).exec(T.slice(body, body + 900));
        return T.slice(start, nxt ? body + nxt.index : body + 450).trim();
      }
    }
    return null;
  }
  const year = (item.match(RM_YEAR) || [])[0]; if (!year) return null;
  const sur = (item.match(/^(?:[a-z]{1,3}\s+)*[A-Z][\p{L}'’\-]+(?:\s+[A-Z][\p{L}'’\-]+)?/u) || [""])[0].replace(/\s+(?:et|and)$/, "");
  if (!sur) return null;
  const re = new RegExp(sur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi");
  let m;
  // the entry's year is the first year after the author's name (so "Hill 2011" doesn't run into "Hill 2008")
  const firstYear = /\b(?:19|20)\d{2}/g;
  while ((m = re.exec(L))) {
    firstYear.lastIndex = m.index + m[0].length;
    const y = firstYear.exec(L);
    if (y && y[0] === year.slice(0, 4) && y.index - m.index < 350) return cut(m.index, y.index + 4);
  }
  return null;
}
function rmShowCites(k) {
  const c = RM.cites[k]; if (!c) return;
  RM.sheetKind = "cite";
  const box = rmSheet(c.items.length > 1 ? `${c.items.length} references` : "Reference", `<ol class="rdm-list">${c.items.map(it => {
    const ref = rmFindRef(it, c.numbered);
    const L = ref && typeof ixMatchRef === "function" ? ixMatchRef(ref) : null;
    return `<li><div class="rdm-cite-k">${esc(c.numbered ? "[" + it + "]" : it)}</div>${ref ? `<div class="rdm-cite-ref">${esc(ref)}</div>` : `<div class="rdm-cite-ref none">Not found in the reference list.</div>`}${L ? `<button type="button" class="rdm-btn rdm-inlib" data-sheet="lib-open" data-v="${esc(L.id)}">In your library · Open ›</button>` : ""}</li>`;
  }).join("")}</ol>`);
}
function rmSheet(title, html) {
  RM.explainCtl?.abort(); RM.explainCtl = null;      // an answer still streaming belongs to the sheet that asked
  const box = $("#rmSheetList");
  $("#rmSheetTitle").textContent = title; box.innerHTML = html; box.scrollTop = 0;
  RM.sheet.classList.toggle("tall", RM.sheetKind === "region" || RM.sheetKind === "toc" || RM.sheetKind === "look");
  RM.sheet.classList.toggle("wide", RM.sheetKind === "region");    // the atlas sections need room beside the text on a wide screen
  RM.sheet.dataset.kind = RM.sheetKind || "";
  const was = RM.sheet.hidden; RM.sheet.hidden = false;
  if (was) { const a = document.activeElement; RM.sheetOpener = a && !RM.sheet.contains(a) ? a : null; }
  box.scrollTop = 0; requestAnimationFrame(() => { box.scrollTop = 0; if (was && !RM.sheet.hidden && !RM.sheet.contains(document.activeElement)) RM.sheet.querySelector('[data-rm="sheet-close"]')?.focus({ preventScroll: true }); });
  return box;
}
function rmSheetClose() {
  const back = !RM.sheet.hidden && RM.sheet.contains(document.activeElement) ? RM.sheetOpener : null;
  RM.sheet.hidden = true; RM.explainCtl?.abort(); RM.explainCtl = null; if (window.CSS && CSS.highlights) CSS.highlights.delete("rdm-sel");
  // focus goes back where it was (a term or button in the text), or to the reader itself
  if (back && back.isConnected && !RM.el.hidden) back.focus({ preventScroll: true }); else if (RM.sheet.contains(document.activeElement)) RM.el.querySelector("#rmWhere")?.focus({ preventScroll: true });
  RM.sheetOpener = null;
}

function rmHTML(P) {
  RM.cites = []; RM.refList = P.refList || "";
  RM.allText = Object.entries(P.sections || {}).filter(([k]) => k !== "refs").flatMap(([, v]) => v).join(" ");
  const name = SEC_NAMES;
  let h = `<h2 class="rdm-title">${esc(P.title || "Untitled paper")}</h2>`; const seenFig = new Set();
  if (P.abstract) h += `<h3 data-sec="Abstract">Abstract</h3><p data-k="abs:0">${esc(P.abstract)}</p>`;
  for (const k of ["intro", "results", "discussion", "methods", "other"]) {
    const list = P.sections[k] || []; if (!list.length) continue;
    const subs = (P.heads || []).filter(x => x.sec === k);
    if (k === "methods" && !RM.showMethods) {
      h += `<h3 data-sec="${name[k]}">${name[k]}</h3><div class="rdm-more"><p>The Methods are hidden to keep the reading short (${list.length} paragraphs).</p><button type="button" class="rdm-btn" data-rm="methods">Show the Methods</button></div>`;
      continue;
    }
    h += `<h3 data-sec="${name[k]}">${name[k]}</h3>` + list.map((t, i) => {
      const body = rmText(t);
      // the first time a figure is mentioned, a card to open it right there
      const cards = [...new Set([...body.matchAll(/class="ref" data-fig="(\d+)"/g)].map(m => +m[1]))].filter(n => !seenFig.has(n) && P.figures.some(f => f.n === n)).map(n => {
        seenFig.add(n); const f = P.figures.find(x => x.n === n);
        const title = (f.L && f.L.title) || (typeof splitLegend === "function" && splitLegend(f.legend).title.replace(/[\s,;:]+$/, "")) || f.legend.replace(/^\s*(?:Figure|Fig\.?)\s*\d+\s*[.:|—–]?\s*/i, "").split(/(?<=\.)\s/)[0];
        return `<button type="button" class="rdm-figcard" data-fig="${n}"><span class="k">Figure ${n}</span><span class="t">${esc(title.length > 160 ? title.slice(0, 160).replace(/\s+\S*$/, "") + "…" : title)}</span><span class="go">View ›</span></button>`;
      }).join("");
      return subs.filter(x => x.i === i).map(x => `<h4 class="rdm-sub">${esc(x.text)}</h4>`).join("") + `<p data-k="${k}:${i}">${body}</p>` + cards;
    }).join("");
  }
  if (P.figures.length) {
    h += `<h3 data-sec="Figure legends">Figure legends</h3>` + P.figures.map(f => `<p><button type="button" class="ref" data-fig="${f.n}" data-panel="">Figure ${f.n}</button> ${esc(f.legend)}</p>`).join("");
  }
  return h;
}

function rmBuild() {
  const el = document.createElement("div");
  el.className = "rdm"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Reading mode");
  const mod = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
  el.innerHTML = `<div class="rdm-top"><button type="button" class="rdm-where" id="rmWhere" data-rm="toc" aria-haspopup="dialog" aria-label="Contents" title="Contents, highlights and related papers">${rmIc("list", 18)}<span class="wl">Reading</span>${rmIc("chevD", 16)}</button>
      <span class="rdm-tools">
        <button type="button" class="rdm-btn rdm-tool" data-rm="find" aria-haspopup="dialog" aria-label="Search this paper" title="Search this paper (${mod}F)">${rmIc("search")}<span class="lbl">Search</span></button>
        <button type="button" class="rdm-btn rdm-tool rdm-speak" data-rm="speak" aria-label="Listen: read aloud" title="Read aloud from this page">${rmIc("speaker")}<span class="lbl">Listen</span></button>
        <button type="button" class="rdm-btn rdm-tool" data-rm="look" aria-haspopup="dialog" aria-label="Text and display" title="Text and display"><span class="aa" aria-hidden="true">Aa</span></button>
        <button type="button" class="rdm-btn rdm-tool rdm-figtog" data-rm="side" aria-pressed="true" aria-label="Figure beside the text" title="Figure beside the text (F)" hidden>${rmIc("figure")}<span class="lbl">Figure</span></button>
        <button type="button" class="rdm-btn rdm-tool" data-rm="close" aria-label="Close reading mode" title="Close (Esc)">${rmIc("x")}<span class="lbl">Close</span></button>
      </span></div>
    <div class="rdm-main"><div class="rdm-vp" id="rmVp"><article class="rdm-flow reading" id="rmFlow"></article></div><aside class="rdm-side" id="rmSide" hidden aria-label="Figure"></aside></div>
    <div class="rdm-sheet" id="rmSheet" role="dialog" aria-labelledby="rmSheetTitle" hidden><div class="rdm-grab" aria-hidden="true"></div><div class="rdm-sheet-h"><h2 class="rdm-sheet-t" id="rmSheetTitle"></h2><button type="button" class="rdm-btn rdm-done" data-rm="sheet-close">Done</button></div><div class="rdm-sheet-list" id="rmSheetList"></div></div>
    <div class="rdm-bot"><button type="button" class="rdm-btn rdm-arrow" data-rm="prev" aria-label="Previous page">${rmIc("chevL", 24)}</button>
      <div class="rdm-prog" id="rmProg" role="slider" aria-label="Position in the paper" tabindex="0"><div class="rdm-bar"><i id="rmBar"></i></div><span id="rmCount"></span></div>
      <button type="button" class="rdm-btn rdm-arrow" data-rm="next" aria-label="Next page">${rmIc("chevR", 24)}</button></div>`;
  document.body.appendChild(el);
  RM.el = el; RM.flow = el.querySelector("#rmFlow"); RM.vp = el.querySelector("#rmVp"); RM.sheet = el.querySelector("#rmSheet");
  try { const s = +localStorage.getItem("pwread:size"); if (RM_SIZES.includes(s)) RM.size = s; } catch {}

  el.addEventListener("click", e => {
    e.stopPropagation();                               // the reader's own click handler must not see these
    const sd = e.target.closest("[data-side]"); if (sd) { rmSideAction(sd); return; }
    if (e.target.closest(".rdm-rsvp")) { rmRsvpClick(e); return; }   // the word guide (js/readwords.js)   // the figure beside the text (wide screens)
    if (e.target.closest(".rdm-cite")) { rmShowCites(+e.target.closest(".rdm-cite").dataset.ci); return; }
    if (!RM.sheet.hidden) {
      const act = e.target.closest("[data-sheet]");
      if (act) { rmSheetAction(act); return; }
      if (e.target.closest('[data-rm="sheet-close"]') || !e.target.closest(".rdm-sheet")) rmSheetClose();
      return;
    }
    if (RM.pressed) { RM.pressed = false; return; }   // the click that ends a long press
    const term = e.target.closest(".rdm-term");
    if (term) { rmShowTerm(term.dataset.g); return; }
    const card = e.target.closest(".rdm-figcard");
    if (card) { if (rmSideOn()) rmSideShow(+card.dataset.fig); else rmOpenRef(+card.dataset.fig, null); return; }
    const ref = e.target.closest(".ref");
    if (ref) { if (rmSideOn()) rmSideShow(+ref.dataset.fig, ref.dataset.panel || null); else rmOpenRef(+ref.dataset.fig, ref.dataset.panel || null); return; }
    const b = e.target.closest("[data-rm]");
    if (b) {
      const a = b.dataset.rm;
      if (RM.rs && RM.rs.open && a !== "close") rmRsvpClose(a !== "prev" && a !== "next");   // leave the word guide first
      if (a === "close") rmClose();
      else if (a === "prev") rmGo(RM.page - 1);
      else if (a === "next") rmGo(RM.page + 1);
      else if (a === "toc") rmShowToc();
      else if (a === "find") rmShowToc(null, true);
      else if (a === "side") rmSideToggle();
      else if (a === "speak") rmSpeakToggle();
      else if (a === "look") rmShowLook();
      else if (a === "methods") { RM.showMethods = true; rmRender(null, "Methods"); }
      return;
    }
    if (!e.target.closest("#rmVp")) return;
    if (RM.swiped) { RM.swiped = false; return; }      // the click that ends a swipe
    if (RM.tts && RM.tts.on) { rmSpeakStop(true); return; }   // reading aloud: a tap pauses
    const r = RM.vp.getBoundingClientRect();
    const d = (e.clientX - r.left) < r.width * .33 ? -1 : 1;
    if (RM.focusOn) rmFocusStep(d); else rmGo(RM.page + d);
  });
  RM.vp.addEventListener("pointerdown", e => {
    RM.down = { x: e.clientX, y: e.clientY, t: Date.now() }; RM.swiped = false; RM.pressed = false;
    clearTimeout(RM.pressT);
    if (RM.sheet.hidden && !e.target.closest("button")) RM.pressT = setTimeout(() => { if (RM.down) { RM.pressed = true; rmLongPress(RM.down.x, RM.down.y); } }, 520);
  });
  RM.vp.addEventListener("pointermove", e => { if (RM.down && Math.abs(e.clientX - RM.down.x) + Math.abs(e.clientY - RM.down.y) > 10) clearTimeout(RM.pressT); });
  RM.vp.addEventListener("pointerup", e => {
    clearTimeout(RM.pressT);
    const d = RM.down; RM.down = null; if (!d || !RM.sheet.hidden || RM.pressed) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - d.t < 800) { RM.swiped = true; rmGo(RM.page + (dx < 0 ? 1 : -1)); }
  });
  RM.vp.addEventListener("pointercancel", () => { RM.down = null; clearTimeout(RM.pressT); });
  // the progress bar is a scrubber: tap or drag along it to jump anywhere in the paper
  const prog = el.querySelector("#rmProg"), bar = prog.querySelector(".rdm-bar");
  const scrub = e => {
    const r = bar.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    rmGo(Math.round(f * (RM.pages - 1)), true);
  };
  prog.addEventListener("pointerdown", e => { if (!RM.sheet.hidden) return; RM.scrubbing = true; prog.setPointerCapture?.(e.pointerId); prog.classList.add("on"); scrub(e); });
  prog.addEventListener("pointermove", e => {
    if (!RM.scrubbing) return;
    RM.scrubE = e;                                     // at most one page turn per frame while dragging
    if (!RM.scrubRaf) RM.scrubRaf = requestAnimationFrame(() => { RM.scrubRaf = 0; if (RM.scrubbing && RM.scrubE) scrub(RM.scrubE); });
  });
  const endScrub = () => { if (!RM.scrubbing) return; RM.scrubbing = false; prog.classList.remove("on"); rmSideFollow(RM.page); rmSave(); };
  prog.addEventListener("pointerup", endScrub); prog.addEventListener("pointercancel", endScrub);
  prog.addEventListener("keydown", e => { if (e.key === "Home") rmGo(0); else if (e.key === "End") rmGo(RM.pages - 1); });
  // re-paginate whenever the reading area changes size (rotation, viewport settling after open)
  new ResizeObserver(() => {
    if (RM.el.hidden) return;
    const w = RM.vp.clientWidth, h = RM.vp.clientHeight;
    if (w === RM.vw && h === RM.vh) return;
    rmLayout(RM.pages > 1 && RM.page >= 0 ? RM.page / (RM.pages - 1) : RM.want || 0);
  }).observe(RM.vp);
}

/* lay the text out in screen-wide columns and work out how many pages that makes */
function rmLayout(at) {
  const vp = RM.vp, flow = RM.flow;
  RM.vw = vp.clientWidth; RM.vh = vp.clientHeight;
  // on a wide window the text stays a readable width (about 70 characters a line): the margins grow instead
  const m = Math.max(rmMargin(), Math.round((vp.clientWidth - 40 * RM.size) / 2)), w = vp.clientWidth, h = vp.clientHeight - 28;   // 14px breathing room above and below (see .rdm-flow margin)
  RM.step = w;
  flow.style.fontSize = RM.size + "px";
  flow.style.height = h + "px";
  flow.style.width = w + "px";                     // fixed, so one column is exactly one screen even if the viewport settles later
  flow.style.columnWidth = (w - 2 * m) + "px"; flow.style.columnGap = (2 * m) + "px";
  flow.style.paddingInline = m + "px";
  vp.scrollLeft = 0;
  RM.pages = Math.max(1, Math.round((flow.scrollWidth - 2 * m + 2 * m) / w));
  const left = flow.getBoundingClientRect().left;
  const pageOf = el => Math.max(0, Math.floor((el.getBoundingClientRect().left - left) / w));
  RM.heads = [...flow.querySelectorAll("h3[data-sec]")].map(el => ({ name: el.dataset.sec, page: pageOf(el) }));
  RM.toc = [...flow.querySelectorAll("h3[data-sec], h4.rdm-sub")].map(el => ({ name: el.dataset.sec || el.textContent, sub: el.tagName === "H4", page: pageOf(el) }));
  rmFocusPages(); rmSideRefs(); rmWordsLayout();
  rmGo(Math.round((at || 0) * (RM.pages - 1)), true);
}
function rmGo(p, quiet) {
  p = Math.max(0, Math.min(RM.pages - 1, p));
  if (p === RM.page && !quiet) { if (p === RM.pages - 1 && RM.pages > 1) toast("End of the paper"); return; }
  RM.page = p;
  // Turn the page by scrolling the reading area, not by transforming the text: a transformed strip of a hundred
  // pages becomes one enormous graphics layer, which a phone cannot afford.
  const smooth = !quiet && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (smooth) RM.vp.scrollTo({ left: p * RM.step, top: 0, behavior: "smooth" }); else { RM.vp.scrollLeft = p * RM.step; RM.vp.scrollTop = 0; }
  let sec = ""; for (const hd of RM.heads) if (hd.page <= p) sec = hd.name;
  const wh = $("#rmWhere"); wh.querySelector(".wl").textContent = sec || "Reading"; wh.setAttribute("aria-label", `Contents: ${sec || "Reading"}`);
  $("#rmCount").textContent = `Page ${p + 1} of ${RM.pages}`;
  $("#rmBar").style.width = (RM.pages > 1 ? p / (RM.pages - 1) * 100 : 100) + "%";
  const pr = $("#rmProg"); pr.setAttribute("aria-valuemin", "1"); pr.setAttribute("aria-valuemax", String(RM.pages)); pr.setAttribute("aria-valuenow", String(p + 1)); pr.setAttribute("aria-valuetext", `Page ${p + 1} of ${RM.pages}${sec ? ", " + sec : ""}`);
  RM.el.querySelector('[data-rm="prev"]').disabled = p === 0;
  RM.el.querySelector('[data-rm="next"]').disabled = p === RM.pages - 1;
  rmFocusSync(p); if (!RM.scrubbing) rmSideFollow(p);   // while scrubbing, the side panel waits for the end
  if (!quiet) rmSave();
}
function rmResize(d) {
  const i = Math.max(0, Math.min(RM_SIZES.length - 1, RM_SIZES.indexOf(RM.size) + d));
  if (RM_SIZES[i] === RM.size) return;
  const at = RM.pages > 1 ? RM.page / (RM.pages - 1) : 0;
  RM.size = RM_SIZES[i]; try { localStorage.setItem("pwread:size", String(RM.size)); } catch {}
  rmLayout(at); if (!RM.sheet.hidden && RM.sheetKind === "look") rmShowLook();
}

function rmOpenRef(n, panel) {
  const P = S.paper, f = P && P.figures.find(x => x.n === n);
  if (!f) { toast(`Figure ${n} isn't in this paper's main figures.`); return; }
  fvOpenFig(f, panel, () => { RM.el.querySelector('[data-rm="close"]').focus({ preventScroll: true }); });
}

async function rmOpen() {
  if (typeof atlasLoad === "function") await atlasLoad();   // region names are linked while the text is decorated
  const P = S.paper; if (!P) return;
  try { RM.marks = P.demo || !P.id ? [] : await listChildren(P.id, "marks"); } catch { RM.marks = []; }
  if (!RM.el) rmBuild();
  if (typeof setChat === "function" && !$("#chat").hidden) setChat(false);
  RM.paperId = P.id || null; RM.showMethods = false; RM.sideFig = null;
  rmApplyLook();
  RM.flow.innerHTML = rmHTML(P); rmDecorate(P); rmApplyMarks(); rmAids();
  if (RM.el.hidden) { PWZoomLock.set(true); const a = document.activeElement; RM.opener = a && a !== document.body && !RM.el.contains(a) ? a : null; }
  RM.el.hidden = false; document.documentElement.classList.add("rdm-open");
  $("#app").inert = true;                              // keyboard and screen readers stay in the reader
  const saved = RM.paperId && !P.demo ? rmLoad(RM.paperId) : null;
  RM.page = -1;
  RM.want = saved && saved.at ? saved.at : 0;
  const lay = () => rmLayout(RM.want);
  lay();
  // web fonts still loading change the page count: lay out again once they're in (not when they already are)
  if (document.fonts && document.fonts.ready && document.fonts.status !== "loaded") document.fonts.ready.then(() => { if (!RM.el.hidden) rmLayout(RM.pages > 1 ? RM.page / (RM.pages - 1) : RM.want); });
  rmKeysMaybe();
  requestAnimationFrame(() => { if (!RM.el.hidden && !RM.el.contains(document.activeElement)) RM.el.querySelector("#rmWhere")?.focus({ preventScroll: true }); });
}
function rmClose() {
  if (!RM.el || RM.el.hidden) return;
  rmSave(); rmWordsReset();
  RM.el.hidden = true; document.documentElement.classList.remove("rdm-open"); PWZoomLock.set(false); rmSheetClose();
  $("#app").inert = false;
  RM.flow.innerHTML = "";
  const opener = RM.opener; RM.opener = null;
  const cb = RM.onClose; RM.onClose = null; if (cb) cb();   // e.g. back to the feed
  // focus back on what opened the reader (the Read button), if it's still there
  else if (opener && opener.isConnected) opener.focus({ preventScroll: true }); else if (RM.btn && !RM.btn.hidden) RM.btn.focus({ preventScroll: true });
}

/* ---- render (again) keeping the reader's place, or moving to a section ---- */
function rmRender(at, toSection) {
  const P = S.paper; if (!P) return;
  RM.flow.innerHTML = rmHTML(P); rmDecorate(P); rmApplyMarks(); rmAids();
  rmLayout(at != null ? at : (RM.pages > 1 ? RM.page / (RM.pages - 1) : 0));
  if (toSection) { const hd = (RM.heads || []).find(h => h.name === toSection); if (hd) rmGo(hd.page, true); rmSave(); }
}

/* ---- contents: search on top, then three tabs. Contents: every section and subheading with its page, the summaries
   and the abbreviations. Highlights: yours, in reading order. Related: papers in your library and the brain regions. ---- */
const RM_TABS = [["contents", "Contents"], ["highlights", "Highlights"], ["related", "Related"]];
function rmShowToc(tab, find) {
  RM.sheetKind = "toc";
  if (tab) RM.tocTab = tab;
  if (find) RM.tocTab = RM.tocTab || "contents";
  const T = RM_TABS.some(([k]) => k === RM.tocTab) ? RM.tocTab : "contents";
  let cur = -1; (RM.toc || []).forEach((t, i) => { if (t.page <= RM.page) cur = i; });
  const P = S.paper, sums = rmSums();
  const secs = (RM.toc || []).map((t, i) => `<button type="button" class="rdm-toc-i${t.sub ? " sub" : ""}${i === cur ? " on" : ""}"${i === cur ? ' aria-current="location"' : ""} data-sheet="go" data-p="${t.page}"><span>${esc(t.name)}${!t.sub && sums && sums[t.name] ? `<span class="rdm-sum">${esc(sums[t.name])}</span>` : ""}</span><span class="pg">${t.page + 1}</span></button>`).join("");
  const sumBtn = !sums && P && !P.demo ? `<button type="button" class="rdm-btn rdm-sumbtn" data-sheet="sum">Summarise each section with Claude</button><div class="rdm-explain" id="rmSumOut"></div>` : "";
  // highlights, in reading order
  const marks = [...RM.flow.querySelectorAll("mark.rdm-hl[data-m]")].filter((el, i, a) => a.findIndex(x => x.dataset.m === el.dataset.m) === i);
  const hl = marks.length ? marks.map(el => {
    const m = (RM.marks || []).find(x => x._id === el.dataset.m) || {};
    return `<button type="button" class="rdm-toc-i sub rdm-hlitem" data-sheet="mark-go" data-v="${esc(el.dataset.m)}"><span><i class="rdm-dot c-${m.color || "y"}"></i>${esc((m.text || "").replace(/\s*refs(?=[\s.,;:)]|$)/g, "").slice(0, 140))}${(m.text || "").length > 140 ? "…" : ""}</span><span class="pg">${rmPageOf(el) + 1}</span></button>`;
  }).join("") : `<p class="rdm-empty">No highlights yet. Press and hold a sentence in the text to highlight it.</p>`;
  // brain regions named in the paper, by first mention
  const regs = [], seenR = new Set();
  for (const el of RM.flow.querySelectorAll(".rdm-term.reg")) {
    const g = RM.gloss[+el.dataset.g]; if (!g || !g.regs || !g.regs.length) continue;
    for (const r of g.regs) { const k = r.ids.join(","); if (seenR.has(k)) continue; seenR.add(k); regs.push({ gi: +el.dataset.g, name: atlasName(r.ids), page: rmPageOf(el) }); }
  }
  const rg = regs.length ? `<h3 class="rdm-toc-h">Brain regions <span>${regs.length}</span></h3>` + regs.map((r, i) => `<button type="button" class="rdm-toc-i sub${i >= 12 ? " rdm-more-reg" : ""}" data-sheet="reg-open" data-v="${r.gi}"${i >= 12 ? " hidden" : ""}><span>${esc(r.name)}</span><span class="pg">${r.page + 1}</span></button>`).join("")
    + (regs.length > 12 ? `<button type="button" class="rdm-btn rdm-sumbtn" data-sheet="regs-all">Show all ${regs.length} regions</button>` : "") : "";
  const relWait = P && !P.demo && typeof ixRelated === "function";
  const counts = { highlights: marks.length };
  const tabs = `<div class="seg rdm-tabs" role="tablist" aria-label="Show" id="rmTocTabs">${RM_TABS.map(([k, l]) => `<button type="button" role="tab" id="rmTab-${k}" aria-controls="rmPane-${k}" aria-selected="${k === T}" tabindex="${k === T ? 0 : -1}" data-sheet="toc-tab" data-v="${k}">${l}<span class="c" id="rmTabN-${k}">${counts[k] ? counts[k] : ""}</span></button>`).join("")}</div>`;
  const pane = (k, html) => `<div class="rdm-toc" role="tabpanel" id="rmPane-${k}" aria-labelledby="rmTab-${k}"${k === T ? "" : " hidden"}>${html}</div>`;
  rmSheet("This paper", `<div class="rdm-tochead"><input type="search" class="rdm-find" id="rmFind" aria-label="Search this paper" placeholder="Search this paper" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></div>
    <div id="rmFindOut" aria-live="polite"></div><div id="rmTocBody">${tabs}
    ${pane("contents", secs + sumBtn + rmAbbrListHTML())}${pane("highlights", hl)}
    ${pane("related", `<div id="rmRel">${relWait ? `<p class="rdm-empty">Looking for related papers in your library…</p>` : P && P.demo ? `<p class="rdm-empty">Related papers are found for papers in your library, not for the example.</p>` : ""}</div>${rg}`)}</div>`);
  if (relWait) ixRelated(P).then(rel => {
    const box = $("#rmRel"); if (!box) return;
    const miss = ixMissing();
    box.innerHTML = (rel.length ? `<h3 class="rdm-toc-h">In your library <span>${rel.length}</span></h3>` + rel.map(r => `<button type="button" class="rdm-toc-i sub rdm-rel" data-sheet="lib-open" data-v="${esc(r.L.id)}"><span><strong>${esc(r.L.label || "")}</strong> ${esc(r.L.title)}<span class="rdm-why">${r.why.map(esc).join(" · ")}</span></span><span class="pg" aria-hidden="true">›</span></button>`).join("") : `<p class="rdm-empty">No related papers in your library yet.</p>`)
      + (miss ? `<p class="rdm-findn">${miss} paper${miss === 1 ? " hasn't" : "s haven't"} been read yet, so connections to ${miss === 1 ? "it" : "them"} are missing.</p><button type="button" class="rdm-btn rdm-sumbtn" data-sheet="ix-fill">Read all papers to find connections</button>` : "");
    const n = $("#rmTabN-related"); if (n) n.textContent = rel.length ? String(rel.length) : "";
  });
  const inp = $("#rmFind");
  inp.addEventListener("input", () => { clearTimeout(RM.findT); RM.findT = setTimeout(() => rmFind(inp.value), 180); });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter") inp.blur();
    else if (e.key === "Escape") {                     // Escape clears the search first, then closes the sheet
      e.preventDefault(); e.stopPropagation();
      if (inp.value) { inp.value = ""; rmFind(""); } else rmSheetClose();
    }
  });
  // the tabs: arrow keys move between them (and show them), as in any tab list
  const tl = $("#rmTocTabs");
  tl.addEventListener("keydown", e => {
    const ks = RM_TABS.map(([k]) => k), i = ks.indexOf(RM.tocTab || "contents");
    const j = e.key === "ArrowRight" ? (i + 1) % ks.length : e.key === "ArrowLeft" ? (i + ks.length - 1) % ks.length : e.key === "Home" ? 0 : e.key === "End" ? ks.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); e.stopPropagation(); rmTocTab(ks[j]); $("#rmTab-" + ks[j])?.focus();
  });
  if (find) inp.focus({ preventScroll: true });
  else if (T === "contents") { const on = $("#rmSheetList .on"); if (on) on.scrollIntoView({ block: "center" }); }
}
function rmTocTab(k) {
  RM.tocTab = k;
  for (const [t] of RM_TABS) {
    const b = $("#rmTab-" + t), p = $("#rmPane-" + t); if (!b || !p) continue;
    b.setAttribute("aria-selected", String(t === k)); b.tabIndex = t === k ? 0 : -1; p.hidden = t !== k;
  }
  $("#rmSheetList").scrollTop = 0;
  if (k === "contents") { const on = $("#rmSheetList .on"); if (on) on.scrollIntoView({ block: "center" }); }
}
function rmOpenLib(id) {
  const lib = ixPapers(), L = lib.find(x => x.id === id), prev = S.paper && lib.find(x => x.id === S.paper.id);
  if (!L) return;
  rmSheetClose();
  ixOpen(L, null, prev ? () => { toast(`Back to ${prev.label || "the previous paper"}`); ixOpen(prev, null); } : null);
}
function rmPageOf(el) {
  const r = el.getClientRects()[0] || el.getBoundingClientRect();
  return Math.max(0, Math.min(RM.pages - 1, Math.floor((r.left - RM.flow.getBoundingClientRect().left) / RM.step)));
}

/* ---- search within the paper ---- */
function rmTextRange(p, start, end) {               // a Range over characters [start, end) of an element's text
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), r = document.createRange(); let acc = 0, ok = false;
  while (w.nextNode()) {
    const n = w.currentNode, L = n.nodeValue.length;
    if (!ok && acc + L > start) { r.setStart(n, start - acc); ok = true; }
    if (ok && acc + L >= end) { r.setEnd(n, end - acc); return r; }
    acc += L;
  }
  return null;
}
function rmFind(q) {
  const out = $("#rmFindOut"), body = $("#rmTocBody"); if (!out) return;
  q = q.trim(); RM.hits = [];
  if (q.length < 2) { out.innerHTML = ""; body.hidden = false; return; }
  body.hidden = true;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  for (const el of RM.flow.querySelectorAll("h3, h4, p")) {
    const t = el.textContent; let m; re.lastIndex = 0;
    while ((m = re.exec(t)) && RM.hits.length < 80) {
      const r = rmTextRange(el, m.index, m.index + m[0].length); if (!r) continue;
      const rect = r.getClientRects()[0] || r.getBoundingClientRect();
      const page = Math.max(0, Math.floor((rect.left - RM.flow.getBoundingClientRect().left) / RM.step));
      const a = Math.max(0, m.index - 50), b = Math.min(t.length, m.index + m[0].length + 70);
      RM.hits.push({ el, start: m.index, end: m.index + m[0].length, page,
        html: (a > 0 ? "…" : "") + esc(t.slice(a, m.index)) + "<b>" + esc(m[0]) + "</b>" + esc(t.slice(m.index + m[0].length, b)) + (b < t.length ? "…" : "") });
    }
  }
  out.innerHTML = RM.hits.length
    ? `<p class="rdm-findn">${RM.hits.length >= 80 ? "80+" : RM.hits.length} match${RM.hits.length === 1 ? "" : "es"}</p>` + RM.hits.map((h, i) => `<button type="button" class="rdm-toc-i sub rdm-hit" data-sheet="find-go" data-v="${i}"><span>${h.html}</span><span class="pg">${h.page + 1}</span></button>`).join("")
    : `<p class="rdm-findn">No matches.</p>`;
}
function rmFlash(marks) {
  setTimeout(() => { for (const m of marks) { const par = m.parentNode; if (!par) continue; while (m.firstChild) par.insertBefore(m.firstChild, m); par.removeChild(m); par.normalize(); } }, 2600);
}
function rmFindGo(i) {
  const h = RM.hits && RM.hits[i]; if (!h) return;
  rmSheetClose(); rmGo(h.page, true); rmSave();
  rmFlash(rmWrap(h.el, h.start, h.end, () => { const m = document.createElement("mark"); m.className = "rdm-found"; return m; }));
}

/* ---- highlights: saved with the paper (and in the backup), drawn into the text ---- */
const RM_HL = [["y", "yellow"], ["g", "green"], ["p", "pink"], ["b", "blue"]];
function rmWrap(p, start, end, make) {              // wrap characters [start, end) of p's text, across elements
  const nodes = [], w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let acc = 0;
  while (w.nextNode()) { const n = w.currentNode, L = n.nodeValue.length; if (acc < end && acc + L > start) nodes.push([n, acc]); acc += L; }
  const made = [];
  for (const [node, at] of nodes) {
    let n = node; const a = Math.max(start, at) - at, b = Math.min(end, at + node.nodeValue.length) - at;
    if (b <= a) continue;
    if (b < n.nodeValue.length) n.splitText(b);
    if (a > 0) n = n.splitText(a);
    const m = make(); n.parentNode.insertBefore(m, n); m.appendChild(n); made.push(m);
  }
  return made;
}
function rmApplyMarks() {
  if (!RM.marks || !RM.marks.length) return;
  const paras = [...RM.flow.querySelectorAll("p")];
  for (const mk of RM.marks) {
    if (!mk.text) continue;
    const p = paras.find(x => mk.para && x.textContent.startsWith(mk.para) && x.textContent.includes(mk.text)) || paras.find(x => x.textContent.includes(mk.text));
    if (!p) continue;                                  // e.g. in the collapsed Methods
    const i = p.textContent.indexOf(mk.text);
    rmWrap(p, i, i + mk.text.length, () => { const m = document.createElement("mark"); m.className = "rdm-hl c-" + (mk.color || "y"); m.dataset.m = mk._id; return m; });
  }
}
async function rmHighlight(color) {
  const P = S.paper; if (!P || !RM.sel) return;
  const at = RM.pages > 1 ? RM.page / (RM.pages - 1) : 0;
  const ex = (RM.marks || []).find(m => m.text === RM.sel.sentence);
  try {
    if (ex) { await delChild(P, "marks", ex._id); RM.marks = RM.marks.filter(m => m !== ex); }
    const m = await addChild(P, "marks", { text: RM.sel.sentence, para: RM.sel.raw.slice(0, 80), color });
    RM.marks = [...(RM.marks || []), m];
    rmSheetClose(); rmRender(at);
    if (P.demo) toast("Highlighted (example paper: not saved)");
  } catch { toast("Couldn't save the highlight."); }
}
async function rmUnhighlight() {
  const P = S.paper, ex = RM.sel && (RM.marks || []).find(m => m.text === RM.sel.sentence); if (!P || !ex) return;
  const at = RM.pages > 1 ? RM.page / (RM.pages - 1) : 0;
  try { await delChild(P, "marks", ex._id); RM.marks = RM.marks.filter(m => m !== ex); rmSheetClose(); rmRender(at); }
  catch { toast("Couldn't remove the highlight."); }
}
function rmMarkGo(id) {
  const el = RM.flow.querySelector(`mark.rdm-hl[data-m="${CSS.escape(id)}"]`); if (!el) return;
  rmSheetClose(); rmGo(rmPageOf(el), true); rmSave();
}

/* ---- one line per section, from Claude, kept with the reading state (and so in the backup) ---- */
function rmSums() { try { const o = JSON.parse(localStorage.getItem("pwread:sum:" + RM.paperId) || "null"); return o && o.s; } catch { return null; } }
async function rmSummarise() {
  const out = $("#rmSumOut"), P = S.paper, pid = RM.paperId; if (!out || !P) return;
  if (!claudeReady(out)) return;
  out.innerHTML = `<div class="thinking"><span class="dot"></span>Claude is reading the sections…</div>`;
  const name = SEC_NAMES;
  const parts = [];
  if (P.abstract) parts.push(["Abstract", P.abstract]);
  for (const k of ["intro", "results", "discussion", "methods"]) if ((P.sections[k] || []).length) parts.push([name[k], P.sections[k].join("\n")]);
  const per = Math.floor(24000 / Math.max(1, parts.length));
  const prompt = `Summarise each section of this scientific paper in ONE plain sentence of at most 25 words: what that section says or shows, so a reader sees the paper's argument at a glance. Reply with only JSON: {${parts.map(([n]) => `"${n}": "..."`).join(", ")}}
Paper: ${P.title || ""}
${parts.map(([n, t]) => `### ${n}\n${t.slice(0, per)}`).join("\n\n")}`;
  try {
    const j = await S.sample.json(prompt, { maxTokens: 900, cache: { gcTime: 864e5 * 30 } });
    const s = {}; for (const [n] of parts) if (j && typeof j[n] === "string") s[n] = j[n].trim();
    if (!Object.keys(s).length) throw { code: "invalid_json" };
    try { localStorage.setItem("pwread:sum:" + pid, JSON.stringify({ t: Date.now(), s })); } catch {}
    if (RM.paperId === pid && RM.sheetKind === "toc" && !RM.sheet.hidden) rmShowToc();
  } catch (e) {
    const o = $("#rmSumOut"); if (o) o.innerHTML = `<p class="note">${esc(typeof errCopy === "function" ? errCopy(e) : "Couldn't reach Claude.")}</p>`;
  }
}

/* ---- display settings: size, line spacing, theme ---- */
const RM_LOOKS = [["auto", "Auto"], ["light", "Light"], ["sepia", "Sepia"], ["dark", "Dark"]];
const RM_LH = [["1.45", "Compact"], ["1.6", "Normal"], ["1.85", "Relaxed"]];
function rmPref(k, d) { try { return localStorage.getItem("pwread:" + k) || d; } catch { return d; } }
function rmSetPref(k, v) { try { localStorage.setItem("pwread:" + k, v); } catch {} }
function rmApplyLook() {
  const look = rmPref("look", "auto");
  if (look === "auto") delete RM.el.dataset.look; else RM.el.dataset.look = look;
  RM.flow.style.lineHeight = rmPref("lh", "1.6");
  rmApplyAids();
}
// the Display sheet, in groups: text size, typeface and spacing, theme, reading guide, read aloud
function rmShowLook() {
  const keep = RM.sheetKind === "look" && !RM.sheet.hidden ? $("#rmSheetList").scrollTop : 0;   // stay where you were after a change
  RM.sheetKind = "look";
  const look = rmPref("look", "auto"), lh = rmPref("lh", "1.6");
  // one segmented control for every choice: the selected option is pressed (aria-pressed), the same look everywhere
  const seg = (k, opts, cur) => `<div class="seg rdm-opt" role="group">${opts.map(([v, l]) => `<button type="button" aria-pressed="${v === cur}" data-sheet="${k}" data-v="${v}">${l}</button>`).join("")}</div>`;
  let n = 0;
  const row = (label, ctl, note) => { const id = "rmLk" + (++n); return `<div class="rdm-row"><span class="rdm-row-l" id="${id}">${label}</span><div class="rdm-row-c">${ctl.replace(/role="group"/, `role="group" aria-labelledby="${id}"`)}</div>${note ? `<p class="rdm-aid">${note}</p>` : ""}</div>`; };
  const grp = (title, body) => `<section class="rdm-grp" aria-labelledby="rmG${++n}"><h3 class="rdm-grp-h" id="rmG${n}">${title}</h3>${body}</section>`;
  const i = RM_SIZES.indexOf(RM.size);
  const size = `<div class="rdm-stepper" role="group"><button type="button" class="rdm-btn" data-sheet="size" data-v="-1" aria-label="Smaller text"${i <= 0 ? " disabled" : ""}>A−</button><output aria-live="polite">${RM.size} px</output><button type="button" class="rdm-btn" data-sheet="size" data-v="1" aria-label="Larger text"${i >= RM_SIZES.length - 1 ? " disabled" : ""}>A+</button></div>`;
  rmSheet("Text and display", `<div class="rdm-look">
    ${grp("Text size", row("Size", size))}
    ${grp("Typeface and spacing", rmAidsTypeHTML(seg, row, row("Line height", seg("lh", RM_LH, lh))))}
    ${grp("Theme", row("Page", seg("look", RM_LOOKS, look), "Auto follows the app's light or dark setting."))}
    ${grp("Reading guide", rmAidsGuideHTML(seg, row))}
    ${grp("Read aloud", rmWordsLookHTML(seg, row))}</div>`);
  if (keep) { const box = $("#rmSheetList"); box.scrollTop = keep; requestAnimationFrame(() => { box.scrollTop = keep; }); }
}
function rmSheetAction(b) {
  const k = b.dataset.sheet, v = b.dataset.v;
  if (k === "go") { rmSheetClose(); rmGo(+b.dataset.p, true); rmSave(); }
  else if (k === "size") rmResize(+v);
  else if (k === "toc-tab") rmTocTab(v);
  else if (k === "lh") { rmSetPref("lh", v); const at = RM.pages > 1 ? RM.page / (RM.pages - 1) : 0; rmApplyLook(); rmLayout(at); rmShowLook(); }
  else if (k === "look") { rmSetPref("look", v); rmApplyLook(); rmShowLook(); }
  else if (["font", "margin", "ls", "align", "focus", "keys", "spell"].includes(k)) rmAidPref(k, v);
  else if (["wpm", "rate"].includes(k)) rmWordsPref(k, v);
  else if (k === "abbr-ask") rmAskAbbr(+v);
  else if (k === "abbr-all") { $("#rmSheetList").querySelectorAll(".rdm-more-abbr").forEach(x => x.hidden = false); b.remove(); }
  else if (k === "explain") rmExplain();
  else if (k === "note") rmSaveNote(false);
  else if (k === "note-x") rmSaveNote(true);
  else if (k === "atl-zoom") atlasZoom(b);
  else if (k === "hl") rmHighlight(v);
  else if (k === "hl-x") rmUnhighlight();
  else if (k === "find-go") rmFindGo(+v);
  else if (k === "mark-go") rmMarkGo(v);
  else if (k === "reg-open") rmShowTerm(+v);
  else if (k === "sum") rmSummarise();
  else if (k === "lib-open") rmOpenLib(v);
  else if (k === "regs-all") { RM.flow && $("#rmSheetList").querySelectorAll(".rdm-more-reg").forEach(x => x.hidden = false); b.remove(); }
  else if (k === "ix-fill") { b.disabled = true; ixFill(true, (i, n) => { b.textContent = `Reading papers… ${i} / ${n}`; }).then(() => { if (RM.sheetKind === "toc" && !RM.sheet.hidden) rmShowToc(); }); }
  else if (k === "atl-explain") rmExplainRegion();
  else if (k === "atl-reg" && RM.region) rmShowRegion(RM.region.gi, +v);
}

/* ---- tap a term for its meaning: key terms from the primer, and abbreviations defined in the paper ---- */
// Schwartz & Hearst (2003): the long form is the shortest run of words before "(SF)" whose letters contain the
// short form's characters in order, starting at the beginning of a word.
function rmLongForm(sf, cand) {
  const S_ = sf.toLowerCase(), L = cand.toLowerCase();
  let s = S_.length - 1, l = L.length - 1;
  for (; s >= 0; s--) {
    const c = S_[s]; if (!/[a-z0-9]/.test(c)) continue;
    while (l >= 0 && (L[l] !== c || (s === 0 && l > 0 && /[a-z0-9]/.test(L[l - 1])))) l--;
    if (l < 0) return null;
    l--;
  }
  const lf = cand.slice(L.lastIndexOf(" ", l) + 1).trim().replace(/^[^A-Za-z]+/, "");
  const words = lf.split(/\s+/).length;
  return lf.length > sf.length && words <= Math.min(sf.length + 5, sf.length * 2) ? lf : null;
}
// a long form is a few plain words: not a URL, a table row or a catalogue number
const rmPlainLf = lf => !/https?:|www\.|[()•=;]|\d{3,}/.test(lf) && lf.length < 80;
function rmAbbrevs(text) {
  const out = new Map(); let m;
  const re = /\(([A-Za-z][A-Za-z0-9\-]{1,9})(?:[;,][^)]*)?\)/g;
  while ((m = re.exec(text))) {
    const sf = m[1], caps = (sf.match(/[A-Z]/g) || []).length;
    if (out.has(sf) || caps < 2 && !(caps === 1 && /^[A-Z]/.test(sf) && sf.length <= 3)) continue;
    const before = text.slice(Math.max(0, m.index - 200), m.index).split(/[.;:(]\s/).pop().trim();
    const lf = rmLongForm(sf, before.split(/\s+/).slice(-(Math.min(sf.length + 5, sf.length * 2))).join(" "));
    if (lf && rmPlainLf(lf)) out.set(sf, lf);
  }
  // lists such as "ACA, anterior cingulate area; CLA, claustrum; ..."
  const list = /(?:^|[;:]\s*)([A-Z][A-Za-z0-9\-]{1,8}),\s+([a-z][a-z0-9\- ']{2,60}?)(?=;|\.\s|$)/g;
  const found = [...text.matchAll(list)];
  if (found.length >= 3) for (const f of found) if (!out.has(f[1]) && rmPlainLf(f[2])) out.set(f[1], f[2].trim());
  return out;
}
function rmDecorate(P) {
  RM.gloss = [];
  const terms = ((P.primer && P.primer.keyTerms) || []).filter(t => t && t.term && t.definition && t.term.length > 2);
  const abbr = rmAbbrevs((P.abstract || "") + " " + RM.allText);
  const hasAtlas = typeof atlasTerms === "function" && ATL.idx;
  for (const t of terms) {
    const regs = hasAtlas ? (atlasMatch(t.term) ? [atlasMatch(t.term)] : atlasFindIn(t.term)) : [];
    RM.gloss.push({ word: t.term, title: t.term, def: t.definition, ci: true, regs });
  }
  // "complex spikes (CSs)": keep it as CS, so both CS and CSs link to it
  const sing = new Map();
  for (const [sf, lf] of abbr) {
    const base = /[A-Z0-9]s$/.test(sf) ? sf.slice(0, -1) : sf;
    if (!sing.has(base) || base === sf) sing.set(base, base === sf ? lf : lf.replace(/(\w)s$/, "$1"));
  }
  for (const [sf, lf] of sing) if (!RM.gloss.some(g => g.word.toLowerCase() === sf.toLowerCase())) {
    const r = hasAtlas && (atlasMatch(lf) || atlasMatch(sf));
    RM.gloss.push({ word: sf, title: sf, def: lf, abbr: true, regs: r ? [r] : [] });
  }
  // brain regions: Allen names and their common alternatives open the atlas
  if (hasAtlas) for (const e of atlasTerms()) {
    const lw = e.word.toLowerCase();
    if (!RM.gloss.some(g => g.word.toLowerCase() === lw)) RM.gloss.push({ word: e.word, title: e.word, ci: e.ci, regs: [e], region: true });
  }
  // abbreviations used but never spelled out: tappable too, explained by Claude on request (kept per paper)
  const cache = RM.paperId ? rmAbbrCache() : {}, known = new Set(RM.gloss.map(g => g.word.toLowerCase()));
  // only the paper's own text: the "other" section holds author contributions and their initials
  const body = (P.abstract || "") + " " + ["intro", "results", "discussion", "methods"].flatMap(k => P.sections[k] || []).join(" ");
  for (const w of rmUndefined(body, known)) {
    const c = cache[w]; RM.gloss.push({ word: w, title: w, def: c ? c.full : null, what: c ? c.what : "", abbr: true, undef: true, regs: [] });
  }
  if (!RM.gloss.length) return;
  const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const order = RM.gloss.map((g, i) => i).sort((a, b) => RM.gloss[b].word.length - RM.gloss[a].word.length);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${order.map(i => escRe(RM.gloss[i].word)).join("|")})(?:s|['’]s)?(?![\\p{L}\\p{N}])`, "giu");
  const find = w => { const lw = w.toLowerCase(); return RM.gloss.findIndex(g => g.ci ? g.word.toLowerCase() === lw : g.word === w); };
  let seenRegion = new Set(), seenSpell = new Set();   // a region is linked once per section, a term once per paragraph
  for (const p of RM.flow.querySelectorAll("h3, p")) {
    if (p.tagName === "H3") { seenRegion = new Set(); seenSpell = new Set(); continue; }
    const seen = new Set();
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest("button") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const t = node.nodeValue; re.lastIndex = 0; let m, pos = 0; const frag = document.createDocumentFragment(); let any = false;
      while ((m = re.exec(t))) {
        if (m[0].length > m[1].length && !/^(?:s|['’]s)$/.test(m[0].slice(m[1].length))) continue;   // "PNS" is not a plural of "PN"
        const gi = find(m[1]); if (gi < 0 || seen.has(gi)) continue;   // first mention in each paragraph only
        const g = RM.gloss[gi], rk = g.region ? g.regs[0].ids.join(",") : null;
        if (rk && seenRegion.has(rk)) continue;
        seen.add(gi); if (rk) seenRegion.add(rk); any = true;
        frag.append(t.slice(pos, m.index));
        const b = document.createElement("button"); b.type = "button"; b.className = "rdm-term" + (g.regs && g.regs.length ? " reg" : ""); b.dataset.g = String(gi); b.textContent = m[0];
        // the full name after the first use in each section (shown when "Spell out abbreviations" is on), unless
        // this is where the paper itself defines it: "projection neurons (PNs)"
        if (g.abbr && g.def && !seenSpell.has(gi)) { seenSpell.add(gi); if (t[m.index - 1] !== "(") b.dataset.lf = g.def; }
        frag.append(b); pos = m.index + m[0].length;
      }
      if (any) { frag.append(t.slice(pos)); node.replaceWith(frag); }
    }
  }
}
function rmShowTerm(gi, ri) {
  const g = RM.gloss[+gi]; if (!g) return;
  if (g.regs && g.regs.length) return rmShowRegion(+gi, +ri || 0);
  RM.sheetKind = "term";
  if (g.undef) {
    rmSheet("Abbreviation", `<div class="rdm-def"><div class="rdm-cite-k">${esc(g.title)}</div>${g.def
      ? `<div class="rdm-cite-ref">${esc(g.def)}</div>${g.what ? `<p class="rdm-cite-ref">${esc(g.what)}</p>` : ""}<p class="note">From Claude: the paper doesn't spell this one out.</p>`
      : `<p class="note">The paper doesn't spell this one out.</p><button type="button" class="rdm-btn primary" data-sheet="abbr-ask" data-v="${+gi}">Ask Claude</button><div class="rdm-explain" id="rmExplain"></div>`}</div>`);
    return;
  }
  rmSheet(g.abbr ? "Abbreviation" : "Key term", `<div class="rdm-def"><div class="rdm-cite-k">${esc(g.title)}</div><div class="rdm-cite-ref">${esc(g.def)}</div>${g.abbr ? "" : `<p class="note">From the primer.</p>`}</div>`);
}

/* ---- a brain region: where it is (coronal and sagittal section), what it is, and Claude on demand ---- */
function rmShowRegion(gi, ri) {
  const g = RM.gloss[gi], e = g.regs[ri]; if (!e) return;
  RM.sheetKind = "region"; RM.region = { gi, ri, e };
  const note = g.abbr ? `In this paper, <strong>${esc(g.word)}</strong> stands for ${esc(g.def)}.`
    : !g.region && g.def ? `<strong>${esc(g.title)}</strong>: ${esc(g.def)} <span class="muted">(from the primer)</span>` : "";
  const pick = g.regs.length > 1 ? `<div class="seg rdm-opt atl-pick" role="group" aria-label="Region">${g.regs.map((r, i) => `<button type="button" aria-pressed="${i === ri}" data-sheet="atl-reg" data-v="${i}">${esc(r.word)}</button>`).join("")}</div>` : "";
  const box = rmSheet(g.abbr ? "Abbreviation · brain region" : "Brain region", pick + atlasSheetHTML(e, note));
  atlasFill(box, e);
}
async function rmExplainRegion() {
  const out = $("#rmExplain"), P = S.paper, r = RM.region; if (!out || !r) return;
  if (!claudeReady(out, "the atlas works offline")) return;
  const ids = r.e.ids, name = atlasName(ids);
  const path = atlasLineage(ids[0]).slice(1).reverse().map(i => atlasS(i)).filter(s => s && s.a !== "root" && s.a !== "grey").map(s => s.n).join(" > ");
  out.innerHTML = `<div class="thinking"><span class="dot"></span>Claude is looking up ${esc(name)}…</div>`;
  RM.explainCtl?.abort(); RM.explainCtl = new AbortController();
  const prompt = `A researcher reading a neuroscience paper on their phone tapped a brain region they don't know well. Describe the mouse brain region below in plain words: where it is, its main cell types or organisation, its main inputs and outputs, and what it is known to do. Then, in one or two sentences, say why it may matter for this paper. 5 to 8 short sentences, no preamble, no headings.
Region: ${name} (Allen Mouse Brain Atlas: ${ids.map(i => atlasS(i).a).join(", ")}; hierarchy: ${path})
Paper: ${P.title || ""}
${P.primer && P.primer.coreQuestion ? "Core question of the paper: " + P.primer.coreQuestion : ""}`;
  try {
    const fmt = t => esc(t).split(/\n{2,}/).map(x => `<p>${x.replace(/\n/g, " ").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`).join("");
    const res = await S.sample(prompt, { maxTokens: 700, signal: RM.explainCtl.signal, cache: { gcTime: 864e5 * 30 }, onText: ({ text }) => { const o = $("#rmExplain"); if (o) o.innerHTML = fmt(text); } });
    const o = $("#rmExplain"); if (o) o.innerHTML = fmt(res.text);
  } catch (e) {
    if (e && e.code === "cancelled") return;
    const o = $("#rmExplain"); if (o) o.innerHTML = `<p class="note">${esc(typeof errCopy === "function" ? errCopy(e) : "Couldn't reach Claude.")}</p>`;
  }
}

/* ---- long-press a sentence: explain it, or save it to the paper's notes ---- */
function rmLongPress(x, y) {
  const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
  const p = r && r.startContainer && (r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer).closest(".rdm-flow p");
  if (!p) { RM.pressed = false; return; }
  // offset of the press within the paragraph's text (works whether the caret lands in a text node or between elements)
  let off = 0;
  try { const pre = document.createRange(); pre.setStart(p, 0); pre.setEnd(r.startContainer, r.startOffset); off = pre.toString().length; } catch {}
  const text = p.textContent;
  // split on a copy where the citation chips ("refs") are blanked out, so "... organization refs. Accordingly" still splits
  let split = "";
  { const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; split += n.parentElement.closest(".rdm-cite") ? "#".repeat(n.nodeValue.length) : n.nodeValue; } }
  const parts = typeof splitSentences === "function" ? splitSentences(split) : [split];
  let start = 0, sent = text;
  for (const part of parts) { const i = split.indexOf(part, start); if (i < 0) continue; if (off >= i && off <= i + part.length) { sent = text.slice(i, i + part.length); break; } start = i + part.length; }
  const clean = t => t.replace(/\s*refs(?=[\s.,;:)]|$)/g, "").replace(/\s+/g, " ").trim();
  RM.sel = { sentence: sent.trim(), paragraph: clean(text), quote: clean(sent), raw: text };
  const mk = (RM.marks || []).find(m => m.text === RM.sel.sentence);
  // (no in-page highlight: WebKit paints CSS highlights in the wrong place inside the paged column layout)
  navigator.vibrate?.(10);
  RM.sheetKind = "sentence";
  rmSheet("Sentence", `<blockquote class="rdm-quote">${esc(RM.sel.quote)}</blockquote>
    <div class="rdm-seg"><button type="button" class="rdm-btn primary" data-sheet="explain">Explain</button><button type="button" class="rdm-btn" data-sheet="note">Save to notes</button></div>
    <div class="rdm-seg rdm-hlrow"><span class="lbl">Highlight</span>${RM_HL.map(([c, l]) => `<button type="button" class="rdm-sw c-${c}${mk && mk.color === c ? " on" : ""}" aria-pressed="${!!(mk && mk.color === c)}" data-sheet="hl" data-v="${c}" aria-label="Highlight ${l}"></button>`).join("")}${mk ? `<button type="button" class="rdm-btn" data-sheet="hl-x">Remove</button>` : ""}</div>
    <div class="rdm-explain" id="rmExplain"></div>`);
}
async function rmExplain() {
  const out = $("#rmExplain"), P = S.paper; if (!out || !RM.sel) return;
  if (!claudeReady(out, "everything you've saved still opens")) return;
  out.innerHTML = `<div class="thinking"><span class="dot"></span>Claude is reading the sentence…</div>`;
  RM.explainCtl?.abort(); RM.explainCtl = new AbortController();
  const prompt = `You are helping a researcher read a scientific paper on their phone. Explain the sentence below in plain words: what it says, what any jargon or abbreviations mean, and how it fits the paper's argument. Use 3 to 6 short sentences, no preamble, no headings. If it refers to a figure panel, say what to look for in it.
Paper: ${P.title || ""}
${P.primer && P.primer.coreQuestion ? "Core question of the paper: " + P.primer.coreQuestion + "\n" : ""}Paragraph: ${RM.sel.paragraph.slice(0, 3000)}
Sentence to explain: ${RM.sel.quote}`;
  try {
    const fmt = t => esc(t).split(/\n{2,}/).map(x => `<p>${x.replace(/\n/g, " ").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`).join("");
    const r = await S.sample(prompt, { maxTokens: 700, signal: RM.explainCtl.signal, cache: { gcTime: 864e5 * 30 }, onText: ({ text }) => { const o = $("#rmExplain"); if (o) o.innerHTML = fmt(text); } });
    RM.sel.answer = r.text;
    const o = $("#rmExplain"); if (o) o.innerHTML = fmt(r.text) + `<button type="button" class="rdm-btn" data-sheet="note-x">Save sentence and explanation</button>`;
  } catch (e) {
    if (e && e.code === "cancelled") return;
    const o = $("#rmExplain"); if (o) o.innerHTML = `<p class="note">${esc(typeof errCopy === "function" ? errCopy(e) : "Couldn't reach Claude.")}</p>`;
  }
}
async function rmSaveNote(withAnswer) {
  const P = S.paper; if (!P || !RM.sel) return;
  const text = `“${RM.sel.quote}”` + (withAnswer && RM.sel.answer ? `\n\nClaude: ${RM.sel.answer}` : "");
  try {
    const n = await addChild(P, "notes", { kind: withAnswer ? "saved" : "note", text, fig: null, panel: null });
    P.notes = [...(P.notes || []), n]; persistPaper(P);
    toast(P.demo ? "Note added (example paper: not saved)" : "Saved to this paper's notes");
    rmSheetClose();
  } catch (e) { toast("Couldn't save the note."); }
}

/* ---- from the figure viewer back to where the text discusses that figure or panel ---- */
function rmJumpToRef(n, panel) {
  const refs = [...RM.flow.querySelectorAll(`.ref[data-fig="${n}"]`)];
  const want = panel ? String(panel).toUpperCase() : null;
  const el = (want && refs.find(r => (r.dataset.panel || "").toUpperCase() === want || new RegExp(`\\b${n}\\s*[A-Za-z]*${want}`, "i").test(r.textContent))) || refs[0];
  if (!el) { toast(`Figure ${n} isn't mentioned in the text.`); return false; }
  const left = RM.flow.getBoundingClientRect().left;
  rmGo(Math.max(0, Math.floor((el.getBoundingClientRect().left - left) / RM.step)), true); rmSave();
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  return true;
}
async function rmShowInText(n, panel) {
  if (!RM.el || RM.el.hidden) await rmOpen();
  setTimeout(() => rmJumpToRef(n, panel), 60);
}

/* ---- the library shows how far you read ---- */
function rmProgressLabel(id) {
  const s = rmLoad(id); if (!s || s.at == null) return "";
  const pct = Math.round(s.at * 100);
  return pct >= 99 ? "Read to the end" : `Read ${pct}%${s.sec ? " · " + s.sec : ""}`;
}

/* the Read button: shown while a paper is open (render() keeps it in step) */
(function () {
  const chat = $("#chatBtn"); if (!chat) return;
  const b = document.createElement("button");
  b.type = "button"; b.id = "readBtn"; b.className = "btn"; b.textContent = "Read";
  b.title = "Read the paper page by page"; b.hidden = true;
  chat.insertAdjacentElement("beforebegin", b);
  b.addEventListener("click", e => { e.stopPropagation(); rmOpen(); });
  RM.btn = b;
})();

document.addEventListener("keydown", e => {
  // e.defaultPrevented: the figure viewer (registered first) already used this key, e.g. Escape closed it
  if (!RM.el || RM.el.hidden || e.defaultPrevented || (typeof FV !== "undefined" && FV.el && !FV.el.hidden)) return;
  if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (RM.rs && RM.rs.open) { if (rmRsvpKey(e)) { e.stopPropagation(); e.preventDefault(); } return; }
  // ⌘F / Ctrl+F: search this paper (instead of the browser's find, which can't see the other pages)
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "f" || e.key === "F")) { rmShowToc(null, true); e.stopPropagation(); e.preventDefault(); return; }
  // a sheet is open: Escape closes the sheet (not the reader), and other keys don't turn pages behind it
  if (RM.sheet && !RM.sheet.hidden) { if (e.key === "Escape") { rmSheetClose(); e.stopPropagation(); e.preventDefault(); } return; }
  if (e.key === "Escape") rmClose();
  else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey && rmSideFits()) rmSideToggle();   // the figure beside the text
  // with a reading guide on, the arrows and the space bar move it; Page Up/Down still turn pages
  else if (RM.focusOn && (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ")) rmFocusStep(1);
  else if (RM.focusOn && (e.key === "ArrowUp" || e.key === "ArrowLeft")) rmFocusStep(-1);
  else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") rmGo(RM.page + 1);
  else if (e.key === "ArrowLeft" || e.key === "PageUp") rmGo(RM.page - 1);
  else return;
  e.stopPropagation(); e.preventDefault();
}, true);
