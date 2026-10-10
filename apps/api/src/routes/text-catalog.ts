import { captureOutputReferences } from "@adt/pipeline"
import { catalogOutputs, editSourceSignature, assertEditSource } from "../services/catalog-output-service.js"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  CoreTtsCatalogOutput,
  TextCatalogOutput,
  OutputEditGuard,
  parseBookLabel,
  type CoreTtsCatalogEntry,
  type TTSOutput,
  type WordTimestampOutput,
} from "@adt/types"
import { openBookDb, createBookStorage, readCurrentNodeRow, CURRENT_VERSION_ORDER } from "@adt/storage"
import { buildTextCatalog, outputEvidence } from "@adt/pipeline"
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
    ...OutputEditGuard.shape,
    sourceVersion: z.number().int().nonnegative(),
  })
  .strict()

const SpeechTextBody = z.object({ speechText: z.string().min(1), ...OutputEditGuard.shape }).strict()

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function createTextCatalogRoutes(booksDir: string, promptsDir = path.resolve("prompts"), configPath?: string): Hono {
  const app = new Hono()

  // GET /books/:label/text-catalog — Get text catalog with optional translations
  app.get("/books/:label/text-catalog", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    let outputs: ReturnType<typeof catalogOutputs> = []
    let currentCatalog: ReturnType<typeof TextCatalogOutput.parse> | null = null
    try {
      outputs = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath)
      const derived = await buildTextCatalog(storage, storage.getPages())
      const saved = storage.getLatestNodeData("text-catalog", "book")
      const hasAuthored = storage.getPages().some((page) => storage.getLatestNodeData("web-rendering", page.pageId)) || storage.getLatestNodeData("glossary", "book") || storage.getLatestNodeData("quiz-generation", "book")
      currentCatalog = hasAuthored || derived.entries.length ? derived : saved?.data as typeof currentCatalog
    } finally { storage.close() }

    const db = openBookDb(dbPath)
    try {
      // Source catalog — the current-pointer version (falls back to MAX).
      const catalogRow = readCurrentNodeRow(db, "text-catalog", "book")
      if (!currentCatalog) {
        return c.json(null)
      }

      const catalog = currentCatalog

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

      const translations: Record<string, { entries: Array<{ id: string; text: string }>; version: number; sourceSignature: string }> = {}
      const seen = new Set<string>()
      for (const row of translationRows) {
        if (seen.has(row.item_id)) continue
        seen.add(row.item_id)
        try {
          const parsed = JSON.parse(row.data)
          translations[row.item_id] = { entries: parsed.entries, version: row.version, sourceSignature: editSourceSignature(outputs, "translation", row.item_id) }
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
      const speechTexts: Record<string, { entries: CoreTtsCatalogEntry[]; version: number; sourceSignature: string }> = {}
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
              sourceSignature: editSourceSignature(outputs, "preparation", row.item_id),
            }
          }
        } catch {
          // Ignore malformed historical rows, consistent with translations.
        }
      }

      return c.json({
        entries: catalog.entries,
        generatedAt: catalog.generatedAt,
        version: catalogRow?.version ?? 0,
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
    const normalizedLanguage = normalizeLocale(language)

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
      if ((previous?.version ?? 0) !== parsed.data.baseVersion || (storage.getLatestNodeData("text-catalog", "book")?.version ?? 0) !== parsed.data.sourceVersion) {
        throw new HTTPException(409, { message: "Translation or source changed. Refresh before saving." })
      }
      const outputs = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath)
      assertEditSource(editSourceSignature(outputs, "translation", language), parsed.data.sourceSignature)
      const previousEntries = new Map(((previous?.data as { entries?: Array<{ id: string; text: string }> })?.entries ?? []).map((entry) => [entry.id, entry]))
      const previousData = previous?.data && typeof previous.data === "object"
        ? previous.data as { generatedAt?: unknown }
        : null
      const changes = new Map<string, (typeof parsed.data.entries)[number]>()
      for (const entry of parsed.data.entries) {
        if (changes.has(entry.id)) throw new HTTPException(400, { message: "Duplicate translation identity." })
        if (!outputs.some((item) => item.identity.kind === "translation" && item.identity.id === entry.id && item.identity.language === normalizedLanguage)) {
          throw new HTTPException(409, { message: "Translation source is no longer available. Refresh before saving." })
        }
        changes.set(entry.id, entry)
      }
      const data = TextCatalogOutput.parse({
        entries: [...new Set([...previousEntries.keys(), ...changes.keys()])].map((id) => {
          const entry = changes.get(id)
          if (!entry) return previousEntries.get(id)
          const old = previousEntries.get(entry.id)
          const status = outputs.find((item) => item.identity.kind === "translation" && item.identity.id === entry.id && item.identity.language === normalizedLanguage)
          return old?.text === entry.text ? old : { ...old, ...entry, source: "manual", review: undefined, input: status ? outputEvidence(status.signature, entry.text, captureOutputReferences(storage, status.identity.kind, status.identity.language)) : undefined }
        }),
        generatedAt: parsed.data.generatedAt
          ?? (typeof previousData?.generatedAt === "string" ? previousData.generatedAt : undefined)
          ?? new Date().toISOString(),
      })
      const version = storage.putNodeData(
        "text-catalog-translation",
        language,
        data
      )

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
      const currentRow = storage.getLatestNodeData("core-tts-catalog", normalizedLanguage) ?? storage.getLatestNodeData("core-tts-catalog", normalizedLanguage.replace("-", "_"))
      if (currentRow?.version !== parsed.data.baseVersion) throw new HTTPException(409, { message: "Speech text changed. Refresh before saving." })
      const index = current.entries.findIndex((entry) => entry.id === entryId)
      if (index < 0) {
        throw new HTTPException(404, { message: `Core TTS entry not found: ${entryId}` })
      }

      const outputs = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath)
      assertEditSource(editSourceSignature(outputs, "preparation", normalizedLanguage), parsed.data.sourceSignature)
      const status = outputs.find((item) => item.identity.kind === "preparation" && item.identity.id === entryId && item.identity.language === normalizedLanguage)
      const now = new Date().toISOString()
      const previous = current.entries[index]
      const speechText = parsed.data.speechText
      const nextEntry: CoreTtsCatalogEntry = {
        ...previous,
        speechText,
        source: "manual", review: undefined, fallbackReason: undefined,
        input: status ? outputEvidence(status.signature, speechText, captureOutputReferences(storage, status.identity.kind, status.identity.language)) : undefined,
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

      // Keep prior playable audio/timing versions. Actual speech-input evidence
      // marks them for an explicit update; a Save never removes user output.
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
