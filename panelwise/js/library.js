"use strict";
/* ---------- library ---------- */
const L = { files: new Map(), meta: store.get("pw:lib") || { folder: "", scannedAt: 0, items: [] }, q: "", field: "all", folderSel: "*", sort: "added", queue: false };
function saveLib() { store.set("pw:lib", L.meta); }
function onFolderPicked(list) {
  // skip helper folders such as _duplicates (anything starting with "_") and "Claude outputs"
  const pdfs = [...list].filter(f => /\.pdf$/i.test(f.name) && !(f.webkitRelativePath || "").split("/").slice(1, -1).some(seg => seg.startsWith("_") || seg === "Claude outputs"));
  if (!pdfs.length) { toast("No PDFs found in that folder."); return; }
  const old = new Map(L.meta.items.map(it => [it.id, it]));
  L.files.clear();
  const items = pdfs.map(f => {
    const rel = f.webkitRelativePath || f.name, parts = rel.split("/");
    const id = `${f.name}:${f.size}`; L.files.set(rel, f);
    const o = old.get(id) || {};
    return { id, path: rel, name: f.name, folder: parts.slice(1, -1).join(" / "), size: f.size, mtime: f.lastModified, title: o.title || null, year: o.year || null, authors: o.authors || [], head: o.head || "", doi: o.doi || null, tried: o.tried || false, mv: o.mv || 0 };
  });
  L.meta = { folder: (pdfs[0].webkitRelativePath || "").split("/")[0] || "Papers", scannedAt: Date.now(), items };
  saveLib(); S.view = "library"; render(); runMetaQueue();
}
const pathOf = it => it.path || it.id;
const hasFile = it => L.files.has(pathOf(it));
const normTitle = t => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 160);
function groupKey(it) {
  const nt = normTitle(it.title);
  if (nt.length >= 25) return "t:" + nt;
  if (it.doi) return "doi:" + it.doi;
  return "f:" + it.id;
}
function buildGroups() {
  const g = new Map();
  for (const it of L.meta.items) { const k = groupKey(it); if (!g.has(k)) g.set(k, []); g.get(k).push(it); }
  // a DOI group and a title-only group can be the same paper: merge by title
  const byTitle = new Map();
  for (const [k, members] of [...g.entries()]) {
    const nt = normTitle(members.find(m => m.title)?.title);
    if (nt.length < 25) continue;
    if (byTitle.has(nt) && byTitle.get(nt) !== k) { const into = byTitle.get(nt); g.get(into).push(...members); g.delete(k); }
    else byTitle.set(nt, k);
  }
  const out = [];
  for (const [key, members] of g) {
    const withRec = members.find(m => recOf(m.id));
    const newest = [...members].sort((a, b) => b.mtime - a.mtime)[0];
    const rep = withRec || newest;
    const best = members.find(m => m.title) || rep;
    const sizes = new Set(members.map(m => m.size));
    out.push({ key, members, id: rep.id, rep, title: best.title, year: best.year || members.find(m => m.year)?.year, authors: (members.find(m => m.authors && m.authors.length) || rep).authors || [],
      head: members.map(m => m.head || "").join(" "), doi: members.find(m => m.doi)?.doi, name: rep.name, folders: [...new Set(members.map(m => m.folder))], mtime: Math.max(...members.map(m => m.mtime)),
      copies: members.length, versions: sizes.size, file: members.some(hasFile) });
  }
  return out;
}
function fileForGroup(gr) {
  const pref = gr.members.find(m => m.id === gr.id && hasFile(m)) || gr.members.filter(hasFile).sort((a, b) => b.mtime - a.mtime)[0];
  return pref ? L.files.get(pathOf(pref)) : null;
}
function guessFromName(name) {
  const base = name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  const y = base.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  return { label: base, year: y ? y[1] : null };
}
async function extractMeta(file) {
  const lib = await ensurePdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const tc = await (await doc.getPage(1)).getTextContent();
    const lines = []; let cur = null;
    for (const it of tc.items) { if (typeof it.str !== "string") continue; const h = Math.abs(it.transform[3]) || 0, y = it.transform[5];
      if (!cur || Math.abs(y - cur.y) > .6 * Math.max(h, cur.h) || Math.abs(h - cur.h) > .2 * cur.h) { cur = { t: "", y, h }; lines.push(cur); }
      cur.t += it.str; }
    const good = lines.filter(l => l.t.trim().length > 2 && !/^(article|research|original|letter|report|open access|review)\b/i.test(l.t.trim()));
    const goodT = good.filter(l => l.t.trim().split(/\s+/).length >= 3 && !/journal|www\.|doi|©/i.test(l.t));
    const maxH = Math.max(0, ...(goodT.length ? goodT : good).map(l => l.h));
    const tl = good.filter(l => l.h >= maxH * .92).filter((l, i, a) => !(i === 0 && a.length > 1 && l.t.trim().split(/\s+/).length === 1)).slice(0, 6);
    let title = tl.map(l => l.t.trim()).join(" ").replace(/\s+/g, " ").replace(/[\uE000-\uF8FF]/g, "").trim();
    let info = {}; try { info = (await doc.getMetadata()).info || {}; } catch {}
    // authors: lines right after the title, until affiliations / abstract
    let authors = [], head = "";
    const ti = lines.indexOf(tl[tl.length - 1]);
    if (ti >= 0) {
      let buf = "", baseH = 0;
      for (const l of lines.slice(ti + 1, ti + 25)) {
        const t = l.t.trim(); if (!t) continue;
        if (/department|universit|institut|cent(?:er|re)\b|school of|laborator|abstract|received|correspond|@|doi|https?:|keywords|edited by/i.test(t)) { if (buf) break; else continue; }
        if (!baseH && /[A-Z][a-z]+/.test(t) && t.length > 6) baseH = l.h;
        if (baseH && t.length > 30 && Math.abs(l.h - baseH) > .07 * baseH) break;
        if (t.length > 40 && (t.match(/\b(the|of|in|that|with|we|are|is|to|for|during)\b/gi) || []).length >= 3) break;
        buf += " " + t;
      }
      authors = parseAuthors(buf);
      head = lines.slice(ti + 1, ti + 14).map(l => l.t).join(" ").replace(/[\d*†‡§¶#✉⁎∗✝]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 450);
    }
    // Cell Press: a short "Authors" box on page 1 (often truncated with "...") and the full list on page 2
    const ai = lines.findIndex(l => /^authors$/i.test(l.t.trim()));
    if (ai >= 0 && (authors.length < 2 || /\.\.\.|…/.test(head))) {
      let box = ""; for (const l of lines.slice(ai + 1, ai + 8)) { if (/correspondence|in brief|highlights/i.test(l.t)) break; box += " " + l.t; }
      const boxA = parseAuthors(box.replace(/\.\.\.|…/g, ","));
      if (boxA.length) authors = boxA;
      if (/\.\.\.|…/.test(box) && doc.numPages > 1 && boxA[0]) {
        try { const t2 = await (await doc.getPage(2)).getTextContent(); const txt2 = t2.items.map(i => i.str + (i.hasEOL ? "\n" : "")).join("");
          const k = txt2.indexOf(boxA[0]); if (k >= 0) { const full = parseAuthors(txt2.slice(k, k + 700).split(/\n\s*\n|SUMMARY|Summary|\d\s*Department/)[0].replace(/\n/g, " ")); if (full.length > boxA.length) authors = full; } } catch {}
      }
      head = (head + " " + box).slice(0, 600);
    }
    if (authors.length < 1 && info.Author && !/^(user|admin|author|unknown)/i.test(info.Author)) authors = parseAuthors(info.Author.replace(/;/g, ","));
    const it = (info.Title || "").trim();
    if ((title.length < 15 || title.length > 260) && it.length > 15 && !/microsoft|\.docx?|untitled|^doi/i.test(it)) title = it;
    const txt = good.map(l => l.t).join(" ");
    const y = (txt.match(/\b(?:©|\(|published|received|accepted)\s*:?\s*(?:\d{1,2}\s+\w+\s+)?(19[6-9]\d|20[0-4]\d)\b/i) || [])[1] || ((info.CreationDate || "").match(/^D:(\d{4})/) || [])[1] || null;
    const dm = (txt + " " + (info.Subject || "") + " " + (info.doi || "")).match(/\b(10\.\d{4,9}\/[^\s"<>,;]+)/i);
    const doi = dm ? dm[1].replace(/[.)\]]+$/, "").toLowerCase() : null;
    return { title: title.slice(0, 260) || null, year: y, authors, head, doi };
  } finally { doc.destroy(); }
}
const META_V = 5;
const metaDone = it => it.tried && (it.mv === META_V || (it.mv === 4 && (it.authors || []).length >= 2 && !/^(the journal|journal|biomedicines|cell|neuron|elife)\b/i.test(it.title || "")));
function parseAuthors(raw) {
  const t = (raw || "").replace(/[\uE000-\uF8FF]/g, "").replace(/\([^)]*\)/g, " ").replace(/[\d*†‡§¶#✉⁎∗✝]+/g, " ").replace(/\s+/g, " ");
  const out = [];
  for (let n of t.split(/,|;|&|\band\b|\s·\s/)) {
    n = n.replace(/^[\s.,]+|[\s.,]+$/g, "").replace(/\s+/g, " ");
    if (n.length < 4 || n.length > 45) continue;
    if (!/^[\p{Lu}][\p{L}'’.\-]*(?:\s+[\p{L}'’.\-]+){1,4}$/u.test(n)) continue;
    if (/\b(university|department|institute|abstract|article|journal|review|research|neuroscience|received|MC|medical|cent(?:er|re)|hospital|school|faculty)\b/i.test(n)) continue;
    out.push(n);
  }
  return [...new Set(out)].slice(0, 60);
}
const shortAuthors = a => !a || !a.length ? "" : a.length <= 3 ? a.join(", ") : `${a[0]}, ${a[1]} … ${a[a.length - 1]} (${a.length})`;
async function runMetaQueue() {
  if (L.queue) return; L.queue = true;
  let n = 0;
  const todo = L.meta.items.filter(it => !metaDone(it) && hasFile(it));
  const done = new Map();
  const apply = (it, m) => { it.title = m.title; it.year = m.year || guessFromName(it.name).year; it.authors = m.authors; it.head = m.head; it.doi = m.doi; };
  const worker = async () => { while (todo.length && S.view === "library") { const it = todo.shift();
    try { let m = done.get(it.id); if (!m) { m = await extractMeta(L.files.get(pathOf(it))); done.set(it.id, m); } apply(it, m); } catch { }
    it.tried = true; it.mv = META_V; n++; if (n % 8 === 0) { saveLib(); renderLibList(); } } };
  await Promise.all([worker(), worker()]);
  saveLib(); renderLibList(); L.queue = false;
  if (S.view === "library" && L.meta.items.some(it => !metaDone(it) && hasFile(it))) setTimeout(runMetaQueue, 500);
}
function progressOf(id) {
  const c = recOf(id);
  if (!c) return { cls: "", label: "New", last: 0 };
  if (c.card && c.card.finding) return { cls: "p3", label: "Card ✓", last: c.lastOpened || 0 };
  if (!c.lastOpened) return { cls: "", label: "New", last: 0 };
  const seen = (c.seen || []).length;
  if (seen && c.nfig && seen >= c.nfig) return { cls: "p3", label: "All figures", last: c.lastOpened || 0 };
  if (seen) return { cls: "p2", label: `Fig ${seen}/${c.nfig || "?"}`, last: c.lastOpened || 0 };
  if (c.revealed) return { cls: "p1", label: "Question done", last: c.lastOpened || 0 };
  return { cls: "p1", label: "Started", last: c.lastOpened || 0 };
}
const fmtDate = t => t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
function libItems() {
  const q = L.q.trim().toLowerCase();
  const groups = buildGroups();
  const ids = new Set(L.meta.items.map(it => it.id)), titles = new Set(groups.map(g => normTitle(g.title)).filter(t => t.length >= 25));
  const extra = allRecs().filter(r => r.id && !ids.has(r.id) && !titles.has(normTitle(r.title))).map(r => ({ key: "r:" + r.id, id: r.id, members: [], name: r.name || r.id.split(":")[0], folders: [r.folder || ""], mtime: r.lastOpened || 0, title: r.title, year: r.year, authors: r.authors || [], copies: 0, versions: 0, file: false, notInFolder: true }));
  let items = [...groups, ...extra].map(it => { const r = recOf(it.id) || (it.members || []).map(m => recOf(m.id)).find(Boolean); return { ...it, synced: !!r?.phone?.bundle, prog: progressOf(it.id), label: it.title || guessFromName(it.name).label, tags: r?.tags || [], nNotes: r?.nNotes || 0, nChat: r?.nChat || 0 }; });
  if (L.folderSel === "~dup") items = items.filter(it => it.copies > 1);
  else if (L.folderSel !== "*") items = items.filter(it => it.folders.includes(L.folderSel));
  if (q) {
    const norm = x => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const nq = norm(q);
    items = items.filter(it => {
      const au = (it.authors || []).join(" | ") + " | " + (it.head || "");
      const hay = L.field === "authors" ? au : L.field === "title" ? it.label : [it.label, au, (it.members || []).map(m => m.name).join(" "), it.folders.join(" "), it.year || "", it.doi || "", it.tags.join(" ")].join(" ");
      return norm(hay).includes(nq);
    });
  }
  const by = { added: (a, b) => b.mtime - a.mtime, read: (a, b) => b.prog.last - a.prog.last || b.mtime - a.mtime, title: (a, b) => a.label.localeCompare(b.label), year: (a, b) => (b.year || 0) - (a.year || 0) }[L.sort];
  return items.sort(by);
}
function renderLibrary() {
  $("#pTitle").textContent = "Library";
  const M = L.meta, have = L.files.size > 0;
  const nPapers = M.items.length ? buildGroups().length : 0;
  $("#pSub").textContent = M.items.length ? `${M.folder} · ${nPapers} papers${nPapers !== M.items.length ? ` in ${M.items.length} PDFs` : ""}` : "Your papers, read figure by figure";
  L.tab = L.tab || "papers";
  const m = $("#main");
  if (!M.items.length && allRecs().some(r => r.phone?.bundle) && L.tab === undefined) L.tab = "papers";
  if (!M.items.length && !allRecs().length) {
    m.innerHTML = `<section class="view">
      <div class="eyebrow">Library</div><h2>Point Panelwise at your papers folder</h2>
      <p class="lede">Choose the folder where your PDFs end up. Panelwise lists every PDF in it and its subfolders, reads each title, and tracks how far you got with each paper.</p>
      <div class="libempty">
        <div class="card"><h3>Your folder</h3>
          ${PW.native
            ? `<ol><li>Tap <strong>Choose Papers folder</strong>.</li><li>In Files, open iCloud Drive and select your Papers folder, for example<div class="path">iCloud Drive / Papers</div></li><li>Panelwise keeps access to it and rescans it every time it opens. PDFs stay on your phone; only the text you send to Claude leaves it.</li></ol>`
            : `<ol><li>Click <strong>Choose Papers folder</strong>.</li><li>Pick the folder, for example<div class="path">Documents / Papers</div></li><li>Your browser asks to "upload" the files. They are only read on this page; only the text you send to Claude leaves it.</li></ol>`}
          <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" type="button" data-act="pickdir">Choose Papers folder</button><button class="btn" type="button" data-act="pickfile">Open one PDF</button></div>
        </div>
        <div class="card"><h3>Try it first</h3><p class="note" style="margin:6px 0 12px">A short fictional paper with two figures, to see how panels link to text.</p><button class="btn" type="button" data-act="demo">Open the example paper</button></div>
      </div></section>`;
    return;
  }
  const groups = buildGroups(), nDup = groups.filter(g => g.copies > 1).length;
  const folders = new Map(); for (const gr of groups) for (const f of gr.folders) folders.set(f, (folders.get(f) || 0) + 1);
  const fl = [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  m.innerHTML = `<section class="view">
    <div class="libhead"><div><div class="eyebrow">Library${M.folder ? " · " + esc(M.folder) : ""}</div><h2>Your papers</h2></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${have && M.items.length ? `<button class="btn primary" type="button" data-act="feed">Feed</button><button class="btn" type="button" data-act="lsearch">Search inside</button>` : ""}<button class="btn ${have ? "" : "primary"}" type="button" data-act="pickdir">${have ? "Rescan folder" : "Re-select folder"}</button><button class="btn" type="button" data-act="pickfile">Open one PDF</button><button class="btn ghost" type="button" data-act="demo">Example paper</button></div></div>
    ${reviewBanner()}
    ${have || !M.items.length ? "" : `<div class="scanbar">Showing your last scan from ${fmtDate(M.scannedAt)}. To open a PDF, re-select the folder (browsers don't let pages keep folder access). Papers you've worked on open as a read-back of your notes and chat.</div>`}
    ${libTabs()}
    ${L.tab === "topics" ? topicsTab() : L.tab === "notebook" ? `<div id="nbBox" style="margin-top:16px"><div class="thinking"><span class="dot"></span>Gathering your notes…</div></div>` : `
    <div class="libtools"><input class="search" id="libQ" type="search" placeholder="${L.field === "authors" ? "Author name, e.g. Romano" : "Search titles, authors, file names, topics"}" value="${esc(L.q)}" aria-label="Search papers">
      <select class="sort" id="libField" aria-label="Search in">${[["all", "Search everything"], ["authors", "Authors only"], ["title", "Titles only"]].map(([v, l]) => `<option value="${v}" ${L.field === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select class="sort" id="libSort" aria-label="Sort papers">${[["added", "Recently added"], ["read", "Recently read"], ["title", "Title A–Z"], ["year", "Year"]].map(([v, l]) => `<option value="${v}" ${L.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    ${fl.length > 1 || nDup ? `<div class="fchips"><button class="fold" type="button" data-folder="*" aria-pressed="${L.folderSel === "*"}">All <span class="c">${groups.length}</span></button>${fl.length > 1 ? fl.map(([f, c]) => `<button class="fold" type="button" data-folder="${esc(f)}" aria-pressed="${L.folderSel === f}">${esc(f || "Top level")} <span class="c">${c}</span></button>`).join("") : ""}${nDup ? `<button class="fold" type="button" data-folder="~dup" aria-pressed="${L.folderSel === "~dup"}">Duplicates <span class="c">${nDup}</span></button>` : ""}</div>` : ""}
    <div class="scanbar" id="libScan"></div>
    <div class="liblist" id="libList"></div>`}</section>`;
  if (L.tab === "notebook") renderNotebook(); else if (L.tab !== "topics") renderLibList();
}
function authorsHTML(a) {
  const q = (L.q || "").trim().toLowerCase(), norm = x => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!q || L.field === "title") return esc(shortAuthors(a));
  const hit = a.filter(n => norm(n).includes(norm(q)));
  if (!hit.length) return esc(shortAuthors(a));
  const pos = a.indexOf(hit[0]) + 1;
  return esc(shortAuthors(a)) + ` <span class="pill p2" style="margin-left:4px">${esc(hit[0])} · author ${pos} of ${a.length}${pos === a.length && a.length > 1 ? " (last)" : ""}</span>`;
}
function renderLibList() {
  if (S.view !== "library") return;
  const box = $("#libList"); if (!box) return;
  const items = libItems();
  { const np = buildGroups().length, M = L.meta; if (M.items.length) $("#pSub").textContent = `${M.folder} · ${np} papers${np !== M.items.length ? ` in ${M.items.length} PDFs` : ""}`; }
  const pending = L.meta.items.filter(it => !metaDone(it) && hasFile(it)).length;
  const unread = L.meta.items.filter(it => !metaDone(it)).length;
  const sc = $("#libScan");
  if (sc) sc.innerHTML = pending ? `<span class="dot"></span>Reading titles and authors… ${L.meta.items.length - pending} of ${L.meta.items.length}. Author search is incomplete until this finishes.`
    : unread ? `<span class="pill p2">Authors not read for ${unread} of ${L.meta.items.length} papers</span> Author search only covers file names for those. <button type="button" class="linkbtn" data-act="pickdir">Re-select the folder</button> to read them.`
    : `${items.length} shown`;
  if (sc && A.api) { sc.innerHTML += ` <span id="storeMeter" style="margin-left:auto">${usageHTML()}</span>`; sc.style.display = "flex"; refreshUsage(); }
  box.innerHTML = items.length ? items.slice(0, 400).map(it => {
    const g = guessFromName(it.name), off = !it.file && !it.synced, hasRec = it.prog.last > 0;
    const extras = [it.nNotes ? `${it.nNotes} note${it.nNotes > 1 ? "s" : ""}` : "", it.nChat ? `${it.nChat} chat` : "", it.synced ? "on phone" : "", it.notInFolder && !it.synced ? "not in folder" : ""].filter(Boolean).join(" · ");
    const dup = it.copies > 1 ? `<div class="rm"><span class="pill p2">${it.copies} copies${it.versions > 1 ? " · files differ" : ""}</span> ${esc(it.members.map(m => (m.folder || "Top level") + " / " + m.name).join("  ·  "))}</div>` : "";
    return `<button type="button" class="row ${off && !hasRec ? "off" : ""}" ${off && hasRec ? `data-record="${esc(it.id)}"` : `data-open="${esc(it.key)}"`}><div style="min-width:0"><div class="rt">${esc(it.label)}</div>${it.authors && it.authors.length ? `<div class="rm" style="color:var(--ink);opacity:.8">${authorsHTML(it.authors)}</div>` : ""}<div class="rm">${esc([it.year, it.copies > 1 ? null : (it.title ? g.label : null), it.copies > 1 ? null : it.folders[0], extras].filter(Boolean).join(" · "))}</div>${dup}${it.tags.length ? `<div class="tags" style="margin-top:5px">${it.tags.map(t => `<span class="tchip ro">${esc(t)}</span>`).join("")}</div>` : ""}</div>
      <div class="rr"><span class="pill ${it.prog.cls}">${esc(it.prog.label)}</span><span>${it.prog.last ? "read " + fmtDate(it.prog.last) : "added " + fmtDate(it.mtime)}</span>${typeof rmProgressLabel === "function" && rmProgressLabel(it.id) ? `<span class="pill">${esc(rmProgressLabel(it.id))}</span>` : ""}</div></button>`;
  }).join("") + (items.length > 400 ? `<div class="row note">Showing 400 of ${items.length}. Search to narrow down.</div>` : "") : `<div class="row note">No papers match.</div>`;
}
function libTabs() {
  const recs = allRecs(), nNotes = recs.reduce((a, r) => a + (r.nNotes || 0), 0);
  const tabs = [["papers", "Papers", L.meta.items.length ? buildGroups().length : recs.length], ["topics", "Topics", allTopics().length], ["notebook", "Notebook", nNotes]];
  return `<div class="ltabs" role="tablist">${tabs.map(([k, l, c]) => `<button type="button" class="ltab" role="tab" data-ltab="${k}" aria-selected="${L.tab === k}">${l} <span class="c">${c}</span></button>`).join("")}</div>`;
}
function papersInTopic(name) {
  const n = name.toLowerCase(), sur = r => ((r.authors || [])[0] || r.title || "").trim().split(/\s+/).pop().toLowerCase();
  return allRecs().filter(r => (r.tags || []).some(t => t.toLowerCase() === n)).sort((a, b) => sur(a).localeCompare(sur(b)) || String(a.year || "").localeCompare(String(b.year || "")));
}
function topicsTab() {
  const ts = allTopics();
  if (!ts.length) return `<div class="card" style="margin-top:16px"><h3>No topics yet</h3><p class="note">Open a paper and click <strong>+ topic</strong> under its title to file it, for example under "whisker premotor circuits" or "cerebellar nuclei". Each topic gets an overview page that Claude writes from your saved work across its papers.</p></div>`;
  return `<div class="tlist">${ts.map(t => { const ps = papersInTopic(t), tv = D.topics.get(topicKey(t)); const nn = ps.reduce((a, r) => a + (r.nNotes || 0), 0);
    return `<button type="button" class="tcard" data-topic="${esc(t)}"><span class="tn">${esc(t)}</span><span class="tm">${ps.length} paper${ps.length === 1 ? "" : "s"} · ${nn} note${nn === 1 ? "" : "s"}</span><span class="tm">${tv?.synthAt ? "Overview written " + fmtDate(tv.synthAt) : "No overview yet"}</span></button>`; }).join("")}</div>`;
}
async function gatherNotes(recs) {
  const out = [];
  await Promise.all(recs.filter(r => r.nNotes > 0 || !D.col).map(async r => { const ns = await listChildren(r.id, "notes"); ns.forEach(n => out.push({ ...n, paper: r })); }));
  return out.sort((a, b) => b.at - a.at);
}
async function renderNotebook() {
  const notes = await gatherNotes(allRecs());
  const box = $("#nbBox"); if (!box || L.tab !== "notebook" || S.view !== "library") return;
  const q = (L.nbq || "").toLowerCase();
  const list = q ? notes.filter(n => (n.text + " " + (n.q || "") + " " + n.paper.title + " " + (n.paper.tags || []).join(" ")).toLowerCase().includes(q)) : notes;
  box.innerHTML = notes.length ? `<input class="search" id="nbQ" type="search" placeholder="Search your notes and saved answers" value="${esc(L.nbq || "")}" aria-label="Search notes" style="width:100%;margin-bottom:12px">
    <div class="notes">${list.map(n => `<div role="button" tabindex="0" data-record="${esc(n.paper.id)}" style="cursor:pointer">${noteHTML(n, false, n.paper.title)}</div>`).join("") || `<p class="note">No notes match.</p>`}</div>`
    : `<div class="card"><h3>Your notebook is empty</h3><p class="note">Notes you write next to a figure, and chat answers you save, collect here across all papers.</p></div>`;
  if (q) { const i = $("#nbQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function renderTopic() {
  const name = S.topic, ps = papersInTopic(name), tv = D.topics.get(topicKey(name)) || {};
  $("#pTitle").textContent = name; $("#pSub").textContent = `Topic · ${ps.length} paper${ps.length === 1 ? "" : "s"}`;
  $("#main").innerHTML = `<section class="view" style="max-width:980px">
    <button class="linkbtn" type="button" data-ltab="topics">← All topics</button>
    <div class="eyebrow" style="margin-top:12px">Topic</div><h2>${esc(name)}</h2>
    <div class="box" style="margin-top:18px"><h3><span>Overview across papers</span>${tv.synthAt ? `<span class="savebadge">written ${fmtDate(tv.synthAt)}</span>` : ""}</h3>
      <div id="synthBox" class="synth">${tv.synthesis ? md(tv.synthesis) : `<p class="note">Claude can compare these papers' questions, approaches and findings, and fold in your notes and saved answers: where they agree, where they conflict, and what's still open.</p>`}</div>
      ${S.sample ? `<div style="margin-top:10px"><button class="btn ${tv.synthesis ? "" : "primary"}" type="button" data-act="synth" ${S.synthBusy ? "disabled" : ""}>${S.synthBusy ? "Writing…" : tv.synthesis ? "Rewrite overview" : "Write overview"}</button></div>` : `<p class="note">${NO_CLAUDE}</p>`}
    </div>
    <h3 style="margin:24px 0 10px">Papers</h3>
    <div class="plist">${ps.map((r, i) => `<div class="pcard"><span class="num">[${i + 1}]</span><div style="min-width:0;display:flex;flex-direction:column;gap:4px">
      <button type="button" class="linkbtn" data-record="${esc(r.id)}" style="text-align:left;font-size:15px;font-weight:600;color:var(--ink)">${esc(r.title)}</button>
      ${r.primer?.coreQuestion ? `<div class="pq">${esc(r.primer.coreQuestion)}</div>` : ""}
      ${r.restate ? `<div class="pm">Your version: ${esc(r.restate)}</div>` : ""}
      <div class="pm">${esc([r.year, progressOf(r.id).label, r.nNotes ? r.nNotes + " notes" : "", r.nChat ? r.nChat + " chat messages" : ""].filter(Boolean).join(" · "))}</div></div></div>`).join("")}</div>
  </section>`;
}
async function synthTopic(name) {
  if (!S.sample || S.synthBusy) return;
  const ps = papersInTopic(name); if (!ps.length) return;
  S.synthBusy = true; renderTopic();
  const notes = await gatherNotes(ps);
  const blocks = ps.map((r, i) => {
    const pn = notes.filter(n => n.paper.id === r.id).slice(0, 25).map(n => `- ${n.fig ? `(Fig. ${n.fig}${n.panel || ""}) ` : ""}${n.q ? "Q: " + n.q + " A: " : ""}${n.text}`.slice(0, 1200)).join("\n");
    const br = Object.entries(r.briefs || {}).map(([k, b]) => `- Fig. ${k}: ${b.claim}`).join("\n");
    return `[${i + 1}] ${r.title}${r.year ? " (" + r.year + ")" : ""}
Core question: ${r.primer?.coreQuestion || "unknown"}
Approach: ${r.primer?.approach || "unknown"}
Gap addressed: ${r.primer?.gap || "unknown"}
Figure claims:\n${br || "- none recorded"}
Reader's own version of the question: ${r.restate || "none"}
Reader's notes and saved answers:\n${pn || "- none"}`;
  }).join("\n\n");
  const prompt = `You are a rigorous, unsentimental academic collaborator. A neuroscience researcher has filed these papers under the topic "${name}". Using ONLY the material below, write an overview in Markdown with these headings (use ##):
## Shared question
## How the approaches differ
## What the findings add up to
## Tensions and confounds
## Open questions and what to read or check next
Cite papers as [1], [2]. Weave in the reader's own notes where they matter and say when a point comes from them. Keep it under 450 words. Do not invent results that are not in the material; say where the material is too thin to judge.

${blocks}`.slice(0, 200000);
  try {
    const { text } = await S.sample(prompt, { cache: false, onText: ({ text }) => { const b = $("#synthBox"); if (b) b.innerHTML = md(text); } });
    const k = topicKey(name), v = { kind: "topic", name, ...(D.topics.get(k) || {}), synthesis: text, synthAt: Date.now() };
    D.topics.set(k, v); if (D.col) enqueue(k, () => D.col.doc(k).set(v));
  } catch (e) { toast(errCopy(e)); claudeOff(e); }
  S.synthBusy = false; if (S.view === "topic") renderTopic();
}
async function renderRecord() {
  const r = recOf(S.recId); if (!r) { S.view = "library"; renderLibrary(); return; }
  const canOpen = buildGroups().some(g => (g.id === r.id || g.members.some(m => m.id === r.id) || normTitle(g.title) === normTitle(r.title)) && g.file) || !!r.phone?.bundle;
  $("#pTitle").textContent = r.title; $("#pSub").textContent = "Your saved work";
  const pr = r.primer || {};
  $("#main").innerHTML = `<section class="view" style="max-width:980px">
    <button class="linkbtn" type="button" data-act="tolib">← Library</button>
    <div class="libhead" style="margin-top:12px"><div style="min-width:0"><div class="eyebrow">Read-back · last opened ${fmtDate(r.lastOpened)}</div><h2>${esc(r.title)}</h2>
      ${(r.tags || []).length ? `<div class="tags" style="margin-top:8px">${r.tags.map(t => `<button type="button" class="tchip ro" data-topic="${esc(t)}" style="border:0">${esc(t)}</button>`).join("")}</div>` : ""}</div>
      <button class="btn ${canOpen ? "primary" : ""}" type="button" data-act="openrec">${canOpen ? (r.phone?.bundle && !buildGroups().some(g => g.id === r.id && g.file) ? "Open synced copy" : "Open the PDF") : "Re-select folder to open the PDF"}</button></div>
    <div class="reveal" style="margin-top:18px">
      <div class="card wide"><div class="eyebrow">Core question</div><div style="font-family:var(--f-read);font-size:19px;margin-top:4px">${esc(pr.coreQuestion || "Not generated")}</div></div>
      <div class="card"><div class="eyebrow">Your version</div><p style="margin:6px 0 0">${esc(r.restate || "Not written")}</p>${r.verdict ? `<p class="note" style="margin:6px 0 0">${esc(r.verdict.feedback)}</p>` : ""}</div>
      <div class="card"><div class="eyebrow">Progress</div><p style="margin:6px 0 0">${esc(progressOf(r.id).label)}</p></div>
      ${r.card ? `<div class="card wide"><div class="eyebrow">Your card</div><div style="margin-top:6px">${onelinerHTML(r.card)}</div></div>` : ""}
      ${Object.keys(r.briefs || {}).length ? `<div class="card wide"><div class="eyebrow">Figure claims</div><ul style="margin:6px 0 0;padding-left:18px">${Object.entries(r.briefs).map(([k, b]) => `<li><strong>Fig. ${esc(k)}</strong> ${esc(b.claim)}</li>`).join("")}</ul></div>` : ""}
    </div>
    <div class="box" style="margin-top:18px"><h3><span>Notes</span></h3><div class="notes" id="recNotes"><div class="thinking"><span class="dot"></span>Loading…</div></div></div>
    <div class="box" style="margin-top:18px"><h3><span>Conversation</span></h3><div class="transcript" id="recChat"><div class="thinking"><span class="dot"></span>Loading…</div></div></div>
  </section>`;
  const [notes, chat] = await Promise.all([listChildren(r.id, "notes"), listChildren(r.id, "chat")]);
  if (S.view !== "record" || S.recId !== r.id) return;
  $("#recNotes").innerHTML = notes.map(n => noteHTML(n, false)).join("") || `<p class="note" style="margin:0">No notes.</p>`;
  $("#recChat").innerHTML = chat.map(m => m.role === "user" ? `<div class="msg u" style="margin-left:auto;width:fit-content">${esc(m.content)}</div>` : `<div class="msg a">${md(m.content)}</div>`).join("") || `<p class="note" style="margin:0">No conversation.</p>`;
}
async function addNote(figN) {
  const P = S.paper, ta = $("#noteIn"), text = (ta?.value || "").trim();
  if (!text) { toast("Write the note first."); return; }
  const panel = figN && S.pinned && S.pinned.fig === figN ? S.pinned.panel : null;
  const n = await addChild(P, "notes", { kind: "note", text, fig: figN, panel });
  P.notes = [...(P.notes || []), n]; persistPaper(P); render();
  toast(P.demo ? "Note added (example paper: not saved)" : "Note saved");
}
async function saveMsg(i) {
  const P = S.paper, m = S.chat[i]; if (!P || !m || m.saved) return;
  let q = ""; for (let k = i - 1; k >= 0; k--) if (S.chat[k].role === "user") { q = S.chat[k].content; break; }
  const f = S.view === "figures" ? P.figures[S.figIdx] : null;
  const n = await addChild(P, "notes", { kind: "saved", text: m.content, q, fig: f ? f.n : null, panel: f && S.pinned && S.pinned.fig === f.n ? S.pinned.panel : null });
  m.saved = true; P.notes = [...(P.notes || []), n]; persistPaper(P);
  if (D.col && m._id) enqueue(keyOf(P.id) + "/chat", () => D.col.doc(keyOf(P.id)).collection("chat").doc(m._id).update({ saved: true }));
  renderChat(); render();
}
