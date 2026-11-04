# sqbauer.github.io

Personal academic site of Staf Bauer, live at <https://sqbauer.github.io>.

The site is plain static HTML: `index.html` is generated from JSON data by a small Node script and
committed, so what you review in a pull request is exactly what GitHub Pages serves. The page works
fully without JavaScript; `assets/app.js` only adds the theme toggle, publication filters and
copy-BibTeX buttons.

## Layout

| Path | What it is | Edit by hand? |
|---|---|---|
| `_data/site.json` | Page text: position, statement, links, research themes, photo, email, CV path. `null` renders as a visible **TODO** box. | Yes |
| `_data/talks.json` | Talks and posters. | Yes |
| `_data/overrides.json` | Publication facts the APIs cannot provide: co-first authorship, notes ("In revision"), PDF/code/data/slides links, DOIs to include or exclude. | Yes |
| `_data/publications.json` | Publication metadata. **Generated** by `scripts/sync.mjs`. | No |
| `_data/images.json` | Image sizes/formats. **Generated** by `scripts/images.mjs`. | No |
| `index.html`, `sitemap.xml` | **Generated** by `scripts/render.mjs`. | No |
| `assets/` | CSS, JS, fonts (self-hosted, SIL OFL), favicon, social preview image, optimised images. `style.css` is inlined into `index.html` at render time, so run `npm run render` after editing it. | CSS/JS yes |
| `src/images/` | Original images (photo, research figures). | Yes |

## Local preview

Requires Node 20+.

```bash
npm ci
npm run render     # regenerate index.html from _data/*.json
npm run serve      # http://localhost:8000
```

`npm run validate` checks the HTML. You can also open `index.html` straight from disk.

## Common tasks

**Add a paper.** Usually nothing to do: add it to your ORCID record and the weekly sync picks it up
(PubMed is also searched for `Bauer Staf[Author]`). To add it immediately, run the
*Sync publications* workflow by hand (Actions → Sync publications → Run workflow). Then:

- co-first author, a status note, or code/data links: add an entry under `entries` in
  `_data/overrides.json`, keyed by the lowercase DOI, e.g.
  `"10.1234/abcd": { "role": "co-first", "code": "https://github.com/...", "data": "https://doi.org/..." }`,
  then `npm run render` and commit;
- a paper that is in neither ORCID nor PubMed: add its DOI to `include` (it is still verified
  against Crossref);
- a record you do not want listed: add its DOI to `exclude`.

First authorship is inferred from author order; co-first authorship is never inferred.

**Add a talk or poster.** Append to `_data/talks.json`:

```json
{ "date": "2026-11", "type": "talk", "title": "…", "event": "…", "location": "…", "url": "https://…" }
```

`type` is `talk` or `poster`; `url` is optional. Then `npm run render` and commit.

**Add the photo or a research figure.** Put the original (JPG/PNG) in `src/images/`, e.g.
`photo.jpg` or `theme-1.png`, run `npm run images` (writes AVIF, WebP and JPEG to `assets/img/`
plus sizes to `_data/images.json`), set `"photo": "photo"` or a theme's `"figure": "theme-1"` and
`"figureAlt"` in `_data/site.json`, then `npm run render`. Only use figures you hold the rights to
(CC-BY papers with credit in `figureCredit`, or redrawn from your own data).

**Add the CV.** Save it as `assets/Staf_Bauer_CV.pdf` (without home address, phone number or date
of birth) and run `npm run render`; the TODO turns into a download link automatically.

**Social preview image.** `npm run og` regenerates `assets/og.png` and the touch icon (needs
Playwright with Chromium; local only).

## How deploy works

GitHub Pages serves the `main` branch root (Settings → Pages → Deploy from a branch). Every push to
`main` redeploys within about a minute. There is no build step on GitHub's side: `index.html` must be
regenerated and committed, and CI fails if it is stale.

## How the publication sync works

`.github/workflows/sync.yml` runs every Monday (05:17 UTC) and on demand:

1. Collects DOIs from your ORCID record (`0000-0002-5553-1664`) and from PubMed
   (`Bauer Staf[Author]`).
2. Looks up each DOI in Crossref for title, authors, journal, volume/pages and dates, plus PMID/PMCID
   from PubMed and BibTeX from doi.org.
3. **Verification:** an entry is listed only if the DOI resolves in Crossref, its title matches the
   ORCID or PubMed title (token similarity ≥ 0.8), and an author matches "Bauer S". Anything else is
   left out and reported under *Failed verification*.
4. Preprints are merged into their published version when Crossref links the two.
5. Year shown = print/issue year if there is one, otherwise the online date.
6. If anything changed, it opens (or updates) a pull request from `bot/publication-sync` with a
   report of added/changed/removed entries and warnings (e.g. a paper in PubMed but missing from
   ORCID). It never merges by itself.

Note: pull requests opened by the workflow do not trigger CI (a GitHub safety rule). CI runs once
the change is merged into `main`.

On pushes to branches other than `main` that change `scripts/sync.mjs` or `_data/overrides.json`,
the workflow regenerates the data and commits it back to that branch, so sync changes can be tested
before merging.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

- generated `index.html` is up to date with the data;
- HTML validity: `html-validate` and the W3C Nu validator;
- link check (lychee, `lychee.toml`); sites that block automated requests (LinkedIn, some
  publishers) are excluded, and DOIs are checked by the sync instead;
- Lighthouse (mobile, median of 3 runs): every category ≥ 95, LCP < 2 s, CLS < 0.05
  (`lighthouserc.json`).

GitHub Actions are pinned to major versions; pin them to commit SHAs if you want stricter
supply-chain control.
