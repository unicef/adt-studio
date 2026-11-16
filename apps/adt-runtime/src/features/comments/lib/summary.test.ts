import { describe, expect, it } from "vitest"
import { snippet } from "./summary"

describe("snippet", () => {
  it("leaves a short comment alone", () => {
    expect(snippet("Trocar esta frase.")).toBe("Trocar esta frase.")
  })

  it("collapses newlines so a list does not preview one word per line", () => {
    expect(snippet("a) a data\nb) o mês\nc) o valor")).toBe("a) a data b) o mês c) o valor")
  })

  it("cuts on a word boundary and marks the cut", () => {
    const result = snippet("palavra ".repeat(30), 40)
    expect(result.endsWith("…")).toBe(true)
    expect(result).not.toContain("palavr…")
    expect(result.length).toBeLessThanOrEqual(41)
  })

  it("cuts mid-word rather than throwing most of the line away", () => {
    const result = snippet(`${"x".repeat(60)} tail`, 20)
    expect(result).toBe(`${"x".repeat(20)}…`)
  })

  it("trims the whitespace it was handed", () => {
    expect(snippet("   spaced   out   ")).toBe("spaced out")
  })
})
