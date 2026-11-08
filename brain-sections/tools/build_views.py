#!/usr/bin/env python3
"""Build the oblique "3D" views used by brain-sections/index.html.

For each view on a grid of camera positions on the animal's left (azimuth -90..90 deg in 15 deg
steps, 0 = side, +90 = front, -90 = rear; elevation 0..75 deg above the horizontal in 15 deg steps), the Allen CCFv3 annotation (sampled at 20 um) is ray-cast with an
orthographic camera. Written per view:
  - the visible surface, partitioned into regions at two hierarchy levels (major, summary), each
    piece tagged with its hemisphere ("L" = ML < 0, "R");
  - the brain silhouette;
  - per-region, per-hemisphere silhouettes (summary structures and major divisions), to show
    deep targets "through" the brain; keys are "<id>L" / "<id>R";
  - a depth map (distance towards the camera of the first surface hit, 40 um grid, 80 um steps), so the page
    can hide the parts of fibres and electrodes that the brain occludes.
Right-side views are mirror images of these (the annotation is mirror-symmetric) and are made in
the page.

Coordinates: world W = (X = ML right, Y = anterior, Z = up) in um relative to bregma
(CCF AP 5400, DV 332) and the midline (CCF ML 5695), unscaled CCF. Screen u = W.right,
v = -W.up_s (down), depth t = W.cam (larger = nearer the camera).

Usage: python build_views.py --cache /tmp/ccf --out ../data   (needs build_sections.py alongside)
"""
import argparse, base64, json, os, sys
from multiprocessing import Pool
import time
import numpy as np
import nrrd
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sections as bs  # noqa: E402

PX = 20            # um per pixel of the views (and of the sampled volume)
DEPTH_PX = 40      # um per pixel of the stored depth map
BREGMA_AP, BREGMA_DV, MIDLINE = 5400, 332, 5695
AZIMUTHS = list(range(-90, 91, 15))     # camera on the left: 0 = side, +90 = front, -90 = rear
ELEVATIONS = list(range(0, 76, 15))      # degrees above the horizontal (90 = the dorsal view)
VIEWS = {f"a{az}_e{el}": (az, el) for az in AZIMUTHS for el in ELEVATIONS}
DEPTH_UNIT = 80    # um per step of the stored (uint8) depth map


def camera(az, el):
    a, e = np.deg2rad(az), np.deg2rad(el)
    cam = np.array([-np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)])  # towards camera
    up = np.array([0.0, 0.0, 1.0])
    right = np.cross(up, cam); right /= np.linalg.norm(right)
    s = np.cross(cam, right)                                                     # screen up
    return cam, right, s


def world_to_index(W, res):
    """World (N,3) um -> fractional voxel indices (AP, DV, ML) in a volume of resolution res."""
    ml = W[:, 0] + MIDLINE
    ap = BREGMA_AP - W[:, 1]
    dv = BREGMA_DV - W[:, 2]
    return np.vstack([ap / res, dv / res, ml / res])


G = {}  # shared, read-only state for worker processes (inherited by fork)


