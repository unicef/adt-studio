import { describe, expect, it } from "vitest"
import { bootstrapMean, expandPath, resolveBlindCaptionReview, tokenRecall, validateSuite } from "./lib/adt-eval-core.mjs"

const validSuite = {
  schemaVersion: 1,
  id: "test",
  documents: [{ id: "doc" }],
  candidates: [
    { id: "a", model: "local:a", documentId: "doc", runFile: "a.json", bookDir: "a" },
    { id: "b", model: "openai:b", documentId: "doc", runFile: "b.json", bookDir: "b" },
  ],
}

describe("ADT evaluation core", () => {
  it("validates suite identity and references", () => {
    expect(validateSuite(validSuite)).toBe(validSuite)
    expect(() => validateSuite({ ...validSuite, candidates: [validSuite.candidates[0]] })).toThrow(/at least two/)
    expect(() => validateSuite({ ...validSuite, candidates: [{ ...validSuite.candidates[0], documentId: "missing" }, validSuite.candidates[1]] })).toThrow(/unknown document/)
    expect(() => validateSuite({ ...validSuite, profiles: { quality: { fidelity: 0.2 } } })).toThrow(/sum to 1/)
  })

  it("measures multiset source-token recall", () => {
    expect(tokenRecall("Momo sleeps sleeps", "Momo sleeps")).toBeCloseTo(2 / 3)
    expect(tokenRecall("", "anything")).toBe(1)
  })

  it("produces deterministic bootstrap intervals", () => {
    const first = bootstrapMean([0, 1, 1, 1], { seed: 42, samples: 1_000 })
    const second = bootstrapMean([0, 1, 1, 1], { seed: 42, samples: 1_000 })
    expect(first).toEqual(second)
    expect(first.low).toBeLessThanOrEqual(0.75)
    expect(first.high).toBeGreaterThanOrEqual(0.75)
  })

  it("expands home-relative paths", () => {
    expect(expandPath("~/example")).toContain("/example")
  })

  it("resolves blinded 1-5 review scores without model names in the pack", () => {
    const pack = {
      schemaVersion: 1,
      suiteId: "test",
      samples: [{
        sampleId: "doc:caption:pg001",
        itemId: "pg001",
        options: [{ alias: "A", output: "caption" }],
        judgment: { scores: { A: { fidelity: 5, completeness: 3, clarity: 1 } }, preferred: "A", rationale: "mixed" },
      }],
    }
    const key = { schemaVersion: 1, suiteId: "test", mappings: [{ sampleId: "doc:caption:pg001", alias: "A", candidateId: "model-a", reviewItemId: "pg001" }] }
    const result = resolveBlindCaptionReview(pack, key, "reviewer-1")
    expect(result.reviews[0]).toMatchObject({ reviewerId: "reviewer-1", blinded: true, candidateId: "model-a" })
    expect(result.reviews[0].items[0].score).toBe(0.5)
    expect(result.comparisons[0].winnerCandidateId).toBe("model-a")
  })
})
