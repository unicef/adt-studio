import { describe, it, expect } from "vitest"
import { detectSpreads, type SpreadEdgeSample } from "../spread-detection.js"

const N = 48

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v))
}

/** A strip with real high-frequency structure (nonzero Laplacian). */
function textured(phase: number, freq = 0.55): number[] {
  return Array.from({ length: N }, (_, i) =>
    clamp(128 + 90 * Math.sin((i + phase) * freq) + 40 * Math.sin((i + phase) * 1.9)),
  )
}

/** A flat margin (no detail). */
function blank(): number[] {
  return Array.from({ length: N }, () => 252)
}

/** A linear gradient — matches across a seam but carries no real content. */
function ramp(seed: number): number[] {
  return Array.from({ length: N }, (_, i) => clamp(seed + i * 3))
}

function page(
  pageNumber: number,
  leftEdge: number[],
  rightEdge: number[],
  textLength = 0,
): SpreadEdgeSample {
  return { pageNumber, leftEdge, rightEdge, textLength }
}

describe("detectSpreads (seam continuity)", () => {
  it("flags a pair whose textured seam continues", () => {
    const seam = textured(0)
    const pages = [
      page(1, blank(), blank()),
      page(2, textured(30), seam),
      page(3, seam, textured(60)),
      page(4, textured(90), textured(120)),
    ]
    const result = detectSpreads(pages)
    expect(result.map((s) => s.lead)).toEqual([2])
    expect(result[0].confidence).toBeGreaterThan(0.9)
  })

  it("does NOT flag facing pages that merely share a gradient background", () => {
    const bg = ramp(40)
    const pages = [page(1, ramp(200), bg), page(2, bg, ramp(90))]
    expect(detectSpreads(pages)).toEqual([])
  })

  it("does NOT flag two facing text pages (matching baseline grid)", () => {
    // Text pages share a line rhythm, so their edges correlate — but the text
    // guard rejects them.
    const grid = textured(0, 0.8)
    const pages = [
      page(1, blank(), blank()),
      page(2, textured(30), grid, 900),
      page(3, grid, textured(60), 850),
    ]
    expect(detectSpreads(pages)).toEqual([])
  })

  it("does NOT flag flat/blank seams", () => {
    const pages = [page(1, blank(), blank()), page(2, blank(), blank())]
    expect(detectSpreads(pages)).toEqual([])
  })

  it("does NOT flag textured but unrelated neighbours", () => {
    const pages = [
      page(1, textured(0), textured(11, 0.9)),
      page(2, textured(200, 0.3), textured(7, 1.3)),
      page(3, textured(50, 0.7), textured(90)),
    ]
    expect(detectSpreads(pages)).toEqual([])
  })

  it("detects multiple spreads and resolves overlaps greedily", () => {
    const seamA = textured(5)
    const seamB = textured(140, 0.8)
    const pages = [
      page(1, blank(), blank()),
      page(2, textured(30), seamA),
      page(3, seamA, textured(70)),
      page(4, textured(15), seamB),
      page(5, seamB, textured(80)),
    ]
    const result = detectSpreads(pages)
    expect(result.map((s) => s.lead).sort((a, b) => a - b)).toEqual([2, 4])
  })

  it("returns nothing for a single page", () => {
    expect(detectSpreads([page(1, textured(1), textured(2))])).toEqual([])
  })
})
