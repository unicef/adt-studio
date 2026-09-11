import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createQuizRoutes, orderQuizzesForInsert } from "./quizzes.js"
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

/** Write straight to storage, bypassing the route — the only way to set up a
 *  book whose stored quizzes have no ids, as every book did before `quizId`. */
function seedQuizzes(body: QuizGenerationOutput) {
  seedRaw(body)
}

/** `seedQuizzes` without the schema, for versions today's schema rejects. */
function seedRaw(body: unknown) {
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putNodeData("quiz-generation", "book", body)
  } finally {
    storage.close()
  }
}

async function getQuizzes(): Promise<QuizGenerationOutput> {
  const res = await app.request(`/api/books/${label}/quizzes`)
  expect(res.status).toBe(200)
  return (await res.json()).quizzes as QuizGenerationOutput
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

  it("reserves ids held by a version today's schema no longer accepts", async () => {
    // A superseded version whose quizzes don't satisfy the current schema (here
    // two options where three are required) still burned the ids it holds. If
    // the reservation validates each version and skips the ones that fail, that
    // version's ids look free and get handed straight back out.
    seedRaw({
      generatedAt: "2026-01-01T00:00:00.000Z",
      language: "en",
      pagesPerQuiz: 3,
      quizzes: [
        {
          quizId: "qz002",
          quizIndex: 0,
          afterPageId: "pg001",
          pageIds: ["pg001"],
          question: "retired",
          options: [
            { text: "a", explanation: "" },
            { text: "b", explanation: "" },
          ],
          answerIndex: 0,
          reasoning: "",
        },
      ],
    })
    seedQuizzes(output([quiz("one", { quizId: "qz001" })]))

    const fetched = await getQuizzes()
    const res = await putQuizzes({
      ...fetched,
      quizzes: [...fetched.quizzes, quiz("newcomer")],
    })
    expect(res.status).toBe(200)

    const ids = storedQuizzes().map((q) => q.quizId)
    expect(ids).toEqual(["qz001", "qz003"])
    expect(ids).not.toContain("qz002")
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

describe("GET /api/books/:label/quizzes", () => {
  it("resolves ids for a book stored before quizId existed", async () => {
    seedQuizzes(output([quiz("one"), quiz("two")]))

    const got = await getQuizzes()

    // Exactly the ids `resolveQuizId` derives, so the catalog keys the UI shows
    // match the ones packaging and the text catalog already use.
    expect(got.quizzes.map((q) => q.quizId)).toEqual(["qz001", "qz002"])
  })

  it("does not persist a version just for being read", async () => {
    seedQuizzes(output([quiz("one")]))
    const before = storedQuizzes()

    await getQuizzes()

    expect(storedQuizzes()).toEqual(before)
    expect(storedQuizzes()[0].quizId).toBeUndefined()
  })
})

describe("legacy books whose first edit reorders the quizzes", () => {
  it("keeps each survivor's id when the first of three quizzes is deleted", async () => {
    // The regression this exists to prevent. A book with no stored ids: its
    // catalog entries, translations and audio are keyed qz001/qz002/qz003 by
    // array position. Deleting the first quiz shifts the survivors up, so
    // stamping the post-delete array would give them qz001/qz002 — the ids of
    // the quizzes that used to precede them.
    seedQuizzes(output([quiz("one"), quiz("two"), quiz("three")]))

    // The studio round-trips what GET handed it, minus the deleted quiz.
    const fetched = await getQuizzes()
    const res = await putQuizzes({
      ...fetched,
      quizzes: fetched.quizzes.slice(1),
    })
    expect(res.status).toBe(200)

    const saved = storedQuizzes()
    expect(saved.map((q) => q.question)).toEqual(["two", "three"])
    expect(saved.map((q) => q.quizId)).toEqual(["qz002", "qz003"])
  })

  it("keeps them when a quiz is inserted mid-book, and gives the newcomer a fresh id", async () => {
    seedQuizzes(output([quiz("one"), quiz("two"), quiz("three")]))

    const fetched = await getQuizzes()
    const res = await putQuizzes({
      ...fetched,
      quizzes: [fetched.quizzes[0], quiz("new"), ...fetched.quizzes.slice(1)],
    })
    expect(res.status).toBe(200)

    const saved = storedQuizzes()
    expect(saved.map((q) => q.question)).toEqual(["one", "new", "two", "three"])
    expect(saved.map((q) => q.quizId)).toEqual([
      "qz001",
      "qz004",
      "qz002",
      "qz003",
    ])
  })

  it("does not reissue an id the legacy version spent but never stored", async () => {
    // A legacy version records no quizIds at all, so the ids it spent exist
    // only as array positions. Deleting those quizzes on the *first* edit
    // retires qz001/qz002 without ever writing them into a stored version —
    // and a reservation that reads only stored `quizId` fields cannot see them.
    seedQuizzes(output([quiz("one"), quiz("two"), quiz("three")]))

    const fetched = await getQuizzes()
    await putQuizzes({ ...fetched, quizzes: fetched.quizzes.slice(2) })
    expect(storedQuizzes().map((q) => q.quizId)).toEqual(["qz003"])

    // Now add a quiz on an earlier page, so it sorts to the front and asks for
    // the lowest free sequence number.
    const afterDelete = await getQuizzes()
    const res = await putQuizzes({
      ...afterDelete,
      quizzes: [quiz("newcomer"), ...afterDelete.quizzes],
    })
    expect(res.status).toBe(200)

    const saved = storedQuizzes()
    expect(saved.map((q) => q.question)).toEqual(["newcomer", "three"])
    // qz001 and qz002 belong to the deleted quizzes for good — their
    // translations and generated audio are still on disk under those keys.
    expect(saved.map((q) => q.quizId)).toEqual(["qz004", "qz003"])
  })

  it("still stamps positional ids when an unstamped body re-saves the current version", async () => {
    // The counterpart to the test above: retiring a superseded version's
    // positional ids must not retire the *current* version's. A direct API
    // caller that PUTs the quizzes it has without ids is claiming this book's
    // existing qz001/qz002 — the keys its catalog is already written against —
    // not asking for two fresh ones.
    seedQuizzes(output([quiz("one"), quiz("two")]))

    const res = await putQuizzes(output([quiz("one"), quiz("two")]))
    expect(res.status).toBe(200)

    expect(storedQuizzes().map((q) => q.quizId)).toEqual(["qz001", "qz002"])
  })
})

describe("orderQuizzesForInsert", () => {
  /** The reader meets pg003 first, then pg002, then pg001 — a reordered book. */
  const REVERSED = new Map([
    ["pg003", 0],
    ["pg002", 1],
    ["pg001", 2],
  ])

  function order(
    existing: Quiz[],
    newQuiz: Quiz,
    over: Partial<Parameters<typeof orderQuizzesForInsert>[0]> = {},
  ) {
    return orderQuizzesForInsert({
      existing,
      newQuiz,
      placement: "after",
      afterPageId: newQuiz.afterPageId,
      readingRank: REVERSED,
      ...over,
    })
  }

  it("orders the set by reading position, not by source page", () => {
    const existing = [
      quiz("a", { afterPageId: "pg001", quizId: "qz001" }),
      quiz("b", { afterPageId: "pg002", quizId: "qz002" }),
    ]

    const result = order(existing, quiz("new", { afterPageId: "pg003" }))

    expect(result.map((q) => q.question)).toEqual(["new", "b", "a"])
  })

  it("drops the quizzes already at a position when replacing it", () => {
    const existing = [
      quiz("a", { afterPageId: "pg001", quizId: "qz001" }),
      quiz("b", { afterPageId: "pg002", quizId: "qz002" }),
    ]

    const result = order(existing, quiz("new", { afterPageId: "pg001" }), {
      placement: "replace",
      afterPageId: "pg001",
    })

    expect(result.map((q) => q.question)).toEqual(["b", "new"])
  })

  it("keeps quizzes sharing an anchor in order, with the newcomer last", () => {
    const existing = [
      quiz("first", { afterPageId: "pg002", quizId: "qz001" }),
      quiz("second", { afterPageId: "pg002", quizId: "qz002" }),
    ]

    const result = order(existing, quiz("new", { afterPageId: "pg002" }))

    expect(result.map((q) => q.question)).toEqual(["first", "second", "new"])
  })

  it("sorts a quiz whose anchor page is gone to the end", () => {
    const existing = [
      quiz("orphan", { afterPageId: "pg404", quizId: "qz001" }),
      quiz("kept", { afterPageId: "pg002", quizId: "qz002" }),
    ]

    const result = order(existing, quiz("new", { afterPageId: "pg003" }))

    expect(result.map((q) => q.question)).toEqual(["new", "kept", "orphan"])
  })

  it("starts a fresh set when the book has no quizzes yet", () => {
    const result = order([], quiz("first", { afterPageId: "pg001" }))

    expect(result.map((q) => q.question)).toEqual(["first"])
  })
})
