// Single source of truth for the publication list.
// To add a paper: copy an entry, edit the fields, keep newest first.
// Loaded as a script (not fetched JSON) so the page also works when opened from disk.
//
// Fields
//   id        short unique slug (used later for per-paper summary pages)
//   status    "published" | "preprint"
//   year      number (issue year)
//   title, authors (PubMed style; "Bauer S" is highlighted automatically)
//   journal, citation (volume/pages)
//   role      "first" | "co-first" | null
//   doi, pmid, pmcid, preprint   (any may be null)
//   note      short free-text tag, optional
//   summary   path to an interactive summary page, or null until one exists

window.PUBLICATIONS = [
  {
    id: "sleep-cerebellum",
    status: "preprint",
    year: 2023,
    title: "Sleep-state dependent cerebellar processing in adult mice",
    authors: "Canto CB, Bauer S, Hoogland TM, Hoedemaker HH, Geelen C, Loyola S, Hernandez PM, De Zeeuw CI",
    journal: "bioRxiv",
    citation: "",
    role: null,
    doi: "10.1101/2023.10.30.564769",
    pmid: null,
    pmcid: null,
    preprint: "https://www.biorxiv.org/content/10.1101/2023.10.30.564769v1",
    note: "In revision",
    summary: null
  },
  {
    id: "whisker-premotor",
    status: "published",
    year: 2026,
    title: "The cerebellum engages multiple pre-motor pathways through a divergent-convergent architecture to shape whisker dynamics",
    authors: "Bauer S, Zhai P, van Wingerden N, Zhao H, Romano V",
    journal: "Frontiers in Neural Circuits",
    citation: "19:1706704",
    role: "co-first",
    doi: "10.3389/fncir.2025.1706704",
    pmid: "41660153",
    pmcid: "PMC12872751",
    preprint: null,
    note: null,
    summary: null
  },
  {
    id: "cerebrocerebellar-stage",
    status: "published",
    year: 2025,
    title: "Stage-dependent cerebrocerebellar communication during sensorimotor processing",
    authors: "Romano V, van Driessche M, van Wingerden N, Bauer S, Boeser B, Mejias JF, De Zeeuw CI",
    journal: "Nature Communications",
    citation: "16:8812",
    role: null,
    doi: "10.1038/s41467-025-64592-8",
    pmid: "41044080",
    pmcid: "PMC12494962",
    preprint: null,
    note: null,
    summary: null
  },
  {
    id: "whisker-kinematics",
    status: "published",
    year: 2024,
    title: "Whisker kinematics in the cerebellum",
    authors: "Zhai P, Romano V, Soggia G, Bauer S, van Wingerden N, Jacobs T, van der Horst A, White JJ, Mazza R, De Zeeuw CI",
    journal: "The Journal of Physiology",
    citation: "602(1):153–181",
    role: null,
    doi: "10.1113/JP284064",
    pmid: "37987552",
    pmcid: null,
    preprint: null,
    note: null,
    summary: null
  },
  {
    id: "pc-resonance-8hz",
    status: "published",
    year: 2022,
    title: "Purkinje cell activity resonation generates rhythmic behaviors at the preferred frequency of 8 Hz",
    authors: "Bauer S, van Wingerden N, Jacobs T, van der Horst A, Zhai P, Betting JLF, Strydis C, White JJ, De Zeeuw CI, Romano V",
    journal: "Biomedicines",
    citation: "10(8):1831",
    role: "first",
    doi: "10.3390/biomedicines10081831",
    pmid: "36009378",
    pmcid: "PMC9404806",
    preprint: null,
    note: null,
    summary: null
  },
  {
    id: "olivocerebellar-symmetry",
    status: "published",
    year: 2022,
    title: "Olivocerebellar control of movement symmetry",
    authors: "Romano V, Zhai P, van der Horst A, Mazza R, Jacobs T, Bauer S, Wang X, White JJ, De Zeeuw CI",
    journal: "Current Biology",
    citation: "32(3):654–670.e4",
    role: null,
    doi: "10.1016/j.cub.2021.12.020",
    pmid: "35016009",
    pmcid: null,
    preprint: null,
    note: null,
    summary: null
  }
];
