"use strict";
/* ---------- library ---------- */
const L = { files: new Map(), meta: store.get("pw:lib") || { folder: "", scannedAt: 0, items: [] }, q: "", field: "all", folderSel: "*", sort: "added", queue: false };
function openFromLibrary(keyOrId) {
  const groups = buildGroups();
  const gr = groups.find(g => g.key === keyOrId) || groups.find(g => g.id === keyOrId || g.members.some(m => m.id === keyOrId));
  const f = gr ? fileForGroup(gr) : null;
  if (!f) { toast(PW.native ? "This paper isn't in your Papers folder." : "Re-select the folder to open this paper."); if (!PW.native) pickFolderAction(); return; }
  handleFile(f, gr.id);
}
function saveLib() { BG_MEMO = null; store.set("pw:lib", L.meta); }
// quiet: a rescan while a paper is open updates the library without switching the screen to it
function onFolderPicked(list, { quiet = false } = {}) {
  BG_MEMO = null; L.scanning = false; L.lost = false;
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
  saveLib();
  if (!quiet) { S.view = "library"; render(); }
  else if (S.view === "library") renderLibList();
  runMetaQueue();
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
// a render asks for the groups several times; build them once per task (never across tasks, so they can't go stale)
let BG_MEMO = null;
function buildGroups() {
  if (BG_MEMO) return BG_MEMO;
  BG_MEMO = buildGroupsNow(); setTimeout(() => { BG_MEMO = null; }, 0);
  return BG_MEMO;
}
function buildGroupsNow() {
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
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...PDF_OPTS }).promise;
  try {
    const pg1 = await doc.getPage(1), tc = await pg1.getTextContent(), W1 = pg1.getViewport({ scale: 1 }).width;
    const lines = []; let cur = null;
    for (const it of tc.items) { if (typeof it.str !== "string") continue; const h = Math.abs(it.transform[3]) || 0, y = it.transform[5];
      if (!cur || Math.abs(y - cur.y) > .6 * Math.max(h, cur.h) || Math.abs(h - cur.h) > .2 * cur.h || (it.str.trim() && it.transform[4] < cur.x - 4 * h)) { cur = { t: "", y, h, x: it.transform[4] }; lines.push(cur); }
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
      for (const l of lines.slice(ti + 1, ti + 90)) {   // 90: each superscript affiliation number is a line of its own here
        const t = l.t.trim(); if (!t) continue;
        if (l.x > W1 * .52 && t.length > 40) continue;   // the right column's text beside the authors (two-column first pages, Neuron 2002)
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
const META_V = 7;
// v6 reads further down for authors (long lists were cut off after about ten names): only lists of 9+ are read again.
// v7 ignores the right column beside the authors; not re-read in the background (each paper re-reads its authors when opened)
const metaDone = it => it.tried && (it.mv === META_V || it.mv === 6 || (it.mv === 5 && (it.authors || []).length < 9) || (it.mv === 4 && (it.authors || []).length >= 2 && (it.authors || []).length < 9 && !/^(the journal|journal|biomedicines|cell|neuron|elife)\b/i.test(it.title || "")));
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
const libShortAuthors = a => !a || !a.length ? "" : a.length <= 3 ? a.join(", ") : `${a[0]}, ${a[1]} … ${a[a.length - 1]} (${a.length})`;
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
const FMT_DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });   // one formatter for every row
const fmtDate = t => t ? FMT_DATE.format(new Date(t)) : "";
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
/* ---- the library screen (design A, plus the Continue card and universal search from B) ----
   one primary action per state: Continue (normal), Choose Papers folder (first launch), Re-select Papers folder
   (folder access lost); rare actions sit in the More menu */
const LIB_MAC = /Mac/.test(navigator.platform || "") && matchMedia("(hover: hover)").matches;   // the Mac (not the iPhone/iPad)
const libKey = k => LIB_MAC ? k : "";
const LIB_SVG = {
  search: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>`,
  more: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
};
const relTime = t => {
  if (!t) return ""; const m = (Date.now() - t) / 6e4;
  if (m < 1) return "just now"; if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60; if (h < 24) return `${Math.round(h)} h ago`;
  const d = h / 24; if (d < 7) return `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"} ago`;
  return fmtDate(t);
};
// L.scanning, L.lost and L.booted are set by platform/files.js (scan, restore)
const libLost = () => !!PW.native && L.meta.items.length > 0 && !L.scanning && (L.lost || (L.booted && !PW.files.folderName));
// where you were in a paper: the step (render.js) and the reading position (readmode.js)
function libWhere(r) {
  const w = typeof stepLoad === "function" ? stepLoad(r.id) : null;
  const nums = Object.keys(r.figs || {}).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  let step = 0, label = "Background";
  if (w && w.view === "question") { step = 1; label = "Goal & question"; }
  else if (w && w.view === "figures") { step = 2; const n = nums[w.fig || 0] || (w.fig || 0) + 1; label = `Figure ${n}${r.nfig ? ` of ${r.nfig}` : ""}`; }
  else if (w && w.view === "card") { step = 3; label = "Your card"; }
  const read = typeof rmProgressLabel === "function" ? rmProgressLabel(r.id) : "";
  const rm = typeof rmLoad === "function" ? rmLoad(r.id) : null;
  return { step, label, read, t: Math.max(r.lastOpened || 0, (w && w.t) || 0, (rm && rm.t) || 0) };
}
// papers you've started and not finished (no card yet), most recent first
function libInProgress() {
  const groups = buildGroups();
  return allRecs().filter(r => r.id && r.lastOpened && !(r.card && r.card.finding) && r.id !== "demo")
    .map(r => {
      const nt = normTitle(r.title);
      const g = groups.find(x => x.id === r.id || x.members.some(m => m.id === r.id)) || (nt.length >= 25 ? groups.find(x => normTitle(x.title) === nt) : null);
      return { r, g, w: libWhere(r), canOpen: !!(g && g.file) };
    })
    .sort((a, b) => b.w.t - a.w.t);
}
const libMeter = step => `<span class="lmeter" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i < step ? "on" : i === step ? "cur" : ""}"></i>`).join("")}</span>`;
function continueCard(list) {
  if (!list.length) return "";
  const [c, ...more] = list, r = c.r, g = c.g || {};
  const au = (g.authors && g.authors.length ? g.authors : r.authors) || [];
  const sur = s => String(s || "").trim().split(/\s+/).pop();
  const who = au.length ? sur(au[0]) + (au.length > 2 ? " et al." : au.length === 2 ? " & " + sur(au[1]) : "") : "";
  const year = g.year || r.year;
  const openAttr = x => x.canOpen ? `data-open="${esc(x.g.key)}"` : `data-record="${esc(x.r.id)}"`;
  const btn = c.canOpen ? `<button type="button" class="btn primary" data-open="${esc(g.key)}">Continue reading <span aria-hidden="true">›</span></button>`
    : `<button type="button" class="btn" data-record="${esc(r.id)}">Your saved work</button>`;
  return `<article class="card lcont" aria-labelledby="lcontT">
    <div class="eyebrow">Continue where you left off</div>
    <h3 class="lcont-t" id="lcontT">${esc(r.title || guessFromName(g.name || r.name || r.id).label)}</h3>
    <div class="lcont-m">${esc([who, year, relTime(c.w.t)].filter(Boolean).join(" · "))}</div>
    <div class="lcont-w">${libMeter(c.w.step)}<span>You were on <b>${esc(c.w.label)}</b>${c.w.read ? ` · ${esc(c.w.read)}` : ""}</span></div>
    <div class="lcont-a">${btn}</div>
    ${more.length ? `<div class="lcont-more"><div class="eyebrow">Also in progress</div>${more.slice(0, 2).map(x => `<button type="button" class="lcont-row" ${openAttr(x)}><span class="t">${esc(x.r.title || x.r.name || x.r.id)}</span><span class="m">${esc(x.w.label)} · ${esc(relTime(x.w.t))}</span></button>`).join("")}</div>` : ""}
  </article>`;
}
function libMoreMenu(btn) {
  const native = !!PW.native, folder = native && PW.files.folderName;
  openMenu(btn, [
    { label: folder || L.files.size ? "Rescan folder" : L.meta.items.length ? "Re-select Papers folder" : "Choose Papers folder", key: libKey(native ? "⌘R" : ""), run: () => folder ? PW.files.scan() : pickFolderAction() },
    { label: "Open one PDF…", key: libKey("⌘O"), run: () => $("#fileIn").click() },
    { label: "Example paper", run: () => openPaper(DEMO) },
    { label: "Mouse brain sections", key: libKey("⌘B"), run: () => brainOpen("", btn) },
    "-",
    { label: "Settings", key: libKey("⌘,"), run: () => { S.view = "settings"; render(); window.scrollTo(0, 0); } },
  ]);
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest('[data-act="libmore"]'); if (b) libMoreMenu(b);
});
// the library's shortcuts on the Mac (labels in the More menu): ⌘O open a PDF, ⌘, settings, ⌘R rescan (the app only)
document.addEventListener("keydown", e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || S.view !== "library" || PW.single) return;
  if (document.documentElement.classList.contains("rdm-open") || document.documentElement.classList.contains("fd-on") || openMenu.cur) return;
  if (e.key === "o") { e.preventDefault(); $("#fileIn").click(); }
  else if (e.key === ",") { e.preventDefault(); S.view = "settings"; render(); window.scrollTo(0, 0); }
  else if (e.key === "r" && PW.native && PW.files.folderName) { e.preventDefault(); PW.files.scan(); }
  else if (e.key === "b") { e.preventDefault(); brainOpen(""); }
});
// the library's search field: typing on another tab shows the papers; Enter searches everything
document.addEventListener("input", e => {
  if (e.target.id !== "libQ" || S.view !== "library" || L.tab === "papers") return;
  L.q = e.target.value; L.tab = "papers"; renderLibrary();
  const i = $("#libQ"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "libQ" && e.key === "Enter" && !e.isComposing && typeof lsOpen === "function") { e.preventDefault(); lsOpen(e.target.value); }
});
function libSearchHTML(n) {
  return `<div class="lsearch-row"><div class="lfield">${LIB_SVG.search}
      <label for="libQ" class="sr-only">Search papers</label>
      <input id="libQ" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" value="${esc(L.q)}" placeholder="${L.field === "authors" ? "Author name, e.g. Romano" : `Search ${n ? n + " papers" : "papers"} by title, author or topic`}">
      <button type="button" class="chip lfield-all" data-act="lsearch" title="Search papers, wiki terms and the text of every paper">Everything${LIB_MAC ? ` <kbd>⌘K</kbd>` : matchMedia("(hover: hover)").matches ? ` <kbd>Ctrl K</kbd>` : ""}</button></div></div>`;
}
function libWelcome() {
  const tap = PW_TOUCH_LIB ? "Tap" : "Click";
  return `<section class="view lwelcome">
    <span class="lbigmark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <h2>Point Panelwise at your papers folder</h2>
    <p class="lede">Panelwise lists every PDF in the folder and its subfolders, reads each title and author, and remembers how far you got in each paper.</p>
    <ol class="lsteps">
      <li><div>${tap} <strong>Choose Papers folder</strong>.</div></li>
      <li><div>${PW.native ? "In Files, open iCloud Drive and select the folder where your PDFs end up, for example" : "Pick the folder where your PDFs end up, for example"}<span class="path">${PW.native ? "iCloud Drive / Papers" : "Documents / Papers"}</span></div></li>
      <li><div>${PW.native ? "Panelwise keeps access and rescans it each time it opens. New PDFs simply appear." : "Your browser asks to “upload” the files. They are only read on this page; pick the folder again next time."}</div></li>
    </ol>
    <div class="lacts"><button class="btn primary" type="button" data-act="pickdir">Choose Papers folder</button><button class="btn" type="button" data-act="demo">Try the example paper</button><button class="btn quiet" type="button" data-act="pickfile">Open one PDF</button></div>
    <p class="note lprivacy">${LIB_SVG.lock}<span>PDFs stay on this device. Only text you choose to send to Claude leaves it.</span></p>
  </section>`;
}
const PW_TOUCH_LIB = matchMedia("(hover: none)").matches;
const libSkel = n => [70, 55, 80, 62, 48].slice(0, n).map(w => `<div class="lskel" aria-hidden="true"><div><span class="sk" style="width:${w}%"></span><span class="sk sm" style="width:${w - 25}%"></span></div><span class="sk" style="width:60%"></span></div>`).join("");
function libLostCard() {
  const f = L.meta.folder || "Papers";
  return `<section class="card lalert" role="alert">
    <span class="lalert-i">${LIB_SVG.alert}</span>
    <div><h3>Papers folder access lost</h3>
      <p class="note">Panelwise can't reach <span class="path">${esc(f)}</span>, so PDFs can't be opened right now. Your notes, cards and progress are saved, and review still works.</p>
      <div class="lacts"><button class="btn primary" type="button" data-act="pickdir">Re-select Papers folder</button><button class="btn" type="button" data-act="pickfile">Open one PDF</button></div>
      <details><summary>Why did this happen?</summary><ul><li>The system can drop folder access after an update.</li><li>The folder was moved, renamed, or is still downloading from iCloud.</li><li>Re-selecting the same folder restores everything; nothing is imported twice.</li></ul></details>
    </div></section>`;
}
function renderLibrary() {
  $("#pTitle").textContent = "Library";
  const M = L.meta, have = L.files.size > 0;
  const nPapers = M.items.length ? buildGroups().length : 0;
  $("#pSub").textContent = M.items.length ? `${M.folder} · ${nPapers} papers${nPapers !== M.items.length ? ` in ${M.items.length} PDFs` : ""}` : "Your papers, read figure by figure";
  L.tab = L.tab || "papers";
  const m = $("#main");
  // first scan of a newly picked folder (the app): a progress line and placeholder rows
  if (!M.items.length && L.scanning) {
    m.innerHTML = `<section class="view lib"><div class="libhead"><div><div class="eyebrow">${esc(PW.files.folderName || "Papers")}</div><h2>Library</h2></div></div>
      <div class="card lstatus" role="status" aria-live="polite"><span class="lspin" aria-hidden="true"></span><div><b>Scanning your Papers folder</b><div class="note">Listing the PDFs in ${esc(PW.files.folderName || "the folder")} and its subfolders…</div></div><div class="lbar ind"><i></i></div></div>
      <div class="liblist" aria-busy="true">${libSkel(5)}</div></section>`;
    return;
  }
  if (!M.items.length && !allRecs().length) { m.innerHTML = libWelcome(); return; }
  const lost = libLost();
  const groups = buildGroups(), nDup = groups.filter(g => g.copies > 1).length;
  const folders = new Map(); for (const gr of groups) for (const f of gr.folders) folders.set(f, (folders.get(f) || 0) + 1);
  const fl = [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const prog = libInProgress(), cont = continueCard(prog);
  const rev = typeof reviewBanner === "function" ? reviewBanner({ primary: !cont && !lost }) : "";
  const sub = [M.folder || (M.items.length ? "" : "Saved work"), lost ? `last scan ${fmtDate(M.scannedAt)}` : M.scannedAt ? `scanned ${relTime(M.scannedAt)}` : ""].filter(Boolean).join(" · ");
  m.innerHTML = `<section class="view lib">
    <div class="libhead"><div><div class="eyebrow">${esc(sub || "Library")}</div><h2>Library</h2></div>
      <div class="libacts">${have && M.items.length ? `<button class="btn" type="button" data-act="feed">Feed</button>` : ""}<button class="btn quiet icon" type="button" data-act="libmore" aria-haspopup="menu" aria-expanded="false" aria-label="More" title="More">${LIB_SVG.more}</button></div></div>
    ${libSearchHTML(nPapers)}
    ${lost ? libLostCard() : ""}
    ${!have && !lost && M.items.length && !L.scanning ? `<div class="lnote note">Showing your last scan from ${fmtDate(M.scannedAt)}. To open a PDF, <button type="button" class="linkbtn" data-act="pickdir">re-select the folder</button> (browsers don't let pages keep folder access). Papers you've worked on open as a read-back of your notes and chat.</div>` : ""}
    ${cont || rev ? `<div class="libtop ${cont && rev ? "two" : ""}">${cont}${rev}</div>` : ""}
    <div class="libnav">${libTabs()}${L.tab === "papers" ? `<div class="lsorts"><select class="sort" id="libField" aria-label="Search in">${[["all", "All fields"], ["authors", "Authors only"], ["title", "Titles only"]].map(([v, l]) => `<option value="${v}" ${L.field === v ? "selected" : ""}>${l}</option>`).join("")}</select><select class="sort" id="libSort" aria-label="Sort papers">${[["added", "Recently added"], ["read", "Recently read"], ["title", "Title A–Z"], ["year", "Year"]].map(([v, l]) => `<option value="${v}" ${L.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>` : ""}</div>
    ${L.tab === "wiki" ? `<div id="wkBox" style="margin-top:16px"></div>` : L.tab === "topics" ? topicsTab() : L.tab === "notebook" ? `<div id="nbBox" style="margin-top:16px"><div class="thinking"><span class="dot"></span>Gathering your notes…</div></div>` : `
    ${fl.length > 1 || nDup ? `<div class="lchips" role="group" aria-label="Folders"><button class="chip" type="button" data-folder="*" aria-pressed="${L.folderSel === "*"}">All <span class="c">${groups.length}</span></button>${fl.length > 1 ? fl.map(([f, c]) => `<button class="chip" type="button" data-folder="${esc(f)}" aria-pressed="${L.folderSel === f}">${esc(f || "Top level")} <span class="c">${c}</span></button>`).join("") : ""}${nDup ? `<button class="chip" type="button" data-folder="~dup" aria-pressed="${L.folderSel === "~dup"}">Duplicates <span class="c">${nDup}</span></button>` : ""}</div>` : ""}
    <div id="libScan" class="lscan"></div>
    <div class="liblist ${lost ? "lost" : ""}" id="libList"></div>`}</section>`;
  if (L.tab === "notebook") renderNotebook(); else if (L.tab === "wiki") renderWikiTab(); else if (L.tab !== "topics") renderLibList();
}
// the status above the list: scanning, reading titles (with a count), or how many are shown
function libStatusHTML(shown) {
  const n = L.meta.items.length;
  const pending = L.meta.items.filter(it => !metaDone(it) && hasFile(it)).length;
  const unread = L.meta.items.filter(it => !metaDone(it)).length;
  if (L.scanning) return `<div class="card lstatus" role="status" aria-live="polite"><span class="lspin" aria-hidden="true"></span><div><b>Rescanning your Papers folder</b><div class="note">The papers below can be opened now. New PDFs appear when the scan finishes.</div></div><div class="lbar ind"><i></i></div></div>`;
  if (pending) { const done = n - pending;
    return `<div class="card lstatus" role="status" aria-live="polite"><span class="lspin" aria-hidden="true"></span><div><b>Reading titles and authors</b><div class="note">${done} of ${n} PDFs · papers already listed can be opened now. Author search is complete when this finishes.</div></div><div class="lbar"><i style="width:${Math.round(done / Math.max(1, n) * 100)}%"></i></div></div>`; }
  if (unread && !libLost()) return `<p class="note lcount"><span class="pill p2">Authors not read for ${unread} of ${n} papers</span> Author search only covers file names for those. <button type="button" class="linkbtn" data-act="pickdir">Re-select the folder</button> to read them.</p>`;
  return `<p class="note lcount" role="status">${shown} shown</p>`;
}
function authorsHTML(a) {
  const q = (L.q || "").trim().toLowerCase(), norm = x => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!q || L.field === "title") return esc(libShortAuthors(a));
  const hit = a.filter(n => norm(n).includes(norm(q)));
  if (!hit.length) return esc(libShortAuthors(a));
  const pos = a.indexOf(hit[0]) + 1;
  return esc(libShortAuthors(a)) + ` <span class="pill p2" style="margin-left:4px">${esc(hit[0])} · author ${pos} of ${a.length}${pos === a.length && a.length > 1 ? " (last)" : ""}</span>`;
}
function renderLibList() {
  if (S.view !== "library") return;
  const box = $("#libList"); if (!box) return;
  const items = libItems();
  { const np = buildGroups().length, M = L.meta; if (M.items.length) $("#pSub").textContent = `${M.folder} · ${np} papers${np !== M.items.length ? ` in ${M.items.length} PDFs` : ""}`; }
  const sc = $("#libScan");
  if (sc) sc.innerHTML = libStatusHTML(items.length);
  const lost = libLost();
  box.innerHTML = items.length ? items.slice(0, 400).map(it => {
    const g = guessFromName(it.name), off = !it.file && !it.synced, hasRec = it.prog.last > 0;
    const extras = [it.nNotes ? `${it.nNotes} note${it.nNotes > 1 ? "s" : ""}` : "", it.nChat ? `${it.nChat} chat` : "", it.synced ? "on phone" : "", it.notInFolder && !it.synced ? "not in folder" : ""].filter(Boolean).join(" · ");
    const dup = it.copies > 1 ? `<div class="rm"><span class="pill p2">${it.copies} copies${it.versions > 1 ? " · files differ" : ""}</span> ${esc(it.members.map(m => (m.folder || "Top level") + " / " + m.name).join("  ·  "))}</div>` : "";
    return `<button type="button" class="row ${off && (!hasRec || lost) ? "off" : ""}" ${off && hasRec ? `data-record="${esc(it.id)}"` : `data-open="${esc(it.key)}"`}><div style="min-width:0"><div class="rt">${esc(it.label)}</div>${it.authors && it.authors.length ? `<div class="rm" style="color:var(--ink);opacity:.8">${authorsHTML(it.authors)}</div>` : ""}<div class="rm">${esc([it.year, it.copies > 1 ? null : (it.title ? g.label : null), it.copies > 1 ? null : it.folders[0], extras].filter(Boolean).join(" · "))}</div>${dup}${it.tags.length ? `<div class="tags" style="margin-top:5px">${it.tags.map(t => `<span class="tchip ro">${esc(t)}</span>`).join("")}</div>` : ""}</div>
      <div class="rr">${lost && !it.synced ? `<span class="loff">${LIB_SVG.lock}Re-select to open</span>` : `<span class="pill ${it.prog.cls}">${esc(it.prog.label)}</span>`}<span>${it.prog.last ? "read " + fmtDate(it.prog.last) : "added " + fmtDate(it.mtime)}</span>${typeof rmProgressLabel === "function" && rmProgressLabel(it.id) ? `<span class="pill">${esc(rmProgressLabel(it.id))}</span>` : ""}</div></button>`;
  }).join("") + (items.length > 400 ? `<div class="row note">Showing 400 of ${items.length}. Search to narrow down.</div>` : "") + (L.scanning ? libSkel(3) : "")
    : `<div class="row note lnone">No papers match${L.q.trim() ? ` “${esc(L.q.trim())}”` : ""}.${L.q.trim().length >= 2 ? ` <button type="button" class="linkbtn" data-act="lsearch">Search everything, including the text of every paper</button>` : ""}</div>`;
}
function libTabs() {
  const recs = allRecs(), nNotes = recs.reduce((a, r) => a + (r.nNotes || 0), 0);
  const tabs = [["papers", "Papers", L.meta.items.length ? buildGroups().length : recs.length], ["topics", "Topics", allTopics().length], ["notebook", "Notebook", nNotes], ["wiki", "Wiki", WKI.agg ? [...WKI.agg.values()].filter(a => a.show).length : "…"]];
  return `<div class="seg lseg" role="tablist" aria-label="Library sections">${tabs.map(([k, l, c]) => `<button type="button" role="tab" data-ltab="${k}" aria-selected="${L.tab === k}">${l} <span class="c">${c}</span></button>`).join("")}</div>`;
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
    <button class="backlink" type="button" data-ltab="topics">All topics</button>
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
  const canOpen = buildGroups().some(g => (g.id === r.id || g.members.some(m => m.id === r.id) || (normTitle(r.title).length >= 25 && normTitle(g.title) === normTitle(r.title))) && g.file) || !!r.phone?.bundle;
  $("#pTitle").textContent = r.title; $("#pSub").textContent = "Your saved work";
  const pr = r.primer || {};
  $("#main").innerHTML = `<section class="view" style="max-width:980px">
    <button class="backlink" type="button" data-act="tolib">Library</button>
    <div class="libhead" style="margin-top:12px"><div style="min-width:0"><div class="eyebrow">Read-back · last opened ${fmtDate(r.lastOpened)}</div><h2>${esc(r.title)}</h2>
      ${(r.tags || []).length ? `<div class="tags" style="margin-top:8px">${r.tags.map(t => `<button type="button" class="tchip ro" data-topic="${esc(t)}" style="border:0">${esc(t)}</button>`).join("")}</div>` : ""}</div>
      <button class="btn ${canOpen ? "primary" : ""}" type="button" data-act="openrec">${canOpen ? (r.phone?.bundle && !buildGroups().some(g => g.id === r.id && g.file) ? "Open synced copy" : "Open the PDF") : "Re-select folder to open the PDF"}</button></div>
    <div class="reveal" style="margin-top:18px">
      <div class="card wide"><div class="eyebrow">Core question</div><div style="font-family:var(--f-read);font-size:19px;margin-top:4px">${esc(pr.coreQuestion || "Not generated")}</div></div>
      <div class="card"><div class="eyebrow">Your version</div><p style="margin:6px 0 0">${esc(r.restate || "Not written")}</p>${r.verdict ? `<p class="note" style="margin:6px 0 0">${esc(r.verdict.feedback)}</p>` : ""}</div>
      <div class="card"><div class="eyebrow">Progress</div><p style="margin:6px 0 0">${esc(progressOf(r.id).label)}</p></div>
      ${r.card ? `<div class="card wide"><div class="eyebrow">Your card${(r.cards || []).length ? `s · ${1 + r.cards.length}` : ""}</div>${[r.card, ...(r.cards || [])].map(c => `<div style="margin-top:6px">${onelinerHTML(c)}</div>`).join("")}</div>` : ""}
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
  draftsClear(["noteIn"]);
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
