import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  CoreTtsCatalogOutput,
  TextCatalogOutput,
  parseBookLabel,
  type CoreTtsCatalogEntry,
  type TTSOutput,
  type WordTimestampOutput,
} from "@adt/types"
import { openBookDb, createBookStorage, readCurrentNodeRow, CURRENT_VERSION_ORDER } from "@adt/storage"
import { buildTextCatalog } from "@adt/pipeline"
import {
  getCoreTtsCatalog,
  invalidateCoreTtsForDisplayEntries,
  normalizeLocale,
} from "@adt/pipeline"

const TranslationBody = z
  .object({
    entries: z.array(
      z.object({ id: z.string(), text: z.string() })
    ),
    generatedAt: z.string().optional(),
  })
  .strict()

const SpeechTextBody = z.object({ speechText: z.string().min(1) }).strict()

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function createTextCatalogRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/text-catalog — Get text catalog with optional translations
  app.get("/books/:label/text-catalog", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    // If no catalog exists yet (translate stage hasn't run), build one on demand
    // from existing pipeline outputs so consumers like the glossary autofill have
    // source-language text available before translation.
    //
    // Only persist a *non-empty* result. Opening the book before Storyboard has
    // rendered any pages builds an empty catalog; persisting that empty node
    // poisons every downstream reader (translate, speech, packaging) — translate
    // historically only rebuilt when the node was absent, so an empty persisted
    // catalog silently skipped all translation until the Easy Read stage
    // rebuilt it. Leaving the node absent keeps the rebuild paths intact.
    {
      const storage = createBookStorage(safeLabel, booksDir)
      try {
        const existing = storage.getLatestNodeData("text-catalog", "book")
        if (!existing) {
          const pages = storage.getPages()
          const catalog = await buildTextCatalog(storage, pages)
          if (catalog.entries.length > 0) {
            storage.putNodeData("text-catalog", "book", catalog)
          }
        }
      } finally {
        storage.close()
      }
    }

    const db = openBookDb(dbPath)
    try {
      // Source catalog — the current-pointer version (falls back to MAX).
      const catalogRow = readCurrentNodeRow(db, "text-catalog", "book")
      if (!catalogRow) {
        return c.json(null)
      }

      const catalog = JSON.parse(catalogRow.data)

      // All translated catalogs, each at its current-pointer version (so a
      // rollback of a language shows the restored version). Rows are ordered so
      // the current version is first per language; take the first one seen.
      const translationRows = db.all(
        `SELECT nd.item_id AS item_id, nd.data AS data, nd.version AS version
         FROM node_data nd
         LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
         WHERE nd.node = ?
         ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`,
        ["text-catalog-translation"]
      ) as Array<{ item_id: string; data: string; version: number }>

      const translations: Record<string, { entries: Array<{ id: string; text: string }>; version: number }> = {}
      const seen = new Set<string>()
      for (const row of translationRows) {
        if (seen.has(row.item_id)) continue
        seen.add(row.item_id)
        try {
          const parsed = JSON.parse(row.data)
          translations[row.item_id] = { entries: parsed.entries, version: row.version }
        } catch {
          // skip corrupted current version
        }
      }

      const speechRows = db.all(
        `SELECT nd.item_id AS item_id, nd.data AS data, nd.version AS version
         FROM node_data nd
         LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
         WHERE nd.node = ?
         ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`,
        ["core-tts-catalog"]
      ) as Array<{ item_id: string; data: string; version: number }>
      const speechTexts: Record<string, { entries: CoreTtsCatalogEntry[]; version: number }> = {}
      const seenSpeech = new Set<string>()
      for (const row of speechRows) {
        if (seenSpeech.has(row.item_id)) continue
        seenSpeech.add(row.item_id)
        try {
          const parsed = CoreTtsCatalogOutput.safeParse(JSON.parse(row.data))
          if (parsed.success) {
            speechTexts[row.item_id] = {
              entries: parsed.data.entries,
              version: row.version,
            }
          }
        } catch {
          // Ignore malformed historical rows, consistent with translations.
        }
      }

      return c.json({
        entries: catalog.entries,
        generatedAt: catalog.generatedAt,
        version: catalogRow.version,
        translations,
        speechTexts,
      })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/text-catalog-translation/:language — Update a translation
  app.put("/books/:label/text-catalog-translation/:language", async (c) => {
    const { label, language } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = TranslationBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid translation data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const previous = storage.getLatestNodeData("text-catalog-translation", language)
      const previousData = previous?.data && typeof previous.data === "object"
        ? previous.data as { generatedAt?: unknown }
        : null
      const data = TextCatalogOutput.parse({
        entries: parsed.data.entries,
        generatedAt: parsed.data.generatedAt
          ?? (typeof previousData?.generatedAt === "string" ? previousData.generatedAt : undefined)
          ?? new Date().toISOString(),
      })
      const version = storage.putNodeData(
        "text-catalog-translation",
        language,
        data
      )

      const normalizedLanguage = normalizeLocale(language)
      invalidateCoreTtsForDisplayEntries({
        storage,
        language: normalizedLanguage,
        entries: data.entries,
      })
      storage.clearNodesByType(["accessibility-assessment"])
      storage.clearStepRuns([
        "core-tts-catalog",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ])
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/core-tts-catalog/:language/:entryId — save an
  // independent manual speech-text edit as a new language-entity version.
  app.put("/books/:label/core-tts-catalog/:language/:entryId", async (c) => {
    const { label, language, entryId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const parsed = SpeechTextBody.safeParse(await c.req.json())
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid speech text: ${parsed.error.message}`,
      })
    }

    const normalizedLanguage = normalizeLocale(language)
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const current = getCoreTtsCatalog(storage, normalizedLanguage)
      if (!current) {
        throw new HTTPException(404, {
          message: `Core TTS catalog not found for ${normalizedLanguage}`,
        })
      }
      const index = current.entries.findIndex((entry) => entry.id === entryId)
      if (index < 0) {
        throw new HTTPException(404, { message: `Core TTS entry not found: ${entryId}` })
      }

      const now = new Date().toISOString()
      const previous = current.entries[index]
      const speechText = parsed.data.speechText
      const nextEntry: CoreTtsCatalogEntry = {
        ...previous,
        speechText,
        changed: speechText !== previous.displayText,
        status: "ready",
        failureReason: undefined,
        generation: {
          ...previous.generation,
          mode: "manual",
          generatedAt: now,
          sourceTextHash: hash(previous.displayText),
          contextHash: hash({
            displayText: previous.displayText,
            speechText,
            mode: "manual",
          }),
          cached: false,
        },
      }
      const entries = [...current.entries]
      entries[index] = nextEntry
      const version = storage.putNodeData(
        "core-tts-catalog",
        normalizedLanguage,
        CoreTtsCatalogOutput.parse({
          language: normalizedLanguage,
          entries,
          generatedAt: now,
        }),
      )

      // A generated recording and its timestamps describe the previous speech
      // text. Remove those derived rows so the UI cannot serve stale audio.
      // Uploaded/manual recordings are user-owned and must survive text edits.
      const legacyLanguage = normalizedLanguage.replace("-", "_")
      const normalizedTtsRow = storage.getLatestNodeData("tts", normalizedLanguage)
      const ttsRow = normalizedTtsRow ?? storage.getLatestNodeData("tts", legacyLanguage)
      const ttsItemId = normalizedTtsRow ? normalizedLanguage : legacyLanguage
      if (ttsRow) {
        const tts = ttsRow.data as TTSOutput
        const entries = tts.entries.filter(
          (entry) => entry.textId !== entryId || entry.provider === "manual",
        )
        const failed = tts.failed?.filter((entry) => entry.textId !== entryId)
        if (
          entries.length !== tts.entries.length ||
          failed?.length !== tts.failed?.length
        ) {
          storage.putNodeData("tts", ttsItemId, {
            ...tts,
            entries,
            failed,
            generatedAt: now,
          } satisfies TTSOutput)
        }
      }
      const normalizedTimestampRow = storage.getLatestNodeData(
        "tts-timestamps",
        normalizedLanguage,
      )
      const timestampRow =
        normalizedTimestampRow ??
        storage.getLatestNodeData("tts-timestamps", legacyLanguage)
      const timestampItemId = normalizedTimestampRow
        ? normalizedLanguage
        : legacyLanguage
      if (timestampRow) {
        const timestamps = timestampRow.data as WordTimestampOutput
        const entries = { ...timestamps.entries }
        delete entries[entryId]
        storage.putNodeData("tts-timestamps", timestampItemId, {
          ...timestamps,
          entries,
          failed: timestamps.failed?.filter((entry) => entry.textId !== entryId),
          generatedAt: now,
        } satisfies WordTimestampOutput)
      }
      storage.clearNodesByType(["accessibility-assessment"])
      storage.clearStepRuns([
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ])
      return c.json({ version, entry: nextEntry })
    } finally {
      storage.close()
    }
  })

  return app
}
