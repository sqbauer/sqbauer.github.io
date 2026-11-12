# The Loop Line

A browser adventure through the cerebellum, built from the manuscript of *The Hidden Conductor*.
You play a signal: walk the cerebellar hub, leave through one of the three deep nuclei, ride a line
out to the rest of the brain, and come back. Everything you collect is a card that quotes the book
word for word, with its chapter and page.

Live at <https://sqbauer.github.io/hidden-conductor/game/> once this folder is on the `main` branch.

## Files

| File | What it is |
|---|---|
| `index.html` | The page shell. Interface text only. |
| `style.css` | Styles. |
| `game.js` | The engine: first-person view on a plain canvas, movement, cards, the mini-interactions, saving. No libraries. |
| `data/concepts.json` | **All book-derived text**: the 67 cards, the characters' lines, and the 15 figure briefs. |
| `data/world.json` | The 14 zones: maps, what stands where, door rules, the mini-interaction texts and parameters, and the interface text. |
| `CHECK.md` | The source check: every claim in the game with its chapter and page, and everything that is not from the book. |
| `assets/` | Reserved for figure images. Empty: no drawn figures exist yet (see `assets/README.md`). |

## Editing content without touching code

- **Change a card's wording:** edit its `"text"` in `data/concepts.json`. The line above it,
  `"_source_note"`, states the chapter and PDF page it was quoted from (Part 1 = chapters 1-5 file,
  Part 2 = chapters 6-10 file). JSON has no comments, so these `_..._note` fields are the comments.
- **`"origin": "book"`** marks text quoted from the manuscript. **`"origin": "game"`** marks text
  written for the game; those lines are also tagged `[NOT IN SOURCE]` and state no science.
- **Card types:** `mechanism` (the book states it as established), `hypothesis` (the book marks it
  unproven or revised), `open_question` (from "What We Still Don't Know").
- **Move or add a thing in a zone:** edit the zone's `"grid"` in `data/world.json`. `#` and `%` are
  walls, `.` is floor, and each letter is defined under that zone's `"things"`.
- **Timing values** such as `windowMs` are game parameters. Where the book gives a number, the
  `_note` beside the parameter quotes it.

If the manuscript changes, update the quotes here by hand; nothing regenerates them.

## GitHub Pages setup

The game is plain static files with relative paths, so it needs no build step.

1. Put this folder in the repository that GitHub Pages serves (here: `hidden-conductor/game/` in
   `sqbauer/sqbauer.github.io`).
2. In the repository, open Settings → Pages and set Source to "Deploy from a branch", branch
   `main`, folder `/ (root)`. This is already the case for `sqbauer.github.io`.
3. Push to `main`. The game is live about a minute later at
   `https://sqbauer.github.io/hidden-conductor/game/`.

To use it in a different repository, copy the folder anywhere under the published root. The only
paths that reach outside the folder are the fonts and favicon in `../../assets/`; without them the
game falls back to system fonts.

## Running it locally

Browsers will not load the JSON files from a page opened straight from disk. Serve the repository
root instead:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/hidden-conductor/game/`.

## Controls and saving

- Move with W A S D or the arrow keys; act with E, Enter or Space; N opens the notebook; M hides the map.
- On a touchscreen, use the on-screen arrows and the Act button.
- Progress is saved in the browser's `localStorage` under `loop-line-save-v1`. "Start over" on the
  title screen clears it. Nothing is sent anywhere.

## Known limits

- The layout is a route map and claims no anatomy. The book gives little spatial detail beyond the
  cerebellum itself.
- The Night line has no return route in the book, so the player walks back the way they came.
- The first-person view is not usable with a screen reader. Every card can be read in the notebook,
  and all card text is in `data/concepts.json`.
- `window.__loopline` is a small debugging handle used by the automated play-through.
