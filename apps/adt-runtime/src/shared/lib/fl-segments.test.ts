import { describe, expect, it } from "vitest"

import { rebuildSegmentedInnerHtml } from "./fl-segments"

const MATH =
  '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mrow></mrow><mn>1,2</mn></msup></math>'

describe("rebuildSegmentedInnerHtml", () => {
  it("escapes prose so swapped text cannot inject markup", () => {
    const segments = JSON.stringify([{ text: "a < b & c" }])
    expect(rebuildSegmentedInnerHtml(segments, "x <strong>y</strong>")).toBe(
      "x &lt;strong&gt;y&lt;/strong&gt;",
    )
  })

  it("passes <br> through unescaped", () => {
    // A non-matching source forces the single-run fallback, where the swapped
    // text (carrying the <br>) is rendered directly.
    const segments = JSON.stringify([{ text: "source" }])
    expect(rebuildSegmentedInnerHtml(segments, "line one<br>line two")).toBe(
      "line one<br>line two",
    )
  })

  it("passes Temml <math> blocks through unescaped while escaping prose", () => {
    // sourceConcat won't match the math-bearing translatedHtml, so this hits
    // the single-run fallback — the exact path that surfaced literal MathML
    // tags on fixed-layout title pages.
    const segments = JSON.stringify([{ text: "Dong Xu1,2" }])
    const result = rebuildSegmentedInnerHtml(segments, `Dong Xu${MATH}`)

    expect(result).toContain(MATH)
    expect(result).not.toContain("&lt;math&gt;")
    expect(result.startsWith("Dong Xu<math")).toBe(true)
  })

  it("preserves per-segment styling around the math run", () => {
    const segments = JSON.stringify([
      { text: "Dong Xu1,2", style: { color: "rgb(0, 0, 0)" } },
    ])
    const result = rebuildSegmentedInnerHtml(segments, `Dong Xu${MATH}`)

    expect(result).toBe(`<span style="color:rgb(0, 0, 0)">Dong Xu${MATH}</span>`)
  })
})
