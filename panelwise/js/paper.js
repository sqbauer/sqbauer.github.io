"use strict";
/* ---------- paper model ---------- */
function buildPaper(raw) {
  const P = { ...raw };
  P.sections = { intro: [], results: [], discussion: [], methods: [], other: [], ...raw.sections };
  P.figures = raw.figures.map(f => {
    const L = splitLegend(f.legend);
    const letters = new Set(L.segs.flatMap(s => s.letters));
    (f.panels || []).forEach(p => letters.add(p.label));
    return { ...f, L, letters: [...letters].sort() };
  });
  P.paras = [];
  for (const [sec, list] of Object.entries(raw.sections)) {
    if (sec === "refs") continue;
    list.forEach(text => P.paras.push({ sec, text, keys: refKeys(text) }));
  }
  P.fullText = paperText(P);
  return P;
}
function paperText(P) {
  const name = { intro: "Introduction", results: "Results", discussion: "Discussion", methods: "Methods", other: "Other text" };
  let t = `TITLE: ${P.title}\n\nABSTRACT:\n${P.abstract || ""}\n`;
  for (const k of ["intro", "results", "discussion", "methods", "other"]) if (P.sections[k] && P.sections[k].length) t += `\n${name[k].toUpperCase()}:\n` + P.sections[k].join("\n\n") + "\n";
  t += "\nFIGURE LEGENDS:\n" + P.figures.map(f => f.legend).join("\n\n");
  return t.slice(0, 190000);
}

