"use strict";
/* ---------- figure viewer: full-screen zoom and pan, one panel at a time ----------
   Tap the figure to open it full screen: pinch or double-tap to zoom, drag to move around.
   On a touch screen, tapping a panel on the figure opens just that panel; swipe left/right (or use
   the arrows and letter buttons) to step through the panels. The panel you are looking at is pinned,
   so its legend and citing sentences are highlighted when you close the viewer.
   Self-contained: it listens in the capture phase and leaves events.js untouched. The panel buttons
   under the figure keep their old job (pin and scroll the text). */
const FV = {
  el: null, img: null, vp: null,
  fig: null, panels: [], idx: -1,        // idx -1 = whole figure, otherwise index into panels
  iw: 0, ih: 0,                          // logical image size the maths works in
  s: 1, x: 0, y: 0, s0: 1,               // current transform, and the scale that fits the current view
  dx: 0,                                 // sideways swipe offset between panels
  pts: new Map(), g: null, lastTap: 0, onClose: null, anim: false, raf: 0, cards: [], srcGen: 0,
  hi: new Map(), sharpBusy: false, sharpT: 0, srcW: 0,   // sharper render of the current figure, kept in memory only
  PAD: .015, MAXZ: 8, GAP: 28,
};

/* While a full-screen overlay (this viewer, or the reading mode) is open, the web view itself must not zoom:
   quick taps would otherwise trigger iOS's double-tap zoom. The page's normal setting is restored on close. */
const PWZoomLock = {
  n: 0, saved: null,
  set(on) {
    const m = document.querySelector('meta[name="viewport"]'); if (!m) return;
    if (on) { if (this.n++ === 0) { this.saved = m.content; m.content = this.saved + ", minimum-scale=1, maximum-scale=1, user-scalable=no"; } }
    else if (this.n > 0 && --this.n === 0 && this.saved != null) { m.content = this.saved; this.saved = null; }
  }
};

