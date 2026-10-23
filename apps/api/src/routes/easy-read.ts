import { indexEasyReadEntries } from "@adt/pipeline"
import { captureOutputReferences, assertOutputPublication } from "@adt/pipeline"
import { catalogOutputs, editSourceSignature, assertEditSource, assertEditVersion } from "../services/catalog-output-service.js"
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { EasyReadOutput, OutputEditGuard, parseBookLabel } from "@adt/types"
import type { BookMetadata, EasyReadOutput as EasyReadOutputType } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import {
  buildEasyReadConfig,
  buildEasyReadSourceBlocks,
  flattenEasyReadEntries,
  generateEasyRead,
  outputEvidence,
  inputSignature,
  loadBookConfig,
  normalizeLocale,
  retainedEasyRead,
  activeEasyRead,
} from "@adt/pipeline"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import { readProviderCredentials } from "../middleware/provider-credentials.js"

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

function clearEasyReadDependents(
  storage: ReturnType<typeof createBookStorage>,
  previous: EasyReadOutputType | null | undefined,
  next: EasyReadOutputType,
): void {
  const changedIds = getChangedEasyReadIds(previous, next)
  if (changedIds.size === 0) return

  // Preserve provider text/audio; relevant input signatures determine updates.

  storage.clearNodesByType([
    "text-catalog-translation",
    "accessibility-assessment",
  ])

  // Easy Read audio is always (re)generated when Easy Read is enabled, so a
  // change to the easy-read texts must invalidate speech + timestamps too.
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
      const sourceBlocks = buildEasyReadSourceBlocks(storage, storage.getPages())
      const projection = activeEasyRead(storage, sourceBlocks)
      return c.json({ ...projection, version: row.version, sourceSignature: editSourceSignature(catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { kinds: ["easy-read"] }), "easy-read") })
    } finally {
      storage.close()
    }
  })

  app.put("/books/:label/easy-read", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const body = await c.req.json()
    const parsed = EasyReadOutput.extend(OutputEditGuard.shape).safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid Easy Read data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const previousRow = storage.getLatestNodeData("easy-read", "book")
      const previousEasyRead = retainedEasyRead(storage, buildEasyReadSourceBlocks(storage, storage.getPages()))
      assertEditVersion(previousRow?.version, parsed.data.baseVersion)
      const outputs = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { kinds: ["easy-read"] })
      assertEditSource(editSourceSignature(outputs, "easy-read"), parsed.data.sourceSignature)
      const oldEntries = indexEasyReadEntries(previousEasyRead)
      const edits = new Map<string, string>()
      for (const entry of parsed.data.blocks.flatMap((block) => block.entries)) {
        if (!oldEntries.has(entry.easyReadId) || (edits.has(entry.easyReadId) && edits.get(entry.easyReadId) !== entry.text)) throw new HTTPException(409, { message: "Easy Read membership changed or shared text conflicts. Refresh before saving." })
        edits.set(entry.easyReadId, entry.text)
      }
      const output = EasyReadOutput.parse({ ...previousEasyRead, blocks: (previousEasyRead?.blocks ?? []).map((block) => ({ ...block,
        entries: block.entries.map((entry) => {
          const text = edits.get(entry.easyReadId)
          if (text === undefined || text === oldEntries.get(entry.easyReadId)?.text) return entry
          const status = outputs.find((item) => item.identity.kind === "easy-read" && item.identity.id === entry.easyReadId)
          return { ...entry, text, source: "manual", review: undefined, input: status ? outputEvidence(status.signature, text, captureOutputReferences(storage, status.identity.kind, status.identity.language)) : undefined }
        }),
      })) })
      const version = storage.putNodeData("easy-read", "book", output)
      clearEasyReadDependents(storage, previousEasyRead, output)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  app.post("/books/:label/easy-read/regenerate", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const credentials = readProviderCredentials(c)

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
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir], { basePromptModelId: config.base_prompt_model })
      const rateLimiter = config.rate_limit
        ? createRateLimiter(config.rate_limit.requests_per_minute)
        : undefined
      const model = createLLMModel({
        signal: c.req.raw.signal,
        modelId: easyReadConfig.modelId,
        cacheDir,
        promptEngine,
        rateLimiter,
        onLog: (entry) => storage.appendLlmLog(entry),
        providerCredentials: credentials,
      })
      const previousRow = storage.getLatestNodeData("easy-read", "book")
      const previousEasyRead = retainedEasyRead(storage, blocks)
      const sourceBefore = inputSignature(blocks)
      const outputsBefore = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { kinds: ["easy-read"] })
      easyReadConfig.promptSignature = promptEngine.fingerprint(easyReadConfig.promptName, { modelId: easyReadConfig.modelId })
      const output: EasyReadOutputType = await generateEasyRead(blocks, easyReadConfig, model, {
        concurrency: config.concurrency ?? 32, previous: previousEasyRead, signal: c.req.raw.signal,
        references: captureOutputReferences(storage, "easy-read", language),
      })
      c.req.raw.signal.throwIfAborted()
      const outputsAfter = catalogOutputs(storage, safeLabel, booksDir, promptsDir, configPath, { kinds: ["easy-read"] })
      assertOutputPublication(outputsBefore, outputsAfter, outputsBefore.filter((item) => item.identity.kind === "easy-read").map((item) => item.identity))
      // The legacy route permits generation while Easy Read is disabled, when
      // the public projection intentionally contains no applicable outputs.
      const latestConfig = loadBookConfig(safeLabel, booksDir, configPath)
      const latestEasy = buildEasyReadConfig(latestConfig, readLanguage(metadata, latestConfig))
      const latestEngine = createPromptEngine([bookPromptsDir, promptsDir], { basePromptModelId: latestConfig.base_prompt_model })
      assertEditSource(inputSignature({ ...latestEasy, enabled: true, promptSignature: latestEngine.fingerprint(latestEasy.promptName, { modelId: latestEasy.modelId }) }), inputSignature(easyReadConfig))
      assertEditVersion(storage.getLatestNodeData("easy-read", "book")?.version, previousRow?.version ?? 0)
      assertEditSource(inputSignature(buildEasyReadSourceBlocks(storage, storage.getPages())), sourceBefore)
      const version = storage.putNodeData("easy-read", "book", output)
      clearEasyReadDependents(storage, previousEasyRead, output)
      return c.json({ ...output, version })
    } finally {
      storage.close()
    }
  })

  return app
}
