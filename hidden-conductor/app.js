// One ordinary day, run on predictions.
// The page is readable without this file; it adds the six demonstrations.
// Nothing is sent anywhere. The only thing stored (on this device) is the typing score in stop 6.
(function () {
  "use strict";

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var now = function () { return performance.now(); };
  var mean = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; };
  var sd = function (a) { var m = mean(a); return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1)); };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var guesses = {};   // what the reader predicted, by key
  var results = {};   // what happened, for the recap at the end
  var onGuess = {};   // per-stop hooks fired when a guess is made
  var live = $("#live");
  function say(t) { live.textContent = ""; setTimeout(function () { live.textContent = t; }, 60); }

  // ---------- Reveals: hidden until earned (or skipped) ----------
  $$(".reveal").forEach(function (r) { r.hidden = true; });
  function reveal(id) {
    var r = document.getElementById(id);
    if (!r || !r.hidden) return;
    r.hidden = false;
    r.classList.add("shown");
    $$(".said[data-said]", r).forEach(function (p) {
      var g = guesses[p.dataset.said];
      if (g) p.textContent = "You guessed: “" + g + "”.";
    });
    var stop = r.closest(".stop");
    if (stop && r.parentElement.classList.contains("wrap")) {
      var link = $('.rail a[href="#' + stop.id + '"]');
      if (link) link.classList.add("done");
      say("Explanation shown below.");
    }
    recap();
  }
  $$("[data-skip]").forEach(function (b) {
    b.addEventListener("click", function () {
      var stop = b.closest(".stop");
      $$(".mini .reveal", stop).forEach(function (m) { reveal(m.id); });
      reveal(b.dataset.skip);
      b.hidden = true;
    });
  });

  // ---------- Guess buttons ----------
  $$(".guess").forEach(function (g) {
    var key = g.dataset.guess, buttons = $$("button", g);
    buttons.forEach(function (b) {
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        buttons.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        guesses[key] = b.textContent.trim();
        g.classList.remove("nudge");
        if (g.dataset.open) reveal(g.dataset.open);
        if (onGuess[key]) onGuess[key]();
      });
    });
  });

  // A start button pressed before guessing does not go dead: it says what is missing and points at the guesses.
  function needGuess(key, statusEl) {
    if (guesses[key]) return false;
    var g = $('.guess[data-guess="' + key + '"]');
    statusEl.textContent = "Make a guess first: pick one of the answers just above.";
    g.classList.add("nudge");
    $("button", g).focus();
    return true;
  }

  // ---------- Day rail: mark the stop in view ----------
  if ("IntersectionObserver" in window) {
    var railLinks = {};
    $$(".rail ol a").forEach(function (a) { railLinks[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = railLinks[e.target.id];
        if (!a) return;
        if (e.isIntersecting) { a.classList.add("now"); a.setAttribute("aria-current", "true"); }
        else { a.classList.remove("now"); a.removeAttribute("aria-current"); }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$(".stop").forEach(function (s) { io.observe(s); });
  }

  // =====================================================================
  // Stop 1: the shaking line, and the neuron count
  // =====================================================================
  (function () {
    var line = $("#shake-line"), btn = $("#shake-btn"), note = $("#shake-note"), status = $("#shake-status"), timer = null;
    if (reduce.matches) note.hidden = false;
    onGuess.shake = function () { status.textContent = ""; };
    function stop() {
      clearTimeout(timer); timer = null;
      line.classList.remove("shaking");
      btn.textContent = "Shake the line again";
      reveal("r1");
    }
    btn.addEventListener("click", function () {
      if (timer) return stop();                      // a second press stops it early
      if (needGuess("shake", status)) return;
      status.textContent = "";
      line.classList.add("shaking");
      btn.textContent = "Stop";
      timer = setTimeout(stop, 5000);
    });

    var grid = $("#neuron-grid"), range = $("#neuron-guess"), out = $("#neuron-out"), dots = [];
    for (var i = 0; i < 100; i++) { var d = el("span"); grid.appendChild(d); dots.push(d); }
    function paint(n, cls) { dots.forEach(function (dd, j) { dd.className = j < n ? cls : ""; }); }
    function sync() { out.textContent = range.value + "%"; if (!results.neuron) paint(+range.value, "guessed"); }
    range.addEventListener("input", sync);
    sync();
    $("#neuron-show").addEventListener("click", function () {
      var g = +range.value;
      results.neuron = g;
      paint(80, "cb");
      var off = Math.abs(g - 80);
      $("#neuron-said").textContent = "You guessed " + g + "%. The count is about 80%" +
        (off <= 5 ? ", so you were right." : g < 80 ? ", so the real share is far larger than its size suggests." : ".");
      reveal("r1b");
      recap();
    });
  })();

  // =====================================================================
  // Stop 2: tap with a beat, then keep going without it
  // =====================================================================
  (function () {
    var BEAT = 600, PACED = 12, NEED = 20;
    var start = $("#tap-start"), pad = $("#tap-pad"), pulse = $("#tap-pulse"), label = $("#tap-label");
    var bar = $("#tap-bar"), status = $("#tap-status"), box = $("#tap-result"), sound = $("#tap-sound");
    var run = null, timers = [];
    onGuess.tap = function () { if (!run) status.textContent = ""; };

    function flash(cls) {
      pulse.classList.remove("beat", "mine");
      void pulse.offsetWidth;                       // restart the animation
      pulse.classList.add(cls);
      setTimeout(function () { pulse.classList.remove(cls); }, 200);
    }
    function click(ctx, when) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.3, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
      o.connect(g); g.connect(ctx.destination);
      o.start(when); o.stop(when + 0.08);
    }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    start.addEventListener("click", function () {
      if (needGuess("tap", status)) return;
      var lead = 800, ctx = null, AC = window.AudioContext || window.webkitAudioContext;
      if (sound.checked && AC) { try { ctx = new AC(); } catch (e) { ctx = null; } }
      var t0 = now() + lead;
      run = { pacedEnd: t0 + (PACED - 1) * BEAT, cont: [], done: false, ctx: ctx };
      for (var i = 0; i < PACED; i++) {
        if (ctx) click(ctx, ctx.currentTime + (lead + i * BEAT) / 1000);
        later(function () { flash("beat"); }, lead + i * BEAT);
      }
      later(function () { status.textContent = "The beat has stopped. Keep tapping at the same pace."; label.textContent = "Keep going"; }, lead + (PACED - 1) * BEAT + BEAT / 2);
      later(finish, lead + (PACED - 1) * BEAT + 24000);
      start.disabled = true; pad.disabled = false; box.hidden = true;
      bar.style.transform = "scaleX(0)";
      status.textContent = "Tap along with the beat.";
      label.textContent = "Tap here, or press the space bar";
      pad.focus();
    });

    function tap(t) {
      if (!run || run.done) return;
      flash("mine");
      if (t <= run.pacedEnd + BEAT / 2) return;       // still in the paced part
      run.cont.push(t);
      bar.style.transform = "scaleX(" + clamp((run.cont.length - 1) / NEED, 0, 1) + ")";
      if (run.cont.length >= NEED + 1) finish();
    }
    pad.addEventListener("pointerdown", function (e) { e.preventDefault(); tap(now()); });
    document.addEventListener("keydown", function (e) {
      if (!run || run.done || e.repeat) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); tap(now()); }
    });

    function finish() {
      if (!run || run.done) return;
      run.done = true;
      timers.forEach(clearTimeout); timers = [];
      if (run.ctx && run.ctx.close) { try { run.ctx.close(); } catch (e) { /* ignore */ } }
      pad.disabled = true;
      var gaps = [];
      for (var i = 1; i < run.cont.length; i++) gaps.push(run.cont[i] - run.cont[i - 1]);
      gaps = gaps.filter(function (g) { return g > 300 && g < 1000; });   // drop double taps and long pauses
      run = null; start.disabled = false; start.textContent = "Try again";
      if (gaps.length < 8) {
        status.textContent = "Too few steady taps to draw anything. Try again, and keep tapping after the beat stops.";
        return;
      }
      var m = mean(gaps), s = sd(gaps);
      results.tap = { mean: Math.round(m), sd: Math.round(s) };
      status.textContent = "Done.";
      draw(gaps, m, s);
      reveal("r2");
    }

    function draw(gaps, m, s) {
      var W = 600, H = 132, x = function (ms) { return 40 + (clamp(ms, 400, 800) - 400) / 400 * 520; };
      var g = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Each dot is one gap between your taps after the beat stopped." });
      g.appendChild(svg("rect", { class: "chart-band", x: x(m - s), y: 34, width: Math.max(2, x(m + s) - x(m - s)), height: 56, rx: 6 }));
      g.appendChild(svg("line", { class: "chart-axis", x1: 40, y1: 100, x2: 560, y2: 100 }));
      [400, 500, 600, 700, 800].forEach(function (t) {
        g.appendChild(svg("line", { class: "chart-axis", x1: x(t), y1: 100, x2: x(t), y2: 105 }));
        g.appendChild(svg("text", { class: "chart-text", x: x(t), y: 120, "text-anchor": "middle" }, (t / 1000).toFixed(1) + " s"));
      });
      g.appendChild(svg("line", { class: "chart-grid", x1: x(BEAT), y1: 22, x2: x(BEAT), y2: 100, "stroke-dasharray": "3 4" }));
      g.appendChild(svg("text", { class: "chart-text", x: x(BEAT), y: 14, "text-anchor": "middle" }, "the beat"));
      gaps.forEach(function (v, i) { g.appendChild(svg("circle", { class: "chart-dot", cx: x(v), cy: 62 + ((i % 5) - 2) * 9, r: 5, opacity: 0.8 })); });
      g.appendChild(svg("line", { class: "chart-mark", x1: x(m), y1: 30, x2: x(m), y2: 94 }));
      box.textContent = "";
      box.appendChild(g);
      var drift = m - BEAT;
      var d = Math.abs(drift) < 15 ? "On average you held the pace"
        : drift < 0 ? "On average you sped up a little" : "On average you slowed down a little";
      box.appendChild(el("p", "big", d + ": " + Math.round(m) + " ms a gap, against the beat’s 600."));
      box.appendChild(el("p", null, "Your gaps varied by about ±" + Math.round(s) + " ms around your own average. The orange line is your average and the shaded band is that spread."));
      box.hidden = false;
    }
  })();

  // =====================================================================
  // Stop 3: a dot that follows your movement after a delay
  // =====================================================================
  (function () {
    var pad = $("#delay-pad"), dot = $("#delay-dot"), label = $("#delay-label"), bar = $("#delay-bar");
    var status = $("#delay-status"), rate = $("#delay-rate"), box = $("#delay-result");
    var NEEDED = 4000;
    var order = [0].concat([120, 250, 500].sort(function () { return Math.random() - 0.5; }));
    var S = { round: -1, buf: [], pos: null, moved: 0, lastMove: 0, lastFrame: 0, active: false, ratings: {} };

    onGuess.delay = function () { if (S.round < 0) next(); };

    function next() {
      S.round++;
      if (S.round >= order.length) return finish();
      S.buf = []; S.pos = null; S.moved = 0; S.active = true; S.lastFrame = now();
      rate.hidden = true; pad.classList.remove("live");
      bar.style.transform = "scaleX(0)";
      label.hidden = false;
      label.textContent = "Round " + (S.round + 1) + " of 4: move inside this box";
      status.textContent = "Round " + (S.round + 1) + " of 4. Keep moving for a few seconds.";
      requestAnimationFrame(frame);
    }
    function push(x, y) {
      var t = now();
      S.pos = { x: x, y: y };
      S.buf.push({ t: t, x: x, y: y });
      S.lastMove = t;
      if (!pad.classList.contains("live")) { pad.classList.add("live"); label.hidden = true; }
    }
    function local(e) {
      var r = pad.getBoundingClientRect();
      return { x: clamp(e.clientX - r.left, 11, r.width - 11), y: clamp(e.clientY - r.top, 11, r.height - 11) };
    }
    pad.addEventListener("pointerdown", function (e) {
      if (!S.active) return;
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      var p = local(e); push(p.x, p.y);
    });
    pad.addEventListener("pointermove", function (e) {
      if (!S.active) return;
      var p = local(e); push(p.x, p.y);
    });
    pad.addEventListener("keydown", function (e) {
      var step = { ArrowLeft: [-18, 0], ArrowRight: [18, 0], ArrowUp: [0, -18], ArrowDown: [0, 18] }[e.key];
      if (!step || !S.active) return;
      e.preventDefault();
      var r = pad.getBoundingClientRect(), p = S.pos || { x: r.width / 2, y: r.height / 2 };
      push(clamp(p.x + step[0], 11, r.width - 11), clamp(p.y + step[1], 11, r.height - 11));
    });

    function frame(t) {
      if (!S.active) return;
      var dt = t - S.lastFrame; S.lastFrame = t;
      if (t - S.lastMove < 160 && dt < 200) S.moved += dt;
      var want = t - order[S.round], shown = null;
      for (var i = S.buf.length - 1; i >= 0; i--) { if (S.buf[i].t <= want) { shown = S.buf[i]; break; } }
      if (shown) dot.style.transform = "translate(" + shown.x + "px," + shown.y + "px)";
      while (S.buf.length > 2 && S.buf[1].t < want) S.buf.shift();
      bar.style.transform = "scaleX(" + clamp(S.moved / NEEDED, 0, 1) + ")";
      if (S.moved >= NEEDED && rate.hidden) {
        rate.hidden = false;
        status.textContent = "How much did the dot feel like your own movement? You can keep moving while you decide.";
      }
      requestAnimationFrame(frame);
    }
    $$("button", rate).forEach(function (b) {
      b.addEventListener("click", function () {
        if (!S.active) return;
        S.ratings[order[S.round]] = +b.dataset.v;
        S.active = false;
        next();
      });
    });

    function finish() {
      rate.hidden = true; pad.classList.remove("live");
      label.hidden = false; label.textContent = "Done";
      status.textContent = "";
      var names = { 0: "no delay", 120: "0.12 s", 250: "0.25 s", 500: "0.5 s" };
      var bars = el("div", "bars");
      bars.setAttribute("role", "img");
      bars.setAttribute("aria-label", "Your ratings, from no delay to half a second: " + [0, 120, 250, 500].map(function (d) { return S.ratings[d]; }).join(", ") + " out of 5.");
      [0, 120, 250, 500].forEach(function (d) {
        var col = el("div"), b = el("i");
        b.style.height = (S.ratings[d] / 5 * 100) + "%";
        col.appendChild(b); col.appendChild(el("span", null, names[d]));
        bars.appendChild(col);
      });
      box.textContent = "";
      box.appendChild(bars);
      box.appendChild(el("p", "big", "With no delay you rated the dot " + S.ratings[0] + " out of 5 as your own. At half a second: " + S.ratings[500] + " out of 5."));
      box.hidden = false;
      results.delay = { zero: S.ratings[0], half: S.ratings[500] };
      reveal("r3");
    }
  })();

  // =====================================================================
  // Stop 4: reaching while the dot veers 30 degrees
  // =====================================================================
  (function () {
    var BASE = 6, ROT = 18, WASH = 6, TOTAL = BASE + ROT + WASH, ANGLE = 30;
    var pad = $("#reach-pad"), ring = $("#reach-ring"), home = $("#reach-home"), dot = $("#reach-dot");
    var q1 = $("#reach-q1"), q2 = $("#reach-q2"), bar = $("#reach-bar"), status = $("#reach-status"), box = $("#reach-result");
    var R = { i: 0, errs: [], state: "idle", press: null, init: null, asked1: false, asked2: false, g: null, target: 0 };

    function place(e, x, y) { e.style.transform = "translate(" + x + "px," + y + "px)"; }
    function wrap(a) { return ((a + 540) % 360) - 180; }
    function setup() {
      var W = pad.clientWidth;
      R.g = { W: W, hx: W * 0.5, hy: W * 0.8, D: W * 0.5 };
      R.target = [-25, 0, 25][Math.floor(Math.random() * 3)];
      var a = R.target * Math.PI / 180;
      place(ring, R.g.hx + R.g.D * Math.sin(a), R.g.hy - R.g.D * Math.cos(a));
      place(home, R.g.hx, R.g.hy);
      place(dot, R.g.hx, R.g.hy);
      ring.classList.remove("hit");
      R.init = null; R.state = "ready";
    }
    function local(e) { var r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    pad.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".ask") || R.state !== "ready") return;
      var p = local(e);
      if (Math.hypot(p.x - R.g.hx, p.y - R.g.hy) > R.g.W * 0.2) {
        status.textContent = "Start each reach by pressing on the grey circle.";
        return;
      }
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      R.press = p; R.state = "moving"; pad.classList.add("dragging");
    });
    pad.addEventListener("pointermove", function (e) {
      if (R.state !== "moving") return;
      var p = local(e), dx = p.x - R.press.x, dy = p.y - R.press.y;
      var th = (R.i >= BASE && R.i < BASE + ROT ? ANGLE : 0) * Math.PI / 180;
      var rx = dx * Math.cos(th) - dy * Math.sin(th), ry = dx * Math.sin(th) + dy * Math.cos(th);   // clockwise on screen
      var dist = Math.hypot(rx, ry), ang = Math.atan2(rx, -ry) * 180 / Math.PI;
      place(dot, R.g.hx + rx, R.g.hy + ry);
      if (R.init === null && dist >= R.g.D * 0.3) R.init = wrap(ang - R.target);
      if (dist >= R.g.D) done(wrap(ang - R.target));
    });
    function release() {
      if (R.state !== "moving") return;
      R.state = "ready"; pad.classList.remove("dragging");
      place(dot, R.g.hx, R.g.hy);
    }
    pad.addEventListener("pointerup", release);
    pad.addEventListener("pointercancel", release);

    function done(finalErr) {
      R.state = "shown"; pad.classList.remove("dragging");
      R.errs.push(R.init === null ? finalErr : R.init);
      if (Math.abs(finalErr) <= 10) ring.classList.add("hit");
      R.i++;
      bar.style.transform = "scaleX(" + (R.i / TOTAL) + ")";
      setTimeout(advance, 520);
    }
    function advance() {
      if (R.i === BASE && !R.asked1) { R.state = "asking"; q1.hidden = false; $("button", q1).focus(); return; }
      if (R.i === BASE + ROT && !R.asked2) { R.state = "asking"; q2.hidden = false; $("button", q2).focus(); return; }
      if (R.i >= TOTAL) return finish();
      setup();
      status.textContent = "Reach " + (R.i + 1) + " of " + TOTAL + ".";
    }
    onGuess.reach1 = function () { if (R.asked1) return; R.asked1 = true; setTimeout(function () { q1.hidden = true; advance(); }, 350); };
    onGuess.reach2 = function () { if (R.asked2) return; R.asked2 = true; setTimeout(function () { q2.hidden = true; advance(); }, 350); };

    function finish() {
      R.state = "finished";
      status.textContent = "Done.";
      var e = R.errs, base = mean(e.slice(0, BASE));
      var first = e[BASE] - base, late = mean(e.slice(BASE + ROT - 5, BASE + ROT)) - base, after = e[BASE + ROT] - base;
      results.reach = { first: Math.round(Math.abs(first)), late: Math.round(Math.abs(late)), after: Math.round(after) };

      var W = 600, H = 250, x = function (i) { return 44 + i * (540 / (TOTAL - 1)); }, y = function (v) { return 125 - clamp(v, -50, 50) * 2; };
      var g = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "How far off target each of your 30 reaches started, in degrees." });
      g.appendChild(svg("rect", { class: "chart-band", x: x(BASE - 0.5), y: 22, width: x(BASE + ROT - 0.5) - x(BASE - 0.5), height: 206 }));
      [-30, 0, 30].forEach(function (v) {
        g.appendChild(svg("line", { class: v ? "chart-grid" : "chart-axis", x1: 44, y1: y(v), x2: 584, y2: y(v) }));
        g.appendChild(svg("text", { class: "chart-text", x: 38, y: y(v) + 4, "text-anchor": "end" }, (v > 0 ? "+" : "") + v + "°"));
      });
      g.appendChild(svg("text", { class: "chart-text", x: x((BASE - 1) / 2), y: 16, "text-anchor": "middle" }, "normal"));
      g.appendChild(svg("text", { class: "chart-text", x: x(BASE + (ROT - 1) / 2), y: 16, "text-anchor": "middle" }, "dot veers 30°"));
      g.appendChild(svg("text", { class: "chart-text", x: x(BASE + ROT + (WASH - 1) / 2), y: 16, "text-anchor": "middle" }, "normal again"));
      g.appendChild(svg("text", { class: "chart-text", x: 314, y: 246, "text-anchor": "middle" }, "reach 1 to 30"));
      e.forEach(function (v, i) { g.appendChild(svg("circle", { class: "chart-dot", cx: x(i), cy: y(v - base), r: 5 })); });
      box.textContent = "";
      box.appendChild(g);
      box.appendChild(el("p", "big", "The veer first pulled you " + Math.round(Math.abs(first)) + "° off. By the end of it you were " + Math.round(Math.abs(late)) + "° off."));
      var tail = after <= -6 ? "When it was switched off, your next reach missed by " + Math.round(-after) + "° to the other side."
        : after >= 6 ? "When it was switched off, your next reach still missed by " + Math.round(after) + "° to the same side."
        : "When it was switched off, your next reach was close to straight. Many people miss to the other side at that point; not everyone does.";
      box.appendChild(el("p", null, tail + " Each dot is one reach; zero is on target."));
      box.hidden = false;
      reveal("r4");
    }

    setup();
    window.addEventListener("resize", function () { if (R.state === "ready") setup(); });
  })();

  // =====================================================================
  // Stop 5: four things to say aloud
  // =====================================================================
  (function () {
    var scanBtn = $("#scan-btn"), spans = $$("#scan-line span");
    scanBtn.addEventListener("click", function () {
      scanBtn.disabled = true;
      var i = 0;
      (function step() {
        spans.forEach(function (s, j) { s.classList.toggle("on", j === i); });
        if (i++ < spans.length) setTimeout(step, 400);
        else { scanBtn.disabled = false; scanBtn.textContent = "Pace me again"; reveal("m2"); }
      })();
    });

    var said = $$("#prosody button");
    said.forEach(function (b) {
      b.addEventListener("click", function () {
        b.setAttribute("aria-pressed", "true");
        if (said.every(function (x) { return x.getAttribute("aria-pressed") === "true"; })) reveal("m3");
      });
    });

    $("#cat-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("#cat-word"), w = input.value.trim().toLowerCase();
      if (!w) { input.focus(); return; }
      results.cat = w;
      $("#cat-said").textContent = w === "mat" ? "Mat. The book bet on exactly that."
        : "You said “" + w + "”. The book’s bet was “mat”.";
      reveal("m4");
      reveal("r5");
    });
  })();

  // =====================================================================
  // Stop 6: the typing sequence, remembered until tomorrow
  // =====================================================================
  (function () {
    var SEQ = [4, 1, 3, 2, 4], SECONDS = 30, KEY = "hc-sequence-runs";
    var start = $("#seq-start"), show = $("#seq-show"), cells = $$("span", show), keys = $$("#seq-keys button");
    var bar = $("#seq-bar"), status = $("#seq-status"), box = $("#seq-result"), back = $("#seq-back");
    var S = { running: false, idx: 0, count: 0, buf: [], t0: 0 };

    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
    function save(runs) { try { localStorage.setItem(KEY, JSON.stringify(runs.slice(-10))); return true; } catch (e) { return false; } }
    function day(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
    function nice(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }); }
    var today = day(new Date());
    var prior = load().filter(function (r) { return r.d < today; }).pop() || null;

    if (prior) {
      back.hidden = false;
      back.textContent = "Welcome back. On " + nice(prior.d) + " you typed " + prior.n + " complete sequences in 30 seconds. Run it once now, without warming up.";
    }
    onGuess.seq = function () { if (!S.running) status.textContent = ""; };

    // Scoring: a sequence counts whenever the last five keys are 4-1-3-2-4. After a slip the reader
    // can simply carry on; the highlighted digit shows which key the page expects next.
    function expected() {
      for (var n = Math.min(S.buf.length, SEQ.length - 1); n > 0; n--) {
        var ok = true;
        for (var j = 0; j < n; j++) if (S.buf[S.buf.length - n + j] !== SEQ[j]) { ok = false; break; }
        if (ok) return n;
      }
      return 0;
    }
    function mark() { cells.forEach(function (c, i) { c.classList.toggle("on", S.running && i === S.idx); }); }
    function press(k) {
      if (!S.running) return;
      var was = S.idx;
      S.buf.push(k);
      if (S.buf.length > SEQ.length) S.buf.shift();
      if (S.buf.length === SEQ.length && S.buf.every(function (v, i) { return v === SEQ[i]; })) {
        S.count++; S.buf = []; S.idx = 0;
        status.textContent = S.count + " so far.";
      } else {
        S.idx = expected();
        if (S.idx !== was + 1) {
          show.classList.add("err");
          setTimeout(function () { show.classList.remove("err"); }, 160);
        }
      }
      mark();
    }
    keys.forEach(function (b) {
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); press(+b.dataset.k); });
      b.addEventListener("click", function (e) { if (e.detail === 0) press(+b.dataset.k); });   // keyboard activation
    });
    document.addEventListener("keydown", function (e) {
      if (!S.running || e.repeat) return;
      if (e.key >= "1" && e.key <= "4") { e.preventDefault(); press(+e.key); }
    });

    start.addEventListener("click", function () {
      if (!prior && needGuess("seq", status)) return;
      start.disabled = true; box.hidden = true;
      var n = 3;
      (function count() {
        if (n > 0) { status.textContent = "Starting in " + n + "…"; n--; setTimeout(count, 800); return; }
        S.running = true; S.idx = 0; S.count = 0; S.buf = []; S.t0 = now();
        keys.forEach(function (b) { b.disabled = false; });
        status.textContent = "Go: 4 1 3 2 4, over and over.";
        mark();
        requestAnimationFrame(tick);
      })();
    });
    function tick(t) {
      if (!S.running) return;
      var f = (t - S.t0) / (SECONDS * 1000);
      bar.style.transform = "scaleX(" + clamp(f, 0, 1) + ")";
      if (f >= 1) return end();
      requestAnimationFrame(tick);
    }
    function end() {
      S.running = false;
      keys.forEach(function (b) { b.disabled = true; });
      mark();
      status.textContent = "Time.";
      var runs = load();
      runs.push({ d: today, t: Date.now(), n: S.count });
      var saved = save(runs);
      results.seq = S.count;
      box.textContent = "";
      box.appendChild(el("p", "big", S.count + " complete sequence" + (S.count === 1 ? "" : "s") + " in 30 seconds."));
      if (prior && prior.n > 0) {
        var pct = Math.round((S.count - prior.n) / prior.n * 100);
        box.appendChild(el("p", null, "Last time: " + prior.n + ". " +
          (pct === 0 ? "Exactly the same." : "That is " + Math.abs(pct) + "% " + (pct > 0 ? "faster" : "slower") + " after at least one night.") +
          " One person and one night: a souvenir, not a result."));
      } else {
        box.appendChild(el("p", null, saved
          ? "Saved on this device only. Come back tomorrow, run it once before anything else, and compare."
          : "This browser would not let the page save the number, so note it down if you want to compare tomorrow."));
      }
      box.hidden = false;
      start.disabled = false; start.textContent = "Run it again";
      reveal("r6");
      recap();
    }
  })();

  // ---------- Recap at the end ----------
  function recap() {
    var items = [];
    if (results.neuron != null) items.push("Guessed that " + results.neuron + "% of your neurons sit in the cerebellum; the count is about 80%.");
    if (results.tap) items.push("Kept the beat at " + results.tap.mean + " ms a gap against a target of 600, give or take " + results.tap.sd + " ms.");
    if (results.delay) items.push("Rated the dot " + results.delay.zero + " out of 5 as your own with no delay, and " + results.delay.half + " out of 5 at half a second.");
    if (results.reach) items.push("Started " + results.reach.first + "° off when the dot veered, and ended " + results.reach.late + "° off.");
    if (results.cat) items.push("Finished the sentence with “" + results.cat + "”.");
    if (results.seq != null) items.push("Typed " + results.seq + " sequences in 30 seconds.");
    var list = $("#recap-list");
    list.textContent = "";
    items.forEach(function (t) { list.appendChild(el("li", null, t)); });
    $("#recap").hidden = items.length === 0;
  }
})();
