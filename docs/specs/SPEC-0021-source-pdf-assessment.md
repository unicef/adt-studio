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
updated: 2026-10-27
---

**After the `extract` step, every book gets one persisted, deterministic, LLM-free
assessment of its source PDF: a readiness grade, counts by severity, typed findings with
page and image evidence, and an actionable hint per finding. Studio shows it on the Extract
stage; the API and the CLI expose it. It is advisory: it never gates a run or an export.**

Decisions taken with the product owner on 2026-10-27 and encoded here: **assessment only**
(remedies are referenced follow-ups, §Rollout), **advisory only**, **deterministic in v1**.

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
- G4. Every finding carries an actionable hint: obtain a text-based PDF, re-import with
  figure extraction `auto`, use figure cleanup (SPEC-0020), mark spreads, split or normalise
  pages.
- G5. Advisory only: nothing is disabled or gated (SPEC-0001 vocabulary).
- G6. `extract-report` reads the persisted node; `pipeline run` prints the note.
- G7. Zero model calls; the assessment adds ≤ 5 % to extract wall time, with a target of
  ≤ 0 once the existing `samplePageEdges` PNG decode is folded into the same pixel pass.

## Non-goals

Binding. Each has an owner elsewhere so adjacent work is not blocked.

- Repairing defects: compositing stacked rasters, filling vector holes, re-cropping, OCR.
  Remedies are listed under Rollout as follow-ups with gates; figure repair is SPEC-0020.
- Choosing or changing extraction settings from the input. Hints may *name* a setting; they
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

## Proposed design

### Options considered

| Option | Where the assessment is computed | Cost | Why not |
|---|---|---|---|
| A — end of the `extract` step, a sub-product node like `positioned-text`, `spread-suggestions` and `font-profile` (`pdf-extraction.ts:116-163`) | During the page loop, from data already in memory; one pass | ~380 lines in `packages/pdf` + ~380 in `packages/pipeline` | **Chosen.** All v1 signals are geometry and counters the extractor already has; the node is wiped and re-created with the pages it describes (`clearExtractedData`). |
| B — a new `source-assessment` PIPELINE step after `image-cropping` | After the image passes, so it could record "the overlay was then pruned" | Same plus a step in `PIPELINE`, `STEP_ORDER`, the runner, Studio pills | Depends on LLM verdicts (non-deterministic, skippable), arrives minutes later, adds a pill users must learn. |
| C — computed on read, like `extractionWarning` today | Nothing stored | ~150 lines in the API | Loses history, repeats O(pages) work per request, no CLI parity, no step note. |

Decisions a reviewer must ratify: (1) option A; (2) the finding-kind list and severity
rules below; (3) the note on the `extract` step only when warnings or criticals exist;
(4) `text-layer-missing` stays as the after-Sectioning confirmation, not folded in; (5) no
"Mark checked" in v1.

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
  "text-unmapped-glyphs",    // glyphs dropped as ucs <= 0 or paragraphs that failed unicode decode
  "font-risk",               // Type3, no /ToUnicode, or non-embedded non-standard-14 font
  "script-mismatch",         // dominant Unicode script of the text ≠ editing_language's script
  // figures
  "raster-overlay-split",    // raster B ≥ 80 % inside raster A, area(B) ≤ 50 % area(A), A < 85 % of page
  "figure-render-holes",     // vector-rendered group whose crop box overlaps raster placements it does not contain
  "whole-page-figure",       // raster bounds ≥ 85 % of the page area
  "low-resolution-raster",   // nativeWidth / (bounds.width / 72) < 100 dpi, raster ≥ 1 in²
  "needs-convert-colorspace",// CMYK / Indexed / Separation / Lab sources converted on extraction
  "layered-artwork",         // blend mode, alpha < 1, clip or soft mask on a raster placement
  "image-decode-failed",     // every site that only console.warn'd before
  "duplicate-images",        // byte-identical hashes shared across pages ≥ 10 % of extracted images
  // document
  "page-geometry",           // size or orientation deviates > 2 % from the modal page; CropBox ≠ MediaBox; /Rotate ≠ 0
  "spreads-unmarked",        // spread-suggestions non-empty while spread mode is off
  "watermark-detected",      // signatures found while remove_watermarks is off
  "pdf-encrypted",           // document opened with a password requirement or restricted permissions
  "book-scale",              // > 300 pages or > 500 Mpx of raster data
  "shape-flood",             // > 1,500 vector shapes or > 60 rasters on one page
])
export const SourceSeverity = z.enum(["info", "warning", "critical"])
export const SourceReadiness = z.enum(["ready", "degraded", "poor"])
export const SourceHint = z.enum(["get-text-pdf", "reimport-figure-auto", "figure-cleanup", "mark-spreads", "normalise-pages", "none"])

