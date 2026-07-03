import { describe, it, expect } from "vitest"
import {
  GOOGLE_FONTS,
  resolveGoogleFont,
  googleFontsCss2Url,
  googleFontsReferencedIn,
  cssQuoteFamily,
  normalizeFontKey,
} from "../google-fonts.js"

describe("resolveGoogleFont", () => {
  it("matches a known font regardless of spacing/case/suffix", () => {
    expect(resolveGoogleFont("MouseMemoirs")?.family).toBe("Mouse Memoirs")
    expect(resolveGoogleFont("Mouse Memoirs")?.family).toBe("Mouse Memoirs")
    expect(resolveGoogleFont("MOUSEMEMOIRS-Regular")?.family).toBe("Mouse Memoirs")
  })

  it("matches the first token of a css font-family chain, unquoted", () => {
    expect(resolveGoogleFont(`"Mouse Memoirs",Merriweather,serif`)?.family).toBe(
      "Mouse Memoirs",
    )
  })

  it("strips a PDF subset prefix before matching", () => {
    expect(resolveGoogleFont("ABCDEF+MouseMemoirs")?.family).toBe("Mouse Memoirs")
  })

  it("returns null for empty input", () => {
    expect(resolveGoogleFont("")).toBeNull()
  })

  it("maps well-known proprietary/system fonts to close Google families", () => {
    expect(resolveGoogleFont("Arial")?.family).toBe("Arimo")
    expect(resolveGoogleFont("Helvetica")?.family).toBe("Arimo")
    expect(resolveGoogleFont("TimesNewRomanPSMT")?.family).toBe("Tinos")
    expect(resolveGoogleFont("Times New Roman")?.family).toBe("Tinos")
    expect(resolveGoogleFont("CourierNew")?.family).toBe("Cousine")
    expect(resolveGoogleFont("Calibri")?.family).toBe("Carlito")
    expect(resolveGoogleFont("Cambria")?.family).toBe("Caladea")
    expect(resolveGoogleFont("Georgia")?.family).toBe("Gelasio")
    expect(resolveGoogleFont("ComicSansMS")?.family).toBe("Comic Neue")
  })

  it("falls back to a category close-match for unrecognized sans/mono/script", () => {
    expect(resolveGoogleFont("FuturaBT")?.family).toBe("Arimo") // sans token
    expect(resolveGoogleFont("ProximaNova")?.family).toBe("Arimo")
    expect(resolveGoogleFont("SomeMonoFont")?.family).toBe("Cousine")
    expect(resolveGoogleFont("BrushScriptStd")?.family).toBe("Caveat")
  })

  it("keeps serif / unknown fonts unmapped (bundled Merriweather fallback)", () => {
    expect(resolveGoogleFont("Palatino")).toBeNull()
    expect(resolveGoogleFont("Garamond")).toBeNull()
    expect(resolveGoogleFont("Baskerville")).toBeNull()
  })

  it("only resolves to loadable families (every result is in GOOGLE_FONTS)", () => {
    const names = ["Arial", "Calibri", "ComicSansMS", "FuturaBT", "SomeMonoFont", "BrushScript"]
    for (const n of names) {
      const r = resolveGoogleFont(n)
      if (r) expect(GOOGLE_FONTS.some((f) => f.family === r.family)).toBe(true)
    }
  })
})

describe("googleFontsCss2Url", () => {
  it("builds a css2 url with + for spaces and display=swap", () => {
    expect(googleFontsCss2Url(["Mouse Memoirs"])).toBe(
      "https://fonts.googleapis.com/css2?family=Mouse+Memoirs&display=swap",
    )
  })

  it("de-duplicates families and joins with &family=", () => {
    expect(googleFontsCss2Url(["Mouse Memoirs", "Mouse Memoirs"])).toBe(
      "https://fonts.googleapis.com/css2?family=Mouse+Memoirs&display=swap",
    )
  })

  it("returns null for an empty list", () => {
    expect(googleFontsCss2Url([])).toBeNull()
  })
})

describe("googleFontsReferencedIn", () => {
  it("detects the Google family in a font-family declaration", () => {
    const html = `<span style="font-family:'Mouse Memoirs',Merriweather,serif">x</span>`
    expect(googleFontsReferencedIn(html)).toEqual(["Mouse Memoirs"])
  })

  it("detects a single-word family in a CSS rule", () => {
    const html = `<style>body{font-family:Inter,'Merriweather',sans-serif}</style>`
    expect(googleFontsReferencedIn(html)).toEqual(["Inter"])
  })

  it("does NOT match a family name that appears only in body text", () => {
    // "Internet" contains "Inter" — must not trigger a font load.
    expect(googleFontsReferencedIn(`<p>The Internet changed everything.</p>`)).toEqual([])
  })

  it("exact-matches family tokens — no prefix collision", () => {
    // "Noto Sans" is a substring of "Noto Sans Mono" but must not be pulled in.
    const html = `<p><span style="font-family:'Noto Sans Mono',monospace">x</span></p>`
    expect(googleFontsReferencedIn(html)).toEqual(["Noto Sans Mono"])
  })

  it("returns nothing when no registered family appears", () => {
    expect(googleFontsReferencedIn(`font-family:Palatino,serif`)).toEqual([])
  })

  it("detects families referenced via Tailwind font-[...] classes", () => {
    const html = `<p class="absolute top-[23px] font-['Mouse_Memoirs','Merriweather',serif]">x</p>`
    expect(googleFontsReferencedIn(html)).toEqual(["Mouse Memoirs"])
  })

  it("detects a single-word family in a font-[...] class", () => {
    const html = `<p class="font-[Inter,'Merriweather',sans-serif]">x</p>`
    expect(googleFontsReferencedIn(html)).toEqual(["Inter"])
  })

  it("detects class-referenced families with entity-encoded quotes (XHTML)", () => {
    const html = `<p class="font-[&apos;Mouse_Memoirs&apos;,&apos;Merriweather&apos;,serif]">x</p>`
    expect(googleFontsReferencedIn(html)).toEqual(["Mouse Memoirs"])
  })
})

describe("cssQuoteFamily / normalizeFontKey", () => {
  it("single-quotes families with whitespace only (safe inside style=\"...\")", () => {
    expect(cssQuoteFamily("Mouse Memoirs")).toBe("'Mouse Memoirs'")
    expect(cssQuoteFamily("Mouse Memoirs")).not.toContain('"')
    expect(cssQuoteFamily("Merriweather")).toBe("Merriweather")
  })

  it("normalizes to lowercase alphanumerics", () => {
    expect(normalizeFontKey("Mouse Memoirs-Regular")).toBe("mousememoirsregular")
  })
})
