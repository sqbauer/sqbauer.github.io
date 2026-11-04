// Progressive enhancement only: the page is complete without this file.
(function () {
  "use strict";
  var root = document.documentElement;
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = function () { return mqReduce.matches; };
  var supports = function (q) { return !!(window.CSS && CSS.supports && CSS.supports(q)); };
  var canVT = typeof document.startViewTransition === "function";
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  // ---- Enhancement CSS -------------------------------------------------------------------
  // Newer CSS that the W3C validator's grammar does not know yet (scroll-driven animations,
  // View Transitions, ::details-content). Injected here so the static page stays validator-clean;
  // every rule is guarded by @supports and by prefers-reduced-motion.
  var css =
    "@media (prefers-reduced-motion: no-preference){" +
    "@supports (animation-timeline: view()){" +
    ".pub.reveal{animation:enh-rise linear both;animation-timeline:view();animation-range:entry 0% entry 60%}" +
    ".wipe{animation:enh-wipe linear both;animation-timeline:view();animation-range:entry 10% cover 40%}" +
    ".hero-photo .photo{display:block;animation:enh-par linear both;animation-timeline:scroll(root);animation-range:0 480px}}" +
    ".io .reveal{transition:opacity .6s var(--ease),transform .6s var(--ease)}" +
    ".io .reveal:not(.in){opacity:0;transform:translateY(14px)}" +
    ".io .wipe{transition:clip-path .9s var(--ease)}" +
    ".io .wipe:not(.in){clip-path:inset(0 100% 0 0)}" +
    "@supports (interpolate-size: allow-keywords) and selector(::details-content){" +
    ".bib{interpolate-size:allow-keywords}" +
    ".bib::details-content{block-size:0;overflow:clip;transition:block-size .28s var(--ease),content-visibility .28s allow-discrete}" +
    ".bib[open]::details-content{block-size:auto}}" +
    "::view-transition-group(*){animation-duration:.38s;animation-timing-function:var(--ease)}" +
    ":root.vt-theme::view-transition-old(root),:root.vt-theme::view-transition-new(root){animation:none;mix-blend-mode:normal}" +
    ":root.vt-theme::view-transition-new(root){z-index:1}}" +
    "@keyframes enh-rise{from{opacity:0;transform:translateY(14px)}}" +
    "@keyframes enh-wipe{from{clip-path:inset(0 100% 0 0)}}" +
    "@keyframes enh-par{to{transform:translateY(-24px)}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---- Scroll reveal fallback (no scroll-driven animations): IntersectionObserver ----------
  if (!supports("animation-timeline: view()") && !reduced() && "IntersectionObserver" in window) {
    var targets = $$(".reveal, .wipe");
    // Anything already on screen is shown immediately, so nothing visible blinks out.
    targets.forEach(function (el) { if (el.getBoundingClientRect().top < innerHeight) el.classList.add("in"); });
    root.classList.add("io");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    targets.forEach(function (el) { if (!el.classList.contains("in")) io.observe(el); });
  }

  // ---- Header: condense after scrolling --------------------------------------------------
  var head = document.querySelector(".site-head");
  if (head) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { head.classList.toggle("scrolled", scrollY > 8); ticking = false; });
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---- Hero trace: pause the drift while off-screen ------------------------------------
  var trace = document.querySelector(".trace");
  if (trace && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { trace.classList.toggle("paused", !e[0].isIntersecting); }).observe(trace);
  }

  // ---- Navigation: active-section indicator ------------------------------------------------
  var nav = document.querySelector(".site-head nav");
  var ind = nav && nav.querySelector(".nav-ind");
  if (ind && "IntersectionObserver" in window) {
    var links = $$("a[href^='#']", nav);
    var active = null;
    var place = function () {
      links.forEach(function (a) { if (a === active) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
      if (!active) { ind.classList.remove("on"); return; }
      ind.style.setProperty("--x", active.offsetLeft + "px");
      ind.style.setProperty("--y", active.offsetTop + active.offsetHeight - 3 + "px");
      ind.style.setProperty("--w", active.offsetWidth);
      ind.classList.add("on");
    };
    var visible = {};
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var hit = null;
      links.forEach(function (a) { if (!hit && visible[a.getAttribute("href").slice(1)]) hit = a; });
      if (hit !== active) { active = hit; place(); }
    }, { rootMargin: "-40% 0px -55% 0px" });
    links.forEach(function (a) { var s = document.getElementById(a.getAttribute("href").slice(1)); if (s) so.observe(s); });
    addEventListener("resize", place);
  }

  // ---- Theme toggle (circular reveal via View Transitions where available) --------------
  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    var mqDark = window.matchMedia("(prefers-color-scheme: dark)");
    var current = function () { return root.getAttribute("data-theme") || (mqDark.matches ? "dark" : "light"); };
    var label = function () { toggle.setAttribute("aria-label", "Switch to " + (current() === "dark" ? "light" : "dark") + " theme"); };
    toggle.hidden = false;
    label();
    toggle.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      var apply = function () {
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked */ }
        label();
      };
      if (!canVT || reduced()) return apply();
      var r = toggle.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.classList.add("vt-theme");
      var t = document.startViewTransition(apply);
      t.ready.then(function () {
        root.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + R + "px at " + x + "px " + y + "px)"] },
          { duration: 520, easing: "cubic-bezier(.2,.7,.2,1)", pseudoElement: "::view-transition-new(root)" });
      });
      t.finished.then(function () { root.classList.remove("vt-theme"); }, function () { root.classList.remove("vt-theme"); });
    });
    if (mqDark.addEventListener) mqDark.addEventListener("change", label);
  }

  // ---- Publication filters (View Transitions + number tween) ------------------------------
  var filters = document.querySelector(".filters");
  var num = document.querySelector("#pub-count .num");
  var unit = document.querySelector("#pub-count .unit");
  var live = document.getElementById("pub-live");
  if (filters) {
    var buttons = $$("button", filters);
    var pubs = $$(".pub");
    var groups = $$(".group");
    var match = function (el, f) {
      if (f === "lead") return el.dataset.role === "first" || el.dataset.role === "co-first";
      if (f === "preprint") return el.dataset.type === "preprint";
      return true;
    };
    var tween = function (to) {
      var from = parseInt(num.textContent, 10) || 0;
      unit.textContent = to === 1 ? "paper" : "papers";
      if (live) live.textContent = to + (to === 1 ? " paper" : " papers") + " shown";
      if (reduced() || from === to) { num.textContent = to; return; }
      var t0 = performance.now(), dur = 320;
      var step = function (now) {
        var k = Math.min(1, (now - t0) / dur);
        num.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    var apply = function (f) {
      var shown = 0;
      pubs.forEach(function (el) { var ok = match(el, f); el.hidden = !ok; if (ok) shown++; });
      groups.forEach(function (g) { g.hidden = !g.querySelector(".pub:not([hidden])"); });
      return shown;
    };
    var named = $$(".pub, .group-label");
    filters.hidden = false;
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.getAttribute("aria-pressed") === "true") return;
        buttons.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        var f = b.dataset.filter, shown;
        if (!canVT || reduced()) { tween(apply(f)); return; }
        named.forEach(function (el, i) { el.style.viewTransitionName = "f" + i; });
        var done = false;
        var run = function () { if (!done) { done = true; shown = apply(f); tween(shown); } };
        var clear = function () { named.forEach(function (el) { el.style.viewTransitionName = ""; }); };
        var t = document.startViewTransition(run);
        t.updateCallbackDone.then(null, function (e) { console.warn("filter transition:", e && e.name); run(); });
        t.finished.then(clear, clear);
        // Watchdog: the filter must apply even if a browser stalls or aborts the transition.
        setTimeout(function () { if (!done) { try { t.skipTransition(); } catch (e) { /* ignore */ } run(); } }, 250);
      });
    });
  }

  // ---- Copy-BibTeX buttons ------------------------------------------------------------------
  if (navigator.clipboard) {
    $$(".bib .copy").forEach(function (btn) {
      btn.hidden = false;
      btn.addEventListener("click", function () {
        var text = btn.parentNode.querySelector("code").textContent;
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = "Copy BibTeX"; }, 1600);
        }, function () { btn.textContent = "Copy failed: select the text manually"; });
      });
    });
  }
})();
