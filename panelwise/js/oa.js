"use strict";
/* ---------- open-access PDFs: find a legal copy (OpenAlex) and save it into your Papers folder ----------
   OpenAlex (api.openalex.org, free, no account or email) knows for most papers whether a legal open-access copy
   exists: the publisher's open version, PubMed Central, a university repository, bioRxiv/medRxiv or arXiv.
   Only what you look up is sent (a reference, a title or a DOI; your ORCID iD for "My papers").
   In the app the PDF is downloaded natively into "Papers/Open access/" (iCloud Drive syncs it to your other
   devices), added to the library and opened; where it came from is kept with your reading data ("pwread:oa:").
   In a browser the PDF just opens in a new tab: a web page can't write into a folder. */

const OA_API = "https://api.openalex.org";
const OA_FIELDS = "id,doi,title,publication_year,authorships,open_access,best_oa_location,locations,type";
const OA_DIR = "Open access";

// "Romano, V. et al. (2018). Olivary ... Neuron" -> a DOI if it has one, else the text to search for
function oaQueryFrom(text) {
  const t = String(text || "");
  const doi = (t.match(/\b10\.\d{4,9}\/[^\s"<>]+/) || [])[0];
  return doi ? { doi: doi.replace(/[.,;)\]]+$/, "") } : { text: t.replace(/\s+/g, " ").slice(0, 800) };
}
async function oaJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw { code: r.status === 404 ? "not_found" : "http", text: "OpenAlex answered " + r.status };
  return r.json();
}
// every legal PDF of a work, best first: the publisher's open version, then the accepted manuscript, then a preprint
function oaPdfsOf(w) {
  const locs = [w.best_oa_location, ...(w.locations || [])].filter(l => l && l.is_oa && l.pdf_url);
  const rank = l => ({ publishedVersion: 0, acceptedVersion: 1, submittedVersion: 2 }[l.version] ?? 3);
  locs.sort((a, b) => rank(a) - rank(b));
  const seen = new Set(), out = [];
  for (const l of locs) {
    const url = l.pdf_url.replace(/^http:\/\//, "https://"); if (seen.has(url)) continue; seen.add(url);
    let host = ""; try { host = new URL(l.landing_page_url || url).hostname; } catch {}
    out.push({ url, landing: l.landing_page_url || w.doi || null, license: l.license || null, version: l.version || null,
      source: (l.source && l.source.display_name) || host || "open access" });
  }
  return out;
}
const oaPdfOf = w => oaPdfsOf(w)[0] || null;
// Europe PMC often has a paper that the publisher's site won't hand out (its PDF link goes in after the others)
async function oaEuropePMC(w) {
  const doi = (w.doi || "").replace(/^https?:\/\/doi\.org\//i, ""); if (!doi) return null;
  try {
    const j = await oaJSON(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:"${doi}"`)}&resultType=core&format=json`);
    const r = (j.resultList && j.resultList.result || [])[0]; if (!r || !r.pmcid || r.inEPMC !== "Y") return null;
    return { url: `https://europepmc.org/articles/${r.pmcid}?pdf=render`, landing: `https://europepmc.org/article/PMC/${r.pmcid}`, license: r.license || null, version: "acceptedVersion", source: "Europe PMC" };
  } catch { return null; }
}
// a reference contains its paper's title: the share of the title's words that are in the reference text
function inRefOf(w, text) {
  // plain word lists: normTitle is made for titles and keeps only their start
  const words = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  const T = words(w.title).filter(x => x.length > 2), R = new Set(words(text));
  return T.length ? T.filter(x => R.has(x)).length / T.length : 0;
}
// look up one paper: by DOI, or by searching the reference/title text (the match must share most title words)
async function oaFind(q) {
  if (q.doi) {
    const w = await oaJSON(`${OA_API}/works/https://doi.org/${encodeURIComponent(q.doi)}?select=${OA_FIELDS}`);
    return w ? { w, pdf: oaPdfOf(w) } : null;
  }
  // the title is the best search: "Colgin LL (2016). Rhythms of the hippocampal network. Nat Rev…" -> the part after the
  // year; Nature style ("Ito, M. Control of … Nat. Rev. Neurosci. 9, 304 (2008).") -> the longest sentence-like part
  const t = q.text, guesses = [];
  const afterYear = t.match(/\(?(?:19|20)\d{2}[a-z]?\)?[.,:]?\s+([^.?!]{15,250}[.?!])/);
  if (afterYear) guesses.push(afterYear[1]);
  const longest = t.split(/\.\s+/).map(x => x.trim()).filter(x => x.split(" ").length >= 4 && !/\d{2,}/.test(x)).sort((a, b) => b.length - a.length)[0];
  if (longest && !guesses.includes(longest)) guesses.push(longest);
  guesses.push(t);
  let hits = [];
  for (const g of guesses) {
    const j = await oaJSON(`${OA_API}/works?search=${encodeURIComponent(g.slice(0, 250))}&per-page=5&select=${OA_FIELDS}`);
    hits = (j.results || []).filter(w => w.title);
    if (hits.some(w => inRefOf(w, t) >= .8)) break;
  }
  const best = hits.map(w => ({ w, s: inRefOf(w, t) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s >= .8 ? { w: best.w, pdf: oaPdfOf(best.w) } : null;
}
// a paper in your library already (same DOI, or the same title)
function oaInLibrary(w) {
  const nt = normTitle(w.title || ""), doi = (w.doi || "").replace(/^https?:\/\/doi\.org\//i, "").toLowerCase();
  return ixPapers().find(L => (doi && String(L.g.doi || "").toLowerCase() === doi) || (nt.length >= 25 && L.tn === nt)) || null;
}
const oaAuthors = w => {
  const au = (w.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean), sur = s => s.trim().split(/\s+/).pop();
  return au.length ? sur(au[0]) + (au.length > 2 ? " et al." : au.length === 2 ? " & " + sur(au[1]) : "") : "";
};
const oaFileName = w => {
  const au = (w.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean), sur = s => s.trim().split(/\s+/).pop();
  const base = [au.length ? sur(au[0]) : "Paper", au.length > 2 ? "et_al" : au.length === 2 ? sur(au[1]) : null, w.publication_year].filter(Boolean).join("_");
  return base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_") + ".pdf";
};
const oaLicense = l => l ? l.replace(/^cc-/, "CC ").replace(/-/g, " ").toUpperCase().replace(/^CC /, "CC ") : "";
const oaWhere = pdf => [pdf.source, oaLicense(pdf.license), pdf.version === "acceptedVersion" ? "accepted manuscript" : pdf.version === "submittedVersion" ? "preprint" : null].filter(Boolean).join(" · ");

// save it into the Papers folder (app) or open it (browser); then open it in the app
async function oaGet(found, onStep) {
  const { w, pdf } = found; if (!pdf) return { ok: false, why: "none" };
  const have = oaInLibrary(w); if (have) return { ok: true, have };
  if (!PW.native || !PW.files.folderName) { window.open(pdf.url, "_blank", "noopener"); return { ok: true, opened: true }; }
  const res = await oaGetFile(w, pdf, onStep);
  if (!res.entry) return res;
  onStep && onStep("Adding it to your library…");
  await PW.files.scan();                              // the library lists it like any other PDF in the folder
  return { ok: true, entry: res.entry };
}
// download one paper's PDF into Papers/Open access (directly, else in a browser window) and note where it came from
async function oaGetFile(w, pdf, onStep) {
  // every legal copy in turn, downloaded directly; many sites only give a PDF to a real browser, so if none
  // works the best copy opens in a browser window inside the app (where a robot check can be answered)
  const copies = oaPdfsOf(w), epmc = await oaEuropePMC(w);
  if (epmc && !copies.some(c => c.url === epmc.url)) copies.push(epmc);
  const path = `${OA_DIR}/${oaFileName(w)}`;
  let e = null, used = null; const why = [];
  for (const c of copies) {
    onStep && onStep(`Downloading from ${c.source}…`);
    try { e = await PW.plugin.downloadPDF({ url: c.url, path }); used = c; break; } catch (err) { why.push(`${c.source}: ${(err && err.message) || err}`); }
  }
  if (!e) {
    onStep && onStep("Opening it in a browser window…");
    for (const c of copies) {
      try { e = await PW.plugin.downloadInBrowser({ url: c.url, path, title: w.title.slice(0, 60) }); used = c; break; }
      catch (err) { if (err && err.code === "cancelled") return { ok: false, why: "cancelled" }; why.push(`browser window (${c.source}): ${(err && err.message) || err}`); }
    }
  }
  if (!e) { console.warn("open-access download failed", why); return { ok: false, why: "failed", detail: why }; }
  const pdfUsed = used || pdf;
  try { localStorage.setItem("pwread:oa:" + e.name, JSON.stringify({ t: Date.now(), title: w.title, doi: w.doi, url: pdfUsed.url, landing: pdfUsed.landing, source: pdfUsed.source, license: pdfUsed.license, version: pdfUsed.version })); } catch {}
  return { ok: true, entry: e };
}
// open what oaGet produced
async function oaOpen(res) {
  if (res.have) { await ixOpen(res.have, ""); return; }
  if (res.entry) {
    const g = buildGroups().find(g => g.members.some(m => m.path === res.entry.path));
    if (g) openFromLibrary(g.id); else handleFile(pwLazyFile(res.entry));
  }
}
// the provenance of a downloaded file, for the paper's header ("Open access · PubMed Central · CC BY")
function oaInfo(fileName) { try { return JSON.parse(localStorage.getItem("pwread:oa:" + fileName) || "null"); } catch { return null; } }

/* ---- a box that finds and gets one paper: used by the reference sheet and the universal search ---- */
async function oaRun(box, q) {
  box.innerHTML = `<div class="thinking"><span class="dot"></span>Looking for a legal open-access copy…</div>`;
  let found;
  try { found = await oaFind(q); }
  catch (e) { box.innerHTML = `<p class="note">${PW.online() ? "Couldn't reach OpenAlex. Try again in a moment." : "You're offline. Finding open-access PDFs needs a connection."}</p>`; return; }
  if (!found) { box.innerHTML = `<p class="note">Couldn't identify this paper in OpenAlex.</p>`; return; }
  const { w, pdf } = found, have = oaInLibrary(w);
  const head = `<div class="oa-hit"><strong>${esc(w.title)}</strong><span class="note">${esc([oaAuthors(w), w.publication_year].filter(Boolean).join(" "))}</span></div>`;
  if (have) { box.innerHTML = head + `<p class="note">Already in your library.</p><button type="button" class="btn" data-oa="open-lib" data-id="${esc(have.id)}">Open it</button>`; return; }
  if (!pdf) { box.innerHTML = head + `<p class="note">No legal open-access copy is known for this paper.${w.doi ? ` <a href="${esc(w.doi)}" target="_blank" rel="noopener">Publisher page ↗</a>` : ""}</p>`; return; }
  box._found = found;
  box.innerHTML = head + `<p class="note">Open access: ${esc(oaWhere(pdf))}</p>
    <button type="button" class="btn primary" data-oa="get">${PW.native && PW.files.folderName ? "Save to Papers and open" : "Open the PDF"}</button>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("[data-oa]"); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const box = b.closest(".oa-box");
  if (b.dataset.oa === "find") { oaRun(box, JSON.parse(b.dataset.q)); return; }
  if (b.dataset.oa === "open-lib") { const L_ = ixPapers().find(x => x.id === b.dataset.id); if (L_) { if (RM.el && !RM.el.hidden) { RM.onClose = null; rmClose(); } await ixOpen(L_, ""); } return; }
  if (b.dataset.oa === "get" && box && box._found) {
    b.disabled = true;
    const res = await oaGet(box._found, t => { b.textContent = t; });
    if (!res.ok) {
      const pdf = box._found.pdf;
      box.querySelector(".oa-fail")?.remove();
      if (res.why !== "cancelled") box.insertAdjacentHTML("beforeend", `<p class="note oa-fail">None of the legal copies could be downloaded. <a href="${esc(pdf.landing || pdf.url)}" target="_blank" rel="noopener">Open its page ↗</a>${res.detail && res.detail.length ? `<br><small>${res.detail.map(esc).join("<br>")}</small>` : ""}</p>`);
      b.disabled = false; b.textContent = "Try again"; return;
    }
    if (res.opened) { b.textContent = "Opened in a new tab"; return; }
    toast(res.have ? "Already in your library" : `Saved to ${PW.files.folderName}/${OA_DIR}`);
    if (RM.el && !RM.el.hidden) { RM.onClose = null; rmClose(); }
    if (typeof lsClose === "function" && LS.el && !LS.el.hidden) lsClose();
    await oaOpen(res);
  }
}, true);

/* ---- My papers: your works from ORCID, with their legal open-access copies ---- */
async function oaMyPapers(orcid, box) {
  box.innerHTML = `<div class="thinking"><span class="dot"></span>Looking up your papers…</div>`;
  let works = [];
  try {
    const j = await oaJSON(`${OA_API}/works?filter=author.orcid:${encodeURIComponent(orcid)}&per-page=200&sort=publication_year:desc&select=${OA_FIELDS}`);
    works = (j.results || []).filter(w => w.title && w.type !== "peer-review" && w.type !== "erratum");
  } catch { box.innerHTML = `<p class="note">${PW.online() ? "Couldn't reach OpenAlex. Try again in a moment." : "You're offline."}</p>`; return; }
  if (!works.length) { box.innerHTML = `<p class="note">OpenAlex has no works for this ORCID iD.</p>`; return; }
  const rows = works.map(w => ({ w, pdf: oaPdfOf(w), have: oaInLibrary(w) }));
  const todo = rows.filter(r => r.pdf && !r.have);
  box._todo = todo;
  box.innerHTML = `<p class="note">${works.length} works · ${rows.filter(r => r.have).length} already in your library · ${todo.length} with a legal open-access PDF to add · ${rows.filter(r => !r.pdf && !r.have).length} without one.</p>
    ${todo.length ? `<button type="button" class="btn primary" data-oamine="all">${PW.native && PW.files.folderName ? `Save ${todo.length} to Papers/${OA_DIR}` : "Open them"}</button>` : ""}
    <ul class="oa-list">${rows.map(r => `<li><span>${esc(r.w.title)}</span><span class="note">${esc(String(r.w.publication_year || ""))} · ${r.have ? "in your library" : r.pdf ? esc(oaWhere(r.pdf)) : "no open-access copy"}</span></li>`).join("")}</ul>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("[data-oamine]"); if (!b) return;
  const box = b.closest(".oa-mine");
  if (b.dataset.oamine === "find") {
    const v = ($("#orcidIn")?.value || "").trim().replace(/^https?:\/\/orcid\.org\//, "");
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(v)) { toast("That doesn't look like an ORCID iD (0000-0000-0000-0000)."); return; }
    try { localStorage.setItem("pw:orcid", v); } catch {}
    oaMyPapers(v, box.querySelector(".oa-mine-out")); return;
  }
  if (b.dataset.oamine === "all") {
    const out = b.closest(".oa-mine-out"), todo = out._todo || []; b.disabled = true;
    if (!PW.native || !PW.files.folderName) { for (const r of todo.slice(0, 10)) window.open(r.pdf.url, "_blank", "noopener"); return; }
    let ok = 0, fail = [];
    for (let i = 0; i < todo.length; i++) {
      b.textContent = `Saving ${i + 1} of ${todo.length}…`;
      const res = await oaGetFile(todo[i].w, todo[i].pdf);
      if (res && res.why === "cancelled") break;
      if (res && res.entry) ok++; else fail.push(todo[i]);
    }
    b.textContent = `Saved ${ok}`;
    if (ok) await PW.files.scan();
    out.insertAdjacentHTML("afterbegin", `<p class="note">${ok} saved to ${esc(PW.files.folderName)}/${OA_DIR}.${fail.length ? ` ${fail.length} couldn't be downloaded directly: ${fail.map(r => `<a href="${esc(r.pdf.landing || r.pdf.url)}" target="_blank" rel="noopener">${esc(r.w.title.slice(0, 60))}…</a>`).join(", ")}` : ""}</p>`);
  }
});
function oaMineHTML() {
  let v = ""; try { v = localStorage.getItem("pw:orcid") || ""; } catch {}
  return `<div class="card oa-mine"><h3>My papers (ORCID)</h3>
    <p class="note">Adds legal open-access copies of your own papers to the Papers folder (found through OpenAlex: publisher, PubMed Central, repositories, preprints). Only your ORCID iD is sent.</p>
    <div class="setrow"><input id="orcidIn" value="${esc(v)}" placeholder="0000-0000-0000-0000" aria-label="Your ORCID iD" autocomplete="off" spellcheck="false" inputmode="text"><button type="button" class="btn" data-oamine="find">Find my papers</button></div>
    <div class="oa-mine-out"></div></div>`;
}