export const SourceEvidenceRef = z.object({ pageId: z.string(), imageId: z.string().optional(), groupIndex: z.number().int().optional() })
export const SourceFinding = z.object({
  id: z.string(),                       // `${kind}` for a book-level finding, `${kind}:${pageId}` for a page-scoped one
  kind: SourceFindingKind,
  severity: SourceSeverity,
  pageIds: z.array(z.string()),         // sorted by page number
  params: z.record(z.union([z.number(), z.string(), z.boolean()])), // i18n placeholders: count, total, ratio, dpi, mode …
  evidence: z.array(SourceEvidenceRef).max(50),
  hint: SourceHint,
})
export const SourcePageRollup = z.object({
  pageId: z.string(), pageNumber: z.number().int(),
  textChars: z.number().int(), imageCount: z.number().int(),
  kinds: z.array(SourceFindingKind), severity: SourceSeverity.nullable(),
})
export const SourceAssessment = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  source: z.object({ producer: z.string().nullable(), format: z.string().nullable(), encryption: z.string().nullable(), totalPagesInPdf: z.number().int(), bytes: z.number().int() }),
  settings: z.object({ figureExtractionMode: FigureExtractionMode, removeWatermarks: z.boolean(), spreadMode: z.boolean(), startPage: z.number().int().nullable(), endPage: z.number().int().nullable() }),
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
`SOURCE_FINDING_KINDS`, `SOURCE_SEVERITY_ORDER`, `MIN_TEXT_LAYER_CHARS = 20` (moved here from
`extract-report.ts` so both agree). Severity rules and numeric thresholds live in
`packages/pipeline/src/source-assessment.ts` as exported constants:

| Kind | Severity | Hint |
|---|---|---|
| `text-layer-empty` (book-level, `pageIds` = empty pages) | critical when the empty ratio ≥ 0.8, warning ≥ 0.3, info otherwise | `get-text-pdf` |
| `ink-without-text`, `blank-page` (page) | info; `ink-without-text` raises `text-layer-empty` evidence | `none` |
| `text-unmapped-glyphs` (page) | warning > 2 % of glyphs, info otherwise | `get-text-pdf` |
| `font-risk` (book, `params.fonts`) | warning when a Type3 or no-ToUnicode font covers ≥ 200 chars; info for non-embedded | `get-text-pdf` |
| `script-mismatch` (book) | warning | `none` |
| `raster-overlay-split` (page, evidence `[A, B]`) | warning in `off` mode, info in `auto`/`all`; critical when B is drawn *under* A (hidden) | `reimport-figure-auto` in `off`, else `figure-cleanup` |
| `figure-render-holes` (page, evidence group + covered rasters) | warning | `figure-cleanup` |
| `whole-page-figure` (book) | warning when ≥ 25 % of pages, info otherwise | `figure-cleanup` |
| `low-resolution-raster`, `needs-convert-colorspace`, `layered-artwork` | info (thresholds frozen after E5) | `none` |
| `image-decode-failed` (page) | warning | `none` |
| `duplicate-images` (book) | info; warning ≥ 20 % | `none` |
| `page-geometry` (book, `pageIds` = deviating pages) | warning | `normalise-pages` |
| `spreads-unmarked` (book, `params.pairs`) | info | `mark-spreads` |
| `watermark-detected` | warning | `none` |
| `pdf-encrypted` | info (permissions) / critical (password needed) | `none` |
| `book-scale`, `shape-flood` | warning | `none` |

