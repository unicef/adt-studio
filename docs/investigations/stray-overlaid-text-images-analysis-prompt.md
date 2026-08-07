# Investigation prompt: stray images with overlaid text during extraction

You are investigating a content-quality issue in ADT Studio's extraction
pipeline. **Analyze and diagnose only — do NOT implement a fix yet.** Produce a
written root-cause analysis and a set of fix options with trade-offs.

## Observed problem

On some books, extraction produces "stray" images that are really just **text
rendered as a raster** — callout boxes, exercise cards, decorative title/header
bands, and question snippets. These are not genuine figures. They duplicate text
that already exists as reflowable text, get offered to sectioning as placeable
images, and render as PNGs in the output, cluttering the page and sometimes
displacing or mislabelling real content.

## Leads to verify (do not assume — confirm in the code)

1. **The Figure Extraction toggle is the suspected root cause.**
   - Config key `vector_text_grouping` (`packages/types/src/config.ts`), part of the
     extraction fingerprint.
   - Surfaced in the creation wizard as `figureExtraction`
     (`apps/studio/src/components/wizard/bookCreationConfig.ts`,
     `constants.ts`, `step3ContentProcessing/`).
   - When ON it "include[s] text shapes in vector grouping to produce raster crops
     of vectors with text overlays" (`packages/pdf/src/extract.ts` — search
     `vectorTextGrouping`, `extractVectorImagesFromSvg`, `renderShapeGroup`,
     `textShapes`).
2. **Default/recommendation mismatch.** The wizard *form* default is `false`
   (`wizardForm.ts`) but presets/recommendations set it `true` (`constants.ts`) and
   the code paths default `true` (`extract.ts`, `apps/api/src/routes/pages.ts`,
   `apps/api/src/services/stage-runner.ts`). Confirm what a typical user actually
   gets, and for which book types.
3. **No OCR anywhere.** Page text comes from the PDF structured-text layer
   (`page.toStructuredText()`), not OCR. For text-layer PDFs the figure text is
   *duplicated* (in `page.text` AND baked into the PNG); for pixel-only content it
   is not. Confirm.
4. **Downstream pruning drops content.** Pruned images are removed from the
   sectioning input and from rendering (`packages/pipeline/src/pipeline-dag.ts`,
   the `page-sectioning` and `web-rendering` executors — search `isPruned`,
   `availableImages`, `unprunedImageIds`). So any prune of a pixel-only region
   silently drops that content.

## Questions to answer

1. **Where exactly** do these stray text-overlay images get created? Which code
   path decides that a group of text shapes becomes a rendered raster figure, and
   what conditions trigger it? Is there already logic that should have excluded
   text-dominated groups (e.g. the restyle pass that folds hand-lettered vector
   paint into the duplicate selectable text run)?
2. **Is the toggle default/recommendation wrong** for the affected book types, or
   is the grouping logic itself too eager even when the toggle is legitimately on?
3. **What content, if any, is lost** today vs merely duplicated? Distinguish the
   text-layer case (safe to drop) from the pixel-only case (unsafe).
4. Enumerate **fix options** with trade-offs, e.g.:
   - Change the `figureExtraction` / `vector_text_grouping` default and/or preset
     recommendations (which book types → which default?).
   - Make grouping text-aware: don't emit a figure crop when a candidate group is
     dominated by text shapes that already have a faithful selectable-text
     duplicate.
   - A downstream meaningfulness/prune guard that never drops content lacking a
     text-layer copy.
   - Any combination, staged.
5. Give a **recommendation** and the smallest safe first step, plus how to verify
   it (repro book with the toggle on; a scanned/pixel-only page that must NOT lose
   content).

## Constraints

- Cite concrete files and line numbers for every claim.
- Follow the repo's 6 core principles (esp. Maximum Transparency and
  entity-level versioning) — no black-box heuristics.
- Deliverable is an analysis document + fix options. Do not edit pipeline code or
  prompts in this pass.

## Context

Prior notes and the earlier writeup are in
`.context/stray-overlaid-text-images-issue.md`. A previously-considered band-aid
(marking text-only images as "not meaningful" in `prompts/image_meaningfulness.liquid`)
was intentionally **not** taken, because it acts downstream of the root cause and
risks over-pruning pixel-only content.
