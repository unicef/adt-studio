import { describe, it, expect } from "vitest"
import type { PositionedTextOutput } from "@adt/types"
import { TypeScale } from "@adt/types"
import { deriveTypeScale } from "../type-scale.js"

/** Build a positioned-text page from a list of (fontSizePx, charCount) runs. */
function page(runs: Array<{ px: number; chars: number }>): PositionedTextOutput {
  return {
    drawItems: runs.map((r, i) => ({
      kind: "paragraph" as const,
      textId: `t${i}`,
      top: 0,
      left: 0,
      lineHeight: r.px,
      segments: [{ text: "x".repeat(r.chars), style: { "font-size": `${r.px}px` } }],
      text: "x".repeat(r.chars),
    })),
    pageWidth: 100,
    pageHeight: 100,
    renderWidth: 200,
    renderHeight: 200,
  }
}

describe("deriveTypeScale", () => {
  it("returns null when there is no text", () => {
    expect(deriveTypeScale([])).toBeNull()
    expect(deriveTypeScale([page([])])).toBeNull()
  })

  it("picks the character-dominant size as body and larger sizes as headings", () => {
    const scale = deriveTypeScale([
      page([
        { px: 12, chars: 1000 }, // body — most characters
        { px: 24, chars: 120 }, // h1
        { px: 18, chars: 60 }, // h2
        { px: 9, chars: 50 }, // caption
      ]),
    ])
    expect(scale).not.toBeNull()
    expect(scale!.bodyPx).toBe(12)
    expect(scale!.h1Px).toBe(24)
    expect(scale!.h2Px).toBe(18)
    expect(scale!.captionPx).toBe(9)
    // Strict ordering always holds so the classes never collide.
    expect(scale!.h1Px).toBeGreaterThan(scale!.h2Px)
    expect(scale!.h2Px).toBeGreaterThan(scale!.h3Px)
    expect(scale!.h3Px).toBeGreaterThan(scale!.bodyPx)
    expect(scale!.captionPx).toBeLessThan(scale!.bodyPx)
    // Output conforms to the shared schema.
    expect(TypeScale.safeParse(scale).success).toBe(true)
  })

  it("synthesises heading tiers when the PDF has only body text", () => {
    const scale = deriveTypeScale([page([{ px: 11, chars: 500 }])])
    expect(scale!.bodyPx).toBe(11)
    expect(scale!.h1Px).toBeGreaterThan(scale!.h2Px)
    expect(scale!.h2Px).toBeGreaterThan(scale!.h3Px)
    expect(scale!.h3Px).toBeGreaterThan(11)
    expect(scale!.captionPx).toBeLessThan(11)
  })

  it("merges near-identical sizes and weights by character count", () => {
    // 10.98 and 11.0 should bucket together and dominate over the larger size.
    const scale = deriveTypeScale([
      page([
        { px: 10.98, chars: 400 },
        { px: 11.0, chars: 400 },
        { px: 22, chars: 30 },
      ]),
    ])
    expect(scale!.bodyPx).toBe(11)
  })

  it("ignores images and runs without a font-size", () => {
    const pt: PositionedTextOutput = {
      drawItems: [
        { kind: "image", imageId: "img1", bounds: { x: 0, y: 0, width: 10, height: 10 } },
        {
          kind: "paragraph",
          textId: "t0",
          top: 0,
          left: 0,
          lineHeight: 13,
          segments: [
            { text: "styled", style: { "font-size": "13px" } },
            { text: "unstyled" }, // no style → skipped
          ],
          text: "styledunstyled",
        },
      ],
      pageWidth: 100,
      pageHeight: 100,
      renderWidth: 200,
      renderHeight: 200,
    }
    const scale = deriveTypeScale([pt])
    expect(scale!.bodyPx).toBe(13)
  })
})