Readiness: any critical → `poor`; any warning → `degraded`; otherwise `ready`.

Heuristic kinds are reserved, not shipped, until their experiment freezes a threshold:
`text-like-structure` (row-projection line bands on a page with 0 chars: the strong "needs
text recovery" flag, E1), `outlined-text` (text drawn as paths, E2), `garbage-text` (PUA /
replacement characters, vowel ratio, E3), `crop-cuts-ink` (ink continuing just outside a
crop edge, E4). Adding one later is a one-line enum change plus its rule and message.

### Where it is computed: three layers, one pass each

- **A0 document** — `assessDocument(doc, bytes)` next to `extractPdfMetadata`
  (`extract.ts:852`, called at 346 and 391): `needsPassword` / `hasPermission`, page
  boxes and `/Rotate` from each page dict, a `/Resources/Font` walk (same `PDFObject` idiom as
  `extractFromXObjectDict`, `extract.ts:1936-1961`, including Form XObjects) for subtype,
  `FontFile*` and `ToUnicode`, raster pixel totals from XObject dicts without decoding, and
  watermark detection run always (`detectTextWatermarks`, applied only when enabled).
- **A page** — `ExtractedPage.sourceSignals` (transient, like `fontStats`) filled inside
  `extractPage` (`extract.ts:908-1039`) and `extractSpreadPage` (1699) from objects already
  in memory: non-whitespace char count; an unmapped-glyph counter returned by `collectGlyphs`;
  undecoded paragraphs; ink fraction and page-edge samples from the mupdf `Pixmap` before
  `asPNG()` (922), 4× downsampled, with the `rasterContentBboxOnPage` idiom (2224) — the
  edge samples let `samplePageEdges` (`pdf-extraction.ts:131`) stop decoding the PNG again;
  raster placements `{imageId, bounds, nativeWidth, nativeHeight, seqno, blendMode, alpha,
  clip, hasMask}` from `stampRasterPlacementsFromOps` (1236); colour-space class by calling
  `classifyImageColorSpace` (612) unconditionally; decode-failure counters at the five warn
  sites; vector groups `{imageId, groupIndex, bbox, renderMethod, overlappedRasterImageIds}`
  from the same data as `extractionDebug.groups`, where `overlappedRasterImageIds` is
  computed at the render decision (4033-4048) with `boxesOverlap` (3098) against the raster
  bounds, which are passed to grouping **for assessment only** even in `off` mode (grouping
  behaviour is unchanged).
- **B book** — pure `assessSource(input): SourceAssessment` in
  `packages/pipeline/src/source-assessment.ts`: hash aggregation across pages, page-size
  clustering, spread comparison with the `spread-suggestions` node, script histogram,
  profile, severities, readiness. `sourceAssessmentNote(a)` returns
  `"Completed — source assessment: N warning(s), M critical"` only when
  `counts.warning + counts.critical > 0`. `pdf-extraction.ts` writes the node after
  `font-profile` with `putNodeData` (a new version per run; `clearExtractedData` wipes it
  with the pages), then emits `step-complete` for `extract` with the note; the runner already
  persists step messages (`apps/api/src/services/stage-runner.ts:982`). The spreads re-apply
  route (`apps/api/src/routes/pages.ts:1284`) re-runs B after it rewrites the affected pages.

Determinism: `assessSource` is a pure function of its input with no provider import; the
same pages yield a deep-equal assessment.

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
  hint line. Hints link where a target exists: `mark-spreads` scrolls to `SpreadReview`;
  `figure-cleanup` opens the page detail of the first evidence page (SPEC-0020's entry
  point). `reimport-figure-auto`, `get-text-pdf` and `normalise-pages` are text only, since
  SPEC-0010 makes a changed source or setting a new book.
