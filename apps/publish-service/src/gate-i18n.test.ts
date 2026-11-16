import { describe, expect, it } from "vitest"
import {
  GATE_STRINGS,
  gateLanguageFor,
  parseStoredLanguage,
  pickBookLanguage,
} from "./gate-i18n.js"

describe("gate strings", () => {
  it("translates every string into every language", () => {
    const keys = Object.keys(GATE_STRINGS.en).sort()
    for (const [language, strings] of Object.entries(GATE_STRINGS)) {
      expect(Object.keys(strings).sort(), language).toEqual(keys)
      for (const value of Object.values(strings)) expect(value.trim().length, language).toBeGreaterThan(0)
    }
  })
})

describe("gateLanguageFor", () => {
  it("matches the exact tag, whatever its case", () => {
    expect(gateLanguageFor("pt-BR")).toBe("pt-BR")
    expect(gateLanguageFor("pt-br")).toBe("pt-BR")
    expect(gateLanguageFor("FR")).toBe("fr")
  })

  it("falls back to the base language, like the packager's catalogs", () => {
    expect(gateLanguageFor("en-US")).toBe("en")
    expect(gateLanguageFor("pt-PT")).toBe("pt-BR")
    expect(gateLanguageFor("es-UY")).toBe("es")
  })

  it("has nothing for a language Studio does not translate", () => {
    expect(gateLanguageFor("de")).toBeNull()
    expect(gateLanguageFor(null)).toBeNull()
  })
})

describe("pickBookLanguage — the reader's own rule", () => {
  const book = { available: ["pt-BR", "en-US"], default: "pt-BR" }

  it("keeps a stored choice the book offers", () => {
    expect(pickBookLanguage(book, "en-US")).toBe("en-US")
  })

  it("drops one it does not, for the default", () => {
    expect(pickBookLanguage(book, "fr")).toBe("pt-BR")
    expect(pickBookLanguage(book, null)).toBe("pt-BR")
  })

  it("trusts the stored choice when the book declares no languages", () => {
    expect(pickBookLanguage({ available: [], default: null }, "es")).toBe("es")
    expect(pickBookLanguage({ available: [], default: null }, null)).toBe("en")
  })
})

describe("parseStoredLanguage", () => {
  it("reads the reader's JSON-encoded value and the older bare one", () => {
    expect(parseStoredLanguage('"pt-BR"')).toBe("pt-BR")
    expect(parseStoredLanguage("pt-BR")).toBe("pt-BR")
    expect(parseStoredLanguage(null)).toBeNull()
  })
})
