import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { createBookStorage, publishSpeechOutput, publishSpeechTimings } from "@adt/storage"
import { OutputReviewRequest, OutputDisclosureOptions, parseBookLabel, type OutputStatus } from "@adt/types"
import { loadBookConfig, readOutputCatalog, outputIdentityKey, summarizeOutputs, buildTextCatalogSnapshot, reconcileSpeechInputs, loadCoreTtsProfiles } from "@adt/pipeline"

export function createOutputRoutes(booksDir: string, promptsDir: string, configPath?: string): Hono {
  const app = new Hono()
  const read = (label: string, storage: ReturnType<typeof createBookStorage>) => readOutputCatalog({
    storage, config: loadBookConfig(label, booksDir, configPath),
    bookDir: path.join(path.resolve(booksDir), label), promptsDir,
    configDir: configPath ? path.join(path.dirname(configPath), "config") : path.resolve("config"),
  })
  app.get("/books/:label/outputs", (c) => {
    const label = parseBookLabel(c.req.param("label"))
    if (!fs.existsSync(path.join(path.resolve(booksDir), label, `${label}.db`))) throw new HTTPException(404, { message: "Book not found" })
    const storage = createBookStorage(label, booksDir)
    try {
      const outputs = read(label, storage)
      return c.json({ outputs, summary: summarizeOutputs(outputs) })
    } finally { storage.close() }
  })
  app.get("/books/:label/outputs/disclosure", (c) => {
    const label = parseBookLabel(c.req.param("label"))
    let requested: unknown
    try { requested = JSON.parse(c.req.query("features") ?? "{}") } catch { throw new HTTPException(400, { message: "Invalid disclosure options" }) }
    const parsed = OutputDisclosureOptions.safeParse(requested)
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid disclosure options" })
    const features = parsed.data
    if (!fs.existsSync(path.join(path.resolve(booksDir), label, `${label}.db`))) throw new HTTPException(404, { message: "Book not found" })
    const storage = createBookStorage(label, booksDir)
    try {
      const catalog = buildTextCatalogSnapshot(storage, storage.getPages())
      const captionConsumers = new Set(catalog.entries.map((entry) => entry.id))
      const outputs = read(label, storage).filter((output) => !output.excluded &&
        (!features.languages || !output.identity.language || features.languages.includes(output.identity.language)) &&
        (output.group !== "glossary" || output.sectionIds.length > 0 || features.glossary !== false) &&
        (output.group !== "quizzes" || features.quizzes !== false) &&
        (!["audio", "preparation", "timestamps"].includes(output.identity.kind) || features.readAloud !== false) &&
        (output.identity.kind !== "caption" || captionConsumers.has(output.identity.id)))
        .map((output) => ({ ...output, included: output.usable }))
      return c.json({ outputs, summary: summarizeOutputs(outputs) })
    } finally { storage.close() }
  })
  app.post("/books/:label/outputs/review", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    const parsed = OutputReviewRequest.safeParse(await c.req.json())
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid output review" })
    const review = parsed.data
    if (!fs.existsSync(path.join(path.resolve(booksDir), label, `${label}.db`))) throw new HTTPException(404, { message: "Book not found" })
    const storage = createBookStorage(label, booksDir)
    try {
      return storage.transaction(() => {
        const output = read(label, storage).find((item) => outputIdentityKey(item.identity) === outputIdentityKey(review.identity))
        if (!output || output.signature !== review.signature || output.contentHash !== review.contentHash) {
          throw new HTTPException(409, { message: "Output or its inputs changed. Refresh before reviewing." })
        }
        if (!output.usable || output.excluded) throw new HTTPException(409, { message: "Only included, usable content can be reviewed." })
        if (review.action === "keep" && !output.protected) throw new HTTPException(400, { message: "Keep is for protected or legacy content." })
        if (review.action === "checked" && !(output.identity.kind === "preparation" && output.warnings.some((warning) => warning.reason.startsWith("preparation-")))) {
          throw new HTTPException(400, { message: "Mark checked resolves only a preparation fallback warning." })
        }
        if (output.identity.kind === "preparation") {
          const config = loadBookConfig(label, booksDir, configPath)
          const sourceLanguage = config.editing_language ?? (storage.getLatestNodeData("metadata", "book")?.data as { language_code?: string })?.language_code ?? "en"
          reconcileSpeechInputs({ storage, config, sourceLanguage, languages: [output.identity.language!],
            profiles: loadCoreTtsProfiles(configPath ? path.join(path.dirname(configPath), "config") : path.resolve("config")),
            promptsDir, bookDir: path.join(path.resolve(booksDir), label) })
        }
        const { node, itemId, field, idField } = outputLocation(output, storage)
        const current = storage.getLatestNodeData(node, itemId)
        if (!current || !current.data || typeof current.data !== "object") throw new HTTPException(409, { message: "Output is no longer available." })
        const data = structuredClone(current.data) as Record<string, unknown>
        const entries = field === "self" ? [data] : field === "timings" ? Object.values(data.entries as Record<string, Record<string, unknown>>) : field === "blocks" ? (data.blocks as Array<{ entries: Record<string, unknown>[] }>).flatMap((block) => block.entries) : data[field] as Record<string, unknown>[]
        const entry = entries.find((item) => item[idField] === output.identity.id && (!["audio", "timestamps"].includes(output.identity.kind) || (item.voiceSlot ?? "primary") === (output.identity.voiceSlot ?? "primary")))
        if (!entry) throw new HTTPException(409, { message: "Output is no longer available." })
        entry.review = { signature: review.signature, contentHash: review.contentHash, action: review.action }
        const version = node === "tts" ? publishSpeechOutput(storage, itemId, data as unknown as import("@adt/types").TTSOutput)
          : node === "tts-timestamps" ? publishSpeechTimings(storage, itemId, data as unknown as import("@adt/types").WordTimestampOutput)
          : storage.putNodeData(node, itemId, data)
        return c.json({ version })
      })
    } finally { storage.close() }
  })
  return app
}

function outputLocation(output: OutputStatus, storage: ReturnType<typeof createBookStorage>) {
  const { identity } = output
  const languageItem = (node: string) => storage.getLatestNodeData(node, identity.language!) ? identity.language! : identity.language!.replace("-", "_")
  switch (identity.kind) {
    case "translation": return { node: "text-catalog-translation", itemId: languageItem("text-catalog-translation"), field: "entries", idField: "id" }
    case "preparation": return { node: "core-tts-catalog", itemId: languageItem("core-tts-catalog"), field: "entries", idField: "id" }
    case "image-translation": return { node: "image-translation", itemId: `${identity.id}_tr_${identity.language}`, field: "self", idField: "sourceImageId" }
    case "timestamps": return { node: "tts-timestamps", itemId: languageItem("tts-timestamps"), field: "timings", idField: "textId" }
    case "audio": return { node: "tts", itemId: languageItem("tts"), field: "entries", idField: "textId" }
    case "easy-read": return { node: "easy-read", itemId: "book", field: "blocks", idField: "easyReadId" }
    case "caption": return { node: "image-captioning", itemId: storage.getImageMeta(identity.id)?.pageId ?? output.pageIds[0], field: "captions", idField: "imageId" }
    default: throw new HTTPException(400, { message: "This output does not support this review action." })
  }
}
