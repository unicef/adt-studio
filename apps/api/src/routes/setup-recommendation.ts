/**
 * Auto mode (issue #333): recommend book settings from a PDF
 * before the book exists. Engine E3: measure the PDF, two AI readings, fixed
 * rulebook (packages/pipeline/src/setup-recommender).
 *
 * The book does not exist yet, so the AI calls' log entries are held in
 * memory with the recommendation. When the book is created with
 * `setupRecommendationId`, the recommendation is written into the book folder
 * as `setup-recommendation.json` and the log entries into the book's LLM log
 * (book-level storage, every prompt and response inspectable in the app's
 * LLM log). A recommendation no book is made from is dropped with its log.
 *
 * The AI answers are cached in `<booksDir>/.cache/setup-recommender`, shared by
 * every PDF (there is no book folder yet); entries written more than
 * SETUP_CACHE_MAX_AGE_MS ago are removed.
 */
import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { z } from "zod"
import { AiProviderError, createLLMModel, createPromptEngine, createRateLimiter, formatProviderError, type LlmLogEntry } from "@adt/llm"
import { profileBookAsync, renderBookPagesAsync } from "@adt/pdf"
import { createSemaphore, loadConfig, recommendSetup } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { DEFAULT_LLM_MODEL_ID, type SetupRecommendation, type SetupRecommendationErrorCode } from "@adt/types"
import { readProviderCredentials } from "../middleware/provider-credentials.js"

interface Held {
  recommendation: SetupRecommendation
  llmLog: LlmLogEntry[]
  createdAt: number
  /** sha256 of the PDF it was made from: it is saved only into a book made from that same PDF. */
  pdfHash: string
}

/** The largest PDF read here (the same cap as a project ZIP import). */
export const SETUP_PDF_MAX_BYTES = 512 * 1024 * 1024

