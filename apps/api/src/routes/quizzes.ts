import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  parseBookLabel,
  QuizGenerationOutput,
  withResolvedQuizIds,
  QuizIdExhaustedError,
  QuizIdentityError,
  type Quiz,
  type WebRenderingOutput,
} from "@adt/types"
import { openBookDb, createBookStorage, readCurrentNodeRow, type Storage } from "@adt/storage"
import {
  resolveReadingOrder,
  readingOrderPageIds,
  buildQuizGenerationConfig,
  generateQuiz,
  saveQuizOutput,
  assertQuizGenerationCapacity,
  loadBookConfig,
  normalizeLocale,
  getRenderSectioning,
  type QuizPageInput,
} from "@adt/pipeline"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import { readProviderCredentials } from "../middleware/provider-credentials.js"

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Surface identity validation and allocation failures as client errors. */
function withQuizIdentityErrors<T>(operation: () => T): T {
  try {
    return operation()
  } catch (err) {
    if (err instanceof QuizIdExhaustedError || err instanceof QuizIdentityError) {
      throw new HTTPException(400, { message: err.message })
    }
    throw err
  }
}

function assertQuizzesIdle(storage: Storage): void {
  if (storage.getStepRuns().some((run) => run.step === "quiz-generation" && run.status === "running")) {
    throw new HTTPException(409, { message: "Quiz generation is currently running. Wait for it to finish before editing quizzes." })
  }
}

/**
 * Order the book's quiz set around a hand-added quiz.
 *
 * A position can hold several quizzes shown one after another: `"after"`
 * appends the newcomer behind any already there, `"replace"` drops them first.
 * The set is then ordered by where the reader *meets* each quiz's anchor page,
 * not by that page's source number — a reordered book puts the two in different
 * orders, and batching or placing by source order groups non-adjacent pages and
 * spaces the quizzes unevenly.
 *
 * Ordering only. Identity is the caller's job, and the sequence matters: the
 * stored set must already be id-resolved (`withResolvedQuizIds`) *before* it
 * reaches this function. A quiz predating `quizId` derives its id — and so its
 * `${quizId}_que` catalog entries, their translations and their generated audio
 * — from its position in the stored array, so stamping after this sort would
 * hand such a quiz whichever id used to belong to the quiz now in its place.
 * `saveQuizOutput(..., "insert")` allocates the newcomer's id and renumbers
 * `quizIndex` afterwards.
 *
 * Extracted from the route so the ordering is testable without an LLM call.
 */
export function orderQuizzesForInsert(opts: {
  /** The stored set, already id-resolved. */
  existing: readonly Quiz[]
  newQuiz: Quiz
  placement: "replace" | "after"
  afterPageId: string
  /** pageId → position in the book. Absent means the book has no such page. */
  readingRank: ReadonlyMap<string, number>
}): Quiz[] {
  const { existing, newQuiz, placement, afterPageId, readingRank } = opts

  const priorQuizzes =
    placement === "after"
      ? existing
      : existing.filter((quiz) => quiz.afterPageId !== afterPageId)

  const quizzes = [...priorQuizzes, newQuiz]
  quizzes.sort((a, b) => {
    // An anchor page the book no longer has sorts to the end, matching the TOC
    // sort in packaging rather than silently leading the book. Equality is
    // checked first because `Infinity - Infinity` is NaN, which would make the
    // comparator incoherent for two such quizzes. The sort is stable, so
    // quizzes sharing an anchor keep their relative order and the appended one
    // stays last among them.
    const rankA = readingRank.get(a.afterPageId) ?? Infinity
    const rankB = readingRank.get(b.afterPageId) ?? Infinity
    return rankA === rankB ? 0 : rankA - rankB
  })
  return quizzes
}

