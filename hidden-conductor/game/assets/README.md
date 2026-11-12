# assets

This folder is for figure images. It is empty on purpose.

The manuscript of *The Hidden Conductor* (V26) contains no drawn figures, only 15 written figure
briefs. Those briefs are stored word for word in `../data/concepts.json` under `figures`, each with
`"image": null`. The zones of the game are built from the briefs directly.

When a figure is drawn, save it here (for example `F02.svg`), set that figure's `"image"` to the
file name in `data/concepts.json`, and check it against the brief before publishing.
