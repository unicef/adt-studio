import { describe, expect, it } from "vitest"
import { classifySetupError, SetupFailure } from "./client"
import { ambiguousDecisions, recommendationSchema, setupResultSchema } from "./contract"
import { fixtureFor, sampledPages } from "./placeholder"
import { fitStrategy, toAiPicks } from "../review/setup"

const BOOKS = ["matematica-volume-1.pdf", "raven.pdf", "colouring-my-school.pdf", "user-story.pdf", "volcanoes.pdf"]

describe("setup contract", () => {
  it("accepts what the recommender returns for every sample book", () => {
    for (const name of BOOKS)
      for (const unsure of [false, true]) {
        const result = setupResultSchema.safeParse({ ...fixtureFor(name, 0.7, unsure, 52), userLanguage: "pt-BR" })
        expect(result.success, `${name} unsure=${unsure}`).toBe(true)
      }
  })

  it("keeps the backend's extra fields", () => {
    const parsed = setupResultSchema.parse({ ...fixtureFor("raven.pdf", 0.7, false, 12), userLanguage: "en", bookProfile: { pageCount: 12 } })
    expect(parsed.bookProfile).toEqual({ pageCount: 12 })
  })

  it("rejects what the backend's own checks reject", () => {
    const base = fixtureFor("volcanoes.pdf", 0.7, false, 52).recommendation
    const bad = (patch: object) => recommendationSchema.safeParse({ ...base, renderStrategy: { ...base.renderStrategy, ...patch } }).success
    expect(bad({ alternative: "llm-overlay", ambiguityReason: "x", confidence: "high" })).toBe(false)
    expect(bad({ alternative: "fixed_layout", ambiguityReason: "x", confidence: "medium" })).toBe(false)
    expect(bad({ ambiguityReason: "x" })).toBe(false)
    expect(bad({ evidencePages: [3, 2] })).toBe(false)
    expect(bad({ choice: "two_column" })).toBe(false)
    expect(bad({ extra: true })).toBe(false)
    expect(bad({ alternative: "llm-overlay", ambiguityReason: "x", confidence: "medium" })).toBe(true)
  })

  it("leaves the look between two options for every sample book when unsure", () => {
    for (const name of BOOKS) expect(fixtureFor(name, 0.7, true, 52).recommendation.renderStrategy.alternative, name).not.toBeNull()
  })

  it("lists the decisions left between two options", () => {
    expect(ambiguousDecisions(fixtureFor("volcanoes.pdf", 0.7, true, 52).recommendation)).toEqual(["renderStrategy"])
    expect(ambiguousDecisions(fixtureFor("volcanoes.pdf", 0.7, false, 52).recommendation)).toEqual([])
  })
})

describe("fitting the look to the preset", () => {
  const base = fixtureFor("matematica-volume-1.pdf", 0.7, false, 52).recommendation
  it("keeps a strategy the preset offers", () => {
    expect(toAiPicks(base).renderStrategy).toBe("llm")
    expect(toAiPicks(base).strategyAdjustedFrom).toBeNull()
  })
  it("falls back to an allowed alternative, then to the preset's default", () => {
    expect(fitStrategy("textbook", { ...base.renderStrategy, choice: "fixed_layout", alternative: "llm-overlay", confidence: "medium", ambiguityReason: "x" })).toBe("llm-overlay")
    expect(fitStrategy("textbook", { ...base.renderStrategy, choice: "single_column" })).toBe("llm")
    expect(toAiPicks({ ...base, renderStrategy: { ...base.renderStrategy, choice: "single_column" } }).strategyAdjustedFrom).toBe("single_column")
  })
  it("every sample book's answer fits its preset", () => {
    for (const name of BOOKS) for (const unsure of [false, true]) expect(toAiPicks(fixtureFor(name, 0.7, unsure, 52).recommendation).strategyAdjustedFrom, name).toBeNull()
  })
})

describe("sampled pages", () => {
  it("matches the recommender's sampling", () => {
    expect(sampledPages(52)).toEqual([2, 3, 26, 27, 50, 51])
    expect(sampledPages(12)).toEqual([2, 3, 6, 7, 10, 11])
    expect(sampledPages(5)).toEqual([1, 2, 3, 4, 5])
    expect(sampledPages(10)).toEqual([2, 3, 6, 7, 8, 9])
    expect(sampledPages(8)).toEqual([2, 3, 4, 5, 6, 7])
    expect(sampledPages(7)).toEqual([2, 3, 4, 5, 6])
    expect(sampledPages(0)).toEqual([])
  })

  it("samples inside a chosen range", () => {
    expect(sampledPages(52, { start: 1, end: 10 })).toEqual([2, 3, 6, 7, 10])
    expect(sampledPages(52, { start: 20, end: 23 })).toEqual([20, 21, 22, 23])
    expect(sampledPages(52, { start: 52, end: 52 })).toEqual([52])
  })
})

describe("setup errors", () => {
  const kind = (e: unknown) => classifySetupError(e).kind
  it("sorts provider and network errors", () => {
    expect(kind(Object.assign(new Error("Incorrect API key provided"), { status: 401 }))).toBe("auth")
    expect(kind(new Error("OPENAI_API_KEY is required in the environment or .env file"))).toBe("auth")
    expect(kind(Object.assign(new Error("You exceeded your current quota"), { status: 429 }))).toBe("quota")
    expect(kind(new TypeError("fetch failed"))).toBe("offline")
    expect(kind(new Error("getaddrinfo ENOTFOUND api.openai.com"))).toBe("offline")
    expect(kind(new Error("OpenAI response for renderStrategy cites unsampled page 14"))).toBe("unknown")
    expect(kind("boom")).toBe("unknown")
  })
  it("keeps an already sorted failure and its message", () => {
    const failure = new SetupFailure("quota", "429")
    expect(classifySetupError(failure)).toBe(failure)
    expect(classifySetupError(new Error("x")).detail).toBe("x")
  })
})
