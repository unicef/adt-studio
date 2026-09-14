/**
 * One palette for all four export candidates, so four unrelated ideas still read as one family.
 *
 * Cool, and never pure white — the owner's call (2026-08-26): the run screen is white with an
 * indigo cast, and warm cream paper read yellow against it, so the paper keeps a white-blueish
 * tone instead. Still never `#fff`: a `#fff` card on the publish screen's `#fff` card surface has
 * no edge, and the edge is the entire read of "a sheet lifting off a pile". The ink values are
 * deliberately not black — printed text at these sizes is a cool grey, and true black at 4px reads
 * as a UI bar rather than as type.
 */
export const PAPER = {
  /** A resolved page face. */
  face: "#fbfcfe",
  faceEdge: "#eef2f7",
  /** An unresolved page — same paper, no content yet. */
  slab: "#e7edf3",
  slabEdge: "#dae3ec",
  /** Deeper cards in a pile, which sit in their own shade. */
  pileDeep: "#e0e8ef",
  border: "rgba(58,82,108,.22)",
  /** The 1px top edge that makes a flat rectangle read as a sheet with thickness. */
  crest: "rgba(255,255,255,.85)",
  ink: "rgba(40,58,78,.70)",
  inkSoft: "rgba(40,58,78,.42)",
  inkFaint: "rgba(40,58,78,.16)",
  /** Flat fill for the sheet's own pre-blurred shadow element, which is the only live shadow. */
  shadow: "rgba(46,68,92,1)",
  /** The two baked casts on a card in a pile. Never animated. */
  cast: "rgba(46,68,92,.10)",
  castWide: "rgba(46,68,92,.06)",
  warm: "#5a90ba",
} as const

/** The illustration block on a drawn page. Cool against all that paper, so it reads as a picture. */
export const WELL = {
  from: "#d9e3e8",
  to: "#bfd0d6",
  markA: "rgba(70,110,130,.34)",
  markB: "rgba(190,140,80,.34)",
} as const