- `SummaryCard`, `SeverityLabel` and `FindingPageLinks` are lifted out of
  `components/validation/AccessibilityValidationTabs.tsx:35-186` into
  `components/validation/shared/` and reused.
- `lib/source-assessment-messages.ts`: `Record<SourceFindingKind, { title, description,
  hint }>` with Lingui `msg` descriptors and `params` placeholders; a unit test proves every
  enum member has an entry. New entries in all five `.po` catalogs.
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
- `packages/pdf`: `ExtractedPage.sourceSignals`, `assessDocument`, counters at the warn and
  drop sites, font and page-dict walk, raster bounds passed to grouping for assessment,
  pixmap ink pass that also returns edge samples.
- `packages/pipeline`: `source-assessment.ts`, `pdf-extraction.ts` (aggregate, write,
  note, drop the pngjs decode in `samplePageEdges`), `extract-report.ts`.
- `packages/storage`: none (`node_data` is generic; `clearExtractedData` already covers it).
- `apps/api`: route and test, `PageSummary`/`PageDetail`/`BookSummary`.
- `apps/studio`: panel, messages map, page badges, page detail, sidebar count, shared
  validation components, five catalogs.
- Docs: `docs/specs/INDEX.md`; `docs/ARCHITECTURE.md` Extract outputs list (with PR 3).
- Invariants: entity versioning (new version per run, never overwritten); the layer rule
  (Studio imports only constants from `@adt/types`). No new invariant, no migration, no new
  dependency.