function fvBuild() {
  const el = document.createElement("div");
  el.className = "fv"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Figure viewer");
  el.innerHTML = `<div class="fv-top"><span class="fv-title" id="fvTitle"></span><span class="fv-tools"><button type="button" class="fv-btn" data-fv="text" aria-label="Show where the text discusses this">In text</button><button type="button" class="fv-btn" data-fv="close" aria-label="Close figure viewer">Close</button></span></div>
    <div class="fv-vp" id="fvVp"><img id="fvImg" alt="" draggable="false"><canvas class="fv-card" aria-hidden="true"></canvas><canvas class="fv-card" aria-hidden="true"></canvas><canvas class="fv-card" aria-hidden="true"></canvas></div>
    <div class="fv-bot" id="fvBot"><button type="button" class="fv-btn fv-arrow" data-fv="prev" aria-label="Previous panel">‹</button><div class="fv-chips" id="fvChips"></div><button type="button" class="fv-btn fv-arrow" data-fv="next" aria-label="Next panel">›</button></div>`;
  document.body.appendChild(el);
  FV.el = el; FV.img = el.querySelector("#fvImg"); FV.vp = el.querySelector("#fvVp");
  FV.cards = [...el.querySelectorAll(".fv-card")];
  FV.img.addEventListener("load", () => { FV.srcGen++; if (!FV.el.hidden) fvApply(); });   // a sharper image arrived: redraw the cards
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-fv]"); if (!b) return;
    e.stopPropagation();
    const a = b.dataset.fv;
    if (a === "close") fvClose();
    else if (a === "text") {   // back to the sentence that cites this panel (or figure), in the reading mode
      const f = FV.fig, p = FV.idx >= 0 ? FV.panels[FV.idx].label : null;
      FV.onClose = null; fvClose();
      if (typeof rmShowInText === "function") rmShowInText(f.n, p);
    }
    else if (a === "prev") fvStep(-1);
    else if (a === "next") fvStep(1);
    else if (a === "show") { const i = +b.dataset.i; if (!FV.anim && i !== FV.idx) fvShow(i); }
  });
  const vp = FV.vp;
  vp.addEventListener("pointerdown", fvDown);
  vp.addEventListener("pointermove", fvMove);
  vp.addEventListener("pointerup", fvUp);
  vp.addEventListener("pointercancel", fvUp);
  vp.addEventListener("wheel", e => { e.preventDefault(); const r = vp.getBoundingClientRect(); fvZoomAt(e.clientX - r.left, e.clientY - r.top, FV.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
  new ResizeObserver(() => { if (!FV.el.hidden && !fvZoomed()) fvFit(); }).observe(vp);   // rotation, viewport settling after open
}

/* the part of the image the current view is about: the whole figure, or one panel with a little margin */
function fvRect(i = FV.idx) {
  if (i < 0) return { x: 0, y: 0, w: FV.iw, h: FV.ih };
  const p = FV.panels[i], pad = FV.PAD;
  const x0 = Math.max(0, p.x - pad), y0 = Math.max(0, p.y - pad), x1 = Math.min(1, p.x + p.w + pad), y1 = Math.min(1, p.y + p.h + pad);
  return { x: x0 * FV.iw, y: y0 * FV.ih, w: (x1 - x0) * FV.iw, h: (y1 - y0) * FV.ih };
}
/* Position by size and offset, not by a CSS transform: a transformed image becomes one graphics layer the size of
   the whole zoomed picture, which on a phone screen can be hundreds of megabytes and gets the web view killed. */
const fvClip = i => {
  if (i < 0) return "";
  const p = FV.panels[i], pad = FV.PAD, c = v => Math.max(0, Math.min(1, v)) * 100;
  return `inset(${c(p.y - pad)}% ${c(1 - p.x - p.w - pad)}% ${c(1 - p.y - p.h - pad)}% ${c(p.x - pad)}%)`;
};
/* resting place of panel i: scaled to fit and centred */
function fvFitOf(i) {
  const r = fvRect(i), vw = FV.vp.clientWidth, vh = FV.vp.clientHeight, s = Math.min(vw / r.w, vh / r.h);
  return { s, x: (vw - r.w * s) / 2 - r.x * s, y: (vh - r.h * s) / 2 - r.y * s };
}
const fvPlace = (img, s, x, y) => { const st = img.style; st.width = FV.iw * s + "px"; st.height = FV.ih * s + "px"; st.left = x + "px"; st.top = y + "px"; };

/* Swiping between panels, like a photo album. Each of three screen-sized canvases ("cards") holds one panel already
   drawn to fit: the previous, the current and the next. A swipe only slides these cards sideways, which the phone's
   graphics chip does without redrawing anything, so it stays smooth. The cards are small (one screen each), unlike
   the zoomable image, which is why moving them with a transform is safe. Zooming in switches to that image. */
const fvStrip = () => FV.idx >= 0 && FV.panels.length > 1 && !fvZoomed();
function fvDrawCard(cv, i) {
  const vw = FV.vp.clientWidth, vh = FV.vp.clientHeight, dpr = Math.min(3, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(vw * dpr) || cv.height !== Math.round(vh * dpr)) { cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); }
  cv.style.width = vw + "px"; cv.style.height = vh + "px";
  const ctx = cv.getContext("2d"), src = FV.img, nw = src.naturalWidth, nh = src.naturalHeight;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!nw || !nh) return false;
  const p = FV.panels[i], pad = FV.PAD;
  const x0 = Math.max(0, p.x - pad), y0 = Math.max(0, p.y - pad), x1 = Math.min(1, p.x + p.w + pad), y1 = Math.min(1, p.y + p.h + pad);
  const sw = (x1 - x0) * nw, sh = (y1 - y0) * nh, k = Math.min(vw / sw, vh / sh) * dpr;
  const dw = sw * k, dh = sh * k, dx = (cv.width - dw) / 2, dy = (cv.height - dh) / 2;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff"; ctx.fillRect(dx, dy, dw, dh);
  ctx.drawImage(src, x0 * nw, y0 * nh, sw, sh, dx, dy, dw, dh);
  return true;
}
/* make sure the cards hold the previous, current and next panel, reusing a card that already shows one */
function fvSyncCards() {
  const n = FV.panels.length, want = [(FV.idx - 1 + n) % n, FV.idx, (FV.idx + 1) % n];
  const key = i => `${i}|${FV.srcGen}|${FV.vp.clientWidth}x${FV.vp.clientHeight}`;
  const free = [...FV.cards], role = [null, null, null];
  want.forEach((i, r) => { const c = free.find(c => c.dataset.k === key(i)); if (c) { role[r] = c; free.splice(free.indexOf(c), 1); } });
  want.forEach((i, r) => { if (!role[r]) { const c = free.shift(); if (fvDrawCard(c, i)) c.dataset.k = key(i); else delete c.dataset.k; role[r] = c; } });
  return role;
}
function fvApply() {
  if (fvStrip()) {
    const role = fvSyncCards(), step = FV.vp.clientWidth + FV.GAP;
    role.forEach((c, r) => { c.style.transform = `translate3d(${FV.dx + (r - 1) * step}px,0,0)`; c.hidden = false; });
    FV.img.style.visibility = "hidden";
  } else {
    FV.cards.forEach(c => c.hidden = true);
    FV.img.style.visibility = "";
    fvPlace(FV.img, FV.s, FV.x + FV.dx, FV.y);
  }
  // once the source image is being stretched on screen, a sharper one is worth fetching (after a pause, so it never
  // overlaps the page render that prepared the figure)
  if (FV.srcW && FV.s * (FV.iw / FV.srcW) * (window.devicePixelRatio || 1) > 1.3) { clearTimeout(FV.sharpT); FV.sharpT = setTimeout(fvSharpen, 900); }
}
/* keep the view inside the figure (or panel): centred when it is smaller than the screen */
function fvClamp() {
  const r = fvRect(), vw = FV.vp.clientWidth, vh = FV.vp.clientHeight;
  const axis = (pos, off, size, view) => size * FV.s <= view ? (view - size * FV.s) / 2 - off * FV.s : Math.min(-off * FV.s, Math.max(view - (off + size) * FV.s, pos));
  FV.x = axis(FV.x, r.x, r.w, vw); FV.y = axis(FV.y, r.y, r.h, vh);
}
function fvFit() {
  const r = fvRect(), vw = FV.vp.clientWidth, vh = FV.vp.clientHeight;
  FV.s0 = Math.min(vw / r.w, vh / r.h); FV.s = FV.s0; FV.x = 0; FV.y = 0;
  fvClamp(); fvPlace(FV.img, FV.s, FV.x, FV.y); fvApply();
}
function fvZoomAt(cx, cy, s) {
  s = Math.max(FV.s0, Math.min(FV.s0 * FV.MAXZ, s));
  FV.x = cx - (cx - FV.x) * (s / FV.s); FV.y = cy - (cy - FV.y) * (s / FV.s); FV.s = s;
  fvClamp(); fvApply();
}
const fvZoomed = () => FV.s > FV.s0 * 1.02;

