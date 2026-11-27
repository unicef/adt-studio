/**
 * Auto mode (issue #333, experiment lane): recommend book settings from a PDF
 * before the book exists. Engine E3: measure the PDF, two AI readings, fixed
 * rulebook (packages/pipeline/src/setup-recommender).
 *
 * The book does not exist yet, so the AI calls' log entries are held in
 * memory with the recommendation. When the book is created with
 * `setupRecommendationId`, both are written into the book folder as
 * `setup-recommendation.json` (book-level storage, every prompt and response
 * inspectable).
 */
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { createLLMModel, formatProviderError, type LlmLogEntry } from "@adt/llm"
import { profileBookAsync, renderBookPages } from "@adt/pdf"
import { loadConfig, recommendSetup } from "@adt/pipeline"
import type { SetupRecommendation } from "@adt/types"
import { readProviderCredentials } from "../middleware/provider-credentials.js"

interface Held {
  recommendation: SetupRecommendation
  llmLog: LlmLogEntry[]
  createdAt: number
}

const HOLD_MS = 2 * 60 * 60 * 1000
const MAX_HELD = 20
const held = new Map<string, Held>()

function prune(now = Date.now()) {
  for (const [id, h] of held) if (now - h.createdAt > HOLD_MS) held.delete(id)
  while (held.size > MAX_HELD) held.delete(held.keys().next().value!)
}

/**
 * Writes a held recommendation and its AI log into a new book's folder. Called
 * by POST /books. Returns false when the id is unknown or expired.
 */
export function attachSetupRecommendation(
  id: string,
  bookDir: string,
  applied: { config: Record<string, unknown> | undefined },
): boolean {
  prune()
  const h = held.get(id)
  if (!h) return false
  fs.writeFileSync(
    path.join(bookDir, "setup-recommendation.json"),
    JSON.stringify({ recommendation: h.recommendation, appliedConfig: applied.config ?? null, llmLog: h.llmLog }, null, 2),
  )
  held.delete(id)
  return true
}

export function createSetupRecommendationRoutes(booksDir: string, configPath?: string): Hono {
  const app = new Hono()

  // POST /setup-recommendation — multipart `pdf`. Returns the recommendation.
  app.post("/setup-recommendation", async (c) => {
    const formData = await c.req.formData()
    const pdf = formData.get("pdf")
    if (!(pdf instanceof File)) throw new HTTPException(400, { message: "pdf file is required" })
    const buffer = new Uint8Array(await pdf.arrayBuffer())

    const config = loadConfig(configPath)
    const modelId = process.env.ADT_SETUP_RECOMMENDER_MODEL || config.default_model || "openai:gpt-5.4"
    const llmLog: LlmLogEntry[] = []
    const model = createLLMModel({
      modelId,
      cacheDir: path.join(path.resolve(booksDir), ".cache", "setup-recommender"),
      onLog: (entry) => llmLog.push(entry),
      providerCredentials: readProviderCredentials(c),
      logLevel: "silent",
    })

    let profile
    try {
      profile = await profileBookAsync(buffer, { signal: c.req.raw.signal })
    } catch (err) {
      // The client went away (a new PDF, or the page closed): nothing to answer.
      if (c.req.raw.signal.aborted) throw err
      throw new HTTPException(400, { message: `Could not read the PDF: ${err instanceof Error ? err.message : String(err)}` })
    }

    try {
      const recommendation = await recommendSetup({
        id: randomUUID(),
        model,
        modelId,
        profile,
        renderPages: (pages, size) => renderBookPages(buffer, pages, size),
        signal: c.req.raw.signal,
      })
      prune()
      held.set(recommendation.id, { recommendation, llmLog, createdAt: Date.now() })
      return c.json(recommendation)
    } catch (err) {
      if (c.req.raw.signal.aborted) throw err
      throw new HTTPException(502, { message: formatProviderError(err) })
    }
  })

  return app
}
