import { describe, expect, it } from "vitest"

import {
  detectBundleReflowableFont,
  reflowableBodyFontStyle,
} from "../adt-round-trip/font.js"

const pageWith = (chain: string | null) => `<!doctype html><html><head>
  <link rel="stylesheet" href="./assets/fonts.css">${chain ? reflowableBodyFontStyle(chain) : ""}
</head><body><main id="content"><section data-section-id="pg001_sec001"></section></main></body></html>`

// #1158: the exporter writes the book font as an inline style in every page's
// head; fonts.css always says Merriweather.
describe("detectBundleReflowableFont", () => {
  it("reads back the approved font the exporter wrote", () => {
    expect(detectBundleReflowableFont([
      pageWith("'Open Sans',Atkinson Hyperlegible,sans-serif"),
      pageWith("'Open Sans',Atkinson Hyperlegible,sans-serif"),
    ])).toBe("open-sans")
  })

  it("matches the family regardless of quotes and case", () => {
    expect(detectBundleReflowableFont([pageWith('"pt serif", serif')])).toBe("pt-serif")
  })

  it("takes the font most pages declare", () => {
    expect(detectBundleReflowableFont([
      pageWith("Lexend,sans-serif"),
      pageWith("Roboto,sans-serif"),
      pageWith("Roboto,sans-serif"),
      pageWith(null),
    ])).toBe("roboto")
  })

  it("returns null when no page declares a font (the Merriweather default)", () => {
    expect(detectBundleReflowableFont([pageWith(null)])).toBeNull()
  })

  it("returns null for a family outside the approved reflowable fonts", () => {
    expect(detectBundleReflowableFont([pageWith("'Mouse Memoirs',serif")])).toBeNull()
  })
})
