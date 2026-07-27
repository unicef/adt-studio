import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  GlossaryOutput,
  IMAGE_SET_CHANGE_CLEAR_NODE_TYPES,
  IMAGE_SET_CHANGE_CLEAR_STEPS,
  parseBookLabel,
} from "@adt/types"
import { openBookDb, createBookStorage } from "@adt/storage"
import {
  buildTextCatalog,
  buildGlossaryConfig,
  generateGlossaryItem,
  loadBookConfig,
  normalizeLocale,
} from "@adt/pipeline"
import { createLLMModel, createPromptEngine } from "@adt/llm"

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function activeGlossaryImageIds(glossary: GlossaryOutput | undefined): Set<string> {
  return new Set(
    glossary?.items
      .filter((item) => !item.pruned && item.imageId)
      .map((item) => item.imageId!) ?? [],
  )
}

function hasSameValues(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

export function createGlossaryRoutes(
  booksDir: string,
  promptsDir?: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // GET /books/:label/glossary — Get latest glossary
  app.get("/books/:label/glossary", (c) => {
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
      const rows = db.all(
        "SELECT data, version FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        ["glossary", "book"]
      ) as Array<{ data: string; version: number }>

      if (rows.length === 0) {
        return c.json(null)
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rows[0].data)
      } catch {
        throw new HTTPException(500, {
          message: `Stored glossary data is corrupted for book: ${safeLabel}`,
        })
      }

      const validated = GlossaryOutput.safeParse(parsed)
      if (!validated.success) {
        throw new HTTPException(500, {
          message: `Stored glossary data is invalid for book: ${safeLabel}`,
        })
      }

      return c.json({ ...validated.data, version: rows[0].version })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/glossary — Update glossary
  app.put("/books/:label/glossary", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    const body = await c.req.json()
    const parsed = GlossaryOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid glossary data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const previousRow = storage.getLatestNodeData("glossary", "book")
      const previous = GlossaryOutput.safeParse(previousRow?.data)
      const imageRequirementsChanged = !hasSameValues(
        activeGlossaryImageIds(previous.success ? previous.data : undefined),
        activeGlossaryImageIds(parsed.data),
      )

      const version = storage.putNodeData("glossary", "book", parsed.data)
      if (imageRequirementsChanged) {
        // Captions now include active glossary pictures. Changing that set
        // invalidates captions and every derived translation/audio/package
        // result, just like adding or removing an image elsewhere in the book.
        storage.clearNodesByType([...IMAGE_SET_CHANGE_CLEAR_NODE_TYPES])
        storage.clearStepRuns([...IMAGE_SET_CHANGE_CLEAR_STEPS])
      }
      const pages = storage.getPages()
      const catalog = await buildTextCatalog(storage, pages)
      storage.putNodeData("text-catalog", "book", catalog)
      return c.json({ version, imageRequirementsChanged })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/glossary/generate-one — Generate fields for a single glossary term
  const GenerateOneBody = z.object({
    word: z.string().min(1),
    context: z.string().optional(),
    candidateVariations: z.array(z.string()).optional(),
  })

  app.post("/books/:label/glossary/generate-one", async (c) => {
    if (!promptsDir) {
      throw new HTTPException(500, {
        message: "Server misconfigured: promptsDir not provided to glossary routes",
      })
    }

    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, { message: "Missing X-OpenAI-Key header" })
    }

    const body = await c.req.json()
    const parsed = GenerateOneBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid body: ${parsed.error.message}`,
      })
    }
    const { word, context, candidateVariations } = parsed.data

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const appConfig = loadBookConfig(safeLabel, booksDir, configPath)
      const metadataRow = storage.getLatestNodeData("metadata", "book")
      const metadata = metadataRow?.data as { language_code?: string | null } | null
      const language = normalizeLocale(
        appConfig.editing_language ?? metadata?.language_code ?? "en"
      )

      const glossaryConfig = buildGlossaryConfig(appConfig, language)

      const cacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
      const bookPromptsDir = path.join(path.resolve(booksDir), safeLabel, "prompts")
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
      const llmModel = createLLMModel({
        modelId: glossaryConfig.modelId,
        cacheDir,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
        credentials: {
          openaiApiKey: apiKey,
        },
      })

      const result = await generateGlossaryItem({
        word,
        context,
        candidateVariations,
        config: glossaryConfig,
        llmModel,
      })

      return c.json(result)
    } finally {
      storage.close()
    }
  })

  return app
}
