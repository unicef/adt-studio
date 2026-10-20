import crypto from "node:crypto"
import fs from "node:fs"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import {
  DEFAULT_IMAGE_GENERATION_MODEL_ID, ImageClassificationOutput,
  ImageCleanupRequest, ImageCleanupCandidate, ImageCleanupAcceptance,
  imageFileExtension, parseBookLabel,
} from "@adt/types"
import { createBookStorage, openBookDb, type Storage } from "@adt/storage"
import { applyCrop, loadBookConfig } from "@adt/pipeline"
import { assertModelCredentials, generateImageWithCache } from "@adt/llm"
import { readProviderCredentials } from "../middleware/provider-credentials.js"
import { resolvePathWithin } from "../utils/path-security.js"
import { replaceCleanupInStoryboard } from "../services/cleanup-storyboard.js"
import type { TaskService } from "../services/task-service.js"

function safePath(root: string, ...parts: string[]): string {
  const resolved = resolvePathWithin(root, ...parts)
  if (!resolved) throw new HTTPException(400, { message: "Invalid book image path" })
  return resolved
}

function currentClassification(storage: Storage, pageId: string, expectedVersion: number | null, sourceImageId: string) {
  if (storage.getStepRuns().some((step) => step.status === "running")) {
    throw new HTTPException(409, { message: "Wait for the pipeline to finish before cleaning images" })
  }
  const current = storage.getLatestNodeData("image-filtering", pageId)
  if ((current?.version ?? null) !== expectedVersion) {
    throw new HTTPException(409, { message: "Extracted images changed. Close cleanup and start again." })
  }
  if (storage.getImageMeta(sourceImageId)?.pageId !== pageId || sourceImageId === `${pageId}_page`) {
    throw new HTTPException(400, { message: "Source image does not belong to this page" })
  }
  return current ? ImageClassificationOutput.parse(current.data) : null
}

