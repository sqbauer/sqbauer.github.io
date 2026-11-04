(function () {
  "use strict";

  var SELF = "Bauer S";
  var pubs = (window.PUBLICATIONS || []).slice();
  var list = document.getElementById("pubs");
  var count = document.getElementById("count");
  var buttons = document.querySelectorAll(".filters button");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function link(href, text) {
    var a = el("a", null, text);
    a.href = href;
    a.rel = "noopener";
    return a;
  }

  function authorsNode(str) {
    var p = el("p", "authors");
    str.split(/,\s*/).forEach(function (name, i, arr) {
      p.appendChild(name === SELF ? el("strong", null, name) : document.createTextNode(name));
      if (i < arr.length - 1) p.appendChild(document.createTextNode(", "));
    });
    return p;
  }

  function badge(text, kind) {
    return el("span", "badge badge-" + kind, text);
  }

  function card(p) {
    var art = el("article", "pub");
    art.id = p.id;

    var h = el("h3");
    h.appendChild(link(p.doi ? "https://doi.org/" + p.doi : (p.preprint || "#"), p.title));
    art.appendChild(h);
    art.appendChild(authorsNode(p.authors));

    var meta = el("p", "venue");
    meta.appendChild(el("em", null, p.journal));
    if (p.citation) meta.appendChild(document.createTextNode(" " + p.citation));
    art.appendChild(meta);

    var row = el("div", "row");
    var badges = el("div", "badges");
    if (p.role === "first") badges.appendChild(badge("First author", "lead"));
    if (p.role === "co-first") badges.appendChild(badge("Co-first author", "lead"));
    if (p.status === "preprint") badges.appendChild(badge("Preprint", "pre"));
    if (p.note) badges.appendChild(badge(p.note, "note"));
    row.appendChild(badges);

    var links = el("div", "pub-links");
    if (p.summary) {
      var s = link(p.summary, "Interactive summary →");
      s.className = "primary";
      links.appendChild(s);
    }
    if (p.doi) links.appendChild(link("https://doi.org/" + p.doi, "DOI"));
    if (p.pmcid) links.appendChild(link("https://pmc.ncbi.nlm.nih.gov/articles/" + p.pmcid + "/", "Free full text"));
    if (p.pmid) links.appendChild(link("https://pubmed.ncbi.nlm.nih.gov/" + p.pmid + "/", "PubMed"));
    if (p.preprint && p.status !== "preprint") links.appendChild(link(p.preprint, "Preprint"));
    row.appendChild(links);
    art.appendChild(row);

    return art;
  }

  function matches(p, f) {
    if (f === "lead") return p.role === "first" || p.role === "co-first";
    if (f === "preprint") return p.status === "preprint";
    return true;
  }

  function render(filter) {
    list.textContent = "";
    var shown = pubs.filter(function (p) { return matches(p, filter); });

    var groups = [];
    var pre = shown.filter(function (p) { return p.status === "preprint"; });
    if (pre.length) groups.push(["Preprints", pre]);

    var byYear = {};
    shown.filter(function (p) { return p.status !== "preprint"; }).forEach(function (p) {
      (byYear[p.year] = byYear[p.year] || []).push(p);
    });
    Object.keys(byYear).sort(function (a, b) { return b - a; }).forEach(function (y) {
      groups.push([y, byYear[y]]);
    });

    groups.forEach(function (g) {
      var sec = el("section", "group");
      sec.appendChild(el("h2", "group-label", g[0]));
      g[1].forEach(function (p) { sec.appendChild(card(p)); });
      list.appendChild(sec);
    });

    count.textContent = shown.length + (shown.length === 1 ? " paper" : " papers");
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      buttons.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      render(b.dataset.filter);
    });
  });

  render("all");
})();
