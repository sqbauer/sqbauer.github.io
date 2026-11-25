"use strict";
/* ---------- Ask your library: the full-text index ----------
   In the app: an SQLite FTS5 table ("pas") in the app's own database, one row per passage (askcore.js), plus
   "pas_doc" with which text version of each paper is in it. It is a cache like "_text": each device builds its
   own, nothing is synced or backed up. New papers go in when their text is first read; the rest in the
   background, a paper at a time. In a desktop browser (development) a small in-memory stand-in does the same. */
const AIX = { ready: null, done: new Map(), busy: false, mem: null, step: "", stop: false };
const aixKey = file => pwTextKey(file) + "|a" + ASK_VER;

function aixInit() {
  if (AIX.ready) return AIX.ready;
  AIX.ready = (async () => {
    await PW.dbReady;
    if (PW.sql) {
      await PW.sql.execute(`CREATE VIRTUAL TABLE IF NOT EXISTS pas USING fts5(text, paper UNINDEXED, kind UNINDEXED, sec UNINDEXED, fig UNINDEXED, panels UNINDEXED, tokenize='porter unicode61 remove_diacritics 2');
        CREATE TABLE IF NOT EXISTS pas_doc (paper TEXT PRIMARY KEY, tkey TEXT NOT NULL, n INTEGER, at INTEGER);`);
      const r = await PW.sql.query("SELECT paper, tkey FROM pas_doc;", []);
      for (const v of r.values || []) AIX.done.set(v.paper, v.tkey);
    } else AIX.mem = new Map();
  })().catch(e => { PW.log.error("ask index", e); AIX.ready = null; throw e; });
  return AIX.ready;
}
async function aixIndex(id, tkey, raw) {
  await aixInit();
  const ps = askPassages(raw, typeof refKeys === "function" ? refKeys : null);
  if (PW.sql) {
    const set = [{ statement: "DELETE FROM pas WHERE paper = ?;", values: [id] }];
    for (const p of ps) set.push({ statement: "INSERT INTO pas (text, paper, kind, sec, fig, panels) VALUES (?, ?, ?, ?, ?, ?);", values: [p.text, id, p.kind, p.sec, p.fig == null ? "" : String(p.fig), p.panels] });
    set.push({ statement: "INSERT OR REPLACE INTO pas_doc (paper, tkey, n, at) VALUES (?, ?, ?, ?);", values: [id, tkey, ps.length, Date.now()] });
    await PW.sql.executeSet(set, true);
  } else AIX.mem.set(id, ps.map(p => ({ ...p, paper: id })));
  AIX.done.set(id, tkey);
}
async function aixRemove(id) {
  if (PW.sql) await PW.sql.executeSet([{ statement: "DELETE FROM pas WHERE paper = ?;", values: [id] }, { statement: "DELETE FROM pas_doc WHERE paper = ?;", values: [id] }], true);
  else AIX.mem.delete(id);
  AIX.done.delete(id);
}
// a paper whose text was just read (opening it, the feed, the search): into the index soon, if it isn't yet
function aixLater(id, raw) {
  const L_ = ixPapers().find(x => x.id === id), file = L_ && fileForGroup(L_.g); if (!file || !raw) return;
  const k = aixKey(file);
  aixInit().then(() => { if (AIX.done.get(id) !== k) setTimeout(() => aixIndex(id, k, raw).catch(e => PW.log.error("ask index", e)), 1500); }).catch(() => {});
}
// how far the index is: papers in it, papers in the library, papers whose text was never read
function aixCounts() {
  const ps = ixPapers().filter(L => L.g.file);
  let done = 0; for (const L of ps) { const f = fileForGroup(L.g); if (f && AIX.done.get(L.id) === aixKey(f)) done++; }
  return { done, total: ps.length };
}
/* fill the index: papers whose text is cached; with read=true also the others (reads each PDF: slow) */
async function aixFill({ read = false, onStep } = {}) {
  await aixInit();
  if (AIX.busy) return; AIX.busy = true; AIX.stop = false;
  try {
    const ps = ixPapers().filter(L => L.g.file), ids = new Set(ps.map(L => L.id));
    for (const id of [...AIX.done.keys()]) if (!ids.has(id)) await aixRemove(id);          // gone from the library
    let k = 0, unread = 0;
    for (const L of ps) {
      if (AIX.stop) break;
      k++; const file = fileForGroup(L.g); if (!file) continue;
      const key = aixKey(file); if (AIX.done.get(L.id) === key) continue;
      let raw = null; try { raw = await PW.be.get(PW_TEXT_COL, pwTextKey(file)); } catch {}
      if (!raw && read) { try { raw = await pwPaperText(file); } catch {} }
      if (!raw) { unread++; continue; }
      try { await aixIndex(L.id, key, raw); } catch (e) { PW.log.error("ask index", e); }
      AIX.step = `${k} of ${ps.length}`; if (onStep) onStep(k, ps.length);
      await new Promise(r => setTimeout(r, read ? 60 : 25));                                 // keep the screen responsive
    }
    AIX.unread = unread;
  } finally { AIX.busy = false; AIX.step = ""; }
}
/* the passages that best match a plan, ranked (askRank): one indexed query, never a scan of the papers */
async function aixSearch(plan, opts) {
  await aixInit();
  const q = askFtsQuery(plan); if (!q) return [];
  let rows;
  if (PW.sql) {
    const r = await PW.sql.query("SELECT paper, kind, sec, fig, panels, text, bm25(pas) AS bm25 FROM pas WHERE pas MATCH ? ORDER BY bm25 LIMIT 400;", [q]);
    rows = (r.values || []).map(v => ({ ...v, fig: v.fig === "" || v.fig == null ? null : +v.fig }));
  } else {
    // stand-in (browser): every passage with any term, scored by how many term hits it has
    const terms = askMarkTerms(plan); rows = [];
    for (const list of AIX.mem.values()) for (const p of list) {
      const lt = p.text.toLowerCase().replace(/-/g, " "); const n = terms.filter(t => askHas(lt, t)).length;
      if (n) rows.push({ ...p, bm25: -n });
    }
  }
  return askRank(rows, plan, opts);
}
