"use strict";
/* ---------- example paper (fictional) ---------- */
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function fig1SVG() {
  const r = rng(7); let ras = "";
  for (let t = 0; t < 22; t++) { const y = 352 + t * 9.5;
    for (let k = 0; k < 26; k++) { let x = 70 + r() * 340; if (r() < .55) x = 250 + (r() - .65) * 90; if (x < 70 || x > 410) continue; ras += `M${x.toFixed(1)} ${y}v7`; } }
  let psth = "", band = "", bandb = "";
  for (let i = 0; i <= 60; i++) { const t = -400 + i * (800 / 60); const fr = 22 + 34 * Math.exp(-Math.pow((t + 70) / 110, 2)) * (t < 40 ? 1 : .7) - (t > 150 ? 6 : 0);
    const x = 530 + (t + 400) / 800 * 330, y = 300 - fr * 3.2; psth += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); band += (i ? "L" : "M") + x.toFixed(1) + " " + (y - 9).toFixed(1); bandb = "L" + x.toFixed(1) + " " + (y + 9).toFixed(1) + bandb; }
  let sc = ""; const r2 = rng(19);
  for (let k = 0; k < 70; k++) { const a = r2(), xv = 60 + a * 260, yv = 80 + a * 230 + (r2() - .5) * 120; const x = 530 + (xv - 40) / 300 * 330, y = 600 - (yv - 40) / 360 * 240; if (y < 360 || y > 600) continue; sc += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640" font-family="Helvetica,Arial,sans-serif" font-size="13">
<rect width="900" height="640" fill="#fff"/>
<g font-weight="700" font-size="20" fill="#111"><text x="16" y="34">A</text><text x="476" y="34">B</text><text x="16" y="344" fill="none"></text></g>
<g transform="translate(0,0)">
 <rect x="50" y="70" width="360" height="210" rx="10" fill="#f3f5f9" stroke="#c9d1de"/>
 <ellipse cx="160" cy="170" rx="70" ry="48" fill="#e2e7f0" stroke="#7d8798"/><path d="M110 160 q50 -60 110 -10" fill="none" stroke="#7d8798"/>
 <circle cx="180" cy="168" r="9" fill="#f2b84b" stroke="#a46a00"/><text x="152" y="208" fill="#333">IN</text>
 <path d="M180 60 V160" stroke="#333" stroke-width="3"/><text x="188" y="78" fill="#333">probe</text>
 <path d="M230 200 q60 10 100 -20" fill="none" stroke="#333" stroke-width="5" stroke-linecap="round"/><circle cx="345" cy="172" r="9" fill="#a8742c"/><text x="318" y="152" fill="#333">pellet</text>
 <g transform="translate(70,248)" fill="#333"><path d="M0 0H320" stroke="#333"/><path d="M20 -6v12M150 -6v12M250 -6v12" stroke="#333" stroke-width="2"/><text x="6" y="24">cue</text><text x="128" y="24">reach</text><text x="230" y="24">grasp</text></g>
</g>
<g><text x="520" y="62" fill="#333">Example unit, aligned to grasp</text>
 <path d="M530 74V280H860" fill="none" stroke="#333"/>
</g>
<text x="16" y="344" font-weight="700" font-size="20">C</text><text x="476" y="344" font-weight="700" font-size="20">D</text>
<g fill="#111"><path d="${ras}" stroke="#111" stroke-width="1.6" transform="translate(470,-282)"/></g>
<path d="M694 74V280" stroke="#d33" stroke-dasharray="4 3" />
<g font-size="12" fill="#333"><text x="526" y="298">−400</text><text x="688" y="298">0</text><text x="842" y="298">400 ms</text><text x="520" y="120" transform="rotate(-90 520 120)" text-anchor="end">trials</text></g>
<g transform="translate(-470,316)">
 <path d="M530 0V300H860" fill="none" stroke="#333" transform="translate(0,-16)"/>
 <path d="${band}${bandb}Z" fill="#2c6bd6" opacity=".18" transform="translate(0,-16)"/>
 <path d="${psth}" fill="none" stroke="#2c6bd6" stroke-width="2.5" transform="translate(0,-16)"/>
 <path d="M694 0V284" stroke="#d33" stroke-dasharray="4 3"/>
 <g font-size="12" fill="#333"><text x="526" y="302">−400</text><text x="688" y="302">0</text><text x="830" y="302">400 ms</text><text x="510" y="110" transform="rotate(-90 510 110)" text-anchor="middle">rate (Hz)</text><text x="560" y="20">n = 81 ramping units</text></g>
</g>
<g transform="translate(0,0)">
 <path d="M530 360V600H860" fill="none" stroke="#333"/>
 <g fill="#2c6bd6" opacity=".75">${sc}</g>
 <path d="M540 584L855 382" stroke="#111" stroke-width="2"/>
 <text x="760" y="420" fill="#111">r = 0.62</text>
 <g font-size="12" fill="#333"><text x="640" y="626">ramp onset lead (ms)</text><text x="514" y="560" transform="rotate(-90 514 560)">grasp latency (ms)</text></g>
</g>
</svg>`;
}
function fig2SVG() {
  const hist = (cx, mu, sd, col, seed) => { const r = rng(seed); const bins = new Array(16).fill(0);
    for (let k = 0; k < 400; k++) { const u = (r() + r() + r() + r() - 2) * sd * 1.7 + mu; const b = Math.floor((u - 150) / 18); if (b >= 0 && b < 16) bins[b]++; }
    return bins.map((v, i) => `<rect x="${cx + i * 20}" y="${290 - v * 2.6}" width="17" height="${v * 2.6}" fill="${col}" opacity=".7"/>`).join(""); };
  let pairs = ""; const r = rng(31);
  for (let m = 0; m < 9; m++) { const a = 0.78 + r() * 0.15, b = a - 0.12 - r() * 0.14; const y1 = 600 - a * 230, y2 = 600 - b * 230;
    pairs += `<path d="M110 ${y1.toFixed(1)}L300 ${y2.toFixed(1)}" stroke="#888"/><circle cx="110" cy="${y1.toFixed(1)}" r="4.5" fill="#111"/><circle cx="300" cy="${y2.toFixed(1)}" r="4.5" fill="#21a05a"/>`; }
  const pw = [0, 2, 5, 10, 15], dA = [2, 12, 24, 36, 41], dC = [1, 2, 0, 3, 2];
  const px = p => 560 + p / 15 * 290, py = d => 590 - d / 50 * 220;
  const line = (arr, col) => `<path d="${arr.map((d, i) => (i ? "L" : "M") + px(pw[i]) + " " + py(d)).join("")}" fill="none" stroke="${col}" stroke-width="2.5"/>` + arr.map((d, i) => `<circle cx="${px(pw[i])}" cy="${py(d)}" r="5" fill="${col}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640" font-family="Helvetica,Arial,sans-serif" font-size="13">
<rect width="900" height="640" fill="#fff"/>
<g font-weight="700" font-size="20" fill="#111"><text x="16" y="34">A</text><text x="476" y="34">B</text><text x="16" y="344">C</text><text x="476" y="344">D</text></g>
<g fill="#333">
 <rect x="50" y="70" width="360" height="200" rx="10" fill="#f3f5f9" stroke="#c9d1de"/>
 <text x="70" y="100" font-weight="700">ArchT → IN</text><text x="70" y="120">532 nm, cue → +500 ms</text><text x="70" y="140">30% of trials, random</text>
 <path d="M70 220H390" stroke="#333"/><rect x="130" y="196" width="150" height="16" fill="#21a05a" opacity=".8"/><text x="170" y="190" font-size="12">light</text>
 <path d="M130 214v12" stroke="#333" stroke-width="2"/><text x="118" y="244">cue</text><text x="250" y="244">+500 ms</text>
</g>
<g>${hist(540, 300, 28, "#111", 3)}${hist(540, 338, 40, "#21a05a", 5)}
 <path d="M530 70V290H870" fill="none" stroke="#333"/>
 <g font-size="12" fill="#333"><text x="535" y="310">150</text><text x="840" y="310">450 ms</text><text x="640" y="326">grasp onset after cue</text>
 <rect x="740" y="80" width="10" height="10" fill="#111" opacity=".7"/><text x="756" y="90">light off</text><rect x="740" y="98" width="10" height="10" fill="#21a05a" opacity=".7"/><text x="756" y="108">light on</text></g>
</g>
<g><path d="M70 370V600H340" fill="none" stroke="#333"/>${pairs}
 <g font-size="12" fill="#333"><text x="90" y="622">light off</text><text x="280" y="622">light on</text><text x="56" y="520" transform="rotate(-90 56 520)">success rate</text><text x="40" y="378">1.0</text><text x="40" y="600">0.0</text></g>
</g>
<g><path d="M550 370V600H870" fill="none" stroke="#333"/>${line(dA, "#21a05a")}${line(dC, "#9aa0a6")}
 <g font-size="12" fill="#333"><text x="660" y="626">light power (mW)</text><text x="536" y="540" transform="rotate(-90 536 540)">grasp delay (ms)</text>
 <text x="790" y="412" fill="#21a05a">ArchT</text><text x="790" y="572" fill="#7a8088">GFP</text></g>
</g>
</svg>`;
}
const svgURL = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
const Q = (x0, y0, x1, y1) => ({ x: x0 / 900, y: y0 / 640, w: (x1 - x0) / 900, h: (y1 - y0) / 640 });
const DEMO = {
  id: "demo", demo: true,
  title: "Interpositus nucleus activity anticipates grasp timing in reaching mice",
  sub: "Example paper · fictional, for trying the reader",
  abstract: "Skilled reaching ends with a precisely timed grasp, but how the cerebellar nuclei contribute to that timing on individual trials is unclear. We recorded interpositus nucleus (IN) neurons in head-fixed mice performing a cued pellet-reaching task. A subset of IN neurons ramped up before grasp onset, and the onset of this ramp predicted grasp latency trial by trial. Optogenetic suppression of IN delayed grasp onset and made it more variable, in proportion to light power, without affecting reach initiation. These results suggest that IN output sets when the hand closes rather than whether a reach starts.",
  sections: {
    intro: [
      "Reaching to grasp an object requires that hand closure be timed to the moment the hand arrives. Small timing errors are costly: closing too early knocks the object away, closing too late lets it slip. The cerebellum has long been implicated in movement timing, and lesions of the interpositus nucleus (IN) produce dysmetric reaches and delayed, poorly shaped grasps [1–3].",
      "IN neurons are active during reaching, and their firing is shaped by Purkinje cell inhibition from the intermediate cerebellar cortex [4,5]. Most work, however, has related IN activity to reach kinematics averaged across trials. It remains unclear whether IN activity carries trial-by-trial information about when the grasp will occur, and whether that activity is required for grasp timing specifically or for executing the reach as a whole.",
      "Here we combined extracellular recordings and optogenetic suppression of IN in head-fixed mice trained to reach for a food pellet after an auditory cue. We hypothesized that if IN output sets grasp timing, its activity should precede and predict grasp onset, and suppressing it should delay grasp onset while leaving reach initiation intact."
    ],
    results: [
      "We trained head-fixed mice (n = 9) to reach for a food pellet after an auditory cue and recorded IN units with silicon probes (Fig. 1A). Of 214 well-isolated units, 81 (38%) increased their firing before grasp onset. In single units this increase was visible across trials as a dense band of spikes preceding hand closure (Fig. 1B). At the population level, firing rose about 120 ms before grasp onset and peaked shortly before it (Fig. 1C).",
      "On individual trials, the onset of this ramp predicted when the grasp occurred: earlier ramps went with shorter grasp latencies (Fig. 1D; r = 0.62, p < 0.001, linear mixed model with mouse as random effect). Ramp onset was not correlated with peak reach velocity (r = 0.08), indicating that the relationship was specific to grasp timing. The relationship held when trials were aligned to reach start instead of the cue (Fig. 1C, D).",
      "To test whether this activity is required, we expressed the inhibitory opsin ArchT in IN and delivered light from cue onset to 500 ms after it on a random 30% of trials (Fig. 2A). Light shifted grasp onset later by 38 ± 9 ms and broadened its distribution (Fig. 2B). Reach success fell in every mouse (Fig. 2C), whereas the latency to reach initiation did not change (Fig. 2B, C; paired t-test, p = 0.41).",
      "The delay scaled with light power (Fig. 2D), arguing against a non-specific effect of illumination or heating. In mice expressing only GFP, light had no effect on grasp timing at any power (Fig. 2D, grey)."
    ],
    discussion: [
      "Our results indicate that IN activity anticipates grasp onset on single trials (Fig. 1D) and that suppressing IN delays and disperses grasp timing without affecting reach initiation (Figs. 2B–D). Together these point to IN output as a timing signal for hand closure rather than a general drive for reaching.",
      "Several caveats apply. ArchT suppression can be followed by rebound firing, which might itself perturb movements late in the trial. Head fixation constrains posture and may exaggerate the role of forelimb timing signals. Finally, the correlation in Fig. 1D does not establish that ramp onset sets grasp timing; it could also reflect a shared upstream timing signal, which the optogenetic experiment addresses only partly."
    ],
    methods: [
      "Animals. Nine adult C57BL/6J mice of both sexes were used for recordings and 7 for optogenetics (4 ArchT, 3 GFP). Mice were food-restricted to 85–90% of baseline weight.",
      "Behavior. Mice were trained to reach for a 20 mg pellet within 2 s of a 6 kHz tone. Grasp onset was defined as the first frame of digit closure in 500 Hz video, labeled with pose estimation and verified by hand.",
      "Recordings. Units were recorded with 64-channel silicon probes and sorted offline. Ramping units were defined as those whose rate in the 200 ms before grasp exceeded baseline by 3 s.d. Ramp onset was detected per trial with a change-point method.",
      "Optogenetics. AAV-ArchT-GFP or AAV-GFP was injected bilaterally in IN; 200 µm fibres were implanted above IN. Light power was 2–15 mW at the fibre tip.",
      "Statistics. Trial-level relationships were tested with linear mixed models with mouse as a random effect. Paired comparisons across mice used paired t-tests. Data are mean ± s.e.m."
    ]
  },
  figures: [
    { n: 1, img: svgURL(fig1SVG()),
      legend: "Figure 1. IN activity anticipates grasp onset. (A) Task schematic: a head-fixed mouse reaches for a pellet after an auditory cue while a silicon probe records from IN. (B) Raster of an example IN unit aligned to grasp onset (t = 0); trials sorted by reach duration. (C) Population firing rate of ramping units (mean ± s.e.m., n = 81) aligned to grasp onset. (D) Ramp onset lead vs. grasp latency across trials from all mice; line, linear fit.",
      panels: [{ label: "A", ...Q(8, 8, 448, 300) }, { label: "B", ...Q(468, 8, 892, 300) }, { label: "C", ...Q(8, 318, 448, 636) }, { label: "D", ...Q(468, 318, 892, 636) }] },
    { n: 2, img: svgURL(fig2SVG()),
      legend: "Figure 2. Suppressing IN delays and disperses grasp timing. (A) Optogenetic design: ArchT in IN; 532 nm light from cue onset to +500 ms on 30% of trials. (B) Distribution of grasp onset after the cue on light-off (black) and light-on (green) trials, pooled across ArchT mice. (C) Reach success per mouse with light off and on; lines join the same mouse. (D) Grasp delay as a function of light power in ArchT (green) and GFP control (grey) mice.",
      panels: [{ label: "A", ...Q(8, 8, 448, 300) }, { label: "B", ...Q(468, 8, 892, 330) }, { label: "C", ...Q(8, 318, 448, 636) }, { label: "D", ...Q(468, 330, 892, 636) }] }
  ],
  primer: {
    field: "Cerebellar control of skilled reaching",
    background: ["Grasping needs hand closure timed to when the hand reaches the object.", "The cerebellum is implicated in movement timing; IN lesions cause dysmetric reaches and delayed grasps.", "IN neurons fire during reaching under Purkinje cell inhibition.", "Prior work linked IN activity to trial-averaged kinematics, not to single-trial timing."],
    gap: "Whether IN activity predicts grasp timing on individual trials, and whether it is needed for timing specifically or for the reach as a whole.",
    goal: "Test whether IN activity anticipates grasp onset trial by trial and whether suppressing IN selectively delays the grasp.",
    coreQuestion: "Does interpositus nucleus output set when the hand closes during a reach?",
    hypothesis: "IN activity precedes and predicts grasp onset; suppressing IN delays the grasp but not reach initiation.",
    approach: "Silicon-probe recordings in IN during a cued pellet reach, plus trial-wise ArchT suppression at several light powers with GFP controls.",
    keyTerms: [{ term: "IN", definition: "Interpositus nucleus, a deep cerebellar nucleus projecting to motor thalamus and red nucleus." }, { term: "Ramp onset", definition: "The time on a given trial at which a unit's firing starts to rise above baseline." }, { term: "ArchT", definition: "A light-driven proton pump that silences neurons when illuminated (green light)." }, { term: "Grasp latency", definition: "Time from the cue to the first frame of digit closure." }]
  },
  briefs: {
    1: { question: "Does IN activity precede the grasp, and does it predict its timing on single trials?", claim: "A ramp in IN firing starts ~120 ms before grasp onset and earlier ramps go with earlier grasps.", read: [{ panel: "A", what: "Task and recording setup." }, { panel: "B", what: "One unit: spikes bunch before t = 0 (grasp)." }, { panel: "C", what: "Population average: rise before grasp." }, { panel: "D", what: "Key result: trial-level correlation, r = 0.62." }], scrutinize: ["Panel D pools trials across mice; check the mixed model, not the raw scatter.", "Ramp-unit selection uses pre-grasp firing, which can bias the population average in C.", "Correlation leaves open a shared upstream timing signal."] },
    2: { question: "Is IN activity required for timing the grasp, specifically?", claim: "Suppressing IN delays and broadens grasp onset in a dose-dependent way, leaving reach initiation intact.", read: [{ panel: "A", what: "When and how light was delivered." }, { panel: "B", what: "Grasp onset shifts later and widens with light." }, { panel: "C", what: "Success drops in every mouse." }, { panel: "D", what: "Dose-response; GFP control flat." }], scrutinize: ["n = 4 ArchT mice; pooled histograms in B can hide between-mouse variability.", "Light spans cue to +500 ms, so it covers reach and grasp; the selectivity rests on the initiation measure.", "Rebound firing after ArchT is not measured."] }
  }
};

