import { describe, it, expect } from "vitest"
import {
  BookFont,
  BookFontRegistry,
  bookFontIdFromName,
  bookFontsReferencedIn,
  classifyFontLicenseOpenSource,
} from "../book-fonts.js"

function registryWith(...families: string[]): BookFontRegistry {
  return {
    fonts: families.map((family) =>
      BookFont.parse({
        id: bookFontIdFromName(family),
        family,
        source: "upload",
        faces: [{ file: "f.woff2", format: "woff2" }],
      }),
    ),
  }
}

describe("bookFontIdFromName", () => {
  it("slugs family names", () => {
    expect(bookFontIdFromName("Minha Fonte Bold")).toBe("minha-fonte-bold")
  })

  it("strips font file extensions", () => {
    expect(bookFontIdFromName("MyFont-Regular.ttf")).toBe("myfont-regular")
  })

  it("falls back when nothing survives", () => {
    expect(bookFontIdFromName("***")).toBe("font")
  })
})

describe("bookFontsReferencedIn", () => {
  it("matches registry families in font-family declarations", () => {
    const html = `<p style="font-family:'Minha Fonte',serif">x</p>`
    const found = bookFontsReferencedIn(html, registryWith("Minha Fonte", "Outra"))
    expect(found.map((f) => f.family)).toEqual(["Minha Fonte"])
  })

  it("does not match family names in prose", () => {
    const html = `<p>Minha Fonte favorita</p>`
    expect(bookFontsReferencedIn(html, registryWith("Minha Fonte"))).toEqual([])
  })

  it("requires exact token match", () => {
    const html = `font-family: "Minha Fonte Display", sans-serif`
    expect(bookFontsReferencedIn(html, registryWith("Minha Fonte"))).toEqual([])
  })

  it("dedupes repeated references", () => {
    const html = `font-family:Solo; font-family: Solo, serif`
    expect(bookFontsReferencedIn(html, registryWith("Solo"))).toHaveLength(1)
  })
})

describe("classifyFontLicenseOpenSource", () => {
  it("recognizes open-source licenses", () => {
    expect(
      classifyFontLicenseOpenSource("Licensed under the SIL Open Font License 1.1"),
    ).toBe(true)
    expect(classifyFontLicenseOpenSource(undefined, "https://scripts.sil.org/OFL")).toBe(true)
    expect(classifyFontLicenseOpenSource("Apache License, Version 2.0")).toBe(true)
    expect(classifyFontLicenseOpenSource("Ubuntu Font Licence 1.0")).toBe(true)
  })

  it("recognizes restricted licenses", () => {
    expect(classifyFontLicenseOpenSource("Copyright 2020. All rights reserved.")).toBe(false)
    expect(classifyFontLicenseOpenSource("For personal use only")).toBe(false)
    expect(
      classifyFontLicenseOpenSource("This font may not be redistributed without permission"),
    ).toBe(false)
  })

  it("returns null when nothing is known", () => {
    expect(classifyFontLicenseOpenSource()).toBeNull()
    expect(classifyFontLicenseOpenSource("Designed by Someone in 2015")).toBeNull()
  })
})

describe("BookFont schema", () => {
  it("defaults role and lock", () => {
    const font = BookFont.parse({
      id: "x",
      family: "X",
      source: "google",
      googleKey: "x",
    })
    expect(font.role).toBe("unassigned")
    expect(font.roleLockedByUser).toBe(false)
    expect(font.faces).toEqual([])
  })
})
