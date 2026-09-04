import { describe, it, expect } from "vitest"
import {
  formatQuizId,
  parseQuizId,
  resolveQuizId,
  ensureQuizIds,
  type Quiz,
  type QuizGenerationOutput,
} from "../quiz.js"

function quiz(question: string, overrides: Partial<Quiz> = {}): Quiz {
  return {
    quizIndex: 0,
    afterPageId: "pg001",
    pageIds: ["pg001"],
    question,
    options: [
      { text: "a", explanation: "" },
      { text: "b", explanation: "" },
      { text: "c", explanation: "" },
    ],
    answerIndex: 0,
    reasoning: "",
    ...overrides,
  }
}

function output(quizzes: Quiz[]): QuizGenerationOutput {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    language: "en",
    pagesPerQuiz: 3,
    quizzes,
  }
}

describe("formatQuizId / parseQuizId", () => {
  it("round-trips", () => {
    expect(formatQuizId(1)).toBe("qz001")
    expect(formatQuizId(42)).toBe("qz042")
    expect(parseQuizId("qz042")).toBe(42)
  })

  it("returns null for ids of other kinds", () => {
    expect(parseQuizId("pg001_sec001")).toBeNull()
    expect(parseQuizId("glp001")).toBeNull()
    expect(parseQuizId("qz")).toBeNull()
  })
})

describe("resolveQuizId", () => {
  it("prefers the stored id", () => {
    expect(resolveQuizId(quiz("q", { quizId: "qz007" }), 0)).toBe("qz007")
  })

  it("falls back to the value derived before quizId existed", () => {
    expect(resolveQuizId(quiz("q"), 0)).toBe("qz001")
    expect(resolveQuizId(quiz("q"), 4)).toBe("qz005")
  })
})

describe("ensureQuizIds", () => {
  it("stamps legacy quizzes with the ids their catalog entries already use", () => {
    // A book written before quizId existed: every consumer derived qz001..qz003
    // from array position, and `${qid}_que` keys its translations and audio.
    // Backfilling must reproduce exactly those ids, not fresh ones.
    const { output: result, changed } = ensureQuizIds(
      output([quiz("one"), quiz("two"), quiz("three")])
    )

    expect(changed).toBe(true)
    expect(result.quizzes.map((q) => q.quizId)).toEqual(["qz001", "qz002", "qz003"])
  })

  it("is a no-op when every quiz already has an id", () => {
    const input = output([quiz("one", { quizId: "qz005" })])
    const { output: result, changed } = ensureQuizIds(input)

    expect(changed).toBe(false)
    expect(result).toBe(input)
  })

  it("leaves existing ids untouched when a quiz is inserted at the front", () => {
    // The regression this exists to prevent: inserting a quiz used to shift
    // every later quiz's id, re-pointing its question and options at another
    // quiz's translations and generated audio.
    const existing = ensureQuizIds(output([quiz("one"), quiz("two")])).output
    const withInsert = output([quiz("new"), ...existing.quizzes])

    const { output: result } = ensureQuizIds(withInsert)

    expect(result.quizzes.map((q) => q.quizId)).toEqual(["qz003", "qz001", "qz002"])
    expect(result.quizzes.map((q) => q.question)).toEqual(["new", "one", "two"])
  })

  it("does not reuse an id retired by an earlier version", () => {
    // qz002's quiz was deleted. Reissuing qz002 would adopt the removed quiz's
    // `qz002_que` / `qz002_o0` catalog entries onto unrelated content.
    const { output: result } = ensureQuizIds(
      output([quiz("kept", { quizId: "qz001" }), quiz("added")]),
      ["qz001", "qz002", "qz003"]
    )

    expect(result.quizzes.map((q) => q.quizId)).toEqual(["qz001", "qz004"])
  })
})