/* gestures: one finger drags (or swipes between panels when not zoomed), two fingers pinch, double-tap zooms */
function fvPos(e) { const r = FV.vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function fvStartGesture() {
  const p = [...FV.pts.values()];
  if (p.length === 1) FV.g = { kind: "drag", sx: p[0].x, sy: p[0].y, x: FV.x, y: FV.y, t: Date.now(), moved: false };
  else if (p.length >= 2) FV.g = { kind: "pinch", d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2, s: FV.s, x: FV.x, y: FV.y };
}
function fvDown(e) {
  FV.vp.setPointerCapture?.(e.pointerId);
  FV.pts.set(e.pointerId, fvPos(e)); fvStartGesture();
}
function fvMove(e) {
  if (!FV.pts.has(e.pointerId)) return;
  FV.pts.set(e.pointerId, fvPos(e));
  const g = FV.g, p = [...FV.pts.values()]; if (!g) return;
  if (g.kind === "pinch" && p.length >= 2) {
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
    const s = Math.max(FV.s0, Math.min(FV.s0 * FV.MAXZ, g.s * d / g.d));
    FV.x = mx - (g.mx - g.x) * (s / g.s); FV.y = my - (g.my - g.y) * (s / g.s); FV.s = s;
    fvClamp(); fvApply();
  } else if (g.kind === "drag") {
    const dx = p[0].x - g.sx, dy = p[0].y - g.sy;
    if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
    if (fvZoomed()) { FV.x = g.x + dx; FV.y = g.y + dy; fvClamp(); fvApply(); }
    else if (fvCanSwipe() && !g.wasZoomed) { FV.dx = dx; fvApply(); }   // the panels follow the finger sideways
  }
}
function fvUp(e) {
  const at = FV.pts.get(e.pointerId); if (!at) return;
  const g = FV.g; FV.pts.delete(e.pointerId);
  if (g && g.kind === "drag" && FV.pts.size === 0) {
    const dx = at.x - g.sx, dy = at.y - g.sy;
    if (!g.moved) {
      const now = Date.now();
      if (now - FV.lastTap < 320) { FV.lastTap = 0; if (fvZoomed()) fvFit(); else fvZoomAt(at.x, at.y, FV.s0 * 2.5); }
      else FV.lastTap = now;
    } else if (!g.wasZoomed && !fvZoomed() && fvCanSwipe()) {
      // a short flick or a drag past a quarter of the screen turns to the next panel; anything else springs back
      const vw = FV.vp.clientWidth, fast = Math.abs(dx) / Math.max(1, Date.now() - g.t) > .35;
      if (Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > vw * .25 || (fast && Math.abs(dx) > 24))) fvSlide(dx < 0 ? 1 : -1);
      else fvAnimate(0, 200);
    }
  }
  FV.g = null;
  if (FV.pts.size) { fvStartGesture(); if (FV.g) FV.g.wasZoomed = true; }   // a finger left over from a pinch must not count as a swipe
}

