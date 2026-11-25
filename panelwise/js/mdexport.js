"use strict";
/* ---------- Markdown export: your work on a paper or a topic, as plain text files ----------
   One .md file per paper (citation, core question, your version, figure claims and your verdicts, cards,
   notes, highlights with comments) and per topic (overview and its papers). In the app they go to
   Papers/_panelwise/notes/, which iCloud carries to the Mac, so Obsidian or any editor can open them; in a
   browser they download. They are a readable copy: the app never reads them back. */
const MD_DIR = "_panelwise/notes";
const mdSafe = s => String(s || "untitled").replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
const mdLine = s => String(s || "").replace(/\s+/g, " ").trim();

async function mdPaper(r) {
  const [notes, marks] = await Promise.all([listChildren(r.id, "notes"), listChildren(r.id, "marks")]);
  const pr = r.primer || {}, out = [];
  out.push(`# ${mdLine(r.title)}`, "");
  const meta = [r.authors && r.authors.length ? shortAuthors(r.authors) : "", r.year || "", r.doi ? `https://doi.org/${r.doi}` : ""].filter(Boolean);
  if (meta.length) out.push(meta.join(" · "), "");
  if ((r.tags || []).length) out.push(`Topics: ${r.tags.map(t => `#${t.replace(/\s+/g, "-")}`).join(" ")}`, "");
  if (r.status) out.push(`Status: ${STATUS_NAMES[r.status] || r.status}`, "");
  if (pr.coreQuestion) out.push("## Core question", "", mdLine(pr.coreQuestion), "");
  if (r.restate) out.push("## In my words", "", mdLine(r.restate), "", ...(r.verdict && r.verdict.feedback ? [`> Check: ${mdLine(r.verdict.feedback)}`, ""] : []));
  const figs = Object.entries(r.briefs || {}).sort((a, b) => +a[0] - +b[0]);
  const judged = Object.keys(r.judge || {});
  if (figs.length || judged.length) {
    out.push("## Figures", "");
    for (const n of [...new Set([...figs.map(f => f[0]), ...judged])].sort((a, b) => a - b)) {
      const b = (r.briefs || {})[n] || {}, j = (r.judge || {})[n];
      out.push(`### Figure ${n}`);
      if (b.claim) out.push(`- Claim: ${mdLine(b.claim)}`);
      if (j) out.push(`- My verdict: **${JUDGE_NAMES[j.v] || j.v}**${j.why ? `: ${mdLine(j.why)}` : ""}`);
      out.push("");
    }
  }
  const cards = [r.card, ...(r.cards || [])].filter(c => c && c.finding);
  if (cards.length) {
    out.push("## Cards", "");
    for (const c of cards) out.push(`- **${mdLine(c.lab)}${c.year ? " " + c.year : ""}**: ${mdLine(c.finding)}${c.prep ? ` (${mdLine(c.prep)})` : ""}${c.caveat ? `. Caveat: ${mdLine(c.caveat)}` : ""}${c.fig ? ` [Fig. ${c.fig}${c.panel || ""}]` : ""}`);
    out.push("");
  }
  if (marks.length) {
    out.push("## Highlights", "");
    for (const m of marks) out.push(`> ${mdLine(m.text)}`, ...(m.comment ? ["", mdLine(m.comment)] : []), "");
  }
  if (notes.length) {
    out.push("## Notes", "");
    for (const n of notes) out.push(`- ${n.fig ? `(Fig. ${n.fig}${n.panel || ""}) ` : ""}${String(n.text || "").trim().replace(/\n+/g, "\n  ")}${n.kind === "saved" ? " _(from chat)_" : ""}`);
    out.push("");
  }
  return out.join("\n");
}
function mdTopic(name) {
  const tv = D.topics.get(topicKey(name)) || {}, ps = papersInTopic(name), out = [`# ${mdLine(name)}`, ""];
  if (tv.synthesis) out.push("## Overview", "", String(tv.synthesis).trim(), "");
  out.push("## Papers", "");
  for (const r of ps) {
    const c = r.card && r.card.finding ? r.card : null;
    out.push(`- [[${mdSafe(r.title)}]]${r.year ? ` (${r.year})` : ""}${c ? `: ${mdLine(c.finding)}` : ""}`);
  }
  return out.join("\n") + "\n";
}
async function mdWrite(files) {
  if (PW.native) {
    if (!PW.files.folderName) { toast("Choose your Papers folder first; the notes are saved there."); return false; }
    for (const [name, text] of files) await PW.files.writeText(`${MD_DIR}/${name}`, text);
    toast(`Saved ${files.length} file${files.length === 1 ? "" : "s"} to ${PW.files.folderName}/${MD_DIR}`, 5000);
  } else {
    const text = files.length === 1 ? files[0][1] : files.map(([n, t]) => `<!-- ${n} -->\n${t}`).join("\n\n---\n\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = files.length === 1 ? files[0][0] : `panelwise-notes-${new Date().toISOString().slice(0, 10)}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  return true;
}
async function mdExportPaper(id) {
  const r = recOf(id); if (!r) return;
  try { await mdWrite([[mdSafe(r.title) + ".md", await mdPaper(r)]]); } catch (e) { PW.log.error("export", e); toast("Couldn't write the file."); }
}
async function mdExportTopic(name) {
  try {
    const files = [[`Topic - ${mdSafe(name)}.md`, mdTopic(name)]];
    for (const r of papersInTopic(name)) files.push([mdSafe(r.title) + ".md", await mdPaper(r)]);
    await mdWrite(files);
  } catch (e) { PW.log.error("export", e); toast("Couldn't write the files."); }
}
// every paper you did something with, and every topic
async function mdExportAll() {
  try {
    toast("Writing your notes…");
    const files = [];
    for (const r of allRecs()) if (r.card || r.restate || (r.nNotes || 0) > 0 || Object.keys(r.judge || {}).length || (NB.items || []).some(x => x.paper.id === r.id)) files.push([mdSafe(r.title) + ".md", await mdPaper(r)]);
    for (const t of allTopics()) files.push([`Topic - ${mdSafe(t)}.md`, mdTopic(t)]);
    if (!files.length) { toast("Nothing to export yet."); return; }
    await mdWrite(files);
  } catch (e) { PW.log.error("export", e); toast("Couldn't write the files."); }
}
