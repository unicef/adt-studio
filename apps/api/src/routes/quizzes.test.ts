import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createQuizRoutes, insertQuizAtPosition } from "./quizzes.js"
import type { Quiz, QuizGenerationOutput } from "@adt/types"

const label = "quiz-book"
let tmpDir: string
let app: Hono

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

function putQuizzes(body: QuizGenerationOutput) {
  return app.request(`/api/books/${label}/quizzes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function storedQuizzes(): Quiz[] {
  const storage = createBookStorage(label, tmpDir)
  try {
    const row = storage.getLatestNodeData("quiz-generation", "book")
    return (row?.data as QuizGenerationOutput).quizzes
  } finally {
    storage.close()
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-quiz-route-"))
  const storage = createBookStorage(label, tmpDir)
  storage.close()

  app = new Hono()
  app.onError(errorHandler)
  app.route("/api", createQuizRoutes(tmpDir))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("PUT /api/books/:label/quizzes", () => {
  it("stamps missing quizIds with the ids their catalog entries already use", async () => {
    // A book saved before quizId existed. Its `${quizId}_que` catalog entries,
    // translations and audio were all keyed off array position, so backfilling
    // must reproduce exactly those ids.
    const res = await putQuizzes(output([quiz("one"), quiz("two")]))
    expect(res.status).toBe(200)

    expect(storedQuizzes().map((q) => q.quizId)).toEqual(["qz001", "qz002"])
  })

  it("keeps existing ids when a quiz is inserted at the front", async () => {
    await putQuizzes(output([quiz("one"), quiz("two")]))
    const existing = storedQuizzes()

    const res = await putQuizzes(output([quiz("new"), ...existing]))
    expect(res.status).toBe(200)

    const saved = storedQuizzes()
    expect(saved.map((q) => q.question)).toEqual(["new", "one", "two"])
    // "one" and "two" keep qz001/qz002 — the newcomer does not take qz001 and
    // inherit their translations and generated audio.
    expect(saved.map((q) => q.quizId)).toEqual(["qz003", "qz001", "qz002"])
  })

  it("does not reissue the id of a quiz deleted in an earlier version", async () => {
    await putQuizzes(output([quiz("one"), quiz("two")]))
    const [first] = storedQuizzes()

    // Delete "two" (qz002), then add a fresh quiz.
    await putQuizzes(output([first]))
    const res = await putQuizzes(output([first, quiz("three")]))
    expect(res.status).toBe(200)

    const ids = storedQuizzes().map((q) => q.quizId)
    expect(ids).toEqual(["qz001", "qz003"])
    expect(ids).not.toContain("qz002")
  })
})

describe("insertQuizAtPosition", () => {
  const FALLBACK = { generatedAt: "2026-02-01T00:00:00.000Z", language: "en", pagesPerQuiz: 3 }

  /** The reader meets pg003 first, then pg002, then pg001 — a reordered book. */
  const REVERSED = new Map([
    ["pg003", 0],
    ["pg002", 1],
    ["pg001", 2],
  ])

  function insert(
    existing: QuizGenerationOutput | null,
    newQuiz: Quiz,
    over: Partial<Parameters<typeof insertQuizAtPosition>[0]> = {},
  ) {
    return insertQuizAtPosition({
      existing,
      newQuiz,
      placement: "after",
      afterPageId: newQuiz.afterPageId,
      readingRank: REVERSED,
      reservedIds: [],
      fallback: FALLBACK,
      ...over,
    })
  }

  it("keeps the ids of quizzes that predate quizId when the book has been reordered", () => {
    // A book saved before `quizId` existed: each quiz's catalog entries,
    // translations and audio are keyed by its array position — "a" owns qz001.
    // The reading order reverses those positions, so stamping after the sort
    // would give "a" the id whose audio belongs to "b".
    const legacy = output([
      quiz("a", { afterPageId: "pg001" }),
      quiz("b", { afterPageId: "pg002" }),
    ])

    const result = insert(legacy, quiz("new", { afterPageId: "pg003" }))

    const byQuestion = new Map(result.quizzes.map((q) => [q.question, q.quizId]))
    expect(byQuestion.get("a")).toBe("qz001")
    expect(byQuestion.get("b")).toBe("qz002")
    // The newcomer takes a fresh id rather than one already spoken for.
    expect(byQuestion.get("new")).toBe("qz003")
  })

  it("orders the set by reading position, not by source page", () => {
    const legacy = output([
      quiz("a", { afterPageId: "pg001" }),
      quiz("b", { afterPageId: "pg002" }),
    ])

    const result = insert(legacy, quiz("new", { afterPageId: "pg003" }))

    expect(result.quizzes.map((q) => q.question)).toEqual(["new", "b", "a"])
    expect(result.quizzes.map((q) => q.quizIndex)).toEqual([0, 1, 2])
  })

  it("does not hand a replaced quiz's id to the quiz replacing it", () => {
    const legacy = output([
      quiz("a", { afterPageId: "pg001" }),
      quiz("b", { afterPageId: "pg002" }),
    ])

    const result = insert(legacy, quiz("new", { afterPageId: "pg001" }), {
      placement: "replace",
      afterPageId: "pg001",
    })

    // "a" is gone; the newcomer must not inherit qz001's catalog entries.
    expect(result.quizzes.map((q) => q.question)).toEqual(["b", "new"])
    expect(result.quizzes.map((q) => q.quizId)).toEqual(["qz002", "qz003"])
  })

  it("sorts a quiz whose anchor page is gone to the end", () => {
    const existing = output([
      quiz("orphan", { afterPageId: "pg404", quizId: "qz001" }),
      quiz("kept", { afterPageId: "pg002", quizId: "qz002" }),
    ])

    const result = insert(existing, quiz("new", { afterPageId: "pg003" }))

    expect(result.quizzes.map((q) => q.question)).toEqual(["new", "kept", "orphan"])
  })

  it("starts a fresh set when the book has no quizzes yet", () => {
    const result = insert(null, quiz("first", { afterPageId: "pg001" }))

    expect(result.quizzes.map((q) => q.quizId)).toEqual(["qz001"])
    expect(result.generatedAt).toBe(FALLBACK.generatedAt)
  })
})
