/**
 * Book typography — the editable, deterministic type scale.
 *
 * A book's effective type scale is: its SAVED map (Fonts tab) if present, else
 * the DETECTED per-book scale (the PDF's own sizes, floored at 16px for
 * accessibility) so the book renders close to its original. The large
 * `DEFAULT_TYPOGRAPHY` is an opt-in "accessible" preset the user applies in the
 * editor, not the automatic default. `buildTypographyCss` turns the map into
 * CSS on the semantic `adt-*` classes, emitted inside `@layer components` so
 * the roles are the default everywhere while an explicit `text-*` utility
 * (utilities layer) on the same element still takes priority.
 */
import type { Storage } from "@adt/storage"
import { BookTypography, DEFAULT_TYPOGRAPHY, type TypeScale } from "@adt/types"
import { readTypeScale } from "./type-scale.js"

export const TYPOGRAPHY_NODE = "typography"
export const TYPOGRAPHY_ITEM = "book"

/** WCAG-recommended minimum body size; seeded sizes never fall below this. */
const MIN_ACCESSIBLE_PX = 16

// Fluid-type viewport range (px). Below MIN → mobile size; above MAX → desktop.
const FLUID_MIN_VW = 640
const FLUID_MAX_VW = 1280

/** Sensible unitless leading per role — tight for headings, roomy for body. */
function lineHeightFor(className: string): number {
  if (className === "adt-body") return 1.55
  if (className === "adt-caption") return 1.4
  return 1.2
}

/** A `clamp()` that scales from `mobilePx` (at 640px) to `desktopPx` (at 1280px). */
function clampFontSize(mobilePx: number, desktopPx: number): string {
  if (desktopPx <= mobilePx) return `${desktopPx}px`
  const slope = desktopPx - mobilePx
  const span = FLUID_MAX_VW - FLUID_MIN_VW
  const fluid = `calc(${mobilePx}px + ${slope} * ((100vw - ${FLUID_MIN_VW}px) / ${span}))`
  return `clamp(${mobilePx}px, ${fluid}, ${desktopPx}px)`
}

/** Map a detected PDF scale onto the editable typography styles. Sizes are
 *  flat (mobile = desktop — the PDF isn't responsive) and floored at 16px so
 *  the seeded book stays close to its original yet meets the a11y minimum. */
function typographyFromDetected(scale: TypeScale): BookTypography {
  const style = (key: string, label: string, className: string, px: number) => {
    const v = Math.max(MIN_ACCESSIBLE_PX, Math.round(px))
    return { key, label, className, desktopPx: v, mobilePx: v }
  }
  return {
    styles: [
      style("chapter_title", "Chapter title", "adt-h1", scale.h1Px),
      style("section_heading", "Section heading", "adt-h2", scale.h2Px),
      style("subheading", "Subheading", "adt-h3", scale.h3Px),
      style("body", "Body", "adt-body", scale.bodyPx),
      style("caption", "Caption", "adt-caption", scale.captionPx),
    ],
  }
}

/** The book's detected-scale typography (original PDF sizes, 16px-floored), or
 *  the accessible default when the book has no detectable text. This is the
 *  automatic default and the editor's "Reset to detected" target. */
export function resolveDetectedTypography(storage: Storage): BookTypography {
  const detected = readTypeScale(storage)
  return detected ? typographyFromDetected(detected) : DEFAULT_TYPOGRAPHY
}

/** The book's effective typography: the saved map if present, else the detected
 *  per-book scale (see {@link resolveDetectedTypography}). */
export function readTypography(storage: Storage): BookTypography {
  const row = storage.getLatestNodeData(TYPOGRAPHY_NODE, TYPOGRAPHY_ITEM)
  if (row?.data) {
    const parsed = BookTypography.safeParse(row.data)
    if (parsed.success && parsed.data.styles.length > 0) return parsed.data
  }
  return resolveDetectedTypography(storage)
}

/**
 * Render the typography map as raw CSS: one fluid `font-size` rule per semantic
 * class. Emitted inside `@layer components` — declared before `utilities` in
 * the compiled Tailwind output — so the role sizes apply by default but a
 * `text-*` utility on the same element overrides them, no `!important` needed.
 */
