#!/usr/bin/env python3
"""Build the oblique "3D" views used by brain-sections/index.html.

For each view (camera on the animal's left, looking down at ELEV degrees, turned AZ degrees
towards anterior or posterior), the Allen CCFv3 annotation (sampled at 20 um) is ray-cast with an
orthographic camera. Written per view:
  - the visible surface, partitioned into regions at three hierarchy levels (as for sections);
  - the brain silhouette;
  - per-region silhouettes (summary structures and major divisions), to show deep targets
    "through" the brain;
  - a depth map (distance towards the camera of the first surface hit, 40 um grid), so the page
    can hide the parts of fibres and electrodes that the brain occludes.
Right-side views are mirror images of these (the annotation is mirror-symmetric) and are made in
the page.

Coordinates: world W = (X = ML right, Y = anterior, Z = up) in um relative to bregma
(CCF AP 5400, DV 332) and the midline (CCF ML 5695), unscaled CCF. Screen u = W.right,
v = -W.up_s (down), depth t = W.cam (larger = nearer the camera).

Usage: python build_views.py --cache /tmp/ccf --out ../data   (needs build_sections.py alongside)
"""
import argparse, base64, json, os, sys
import numpy as np
import nrrd
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sections as bs  # noqa: E402

PX = 20            # um per pixel of the views (and of the sampled volume)
DEPTH_PX = 40      # um per pixel of the stored depth map
BREGMA_AP, BREGMA_DV, MIDLINE = 5400, 332, 5695
VIEWS = {          # name: (azimuth deg, elevation deg); az > 0 turns the camera towards anterior
    "side": (0, 30),
    "front": (40, 30),
    "rear": (-40, 30),
}


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


def main():
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--cache", default="ccf_cache")
    ap_.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    a = ap_.parse_args()
    os.makedirs(os.path.join(a.out, "views"), exist_ok=True)

    annot, _ = nrrd.read(os.path.join(a.cache, "annotation_10.nrrd"))
    vol = annot[::2, ::2, ::2]           # 20 um, index i -> i * 20 um
    del annot
    onto = json.load(open(os.path.join(a.cache, "ontology.json")))["msg"][0]
    st = {}; bs.flatten(onto, st)
    summary = {m["id"] for m in json.load(open(os.path.join(a.cache, f"set_{bs.SUMMARY_SET}.json")))["msg"]}
    major = {m["id"] for m in json.load(open(os.path.join(a.cache, f"set_{bs.MAJOR_SET}.json")))["msg"]}
    ids = [int(u) for u in np.unique(vol) if u != 0]
    maps = bs.level_maps(ids, st, summary, major)
    maps["fine"] = {u: (st[u]["parent"] if "layer" in st[u]["name"].lower() else u) for u in ids}
    # compact labels for the summary level (silhouettes)
    summ_ids = sorted(set(maps["summary"].values()))
    lut = np.zeros(int(max(ids)) + 1, np.uint16)
    for u in ids:
        lut[u] = summ_ids.index(maps["summary"][u]) + 1

    # world-space corners of the brain bounding box
    nz = np.argwhere(vol > 0)
    lo, hi = nz.min(0) * PX, nz.max(0) * PX                     # (ap, dv, ml) um
    corners = np.array([[ml - MIDLINE, BREGMA_AP - ap, BREGMA_DV - dv]
                        for ap in (lo[0], hi[0]) for dv in (lo[1], hi[1]) for ml in (lo[2], hi[2])], float)
    meta = {}
    for name, (az, el) in VIEWS.items():
        cam, right, s = camera(az, el)
        U, V, T = corners @ right, -(corners @ s), corners @ cam
        u0, v0, t0 = U.min() - 200, V.min() - 200, T.min() - 200
        nu, nv, nt = int((U.max() + 200 - u0) / PX) + 1, int((V.max() + 200 - v0) / PX) + 1, int((T.max() + 200 - t0) / PX) + 1
        uu = u0 + np.arange(nu) * PX
        tt = t0 + np.arange(nt)[::-1] * PX                         # near (camera) first
        surf = np.zeros((nv, nu), np.uint32)
        depth = np.full((nv, nu), np.nan, np.float32)
        sil = np.zeros((len(summ_ids) + 1, nv, nu), bool)
        for j in range(nv):
            v = v0 + j * PX
            Ug, Tg = np.meshgrid(uu, tt, indexing="ij")            # (nu, nt)
            W = (Ug[..., None] * right + (-v) * s + Tg[..., None] * cam).reshape(-1, 3)
            lab = ndimage.map_coordinates(vol, world_to_index(W, PX), order=0, mode="constant", cval=0)
            lab = lab.reshape(nu, nt)
            hit = lab > 0
            any_ = hit.any(1)
            first = hit.argmax(1)
            surf[j] = np.where(any_, lab[np.arange(nu), first], 0)
            depth[j] = np.where(any_, tt[first], np.nan)
            comp = lut[lab]                                       # (nu, nt) compact summary ids
            rows, cols = np.nonzero(comp)
            sil[comp[rows, cols], j, rows] = True
            if j % 50 == 0:
                print(name, f"row {j}/{nv}", flush=True)
        used = set()
        rec = bs.build_plane(surf, ids, maps, used)
        # silhouettes (summary level), then major divisions as unions of their summary parts
        sils = {}
        for k, sid in enumerate(summ_ids, start=1):
            m = sil[k]
            if not m.any():
                continue
            m = np.pad(m, 5)
            cs = bs.contours_of(m, (-5, -5))
            d = bs.path_d(cs)
            if d:
                sils[sid] = d
        for mid in sorted(set(maps["major"].values())):
            parts = [k for k, sid in enumerate(summ_ids, start=1) if any(maps["major"][u] == mid and maps["summary"][u] == sid for u in ids)]
            if not parts or mid in sils:
                continue
            m = np.pad(sil[parts].any(0), 5)
            d = bs.path_d(bs.contours_of(m, (-5, -5)))
            if d:
                sils[mid] = d
        # depth map at DEPTH_PX
        f = DEPTH_PX // PX
        dm = depth[: (nv // f) * f, : (nu // f) * f].reshape(nv // f, f, nu // f, f)
        dm = np.nanmax(dm, axis=(1, 3))
        dq = np.where(np.isnan(dm), 65535, np.clip(np.round(dm - t0), 0, 65534)).astype("<u2")
        rec.update({"view": name, "az": az, "el": el, "px_um": PX, "origin_uv": [round(u0, 1), round(v0, 1)],
                    "cam": cam.round(6).tolist(), "right": right.round(6).tolist(), "up": s.round(6).tolist(),
                    "depth": {"px_um": DEPTH_PX, "shape": list(dq.shape), "t0": round(t0, 1),
                              "data": base64.b64encode(dq.tobytes()).decode()}})
        with open(os.path.join(a.out, "views", f"{name}.json"), "w") as fh:
            json.dump(rec, fh, separators=(",", ":"))
        with open(os.path.join(a.out, "views", f"{name}_sil.json"), "w") as fh:
            json.dump({str(k): v for k, v in sils.items()}, fh, separators=(",", ":"))
        meta[name] = {"az": az, "el": el}
        print(name, {l: len(rec[l]) for l in maps}, "silhouettes", len(sils), flush=True)
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