/* which view: -1 = whole figure, i = panel i */
function fvShow(i) {
  FV.idx = i;
  const f = FV.fig, p = i >= 0 ? FV.panels[i] : null;
  FV.img.style.clipPath = fvClip(i); FV.dx = 0;
  $("#fvTitle").textContent = p ? `Figure ${f.n} · panel ${p.label}` : `Figure ${f.n}`;
  $("#fvBot").hidden = !FV.panels.length;
  $("#fvChips").innerHTML = FV.panels.length ? `<button type="button" class="fv-chip${i < 0 ? " on" : ""}" data-fv="show" data-i="-1">Whole figure</button>` + FV.panels.map((q, k) => `<button type="button" class="fv-chip${k === i ? " on" : ""}" data-fv="show" data-i="${k}" aria-label="Panel ${esc(q.label)}">${esc(q.label)}</button>`).join("") : "";
  const on = $("#fvChips .on"); if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
  FV.el.querySelectorAll(".fv-arrow").forEach(b => b.disabled = i < 0);
  fvFit();
  // keep the reader in step: the panel on screen is the pinned one
  if (p && !FV.onClose && S.paper && S.view === "figures" && S.paper.figures[S.figIdx] === f) { S.pinned = { fig: f.n, panel: p.label }; applyHL(); }
}
function fvStep(d) { if (FV.idx < 0 || !FV.panels.length) return; fvSlide(d); }
const fvCanSwipe = () => FV.idx >= 0 && FV.panels.length > 1 && !FV.anim;

/* Slide animation without CSS transforms (see fvApply): move the image's left offset frame by frame. */
function fvAnimate(toDx, ms, done) {
  cancelAnimationFrame(FV.raf);
  const from = FV.dx, t0 = performance.now();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0;
  const ease = t => 1 - Math.pow(1 - t, 3);
  FV.anim = true;
  const step = now => {
    const t = ms ? Math.min(1, (now - t0) / ms) : 1;
    FV.dx = from + (toDx - from) * ease(t); fvApply();
    if (t < 1) FV.raf = requestAnimationFrame(step);
    else { FV.anim = false; done && done(); }
  };
  FV.raf = requestAnimationFrame(step);
}
/* d = +1 next panel, -1 previous: the whole strip glides one screen sideways, so the neighbour arrives exactly where
   the current panel was; then the roles swap, which is invisible because the neighbour already shows that panel. */
