"use strict";
/* ---------- platform: "db" = local document store ----------
   Keeps the Firestore-like shape the app uses (collection/doc/subcollection, get/set/update/delete,
   orderBy+limit). Documents live in one table keyed by (collection path, id):
   SQLite in the iOS app, IndexedDB in a desktop browser. */

/* backend: { all(parent), get(parent, id), put(parent, id, data), del(parent, id), clear() } */
async function pwSqliteBackend() {
  const { CapacitorSQLite, SQLiteConnection } = window.PWDeps;
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const name = "panelwise";
  const exists = (await sqlite.isConnection(name, false)).result;
  const db = exists ? await sqlite.retrieveConnection(name, false) : await sqlite.createConnection(name, false, "no-encryption", 1, false);
  await db.open();
  await db.execute("CREATE TABLE IF NOT EXISTS docs (parent TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (parent, id));");
  return {
    async all(parent) { const r = await db.query("SELECT id, data FROM docs WHERE parent = ?;", [parent]); return (r.values || []).map(v => ({ id: v.id, data: JSON.parse(v.data) })); },
    async get(parent, id) { const r = await db.query("SELECT data FROM docs WHERE parent = ? AND id = ?;", [parent, id]); const v = (r.values || [])[0]; return v ? JSON.parse(v.data) : null; },
    async put(parent, id, data) { await db.run("INSERT OR REPLACE INTO docs (parent, id, data) VALUES (?, ?, ?);", [parent, id, JSON.stringify(data)]); },
    async del(parent, id) { await db.run("DELETE FROM docs WHERE parent = ? AND id = ?;", [parent, id]); },
    async dump() { const r = await db.query("SELECT parent, id, data FROM docs WHERE parent NOT LIKE '\\_%' ESCAPE '\\';", []); return (r.values || []).map(v => ({ parent: v.parent, id: v.id, data: JSON.parse(v.data) })); },
  };
}
function pwIdbBackend() {
  const open = new Promise((res, rej) => {
    const rq = indexedDB.open("panelwise", 1);
    rq.onupgradeneeded = () => { const st = rq.result.createObjectStore("docs", { keyPath: ["parent", "id"] }); st.createIndex("parent", "parent"); };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  const tx = async (mode, fn) => { const db = await open; return new Promise((res, rej) => { const t = db.transaction("docs", mode); const out = fn(t.objectStore("docs")); t.oncomplete = () => res(out && "result" in out ? out.result : undefined); t.onerror = () => rej(t.error); }); };
  return {
    async all(parent) { const rows = await tx("readonly", st => st.index("parent").getAll(parent)); return rows.map(r => ({ id: r.id, data: r.data })); },
    async get(parent, id) { const r = await tx("readonly", st => st.get([parent, id])); return r ? r.data : null; },
    async put(parent, id, data) { await tx("readwrite", st => st.put({ parent, id, data: JSON.parse(JSON.stringify(data)) })); },
    async del(parent, id) { await tx("readwrite", st => st.delete([parent, id])); },
    async dump() { const rows = await tx("readonly", st => st.getAll()); return rows.filter(r => !r.parent.startsWith("_")); },
  };
}

/* Change tracking for sync (platform/sync.js): every put or delete outside the "_" collections notes when it
   happened, in the "_meta" collection, keyed "parent\u0001id". A delete leaves a marker, so it can reach the
   other devices. Imported records keep time 0, so they never override newer work on another device. */
const PW_META = "_meta";
function pwTracked(be) {
  const key = (parent, id) => parent + "\u0001" + id;
  const mark = (parent, id, m) => be.put(PW_META, key(parent, id), m);
  const touched = parent => { if (!parent.startsWith("_")) PW.sync?.changed(); };
  return {
    ...be, raw: be,
    async put(parent, id, data) { await be.put(parent, id, data); if (!parent.startsWith("_")) { await mark(parent, id, { t: Date.now() }); touched(parent); } },
    async del(parent, id) { await be.del(parent, id); if (!parent.startsWith("_")) { await mark(parent, id, { t: Date.now(), del: 1 }); touched(parent); } },
    // a copy from elsewhere (import, another device): keeps that copy's time
    async putAt(parent, id, data, t) { await be.put(parent, id, data); await mark(parent, id, { t }); },
    async delAt(parent, id, t) { await be.del(parent, id); await mark(parent, id, { t, del: 1 }); },
    async metas() { const m = new Map(); for (const r of await be.all(PW_META)) m.set(r.id, r.data); return m; },
    key,
  };
}

PW.makeDb = function (be) {
  const autoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const snap = rows => ({ docs: rows.map(r => ({ id: r.id, data: () => r.data })) });
  function query(path, order, lim) {
    return {
      orderBy(f) { return query(path, f, lim); },
      limit(n) { return query(path, order, n); },
      async get() {
        let rows = await be.all(path);
        if (order) rows.sort((a, b) => (a.data[order] ?? 0) < (b.data[order] ?? 0) ? -1 : (a.data[order] ?? 0) > (b.data[order] ?? 0) ? 1 : 0);
        if (lim) rows = rows.slice(0, lim);
        return snap(rows);
      }
    };
  }
  function collection(path) {
    return { path, ...query(path), doc: id => doc(path, id || autoId()) };
  }
  function doc(parent, id) {
    return {
      id, path: parent + "/" + id,
      async get() { const v = await be.get(parent, id); return { id, exists: !!v, data: () => v }; },
      set(v) { return be.put(parent, id, v); },
      async update(patch) { const v = await be.get(parent, id); if (!v) throw new Error("no document " + id); return be.put(parent, id, { ...v, ...patch }); },
      delete() { return be.del(parent, id); },
      collection(sub) { return collection(parent + "/" + id + "/" + sub); },
    };
  }
  return { collection };
};

PW.USER_COL = "data/users/local";
PW.dbReady = (async () => {
  let be;
  try { be = PW.native ? await pwSqliteBackend() : pwIdbBackend(); }
  catch (e) { console.warn("SQLite unavailable, using IndexedDB", e); be = pwIdbBackend(); }
  PW.be = pwTracked(be);
  // small key-value view on the same table, used by the Claude response cache
  PW.kv = { get: (col, id) => be.get(col, id), put: (col, id, v) => be.put(col, id, v) };
  PW.db = PW.makeDb(be);
  return PW.db;
})();
