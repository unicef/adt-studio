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

  // Exports made before custom fonts kept the book font in assets/fonts.css,
  // with no rule in the pages: the requester's legacy workbook is one.
  const legacyFontsCss = `/* Apply the font globally */
body, p, h1, h2, h3, h4, h5, h6, span, div, button, input, textarea, select {
  font-family: 'Open Sans', 'Merriweather', sans-serif;
}`

  it("falls back to assets/fonts.css when no page declares a font", () => {
    expect(detectBundleReflowableFont([pageWith(null)], legacyFontsCss)).toBe("open-sans")
  })

  it("prefers the pages over fonts.css", () => {
    expect(detectBundleReflowableFont([pageWith("Roboto,sans-serif")], legacyFontsCss)).toBe("roboto")
  })

  // Today's fonts.css always declares the default, which says nothing about
  // the book: keep the font automatic.
  it("ignores the default font in fonts.css", () => {
    expect(detectBundleReflowableFont([pageWith(null)], legacyFontsCss.replace(
      "'Open Sans', 'Merriweather', sans-serif",
      '"Merriweather", serif',
    ))).toBeNull()
  })
})