function fvSlide(d) {
  if (FV.idx < 0 || FV.panels.length < 2 || FV.anim) return;
  const next = (FV.idx + d + FV.panels.length) % FV.panels.length;
  const left = Math.abs(-d * (FV.vp.clientWidth + FV.GAP) - FV.dx), ms = Math.max(140, Math.min(300, left * .7));
  fvAnimate(-d * (FV.vp.clientWidth + FV.GAP), ms, () => fvShow(next));
}

/* The on-page image is rendered for the small stage. When the reader actually zooms in, fetch a sharper
   render of the same region. This is the memory-hungry step on a phone, so it is done lazily, once per
   figure, for the figure's region only (not the whole page), and capped at about 5 megapixels. */
async function fvSharpen() {
  const P = S.paper, f = FV.fig;
  if (!P || !f || P.demo || !P.doc || FV.sharpBusy) return;
  const box = f.det?.box || f.autoBox || { x: 0, y: 0, w: 1, h: 1 };
  const key = P.id + "#" + f.n + "#" + JSON.stringify(box);
  if (FV.hi.has(key)) { if (FV.img.dataset.key !== key) { FV.img.src = FV.hi.get(key); FV.img.dataset.key = key; fvApply(); } return; }
  FV.sharpBusy = true;
  let cv = null, page = null;
  try {
    page = await P.doc.getPage(f.det?.page || f.page);
    const v1 = page.getViewport({ scale: 1 });
    const cw = box.w * v1.width, ch = box.h * v1.height;             // region size at scale 1
    const scale = Math.min(2400 / cw, Math.sqrt(5e6 / (cw * ch)));
    if (cw * scale < FV.srcW * 1.25) return;                         // the stage image is already about this sharp
    cv = document.createElement("canvas"); cv.width = Math.round(cw * scale); cv.height = Math.round(ch * scale);
    const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    const vp = page.getViewport({ scale, offsetX: -box.x * v1.width * scale, offsetY: -box.y * v1.height * scale });
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const url = cv.toDataURL("image/jpeg", .9);
    FV.hi.clear(); FV.hi.set(key, url);                               // keep one: these are large strings
    if (!FV.el.hidden && FV.fig === f) { FV.img.src = url; FV.img.dataset.key = key; fvApply(); }   // same region, so the layout still fits
  } catch (e) { console.warn("sharper figure failed:", e && e.message); }
  finally {
    if (cv) cv.width = cv.height = 0;                                 // release the canvas memory straight away
    try { page && page.cleanup(); } catch {}
    FV.sharpBusy = false;
  }
}

/* The reader keeps a full-page canvas for every page it has rendered (about 12 MB each). Opening figures from the
   reading mode touches many pages, so keep only the most recent two; older ones are re-rendered if needed. */
function fvTrimPages() {
  if (typeof pageCache === "undefined" || pageCache.size <= 2) return;
  for (const k of [...pageCache.keys()].slice(0, pageCache.size - 2)) {
    const pr = pageCache.get(k); pageCache.delete(k);
    Promise.resolve(pr).then(c => { if (c && c.width) c.width = c.height = 0; }).catch(() => {});
  }
}

/* f: a figure of the open paper. panelLabel: open on that panel when its box is known, otherwise the whole figure.
   onClose: called after the viewer closes (the reading mode uses it to return to the text). */
