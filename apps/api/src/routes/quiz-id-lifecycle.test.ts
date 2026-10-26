import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { buildTextCatalog } from "@adt/pipeline"
import { errorHandler } from "../middleware/error-handler.js"
import { createQuizRoutes } from "./quizzes.js"
import type { Quiz, QuizGenerationOutput } from "@adt/types"

/**
 * The manual QA plan for stable quiz ids, run automatically.
 *
 * Quiz ids are not cosmetic: `${quizId}_que` / `${quizId}_o${n}` are the
 * text-catalog keys, those keys are what the translation step writes against,
 * and `speech.ts` names each generated audio file after the same key. So the
 * question every step below asks is the same one a human would ask while
 * clicking through the app: **does each quiz's text still answer to the id its
 * translations and audio files are already stored under?**
 *
 * That is why these assert on the catalog rather than on `quizId` alone — an id
 * that survives a delete but no longer keys the same question is exactly the
 * corruption being tested for, and comparing ids to ids would miss it.
 */

const label = "quiz-lifecycle"
let tmpDir: string
let app: Hono

function quiz(question: string, overrides: Partial<Quiz> = {}): Quiz {
  return {
    quizIndex: 0,
    afterPageId: "pg001",
    pageIds: ["pg001"],
    question,
    options: [
      { text: `${question}-a`, explanation: `${question}-a-why` },
      { text: `${question}-b`, explanation: `${question}-b-why` },
      { text: `${question}-c`, explanation: `${question}-c-why` },
    ],
    answerIndex: 0,
    reasoning: "",
    ...overrides,
  }
}

/** Every catalog entry `quiz(question)` contributes, filed under `id`. */
function entriesFor(id: string, question: string): Record<string, string> {
  const entries: Record<string, string> = { [`${id}_que`]: question }
  ;["a", "b", "c"].forEach((suffix, i) => {
    entries[`${id}_o${i}`] = `${question}-${suffix}`
    entries[`${id}_o${i}_exp`] = `${question}-${suffix}-why`
  })
  return entries
}

function output(quizzes: Quiz[]): QuizGenerationOutput {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    language: "en",
    pagesPerQuiz: 3,
    quizzes,
  }
}

function withStorage<T>(fn: (storage: ReturnType<typeof createBookStorage>) => T): T {
  const storage = createBookStorage(label, tmpDir)
  try {
    return fn(storage)
  } finally {
    storage.close()
  }
}

/**
 * Write quizzes straight to storage, bypassing the routes. The only way to set
 * up a book whose stored quizzes carry no `quizId` — the state every book was
 * in before the field existed, and the state the routes now stamp out of.
 */
function seedLegacyBook(quizzes: Quiz[]) {
  withStorage((storage) => {
    storage.putNodeData("quiz-generation", "book", output(quizzes))
  })
}

function storedQuizzes(): Quiz[] {
  return withStorage((storage) => {
    const row = storage.getLatestNodeData("quiz-generation", "book")
    return (row?.data as QuizGenerationOutput).quizzes
  })
}

/**
 * The `qz*` half of the text catalog, as `entryId -> text`.
 *
 * This is the map the translation step and the TTS step both key off, so it is
 * the ground truth for "would this quiz keep its translations and audio". A
 * legacy book with no stored ids produces exactly the same map it produced
 * before `quizId` existed, because `resolveQuizId` falls back to the position.
 */
async function quizCatalog(): Promise<Record<string, string>> {
  const catalog = await withStorage((storage) => buildTextCatalog(storage, []))
  return Object.fromEntries(
    catalog.entries
      .filter((e) => e.id.startsWith("qz"))
      .map((e) => [e.id, e.text])
  )
}

/** The audio filenames TTS would write for the current catalog. */
async function expectedAudioFilenames(): Promise<string[]> {
  return Object.keys(await quizCatalog())
    .map((id) => `${id}.mp3`)
    .sort()
}

async function getQuizzes(): Promise<QuizGenerationOutput> {
  const res = await app.request(`/api/books/${label}/quizzes`)
  expect(res.status).toBe(200)
  return (await res.json()).quizzes as QuizGenerationOutput
}

