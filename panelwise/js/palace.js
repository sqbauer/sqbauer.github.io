"use strict";
/* ----- memory palace: walkable building, one wing per topic ----- */
const L5 = [[[150, 130], [400, 115], [650, 135], [260, 345], [560, 355]], [[210, 250], [380, 115], [590, 125], [630, 330], [360, 365]], [[200, 120], [610, 115], [400, 245], [170, 365], [640, 365]], [[145, 145], [370, 185], [645, 125], [300, 370], [600, 335]]];
const TPL = [
  { id: "house", name: "The house", rooms: [
    ["Front hall", "#d9c3a0", "wood", [["Coat rack", "rack"], ["Umbrella stand", "barrel"], ["Grandfather clock", "clock"], ["Persian rug", "map"], ["Staircase", "stairs"]]],
    ["Kitchen", "#e8e1cf", "tiles", [["Fridge", "fridge"], ["Sink", "sink"], ["Stove", "fire"], ["Fruit bowl", "table"], ["Spice rack", "shelf"]]],
    ["Library", "#9c6b4a", "carpet", [["Reading chair", "sofa"], ["Tall bookshelf", "shelf"], ["Globe", "globe"], ["Desk lamp", "lamp"], ["Fireplace", "fire"]]],
    ["Music room", "#c9b7d9", "wood", [["Grand piano", "piano"], ["Cello case", "chest"], ["Metronome", "clock"], ["Music stand", "rack"], ["Window seat", "window"]]],
    ["Greenhouse", "#b9d8a6", "grass", [["Palm tree", "plant"], ["Watering can", "cup"], ["Potting bench", "bench"], ["Fish pond", "tub"], ["Orchid", "plant"]]],
    ["Bedroom", "#a9c3df", "carpet", [["Four-poster bed", "bed"], ["Wardrobe", "chest"], ["Mirror", "mirror"], ["Bedside lamp", "lamp"], ["Window", "window"]]],
    ["Bathroom", "#cfe7ea", "tiles", [["Bathtub", "tub"], ["Washbasin", "sink"], ["Mirror cabinet", "mirror"], ["Towel rack", "rack"], ["Rubber duck", "cup"]]],
    ["Attic", "#b8a48c", "wood", [["Old trunk", "chest"], ["Rocking horse", "statue"], ["Telescope", "scope"], ["Dusty portrait", "frame"], ["Round window", "window"]]]] },
  { id: "lab", name: "The lab building", rooms: [
    ["Lobby", "#d6dde6", "tiles", [["Reception desk", "desk"], ["Revolving door", "door"], ["Poster wall", "frame"], ["Elevator", "stairs"], ["Badge reader", "screen"]]],
    ["Microscope room", "#6f7d96", "metal", [["Confocal microscope", "scope"], ["Blackout curtain", "window"], ["Slide box", "chest"], ["Monitor wall", "screen"], ["Ice bucket", "barrel"]]],
    ["Animal facility", "#cfe0d2", "tiles", [["Cage rack", "cage"], ["Running wheel", "wheel"], ["Food scale", "table"], ["Gown hook", "rack"], ["Airlock", "door"]]],
    ["Ephys rig", "#55607a", "metal", [["Faraday cage", "cage"], ["Oscilloscope", "screen"], ["Air table", "table"], ["Micromanipulator", "rack"], ["Amplifier stack", "shelf"]]],
    ["Seminar room", "#d9cbb4", "carpet", [["Projector screen", "screen"], ["Lectern", "desk"], ["Whiteboard", "frame"], ["Front row", "bench"], ["Wall clock", "clock"]]],
    ["Coffee corner", "#c7a37c", "wood", [["Espresso machine", "cup"], ["Shared fridge", "fridge"], ["Couch", "sofa"], ["Big plant", "plant"], ["Notice board", "frame"]]],
    ["Cold room", "#bcd7f0", "metal", [["Sample shelves", "shelf"], ["-80 freezer", "fridge"], ["Vortexer", "cup"], ["Thermometer", "clock"], ["Heavy door", "door"]]],
    ["Rooftop", "#a7c3a2", "grass", [["Weather vane", "statue"], ["Water tank", "barrel"], ["Bench", "bench"], ["Antenna", "rack"], ["Skyline view", "window"]]]] },
  { id: "museum", name: "The museum", rooms: [
    ["Grand entrance", "#e6dccb", "tiles", [["Ticket desk", "desk"], ["Marble stairs", "stairs"], ["Chandelier", "lamp"], ["Map board", "map"], ["Fountain", "tub"]]],
    ["Egyptian hall", "#e2c27d", "tiles", [["Sarcophagus", "chest"], ["Sphinx", "statue"], ["Obelisk", "rack"], ["Scarab case", "globe"], ["Papyrus wall", "frame"]]],
    ["Dinosaur hall", "#c9b08a", "grass", [["T. rex skeleton", "bones"], ["Fossil wall", "frame"], ["Egg nest", "globe"], ["Volcano diorama", "fire"], ["Footprint trail", "map"]]],
    ["Painting gallery", "#d8c9c0", "wood", [["Famous portrait", "frame"], ["Velvet bench", "bench"], ["Easel", "rack"], ["Guard's chair", "sofa"], ["Skylight", "window"]]],
    ["Planetarium", "#2c3550", "carpet", [["Star projector", "star"], ["Saturn model", "globe"], ["Reclining seats", "sofa"], ["Moon rock", "statue"], ["Dome door", "door"]]],
    ["Clock tower", "#a59078", "wood", [["Giant gears", "wheel"], ["Pendulum", "clock"], ["Bronze bell", "cup"], ["Spiral stairs", "stairs"], ["Clock face", "globe"]]],
    ["Sculpture garden", "#9fc48c", "grass", [["The Thinker", "statue"], ["Hedge maze", "plant"], ["Lily pond", "tub"], ["Stone bench", "bench"], ["Lantern", "lamp"]]],
    ["Museum café", "#e3c7a6", "wood", [["Cake counter", "table"], ["Espresso bar", "cup"], ["Window table", "window"], ["Menu board", "frame"], ["Old piano", "piano"]]]] },
  { id: "ship", name: "The ship", rooms: [
    ["Main deck", "#b98d5f", "wood", [["Lifebuoy", "wheel"], ["Anchor", "anchor"], ["Flagpole", "rack"], ["Deck chairs", "sofa"], ["Ship's bell", "cup"]]],
    ["Bridge", "#8aa3b8", "metal", [["Ship's wheel", "wheel"], ["Radar screen", "screen"], ["Compass", "globe"], ["Captain's chair", "sofa"], ["Logbook", "desk"]]],
    ["Map room", "#c9a97a", "wood", [["Sea chart", "map"], ["Sextant", "scope"], ["Old globe", "globe"], ["Oil lantern", "lamp"], ["Porthole", "window"]]],
    ["Galley", "#d8cdb6", "tiles", [["Soup cauldron", "barrel"], ["Fish crate", "chest"], ["Bread oven", "fire"], ["Hanging pans", "rack"], ["Water cask", "barrel"]]],
    ["Engine room", "#6e6a66", "metal", [["Boiler", "fire"], ["Pistons", "rack"], ["Pressure gauge", "clock"], ["Coal pile", "barrel"], ["Iron ladder", "stairs"]]],
    ["Crew cabins", "#a7b5c9", "wood", [["Hammock", "bed"], ["Sea chest", "chest"], ["Cabin porthole", "window"], ["Oil lamp", "lamp"], ["Wash basin", "sink"]]],
    ["Cargo hold", "#8f7a5e", "wood", [["Stacked crates", "chest"], ["Rum barrels", "barrel"], ["Cannon", "scope"], ["Rope coil", "wheel"], ["Parrot cage", "cage"]]],
    ["Crow's nest", "#9cc3de", "metal", [["Spyglass", "scope"], ["Pennant", "frame"], ["Seagull", "statue"], ["Rope ladder", "stairs"], ["Horizon", "window"]]]] }
];
const WING_COST = 12;
const roomUnlockCost = w => 4 + 2 * (w.unlocked - 1);
function pal() {
  if (!S.pal) S.pal = D.palace || store.get("pw:palace") || null;
  if (!S.pal || S.pal.v !== 2) { const old = S.pal; S.pal = { kind: "palace", v: 2, pts: old ? old.pts || 0 : 0, spent: 0, wings: [] }; }
  return S.pal;
}
function savePalace() {
  const P = pal(); P.updated = Date.now();
  store.set("pw:palace", P);
  if (D.col) { clearTimeout(savePalace.t); savePalace.t = setTimeout(() => enqueue("palace", () => D.col.doc("palace").set(JSON.parse(JSON.stringify(P)))), 600); }
}
const balance = () => pal().pts - pal().spent;
const canAffordAny = () => { const P = pal(); return P.wings.some(w => w.unlocked < 8 && balance() >= roomUnlockCost(w)) || (!P.wings.length) || balance() >= WING_COST; };
function placedMap() { const m = new Map(); pal().wings.forEach((w, wi) => Object.entries(w.place || {}).forEach(([k, id]) => m.set(id, { wi, k }))); return m; }
function whereIs(id) { const p = placedMap().get(id); if (!p) return null; const w = pal().wings[p.wi], [ri, li] = p.k.split(":").map(Number), room = TPL.find(t => t.id === w.tpl).rooms[ri]; return `${w.topic} wing · ${room[0]} · ${room[3][li][0]}`; }
function mastery(id) {
  const r = recOf(id); if (!r || !r.card) return 0;
  const ts = reviewTypes(r.card, r.cardImg); if (!ts.length) return 0;
  return ts.reduce((a, t) => a + Math.min(1, ((r.srs || {})[t]?.ivl || 0) / 21), 0) / ts.length;
}
const hasDue = id => { const r = recOf(id); if (!r || !r.card) return false; return reviewTypes(r.card, r.cardImg).some(t => ((r.srs || {})[t]?.due || 0) <= Date.now()); };
const pinLabel = id => { const c = recOf(id)?.card; return c ? `${c.lab}${c.year ? " '" + String(c.year).slice(-2) : ""}` : "?"; };

