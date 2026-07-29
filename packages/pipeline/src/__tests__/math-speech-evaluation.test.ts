import { describe, expect, it } from "vitest"
import type { LLMModel, GenerateObjectOptions, GenerateObjectResult } from "@adt/llm"
import { resolveMathSpeechEvaluationConfig, type MathSpeechEvaluationItem } from "@adt/types"
import {
  needsMathSpeechReview,
  collectMathSpeechEntries,
  evaluateMathSpeech,
  resolveSpokenText,
} from "../math-speech-evaluation.js"

const config = resolveMathSpeechEvaluationConfig(undefined)

/** An LLM that returns whatever verdicts the test supplies, and records the
 *  context it was called with. */
function fakeJudge(
  results: Array<Record<string, unknown>>,
  seen?: { context?: Record<string, unknown> },
): LLMModel {
  return {
    generateObject: async <T>(opts: GenerateObjectOptions) => {
      if (seen) seen.context = opts.context as Record<string, unknown>
      return { object: { reasoning: "test", results } as T } as GenerateObjectResult<T>
    },
  } as LLMModel
}

describe("needsMathSpeechReview", () => {
  it("passes output the walker rendered cleanly", () => {
    expect(needsMathSpeechReview("2/5 + 3/9")).toBe(false)
    expect(needsMathSpeechReview("A = πr²")).toBe(false)
    expect(needsMathSpeechReview("L mL, 23 200, × 7")).toBe(false)
  })

  it("flags a symbolic exponent a voice cannot read", () => {
    expect(needsMathSpeechReview("a^m × aⁿ")).toBe(true)
    expect(needsMathSpeechReview("x^(n + 1)")).toBe(true)
  })

  it("does not flag a Unicode superscript", () => {
    // `mm²` reads as "millimetres squared" without help.
    expect(needsMathSpeechReview("616 mm²")).toBe(false)
  })

  it("flags a surviving underscore", () => {
    expect(needsMathSpeechReview("∫ _a^b f(x) dx")).toBe(true)
  })

  it("flags unconverted LaTeX", () => {
    expect(needsMathSpeechReview("\\dfrac{2}{5}")).toBe(true)
  })

  it("flags unbalanced brackets", () => {
    expect(needsMathSpeechReview("{ 2x + y = 5, x − y = 1")).toBe(true)
  })
})

describe("collectMathSpeechEntries", () => {
  it("ignores entries with no maths in them", () => {
    const { candidates, convertedCount } = collectMathSpeechEntries([
      { id: "tx001", text: "The elephant is the largest land animal." },
      { id: "tx002", text: "Nilikwenda sokoni kununua matunda." },
    ])
    expect(candidates).toHaveLength(0)
    expect(convertedCount).toBe(0)
  })

  it("counts a clean conversion but does not send it to the judge", () => {
    const { candidates, convertedCount } = collectMathSpeechEntries([
      { id: "tx001", text: "$\\frac{2}{5}$" },
    ])
    expect(convertedCount).toBe(1)
    expect(candidates).toHaveLength(0)
  })

  it("sends an entry the walker could not express", () => {
    const { candidates } = collectMathSpeechEntries([
      { id: "tx001", text: "$a^m \\times a^n$" },
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0].entry_id).toBe("tx001")
    expect(candidates[0].latex).toBe("$a^m \\times a^n$")
    expect(candidates[0].latex_hash).toBeTruthy()
  })

  it("sends every converted entry when evaluating all", () => {
    const { candidates, convertedCount } = collectMathSpeechEntries(
      [
        { id: "tx001", text: "$\\frac{2}{5}$" },
        { id: "tx002", text: "$a^m$" },
      ],
      { evaluateAll: true },
    )
    expect(convertedCount).toBe(2)
    expect(candidates).toHaveLength(2)
  })

  it("carries the page id through when given", () => {
    const { candidates } = collectMathSpeechEntries([
      { id: "tx001", text: "$a^m$", pageId: "pg060" },
    ])
    expect(candidates[0].page_id).toBe("pg060")
  })
})

