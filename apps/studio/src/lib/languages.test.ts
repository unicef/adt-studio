import { describe, expect, it } from "vitest"
import {
  findLanguage,
  getCountriesForLanguage,
  getDisplayName,
  matchesSearch,
  normalizeLocale,
} from "./languages"

describe("languages", () => {
  it("includes Nepali in the supported language list", () => {
    expect(findLanguage("ne")).toEqual({
      code: "ne",
      name: "Nepali",
      countries: [
        { code: "np", name: "Nepal" },
        { code: "in", name: "India" },
      ],
    })
  })

  it("returns Nepali display names for base and locale codes", () => {
    expect(getDisplayName("ne")).toBe("Nepali")
    expect(getDisplayName("ne-NP")).toBe("Nepali (Nepal)")
    expect(getDisplayName("ne_np")).toBe("Nepali (Nepal)")
  })

  it("suggests Nepal first for Nepali locales", () => {
    const { suggested } = getCountriesForLanguage("ne")

    expect(suggested).toEqual([
      { code: "np", name: "Nepal" },
      { code: "in", name: "India" },
    ])
  })

  it("normalizes Nepali locale casing", () => {
    expect(normalizeLocale("ne_np")).toBe("ne-NP")
    expect(normalizeLocale("NE")).toBe("ne")
  })

  it("includes Urdu in the supported language list", () => {
    expect(findLanguage("ur")).toEqual({
      code: "ur",
      name: "Urdu",
      countries: [
        { code: "pk", name: "Pakistan" },
        { code: "in", name: "India" },
      ],
    })
  })

  it("returns Urdu display names for base and locale codes", () => {
    expect(getDisplayName("ur")).toBe("Urdu")
    expect(getDisplayName("ur-PK")).toBe("Urdu (Pakistan)")
    expect(getDisplayName("ur_pk")).toBe("Urdu (Pakistan)")
  })

  it("suggests Pakistan first for Urdu locales", () => {
    const { suggested } = getCountriesForLanguage("ur")

    expect(suggested).toEqual([
      { code: "pk", name: "Pakistan" },
      { code: "in", name: "India" },
    ])
  })

  it("normalizes Urdu locale casing", () => {
    expect(normalizeLocale("ur_pk")).toBe("ur-PK")
    expect(normalizeLocale("UR")).toBe("ur")
  })

  it("finds an entry when any of its names contains the search, ignoring case", () => {
    expect(matchesSearch("", ["Spanish"])).toBe(true)
    expect(matchesSearch("span", ["Spanish", "es"])).toBe(true)
    expect(matchesSearch("ES", ["Spanish", "es"])).toBe(true)
    expect(matchesSearch("espa", ["Spanish", "Español"], "pt-BR")).toBe(true)
    expect(matchesSearch("fr", ["Spanish", "es"])).toBe(false)
  })
})
