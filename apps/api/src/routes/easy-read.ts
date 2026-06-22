import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { EasyReadOutput, parseBookLabel, TTSOutput, WordTimestampOutput } from "@adt/types"
import type { BookMetadata, EasyReadOutput as EasyReadOutputType } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import {
  buildEasyReadConfig,
  buildEasyReadSourceBlocks,
  flattenEasyReadEntries,
  generateEasyRead,
  loadBookConfig,
  normalizeLocale,
} from "@adt/pipeline"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"

function getDbPath(label: string, booksDir: string): string {
  const safeLabel = parseBookLabel(label)
  return path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)
}

function readLanguage(
  metadata: BookMetadata | null,
  config: ReturnType<typeof loadBookConfig>,
): string {
  return normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")
}

function getEasyReadTextMap(output: EasyReadOutputType | null | undefined): Map<string, string> {
  return new Map(flattenEasyReadEntries(output).map((entry) => [entry.id, entry.text]))
}

function parseStoredEasyRead(value: unknown): EasyReadOutputType | undefined {
  const parsed = EasyReadOutput.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function getChangedEasyReadIds(
  previous: EasyReadOutputType | null | undefined,
  next: EasyReadOutputType,
): Set<string> {
  const previousMap = getEasyReadTextMap(previous)
  const nextMap = getEasyReadTextMap(next)
  const changedIds = new Set<string>()

  for (const [id, previousText] of previousMap) {
    if (nextMap.get(id) !== previousText) {
      changedIds.add(id)
    }
  }
  for (const id of nextMap.keys()) {
    if (!previousMap.has(id)) {
      changedIds.add(id)
    }
  }

  return changedIds
}

function pruneSpeechEntriesForTextIds(
  storage: ReturnType<typeof createBookStorage>,
  textIds: Set<string>,
): boolean {
  if (textIds.size === 0) return false

  let changed = false
  const fingerprint = storage.getNodeVersionFingerprint()
  const generatedAt = new Date().toISOString()

  for (const { node, itemId } of fingerprint) {
    if (node !== "tts" && node !== "tts-timestamps") continue

    const row = storage.getLatestNodeData(node, itemId)
    if (!row) continue

    if (node === "tts") {
      const parsed = TTSOutput.safeParse(row.data)
      if (!parsed.success) continue

      const nextEntries = parsed.data.entries.filter((entry) => !textIds.has(entry.textId))
      if (nextEntries.length === parsed.data.entries.length) continue

      storage.putNodeData("tts", itemId, {
        ...parsed.data,
        entries: nextEntries,
        generatedAt,
      })
      changed = true
      continue
    }

    const parsed = WordTimestampOutput.safeParse(row.data)
    if (!parsed.success) continue

    const nextEntries = Object.fromEntries(
      Object.entries(parsed.data.entries).filter(([textId]) => !textIds.has(textId)),
    )
    if (Object.keys(nextEntries).length === Object.keys(parsed.data.entries).length) continue

    storage.putNodeData("tts-timestamps", itemId, {
      ...parsed.data,
      entries: nextEntries,
      generatedAt,
    })
    changed = true
  }

  return changed
}

function clearEasyReadDependents(
  storage: ReturnType<typeof createBookStorage>,
  previous: EasyReadOutputType | null | undefined,
  next: EasyReadOutputType,
): void {
  const changedIds = getChangedEasyReadIds(previous, next)
  if (changedIds.size === 0) return

  pruneSpeechEntriesForTextIds(storage, changedIds)

  storage.clearNodesByType([
    "text-catalog-translation",
    "accessibility-assessment",
  ])

  // Easy Read audio is always (re)generated when Easy Read is enabled, so a
  // change to the easy-read texts must invalidate speech + timestamps too.
  storage.clearStepRuns([
    "catalog-translation",
    "image-translation",
    "package-web",
    "accessibility-assessment",
    "tts",
    "word-timestamps",
  ])
}

export function createEasyReadRoutes(
  booksDir: string,
  promptsDir: string,
  configPath?: string,
): Hono {
  const app = new Hono()

  app.get("/books/:label/easy-read", (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = getDbPath(safeLabel, booksDir)
    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const row = storage.getLatestNodeData("easy-read", "book")
      if (!row) return c.json(null)
      const parsed = EasyReadOutput.safeParse(row.data)
      if (!parsed.success) {
        throw new HTTPException(500, {
          message: `Stored Easy Read data is invalid: ${parsed.error.message}`,
        })
      }
      return c.json({ ...parsed.data, version: row.version })
    } finally {
      storage.close()
    }
  })

  app.put("/books/:label/easy-read", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const body = await c.req.json()
    const parsed = EasyReadOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid Easy Read data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const previousRow = storage.getLatestNodeData("easy-read", "book")
      const previousEasyRead = parseStoredEasyRead(previousRow?.data)
      const version = storage.putNodeData("easy-read", "book", parsed.data)
      clearEasyReadDependents(storage, previousEasyRead, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  app.post("/books/:label/easy-read/regenerate", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, {
        message: "API key required. Set X-OpenAI-Key header.",
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const config = loadBookConfig(safeLabel, booksDir, configPath)
      const metadataRow = storage.getLatestNodeData("metadata", "book")
      const metadata = metadataRow?.data as BookMetadata | null
      const language = readLanguage(metadata, config)
      const easyReadConfig = {
        ...buildEasyReadConfig(config, language),
        enabled: true,
      }

      const pages = storage.getPages()
      const blocks = buildEasyReadSourceBlocks(storage, pages)
      const cacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
      const bookPromptsDir = path.join(path.resolve(booksDir), safeLabel, "prompts")
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
      const rateLimiter = config.rate_limit
        ? createRateLimiter(config.rate_limit.requests_per_minute)
        : undefined
      const previousKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = apiKey
      try {
        const model = createLLMModel({
          modelId: easyReadConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: (entry) => storage.appendLlmLog(entry),
        })
        const output: EasyReadOutputType = await generateEasyRead(blocks, easyReadConfig, model, {
          concurrency: config.concurrency ?? 32,
        })
        const previousRow = storage.getLatestNodeData("easy-read", "book")
        const previousEasyRead = parseStoredEasyRead(previousRow?.data)
        const version = storage.putNodeData("easy-read", "book", output)
        clearEasyReadDependents(storage, previousEasyRead, output)
        return c.json({ ...output, version })
      } finally {
        if (previousKey !== undefined) {
          process.env.OPENAI_API_KEY = previousKey
        } else {
          delete process.env.OPENAI_API_KEY
        }
      }
    } finally {
      storage.close()
    }
  })

  return app
}
