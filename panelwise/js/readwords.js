"use strict";
/* Reading mode, word by word (js/readmode.js, js/readaids.js):
   - Word guide: the words shown one at a time, large, at a set number of words per minute (RSVP).
   - Read aloud: the device's own voices (no API calls, works offline), with the place in the text following the
     spoken word: the word underlined, the line guide on its line, the page turning by itself.
   Both read the same list of words, taken from the rendered text in reading order (citation chips left out;
   read aloud also skips figure references). The text is never changed: words are text-node offsets. */

/* ---- the words of the paper, in reading order ---- */
const RM_SYMS = { "=": "equals", "<": "less than", ">": "greater than", "≤": "at most", "≥": "at least", "±": "plus or minus", "~": "about", "≈": "about", "×": "times" };
function rmWords() {
  if (RM.words) return RM.words;
  const W = []; let sec = "";
  for (const el of RM.flow.querySelectorAll("p, li, h2, h3, h4")) {
    if (el.closest(".rdm-more, .rdm-figcard")) continue;
    if (el.tagName === "H3" && el.dataset.sec) sec = el.dataset.sec;
    const start = W.length, w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode, pe = n.parentElement;
      if (pe.closest(".rdm-cite")) continue;
      const ref = !!pe.closest(".ref"), re = /\S+/g; let m;
      while ((m = re.exec(n.nodeValue))) {
        const t = m[0];
        if (!/[\p{L}\p{N}]/u.test(t)) {
          if (RM_SYMS[t]) { W.push({ n, a: m.index, b: m.index + t.length, t, say: RM_SYMS[t], ref: false, sec }); continue; }   // "n = 9"
          // a lone ")." or "," after a skipped reference: keep its pause, on the last word that is read
          const pu = t.replace(/[^.!?,;:]/g, "");
          if (pu) for (let k = W.length - 1; k >= start; k--) if (!W[k].ref) { W[k].say = (W[k].say || W[k].t) + pu; break; }
          continue;
        }
        W.push({ n, a: m.index, b: m.index + t.length, t, ref, sec });
      }
    }
    if (W.length > start) W[W.length - 1].end = /^H/.test(el.tagName) ? "head" : "para";
  }
  return (RM.words = W);
}
function rmWordsReset() {           // the text was drawn again (a setting, another paper): the old words are gone
  rmSpeakStop(); rmRsvpClose(false);
  RM.words = null; RM.wordAt = null; rmWordBand(null);
}
function rmWordPos(i) {
  const w = RM.words && RM.words[i]; if (!w) return null;
  const rg = document.createRange();
  try { rg.setStart(w.n, w.a); rg.setEnd(w.n, w.b); } catch { return null; }
  const r = rg.getClientRects()[0]; if (!r) return null;
  const left = RM.flow.getBoundingClientRect().left, vr = RM.vp.getBoundingClientRect();
  return { page: Math.max(0, Math.min(RM.pages - 1, Math.floor((r.left - left + 1) / RM.step))),
    x: r.left - vr.left + RM.vp.scrollLeft, y: r.top - vr.top, w: r.width, h: r.height };
}
// where to start: the word paused on (if the reader hasn't moved since), else the guide's line, else the top of the page
function rmWordStart() {
  const W = rmWords(); if (!W.length) return -1;
  if (RM.wordAt != null && RM.wordPg === RM.page && (!RM.lineMode || RM.wordLn === RM.ln)) return RM.wordAt;
  const l = RM.lineMode && RM.lines && RM.lines[RM.ln];
  const tp = l ? l.page : RM.page, ty = l ? l.y - 3 : -1e9;
  let lo = 0, hi = W.length - 1, at = W.length - 1;          // words are in page order, and top to bottom on a page
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, p = rmWordPos(mid);
    if (p && (p.page < tp || p.page === tp && p.y < ty)) lo = mid + 1; else { at = mid; hi = mid - 1; }
  }
  return at;
}
// show a word on the page: turn to its page, put the line guide on its line, underline it
function rmWordShow(i) {
  let p = rmWordPos(i); if (!p) return;
  if (p.page !== RM.page) { RM.fsLock = true; try { rmGo(p.page); } finally { RM.fsLock = false; } }
  if (RM.lineMode && RM.lines) {
    const k = RM.lines.findIndex(l => l.page === p.page && p.y + p.h / 2 >= l.y && p.y + p.h / 2 <= l.y + l.h);
    if (k >= 0 && k !== RM.ln) rmLineSet(k);
  }
  rmWordBand(p);
}
function rmWordBand(p) {
  if (!p) { if (RM.wband) RM.wband.hidden = true; return; }
  if (!RM.wband) { RM.wband = document.createElement("div"); RM.wband.className = "rdm-wband"; RM.wband.setAttribute("aria-hidden", "true"); }
  if (RM.wband.parentNode !== RM.vp) RM.vp.appendChild(RM.wband);
  RM.wband.hidden = false;
  Object.assign(RM.wband.style, { left: (p.x - 2) + "px", top: (p.y - 1) + "px", width: (p.w + 4) + "px", height: (p.h + 2) + "px" });
}
function rmWordKeep(i) { RM.wordAt = i; RM.wordPg = RM.page; RM.wordLn = RM.ln; }
function rmWordsLayout() { if (!(RM.tts && RM.tts.on)) rmWordBand(null); }   // after a new layout the underline would be off

