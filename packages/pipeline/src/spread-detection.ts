/**
 * Geometric spread detection by seam continuity.
 *
 * A two-page spread is one illustration printed across two facing pages, so the
 * right edge of the left page continues into the left edge of the right page.
 * Comparing those edge strips separates a real spread from two unrelated pages.
 *
 * Matching brightness alone is too loose — two facing pages that merely share a
 * flat or gradient background also "match". So a pair is flagged only when
 * three signals agree:
 *   1. Detail — both edges carry real structure (Laplacian energy), which
 *      rejects flat and linear-gradient backgrounds.
 *   2. Value match — the pixels are close (same colours across the seam).
 *   3. Structure match — the strips correlate (the same shapes continue).
 *
 * Pure function over edge samples; the caller renders each page and samples a
 * strip of grayscale values (0..255, top→bottom) down its left and right edges.
 * No LLM.
 */

export interface SpreadEdgeSample {
  /** 1-indexed physical page number. */
  pageNumber: number
  /** Grayscale samples down the page's left edge, top→bottom (0..255). */
  leftEdge: number[]
  /** Grayscale samples down the page's right edge, top→bottom (0..255). */
  rightEdge: number[]
  /** Length of the page's extracted text. Text-heavy pages aren't spread art —
   *  two facing text pages share a baseline grid and would otherwise correlate. */
  textLength: number
}

export interface SpreadSuggestion {
  /** 1-indexed left page of the facing pair (merges with lead + 1). */
  lead: number
  /** 0..1 — how strongly the seam reads as one continuous illustration. */
  confidence: number
}

export interface SpreadDetectionOptions {
  /** Combined value×structure score required to flag a pair. */
  minScore?: number
  /**
   * Minimum edge detail (mean Laplacian magnitude) required on both sides.
   * Flat and linear-gradient backgrounds score ~0 and are rejected.
   */
  minDetail?: number
  /** Pages with more extracted text than this are treated as text pages, not
   *  spread art, and never paired. */
  maxTextLength?: number
}

const DEFAULTS: Required<SpreadDetectionOptions> = {
  minScore: 0.7,
  minDetail: 3,
  maxTextLength: 140,
}

/** Mean magnitude of the discrete second difference — high for edges/texture,
 *  ~0 for flat regions and linear gradients. */
function detail(s: number[]): number {
  if (s.length < 3) return 0
  let sum = 0
  for (let i = 1; i < s.length - 1; i++) sum += Math.abs(s[i - 1] - 2 * s[i] + s[i + 1])
  return sum / (s.length - 2)
}

/** Pearson correlation (−1..1); 0 when either strip is constant. */
function correlation(a: number[], b: number[]): number {
  const n = a.length
  if (n === 0 || b.length !== n) return 0
  let sa = 0
  let sb = 0
  for (let i = 0; i < n; i++) {
    sa += a[i]
    sb += b[i]
  }
  const ma = sa / n
  const mb = sb / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  if (da === 0 || db === 0) return 0
  return num / Math.sqrt(da * db)
}

/** 0..1 — how close the raw values are across the seam. */
function valueMatch(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return 1 - sum / a.length / 255
}

/**
 * Suggest likely spreads from per-page edge samples. Every adjacent pair is
 * scored; overlapping candidates (a page can't belong to two spreads) are
 * resolved greedily by confidence. Returned sorted by confidence.
 */
export function detectSpreads(
  pages: SpreadEdgeSample[],
  options: SpreadDetectionOptions = {},
): SpreadSuggestion[] {
  const o = { ...DEFAULTS, ...options }
  if (pages.length < 2) return []

  const byNumber = new Map<number, SpreadEdgeSample>()
  for (const p of pages) byNumber.set(p.pageNumber, p)
  const last = Math.max(...pages.map((p) => p.pageNumber))
  const first = Math.min(...pages.map((p) => p.pageNumber))

  const candidates: SpreadSuggestion[] = []
  for (let lead = first; lead + 1 <= last; lead++) {
    const left = byNumber.get(lead)
    const right = byNumber.get(lead + 1)
    if (!left || !right) continue
    if (left.textLength > o.maxTextLength || right.textLength > o.maxTextLength) continue

    const a = left.rightEdge
    const b = right.leftEdge
    if (detail(a) < o.minDetail || detail(b) < o.minDetail) continue

    const score = valueMatch(a, b) * ((correlation(a, b) + 1) / 2)
    if (score >= o.minScore) candidates.push({ lead, confidence: score })
  }

  candidates.sort((x, y) => y.confidence - x.confidence)
  const consumed = new Set<number>()
  const chosen: SpreadSuggestion[] = []
  for (const c of candidates) {
    if (consumed.has(c.lead) || consumed.has(c.lead + 1)) continue
    consumed.add(c.lead)
    consumed.add(c.lead + 1)
    chosen.push(c)
  }

  return chosen.sort((x, y) => y.confidence - x.confidence)
}
