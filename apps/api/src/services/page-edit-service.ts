import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import type { LLMModel } from "@adt/llm"
import { renderPage, buildRenderStrategyResolver, createTemplateEngine, loadBookConfig } from "@adt/pipeline"
import type { PageSectioningOutput } from "@adt/types"

export interface ReRenderOptions {
  label: string
  pageId: string
  booksDir: string
  promptsDir: string
  configPath?: string
  apiKey: string
}

export interface ReRenderResult {
  version: number
  rendering: unknown
}

export async function reRenderPage(
  options: ReRenderOptions
): Promise<ReRenderResult> {
  const { label, pageId, booksDir, promptsDir, configPath, apiKey } = options

  // Set API key
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    // Read latest pipeline data
    const sectionRow = storage.getLatestNodeData("page-sectioning", pageId)

    if (!sectionRow) {
      throw new Error(
        "Page must have page-sectioning data before re-rendering"
      )
    }

    const sectioning = sectionRow.data as PageSectioningOutput

    // Build image map (all page images — expandParts filters by pruned status)
    const allImages = storage.getPageImages(pageId)
    const renderImages = new Map<string, string>()
    for (const img of allImages) {
      renderImages.set(img.imageId, storage.getImageBase64(img.imageId))
    }

    // Load config and build render strategy resolver
    const config = loadBookConfig(label, booksDir, configPath)
    const resolveRenderConfig = buildRenderStrategyResolver(config)

    // Create LLM model resolver (model-specific, cached)
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const templatesDir = path.join(path.dirname(promptsDir), "templates")
    const templateEngine = createTemplateEngine(templatesDir)
    const renderModels = new Map<string, LLMModel>()
    const resolveRenderModel = (modelId: string): LLMModel => {
      const existing = renderModels.get(modelId)
      if (existing) return existing
      const model = createLLMModel({
        modelId,
        cacheDir,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
      })
      renderModels.set(modelId, model)
      return model
    }

    // Get page image
    const pageImageBase64 = storage.getPageImageBase64(pageId)

    // Render page
    const renderResult = await renderPage(
      {
        label,
        pageId,
        pageImageBase64,
        sectioning,
        images: renderImages,
      },
      resolveRenderConfig,
      resolveRenderModel,
      templateEngine
    )

    // Store result
    const version = storage.putNodeData("web-rendering", pageId, renderResult)

    return { version, rendering: renderResult }
  } finally {
    storage.close()
    // Restore previous key
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}
