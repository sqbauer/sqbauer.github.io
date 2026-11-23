"use strict";
/* ---------- figure reference parsing ---------- */
const REF_START = /\b(Extended\s+Data\s+|Supplementa(?:ry|l)\s+|Suppl?\.\s*)?(Fig(?:ure)?s?\.?)\s*(?=\d)/g;
function findRefs(text) {
  const out = []; REF_START.lastIndex = 0; let m;
  while ((m = REF_START.exec(text))) {
    const supp = !!m[1] || /\bS$/.test(text.slice(0, m.index));
    let i = m.index + m[0].length, lastGood = i, items = [], cur = null, lastLetter = null, range = false, mode = null;
    while (i < text.length) {
      const rest = text.slice(i); let t;
      if ((t = rest.match(/^\d{1,2}(?!\d)/)) && (mode === null || mode === "sep" || mode === "space" && !cur)) {
        cur = { fig: +t[0], panels: [], lower: null }; items.push(cur); lastLetter = null; i += t[0].length; lastGood = i; mode = "attached"; continue;
      }
      if (cur && cur.panels.length === 0 && (t = rest.match(/^\s*[-–—]\s*(\d{1,2})(?!\d)/))) {
        const to = +t[1]; for (let f = cur.fig + 1; f <= Math.min(to, cur.fig + 12); f++) items.push({ fig: f, panels: [] });
        cur = items[items.length - 1]; i += t[0].length; lastGood = i; mode = "attached"; continue;
      }
      if ((t = rest.match(/^\s+/))) { i += t[0].length; if (mode === "attached") mode = "space"; continue; }
      if (cur && mode && (t = rest.match(/^[A-Za-z](?![A-Za-z])/))) {
        const L = t[0], low = L !== L.toUpperCase(), up = L.toUpperCase();
        if (up > "P") break;
        if (mode === "space" && low) break;
        if (mode === "sep" && low && cur.lower !== true) break;
        if (range && lastLetter) { for (let c = lastLetter.charCodeAt(0) + 1; c <= up.charCodeAt(0); c++) cur.panels.push(String.fromCharCode(c)); range = false; }
        else cur.panels.push(up);
        if (cur.lower === null) cur.lower = low;
        lastLetter = up; i += 1; lastGood = i; mode = null; continue;
      }
      if (lastLetter && (t = rest.match(/^[-–—]/))) { range = true; i += 1; mode = "sep"; continue; }
      if ((t = rest.match(/^(,|and(?![A-Za-z])|&)/i))) { i += t[0].length; mode = "sep"; continue; }
      break;
    }
    if (items.length) out.push({ start: m.index, end: lastGood, supp, items });
    REF_START.lastIndex = Math.max(lastGood, m.index + m[0].length);
  }
  return out;
}
function refKeys(text) {
  const keys = new Set();
  for (const r of findRefs(text)) if (!r.supp) for (const it of r.items) {
    if (it.panels.length) it.panels.forEach(p => keys.add(it.fig + p)); else keys.add(it.fig + "*");
  }
  return keys;
}
function renderRefs(text) {
  let out = "", pos = 0;
  for (const r of findRefs(text)) {
    out += esc(text.slice(pos, r.start));
    const label = text.slice(r.start, r.end), first = r.items[0];
    out += r.supp ? esc(label) : `<button type="button" class="ref" data-fig="${first.fig}" data-panel="${first.panels[0] || ""}">${esc(label)}</button>`;
    pos = r.end;
  }
  return out + esc(text.slice(pos));
}
function splitSentences(p) {
  const parts = []; let start = 0; const re = /[.!?]["')\]]*\s+(?=[A-Z(\[])/g; let m;
  while ((m = re.exec(p))) {
    const before = p.slice(Math.max(0, m.index - 7), m.index + 1);
    if (/\b(Figs?|al|e\.g|i\.e|vs|Eq|Eqs|ref|Refs?|approx|ca|Dr|Prof|St|No|cf|resp)\.$/i.test(before)) continue;
    if (/\b[A-Z]\.$/.test(before)) continue; // initials
    const end = m.index + m[0].length; parts.push(p.slice(start, end).trim()); start = end;
  }
  parts.push(p.slice(start).trim());
  return parts.filter(Boolean);
}
function splitLegend(legend) {
  let body = legend, head = "";
  const hm = legend.match(/^\s*(Fig(?:ure)?\.?\s*\d+\s*[.:|—–]?\s*)/i);
  if (hm) { head = hm[1]; body = legend.slice(hm[0].length); }
  const pats = [
    /\(([A-Pa-p])(?:\s*[-–,]\s*([A-Pa-p]))?\)\s*/g,
    /(?:^|[.;]\s+|\)\s+)([A-Pa-p])(?:\s*[-–]\s*([A-Pa-p]))?\s*[,.:|]\s+(?=\S)/g,
    /(?:^|[.;]\s+)([A-Pa-p])(?:\s*[-–]\s*([A-Pa-p]))?\s+(?=[A-Z])/g
  ];
  let best = null;
  for (const re of pats) {
    re.lastIndex = 0; const hits = []; let m, expect = "A";
    while ((m = re.exec(body))) {
      const a = m[1].toUpperCase(), b = (m[2] || m[1]).toUpperCase();
      if (a !== expect) continue;
      const lead = m[0].match(/^(?:[.;]\s+|\)\s+)/);
      hits.push({ at: m.index + (lead ? lead[0].length : 0), textAt: m.index + m[0].length, a, b });
      expect = String.fromCharCode(b.charCodeAt(0) + 1);
    }
    if (hits.length >= 2 && (!best || hits.length > best.length)) best = hits;
  }
  if (!best) return { head, title: body.trim(), segs: [] };
  const title = body.slice(0, best[0].at).trim();
  const segs = best.map((h, k) => {
    const letters = []; for (let c = h.a.charCodeAt(0); c <= h.b.charCodeAt(0); c++) letters.push(String.fromCharCode(c));
    return { letters, text: body.slice(h.at, k + 1 < best.length ? best[k + 1].at : body.length).trim() };
  });
  return { head, title, segs };
}

