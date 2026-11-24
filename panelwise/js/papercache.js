"use strict";
/* ---------- paper cache: reopen a paper without re-reading the whole PDF ----------
   Reading a PDF (every page's text, headers and footers, sections, figure legends) takes seconds on a phone
   and gives the same result every time. The first time a file is opened, the result is stored in the
   on-device database (collection "_text": not part of backups, never leaves the phone). Next time the paper
   opens from that copy straight away, while the PDF itself loads in the background for figure images.
   Keyed by file name, size and modification date, so an edited or replaced file is read afresh.
   No Claude calls are involved in any of this: summaries, panel boxes and chat are saved separately. */
const PW_TEXT_COL = "_text", PW_TEXT_VER = 10;   // bump when the parser output changes (10: two-column pages stored line by line across both columns, 2: reference list kept, 3: superscripts kept, 4: unheaded reference lists, 5: cleaner text, 8: dash captions, small figures, 9: short figures stop above the caption)
const pwTextKey = file => `${PW_TEXT_VER}|${file.name}:${file.size}:${file.lastModified || 0}`;

async function pwLoadDoc(file) {
  const lib = await ensurePdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  return lib.getDocument({ data, ...PDF_OPTS }).promise;
}

(function () {
  const readPdf = parsePdf;
  // the paper's text only (for the feed): from the cache, or read once and cached; the PDF document is not kept
  window.pwPaperText = async function (file) {
    const key = pwTextKey(file);
    try { const hit = PW.be && await PW.be.get(PW_TEXT_COL, key); if (hit && hit.title !== undefined && Array.isArray(hit.figures)) return hit; } catch {}
    const raw = await readPdf(file, () => {});
    const { doc, ...plain } = raw;
    try { doc && doc.destroy(); } catch {}
    const clean = JSON.parse(JSON.stringify(plain));
    try { await PW.be.put(PW_TEXT_COL, key, clean); if (typeof IX !== "undefined") IX.noText.delete(key); } catch (e) { console.warn("couldn't cache paper text:", e && e.message); }
    return clean;
  };
  // opening a paper: the cached text if there is one (the PDF loads in the background for figures), else parse and cache
  window.parsePdfCached = async function (file, prog) {
    const key = pwTextKey(file);
    let hit = null;
    try { hit = PW.be && await PW.be.get(PW_TEXT_COL, key); } catch {}
    if (hit && hit.title !== undefined && Array.isArray(hit.figures)) {
      const raw = { ...hit, doc: null };
      // the PDF is still needed to draw figures: load it in the background and attach it when ready
      raw.docReady = pwLoadDoc(file).then(doc => {
        const P = S.paper;
        if (P && P.docReady === raw.docReady) { P.doc = doc; if (S.view === "figures") render(); }
        else doc.destroy();
        return doc;
      }).catch(e => {
        console.warn("PDF load failed:", e && e.message);
        const P = S.paper; if (P && P.docReady === raw.docReady) { P.docFailed = true; if (S.view === "figures") render(); }
        return null;
      });
      return raw;
    }
    const raw = await readPdf(file, prog);
    try {
      const { doc, ...plain } = raw;
      await PW.be.put(PW_TEXT_COL, key, JSON.parse(JSON.stringify(plain)));
      if (typeof IX !== "undefined") IX.noText.delete(key);
    } catch (e) { console.warn("couldn't cache paper text:", e && e.message); }
    return raw;
  };
})();
