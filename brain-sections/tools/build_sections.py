#!/usr/bin/env python3
"""Build the coronal section data used by brain-sections/index.html.

Source: Allen Mouse Brain Common Coordinate Framework v3 (CCFv3, 2017 annotation, 10 um),
Wang et al. 2020, Cell 181:936-953, https://doi.org/10.1016/j.cell.2020.04.007.

For every coronal plane (every STEP_UM along AP) and three levels of the structure hierarchy,
each region's voxel mask is blurred with a Gaussian and contoured at 0.5. Because the blur is
linear, two regions that share a border get (almost) the same contour, so the regions tile the
section without gaps. Contours are simplified and written as SVG path strings in units of 10 um.

Usage (Python 3.10+, pip install numpy scipy scikit-image pynrrd):
    python build_sections.py --cache /tmp/ccf --out ../data
Downloads annotation_10.nrrd (~33 MB) and the structure ontology from the Allen Institute on first run.
"""
import argparse, json, os, urllib.request
import numpy as np
import nrrd
from scipy import ndimage
from skimage.measure import find_contours, approximate_polygon

ANNOT_URL = ("https://download.alleninstitute.org/informatics-archive/current-release/"
             "mouse_ccf/annotation/ccf_2017/annotation_10.nrrd")
ONTOLOGY_URL = "https://api.brain-map.org/api/v2/structure_graph_download/1.json"
SET_URL = ("https://api.brain-map.org/api/v2/data/query.json?criteria=model::Structure,"
           "rma::criteria,structure_sets%5Bid$eq{}%5D,rma::options%5Bnum_rows$eqall%5D")
SUMMARY_SET, MAJOR_SET = 167587189, 687527670   # "Brain - Summary Structures", "Brain - Major Divisions"
FIBER, VS = 1009, 73                            # fiber tracts, ventricular systems
RES = 10                                        # um per voxel
SIGMA = 1.0                                     # blur, voxels
TOL = 0.35                                      # Douglas-Peucker tolerance, voxels
MIN_AREA = 4.0                                  # drop contours smaller than this (voxels^2)


def fetch(url, path):
    if not os.path.exists(path):
        print("downloading", url)
        urllib.request.urlretrieve(url, path)
    return path


def flatten(node, out, path=()):
    path = path + (node["id"],)
    out[node["id"]] = dict(acronym=node["acronym"], name=node["name"], color=node["color_hex_triplet"],
                           parent=path[-2] if len(path) > 1 else None, path=list(path))
    for c in node.get("children", []):
        flatten(c, out, path)


def level_maps(ids, st, summary, major):
    """annotation id -> displayed id, for each level."""
    maps = {"major": {}, "summary": {}, "fine": {}}
    for u in ids:
        path = st[u]["path"]
        # major divisions; fiber tracts and ventricles as their own groups
        maj = next((p for p in reversed(path) if p in major or p in (FIBER, VS)), u)
        # summary structures; fiber tracts two levels below "fiber tracts", ventricles one below "VS"
        if FIBER in path:
            i = path.index(FIBER); summ = path[min(i + 2, len(path) - 1)]
        elif VS in path:
            i = path.index(VS); summ = path[min(i + 1, len(path) - 1)]
        else:
            summ = next((p for p in reversed(path) if p in summary), maj)
        maps["major"][u], maps["summary"][u], maps["fine"][u] = maj, summ, u
    return maps