async function fvOpenFig(f, panelLabel, onClose) {
  const P = S.paper; if (!P || !f) return;
  if (!P.doc && P.docReady) { toast("Opening the PDF…", 8000); await P.docReady; $("#toast").hidden = true; }   // reopened from the paper cache
  if (!FV.el) fvBuild();
  // Panels are located by Claude from a page image. A figure prepared while Claude was off (no key yet) has an image
  // but no panels: locate them now, once, so a panel reference can open that panel.
  const noPanels = !f.det || !(f.det.panels || []).length;   // never located, or located earlier without any panels
  const canDetect = !P.demo && P.doc && S.sample && S.imagesOK && noPanels && !f.detTried;
  if ((!f.img || canDetect) && !P.demo && P.doc && typeof prepareFigure === "function") {
    if (canDetect) f.detTried = true;
    toast(canDetect ? `Finding the panels in Figure ${f.n}…` : `Preparing Figure ${f.n}…`, 30000);
    // an earlier empty result is cached, so ask afresh when the figure was located before without panels
    try { await prepareFigure(f, canDetect && !!f.det); } catch (e) { console.warn("prepareFigure failed", e); }
    fvTrimPages();
    $("#toast").hidden = true;
  }
  if (!f.img) { toast(`Figure ${f.n} isn't available yet.`); return; }
  const wanted = panelLabel ? String(panelLabel).toUpperCase() : null;
  if (wanted && !(f.panels || []).some(p => p.label === wanted)) {
    toast(!S.sample ? `Showing the whole figure: add your API key in Settings so Claude can find panel ${wanted}.`
        : f.err ? `Showing the whole figure: ${f.err}`
        : `Showing the whole figure: panel ${wanted} wasn't found in it.`, 5000);
  }
  const probe = new Image();
  await new Promise(r => { probe.onload = probe.onerror = r; probe.src = f.img; });
  FV.fig = f; FV.onClose = onClose || null;
  FV.panels = (f.panels || []).filter(p => p && p.w > 0 && p.h > 0).slice().sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const nw = probe.naturalWidth || 1200, nh = probe.naturalHeight || 900;
  FV.iw = nw; FV.ih = nh; FV.srcW = nw; delete FV.img.dataset.key;
  FV.img.src = f.img; FV.img.alt = `Figure ${f.n}`;
  FV.srcGen++; for (const c of FV.cards) { delete c.dataset.k; c.hidden = true; }
  FV.pts.clear(); FV.g = null; FV.lastTap = 0;
  if (FV.el.hidden) PWZoomLock.set(true);
  FV.el.hidden = false; document.documentElement.classList.add("fv-open");
  fvShow(wanted ? FV.panels.findIndex(p => p.label === wanted) : -1);
  FV.el.querySelector('[data-fv="close"]').focus({ preventScroll: true });
}
function fvOpen(panelLabel) { const P = S.paper; return fvOpenFig(P && P.figures[S.figIdx], panelLabel, null); }
function fvClose() {
  if (!FV.el || FV.el.hidden) return;
  FV.el.hidden = true; document.documentElement.classList.remove("fv-open"); PWZoomLock.set(false);
  FV.img.removeAttribute("src"); clearTimeout(FV.sharpT); FV.hi.clear();
  for (const c of FV.cards) { delete c.dataset.k; c.hidden = true; c.width = c.height = 0; }   // release the card memory
  cancelAnimationFrame(FV.raf); FV.anim = false;
  const cb = FV.onClose; FV.onClose = null;
  if (cb) { cb(); return; }
  const t = S.view === "figures" && ($(".sent.pin") || $(".seg.pin"));
  if (t) t.scrollIntoView({ block: "center" });
}

// Capture phase, so this runs before the reader's own click handler in events.js.
document.addEventListener("click", e => {
  if (S.view !== "figures" || !e.target.closest) return;
  const frame = e.target.closest("#frame"); if (!frame || !frame.querySelector("img")) return;
  const hot = e.target.closest(".hot");
  if (hot) {
    if (!matchMedia("(hover: none)").matches) return;   // with a mouse, clicking a panel still pins it
    e.stopPropagation(); fvOpen(hot.dataset.panel);
  } else { e.stopPropagation(); fvOpen(null); }
}, true);
document.addEventListener("keydown", e => {
  if (!FV.el || FV.el.hidden) return;
  if (e.key === "Escape") fvClose();
  else if (e.key === "ArrowRight") fvStep(1);
  else if (e.key === "ArrowLeft") fvStep(-1);
  else return;
  e.stopPropagation(); e.preventDefault();
}, true);
