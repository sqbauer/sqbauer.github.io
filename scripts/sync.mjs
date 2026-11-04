#!/usr/bin/env node
// Publication sync: ORCID + PubMed -> DOI list -> Crossref metadata + doi.org BibTeX
// -> _data/publications.json (deterministic, no timestamps, so git diffs show real changes only).
//
// Usage:
//   node scripts/sync.mjs                 write _data/publications.json, report to stdout
//   node scripts/sync.mjs --report FILE   also write the Markdown report to FILE
//   node scripts/sync.mjs --dry-run       fetch and report, write nothing
//
// Nothing here is typed in by hand: every field comes from an API response. Entries that fail
// verification are left out of the JSON and listed in the report. Manual facts that the APIs
// cannot supply (co-first authorship, "in revision", code/data links) live in
// _data/overrides.json and are applied at render time, not here.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "_data", "publications.json");
const OVERRIDES = path.join(ROOT, "_data", "overrides.json");

const ORCID_ID = "0000-0002-5553-1664";
const PUBMED_QUERY = "Bauer Staf[Author]";
const SELF = { family: "bauer", givenInitial: "s" };
const UA = "sqbauer.github.io-publication-sync/1.0 (+https://github.com/sqbauer/sqbauer.github.io)";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;

// ---------- HTTP ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { accept = "application/json", text = false } = {}) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1000 * 2 ** attempt);
    try {
      const res = await fetch(url, { headers: { Accept: accept, "User-Agent": UA }, redirect: "follow" });
      if (res.status === 404) return { status: 404, body: null };
      if (res.status === 429 || res.status >= 500) { last = new Error(`HTTP ${res.status} ${url}`); continue; }
      if (!res.ok) return { status: res.status, body: null };
      return { status: res.status, body: text ? await res.text() : await res.json() };
    } catch (e) { last = e; }
  }
  throw last;
}

// ---------- helpers ----------
const normDoi = (d) => d.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
const stripTags = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const tokens = (s) => new Set(stripTags(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((t) => t.length > 1));
function titleSimilarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
const isSelf = (au) => (au.family || "").toLowerCase() === SELF.family && (au.given || "").trim().toLowerCase().startsWith(SELF.givenInitial);

function dateOf(parts) {
  const p = parts?.["date-parts"]?.[0];
  if (!p || !p[0]) return null;
  return [p[0], p[1] || 1, p[2] || 1].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");
}

// Crossref BibTeX arrives on one line; put each field on its own line.
function prettyBibtex(raw) {
  const s = raw.trim();
  const open = s.indexOf("{");
  if (open < 0) return s;
  let out = s.slice(0, open + 1), depth = 0, field = "";
  const fields = [];
  for (const ch of s.slice(open + 1, -1)) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === "," && depth === 0) { fields.push(field.trim()); field = ""; continue; }
    field += ch;
  }
  if (field.trim()) fields.push(field.trim());
  const [key, ...rest] = fields;
  return out + key + ",\n" + rest.map((f) => "  " + f.replace(/\s*=\s*/, " = ")).join(",\n") + "\n}";
}

// ---------- sources ----------
async function fromOrcid() {
  const { body } = await get(`https://pub.orcid.org/v3.0/${ORCID_ID}/works`);
  const out = new Map();
  for (const g of body?.group || []) {
    const ids = g["external-ids"]?.["external-id"] || [];
    const doi = ids.find((x) => x["external-id-type"] === "doi" && (x["external-id-relationship"] || "self") === "self");
    if (!doi) continue;
    const title = g["work-summary"]?.[0]?.title?.title?.value || "";
    out.set(normDoi(doi["external-id-value"]), { title });
  }
  return out;
}

async function pubmedSummaries(ids) {
  if (!ids.length) return [];
  const { body } = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`);
  return (body?.result?.uids || []).map((uid) => {
    const r = body.result[uid];
    const id = (t) => r.articleids?.find((a) => a.idtype === t)?.value || null;
    return { pmid: uid, doi: id("doi") ? normDoi(id("doi")) : null, pmcid: id("pmc"), title: r.title };
  });
}

async function fromPubmed() {
  const q = encodeURIComponent(PUBMED_QUERY);
  const { body } = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=500&term=${q}`);
  return pubmedSummaries(body?.esearchresult?.idlist || []);
}