describe("evaluateMathSpeech", () => {
  const entries = [
    { entry_id: "tx001", latex: "$a^m$", walker_text: "a^m", latex_hash: "h1", walker_hash: "h2" },
  ]

  const run = (llm: LLMModel) =>
    evaluateMathSpeech(llm, {
      entries,
      config,
      language: "en",
      catalogVersion: 1,
      evalConfigHash: "cfg",
    })

  it("records an unacceptable verdict with its suggestion", async () => {
    const result = await run(
      fakeJudge([
        {
          entry_id: "tx001",
          acceptable: false,
          rationale: "The caret has no spoken form.",
          issue_type: "unreadable-notation",
          severity: "medium",
          suggested_text: "a to the power m",
        },
      ]),
    )
    expect(result.summary).toMatchObject({ total: 1, acceptable: 0, unacceptable: 1 })
    expect(result.items[0].suggested_text).toBe("a to the power m")
    expect(result.items[0].issue_type).toBe("unreadable-notation")
  })

  it("drops a suggestion offered on an acceptable entry", async () => {
    // Nothing to correct, so surfacing an edit would waste a reviewer's time.
    const result = await run(
      fakeJudge([
        {
          entry_id: "tx001",
          acceptable: true,
          rationale: "Reads correctly.",
          suggested_text: "something else",
        },
      ]),
    )
    expect(result.items[0].suggested_text).toBeUndefined()
    expect(result.summary.unacceptable).toBe(0)
  })

  it("accepts nulls for fields the judge had no answer for", async () => {
    // Structured outputs require every property in `required`, so the judge
    // returns null rather than omitting a field.
    const result = await run(
      fakeJudge([
        {
          entry_id: "tx001",
          acceptable: true,
          rationale: "Reads correctly.",
          issue_type: null,
          severity: null,
          suggested_text: null,
        },
      ]),
    )
    expect(result.items[0].acceptable).toBe(true)
    expect(result.items[0].issue_type).toBeUndefined()
    expect(result.items[0].severity).toBeUndefined()
    expect(result.items[0].suggested_text).toBeUndefined()
  })

  it("keeps an entry the judge skipped rather than dropping it", async () => {
    const result = await run(fakeJudge([]))
    expect(result.items).toHaveLength(1)
    expect(result.items[0].acceptable).toBe(true)
    expect(result.items[0].rationale).toMatch(/no verdict/i)
  })

  it("passes the LaTeX and the walker output to the judge", async () => {
    const seen: { context?: Record<string, unknown> } = {}
    await evaluateMathSpeech(
      fakeJudge([{ entry_id: "tx001", acceptable: true, rationale: "fine" }], seen),
      { entries, config, language: "en", catalogVersion: 1, evalConfigHash: "cfg" },
    )
    const sent = seen.context?.entries as Array<Record<string, string>>
    expect(sent[0]).toMatchObject({ entry_id: "tx001", latex: "$a^m$", walker_text: "a^m" })
  })

  it("records how many converted entries were never judged", async () => {
    const result = await evaluateMathSpeech(
      fakeJudge([{ entry_id: "tx001", acceptable: true, rationale: "fine" }]),
      {
        entries,
        config,
        language: "en",
        catalogVersion: 1,
        evalConfigHash: "cfg",
        notEvaluated: 533,
      },
    )
    expect(result.summary.not_evaluated).toBe(533)
  })
})

describe("resolveSpokenText", () => {
  const latex = "$a^m$"

  it("speaks the walker output when there is no verdict", () => {
    expect(resolveSpokenText(latex)).toBe("a^m")
  })

  it("speaks the walker output when a verdict has no reviewer decision", () => {
    // A suggestion nobody has looked at must never reach the voice.
    const verdict = {
      entry_id: "tx001",
      latex,
      walker_text: "a^m",
      acceptable: false,
      rationale: "unreadable",
      suggested_text: "a to the power m",
    } as MathSpeechEvaluationItem
    expect(resolveSpokenText(latex, verdict)).toBe("a^m")
  })

  it("speaks what the reviewer resolved", () => {
    const verdict = {
      entry_id: "tx001",
      latex,
      walker_text: "a^m",
      acceptable: false,
      rationale: "unreadable",
      resolved_text: "a to the power m",
    } as MathSpeechEvaluationItem
    expect(resolveSpokenText(latex, verdict)).toBe("a to the power m")
  })

  it("ignores a resolution whose source text has since changed", () => {
    const verdict = {
      entry_id: "tx001",
      latex,
      walker_text: "a^m",
      acceptable: false,
      rationale: "unreadable",
      resolved_text: "a to the power m",
      latex_hash: "stale-hash",
    } as MathSpeechEvaluationItem
    expect(resolveSpokenText(latex, verdict)).toBe("a^m")
  })

  it("speaks the walker output when the reviewer overrode the flag", () => {
    const verdict = {
      entry_id: "tx001",
      latex,
      walker_text: "a^m",
      acceptable: false,
      rationale: "unreadable",
      resolved_text: "a to the power m",
      accepted_anyway: true,
    } as MathSpeechEvaluationItem
    expect(resolveSpokenText(latex, verdict)).toBe("a^m")
  })
})
