import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createQuizRoutes } from "./quizzes.js"
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