- Concurrent work: SPEC-0010 (#886: list the node in the extraction inventory; it is wiped
  by `clearExtractedData` like every Extract output), SPEC-0020 (#993: hint target),
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
  `[body, overlay]`, severity `warning` and hint `reimport-figure-auto` under
  `figure_extraction_mode: off`, and severity `info` with hint `figure-cleanup` under
  `auto`; cuaderno3 `pg009` is flagged.
- [ ] AC-4: `figure-render-holes` is reported for cuaderno4 `pg012` with the `groupIndex` of
  `pg012_im012` and the covered raster image ids in evidence.
- [ ] AC-5: `whole-page-figure` is `warning` when ≥ 25 % of pages have a raster covering
  ≥ 85 % of the page, `info` below that, absent at 0 (synthetic bounds; the #901 image-only
  PNLD book when available).
- [ ] AC-6: `duplicate-images` is reported with `params.duplicates` and `params.extracted`
  when ≥ 10 % of extracted images share a hash across pages (qa784: 288 / 1,049) and is absent
  below 10 %.
- [ ] AC-7: `page-geometry` is reported when any page deviates > 2 % from the modal size,
  mixes orientation, has `/Rotate ≠ 0` or `CropBox ≠ MediaBox` (two-size fixture).
- [ ] AC-8: `spreads-unmarked` is reported iff `spread-suggestions` is non-empty and spread
  mode is off (cuaderno3 extracted in single-page mode).
- [ ] AC-9: `image-decode-failed` counts every former `console.warn` site; a fixture with
  one corrupt image XObject yields `params.count = 1` and extraction still completes.
- [ ] AC-10: `pdf-encrypted` is reported with a translated message on an encrypted fixture
  (critical when a password is required, info when only permissions are restricted) instead
  of an opaque open failure.
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
  description and hint, and page links that open `ExtractPageDetail`; every
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
  pre-spec run (same machine, three runs each).

## Test plan

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | integration | `packages/pipeline/src/__tests__/pdf-extraction.source-assessment.test.ts` | `AC-1: writes one valid source-assessment node per extract run` |
| AC-2 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-2: grades text-layer-empty by the empty-page ratio` |
| AC-3 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts`, `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-3: reports raster-overlay-split for nested rasters with mode-aware severity` |
| AC-4 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-4: reports figure-render-holes for a vector group over excluded rasters` |
| AC-5 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-5: reports whole-page-figure at 85 % page coverage` |
| AC-6 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-6: reports duplicate-images at 10 % shared hashes` |
| AC-7 | unit + integration | `packages/pipeline/src/__tests__/source-assessment.test.ts`, `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-7: reports page-geometry beyond 2 % deviation or rotation` |
| AC-8 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-8: reports spreads-unmarked only with suggestions and spread mode off` |
| AC-9 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-9: counts image decode failures without aborting extraction` |
| AC-10 | integration | `packages/pdf/src/__tests__/source-signals.test.ts` | `AC-10: reports pdf-encrypted on an encrypted fixture` |
| AC-11 | integration + browser | `apps/api/src/services/stage-runner.test.ts`, `apps/studio/src/components/pipeline/components/SubStepPillRow.test.tsx` | `AC-11: extract note appears only with warning or critical findings` |
| AC-12 | integration | `apps/api/src/routes/source-assessment.test.ts`, `apps/api/src/routes/pages.test.ts` | `AC-12: returns the latest assessment, nulls when absent, and page rollups` |
| AC-13 | unit | `packages/pipeline/src/__tests__/source-assessment.test.ts` | `AC-13: assessment is deterministic and provider-free` |
| AC-14 | unit + browser | `apps/studio/src/lib/source-assessment-messages.test.ts`, `apps/studio/src/components/pipeline/stages/extract/components/SourceQualityPanel.test.tsx` | `AC-14: every finding kind has a translated title, description and hint` |
| AC-15 | browser | `apps/studio/src/components/pipeline/stages/extract/ExtractView.source-assessment.test.tsx`, `apps/studio/src/components/pipeline/components/StageSidebar.test.tsx` | `AC-15: page badges and the sidebar count follow the assessment` |
| AC-16 | integration + browser | `apps/api/src/routes/stages.test.ts`, `apps/studio/src/components/pipeline/stages/extract/ExtractView.source-assessment.test.tsx` | `AC-16: poor readiness never disables run or export` |
| AC-17 | unit + integration | `packages/pipeline/src/__tests__/extract-report.test.ts` | `AC-17: extract-report prints persisted findings and sets the exit code` |
| AC-18 | corpus | `docs/verification/spec-0021.md` (recorded, not automated) | `AC-18: false-positive bound on prac_math_vol2 and extract wall time within +5 %` |

Fixtures: cuaderno4 pages 1, 6 and 12 and cuaderno3 page 9 extracted in the test (the
PDFs are local corpus files, listed in `docs/verification/spec-0021.md`, not committed);
synthetic PDFs from `packages/pdf/src/__tests__/create-test-pdf.ts` for fonts, a corrupt
image XObject, encryption and two page sizes; `tests/fixtures/raven.pdf` for AC-1.

## Rollout

No feature flag: the assessment is additive, free and deterministic, and an absent node
means no UI. Thresholds are exported constants so SPEC-0005 can tune them with corpus
evidence. Each PR is revertable on its own; reverting PR 3 removes the node and the note,
and every consumer tolerates its absence.

Implementation PRs (≤ 400 changed lines each, in dependency order):

1. `packages/types`: schema, constants, registry rows, `BookSummary` field (≈ 180).
2. `packages/pdf`: `sourceSignals`, `assessDocument`, counters at the warn and drop sites,
   font and page-dict walk, raster bounds for assessment, pixmap ink pass with edge
   samples; fixtures for AC-3, AC-4, AC-7, AC-9, AC-10 (≈ 380).
3. `packages/pipeline`: rules, aggregation, note, write in `pdf-extraction.ts`, the
   `samplePageEdges` decode removal; AC-1, AC-2, AC-5 to AC-8, AC-11, AC-13, AC-18 (≈ 380).
4. `apps/api`: route, payload fields, AC-12, AC-16 (≈ 250).
5. `apps/studio` a) shared validation components, messages map, catalogs (≈ 300);
   b) panel, page badges, page detail, sidebar; AC-14, AC-15 (≈ 400).
6. CLI: `extract-report` section, AC-17 (≈ 150; after #1009 merges).

Verification record: `docs/verification/spec-0021.md` with the corpus table (books,
findings, counts, wall time) before the status moves to `implemented`.

### Experiments scheduled by this spec (experiment lane, ≤ 2 weeks each, `docs/experiments/`)

| Exp | Question | Data | Freezes |
|---|---|---|---|
| E1 | `text-like-structure` precision and recall | qa784 (30 hand-labelled pages), cuaderno4 empty pages; PNLD pages as negatives | band height range, minimum bands, coefficient of variation |
| E2 | `outlined-text` thresholds | synthetic fixture via `create-test-pdf.ts`; any customer PDF with outlined text | fill count, row count |
| E3 | `garbage-text` bounds | FM Sinhala fixture before remapping (`fm-sinhala.test.ts`); PNLD and cuaderno text as negatives | vowel-ratio bounds, PUA rate |
| E4 | `crop-cuts-ink` thresholds | #901 crops (21 pages), cuaderno4 overlay bounds | band width, continuation ratio |
| E5 | effective-DPI, colour-space and layered-artwork distributions | every raster in the corpus | info/warning cut-offs |
| E6 | render-byte stability | 5 processes × 20 pages | whether `ExtractedImage.hash` and the LLM cache key should hash pixmap pixels instead of PNG bytes |
| E7 | deterministic-skip rules for meaningfulness (O1 below) | qa784 baseline verdicts | agreement floor (≥ 95 %), token saving (target −30 % calls) |
| E8 | stacked-raster composite audit (R-a below) | 30 random `raster-overlay-split` pairs across the corpus, manual review | default on or off |
| E9 | RAM and page limits for `book-scale` (#957) | a synthetic 500-page PDF, RSS over time | warning thresholds |

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

Optimisations the assessment enables:

- **O1** Deterministic verdicts skip the meaningfulness call: exact duplicates (#1011),
  small decorations repeated on ≥ 5 pages, standalones replaced by an R-a composite, a
  full-page raster on an image-only page (E7 gate).
- **O2** Downscale sub-images for classification (roadmap experiment).
- **O3** Stable render hashes (E6) for fewer cache misses.
- **O4** Bound `extraction-debug` (≤ 200 groups per page, ≤ 20 shapes per group, 0.1 pt
  rounding) and give it a zod schema and registry row — separate fast-lane PR.
- **O5** One pixel pass per page shared by `samplePageEdges`, the ink signals and crops.
- **O6** Compute `grayscaleStdDev` while the raster is still a pixmap so
  `classifyPageImages` skips a decode.
- **O7** Opt-in vision spot check on ≤ 5 flagged pages with the cheapest model, cached — v2.

## Open questions

1. Post-image-pass enrichment ("and the overlay was then pruned", "whole-page figure kept")
   as a read-time join against `image-filtering` in the API — yes or no. Owner:
   @gbergengruen, by spec approval.
2. Thresholds for `low-resolution-raster`, `text-unmapped-glyphs`, `whole-page-figure`
   (85 % / 25 %) are frozen after E5 and the corpus run in PR 3. Who signs off: the product
   reviewer of this spec.
3. Persisted acknowledgement ("Mark checked", a new node version with `acknowledgedAt`) —
   product call, not blocking.
4. `outlined-text` as a v1 proxy (0 chars plus a high `totalVectorShapes`) or wait for E2.
5. `BookSummary.sourceReadiness` in the books list — keep if the list benchmark (#996)
   holds, otherwise read on demand.
6. `spreads-unmarked` after the user marks spreads (a new book under SPEC-0010): stays with a
   "settings differ" note, or disappears.
7. R-a: fast lane or its own spec — triage.
