import { strToU8, unzipSync, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { previewAdtRecoveryImport } from "../preview.js"
import { makeCurrentBundleWithExternallyAddedPage, makeFixedLayoutBundle } from "./fixtures.js"

// The review says which font the imported book will use, the same one the
// import writes into the project (#1158).
describe("import preview book font", () => {
  it("names the font the import found", () => {
    const files = unzipSync(makeCurrentBundleWithExternallyAddedPage())
    files["assets/fonts.css"] = strToU8(
      "body, p, h1, h2, h3, h4, h5, h6, span, div, button, input, textarea, select {\n  font-family: 'Open Sans', 'Merriweather', sans-serif;\n}",
    )
    expect(previewAdtRecoveryImport(Buffer.from(zipSync(files))).bookFont)
      .toEqual({ family: "Open Sans", detected: true })
  })

  it("names the default when the book declares none", () => {
    expect(previewAdtRecoveryImport(makeCurrentBundleWithExternallyAddedPage()).bookFont)
      .toEqual({ family: "Merriweather", detected: false })
  })

  it("says nothing for a fixed-layout book, whose fonts are set per element", () => {
    expect(previewAdtRecoveryImport(makeFixedLayoutBundle()).bookFont).toBeUndefined()
  })
})
