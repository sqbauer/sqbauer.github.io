/* Mouse brain atlas for the reading mode: brain regions named in a paper become tappable and open a coronal and a
   sagittal section with the region highlighted.
   Sections: brain-sections (sqbauer.github.io/brain-sections), vector outlines derived from the Allen Mouse Brain
   Common Coordinate Framework v3, (c) Allen Institute (Wang et al. 2020, Cell). Bundled in www/atlas by
   scripts/atlas.mjs, so this works offline. */

const ATL = { idx: null, ready: null, kids: null, lin: new Map(), secs: new Map(), terms: null };
const ATL_BREGMA_AP = 5400, ATL_MIDLINE = 5695, ATL_DORR_AP = 1.087;   // as in brain-sections (iblatlas conventions)
const ATL_CITE = "Sections from brain-sections (S. Bauer), derived from the Allen Mouse Brain Common Coordinate Framework v3, © Allen Institute (Wang et al. 2020, Cell 181:936).";

/* Names people use for regions, mapped to Allen acronyms (several acronyms = shown together). Allen's own names
   are matched as well; these add the common alternatives. */
const ATL_SYN = [
  [["lobule simplex", "simplex lobule", "lobulus simplex", "simple lobule"], ["SIM"]],
  [["crus 1", "crus I", "crus1", "crus i", "Crus Ia", "ansiform crus 1"], ["ANcr1"]],
  [["crus 2", "crus II", "crus2", "crus ii", "ansiform crus 2"], ["ANcr2"]],
  [["paramedian lobule", "paramedian lobe"], ["PRM"]],
  [["copula pyramidis", "copula"], ["COPY"]],
  [["paraflocculus"], ["PFL"]], [["flocculus"], ["FL"]],
  [["cerebellar vermis", "vermis"], ["VERM"]],
  [["cerebellar hemisphere", "cerebellar hemispheres", "hemispheric lobules"], ["HEM"]],
  [["cerebellar cortex"], ["CBX"]],
  [["cerebellar nuclei", "deep cerebellar nuclei", "cerebellar nucleus", "deep cerebellar nucleus", "cerebellar output nuclei"], ["CBN"]],
  [["interpositus nucleus", "nucleus interpositus", "interposed nucleus", "interpositus", "anterior interpositus nucleus", "posterior interpositus nucleus"], ["IP"]],
  [["dentate nucleus", "lateral cerebellar nucleus", "lateral nucleus of the cerebellum"], ["DN"]],
  [["fastigial nucleus", "medial cerebellar nucleus", "medial nucleus of the cerebellum"], ["FN"]],
  [["lobule I", "lobule 1"], ["LING"]], [["lobule II", "lobule 2"], ["CENT2"]], [["lobule III", "lobule 3"], ["CENT3"]],
  [["lobules IV-V", "lobules IV–V", "lobule IV", "lobule V", "lobules 4-5", "lobules 4/5", "lobule IV/V"], ["CUL4, 5"]],
  [["lobule VI", "lobule 6"], ["DEC"]], [["lobule VII", "lobule 7"], ["FOTU"]], [["lobule VIII", "lobule 8"], ["PYR"]],
  [["lobule IX", "lobule 9"], ["UVU"]], [["lobule X", "lobule 10"], ["NOD"]],
  [["vestibular nuclei", "vestibular nucleus", "vestibular complex"], ["VNC"]],
  [["inferior olive", "inferior olivary nucleus", "inferior olivary nuclei", "inferior olivary complex", "olivary nucleus"], ["IO"]],
  [["red nucleus"], ["RN"]],
  [["pontine nuclei", "pontine nucleus", "basilar pontine nuclei", "basal pontine nuclei", "pontine grey", "pontine gray"], ["PG"]],
  [["reticulotegmental nucleus", "nucleus reticularis tegmenti pontis", "tegmental reticular nucleus"], ["TRN"]],
  [["lateral reticular nucleus"], ["LRN"]],
  [["facial nucleus", "facial motor nucleus", "facial motor nuclei", "facial nuclei"], ["VII"]],
  [["spinal trigeminal nucleus", "spinal trigeminal nuclei", "spinal nucleus of the trigeminal"], ["SPVO", "SPVI", "SPVC"]],
  [["principal trigeminal nucleus", "principal sensory trigeminal nucleus"], ["PSV"]],
  [["superior colliculus"], ["SCs", "SCm"]],
  [["inferior colliculus"], ["IC"]],
  [["periaqueductal gray", "periaqueductal grey"], ["PAG"]],
  [["zona incerta"], ["ZI"]],
  [["subthalamic nucleus"], ["STN"]],
  [["substantia nigra"], ["SNr", "SNc"]],
  [["substantia nigra pars reticulata"], ["SNr"]], [["substantia nigra pars compacta"], ["SNc"]],
  [["ventral tegmental area"], ["VTA"]],
  [["locus coeruleus", "locus ceruleus"], ["LC"]],
  [["motor cortex"], ["MO"]], [["primary motor cortex", "primary motor area"], ["MOp"]], [["secondary motor cortex", "premotor cortex"], ["MOs"]],
  [["somatosensory cortex"], ["SS"]], [["primary somatosensory cortex"], ["SSp"]], [["secondary somatosensory cortex"], ["SSs"]],
  [["barrel cortex", "barrel field", "whisker barrel cortex", "vibrissal cortex"], ["SSp-bfd"]],
  [["visual cortex"], ["VIS"]], [["primary visual cortex"], ["VISp"]],
  [["auditory cortex"], ["AUD"]], [["primary auditory cortex"], ["AUDp"]],
  [["anterior cingulate cortex", "cingulate cortex"], ["ACA"]],
  [["orbitofrontal cortex"], ["ORB"]], [["retrosplenial cortex"], ["RSP"]], [["insular cortex", "insula"], ["AI"]],
  [["prelimbic cortex"], ["PL"]], [["infralimbic cortex"], ["ILA"]], [["medial prefrontal cortex"], ["PL", "ILA", "ACA"]],
  [["entorhinal cortex"], ["ENT"]], [["perirhinal cortex"], ["PERI"]], [["piriform cortex"], ["PIR"]],
  [["neocortex"], ["Isocortex"]],
  [["hippocampus"], ["HIP"]], [["CA1"], ["CA1"]], [["CA2"], ["CA2"]], [["CA3"], ["CA3"]],
  [["striatum"], ["STR"]], [["dorsal striatum"], ["STRd"]], [["caudate putamen", "caudate-putamen", "caudoputamen"], ["CP"]],
  [["nucleus accumbens"], ["ACB"]], [["globus pallidus"], ["GPe", "GPi"]],
  [["amygdala"], ["LA", "BLA", "BMA", "PA", "CEA", "MEA", "IA", "COA"]],
  [["basolateral amygdala"], ["BLA"]], [["central amygdala", "central nucleus of the amygdala"], ["CEA"]], [["lateral amygdala"], ["LA"]],
  [["lateral habenula"], ["LH"]], [["medial habenula"], ["MH"]],
  [["motor thalamus"], ["VAL", "VM"]], [["ventrolateral thalamus", "ventrolateral thalamic nucleus", "ventral lateral thalamus"], ["VAL"]],
  [["ventromedial thalamus", "ventromedial thalamic nucleus"], ["VM"]],
  [["lateral geniculate nucleus", "dorsal lateral geniculate nucleus"], ["LGd"]], [["medial geniculate nucleus"], ["MG"]],
  [["thalamic reticular nucleus"], ["RT"]], [["mediodorsal thalamus", "mediodorsal nucleus"], ["MD"]],
  [["olfactory bulb"], ["MOB"]], [["brainstem", "brain stem"], ["BS"]], [["pons"], ["P"]], [["medulla oblongata"], ["MY"]],
  [["lateral hypothalamus"], ["LHA"]], [["suprachiasmatic nucleus"], ["SCH"]],
  [["nucleus of the solitary tract", "solitary nucleus"], ["NTS"]],
  [["superior cerebellar peduncle"], ["scp"]], [["middle cerebellar peduncle"], ["mcp"]], [["inferior cerebellar peduncle"], ["icp"]],
  [["cerebral peduncle"], ["cpd"]],
  // abbreviations that are unambiguous in neuroscience text (case-sensitive)
  [["VPM"], ["VPM"]], [["VPL"], ["VPL"]], [["VAL"], ["VAL"]], [["VTA"], ["VTA"]], [["SNr"], ["SNr"]], [["SNc"], ["SNc"]],
  [["PAG"], ["PAG"]], [["ZI"], ["ZI"]], [["STN"], ["STN"]], [["MOp"], ["MOp"]], [["MOs"], ["MOs"]], [["SSp"], ["SSp"]],
  [["mPFC"], ["PL", "ILA", "ACA"]], [["ACC"], ["ACA"]], [["BLA"], ["BLA"]], [["NAc"], ["ACB"]], [["dLGN"], ["LGd"]],
];
const ATL_CS = new Set(["VPM", "VPL", "VAL", "VTA", "SNr", "SNc", "PAG", "ZI", "STN", "MOp", "MOs", "SSp", "mPFC", "ACC", "BLA", "NAc", "dLGN", "CA1", "CA2", "CA3"]);
// Allen names that are ordinary words or too vague to link
const ATL_SKIP = /\blayer\b|related|unassigned|^root$|^fiber tracts$|^ventricular systems$|^pyramid$|^dorsal limb$|^dorsal roots$|^lateral recess$|^Anterior area$|^Nucleus [xy]$|^Magnocellular nucleus$|^Visceral area$|^alveus$|^Basic cell groups|^grooves|^arbor vitae$|^Medulla$/i;

