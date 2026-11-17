---
id: SPEC-0021
title: Source PDF assessment
status: approved
owner: "@gbergengruen"
approvers: ["@ksokolovic"] # maintainer + product sign-off, 2026-11-17 (#1017 comment 6946992457)
issues: ["#1016", "#1008", "#1012", "#901", "#676", "#985", "#326", "#749", "#957"]
prs: ["#1009", "#1013", "#1015"] # PR 0 adopted 2026-10-29; #1013 implements §Step warnings; #1015 emits summary-missing
adr: ""
created: 2026-10-27
updated: 2026-11-17
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
Revised the same day after an independent review of PR #1017: false-positive guards on the new
rules, schema gaps closed, every kind given a PR and an AC, and the read-only `extract-report`
CLI (#1009) adopted as PR 0 of this spec, with #1013 named as a hard prerequisite (§Rollout).
Amended again on 2026-10-29 after the review of #1013. Step notes become **typed step
warnings** (§Step warnings): data that Studio translates, instead of English server text
matched on its `"Completed —"` prefix. #1013 implements them. It moves from an independent
fast-lane PR to an implementation PR of this spec (§Rollout), because the change adds a column
to `step_runs` and changes what `GET step-status` and the `step-complete` event carry.
Amended on 2026-11-04 after @ksokolovic's review of PR #1017, to close four contract gaps. The
assessment's lifecycle is reconciled with SPEC-0010: it is derived from the extraction
inventory, every write appends a version, and absence is a supported state (§Lifecycle). Step
warnings stay truthful when a newer kind or an older app is involved: elements are parsed one
by one, the column is stamped with its completion, and the `source-assessment` warning is
derived from the node (§Step warnings). The snapshot is now distinct from current settings,
with refresh triggers (§Snapshot and current settings). The geometry passes have an explicit
work budget, and a truncated pass is reported as incomplete (§Work budget).
Amended on 2026-11-13 after @ksokolovic's re-review, to close three remaining gaps. Preserved
assessment history now names its prerequisite: an extraction rerun must be refused at the
common extraction boundary, either by SPEC-0010 or by an interim guard this spec adds
(§Lifecycle). Coverage is reported apart from severity on every compact surface, so a book
whose checks were cut short never shows a plain green pill (§Work budget). A completion
written by an older app is read through a bounded adapter for the one warning those apps
record, a page skip, and otherwise as "completed by an older version", never as a clean
completion (§Step warnings).
Amended on 2026-11-16, before the third re-review, against develop at af7972c72 (76 commits
after this spec branched). An extraction without the `packages/pdf` signals reports the
checks it could not run as incomplete, exactly as a Reassess does, and PR 2d ships in the same
release as PRs 3a and 3b (§Work budget, decision 20). Watermark removal now also learns stamps
baked into page images (#1106). Without removal, `watermark-detected` sees text-layer stamps
only, and with removal on it reports what was removed (decision 23). Images added in Extract
after extraction (#1104) are not part of the extraction inventory (decision 22). Books whose
working source is an imported ADT bundle (#803) get no assessment (decision 21). Reassess and
the other in-place triggers use the per-book writer lease that develop already has. The
`editing_language` fallback to the book language gets the same refresh hook. Every code anchor
was re-verified on develop.
Amended on 2026-11-17 after @ksokolovic's fourth review, to apply four corrections. A book
assembled from recorded and legacy parts keeps the recorded parts' typed warnings and discloses
the legacy parts separately (decision 24). An extraction rerun is refused under PR 2d's interim
guard and admitted by SPEC-0010's outcomes (verified reuse or rejection) once it lands
(decision 25). The watermark-removal counts are flat parameters. The `duplicate-images`
membership is built from extraction-time evidence only, so later pruning does not change it
(decision 26).

## Problem (with evidence)

When the input PDF is bad, the user has no way to know before investing hours in the
pipeline. The Extract stage says nothing about the source's fitness; the defects surface
later as poor output, or as pruned images with an opaque free-text reason.

| Signal | Evidence (local corpus under `books/`, measured 2026-10-27) | Where it is lost today |
|---|---|---|
| No text layer | Pages with ≥ 20 non-whitespace chars: qa784 0/100, cuaderno5 0/100, cuaderno4 7/38, cuaderno3 22/25, Uruguay_Ceibal 20/25, momo 9/10; PNLD `prac_math_vol2` 40/40. | The only warning, `text-layer-missing` (PR #513, `apps/api/src/services/extraction-warning.ts`), needs Sectioning's vision text (≥ 24 chars), so it appears one stage later, is computed on read, is never persisted and never reaches the CLI. |
| Figure split across stacked rasters | cuaderno4 owl (cover, `pg001`): body raster `pg001_im001` 252×236 pt and an overlay strip `pg001_im002` 110×34 pt 100 % inside it, holding the eyebrows, cap top and eye rims. With `figure_extraction_mode: off`, rasters never enter grouping (`packages/pipeline/src/pdf-extraction.ts:26-30` → `packages/pdf/src/extract.ts:1066` passes `rasterPlacements = undefined`), so both are exported separately and the meaningfulness model prunes the strip: *"only a narrow cropped fragment showing the top of the same character's head and eyebrows"*. 32 of the 35 pages with rasters hold such a pair (66 pairs); `pg006` has four owls, each losing one or two overlays. cuaderno3 `pg009_im001` contains three overlays. | Nothing records that two rasters overlap. The prune reason is free text. In `auto`/`all` the pair would be grouped by `shouldAttachToRasterPlacement` (`extract.ts:3231`) and page-cropped as one figure, so the loss depends on a setting the user cannot judge. |
| Vector render with holes | cuaderno4 `pg012_im012`: a 52-shape vector group whose box covers the swallow photo and two binder-clip rasters it does not include → SVG render with blank holes, pruned by the model ("major missing areas"); the arrows that belong to the figure are lost. | The render decision (`extract.ts:4140-4152`) never checks raster placements in `off` mode. |
| Whole-page screenshot as figure; crops cutting figures | #901, image-only PNLD book: 21/40 pages used a whole-page raster as the figure; crops cut through figures; an ISBN digit was misread. | Manual audit only. |
| Duplicate images | qa784: 1,049 extracted images, 761 distinct hashes, 288 byte-identical copies (27 %). | Only the read-only `extract-report` CLI counts them (#1009, adopted here as PR 0). |
| Signals seen and thrown away | Unmapped glyphs (`packages/pdf/src/page-stream-recorder.ts:494-497` returns on `ucs <= 0`), undecodable paragraphs (`extract.ts:1728-1732`), image decode, figure render and crop failures that drop content (`console.warn` at `extract.ts:2184, 3883, 3928`) and orientation transforms that were not applied (`extract.ts:1380`, `flip-utils.ts:212`), `producer`/`creator`/`format`/`encryption` from `extractPdfMetadata` (`extract.ts:883`, dropped by `toBookMetadata`), page boxes and `/Rotate` (#676), raster DPI at placed size (`stampRasterPlacementsFromOps`, `extract.ts:1334`, has native and placed sizes), colour-space class (`classifyImageColorSpace`, `extract.ts:643`), text and image watermark signatures (only when removal is on, `extract.ts:347-354`), spread suggestions (stored by `detectSpreads`, never compared with the mode). | Never persisted or shown. |
| Encodings that silently lose, duplicate or leak content | The taxonomy (@Elias, 2026-10-28) lists 81 print encodings with a structural detection signal each; its V1 triage ranks tiled images, stacked/MRC layers, scanned-or-mixed pages and covered figures as high or medium severity. Probed on mupdf 1.27.0 (2026-10-29): text drawn in render mode 3 (the hidden OCR layer of a scanned PDF) **is** returned by `toStructuredText()`, so it enters the page text, counts towards `text-layer-empty`'s 20 chars and is read aloud, while the device reports it through `ignoreText` (`page-stream-recorder.ts:289`), which discards it; `page.toPixmap()` draws annotations by default (`showExtras = true`), so review stamps are baked into page renders and page-crop figures; `doc.countLayers()` and `doc.wasRepaired()` are available. Nothing in `packages/pdf` reads `/OCProperties`, `/AcroForm`/`/XFA`, `/EmbeddedFiles`/`/Collection` or `TrimBox`. | Tiles (abutting, not nested) escape the overlay rule; occlusion is only checked raster-on-raster; the rest is never looked at. |
| Qualified completion | The `extract` step ends with no message (`pdf-extraction.ts:164`), so a fully scanned book shows a plain green pill. | SPEC-0013 calls a plain green completion insufficient when work is qualified. |

Cost context: Extract is 4–6 % of a conversion's LLM tokens, but it decides what every
later stage sees. A user who learns on day one that the PDF is a scan, or that figures are
layered, can obtain a better source or change one setting before paying for the rest.

## Goals

- G1. After `extract` completes, one persisted `source-assessment` node per book: readiness
  grade, counts by severity, typed findings with page and image evidence, per-page rollups.
- G2. Findings are data (`kind` + `params` + evidence refs) so Studio renders and translates
  them in all five locales; the API and the CLI print English.
- G3. The Extract stage shows a Source quality panel, page badges, a sidebar count and the
  amber "Completed with a warning" pill (a typed `source-assessment` step warning, §Step
  warnings) when warnings exist or coverage is partial (§Work budget).
  A clean, fully assessed book stays plain green.
- G4. Every finding carries an actionable recommendation **as data**: either a named
  extraction setting with the value to set (`figure_extraction_mode: auto`,
  `remove_watermarks: true`, `image_filters.segmentation: true`, `editing_language`) or an
  action (obtain a text-based PDF, use figure cleanup (SPEC-0020), mark spreads, trim the page
  range, normalise pages). Studio renders it with the control's own label; a later
  recommender (SPEC-0016) or a one-click apply can consume it without parsing prose.
- G5. Advisory only: nothing is disabled or gated (SPEC-0001 vocabulary).
- G6. `extract-report` (PR 0, #1009) reads the persisted node; `pipeline run` prints the note
  (the console sink prints the English rendering of the step warnings, §Step warnings).
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
- Text recovery for image-only pages by vision (a later spec; no number is reserved). This spec's
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
  `extract.ts:679-701, 2101-2144`), so `layered-artwork` reports masks but not as a defect.
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
| A — end of the `extract` step, a sub-product node like `positioned-text`, `spread-suggestions` and `font-profile` (`pdf-extraction.ts:117-164`) | During the page loop, from data already in memory; one pass | ~1,330 lines in `packages/pipeline` (four PRs) + ~890 in `packages/pdf` (three PRs) | **Chosen.** 14 of the 25 v1 kinds (plus the text profile) are pure functions of what `ExtractedPage` already carries in every figure mode (§Where it is computed); the node is derived from the pages it describes, and every write appends a version (§Lifecycle). |
| B — a new `source-assessment` PIPELINE step after `image-cropping` | After the image passes, so it could record "the overlay was then pruned" | Same plus a step in `PIPELINE`, `STAGE_ORDER`, the runner, Studio pills | Depends on LLM verdicts (non-deterministic, skippable), arrives minutes later, adds a pill users must learn. |
| C — computed on read, like `extractionWarning` today | Nothing stored | ~150 lines in the API | Loses history, repeats O(pages) work per request, no CLI parity, no step note. |

Decisions a reviewer must ratify: (1) option A; (2) the finding-kind list and severity
rules below; (3) the note on the `extract` step only when warnings or criticals exist or
coverage is partial (decision 18);
(4) `text-layer-missing` stays as the after-Sectioning confirmation, not folded in; (5) no
"Mark checked" in v1; (6) recommendations as structured data (setting + value, or action)
rather than a flat hint enum; (7) pipeline rules ship before the `packages/pdf` signals, so
the first value-bearing PR touches no extractor code; (8) `font-risk` deferred to v1.1; (9) a
password-required PDF is a typed extraction error, not a finding; (10) the six encoding kinds
taken from the 2026-10-28 taxonomy join v1, everything else from it stays reserved or parked;
(11) the `extract-report` CLI (#1009) is adopted as PR 0 and owned by this spec; (12) step
notes are typed step warnings stored in an additive `step_runs.warnings` column, with no schema
version bump, and #1013 implements them (§Step warnings); (13) Studio no longer shows a
finished step's free-text message, only its translated warnings; (14) the `extract` step's
`source-assessment` warning is derived from the latest node on read and is never persisted,
so every surface shows one count (§Step warnings); (15) the node is derived from the extraction
inventory and not part of it, every write appends a version, and a new version is written by
the extract step, the spreads re-apply route, a change to a downstream setting the rules read,
and an explicit Reassess (§Lifecycle, §Snapshot and current settings); (16) every per-page
pass whose cost grows faster than the page's op count has a fixed work budget, and an exceeded
budget is reported as incomplete, never as "no findings" (§Work budget); (17) preserved
assessment history requires that an extraction rerun never clears an existing extraction:
PR 2d's interim guard refuses it at the common extraction boundary, and SPEC-0010's admission
later either reuses a verified, unchanged extraction or rejects the rerun before mutation
(§Lifecycle, decision 25); (18) coverage is
independent of severity: a partial assessment turns the `extract` pill amber and is carried
on the sidebar, `BookSummary` and the CLI, while `extract-report` still exits 0 when no
evaluated check found a warning or critical (§Work budget, §CLI); (19) a completion written by
an app that does not know `step_runs.warnings` is read through a bounded adapter for the
legacy skip message and is otherwise marked as completed by an older version, never as
completed cleanly (§Step warnings); (20) a kind that could not be evaluated because its input is
missing is incomplete whichever trigger wrote the version. An `extract` write without
`signals` or `source.structure` records it with `reason: "no-signals"`, the same as a Reassess,
and PR 2d ships in the same release as PRs 3a and 3b so that no release assesses every new
book as partial (§Work budget, §Rollout); (21) a book whose working source is not a PDF (an
imported ADT bundle, #803) is not assessed: it has no node, no `sourceReadiness`, and Reassess
is refused (§Lifecycle); (22) the assessment reads only the images extraction wrote. An image
added, cropped, segmented or cleaned up after extraction writes no new version (§Lifecycle);
(23) with `remove_watermarks` off, `watermark-detected` reports text-layer stamps only,
because learning a stamp baked into page images costs seconds (#1106) and is not run for an
assessment. With removal on, the same kind reports at `info` what was removed (§Where it is
computed); (24) a stored step-warnings envelope keeps the warning evidence apart from its
provenance. A book assembled from recorded and legacy parts keeps every typed warning and
records how many parts were legacy, which reads as `"mixed"` (§Step warnings); (25) the
interim guard refuses every extraction rerun on a book with pages or a node. Once SPEC-0010's
admission lands, its outcomes apply instead: verified reuse of an identical, intact extraction
or rejection before mutation. Both keep the assessment history and the extraction assets
(§Lifecycle, AC-31); (26) `duplicate-images` counts membership from extraction-time evidence
(inventory images, their hashes, the figure ids in the extraction debug). It never reads image
classification or pruning, so a later pass cannot change it. Image Meaningfulness's downstream
deduplication count is a separate metric and may differ (§Where it is computed, AC-37).

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
  "raster-occluded",         // later-painted opaque fills or rasters (not text) outside the raster's figure and overlay pair cover ≥ 10 % of its clipped bounds
  "figure-render-holes",     // vector-rendered figure whose bounds overlap ≥ 50 % of a raster placement it does not contain (OQ8)
  "whole-page-figure",       // raster bounds ≥ 85 % of the page area
  "low-resolution-raster",   // nativeWidth / (bounds.width / 72) < 100 dpi, raster ≥ 1 in²
  "needs-convert-colorspace",// CMYK / Indexed / Separation / Lab sources converted on extraction
  "layered-artwork",         // blend mode, alpha < 1 or a clip path on a raster placement
  "image-decode-failed",     // an image, figure render or crop dropped at a console.warn site (extract.ts:2184, 3883, 3928)
  "duplicate-images",        // byte-identical hashes shared across pages ≥ 10 % of extracted images
  // document
  "page-geometry",           // size or orientation deviates > 2 % from the modal page or /Rotate ≠ 0 (warning); CropBox ≠ MediaBox or TrimBox ≠ CropBox alone (info)
  "spreads-unmarked",        // spread-suggestions non-empty while spread mode is off
  "watermark-detected",      // removal off: text-layer signatures found (warning); removal on: what was removed (info, params.removedText / params.removedImage)
  "pdf-encrypted",           // restricted permissions (copy / accessibility / print); a password requirement is a typed open error
  "optional-content",        // /OCProperties in the catalog (InDesign / Illustrator layers: language versions, print-only, hidden)
  "pdf-container",           // XFA form (/XFA in /AcroForm) or a portfolio (/Collection) / attachments (/EmbeddedFiles)
  "book-scale",              // > 300 pages or > 500 Mpx of raster data
  "shape-flood",             // > 1,500 vector shapes or > 60 rasters on one page
])
/** i18n placeholders and recommendation params; lists are rendered with Intl.ListFormat. */
export const SourceParam = z.union([z.number(), z.string(), z.boolean(), z.array(z.number()), z.array(z.string()).max(20)])
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
    params: z.record(SourceParam).optional(),   // mark-spreads: leads (number[]); trim-page-range: start, end
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
  orientationNotApplied: z.number().int(), // image kept with its original pixels (extract.ts:1380, flip-utils.ts:212); evidence only, not a failure
  rotate: z.number().int(), cropBoxDiffers: z.boolean(), trimBoxDiffers: z.boolean(),
  occludedRasters: z.array(z.object({ imageId: z.string(), coveredRatio: z.number(), byKind: z.enum(["fill", "image"]) })),
  rasters: z.array(z.object({ imageId: z.string(), colorClass: z.enum(["rgb", "gray", "cmyk", "indexed", "separation", "lab", "other"]),
                              imageMask: z.boolean(), softMask: z.boolean() })),   // no table stores these, so the storage builder needs them here
  annotations: z.number().int(),      // /Annots count; drawn into the render (showExtras), recorded for the reserved annotations-present kind
  truncated: z.array(z.enum(["raster-occluded"])),   // signal passes that hit their work budget on this page (§Work budget)
})
export const SourcePageType = z.enum(["digital", "scanned", "mixed", "blank"])

export const SourceEvidenceRef = z.object({ pageId: z.string(), imageId: z.string().optional(), groupIndex: z.number().int().optional() })
export const SourceFinding = z.object({
  id: z.string(),                       // `${kind}` for a book-level finding, `${kind}:${pageId}` for a page-scoped one
  kind: SourceFindingKind,
  severity: SourceSeverity,
  pageIds: z.array(z.string()),         // sorted by page number
  params: z.record(SourceParam),        // count, total, ratio, dpi, mode, leads, layer names …
  evidence: z.array(SourceEvidenceRef).max(50),
  recommendation: SourceRecommendation,
})
export const SourcePageRollup = z.object({
  pageId: z.string(), pageNumber: z.number().int(),
  textChars: z.number().int(), imageCount: z.number().int(),
  pageType: SourcePageType,   // §Page type
  kinds: z.array(SourceFindingKind), severity: SourceSeverity.nullable(),
  unevaluated: z.array(SourceFindingKind),   // kinds not (fully) evaluated on this page: summary.incomplete, per page
  signals: SourcePageSignals.nullable(),
})
export const SourceAssessment = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),   // passed in through SourceAssessmentInput, never read from the clock inside assessSource
  rulesVersion: z.number().int(),   // SOURCE_RULES_VERSION when written; bumped by any rule, threshold or recommendation change (§Lifecycle)
  trigger: z.enum(["extract", "spreads-reapply", "settings-change", "reassess"]),
  assessedExtraction: z.string().nullable(),   // the SPEC-0010 extraction-manifest fingerprint the input was built from; null before SPEC-0010 or for a book without a manifest
  source: z.object({ producer: z.string().nullable(), creator: z.string().nullable(), format: z.string().nullable(), encryption: z.string().nullable(), totalPagesInPdf: z.number().int(), bytes: z.number().int(),
                     producerFamily: z.enum(["indesign", "illustrator", "office", "web-design", "scanner", "inpage", "other"]),   // from producer/creator, the taxonomy's producer table
                     permissions: z.object({ copy: z.boolean(), accessibility: z.boolean(), print: z.boolean() }).nullable(),
                     structure: z.object({ layers: z.number().int(), layersOffByDefault: z.number().int(), xfa: z.boolean(), needsRendering: z.boolean(),
                                           portfolio: z.boolean(), embeddedFiles: z.number().int(), tagged: z.boolean(), repaired: z.boolean(),
                                           layerNames: z.array(z.string()).max(20) }).nullable() }),   // null until PR 3c
  settings: z.object({ figureExtractionMode: FigureExtractionMode, removeWatermarks: z.boolean(), spreadMode: z.boolean(), spreadPairs: z.array(z.number().int()),
                       startPage: z.number().int().nullable(), endPage: z.number().int().nullable(), editingLanguage: z.string().nullable(), segmentationEnabled: z.boolean() }),
  summary: z.object({
    readiness: SourceReadiness,
    pageCount: z.number().int(), pagesWithText: z.number().int(), pagesWithFindings: z.number().int(),
    counts: z.object({ info: z.number().int(), warning: z.number().int(), critical: z.number().int() }),
    textProfile: z.enum(["image-only", "weak", "text-rich"]),   // ≥ 0.8 / ≥ 0.3 empty, as in extract-report
    // Kinds that could not be fully evaluated, never read as "no findings": a pass that hit
    // its work budget (`reason: "budget"`, §Work budget), or kinds whose input is missing
    // (`reason: "no-signals"`): signal-fed kinds on pages whose `signals` are null, and
    // document kinds while `source.structure` or `source.permissions` is null, whatever the
    // trigger (decision 20). A document kind's entry has `pageIds: []` (book-scoped).
    incomplete: z.array(z.object({ kind: SourceFindingKind, reason: z.enum(["budget", "no-signals"]), pageIds: z.array(z.string()) })),
    // "partial" exactly when `incomplete` is nonempty; independent of readiness (§Work budget).
    coverage: z.enum(["complete", "partial"]),
    incompletePages: z.number().int(),   // distinct pages across `incomplete[].pageIds`; a book-scoped entry counts every page, so > 0 exactly when partial
  }),
  findings: z.array(SourceFinding),
  pages: z.array(SourcePageRollup),
})
```

Constants Studio may import from `@adt/types` (constants only, per the layer rule):
`SOURCE_FINDING_KINDS`, `SOURCE_SEVERITY_ORDER`, `MIN_TEXT_LAYER_CHARS = 20` and `TextProfile`
(moved here in PR 1 from `extract-report.ts`, which PR 0 / #1009 introduces, so both agree). Severity rules and numeric
thresholds live in `packages/pipeline/src/source-assessment.ts` as one exported
`SOURCE_THRESHOLDS` constant:

| Kind | Severity | Recommendation |
|---|---|---|
| `text-layer-empty` (book-level, `pageIds` = empty pages) | critical when the empty ratio ≥ 0.8, warning ≥ 0.3, info otherwise | action `get-text-pdf` |
| `ink-without-text`, `blank-page` (page; need `signals`, skipped while null) | info; `ink-without-text` raises `text-layer-empty` evidence | `blank-page` runs at either end of the range: action `trim-page-range` with `params.start/end` (ink-blank pages only, never a cover); else `none` |
| `text-unmapped-glyphs` (page) | warning > 2 % of glyphs, info otherwise | action `get-text-pdf` |
| `script-mismatch` (book) | warning | setting `editing_language`, **no value** |
| `hidden-text-layer` (page; needs `signals`) | warning when the page also has a whole-page raster (an OCR layer under a scan: the text is OCR output and is read aloud); info otherwise (invisible text on a digital page). `text-layer-empty` counts *visible* chars, `max(0, textChars − invisibleGlyphs)` (glyphs approximate chars; an OCR layer has one glyph per char), so an OCR'd scan is graded as a scan | action `get-text-pdf` |
| `mixed-page-types` (book, `pageIds` = scanned pages, `params.digital`, `params.scanned`) | warning when both counts are ≥ 1 and the minority is ≥ 5 % of pages; info otherwise; never raised from a `scanned` page type that rests only on the image-and-no-text test (§Page type) | action `get-text-pdf` (for the listed pages) |
| `raster-overlay-split` (page, evidence `[A, B]`) | pairs where either raster is in a figure group's `coveredRasterImageIds` are skipped (grouping already merged them; in `all` mode the covered rasters are filtered out of `images`, `extract.ts:1074-1076`); every remaining pair is a warning in any mode; critical when B is drawn *under* an opaque A (lower `streamSeqno`, A has no soft mask, `blendMode` Normal, `opacity` 1); pairs without a `streamSeqno` are never critical | setting `figure_extraction_mode: auto` in `off`; action `figure-cleanup` in `auto`/`all` |
| `raster-tiles` (page, evidence = the tiles, `params.tiles`) | requires equal native ppi (± 2 %) across the tiles and a shared edge length, so two different photos that happen to line up do not qualify; covered tiles skipped as for overlays; warning (each tile is exported, captioned and pruned on its own) | same as `raster-overlay-split` |
| `raster-occluded` (page, evidence = the raster, `params.coveredRatio`, `params.byKind`) | info until E10 freezes the rule (the raw raster may hold content the reader never sees: labels under answer boxes, white-out corrections, old language versions). Occluders are opaque fills and rasters only — text never occludes, so labels and body text over a photo do not count; rasters ≥ 85 % of the page (plates) are never the occluded raster; members of a `raster-overlay-split` pair or of the raster's own figure group are excluded; each occluder's box is intersected with its active clip | action `figure-cleanup` |
| `figure-render-holes` (page, evidence figure + uncovered rasters; uncovered overlap ≥ 50 % of a raster, OQ8) | warning | same as `raster-overlay-split` |
| `whole-page-figure` (book, `params.liveTextOverlap` = pages where ≥ 20 visible chars sit on the raster) | warning when ≥ 25 % of pages, info otherwise | background plates (no live text on top): setting `image_filters.segmentation: true` when segmentation is off; art with live text on top (picture books) or segmentation already on: action `figure-cleanup` |
| `low-resolution-raster`, `layered-artwork` | info (thresholds frozen after E5); `low-resolution-raster` sets `params.uniform` when every raster in the book shares one ppi (a file downsampled by an optimiser); `layered-artwork` adds `params.stencil` (`/ImageMask`) and `params.softMask` (`/SMask`) counts | `none` |
| `image-decode-failed` (page, `params.images`, `params.figures`) | warning | `none` |
| `duplicate-images` (book) | info; warning ≥ 20 %. Membership comes from extraction-time evidence only (decision 26): inventory images (`source IN ('page', 'extract')`) with a hash, less the ids the page's extraction debug ties to a figure (`figureInvolvedImageIds`, `image-meaningfulness.ts`), counted when one hash appears on ≥ `MIN_PAGES_TO_SHARE` pages (the same constant). It never reads image classification, so pruning by a later pass (Image Filtering, Image Meaningfulness's dedup `planHashDedup`, #1011) does not change it on Reassess (AC-37). That downstream count is a separate metric and can differ. After watermark removal the hashes are those of the cleaned images, which extraction writes | `none` (#1011, merged, judges exact duplicates once) |
| `page-geometry` (book, `pageIds` = deviating pages) | warning for size, orientation or `/Rotate` deviation; info when only the page boxes differ (bleed and slug are the normal state of a print export) | action `normalise-pages` |
| `spreads-unmarked` (book, `params.leads`) | info | action `mark-spreads` with the leads — the apply route (`POST /books/:label/spreads/apply`, `pages.ts:1416`) re-extracts only those pairs; naming `spread_mode` would imply a full re-extract |
| `watermark-detected` (book) | removal off: warning when text-layer signatures are found. A stamp baked into page images is not detected (decision 23). Removal on: info, with the page counts as two scalar parameters (`SourceParam` holds no objects), `params.removedText` and `params.removedImage`, from `extractionDebug.watermarks` and `extractionDebug.rasterWatermark.cleanedImageStrengths` (`extract.ts:1120-1125`), because removal can also take out repeated faint decorations (`docs/ARCHITECTURE.md`, watermark limits) | removal off: setting `remove_watermarks: true` (in `EXTRACTION_CONFIG_KEYS`: under SPEC-0010 a changed value is a new book, and the panel says so; the message adds that removal re-encodes extracted images and can take seconds per book); removal on: `none` |
| `pdf-encrypted` | info (restricted permissions) | `none` |
| `optional-content` (book, `params.layers`, `params.off`, `params.names`) | warning: only the default-visible configuration is rendered and extracted, so an alternate language layer is silently dropped and a print-only layer may be kept | `none` (the message lists `params.names`; choosing a layer is a follow-up, OQ9) |
| `pdf-container` (book, `params.form`, `params.portfolio`, `params.attachments`) | critical for a portfolio or a dynamic XFA form (`/NeedsRendering true`: the pages are a "please wait" placeholder); warning for static XFA; info for attachments only | action `get-text-pdf` (re-export the book itself) |
| `book-scale` (book), `shape-flood` (page) | warning | `none` |
| `needs-convert-colorspace` (book, `params.cmyk`, `params.separation`, …) | from `signals.rasters[].colorClass`; info | `none` |

**Page type.** Each rollup carries `pageType`, the classification the taxonomy asks for before
any figure or text work: `blank` when `blank-page` holds; `scanned` when a raster covers ≥ 85 % of
the page, visible chars < `MIN_TEXT_LAYER_CHARS`, **and** the scan is corroborated — the page
carries a hidden OCR layer, `source.producerFamily` is `scanner`, or ≥ 50 % of the book's pages
pass the image-and-no-text test (a scanned book); `mixed` when a whole-page raster carries
≥ `MIN_TEXT_LAYER_CHARS` visible chars on top (a baked-in picture-book page); `digital`
otherwise. A full-bleed photo or chapter-opener page in a digital textbook therefore stays
`digital`. Without `signals` the visible-char test uses `textChars`, and `blank` is never
assigned (a blank page reads as `digital`, which can only under-report `mixed-page-types`).

Rejected mapping: `image_filters.min_side` for pages with many tiny rasters. The deterministic
filter already prunes them before any model call (`image-filtering.ts:31-35`), so the saving
is negligible and the advice can hide small real figures.

Readiness: any critical → `poor`; any warning → `degraded`; otherwise `ready`. Readiness
grades the evaluated findings only. Coverage (`summary.coverage`) is reported beside it and
never changes the grade (§Work budget).

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

**What the extractor already hands the pipeline.** When `extractPDF` (`pdf-extraction.ts:117`)
receives an `ExtractedPage`, it already holds — in *every* figure-extraction mode, because
`stampRasterPlacementsFromOps` runs unconditionally (`extract.ts:1057`) — `text`;
`images[]` with native `width`/`height`, placed `bounds` (page pt), `hash`, `renderMethod`,
`streamSeqno`, `blendMode`, `opacity`, `clipPath`; `positionedText` (page size);
`extractionDebug` with `groups[].{imageId, groupIndex, groupBbox, renderMethod,
coveredRasterImageIds}` and the shape counters; `fontStats`. `pdfMetadata` carries
`producer`, `format`, `encryption` (`extract.ts:883`; dropped today by `toBookMetadata`), and
the spread suggestions are computed in the same function (`pdf-extraction.ts:147`). So these
14 kinds are pure pipeline code with **no extractor change**: `text-layer-empty`,
`script-mismatch`, `raster-overlay-split`, `raster-tiles`, `mixed-page-types` (its ink-blank
half waits for `signals`), `figure-render-holes`, `whole-page-figure`,
`low-resolution-raster`, `layered-artwork` (blend, opacity and clip half), `duplicate-images`,
`page-geometry` (size and orientation half), `spreads-unmarked`, `book-scale`, `shape-flood`,
and the text profile. Their rules run on an `extract` write without `signals`, and only the
signal-fed half of a split kind (`page-geometry`'s `/Rotate` and page boxes, `layered-artwork`'s
stencil and soft-mask counts, `mixed-page-types`' ink-blank test) lands in
`summary.incomplete` (decision 20). `pdf-encrypted` is not among them: `encryption` is mupdf's
`getMetaData("encryption")` (method and key length), and permissions need `hasPermission()`
(PR 3c). `creator` is already in `PdfMetadata`; only `toBookMetadata` drops it.

**One input shape, two builders** (`packages/pipeline/src/source-assessment.ts`):
`PageAssessmentInput` (text counts and script histogram, page size, rasters, figures joined
from `extractionDebug.groups` to `images` by `imageId` — the figure's `bounds` carries the
spread `xOffset` that `groupBbox` lacks, `extract.ts:4167` vs `4200-4205` — counters, and
`signals: SourcePageSignals | null`) and `SourceAssessmentInput` (pages, pdf, spread
suggestions, settings). `pageInputFromExtractedPage(page)` builds it from memory inside
`extractPDF`; `pageInputFromStorage(storage, pageId, previousSignals)` builds the same shape
from the `pages` and `images` tables, `positioned-text` and `extraction-debug`, so the
spreads re-apply route (`pages.ts:1416`) and `extract-report` recompute without re-extracting.
It reads only the rows extraction wrote, `images.source IN ('page', 'extract')`
(`packages/storage/src/db.ts:48`), because the table also holds crops, segments, uploads and
translated images added later, and `getPageImages` (`book-storage.ts:193`) does not filter
by source (decision 22).
Per-raster evidence is therefore never persisted twice; only `signals` (the numbers no table
holds) travel in the node. A test proves both builders agree on a raven page.

**`assessSource(input): SourceAssessment`** is pure (no provider import, no clock: `generatedAt`
is part of the input; deep-equal on identical input): one rule function per kind, `SOURCE_THRESHOLDS`, aggregation, readiness.
`sourceAssessmentWarning(a)` returns the step warning `{ kind: "source-assessment", warning: N,
critical: M, incompletePages: P }` only when `counts.warning + counts.critical > 0` or
`summary.coverage` is `"partial"` (§Step warnings, §Work budget).
`pdf-extraction.ts` writes the node after `font-profile` with `putNodeData` (`trigger:
"extract"`; every write appends a version, §Lifecycle), then emits `step-complete` for
`extract` with that warning. The warning is not persisted: `GET step-status` derives it from
the latest node (§Step warnings).
The settings the rules need (`editing_language`, the image-filter flags, spread pairs) are not
visible to `extractPDF` today, so `ExtractOptions` gains an
`assessmentSettings` field filled by both callers — the stage runner
(`apps/api/src/services/stage-runner.ts:1142`) and the CLI DAG (`pipeline-dag.ts:271-288`).

**What only the extractor can see** (`ExtractedPage.sourceSignals`, transient like
`fontStats`, filled in `extractPage` (`extract.ts:1004-1137`) and `extractSpreadPage` (1797)):

- **One pixel pass, replacing a decode.** Today every page render, single and spread, goes
  through `renderPageForExtraction` (`extract.ts:945-962`, called at 1016 and from the spread
  path), which returns PNG bytes from one of three paths: `renderPageWithoutRasterWatermark`
  (`raster-watermarks.ts:1911`), `renderPageWithoutWatermarks` (`watermarks.ts:322-328`, a
  wrapper of `renderPageFiltered`, 349-509), or `page.toPixmap(…).asPNG()`. The pixmap is
  never kept, while
  `samplePageEdges` (`pdf-extraction.ts:132` → `packages/pdf/src/png-utils.ts:37-57`) fully decodes that PNG
  again with pngjs on every page just to read two columns × 48 rows. The restructure keeps the
  pixmap, runs `scanPagePixmap` over `getPixels()` at a 4-px step (ink fraction = share of
  samples darker than 240/255; the 48 edge samples computed with the `png-utils.ts:47-55`
  formula verbatim so `detectSpreads` sees bit-identical input and `spread-detection.ts` is
  untouched), encodes the PNG, then `destroy()`s the pixmap explicitly.
  `renderPageForExtraction` returns the pixmap with the cleaned rasters, and
  `renderPageFiltered` hands its pixmap back before `asPNG` (`watermarks.ts:493`) instead of
  bytes. The pixel pass therefore measures the page as extracted, after any watermark removal.
  `samplePageEdges` stays exported: the API still uses it as the fallback for books extracted
  before inline detection (`pages.ts:1374`).
- **Counters at existing sites, zero cost**: `collectGlyphs` (`page-stream-recorder.ts:482-506`)
  returns the `ucs <= 0` count it drops today; the recorder's `ignoreText` callback
  (`page-stream-recorder.ts:289`, a no-op today) counts the render-mode-3 glyphs mupdf still
  returns in `toStructuredText()` (probed 2026-10-29 on mupdf 1.27.0); content-dropping
  failures counted at their warn sites (`extract.ts:2184` image, `3883` figure render, `3928`
  crop) and unapplied orientation transforms separately (`extract.ts:1380`,
  `flip-utils.ts:212`). These warn sites lose nothing and are not counted: the pixel digest
  (`extract.ts:2232`), the watermark-render fallback (`watermarks.ts:495`), and the three
  image-watermark sites from #1106, which keep the original image or render
  (`extract.ts:996`, `raster-watermarks.ts:656` and `1927`). U+FFFD is counted in the text.
  Images cleaned of a stamp replace the originals with new bytes and a new hash
  (`applyCleanedRasters`, `extract.ts:973-1001`), so `duplicate-images` and the ink and
  blank-page checks measure the cleaned output.
- **Occlusion from the recorded ops, pure JS**: the recorder already gives every `fillPath`
  its `seqno`, `bbox`, `color` and composed `alpha`, and `stampRasterPlacementsFromOps`
  stamps each raster's `streamSeqno` (`extract.ts:1372`). For each raster, the opaque
  (`alpha ≥ 0.95`) fills and images painted *after* it, outside its own figure group, each
  box intersected with the op's active clip, are marked on a coverage grid over its bounds
  (§Work budget); ≥ 10 % coverage lands in `signals.occludedRasters`. Text ops carry no colour
  or alpha in the recorder (`page-stream-recorder.ts:254-270`) and are not occluders. The pass
  has a fixed work budget; `shape-flood` only warns and bounds nothing.
- **Dictionary reads, microseconds**: `/Rotate` and MediaBox vs CropBox vs TrimBox from the page
  (`getBounds("MediaBox"|"CropBox"|"TrimBox")`), the `/Annots` count; colour-space class and
  `/ImageMask` / `/SMask` presence for every raster (into `signals.rasters`) by calling
  `classifyImageColorSpace` (`extract.ts:2112-2116`, today only for JPEGs); once per document: `needsPassword()` /
  `hasPermission()` (`openPdfFromBuffer`, `extract.ts:847-854`), `countLayers()` plus the
  `/OCProperties /D /OFF` array, `/AcroForm /XFA` and `/NeedsRendering`, `/Names
  /EmbeddedFiles` and `/Collection` from the catalog, `/MarkInfo /Marked`, `wasRepaired()`,
  the layer names (`getLayerName`) → `source.structure`; `producer` and `creator` →
  `source.producerFamily`.
- **Text-watermark detection always on**: `detectTextWatermarks` (`watermarks.ts:197-246`)
  samples ≤ 16 pages with one extra `page.run` each — the only net cost in this spec (≈ 100–300
  ms per book) — and its signatures are applied only when `remove_watermarks` is on. Learning a
  stamp baked into page images (`detectRasterWatermark`, `extract.ts:347-349`, #1106) is
  **not** made always-on: it costs seconds per book, up to about 45 s on a 300 DPI scan
  (`docs/ARCHITECTURE.md`), which would break G7. With removal off, `watermark-detected`
  therefore sees text-layer stamps only. With removal on, it reports what was removed from the
  debug record the extractor already writes (decision 23).
- **Password-required PDFs**: `loadPage` throws before any page exists, so no node can be
  written; `openPdfFromBuffer` throws a typed `PdfPasswordRequiredError` whose message reaches
  the `step-error` event and the UI as-is.

### Work budget

The page's op count is unbounded: `shape-flood` warns at 1,500 shapes or 60 rasters but caps
nothing. A pass that compares rasters with ops or with each other can therefore grow as
rasters × ops. Each such pass gets a fixed budget, and an exceeded budget is reported, never
silently read as "no findings".

- **Occlusion (`packages/pdf`, PR 3b).** Occluders (opaque fills and images) are sorted once by
  `seqno`. For each raster, only occluders painted after it whose clipped bbox intersects its
  bounds are visited. Coverage is marked on a fixed 32 × 32 grid over the raster's clipped
  bounds instead of an exact union, so one occluder costs at most 1,024 cell marks. A raster
  stops early once its grid reaches the 10 % threshold. Candidate rasters are taken largest
  first. Per-page budget: at most 60 candidate rasters, 200,000 raster–occluder intersection
  tests and 2,000,000 cell marks. These are starting values, frozen by AC-29. When any limit is
  hit, the pass stops for that page and records `signals.truncated: ["raster-occluded"]`.
- **Pairwise geometry rules (`packages/pipeline`, PR 2b).** `raster-overlay-split`,
  `raster-tiles` and `figure-render-holes` compare rasters pairwise. Above 200 rasters on a page
  (19,900 pairs), they are skipped for that page.
- **Reporting.** Every skipped or truncated evaluation lands in `summary.incomplete` as
  `{ kind, reason: "budget", pageIds }`, and the page rollup lists the kind as unevaluated. The
  panel shows "Not fully assessed on N pages" with the kinds, and `extract-report` prints the
  same line. Readiness is graded from the findings that were evaluated, and the panel always
  shows the incomplete line next to the grade, so `ready` with an incomplete line never reads
  as a clean bill.
- **Coverage on every compact surface.** `summary.coverage` is `"partial"` exactly when
  `incomplete` is nonempty, whatever the reason (`budget` or `no-signals`), and
  `summary.incompletePages` counts the distinct pages. It is independent of severity: a book
  with zero warnings and criticals can be partial. Each surface that summarizes the
  assessment carries it, so the panel's qualification is never lost:
  - the `extract` pill is amber when coverage is partial, even with no findings. The
    `source-assessment` step warning carries `incompletePages`, and the popover adds "Not fully
    assessed on N pages" (§Step warnings);
  - the StageSidebar Extract badge keeps counting warnings and criticals, adds a partial marker
    and gets the tooltip "Not fully assessed on N pages";
  - page cards list a page's `unevaluated` kinds in their tooltip;
  - `BookSummary.sourceReadiness` carries `{ readiness, coverage }`, not the grade alone;
  - `extract-report` prints the line, and `--json` carries `summary.coverage` (§CLI).

  This stays advisory: nothing is blocked. A pre-spec book stays partial after a Reassess
  (`no-signals` on every page) until it is re-extracted as a new book, which is what the
  amber pill then says.
- **Missing input on a fresh extraction.** The same rule applies to an `extract` write
  (decision 20). PR 2d writes the node before the `packages/pdf` PRs supply `signals` and
  `source.structure`. An extraction in that window records every signal-fed kind per page,
  and every document kind book-scoped, with `reason: "no-signals"`, just as a Reassess of a
  pre-spec book does. It never drops them. So a build that contains PR 2d without PRs 3a and
  3b would show every new book as partial. **PR 2d therefore ships in the same release as PRs
  3a and 3b**: they may merge to develop in the rollout order, but no release is cut between
  them. PR 3c's document reads (permissions and `source.structure`) are book-scoped
  `no-signals` until it lands, and the same release rule covers it unless it lands first.

### Cost

Per 1200 × 1680 render (a letter page at 2×):

| Signal | Cost | Net effect |
|---|---|---|
| Ink + edge samples from the pixmap view (1/16 of the pixels) | ≈ 1–3 ms | Replaces the pngjs decode in `samplePageEdges` (≈ 30–80 ms) → **−30 to −75 ms per page** in single-page mode |
| Explicit `pixmap.destroy()` | 0 | Less WASM heap pressure (today the pixmap waits for the finalizer) |
| Unmapped-glyph and failure counters | 0 (existing callbacks and catches) | — |
| U+FFFD / script histogram; all geometry rules | < 1 ms per page, pure JS | — |
| `/Rotate`, boxes, colour space, permissions | µs | — |
| `detectTextWatermarks` with removal off | ≈ 100–300 ms **per book** (≤ 16 `page.run`) | The only net cost; < 1 % of a 40-page extract. Image-watermark learning is not added (decision 23) |
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
- The `extract` step's note is a typed step warning (§Step warnings), not text that Studio
  matches on a prefix.
- `extract-report` (PR 0) defines the `textProfile` thresholds and `MIN_TEXT_LAYER_CHARS`; PR 1
  moves them to `@adt/types` and PR 6 makes the report read the node instead of recomputing.

### Lifecycle

The extraction inventory is what extraction wrote: the pages, the images with
`source IN ('page', 'extract')`, positioned text and extraction debug. It is immutable once
extracted. Under SPEC-0010 it is what the extraction manifest inventories and what verified
reuse checks. The `images` table is not the inventory by itself: Extract now adds crops and
uploads to a page after extraction (#1104, `images.source` `crop`/`upload`), and segmentation
and translation add rows too (`packages/storage/src/db.ts:48`). The assessment is **derived from** that inventory and is **not part of it**: it
references pages and images by id, the manifest never lists it, and writing a new assessment
never invalidates reuse. It is listed in `EXTRA_STAGE_OUTPUT_NODES.extract` only so Studio
and the cache registry treat it as an Extract output.

Every write appends a version with `putNodeData`; no version is ever overwritten, and the
latest version is the current assessment. Each version records `rulesVersion` (`SOURCE_RULES_VERSION`, exported beside
`SOURCE_THRESHOLDS` and bumped by any rule, threshold or recommendation change), `trigger`, and
`assessedExtraction` (the SPEC-0010 manifest fingerprint, or null before SPEC-0010).

| Situation | What is written | What the user sees |
|---|---|---|
| Initial extraction | the extract step writes a version (`trigger: "extract"`) after all pages and images are persisted | the assessment |
| SPEC-0010 verified reuse of an unchanged extraction | nothing: reuse writes no extraction entity and no history | the existing latest version, unchanged |
| A book extracted before this spec (no node) | nothing automatically; no backfill | API `{ version: null, assessment: null }`; the panel says "Not assessed" and offers Reassess; no badges, no pill warning |
| `rulesVersion` older than `SOURCE_RULES_VERSION` | nothing automatically | the assessment, marked "Assessed with older rules", with Reassess |
| Spreads re-apply (`pages.ts:1416`), an in-place operation on develop | a version with `trigger: "spreads-reapply"` (§API) | the new assessment |
| An image is added to a page, recropped, segmented, or replaced by an accepted figure cleanup (#1104, SPEC-0020) | nothing: these images are not in the inventory (decision 22) | the existing assessment. A finding may already be fixed (for example a `raster-overlay-split` pair replaced by a cleaned crop); the finding stays, because it describes the source |
| A book whose working source is not a PDF (`BookSummary.sourceKind` or `workingSource` is not `pdf`, an imported ADT bundle, #803) | nothing, and Reassess is refused with 409 (decision 21) | no Source quality panel, badge or pill warning. Extract is already locked for these books (`stages.ts:231-239`) |
| A downstream setting the rules read changes | a version with `trigger: "settings-change"` (§Snapshot and current settings) | the new assessment |
| Reassess | a version with `trigger: "reassess"`, built from storage | the new assessment |
| An attempted extraction rerun on a book with pages or a node | nothing: under the interim guard the rerun is refused before anything is cleared; under SPEC-0010 it is a verified reuse (row above) or a rejection before mutation (below) | the existing versions, unchanged |

**What the history guarantee requires.** Versions survive only while nothing clears the
node. `clearExtractedData` deletes every `source-assessment` version together with the pages
(`clearExtractedRows`, `book-storage.ts:657-666`), and `extractPDF` still calls it
unconditionally (`pdf-extraction.ts:105`). Since v0.9.0-beta.2 (#879), both orchestrators on
develop refuse to extract over a book that has pages, before anything is cleared: the API's
`makeBeforeRun` (409 `UNSAFE_RESUME_UNAVAILABLE`, `apps/api/src/routes/stages.ts:139-142`)
and the CLI DAG (`pipeline-dag.ts:187`). A direct `extractPDF` call still bypasses both, and
both test pages only, so on a book with a node but no pages `makeBeforeRun` still clears
(`stages.ts:162-164`) before `extractPDF` runs. The
guarantee therefore requires that no rerun clears an existing extraction, decided at the
common extraction boundary. SPEC-0010 owns that boundary ("a direct `extractPDF` call must
not bypass it", §Writer coordination), and this spec requires its extraction admission, not
the rest of SPEC-0010. Its admission has two outcomes for an occupied book: verified reuse
of an identical, intact extraction, which writes nothing, or rejection before mutation. If
that boundary has not landed when PR 2d ships, PR 2d adds an equivalent interim guard with one
condition, "the book has pages or a `source-assessment` node", shared by all three entry
points: `extractPDF` throws the same `UNSAFE_RESUME_UNAVAILABLE` error before
`clearExtractedData`, and the `makeBeforeRun` and CLI DAG checks use the same condition
instead of pages alone. The interim guard refuses every rerun, including one SPEC-0010 would
reuse. SPEC-0010's admission later replaces all three checks, and its reuse outcome then
applies (decision 25). Until PR 2d ships the guard, the spec does not claim preserved history. Even
with it, an app older than v0.9.0-beta.2 has neither guard and can still clear the node,
which a newer app cannot detect afterwards. AC-31 covers the guard (a) and the admission (b).

**Reassess** builds the input with `pageInputFromStorage`, reusing each page's `signals` from
the latest version when one exists, and appends a version. A book that has no node, or whose
pages have `signals: null`, is assessed without the signal-fed kinds, which land in
`summary.incomplete` with `reason: "no-signals"`. It re-extracts nothing and calls no
provider. Surfaces: `POST /books/:label/source-assessment/reassess` (a Reassess button on the
panel) and a new `pnpm pipeline assess-source <books-dir> --label <label>` subcommand.
`extract-report` stays read-only, as PR 0 promises. Reassess is refused with 409 for a book
whose working source is not a PDF (decision 21).

**Writers.** Develop already has one per-book writer lease, `withBookWriter`
(`packages/storage/src/book-writer.ts:174`). Stage runs, tasks and the CLI DAG take it, and
`bookWriterMiddleware` (`apps/api/src/middleware/book-writer.ts`) takes it for every non-GET
`/books/:label` route. Every write of this node runs inside it:
- the `extract` write, inside the stage run or the CLI DAG;
- Reassess, through the route, and `assess-source`, which takes it itself;
- the `settings-change` hook, inside `PUT config` and `PUT metadata`;
- the `spreads-reapply` version, inside the same lease and inside the route's per-book
  `oneSpreadApplyPerBook` queue (`pages.ts:1397`), after the splice and its
  `withSourceGenerationTracking` writes.

So no assessment write races an extraction or another assessment. SPEC-0010's admission later
builds on the same lease.

### Snapshot and current settings

The rules read two kinds of settings, recorded in the node's `settings`:

- **Extraction inputs**: `figure_extraction_mode`, `remove_watermarks`, spread mode and pairs,
  page range. They produced the inventory, so the snapshot stays true for the life of the
  book. Under SPEC-0010 changing one means a new book, and the panel already says so for a
  `setting` recommendation. The spreads re-apply route is the one in-place operation on them
  today; how SPEC-0010 classifies it is SPEC-0010's decision, and this spec only appends a
  version when it runs.
- **Downstream settings**: `editing_language` (`script-mismatch`) and
  `image_filters.segmentation` (the `whole-page-figure` recommendation). They change in place
  on an existing book and do not touch the extraction. When `PUT /books/:label/config`
  (`apps/api/src/routes/books.ts:459`) changes either one on a book that has a node, the route
  appends a reassessed version (`trigger: "settings-change"`). The effective `editing_language`
  falls back to the book's `language_code` when the config sets none (`books.ts:557-558`), so
  `PUT /books/:label/metadata` (`books.ts:504`) runs the same hook when it changes the
  effective editing language. This is pure and takes milliseconds. A downstream setting change is never treated as a changed extraction input,
  and it never triggers SPEC-0010's new-book rule.

The panel header reads "Assessed <date> · <trigger>". If the node's `settings` disagree with
the book's current downstream settings (changed by a path that does not run the hook, for
example an older app or a CLI override), the panel says "Assessed with different settings"
and offers Reassess. It does not show stale advice as current.

### Step warnings

A step that completes but leaves something for the user to check carries **typed warnings**.
On develop the only such channel is free text: `"Completed — N page(s) skipped"`, persisted in
`step_runs.message` and never shown for a finished step. #1013 first surfaced that text in
Studio. Two problems follow: it is server English, so every non-English locale sees it
untranslated, and Studio detects a warning by matching the `"Completed —"` prefix, a literal
copied in three places. The fix is the pattern `packaging-warning.ts` already uses:
warnings are data, and Studio owns the wording.

New `packages/types/src/step-warning.ts`, exported from the index:

```ts
export const StepWarning = z.discriminatedUnion("kind", [
  // A page-processing step finished after the user chose to skip pages that failed.
  // `pageIds` names the skipped pages in page order; absent for a skip adapted from an older app's message.
  z.object({ kind: z.literal("pages-skipped"), count: z.number().int().positive(), pageIds: z.array(z.string()).optional() }),
  // Image Segmentation or Image Cropping: the model call failed for these pages, which kept
  // their extracted images (#1012). `error` is one line, at most 120 code points.
  z.object({
    kind: z.literal("pages-unchanged"),
    pages: z.array(z.object({ pageId: z.string(), error: z.string() })).min(1),
  }),
  // Book Summary: the model call failed and no summary was stored (#1014, PR #1015).
  z.object({ kind: z.literal("summary-missing"), error: z.string() }),
  // Extract: the source assessment found warnings or criticals, or could not evaluate every
  // check (this spec, PR 2c). Derived from
  // the latest source-assessment node on read; never written to step_runs.
  // Present when warnings or criticals exist or coverage is partial; incompletePages > 0 marks partial coverage.
  z.object({ kind: z.literal("source-assessment"), warning: z.number().int(), critical: z.number().int(), incompletePages: z.number().int() }),
])
// Read model only, never written: elements of a stored array that this app cannot parse
// (a kind from a newer app, or a malformed element).
export const UnrecognizedStepWarning = z.object({ kind: z.literal("unrecognized"), count: z.number().int().positive() })
export const StepWarningView = z.union([StepWarning, UnrecognizedStepWarning])
// What step_runs.warnings holds: the warnings stamped with the completion they belong to.
// `items` is the warning evidence; `legacyParts` is provenance only (decision 24): the number of
// parts of an assembled book whose completion was legacy, so their warnings may be incomplete.
export const StoredStepWarnings = z.object({
  completedAt: z.string(),
  items: z.array(z.unknown()),
  legacyParts: z.number().int().positive().optional(),
})
```

Adding a kind is a change to this contract and goes through this spec.

- **Event.** `step-complete` in `ProgressEvent` (`packages/types/src/progress.ts`) gains
  `warnings?: StepWarning[]`. `message` stays, and for a step with warnings it is their English
  rendering, `formatStepWarnings(warnings)` in `packages/pipeline`. That rendering never
  equals the frozen legacy skip literal (below). For example, it reads "Completed with 3
  page(s) skipped.", so only text an older app wrote can be adapted. The CLI, the server log
  and an older Studio read only `message`. The `message` written to `step_runs` renders the
  persisted warnings only. The derived `source-assessment` warning appears in the event's
  `message` but is never written, so no persisted text carries a count that a later version
  could make stale.
- **Storage.** `step_runs` gains `warnings TEXT`, holding a `StoredStepWarnings` envelope.
  `markStepCompleted(step, message?, warnings?)` writes `completed_at` and the envelope in the
  same statement, with `envelope.completedAt` equal to that `completed_at`. It always writes
  an envelope, with `items: []` for a clean completion, so this app's clean completion is
  recorded evidence rather than an absence. It also always sets `message`, to NULL for a clean
  completion: develop's `markStepCompleted` without a message keeps the previous one
  (`book-storage.ts:454-458`), and steps that routes complete directly, without a start, would
  otherwise carry a stale message forward. The part merge (`part-service.ts:888-895`), which today
  copies only `status`, copies `completed_at`, `message` and the envelope together from the
  part row, so a recorded part stays recorded in the assembled book. When parts disagree, it
  writes a fresh `completed_at` with an envelope stamped to it. The envelope keeps the warning
  evidence apart from its provenance (decision 24). Its `items` hold every part's warnings as
  the reader would return them: a recorded part's items, and a legacy part's adapted warnings
  (the skip literal gives `pages-skipped` without `pageIds`; any other legacy message gives
  none). Its `legacyParts` counts the parts that read as legacy, and is absent when there are
  none. `message` is `formatStepWarnings(items)`. A legacy part therefore neither discards a
  recorded part's warnings nor lets the merged row pass as fully recorded. This app's
  `markStepStarted`, `markStepSkipped` and `recordStepError` also clear the column. An older
  app does not know the column, so its writes leave the envelope in place. The stamp is what
  keeps such an envelope from being read as current: an older start sets `completed_at = NULL`,
  an older complete or skip writes a new timestamp, and an older error sets `status = 'error'`.
  For a done step the reader tells two cases apart:
  - **Recorded**: `envelope.completedAt` equals the row's `completed_at`. The warnings are the
    envelope's items. When `legacyParts` is set, the step reads as `"mixed"`: the typed
    warnings are current, and Studio adds "N part(s) of this book were completed by an older
    version of ADT Studio; they may not have recorded every warning" to the popover. Like the
    legacy line, that disclosure does not turn the pill amber; the typed warnings do.
  - **Legacy completion**: there is no envelope, or its stamp does not match. The step was
    last completed by an app that does not write the column, so there is no current
    structured evidence. A stale envelope is never revived. A bounded adapter reads the one
    warning-bearing outcome a released writer records, the skip message from
    `skipMessage` (`apps/api/src/services/stage-runner.ts:376-382`). A `message` that matches
    exactly `^Completed — ([1-9]\d*) page\(s\) skipped$` reads as `{ kind: "pages-skipped", count }`.
    The adapter is frozen to that literal and gains no new patterns: newer outcomes are typed
    from the start. Any other message gives no warnings, and the step is marked as a legacy
    completion (`stepWarningSources`, §API). Studio shows "Completed by an older version of
    ADT Studio; it may not have recorded every warning" in the popover. Among a legacy
    completion's stored outcomes, only the skip adapts and turns the pill amber. A legacy
    `extract` step still gets the derived `source-assessment` warning, which comes from the
    node, not from `step_runs` (§API). Every step of a pre-spec book is a legacy completion
    until it is rerun. Extract cannot be rerun on an existing book (§Lifecycle), so a pre-spec
    book's `extract` step keeps the legacy line for the life of the book. That is accurate,
    because an older app completed it, and the line sits in the popover only: it does not
    turn the pill amber.

  A step that is not `done` returns no warnings. New books get the column from `SCHEMA_SQL`. On opening a book for writing, an
  existing book gains it through `ALTER TABLE step_runs ADD COLUMN warnings TEXT` when
  `PRAGMA table_info` lacks it, **without bumping `SCHEMA_VERSION`**. A bump would make every
  older app refuse the book ("Schema version mismatch", `db.ts`). An older app names its
  columns explicitly, so it reads and writes the book unchanged and ignores the column.
  `getStepRuns` parses the envelope, then each element of `items` on its own with
  `StepWarning.safeParse`: recognised elements are kept, and the rest are counted into one
  `{ kind: "unrecognized", count }`. A newer kind next to a known one therefore keeps the known
  one and still marks the step as having warnings. An envelope that does not parse at all
  reads as `[{ kind: "unrecognized", count: 1 }]`, not as no warnings. A future read-only open (PR 0's
  `openBookDbReadOnly`) must tolerate the column's absence.
- **API.** `GET /books/:label/step-status` adds `stepWarnings: Record<string, StepWarningView[]> |
  null` for done steps, as storage parsed them (adapted for a legacy completion), and
  `stepWarningSources: Record<string, "recorded" | "legacy" | "mixed">` for the same steps
  (`"mixed"`: a recorded envelope with `legacyParts`). For a done `extract` step it appends
  `sourceAssessmentWarning(latest node)`, computed on read, so the pill, the panel, the page
  badges, the sidebar, `GET source-assessment` and `extract-report` all count from one node,
  whichever trigger wrote it (§Lifecycle). `stepMessages` is unchanged. The live stream
  forwards the event. Persisted warnings in the event equal those from `GET step-status`. The
  derived `source-assessment` warning is computed from the version the step wrote, so the
  event and `GET` agree while that version is the latest. After a later version (a settings
  change, a spreads re-apply or a Reassess), `GET` follows the latest version, and the
  historical event intentionally differs.
- **Studio.** `apps/studio/src/lib/step-warnings.ts` (beside `packaging-warnings.ts`) maps each
  kind to Lingui `msg` descriptors with plurals. A unit test proves every kind has an entry, and
  the strings go into all five catalogs. `useBookRun()` exposes `stepWarnings(step)`. A done
  pill is amber with a warning triangle exactly when its step has warnings, and its popover
  header says so. The popover lists each warning translated. An `unrecognized` entry reads
  "N warning(s) this version of ADT Studio can't show; open the book in a newer version" and
  keeps the pill amber. A `source-assessment` warning shows the translated counts and, when
  `incompletePages > 0`, "Not fully assessed on N pages". With zero findings, that line alone
  is why the pill is amber. For `pages-skipped` it shows the count and up to five of the
  skipped page ids and "and N more". The popover is a hover tooltip, so it names the pages
  rather than linking to them, and the ids come from the stored warning, so they survive a
  reload. SPEC-0013's per-page recovery records stay the source of truth, and OutputReview
  lists them once SPEC-0013 lands. For `pages-unchanged` it shows up to five page ids and "and N more",
  each with a translated "the model call failed" line. Once SPEC-0017 lands, its classified,
  localized wording replaces that line. For `pages-unchanged` and `summary-missing`, the
  provider's `error` text sits behind the technical-details disclosure SPEC-0017 defines, not
  in the summary line. The contract keeps `error` as data, and how it is shown follows
  SPEC-0017. Stage cards show the first warning. Studio does not show a finished
  step's free-text `message` (for example `"13 headings"`), as on develop before #1013;
  `step-notes.ts` and its prefix test are not added.
- **CLI.** The console sinks print `<step>: <message>` (#1013), unchanged.

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
- `apps/studio/src/lib/source-assessment-messages.ts`: `Record<SourceFindingKind, { title, description }>`
  plus `RECOMMENDATION_MESSAGES` keyed by setting key and action, with Lingui `msg`
  descriptors and `params` placeholders; a unit test proves every enum member has an entry.
  New entries in all five `.po` catalogs.
- Page cards: a severity dot from `PageSummary.sourceFindings.severity` with the kinds in
  the tooltip, distinct from the existing amber triangle (which now reads "confirmed").
- `ExtractPageDetail`: a "Source findings" list beside the pruned-image list, so a pruned
  overlay finally shows "drawn over `pgNNN_imMMM`" next to its prune reason. The list sits
  next to the page's existing "Add image → Crop from page" control (#1104), which is where a
  user acts on a `whole-page-figure` or `raster-overlay-split` finding today. Adding or
  cropping an image there does not change the findings (decision 22).
- A book whose working source is not a PDF shows no panel, badge or pill warning, because its
  Extract stage is marked not needed (`StageSidebar.tsx:237`, decision 21).
- `StageSidebar`: the Extract badge becomes `counts.warning + counts.critical`. When
  `summary.coverage` is `"partial"`, it adds a partial marker with the tooltip "Not fully
  assessed on N pages", including when the count is zero (§Work budget).
- Panel states besides the assessment itself: "Not assessed" (no node) with Reassess;
  "Assessed with older rules" or "Assessed with different settings" with Reassess (§Lifecycle,
  §Snapshot and current settings); "Not fully assessed on N pages" listing the kinds from
  `summary.incomplete` (§Work budget). The header always reads "Assessed <date> · <trigger>".
- Nothing is disabled or gated. Panel collapse state is local UI; no persisted dismissal.

### API

- `apps/api/src/routes/source-assessment.ts`: `GET /books/:label/source-assessment` →
  `{ version: number | null, assessment: SourceAssessment | null }`, `safeParse` on read like
  `debug.ts:250-256`. A user-facing route, not `/debug/*`.
- `PageSummary` (`pages.ts:150`) gains `sourceFindings: { kinds: SourceFindingKind[];
  severity: SourceSeverity | null }` from one node read per request; `PageDetail` gains the
  page's `SourceFinding[]`.
- The spreads re-apply route (`pages.ts:1413-1535`) reads the previous node before it splices
  the pages, rebuilds the input with `pageInputFromStorage` (previous `signals` for untouched
  pages, fresh ones from `extractPages` for the re-extracted pair) and appends a version with
  `trigger: "spreads-reapply"`, inside `oneSpreadApplyPerBook` (§Lifecycle, Writers). No step warning needs updating, because the `extract` pill
  derives its count from the latest node (§Step warnings).
- `POST /books/:label/source-assessment/reassess` appends a version from storage
  (`trigger: "reassess"`, §Lifecycle) under the per-book writer lease and returns it like the
  GET. It returns 409 for a book whose working source is not a PDF (decision 21).
  `PUT /books/:label/config` appends a `settings-change` version when `editing_language`
  or `image_filters.segmentation` changes on a book that has a node, and `PUT
  /books/:label/metadata` does the same when a `language_code` change moves the effective
  editing language (§Snapshot and current settings).
- `BookSummary` (`packages/types/src/book.ts`) gains optional `sourceReadiness: { readiness,
  coverage }`, dropped if the books-list benchmark (#996) regresses. It never carries the
  grade without the coverage, and it is absent for a book whose working source is not a PDF.

### CLI

- `pipeline run` prints the note: on develop the console sink prints only `Completed ${step}`
  (`packages/pipeline/src/progress.ts:27-28`); #1013 makes it print `event.message`, the English
  rendering of the step warnings.
- `extract-report` (PR 0) gains a "source" section printed from the node by an
  English formatter in `packages/pipeline`; `--json` embeds the node; `--compare` diffs
  `summary.counts` and `settings`; a pre-spec book falls back to the recomputed profile.
  Exit code 1 when `counts.warning + counts.critical > 0`, consistent with PR 0's findings exit.
  Exit code 0 means "no warning or critical among the evaluated checks", not "fully
  assessed". A partial assessment with no findings exits 0, prints "Not fully assessed on N
  pages" with the kinds and reasons, and `--json` carries `summary.coverage`. A script that
  needs full coverage checks that field. A pre-spec book, which can only be assessed without
  signals, does not fail a CI check because of that.

## Impact map

- `packages/types`: `source-assessment.ts`, index export, registry rows in
  `pipeline-effects.ts` (`PipelineNodeName`, `EXTRA_STAGE_OUTPUT_NODES.extract`,
  `NODE_CACHE_RESOURCES["source-assessment"] = ["books", "book", "pages"]`, as for `extract`,
  because `BookSummary.sourceReadiness` reads it), `BookSummary` field, `MIN_TEXT_LAYER_CHARS`
  and `TextProfile` moved from `extract-report.ts`.
- `packages/pdf`: `ExtractedPage.sourceSignals`, the pixmap pass (`pixmap-signals.ts`) and
  the render restructure, counters at the warn and drop sites (including the recorder's
  `ignoreText`), the occlusion pass over recorded ops, page-box (TrimBox included), annotation
  and colour-space / mask reads, `needsPassword`/`hasPermission`, the catalog reads behind
  `source.structure`, always-on text-watermark detection, and the render paths
  (`renderPageForExtraction`, `renderPageFiltered`, `renderPageWithoutRasterWatermark`)
  returning the pixmap. No change to grouping or to any extraction output.
- `packages/pipeline`: `source-assessment.ts`, `pdf-extraction.ts` (collect, aggregate,
  write, note, use the pixmap edge samples instead of `samplePageEdges`, the interim "pages or
  node" guard in `extractPDF`), the CLI DAG's matching guard and `assessmentSettings`
  (`pipeline-dag.ts`), the `assess-source` subcommand (`cli.ts`), `extract-report.ts`
  and the rest of PR 0 (#1009: `book-inspection.ts`, `cli.ts`, `cli-args.ts`), plus
  `packages/llm/src/pricing.ts` and `openBookDbReadOnly` in `packages/storage` from PR 0.
- `packages/storage`: none for the node (`node_data` is generic and every write appends a
  version, §Lifecycle). The additive `step_runs.warnings` column for step warnings (§Step warnings, #1013), holding the completion-stamped envelope. One independent fast-lane fix: `clearExtractedRows` (`book-storage.ts:657-666`)
  deletes every `step_runs` row, including the `extract` row whose `started_at` was just
  written, so extract wall time cannot be measured from the DB today; the fix keeps the
  `extract` row and lands before AC-18 is measured.
- `apps/api`: the `source-assessment` route (GET and reassess) and tests,
  `PageSummary`/`PageDetail`/`BookSummary`, the derived `source-assessment` entry in `GET
  step-status`, the `settings-change` hook in `PUT config` and `PUT metadata` (`books.ts`),
  the spreads re-apply recompute (`pages.ts`), the `makeBeforeRun` guard (`stages.ts`),
  `assessmentSettings` passed by `stage-runner.ts` (PR 2d), and the step-warning part merge
  in `part-service.ts` (#1013).
- `apps/studio`: panel, messages map, page badges, page detail, sidebar count, shared
  validation components, five catalogs.
- Docs: `docs/specs/INDEX.md`; `docs/ARCHITECTURE.md` Extract outputs list (with PR 2d).
- Invariants: entity versioning (every trigger appends a version, none is overwritten; the
  node is derived from the extraction inventory and never part of it, §Lifecycle); the layer rule
  (Studio imports only constants from `@adt/types`). No new invariant and no new dependency. No
  schema version bump: `step_runs.warnings` is added in place, and older apps ignore it
  (§Step warnings).
- Concurrent work: SPEC-0010 (#886: the node stays **out** of the extraction manifest's
  inventory; verified reuse writes no version; reassessment takes its writer gate;
  `assessedExtraction` records its fingerprint, §Lifecycle), SPEC-0013 (#889: its per-page
  recovery records stay the source of truth for skipped pages), SPEC-0017 (#950: disclosure of
  provider error text in step warnings), SPEC-0020 (#993: recommendation target; R-h is a
  proposed extension), SPEC-0016 (#932: a future consumer of the node, not a dependency: its
  first slice runs before Create, this node after extraction); §Prerequisites and related work for #1009 (adopted),
  #1013 (implements §Step warnings), #1015 (adds the `summary-missing` kind), and the merged
  #1011, #1104, #1106 and #803 that this spec now accounts for.

## Acceptance criteria

- [ ] AC-1: After `extract` completes, exactly one `source-assessment` node (item `book`)
  exists for that run, parses with `SourceAssessment`, and `pages.length === pageCount`
  (`tests/fixtures/raven.pdf`).
- [ ] AC-2: `text-layer-empty` grades the corpus as: qa784 critical with
  `textProfile: image-only` (100/100 empty); cuaderno4 critical (31/38); Uruguay_Ceibal
  info (5/25); `prac_math_vol2` no finding.
- [ ] AC-3: `raster-overlay-split` is reported on ≥ 25 cuaderno4 pages with evidence
  `[body, overlay]`, severity `warning` and recommendation `{ setting:
  figure_extraction_mode, value: auto }` under `figure_extraction_mode: off`; under `auto` a
  pair merged by grouping (either raster in `coveredRasterImageIds`) yields no finding and an
  unmerged pair yields `warning` with action `figure-cleanup`; an overlay drawn under an opaque
  body (lower `streamSeqno`) is `critical`, and the same overlay under a soft-masked or
  `opacity < 1` body is `warning`; cuaderno3 `pg009` is flagged.
- [ ] AC-4: `figure-render-holes` is reported for cuaderno4 `pg012` with the `groupIndex` of
  `pg012_im012` and the covered raster image ids in evidence.
- [ ] AC-5: `whole-page-figure` is `warning` when ≥ 25 % of pages have a raster covering
  ≥ 85 % of the page, `info` below that, absent at 0 (synthetic bounds; the #901 image-only
  PNLD book when available).
- [ ] AC-6: `duplicate-images` is reported with `params.duplicates` and `params.extracted`
  when ≥ 10 % of extracted images share a hash across pages (qa784: 288 / 1,049) and is absent
  below 10 %.
- [ ] AC-7: `page-geometry` is `warning` when any page deviates > 2 % from the modal size,
  mixes orientation or has `/Rotate ≠ 0` (two-size fixture), and `info` when only
  `CropBox ≠ MediaBox` or `TrimBox ≠ CropBox` (a bleed fixture with a TrimBox 9 pt inside the
  CropBox).
- [ ] AC-8: `spreads-unmarked` is reported iff `spread-suggestions` is non-empty and spread
  mode is off (cuaderno3 extracted in single-page mode).
- [ ] AC-9: `image-decode-failed` counts the content-dropping sites only; a fixture with one
  corrupt image XObject yields `params.images = 1` and extraction still completes; an
  unsupported orientation increments `signals.orientationNotApplied` and raises no finding.
- [ ] AC-10: A password-required fixture fails the `extract` step with the message
  "PDF requires a password to open" (typed error, no node); a fixture with an owner password
  and restricted permissions extracts normally and yields `pdf-encrypted` info with
  `params.copy`, `params.accessibility`, `params.print`.
- [ ] AC-11: The `extract` step completes with a `source-assessment` step warning iff
  `counts.warning + counts.critical > 0` or `summary.coverage` is `"partial"` (AC-32):
  `prac_math_vol2` produces none and a plain green
  pill; cuaderno4 produces the amber "Completed with a warning" pill whose popover carries the
  translated counts.
- [ ] AC-12: `GET /books/:label/source-assessment` returns the latest version, returns
  `{ version: null, assessment: null }` for a book without one, and
  `PageSummary.sourceFindings` equals the node's per-page rollup; after the spreads re-apply
  route runs, a new node version exists and its untouched pages keep their previous `signals`.
- [ ] AC-13: `assessSource` run twice on identical input (including `generatedAt`) yields
  deep-equal output, and
  `packages/pipeline/src/source-assessment.ts` imports nothing from `@adt/llm`.
- [ ] AC-14: The Source quality panel renders one row per finding with translated title,
  description and recommendation, and page links that open `ExtractPageDetail`; every
  `SourceFindingKind` has a message entry, and all five catalogs contain the ids with no
  empty `msgstr`.
- [ ] AC-15: Page cards show a severity badge for every page listed in `pages[].kinds`, and
  the StageSidebar Extract badge equals `counts.warning + counts.critical` (cuaderno4), with
  the partial marker exactly when `summary.coverage` is `"partial"`.
- [ ] AC-16: With readiness `poor` (qa784), Sectioning runs and export prepares; no control is
  disabled because of the assessment.
- [ ] AC-17: `extract-report` prints the persisted findings, exits 1 when warnings or
  criticals exist and 0 otherwise, including for a partial assessment with no findings
  (AC-32), embeds the node in `--json`, and falls back to its recomputed profile for a
  book without the node.
- [ ] AC-18: False-positive and cost bounds: `prac_math_vol2` has zero critical and ≤ 2
  warning findings; extract wall time on `prac_math_vol2` and qa784 is within +5 % of the
  pre-spec run on develop at or after 8f34af99b (#1106), with the same `remove_watermarks`
  value in both runs, because the wizard turns removal on by default and image-watermark
  learning then dominates an image-only book's time (same machine, three runs each, measured from `step_runs.started_at /
  completed_at` once the `clearExtractedRows` fix has landed; until then from a non-committed
  timing script around `extractPdfStream`). Spread suggestions on cuaderno3 are deep-equal
  before and after the pixmap pass.
- [ ] AC-19: `raster-tiles` is reported for a synthetic page whose figure is four abutting
  tiles (2 × 2, gaps ≤ 1 pt, equal native ppi) with all four in evidence, `warning`; two
  rasters side by side whose union is not a rectangle, and two abutting rasters with native
  ppi 150 and 300, produce no finding.
- [ ] AC-20: On a synthetic page with a full-page raster and render-mode-3 text (an OCR layer),
  `signals.invisibleGlyphs` equals the hidden glyph count, `hidden-text-layer` is `warning`,
  the page counts as empty for `text-layer-empty` and its `pageType` is `scanned` (corroborated
  by the OCR layer); the same hidden text on a page with visible body text and no full-page
  raster yields `info`.
- [ ] AC-21: A fixture with `/OCProperties` (two layers, one off by default) yields
  `optional-content` warning with `params.layers = 2, params.off = 1` and both names in
  `params.names`; a portfolio fixture
  (`/Collection`) and a `/NeedsRendering true` XFA fixture each yield `pdf-container`
  critical, and attachments alone yield info.
- [ ] AC-22: `raster-occluded` is reported as `info` for a raster with an opaque rectangle
  painted after it over ≥ 10 % of its bounds, with `params.coveredRatio` and
  `params.byKind = "fill"`; the same rectangle painted *before* the raster, at alpha 0.5, or
  clipped to < 10 % produces no finding; live text over the raster, a full-page plate under a
  white panel, and an overlay pair already reported as `raster-overlay-split` produce none.
  `prac_math_vol2` yields ≤ 3 pages with the finding (recorded with AC-18).
- [ ] AC-23: `mixed-page-types` is reported on a two-kind synthetic book (text pages plus
  ≥ 50 % image-only pages) with the scanned pages in `pageIds`; it is absent on
  `prac_math_vol2` and qa784 (all digital, all scanned) and on a synthetic digital book with
  10 % full-bleed photo pages and no OCR layer.
- [ ] AC-24: Every remaining kind fires at its threshold and not just below it, in one
  table-driven test over synthetic `SourceAssessmentInput`s: `ink-without-text`,
  `blank-page` (with `trim-page-range` at the ends of the range only), `text-unmapped-glyphs`
  (2 % boundary), `script-mismatch` (Latin text, `editing_language` with a non-Latin script),
  `low-resolution-raster` (100 dpi; `params.uniform`), `needs-convert-colorspace`,
  `layered-artwork` (blend, opacity, clip, stencil, soft mask), `watermark-detected` (warning
  for text-layer signatures while `remove_watermarks` is off; with removal on, info with
  `params.removedText` and `params.removedImage` from a debug record that holds text signatures
  and `cleanedImageStrengths`, which `SourceFinding.parse` accepts; with removal on and nothing
  removed, no finding), `book-scale` (300 pages / 500 Mpx) and
  `shape-flood` (1,500 shapes / 60 rasters).
- [ ] AC-25: A step that completes with warnings persists them typed, except the derived
  `source-assessment` warning, which is never persisted. `GET step-status` returns them under
  `stepWarnings` for the done step, with `stepWarningSources` set to `"recorded"`. The live
  `step-complete` event carries the same persisted warnings, and `message` is their English
  rendering. For `extract`, the event's `source-assessment` entry equals the one from `GET`
  while the version the step wrote is still the latest. After a Reassess, `GET` follows the
  new version and the event does not. Starting, skipping or failing the step again clears the
  warnings. A step this app completes without warnings has an empty envelope and no
  `stepWarnings` entry.
- [ ] AC-26: Studio renders every `StepWarning` kind through Lingui in all five locales. A done
  pill is amber exactly when its step has warnings, and its popover header agrees. A finished
  step's free-text `message` is not shown. With the Studio locale set to `es`, a
  `pages-unchanged` warning reads in Spanish apart from the page ids and the provider error
  text behind the disclosure. A step whose warnings are only `unrecognized` is amber, and its
  popover shows the "can't show" line.
- [ ] AC-27: Compatibility, as semantic round trips through an older writer. The older
  writer's statements are copied verbatim from develop's `markStepStarted`,
  `markStepCompleted`, `markStepSkipped` and `recordStepError` into the test.
  (a) A book whose `step_runs` lacks the column opens and gains the column with
  `SCHEMA_VERSION` unchanged. Its done rows read as `"legacy"`, with no warnings, except a row
  whose message is the skip literal, which reads as `pages-skipped`.
  (b) After this app completes a step with warnings, an older start then a clean older
  complete leave the column in place. The step reads with **no** warnings because the stamp no
  longer matches, and `stepWarningSources` is `"legacy"`. When the older complete records a
  **new** skip instead (`"Completed — 3 page(s) skipped"`), the step reads as
  `[{ kind: "pages-skipped", count: 3 }]`, `"legacy"`, with an amber pill. The stale envelope's
  warnings appear in neither case. A message that merely contains the skip text, or any other
  message, adapts to no warnings, and so does `"Completed — 0 page(s) skipped"`. After this
  app records a skip (its own rendering, not the literal), an older direct complete without a
  message reads as `"legacy"` with **no** warnings: neither the stale envelope nor this app's
  message revives the skip. A book assembled from parts this app completed reads as
  `"recorded"`.
  (c) After this app's warnings, an older error leaves the step `error` with no warnings
  returned, and an older skip leaves it `skipped` with none.
  (d) A stored `[known, unknown kind, malformed]` reads as the known warning plus
  `{ kind: "unrecognized", count: 2 }`; an envelope that is not valid JSON reads as
  `{ kind: "unrecognized", count: 1 }`.
- [ ] AC-28: One count everywhere. On cuaderno4, after each of (i) an `editing_language` change
  that adds or removes `script-mismatch`, (ii) a segmentation toggle that changes the
  `whole-page-figure` recommendation, (iii) a spreads re-apply, and (iv) a Reassess: a new
  version exists with the matching `trigger`, and the panel counts, the page badges, the
  sidebar count, the `extract` pill warning from `GET step-status`, `GET source-assessment`
  and `extract-report` all agree. A downstream-setting change does not trigger SPEC-0010's
  changed-extraction-input path. A book with no node returns `{ version: null, assessment:
  null }`, shows "Not assessed", and has no `source-assessment` pill warning. A node with
  `rulesVersion` below the current one shows "Assessed with older rules". Under SPEC-0010
  verified reuse (once #886 lands), no version is written.
- [ ] AC-29: Work budget. A synthetic page with 20,000 opaque fills and 201 rasters (one above
  the pairwise cap, so the pairwise rules are skipped) completes
  the occlusion pass and the pairwise rules within the budget's time bound (≤ 50 ms per page on
  the CI runner, recorded with AC-18). It records `truncated` and `summary.incomplete` with
  `reason: "budget"` for `raster-occluded` and the three pairwise kinds, and the panel and
  `extract-report` show "Not fully assessed". With 200 rasters and fills below the occlusion
  limits, the same page shape yields no `incomplete` entry. A legacy book reassessed without
  `signals` lists the signal-fed kinds with `reason: "no-signals"`.
- [ ] AC-30: Skipped pages stay discoverable. After a run that skips pages (SPEC-0013) and a
  reload, the `pages-skipped` popover names them (`pageIds`, up to five and "and N more"), and
  OutputReview lists the same pages from SPEC-0013's recovery records. The OutputReview half
  depends on SPEC-0013 (#889) landing; until then only the popover half is asserted, and the AC
  stays open.
- [ ] AC-31: History survives an attempted rerun. A book with assessment v1 (`extract`) and v2
  (`reassess`) gets an ordinary extraction rerun through each of the API
  (`fromStage: "extract"`), the CLI DAG and a direct `extractPDF` call. In every outcome, v1,
  v2, the pages and the images are all still present and unchanged.
  (a) Under PR 2d's interim guard, each entry point refuses with `UNSAFE_RESUME_UNAVAILABLE`
  before anything is cleared. The same holds for a book that has a node but no pages.
  (b) Once SPEC-0010's admission replaces the guard, the outcome follows its admission table.
  A rerun with identical PDF bytes, effective extraction inputs and contract over an intact
  extraction is a verified reuse: it writes no extraction entity and no assessment version, and
  the latest version stays current (as in AC-28). A changed source or extraction setting, a book
  without a trustworthy manifest (which includes a node with no pages) and an incomplete
  extraction are each rejected before mutation, with SPEC-0010's mismatch class.
  (b) is asserted in the SPEC-0010 implementation PR, or here if this spec's PR 2d lands after
  it.
- [ ] AC-32: Partial coverage with zero findings. A synthetic book with no warning or critical
  finding of any kind, reassessed without `signals` (so `incomplete` lists the signal-fed
  kinds with `no-signals`) gives:
  - readiness `ready`, `coverage: "partial"` and the right `incompletePages`;
  - an amber `extract` pill whose popover says "Not fully assessed on N pages";
  - a sidebar badge of 0 with the partial marker;
  - if the field ships (OQ5), `BookSummary.sourceReadiness` equal to `{ readiness: "ready",
    coverage: "partial" }`;
  - `extract-report` printing the line, exiting 0, with `summary.coverage` in `--json`.

  The same book with `signals` present gives `coverage: "complete"`, a green pill, no marker
  and exit 0.
- [ ] AC-33: Missing input on a fresh extraction. An `extract` write with `signals: null` on
  every page and `source.structure` and `source.permissions` null lists every signal-fed kind
  per page and every document kind (`pdf-encrypted`, `optional-content`, `pdf-container`)
  book-scoped with `pageIds: []`, all with `reason: "no-signals"`. It gives `coverage:
  "partial"` and `incompletePages` equal to the page count. It is identical to a Reassess of
  the same storage, and `page-geometry`'s size half and `layered-artwork`'s blend half are
  still evaluated.
- [ ] AC-34: Images added later do not move the assessment. On cuaderno4, after an image is
  added to a page by upload, by picking an image from another page and by "Crop from page"
  (#1104), no new version exists. A Reassess then gives the same findings and counts as before
  the additions, because `pageInputFromStorage` reads only `source IN ('page', 'extract')`.
- [ ] AC-35: Books with no PDF source are not assessed. For a book imported from an ADT bundle
  (#803): no `source-assessment` node exists, `GET source-assessment` returns `{ version: null,
  assessment: null }`, `POST …/reassess` and `pnpm pipeline assess-source` are refused (409 /
  non-zero exit) and write nothing, `BookSummary.sourceReadiness` is absent, and `PUT config` or
  `PUT metadata` writes no version.
- [ ] AC-36: Mixed parts keep their typed warnings. A book is assembled from part A, which this
  app completed with a `pages-unchanged` warning, and part B, which an older writer completed
  (statements copied as in AC-27). (i) When B's message is the skip literal
  (`"Completed — 2 page(s) skipped"`), the assembled step reads as `pages-unchanged` plus
  `{ kind: "pages-skipped", count: 2 }`. (ii) When B's message is any other text, it reads as
  `pages-unchanged` alone. In both cases the envelope's `completedAt` matches the fresh
  `completed_at`, `legacyParts` is 1, `stepWarningSources` is `"mixed"`, the pill is amber, and
  the popover lists the typed warnings and the older-version disclosure line. A book assembled
  only from clean legacy parts and recorded parts with no warnings reads as `"mixed"` with no
  warnings and a pill that is not amber.
- [ ] AC-37: The source duplicate count does not follow later pruning. A synthetic book has
  one hash on three pages and no figure ids in the extraction debug. The assessment reports
  `duplicate-images` with those copies. After Image Filtering or Image Meaningfulness's dedup
  marks copies pruned in the classification, a Reassess built from storage reports the same
  finding with the same counts. An image whose id the extraction debug ties to a figure is
  left out both times.

## Test plan

Rule: `packages/pdf` tests assert signals only (`@adt/pdf` cannot import `@adt/pipeline`);
findings are asserted in `packages/pipeline` tests.


| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | integration | `packages/pipeline/src/__tests__/pdf-extraction.source-assessment.test.ts` | `AC-1: writes one valid source-assessment node per extract run` |
| AC-2 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-2: grades text-layer-empty by the empty-page ratio` |
| AC-3 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts` (synthetic inputs, PR 2b), `packages/pipeline/src/__tests__/pdf-extraction.source-assessment.test.ts` (cuaderno4/3, PR 2d) | `AC-3: reports raster-overlay-split for nested rasters with mode-aware severity` |
| AC-4 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts` (PR 2b), `packages/pipeline/src/__tests__/pdf-extraction.source-assessment.test.ts` (PR 2d) | `AC-4: reports figure-render-holes for a vector group over excluded rasters` |
| AC-5 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-5: reports whole-page-figure at 85 % page coverage` |
| AC-6 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-6: reports duplicate-images at 10 % shared hashes` |
| AC-7 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts` (rule), `packages/pdf/src/__tests__/source-signals.test.ts` (box and rotate signals only) | `AC-7: reports page-geometry beyond 2 % deviation, rotation or differing page boxes` |
| AC-8 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-8: reports spreads-unmarked only with suggestions and spread mode off` |
| AC-9 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` (counters), `packages/pipeline/src/__tests__/source-assessment.test.ts` (finding) | `AC-9: counts image decode failures without aborting extraction` |
| AC-10 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` (typed error, permissions read), `packages/pipeline/src/__tests__/source-assessment.test.ts` (`pdf-encrypted` finding) | `AC-10: fails clearly on a password-required PDF and reports pdf-encrypted on restricted permissions` |
| AC-11 | unit + integration + browser | `packages/pipeline/src/__tests__/source-assessment.test.ts` (`sourceAssessmentWarning`, PR 2c), `apps/api/src/services/stage-runner.test.ts` (PR 4), `apps/studio/src/components/pipeline/components/SubStepPillRow.test.tsx` (PR 5b, after #1013) | `AC-11: extract step warning appears only with warning or critical findings or partial coverage` |
| AC-12 | integration | `apps/api/src/routes/source-assessment.test.ts`, `apps/api/src/routes/pages.test.ts` | `AC-12: returns the latest assessment, nulls when absent, and page rollups` |
| AC-13 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-13: assessment is deterministic and provider-free` |
| AC-14 | unit + browser | `apps/studio/src/lib/source-assessment-messages.test.ts`, `apps/studio/src/components/pipeline/stages/extract/components/SourceQualityPanel.test.tsx` | `AC-14: every finding kind has a translated title, description and recommendation` |
| AC-15 | browser | `apps/studio/src/components/pipeline/stages/extract/ExtractView.source-assessment.test.tsx`, `apps/studio/src/components/pipeline/StageSidebar.test.tsx` | `AC-15: page badges and the sidebar count follow the assessment` |
| AC-16 | integration + browser | `apps/api/src/routes/stages.test.ts` (PR 4), `apps/studio/src/components/pipeline/stages/extract/ExtractView.source-assessment.test.tsx` (PR 5b) | `AC-16: poor readiness never disables run or export` |
| AC-17 | unit + integration | `packages/pipeline/src/__tests__/extract-report.test.ts` (exists from PR 0) | `AC-17: extract-report prints persisted findings and sets the exit code` |
| AC-18 | corpus + integration | `docs/verification/spec-0021.md` (recorded), `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-18: false-positive bound on prac_math_vol2 and extract wall time within +5 %`; `AC-18: pixmap edge samples equal samplePageEdges of the PNG` |
| AC-19 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-19: reports raster-tiles for abutting rasters that union to a rectangle` |
| AC-20 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts` (rule, PR 2c), `packages/pdf/src/__tests__/source-signals.test.ts` (`invisibleGlyphs`, PR 3b) | `AC-20: counts invisible glyphs and grades an OCR layer as a scan` |
| AC-21 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts` (rules, PR 2c), `packages/pdf/src/__tests__/source-signals.test.ts` (`source.structure` reads, PR 3c) | `AC-21: reports optional-content layers and pdf-container forms and portfolios` |
| AC-22 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts` (rule, PR 2c), `packages/pdf/src/__tests__/source-signals.test.ts` (`occludedRasters`, PR 3b) | `AC-22: reports raster-occluded for opaque content painted over a raster` |
| AC-23 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-23: reports mixed-page-types only when digital and scanned pages coexist` |
| AC-24 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-24: every remaining kind fires at its threshold and not below` |
| AC-25 | unit + integration | `packages/storage/src/__tests__/step-warnings.test.ts`, `apps/api/src/routes/stages.test.ts`, `apps/api/src/services/stage-runner.test.ts` (#1013); the `extract` event-versus-GET equality and its divergence after a Reassess in `apps/api/src/routes/stages.test.ts` (PR 4) | `AC-25: step warnings are persisted typed, returned for done steps and cleared on restart` |
| AC-26 | unit + component + browser | `apps/studio/src/lib/step-warnings.test.ts`, `apps/studio/src/components/pipeline/components/SubStepPillRow.test.tsx` (#1013); the `es` rendering is checked in a browser, because Studio unit tests stub the Lingui macros, and the CI i18n job enforces complete catalogs | `AC-26: every step warning kind renders a translated summary`; `AC-26: a done pill is amber with a warning only when its step has warnings` |
| AC-27 | integration + component | `packages/storage/src/__tests__/step-warnings.test.ts`, `apps/api/src/services/part-service.test.ts` (part merge), `apps/studio/src/components/pipeline/components/SubStepPillRow.test.tsx` (amber pill and legacy line) (#1013) | `AC-27: older-writer round trips never revive stale warnings, adapt only the legacy skip literal, and unknown kinds stay visible` |
| AC-28 | integration + browser | `apps/api/src/routes/source-assessment.test.ts` (PR 4), `apps/studio/src/components/pipeline/stages/extract/ExtractView.source-assessment.test.tsx` (PR 5b), `packages/pipeline/src/__tests__/extract-report.test.ts` (PR 6) | `AC-28: every surface counts from the latest assessment after each trigger` |
| AC-29 | unit + integration + browser | `packages/pdf/src/__tests__/source-signals.test.ts` (occlusion budget, PR 3b), `packages/pipeline/src/__tests__/source-assessment.test.ts` (pairwise cap and `incomplete`, PR 2b), `SourceQualityPanel.test.tsx` (the panel line, PR 5b), `packages/pipeline/src/__tests__/extract-report.test.ts` (the printed line, PR 6) | `AC-29: geometry passes stay within budget and report truncation` |
| AC-30 | component + browser | `apps/studio/src/components/pipeline/components/SubStepPillRow.test.tsx` and `packages/pipeline/src/__tests__/step-warnings.test.ts` (the named pages, #1013); the reload and OutputReview half in a browser check once SPEC-0013 lands, recorded in `docs/verification/spec-0021.md` | `AC-30: skipped pages stay discoverable after reload` |
| AC-31 | integration | `packages/pipeline/src/__tests__/pdf-extraction.source-assessment.test.ts` (direct `extractPDF`), `apps/api/src/routes/stages.test.ts` and `packages/pipeline/src/__tests__/pipeline-dag.test.ts` (orchestrators), all PR 2d | `AC-31: an attempted extraction rerun keeps every assessment version` |
| AC-32 | unit + integration + browser | `packages/pipeline/src/__tests__/source-assessment.test.ts` (coverage, PR 2b; `sourceAssessmentWarning`, PR 2c), `apps/api/src/routes/source-assessment.test.ts` (`BookSummary`, PR 4), `packages/pipeline/src/__tests__/extract-report.test.ts` (exit code, PR 6), `apps/studio/src/components/pipeline/StageSidebar.test.tsx` and `SubStepPillRow.test.tsx` (PR 5b) | `AC-32: partial coverage with zero findings is amber everywhere and exits 0` |
| AC-33 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts` (rules, PR 2c), `packages/pipeline/src/__tests__/pdf-extraction.source-assessment.test.ts` (extract write equals Reassess, PR 2d) | `AC-33: an extraction without signals reports the missing checks as incomplete` |
| AC-34 | integration | `apps/api/src/routes/source-assessment.test.ts` (PR 4) | `AC-34: images added after extraction write no version and do not enter a Reassess` |
| AC-35 | integration | `apps/api/src/routes/source-assessment.test.ts` (PR 4), `packages/pipeline/src/__tests__/cli-args.test.ts` (`assess-source`, PR 6) | `AC-35: an imported ADT book is never assessed` |
| AC-36 | integration + component | `apps/api/src/services/part-service.test.ts` (part merge), `packages/storage/src/__tests__/step-warnings.test.ts`, `apps/studio/src/components/pipeline/components/SubStepPillRow.test.tsx` (#1013) | `AC-36: merging recorded and legacy parts keeps typed warnings and reads as mixed` |
| AC-37 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-37: duplicate-images membership ignores later pruning` |

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

No feature flag: the assessment is additive, free and deterministic. An absent node means
no findings, badges or pill warning; the panel shows only its "Not assessed" state with
Reassess (§Lifecycle). Thresholds are exported constants so SPEC-0005 can tune them with corpus
evidence. Each PR is revertable on its own. Reverting PR 2d removes the node, the note and the
interim extraction guard, so history is no longer preserved (§Lifecycle), and every consumer
tolerates the node's absence.

**Release rule (decision 20).** PR 2d ships in the same release as PRs 3a and 3b (and 3c, unless
3c lands first). They may merge to develop in the order below, but no release is cut between
them, so no released build reports every new book as partially assessed.

Implementation PRs in dependency order, each within the SDD review budget (about 1,000 changed
lines, #1060). The first value-bearing PR after PR 0 touches no extractor code. Every kind is
named in exactly one rules PR, and every PR is opened as a draft until this spec is `approved`
on develop.

0. **#1009, adopted**: the read-only `extract-report` CLI (#1008) — text profile, image
   counts and duplicates, pruning, Extract LLM cost and cache attribution, `--compare`,
   `--csv`, `--json`. It is the baseline that measures every later PR (AC-2, AC-6, AC-18) and
   it defines `MIN_TEXT_LAYER_CHARS` and `TextProfile`. Already open at ≈ 745 lines across 13
   files, within the review budget; reviewed as one self-contained, read-only PR.
1. `packages/types`: schema, constants (moving `MIN_TEXT_LAYER_CHARS` and `TextProfile` from
   PR 0), registry rows, `BookSummary` field (≈ 200).
2. `packages/pipeline`:
   a) text and page-type rules: `text-layer-empty`, `script-mismatch`, `pageType`,
   `mixed-page-types`, `whole-page-figure`, `duplicate-images`, `spreads-unmarked`,
   `shape-flood`, `book-scale`; AC-2, AC-5, AC-6, AC-8, AC-13, AC-23, AC-37 (≈ 320);
   b) figure-geometry rules: `raster-overlay-split`, `raster-tiles`, `figure-render-holes`,
   `low-resolution-raster`, `layered-artwork`; the 200-raster pairwise cap and
   `summary.incomplete`, `coverage` and `incompletePages`; AC-3, AC-4, AC-19, the rule half of
   AC-29 and the coverage half of AC-32 on synthetic inputs (≈ 330);
   c) signal-fed and document rules, each recorded in `summary.incomplete` with `reason:
   "no-signals"` (book-scoped for the document kinds) while its input is null, never
   dropped: `ink-without-text`, `blank-page`, `text-unmapped-glyphs`, `hidden-text-layer`,
   `raster-occluded`, `image-decode-failed`, `needs-convert-colorspace`, `page-geometry`,
   `watermark-detected`, `pdf-encrypted`, `optional-content`, `pdf-container`; aggregation,
   readiness, rollups, `sourceAssessmentWarning`; the rule halves of AC-7, AC-9, AC-10, AC-11,
   AC-20, AC-21, AC-22, AC-24 and AC-33 (≈ 380);
   d) the write: `pdf-extraction.ts`, `assessmentSettings` from both callers (the CLI DAG and
   `apps/api/src/services/stage-runner.ts`), `pageInputFromStorage` (extraction-written images
   only), and the interim extraction guard (one "pages or node" condition in `extractPDF`,
   `makeBeforeRun` and the CLI DAG) unless SPEC-0010's boundary has landed (§Lifecycle); AC-1,
   the corpus halves of AC-3 and AC-4, AC-31, the write half of AC-33 (≈ 300). Ships in the
   same release as PRs 3a and 3b (release rule above).
3. `packages/pdf` (signals only; reverting any of these degrades — its kinds become
   `incomplete` with `no-signals`, the pngjs call returns — rather than removing the node):
   a) the pixmap pass: `renderPageForExtraction` and its three paths (the image-watermark
   render, `renderPageFiltered` and the plain render) return the pixmap alongside the cleaned
   rasters, and the spread path does the same; `inkFraction`, edge samples,
   `pdf-extraction.ts` switched to them; AC-18 (≈ 300);
   b) page counters and reads: glyph and `ignoreText` counters, failure counters, the
   occlusion pass with its work budget and `truncated`, page boxes, annotations, per-raster
   colour class and masks; fixtures; AC-9, the signal halves of AC-7, AC-20, AC-22 and AC-29
   (≈ 370);
   c) document reads: permissions, `PdfPasswordRequiredError`, `source.structure`,
   `producerFamily`, always-on text-watermark detection, and the removed-watermark record
   for `watermark-detected`; fixtures; AC-10, the signal half of AC-21 (≈ 220).
4. `apps/api`: route, payload fields, spreads re-apply recompute, the reassess route (refused
   for imported books), the `PUT config` and `PUT metadata` settings-change hooks, the derived
   `source-assessment` entry in `GET step-status`, `BookSummary.sourceReadiness` with coverage;
   AC-12, AC-34, AC-35, the API halves of AC-11, AC-16, AC-25 (the `extract` event versus `GET`),
   AC-28 and AC-32 (≈ 420). Needs #1013's `stepWarnings` field.
5. `apps/studio` a) shared validation components, messages map, hook, catalogs (≈ 320);
   b) panel (with the not-assessed, outdated and incomplete states and the Reassess button),
   page badges, page detail, sidebar with the partial marker; AC-14, AC-15, the pill half of
   AC-11, the browser halves of AC-16, AC-28, AC-29 and AC-32 (≈ 420). Needs #1013.

6. CLI: `extract-report` source section on top of PR 0 (still read-only) with the incomplete
   line, the documented exit code and `summary.coverage` in `--json`; the `assess-source`
   subcommand (refused for imported books); AC-17 and the CLI halves of AC-28, AC-29, AC-32
   and AC-35 (≈ 230).

**#1013 implements §Step warnings** next to its original fix (#1012, the image passes naming
the pages left unchanged): `StepWarning`, the event field, the column, the API field, the
Studio rendering, AC-25 to AC-27 and AC-30 (≈ 600 lines with tests and catalogs). The
2026-11-04 revision changes what it implements: the completion-stamped envelope, parsing each
element on its own with `unrecognized`, the `source-assessment` kind never persisted, and the
SPEC-0017 disclosure for provider text. The 2026-11-13 revision adds:
- an envelope on every completion (`items: []` when clean);
- the legacy-completion adapter for the skip message, with `stepWarningSources`;
- `message` always set (NULL when clean), an English rendering that differs from the legacy
  literal, and a part merge that carries `completed_at`, `message` and the envelope;
- `incompletePages` on the `source-assessment` kind;
- the narrowed AC-25 equality and the new-skip case of AC-27(b);
- the `unrecognized` popover line ("N warning(s) this version of ADT Studio can't show") and
  `pageIds` on `pages-skipped` and AC-30's popover naming the skipped pages;
- `step_runs.message` holding only the rendering of persisted warnings.

The 2026-11-17 revision adds the mixed-part merge: `legacyParts` on the envelope, legacy
parts' adapted warnings combined into `items`, `"mixed"` in `stepWarningSources`, the
older-version disclosure line for a mixed step, and AC-36.

#1013 adopts these before it leaves draft. It is a
draft until this spec is `approved`. #1015, stacked on it, then emits `summary-missing`.

Independent fast-lane fix, before AC-18 is measured: keep the `extract` row in `step_runs`
when `clearExtractedRows` runs (`book-storage.ts:665`), with a test that `started_at`
survives a re-extract.

### Prerequisites and related work

| PR | Relation | What this spec takes from it |
|---|---|---|
| #1009 `extract-report` CLI (#1008) | **Adopted as PR 0**, owned by this spec | The baseline report, `MIN_TEXT_LAYER_CHARS`, `TextProfile`, the exit-code convention, the `--compare` / `--json` surfaces PR 6 extends |
| #1013 image-pass failures (#1012) | **Implements §Step warnings**; hard prerequisite of PR 2c, PR 4, PR 5b and AC-11 | The typed step-warning channel: `StepWarning`, the `step-complete` field, `step_runs.warnings`, `stepWarnings` in `GET step-status`, the translated amber pill, and the console sink printing `event.message` |
| SPEC-0010 safe reruns (#886, in review) | **Prerequisite of the history guarantee only**: its extraction admission at the common boundary (verified reuse or rejection before mutation), or PR 2d's interim guard, which refuses every rerun, until then (§Lifecycle, AC-31). The rest of SPEC-0010 is not a dependency | §Lifecycle: the node is derived and stays out of the manifest inventory; verified reuse writes nothing; any other rerun is refused before `clearExtractedData` runs |
| SPEC-0013 page-failure recovery (#889, in review) | Owner of skipped-page records; AC-30's OutputReview half depends on it | `pages-skipped` is a count that links to SPEC-0013's per-page recovery records and OutputReview; it never replaces them (AC-30) |
| SPEC-0017 connectivity handling (#950, in review) | Owner of error disclosure | Provider error text in `pages-unchanged` and `summary-missing` is shown through its technical-details disclosure; its classified wording replaces the generic line once it lands |
| SPEC-0020 figure cleanup (#993, in review) | Recommendation target; shares `ExtractPageDetail` | `figure-cleanup` opens its entry point; an accepted cleanup writes no assessment version (§Lifecycle); R-h is a proposed extension that needs its owner's agreement |
| SPEC-0016 AI setup recommender (#932) | Future consumer | None today: its first slice is pre-Create; consuming the node later is an integration, not a dependency |
| #1011 identical images judged once (#1010) | Merged (725632947) | `duplicate-images` recommends `none` because #1011 already judges exact duplicates once. Its membership is built from extraction-time evidence and is independent of `planHashDedup`'s pruning-dependent count (decision 26) |
| #1015 book summary for scanned books | Related; stacked on #1013 | Emits the `summary-missing` step warning (§Step warnings) when the summary call fails; it consumes page renders the same way a later vision text-recovery spec would route `text-layer-empty` pages |
| #1106 image-watermark removal (#1105) | Merged (8f34af99b) | The render paths PR 3a restructures; the cleaned images the checks measure; `watermark-detected`'s removal-on record; AC-18's baseline (decision 23) |
| #1104 add images in Extract | Merged (8b454f658) | Images with `source` `crop`/`upload` are not inventory (decision 22); the page detail's "Crop from page" control next to the findings list |
| #803 round-trip ADT import (#705) | Merged (38977d14e) | Imported books are not assessed (decision 21) |

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
  `cropFigureFromPageRender` (`extract.ts:3892`), members added to `coveredRasterHashes`.
  Gate: cuaderno4 yields ≥ 25 owl composites and 0 "narrow cropped fragment" prunes;
  `prac_math_vol2` image count unchanged; E8 audit. Changes extraction output, so triage
  decides between fast lane and its own spec.
- **R-b Prune guard for a contained overlay** in `off` and `all` modes (extend the auto-only
  guard at `image-meaningfulness.ts:303-326`): with R-a off, 0 overlay prunes on cuaderno4.
- **R-c No holes**: a vector group overlapping excluded rasters renders as `page-crop`
  (decision at `extract.ts:4140-4152`); `pg012_im012` contains the photos; ≤ 3 % of PNLD
  vector figures flip render method.
- **R-d** Crop padding by an ink test and ink-adjacency group merge (after E4).
- (R-e and R-f are not used; the ids are not reassigned.)
- **R-g** Align the background-split comment with the code (`extract.ts:2247-2251` vs
  4031-4037).
- **R-h Describe what the page shows**: alt text, captions and meaningfulness verdicts for a
  raster flagged `raster-occluded` are generated from its page-crop, never from the raw
  raster, so labels hidden under answer boxes cannot leak into them. **A proposed extension of
  SPEC-0020 (#993) that needs its owner's agreement.** SPEC-0020's current scope covers
  user-directed candidate generation and acceptance, not automatic input selection for
  captions or meaningfulness. R-h is about which input those calls read, not about
  regenerating anything automatically. Until SPEC-0020's owner accepts it, R-h is unowned, and
  this spec only supplies the `raster-occluded` signal it would key on. The taxonomy's
  remediation design goes to SPEC-0020 as input either way.
- **R-i Annotations in renders**: decide whether `toPixmap` should pass `showExtras = false`
  (review stamps and notes are drawn into page renders and page-crop figures today), gated on
  `annotations-present` counts from the corpus. Changes extraction output.

Optimisations the assessment enables:

- **O1** Deterministic verdicts skip the meaningfulness call: exact duplicates (done by #1011),
  small decorations repeated on ≥ 5 pages, standalones replaced by an R-a composite, a
  full-page raster on an image-only page (E7 gate).
- **O2** Downscale sub-images for classification (roadmap experiment).
- **O3** Stable render hashes (E6) for fewer cache misses.
- **O4** Bound `extraction-debug` (≤ 200 groups per page, ≤ 20 shapes per group, 0.1 pt
  rounding) and give it a zod schema and registry row — separate fast-lane PR.
- **O5** One pixel pass per page shared by the ink signals, the edge samples (done by this
  spec) and the page-crop decodes (`cropPng` decodes the whole page PNG once per page-crop
  figure, `extract.ts:3892-3930`; `stitchPngsHorizontally` decodes both halves of a spread).
- **O6** Compute `grayscaleStdDev` while the raster is still a pixmap so
  `classifyPageImages` skips a decode.
- **O7** Opt-in vision spot check on ≤ 5 flagged pages with the cheapest model, cached — v2.

## Open questions

1. Post-image-pass enrichment ("and the overlay was then pruned", "whole-page figure kept")
   as a read-time join against `image-filtering` in the API — yes or no. Owner:
   @gbergengruen, by spec approval.
2. Thresholds for `low-resolution-raster`, `text-unmapped-glyphs`, `whole-page-figure`
   (85 % / 25 %) are frozen after E5 and the corpus run in PR 3a. Who signs off: the product
   reviewer of this spec, before PR 3a merges.
3. Persisted acknowledgement ("Mark checked", a new node version with `acknowledgedAt`) —
   product call, not blocking. Owner: product reviewer, by spec approval.
4. `outlined-text` as a v1 proxy (0 chars plus a high `totalVectorShapes`) or wait for E2.
   Owner: @gbergengruen, by spec approval; default: wait for E2.
5. `BookSummary.sourceReadiness` in the books list — keep if the list benchmark (#996)
   holds, otherwise read on demand. Owner: @gbergengruen, decided in PR 4.
6. Resolved 2026-10-29: in spread mode `spread-suggestions` is always `[]`
   (`pdf-extraction.ts:147`), so `spreads-unmarked` disappears once spreads are marked; no
   subtraction is needed.
7. R-a: fast lane or its own spec — triage. Owner: the maintainer who triages R-a, after E8.
8. `figure-render-holes` is defined on the figure's `bounds` joined by `imageId`, not on
   `extractionDebug.groups[].groupBbox` (which lacks the spread `xOffset`), and keys on
   `renderMethod: "vector"` plus an uncovered raster overlap ≥ 50 %, not on `hasImages`
   (SVG `<image>` elements set it in `off` mode too, `extract.ts:3149-3189`). Confirm on
   cuaderno4 `pg012` in PR 2d; if the join misses, PR 3b records `overlappedRasterImageIds`
   at the render decision as originally drafted. Owner: @gbergengruen, in PR 2d.
9. `optional-content`: is naming the layers enough, or should a later setting choose the
   language layer to extract (the taxonomy's "ask which language layer")? That setting would be
   an `EXTRACTION_CONFIG_KEYS` entry and a new `SourceRecommendation` key. Product call; v1
   names the layers only. Owner: product reviewer, not blocking.
10. `mixed-page-types` threshold (minority ≥ 5 % of pages for a warning) and the 50 %
    scanned-book corroboration are first guesses, frozen with the corpus matrix run in PR 3a.
    Owner: product reviewer, with OQ2.
