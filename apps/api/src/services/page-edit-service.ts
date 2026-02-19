import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import type { LLMModel } from "@adt/llm"
import { renderPage, buildRenderStrategyResolver, createTemplateEngine, loadBookConfig } from "@adt/pipeline"
import { loadStyleguideContent } from "./pipeline-runner"
import type { PageSectioningOutput, WebRenderingOutput } from "@adt/types"
import { webRenderingLLMSchema } from "@adt/types"

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

export interface AiEditSectionOptions {
  label: string
  pageId: string
  sectionIndex: number
  instruction: string
  /** Optional: current HTML from the frontend (for successive edits on unsaved changes) */
  currentHtml?: string
  booksDir: string
  promptsDir: string
  configPath?: string
  apiKey: string
}

export interface AiEditSectionResult {
  html: string
  reasoning: string
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

    const styleguideContent = loadStyleguideContent(config.styleguide, configPath)

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
        styleguide: styleguideContent,
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

/**
 * Use LLM to edit a single section's HTML based on a natural language instruction.
 * Returns the edited HTML and reasoning without saving — the frontend previews first.
 */
export async function aiEditSection(
  options: AiEditSectionOptions
): Promise<AiEditSectionResult> {
  const { label, pageId, sectionIndex, instruction, currentHtml: providedHtml, booksDir, promptsDir, configPath, apiKey } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    // Use provided HTML (from frontend pending state) or read from DB
    let currentHtml: string
    if (providedHtml) {
      currentHtml = providedHtml
    } else {
      const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
      if (!renderingRow) {
        throw new Error("Page must have web-rendering data before AI editing")
      }
      const rendering = renderingRow.data as WebRenderingOutput
      const section = rendering.sections[sectionIndex]
      if (!section) {
        throw new Error(`Section ${sectionIndex} not found in rendering`)
      }
      currentHtml = section.html
    }

    // Load config to get model ID for editing
    const config = loadBookConfig(label, booksDir, configPath)
    const modelId = (config as Record<string, unknown>).page_sectioning
      ? ((config as Record<string, unknown>).page_sectioning as Record<string, unknown>).model as string
      : "openai:gpt-4o"

    // Build LLM model
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const model = createLLMModel({
      modelId,
      cacheDir,
      promptEngine,
      onLog: (entry) => storage.appendLlmLog(entry),
    })

    // Extract existing data-ids and img tags for validation
    const dataIdRegex = /data-id="([^"]+)"/g
    const existingIds = new Set<string>()
    let match
    while ((match = dataIdRegex.exec(currentHtml)) !== null) {
      existingIds.add(match[1])
    }

    // Extract img tags with their data-ids and srcs
    const imgTagRegex = /<img\s[^>]*data-id="([^"]+)"[^>]*src="([^"]+)"[^>]*>/g
    const existingImgs = new Map<string, string>() // data-id → src
    while ((match = imgTagRegex.exec(currentHtml)) !== null) {
      existingImgs.set(match[1], match[2])
    }
    // Also catch imgs where src comes before data-id
    const imgTagRegex2 = /<img\s[^>]*src="([^"]+)"[^>]*data-id="([^"]+)"[^>]*>/g
    while ((match = imgTagRegex2.exec(currentHtml)) !== null) {
      if (!existingImgs.has(match[2])) {
        existingImgs.set(match[2], match[1])
      }
    }

    const result = await model.generateObject<{ reasoning: string; content: string }>({
      schema: webRenderingLLMSchema,
      prompt: "html_edit",
      context: { current_html: currentHtml, instruction },
      validate: (obj) => {
        const r = obj as { content: string }
        // Strip markdown fences before validation so checks run on clean HTML
        const cleaned = r.content
          .replace(/^```(?:html)?\s*\n?/i, "")
          .replace(/\n?```\s*$/, "")
        const errors: string[] = []

        if (!cleaned.includes("<section")) {
          errors.push("Result must contain a <section> element")
        }

        // Verify all existing data-ids are preserved
        for (const id of existingIds) {
          if (!cleaned.includes(`data-id="${id}"`)) {
            errors.push(`Missing data-id="${id}" in result`)
          }
        }

        // Verify all <img> tags are preserved as <img> (not replaced with another tag)
        for (const [imgDataId, imgSrc] of existingImgs) {
          // Check this data-id is still on an <img> tag, not a <div> or <p>
          const imgCheck = new RegExp(`<img\\s[^>]*data-id="${imgDataId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`)
          if (!imgCheck.test(cleaned)) {
            // Try reversed attribute order
            const imgCheck2 = new RegExp(`<img\\s[^>]*src="[^"]*"[^>]*data-id="${imgDataId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`)
            if (!imgCheck2.test(cleaned)) {
              errors.push(`Image data-id="${imgDataId}" must remain an <img> tag`)
            }
          }
          // Check src is preserved
          if (!cleaned.includes(imgSrc)) {
            errors.push(`Image src="${imgSrc}" was removed or changed`)
          }
        }

        return { valid: errors.length === 0, errors }
      },
      maxRetries: 3,
      log: { taskType: "web-rendering", pageId, promptName: "html_edit" },
    })

    // Strip markdown fences if the LLM wrapped the content in ```html...```
    let html = result.object.content
    html = html.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/, "")

    return { html, reasoning: result.object.reasoning }
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}
