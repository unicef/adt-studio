import path from "node:path"
import crypto from "node:crypto"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { createBookStorage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import {
  loadBookConfig,
  collectMathSpeechEntries,
  evaluateMathSpeech,
  latexToSpeech,
} from "@adt/pipeline"
import {
  TextCatalogOutput,
  parseBookLabel,
  resolveMathSpeechEvaluationConfig,
  type MathSpeechEvaluationResult,
} from "@adt/types"
import type { TaskService } from "../services/task-service.js"
import {
  getMathSpeechEvaluation,
  saveMathSpeechEvaluation,
  withAcceptedAnyway,
  withResolvedText,
  withClearedDecision,
  pendingReviewItems,
} from "../services/math-speech-evaluation-service.js"

/**
 * Review queue for how maths is read aloud.
 *
 * Entries reach this queue only when the deterministic walker and the judge
 * disagree, so the volume is small — 3 of 536 entries on the Std 5 maths book.
 * Nothing here rewrites what is spoken on its own: a reviewer either keeps the
 * walker's output or supplies the wording to use.
 */

const LanguageParam = z.string().min(1).max(35).regex(/^[A-Za-z0-9_-]+$/)

const ResolveBody = z.object({
  resolved_text: z.string().min(1).max(2000),
})

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function parseLanguage(language: string): string {
  const parsed = LanguageParam.safeParse(language)
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message })
  }
  return parsed.data
}

function getBearerToken(authorizationHeader: string | undefined): string {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ""
}

/**
 * Credentials for the run. The judge model is configurable, so which key
 * matters depends on the provider it names — the client picks.
 */
function getProviderCredentialsFromRequest(c: {
  req: { header: (name: string) => string | undefined }
}): {
  anthropicApiKey?: string
  googleApiKey?: string
  customBaseUrl?: string
  customApiKey?: string
} {
  return {
    anthropicApiKey: c.req.header("X-Anthropic-API-Key")?.trim() || undefined,
    googleApiKey: c.req.header("X-Google-API-Key")?.trim() || undefined,
    customBaseUrl: c.req.header("X-Custom-Base-URL")?.trim() || undefined,
    customApiKey: c.req.header("X-Custom-API-Key")?.trim() || undefined,
  }
}

function getOpenAIApiKeyFromRequest(c: {
  req: { header: (name: string) => string | undefined }
}): string {
  return c.req.header("X-OpenAI-Key")?.trim()
    || c.req.header("X-ADT-OpenAI-Key")?.trim()
    || getBearerToken(c.req.header("Authorization"))
    || process.env.OPENAI_API_KEY?.trim()
    || ""
}

/** Changing the judge or its instructions invalidates stored verdicts, so the
 *  hash covers everything that could change a verdict. */
function buildEvalConfigHash(config: {
  judge_model: string
  max_retries: number
  temperature: number
  judge_instructions: string
  additional_guidance: string | null
  generate_suggestions: boolean
  evaluate_all_entries: boolean
}): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex")
    .slice(0, 32)
}

