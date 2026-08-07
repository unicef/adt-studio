# Stray images with overlaid text created during extraction (figure-extraction / `vector_text_grouping`)

## Summary

Some pages produce "stray" extracted images that are really just **text rendered
as a raster** — callout boxes, exercise cards, decorative title/header bands, and
question snippets. These are not genuine figures. They duplicate text that already
exists as reflowable text, get offered to sectioning as placeable images, and are
rendered as PNGs in the output, cluttering the page and occasionally displacing or
mislabelling real content.

## Root-cause hypothesis — the Figure Extraction toggle

The extractor has a **"Figure Extraction"** toggle, wired as follows:

- Config key: `vector_text_grouping` (`packages/types/src/config.ts:249`), part of the
  extraction fingerprint (affects caching).
- Wizard field: `figureExtraction` → `vector_text_grouping`
  (`apps/studio/src/components/wizard/bookCreationConfig.ts:24`).
- Behaviour when ON: "include text shapes in vector grouping to **produce raster
  crops of vectors with text overlays**" (`packages/pdf/src/extract.ts:59`). This is
  exactly the mechanism that turns text blocks into stray images.

Why users end up with it ON when it should be OFF:

- The wizard **form default is `false`** (`apps/studio/src/components/wizard/wizardForm.ts:31`),
  but **presets/recommendations set it `true`** (`constants.ts:189`, `constants.ts:461`)
  and the UI shows a "recommended" badge (`step3ContentProcessing/index.tsx:160`).
- The extraction code paths also **default to `true`** (`extract.ts:257`,
  `apps/api/src/routes/pages.ts:1031` uses `!== false`).

So on text-heavy books, the recommended/default-on Figure Extraction bakes text
blocks into figure PNGs.

## Downstream impact

- Extracted images that are not pruned flow through image-meaningfulness →
  image-cropping → and are offered to `page-sectioning` as `availableImages`
  (`packages/pipeline/src/pipeline-dag.ts:485-491`) and to web-rendering
  (`576-578`).
- There is **no OCR** anywhere in the pipeline. For text-layer PDFs the text is
  *duplicated* (present both in `page.text` from `toStructuredText()` and baked into
  the figure PNG), so pruning the figure is safe. But **pixel-only** content (a
  genuinely scanned snippet with no text layer) has no textual copy — pruning it
  drops the content entirely.

## Mitigation included on this branch (band-aid)

`prompts/image_meaningfulness.liquid` rules 8–10: mark images that are primarily
text / text-in-a-box / scanned exercise snippets / decorative title boxes as NOT
meaningful, so they are pruned after extraction.

Caveat: this is downstream of the root cause — it suppresses stray images *after*
they are created, and (because there is no OCR fallback) it risks **over-pruning
pixel-only content** on scanned/mixed pages. Treat it as interim.

## Proposed real fix (to evaluate)

1. **Revisit the `figureExtraction` / `vector_text_grouping` default and preset
   recommendations.** Should it default OFF for text-heavy book types and only be
   recommended ON for figure-heavy / hand-lettered content?
2. **Make grouping text-aware:** do not emit a figure crop when a candidate group is
   dominated by text shapes that already have a faithful selectable-text duplicate
   (the extractor already restyles hand-lettered vector paint into the duplicate
   selectable run — see `extract.ts` restyle logic).
3. **Guard the meaningfulness prune** so it never drops content lacking a text-layer
   copy (pixel-only), avoiding silent loss on scanned/mixed pages.

## Testing notes

- Reproduce on a text-heavy book with Figure Extraction ON → confirm stray
  text-overlay images appear as extracted images.
- Confirm the meaningfulness change prunes them and the page still reads correctly
  (text present via `page.text`).
- Verify a scanned / pixel-only exercise page does **not** lose content after
  pruning.
