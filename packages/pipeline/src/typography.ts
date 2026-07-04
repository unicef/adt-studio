/**
 * Book typography — the editable, deterministic type scale.
 *
 * Sizes live in an editable `BookTypography` map (Fonts tab), NOT derived from
 * the PDF. `buildTypographyCss` turns the map into CSS on the semantic `adt-*`
 * classes the renderer emits; it is appended unlayered after Tailwind so it
 * wins over any `text-*` utility, making text size deterministic and identical
 * across every page regardless of what the generation model chose. Sizes scale
 * fluidly between the mobile floor and desktop target via `clamp()`.
 *
 * The detected `type-scale` (see ./type-scale.ts) is kept only as a hint/seed
 * for the editor — it no longer drives rendered sizes.
 */
import type { Storage } from "@adt/storage"
import { BookTypography, DEFAULT_TYPOGRAPHY } from "@adt/types"

export const TYPOGRAPHY_NODE = "typography"
export const TYPOGRAPHY_ITEM = "book"

// Fluid-type viewport range (px). Below MIN → mobile size; above MAX → desktop.
const FLUID_MIN_VW = 640
const FLUID_MAX_VW = 1280

/** A `clamp()` that scales from `mobilePx` (at 640px) to `desktopPx` (at 1280px). */
function clampFontSize(mobilePx: number, desktopPx: number): string {
  if (desktopPx <= mobilePx) return `${desktopPx}px`
  const slope = desktopPx - mobilePx
  const span = FLUID_MAX_VW - FLUID_MIN_VW
  const fluid = `calc(${mobilePx}px + ${slope} * ((100vw - ${FLUID_MIN_VW}px) / ${span}))`
  return `clamp(${mobilePx}px, ${fluid}, ${desktopPx}px)`
}

/** Read the book's typography, falling back to accessible defaults. */
export function readTypography(storage: Storage): BookTypography {
  const row = storage.getLatestNodeData(TYPOGRAPHY_NODE, TYPOGRAPHY_ITEM)
  if (row?.data) {
    const parsed = BookTypography.safeParse(row.data)
    if (parsed.success && parsed.data.styles.length > 0) return parsed.data
  }
  return DEFAULT_TYPOGRAPHY
}

/**
 * Render the typography map as raw CSS: one fluid `font-size` rule per semantic
 * class. Appended AFTER (and outside) Tailwind's `@layer` output so these
 * unlayered rules win over `text-*` utilities — the size is pinned per role.
 */
export function buildTypographyCss(typography: BookTypography): string {
  const rules = typography.styles.map((s) => {
    const weight = s.fontWeight ? ` font-weight: ${s.fontWeight};` : ""
    return `.${s.className} { font-size: ${clampFontSize(s.mobilePx, s.desktopPx)};${weight} }`
  })
  return `
/* ── ADT book typography (editable, accessible type scale) ──
   Fixed size per role, applied via the semantic classes the renderer emits.
   Unlayered so these win over any Tailwind text-* utility; fluid between the
   mobile and desktop targets via clamp(). Edit on the Fonts tab. */
${rules.join("\n")}`.trim()
}

/** Convenience: read the map and render its CSS. */
export function resolveTypographyCss(storage: Storage): string {
  return buildTypographyCss(readTypography(storage))
}