export function createMathSpeechEvaluationRoutes(
  booksDir: string,
  promptsDir: string,
  configPath?: string,
  taskService?: TaskService,
): Hono {
  const app = new Hono()

  app.get("/books/:label/evaluations/math-speech/:language", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const safeLanguage = parseLanguage(c.req.param("language"))
    const stored = getMathSpeechEvaluation(safeLabel, booksDir, safeLanguage)

    // The stored text is LaTeX, which tells a reviewer nothing about how it
    // will sound. The conversion only exists in the pipeline, so the spoken
    // form is computed here and sent with the verdict — the Studio cannot
    // import the converter itself.
    let mathsEntries = 0
    const spoken: Record<string, string> = {}
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const row = storage.getLatestNodeData("text-catalog", "book")
      const parsed = row ? TextCatalogOutput.safeParse(row.data) : null
      if (parsed?.success) {
        for (const entry of parsed.data.entries) {
          const converted = latexToSpeech(entry.text)
          if (converted === entry.text) continue
          mathsEntries++
          spoken[entry.id] = converted
        }
      }
    } finally {
      storage.close()
    }

    return c.json({
      ...stored,
      mathsEntries,
      spoken,
      pending: pendingReviewItems(stored.evaluation).length,
      // A verdict taken against an older catalog may no longer describe the
      // current text, so the client can prompt for a re-run.
      stale:
        stored.evaluation !== null &&
        stored.currentCatalogVersion !== null &&
        stored.evaluation.catalog_version !== stored.currentCatalogVersion,
    })
  })

  app.post(
    "/books/:label/evaluations/math-speech/:language/items/:entryId/accept-anyway",
    (c) => {
      const safeLabel = safeParseLabel(c.req.param("label"))
      const safeLanguage = parseLanguage(c.req.param("language"))
      const entryId = decodeURIComponent(c.req.param("entryId"))
      const stored = getMathSpeechEvaluation(safeLabel, booksDir, safeLanguage)
      if (!stored.evaluation) {
        throw new HTTPException(404, {
          message: `Maths speech evaluation not found for language: ${safeLanguage}`,
        })
      }
      const saved = saveMathSpeechEvaluation(
        safeLabel,
        booksDir,
        withAcceptedAnyway(stored.evaluation, entryId),
      )
      return c.json({ version: saved.version, evaluation: saved.evaluation })
    },
  )

  app.post(
    "/books/:label/evaluations/math-speech/:language/items/:entryId/resolve",
    async (c) => {
      const safeLabel = safeParseLabel(c.req.param("label"))
      const safeLanguage = parseLanguage(c.req.param("language"))
      const entryId = decodeURIComponent(c.req.param("entryId"))
      const body = ResolveBody.safeParse(await c.req.json().catch(() => null))
      if (!body.success) {
        throw new HTTPException(400, { message: body.error.message })
      }

      const stored = getMathSpeechEvaluation(safeLabel, booksDir, safeLanguage)
      if (!stored.evaluation) {
        throw new HTTPException(404, {
          message: `Maths speech evaluation not found for language: ${safeLanguage}`,
        })
      }
      const saved = saveMathSpeechEvaluation(
        safeLabel,
        booksDir,
        withResolvedText(stored.evaluation, entryId, body.data.resolved_text.trim()),
      )
      return c.json({ version: saved.version, evaluation: saved.evaluation })
    },
  )

  app.post(
    "/books/:label/evaluations/math-speech/:language/items/:entryId/clear",
    (c) => {
      const safeLabel = safeParseLabel(c.req.param("label"))
      const safeLanguage = parseLanguage(c.req.param("language"))
      const entryId = decodeURIComponent(c.req.param("entryId"))
      const stored = getMathSpeechEvaluation(safeLabel, booksDir, safeLanguage)
      if (!stored.evaluation) {
        throw new HTTPException(404, {
          message: `Maths speech evaluation not found for language: ${safeLanguage}`,
        })
      }
      const saved = saveMathSpeechEvaluation(
        safeLabel,
        booksDir,
        withClearedDecision(stored.evaluation, entryId),
      )
      return c.json({ version: saved.version, evaluation: saved.evaluation })
    },
  )

  app.post("/books/:label/evaluations/math-speech/:language/run", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    const safeLanguage = parseLanguage(c.req.param("language"))
    const apiKey = getOpenAIApiKeyFromRequest(c)
    const providerCredentials = getProviderCredentialsFromRequest(c)
    const config = configPath ? loadBookConfig(safeLabel, booksDir, configPath) : null
    const resolved = resolveMathSpeechEvaluationConfig(config?.math_speech_evaluation)

    if (!resolved.enable_math_speech_evaluation) {
      throw new HTTPException(409, {
        message: "Maths speech evaluation is disabled for this book",
      })
    }
    if (!taskService) {
      throw new HTTPException(503, { message: "Task service unavailable" })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    let entries: Array<{ id: string; text: string }>
    let catalogVersion: number
    try {
      const row = storage.getLatestNodeData("text-catalog", "book")
      if (!row) {
        throw new HTTPException(404, { message: "Text catalog not found for this book" })
      }
      const parsed = TextCatalogOutput.safeParse(row.data)
      if (!parsed.success) {
        throw new HTTPException(409, { message: "Stored text catalog data is invalid" })
      }
      entries = parsed.data.entries
      catalogVersion = row.version
    } finally {
      storage.close()
    }

    const evalConfigHash = buildEvalConfigHash(resolved)

    // Nothing has changed since the stored verdict, so re-judging would spend
    // tokens to reach the same answer and would discard reviewer decisions.
    const stored = getMathSpeechEvaluation(safeLabel, booksDir, safeLanguage)
    const force = c.req.query("force") === "true"
    if (
      !force &&
      stored.evaluation &&
      stored.evaluation.catalog_version === catalogVersion &&
      stored.evaluation.eval_config_hash === evalConfigHash
    ) {
      return c.json({
        status: "current",
        taskId: null,
        label: safeLabel,
        language: safeLanguage,
        version: stored.version,
      })
    }

    const { candidates, convertedCount } = collectMathSpeechEntries(
      entries.map((e) => ({ id: e.id, text: e.text })),
      { evaluateAll: resolved.evaluate_all_entries },
    )

    // Nothing the walker was unsure about — record that rather than leaving a
    // stale verdict from an earlier catalog in place.
    if (candidates.length === 0) {
      const empty: MathSpeechEvaluationResult = {
        generated_at: new Date().toISOString(),
        provider: "adt-llm",
        language: safeLanguage,
        catalog_version: catalogVersion,
        eval_config_hash: evalConfigHash,
        summary: {
          total: 0,
          acceptable: 0,
          unacceptable: 0,
          not_evaluated: convertedCount,
        },
        items: [],
      }
      const saved = saveMathSpeechEvaluation(safeLabel, booksDir, empty)
      return c.json({
        status: "current",
        taskId: null,
        label: safeLabel,
        language: safeLanguage,
        version: saved.version,
      })
    }

    const { taskId } = taskService.submitTask(
      safeLabel,
      "math-speech-evaluation",
      `Checking how maths is read aloud for ${safeLanguage}`,
      async (emitProgress) => {
        emitProgress("Preparing maths entries", 20)

        const bookPromptsDir = path.join(booksDir, safeLabel, "prompts")
        const cacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
        const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
        const bookStorage = createBookStorage(safeLabel, booksDir)

        try {
          const model = createLLMModel({
            modelId: resolved.judge_model,
            credentials: { openaiApiKey: apiKey, ...providerCredentials },
            cacheDir,
            promptEngine,
            onLog: (entry) => bookStorage.appendLlmLog(entry),
          })

          emitProgress("Comparing spoken maths against the source", 50)
          const result = await evaluateMathSpeech(model, {
            entries: candidates,
            config: resolved,
            language: safeLanguage,
            catalogVersion,
            evalConfigHash,
            bookLanguage: safeLanguage,
            notEvaluated: convertedCount - candidates.length,
          })

          emitProgress("Saving results", 85)
          const saved = saveMathSpeechEvaluation(safeLabel, booksDir, result)

          emitProgress("Maths speech check completed", 100)
          return {
            language: safeLanguage,
            version: saved.version,
            flagged: result.summary.unacceptable,
          }
        } finally {
          bookStorage.close()
        }
      },
    )

    return c.json({
      status: "queued",
      taskId,
      label: safeLabel,
      language: safeLanguage,
      candidates: candidates.length,
    })
  })

  return app
}
