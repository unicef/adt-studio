import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { ImageClassificationOutput, SecondOpinionRequest, parseBookLabel } from "@adt/types"
import type { SecondOpinionResponse } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import { answerLanguageName, applyCrop, buildSecondOpinionConfig, describeLeftOutRule, describePosition, describeRepeats, loadBookConfig, SECOND_OPINION_PROMPT_VERSION, secondOpinionForPage } from "@adt/pipeline"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import { readProviderCredentials } from "../middleware/provider-credentials.js"

const PAGE_RENDER_SCALE = 2
const SUMMARY_LIMIT = 700

function closeUp(pageBase64: string, bounds: { x: number; y: number; width: number; height: number } | undefined, page: { width: number; height: number }): string | undefined {
  if (!bounds) return undefined
  const left = bounds.x * PAGE_RENDER_SCALE
  const top = bounds.y * PAGE_RENDER_SCALE
  const width = bounds.width * PAGE_RENDER_SCALE
  const height = bounds.height * PAGE_RENDER_SCALE
  const pad = Math.max(90, Math.max(width, height) * 0.9)
  const crop = {
    cropLeft: Math.max(0, Math.floor(left - pad)),
    cropTop: Math.max(0, Math.floor(top - pad)),
    cropRight: Math.min(page.width, Math.ceil(left + width + pad)),
    cropBottom: Math.min(page.height, Math.ceil(top + height + pad)),
  }
  if (crop.cropRight - crop.cropLeft < 8 || crop.cropBottom - crop.cropTop < 8) return undefined
  try {
    return applyCrop(Buffer.from(pageBase64, "base64"), crop).toString("base64")
  } catch {
    return undefined
  }
}

async function runOpinion<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof HTTPException) throw error
    const status = (error as { statusCode?: number }).statusCode
    const message = error instanceof Error ? error.message : String(error)
    if (/requires api key|missing-credential/i.test(message)) throw new HTTPException(400, { message: "No API key is set for the book's AI provider. Add one in Settings." })
    if (status === 401 || /incorrect api key|invalid api key/i.test(message)) throw new HTTPException(401, { message: "The AI provider rejected the API key. Check it in Settings." })
    if (status === 429) throw new HTTPException(429, { message: "The AI provider is rate limiting requests. Try again in a minute." })
    throw new HTTPException(502, { message: `The AI call failed: ${message.slice(0, 240)}` })
  }
}

