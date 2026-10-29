---
id: SPEC-0021
title: Source PDF assessment
status: in-review
owner: "@gbergengruen"
approvers: [] # ≥1 maintainer + product sign-off (user-facing scope)
issues: ["#1016", "#901", "#676", "#985", "#326", "#749", "#957"]
prs: []
adr: ""
created: 2026-10-27
updated: 2026-10-29
---

**After the `extract` step, every book gets one persisted, deterministic, LLM-free
assessment of its source PDF: a readiness grade, counts by severity, typed findings with
page and image evidence, and one recommendation per finding — a named extraction setting with
its value, or an action. Studio shows it on the Extract stage; the API and the CLI expose it.
It is advisory: it never gates a run or an export, and it never applies a setting.**

Decisions taken with the product owner on 2026-10-27 and encoded here: **assessment only**
(remedies are referenced follow-ups, §Rollout), **advisory only**, **deterministic in v1**.
Amended 2026-10-28 after reading the extractor against these goals: recommendations are data
(§Data contract), the pipeline rules ship before the `packages/pdf` signals (§Rollout), and the
assessment reuses the extractor's in-memory data so it is expected to cost nothing net (§Cost).
Amended 2026-10-29 against the encoding taxonomy *PDF Encoding Issues for ADT Extraction*
(@Elias, 2026-10-28): six kinds that silently lose, duplicate or leak content and cost only a
bounds test, a dropped callback or a catalog read join v1 (`raster-tiles`, `raster-occluded`,
`mixed-page-types`, `hidden-text-layer`, `optional-content`, `pdf-container`), `page-geometry`
gains the TrimBox; the rest of the taxonomy is parked as reserved kinds, experiments E10–E11
and follow-ups R-h–R-i, and its remediation design (§12 of the document) is input to SPEC-0020.

## Problem (with evidence)

When the input PDF is bad, the user has no way to know before investing hours in the
pipeline. The Extract stage says nothing about the source's fitness; the defects surface
later as poor output, or as pruned images with an opaque free-text reason.

