// The Loop Line: a first-person walk through the cerebellum, drawn on a plain canvas.
// No libraries, no backend. All book text is loaded from data/concepts.json and data/world.json;
// the only strings in this file are interface labels, each marked [NOT IN SOURCE].
(function () {
  "use strict";

  var SAVE_KEY = "loop-line-save-v1";
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var world, zones = {}, cards = {}, people = {}, cardHome = {};
  var S = null;                 // saved state
  var Z = null;                 // current zone (parsed)
  var keys = {};                // held movement keys
  var modal = null;             // "dialog" | "mini" | "notebook" | "title" | null
  var race = null;              // running race on the Motor line
  var showMap = true;

  // ------------------------------------------------------------------ loading
  Promise.all([fetch("data/world.json"), fetch("data/concepts.json")])
    .then(function (r) { if (!r[0].ok || !r[1].ok) throw new Error("load"); return Promise.all([r[0].json(), r[1].json()]); })
    .then(function (d) { boot(d[0], d[1]); })
    .catch(function () { $("load-error").hidden = false; $("start").disabled = true; });

  function boot(w, content) {
    world = w;
    content.concepts.forEach(function (c) { cards[c.id] = c; });
    content.npcs.forEach(function (n) { people[n.id] = n; });
    world.zones.forEach(function (z) { zones[z.id] = parseZone(z); });
    Object.keys(zones).forEach(function (id) {
      zones[id].things.forEach(function (t) { (t.cards || []).forEach(function (c) { cardHome[c] = id; }); });
    });
    S = load();
    var ui = world.ui;
    $("title-h").textContent = ui.title;
    $("title-sub").textContent = ui.subtitle;
    ui.intro.forEach(function (p) { var e = document.createElement("p"); e.textContent = p; $("title-intro").appendChild(e); });
    $("title-disclaimer").textContent = ui.disclaimer;
    $("title-controls").textContent = ui.controls;
    // [NOT IN SOURCE] interface labels
    $("start").textContent = S ? "Continue" : "Start";
    $("reset").hidden = !S;
    modal = "title";
    if (!S) S = fresh();
    enter(S.zone, [S.x, S.y, S.a], true);
    bind();
    resize();
    requestAnimationFrame(frame);
    window.__loopline = { state: S, zones: zones, teleport: function (z, x, y, a) { enter(z, [x, y, a]); }, act: act, cards: cards };
  }

  function fresh() {
    var z = zones[world.start];
    return { zone: world.start, x: z.start[0], y: z.start[1], a: z.start[2] * Math.PI / 180, cards: {}, done: {}, met: {}, finished: false };
  }
  function load() { try { var s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && zones[s.zone] ? s : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: play on without saving */ } }

  function parseZone(z) {
    var things = [];
    z.grid.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var ch = row[x];
        if (ch === "#" || ch === "%" || ch === ".") continue;
        var def = z.things[ch], t = {};
        for (var k in def) t[k] = def[k];
        t.ch = ch; t.x = x + 0.5; t.y = y + 0.5; t.key = z.id + "." + ch; t.seed = x * 7 + y * 13;
        if (!t.sign && t.params && t.params.sign) t.sign = t.params.sign;
        things.push(t);
      }
    });
    return { id: z.id, name: z.name, kind: z.kind, grid: z.grid, w: z.grid[0].length, h: z.grid.length, things: things,
             palette: z.palette, trees: z.trees || "steady", start: z.start || [1.5, 1.5, 0] };
  }
  function solid(x, y) {
    var r = Z.grid[Math.floor(y)];
    if (!r) return true;
    var c = r[Math.floor(x)];
    return c === undefined || c === "#" || c === "%";
  }

  // ------------------------------------------------------------------ progress
  function has(id) { return !!S.cards[id]; }
  function zoneCards(id) {
    var out = [];
    zones[id].things.forEach(function (t) { if (t.kind !== "finale") (t.cards || []).forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); }); });
    return out;
  }
  function zoneDone(id) { return zoneCards(id).every(has); }
  function stamps() { return world.lines.filter(zoneDone).length; }
  function allDone() { return Object.keys(zones).every(zoneDone); }
  function total() { return Object.keys(cards).length; }
  function owned() { return Object.keys(S.cards).length; }
  function hud() {
    $("zone-name").textContent = Z.name;
    // [NOT IN SOURCE] interface labels
    $("progress").textContent = owned() + " of " + total() + " cards · " + stamps() + " of " + world.lines.length + " lines closed";
  }

  function enter(id, at, quiet) {
    Z = zones[id];
    S.zone = id; S.x = at[0]; S.y = at[1]; S.a = at[2] * Math.PI / 180;
    if (quiet) S.a = at[2];                       // restoring a save: the angle is already in radians
    race = null; $("timer").hidden = true;
    hud(); save();
  }

  // ------------------------------------------------------------------ input
  var KEYMAP = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
  function bind() {
    document.addEventListener("keydown", function (e) {
      if (modal === "dialog") { if (e.key === "Enter" || e.key === " " || e.key === "e" || e.key === "E") { e.preventDefault(); $("dialog-next").click(); } return; }
      if (modal === "notebook") { if (e.key === "Escape" || e.key === "n" || e.key === "N") closeNotebook(); return; }
      if (modal === "title") { if (e.key === "Enter") $("start").click(); return; }
      if (modal === "mini") { if (e.key === "Escape") $("mini-leave").click(); else if (miniKey) miniKey(e); return; }
      if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = true; e.preventDefault(); }
      else if (e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); }
      else if (e.key === "n" || e.key === "N") openNotebook();
      else if (e.key === "m" || e.key === "M") toggleMap();
    });
    document.addEventListener("keyup", function (e) { if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false; });
    Array.prototype.forEach.call(document.querySelectorAll("#touch button"), function (b) {
      var k = b.dataset.key;
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); keys[k] = true; });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { b.addEventListener(ev, function () { keys[k] = false; }); });
    });
    $("act").addEventListener("click", function () { if (!modal) act(); });
    $("start").addEventListener("click", function () { $("title").hidden = true; modal = null; $("view").focus(); });
    $("reset").addEventListener("click", function () {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      S = fresh(); window.__loopline.state = S; enter(S.zone, zones[S.zone].start);
      $("reset").hidden = true; $("start").textContent = "Start";
    });
    $("btn-notebook").addEventListener("click", function () { if (!modal) openNotebook(); else if (modal === "notebook") closeNotebook(); });
    $("btn-map").addEventListener("click", toggleMap);
    $("btn-help").addEventListener("click", function () { if (!modal) { $("title").hidden = false; modal = "title"; $("start").textContent = "Continue"; } });
    $("notebook-close").addEventListener("click", closeNotebook);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", function () { keys = {}; });
  }
  function toggleMap() { showMap = !showMap; $("map").hidden = !showMap; }

  var view = $("view"), ctx = view.getContext("2d"), W = 640, H = 400, zbuf = [];
  function resize() {
    var r = $("stage").getBoundingClientRect();
    var portrait = r.height > r.width;
    W = portrait ? 420 : 640;
    H = Math.max(240, Math.round(W * r.height / Math.max(1, r.width)));
    view.width = W; view.height = H;
  }

  // ------------------------------------------------------------------ toast and prompt
  var toastTimer = null;
  function toast(text, ms) {
    $("toast").textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toast").textContent = ""; }, ms || 3200);
  }

  // ------------------------------------------------------------------ interaction
  function target() {
    var best = null, bd = 1.45;
    Z.things.forEach(function (t) {
      if (t.kind === "deco" || t.kind === "trigger") return;
      var dx = t.x - S.x, dy = t.y - S.y, d = Math.hypot(dx, dy);
      if (d > bd) return;
      var diff = Math.atan2(dy, dx) - S.a;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 0.9 || d < 0.6) { best = t; bd = d; }
    });
    return best;
  }
  function unlocked(t) {
    var q = t.requires;
    if (!q) return true;
    if (q.done && !q.done.every(function (k) { return S.done[k]; })) return false;
    if (q.stamps && stamps() < q.stamps) return false;
    if (q.zones && !q.zones.every(zoneDone)) return false;
    return true;
  }
  function act(ch) {
    var t = ch ? Z.things.filter(function (x) { return x.ch === ch; })[0] : target();
    if (!t || modal && modal !== null && !ch) return;
    if (t.kind === "door") {
      if (!unlocked(t)) { toast(t.lockedText); return; }
      enter(t.to, t.at);
    } else if (t.kind === "plaque") {
      S.done[t.key] = true; award(t.cards, []);
    } else if (t.kind === "npc") {
      var p = people[t.npc], pages = [];
      if (!S.met[t.npc]) pages.push({ kind: "person", title: p.name, note: p.disclosure });
      p.lines.forEach(function (l) { pages.push({ kind: "person", title: p.name, text: l.text, source: l.origin === "book" ? l._source_note : "" }); });
      S.met[t.npc] = true; S.done[t.key] = true;
      award(t.cards, pages);
    } else if (t.kind === "device") {
      if (t.game === "race") startRace(t); else runMini(t);
    } else if (t.kind === "finale") {
      if (!allDone()) { toast(t.lockedText); return; }
      var end = world.ui.ending.map(function (line) { return { kind: "person", title: world.ui.title, text: line }; });
      S.finished = true; S.done[t.key] = true;
      award(t.cards, end);
    }
  }
  function award(ids, pages) {
    var before = zoneDone(Z.id), stampsBefore = stamps();
    (ids || []).forEach(function (id) {
      if (has(id)) return;
      S.cards[id] = true;
      var c = cards[id];
      // [NOT IN SOURCE] "Added to your notebook" is an interface label
      pages.push({ kind: c.type, title: c.title, text: c.text, source: c._source_note + " · Added to your notebook" });
    });
    save(); hud();
    showPages(pages, function () {
      if (!before && zoneDone(Z.id)) toast(stamps() > stampsBefore ? world.ui.stamp + ": " + Z.name : world.ui.zoneDone);
    });
  }

  // ------------------------------------------------------------------ dialog pages
  var queue = [], afterPages = null;
  function showPages(pages, done) {
    if (!pages.length) { if (done) done(); return; }
    queue = pages.slice(); afterPages = done || null;
    modal = "dialog"; keys = {};
    $("dialog").hidden = false;
    nextPage();
    $("dialog-next").focus();
  }
  function nextPage() {
    var p = queue.shift();
    if (!p) { $("dialog").hidden = true; modal = null; var f = afterPages; afterPages = null; if (f) f(); return; }
    var kind = $("dialog-kind");
    kind.className = "badge t-" + p.kind;
    kind.textContent = p.kind === "person" ? "" : world.ui.types[p.kind];
    kind.hidden = p.kind === "person";
    $("dialog-title").textContent = p.title;
    $("dialog-note").textContent = p.note || ""; $("dialog-note").hidden = !p.note;
    $("dialog-text").textContent = p.text || ""; $("dialog-text").hidden = !p.text;
    $("dialog-text").style.borderLeftColor = p.kind === "mechanism" ? "var(--mech)" : p.kind === "hypothesis" ? "var(--hypo)" : p.kind === "open_question" ? "var(--open)" : "var(--line)";
    $("dialog-source").textContent = p.source || ""; $("dialog-source").hidden = !p.source;
  }
  $("dialog-next").addEventListener("click", nextPage);

  // ------------------------------------------------------------------ notebook
  function openNotebook() {
    var list = $("notebook-list");
    list.textContent = "";
    // [NOT IN SOURCE] interface labels
    $("notebook-count").textContent = owned() + " of " + total() + " cards. " + stamps() + " of " + world.lines.length + " lines closed.";
    ["mechanism", "hypothesis", "open_question"].forEach(function (type) {
      var mine = Object.keys(S.cards).map(function (id) { return cards[id]; }).filter(function (c) { return c && c.type === type; });
      if (!mine.length) return;
      var h = document.createElement("h3"); h.className = "t-" + type; h.textContent = world.ui.types[type] + " (" + mine.length + ")"; list.appendChild(h);
      mine.forEach(function (c) {
        var a = document.createElement("article"); a.className = "t-" + type;
        var t = document.createElement("h4"); t.textContent = c.title;
        var p = document.createElement("p"); p.textContent = c.text;
        var s = document.createElement("p"); s.className = "small"; s.textContent = c._source_note;
        a.appendChild(t); a.appendChild(p); a.appendChild(s); list.appendChild(a);
      });
    });
    if (!owned()) { var e = document.createElement("p"); e.textContent = "Nothing yet."; list.appendChild(e); }
    $("notebook").hidden = false; modal = "notebook"; keys = {};
    $("notebook-close").focus();
  }
  function closeNotebook() { $("notebook").hidden = true; modal = null; }

  // ------------------------------------------------------------------ the race on the Motor line
  function startRace(t) {
    if (S.done[t.key]) { toast(world.ui.zoneDone); return; }
    race = { thing: t, until: performance.now() + t.params.seconds * 1000 };
    $("timer").hidden = false;
    toast(t.text.intro.text, 4500);
  }
  function raceTick(now) {
    if (!race) return;
    var left = (race.until - now) / 1000;
    $("timer").textContent = Math.max(0, left).toFixed(1) + " s";
    var goal = Z.things.filter(function (x) { return x.ch === race.thing.params.goal; })[0];
    if (Math.hypot(goal.x - S.x, goal.y - S.y) < 0.8) {
      var t = race.thing; race = null; $("timer").hidden = true;
      S.done[t.key] = true;
      award(t.cards, [{ kind: "person", title: Z.name, text: t.text.won.text, source: t.text.won._source_note }]);
    } else if (left <= 0) {
      var r = race.thing.params.restart; toast(race.thing.text.lost.text, 4000);
      race = null; $("timer").hidden = true;
      S.x = r[0]; S.y = r[1]; S.a = r[2] * Math.PI / 180;
    }
  }

  // ------------------------------------------------------------------ mini-interactions
  var miniKey = null, miniStop = null;
  function runMini(t) {
    var body = $("mini-body"), status = $("mini-status"), doneBtn = $("mini-done");
    body.textContent = ""; status.textContent = ""; doneBtn.hidden = true;
    $("mini-title").textContent = t.label;
    $("mini-intro").textContent = t.text.intro.text;
    $("mini").hidden = false; modal = "mini"; keys = {}; miniKey = null; miniStop = null;
    function close(success) {
      if (miniStop) miniStop();
      miniKey = null; miniStop = null;
      $("mini").hidden = true; modal = null;
      if (success) { S.done[t.key] = true; award(t.cards, []); }
    }
    function finish() { doneBtn.hidden = false; doneBtn.focus(); }
    doneBtn.onclick = function () { close(true); };
    $("mini-leave").onclick = function () { close(false); };
    function button(label, key) {
      var b = document.createElement("button"); b.type = "button"; b.className = "mini-btn"; b.textContent = label;
      if (key) { var k = document.createElement("kbd"); k.textContent = "key " + key.toUpperCase(); b.appendChild(k); }
      return b;
    }
    function row() { var r = document.createElement("div"); r.className = "mini-row"; body.appendChild(r); return r; }
    function dots(n) { var d = document.createElement("div"); d.className = "dots"; for (var i = 0; i < n; i++) d.appendChild(document.createElement("span")); body.appendChild(d); return d; }
    MINI[t.game](t, { body: body, status: status, finish: finish, button: button, row: row, dots: dots });
    var first = body.querySelector("button"); if (first) first.focus();
  }

  var MINI = {
    // Synapse Bench: the order and spacing of two inputs
    timing_pair: function (t, ui) {
      var r = ui.row(), pf = ui.button(t.text.pf.text, "p"), cf = ui.button(t.text.cf.text, "c");
      r.appendChild(pf); r.appendChild(cf);
      var meter = document.createElement("div"); meter.className = "meter"; var fill = document.createElement("i"); fill.style.width = "100%"; meter.appendChild(fill); ui.body.appendChild(meter);
      var d = ui.dots(2), lastPf = 0, lastCf = 0, did = { weak: false, rev: false }, win = t.params.windowMs;
      function check() { d.children[0].className = did.weak ? "ok" : ""; d.children[1].className = did.rev ? "ok" : ""; if (did.weak && did.rev) ui.finish(); }
      function firePf() {
        var now = performance.now();
        if (lastCf && now - lastCf < 1500) { ui.status.textContent = t.text.nothing.text; did.rev = true; lastCf = 0; lastPf = 0; check(); return; }
        lastPf = now; ui.status.textContent = "";
      }
      function fireCf() {
        var now = performance.now();
        if (lastPf) {
          var gap = now - lastPf; lastPf = 0;
          if (gap >= win[0] && gap <= win[1]) { ui.status.textContent = t.text.weakened.text; fill.style.width = "45%"; did.weak = true; }
          else ui.status.textContent = t.text.outside.text;
          check(); return;
        }
        lastCf = now; ui.status.textContent = "";
      }
      pf.addEventListener("pointerdown", function (e) { e.preventDefault(); firePf(); }); pf.addEventListener("click", function (e) { if (e.detail === 0) firePf(); });
      cf.addEventListener("pointerdown", function (e) { e.preventDefault(); fireCf(); }); cf.addEventListener("click", function (e) { if (e.detail === 0) fireCf(); });
      miniKey = function (e) { if (e.repeat) return; if (e.key === "p" || e.key === "P") firePf(); if (e.key === "c" || e.key === "C") fireCf(); };
    },

    // Nuclei Gate and the turn gap: press while a moving marker is inside a band
    sweep: function (t, ui) {
      var p = t.params, span = Math.max(1.3, p.band[1] + 0.15);
      var meter = document.createElement("div"); meter.className = "meter";
      var fill = document.createElement("i"), band = document.createElement("i"), mark = document.createElement("i");
      band.className = "band"; mark.className = "mark";
      band.style.left = (p.band[0] / span * 100) + "%"; band.style.width = ((p.band[1] - p.band[0]) / span * 100) + "%";
      meter.appendChild(fill); meter.appendChild(band); meter.appendChild(mark); ui.body.appendChild(meter);
      var d = ui.dots(p.needed), r = ui.row(), b = ui.button(t.label, "space"); r.appendChild(b);
      var t0 = performance.now(), good = 0, raf = 0, locked = false;
      function pos(now) { return ((now - t0) % (p.periodMs * span)) / p.periodMs; }
      function draw(now) {
        var x = pos(now);
        mark.style.left = (x / span * 100) + "%";
        fill.style.width = (p.band[0] >= 1 ? Math.min(1, x) / span * 100 : 0) + "%";
        raf = requestAnimationFrame(draw);
      }
      raf = requestAnimationFrame(draw);
      function press() {
        if (locked) return;
        var x = pos(performance.now());
        if (x < p.band[0]) ui.status.textContent = t.text.early.text;
        else if (x > p.band[1]) ui.status.textContent = t.text.late.text;
        else { ui.status.textContent = t.text.good.text; d.children[good].className = "ok"; good++; if (good >= p.needed) { locked = true; ui.finish(); } }
        t0 = performance.now() + 500;              // short pause, then the next sweep
      }
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); press(); }); b.addEventListener("click", function (e) { if (e.detail === 0) press(); });
      miniKey = function (e) { if (!e.repeat && (e.key === " " || e.key === "Enter")) { e.preventDefault(); press(); } };
      miniStop = function () { cancelAnimationFrame(raf); };
    },

    // Clock Room: learn a fixed gap between a tone and a puff
    interval: function (t, ui) {
      var p = t.params, r = ui.row(), lamp = document.createElement("div"); lamp.className = "lamp";
      var b = ui.button("Close the shutter", "space");   // [NOT IN SOURCE] interface label
      r.appendChild(lamp); r.appendChild(b);
      var d = ui.dots(p.needed), good = 0, timers = [], toneAt = 0, armed = false, over = false, actx = null;
      function beep() {
        try {
          actx = actx || new (window.AudioContext || window.webkitAudioContext)();
          var o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 660; g.gain.value = 0.15;
          o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.08);
        } catch (e) { /* no audio: the lamp still flashes */ }
      }
      function round() {
        if (over) return;
        armed = false; lamp.className = "lamp";
        timers.push(setTimeout(function () {
          toneAt = performance.now(); armed = true; lamp.className = "lamp on"; beep();
          timers.push(setTimeout(function () { lamp.className = "lamp"; }, 120));
          timers.push(setTimeout(function () { if (armed) { armed = false; lamp.className = "lamp puff"; ui.status.textContent = t.text.late.text; timers.push(setTimeout(round, 900)); } }, p.gapMs));
        }, 900 + Math.random() * 900));
      }
      function press() {
        if (!armed || over) return;
        armed = false;
        var dt = performance.now() - toneAt;
        if (dt < p.gapMs - p.windowMs) ui.status.textContent = t.text.early.text + " (" + Math.round(p.gapMs - dt) + " ms)";
        else { ui.status.textContent = t.text.good.text + " (" + Math.round(p.gapMs - dt) + " ms)"; d.children[good].className = "ok"; good++; }
        if (good >= p.needed) { over = true; ui.finish(); return; }
        timers.push(setTimeout(round, 900));
      }
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); press(); }); b.addEventListener("click", function (e) { if (e.detail === 0) press(); });
      miniKey = function (e) { if (!e.repeat && (e.key === " " || e.key === "Enter")) { e.preventDefault(); press(); } };
      miniStop = function () { over = true; timers.forEach(clearTimeout); };
      round();
    },

    // Language branch: the delay between releasing the lips and voicing
    two_step: function (t, ui) {
      var r = ui.row(), rel = ui.button(t.text.release.text, "j"), voi = ui.button(t.text.voice.text, "k");
      r.appendChild(rel); r.appendChild(voi);
      var d = ui.dots(2), tr = 0, tv = 0, heard = {};
      function judge() {
        var gap = tv - tr; tr = 0; tv = 0;
        var word = gap >= t.params.patMs ? "pat" : "bat";
        heard[word] = true;
        ui.status.textContent = "“" + t.text[word].text + "” (" + Math.max(0, Math.round(gap)) + " ms)";
        d.children[0].className = heard.bat ? "ok" : ""; d.children[1].className = heard.pat ? "ok" : "";
        if (heard.bat && heard.pat) ui.finish();
      }
      function release() { tr = performance.now(); if (tv && tr - tv < 400) { tv = tr; judge(); } }
      function voice() { tv = performance.now(); if (tr && tv - tr < 1500) judge(); }
      rel.addEventListener("pointerdown", function (e) { e.preventDefault(); release(); }); rel.addEventListener("click", function (e) { if (e.detail === 0) release(); });
      voi.addEventListener("pointerdown", function (e) { e.preventDefault(); voice(); }); voi.addEventListener("click", function (e) { if (e.detail === 0) voice(); });
      miniKey = function (e) { if (e.repeat) return; if (e.key === "j" || e.key === "J") release(); if (e.key === "k" || e.key === "K") voice(); };
    },

    // Mirror: a footfall that lands at once, then one that lands late
    echo: function (t, ui) {
      var p = t.params, r = ui.row(), b = ui.button(t.text.button.text, "space"), lamp = document.createElement("div"); lamp.className = "lamp";
      r.appendChild(b); r.appendChild(lamp);
      var d = ui.dots(p.rounds * 2), n = 0, busy = false, timers = [];
      function press() {
        if (busy || n >= p.rounds * 2) return;
        busy = true;
        var late = n >= p.rounds;
        timers.push(setTimeout(function () {
          lamp.className = "lamp on";
          ui.status.textContent = late ? t.text.mismatch.text : t.text.match.text;
          d.children[n].className = late ? "bad" : "ok"; n++;
          timers.push(setTimeout(function () { lamp.className = "lamp"; busy = false; if (n >= p.rounds * 2) ui.finish(); }, 350));
        }, late ? p.delayMs : 0));
      }
      b.addEventListener("click", press);
      miniKey = function (e) { if (!e.repeat && (e.key === " " || e.key === "Enter")) { e.preventDefault(); press(); } };
      miniStop = function () { timers.forEach(clearTimeout); };
    },

    // Fading Rows: nothing the player presses changes the rhythm
    futile: function (t, ui) {
      var meter = document.createElement("div"); meter.className = "meter"; var fill = document.createElement("i"); meter.appendChild(fill); ui.body.appendChild(meter);
      var r = ui.row(), b = ui.button(t.text.button.text, "space"); r.appendChild(b);
      var n = 0, timer = setInterval(function () { fill.style.width = (20 + Math.random() * 70) + "%"; }, reduceMotion ? 900 : 230);
      function press() { n++; if (n >= t.params.presses) { ui.status.textContent = t.text.after.text; ui.finish(); } }
      b.addEventListener("click", press);
      miniKey = function (e) { if (!e.repeat && (e.key === " " || e.key === "Enter")) { e.preventDefault(); press(); } };
      miniStop = function () { clearInterval(timer); };
    }
  };

  // ------------------------------------------------------------------ update
  var last = 0, saveClock = 0;
  function update(dt, now) {
    if (modal) return;
    var turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), move = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    S.a += turn * 2.3 * dt;
    if (move) {
      var step = move * 2.7 * dt, nx = S.x + Math.cos(S.a) * step, ny = S.y + Math.sin(S.a) * step, pad = 0.22;
      if (!solid(nx + Math.sign(Math.cos(S.a) * move) * pad, S.y)) S.x = nx;
      if (!solid(S.x, ny + Math.sign(Math.sin(S.a) * move) * pad)) S.y = ny;
    }
    // walk-over triggers (the midline on the Language branch)
    Z.things.forEach(function (t) {
      if (t.kind !== "trigger" || !t.cards || S.done[t.key]) return;
      if (Math.floor(t.x) === Math.floor(S.x) && Math.floor(t.y) === Math.floor(S.y)) {
        Z.things.forEach(function (o) { if (o.ch === t.ch) S.done[o.key] = true; });
        if (t.toast) toast(t.toast.text);
        award(t.cards, []);
      }
    });
    raceTick(now);
    var tg = target();
    // [NOT IN SOURCE] "E ·" is an interface label
    $("prompt").textContent = tg ? "E · " + (tg.kind === "npc" ? "Talk to " + people[tg.npc].name : tg.label) : "";
    saveClock += dt; if (saveClock > 4) { saveClock = 0; save(); }
  }

  // ------------------------------------------------------------------ drawing
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return "rgb(" + Math.round(r * f) + "," + Math.round(g * f) + "," + Math.round(b * f) + ")";
  }
  function render(now) {
    var P = Z.palette, fov = 0.66, dirX = Math.cos(S.a), dirY = Math.sin(S.a), plX = -dirY * fov, plY = dirX * fov;
    var g = ctx.createLinearGradient(0, 0, 0, H / 2); g.addColorStop(0, P.ceil); g.addColorStop(1, "#000");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H / 2);
    g = ctx.createLinearGradient(0, H / 2, 0, H); g.addColorStop(0, "#000"); g.addColorStop(1, P.floor);
    ctx.fillStyle = g; ctx.fillRect(0, H / 2, W, H / 2);

    var STEP = 2;
    for (var x = 0; x < W; x += STEP) {
      var cam = 2 * x / W - 1, rx = dirX + plX * cam, ry = dirY + plY * cam;
      var mx = Math.floor(S.x), my = Math.floor(S.y);
      var ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry), sx, sy, sdx, sdy, side = 0, hit = null;
      if (rx < 0) { sx = -1; sdx = (S.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - S.x) * ddx; }
      if (ry < 0) { sy = -1; sdy = (S.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - S.y) * ddy; }
      for (var i = 0; i < 64 && !hit; i++) {
        if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
        var row = Z.grid[my], c = row && row[mx];
        if (c === undefined || c === "#" || c === "%") hit = c || "#";
      }
      var dist = side === 0 ? sdx - ddx : sdy - ddy;
      if (dist < 0.05) dist = 0.05;
      zbuf[x] = dist; zbuf[x + 1] = dist;
      var hgt = H / dist, wx = side === 0 ? S.y + dist * ry : S.x + dist * rx; wx -= Math.floor(wx);
      var f = (side ? 0.72 : 1) / (1 + dist * dist * 0.035);
      if (wx < 0.035 || wx > 0.965) f *= 0.7;
      ctx.fillStyle = shade(hit === "%" ? P.alt : P.wall, f);
      ctx.fillRect(x, (H - hgt) / 2, STEP, hgt);
    }

    // things, far to near
    var inv = 1 / (plX * dirY - dirX * plY);
    var list = Z.things.filter(function (t) { return t.sprite && t.sprite !== "none"; }).map(function (t) {
      var dx = t.x - S.x, dy = t.y - S.y;
      return { t: t, tx: inv * (dirY * dx - dirX * dy), ty: inv * (-plY * dx + plX * dy) };
    }).filter(function (s) { return s.ty > 0.15; }).sort(function (a, b) { return b.ty - a.ty; });
    list.forEach(function (s) {
      var size = H / s.ty, cx = (W / 2) * (1 + s.tx / s.ty), left = cx - size / 2, top = (H - size) / 2;
      if (left > W || left + size < 0) return;
      ctx.save();
      ctx.beginPath();
      var any = false, x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W - 1, Math.ceil(left + size)), runStart = -1;
      for (var xx = x0; xx <= x1 + 1; xx++) {
        var vis = xx <= x1 && zbuf[xx] > s.ty;
        if (vis && runStart < 0) runStart = xx;
        if (!vis && runStart >= 0) { ctx.rect(runStart, 0, xx - runStart, H); runStart = -1; any = true; }
      }
      if (!any) { ctx.restore(); return; }
      ctx.clip();
      ctx.translate(left, top); ctx.scale(size / 100, size / 100);
      ctx.globalAlpha = Math.min(1, 1.6 / (1 + s.ty * s.ty * 0.03));
      drawThing(s.t, now, P);
      ctx.restore();
      if (s.t.sign || s.t.kind === "npc" || s.t.kind === "door") {
        if (s.ty < 7 && zbuf[Math.max(0, Math.min(W - 1, Math.round(cx)))] > s.ty) {
          var label = s.t.kind === "npc" ? people[s.t.npc].name : s.t.kind === "door" ? zones[s.t.to].name : s.t.sign;
          ctx.font = "600 " + Math.max(10, Math.min(18, size * 0.11)) + "px Inter, system-ui, sans-serif";
          ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,.6)";
          var tw = ctx.measureText(label).width + 10, ty = top + size * 0.12;
          ctx.fillRect(cx - tw / 2, ty - 13, tw, 18);
          ctx.fillStyle = "#fff"; ctx.fillText(label, cx, ty);
        }
      }
    });
    if (showMap) drawMap();
  }

  function drawThing(t, now, P) {
    var pending = (t.cards || []).some(function (c) { return !has(c); }) || (t.kind === "device" && !S.done[t.key]);
    var pulse = reduceMotion ? 0.8 : 0.65 + 0.35 * Math.sin(now / 260 + t.seed);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    switch (t.sprite) {
      case "plaque":
        ctx.fillStyle = "#3a3d42"; ctx.fillRect(47, 58, 6, 42);
        ctx.fillStyle = pending ? P.accent : "#565a61"; ctx.fillRect(22, 26, 56, 36);
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(28, 34, 44, 4); ctx.fillRect(28, 42, 36, 4); ctx.fillRect(28, 50, 40, 4);
        break;
      case "scan":
        ctx.fillStyle = "#0a0d10"; ctx.fillRect(14, 14, 72, 62); ctx.strokeStyle = pending ? P.accent : "#565a61"; ctx.lineWidth = 2; ctx.strokeRect(14, 14, 72, 62);
        ctx.strokeStyle = "#c9d3da"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(48, 42, 24, 19, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#1c2a33"; ctx.beginPath(); ctx.ellipse(63, 58, 11, 8, 0, 0, Math.PI * 2); ctx.fill();   // fluid where the cerebellum should be
        ctx.fillStyle = "#3a3d42"; ctx.fillRect(47, 76, 6, 24);
        break;
      case "npc":
        var hue = (t.npc.charCodeAt(0) * 47 + t.npc.charCodeAt(1) * 13) % 360;
        ctx.fillStyle = "hsl(" + hue + ",38%,52%)"; ctx.beginPath(); ctx.ellipse(50, 74, 15, 26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e6cdb3"; ctx.beginPath(); ctx.arc(50, 38, 11, 0, Math.PI * 2); ctx.fill();
        if (pending) { ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(66, 22, 4, 0, Math.PI * 2); ctx.fill(); }
        break;
      case "door":
        var open = unlocked(t);
        ctx.fillStyle = "#1a1d21"; ctx.fillRect(26, 12, 48, 88);
        ctx.strokeStyle = open ? P.accent : "#666a70"; ctx.lineWidth = 4; ctx.strokeRect(26, 12, 48, 88);
        ctx.fillStyle = open ? P.accent : "#666a70"; ctx.globalAlpha *= 0.25; ctx.fillRect(30, 16, 40, 84); ctx.globalAlpha /= 0.25;
        if (!open) { ctx.fillStyle = "#666a70"; ctx.fillRect(44, 52, 12, 10); ctx.beginPath(); ctx.arc(50, 52, 5, Math.PI, 0); ctx.lineWidth = 2.5; ctx.stroke(); }
        break;
      case "dashed":
        ctx.setLineDash([6, 6]); ctx.strokeStyle = pending ? P.accent : "#666a70"; ctx.lineWidth = 3; ctx.strokeRect(26, 12, 48, 88); ctx.setLineDash([]);
        break;
      case "device":
        ctx.fillStyle = "#3a3d42"; ctx.fillRect(40, 62, 20, 38);
        ctx.strokeStyle = pending ? P.accent : "#565a61"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(50, 44, 12 + (pending ? pulse * 4 : 0), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = pending ? P.accent : "#565a61"; ctx.beginPath(); ctx.arc(50, 44, 5, 0, Math.PI * 2); ctx.fill();
        break;
      case "orb":
        ctx.fillStyle = P.accent; ctx.globalAlpha *= 0.35 + 0.3 * pulse; ctx.beginPath(); ctx.arc(50, 48, 16, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 2); ctx.beginPath(); ctx.arc(50, 48, 6, 0, Math.PI * 2); ctx.fill();
        break;
      case "tree": case "vine":
        var beat;
        if (reduceMotion) beat = 0.8;
        else if (Z.trees === "irregular") { var k = Math.floor(now / 140) + t.seed * 31; beat = 0.35 + 0.65 * (Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1); }
        else beat = 0.7 + 0.3 * Math.sin(now / 180);
        ctx.strokeStyle = shade(Z.trees === "irregular" ? "#9a9a9a" : "#8fd0a8", beat); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(50, 100); ctx.lineTo(50, 62); ctx.stroke();
        ctx.lineWidth = 1.6;
        for (var i = -5; i <= 5; i++) {
          ctx.beginPath(); ctx.moveTo(50, 62); ctx.quadraticCurveTo(50 + i * 4, 44, 50 + i * 7, 12 + Math.abs(i) * 2.2); ctx.stroke();
          if (i % 2) { ctx.beginPath(); ctx.moveTo(50 + i * 4.6, 40); ctx.lineTo(50 + i * 8.5, 30); ctx.stroke(); }
        }
        if (t.sprite === "vine") {
          ctx.strokeStyle = pending ? "#e8b55e" : "#8a6d3a"; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(47, 100);
          for (var y = 96; y >= 16; y -= 8) ctx.lineTo(50 + ((y / 8) % 2 ? 9 : -9) * (1 - (y - 16) / 160), y);
          ctx.stroke();
        }
        break;
    }
  }

  var map = $("map"), mctx = map.getContext("2d");
  function drawMap() {
    var s = Math.floor(Math.min(150 / Z.w, 150 / Z.h)), ox = (150 - Z.w * s) / 2, oy = (150 - Z.h * s) / 2;
    mctx.clearRect(0, 0, 150, 150);
    for (var y = 0; y < Z.h; y++) for (var x = 0; x < Z.w; x++) {
      var c = Z.grid[y][x];
      mctx.fillStyle = c === "#" ? "#3b4047" : c === "%" ? Z.palette.alt : "#14171a";
      mctx.fillRect(ox + x * s, oy + y * s, s, s);
    }
    Z.things.forEach(function (t) {
      if (t.kind === "deco" && t.sprite === "tree") return;
      var pending = (t.cards || []).some(function (c) { return !has(c); }) || (t.kind === "device" && !S.done[t.key]);
      mctx.fillStyle = t.kind === "door" ? "#ffffff" : pending ? Z.palette.accent : "#5b6068";
      mctx.fillRect(ox + t.x * s - 2, oy + t.y * s - 2, 4, 4);
    });
    mctx.fillStyle = "#ff6b5e"; mctx.beginPath();
    mctx.arc(ox + S.x * s, oy + S.y * s, 3, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = "#ff6b5e"; mctx.beginPath(); mctx.moveTo(ox + S.x * s, oy + S.y * s);
    mctx.lineTo(ox + (S.x + Math.cos(S.a) * 0.9) * s, oy + (S.y + Math.sin(S.a) * 0.9) * s); mctx.stroke();
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    update(dt, now);
    render(now);
    requestAnimationFrame(frame);
  }
})();
