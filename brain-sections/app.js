/* Mouse brain sections: draws coronal/sagittal sections of the Allen CCFv3 annotation from the
   precomputed contours in data/ (see tools/build_sections.py) and exports them as SVG/PNG.
   All drawing coordinates are stereotaxic micrometres relative to bregma:
   coronal  x = ML (+ right), y = DV (+ down);
   sagittal x = AP (+ posterior, so anterior is on the left), y = DV (+ down);
   dorsal   x = ML (+ right), y = AP (+ posterior, so anterior is up); seen from directly above.
   view3d   oblique orthographic views of the unscaled CCF (see tools/build_views.py): x, y = screen
            um; markers are converted from the chosen stereotaxic system to CCF and projected. */
"use strict";

const RES = 10;                       // um per voxel in the contour data
const BREGMA = { ap: 5400, dv: 332 }; // CCF um (IBL convention, iblatlas ALLEN_CCF_LANDMARKS_MLAPDV_UM)
const MIDLINE = 5695;                 // CCF ML um of the mirror plane (iblatlas ALLEN_CCF_MIDLINE_ML_UM)
const SYSTEMS = {
  dorr: { ml: 1, ap: 1.087, dv: 0.952, name: "CCFv3 scaled to Dorr 2008 (IBL)" },
  ccf:  { ml: 1, ap: 1, dv: 1, name: "Allen CCFv3, unscaled" },
  qiu:  { ml: 0.952, ap: 1.031, dv: 0.885, name: "CCFv3 scaled to Qiu 2018" },
};
const PALETTE = ["#1f77b4", "#d62728", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf", "#e377c2", "#8c564b"];

const $ = (id) => document.getElementById(id);
const state = {
  plane: "coronal", pos: -6.36, coords: "dorr", level: "summary", fill: "none",
  lineColor: "#8a8a8a", outlineColor: "#000000", lineWidth: 1, hemi: "both", labels: "none",
  scalebar: true, caption: true, grid: false, fillColor: "#f3e7bf", rot: 30, elev: 30,
  hl: new Map(),   // structure id -> colour
  markers: [],     // {plane, x, depth, ref, shape, color, size, label}
};
let atlas = null;           // index.json
let views = null;           // data/views/index.json (view angles + dorsal surface height map)
let current = null;         // processed section on screen
const cache = new Map();    // file -> raw json promise
const hitCtx = document.createElement("canvas").getContext("2d");

/* ---------- atlas helpers ---------- */
const S = () => SYSTEMS[state.coords];
const struct = (id) => atlas.structures[id];
const ancCache = new Map();
function lineage(id) {             // [id, parent, ..., root]
  let a = ancCache.get(id);
  if (!a) {
    a = [];
    for (let u = id; u != null; u = struct(u) ? struct(u).p : null) a.push(u);
    ancCache.set(id, a);
  }
  return a;
}
/* Highlights: state.hl keys are a structure id (both hemispheres) or "<id>L" / "<id>R" (one
   hemisphere; L = the animal's left, ML < 0). */
const keyId = (k) => (typeof k === "number" ? k : parseInt(k, 10));
const keySide = (k) => (typeof k === "string" ? k.slice(-1) : null);
function hlColour(id, side) {            // match for a region piece; side = "L" | "R" | undefined (both)
  for (const u of lineage(id)) {
    if (state.hl.has(u)) return [u, state.hl.get(u)];
    if (side && state.hl.has(u + side)) return [u + side, state.hl.get(u + side)];
  }
  return null;
}
function hlSided(id) {                   // one-sided matches for a region that spans both hemispheres
  const out = [];
  for (const sd of ["L", "R"]) for (const u of lineage(id)) if (state.hl.has(u + sd)) { out.push([u + sd, state.hl.get(u + sd), sd]); break; }
  return out;
}
/* 3D camera: rotation around the brain (0 = left side, 90 = front, 180 = right, -90 = rear) and
   elevation above the horizontal, both in 15-degree steps. Views exist for the left half of the
   circle (-90..90); the right half are mirror images of them (the atlas is symmetric). */
const ROT_STEP = 15, ELEVS = [0, 15, 30, 45, 60, 75];
const normRot = (r) => { const x = (((r % 360) + 540) % 360) - 180; return x === -180 ? 180 : x; };
const viewParts = (rot = state.rot, elev = state.elev) => {
  const r = normRot(rot);
  let az = r, mirror = false;
  if (r > 90) { az = 180 - r; mirror = true; } else if (r < -90) { az = -180 - r; mirror = true; }
  return { rot: r, az, mirror, file: `a${az}_e${elev}` };
};
function viewName(rot) {
  const names = ["left", "front-left", "front", "front-right", "right", "rear-right", "rear", "rear-left"];
  return names[((Math.round(normRot(rot) / 45) % 8) + 8) % 8];
}
function b64u8(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64u16(b64) {
  const bin = atob(b64), n = bin.length >> 1, out = new Uint16Array(n);
  for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  return out;
}
const fmt = (v, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace("-", "−");

/* plane position <-> stereotaxic mm */
function planeToMm(plane, um) {
  if (plane === "dorsal" || plane === "view3d") return 0;
  return plane === "coronal" ? (BREGMA.ap - um) * S().ap / 1000 : (um - MIDLINE) * S().ml / 1000;
}
function mmToPlane(plane, mm) {
  if (plane === "dorsal") return 0;
  return plane === "coronal" ? BREGMA.ap - mm * 1000 / S().ap : MIDLINE + Math.abs(mm) * 1000 / S().ml;
}
function nearestPlane(plane, mm) {
  const target = mmToPlane(plane, mm);
  let best = atlas.planes[plane][0];
  for (const p of atlas.planes[plane]) if (Math.abs(p - target) < Math.abs(best - target)) best = p;
  return best;
}

/* voxel (x, y) in the section -> stereotaxic um */
function transformer(plane, raw) {
  const s = S();
  if (plane === "view3d") {
    const [u0, v0] = raw.origin_uv, px = raw.px_um, k = viewParts().mirror ? -1 : 1;
    return (x, y) => [Math.round(k * (u0 + x * px)), Math.round(v0 + y * px)];
  }
  if (plane === "dorsal")
    return (x, y) => [Math.round((x * RES - MIDLINE) * s.ml), Math.round((y * RES - BREGMA.ap) * s.ap)];
  return plane === "coronal"
    ? (x, y) => [Math.round((x * RES - MIDLINE) * s.ml), Math.round((y * RES - BREGMA.dv) * s.dv)]
    : (x, y) => [Math.round((x * RES - BREGMA.ap) * s.ap), Math.round((y * RES - BREGMA.dv) * s.dv)];
}
/* data paths are "M x y l dx dy ... z" in integer voxels; return absolute stereotaxic path */
function convertPath(d, tx) {
  const tok = d.match(/[Mlz]|-?\d+/g) || [];
  const out = [];
  let cx = 0, cy = 0;
  for (let i = 0; i < tok.length;) {
    const t = tok[i];
    if (t === "M") { cx = +tok[i + 1]; cy = +tok[i + 2]; i += 3; const p = tx(cx, cy); out.push(`M${p[0]} ${p[1]}`); }
    else if (t === "l") { out.push("L"); i++; }
    else if (t === "z") { out.push("Z"); i++; }
    else { cx += +tok[i]; cy += +tok[i + 1]; i += 2; const p = tx(cx, cy); out.push(`${p[0]} ${p[1]}`); }
  }
  return out.join(" ");
}

async function loadRaw(plane, um) {
  return loadFile(plane === "view3d" ? `data/views/${um}.json` : `data/${plane}/${String(um).padStart(5, "0")}.json`);
}
async function loadFile(file) {
  if (!cache.has(file)) cache.set(file, fetch(file).then((r) => { if (!r.ok) throw new Error(file); return r.json(); }));
  return cache.get(file);
}
function processSection(raw, plane, um) {
  const tx = transformer(plane, raw);
  const [x0, y0, x1, y1] = raw.bbox;
  const a = tx(x0, y0), b = tx(x1, y1);
  const bbox = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];  // mirrored views flip x
  const sec = { plane, um, raw, tx, bbox, levels: {}, mirror: plane === "view3d" && viewParts().mirror };
  sec.outline = convertPath(raw.outline, tx);
  sec.outlinePath = new Path2D(sec.outline);
  sec.level = (lvl) => {
    if (!sec.levels[lvl]) {
      sec.levels[lvl] = (raw[lvl] || raw.summary).map(([id, d, ax, ay, area, depth, side]) => {
        const dd = convertPath(d, tx); const [X, Y] = tx(ax, ay);
        // view pieces carry their hemisphere; sagittal sections show the right hemisphere only.
        // Mirrored 3D views show the other side of the brain, so L and R swap.
        const sd = plane === "view3d" ? (sec.mirror ? { L: "R", R: "L" }[side] : side) : plane === "sagittal" ? "R" : undefined;
        return { id, d: dd, x: X, y: Y, area, side: sd, depth: depth * (raw.px_um || RES) * (plane === "view3d" ? 1 : Math.min(S().ml, S().ap, S().dv)), p2d: null };
      });
    }
    return sec.levels[lvl];
  };
  if (plane === "view3d") {
    const d = raw.depth;
    sec.depth = { ...d, grid: d.unit_um ? b64u8(d.data) : b64u16(d.data), nodata: d.nodata ?? 65535, unit: d.unit_um || 1 };
  }
  return sec;
}
function hitRegion(sec, lvl, X, Y) {     // smallest region containing the point
  const regs = sec.level(lvl);
  for (let i = regs.length - 1; i >= 0; i--) {
    const r = regs[i];
    if (!r.p2d) r.p2d = new Path2D(r.d);
    if (hitCtx.isPointInPath(r.p2d, X, Y, "evenodd")) return r;
  }
  return null;
}
function surfaceY(sec, X) {             // dorsal brain surface at this x (um), or null
  const [, top, , bottom] = sec.bbox;
  for (let Y = top - 20; Y <= bottom; Y += 2) if (hitCtx.isPointInPath(sec.outlinePath, X, Y, "evenodd")) return Y;
  return null;
}

/* ---------- markers ---------- */
function markerXY(sec, m) {
  if (sec.plane === "dorsal") {                // m.x = ML, m.depth = AP from bregma (+ anterior)
    const X = m.x * 1000, Y = -m.depth * 1000;
    const r = hitRegion(sec, "fine", X, Y);
    if (!r && !hitCtx.isPointInPath(sec.outlinePath, X, Y, "evenodd")) return { X, Y, sy: null, region: null, note: "outside the brain" };
    return { X, Y, sy: null, region: r ? r.id : null };
  }
  const X = sec.plane === "coronal" ? m.x * 1000 : -m.x * 1000;
  const sy = surfaceY(sec, X);
  let Y;
  if (m.ref === "surface") { if (sy == null) return { X, error: "outside the brain at this position" }; Y = sy + m.depth * 1000; }
  else Y = m.depth * 1000;
  const r = hitRegion(sec, "fine", X, Y);
  return { X, Y, sy, region: r ? r.id : null };
}
/* stereotaxic mm (chosen system) -> CCF um, using the dorsal surface map for depth-from-surface */
function surfaceDvCcf(ccfAp, ccfMl) {
  const sf = views.surface, r = Math.round(ccfAp / sf.px_um), c = Math.round(ccfMl / sf.px_um);
  if (r < 0 || c < 0 || r >= sf.shape[0] || c >= sf.shape[1]) return null;
  if (!sf.grid) sf.grid = b64u16(sf.data);
  const v = sf.grid[r * sf.shape[1] + c];
  return v === 65535 ? null : v;
}
function project(sec, ccf) {                 // ccf = [ap, dv, ml] um -> [X, Y, t, visible]
  const raw = sec.raw;
  const Wx = (ccf[2] - MIDLINE) * (sec.mirror ? -1 : 1), Wy = BREGMA.ap - ccf[0], Wz = BREGMA.dv - ccf[1];
  const dot = (a) => a[0] * Wx + a[1] * Wy + a[2] * Wz;
  const u = dot(raw.right), v = -dot(raw.up), t = dot(raw.cam);
  const d = sec.depth, i = Math.floor((v - raw.origin_uv[1]) / d.px_um), j = Math.floor((u - raw.origin_uv[0]) / d.px_um);
  let vis = true;
  if (i >= 0 && j >= 0 && i < d.shape[0] && j < d.shape[1]) {
    const q = d.grid[i * d.shape[1] + j];
    if (q !== d.nodata && t < d.t0 + q * d.unit - 2 * d.px_um - d.unit / 2) vis = false;
  }
  return [sec.mirror ? -u : u, v, t, vis];
}
/* implant axis: unit vector pointing from the tip up the implant, in world axes
   (X = ML right, Y = anterior, Z = up). tc = coronal tilt (+ = top leans right),
   ts = sagittal tilt (+ = top leans anterior), in degrees from vertical. */
function implantAxis(m) {
  const x = Math.tan((m.tc || 0) * Math.PI / 180), y = Math.tan((m.ts || 0) * Math.PI / 180), n = Math.hypot(x, y, 1);
  return [x / n, y / n, 1 / n];
}
function marker3d(m) {                       // tip = target point; the implant runs from it up its axis
  const s = S();
  const ccfAp = BREGMA.ap - m.ap * 1000 / s.ap, ccfMl = MIDLINE + m.x * 1000 / s.ml;
  const sdv = surfaceDvCcf(ccfAp, ccfMl);
  if (sdv == null && m.ref === "surface") return { error: "no brain at this AP/ML" };
  const tdv = m.ref === "surface" ? sdv + m.depth * 1000 / s.dv : BREGMA.dv + m.depth * 1000 / s.dv;
  const tip = [ccfAp, tdv, ccfMl], ax = implantAxis(m);
  const at = (k) => [tip[0] - k * ax[1], tip[1] - k * ax[2], tip[2] + k * ax[0]];   // k um up the axis
  // entry: first point up the axis that is above the dorsal surface (or outside the brain)
  let kIn = 0;
  for (let k = 0; k <= 12000; k += 10) {
    const q = at(k), sv = surfaceDvCcf(q[0], q[2]);
    if (sv == null || q[1] <= sv) { kIn = k; break; }
    kIn = k;
  }
  return { tip, at, kIn, entry: at(kIn), target: tip };
}
function marker3dSvg(sec, m, W) {
  const p = marker3d(m);
  m._info = p;
  if (p.error) return "";
  const c = m.color, w = m.size * 1000, len = (m.len || 1.5) * 1000, el = sec.raw.el * Math.PI / 180;
  const stroke = `stroke="${state.outlineColor}" stroke-width="${W * 0.001}"`;
  const kTop = p.kIn + len;
  const axis = implantAxis(m), cam = sec.raw.cam;
  const axWorld = [axis[0] * (sec.mirror ? -1 : 1), axis[1], axis[2]];
  const facing = Math.abs(axWorld[0] * cam[0] + axWorld[1] * cam[1] + axWorld[2] * cam[2]);  // |axis . camera|
  let g = "";
  const shaft = (width, color, withCap) => {
    // sample the implant from its tip to its top; draw only the runs the brain does not hide
    const N = 160, pts = [];
    for (let k = 0; k <= N; k++) pts.push(project(sec, p.at(kTop * k / N)));
    const a0 = pts[0], a1 = pts[N];
    const L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1;
    const nx = -(a1[1] - a0[1]) / L * width / 2, ny = (a1[0] - a0[0]) / L * width / 2;   // screen normal
    let out = "", run = [];
    const flush = () => {
      if (run.length > 1) {
        const a = run[0], b = run[run.length - 1];
        out += `<path d="M${a[0] + nx} ${a[1] + ny}L${b[0] + nx} ${b[1] + ny}L${b[0] - nx} ${b[1] - ny}L${a[0] - nx} ${a[1] - ny}Z" fill="${color}" ${stroke}/>`;
      }
      run = [];
    };
    for (const q of pts) { if (q[3]) run.push(q); else flush(); }
    flush();
    const top = pts[N];
    if (withCap && top[3]) {
      const rot = Math.atan2(ny, nx) * 180 / Math.PI;
      out += `<ellipse cx="${top[0]}" cy="${top[1]}" rx="${width / 2}" ry="${(width / 2) * Math.max(facing, 0.05)}" transform="rotate(${rot.toFixed(1)} ${top[0]} ${top[1]})" fill="${color}" ${stroke}/>`;
    }
    return { out, top };
  };
  const spot = () => {
    const e = project(sec, p.entry);
    return e[3] ? `<ellipse cx="${e[0]}" cy="${e[1]}" rx="${w}" ry="${w * Math.sin(el)}" fill="${c}" fill-opacity="0.85" ${stroke}/>` : "";
  };
  let top = project(sec, p.at(kTop));
  if (m.shape === "fibre_spot" || m.shape === "spot") g += spot();
  if (m.shape === "fibre_spot" || m.shape === "fibre") { const r = shaft(w, c, true); g += r.out; top = r.top; }
  if (m.shape === "electrode") { const r = shaft(Math.max(w * 0.25, W * 0.002), c, false); g += r.out; top = r.top; }
  if (m.shape === "target") {
    const t = project(sec, p.target);
    g += `<circle cx="${t[0]}" cy="${t[1]}" r="${w / 2}" fill="${c}" stroke="#fff" stroke-width="${W * 0.0015}"/>`;
    top = t;
  }
  if (m.label) {
    const fs = W * 0.022;
    g += `<text x="${top[0]}" y="${top[1] - fs * 0.6}" font-size="${fs}" fill="${c}" text-anchor="middle">${esc(m.label)}</text>`;
  }
  return `<g data-marker="1">${g}</g>`;
}
function markerSvg(sec, m, W) {
  if (sec.plane === "view3d") return marker3dSvg(sec, m, W);
  const p = markerXY(sec, m);
  m._info = p;
  if (p.error) return "";
  const s = m.size * 1000, c = m.color, { X, Y } = p;
  let g = "";
  const sw = Math.max(W * 0.0015, s * 0.18);
  if (m.shape === "dot") g = `<circle cx="${X}" cy="${Y}" r="${s / 2}" fill="${c}"/>`;
  else if (m.shape === "cross") g = `<path d="M${X - s} ${Y}H${X + s}M${X} ${Y - s}V${Y + s}" stroke="${c}" stroke-width="${sw}" fill="none"/>`;
  else if (m.shape === "ring") g = `<circle cx="${X}" cy="${Y}" r="${s}" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="${W * 0.0015}"/>`;
  else if (m.shape === "track" && sec.plane === "dorsal") g = `<circle cx="${X}" cy="${Y}" r="${s / 2}" fill="${c}"/>`;
  else if (m.shape === "track") {
    // in-plane tilt: coronal tilt in coronal sections (+ top leans right), sagittal tilt in sagittal
    // sections (+ top leans anterior, which is to the left); out-of-plane tilt cannot be shown
    const deg = sec.plane === "coronal" ? (m.tc || 0) : -(m.ts || 0);
    const dx = Math.sin(deg * Math.PI / 180), dy = -Math.cos(deg * Math.PI / 180);
    let k = 0;
    while (k < 15000 && hitCtx.isPointInPath(sec.outlinePath, X + dx * k, Y + dy * k, "evenodd")) k += 5;
    const kt = k + W * 0.03;
    g = `<line x1="${X + dx * kt}" y1="${Y + dy * kt}" x2="${X}" y2="${Y}" stroke="${c}" stroke-width="${s}" stroke-linecap="butt"/>` +
        `<circle cx="${X}" cy="${Y}" r="${s * 0.9}" fill="${c}"/>`;
  }
  if (m.label) {
    const fs = W * 0.022;
    g += `<text x="${X + Math.max(s, fs * 0.4) + fs * 0.3}" y="${Y + fs * 0.35}" font-size="${fs}" fill="${c}">${esc(m.label)}</text>`;
  }
  return `<g data-marker="1">${g}</g>`;
}

/* ---------- drawing ---------- */
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const safeId = (t, used) => {
  let b = String(t).replace(/[^A-Za-z0-9_-]/g, "_"); if (!/^[A-Za-z_]/.test(b)) b = "_" + b;
  let k = b, n = 2; while (used.has(k)) k = `${b}_${n++}`; used.add(k); return k;
};

function buildSvg(sec, forExport) {
  const plane = sec.plane;
  let [x0, y0, x1, y1] = sec.bbox;
  if (plane === "view3d") {                    // make room for implants sticking out of the brain
    const pad = 0.05 * (x1 - x0);
    for (const mk of state.markers) {
      if (mk.plane !== plane) continue;
      const p = marker3d(mk); if (p.error) continue;
      const top = project(sec, p.at(p.kIn + (mk.len || 1.5) * 1000));
      const r = mk.size * 1000;
      x0 = Math.min(x0, top[0] - r); x1 = Math.max(x1, top[0] + r);
      y0 = Math.min(y0, top[1] - r - (mk.label ? pad : 0));
    }
  }
  const mlx = plane === "coronal" || plane === "dorsal";   // x axis is ML (hemisphere clipping)
  if (mlx && state.hemi === "left") x1 = 0;
  if (mlx && state.hemi === "right") x0 = 0;
  const w = x1 - x0, h = y1 - y0, m = 0.05 * Math.max(w, h);
  const foot = state.scalebar || state.caption ? 0.1 * h : 0;
  const vb = [x0 - m, y0 - m, w + 2 * m, h + 2 * m + foot].map(Math.round);
  const W = vb[2];
  const lw = state.lineWidth * W / 1000;
  const clip = mlx && state.hemi !== "both";
  const used = new Set();
  const regs = sec.level(state.level);
  const fillOf = (r) => {
    const h = hlColour(r.id, r.side);
    if (h) return h[1];
    if (state.fill === "allen") return "#" + struct(r.id).c;
    if (state.fill === "grey") return "#ececec";
    if (state.fill === "colour") return state.fillColor;
    return "none";
  };
  const covered = new Set();
  let body = "", halves = "";
  // one-sided highlights of regions that span both hemispheres (sections, dorsal view): the region
  // is drawn again on top, clipped to that half
  const halfOf = (r, st, fillAttr) => {
    if (r.side) return "";
    let out = "";
    for (const [k, col, sd] of hlSided(r.id)) {
      if (hlColour(r.id)) continue;
      covered.add(k);
      const idAttr = forExport ? ` id="${safeId(st.a + (sd === "L" ? "_left" : "_right"), used)}"` : ` data-id="${r.id}"`;
      out += `<path${idAttr} d="${r.d}" fill="${col}" clip-path="url(#half${sd})"${forExport ? "" : ' pointer-events="all"'}><title>${esc(st.a + " — " + st.n + (sd === "L" ? " (left)" : " (right)"))}</title></path>`;
    }
    return out;
  };
  for (const r of regs) {
    const h = hlColour(r.id, r.side); if (h) covered.add(h[0]);
    const st = struct(r.id);
    const idAttr = forExport ? ` id="${safeId(st.a + (r.side && plane === "view3d" ? "_" + r.side : ""), used)}"` : ` data-id="${r.id}"${r.side ? ` data-side="${r.side}"` : ""}`;
    body += `<path${idAttr} d="${r.d}" fill="${fillOf(r)}"${forExport ? "" : ' pointer-events="all"'}><title>${esc(st.a + " — " + st.n)}</title></path>`;
    halves += halfOf(r, st);
  }
  // highlighted regions finer than the displayed level: draw them from the full atlas on top
  let extra = "";
  const missing = [...state.hl.keys()].filter((u) => !covered.has(u));
  if (missing.length && state.level !== "fine") {
    for (const r of sec.level("fine")) {
      for (const k of missing) {
        const base = keyId(k), sd = keySide(k);
        if (!lineage(r.id).includes(base)) continue;
        if (sd && r.side && r.side !== sd) continue;
        const st = struct(r.id);
        const clipA = sd && !r.side ? ` clip-path="url(#half${sd})"` : "";
        const idAttr = forExport ? ` id="${safeId(st.a + (sd ? (sd === "L" ? "_left" : "_right") : ""), used)}"` : ` data-id="${r.id}"${r.side ? ` data-side="${r.side}"` : ""}`;
        extra += `<path${idAttr} d="${r.d}" fill="${state.hl.get(k)}"${clipA}${forExport ? "" : ' pointer-events="all"'}><title>${esc(st.a + " — " + st.n)}</title></path>`;
        break;
      }
    }
  }
  // 3D views: highlighted regions not on the visible surface are drawn as silhouettes seen through the brain
  let sil = "";
  if (plane === "view3d" && sec.sil) {
    const onSurface = new Set(covered);
    for (const r of sec.level("fine")) { const h = hlColour(r.id, r.side); if (h) onSurface.add(h[0]); }
    // silhouette keys are "<id>L" / "<id>R" in the unmirrored view; mirrored views swap sides
    const silSide = (k) => { const sd = k.slice(-1); return sec.mirror ? { L: "R", R: "L" }[sd] : sd; };
    for (const u of state.hl.keys()) {
      if (onSurface.has(u)) continue;
      const base = keyId(u), want = keySide(u);
      const okSide = (k) => !want || silSide(k) === want;
      let keys = Object.keys(sec.sil).filter((k) => lineage(parseInt(k, 10)).includes(base) && okSide(k));
      if (!keys.length) {
        const a = lineage(base).find((x) => sec.sil[x + "L"] || sec.sil[x + "R"]);
        if (a !== undefined) keys = ["L", "R"].map((sd) => a + sd).filter((k) => sec.sil[k] && okSide(k));
      }
      for (const k of keys) {
        const st = struct(parseInt(k, 10));
        const idAttr = forExport ? ` id="${safeId(st.a + "_silhouette_" + silSide(k), used)}"` : "";
        sil += `<path${idAttr} d="${sec.silPath(k)}" fill="${state.hl.get(u)}" fill-opacity="0.9"><title>${esc(st.a + " — " + st.n)}</title></path>`;
      }
    }
  }
  // labels
  let labels = "";
  if (state.labels !== "none") {
    const fs = W * 0.016;
    const matchOf = (r) => hlColour(r.id, r.side) || (hlSided(r.id)[0] || null);
    const pool = state.labels === "hl" ? regs.concat(extra ? sec.level("fine") : []).filter((r) => matchOf(r)) : regs;
    const seen = new Set();
    for (const r of pool) {
      if (state.labels === "all" && r.depth < fs * 0.75) continue;
      let k = null;
      if (state.labels === "hl") { k = matchOf(r)[0]; if (seen.has(k)) continue; seen.add(k); }
      const name = state.labels === "hl" ? struct(keyId(k)).a : struct(r.id).a;
      // anchors sit in a region's largest piece, which may be in the hidden half; the atlas is
      // mirror-symmetric, so mirror them into view (or into the highlighted half)
      const wantSide = k ? keySide(k) : null;
      const hide = wantSide === "L" ? "right" : wantSide === "R" ? "left" : state.hemi;
      const lx = (hide === "right" && r.x > 0) || (hide === "left" && r.x < 0) || (state.hemi === "right" && r.x < 0) || (state.hemi === "left" && r.x > 0) ? -r.x : r.x;
      labels += `<text x="${mlx ? lx : r.x}" y="${r.y + fs * 0.35}">${esc(name)}</text>`;
    }
  }
  // grid
  let grid = "";
  if (state.grid && plane !== "view3d") {
    const gs = [];
    for (let X = Math.ceil(vb[0] / 1000) * 1000; X <= vb[0] + vb[2]; X += 1000) gs.push(`M${X} ${vb[1]}V${vb[1] + vb[3] - foot}`);
    for (let Y = Math.ceil(vb[1] / 1000) * 1000; Y <= vb[1] + vb[3] - foot; Y += 1000) gs.push(`M${vb[0]} ${Y}H${vb[0] + vb[2]}`);
    grid = `<g id="grid" fill="none" stroke="#9ab" stroke-width="${W * 0.0008}" stroke-dasharray="${W * 0.004} ${W * 0.004}"><path d="${gs.join("")}"/>` +
      `<path d="M${-W * 0.012} 0H${W * 0.012}M0 ${-W * 0.012}V${W * 0.012}" stroke="#467" stroke-dasharray="none" stroke-width="${W * 0.0016}"/></g>`;
  }
  // markers
  let markers = "";
  for (const mk of state.markers) if (mk.plane === plane) markers += markerSvg(sec, mk, W);
  // scale bar + caption
  let ann = "";
  const fy = vb[1] + vb[3] - foot * 0.45, fs2 = W * 0.022;
  if (state.scalebar) {
    const bx1 = vb[0] + vb[2] - m, bx0 = bx1 - 1000;
    ann += `<g id="scalebar"><rect x="${bx0}" y="${fy - W * 0.004}" width="1000" height="${W * 0.008}" fill="#000"/>` +
      `<text x="${bx0 + 500}" y="${fy - W * 0.012}" font-size="${fs2}" text-anchor="middle" fill="#000">1 mm</text></g>`;
  }
  if (state.caption) ann += `<text id="caption" x="${vb[0] + m}" y="${fy + fs2 * 0.35}" font-size="${fs2}" fill="#000">${esc(captionText(sec))}</text>`;

  // clip exactly at the midline on the cut side
  const cx0 = state.hemi === "right" ? 0 : vb[0], cx1 = state.hemi === "left" ? 0 : vb[0] + vb[2];
  const halfDefs = halves || extra.includes("url(#half")
    ? `<clipPath id="halfL"><rect x="${vb[0]}" y="${vb[1]}" width="${-vb[0]}" height="${vb[3]}"/></clipPath>` +
      `<clipPath id="halfR"><rect x="0" y="${vb[1]}" width="${vb[0] + vb[2]}" height="${vb[3]}"/></clipPath>` : "";
  const clipDef = clip || halfDefs ? `<defs>${clip ? `<clipPath id="hemiclip"><rect x="${cx0}" y="${vb[1]}" width="${cx1 - cx0}" height="${vb[3]}"/></clipPath>` : ""}${halfDefs}</defs>` : "";
  const cl = clip ? ' clip-path="url(#hemiclip)"' : "";
  const outW = 1200, outH = Math.round(outW * vb[3] / vb[2]);
  const head = forExport
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="${vb.join(" ")}">` +
      `<title>${esc(captionText(sec))}</title><desc>${esc(descText(sec))}</desc>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(captionText(sec))}">`;
  return head + clipDef +
    `<rect id="background" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>` +
    `<g${cl}>` +
    `<g id="regions" stroke="${state.lineColor}" stroke-width="${lw}" stroke-linejoin="round">${body}</g>` +
    (halves ? `<g id="highlighted_one_side" stroke="${state.lineColor}" stroke-width="${lw}" stroke-linejoin="round">${halves}</g>` : "") +
    (extra ? `<g id="highlighted_subregions" stroke="${state.lineColor}" stroke-width="${lw}" stroke-linejoin="round">${extra}</g>` : "") +
    `<path id="brain_outline" d="${sec.outline}" fill="none" stroke="${state.outlineColor}" stroke-width="${Math.max(lw * 2, W * 0.0012)}" stroke-linejoin="round" pointer-events="none"/>` +
    (sil ? `<g id="deep_regions" stroke="${state.outlineColor}" stroke-width="${Math.max(lw, W * 0.0008)}" stroke-linejoin="round" pointer-events="none">${sil}</g>` : "") +
    (labels ? `<g id="labels" font-family="Arial, Helvetica, sans-serif" font-size="${W * 0.016}" text-anchor="middle" fill="#222" pointer-events="none">${labels}</g>` : "") +
    `</g>` + grid +
    (markers ? `<g id="markers" font-family="Arial, Helvetica, sans-serif" pointer-events="none">${markers}</g>` : "") +
    `<g id="annotation" font-family="Arial, Helvetica, sans-serif">${ann}</g></svg>`;
}

function captionText(sec) {
  if (sec.plane === "dorsal") return "Dorsal view";
  if (sec.plane === "view3d") {
    const n = viewName(sec.rot);
    return `3D view from the ${n} (rotation ${fmt(sec.rot, 0)}°), ${sec.raw.el}° from above`;
  }
  const v = planeToMm(sec.plane, sec.um);
  return sec.plane === "coronal"
    ? `Coronal, AP ${fmt(v)} mm from bregma`
    : `Sagittal, ML ${fmt(v)} mm from midline`;
}
function descText(sec) {
  const ccf = sec.plane === "view3d" ? `orthographic view of the unscaled CCF; camera rotation ${sec.rot} deg (0 = left, 90 = front), elevation ${sec.raw.el} deg`
    : sec.plane === "dorsal" ? "seen from directly above along the CCF DV axis, no pitch; anterior up"
    : sec.plane === "coronal" ? `CCF AP ${sec.um} um` : `CCF ML ${sec.um} um`;
  const mk = state.markers.filter((m) => m.plane === sec.plane).map((m) => markerText(m)).join("; ");
  return `${captionText(sec)} (${ccf}). Coordinates: ${S().name}; bregma at CCF AP ${BREGMA.ap} um, DV ${BREGMA.dv} um; ML 0 at the atlas midline. ` +
    (mk ? `Markers: ${mk}. ` : "") +
    `Atlas: Allen Mouse Brain Common Coordinate Framework v3 (2017 annotation), Wang Q et al. (2020) Cell 181:936-953, doi:10.1016/j.cell.2020.04.007. Made with https://sqbauer.github.io/brain-sections/`;
}
function tiltText(m) {
  const t = [];
  if (m.tc && m.plane !== "sagittal" && m.plane !== "dorsal") t.push(`coronal tilt ${fmt(m.tc, 0)}°`);
  if (m.ts && m.plane !== "coronal" && m.plane !== "dorsal") t.push(`sagittal tilt ${fmt(m.ts, 0)}°`);
  return t.length ? `, ${t.join(", ")}` : "";
}
function markerText(m) {
  return markerText0(m) + ((m.plane === "view3d" || m.shape === "track") ? tiltText(m) : "");
}
function markerText0(m) {
  if (m.plane === "view3d") {
    const d = `${fmt(m.depth)} mm below ${m.ref === "surface" ? "surface" : "bregma"}`;
    return `ML ${fmt(m.x)}, AP ${fmt(m.ap)}, tip ${d}`;
  }
  if (m.plane === "dorsal") {
    const reg = m._info && m._info.region ? `, ${struct(m._info.region).a}` : "";
    return `ML ${fmt(m.x)}, AP ${fmt(m.depth)} mm${reg}`;
  }
  const a = m.plane === "coronal" ? `ML ${fmt(m.x)}` : `AP ${fmt(m.x)}`;
  const d = `${fmt(m.depth)} mm below ${m.ref === "surface" ? "brain surface" : "bregma"}`;
  const reg = m._info && m._info.region ? `, ${struct(m._info.region).a}` : "";
  return `${a}, ${d}${reg}`;
}

/* ---------- UI ---------- */
async function draw() {
  if (!atlas) return;
  const plane = state.plane;
  const um = plane === "view3d" ? viewParts().file : nearestPlane(plane, state.pos);
  const wantRot = state.rot, wantElev = state.elev;
  let raw;
  try {
    if (plane === "view3d" && !views) views = await loadFile("data/views/index.json");
    raw = await loadRaw(plane, um);
  } catch (e) { $("status").textContent = "Could not load section data."; return; }
  if (plane !== state.plane) return;     // user switched while loading
  if (plane === "view3d" && (wantRot !== state.rot || wantElev !== state.elev)) return;   // rotated again meanwhile
  if (!current || current.raw !== raw || current.coords !== state.coords || (plane === "view3d" && current.rot !== viewParts().rot)) {
    current = processSection(raw, plane, um);
    current.coords = state.coords; current.rot = plane === "view3d" ? viewParts().rot : null;
  }
  if (plane === "view3d") prefetchNeighbours();
  if (plane === "view3d" && state.hl.size && !current.sil) {
    const sec = current;
    try {
      sec.sil = await loadFile(`data/views/${um}_sil.json`);
      const conv = new Map();
      sec.silPath = (k) => { if (!conv.has(k)) conv.set(k, convertPath(sec.sil[k], sec.tx)); return conv.get(k); };
    } catch (e) { sec.sil = null; }
    if (sec !== current) return;
  }
  $("paper").innerHTML = buildSvg(current, false);
  const actual = planeToMm(plane, um);
  if (plane !== "view3d") $("posInfo").textContent = plane === "dorsal" ? "The brain seen from directly above (no head pitch), anterior up. Bregma is the origin of the grid." : `Nearest atlas plane: ${plane === "coronal" ? "AP" : "ML"} ${fmt(actual)} mm ` +
    `(CCF ${plane === "coronal" ? "AP" : "ML"} ${um} µm). Planes are ${Math.round(atlas.meta.step_um * (plane === "coronal" ? S().ap : S().ml))} µm apart.` +
    (plane === "sagittal" && state.pos < 0 ? " The atlas is symmetric, so left and right are the same." : "");
  $("status").textContent = captionText(current) + ` · ${S().name}`;
  renderHlList(); renderMarkerList(); saveHash();
}

const SHAPES = {
  section: [["dot", "Dot"], ["cross", "Cross"], ["track", "Track from surface"], ["ring", "Spread (circle)"]],
  dorsal: [["dot", "Dot"], ["cross", "Cross"], ["ring", "Spread (circle)"]],
  view3d: [["fibre_spot", "Optic fibre + light spot"], ["fibre", "Optic fibre"], ["spot", "Light spot on surface"],
           ["electrode", "Electrode"], ["target", "Target point (seen through)"]],
};
function syncPlaneUi() {
  const pl = state.plane, c = pl === "coronal", d = pl === "dorsal", v3 = pl === "view3d";
  $("posLabel").textContent = c ? "AP from bregma (mm, + = anterior)" : "ML from midline (mm)";
  $("mxLabel").textContent = pl === "sagittal" ? "AP from bregma (mm)" : "ML (mm, + = right)";
  $("mdvLabel").textContent = d ? "AP from bregma (mm, + = anterior)" : v3 ? "Tip depth (mm)" : "Depth (mm)";
  $("hemiField").hidden = !(c || d);
  for (const id of ["posField", "posSlider", "posInfo"]) $(id).hidden = d || v3;
  $("viewField").hidden = !v3; $("elevField").hidden = !v3;
  $("paper").classList.toggle("rotatable", v3);
  $("paper").tabIndex = v3 ? 0 : -1;
  $("mapField").hidden = !v3; $("mlenField").hidden = !v3;
  $("mtcField").hidden = !(v3 || c); $("mtsField").hidden = !(v3 || pl === "sagittal");
  $("tiltRow").hidden = d;
  $("mrefField").hidden = d;
  $("gridField").hidden = v3;
  $("msizeLabel").textContent = v3 ? "Fibre / spot size (mm)" : "Size / radius (mm)";
  const opts = SHAPES[v3 ? "view3d" : d ? "dorsal" : "section"], cur = $("mshape").value;
  $("mshape").innerHTML = opts.map(([k, t]) => `<option value="${k}">${t}</option>`).join("");
  $("mshape").value = opts.some(([k]) => k === cur) ? cur : opts[0][0];
  $("shiftHint").hidden = v3;
  $("shiftHint").textContent = d ? "Click the drawing with Shift held to drop a marker at the cursor (sets ML and AP)."
    : "Click the drawing with Shift held to drop a marker at the cursor.";
  $("view3dNote").hidden = !v3;
  if (d || v3) return;
  const ps = atlas.planes[pl].map((u) => planeToMm(pl, u));
  const lo = Math.min(...ps), hi = Math.max(...ps);
  const sl = $("posSlider");
  sl.min = lo.toFixed(2); sl.max = hi.toFixed(2); sl.value = Math.min(hi, Math.max(lo, state.pos));
  $("pos").value = state.pos;
  $("pos").min = (c ? lo : -hi).toFixed(2); $("pos").max = hi.toFixed(2);
}

function addHighlight(id) {
  if (state.hl.has(id)) return;
  const used = new Set(state.hl.values());
  state.hl.set(id, PALETTE.find((c) => !used.has(c)) || PALETTE[state.hl.size % PALETTE.length]);
  draw();
}
function renderHlList() {
  const ul = $("hlList"); ul.textContent = "";
  for (const [key, col] of state.hl) {
    const id = keyId(key), sd = keySide(key);
    const st = struct(id);
    const li = document.createElement("li");
    const cp = document.createElement("input"); cp.type = "color"; cp.value = col; cp.setAttribute("aria-label", `Colour for ${st.a}`);
    cp.addEventListener("input", () => { state.hl.set(key, cp.value); draw(); });
    const nm = document.createElement("span"); nm.className = "nm";
    nm.textContent = `${st.a}${sd ? (sd === "L" ? " (left)" : " (right)") : ""} — ${st.n}`; nm.title = st.n;
    li.append(cp, nm);
    const w = st.w && st.w[state.plane];
    if (w && current) {
      const here = current.level("fine").some((r) => lineage(r.id).includes(id));
      if (!here) {
        const go = document.createElement("button"); go.type = "button"; go.textContent = "Go to";
        go.title = `Not in this section. Jump to the ${state.plane} plane where it is largest.`;
        go.addEventListener("click", () => { state.pos = +planeToMm(state.plane, w[2]).toFixed(2); syncPlaneUi(); draw(); });
        li.append(go);
      }
    }
    const rm = document.createElement("button"); rm.type = "button"; rm.textContent = "×"; rm.setAttribute("aria-label", `Remove ${st.a}`);
    rm.addEventListener("click", () => { state.hl.delete(key); draw(); });
    li.append(rm); ul.append(li);
  }
}
let editing = -1, editBackup = null;
let suppressClick = false;                 // a drag-to-rotate ends with a click event; ignore it
function setView(rot, elev) {
  const r = normRot(Math.round(rot / ROT_STEP) * ROT_STEP);
  const e = Math.max(ELEVS[0], Math.min(ELEVS[ELEVS.length - 1], Math.round(elev / 15) * 15));
  if (r === normRot(state.rot) && e === state.elev) return;
  state.rot = r; state.elev = e; syncRotUi(); draw();
}
function syncRotUi() {
  const r = viewParts().rot;
  $("rot").value = r; $("elev").value = state.elev;
  $("rotOut").textContent = `${fmt(r, 0)}° (${viewName(r)})`;
  $("elevOut").textContent = `${state.elev}° from above`;
}
function prefetchNeighbours() {            // make the next rotation step instant
  for (const [dr, de] of [[ROT_STEP, 0], [-ROT_STEP, 0], [0, 15], [0, -15]]) {
    const e = state.elev + de;
    if (!ELEVS.includes(e)) continue;
    loadFile(`data/views/${viewParts(state.rot + dr, e).file}.json`).catch(() => {});
  }
}   // index of the marker being edited, and its state before editing
function renderMarkerList() {
  const ul = $("markerList"); ul.textContent = "";
  state.markers.forEach((m, i) => {
    const li = document.createElement("li");
    if (i === editing) li.className = "editing";
    const sw = document.createElement("input"); sw.type = "color"; sw.className = "sw"; sw.value = m.color;
    sw.setAttribute("aria-label", "Marker colour");
    sw.addEventListener("input", () => { m.color = sw.value; if (i === editing) $("mcolor").value = sw.value; draw(); });
    const nm = document.createElement("span"); nm.className = "nm";
    let txt = (m.label ? m.label + ": " : "") + markerText(m);
    if (m.plane !== state.plane) txt = `(${m.plane === "view3d" ? "3D" : m.plane}) ` + txt;
    else if (m._info && m._info.error) txt += ` (${m._info.error})`;
    nm.textContent = txt; nm.title = txt;
    if (m.plane === state.plane && m._info && m._info.region) nm.title += ` (${struct(m._info.region).n})`;
    const ed = document.createElement("button"); ed.type = "button"; ed.textContent = i === editing ? "Editing" : "Edit";
    ed.setAttribute("aria-label", "Edit marker"); ed.disabled = i === editing;
    ed.addEventListener("click", () => startEdit(i));
    const rm = document.createElement("button"); rm.type = "button"; rm.textContent = "×"; rm.setAttribute("aria-label", "Remove marker");
    rm.addEventListener("click", () => {
      if (i === editing) stopEdit(false); else if (i < editing) editing--;
      state.markers.splice(i, 1); draw();
    });
    li.append(sw, nm, ed, rm); ul.append(li);
  });
}
function fillMarkerForm(m) {
  $("mx").value = m.x; $("mdv").value = m.depth; $("mref").value = m.ref;
  $("map").value = m.ap || 0; $("mlen").value = m.len || 1.5; $("mtc").value = m.tc || 0; $("mts").value = m.ts || 0;
  $("mshape").value = m.shape; $("mcolor").value = m.color; $("msize").value = m.size; $("mlabel").value = m.label || "";
}
function startEdit(i) {
  if (editing >= 0) stopEdit(true);
  const m = state.markers[i];
  if (m.plane !== state.plane) {           // show the marker's own view first
    state.plane = m.plane;
    document.querySelector(`input[name=plane][value=${m.plane}]`).checked = true;
    syncPlaneUi();
  }
  editing = i; editBackup = { ...m };
  fillMarkerForm(m);
  $("addMarker").textContent = "Done editing"; $("cancelEdit").hidden = false;
  $("markerLegend").textContent = `Edit marker${m.label ? ` "${m.label}"` : ""}`;
  $("markerSet").classList.add("editing");
  if (m.plane !== "view3d") $("shiftHint").textContent = "Shift-click the drawing to move this marker to the cursor.";
  $("markerSet").scrollIntoView({ block: "nearest", behavior: "smooth" });
  draw();
}
function stopEdit(keep) {
  if (editing >= 0 && !keep && editBackup) state.markers[editing] = editBackup;
  editing = -1; editBackup = null;
  $("addMarker").textContent = "Add marker"; $("cancelEdit").hidden = true;
  $("markerLegend").textContent = "Mark a target";
  $("markerSet").classList.remove("editing");
  syncPlaneUi();
}
function applyEdit() {                     // live update of the marker being edited
  if (editing < 0) return;
  const m = state.markers[editing];
  state.markers[editing] = { ...readMarkerForm(), plane: m.plane };
  draw();
}
function readMarkerForm() {
  return { plane: state.plane, x: +$("mx").value || 0, depth: +$("mdv").value || 0, ref: $("mref").value,
    ap: +$("map").value || 0, len: Math.max(0.1, +$("mlen").value || 1.5),
    tc: Math.max(-60, Math.min(60, +$("mtc").value || 0)), ts: Math.max(-60, Math.min(60, +$("mts").value || 0)),
    shape: $("mshape").value, color: $("mcolor").value, size: Math.max(0.01, +$("msize").value || 0.1), label: $("mlabel").value.trim() };
}

function findStructure(q) {
  q = q.trim().toLowerCase(); if (!q) return null;
  const ids = Object.keys(atlas.structures);
  const by = (f) => ids.find((u) => f(atlas.structures[u]));
  const u = by((s) => s.a.toLowerCase() === q) || by((s) => `${s.a} — ${s.n}`.toLowerCase() === q) ||
    by((s) => s.n.toLowerCase() === q) || by((s) => s.n.toLowerCase().includes(q));
  return u ? +u : null;
}

function svgPoint(evt) {
  const svg = $("paper").querySelector("svg"); if (!svg) return null;
  const p = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(svg.getScreenCTM().inverse());
  return [p.x, p.y];
}

/* ---------- export ---------- */
function filename(ext) {
  if (current.plane === "dorsal") return `mouse_dorsal_view_${state.coords}.${ext}`;
  if (current.plane === "view3d") return `mouse_3d_rot${viewParts().rot}_elev${state.elev}.${ext}`;
  const v = planeToMm(current.plane, current.um).toFixed(2);
  return `mouse_${current.plane}_${current.plane === "coronal" ? "AP" : "ML"}${v}mm_${state.coords}.${ext}`;
}
function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportSvg() { if (current) download(new Blob([buildSvg(current, true)], { type: "image/svg+xml" }), filename("svg")); }
function exportPng() {
  if (!current) return;
  const svg = buildSvg(current, true);
  const img = new Image();
  img.onload = () => {
    const k = 3, c = document.createElement("canvas");
    c.width = img.width * k; c.height = img.height * k;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => download(b, filename("png")), "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ---------- shareable state in the URL hash ---------- */
let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    p.set("plane", state.plane); p.set("pos", state.pos); p.set("sys", state.coords); p.set("lvl", state.level);
    p.set("fill", state.fill); p.set("lc", state.lineColor.slice(1)); p.set("oc", state.outlineColor.slice(1));
    p.set("lw", state.lineWidth); p.set("hemi", state.hemi); p.set("lab", state.labels);
    p.set("opt", [state.scalebar ? "s" : "", state.caption ? "c" : "", state.grid ? "g" : ""].join(""));
    if (state.hl.size) p.set("hl", [...state.hl].map(([u, c]) => `${u}.${c.slice(1)}`).join(","));
    if (state.markers.length) p.set("mk", state.markers.map((m) =>
      [m.plane[0], m.x, m.depth, m.ref[0], m.shape, m.color.slice(1), m.size, encodeURIComponent(m.label), m.ap || 0, m.len || 1.5, m.tc || 0, m.ts || 0].join("~")).join(","));
    if (state.plane === "view3d") { p.set("rot", viewParts().rot); p.set("elev", state.elev); }
    if (state.fill === "colour") p.set("fc", state.fillColor.slice(1));
    history.replaceState(null, "", "#" + p.toString());
  }, 250);
}
function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const g = (k) => p.get(k);
  if (["coronal", "sagittal", "dorsal", "view3d"].includes(g("plane"))) state.plane = g("plane");
  const old = /^(side|front|rear)-(left|right)$/.exec(g("view") || "");      // links from the earlier version
  if (old) { const a = { side: 0, front: 45, rear: -45 }[old[1]]; state.rot = old[2] === "right" ? normRot(180 - a) : a; }
  if (g("rot") != null && isFinite(+g("rot"))) state.rot = normRot(Math.round(+g("rot") / ROT_STEP) * ROT_STEP);
  if (ELEVS.includes(+g("elev"))) state.elev = +g("elev");
  if (g("pos") != null && isFinite(+g("pos"))) state.pos = +g("pos");
  if (SYSTEMS[g("sys")]) state.coords = g("sys");
  if (["major", "summary", "fine"].includes(g("lvl"))) state.level = g("lvl");
  if (["none", "grey", "allen", "colour"].includes(g("fill"))) state.fill = g("fill");
  const hex = (v) => (/^[0-9a-f]{6}$/i.test(v || "") ? "#" + v : null);
  state.fillColor = hex(g("fc")) || state.fillColor;
  state.lineColor = hex(g("lc")) || state.lineColor; state.outlineColor = hex(g("oc")) || state.outlineColor;
  if (g("lw") != null && isFinite(+g("lw"))) state.lineWidth = +g("lw");
  if (["both", "left", "right"].includes(g("hemi"))) state.hemi = g("hemi");
  if (["none", "hl", "all"].includes(g("lab"))) state.labels = g("lab");
  if (g("opt") != null) { const o = g("opt"); state.scalebar = o.includes("s"); state.caption = o.includes("c"); state.grid = o.includes("g"); }
  if (g("hl")) for (const t of g("hl").split(",")) {
    const [u, c] = t.split("."), m = /^(\d+)([LR]?)$/.exec(u || "");
    if (m && struct(+m[1]) && hex(c)) state.hl.set(m[2] ? m[1] + m[2] : +m[1], hex(c));
  }
  if (g("mk")) for (const t of g("mk").split(",")) {
    const [pl, x, d, r, sh, c, sz, lab, mapv, mlen, mtc, mts] = t.split("~");
    if (!hex(c)) continue;
    const plane = { s: "sagittal", d: "dorsal", v: "view3d" }[pl] || "coronal";
    const okShapes = plane === "view3d" ? SHAPES.view3d.map((o) => o[0]) : ["dot", "cross", "track", "ring"];
    state.markers.push({ plane, x: +x, depth: +d, ref: r === "b" ? "bregma" : "surface",
      shape: okShapes.includes(sh) ? sh : okShapes[0], color: hex(c), size: +sz || 0.1, label: decodeURIComponent(lab || ""),
      ap: +mapv || 0, len: +mlen || 1.5, tc: +mtc || 0, ts: +mts || 0 });
  }
}
function stateToForm() {
  document.querySelector(`input[name=plane][value=${state.plane}]`).checked = true;
  $("coords").value = state.coords; $("level").value = state.level; $("fill").value = state.fill;
  $("rot").value = viewParts().rot; $("elev").value = state.elev; syncRotUi(); $("fillColor").value = state.fillColor; $("fillColorField").hidden = state.fill !== "colour";
  $("lineColor").value = state.lineColor; $("outlineColor").value = state.outlineColor; $("lineWidth").value = state.lineWidth;
  $("hemi").value = state.hemi; $("labels").value = state.labels;
  $("scalebar").checked = state.scalebar; $("caption").checked = state.caption; $("grid").checked = state.grid;
}