def render_view(item):
    name, (az, el) = item
    vol, ids, maps, summ_ids, corners, out = (G[k] for k in ("vol", "ids", "maps", "summ_ids", "corners", "out"))
    fine_of, summ_of = G["fine_of"], G["summ_of"]                # compact label -> CCF id / summary index
    cam, right, s = camera(az, el)
    U, V, T = corners @ right, -(corners @ s), corners @ cam
    u0, v0, t0 = U.min() - 200, V.min() - 200, T.min() - 200
    nu, nv, nt = int((U.max() + 200 - u0) / PX) + 1, int((V.max() + 200 - v0) / PX) + 1, int((T.max() + 200 - t0) / PX) + 1
    uu = (u0 + np.arange(nu) * PX).astype(np.float32)
    tt = (t0 + np.arange(nt)[::-1] * PX).astype(np.float32)       # near (camera) first
    K = len(summ_ids) + 1
    surf = np.zeros((nv, nu), np.uint32)
    side = np.zeros((nv, nu), np.uint8)                            # 1 = left (ML < 0), 2 = right
    depth = np.full((nv, nu), np.nan, np.float32)
    sil = np.zeros((2 * K, nv, nu), bool)                          # [summary index + K * (side - 1)]
    shp = np.array(vol.shape)
    # world W = u*right - v*s + t*cam; voxel index (ap, dv, ml) = ((5400 - Y), (332 - Z), (X + 5695)) / PX
    def idx(Wx, Wy, Wz):
        return (BREGMA_AP - Wy) / PX, (BREGMA_DV - Wz) / PX, (Wx + MIDLINE) / PX
    for j in range(nv):
        v = v0 + j * PX
        Wx = uu[:, None] * right[0] - v * s[0] + tt[None, :] * cam[0]
        Wy = uu[:, None] * right[1] - v * s[1] + tt[None, :] * cam[1]
        Wz = uu[:, None] * right[2] - v * s[2] + tt[None, :] * cam[2]
        ia, idv, iml = (np.rint(q).astype(np.int32) for q in idx(Wx, Wy, Wz))
        ok = (ia >= 0) & (ia < shp[0]) & (idv >= 0) & (idv < shp[1]) & (iml >= 0) & (iml < shp[2])
        lab = np.zeros(ia.shape, vol.dtype)
        lab[ok] = vol[ia[ok], idv[ok], iml[ok]]                    # (nu, nt) compact labels
        hit = lab > 0
        any_ = hit.any(1)
        first = hit.argmax(1)
        ar = np.arange(nu)
        surf[j] = np.where(any_, fine_of[lab[ar, first]], 0)
        side[j] = np.where(any_, np.where(Wx[ar, first] < 0, 1, 2), 0)
        depth[j] = np.where(any_, tt[first], np.nan)
        rows, cols = np.nonzero(hit)
        k = summ_of[lab[rows, cols]] + K * (Wx[rows, cols] >= 0)
        sil[k, j, rows] = True
    lv = {k: maps[k] for k in ("major", "summary")}               # views: the full level ~ summary
    used = set()
    rec = bs.build_plane(surf, ids, lv, used)                      # outline, bbox and both-sides partition
    for sd, tag in ((1, "L"), (2, "R")):                           # per-hemisphere surface pieces
        img = np.where(side == sd, surf, 0)
        part = bs.build_plane(img, ids, lv, used) if img.any() else {l: [] for l in lv}   # e.g. a pure side view
        for l in lv:
            rec[l + tag] = part[l]
    for l in lv:
        del rec[l]
        rec[l] = sorted([r + ["L"] for r in rec[l + "L"]] + [r + ["R"] for r in rec[l + "R"]], key=lambda r: -r[4])
        del rec[l + "L"], rec[l + "R"]
    sils = {}
    for k in range(2 * K):
        ki, sd = k % K, "L" if k < K else "R"
        if ki == 0 or not sil[k].any():
            continue
        d = bs.path_d(bs.contours_of(np.pad(sil[k], 5), (-5, -5)))
        if d:
            sils[f"{summ_ids[ki - 1]}{sd}"] = d
    for mid, parts in G["major_parts"].items():
        if any(f"{mid}{sd}" in sils for sd in "LR") or not parts:
            continue
        for off, sd in ((0, "L"), (K, "R")):
            d = bs.path_d(bs.contours_of(np.pad(sil[[p + off for p in parts]].any(0), 5), (-5, -5)))
            if d:
                sils[f"{mid}{sd}"] = d
    f = DEPTH_PX // PX
    dm = depth[: (nv // f) * f, : (nu // f) * f].reshape(nv // f, f, nu // f, f)
    with np.errstate(all="ignore"):
        dm = np.nanmax(dm, axis=(1, 3))
    dq = np.where(np.isnan(dm), 255, np.clip(np.round((dm - t0) / DEPTH_UNIT), 0, 254)).astype(np.uint8)
    rec.update({"view": name, "az": az, "el": el, "px_um": PX, "origin_uv": [round(u0, 1), round(v0, 1)],
                "cam": cam.round(6).tolist(), "right": right.round(6).tolist(), "up": s.round(6).tolist(),
                "depth": {"px_um": DEPTH_PX, "unit_um": DEPTH_UNIT, "nodata": 255, "shape": list(dq.shape),
                          "t0": round(t0, 1), "data": base64.b64encode(dq.tobytes()).decode()}})
    with open(os.path.join(out, "views", f"{name}.json"), "w") as fh:
        json.dump(rec, fh, separators=(",", ":"))
    with open(os.path.join(out, "views", f"{name}_sil.json"), "w") as fh:
        json.dump(sils, fh, separators=(",", ":"))
    print(name, {l: len(rec[l]) for l in lv}, "silhouettes", len(sils), flush=True)
    return name


def main():
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--cache", default="ccf_cache")
    ap_.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    ap_.add_argument("--workers", type=int, default=4)
    ap_.add_argument("--only", nargs="*", help="view names to build (default: all); index.json is still written for all")
    a = ap_.parse_args()
    os.makedirs(os.path.join(a.out, "views"), exist_ok=True)

    annot, _ = nrrd.read(os.path.join(a.cache, "annotation_10.nrrd"))
    vol20 = np.ascontiguousarray(annot[::2, ::2, ::2])   # 20 um, index i -> i * 20 um
    del annot
    uniq = np.unique(vol20)                               # compact uint16 labels (0 = outside)
    vol = np.searchsorted(uniq, vol20).astype(np.uint16)
    vol = np.where(vol20 == 0, 0, vol).astype(np.uint16) if uniq[0] != 0 else vol
    del vol20
    onto = json.load(open(os.path.join(a.cache, "ontology.json")))["msg"][0]
    st = {}; bs.flatten(onto, st)
    summary = {m["id"] for m in json.load(open(os.path.join(a.cache, f"set_{bs.SUMMARY_SET}.json")))["msg"]}
    major = {m["id"] for m in json.load(open(os.path.join(a.cache, f"set_{bs.MAJOR_SET}.json")))["msg"]}
    ids = [int(u) for u in uniq if u != 0]
    maps = bs.level_maps(ids, st, summary, major)
    summ_ids = sorted(set(maps["summary"].values()))
    fine_of = uniq.astype(np.uint32)                      # compact -> CCF id (0 -> 0)
    summ_of = np.zeros(len(uniq), np.int32)               # compact -> 1-based summary index
    for c, u in enumerate(uniq):
        if u != 0:
            summ_of[c] = summ_ids.index(maps["summary"][int(u)]) + 1
    major_parts = {}
    for u in ids:
        major_parts.setdefault(maps["major"][u], set()).add(summ_ids.index(maps["summary"][u]) + 1)
    major_parts = {k: sorted(v) for k, v in major_parts.items()}
    nz = np.argwhere(vol > 0)
    lo, hi = nz.min(0) * PX, nz.max(0) * PX                       # (ap, dv, ml) um
    corners = np.array([[ml - MIDLINE, BREGMA_AP - ap, BREGMA_DV - dv]
                        for ap in (lo[0], hi[0]) for dv in (lo[1], hi[1]) for ml in (lo[2], hi[2])], float)
    G.update(vol=vol, ids=ids, maps=maps, summ_ids=summ_ids, corners=corners, out=a.out, major_parts=major_parts,
             fine_of=fine_of, summ_of=summ_of)

    with Pool(a.workers) as pool:
        todo = [(n, v) for n, v in VIEWS.items() if not a.only or n in a.only]
        t = time.time()
        pool.map(render_view, todo, chunksize=1)
        print(f"{len(todo)} views in {time.time() - t:.0f} s", flush=True)
    meta = {"azimuths": AZIMUTHS, "elevations": ELEVATIONS, "views": {n: {"az": v[0], "el": v[1]} for n, v in VIEWS.items()}}

    # dorsal surface height (CCF DV um of the topmost labelled voxel) on a 40 um (AP, ML) grid,
    # used by the page to put fibres and "depth below surface" targets on the surface
    f = 2
    m = vol > 0
    top = np.where(m.any(1), m.argmax(1) * PX, 65535).astype(np.int64)        # (ap, ml), um
    top = top[: (top.shape[0] // f) * f, : (top.shape[1] // f) * f].reshape(top.shape[0] // f, f, top.shape[1] // f, f).min(axis=(1, 3))
    sq = np.clip(top, 0, 65535).astype("<u2")
    meta["surface"] = {"px_um": PX * f, "shape": list(sq.shape), "data": base64.b64encode(sq.tobytes()).decode(),
                       "note": "CCF DV (um) of the dorsal surface; rows = CCF AP / 40 um, cols = CCF ML / 40 um; 65535 = no brain"}
    with open(os.path.join(a.out, "views", "index.json"), "w") as fh:
        json.dump(meta, fh, separators=(",", ":"))


if __name__ == "__main__":
    main()