export function buildTypographyCss(typography: BookTypography): string {
  const rules = typography.styles.map((s) => {
    const weight = s.fontWeight ? ` font-weight: ${s.fontWeight};` : ""
    // Pin a unitless line-height too, so leading tracks the role's font-size
    // and a size override brings its own utility line-height along with it.
    return `.${s.className} { font-size: ${clampFontSize(s.mobilePx, s.desktopPx)}; line-height: ${lineHeightFor(s.className)};${weight} }`
  })
  return `
/* ── ADT book typography (editable, accessible type scale) ──
   Default size per role, applied via the semantic classes the renderer emits.
   Lives in @layer components so an explicit text-* utility (utilities layer)
   on the element keeps priority; fluid between the mobile and desktop targets
   via clamp(). Edit on the Fonts tab. */
@layer components {
${rules.join("\n")}

/* MathML sets its own vertical metrics. A prose line-height inherited from a
   surrounding role class (e.g. .adt-body at ${lineHeightFor("adt-body")}) squashes
   stacked <mtable> rows and fraction bars into each other, so reset it here and
   let the layout of columnar sums, long division, and fractions come out right. */
math, math * { line-height: normal; white-space: normal; font-family: initial; }
math mtable { line-height: normal; }
/* A wrapper carrying prose utilities (whitespace-pre-wrap, leading-*, font-mono)
   crushes MathML layout. Neutralise them for the math subtree regardless of what
   classes the renderer put on the wrapper. */
.whitespace-pre-wrap math, .whitespace-pre math, [class*="leading-"] math { line-height: normal; white-space: normal; }
/* Wide sums scroll instead of overflowing the reading column. */
math[display="block"] { display: block math; overflow-x: auto; max-width: 100%; }
}`.trim()
}

/** Convenience: read the map and render its CSS. */
export function resolveTypographyCss(storage: Storage): string {
  return buildTypographyCss(readTypography(storage))
}

/** The semantic size classes the type scale binds to. */
const TYPOGRAPHY_CLASSES = ["adt-h1", "adt-h2", "adt-h3", "adt-body", "adt-caption"] as const

function countClass(html: string, cls: string): number {
  return (html.match(new RegExp(`\\b${cls}\\b`, "g")) ?? []).length
}

/**
 * Deterministic guard for the visual-review loop: returns validation errors
 * when a revised section drops `adt-*` typography classes present in the
 * original, or introduces inline `font-size`. An empty array means typography
 * is intact. The review reviewer tends to "correct" the intentionally-large
 * accessible type back down by stripping these classes — rejecting such
 * revisions keeps the deterministic type scale regardless of the model.
 */
export function typographyPreservationErrors(original: string, candidate: string): string[] {
  const errors: string[] = []
  // Only guard sections that actually use the type scale. If the original has
  // no `adt-*` classes (e.g. template-rendered sections), there's nothing to
  // protect and added `text-*`/inline sizes are harmless.
  const originalTypoCount = TYPOGRAPHY_CLASSES.reduce((n, cls) => n + countClass(original, cls), 0)
  if (originalTypoCount === 0) return errors
  for (const cls of TYPOGRAPHY_CLASSES) {
    const before = countClass(original, cls)
    const after = countClass(candidate, cls)
    if (after < before) {
      errors.push(
        `Typography changed: the revision removed ${before - after} \`${cls}\` class(es). ` +
          "Keep EVERY `adt-*` class exactly as in the current HTML — the font size is fixed and must not be altered.",
      )
    }
  }
  const fsBefore = (original.match(/font-size\s*:/gi) ?? []).length
  const fsAfter = (candidate.match(/font-size\s*:/gi) ?? []).length
  if (fsAfter > fsBefore) {
    errors.push(
      "Typography changed: do not add inline `font-size` — font size is fixed by the book's `adt-*` classes.",
    )
  }
  // Also reject added Tailwind text-size utilities (text-xs…text-9xl, text-[..]).
  // A `text-*` utility outranks the role's @layer components size, so a
  // model-added one silently changes the deterministic scale; the model is
  // told not to emit these, so treat any newly-added one as a regression.
  const textSizeRe = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])\b/g
  const txtBefore = (original.match(textSizeRe) ?? []).length
  const txtAfter = (candidate.match(textSizeRe) ?? []).length
  if (txtAfter > txtBefore) {
    errors.push(
      "Typography changed: do not add `text-*` size utilities (text-sm … text-9xl) — size is fixed by the `adt-*` classes.",
    )
  }
  return errors
}
