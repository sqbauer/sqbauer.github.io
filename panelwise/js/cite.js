"use strict";
/* ---------- citations: copy one, or export BibTeX ----------
   Title, authors and year come from the PDF. The journal, volume, pages and DOI come from OpenAlex the first
   time you copy a citation (one request with the DOI or the title; nothing else is sent), and are saved with
   the paper (r.cite), so BibTeX export afterwards works offline. */
const CITE_SEL = "doi,title,publication_year,authorships,primary_location,biblio";

async function citeData(id) {
  const r = recOf(id) || {}, it = L.meta.items.find(x => x.id === id) || {};
  if (r.cite) return { ...r.cite, title: r.cite.title || r.title };
  const base = { title: r.title || it.title || "", authors: r.authors || it.authors || [], year: r.year || it.year || "", doi: it.doi || "" };
  if (!PW.online()) return base;
  try {
    let w = null;
    if (base.doi) w = await oaJSON(`${OA_API}/works/https://doi.org/${encodeURIComponent(base.doi)}?select=${CITE_SEL}`);
    else if (base.title) {
      const j = await oaJSON(`${OA_API}/works?search=${encodeURIComponent(base.title.slice(0, 250))}&per-page=3&select=${CITE_SEL}`);
      w = (j.results || []).find(x => x.title && normTitle(x.title) === normTitle(base.title)) || null;
    }
    if (!w) return base;
    const b = w.biblio || {}, src = (w.primary_location || {}).source || {};
    const cite = {
      title: w.title || base.title, year: w.publication_year || base.year,
      authors: (w.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean),
      journal: src.display_name || "", volume: b.volume || "", issue: b.issue || "", pages: b.first_page ? b.first_page + (b.last_page && b.last_page !== b.first_page ? "–" + b.last_page : "") : "",
      doi: (w.doi || "").replace(/^https?:\/\/doi\.org\//, "") || base.doi,
    };
    if (!cite.authors.length) cite.authors = base.authors;
    if (recOf(id) && D.col) patchRec(id, { cite });
    return cite;
  } catch { return base; }
}
// "Walker MP, Brakefield T, … Stickgold R (2002). Title. Neuron 35(1): 205–211. https://doi.org/…"
function citeText(c) {
  const au = c.authors || [], short = n => { const k = auKey(n); const parts = String(n).replace(/,.*$/, "").trim().split(/\s+/); const ini = parts.slice(0, -1).map(p => p[0]).join("").toUpperCase(); return `${parts[parts.length - 1]} ${ini}`.trim() || k.sur; };
  const names = au.length > 6 ? [...au.slice(0, 3).map(short), "…", short(au[au.length - 1])].join(", ") : au.map(short).join(", ");
  const where = [c.journal, c.volume ? c.volume + (c.issue ? `(${c.issue})` : "") : "", c.pages].filter(Boolean).join(" ").replace(/ (\d)/, " $1");
  return `${names}${c.year ? ` (${c.year})` : ""}. ${c.title}.${where ? " " + where.replace(/ (\S+)$/, ": $1") + "." : ""}${c.doi ? ` https://doi.org/${c.doi}` : ""}`.replace(/\.\./g, ".");
}
function bibKey(c, used) {
  const sur = auKey((c.authors || [])[0] || "").sur.replace(/[^a-z]/g, "") || "anon";
  const w = (normTitle(c.title).split(" ").find(x => x.length > 3) || "paper");
  let k = `${sur}${c.year || ""}${w}`, n = 1; while (used.has(k)) k = `${sur}${c.year || ""}${w}${++n}`; used.add(k); return k;
}
function bibEntry(c, used) {
  const e = s => String(s || "").replace(/[{}\\]/g, "");
  const f = [["title", `{${e(c.title)}}`], ["author", (c.authors || []).map(a => { const p = String(a).replace(/,.*$/, "").trim().split(/\s+/); return `${e(p.pop())}, ${e(p.join(" "))}`; }).join(" and ")],
    ["journal", e(c.journal)], ["year", e(c.year)], ["volume", e(c.volume)], ["number", e(c.issue)], ["pages", e(c.pages).replace("–", "--")], ["doi", e(c.doi)]].filter(([, v]) => v);
  return `@article{${bibKey(c, used)},\n${f.map(([k, v]) => `  ${k} = {${v}}`).join(",\n")}\n}`;
}
async function copyCitation(id) {
  toast("Looking up the citation…");
  const c = await citeData(id);
  try { await navigator.clipboard.writeText(citeText(c)); toast("Citation copied"); }
  catch { toast(citeText(c), 10000); }
}
// BibTeX for a topic's papers or the whole library (what's known; papers never cited before are looked up first)
async function exportBib(recs, name) {
  if (!recs.length) { toast("No papers to export."); return; }
  toast(`Preparing ${recs.length} references…`);
  const used = new Set(), out = [];
  for (const r of recs) out.push(bibEntry(await citeData(r.id), used));
  const text = out.join("\n\n") + "\n", file = `${mdSafe(name)}.bib`;
  if (PW.native && PW.files.folderName) { await PW.files.writeText(`_panelwise/${file}`, text); toast(`Saved ${PW.files.folderName}/_panelwise/${file}`, 5000); }
  else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/x-bibtex" })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
}

document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-cite], [data-mdpaper], [data-mdtopic], [data-bibtopic], [data-biball]"); if (!t) return;
  if (t.dataset.cite) copyCitation(t.dataset.cite);
  else if (t.dataset.mdpaper) mdExportPaper(t.dataset.mdpaper);
  else if (t.dataset.mdtopic) mdExportTopic(t.dataset.mdtopic);
  else if (t.dataset.bibtopic) exportBib(papersInTopic(t.dataset.bibtopic), t.dataset.bibtopic);
  else if (t.dataset.biball) exportBib(allRecs(), "Panelwise library");
});