| Signal | Evidence (local corpus under `books/`, measured 2026-10-27) | Where it is lost today |
|---|---|---|
| No text layer | Pages with ≥ 20 non-whitespace chars: qa784 0/100, cuaderno5 0/100, cuaderno4 7/38, cuaderno3 22/25, Uruguay_Ceibal 20/25, momo 9/10; PNLD `prac_math_vol2` 40/40. | The only warning, `text-layer-missing` (PR #513, `apps/api/src/services/extraction-warning.ts`), needs Sectioning's vision text (≥ 24 chars), so it appears one stage later, is computed on read, is never persisted and never reaches the CLI. |
| Figure split across stacked rasters | cuaderno4 owl (cover, `pg001`): body raster `pg001_im001` 252×236 pt and an overlay strip `pg001_im002` 110×34 pt 100 % inside it, holding the eyebrows, cap top and eye rims. With `figure_extraction_mode: off`, rasters never enter grouping (`packages/pipeline/src/pdf-extraction.ts:26-30` → `packages/pdf/src/extract.ts:972` passes `rasterPlacements = undefined`), so both are exported separately and the meaningfulness model prunes the strip: *"only a narrow cropped fragment showing the top of the same character's head and eyebrows"*. 32 of the 35 pages with rasters hold such a pair (66 pairs); `pg006` has four owls, each losing one or two overlays. cuaderno3 `pg009_im001` contains three overlays. | Nothing records that two rasters overlap. The prune reason is free text. In `auto`/`all` the pair would be grouped by `shouldAttachToRasterPlacement` (`extract.ts:3127`) and page-cropped as one figure, so the loss depends on a setting the user cannot judge. |
| Vector render with holes | cuaderno4 `pg012_im012`: a 52-shape vector group whose box covers the swallow photo and two binder-clip rasters it does not include → SVG render with blank holes, pruned by the model ("major missing areas"); the arrows that belong to the figure are lost. | The render decision (`extract.ts:4036-4048`) never checks raster placements in `off` mode. |
| Whole-page screenshot as figure; crops cutting figures | #901, image-only PNLD book: 21/40 pages used a whole-page raster as the figure; crops cut through figures; an ISBN digit was misread. | Manual audit only. |
| Duplicate images | qa784: 1,049 extracted images, 761 distinct hashes, 288 byte-identical copies (27 %). | Only the read-only `extract-report` CLI (#1008) counts them. |
| Signals seen and thrown away | Unmapped glyphs (`packages/pdf/src/page-stream-recorder.ts:494-497` returns on `ucs <= 0`), undecodable paragraphs (`extract.ts:1630-1634`), image decode and render failures (`console.warn` at `extract.ts:1282, 2080, 2128, 3779, 3824`), `producer`/`format`/`encryption` from `extractPdfMetadata` (`extract.ts:852`, dropped by `toBookMetadata`), page boxes and `/Rotate` (#676), raster DPI at placed size (`stampRasterPlacementsFromOps`, `extract.ts:1236`, has native and placed sizes), colour-space class (`classifyImageColorSpace`, `extract.ts:612`), watermark signatures (only when removal is on, `extract.ts:324`), spread suggestions (stored by `detectSpreads`, never compared with the mode). | Never persisted or shown. |
| Encodings that silently lose, duplicate or leak content | The taxonomy (@Elias, 2026-10-28) lists 81 print encodings with a structural detection signal each; its V1 triage ranks tiled images, stacked/MRC layers, scanned-or-mixed pages and covered figures as high or medium severity. Probed on mupdf 1.27.0 (2026-10-29): text drawn in render mode 3 (the hidden OCR layer of a scanned PDF) **is** returned by `toStructuredText()`, so it enters the page text, counts towards `text-layer-empty`'s 20 chars and is read aloud, while the device reports it through `ignoreText` (`page-stream-recorder.ts:289`), which discards it; `page.toPixmap()` draws annotations by default (`showExtras = true`), so review stamps are baked into page renders and page-crop figures; `doc.countLayers()` and `doc.wasRepaired()` are available. Nothing in `packages/pdf` reads `/OCProperties`, `/AcroForm`/`/XFA`, `/EmbeddedFiles`/`/Collection` or `TrimBox`. | Tiles (abutting, not nested) escape the overlay rule; occlusion is only checked raster-on-raster; the rest is never looked at. |
| Qualified completion | The `extract` step ends with no message (`pdf-extraction.ts:163`), so a fully scanned book shows a plain green pill. | SPEC-0013 calls a plain green completion insufficient when work is qualified. |

Cost context: Extract is 4–6 % of a conversion's LLM tokens, but it decides what every
later stage sees. A user who learns on day one that the PDF is a scan, or that figures are
layered, can obtain a better source or change one setting before paying for the rest.

## Goals

- G1. After `extract` completes, one persisted `source-assessment` node per book: readiness
  grade, counts by severity, typed findings with page and image evidence, per-page rollups.
- G2. Findings are data (`kind` + `params` + evidence refs) so Studio renders and translates
  them in all five locales; the API and the CLI print English.
- G3. The Extract stage shows a Source quality panel, page badges, a sidebar count and the
  amber "Completed with a warning" pill (the #1012 step-note channel) when warnings exist.
  A clean book stays plain green.
- G4. Every finding carries an actionable recommendation **as data**: either a named
  extraction setting with the value to set (`figure_extraction_mode: auto`,
  `remove_watermarks: true`, `image_filters.segmentation: true`, `editing_language`) or an
  action (obtain a text-based PDF, use figure cleanup (SPEC-0020), mark spreads, trim the page
  range, normalise pages). Studio renders it with the control's own label; a later
  recommender (SPEC-0016) or a one-click apply can consume it without parsing prose.
- G5. Advisory only: nothing is disabled or gated (SPEC-0001 vocabulary).
- G6. `extract-report` reads the persisted node; `pipeline run` prints the note.
- G7. Zero model calls; the assessment adds ≤ 5 % to extract wall time. Expected: a net
  *saving* on single-page books, because the one pixel pass it adds replaces the full PNG
  decode `samplePageEdges` performs on every page today (§Cost).

## Non-goals

Binding. Each has an owner elsewhere so adjacent work is not blocked.

- Repairing defects: compositing stacked rasters, filling vector holes, re-cropping, OCR.
  Remedies are listed under Rollout as follow-ups with gates; figure repair is SPEC-0020.
- Choosing or changing extraction settings from the input. Recommendations may *name* a setting; they
  never set one (SPEC-0016 / #333 own recommendations; SPEC-0010 makes a changed source a
  new book).
- Text recovery for image-only pages by vision (planned SPEC-0022). This spec's
  `text-layer-empty` finding is its page selector.
- Any LLM or vision call. An opt-in spot check is an open question for v2.
- Fidelity scoring of figures by a model (SPEC-0020's non-goal as well).
- CI gating or corpus thresholds (SPEC-0005 consumes this node later).
- Password entry for encrypted PDFs (reported only).
- Persisted per-finding acknowledgement ("Mark checked"); open question.
- A zod schema or size bound for `extraction-debug` (separate fast-lane PR).
- A `/Resources/Font` dictionary walk (`font-risk`). The direct measures — unmapped glyphs
  and replacement characters — ship in v1; the walk only predicts what they observe and is
  reserved for v1.1.
- Proposing a *value* for `editing_language`: a script does not identify a language (Latin
  covers all five Studio locales), so `script-mismatch` names the setting only.
- The taxonomy's remediation design (render-and-crop "Path B", text-suppressed renders,
  two-background mattes, patch compositing, image-model transparency): input to SPEC-0020.
  Its Path A soft-mask merge already exists (`readSoftMaskMatte` and the SMask composite,
  `extract.ts:648-670, 1997-2040`), so `layered-artwork` reports masks but not as a defect.
- Taxonomy rows with no cheap structural signal or another owner: tables ruled with lines,
  equations, reading order and paint order (layout analysis), ICC-managed colour conversion,
  running headers/footers and ornaments (repetition; O1), QR/ISBN codes, scan skew and
  halftone, JPEG quality estimation, printer spreads (imposition).
- Changing what the renderer draws (for example `showExtras = false` to drop annotations):
  it changes extraction output, so it is a follow-up, not an assessment.

## Proposed design

### Options considered

| Option | Where the assessment is computed | Cost | Why not |
|---|---|---|---|
| A — end of the `extract` step, a sub-product node like `positioned-text`, `spread-suggestions` and `font-profile` (`pdf-extraction.ts:116-163`) | During the page loop, from data already in memory; one pass | ~960 lines in `packages/pipeline` (three PRs) + ~560 in `packages/pdf` (two PRs) | **Chosen.** 15 of the 25 v1 kinds (plus the text profile) are pure functions of what `ExtractedPage` already carries in every figure mode (§Where it is computed); the node is wiped and re-created with the pages it describes (`clearExtractedData`). |
| B — a new `source-assessment` PIPELINE step after `image-cropping` | After the image passes, so it could record "the overlay was then pruned" | Same plus a step in `PIPELINE`, `STEP_ORDER`, the runner, Studio pills | Depends on LLM verdicts (non-deterministic, skippable), arrives minutes later, adds a pill users must learn. |
| C — computed on read, like `extractionWarning` today | Nothing stored | ~150 lines in the API | Loses history, repeats O(pages) work per request, no CLI parity, no step note. |

Decisions a reviewer must ratify: (1) option A; (2) the finding-kind list and severity
rules below; (3) the note on the `extract` step only when warnings or criticals exist;
(4) `text-layer-missing` stays as the after-Sectioning confirmation, not folded in; (5) no
"Mark checked" in v1; (6) recommendations as structured data (setting + value, or action)
rather than a flat hint enum; (7) pipeline rules ship before the `packages/pdf` signals, so
the first value-bearing PR touches no extractor code; (8) `font-risk` deferred to v1.1; (9) a
password-required PDF is a typed extraction error, not a finding; (10) the six encoding kinds
taken from the 2026-10-28 taxonomy join v1, everything else from it stays reserved or parked.

### Data contract

New `packages/types/src/source-assessment.ts`, exported from `packages/types/src/index.ts`,
modelled on `accessibility.ts` (per-book findings node) and `packaging-warning.ts`
(warnings kept as data so Lingui can translate them). Node `source-assessment`, item `book`.

```ts
export const SourceFindingKind = z.enum([
  // text layer
  "text-layer-empty",        // page has < MIN_TEXT_LAYER_CHARS (20) non-whitespace chars
  "ink-without-text",        // page has visible ink (≥ 0.5 % of the render) and 0 chars
  "blank-page",              // ink < 0.1 %, 0 chars, no raster ops
  "text-unmapped-glyphs",    // glyphs dropped as ucs <= 0 in the recorder, plus U+FFFD in the text layer
  "script-mismatch",         // dominant Unicode script of the text ≠ editing_language's script
  "hidden-text-layer",       // invisible glyphs (render mode 3, reported via the device's ignoreText) ≥ 50 % of the page's glyphs
  "mixed-page-types",        // the book has both digital and scanned pages (SourcePageRollup.pageType)
  // figures
  "raster-overlay-split",    // raster B ≥ 80 % inside raster A, area(B) ≤ 50 % area(A), A < 85 % of page
  "raster-tiles",            // ≥ 2 rasters whose bounds abut within 1 pt and whose union is a rectangle
  "raster-occluded",         // a later-painted opaque fill or raster outside the raster's figure covers ≥ 10 % of its bounds
  "figure-render-holes",     // vector-rendered group whose crop box overlaps raster placements it does not contain
  "whole-page-figure",       // raster bounds ≥ 85 % of the page area
  "low-resolution-raster",   // nativeWidth / (bounds.width / 72) < 100 dpi, raster ≥ 1 in²
  "needs-convert-colorspace",// CMYK / Indexed / Separation / Lab sources converted on extraction
  "layered-artwork",         // blend mode, alpha < 1 or a clip path on a raster placement
  "image-decode-failed",     // every site that only console.warn'd before
  "duplicate-images",        // byte-identical hashes shared across pages ≥ 10 % of extracted images
  // document
  "page-geometry",           // size or orientation deviates > 2 % from the modal page; CropBox ≠ MediaBox; TrimBox ≠ CropBox; /Rotate ≠ 0
  "spreads-unmarked",        // spread-suggestions non-empty while spread mode is off
  "watermark-detected",      // signatures found while remove_watermarks is off
  "pdf-encrypted",           // restricted permissions (copy / accessibility / print); a password requirement is a typed open error
  "optional-content",        // /OCProperties in the catalog (InDesign / Illustrator layers: language versions, print-only, hidden)
  "pdf-container",           // XFA form (/XFA in /AcroForm) or a portfolio (/Collection) / attachments (/EmbeddedFiles)
  "book-scale",              // > 300 pages or > 500 Mpx of raster data
  "shape-flood",             // > 1,500 vector shapes or > 60 rasters on one page
])
export const SourceSeverity = z.enum(["info", "warning", "critical"])
export const SourceReadiness = z.enum(["ready", "degraded", "poor"])
export const SourceRecommendation = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setting"),
    key: z.enum(["figure_extraction_mode", "remove_watermarks", "image_filters.segmentation", "editing_language"]),
    value: z.union([z.string(), z.boolean()]).optional(),   // absent = "check this setting" (editing_language)
  }),
  z.object({
    type: z.literal("action"),
    action: z.enum(["get-text-pdf", "figure-cleanup", "mark-spreads", "normalise-pages", "trim-page-range", "none"]),
    params: z.record(z.union([z.number(), z.string()])).optional(),   // mark-spreads: leads; trim-page-range: start, end
  }),
])
/** Per-page signals only the extractor can see (no table holds them); persisted in the node
 *  so the assessment can be recomputed from storage without re-extracting. null until the
 *  `packages/pdf` PR lands or for a page re-extracted without them. */
export const SourcePageSignals = z.object({
  inkFraction: z.number(),            // share of sampled render pixels darker than 240/255, 4 decimals
  unmappedGlyphs: z.number().int(), totalGlyphs: z.number().int(),
  invisibleGlyphs: z.number().int(),  // glyphs the device reports through ignoreText (render mode 3); mupdf still returns them as text
  replacementChars: z.number().int(), // U+FFFD in the text layer
  imageDecodeFailed: z.number().int(), figureRenderFailed: z.number().int(),
  rotate: z.number().int(), cropBoxDiffers: z.boolean(), trimBoxDiffers: z.boolean(),
  occludedRasters: z.array(z.object({ imageId: z.string(), coveredRatio: z.number(), byKind: z.enum(["fill", "image", "text"]) })),
  annotations: z.number().int(),      // /Annots count; drawn into the render (showExtras), recorded for the reserved annotations-present kind
})
export const SourcePageType = z.enum(["digital", "scanned", "mixed", "blank"])

export const SourceEvidenceRef = z.object({ pageId: z.string(), imageId: z.string().optional(), groupIndex: z.number().int().optional() })
export const SourceFinding = z.object({
  id: z.string(),                       // `${kind}` for a book-level finding, `${kind}:${pageId}` for a page-scoped one
  kind: SourceFindingKind,
  severity: SourceSeverity,
  pageIds: z.array(z.string()),         // sorted by page number
  params: z.record(z.union([z.number(), z.string(), z.boolean()])), // i18n placeholders: count, total, ratio, dpi, mode …
  evidence: z.array(SourceEvidenceRef).max(50),
  recommendation: SourceRecommendation,
})
export const SourcePageRollup = z.object({
  pageId: z.string(), pageNumber: z.number().int(),
  textChars: z.number().int(), imageCount: z.number().int(),
  pageType: SourcePageType,   // §Page type
  kinds: z.array(SourceFindingKind), severity: SourceSeverity.nullable(),
  signals: SourcePageSignals.nullable(),
})
export const SourceAssessment = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  source: z.object({ producer: z.string().nullable(), creator: z.string().nullable(), format: z.string().nullable(), encryption: z.string().nullable(), totalPagesInPdf: z.number().int(), bytes: z.number().int(),
                     producerFamily: z.enum(["indesign", "illustrator", "office", "web-design", "scanner", "inpage", "other"]),   // from producer/creator, the taxonomy's producer table
                     permissions: z.object({ copy: z.boolean(), accessibility: z.boolean(), print: z.boolean() }).nullable(),
                     structure: z.object({ layers: z.number().int(), layersOffByDefault: z.number().int(), xfa: z.boolean(), needsRendering: z.boolean(),
                                           portfolio: z.boolean(), embeddedFiles: z.number().int(), tagged: z.boolean(), repaired: z.boolean() }).nullable() }),   // null until PR 3b
  settings: z.object({ figureExtractionMode: FigureExtractionMode, removeWatermarks: z.boolean(), spreadMode: z.boolean(), spreadPairs: z.array(z.number().int()),
                       startPage: z.number().int().nullable(), endPage: z.number().int().nullable(), editingLanguage: z.string().nullable(), segmentationEnabled: z.boolean() }),
  summary: z.object({
    readiness: SourceReadiness,
    pageCount: z.number().int(), pagesWithText: z.number().int(), pagesWithFindings: z.number().int(),
    counts: z.object({ info: z.number().int(), warning: z.number().int(), critical: z.number().int() }),
    textProfile: z.enum(["image-only", "weak", "text-rich"]),   // ≥ 0.8 / ≥ 0.3 empty, as in extract-report
  }),
  findings: z.array(SourceFinding),
  pages: z.array(SourcePageRollup),
})
```

Constants Studio may import from `@adt/types` (constants only, per the layer rule):
`SOURCE_FINDING_KINDS`, `SOURCE_SEVERITY_ORDER`, `MIN_TEXT_LAYER_CHARS = 20` and `TextProfile`
(moved here from `extract-report.ts`, #1009, so both agree). Severity rules and numeric
thresholds live in `packages/pipeline/src/source-assessment.ts` as one exported
`SOURCE_THRESHOLDS` constant:

| Kind | Severity | Recommendation |
|---|---|---|
| `text-layer-empty` (book-level, `pageIds` = empty pages) | critical when the empty ratio ≥ 0.8, warning ≥ 0.3, info otherwise | action `get-text-pdf` |
| `ink-without-text`, `blank-page` (page; need `signals`, skipped while null) | info; `ink-without-text` raises `text-layer-empty` evidence | `blank-page` runs at either end of the range: action `trim-page-range` with `params.start/end` (ink-blank pages only, never a cover); else `none` |
| `text-unmapped-glyphs` (page) | warning > 2 % of glyphs, info otherwise | action `get-text-pdf` |
| `script-mismatch` (book) | warning | setting `editing_language`, **no value** |
| `hidden-text-layer` (page; needs `signals`) | warning when the page also has a whole-page raster (an OCR layer under a scan: the text is OCR output and is read aloud); info otherwise (invisible text on a digital page). `text-layer-empty` counts *visible* chars (`textChars − invisibleGlyphs`), so an OCR'd scan is graded as a scan | action `get-text-pdf` |
| `mixed-page-types` (book, `pageIds` = scanned pages, `params.digital`, `params.scanned`) | warning when both counts are ≥ 1 and the minority is ≥ 5 % of pages; info otherwise | action `get-text-pdf` (for the listed pages) |
| `raster-overlay-split` (page, evidence `[A, B]`) | warning in `off` mode, info in `auto`/`all`; critical when B is drawn *under* A by `streamSeqno` (hidden) | setting `figure_extraction_mode: auto` in `off`; action `figure-cleanup` in `auto`/`all` |
| `raster-tiles` (page, evidence = the tiles, `params.tiles`) | warning in `off` mode (each tile is exported, captioned and pruned on its own), info in `auto`/`all` | same as `raster-overlay-split` |
| `raster-occluded` (page, evidence = the raster, `params.coveredRatio`, `params.byKind`) | warning: the raw raster holds content the reader never sees (labels under answer boxes, white-out corrections, old language versions) and a page-crop is the only faithful extraction | action `figure-cleanup` |
| `figure-render-holes` (page, evidence figure + uncovered rasters) | warning | same as `raster-overlay-split` |
| `whole-page-figure` (book, `params.liveTextOverlap` = pages where ≥ 20 visible chars sit on the raster) | warning when ≥ 25 % of pages, info otherwise | background plates (no live text on top): setting `image_filters.segmentation: true` when segmentation is off; art with live text on top (picture books) or segmentation already on: action `figure-cleanup` |
| `low-resolution-raster`, `needs-convert-colorspace`, `layered-artwork` | info (thresholds frozen after E5); `low-resolution-raster` sets `params.uniform` when every raster in the book shares one ppi (a file downsampled by an optimiser); `layered-artwork` adds `params.stencil` (`/ImageMask`) and `params.softMask` (`/SMask`) counts | `none` |
| `image-decode-failed` (page) | warning | `none` |
| `duplicate-images` (book) | info; warning ≥ 20 % | `none` (#1011 judges duplicates once) |
| `page-geometry` (book, `pageIds` = deviating pages) | warning | action `normalise-pages` |
| `spreads-unmarked` (book, `params.leads`) | info | action `mark-spreads` with the leads — the apply route (`pages.ts:1290`) re-extracts only those pairs; naming `spread_mode` would imply a full re-extract |
| `watermark-detected` | warning | setting `remove_watermarks: true` (in `EXTRACTION_CONFIG_KEYS`: under SPEC-0010 a changed value is a new book, and the panel says so) |
| `pdf-encrypted` | info (restricted permissions) | `none` |
| `optional-content` (book, `params.layers`, `params.off`) | warning: only the default-visible configuration is rendered and extracted, so an alternate language layer is silently dropped and a print-only layer may be kept | `none` (the message names the layers; choosing a layer is a follow-up) |
| `pdf-container` (book, `params.form`, `params.portfolio`, `params.attachments`) | critical for a portfolio or a dynamic XFA form (`/NeedsRendering true`: the pages are a "please wait" placeholder); warning for static XFA; info for attachments only | action `get-text-pdf` (re-export the book itself) |
| `book-scale`, `shape-flood` | warning | `none` |

**Page type.** Each rollup carries `pageType`, the classification the taxonomy asks for before
any figure or text work: `blank` when `blank-page` holds; `scanned` when a raster covers ≥ 85 % of
the page and visible chars < `MIN_TEXT_LAYER_CHARS`; `mixed` when a
whole-page raster carries ≥ `MIN_TEXT_LAYER_CHARS` visible chars on top (a baked-in picture-book
page); `digital` otherwise. Without `signals` the visible-char test uses `textChars`.

Rejected mapping: `image_filters.min_side` for pages with many tiny rasters. The deterministic
filter already prunes them before any model call (`image-filtering.ts:31-35`), so the saving
is negligible and the advice can hide small real figures.

Readiness: any critical → `poor`; any warning → `degraded`; otherwise `ready`.

Heuristic kinds are reserved, not shipped, until their experiment freezes a threshold:
`text-like-structure` (row-projection line bands on a page with 0 chars: the strong "needs
text recovery" flag, E1), `outlined-text` (text drawn as paths, E2), `garbage-text` (PUA /
replacement characters, vowel ratio, E3), `crop-cuts-ink` (ink continuing just outside a
crop edge, E4), `font-risk` (Type3 / no `ToUnicode` / non-embedded, from a `/Resources/Font`
walk; v1.1, see Non-goals). From the 2026-10-28 taxonomy: `legacy-font` (Zawgyi, Kruti Dev,
Preeti and similar name patterns, beside `isFMFont` in `packages/pdf/src/fm-sinhala.ts`, v1.1
with the font walk), `duplicated-text` (fake bold and shadows: identical runs at near-identical
positions in `positioned-text`, double narration), `lossy-jbig2` (`/JBIG2Decode` with
`/JBIG2Globals` in a scanned file: digits may be silently substituted), `annotations-present`
(`signals.annotations > 0`: stamps and notes drawn into the render). Adding one later is a
one-line enum change plus its rule and message.

### Where it is computed: reuse first, one input shape, two builders

**What the extractor already hands the pipeline.** When `extractPDF` (`pdf-extraction.ts:116`)
receives an `ExtractedPage`, it already holds — in *every* figure-extraction mode, because
`stampRasterPlacementsFromOps` runs unconditionally (`extract.ts:963`) — `text`;
`images[]` with native `width`/`height`, placed `bounds` (page pt), `hash`, `renderMethod`,
`streamSeqno`, `blendMode`, `opacity`, `clipPath`; `positionedText` (page size);
`extractionDebug` with `groups[].{imageId, groupIndex, groupBbox, renderMethod,
coveredRasterImageIds}` and the shape counters; `fontStats`. `pdfMetadata` carries
`producer`, `format`, `encryption` (`extract.ts:852`; dropped today by `toBookMetadata`), and
the spread suggestions are computed in the same function (`pdf-extraction.ts:146`). So these
15 kinds are pure pipeline code with **no extractor change**: `text-layer-empty`,
`script-mismatch`, `raster-overlay-split`, `raster-tiles`, `mixed-page-types` (its ink-blank
half waits for `signals`), `figure-render-holes`, `whole-page-figure`,
`low-resolution-raster`, `layered-artwork`, `duplicate-images`, `page-geometry` (size and
orientation half), `spreads-unmarked`, `book-scale`, `shape-flood`, `pdf-encrypted`
(permissions half, from the `encryption` string), and the text profile.

**One input shape, two builders** (`packages/pipeline/src/source-assessment.ts`):
`PageAssessmentInput` (text counts and script histogram, page size, rasters, figures joined
from `extractionDebug.groups` to `images` by `imageId` — the figure's `bounds` carries the
spread `xOffset` that `groupBbox` lacks, `extract.ts:4063` vs `4096-4101` — counters, and
`signals: SourcePageSignals | null`) and `SourceAssessmentInput` (pages, pdf, spread
suggestions, settings). `pageInputFromExtractedPage(page)` builds it from memory inside
`extractPDF`; `pageInputFromStorage(storage, pageId, previousSignals)` builds the same shape
from the `pages` and `images` tables, `positioned-text` and `extraction-debug`, so the
spreads re-apply route (`pages.ts:1290`) and `extract-report` recompute without re-extracting.
Per-raster evidence is therefore never persisted twice; only `signals` (the numbers no table
holds) travel in the node. A test proves both builders agree on a raven page.

**`assessSource(input): SourceAssessment`** is pure (no provider import; deep-equal on
identical input): one rule function per kind, `SOURCE_THRESHOLDS`, aggregation, readiness.
`sourceAssessmentNote(a)` returns `"Completed — source assessment: N warning(s), M critical"`
only when `counts.warning + counts.critical > 0`. `pdf-extraction.ts` writes the node after
`font-profile` with `putNodeData` (a new version per run; `clearExtractedData` wipes it with
the pages), then emits `step-complete` for `extract` with the note; the runner already
persists step messages (`stage-runner.ts:963-985`) and `GET step-status` returns them for done
steps (`stages.ts:446-449`). The settings the rules need (`editing_language`, the image-filter
flags, spread pairs) are not visible to `extractPDF` today, so `ExtractOptions` gains an
`assessmentSettings` field filled by both callers — the stage runner and the CLI DAG
(`pipeline-dag.ts:266-283`).

**What only the extractor can see** (`ExtractedPage.sourceSignals`, transient like
`fontStats`, filled in `extractPage` (`extract.ts:908-1039`) and `extractSpreadPage` (1699)):

- **One pixel pass, replacing a decode.** Today the page render is chained
  `page.toPixmap(…).asPNG()` (`extract.ts:918-922`) and the pixmap is never kept, while
  `samplePageEdges` (`pdf-extraction.ts:131` → `png-utils.ts:37-57`) fully decodes that PNG
  again with pngjs on every page just to read two columns × 48 rows. The restructure keeps the
  pixmap, runs `scanPagePixmap` over `getPixels()` at a 4-px step (ink fraction = share of
  samples darker than 240/255; the 48 edge samples computed with the `png-utils.ts:47-55`
  formula verbatim so `detectSpreads` sees bit-identical input and `spread-detection.ts` is
  untouched), encodes the PNG, then `destroy()`s the pixmap explicitly.
  `renderPageWithoutWatermarks` (`watermarks.ts:309-458`) returns the pixmap instead of bytes
  on success. `samplePageEdges` stays exported: the API still uses it as the fallback for
  books extracted before inline detection (`pages.ts:1275`).
- **Counters at existing sites, zero cost**: `collectGlyphs` (`page-stream-recorder.ts:482-506`)
  returns the `ucs <= 0` count it drops today; the recorder's `ignoreText` callback
  (`page-stream-recorder.ts:289`, a no-op today) counts the render-mode-3 glyphs mupdf still
  returns in `toStructuredText()` (probed 2026-10-29 on mupdf 1.27.0); decode/render failures
  counted at the warn sites (`extract.ts:1282, 2080, 2128, 3779, 3824`, `flip-utils.ts:212`);
  U+FFFD counted in the text.
- **Occlusion from the recorded ops, pure JS**: the recorder already gives every `fillPath`
  its `seqno`, `bbox`, `color` and composed `alpha`, and `stampRasterPlacementsFromOps`
  stamps each raster's `streamSeqno` (`extract.ts:1274`). For each raster, the opaque
  (`alpha ≥ 0.95`) fills, images and text painted *after* it that are not members of its own
  figure group are unioned over its bounds; ≥ 10 % coverage lands in
  `signals.occludedRasters`. Bounded by the page's op count, which `shape-flood` already caps.
- **Dictionary reads, microseconds**: `/Rotate` and MediaBox vs CropBox vs TrimBox from the page
  (`getBounds("MediaBox"|"CropBox"|"TrimBox")`), the `/Annots` count; colour-space class and
  `/ImageMask` / `/SMask` presence for every raster by calling `classifyImageColorSpace`
  (`extract.ts:2008-2012`, today only for JPEGs); once per document: `needsPassword()` /
  `hasPermission()` (`openPdfFromBuffer`, `extract.ts:816-823`), `countLayers()` plus the
  `/OCProperties /D /OFF` array, `/AcroForm /XFA` and `/NeedsRendering`, `/Names
  /EmbeddedFiles` and `/Collection` from the catalog, `/MarkInfo /Marked`, `wasRepaired()`,
  and `/Creator` beside `/Producer` → `source.structure` and `source.producerFamily`.
- **Watermark detection always on**: `detectTextWatermarks` (`watermarks.ts:180-233`) samples
  ≤ 16 pages with one extra `page.run` each — the only net cost in this spec (≈ 100–300 ms
  per book) — and its signatures are applied only when `remove_watermarks` is on.
- **Password-required PDFs**: `loadPage` throws before any page exists, so no node can be
  written; `openPdfFromBuffer` throws a typed `PdfPasswordRequiredError` whose message reaches
  the `step-error` event and the UI as-is.

### Cost

Per 1200 × 1680 render (a letter page at 2×):

| Signal | Cost | Net effect |
|---|---|---|
| Ink + edge samples from the pixmap view (1/16 of the pixels) | ≈ 1–3 ms | Replaces the pngjs decode in `samplePageEdges` (≈ 30–80 ms) → **−30 to −75 ms per page** in single-page mode |
| Explicit `pixmap.destroy()` | 0 | Less WASM heap pressure (today the pixmap waits for the finalizer) |
| Unmapped-glyph and failure counters | 0 (existing callbacks and catches) | — |
| U+FFFD / script histogram; all geometry rules | < 1 ms per page, pure JS | — |
| `/Rotate`, boxes, colour space, permissions | µs | — |
| `detectTextWatermarks` with removal off | ≈ 100–300 ms **per book** (≤ 16 `page.run`) | The only net cost; < 1 % of a 40-page extract |
| Node write | ≈ 5 ms per book; ≤ ≈ 100 KB at 300 pages (`extraction-debug` is already 298 KB on cuaderno4) | — |

Expected: net negative on single-page books, ≈ neutral in spread mode (no edge sampling
there today; `stitchPngsHorizontally` keeps its own decode, listed under O5).

### Relationship to existing signals

- `ExtractionWarning` / `text-layer-missing` stays as the after-Sectioning *confirmation*.
  The panel's `text-layer-empty` row adds "confirmed by Sectioning: N pages" from the
  existing `PageSummary.extractionWarning`. The `StageSidebar` boolean `hasNoTextLayer`
  becomes a count fed by both.
- `extraction-debug` stays the engineer-facing raw record; evidence refs (`imageId`,
  `groupIndex`) are the join key into its `groups[]` so `/debug/*` can explain any finding.
- Step notes use the #1012 channel verbatim (`"Completed — "` prefix recognised by
  `apps/studio/src/components/pipeline/components/step-notes.ts`).
- `extract-report`'s `textProfile` thresholds and `MIN_TEXT_LAYER_CHARS` are the ones
  reused here; the report reads the node instead of recomputing once it exists.

### Studio

Under `apps/studio/src/components/pipeline/stages/extract/`:

- `components/SourceQualityPanel.tsx`, rendered in `ExtractView.tsx` above the page grid: a
  readiness summary (tone green `ready` / amber `degraded` / red `poor`, counts by severity,
  `pagesWithText/pageCount`, text profile), then one row per finding: severity chip,
  translated title and description with `params`, page links into `ExtractPageDetail`, and a
  recommendation line. A `setting` recommendation renders as "Set *<control label>* to
  **<value>**" using the same label the control shows on `ExtractLandingPage` /
  `ExtractSettings` (value-less: "Check *<control label>*"), with the note that a changed
  extraction setting is a new book under SPEC-0010. Actions link where a target exists:
  `mark-spreads` scrolls to `SpreadReview`; `figure-cleanup` opens the page detail of the
  first evidence page (SPEC-0020's entry point); `get-text-pdf`, `trim-page-range` and
  `normalise-pages` are text only. Nothing is applied automatically.
- `SummaryCard`, `SeverityLabel` and `FindingPageLinks` are lifted out of
  `components/validation/AccessibilityValidationTabs.tsx:35-186` into
  `components/validation/shared/` and reused.
- `lib/source-assessment-messages.ts`: `Record<SourceFindingKind, { title, description }>`
  plus `RECOMMENDATION_MESSAGES` keyed by setting key and action, with Lingui `msg`
  descriptors and `params` placeholders; a unit test proves every enum member has an entry.
  New entries in all five `.po` catalogs.
- Page cards: a severity dot from `PageSummary.sourceFindings.severity` with the kinds in
  the tooltip, distinct from the existing amber triangle (which now reads "confirmed").
- `ExtractPageDetail`: a "Source findings" list beside the pruned-image list, so a pruned
  overlay finally shows "drawn over `pgNNN_imMMM`" next to its prune reason.
- `StageSidebar`: the Extract badge becomes `counts.warning + counts.critical`.
- Nothing is disabled or gated. Panel collapse state is local UI; no persisted dismissal.

### API

- `apps/api/src/routes/source-assessment.ts`: `GET /books/:label/source-assessment` →
  `{ version: number | null, assessment: SourceAssessment | null }`, `safeParse` on read like
  `debug.ts:250-256`. A user-facing route, not `/debug/*`.
- `PageSummary` (`pages.ts:126`) gains `sourceFindings: { kinds: SourceFindingKind[];
  severity: SourceSeverity | null }` from one node read per request; `PageDetail` gains the
  page's `SourceFinding[]`.
- The spreads re-apply route (`pages.ts:1290-1370`) reads the previous node before it splices
  the pages, rebuilds the input with `pageInputFromStorage` (previous `signals` for untouched
  pages, fresh ones from `extractPages` for the re-extracted pair) and writes a new version.
- `BookSummary` (`packages/types/src/book.ts`) gains optional `sourceReadiness`, dropped if
  the books-list benchmark (#996) regresses.

### CLI

- `pipeline run` prints the note (the #1012 sink already does).
- `extract-report` (after #1009 merges) gains a "source" section printed from the node by an
  English formatter in `packages/pipeline`; `--json` embeds the node; `--compare` diffs
  `summary.counts` and `settings`; a pre-spec book falls back to the recomputed profile.
  Exit code 1 when `counts.warning + counts.critical > 0`, consistent with #1009.

## Impact map

- `packages/types`: `source-assessment.ts`, index export, registry rows in
  `pipeline-effects.ts` (`PipelineNodeName`, `EXTRA_STAGE_OUTPUT_NODES.extract`,
  `NODE_CACHE_RESOURCES["source-assessment"] = ["book", "pages"]`), `BookSummary` field.
- `packages/pdf`: `ExtractedPage.sourceSignals`, the pixmap pass (`pixmap-signals.ts`) and
  the render restructure, counters at the warn and drop sites (including the recorder's
  `ignoreText`), the occlusion pass over recorded ops, page-box (TrimBox included), annotation
  and colour-space / mask reads, `needsPassword`/`hasPermission`, the catalog reads behind
  `source.structure`, always-on watermark detection. No change to grouping or to any
  extraction output.
- `packages/pipeline`: `source-assessment.ts`, `pdf-extraction.ts` (collect, aggregate,
  write, note, use the pixmap edge samples instead of `samplePageEdges`), `extract-report.ts`.
- `packages/storage`: none for the node (`node_data` is generic; `clearExtractedData` already
  covers it). One independent fast-lane fix: `clearExtractedRows` (`book-storage.ts:662`)
  deletes every `step_runs` row, including the `extract` row whose `started_at` was just
  written, so extract wall time cannot be measured from the DB today; the fix keeps the
  `extract` row and lands before AC-18 is measured.
- `apps/api`: route and test, `PageSummary`/`PageDetail`/`BookSummary`.
- `apps/studio`: panel, messages map, page badges, page detail, sidebar count, shared
  validation components, five catalogs.
- Docs: `docs/specs/INDEX.md`; `docs/ARCHITECTURE.md` Extract outputs list (with PR 2c).
- Invariants: entity versioning (new version per run, never overwritten); the layer rule
  (Studio imports only constants from `@adt/types`). No new invariant, no migration, no new
  dependency.
- Concurrent work: SPEC-0010 (#886: list the node in the extraction inventory; it is wiped
  by `clearExtractedData` like every Extract output), SPEC-0020 (#993: recommendation target),
  SPEC-0016 (#932: may consume the node), #1009 (`extract-report` integration lands after it
  merges), #1013/#1015 (the step-note channel this spec reuses).

## Acceptance criteria

- [ ] AC-1: After `extract` completes, exactly one `source-assessment` node (item `book`)
  exists for that run, parses with `SourceAssessment`, and `pages.length === pageCount`
  (`tests/fixtures/raven.pdf`).
- [ ] AC-2: `text-layer-empty` grades the corpus as: qa784 critical with
  `textProfile: image-only` (100/100 empty); cuaderno4 critical (31/38); Uruguay_Ceibal
  info (5/25); `prac_math_vol2` no finding.
- [ ] AC-3: `raster-overlay-split` is reported on ≥ 25 cuaderno4 pages with evidence
  `[body, overlay]`, severity `warning` and recommendation `{ setting:
  figure_extraction_mode, value: auto }` under `figure_extraction_mode: off`, and severity
  `info` with action `figure-cleanup` under `auto`; an overlay whose `streamSeqno` is lower
  than its body's (drawn underneath) is `critical`; cuaderno3 `pg009` is flagged.
- [ ] AC-4: `figure-render-holes` is reported for cuaderno4 `pg012` with the `groupIndex` of
  `pg012_im012` and the covered raster image ids in evidence.
- [ ] AC-5: `whole-page-figure` is `warning` when ≥ 25 % of pages have a raster covering
  ≥ 85 % of the page, `info` below that, absent at 0 (synthetic bounds; the #901 image-only
  PNLD book when available).
- [ ] AC-6: `duplicate-images` is reported with `params.duplicates` and `params.extracted`
  when ≥ 10 % of extracted images share a hash across pages (qa784: 288 / 1,049) and is absent
  below 10 %.
- [ ] AC-7: `page-geometry` is reported when any page deviates > 2 % from the modal size,
  mixes orientation, has `/Rotate ≠ 0`, `CropBox ≠ MediaBox` or `TrimBox ≠ CropBox`
  (two-size fixture; a bleed fixture with a TrimBox 9 pt inside the CropBox).
- [ ] AC-8: `spreads-unmarked` is reported iff `spread-suggestions` is non-empty and spread
  mode is off (cuaderno3 extracted in single-page mode).
- [ ] AC-9: `image-decode-failed` counts every former `console.warn` site; a fixture with
  one corrupt image XObject yields `params.count = 1` and extraction still completes.
- [ ] AC-10: A password-required fixture fails the `extract` step with the message
  "PDF requires a password to open" (typed error, no node); a fixture with an owner password
  and restricted permissions extracts normally and yields `pdf-encrypted` info with
  `params.copy`, `params.accessibility`, `params.print`.
- [ ] AC-11: The `extract` step's completion message is
  `"Completed — source assessment: …"` iff `counts.warning + counts.critical > 0`:
  `prac_math_vol2` produces no message and a plain green pill; cuaderno4 produces the amber
  "Completed with a warning" pill whose popover carries the note.
- [ ] AC-12: `GET /books/:label/source-assessment` returns the latest version, returns
  `{ version: null, assessment: null }` for a book without one, and
  `PageSummary.sourceFindings` equals the node's per-page rollup.
- [ ] AC-13: `assessSource` run twice on identical input yields deep-equal output, and
  `packages/pipeline/src/source-assessment.ts` imports nothing from `@adt/llm`.
- [ ] AC-14: The Source quality panel renders one row per finding with translated title,
  description and recommendation, and page links that open `ExtractPageDetail`; every
  `SourceFindingKind` has a message entry, and all five catalogs contain the ids with no
  empty `msgstr`.
- [ ] AC-15: Page cards show a severity badge for every page listed in `pages[].kinds`, and
  the StageSidebar Extract badge equals `counts.warning + counts.critical` (cuaderno4).
- [ ] AC-16: With readiness `poor` (qa784), Sectioning runs and export prepares; no control is
  disabled because of the assessment.
- [ ] AC-17: `extract-report` prints the persisted findings, exits 1 when warnings or
  criticals exist, embeds the node in `--json`, and falls back to its recomputed profile for a
  book without the node.
- [ ] AC-18: False-positive and cost bounds: `prac_math_vol2` has zero critical and ≤ 2
  warning findings; extract wall time on `prac_math_vol2` and qa784 is within +5 % of the
  pre-spec run (same machine, three runs each, measured from `step_runs.started_at /
  completed_at` once the `clearExtractedRows` fix has landed; until then from a non-committed
  timing script around `extractPdfStream`). Spread suggestions on cuaderno3 are deep-equal
  before and after the pixmap pass.
- [ ] AC-19: `raster-tiles` is reported for a synthetic page whose figure is four abutting
  tiles (2 × 2, gaps ≤ 1 pt) with all four in evidence, `warning` under `off` and `info` under
  `auto`; two rasters side by side whose union is not a rectangle produce no finding.
- [ ] AC-20: On a synthetic page with a full-page raster and render-mode-3 text (an OCR layer),
  `signals.invisibleGlyphs` equals the hidden glyph count, `hidden-text-layer` is `warning`,
  the page counts as empty for `text-layer-empty` and its `pageType` is `scanned`; the same
  hidden text on a page with visible body text and no full-page raster yields `info`.
- [ ] AC-21: A fixture with `/OCProperties` (two layers, one off by default) yields
  `optional-content` warning with `params.layers = 2, params.off = 1`; a portfolio fixture
  (`/Collection`) and a `/NeedsRendering true` XFA fixture each yield `pdf-container`
  critical, and attachments alone yield info.
- [ ] AC-22: `raster-occluded` is reported for a raster with an opaque rectangle painted after
  it over ≥ 10 % of its bounds, with `params.coveredRatio` and `params.byKind = "fill"`; the same
  rectangle painted *before* the raster, or at alpha 0.5, produces no finding.
- [ ] AC-23: `mixed-page-types` is reported on a two-kind synthetic book (text pages plus
  image-only pages) with the scanned pages in `pageIds`, and is absent on `prac_math_vol2` and
  qa784 (all digital, all scanned).

## Test plan

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | integration | `packages/pipeline/src/__tests__/pdf-extraction.source-assessment.test.ts` | `AC-1: writes one valid source-assessment node per extract run` |
| AC-2 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-2: grades text-layer-empty by the empty-page ratio` |
| AC-3 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts`, `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-3: reports raster-overlay-split for nested rasters with mode-aware severity` |
| AC-4 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-4: reports figure-render-holes for a vector group over excluded rasters` |
| AC-5 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-5: reports whole-page-figure at 85 % page coverage` |
| AC-6 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-6: reports duplicate-images at 10 % shared hashes` |
| AC-7 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts`, `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-7: reports page-geometry beyond 2 % deviation, rotation or differing page boxes` |
| AC-8 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-8: reports spreads-unmarked only with suggestions and spread mode off` |
| AC-9 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-9: counts image decode failures without aborting extraction` |
| AC-10 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-10: fails clearly on a password-required PDF and reports pdf-encrypted on restricted permissions` |
| AC-11 | integration + browser | `apps/api/src/services/stage-runner.test.ts`, `apps/studio/src/components/pipeline/components/SubStepPillRow.test.tsx` | `AC-11: extract note appears only with warning or critical findings` |
| AC-12 | integration | `apps/api/src/routes/source-assessment.test.ts`, `apps/api/src/routes/pages.test.ts` | `AC-12: returns the latest assessment, nulls when absent, and page rollups` |
| AC-13 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-13: assessment is deterministic and provider-free` |
| AC-14 | unit + browser | `apps/studio/src/lib/source-assessment-messages.test.ts`, `apps/studio/src/components/pipeline/stages/extract/components/SourceQualityPanel.test.tsx` | `AC-14: every finding kind has a translated title, description and recommendation` |
| AC-15 | browser | `apps/studio/src/components/pipeline/stages/extract/ExtractView.source-assessment.test.tsx`, `apps/studio/src/components/pipeline/components/StageSidebar.test.tsx` | `AC-15: page badges and the sidebar count follow the assessment` |
| AC-16 | integration + browser | `apps/api/src/routes/stages.test.ts`, `apps/studio/src/components/pipeline/stages/extract/ExtractView.source-assessment.test.tsx` | `AC-16: poor readiness never disables run or export` |
| AC-17 | unit + integration | `packages/pipeline/src/__tests__/extract-report.test.ts` | `AC-17: extract-report prints persisted findings and sets the exit code` |
| AC-18 | corpus + integration | `docs/verification/spec-0021.md` (recorded), `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-18: false-positive bound on prac_math_vol2 and extract wall time within +5 %`; `AC-18: pixmap edge samples equal samplePageEdges of the PNG` |
| AC-19 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-19: reports raster-tiles for abutting rasters that union to a rectangle` |
| AC-20 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts`, `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-20: counts invisible glyphs and grades an OCR layer as a scan` |
| AC-21 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-21: reports optional-content layers and pdf-container forms and portfolios` |
| AC-22 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts`, `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-22: reports raster-occluded for opaque content painted over a raster` |
| AC-23 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-23: reports mixed-page-types only when digital and scanned pages coexist` |

Fixtures: cuaderno4 pages 1, 6 and 12 and cuaderno3 page 9 extracted in the test (the
PDFs are local corpus files, listed in `docs/verification/spec-0021.md`, not committed);
synthetic PDFs from `packages/pdf/src/__tests__/create-test-pdf.ts` (which today builds
fonts, images and clips only) extended with a `/Rotate 90` page, a CropBox ≠ MediaBox page, a
TrimBox page, a truncated DCT XObject, a 2 × 2 tiled image, an opaque rectangle over a raster,
a render-mode-3 text layer over a full-page image, an `/OCProperties` catalog with two
layers, a `/Collection` portfolio and a `/NeedsRendering` XFA stub (all raw content streams
and catalog objects, which `PDFDocument.addObject` builds; the Tr 3 page is already proven by
the 2026-10-29 probe), and an owner-password file if mupdf's `save({ encrypt })` supports it
in the pinned build — otherwise a tiny committed fixture with its provenance recorded;
`tests/fixtures/raven.pdf` for AC-1 and the pixmap-vs-PNG equality.

Corpus matrix: the taxonomy's five three-page samples (§11 of the document) become the
verification matrix in `docs/verification/spec-0021.md`, each row listing the kinds it must
trigger — print-ready InDesign export (`raster-tiles`, `page-geometry` TrimBox,
`needs-convert-colorspace`, `optional-content`, pasteboard content); picture book
(`whole-page-figure` with `liveTextOverlap`, `layered-artwork` soft masks, `raster-occluded`);
science or maths textbook (`figure-render-holes`, composite figures); scanned or mixed book
(`text-layer-empty`, `hidden-text-layer`, `mixed-page-types`); non-Latin script book
(`text-unmapped-glyphs`, `script-mismatch`, `watermark-detected`, `spreads-unmarked`). The
samples are requested from @Elias; they are committed only if small and rights-free,
otherwise kept as local corpus files like cuaderno4.

## Rollout

No feature flag: the assessment is additive, free and deterministic, and an absent node
means no UI. Thresholds are exported constants so SPEC-0005 can tune them with corpus
evidence. Each PR is revertable on its own; reverting PR 2c removes the node and the note,
and every consumer tolerates its absence.

Implementation PRs (≤ 400 changed lines each, in dependency order; the first
value-bearing PR touches no extractor code):

1. `packages/types`: schema, constants, registry rows, `BookSummary` field (≈ 190).
2. `packages/pipeline`, rules computable from `ExtractedPage` alone, then the write:
   a) text and page-type kinds (`text-layer-empty`, `script-mismatch`, `pageType`,
   `mixed-page-types`, `whole-page-figure`, `duplicate-images`, `shape-flood`, `book-scale`);
   AC-2, AC-5, AC-6, AC-13, AC-23 (≈ 300);
   b) figure-geometry kinds (`raster-overlay-split`, `raster-tiles`, `figure-render-holes`,
   `low-resolution-raster`, `layered-artwork`); AC-3, AC-4, AC-19 (≈ 280);
   c) document kinds, the signal-fed rules (`hidden-text-layer`, `raster-occluded`,
   `optional-content`, `pdf-container`, ink kinds — all skipped while `signals` or
   `source.structure` is null), aggregation, rollups, note, the write in `pdf-extraction.ts`,
   `assessmentSettings` threaded from both callers, `pageInputFromStorage`; AC-1, AC-7,
   AC-8, AC-11 (≈ 380).
3. `packages/pdf`, in two PRs. Reverting either degrades (its kinds vanish, the pngjs call
   returns) rather than removing the node.
   a) page signals: the pixmap pass and render restructure, `sourceSignals`, counters
   (including `ignoreText`), the occlusion pass, page-box (TrimBox) / annotation /
   colour-space / mask reads, `pdf-extraction.ts` switched to the pixmap edge samples;
   fixtures; AC-9, the AC-7 box half, AC-18, the AC-20 and AC-22 integration halves (≈ 360);
   b) document reads: permissions, the `PdfPasswordRequiredError`, the catalog reads behind
   `source.structure`, `producerFamily`, always-on watermark detection; fixtures; AC-10,
   AC-21 (≈ 200).
4. `apps/api`: route, payload fields, spreads re-apply recompute, AC-12, AC-16 (≈ 250).
5. `apps/studio` a) shared validation components, messages map, hook, catalogs (≈ 320);
   b) panel, page badges, page detail, sidebar; AC-14, AC-15 (≈ 400). The amber pill itself
   arrives with #1013; until then the note is persisted and served by `step-status`.
6. CLI: `extract-report` section, AC-17 (≈ 150; after #1009 merges).

Independent fast-lane fix, before AC-18 is measured: keep the `extract` row in `step_runs`
when `clearExtractedRows` runs (`book-storage.ts:662`), with a test that `started_at`
survives a re-extract.

Verification record: `docs/verification/spec-0021.md` with the corpus table (books,
findings, counts, wall time) before the status moves to `implemented`.

### Experiments scheduled by this spec (experiment lane, ≤ 2 weeks each, `docs/experiments/`)

| Exp | Question | Data | Freezes |
|---|---|---|---|
| E1 | `text-like-structure` precision and recall | qa784 (30 hand-labelled pages), cuaderno4 empty pages; PNLD pages as negatives | band height range, minimum bands, coefficient of variation |
| E2 | `outlined-text` thresholds | synthetic fixture via `create-test-pdf.ts`; any customer PDF with outlined text | fill count, row count |
| E3 | `garbage-text` bounds | FM Sinhala fixture before remapping (`fm-sinhala.test.ts`); PNLD and cuaderno text as negatives; the taxonomy's non-Latin sample | vowel-ratio bounds, PUA rate, Arabic presentation-form rate (U+FB50–U+FDFF, U+FE70–U+FEFF), space ratio (glyph-by-glyph text with no U+0020) |
| E4 | `crop-cuts-ink` thresholds | #901 crops (21 pages), cuaderno4 overlay bounds | band width, continuation ratio |
| E5 | effective-DPI, colour-space and layered-artwork distributions | every raster in the corpus | info/warning cut-offs; the taxonomy flags < 150 ppi, the draft rule < 100 dpi — E5 picks between them |
| E6 | render-byte stability | 5 processes × 20 pages | whether `ExtractedImage.hash` and the LLM cache key should hash pixmap pixels instead of PNG bytes |
| E7 | deterministic-skip rules for meaningfulness (O1 below) | qa784 baseline verdicts | agreement floor (≥ 95 %), token saving (target −30 % calls) |
| E8 | stacked-raster composite audit (R-a below) | 30 random `raster-overlay-split` pairs across the corpus, manual review | default on or off |
| E9 | RAM and page limits for `book-scale` (#957) | a synthetic 500-page PDF, RSS over time | warning thresholds |
| E10 | render-vs-raw diff on directly decoded rasters (the taxonomy's "match what the page shows"): warp the decoded raster by its placement and clip, diff against the page render | the taxonomy's picture-book and InDesign samples, cuaderno4 | cost per raster, diff threshold, and whether it should replace the structural `raster-occluded` rule in v2 |
| E11 | inverted CMYK JPEGs (Adobe APP14 transform, `/Decode [1 0 …]`): does mupdf decode them correctly in `classifyImageColorSpace`'s path | a synthetic APP14 CMYK JPEG and one with an inverting `/Decode` | promote to a warning kind if any comes out as a negative; otherwise nothing |

### Follow-ups this spec references but does not own

Remedies, each gated by a measurable criterion and triaged on its own (fast lane unless
the triage says spec):

- **R-a Composite stacked rasters regardless of `figure_extraction_mode`** behind a new
  config `composite_stacked_rasters` (default on; added to `EXTRACTION_CONFIG_KEYS` in
  `packages/types/src/fingerprint.ts`): one page-crop over the union of the pair's bounds via
  `cropFigureFromPageRender` (`extract.ts:3788`), members added to `coveredRasterHashes`.
  Gate: cuaderno4 yields ≥ 25 owl composites and 0 "narrow cropped fragment" prunes;
  `prac_math_vol2` image count unchanged; E8 audit. Changes extraction output, so triage
  decides between fast lane and its own spec.
- **R-b Prune guard for a contained overlay** in `off` and `all` modes (extend the auto-only
  guard at `image-meaningfulness.ts:299-322`): with R-a off, 0 overlay prunes on cuaderno4.
- **R-c No holes**: a vector group overlapping excluded rasters renders as `page-crop`
  (decision at `extract.ts:4036-4048`); `pg012_im012` contains the photos; ≤ 3 % of PNLD
  vector figures flip render method.
- **R-d** Crop padding by an ink test and ink-adjacency group merge (after E4).
- **R-g** Align the background-split comment with the code (`extract.ts:2143-2147` vs
  3927-3933).
- **R-h Describe what the page shows**: alt text, captions and meaningfulness verdicts for a
  raster flagged `raster-occluded` are generated from its page-crop, never from the raw
  raster, so labels hidden under answer boxes cannot leak into them. Owner: SPEC-0020 (#993),
  together with the taxonomy's remediation design.
- **R-i Annotations in renders**: decide whether `toPixmap` should pass `showExtras = false`
  (review stamps and notes are drawn into page renders and page-crop figures today), gated on
  `annotations-present` counts from the corpus. Changes extraction output.

Optimisations the assessment enables:

- **O1** Deterministic verdicts skip the meaningfulness call: exact duplicates (#1011),
  small decorations repeated on ≥ 5 pages, standalones replaced by an R-a composite, a
  full-page raster on an image-only page (E7 gate).
- **O2** Downscale sub-images for classification (roadmap experiment).
- **O3** Stable render hashes (E6) for fewer cache misses.
- **O4** Bound `extraction-debug` (≤ 200 groups per page, ≤ 20 shapes per group, 0.1 pt
  rounding) and give it a zod schema and registry row — separate fast-lane PR.
- **O5** One pixel pass per page shared by the ink signals, the edge samples (done by this
  spec) and the page-crop decodes (`cropPng` decodes the whole page PNG once per page-crop
  figure, `extract.ts:3788-3826`; `stitchPngsHorizontally` decodes both halves of a spread).
- **O6** Compute `grayscaleStdDev` while the raster is still a pixmap so
  `classifyPageImages` skips a decode.
- **O7** Opt-in vision spot check on ≤ 5 flagged pages with the cheapest model, cached — v2.

## Open questions

1. Post-image-pass enrichment ("and the overlay was then pruned", "whole-page figure kept")
   as a read-time join against `image-filtering` in the API — yes or no. Owner:
   @gbergengruen, by spec approval.
2. Thresholds for `low-resolution-raster`, `text-unmapped-glyphs`, `whole-page-figure`
   (85 % / 25 %) are frozen after E5 and the corpus run in PR 3a. Who signs off: the product
   reviewer of this spec.
3. Persisted acknowledgement ("Mark checked", a new node version with `acknowledgedAt`) —
   product call, not blocking.
4. `outlined-text` as a v1 proxy (0 chars plus a high `totalVectorShapes`) or wait for E2.
5. `BookSummary.sourceReadiness` in the books list — keep if the list benchmark (#996)
   holds, otherwise read on demand.
6. `spreads-unmarked` after the user marks spreads (a new book under SPEC-0010): stays with a
   "settings differ" note, or disappears. Default if unanswered by approval: disappears
   (the rule subtracts `settings.spreadPairs` from the suggestions).
7. R-a: fast lane or its own spec — triage.
8. `figure-render-holes` is defined on the figure's `bounds` joined by `imageId`, not on
   `extractionDebug.groups[].groupBbox` (which lacks the spread `xOffset`), and keys on
   `renderMethod: "vector"` plus an uncovered raster overlap ≥ 50 %, not on `hasImages`
   (SVG `<image>` elements set it in `off` mode too, `extract.ts:3045-3085`). Confirm on
   cuaderno4 `pg012` in PR 2b; if the join misses, PR 3a records `overlappedRasterImageIds`
   at the render decision as originally drafted.
9. `optional-content`: is naming the layers enough, or should a later setting choose the
   language layer to extract (the taxonomy's "ask which language layer")? That setting would be
   an `EXTRACTION_CONFIG_KEYS` entry and a new `SourceRecommendation` key. Product call; v1
   names the layers only.
10. `mixed-page-types` threshold (minority ≥ 5 % of pages for a warning) is a first guess,
    frozen with the corpus matrix run in PR 3a.
