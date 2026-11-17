import { describe, expect, it } from "vitest"
import { matchesSearch, normalizeSearch } from "./search-match"

describe("inspector search", () => {
  it("ignores case and accents", () => {
    expect(normalizeSearch("  Ícone FUNDO ")).toBe("icone fundo")
    expect(matchesSearch("Superfície do dock fundo", "superficie")).toBe(true)
  })

  it("needs every word of the query", () => {
    expect(matchesSearch("Dock and panel surface background", "dock background")).toBe(true)
    expect(matchesSearch("Dock and panel surface background", "dock border")).toBe(false)
  })

  it("matches everything for an empty query", () => {
    expect(matchesSearch("anything", "   ")).toBe(true)
  })
})
