"use strict";
/* Reading mode on a wide screen (the Mac): the figure the text is talking about, beside the text.
   The panel follows the page: it shows the first figure mentioned on the page you're on, and keeps the last one
   while a page mentions none. Tapping a figure reference shows that figure in the panel instead of opening the
   full-screen viewer (the panel's own button opens that). On a phone the panel never appears. */
const RM_SIDE_MQ = "(min-width: 1100px)";
const rmSideOn = () => matchMedia(RM_SIDE_MQ).matches && !!(S.paper && S.paper.figures && S.paper.figures.length);

// where each figure is mentioned, as pages (worked out with every layout)
function rmSideRefs() {
  RM.figAt = [];
  if (!rmSideOn()) return;
  for (const el of RM.flow.querySelectorAll(".ref[data-fig], .rdm-figcard[data-fig]")) {
    RM.figAt.push({ n: +el.dataset.fig, panel: el.dataset.panel || null, page: rmPageOf(el) });
  }
}
// after a page turn: the first figure mentioned on this page, if any
function rmSideFollow(p) {
  const side = $("#rmSide"); if (!side) return;
  side.hidden = !rmSideOn();
  if (side.hidden) return;
  const here = (RM.figAt || []).find(x => x.page === p);
  if (here) rmSideShow(here.n, here.panel);
  else if (!RM.sideFig) {                              // nothing shown yet: the last figure mentioned before this page, or the first
    const before = (RM.figAt || []).filter(x => x.page < p).pop();
    rmSideShow(before ? before.n : S.paper.figures[0].n, before ? before.panel : null);
  }
}

async function rmSideImg(f) {
  if (f.img) return f.img;
  const P = S.paper; if (!P || P.demo) return null;
  RM.sideImgs = RM.sideImgs || new Map();
  const key = P.id + ":" + f.n;
  if (RM.sideImgs.has(key)) return RM.sideImgs.get(key);
  if (!P.doc && P.docReady) await P.docReady;
  if (!P.doc) return null;
  const box = f.det ? f.det.box : f.autoBox;
  const cv = await pageCanvas(f.det?.page || f.page);
  const img = box ? cropTo(cv, box) : cv.toDataURL("image/jpeg", .85);
  RM.sideImgs.set(key, img);
  return img;
}

async function rmSideShow(n, panel) {
  const P = S.paper, side = $("#rmSide"); if (!P || !side || !rmSideOn()) return;
  const figs = P.figures, i = figs.findIndex(f => f.n === n); if (i < 0) return;
  const f = figs[i];
  if (RM.sideFig === n && side.dataset.paper === String(P.id)) return;
  RM.sideFig = n; side.dataset.paper = String(P.id);
  const L = typeof splitLegend === "function" ? splitLegend(f.legend || "") : { title: "", body: f.legend || "" };
  const title = (L.title || "").replace(/[\s,;:]+$/, "");
  const body = (f.legend || "").replace(/^\s*(?:Figure|Fig\.?)\s*\d+\s*[.:|—–]?\s*/i, "");
  side.innerHTML = `<div class="rdm-side-h"><span class="k">Figure ${f.n} <span>of ${figs.length}</span></span>
      <span class="rdm-side-nav"><button type="button" class="rdm-btn" data-side="prev" ${i === 0 ? "disabled" : ""} aria-label="Previous figure">‹</button><button type="button" class="rdm-btn" data-side="next" ${i === figs.length - 1 ? "disabled" : ""} aria-label="Next figure">›</button><button type="button" class="rdm-btn" data-side="open">Open</button></span></div>
    <button type="button" class="rdm-side-img" data-side="open" aria-label="Open Figure ${f.n}"><span class="rdm-side-wait">Loading the figure…</span></button>
    <div class="rdm-side-text">${title ? `<h4>${esc(title)}</h4>` : ""}<p>${esc(title && body.startsWith(title) ? body.slice(title.length).replace(/^[\s.:]+/, "") : body)}</p></div>`;
  side.scrollTop = 0;
  side.dataset.panel = panel || "";
  try {
    const img = await rmSideImg(f);
    if (RM.sideFig !== n) return;                        // another figure was asked for meanwhile
    const box = side.querySelector(".rdm-side-img");
    box.innerHTML = img ? `<img src="${img}" alt="Figure ${f.n}">` : `<span class="rdm-side-wait">Open the figure to see it.</span>`;
  } catch (e) { console.warn("side figure", e); }
}

function rmSideAction(b) {
  const P = S.paper; if (!P) return;
  const figs = P.figures, i = figs.findIndex(f => f.n === RM.sideFig), a = b.dataset.side;
  if (a === "prev" && i > 0) rmSideShow(figs[i - 1].n);
  else if (a === "next" && i < figs.length - 1) rmSideShow(figs[i + 1].n);
  else if (a === "open" && i >= 0) rmOpenRef(figs[i].n, $("#rmSide").dataset.panel || null);
}

// the panel comes and goes with the window width
matchMedia(RM_SIDE_MQ).addEventListener?.("change", () => { if (RM.el && !RM.el.hidden) { RM.sideFig = null; rmSideRefs(); rmSideFollow(RM.page); } });