/* ---- word guide (RSVP) ---- */
const RM_WPM = [150, 200, 250, 300, 350, 400, 500, 600];
function rmWpm() { const v = +rmPref("wpm", "300"); return RM_WPM.includes(v) ? v : 300; }
function rmRsvpBuild() {
  const el = document.createElement("div");
  el.className = "rdm-rsvp"; el.hidden = true;
  el.innerHTML = `<div class="rdm-rsvp-ctx" id="rsCtx"></div>
    <div class="rdm-rsvp-word" id="rsWord" aria-live="off"><span class="pre"></span><span class="piv"></span><span class="post"></span></div>
    <div class="rdm-rsvp-bar"><i id="rsBar"></i></div>
    <div class="rdm-rsvp-ctl"><button type="button" class="rdm-btn" data-rs="back" aria-label="Back ten words">↺ 10</button>
      <button type="button" class="rdm-btn" data-rs="slower" aria-label="Slower">−</button><span class="wpm" id="rsWpm"></span><button type="button" class="rdm-btn" data-rs="faster" aria-label="Faster">+</button>
      <button type="button" class="rdm-btn rdm-rsvp-play" data-rs="play" id="rsPlay">Pause</button></div>
    <p class="rdm-rsvp-hint">Tap to pause and see the page. ${matchMedia("(hover:hover)").matches ? "Space pauses, ↑ ↓ change the speed." : ""}</p>`;
  RM.el.querySelector(".rdm-main").appendChild(el);
  return el;
}
function rmRsvpOpen() {
  if (RM.tts && RM.tts.on) rmSpeakStop(true);
  const i = rmWordStart(); if (i < 0) return;
  if (!RM.rsvp) RM.rsvp = rmRsvpBuild();
  RM.rsvp.style.width = RM.vp.clientWidth + "px";
  RM.rsvp.style.fontFamily = RM.flow.style.fontFamily || "";
  RM.rsvp.hidden = false; rmWordBand(null);
  RM.rs = { open: true, play: true, i };
  $("#rsWpm").textContent = rmWpm() + " wpm";
  rmRsvpTick();
}
function rmRsvpDraw(i) {
  const W = RM.words, w = W[i]; if (!w) return;
  const t = w.t, lead = (t.match(/^[^\p{L}\p{N}]*/u) || [""])[0].length, n = t.length - lead;
  const piv = lead + (n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4);   // the letter the eye fixes on
  const box = $("#rsWord");
  box.children[0].textContent = t.slice(0, piv); box.children[1].textContent = t[piv] || ""; box.children[2].textContent = t.slice(piv + 1);
  $("#rsCtx").textContent = (w.sec ? w.sec + " · " : "") + Math.round(100 * i / Math.max(1, W.length - 1)) + "%";
  $("#rsBar").style.width = (100 * i / Math.max(1, W.length - 1)) + "%";
}
function rmRsvpTick() {
  const R = RM.rs, W = RM.words; if (!R || !R.open || !R.play) return;
  if (R.i >= W.length) { R.i = W.length; rmRsvpClose(true); return; }
  rmRsvpDraw(R.i); R.shown = R.i;
  const w = W[R.i], t = w.say && !RM_SYMS[w.t] ? w.say : w.t; let f = 1;                 // longer on the end of a sentence or clause, long words, headings
  if (/[.!?]["'’”)\]]*$/.test(t)) f += 1.2; else if (/[,;:]["'’”)\]]*$/.test(t)) f += .5;
  if (t.length > 8) f += (t.length - 8) * .06;
  if (w.end) f += w.end === "head" ? 1.5 : 1;
  R.i++;
  R.timer = setTimeout(rmRsvpTick, 60000 / rmWpm() * f);
}
function rmRsvpPlay(on) {
  const R = RM.rs; if (!R) return;
  clearTimeout(R.timer); R.play = on; $("#rsPlay").textContent = on ? "Pause" : "Play";
  if (on) { if (R.shown != null) R.i = R.shown; rmRsvpTick(); }
}
// close: back to the page, on the word that was showing
function rmRsvpClose(show) {
  const R = RM.rs; if (!R || !R.open) return;
  clearTimeout(R.timer); R.open = false; RM.rsvp.hidden = true;
  const i = Math.min(R.shown != null ? R.shown : R.i, RM.words.length - 1);
  if (show && i >= 0) { rmWordShow(i); rmWordKeep(i); }
}
function rmRsvpClick(e) {
  const b = e.target.closest("[data-rs]"), a = b && b.dataset.rs, R = RM.rs;
  if (!a) { rmRsvpClose(true); return; }               // a tap on the word: pause and show the page
  if (a === "play") rmRsvpPlay(!R.play);
  else if (a === "back") rmRsvpBack();
  else if (a === "slower" || a === "faster") rmWpmStep(a === "faster" ? 1 : -1);
}
function rmRsvpBack() {
  const R = RM.rs; R.i = Math.max(0, (R.shown != null ? R.shown : R.i) - 10); R.shown = R.i; rmRsvpDraw(R.i);
  if (R.play) { clearTimeout(R.timer); rmRsvpTick(); }
}
function rmWpmStep(d) {
  const k = Math.max(0, Math.min(RM_WPM.length - 1, RM_WPM.indexOf(rmWpm()) + d));
  rmSetPref("wpm", String(RM_WPM[k])); if ($("#rsWpm")) $("#rsWpm").textContent = RM_WPM[k] + " wpm";
}
function rmRsvpKey(e) {
  if (e.key === " " || e.key === "Escape" || e.key === "Enter") rmRsvpClose(true);
  else if (e.key === "ArrowUp") rmWpmStep(1);
  else if (e.key === "ArrowDown") rmWpmStep(-1);
  else if (e.key === "ArrowLeft") rmRsvpBack();
  else return false;
  return true;
}

/* ---- read aloud: the device's own speech, one paragraph at a time ---- */
const RM_RATES = [["0.8", "0.8×"], ["1", "1×"], ["1.2", "1.2×"], ["1.4", "1.4×"], ["1.7", "1.7×"]];
const rmCanSpeak = () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
function rmVoices() { try { return speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch { return []; } }
function rmVoice() {
  const vs = rmVoices(), want = rmPref("voice", "");
  return vs.find(v => v.voiceURI === want) || vs.find(v => /premium/i.test(v.name)) || vs.find(v => /enhanced/i.test(v.name))
    || vs.find(v => v.default) || vs.find(v => /en[-_]US/i.test(v.lang)) || vs[0] || null;
}
function rmSpeakBtn() {
  const b = RM.el && RM.el.querySelector('[data-rm="speak"]'); if (!b) return;
  const on = !!(RM.tts && RM.tts.on);
  b.innerHTML = rmIc(on ? "pause" : "speaker") + `<span class="lbl">${on ? "Pause" : "Listen"}</span>`;
  b.classList.toggle("on", on); b.setAttribute("aria-label", on ? "Pause reading aloud" : "Listen: read aloud");
}
function rmSpeakToggle() {
  if (!rmCanSpeak()) { toast("This device can't read aloud."); return; }
  if (RM.tts && RM.tts.on) rmSpeakStop(true); else rmSpeakStart();
}
function rmSpeakStart() {
  if (RM.rs && RM.rs.open) rmRsvpClose(false);
  const i = rmWordStart(); if (i < 0) return;
  RM.tts = { on: true, i, cur: null, gen: (RM.tts ? RM.tts.gen : 0) + 1, boundary: !!(RM.tts && RM.tts.boundary) };
  try { speechSynthesis.cancel(); } catch {}
  rmSpeakBtn(); rmSpeakChunk();
}
function rmSpeakChunk() {
  const T = RM.tts, W = RM.words; if (!T || !T.on) return;
  while (T.i < W.length && W[T.i].ref) T.i++;          // figure references aren't read out
  if (T.i >= W.length) { rmSpeakStop(); return; }
  // a paragraph or heading, cut after a sentence once it gets long (very long utterances stop early on iOS)
  const idx = [], offs = []; let text = "", j = T.i;
  for (; j < W.length; j++) {
    const w = W[j];
    if (!w.ref) { offs.push(text.length); idx.push(j); text += (w.say || w.t) + " "; }
    if (w.end || idx.length >= 45 && /[.!?]["'’”)\]]*$/.test(w.say || w.t) || idx.length >= 90) { j++; break; }
  }
  const next = j, gen = T.gen;
  const u = new SpeechSynthesisUtterance(text.trim()), v = rmVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
  u.rate = +rmPref("rate", "1") || 1;
  const mine = () => RM.tts === T && T.on && T.gen === gen;
  u.onstart = () => { if (!mine()) return; rmSpeakAt(idx[0]); if (!T.boundary) rmSpeakEstimate(idx, gen, u.rate); };
  u.onboundary = e => {
    if (!mine() || (e.name && e.name !== "word")) return;
    T.boundary = true; clearTimeout(T.est);
    let k = 0; while (k + 1 < offs.length && offs[k + 1] <= e.charIndex) k++;
    rmSpeakAt(idx[k]);
  };
  u.onend = () => { if (!mine()) return; clearTimeout(T.est); T.i = next; rmSpeakChunk(); };
  u.onerror = e => {
    if (!mine() || e.error === "interrupted" || e.error === "canceled") return;
    console.warn("speech", e.error); rmSpeakStop(true); toast("Reading aloud stopped" + (e.error ? ` (${e.error})` : "") + ".");
  };
  T.u = u;                                              // keep it alive: Safari drops events of collected utterances
  speechSynthesis.speak(u);
}
// voices that don't report words: move along by estimated timing (about 175 words a minute at 1×)
function rmSpeakEstimate(idx, gen, rate) {
  const T = RM.tts, per = 60000 / (175 * rate), dur = j => per * (.55 + .09 * RM.words[j].t.length);
  let k = 0;
  const step = () => {
    if (RM.tts !== T || !T.on || T.gen !== gen || T.boundary) return;
    if (++k >= idx.length) return;
    rmSpeakAt(idx[k]); T.est = setTimeout(step, dur(idx[k]));
  };
  T.est = setTimeout(step, dur(idx[0]));
}
function rmSpeakAt(i) { if (!RM.tts) return; RM.tts.cur = i; rmWordShow(i); }
function rmSpeakStop(keep) {
  const T = RM.tts; if (!T || !T.on) return;
  T.on = false; T.gen++; clearTimeout(T.est);
  try { speechSynthesis.cancel(); } catch {}
  if (keep && T.cur != null) rmWordKeep(T.cur); else rmWordBand(null);
  rmSpeakBtn();
}
function rmSpeakRestart() { if (RM.tts && RM.tts.on) { const i = RM.tts.cur; rmSpeakStop(true); if (i != null) rmWordKeep(i); rmSpeakStart(); } }

/* ---- settings in the Display sheet (js/readmode.js rmShowLook) ---- */
function rmWordsWpmHTML(seg, row) {           // with the word guide on: its speed
  return rmPref("focus", "0") === "word" ? row("Words per minute", seg("wpm", RM_WPM.map(v => [String(v), String(v)]), String(rmWpm()))) : "";
}
function rmWordsLookHTML(seg, row) {          // the Read aloud group
  if (!rmCanSpeak()) return `<p class="rdm-aid">This device can't read aloud.</p>`;
  const vs = rmVoices(), cur = rmVoice();
  return `<p class="rdm-aid rdm-aid-top">Listen (at the top) reads from where you are, with your device's own voice: free and offline. The text follows along.</p>`
    + row("Speed", seg("rate", RM_RATES, RM_RATES.some(([v]) => v === rmPref("rate", "1")) ? rmPref("rate", "1") : "1"))
    + row("Voice", vs.length ? `<select class="rdm-voice" id="rmVoice" aria-label="Voice">${vs.map(v => `<option value="${esc(v.voiceURI)}"${cur && v.voiceURI === cur.voiceURI ? " selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}</select>` : `<p class="rdm-aid">Loading the voices…</p>`,
      "Better voices: download an Enhanced or Premium English voice in Settings → Accessibility → Spoken Content → Voices (iPhone and Mac).");
}
function rmWordsPref(k, v) {               // speed and voice: no new layout needed
  rmSetPref(k, v); rmShowLook();
  if (k === "rate" || k === "voice") rmSpeakRestart();
}
document.addEventListener("change", e => { if (e.target && e.target.id === "rmVoice") rmWordsPref("voice", e.target.value); });
if (rmCanSpeak()) try { speechSynthesis.addEventListener("voiceschanged", () => { if (RM.el && !RM.sheet.hidden && RM.sheetKind === "look") rmShowLook(); }); } catch {}