/* A few lines on the regions papers mention most often. Everything else gets its place in the hierarchy and an
   "Explain with Claude" button. */
const ATL_INFO = {
  CB: "Hindbrain structure above the brainstem. Its cortex (molecular, Purkinje cell and granular layers) receives mossy and climbing fibres and sends its only output, Purkinje cell inhibition, to the cerebellar and vestibular nuclei. Involved in motor coordination, timing and learning, and increasingly in non-motor functions.",
  CBX: "The folded cerebellar cortex: molecular layer, Purkinje cell layer and granular layer. Purkinje cells are its sole output neurons and inhibit the cerebellar and vestibular nuclei.",
  VERM: "The midline strip of cerebellar cortex (lobules I–X). Mainly projects through the fastigial nucleus and to the vestibular nuclei; associated with posture, balance, eye movements and autonomic and emotional functions.",
  HEM: "The lateral cerebellar cortex: simple lobule, crus 1 and 2, paramedian lobule, copula pyramidis, paraflocculus and flocculus. Projects mainly through the interposed and dentate nuclei.",
  SIM: "Lobulus simplex: hemispheric lobule lying just behind the primary fissure, lateral to lobule VI. In rodents it receives orofacial and whisker-related inputs and is involved in whisking, licking and eyeblink conditioning.",
  AN: "The ansiform lobule, made up of crus 1 and crus 2, forms a large part of the cerebellar hemisphere.",
  ANcr1: "Crus 1 of the ansiform lobule, in the cerebellar hemisphere behind the simple lobule. In rodents it has prominent orofacial and whisker-related representations and connections with forebrain loops via the cerebellar nuclei and thalamus.",
  ANcr2: "Crus 2 of the ansiform lobule, between crus 1 and the paramedian lobule. Like crus 1, it is linked to orofacial and whisker-related sensorimotor processing in rodents.",
  PRM: "Paramedian lobule: posterior hemispheric lobule between crus 2 and the copula pyramidis. In rodents it is associated with limb and orofacial control and projects mainly via the interposed nucleus.",
  COPY: "Copula pyramidis: small posterior hemispheric lobule lateral to lobule VIII, often grouped with the paramedian lobule.",
  PFL: "Paraflocculus: lateral lobule next to the flocculus, involved in eye movements (smooth pursuit, gaze holding).",
  FL: "Flocculus: small lateral lobule of the vestibulocerebellum, central to the vestibulo-ocular reflex and its adaptation.",
  DEC: "Lobule VI (declive) of the vermis, involved in eye movements (saccades) and also implicated in social and cognitive functions.",
  FOTU: "Lobule VII of the vermis (folium and tuber), implicated in oculomotor control.",
  NOD: "Lobule X (nodulus), part of the vestibulocerebellum, involved in vestibular processing and spatial orientation.",
  UVU: "Lobule IX (uvula) of the vermis, with vestibular and visual inputs; involved in posture and head-direction-related signals.",
  CBN: "The cerebellar nuclei (fastigial, interposed and dentate) are the main output of the cerebellum. They receive Purkinje cell inhibition plus excitatory collaterals of mossy and climbing fibres, and project to the thalamus, red nucleus, brainstem and inferior olive.",
  FN: "Fastigial (medial) nucleus: the most medial cerebellar nucleus, receiving vermal Purkinje cells. Projects to vestibular and reticular nuclei and the thalamus; involved in posture, locomotion, eye movements and autonomic functions.",
  IP: "Interposed (interpositus) nucleus: the middle cerebellar nucleus, receiving the paravermal/intermediate cortex. Projects to the red nucleus and motor thalamus; known for limb control and eyeblink conditioning.",
  DN: "Dentate (lateral) nucleus: the most lateral cerebellar nucleus, receiving the lateral hemisphere. Projects to the motor thalamus (and on to the cortex), linked with planning and timing of movement and with cognitive functions.",
  VNC: "The vestibular nuclei in the brainstem integrate head-motion signals from the inner ear with cerebellar input, driving vestibulo-ocular and vestibulospinal reflexes.",
  IO: "Inferior olive, in the ventral medulla: the source of climbing fibres, one per Purkinje cell. Its electrically coupled neurons fire complex spikes thought to signal errors or unexpected events.",
  PG: "Pontine nuclei (basilar pons): relay cortical input to the cerebellum as mossy fibres via the middle cerebellar peduncle.",
  TRN: "Reticulotegmental nucleus of the pons: a precerebellar nucleus sending mossy fibres to the cerebellum, notably for eye-movement control.",
  LRN: "Lateral reticular nucleus: precerebellar nucleus in the medulla relaying spinal and cortical information to the cerebellum as mossy fibres.",
  RN: "Red nucleus, in the midbrain tegmentum. The magnocellular part gives rise to the rubrospinal tract; it receives the interposed nucleus and contributes to limb and reaching movements.",
  VII: "Facial motor nucleus in the brainstem: its motor neurons control the facial muscles, including the whisker pad (whisking) and the eyelid (blinking).",
  PSV: "Principal sensory trigeminal nucleus: relays touch from the face and whiskers (lemniscal pathway) to the thalamus (VPM).",
  SCs: "Superior colliculus, superficial (sensory) layers: retinotopic visual input.",
  SCm: "Superior colliculus, intermediate and deep (motor) layers: multisensory maps that orient the eyes, head and whiskers toward stimuli.",
  IC: "Inferior colliculus: the main midbrain hub of the auditory pathway.",
  PAG: "Periaqueductal gray around the cerebral aqueduct: coordinates defensive behaviours, pain modulation, vocalisation and autonomic responses.",
  ZI: "Zona incerta: thin GABAergic subthalamic region with widespread projections, involved in sensory gating, defensive behaviours and movement.",
  STN: "Subthalamic nucleus: glutamatergic node of the basal ganglia (indirect and hyperdirect pathways), target of deep brain stimulation in Parkinson's disease.",
  SNr: "Substantia nigra pars reticulata: a GABAergic basal ganglia output nucleus, projecting to the thalamus, superior colliculus and brainstem.",
  SNc: "Substantia nigra pars compacta: dopamine neurons projecting to the dorsal striatum; their loss underlies Parkinson's disease.",
  VTA: "Ventral tegmental area: dopamine (and GABA and glutamate) neurons projecting to the nucleus accumbens and prefrontal cortex; reward and motivation.",
  LC: "Locus coeruleus: the main source of noradrenaline in the forebrain, regulating arousal, attention and sleep–wake state.",
  TH: "Thalamus: relays and gates information to the cortex. Sensory and motor nuclei form loops with the cortex, cerebellum and basal ganglia.",
  VAL: "Ventral anterior-lateral complex (motor thalamus): receives the cerebellar nuclei and basal ganglia output and projects to the motor cortex.",
  VM: "Ventral medial thalamic nucleus: motor thalamus receiving basal ganglia (SNr) and cerebellar input, projecting widely to layer 1 of the frontal cortex.",
  VPM: "Ventral posteromedial thalamic nucleus: relays touch from the face and whiskers to the barrel cortex.",
  VPL: "Ventral posterolateral thalamic nucleus: relays touch and proprioception from the body to the somatosensory cortex.",
  LGd: "Dorsal lateral geniculate nucleus: visual thalamus, relaying the retina to the primary visual cortex.",
  MG: "Medial geniculate complex: auditory thalamus, relaying the inferior colliculus to the auditory cortex.",
  RT: "Thalamic reticular nucleus: a GABAergic shell around the thalamus that gates thalamocortical activity and generates sleep spindles.",
  MO: "Somatomotor (motor) cortex: primary (MOp, M1) and secondary (MOs, M2) motor areas.",
  MOp: "Primary motor cortex (M1): its layer 5 neurons project to the brainstem and spinal cord; it controls skilled movements.",
  MOs: "Secondary motor cortex (M2): frontal area involved in planning and initiating movements, including orienting and licking.",
  SSp: "Primary somatosensory cortex (S1): body map of touch and proprioception.",
  "SSp-bfd": "Barrel field of the primary somatosensory cortex: each 'barrel' in layer 4 represents one facial whisker; input comes via VPM.",
  SSs: "Secondary somatosensory cortex (S2), lateral to S1.",
  VISp: "Primary visual cortex (V1).",
  AUDp: "Primary auditory cortex (A1).",
  ACA: "Anterior cingulate area: medial frontal cortex involved in attention, conflict monitoring, pain affect and decision-making.",
  PL: "Prelimbic area: medial prefrontal cortex involved in working memory, decision-making and fear expression.",
  ILA: "Infralimbic area: ventral medial prefrontal cortex involved in fear extinction and autonomic control.",
  RSP: "Retrosplenial cortex: involved in spatial navigation, head direction and memory.",
  HIP: "Hippocampus (Ammon's horn and dentate gyrus): episodic and spatial memory, place cells, and sharp-wave ripples during rest and sleep.",
  CA1: "Field CA1 of the hippocampus: main output of the hippocampus proper, receiving CA3 (Schaffer collaterals) and entorhinal input.",
  CA3: "Field CA3 of the hippocampus: recurrent network receiving dentate gyrus mossy fibres, thought to support pattern completion.",
  DG: "Dentate gyrus: input stage of the hippocampus (from the entorhinal cortex), thought to support pattern separation; site of adult neurogenesis.",
  ENT: "Entorhinal cortex: main gateway between the neocortex and hippocampus; its medial part contains grid cells.",
  STR: "Striatum: the main input nucleus of the basal ganglia (caudoputamen, nucleus accumbens, olfactory tubercle), made mostly of GABAergic spiny projection neurons.",
  CP: "Caudoputamen (dorsal striatum): receives cortex and thalamus input and dopamine from SNc; action selection and habit learning.",
  ACB: "Nucleus accumbens (ventral striatum): reward, motivation and reinforcement learning; receives dopamine from the VTA.",
  BLA: "Basolateral amygdala: assigns emotional value to sensory cues; key for fear and reward learning.",
  CEA: "Central amygdala: main output of the amygdala, driving fear responses and autonomic changes via the hypothalamus and brainstem.",
  LH: "Lateral habenula: signals aversive outcomes and inhibits midbrain dopamine and serotonin neurons.",
  HY: "Hypothalamus: controls homeostasis (feeding, temperature, sleep), hormones and innate behaviours.",
  LHA: "Lateral hypothalamic area: feeding, arousal and reward; contains orexin/hypocretin and MCH neurons.",
  BS: "Brainstem (midbrain, pons and medulla): cranial nerve nuclei, reticular formation and relays between the spinal cord, cerebellum and forebrain.",
  MB: "Midbrain: includes the colliculi, periaqueductal gray, red nucleus, substantia nigra and VTA.",
  P: "Pons: contains the pontine nuclei that relay cortex to the cerebellum, plus reticular and cranial nerve nuclei.",
  MY: "Medulla: controls breathing and heart rate and contains the inferior olive and several cranial nerve nuclei.",
  Isocortex: "Isocortex (neocortex): the six-layered cerebral cortex.",
  CTX: "Cerebral cortex, including the isocortex, olfactory areas and hippocampal formation.",
  MOB: "Main olfactory bulb: first relay of smell, from olfactory receptor neurons to mitral and tufted cells.",
  CLA: "Claustrum: thin sheet of neurons beneath the insular cortex, widely connected with the cortex; linked to attention and salience.",
  scp: "Superior cerebellar peduncle: the main output pathway of the cerebellar nuclei to the midbrain (red nucleus) and thalamus.",
  mcp: "Middle cerebellar peduncle: carries mossy fibres from the pontine nuclei into the cerebellum.",
  icp: "Inferior cerebellar peduncle: carries spinal, vestibular and olivary (climbing fibre) inputs to the cerebellum.",
};