async function putQuizzes(body: QuizGenerationOutput) {
  const res = await app.request(`/api/books/${label}/quizzes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(200)
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-quiz-lifecycle-"))
  withStorage(() => {})

  app = new Hono()
  app.onError(errorHandler)
  app.route("/api", createQuizRoutes(tmpDir))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ── Plan §0/§1 — a book nobody edits must not change ────────────

describe("a legacy book nobody edits", () => {
  it("produces byte-identical catalog keys and audio filenames", async () => {
    seedLegacyBook([quiz("one"), quiz("two"), quiz("three")])

    // Exactly what this book produced before `quizId` existed. If this map ever
    // shifts, every stored translation and every generated .mp3 is now filed
    // under a key that names different content.
    expect(await quizCatalog()).toEqual({
      ...entriesFor("qz001", "one"),
      ...entriesFor("qz002", "two"),
      ...entriesFor("qz003", "three"),
    })
  })

  it("is not rewritten by being read", async () => {
    seedLegacyBook([quiz("one")])
    const before = storedQuizzes()

    await getQuizzes()

    // A GET that persisted a backfill would add a version to the history on
    // mere page load, and could disagree with the read paths after a rollback.
    expect(storedQuizzes()).toEqual(before)
    expect(storedQuizzes()[0].quizId).toBeUndefined()
  })
})

// ── Plan §2 — the first edit on a legacy book ───────────────────

describe("a legacy book's first edit", () => {
  it("keeps every survivor's translations and audio when the first quiz is deleted", async () => {
    seedLegacyBook([quiz("one"), quiz("two"), quiz("three")])
    const before = await quizCatalog()
    const audioBefore = await expectedAudioFilenames()

    // Exactly what the studio does: round-trip what GET handed it, minus one.
    const fetched = await getQuizzes()
    await putQuizzes({ ...fetched, quizzes: fetched.quizzes.slice(1) })

    const after = await quizCatalog()

    // "two" and "three" keep the keys their audio is already filed under.
    expect(after).toEqual({
      ...entriesFor("qz002", "two"),
      ...entriesFor("qz003", "three"),
    })

    // Stated the other way round, because this is the actual regression: no
    // surviving key may change the text it points at.
    for (const [id, text] of Object.entries(after)) {
      expect(before[id]).toBe(text)
    }

    // The deleted quiz's audio files are simply orphaned — never reassigned.
    const audioAfter = await expectedAudioFilenames()
    expect(audioAfter.every((f) => audioBefore.includes(f))).toBe(true)
    expect(audioAfter).not.toContain("qz001_que.mp3")
  })

  it("does not later hand a newcomer the audio of the quiz that first edit deleted", async () => {
    // The delete above orphans qz001's .mp3 files, and the legacy version that
    // spent qz001 never recorded it — the id lived only as an array position.
    // A quiz added afterwards must still not be able to claim it, or it
    // inherits a removed quiz's read-aloud in the packaged bundle.
    seedLegacyBook([quiz("one"), quiz("two"), quiz("three")])
    const audioBefore = await expectedAudioFilenames()

    const fetched = await getQuizzes()
    await putQuizzes({ ...fetched, quizzes: fetched.quizzes.slice(2) })

    // A quiz on an earlier page sorts to the front, so it asks for the lowest
    // free sequence number — qz001 unless qz001 is known to be spent.
    const afterDelete = await getQuizzes()
    await putQuizzes({
      ...afterDelete,
      quizzes: [quiz("newcomer"), ...afterDelete.quizzes],
    })

    const after = await quizCatalog()
    expect(after).toEqual({
      ...entriesFor("qz004", "newcomer"),
      ...entriesFor("qz003", "three"),
    })

    // Said as the filenames, which is where the damage would be visible: the
    // newcomer must not be voiced by any file the deleted quizzes left behind.
    const newcomerAudio = Object.keys(entriesFor("qz004", "newcomer")).map(
      (id) => `${id}.mp3`
    )
    for (const file of newcomerAudio) {
      expect(audioBefore).not.toContain(file)
    }
  })

  it("keeps them when a quiz is inserted mid-book, and gives the newcomer fresh files", async () => {
    seedLegacyBook([quiz("one"), quiz("two"), quiz("three")])
    const before = await quizCatalog()

    const fetched = await getQuizzes()
    await putQuizzes({
      ...fetched,
      quizzes: [fetched.quizzes[0], quiz("new"), ...fetched.quizzes.slice(1)],
    })

    const after = await quizCatalog()

    expect(storedQuizzes().map((q) => q.question)).toEqual([
      "one",
      "new",
      "two",
      "three",
    ])
    for (const [id, text] of Object.entries(before)) {
      expect(after[id]).toBe(text)
    }
    // The newcomer sits second in the book but takes the next free id, not the
    // id of whatever used to be second.
    expect(after.qz004_que).toBe("new")
  })

  it("keeps them when the quizzes are reordered without adding or removing any", async () => {
    seedLegacyBook([quiz("one"), quiz("two"), quiz("three")])
    const before = await quizCatalog()

    const fetched = await getQuizzes()
    await putQuizzes({
      ...fetched,
      quizzes: [...fetched.quizzes].reverse(),
    })

    expect(await quizCatalog()).toEqual(before)
    expect(storedQuizzes().map((q) => q.quizId)).toEqual([
      "qz003",
      "qz002",
      "qz001",
    ])
  })
})

// ── Plan §3 — a book that already carries ids ───────────────────

describe("a book that already carries ids", () => {
  beforeEach(async () => {
    seedLegacyBook([quiz("one"), quiz("two")])
    await putQuizzes(await getQuizzes())
  })

  it("leaves existing ids alone when a quiz is added at the front", async () => {
    const before = await quizCatalog()

    const fetched = await getQuizzes()
    await putQuizzes({
      ...fetched,
      quizzes: [quiz("new"), ...fetched.quizzes],
    })

    const after = await quizCatalog()
    for (const [id, text] of Object.entries(before)) {
      expect(after[id]).toBe(text)
    }
    expect(after.qz003_que).toBe("new")
  })

  it("never reissues the id of a deleted quiz, even versions later", async () => {
    const fetched = await getQuizzes()

    // Delete "two" (qz002) …
    await putQuizzes({ ...fetched, quizzes: [fetched.quizzes[0]] })
    // … then add two more quizzes across two separate versions.
    const afterDelete = await getQuizzes()
    await putQuizzes({
      ...afterDelete,
      quizzes: [...afterDelete.quizzes, quiz("three")],
    })
    const afterAdd = await getQuizzes()
    await putQuizzes({ ...afterAdd, quizzes: [...afterAdd.quizzes, quiz("four")] })

    const catalog = await quizCatalog()
    // qz002's translations and audio still exist on disk; handing that id to
    // new content would silently give it a removed quiz's read-aloud.
    expect(catalog.qz002_que).toBeUndefined()
    expect(storedQuizzes().map((q) => q.quizId)).toEqual([
      "qz001",
      "qz003",
      "qz004",
    ])
  })

  it("keeps ids stable across an unrelated content edit", async () => {
    const fetched = await getQuizzes()
    const edited = fetched.quizzes.map((q, i) =>
      i === 0 ? { ...q, question: "one, reworded" } : q
    )

    await putQuizzes({ ...fetched, quizzes: edited })

    const catalog = await quizCatalog()
    // Editing the text re-points the same key, which is what invalidates that
    // one entry's translation and audio — and only that one.
    expect(catalog.qz001_que).toBe("one, reworded")
    expect(catalog.qz002_que).toBe("two")
  })
})

// ── Plan §2/§3 — rollback ───────────────────────────────────────

describe("rollback", () => {
  it("serves the ids the restored version's catalog was written for", async () => {
    seedLegacyBook([quiz("one"), quiz("two"), quiz("three")])
    const legacyCatalog = await quizCatalog()

    // Move the book forward, then restore the original unstamped version by
    // pointing the current version back at it.
    const fetched = await getQuizzes()
    await putQuizzes({ ...fetched, quizzes: fetched.quizzes.slice(1) })
    withStorage((storage) =>
      expect(storage.setCurrentNodeVersion("quiz-generation", "book", 1)).toBe(true)
    )

    // The restored version has no stored ids, so every consumer — the catalog
    // here, and the UI through GET — must fall back to the same positional ids
    // that version's translations and audio were filed under.
    expect(await quizCatalog()).toEqual(legacyCatalog)
    const served = await getQuizzes()
    expect(served.quizzes.map((q) => q.quizId)).toEqual([
      "qz001",
      "qz002",
      "qz003",
    ])
  })
})