export function createLeftOutReviewRoutes(booksDir: string, promptsDir: string, configPath?: string): Hono {
  const app = new Hono()

  // GET /books/:label/left-out — Every page's image-filtering decisions plus the
  // image sizes and placements, in one read, so the left-out review does not
  // have to fetch each page's full detail.
  app.get("/books/:label/left-out", (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages().flatMap((page) => {
        const parsed = ImageClassificationOutput.safeParse(storage.getLatestNodeData("image-filtering", page.pageId)?.data)
        if (!parsed.success) return []
        const images = parsed.data.images.filter((image) => image.imageId !== `${page.pageId}_page`)
        if (images.length === 0) return []
        return [
          {
            pageId: page.pageId,
            imageClassification: parsed.data,
            imagesMeta: storage.getPageImages(page.pageId).map((image) => ({
              imageId: image.imageId,
              width: image.width,
              height: image.height,
              ...(image.bounds ? { bounds: image.bounds } : {}),
            })),
          },
        ]
      })
      return c.json({ pages })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/pages/:pageId/left-out/second-opinion — Ask the model to
  // re-judge images the filters left out on one page. Read-only: it never changes
  // the page's image-filtering; the user decides what to bring back.
  app.post("/books/:label/pages/:pageId/left-out/second-opinion", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const parsed = SecondOpinionRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: `Invalid request: ${parsed.error.message}` })
    const credentials = readProviderCredentials(c)

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const page = storage.getPages().find((entry) => entry.pageId === pageId)
      if (!page) throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      const classification = ImageClassificationOutput.safeParse(storage.getLatestNodeData("image-filtering", pageId)?.data)
      if (!classification.success) throw new HTTPException(409, { message: "This page has no image filtering results yet." })

      const config = loadBookConfig(safeLabel, booksDir, configPath)
      const opinionConfig = buildSecondOpinionConfig(config)
      if (!opinionConfig) throw new HTTPException(409, { message: "No AI model is configured for this book." })

      const pruned = new Map(classification.data.images.filter((image) => image.isPruned).map((image) => [image.imageId, image]))
      const images = storage.getPageImages(pageId)
      const pageImage = images.find((image) => image.imageId === `${pageId}_page`)
      const extent = images.reduce(
        (size, image) => (image.bounds ? { width: Math.max(size.width, image.bounds.x + image.bounds.width), height: Math.max(size.height, image.bounds.y + image.bounds.height) } : size),
        { width: 0, height: 0 },
      )
      const pageSize = pageImage?.bounds
        ? { width: pageImage.bounds.width, height: pageImage.bounds.height }
        : pageImage
          ? { width: pageImage.width / PAGE_RENDER_SCALE, height: pageImage.height / PAGE_RENDER_SCALE }
          : extent.width > 0
            ? extent
            : undefined
      const byId = new Map(images.map((image) => [image.imageId, image]))
      const wanted = [...new Set(parsed.data.imageIds)].filter((id) => pruned.has(id) && byId.has(id))
      if (wanted.length === 0) throw new HTTPException(400, { message: "None of these images are left out on this page." })

      const cacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
      const bookPromptsDir = path.join(path.resolve(booksDir), safeLabel, "prompts")
      const model = createLLMModel({
        modelId: opinionConfig.modelId,
        cacheDir,
        promptEngine: createPromptEngine([bookPromptsDir, promptsDir], { basePromptModelId: config.base_prompt_model }),
        rateLimiter: config.rate_limit ? createRateLimiter(config.rate_limit.requests_per_minute) : undefined,
        onLog: (entry) => storage.appendLlmLog(entry),
        providerCredentials: credentials,
      })

      const pageBase64 = storage.getPageImageBase64(pageId)
      const pagePixels = pageImage ? { width: pageImage.width, height: pageImage.height } : pageSize ? { width: pageSize.width * PAGE_RENDER_SCALE, height: pageSize.height * PAGE_RENDER_SCALE } : undefined
      const metadata = storage.getLatestNodeData("metadata", "book")?.data as { title?: string; language_code?: string } | undefined
      const summary = (storage.getLatestNodeData("book-summary", "book")?.data as { summary?: string } | undefined)?.summary
      const results = await runOpinion(() => secondOpinionForPage(
        {
          pageId,
          pageImageBase64: pageBase64,
          pageText: page.text,
          book: {
            title: metadata?.title,
            language: metadata?.language_code,
            summary: summary ? summary.slice(0, SUMMARY_LIMIT) : undefined,
          },
          answerLanguage: answerLanguageName(parsed.data.language),
          images: wanted.map((imageId) => {
            const meta = byId.get(imageId)!
            return {
              imageId,
              imageBase64: storage.getImageBase64(imageId),
              closeUpBase64: pagePixels ? closeUp(pageBase64, meta.bounds, pagePixels) : undefined,
              width: meta.width,
              height: meta.height,
              leftOutReason: describeLeftOutRule(pruned.get(imageId)?.reason),
              position: describePosition(meta.bounds, pageSize),
              repeats: describeRepeats(parsed.data.repeats?.[imageId]),
            }
          }),
        },
        opinionConfig,
        model,
      ))
      const response: SecondOpinionResponse = { pageId, modelId: opinionConfig.modelId, promptVersion: SECOND_OPINION_PROMPT_VERSION, language: parsed.data.language, results }
      return c.json(response)
    } finally {
      storage.close()
    }
  })

  return app
}