/* drawing */
function icon(kind, x, y) {
  const S_ = 'stroke="#2b2a33" stroke-width="2"';
  const d = {
    desk: `<rect x="-34" y="-14" width="68" height="28" rx="3" fill="#8a5a3b" ${S_}/><rect x="-10" y="-24" width="20" height="12" fill="#ddd" ${S_}/>`,
    shelf: `<rect x="-32" y="-26" width="64" height="52" fill="#7a4e33" ${S_}/>${[-16, 0, 16].map(o => `<line x1="-30" x2="30" y1="${o}" y2="${o}" stroke="#2b2a33" stroke-width="2"/>`).join("")}<rect x="-26" y="-24" width="6" height="8" fill="#c33"/><rect x="-18" y="-24" width="5" height="8" fill="#36c"/><rect x="4" y="-8" width="6" height="8" fill="#3a3"/><rect x="12" y="8" width="6" height="8" fill="#ea3"/>`,
    window: `<rect x="-30" y="-24" width="60" height="48" fill="#bfe3ff" ${S_}/><line x1="0" x2="0" y1="-24" y2="24" stroke="#2b2a33" stroke-width="2"/><line x1="-30" x2="30" y1="0" y2="0" stroke="#2b2a33" stroke-width="2"/>`,
    plant: `<rect x="-12" y="8" width="24" height="18" fill="#b5653c" ${S_}/><circle cx="0" cy="-8" r="18" fill="#3f9b4b" ${S_}/><circle cx="-14" cy="0" r="10" fill="#4fb35a" ${S_}/><circle cx="14" cy="0" r="10" fill="#4fb35a" ${S_}/>`,
    lamp: `<polygon points="-18,-10 18,-10 10,-28 -10,-28" fill="#f5d36b" ${S_}/><line x1="0" x2="0" y1="-10" y2="20" stroke="#2b2a33" stroke-width="3"/><rect x="-12" y="20" width="24" height="6" fill="#555" ${S_}/>`,
    sofa: `<rect x="-36" y="-12" width="72" height="26" rx="6" fill="#b5423a" ${S_}/><rect x="-36" y="-24" width="72" height="14" rx="5" fill="#9b352e" ${S_}/><rect x="-42" y="-16" width="10" height="30" rx="4" fill="#9b352e" ${S_}/><rect x="32" y="-16" width="10" height="30" rx="4" fill="#9b352e" ${S_}/>`,
    fire: `<rect x="-30" y="-24" width="60" height="48" fill="#7b6a5c" ${S_}/><rect x="-18" y="-8" width="36" height="32" fill="#2b2a33"/><path d="M-10 22 Q-12 6 0 -4 Q2 8 10 4 Q14 14 8 22Z" fill="#f08a24"/><path d="M-4 22 Q-4 12 2 8 Q6 16 4 22Z" fill="#ffd34d"/>`,
    piano: `<path d="M-38 -24 H30 Q40 -24 40 -8 Q40 24 10 24 H-38Z" fill="#1d1d24" ${S_}/>${[-32, -24, -16, -8, 0, 8].map(o => `<rect x="${o}" y="16" width="7" height="8" fill="#fff"/>`).join("")}`,
    clock: `<rect x="-14" y="-30" width="28" height="60" rx="4" fill="#7a4e33" ${S_}/><circle cx="0" cy="-14" r="10" fill="#fff" ${S_}/><line x1="0" y1="-14" x2="5" y2="-18" stroke="#2b2a33" stroke-width="2"/><line x1="0" y1="2" x2="0" y2="20" stroke="#d4a62a" stroke-width="2"/><circle cx="0" cy="22" r="4" fill="#d4a62a"/>`,
    globe: `<circle cx="0" cy="-6" r="20" fill="#5aa0d8" ${S_}/><path d="M-10 -16 q8 6 2 12 q-8 4 -4 14 M6 -22 q6 10 12 6" stroke="#3f9b4b" stroke-width="5" fill="none"/><line x1="-10" x2="10" y1="22" y2="22" stroke="#2b2a33" stroke-width="3"/><line x1="0" x2="0" y1="14" y2="22" stroke="#2b2a33" stroke-width="3"/>`,
    bed: `<rect x="-34" y="-26" width="68" height="52" rx="4" fill="#e9e4f2" ${S_}/><rect x="-28" y="-22" width="56" height="12" rx="4" fill="#fff" ${S_}/><rect x="-34" y="-2" width="68" height="28" fill="#6b7fd1" ${S_}/>`,
    tub: `<rect x="-36" y="-18" width="72" height="36" rx="16" fill="#fff" ${S_}/><rect x="-28" y="-10" width="56" height="20" rx="10" fill="#9fd3ea"/>`,
    mirror: `<ellipse cx="0" cy="-4" rx="18" ry="26" fill="#d9eef7" ${S_}/><path d="M-8 -18 l10 -6" stroke="#fff" stroke-width="3"/><rect x="-8" y="22" width="16" height="6" fill="#7a4e33"/>`,
    chest: `<rect x="-30" y="-16" width="60" height="34" rx="3" fill="#8b5a2b" ${S_}/><path d="M-30 -16 Q0 -34 30 -16" fill="#a46a33" ${S_}/><rect x="-5" y="-6" width="10" height="10" fill="#e1b84a" ${S_}/>`,
    scope: `<rect x="-34" y="-12" width="54" height="16" rx="6" transform="rotate(-18)" fill="#4a4f63" ${S_}/><line x1="0" y1="0" x2="-14" y2="26" stroke="#2b2a33" stroke-width="3"/><line x1="0" y1="0" x2="14" y2="26" stroke="#2b2a33" stroke-width="3"/>`,
    cage: `<rect x="-30" y="-24" width="60" height="48" fill="none" ${S_}/>${[-20, -10, 0, 10, 20].map(o => `<line x1="${o}" x2="${o}" y1="-24" y2="24" stroke="#2b2a33" stroke-width="2"/>`).join("")}<ellipse cx="6" cy="14" rx="9" ry="6" fill="#ccc"/>`,
    screen: `<rect x="-34" y="-24" width="68" height="40" rx="3" fill="#1e2433" ${S_}/><polyline points="-26,0 -16,0 -12,-14 -6,10 0,-4 8,0 26,0" fill="none" stroke="#5fe08a" stroke-width="2"/><rect x="-6" y="16" width="12" height="10" fill="#555"/>`,
    cup: `<path d="M-16 -16 H16 L12 20 H-12Z" fill="#f2efe6" ${S_}/><path d="M16 -8 q12 0 10 10 q-2 8 -12 6" fill="none" ${S_}/><path d="M-6 -24 q4 -6 0 -10 M4 -24 q4 -6 0 -10" stroke="#999" stroke-width="2" fill="none"/>`,
    fridge: `<rect x="-20" y="-30" width="40" height="60" rx="4" fill="#eef1f4" ${S_}/><line x1="-20" x2="20" y1="-6" y2="-6" stroke="#2b2a33" stroke-width="2"/><rect x="12" y="-24" width="3" height="12" fill="#555"/><rect x="12" y="2" width="3" height="14" fill="#555"/>`,
    statue: `<rect x="-20" y="14" width="40" height="14" fill="#bdb7ad" ${S_}/><circle cx="0" cy="-18" r="10" fill="#d9d4cc" ${S_}/><path d="M-14 14 Q-12 -8 0 -8 Q12 -8 14 14Z" fill="#d9d4cc" ${S_}/>`,
    frame: `<rect x="-32" y="-24" width="64" height="48" fill="#c79a3b" ${S_}/><rect x="-24" y="-16" width="48" height="32" fill="#f3e9d2"/><circle cx="-6" cy="-2" r="8" fill="#e8a"/><path d="M-24 16 L-6 0 L8 12 L16 4 L24 16Z" fill="#6a9"/>`,
    bones: `<path d="M-36 10 Q-20 -20 10 -14 Q26 -12 34 -24" fill="none" stroke="#efe6d2" stroke-width="7"/><path d="M-36 10 Q-20 -20 10 -14 Q26 -12 34 -24" fill="none" stroke="#2b2a33" stroke-width="1.5"/>${[-20, -10, 0, 10].map(o => `<line x1="${o}" x2="${o + 2}" y1="-12" y2="8" stroke="#efe6d2" stroke-width="4"/>`).join("")}<circle cx="34" cy="-24" r="7" fill="#efe6d2" ${S_}/>`,
    star: `<circle r="16" fill="#3a3f63" ${S_}/>${[0, 72, 144, 216, 288].map(a => `<line x1="0" y1="0" x2="${30 * Math.cos(a * Math.PI / 180)}" y2="${30 * Math.sin(a * Math.PI / 180)}" stroke="#ffe17a" stroke-width="2"/>`).join("")}<circle r="6" fill="#ffe17a"/>`,
    wheel: `<circle r="24" fill="none" stroke="#7a4e33" stroke-width="6"/><circle r="6" fill="#7a4e33"/>${[0, 45, 90, 135].map(a => `<line x1="${-30 * Math.cos(a * Math.PI / 180)}" y1="${-30 * Math.sin(a * Math.PI / 180)}" x2="${30 * Math.cos(a * Math.PI / 180)}" y2="${30 * Math.sin(a * Math.PI / 180)}" stroke="#7a4e33" stroke-width="4"/>`).join("")}`,
    anchor: `<line x1="0" y1="-26" x2="0" y2="22" stroke="#3b4150" stroke-width="5"/><circle cx="0" cy="-28" r="5" fill="none" stroke="#3b4150" stroke-width="4"/><line x1="-12" x2="12" y1="-14" y2="-14" stroke="#3b4150" stroke-width="4"/><path d="M-22 6 Q-18 26 0 24 Q18 26 22 6" fill="none" stroke="#3b4150" stroke-width="5"/>`,
    barrel: `<ellipse cx="0" cy="-20" rx="20" ry="7" fill="#a46a33" ${S_}/><path d="M-20 -20 Q-26 0 -20 20 H20 Q26 0 20 -20" fill="#8b5a2b" ${S_}/><line x1="-23" x2="23" y1="-6" y2="-6" stroke="#444" stroke-width="3"/><line x1="-23" x2="23" y1="8" y2="8" stroke="#444" stroke-width="3"/>`,
    map: `<path d="M-34 -18 L-12 -24 L12 -18 L34 -24 V18 L12 24 L-12 18 L-34 24Z" fill="#efe0b9" ${S_}/><path d="M-20 4 Q-4 -12 10 0 T26 -6" stroke="#c33" stroke-width="2" stroke-dasharray="4 3" fill="none"/>`,
    table: `<ellipse cx="0" cy="0" rx="34" ry="20" fill="#a77a52" ${S_}/><circle cx="-8" cy="-2" r="7" fill="#e85"/><circle cx="6" cy="-4" r="7" fill="#ec4"/><circle cx="2" cy="6" r="6" fill="#6b4"/>`,
    stairs: `${[0, 1, 2, 3].map(i => `<rect x="${-30 + i * 12}" y="${14 - i * 12}" width="${60 - i * 12}" height="12" fill="#b08a6a" ${S_}/>`).join("")}`,
    bench: `<rect x="-36" y="-8" width="72" height="14" rx="3" fill="#9b7653" ${S_}/><rect x="-30" y="6" width="6" height="16" fill="#555"/><rect x="24" y="6" width="6" height="16" fill="#555"/>`,
    sink: `<rect x="-26" y="-14" width="52" height="30" rx="8" fill="#fff" ${S_}/><ellipse cx="0" cy="2" rx="16" ry="8" fill="#bfe3ff"/><path d="M0 -14 V-24 H10" fill="none" stroke="#777" stroke-width="3"/>`,
    rack: `<line x1="0" y1="-30" x2="0" y2="26" stroke="#5a4636" stroke-width="5"/><line x1="-16" x2="16" y1="26" y2="26" stroke="#5a4636" stroke-width="5"/><path d="M0 -24 l-14 -6 M0 -24 l14 -6 M0 -10 l-14 -6 M0 -10 l14 -6" stroke="#5a4636" stroke-width="4"/>`,
    door: `<rect x="-20" y="-30" width="40" height="58" rx="2" fill="#8b5a2b" ${S_}/><circle cx="12" cy="0" r="3" fill="#e1b84a"/>`
  }[kind] || `<circle r="20" fill="#ccc" ${S_}/>`;
  return `<g transform="translate(${x},${y})">${d}</g>`;
}
function floorPattern(kind, col) {
  if (kind === "wood") return Array.from({ length: 12 }, (_, i) => `<line x1="20" x2="780" y1="${20 + i * 40}" y2="${20 + i * 40}" stroke="#000" stroke-opacity=".08"/>`).join("");
  if (kind === "tiles") return Array.from({ length: 20 }, (_, i) => `<line x1="${20 + i * 40}" x2="${20 + i * 40}" y1="20" y2="460" stroke="#000" stroke-opacity=".07"/>`).join("") + Array.from({ length: 12 }, (_, i) => `<line x1="20" x2="780" y1="${20 + i * 40}" y2="${20 + i * 40}" stroke="#000" stroke-opacity=".07"/>`).join("");
  if (kind === "metal") return Array.from({ length: 60 }, (_, i) => `<circle cx="${40 + (i % 12) * 64}" cy="${40 + Math.floor(i / 12) * 90}" r="2" fill="#000" fill-opacity=".15"/>`).join("");
  if (kind === "grass") return Array.from({ length: 70 }, (_, i) => { const x = 30 + (i * 97) % 740, y = 30 + (i * 53) % 420; return `<path d="M${x} ${y} l3 -8 l3 8" stroke="#2d6a2d" stroke-opacity=".25" fill="none"/>`; }).join("");
  return `<rect x="70" y="60" width="660" height="360" rx="30" fill="#000" fill-opacity=".06"/>`;
}
const dark = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 < 120; };
function roomSVG(w, ri, opts = {}) {
  const t = TPL.find(x => x.id === w.tpl), [name, col, fl, loci] = t.rooms[ri], lay = L5[ri % 4];
  const dk = dark(col), txt = dk ? "#f3f1ea" : "#24232b";
  let o = `<svg viewBox="0 0 800 480" role="img" aria-label="${esc(name)}"><rect x="0" y="0" width="800" height="480" rx="14" fill="#3b3a44"/><rect x="14" y="14" width="772" height="452" rx="6" fill="${col}"/>${floorPattern(fl, col)}`;
  // doors: left = previous room, right = next room
  if (ri > 0) o += `<g data-go-room="${ri - 1}" style="cursor:pointer"><rect x="0" y="200" width="18" height="80" fill="${col}"/><text x="26" y="190" fill="${txt}" font-size="12" font-family="var(--f-mono)">← ${esc(t.rooms[ri - 1][0])}</text></g>`;
  if (ri < 7) { const locked = ri + 1 >= w.unlocked;
    o += `<g data-go-room="${ri + 1}" style="cursor:pointer"><rect x="782" y="200" width="18" height="80" fill="${locked ? "#3b3a44" : col}"/>${locked ? `<rect x="776" y="200" width="10" height="80" fill="#c9a227"/>` : ""}<text x="774" y="190" text-anchor="end" fill="${txt}" font-size="12" font-family="var(--f-mono)">${locked ? "Locked" : esc(t.rooms[ri + 1][0]) + " →"}</text></g>`; }
  o += `<text x="34" y="46" fill="${txt}" font-size="22" font-weight="700" font-family="var(--f-ui)">${esc(name)}</text>`;
  loci.forEach(([ln, kind], li) => {
    const [x, y] = lay[li], id = (w.place || {})[ri + ":" + li];
    const sel = opts.sel === li, hide = opts.hide === li;
    o += `<g data-locus="${li}" style="cursor:pointer">`;
    if (sel) o += `<circle cx="${x}" cy="${y}" r="56" fill="#fff" fill-opacity=".35" stroke="#2347c5" stroke-width="3"/>`;
    o += icon(kind, x, y) + `<text x="${x}" y="${y + 48}" text-anchor="middle" fill="${txt}" font-size="13" font-family="var(--f-ui)" font-weight="500">${esc(ln)}</text>`;
    if (id) { const lab = hide ? "? ? ?" : pinLabel(id); const tw = Math.max(64, lab.length * 7.4 + 16);
      o += `<g transform="translate(${x + 26},${y - 46})"><rect width="${tw}" height="22" rx="5" fill="#ffe56b" stroke="#2b2a33" stroke-width="1.5"/><text x="8" y="15.5" font-size="12.5" font-weight="600" font-family="var(--f-ui)" fill="#1d1c22">${esc(lab)}</text>${!hide && hasDue(id) ? `<circle cx="${tw - 4}" cy="2" r="5" fill="#e0a800" stroke="#2b2a33"/>` : ""}</g>`; }
    else if (!opts.walk) o += `<text x="${x + 30}" y="${y - 30}" fill="${txt}" fill-opacity=".45" font-size="18" font-family="var(--f-ui)">+</text>`;
    o += `</g>`;
  });
  if (opts.avatar != null) { const [x, y] = opts.avatar >= 0 ? lay[opts.avatar] : [70, 400]; const ax = opts.avatar >= 0 ? x - 52 : x, ay = opts.avatar >= 0 ? y + 10 : y;
    o += `<g transform="translate(${ax},${ay})" class="avatar"><circle cy="-22" r="9" fill="#2347c5" stroke="#fff" stroke-width="2"/><path d="M-11 12 Q-12 -10 0 -11 Q12 -10 11 12Z" fill="#2347c5" stroke="#fff" stroke-width="2"/></g>`; }
  return o + `</svg>`;
}
function miniMap(w, cur) {
  const t = TPL.find(x => x.id === w.tpl), pos = i => i < 4 ? [i, 0] : [7 - i, 1];
  let o = `<svg viewBox="0 0 300 130" aria-label="Wing map">`;
  const pts = Array.from({ length: 8 }, (_, i) => { const [x, y] = pos(i); return [20 + x * 70 + 30, 15 + y * 60 + 22]; });
  o += `<polyline points="${pts.slice(0, w.unlocked).map(p => p.join(",")).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 3"/>`;
  t.rooms.forEach((r, i) => { const [x, y] = pos(i), open = i < w.unlocked, n = Object.keys(w.place || {}).filter(k => +k.split(":")[0] === i).length;
    o += `<g data-go-room="${i}" style="cursor:${open ? "pointer" : "default"}"><rect x="${20 + x * 70}" y="${15 + y * 60}" width="60" height="44" rx="5" fill="${open ? r[1] : "transparent"}" stroke="${i === cur ? "var(--accent)" : "var(--line)"}" stroke-width="${i === cur ? 3 : 1.5}" ${open ? "" : 'stroke-dasharray="4 3"'}/>
      <text x="${50 + x * 70}" y="${41 + y * 60}" text-anchor="middle" font-size="10" font-family="var(--f-mono)" fill="${open ? (dark(r[1]) ? "#fff" : "#222") : "var(--muted)"}">${open ? i + 1 + (n ? " · " + n : "") : "locked"}</text></g>`; });
  return o + `</svg>`;
}
/* views */
function renderPalace() {
  const P = pal();
  if (S.wing != null && P.wings[S.wing]) return renderWing();
  const np = processedRecs().length, placed = placedMap().size;
  $("#pTitle").textContent = "Memory palace"; $("#pSub").textContent = `${P.wings.length} wing${P.wings.length === 1 ? "" : "s"} · ${placed} papers placed`;
  const used = new Set(P.wings.map(w => w.topic.toLowerCase()));
  const topics = allTopics().filter(t => !used.has(t.toLowerCase()));
  const cost = P.wings.length ? WING_COST : 0;
  $("#main").innerHTML = `<section class="view">
    <button class="linkbtn" type="button" data-act="tolib">← Library</button>
    <div class="libhead" style="margin-top:12px"><div><div class="eyebrow">Memory palace</div><h2>A building you can walk through, one wing per topic</h2>
      <p class="lede">Each wing has 8 rooms along a fixed route, each room 5 distinct spots. Earn points in Review to open the next room. Put the papers you want to know cold here; everything else stays in the library.</p></div>
      <div class="palstats"><div class="stat"><b>${balance()}</b><span>points to spend</span></div><div class="stat"><b>${placed}/${np}</b><span>carded papers placed</span></div>${dueItems().length ? `<button class="btn primary" type="button" data-act="review">Earn points · ${dueItems().length} due</button>` : ""}</div></div>
    <div class="tlist">${P.wings.map((w, i) => { const t = TPL.find(x => x.id === w.tpl), n = Object.keys(w.place || {}).length;
      const m = n ? Object.values(w.place).reduce((a, id) => a + mastery(id), 0) / n : 0;
      return `<button type="button" class="tcard" data-wing="${i}" style="border-left:6px solid ${t.rooms[0][1]}"><span class="tn">${esc(w.topic)}</span><span class="tm">${esc(t.name)} · ${w.unlocked}/8 rooms · ${n}/${w.unlocked * 5} spots filled</span><span class="tm">Learned: ${Math.round(m * 100)}%</span></button>`; }).join("")}
      <div class="tcard" style="cursor:default"><span class="tn">New wing</span>
        ${topics.length ? `<label class="note">Topic<select class="sort" id="nwTopic" style="width:100%;margin-top:4px">${topics.map(t => `<option>${esc(t)}</option>`).join("")}</select></label>` : `<label class="note">Topic name<input class="search" id="nwTopicNew" placeholder="e.g. whisker premotor" style="width:100%;margin-top:4px"></label>`}
        <label class="note">Building<select class="sort" id="nwTpl" style="width:100%;margin-top:4px">${TPL.map(t => `<option value="${t.id}" ${P.wings.some(w => w.tpl === t.id) ? "" : ""}>${esc(t.name)}${P.wings.some(w => w.tpl === t.id) ? " (in use)" : ""}</option>`).join("")}</select></label>
        <button class="btn ${balance() >= cost ? "primary" : ""}" type="button" data-act="newwing">${cost ? `Build for ${cost} pts` : "Build your first wing (free)"}</button>
        <span class="tm">Use a different building per topic so wings don't blur together.</span></div>
    </div>
    ${!np ? `<div class="card" style="margin-top:16px"><p class="note" style="margin:0">Only papers with a card can move in. Write one in step 4 of the reader.</p></div>` : ""}
  </section>`;
  const sel = $("#nwTpl"); if (sel) { const free = TPL.find(t => !P.wings.some(w => w.tpl === t.id)); if (free) sel.value = free.id; }
}
function renderWing() {
  const P = pal(), w = P.wings[S.wing], t = TPL.find(x => x.id === w.tpl);
  S.room = Math.min(S.room || 0, w.unlocked - 1);
  const ri = S.room, room = t.rooms[ri], W = S.walk;
  $("#pTitle").textContent = `${w.topic} wing`; $("#pSub").textContent = `${t.name} · room ${ri + 1} of 8 · ${room[0]}`;
  const sel = W ? W.seq[W.i][1] : S.locus;
  const svg = roomSVG(w, ri, { sel, hide: W && !W.shown ? W.seq[W.i][1] : null, walk: !!W, avatar: W ? W.seq[W.i][1] : (S.locus != null ? S.locus : -1) });
  const nextCost = roomUnlockCost(w);
  let side = "";
  if (W) {
    const [r2, li] = W.seq[W.i], id = w.place[r2 + ":" + li], c = recOf(id)?.card;
    side = `<div class="box"><h3><span>Walking the wing</span><span class="mono" style="text-transform:none;letter-spacing:0">${W.i + 1} / ${W.seq.length}</span></h3>
      <div class="rvq" style="font-size:18px">What's on the ${esc(room[3][li][0].toLowerCase())}?</div>
      <p class="note">Lab, year and what they found.</p>
      ${W.shown ? `${c ? onelinerHTML(c) : ""}<div class="grades" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px"><button class="grade g1" type="button" data-walk="0">Missed<span>0</span></button><button class="grade g3" type="button" data-walk="1">Got it<span>+1 pt</span></button></div><p class="note">Points count once per spot per day.</p>`
      : `<textarea id="walkIn" placeholder="Recall it, then reveal"></textarea><div style="margin-top:8px;display:flex;gap:8px"><button class="btn primary" type="button" data-act="walk-reveal">Reveal</button><button class="btn ghost" type="button" data-act="walk-stop">Stop</button></div><p class="note">Keys: Enter to reveal, 1 = missed, 2 = got it.</p>`}</div>`;
  } else if (S.locus != null) {
    const li = S.locus, id = (w.place || {})[ri + ":" + li], rec = id && recOf(id);
    const pm = placedMap(), avail = processedRecs().filter(r => !pm.has(r.id));
    const inTopic = avail.filter(r => (r.tags || []).some(x => x.toLowerCase() === w.topic.toLowerCase())), other = avail.filter(r => !inTopic.includes(r));
    const opt = r => `<button type="button" data-place="${esc(r.id)}"><strong>${esc(r.card.lab)}</strong> ${esc(r.card.year || "")} · ${esc(r.card.finding)}</button>`;
    side = `<div class="box"><h3><span>${esc(room[3][li][0])}</span><span class="mono" style="text-transform:none;letter-spacing:0">${esc(room[0])}</span></h3>
      ${rec?.card ? `${onelinerHTML(rec.card)}<div style="display:flex;gap:12px;margin-top:6px"><button type="button" class="linkbtn" data-record="${esc(id)}" style="font-size:12px">Read-back</button><button type="button" class="linkbtn" data-unpin="${esc(id)}" style="font-size:12px">Move out</button></div>`
        : `<p class="note" style="margin:0 0 8px">Empty spot. Picture the paper's finding happening right here, on the ${esc(room[3][li][0].toLowerCase())}.</p>
          ${inTopic.length ? `<div class="eyebrow" style="margin:6px 0">In this topic</div><div class="tray">${inTopic.map(opt).join("")}</div>` : ""}
          ${other.length ? `<div class="eyebrow" style="margin:12px 0 6px">Other carded papers <span style="text-transform:none;letter-spacing:0">(adds the topic)</span></div><div class="tray">${other.map(opt).join("")}</div>` : ""}
          ${!avail.length ? `<p class="note">No carded papers left to place. Write a card in step 4 of the reader.</p>` : ""}`}</div>`;
  } else {
    side = `<div class="box"><h3><span>${esc(room[0])}</span></h3><p class="note" style="margin:0">Click a spot to place a paper or see what's there. Walk with ← → between rooms, ↑ ↓ between spots.</p></div>`;
  }
  const canNext = ri === w.unlocked - 1 && w.unlocked < 8;
  $("#main").innerHTML = `<section class="view">
    <button class="linkbtn" type="button" data-act="palhome">← All wings</button>
    <div class="pal"><div style="display:flex;flex-direction:column;gap:10px;min-width:0">
      <div class="palmap" id="roomview">${svg}</div>
      <div class="rvbar"><span>${esc(room[0])} · room ${ri + 1} of 8</span>
        <span style="display:flex;gap:8px;flex-wrap:wrap">${ri > 0 ? `<button class="btn" type="button" data-go-room="${ri - 1}">← ${esc(t.rooms[ri - 1][0])}</button>` : ""}
        ${ri < w.unlocked - 1 ? `<button class="btn" type="button" data-go-room="${ri + 1}">${esc(t.rooms[ri + 1][0])} →</button>` : ""}
        ${canNext ? `<button class="btn ${balance() >= nextCost ? "primary" : ""}" type="button" data-act="unlockroom">Open ${esc(t.rooms[ri + 1][0])} · ${nextCost} pts</button>` : ""}
        ${!W && Object.keys(w.place || {}).length ? `<button class="btn" type="button" data-act="walk">Walk the wing</button>` : ""}</span></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="box" style="padding:10px"><div class="palstats" style="justify-content:space-between;margin-bottom:6px"><div class="stat"><b>${balance()}</b><span>points</span></div><div class="stat"><b>${Object.keys(w.place || {}).length}/${w.unlocked * 5}</b><span>spots filled</span></div></div>${miniMap(w, ri)}</div>
      ${side}
    </div></div></section>`;
}
function newWing() {
  const P = pal(), cost = P.wings.length ? WING_COST : 0;
  const topic = ($("#nwTopic")?.value || $("#nwTopicNew")?.value || "").trim();
  if (!topic) { toast("Name the topic for this wing."); return; }
  if (balance() < cost) { toast(`You need ${cost - balance()} more points. Review due cards to earn them.`); return; }
  P.spent += cost; P.wings.push({ topic, tpl: $("#nwTpl").value, unlocked: 1, at: Date.now(), place: {}, walked: {} });
  savePalace(); S.wing = P.wings.length - 1; S.room = 0; S.locus = null; renderPalace();
}
function unlockNext() {
  const w = pal().wings[S.wing], cost = roomUnlockCost(w);
  if (balance() < cost) { toast(`You need ${cost - balance()} more points. Review due cards to earn them.`); return; }
  pal().spent += cost; w.unlocked++; savePalace(); S.room = w.unlocked - 1; S.locus = null; renderPalace();
  toast(`${TPL.find(t => t.id === w.tpl).rooms[S.room][0]} is open. Look around before you fill it.`);
}
function placePaper(id) {
  const w = pal().wings[S.wing]; w.place = w.place || {}; w.place[S.room + ":" + S.locus] = id;
  const r = recOf(id); if (r && !(r.tags || []).some(x => x.toLowerCase() === w.topic.toLowerCase())) {
    const tags = [...(r.tags || []), w.topic]; patchRec(id, { tags });
    const k = topicKey(w.topic); if (D.col && !D.topics.has(k)) { const v = { kind: "topic", name: w.topic, created: Date.now() }; D.topics.set(k, v); enqueue(k, () => D.col.doc(k).set(v)); }
  }
  savePalace(); renderPalace();
}
function startWalk() {
  const w = pal().wings[S.wing], seq = [];
  for (let ri = 0; ri < w.unlocked; ri++) for (let li = 0; li < 5; li++) if ((w.place || {})[ri + ":" + li]) seq.push([ri, li]);
  if (!seq.length) return;
  S.walk = { seq, i: 0, shown: false }; S.room = seq[0][0]; S.locus = null; renderPalace();
}
function walkGrade(v) {
  const W = S.walk, w = pal().wings[S.wing], k = W.seq[W.i].join(":"), today = new Date().toDateString();
  w.walked = w.walked || {};
  if (v && w.walked[k] !== today) { pal().pts += 1; toast("+1 pt"); }
  w.walked[k] = today; savePalace();
  W.i++; W.shown = false;
  if (W.i >= W.seq.length) { S.walk = null; S.locus = null; toast("Walk finished"); } else S.room = W.seq[W.i][0];
  renderPalace();
}
