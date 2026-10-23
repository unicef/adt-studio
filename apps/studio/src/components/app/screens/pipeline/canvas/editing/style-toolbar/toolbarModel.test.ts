import { describe, expect, it } from "vitest"
import {
  dedupeFontChain,
  fontFamiliesInHtml,
  isBold,
  keyFor,
  LINE_SPACING,
  primaryFamily,
  stepTextSize,
  toggleToken,
  uniformValue,
} from "./toolbarModel"

describe("stepTextSize", () => {
  it("steps to the next Tailwind text size", () => {
    expect(stepTextSize(16, 1)).toBe(18)
    expect(stepTextSize(16, -1)).toBe(14)
  })

  it("snaps an off-scale size to its neighbours", () => {
    expect(stepTextSize(17, 1)).toBe(18)
    expect(stepTextSize(17, -1)).toBe(16)
  })

  it("treats sub-pixel noise as the same size", () => {
    expect(stepTextSize(15.8, 1)).toBe(18)
    expect(stepTextSize(16.3, -1)).toBe(14)
  })

  it("stops at both ends of the scale", () => {
    expect(stepTextSize(12, -1)).toBeNull()
    expect(stepTextSize(128, 1)).toBeNull()
  })
})

describe("keyFor", () => {
  it("finds a key within the tolerance", () => {
    expect(keyFor(LINE_SPACING, 1.52, 0.06)).toBe("normal")
    expect(keyFor(LINE_SPACING, 1.8, 0.06)).toBeNull()
    expect(keyFor(LINE_SPACING, null)).toBeNull()
  })

  it("matches string entries exactly", () => {
    expect(keyFor({ small: "33", full: "100" }, "100")).toBe("full")
    expect(keyFor({ small: "33", full: "100" }, "50")).toBeNull()
  })
})

describe("text helpers", () => {
  it("knows which weights read as bold", () => {
    expect(isBold("bold")).toBe(true)
    expect(isBold("semibold")).toBe(true)
    expect(isBold("medium")).toBe(false)
    expect(isBold(null)).toBe(false)
  })

  it("toggles a decoration token", () => {
    expect(toggleToken(["italic"], "underline")).toEqual(["italic", "underline"])
    expect(toggleToken(["italic", "underline"], "italic")).toEqual(["underline"])
  })

  it("reads a uniform box", () => {
    expect(uniformValue({ t: 8, r: 8, b: 8, l: 8 })).toBe(8)
    expect(uniformValue({ t: 8, r: 0, b: 8, l: 0 })).toBeNull()
    expect(uniformValue(null)).toBeNull()
  })
})

describe("fonts", () => {
  it("reads the primary family of a chain", () => {
    expect(primaryFamily("'Mouse Memoirs', 'Merriweather', sans-serif")).toBe("Mouse Memoirs")
    expect(primaryFamily('"Inter",sans-serif')).toBe("Inter")
    expect(primaryFamily("")).toBeNull()
  })

  it("drops repeated families from a chain", () => {
    expect(dedupeFontChain("'Merriweather','Merriweather',serif")).toBe("'Merriweather',serif")
    expect(dedupeFontChain("'Inter','Merriweather',sans-serif")).toBe("'Inter','Merriweather',sans-serif")
  })

  it("lists the families declared in page HTML once, skipping generics", () => {
    const html = [
      `<p style="font-family: 'Mouse Memoirs', serif; color: red">a</p><span style="font-family:Inter">b</span>`,
      `<p style="font-family: &quot;Mouse Memoirs&quot;, serif">c</p><p style="font-family: sans-serif">d</p>`,
    ]
    expect(fontFamiliesInHtml(html)).toEqual(["Mouse Memoirs", "Inter"])
  })
})