def ring_area(c):
    x, y = c[:, 0], c[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def path_d(contours):
    """SVG path data, integer voxel coordinates, relative moves (compact; ~5 um rounding)."""
    out = []
    for c in contours:
        q = np.rint(c).astype(int)
        q = q[np.r_[True, np.any(q[1:] != q[:-1], axis=1)]]   # drop repeats after rounding
        if len(q) < 3:
            continue
        d = np.diff(q, axis=0)
        out.append(f"M{q[0, 0]} {q[0, 1]}l" + " ".join(f"{x} {y}" for x, y in d) + "z")
    return "".join(out)


def contours_of(mask, off):
    """mask: bool array (padded crop); off: (row, col) of crop origin in slice coords."""
    b = ndimage.gaussian_filter(mask.astype(np.float32), SIGMA)
    out = []
    for c in find_contours(b, 0.5):
        c = approximate_polygon(c, TOL)
        if len(c) < 4 or ring_area(c) < MIN_AREA:
            continue
        xy = np.column_stack([c[:-1, 1] + off[1], c[:-1, 0] + off[0]])  # x = ML, y = DV
        out.append(xy)
    return out


def anchor(mask):
    """Label point: the most interior voxel of the largest connected piece."""
    lab, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        mask = lab == (1 + int(np.argmax(sizes)))
    dt = ndimage.distance_transform_edt(mask)
    r, c = np.unravel_index(int(np.argmax(dt)), dt.shape)
    return int(c), int(r), float(dt[r, c])


def build_plane(sl, ids, maps, used):
    """Contours of one section (2D label image, rows = DV) at each hierarchy level."""
    P = 3                       # padding (voxels) around each region crop
    o = P + 2
    sl = np.pad(sl, o)
    brain = sl > 0
    rr, cc = np.nonzero(brain)
    rec = {"bbox": [int(cc.min() - o), int(rr.min() - o), int(cc.max() - o + 1), int(rr.max() - o + 1)],
           "outline": path_d(contours_of(brain, (-o, -o)))}
    keys = np.array(ids)
    nz = brain
    for lvl, m in maps.items():
        vals = np.array([m[u] for u in ids])
        disp = vals[np.searchsorted(keys, sl[nz])]
        uniq = np.unique(disp)
        comp = np.zeros(sl.shape, np.int32)
        comp[nz] = np.searchsorted(uniq, disp) + 1
        regions = []
        for k, sli in enumerate(ndimage.find_objects(comp)):
            if sli is None:
                continue
            r0 = max(sli[0].start - P, 0); c0 = max(sli[1].start - P, 0)
            crop = comp[r0:sli[0].stop + P, c0:sli[1].stop + P] == k + 1
            cs = contours_of(crop, (r0 - o, c0 - o))
            if not cs:
                continue
            x, y, depth = anchor(crop)
            sid = int(uniq[k]); used.add(sid)
            regions.append([sid, path_d(cs), x + c0 - o, y + r0 - o, int(crop.sum()), round(depth, 1)])
        regions.sort(key=lambda r: -r[4])  # large first, so small regions draw on top
        rec[lvl] = regions
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="ccf_cache")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    ap.add_argument("--step", type=int, default=50, help="spacing between planes in um")
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    for plane in ("coronal", "sagittal"):
        os.makedirs(os.path.join(a.out, plane), exist_ok=True)

    annot, _ = nrrd.read(fetch(ANNOT_URL, os.path.join(a.cache, "annotation_10.nrrd")))  # (AP, DV, ML)
    onto = json.load(open(fetch(ONTOLOGY_URL, os.path.join(a.cache, "ontology.json"))))["msg"][0]
    st = {}; flatten(onto, st)
    def set_ids(s):
        p = fetch(SET_URL.format(s), os.path.join(a.cache, f"set_{s}.json"))
        return {m["id"] for m in json.load(open(p))["msg"]}
    summary, major = set_ids(SUMMARY_SET), set_ids(MAJOR_SET)

    ids = [int(u) for u in np.unique(annot) if u != 0]
    maps = level_maps(ids, st, summary, major)
    used = set()
    index = {"coronal": [], "sagittal": []}
    where = {}   # structure id -> plane -> [first um, last um, um of largest area, largest area]
    n = a.step // RES
    # coronal: every n-th AP plane; image rows = DV, cols = ML (x = ML, y = DV)
    planes = [("coronal", z * RES, lambda z=z: annot[z]) for z in range(0, annot.shape[0], n)]
    # sagittal: the volume is mirror-symmetric about ML 5695 um (between voxels 569|570), so only
    # one hemisphere; ML index i has centre i*10 um, i.e. 5 + 50k um from the midline.
    # image rows = DV, cols = AP (x = AP, y = DV)
    mid = annot.shape[2] // 2
    planes += [("sagittal", i * RES, lambda i=i: annot[:, :, i].T) for i in range(mid, annot.shape[2], n)]
    for plane, pos_um, get in planes:
        sl = get()
        if not sl.any():
            continue
        rec = build_plane(sl, ids, maps, used)
        key = "ccf_ap_um" if plane == "coronal" else "ccf_ml_um"
        rec = {key: pos_um, **rec}
        fn = f"{pos_um:05d}.json"
        with open(os.path.join(a.out, plane, fn), "w") as f:
            json.dump(rec, f, separators=(",", ":"))
        index[plane].append(pos_um)
        for l in maps:
            for r in rec[l]:
                w = where.setdefault(r[0], {}).setdefault(plane, [pos_um, pos_um, pos_um, 0])
                w[0] = min(w[0], pos_um); w[1] = max(w[1], pos_um)
                if r[4] > w[3]:
                    w[2], w[3] = pos_um, r[4]
        print(plane, fn, {l: len(rec[l]) for l in maps}, flush=True)

    # structures used, with their ancestors (for search and hierarchy display)
    keep = set()
    for u in used:
        keep.update(st[u]["path"])
    structs = {}
    for u in sorted(keep):
        e = {"a": st[u]["acronym"], "n": st[u]["name"], "c": st[u]["color"], "p": st[u]["parent"]}
        if u in where:
            e["w"] = {pl: v[:3] for pl, v in where[u].items()}
        structs[u] = e
    meta = {"source": "Allen Mouse Brain CCFv3 (2017), 10 um annotation",
            "citation": "Wang Q, et al. (2020) The Allen Mouse Brain Common Coordinate Framework: "
                        "A 3D Reference Atlas. Cell 181:936-953. doi:10.1016/j.cell.2020.04.007",
            "units": "path coordinates in voxels of 10 um, CCF origin; coronal x = ML, sagittal x = AP; y = DV (0 = dorsal)",
            "volume_shape_ap_dv_ml": list(annot.shape), "step_um": a.step, "res_um": RES,
            "midline_ml_um": 5695,
            "sigma_vox": SIGMA, "tolerance_vox": TOL}
    with open(os.path.join(a.out, "index.json"), "w") as f:
        json.dump({"meta": meta, "structures": structs, "planes": index}, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