async function pubmedByDoi(doi) {
  const { body } = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(`"${doi}"[doi]`)}`);
  const ids = body?.esearchresult?.idlist || [];
  return ids.length === 1 ? (await pubmedSummaries(ids))[0] : null;
}

// ---------- main ----------
async function main() {
  const overrides = JSON.parse(await readFile(OVERRIDES, "utf8"));
  const exclude = new Set((overrides.exclude || []).map(normDoi));
  let previous = [];
  try { previous = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }
  const prevByDoi = new Map(previous.map((p) => [p.doi, p]));

  const report = { unverified: [], warnings: [], added: [], removed: [], changed: [] };

  const [orcidRes, pubmedRes] = await Promise.allSettled([fromOrcid(), fromPubmed()]);
  if (orcidRes.status === "rejected" && pubmedRes.status === "rejected") {
    throw new Error(`Both sources failed: ORCID (${orcidRes.reason}); PubMed (${pubmedRes.reason})`);
  }
  const orcid = orcidRes.status === "fulfilled" ? orcidRes.value : new Map();
  const pubmed = pubmedRes.status === "fulfilled" ? pubmedRes.value : [];
  if (orcidRes.status === "rejected") report.warnings.push(`ORCID unavailable: ${orcidRes.reason}`);
  if (pubmedRes.status === "rejected") report.warnings.push(`PubMed unavailable: ${pubmedRes.reason}`);

  const pmByDoi = new Map(pubmed.filter((p) => p.doi).map((p) => [p.doi, p]));
  for (const p of pubmed) if (!p.doi) report.warnings.push(`PubMed ${p.pmid} has no DOI; not listed ("${p.title}")`);

  const candidates = new Map();
  for (const [doi, o] of orcid) candidates.set(doi, { sources: ["orcid"], orcidTitle: o.title });
  for (const [doi, p] of pmByDoi) {
    const c = candidates.get(doi) || { sources: [] };
    c.sources.push("pubmed");
    candidates.set(doi, c);
  }
  for (const d of (overrides.include || []).map(normDoi)) {
    if (!candidates.has(d)) candidates.set(d, { sources: ["manual"] });
  }
  for (const d of exclude) candidates.delete(d);

  if (orcidRes.status === "fulfilled") {
    for (const doi of pmByDoi.keys()) if (!orcid.has(doi) && !exclude.has(doi)) report.warnings.push(`In PubMed but not in ORCID: ${doi} (add it to your ORCID record)`);
  }

  const entries = [];
  for (const [doi, c] of [...candidates].sort()) {
    let cr;
    try { cr = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`); }
    catch (e) {
      if (prevByDoi.has(doi)) { entries.push(prevByDoi.get(doi)); report.warnings.push(`Crossref unreachable for ${doi}; kept previous metadata (${e.message})`); }
      else report.unverified.push({ doi, reason: `Crossref unreachable (${e.message})` });
      continue;
    }
    if (cr.status !== 200 || !cr.body?.message) { report.unverified.push({ doi, reason: `DOI not found in Crossref (HTTP ${cr.status})` }); continue; }
    const m = cr.body.message;

    const title = stripTags(m.title?.[0]);
    const authors = (m.author || []).filter((a) => a.family || a.name).map((a) => ({ family: a.family || a.name, given: a.given || "" }));

    let pm = pmByDoi.get(doi) || null;
    if (!pm && pubmedRes.status === "fulfilled") {
      try { pm = await pubmedByDoi(doi); } catch { /* optional */ }
    }

    const refTitle = c.orcidTitle || pm?.title || "";
    const sim = refTitle ? titleSimilarity(title, refTitle) : null;
    const problems = [];
    if (!title) problems.push("Crossref record has no title");
    if (sim !== null && sim < 0.8) problems.push(`title mismatch with ${c.orcidTitle ? "ORCID" : "PubMed"} (similarity ${sim.toFixed(2)}): "${refTitle}"`);
    if (!authors.some(isSelf)) problems.push("no author matching Bauer S in Crossref author list");
    if (problems.length) { report.unverified.push({ doi, title, reason: problems.join("; ") }); continue; }
    if (sim === null) report.warnings.push(`${doi}: manual include, no ORCID/PubMed title to cross-check`);

    const isPreprint = m.type === "posted-content";
    const rel = (k) => (m.relation?.[k] || []).filter((r) => r["id-type"] === "doi").map((r) => normDoi(r.id));
    const year = Number((dateOf(m["published-print"]) || dateOf(m["published-online"]) || dateOf(m.issued) || "0").slice(0, 4));

    let bibtex = null;
    try {
      const b = await get(`https://doi.org/${doi}`, { accept: "application/x-bibtex", text: true });
      if (b.status === 200 && b.body?.trim().startsWith("@")) bibtex = prettyBibtex(b.body);
    } catch { /* below */ }
    if (!bibtex) report.warnings.push(`${doi}: BibTeX unavailable from doi.org`);

    entries.push({
      doi,
      type: isPreprint ? "preprint" : "article",
      title,
      authors,
      journal: isPreprint ? (m.institution?.[0]?.name || m.publisher || "Preprint") : stripTags(m["container-title"]?.[0] || ""),
      volume: m.volume || null,
      issue: m.issue || null,
      pages: m.page || m["article-number"] || null,
      year,
      date: dateOf(m["published-online"]) || dateOf(m["published-print"]) || dateOf(m.issued),
      pmid: pm?.pmid || null,
      pmcid: pm?.pmcid || null,
      publishedAs: isPreprint ? rel("is-preprint-of")[0] || null : null,
      preprints: isPreprint ? [] : rel("has-preprint"),
      sources: c.sources.slice().sort(),
      bibtex,
    });
    await sleep(150); // be polite to the APIs
  }

  // Fold preprints into their published versions when both are present.
  const byDoi = new Map(entries.map((e) => [e.doi, e]));
  const final = entries.filter((e) => {
    if (e.type !== "preprint" || !e.publishedAs) return true;
    const pub = byDoi.get(e.publishedAs);
    if (pub) { if (!pub.preprints.includes(e.doi)) pub.preprints.push(e.doi); return false; }
    report.warnings.push(`Preprint ${e.doi} has a published version (${e.publishedAs}) that is not in ORCID/PubMed; add it to "include" in overrides.json`);
    return true;
  });
  final.forEach((e) => e.preprints.sort());
  final.sort((a, b) => (a.type === b.type ? 0 : a.type === "preprint" ? -1 : 1) || b.year - a.year || (b.date || "").localeCompare(a.date || "") || a.doi.localeCompare(b.doi));

  // Diff against the committed file.
  const now = new Map(final.map((e) => [e.doi, e]));
  for (const e of final) {
    const p = prevByDoi.get(e.doi);
    if (!p) report.added.push(e);
    else if (JSON.stringify(p) !== JSON.stringify(e)) report.changed.push({ e, fields: Object.keys(e).filter((k) => JSON.stringify(p[k]) !== JSON.stringify(e[k])) });
  }
  for (const p of previous) if (!now.has(p.doi)) report.removed.push(p);

  const md = renderReport(report, final.length, { orcid: orcid.size, pubmed: pubmed.length });
  console.log(md);
  if (reportPath) await writeFile(reportPath, md);
  if (!DRY) await writeFile(OUT, JSON.stringify(final, null, 2) + "\n");
}

function renderReport(r, total, counts) {
  const line = (e) => `- ${e.title || "(no title)"} — \`${e.doi}\``;
  const out = [`## Publication sync`, ``, `Sources: ORCID ${counts.orcid} works with DOI, PubMed ${counts.pubmed} records. Listed on site: **${total}**.`, ``];
  const sec = (h, items, f) => { if (items.length) out.push(`### ${h}`, ...items.map(f), ``); };
  sec("Added", r.added, line);
  sec("Changed", r.changed, ({ e, fields }) => `${line(e)} (fields: ${fields.join(", ")})`);
  sec("Removed", r.removed, line);
  sec("⚠️ Failed verification (not listed on site)", r.unverified, (u) => `- \`${u.doi}\`${u.title ? ` “${u.title}”` : ""}: ${u.reason}`);
  sec("Warnings", r.warnings, (w) => `- ${w}`);
  if (!r.added.length && !r.changed.length && !r.removed.length) out.push(`No changes to the publication list.`);
  return out.join("\n") + "\n";
}

main().catch((e) => { console.error(e); process.exit(1); });
