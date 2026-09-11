import { describe, it, expect } from "vitest"
import {
  formatQuizId,
  parseQuizId,
  resolveQuizId,
  withResolvedQuizIds,
  ensureQuizIds,
  QuizIdExhaustedError,
  MAX_QUIZ_SEQ,
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

  it("throws rather than minting a 4-digit id when every number is spent", () => {
    const reserved = Array.from({ length: MAX_QUIZ_SEQ }, (_, i) =>
      formatQuizId(i + 1)
    )

    expect(() => ensureQuizIds(output([quiz("one")]), reserved)).toThrow(
      QuizIdExhaustedError
    )
  })
})

describe("withResolvedQuizIds", () => {
  it("pins legacy ids to the positions their catalog entries were written for", () => {
    const result = withResolvedQuizIds(
      output([quiz("one"), quiz("two"), quiz("three")])
    )

    expect(result.quizzes.map((q) => q.quizId)).toEqual([
      "qz001",
      "qz002",
      "qz003",
    ])
  })

  it("is a no-op when every quiz already has an id", () => {
    const input = output([quiz("one", { quizId: "qz009" })])

    expect(withResolvedQuizIds(input)).toBe(input)
  })

  it("agrees with resolveQuizId, which is what the read paths use", () => {
    const stored = output([quiz("one"), quiz("two")])
    const resolved = withResolvedQuizIds(stored)

    expect(resolved.quizzes.map((q) => q.quizId)).toEqual(
      stored.quizzes.map((q, i) => resolveQuizId(q, i))
    )
  })

  it("protects a legacy quiz's ids when the edit that follows reorders the array", () => {
    // The gap `ensureQuizIds` alone leaves: a book with no stored ids, edited by
    // deleting its first quiz. Stamping the post-delete array would give the
    // survivors qz001/qz002 — the ids of the quizzes *before* them, and with
    // them those quizzes' translations and generated audio. Resolving in stored
    // order first pins each id before anything moves.
    const stored = withResolvedQuizIds(
      output([quiz("one"), quiz("two"), quiz("three")])
    )

    const afterDelete = ensureQuizIds({
      ...stored,
      quizzes: stored.quizzes.slice(1),
    })

    expect(afterDelete.changed).toBe(false)
    expect(afterDelete.output.quizzes.map((q) => q.quizId)).toEqual([
      "qz002",
      "qz003",
    ])
  })

  it("protects them on a mid-book insert too, and the newcomer takes a fresh id", () => {
    const stored = withResolvedQuizIds(
      output([quiz("one"), quiz("two"), quiz("three")])
    )

    // Insert at index 1, as `generate-one` does after sorting by page number.
    const { output: result } = ensureQuizIds({
      ...stored,
      quizzes: [stored.quizzes[0], quiz("new"), ...stored.quizzes.slice(1)],
    })

    expect(result.quizzes.map((q) => q.question)).toEqual([
      "one",
      "new",
      "two",
      "three",
    ])
    expect(result.quizzes.map((q) => q.quizId)).toEqual([
      "qz001",
      "qz004",
      "qz002",
      "qz003",
    ])
  })
})


describe("quiz identity boundary validation", () => {
  it.each(["qz000", "qz1", "qz1000", "", "../qz001", "qz001\n", "qz001\r"])("rejects invalid explicit id %j in allocation and reads", (quizId) => {
    expect(parseQuizId(quizId)).toBeNull()
    const input = output([quiz("Invalid", { quizId })])
    expect(() => ensureQuizIds(input)).toThrow(/Invalid quiz id/)
    expect(() => withResolvedQuizIds(input)).toThrow(/Invalid quiz id/)
  })

  it("rejects supplied duplicates and ambiguous partial legacy arrays", () => {
    const duplicate = output([quiz("One", { quizId: "qz002" }), quiz("Two", { quizId: "qz002" })])
    expect(() => ensureQuizIds(duplicate)).toThrow("Duplicate quiz id")
    expect(() => withResolvedQuizIds(duplicate)).toThrow("Duplicate quiz id")
    expect(() => withResolvedQuizIds(output([quiz("Explicit", { quizId: "qz002" }), quiz("Legacy")]))).toThrow("Duplicate quiz id")
  })

  it("uses a lower unspent slot before reporting exhaustion on a sparse book", () => {
    const reserved = Array.from({ length: 997 }, (_, i) => formatQuizId(i + 3))
    const result = ensureQuizIds(output([
      quiz("Existing", { quizId: "qz998" }), quiz("Existing 2", { quizId: "qz999" }), quiz("New"),
    ]), reserved).output
    expect(result.quizzes[2].quizId).toBe("qz001")
  })
})
