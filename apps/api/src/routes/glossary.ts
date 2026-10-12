import { assertEditVersion } from "../services/catalog-output-service.js"
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  GlossaryOutput,
  SaveGlossaryRequest,
  parseBookLabel,
} from "@adt/types"
import type { ImageCaptioningOutput } from "@adt/types"
import { openBookDb, createBookStorage, readCurrentNodeRow } from "@adt/storage"
import type { Storage } from "@adt/storage"
import {
  reconcileTextCatalog,
  buildGlossaryConfig,
  generateGlossaryItem,
  loadBookConfig,
  normalizeLocale,
  getGlossaryItemTextId,
  inputSignature,
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

function activeGlossaryImageIds(glossary: GlossaryOutput | undefined): Set<string> {
  return new Set(
    glossary?.items
      .filter((item) => !item.pruned && item.imageId)
      .map((item) => item.imageId!) ?? [],
  )
}

/** True when the image already has a caption entry on its owning page. */
function isCaptioned(storage: Storage, imageId: string): boolean {
  const pageId = storage.getImageMeta(imageId)?.pageId
  // Unknown image — captioning skips it (groupGlossaryImageIdsByPage needs an
  // owning page), so a rerun would produce nothing new.
  if (!pageId) return true
  const data = storage.getLatestNodeData("image-captioning", pageId)?.data as
    | ImageCaptioningOutput
    | undefined
  return (data?.captions ?? []).some((caption) => caption.imageId === imageId)
}

/**
 * Do the glossary's pictures require the captions step to run again?
 *
 * Captioning now covers active glossary pictures, so only a picture that is
 * *newly* attached and has never been captioned changes the captions output.
 * Two cases deliberately do NOT invalidate anything:
 *   - picking a picture that already carries a caption (the common case — the
 *     image is already used somewhere in the book), and
 *   - removing a picture, which leaves an unused caption behind but no stale
 *     text-catalog entry (buildTextCatalog only emits captions for images that
 *     appear in the rendered page HTML).
 */
function needsCaptionRerun(
  storage: Storage,
  previous: GlossaryOutput | undefined,
  next: GlossaryOutput,
): boolean {
  const previousIds = activeGlossaryImageIds(previous)
  return [...activeGlossaryImageIds(next)].some(
    (imageId) => !previousIds.has(imageId) && !isCaptioned(storage, imageId),
  )
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
      const row = readCurrentNodeRow(db, "glossary", "book")

      if (!row) {
        return c.json(null)
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(row.data)
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

      return c.json({ ...validated.data, version: row.version })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/glossary — Update glossary
  app.put("/books/:label/glossary", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    const body = await c.req.json()
    const parsed = SaveGlossaryRequest.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid glossary data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const previousRow = storage.getLatestNodeData("glossary", "book")
      assertEditVersion(previousRow?.version, parsed.data.baseVersion)
      const { baseVersion: _base, ...content } = parsed.data
      const previous = GlossaryOutput.safeParse(previousRow?.data)
      const previousItems = previous.success ? previous.data.items : []
      const evidence = (previousRow?.data as { generationEvidence?: unknown } | undefined)?.generationEvidence
      const next = { ...content, ...(evidence ? { generationEvidence: evidence } : {}), items: parsed.data.items.map((item, index) => {
        const id = getGlossaryItemTextId(item, index)
        const matches = previousItems.filter((prior, priorIndex) => getGlossaryItemTextId(prior, priorIndex) === id)
        const prior = matches.length === 1 ? matches[0] : undefined
        const content = (value: typeof item) => { const { id: _id, ...fields } = value; return fields }
        const { generationEvidence, source, ...oldContent } = prior ?? {}
        const unchanged = prior && inputSignature(content(oldContent as typeof item)) === inputSignature(content(item))
        return { ...item, source: unchanged ? source : "manual" as const, ...(prior?.generationEvidence ? { generationEvidence: prior.generationEvidence } : {}) }
      }) }
      const imageRequirementsChanged = needsCaptionRerun(
        storage,
        previous.success ? previous.data : undefined,
        next,
      )

      const version = storage.transaction(() => {
        assertEditVersion(storage.getLatestNodeData("glossary", "book")?.version, parsed.data.baseVersion)
        const version = storage.putNodeData("glossary", "book", next)
        // Freshness follows actual inputs. Adding a picture must not retire
        // authored captions, translations or audio while awaiting generation.
        reconcileTextCatalog(storage)
        return version
      })
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

    const credentials = readProviderCredentials(c)

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
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir], { basePromptModelId: appConfig.base_prompt_model })
      const llmModel = createLLMModel({
        modelId: glossaryConfig.modelId,
        cacheDir,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
        providerCredentials: credentials,
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
