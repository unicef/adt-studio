import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import type { LlmLogEntry } from "@adt/llm"
import {
  captionPageImages,
  buildCaptionConfig,
  extractImageIds,
  loadBookConfig,
} from "@adt/pipeline"
import { WebRenderingOutput, type StepName } from "@adt/types"
import type { PageData } from "@adt/storage"
import type {
  ProofRunner,
  ProofProgress,
  StartProofOptions,
} from "./proof-service.js"

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>()
  for (const item of items) {
    const p = fn(item).finally(() => {
      executing.delete(p)
    })
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)
}

/**
 * Creates the proof runner that executes post-storyboard steps.
 * Currently runs: image captioning.
 * Future steps (glossary, easy read, etc.) will be added here.
 */
export function createProofRunner(): ProofRunner {
  return {
    async run(
      label: string,
      options: StartProofOptions,
      progress: ProofProgress
    ): Promise<void> {
      const { booksDir, apiKey, promptsDir, configPath } = options

      const previousKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = apiKey

      const storage = createBookStorage(label, booksDir)

      try {
        // Verify storyboard is accepted
        const acceptance = storage.getLatestNodeData(
          "storyboard-acceptance",
          "book"
        )
        if (!acceptance) {
          throw new Error(
            "Storyboard must be accepted before generating proof"
          )
        }

        // Load config
        const config = loadBookConfig(label, booksDir, configPath)
        const captionConfig = buildCaptionConfig(config)
        const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
        const promptEngine = createPromptEngine(promptsDir)
        const rateLimiter = config.rate_limit
          ? createRateLimiter(config.rate_limit.requests_per_minute)
          : undefined

        // Get book language from metadata
        const metadataRow = storage.getLatestNodeData("metadata", "book")
        const metadata = metadataRow?.data as {
          language_code?: string | null
        } | null
        const language =
          config.editing_language ??
          metadata?.language_code ??
          "en"

        const onLlmLog = (entry: LlmLogEntry) => {
          storage.appendLlmLog(entry)
          const step = entry.taskType as StepName
          progress.emit({
            type: "llm-log",
            step,
            itemId: entry.pageId ?? "",
            promptName: entry.promptName,
            modelId: entry.modelId,
            cacheHit: entry.cacheHit,
            durationMs: entry.durationMs,
            inputTokens: entry.usage?.inputTokens,
            outputTokens: entry.usage?.outputTokens,
            validationErrors: entry.validationErrors,
          })
        }

        const llmModel = createLLMModel({
          modelId: captionConfig.modelId,
          cacheDir,
          promptEngine,
          rateLimiter,
          onLog: onLlmLog,
        })

        // Step: Image Captioning
        const pages = storage.getPages()
        const effectiveConcurrency = config.concurrency ?? 32
        const totalPages = pages.length
        let completedCaptions = 0
        const failedPages: string[] = []

        progress.emit({ type: "step-start", step: "image-captioning" })

        await processWithConcurrency(
          pages,
          effectiveConcurrency,
          async (page: PageData) => {
            try {
              await captionPage(
                page,
                storage,
                llmModel,
                captionConfig,
                language
              )
              completedCaptions++
              progress.emit({
                type: "step-progress",
                step: "image-captioning",
                message: `${completedCaptions}/${totalPages}`,
                page: completedCaptions,
                totalPages,
              })
            } catch (err) {
              const msg = toErrorMessage(err)
              failedPages.push(`${page.pageId}: ${msg}`)
              progress.emit({
                type: "step-error",
                step: "image-captioning",
                error: `${page.pageId} failed: ${msg}`,
              })
            }
          }
        )

        if (failedPages.length > 0) {
          throw new Error(
            `${failedPages.length} page(s) failed captioning:\n${failedPages.join("\n")}`
          )
        }

        progress.emit({ type: "step-complete", step: "image-captioning" })

        // Future steps would go here:
        // - glossary generation
        // - easy read generation
        // - etc.
      } finally {
        storage.close()
        if (previousKey !== undefined) {
          process.env.OPENAI_API_KEY = previousKey
        } else {
          delete process.env.OPENAI_API_KEY
        }
      }
    },
  }
}

async function captionPage(
  page: PageData,
  storage: Storage,
  llmModel: ReturnType<typeof createLLMModel>,
  captionConfig: ReturnType<typeof buildCaptionConfig>,
  language: string
): Promise<void> {
  // Get rendered HTML for this page
  const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
  if (!renderingRow) {
    throw new Error(`Missing web-rendering output for page: ${page.pageId}`)
  }

  const parsedRendering = WebRenderingOutput.safeParse(renderingRow.data)
  if (!parsedRendering.success) {
    throw new Error(
      `Invalid web-rendering output for page: ${page.pageId}: ${parsedRendering.error.message}`
    )
  }
  const rendering = parsedRendering.data
  const htmlSections = rendering.sections.map((s) => s.html)

  // Extract image IDs from rendered HTML
  const imageIds = extractImageIds(htmlSections)
  if (imageIds.length === 0) {
    // No images in rendered HTML — store empty result
    storage.putNodeData("image-captioning", page.pageId, { captions: [] })
    return
  }

  // Load image base64 data
  const images = imageIds.map((imageId) => ({
    imageId,
    imageBase64: storage.getImageBase64(imageId),
  }))

  const pageImageBase64 = storage.getPageImageBase64(page.pageId)

  const result = await captionPageImages(
    {
      pageId: page.pageId,
      pageImageBase64,
      images,
      language,
    },
    captionConfig,
    llmModel
  )

  storage.putNodeData("image-captioning", page.pageId, result)
}