/* ---------- wiring ---------- */
function wire() {
  for (const r of document.querySelectorAll("input[name=plane]")) r.addEventListener("change", () => {
    if (editing >= 0) stopEdit(true);
    state.plane = r.value;
    state.pos = state.plane === "coronal" ? -6.36 : state.plane === "sagittal" ? 1.0 : 0;
    if (state.plane === "view3d" && state.fill === "none") { state.fill = "colour"; $("fill").value = "colour"; $("fillColorField").hidden = false; }
    syncPlaneUi(); draw();
  });
  $("pos").addEventListener("change", () => { const v = +$("pos").value; if (isFinite(v)) { state.pos = v; syncPlaneUi(); draw(); } });
  $("posSlider").addEventListener("input", () => { state.pos = +(+$("posSlider").value).toFixed(2); $("pos").value = state.pos; draw(); });
  $("coords").addEventListener("change", () => { state.coords = $("coords").value; current = null; syncPlaneUi(); draw(); });
  const simple = { level: "level", fill: "fill", lineColor: "lineColor", outlineColor: "outlineColor", hemi: "hemi", labels: "labels", fillColor: "fillColor" };
  $("fill").addEventListener("input", () => { $("fillColorField").hidden = $("fill").value !== "colour"; });
  for (const [k, id] of Object.entries(simple)) $(id).addEventListener("input", () => { state[k] = $(id).value; draw(); });
  $("lineWidth").addEventListener("input", () => { state.lineWidth = +$("lineWidth").value; draw(); });
  $("rot").addEventListener("input", () => setView(+$("rot").value, state.elev));
  $("elev").addEventListener("input", () => setView(state.rot, +$("elev").value));
  $("rotL").addEventListener("click", () => setView(state.rot - ROT_STEP, state.elev));
  $("rotR").addEventListener("click", () => setView(state.rot + ROT_STEP, state.elev));
  $("elevU").addEventListener("click", () => setView(state.rot, state.elev + 15));
  $("elevD").addEventListener("click", () => setView(state.rot, state.elev - 15));
  // drag the 3D drawing to rotate: horizontal = around the brain, vertical = camera height
  const DRAG_PX = 22;
  let drag = null;
  $("paper").addEventListener("pointerdown", (e) => {
    if (state.plane !== "view3d" || e.button !== 0 || e.shiftKey) return;
    drag = { x: e.clientX, y: e.clientY, rot: state.rot, elev: state.elev, moved: false, id: e.pointerId };
  });
  $("paper").addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 5) { drag.moved = true; $("paper").setPointerCapture(drag.id); }
    if (!drag.moved) return;
    setView(drag.rot + Math.round(dx / DRAG_PX) * ROT_STEP, drag.elev + Math.round(dy / DRAG_PX) * 15);
  });
  const endDrag = (e) => { if (drag) { suppressClick = drag.moved; drag = null; } };
  $("paper").addEventListener("pointerup", endDrag);
  $("paper").addEventListener("pointercancel", endDrag);
  $("paper").addEventListener("keydown", (e) => {
    if (state.plane !== "view3d") return;
    const k = { ArrowLeft: [-ROT_STEP, 0], ArrowRight: [ROT_STEP, 0], ArrowUp: [0, -15], ArrowDown: [0, 15] }[e.key];
    if (!k) return;
    e.preventDefault(); setView(state.rot + k[0], state.elev + k[1]);
  });
  for (const k of ["scalebar", "caption", "grid"]) $(k).addEventListener("change", () => { state[k] = $(k).checked; draw(); });

  const dl = $("regionList");
  const opts = Object.entries(atlas.structures).filter(([u]) => +u !== 997)
    .map(([, s]) => `${s.a} — ${s.n}`).sort((a, b) => a.localeCompare(b));
  dl.innerHTML = opts.map((o) => `<option value="${esc(o)}">`).join("");
  const add = () => {
    const u = findStructure($("regionSearch").value);
    if (u == null) { $("status").textContent = `No region matches "${$("regionSearch").value}".`; return; }
    $("regionSearch").value = ""; addHighlight(u);
  };
  $("addRegion").addEventListener("click", add);
  $("regionSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  $("controls").addEventListener("submit", (e) => e.preventDefault());

  $("addMarker").addEventListener("click", () => {
    if (editing >= 0) { applyEdit(); stopEdit(true); draw(); return; }
    state.markers.push(readMarkerForm()); draw();
  });
  $("cancelEdit").addEventListener("click", () => { stopEdit(false); draw(); });
  for (const ev of ["input", "change"]) $("markerSet").addEventListener(ev, (e) => {
    if (editing >= 0 && e.target.closest("#markerList") === null && e.target.id !== "addMarker") applyEdit();
  });

  const paper = $("paper");
  paper.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; return; }
    if (!current) return;
    const pt = svgPoint(e); if (!pt) return;
    if (e.shiftKey && current.plane === "view3d") return;
    if (e.shiftKey && current.plane === "dorsal") {
      $("mx").value = (pt[0] / 1000).toFixed(2); $("mdv").value = (-pt[1] / 1000).toFixed(2);
      if (editing >= 0) applyEdit(); else { state.markers.push(readMarkerForm()); draw(); }
      return;
    }
    if (e.shiftKey) {
      const [X, Y] = pt;
      const ref = $("mref").value;
      let depth = Y;
      if (ref === "surface") { const sy = surfaceY(current, X); if (sy == null) return; depth = Y - sy; }
      $("mx").value = ((current.plane === "coronal" ? X : -X) / 1000).toFixed(2);
      $("mdv").value = (depth / 1000).toFixed(2);
      if (editing >= 0) applyEdit(); else { state.markers.push(readMarkerForm()); draw(); }
      return;
    }
    const el = e.target.closest("[data-id]");
    if (!el) return;
    const id = +el.dataset.id;
    let side = el.dataset.side || null;
    if ((e.ctrlKey || e.metaKey) && current.plane !== "sagittal") {
      // one hemisphere only: the half that was clicked
      if (!side) side = pt[0] < 0 ? "L" : "R";
      const full = hlColour(id);
      const sided = hlColour(id, side);
      if (full && sided && full[0] === sided[0]) {                  // whole region highlighted: drop the clicked half
        const other = side === "L" ? "R" : "L";
        state.hl.delete(full[0]); state.hl.set(keyId(full[0]) + other, full[1]);
      } else if (sided) state.hl.delete(sided[0]);
      else addHighlight(id + side);
      draw(); return;
    }
    const h = hlColour(id, side) || hlSided(id)[0];
    if (h) state.hl.delete(h[0]); else addHighlight(id);
    draw();
  });
  let raf = 0;
  paper.addEventListener("pointermove", (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!current) return;
      const pt = svgPoint(e); if (!pt) return;
      const [X, Y] = pt;
      const r = hitRegion(current, "fine", X, Y);
      const name = r ? `${struct(r.id).a} — ${struct(r.id).n} · ` : "";
      if (current.plane === "view3d") { $("hover").innerHTML = name ? esc(name.slice(0, -3)) : "&nbsp;"; return; }
      if (current.plane === "dorsal") { $("hover").textContent = `${name}ML ${fmt(X / 1000)} mm, AP ${fmt(-Y / 1000)} mm`; return; }
      const sy = surfaceY(current, X);
      const a = current.plane === "coronal" ? `ML ${fmt(X / 1000)} mm` : `AP ${fmt(-X / 1000)} mm`;
      const dv = `${fmt(Y / 1000)} mm below bregma` + (sy != null && Y >= sy ? ` (${fmt((Y - sy) / 1000)} mm below surface)` : "");
      $("hover").textContent = (r ? `${struct(r.id).a} — ${struct(r.id).n} · ` : "") + `${a}, ${dv}`;
    });
  });
  paper.addEventListener("pointerleave", () => { $("hover").innerHTML = "&nbsp;"; });

  $("dlSvg").addEventListener("click", exportSvg);
  $("dlPng").addEventListener("click", exportPng);
  $("copyLink").addEventListener("click", async () => {
    saveHash(); await new Promise((r) => setTimeout(r, 300));
    try { await navigator.clipboard.writeText(location.href); $("status").textContent = "Link copied."; }
    catch (e) { $("status").textContent = "Copy failed; use the address bar."; }
  });
}

(async function init() {
  try {
    atlas = await (await fetch("data/index.json")).json();
  } catch (e) { $("status").textContent = "Could not load the atlas index."; return; }
  loadHash(); stateToForm(); syncPlaneUi(); wire(); draw();
})();