/** Experiment #986: candidates never change an active image until explicitly accepted. */
export function createImageCleanupRoutes(booksDir: string, configPath: string, taskService?: TaskService) {
  const app = new Hono()
  function assertNoActiveTasks(label: string) {
    if (taskService?.getActiveTasks(label).some((task) => task.status === "running")) {
      throw new HTTPException(409, { message: "Wait for active tasks to finish before cleaning images" })
    }
  }

  app.post("/books/:label/pages/:pageId/image-cleanup", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    const pageId = c.req.param("pageId")
    const parsed = ImageCleanupRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid cleanup request" })
    const input = parsed.data
    const dbPath = safePath(booksDir, label, `${label}.db`)
    if (!fs.existsSync(dbPath)) throw new HTTPException(404, { message: "Book not found" })
    const storage = createBookStorage(label, booksDir)
    try {
      assertNoActiveTasks(label)
      currentClassification(storage, pageId, input.expectedVersion, input.sourceImageId)
      const pageMeta = storage.getImageMeta(`${pageId}_page`)
      if (!pageMeta) throw new HTTPException(404, { message: "Page image not found" })
      const pageBytes = fs.readFileSync(safePath(booksDir, label, pageMeta.relativePath))
      // Page renders are PNGs. Check their actual IHDR rather than trusting DB dimensions.
      if (pageBytes.length < 24 || pageBytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new HTTPException(400, { message: "Cleanup requires a PNG page render" })
      }
      const width = pageBytes.readUInt32BE(16)
      const height = pageBytes.readUInt32BE(20)
      const { region } = input
      if (width * height > 64_000_000 || region.x + region.width > width || region.y + region.height > height) {
        throw new HTTPException(400, { message: "Crop must fit inside the page image" })
      }
      const modelId = input.modelId ?? loadBookConfig(label, booksDir, configPath).default_image_generation_model
        ?? DEFAULT_IMAGE_GENERATION_MODEL_ID
      const credentials = readProviderCredentials(c)
      assertModelCredentials("image", modelId, credentials)
      const crop = applyCrop(pageBytes, {
        cropLeft: region.x, cropTop: region.y,
        cropRight: region.x + region.width, cropBottom: region.y + region.height,
      })
      const generated = await generateImageWithCache({
        modelId, providerCredentials: credentials, prompt: input.prompt,
        referenceImages: [{ data: crop, mimeType: "image/png", name: "source-page-region.png" }],
        cacheDir: safePath(booksDir, label, ".cache"), timeoutMs: 180_000,
        signal: c.req.raw.signal,
        log: { taskType: "image-cleanup", pageId, promptName: "experimental-figure-cleanup" },
        onLog: (entry) => storage.appendLlmLog(entry),
      })

      // UUIDs and exclusive writes keep every attempt immutable, including cache hits.
      const imageId = `cleanup_${crypto.randomUUID()}`
      const cropImageId = `${imageId}_source`
      const imagesDir = safePath(booksDir, label, "images")
      fs.mkdirSync(imagesDir, { recursive: true })
      const db = openBookDb(dbPath)
      try {
        for (const image of [
          { id: cropImageId, bytes: crop, width: region.width, height: region.height, ext: "png" },
          { id: imageId, bytes: Buffer.from(generated.base64, "base64"), width: generated.width, height: generated.height, ext: imageFileExtension(generated.mimeType) },
        ]) {
          const filename = `${image.id}.${image.ext}`
          fs.writeFileSync(safePath(booksDir, label, "images", filename), image.bytes, { flag: "wx" })
          db.run(
            `INSERT INTO images (image_id, page_id, path, hash, width, height, source, bounds_x, bounds_y, bounds_w, bounds_h)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [image.id, pageId, `images/${filename}`, crypto.createHash("sha256").update(image.bytes).digest("hex"),
              image.width, image.height, "crop", region.x / 2, region.y / 2, region.width / 2, region.height / 2],
          )
        }
      } finally { db.close() }
      const candidate = ImageCleanupCandidate.parse({
        ...input, imageId, cropImageId, pageId, modelId,
        width: generated.width, height: generated.height, mimeType: generated.mimeType,
        cached: generated.cached, createdAt: new Date().toISOString(),
      })
      storage.putNodeData("image-cleanup", imageId, candidate)
      return c.json(candidate)
    } finally { storage.close() }
  })

  app.post("/books/:label/pages/:pageId/image-cleanup/accept", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    const pageId = c.req.param("pageId")
    const parsed = ImageCleanupAcceptance.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid cleanup candidate" })
    const dbPath = safePath(booksDir, label, `${label}.db`)
    if (!fs.existsSync(dbPath)) throw new HTTPException(404, { message: "Book not found" })
    const storage = createBookStorage(label, booksDir)
    try {
      const result = storage.transaction(() => {
        const record = storage.getLatestNodeData("image-cleanup", parsed.data.imageId)
        const parsedCandidate = ImageCleanupCandidate.safeParse(record?.data)
        if (!parsedCandidate.success || parsedCandidate.data.pageId !== pageId) {
          throw new HTTPException(404, { message: "Cleanup candidate not found for this page" })
        }
        const candidate = parsedCandidate.data
        if (candidate.acceptedVersion !== undefined) return { version: candidate.acceptedVersion }
        assertNoActiveTasks(label)
        const data = currentClassification(storage, pageId, candidate.expectedVersion, candidate.sourceImageId)
        const meta = storage.getImageMeta(candidate.imageId)
        if (!meta || !fs.existsSync(safePath(booksDir, label, meta.relativePath))) {
          throw new HTTPException(404, { message: "Cleaned image file not found" })
        }
        const version = data?.images.some((img) => img.imageId === candidate.sourceImageId)
          ? storage.putNodeData("image-filtering", pageId, {
          ...data,
          images: data.images.map((img) => img.imageId === candidate.sourceImageId
            ? { imageId: candidate.imageId, isPruned: false } : img),
          }) : candidate.expectedVersion
        replaceCleanupInStoryboard(storage, label, candidate.sourceImageId, candidate.imageId)
        storage.putNodeData("image-cleanup", candidate.imageId, { ...candidate, acceptedVersion: version })
        return { version }
      })
      return c.json(result)
    } finally { storage.close() }
  })
  return app
}