function atlasLoad() {
  if (!ATL.ready) ATL.ready = fetch("atlas/index.json").then(r => { if (!r.ok) throw new Error("atlas " + r.status); return r.json(); })
    .then(ix => {
      ATL.idx = ix; ATL.byA = {};
      for (const [id, s] of Object.entries(ix.structures)) ATL.byA[s.a] = +id;
      return ix;
    }).catch(e => { console.warn("atlas unavailable", e); ATL.ready = null; return null; });
  return ATL.ready;
}
const atlasS = id => ATL.idx && ATL.idx.structures[id];
function atlasLineage(id) {                         // [id, parent, ..., root]
  let a = ATL.lin.get(id);
  if (!a) { a = []; for (let u = id; u != null && atlasS(u); u = atlasS(u).p) a.push(+u); ATL.lin.set(id, a); }
  return a;
}

/* every phrase that names a region: [{ word, ids, ci }] (ids = Allen structure ids shown together) */
function atlasTerms() {
  if (ATL.terms || !ATL.idx) return ATL.terms || [];
  const out = new Map();
  const add = (word, ids, ci) => {
    word = word.trim(); if (word.length < 2 || !ids.length) return;
    const k = ci ? word.toLowerCase() : word;
    if (!out.has(k)) out.set(k, { word, ids, ci });
  };
  for (const [words, acrs] of ATL_SYN) {
    const ids = acrs.map(a => ATL.byA[a]).filter(x => x != null);
    for (const w of words) add(w, ids, !ATL_CS.has(w));
  }
  for (const [id, s] of Object.entries(ATL.idx.structures)) {
    if (s.cp == null || ATL_SKIP.test(s.n)) continue;
    const plain = s.n.replace(/\s*\([^)]*\)\s*$/, "");          // "Declive (VI)" -> "Declive"
    for (const nm of new Set([s.n, plain])) {
      if (!/\s/.test(nm) && nm.length < 5) continue;              // single short words are too ambiguous
      add(nm, [+id], true);
    }
  }
  return (ATL.terms = [...out.values()]);
}
/* the region a phrase stands for (an abbreviation's long form, a key term), or null */
function atlasMatch(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\s+/g, " "); if (!t) return null;
  for (const e of atlasTerms()) if ((e.ci ? e.word.toLowerCase() : e.word) === (e.ci ? t : String(text).trim())) return e;
  return null;
}
/* regions named inside a longer phrase ("paramedian lobule and lobule simplex") */
function atlasFindIn(text) {
  const found = [], seen = new Set();
  for (const e of atlasTerms().slice().sort((a, b) => b.word.length - a.word.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${e.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, e.ci ? "iu" : "u");
    const k = e.ids.join(",");
    if (!seen.has(k) && re.test(text)) { seen.add(k); found.push(e); }
  }
  return found;
}

async function atlasSection(plane, um) {
  const key = plane + um;
  if (ATL.secs.has(key)) return ATL.secs.get(key);
  const p = fetch(`atlas/${plane}/${String(um).padStart(5, "0")}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  ATL.secs.set(key, p);
  if (ATL.secs.size > 6) ATL.secs.delete(ATL.secs.keys().next().value);
  return p;
}

const atlasName = ids => ids.length === 1 ? atlasS(ids[0]).n : ids.map(i => atlasS(i).a).join(" + ");
const atlasFmt = v => (Math.abs(v) < .005 ? 0 : v).toFixed(2).replace("-", "−");
const atlasAP = um => (ATL_BREGMA_AP - um) * ATL_DORR_AP / 1000;     // mm from bregma, Dorr-scaled CCF
const atlasML = um => (um - ATL_MIDLINE) / 1000;

/* the sheet's HTML; the sections are filled in by atlasFill */
function atlasSheetHTML(entry, note) {
  const ids = entry.ids, main = atlasS(ids[0]);
  const path = atlasLineage(ids[0]).slice(1).reverse().map(i => atlasS(i)).filter(s => s && s.a !== "root" && s.a !== "grey").map(s => esc(s.n));
  const info = ids.map(i => ATL_INFO[atlasS(i).a]).filter(Boolean)[0] || "";
  const cp = main.cp, sp = main.sp;
  const link = `https://sqbauer.github.io/brain-sections/#plane=coronal&pos=${atlasAP(cp).toFixed(2)}&sys=dorr&lvl=summary&fill=none&hemi=both&lab=none&hl=${ids.map(i => i + ".e0533b").join(",")}`;
  return `<div class="atl">
    <div class="atl-name">${esc(atlasName(ids))}</div>
    <div class="atl-meta"><span class="atl-acr">${ids.map(i => esc(atlasS(i).a)).join(" · ")}</span>${path.length ? ` <span class="atl-path">${path.join(" › ")}</span>` : ""}</div>
    ${note ? `<p class="atl-note">${note}</p>` : ""}
    <div class="atl-views">
      <button type="button" class="atl-view" data-sheet="atl-zoom" data-plane="coronal" aria-label="Coronal section, tap to zoom"><div class="atl-svg" data-um="${cp}"><span class="atl-wait">Loading section…</span></div><span class="atl-cap">Coronal · AP ${atlasFmt(atlasAP(cp))} mm</span></button>
      <button type="button" class="atl-view" data-sheet="atl-zoom" data-plane="sagittal" aria-label="Sagittal section, tap to zoom"><div class="atl-svg" data-um="${sp}"><span class="atl-wait">Loading section…</span></div><span class="atl-cap">Sagittal · ML ${atlasFmt(atlasML(sp))} mm</span></button>
    </div>
    <p class="atl-hint">Tap a section to zoom in on the region. Positions from bregma, CCF scaled as in Dorr 2008.</p>
    ${info ? `<p class="atl-info">${esc(info)}</p>` : ""}
    <div class="rdm-seg"><button type="button" class="rdm-btn primary" data-sheet="atl-explain">Explain with Claude</button><a class="rdm-btn atl-link" href="${link}" target="_blank" rel="noopener">brain-sections ↗</a></div>
    <div class="rdm-explain" id="rmExplain"></div>
    <p class="atl-cite">${esc(ATL_CITE)}</p></div>`;
}

function atlasSVG(sec, plane, ids, mark) {
  const has = id => { const l = atlasLineage(id); return ids.some(t => l.includes(t)); };
  let hl = sec.summary.filter(([id]) => has(id));
  if (!hl.length) hl = sec.fine.filter(([id]) => has(id));
  const [x0, y0, x1, y1] = sec.bbox, pad = 12;
  const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
  const lines = sec.summary.map(([, d]) => `<path d="${d}"/>`).join("");
  const hit = hl.map(([, d]) => `<path d="${d}"/>`).join("");
  const mk = mark != null ? `<line class="atl-mark" x1="${mark}" x2="${mark}" y1="${y0 - pad}" y2="${y1 + pad}"/>` : "";
  return `<svg viewBox="${vb.join(" ")}" data-full="${vb.join(" ")}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${plane} section">
    <path class="atl-out" d="${sec.outline}"/><g class="atl-lines">${lines}</g><g class="atl-hit">${hit}</g>${mk}</svg>`;
}

async function atlasFill(box, entry) {
  const main = atlasS(entry.ids[0]);
  for (const el of box.querySelectorAll(".atl-view")) {
    const plane = el.dataset.plane, holder = el.querySelector(".atl-svg");
    const sec = await atlasSection(plane, plane === "coronal" ? main.cp : main.sp);
    if (!holder.isConnected) return;                   // the sheet moved on
    if (!sec) { holder.innerHTML = `<span class="atl-wait">Section unavailable.</span>`; continue; }
    holder.innerHTML = atlasSVG(sec, plane, entry.ids, plane === "coronal" ? main.sp / 10 : main.cp / 10);
    // zoomed view: the highlighted region with some surroundings, in the section's own proportions
    const svg = holder.querySelector("svg"), g = svg.querySelector(".atl-hit");
    try {
      const bb = g.getBBox(), full = svg.dataset.full.split(" ").map(Number);
      const b = { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
      // coronal sections show both hemispheres: zoom on the right one (where the sagittal section is cut),
      // unless the region straddles the midline
      const mid = ATL_MIDLINE / 10;
      if (plane === "coronal" && b.x < mid && b.x + b.width > mid) {
        // keep only the right half if the highlighted paths have no ink near the midline
        const probe = svg.createSVGPoint ? svg.createSVGPoint() : null, paths = [...g.querySelectorAll("path")];
        let nearMid = false;
        if (probe) for (let y = b.y; y <= b.y + b.height && !nearMid; y += Math.max(2, b.height / 40)) {
          probe.x = mid; probe.y = y; nearMid = paths.some(p => p.isPointInFill(probe));
        }
        if (!nearMid) {
          // the region's inner edge on the right: scan from the midline outwards along a few rows
          let inner = b.x + b.width;
          if (probe) for (let y = b.y; y <= b.y + b.height; y += Math.max(2, b.height / 30))
            for (let x = mid; x < inner; x += 3) { probe.x = x; probe.y = y; if (paths.some(p => p.isPointInFill(probe))) { inner = x; break; } }
          b.width = b.x + b.width - inner; b.x = inner;
        }
      }
      if (b.width > 0) {
        const ar = full[2] / full[3];
        let w = Math.max(b.width * 2.2, 140), h = Math.max(b.height * 2.2, 100);
        if (w / h > ar) h = w / ar; else w = h * ar;
        w = Math.min(w, full[2]); h = Math.min(h, full[3]);
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        const x = Math.max(full[0], Math.min(full[0] + full[2] - w, cx - w / 2)), y = Math.max(full[1], Math.min(full[1] + full[3] - h, cy - h / 2));
        svg.dataset.zoom = [x, y, w, h].map(v => v.toFixed(1)).join(" ");
      }
    } catch {}
  }
}
function atlasZoom(btn) {
  const svg = btn.querySelector("svg"); if (!svg || !svg.dataset.zoom) return;
  const on = !btn.classList.contains("zoomed");
  btn.classList.toggle("zoomed", on);
  svg.setAttribute("viewBox", on ? svg.dataset.zoom : svg.dataset.full);
}

atlasLoad();