const SetupRecommendationForm = z.object({
  pdf: z
    .instanceof(File, { message: "pdf file is required" })
    .refine((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"), "pdf must be a PDF file"),
})

/** A page of the PDF couldn't be drawn: the PDF's problem, not the AI service's. */
class PdfRenderError extends Error {}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

/**
 * PDFs profiled or drawn here at once. Each one is copied into mupdf's memory for that (up to
 * SETUP_PDF_MAX_BYTES each), so more wait their turn instead of piling up. The AI calls aren't limited.
 */
const PDF_READS_AT_ONCE = 2
const pdfReads = createSemaphore(PDF_READS_AT_ONCE)

const HOLD_MS = 2 * 60 * 60 * 1000
const MAX_HELD = 20
const held = new Map<string, Held>()

function prune(now = Date.now()) {
  for (const [id, h] of held) if (now - h.createdAt > HOLD_MS) held.delete(id)
  while (held.size > MAX_HELD) held.delete(held.keys().next().value!)
}

/** Shared AI cache entries written longer ago than this are removed (checked at most once per SETUP_CACHE_PRUNE_EVERY_MS). */
export const SETUP_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const SETUP_CACHE_PRUNE_EVERY_MS = 60 * 60 * 1000
let cachePrunedAt = 0

/** Removes cache entries older than SETUP_CACHE_MAX_AGE_MS. Best effort: a file it can't read or remove stays. */
export function pruneSetupCache(cacheDir: string, now = Date.now()): void {
  let names: string[]
  try {
    names = fs.readdirSync(cacheDir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    const file = path.join(cacheDir, name)
    try {
      if (now - fs.statSync(file).mtimeMs > SETUP_CACHE_MAX_AGE_MS) fs.rmSync(file, { force: true })
    } catch {
      // Another request may be using or removing it.
    }
  }
}

/**
 * Saves a held recommendation with a new book: the recommendation into its
 * folder, its AI calls into its LLM log. Called by POST /books with the book's
 * PDF. "expired" when the id is unknown or expired; "other-pdf" when it was
 * made from a different PDF (nothing saved).
 */
export function attachSetupRecommendation(
  id: string,
  book: { label: string; booksDir: string },
  applied: { config: Record<string, unknown> | undefined; pdf: Uint8Array },
): "attached" | "expired" | "other-pdf" {
  prune()
  const h = held.get(id)
  if (!h) return "expired"
  if (h.pdfHash !== sha256(applied.pdf)) return "other-pdf"
  const storage = createBookStorage(book.label, book.booksDir)
  try {
    for (const entry of h.llmLog) storage.appendLlmLog(entry)
  } finally {
    storage.close()
  }
  fs.writeFileSync(
    path.join(path.resolve(book.booksDir), book.label, "setup-recommendation.json"),
    JSON.stringify({ recommendation: h.recommendation, appliedConfig: applied.config ?? null }, null, 2),
  )
  held.delete(id)
  return "attached"
}

export function createSetupRecommendationRoutes(booksDir: string, promptsDir: string, configPath?: string): Hono {
  const app = new Hono()

  // POST /setup-recommendation — multipart `pdf`. Returns the recommendation.
  const setupBodyLimit = bodyLimit({
    maxSize: SETUP_PDF_MAX_BYTES + 1024 * 1024,
    onError: (c) => c.json({ error: `The PDF is larger than ${SETUP_PDF_MAX_BYTES / 1024 / 1024} MiB`, code: "pdf-too-large" satisfies SetupRecommendationErrorCode }, 413),
  })

  app.post("/setup-recommendation", setupBodyLimit, async (c) => {
    /** Every failure answers with a `code` (SetupRecommendationErrorCode), so Studio never guesses from the words. */
    const failed = (status: ContentfulStatusCode, code: SetupRecommendationErrorCode, error: string) => c.json({ error, code }, status)

    const formData = await c.req.formData()
    const form = SetupRecommendationForm.safeParse({ pdf: formData.get("pdf") })
    if (!form.success) return failed(400, "pdf-invalid", form.error.issues[0]?.message ?? "pdf file is required")
    const buffer = new Uint8Array(await form.data.pdf.arrayBuffer())

    const config = loadConfig(configPath)
    const modelId = process.env.ADT_SETUP_RECOMMENDER_MODEL || config.default_model || DEFAULT_LLM_MODEL_ID
    const llmLog: LlmLogEntry[] = []
    // No book yet, so no book prompts: the global prompts/setup_recommender_*.liquid.
    const promptEngine = createPromptEngine([promptsDir], { basePromptModelId: config.base_prompt_model })
    const cacheDir = path.join(path.resolve(booksDir), ".cache", "setup-recommender")
    if (Date.now() - cachePrunedAt > SETUP_CACHE_PRUNE_EVERY_MS) {
      cachePrunedAt = Date.now()
      pruneSetupCache(cacheDir)
    }
    const model = createLLMModel({
      modelId,
      cacheDir,
      promptEngine,
      rateLimiter: config.rate_limit ? createRateLimiter(config.rate_limit.requests_per_minute) : undefined,
      onLog: (entry) => llmLog.push(entry),
      providerCredentials: readProviderCredentials(c),
      logLevel: "silent",
    })

    const signal = c.req.raw.signal
    let profile
    try {
      profile = await pdfReads.run(() => profileBookAsync(buffer, { signal }), signal)
    } catch (err) {
      // The client went away (a new PDF, or the page closed): nothing to answer.
      if (signal.aborted) throw err
      return failed(400, "pdf-unreadable", `Could not read the PDF: ${err instanceof Error ? err.message : String(err)}`)
    }
    // Nothing to show the AI: don't call it with no pages.
    if (profile.pageCount === 0) return failed(422, "pdf-no-pages", "The PDF has no pages")

    try {
      const recommendation = await recommendSetup({
        id: randomUUID(),
        model,
        modelId,
        profile,
        renderPages: (sets) =>
          pdfReads.run(() => renderBookPagesAsync(buffer, sets, { signal }), signal).catch((err: unknown) => {
            if (signal.aborted) throw err
            throw new PdfRenderError(err instanceof Error ? err.message : String(err))
          }),
        signal,
      })
      prune()
      held.set(recommendation.id, { recommendation, llmLog, createdAt: Date.now(), pdfHash: sha256(buffer) })
      return c.json(recommendation)
    } catch (err) {
      if (signal.aborted) throw err
      // Pages that couldn't be drawn are the PDF's fault; anything else came from the AI service
      // (both readings failed: an error, a timeout, or answers that never fit the expected shape).
      if (err instanceof PdfRenderError) return failed(422, "pdf-pages-unreadable", `Could not read the PDF's pages: ${err.message}`)
      // A provider that isn't set up (no key, unknown model): the shared handler answers 400/422 with its code.
      if (AiProviderError.is(err)) throw err
      return failed(502, "ai-provider-failed", formatProviderError(err))
    }
  })

  return app
}
