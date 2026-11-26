"use strict";
/* ---------- Journals for the library list ----------
   The journal each paper appeared in, looked up once on OpenAlex (by DOI, 40 at a time; otherwise by exact
   title) and kept on this device ("_journal", not synced). Filled in the background; the list shows what's
   known so far. A paper that can't be found is remembered as "" so it isn't asked again. */
const JR = { map: null, busy: false };
const JR_COL = "_journal";
async function jrLoad() {
  if (JR.map) return JR.map;
  let o = null; try { o = await PW.be.get(JR_COL, "all"); } catch {}
  JR.map = new Map(Object.entries(o || {}));
  return JR.map;
}
const jrSave = () => PW.be.put(JR_COL, "all", Object.fromEntries(JR.map)).catch(() => {});
// the journal for a library item: from its saved citation, else from the lookup
function journalOf(it) {
  const r = recOf(it.id);
  if (r && r.cite && r.cite.journal) return r.cite.journal;
  return (JR.map && JR.map.get(it.id)) || "";
}
const jrName = s => String(s || "").replace(/\s*\(.*?\)\s*$/, "").trim();   // "Neuron (Cambridge, Mass.)" -> "Neuron"
async function jrFill() {
  if (JR.busy || PW.single || !PW.online()) return;
  JR.busy = true;
  try {
    await jrLoad();
    const todo = buildGroups().filter(g => !JR.map.has(g.id) && !(recOf(g.id)?.cite?.journal) && (g.doi || (g.title && g.title.length >= 25)));
    let changed = 0;
    const done = () => { if (++changed % 20 === 0) { jrSave(); if (S.view === "library") renderLibList(); } };
    // by DOI, in batches
    const withDoi = todo.filter(g => g.doi);
    for (let i = 0; i < withDoi.length; i += 40) {
      if (!PW.online()) break;
      const part = withDoi.slice(i, i + 40), byDoi = new Map(part.map(g => [g.doi.toLowerCase(), g]));
      try {
        const j = await oaJSON(`${OA_API}/works?filter=doi:${part.map(g => encodeURIComponent(g.doi)).join("|")}&per-page=50&select=doi,primary_location`);
        for (const w of j.results || []) {
          const g = byDoi.get((w.doi || "").replace(/^https?:\/\/doi\.org\//, "").toLowerCase());
          if (g) { JR.map.set(g.id, jrName(w.primary_location?.source?.display_name)); byDoi.delete(g.doi.toLowerCase()); }
        }
        for (const g of byDoi.values()) if (!g.title || g.title.length < 25) JR.map.set(g.id, "");   // not found; the title search below tries the rest
        await jrSave(); if (S.view === "library") renderLibList();
      } catch (e) { if (e && e.code !== "not_found") break; }
      await new Promise(r => setTimeout(r, 400));
    }
    // by title, one at a time
    for (const g of todo.filter(g => !JR.map.has(g.id) && g.title && g.title.length >= 25)) {
      if (!PW.online()) break;
      try {
        const j = await oaJSON(`${OA_API}/works?search=${encodeURIComponent(g.title.slice(0, 250))}&per-page=3&select=title,primary_location`);
        const w = (j.results || []).find(x => x.title && normTitle(x.title) === normTitle(g.title));
        JR.map.set(g.id, w ? jrName(w.primary_location?.source?.display_name) : "");
        done();
      } catch (e) { if (e && e.code !== "not_found") break; }
      await new Promise(r => setTimeout(r, 350));
    }
    await jrSave();
    if (S.view === "library") renderLibList();
  } finally { JR.busy = false; }
}
