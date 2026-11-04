// Progressive enhancement only: the page is complete without this file.
(function () {
  "use strict";
  var root = document.documentElement;

  // Theme toggle (system preference by default; explicit choice remembered).
  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var current = function () { return root.getAttribute("data-theme") || (mq.matches ? "dark" : "light"); };
    var label = function () { toggle.setAttribute("aria-label", "Switch to " + (current() === "dark" ? "light" : "dark") + " theme"); };
    toggle.hidden = false;
    label();
    toggle.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked */ }
      label();
    });
    if (mq.addEventListener) mq.addEventListener("change", label);
  }

  // Publication filters, applied to the static list.
  var filters = document.querySelector(".filters");
  var count = document.getElementById("pub-count");
  if (filters) {
    var buttons = filters.querySelectorAll("button");
    var match = function (el, f) {
      if (f === "lead") return el.dataset.role === "first" || el.dataset.role === "co-first";
      if (f === "preprint") return el.dataset.type === "preprint";
      return true;
    };
    filters.hidden = false;
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.dataset.filter, shown = 0;
        buttons.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        document.querySelectorAll(".pub").forEach(function (el) {
          var ok = match(el, f);
          el.hidden = !ok;
          if (ok) shown++;
        });
        document.querySelectorAll(".group").forEach(function (g) {
          g.hidden = !g.querySelector(".pub:not([hidden])");
        });
        if (count) count.textContent = shown + (shown === 1 ? " paper" : " papers");
      });
    });
  }

  // Copy-BibTeX buttons.
  if (navigator.clipboard) {
    document.querySelectorAll(".bib .copy").forEach(function (btn) {
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
