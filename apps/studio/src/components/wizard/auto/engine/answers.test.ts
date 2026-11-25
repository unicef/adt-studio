import { describe, expect, it, vi } from "vitest"
import type { SetupDecided, SetupRecommendation } from "@adt/types"
import asksKind from "../lab/fixtures/asks-kind.json"
import textbook from "../lab/fixtures/textbook.json"
import { factsThatMatter, fitPreset, fitStrategy, genreFor, proposedAnswers, settingsFor } from "./answers"

// The macros aren't compiled under vitest; the preset constants use them.
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children?: unknown }) => children, useLingui: () => ({ t: (s: TemplateStringsArray) => s.join("") }) }))

const kindRec = asksKind as unknown as SetupRecommendation
const textbookRec = textbook as unknown as SetupRecommendation

describe("fitStrategy / fitPreset", () => {
  it("keeps a strategy the preset offers", () => {
    expect(fitStrategy("storybook", "fixed_layout")).toBe("fixed_layout")
  })

  it("uses the alternative, then the preset's default, when the preset doesn't offer the pick", () => {
    expect(fitStrategy("textbook", "fixed_layout", "llm-overlay")).toBe("llm-overlay")
    expect(fitStrategy("textbook", "single_column")).toBe("llm")
  })

  it("leaves a preset it doesn't know alone", () => {
    expect(fitStrategy("nope", "fixed_layout")).toBe("fixed_layout")
  })

  it("fits a decided row and names the fix", () => {
    const row = { ...textbookRec.settings, renderStrategy: { value: "fixed_layout", rule: "user" } } as SetupDecided
    expect(fitPreset(row).renderStrategy).toEqual({ value: "llm", rule: "preset-default" })
    expect(fitPreset(row, "user").renderStrategy).toEqual({ value: "llm", rule: "user" })
    expect(fitPreset(textbookRec.settings)).toBe(textbookRec.settings)
  })
})

describe("genreFor", () => {
  it("maps each preset the rulebook picks to its genre, one to one", () => {
    for (const genre of ["story", "textbook", "reference"]) {
      const preset = settingsFor(textbookRec, { ...proposedAnswers(textbookRec), genre }).preset!.value
      expect(genreFor(preset)).toBe(genre)
    }
    expect(genreFor("custom")).toBeNull()
  })
})

describe("factsThatMatter", () => {
  it("follows the current answers, not the engine's guess", () => {
    const proposed = proposedAnswers(kindRec)
    // The engine read a story: exercises don't change anything there.
    expect(kindRec.facts.find((f) => f.id === "exercises")!.matters).toBe(false)
    expect(factsThatMatter(kindRec, proposed)).not.toContain("exercises")
    // Answered as a school book, exercises now decide Activities and Sectioning.
    expect(factsThatMatter(kindRec, { ...proposed, genre: "textbook" })).toContain("exercises")
  })

  it("matches the engine's flags for its own proposal", () => {
    const proposed = proposedAnswers(kindRec)
    expect(factsThatMatter(kindRec, proposed)).toEqual(kindRec.facts.filter((f) => f.matters).map((f) => f.id))
  })
})
