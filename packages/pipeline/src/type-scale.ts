/**
 * Book-wide type scale — deterministic typography baseline.
 *
 * The extract step records the exact font size of every text run in the PDF.
 * PDFs generally reuse one size for body text and a small set of sizes for
 * headings, so we can derive a book-wide scale (body + heading tiers + caption)
 * from that data alone — no LLM, fully cacheable, inspectable.
 *
 * Rendering turns the scale into shared CSS tokens (`buildTypeScaleCss`) that
 * every page references. Consistency then comes from a single book-level
 * decision rather than each page independently re-deriving sizes in isolation.
 */
import type { Storage } from "@adt/storage"
import { PositionedTextOutput, TypeScale } from "@adt/types"
import type { PositionedTextOutput as PositionedText } from "@adt/types"

export const TYPE_SCALE_NODE = "type-scale"
export const TYPE_SCALE_ITEM = "book"

/** Histogram bucket width (px) — merges near-identical sizes (e.g. 10.98 / 11). */
const BUCKET_PX = 0.5

function bucket(px: number): number {
  return Math.round(px / BUCKET_PX) * BUCKET_PX
}

function round05(n: number): number {
  return Math.round(n * 2) / 2
}

/**
 * Tally character-weighted font sizes for a single page's positioned text.
 * Weighting by character count (not run count) keeps rare styled runs from
 * skewing the modal body size — the same approach extraction uses for the
 * serif/sans font profile.
 */
export function tallyFontSizes(pt: PositionedText): Map<number, number> {
  const hist = new Map<number, number>()
  for (const item of pt.drawItems) {
    if (item.kind !== "paragraph") continue
    for (const seg of item.segments) {
      const raw = seg.style?.["font-size"]
      if (!raw) continue
      const px = Number.parseFloat(raw)
      if (!Number.isFinite(px) || px <= 0) continue
      const weight = seg.text.length
      if (weight <= 0) continue
      const key = bucket(px)
      hist.set(key, (hist.get(key) ?? 0) + weight)
    }
  }
  return hist
}

/** Merge `src` character weights into `target` in place. */
export function mergeTallies(target: Map<number, number>, src: Map<number, number>): void {
  for (const [px, chars] of src) {
    target.set(px, (target.get(px) ?? 0) + chars)
  }
}

/** Fill up to three heading tiers, synthesising any missing tier from a
 *  modular ratio anchored to body so the classes always resolve and stay
 *  strictly ordered (h1 > h2 > h3 > body). */
function fillHeadingTiers(found: number[], bodyPx: number): [number, number, number] {
  const distinct = [...new Set(found.map(round05))].sort((a, b) => b - a)
  let h1 = distinct[0]
  let h2 = distinct[1]
  let h3 = distinct[2]
  if (h1 == null) h1 = round05(bodyPx * 1.6)
  if (h2 == null) h2 = round05((h1 + bodyPx) / 2)
  if (h3 == null) h3 = round05((h2 + bodyPx) / 2)
  h3 = Math.max(h3, bodyPx + 0.5)
  h2 = Math.max(h2, h3 + 0.5)
  h1 = Math.max(h1, h2 + 0.5)
  return [h1, h2, h3]
}

/** Derive the scale from an accumulated character-weighted size histogram. */
export function deriveTypeScaleFromHistogram(hist: Map<number, number>): TypeScale | null {
  const entries = [...hist.entries()]
    .map(([px, chars]) => ({ px, chars }))
    .filter((e) => e.chars > 0)
  if (entries.length === 0) return null

  const totalChars = entries.reduce((s, e) => s + e.chars, 0)

  // Body = modal size by character weight. On ties, prefer the smaller size
  // (body text is usually the smallest of the high-frequency sizes).
  const body = entries.reduce((best, e) =>
    e.chars > best.chars || (e.chars === best.chars && e.px < best.px) ? e : best
  )
  const bodyPx = body.px

  // Ignore noise — sizes that barely appear are likely stray glyphs / artefacts.
  const minChars = Math.max(12, totalChars * 0.002)

  const headings = entries
    .filter((e) => e.px >= bodyPx * 1.1 && e.chars >= minChars)
    .map((e) => e.px)
  const [h1Px, h2Px, h3Px] = fillHeadingTiers(headings, bodyPx)

  const belowBody = entries
    .filter((e) => e.px <= bodyPx * 0.9 && e.chars >= minChars)
    .sort((a, b) => b.chars - a.chars)
  const captionRaw = belowBody.length > 0 ? belowBody[0].px : bodyPx * 0.8

  return {
    bodyPx: round05(bodyPx),
    h1Px,
    h2Px,
    h3Px,
    captionPx: round05(Math.min(captionRaw, bodyPx - 0.5)),
    sampleChars: totalChars,
    observed: entries.sort((a, b) => b.px - a.px),
  }
}

/** Derive the scale from a set of pages' positioned text (convenience for tests
 *  and the lazy fallback path). */
export function deriveTypeScale(pages: PositionedText[]): TypeScale | null {
  const hist = new Map<number, number>()
  for (const pt of pages) mergeTallies(hist, tallyFontSizes(pt))
  return deriveTypeScaleFromHistogram(hist)
}

/**
 * Read the book's detected type scale (a hint/seed for the typography editor —
 * it does NOT drive rendered sizes; see ./typography.ts). Prefers the node
 * written at extract time; falls back to deriving it on the fly from stored
 * positioned-text. Returns null when the book has no extractable text.
 */
export function readTypeScale(storage: Storage): TypeScale | null {
  const row = storage.getLatestNodeData(TYPE_SCALE_NODE, TYPE_SCALE_ITEM)
  if (row?.data) {
    const parsed = TypeScale.safeParse(row.data)
    if (parsed.success) return parsed.data
  }
  const hist = new Map<number, number>()
  for (const page of storage.getPages()) {
    const ptRow = storage.getLatestNodeData("positioned-text", page.pageId)
    if (!ptRow?.data) continue
    const parsed = PositionedTextOutput.safeParse(ptRow.data)
    if (parsed.success) mergeTallies(hist, tallyFontSizes(parsed.data))
  }
  return deriveTypeScaleFromHistogram(hist)
}