export function createQuizRoutes(
  booksDir: string,
  promptsDir?: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // GET /books/:label/quizzes — Get latest quizzes
  app.get("/books/:label/quizzes", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = path.join(
      path.resolve(booksDir),
      safeLabel,
      `${safeLabel}.db`
    )

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      // Current-pointer version (falls back to MAX) so a rollback is reflected.
      const row = readCurrentNodeRow(db, "quiz-generation", "book", { includeInvalidated: true })

      if (!row || row.data === "null") {
        // History selection survives invalidation; active output stays absent.
        return c.json({ quizzes: null, version: null, historyVersion: row?.version ?? null })
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(row.data)
      } catch {
        throw new HTTPException(500, {
          message: `Stored quiz data is corrupted for book: ${safeLabel}`,
        })
      }

      const validated = QuizGenerationOutput.safeParse(parsed)
      if (!validated.success) {
        throw new HTTPException(500, {
          message: `Stored quiz data is invalid for book: ${safeLabel}`,
        })
      }

      // Resolve ids on the way out so the client always holds them and can send
      // them back on a PUT. Deliberately a plain positional resolve — no
      // reserved-id allocation and no write: this is exactly what every read
      // path derives from the same stored array, so the ids the UI shows can
      // never diverge from the ids the pipeline uses.
      return c.json({
        quizzes: withResolvedQuizIds(validated.data),
        version: row.version,
        historyVersion: row.version,
      })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/quizzes — Update quizzes
  app.put("/books/:label/quizzes", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    const body = await c.req.json()
    const parsed = QuizGenerationOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid quiz data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      assertQuizzesIdle(storage)
      const { version } = withQuizIdentityErrors(() => saveQuizOutput(storage, parsed.data, "edit"))
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/quizzes/generate-one — Generate a single quiz from
  // a hand-picked set of pages and insert it at a chosen location.
  const GenerateOneBody = z.object({
    pageIds: z.array(z.string().min(1)).min(1).max(5),
    afterPageId: z.string().min(1),
    // "replace" swaps out the quiz(zes) already at this position; "after" stacks
    // the new quiz right after them so quizzes can sit consecutively (e.g. a run
    // of quizzes at the end of the book). Defaults to "replace" for back-compat.
    placement: z.enum(["replace", "after"]).optional().default("replace"),
  })

  app.post("/books/:label/quizzes/generate-one", async (c) => {
    if (!promptsDir) {
      throw new HTTPException(500, {
        message: "Server misconfigured: promptsDir not provided to quiz routes",
      })
    }

    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    const credentials = readProviderCredentials(c)

    const body = await c.req.json()
    const parsed = GenerateOneBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid body: ${parsed.error.message}`,
      })
    }
    const { pageIds, afterPageId, placement } = parsed.data

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      // A running quiz-generation stage rewrites the entire quiz set when it
      // finishes, so a quiz added mid-run would be silently clobbered. Reject
      // until the run completes (the UI also hides the entry points).
      assertQuizzesIdle(storage)

      const appConfig = loadBookConfig(safeLabel, booksDir, configPath)
      const metadataRow = storage.getLatestNodeData("metadata", "book")
      const metadata = metadataRow?.data as { language_code?: string | null } | null
      const language = normalizeLocale(
        appConfig.editing_language ?? metadata?.language_code ?? "en"
      )

      const quizConfig = buildQuizGenerationConfig(appConfig, language)
      if (!quizConfig) {
        throw new HTTPException(400, {
          message: "Quiz generation is not available: no editing language is set.",
        })
      }

      // Rank every page by where the reader meets it, so the selected pages are
      // fed to the LLM in book order and the resulting quiz is placed at the
      // right spot — both of which stop matching source page numbers as soon as
      // the user reorders the book.
      const readingRank = new Map<string, number>()
      readingOrderPageIds(resolveReadingOrder(storage, { includeQuizzes: false })).forEach(
        (pageId, index) => readingRank.set(pageId, index)
      )

      // Gather rendering + sectioning for the selected pages, in reading order.
      // A page with no reading position sorts last, matching the placement sort
      // in `orderQuizzesForInsert` — the two disagreeing would feed the LLM its
      // source pages in one order and anchor the resulting quiz by another.
      // Equality first: `Infinity - Infinity` is NaN.
      const orderedPageIds = [...new Set(pageIds)].sort((a, b) => {
        const rankA = readingRank.get(a) ?? Infinity
        const rankB = readingRank.get(b) ?? Infinity
        return rankA === rankB ? 0 : rankA - rankB
      })
      const batch: QuizPageInput[] = []
      for (const pageId of orderedPageIds) {
        const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
        const sectioning = getRenderSectioning(storage, pageId)
        if (!renderingRow || !sectioning) continue
        batch.push({
          pageId,
          rendering: renderingRow.data as WebRenderingOutput,
          sectioning,
        })
      }

      if (batch.length === 0) {
        throw new HTTPException(400, {
          message:
            "None of the selected pages have rendering data. Run Storyboard first.",
        })
      }

      const cacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
      const bookPromptsDir = path.join(path.resolve(booksDir), safeLabel, "prompts")
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir], { basePromptModelId: appConfig.base_prompt_model })
      const llmModel = createLLMModel({
        modelId: quizConfig.modelId,
        cacheDir,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
        providerCredentials: credentials,
      })

      withQuizIdentityErrors(() => assertQuizGenerationCapacity(storage, 1))
      const generated = await generateQuiz(batch, 0, quizConfig, llmModel)
      // The user chooses where the quiz lands, independent of its source pages.
      const newQuiz: Quiz = { ...generated, afterPageId }

      // Add to the existing quiz set (or start a fresh one). A position can hold
      // multiple quizzes shown one after another. With placement "after" the new
      // quiz is appended so it lands after any quizzes already at this position;
      // with "replace" the quiz(zes) currently at this position are dropped first.
      // Then re-order by book position and renumber so quizIndex stays sequential.
      //
      // The stored set's ids are pinned *before* the insert, not after: a book
      // that predates `quizId` derives its catalog keys from array position, so
      // stamping after the sort would hand the newcomer whichever id used to
      // belong to the quiz at its index — along with that quiz's translations
      // and generated audio.
      return storage.transaction(() => {
        assertQuizzesIdle(storage)
        const existingRow = storage.getLatestNodeData("quiz-generation", "book")
        const existing = existingRow
          ? withResolvedQuizIds(existingRow.data as QuizGenerationOutput)
          : null

        const quizzes = orderQuizzesForInsert({
          existing: existing?.quizzes ?? [],
          newQuiz,
          placement,
          afterPageId,
          readingRank,
        })

        // Only the newcomer still lacks an id; allocation reserves every
        // id this book has ever issued, so it cannot adopt a retired quiz's
        // catalog entries.
        const { output, version } = withQuizIdentityErrors(() => saveQuizOutput(
          storage,
          {
            generatedAt: existing?.generatedAt ?? new Date().toISOString(),
            language: existing?.language ?? quizConfig.language,
            pagesPerQuiz: existing?.pagesPerQuiz ?? quizConfig.pagesPerQuiz,
            quizzes,
          },
          "insert"
        ))

        // Adding a quiz by hand produces the same output as running the stage, so
        // mark the step done — otherwise the quizzes stage never lights up as
        // completed for books whose quizzes were all added one at a time.
        storage.markStepCompleted("quiz-generation")
        return c.json({ quiz: output.quizzes[quizzes.indexOf(newQuiz)], version })
      })
    } finally {
      storage.close()
    }
  })

  return app
}
