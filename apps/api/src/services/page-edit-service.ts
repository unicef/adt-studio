import crypto from "node:crypto"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import type { LLMModel } from "@adt/llm"
import { renderPage, buildRenderStrategyResolver, createTemplateEngine, loadBookConfig, createScreenshotRenderer, SCREENSHOT_VIEWPORTS, getViewportBreakpoints, buildScreenshotHtml } from "@adt/pipeline"
import type { VisualRefinementDeps } from "@adt/pipeline"
import type { Message, ContentPart } from "@adt/llm"
import { loadStyleguideContent } from "./styleguide.js"
import { PageSectioningOutput, WebRenderingOutput, webRenderingLLMSchema, visualReviewLLMSchema } from "@adt/types"

export interface ReRenderOptions {
  label: string
  pageId: string
  sectionIndex?: number
  booksDir: string
  promptsDir: string
  webAssetsDir?: string
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
  webAssetsDir?: string
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
  const { label, pageId, sectionIndex, booksDir, promptsDir, webAssetsDir, configPath, apiKey } = options

  // Set API key
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)
  let visualRefinement: VisualRefinementDeps | undefined

  try {
    // Read latest pipeline data
    const sectionRow = storage.getLatestNodeData("page-sectioning", pageId)

    if (!sectionRow) {
      throw new Error(
        "Page must have page-sectioning data before re-rendering"
      )
    }

    const sectioningParsed = PageSectioningOutput.safeParse(sectionRow.data)
    if (!sectioningParsed.success) {
      throw new Error("Invalid page-sectioning data")
    }
    const sectioning = sectioningParsed.data

    // Build image map (all page images — expandParts filters by pruned status)
    const allImages = storage.getPageImages(pageId)
    const renderImages = new Map<string, { base64: string; width?: number; height?: number }>()
    for (const img of allImages) {
      renderImages.set(img.imageId, { base64: storage.getImageBase64(img.imageId), width: img.width, height: img.height })
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

    if (sectionIndex !== undefined && (sectionIndex < 0 || sectionIndex >= sectioning.sections.length)) {
      throw new Error(`Section index ${sectionIndex} out of range`)
    }

    // Set up visual refinement if any render strategy enables it
    if (webAssetsDir) {
      const hasVisualRefinement = Object.values(config.render_strategies ?? {}).some(
        (s) => s.config?.visual_refinement?.enabled
      )
      if (hasVisualRefinement) {
        const screenshotRenderer = await createScreenshotRenderer()
        visualRefinement = {
          screenshotRenderer,
          webAssetsDir,
          llmModel: resolveRenderModel(
            Object.values(config.render_strategies ?? {}).find((s) => s.config?.visual_refinement?.model)?.config?.visual_refinement?.model
              ?? "openai:gpt-5.2"
          ),
          storeScreenshot: (base64: string) => {
            const hash = crypto.createHash("sha256").update(base64).digest("hex").slice(0, 16)
            storage.putDebugImage(hash, Buffer.from(base64, "base64"))
          },
        }
      }
    }

    // Render either a single section (preferred) or the full page.
    // For section re-render we force all other sections to pruned in-memory so
    // renderPage preserves the original sectionIndex while skipping extra LLM calls.
    const sectioningForRender = sectionIndex === undefined
      ? sectioning
      : {
          ...sectioning,
          sections: sectioning.sections.map((section, idx) =>
            idx === sectionIndex ? section : { ...section, isPruned: true }
          ),
        }

    const renderResult = await renderPage(
      {
        label,
        pageId,
        pageImageBase64,
        sectioning: sectioningForRender,
        images: renderImages,
        styleguide: styleguideContent,
      },
      resolveRenderConfig,
      resolveRenderModel,
      templateEngine,
      visualRefinement,
    )

    if (sectionIndex === undefined) {
      const version = storage.putNodeData("web-rendering", pageId, renderResult)
      return { version, rendering: renderResult }
    }

    // Merge the newly rendered section back into existing rendering, preserving
    // other sections as-is.
    const existingRenderingRow = storage.getLatestNodeData("web-rendering", pageId)
    const existingRenderingParsed = existingRenderingRow
      ? WebRenderingOutput.safeParse(existingRenderingRow.data)
      : null
    if (existingRenderingRow && !existingRenderingParsed?.success) {
      throw new Error("Invalid web-rendering data")
    }
    const existingSections = existingRenderingParsed?.success
      ? existingRenderingParsed.data.sections
      : []
    const withoutTarget = existingSections.filter((s) => s.sectionIndex !== sectionIndex)
    const newTarget = renderResult.sections.find((s) => s.sectionIndex === sectionIndex)
    const mergedSections = newTarget
      ? [...withoutTarget, newTarget].sort((a, b) => a.sectionIndex - b.sectionIndex)
      : withoutTarget.sort((a, b) => a.sectionIndex - b.sectionIndex)
    const mergedRendering = { sections: mergedSections }

    const version = storage.putNodeData("web-rendering", pageId, mergedRendering)
    return { version, rendering: mergedRendering }
  } finally {
    if (visualRefinement) {
      await visualRefinement.screenshotRenderer.close()
    }
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
  const { label, pageId, sectionIndex, instruction, currentHtml: providedHtml, booksDir, promptsDir, webAssetsDir, configPath, apiKey } = options

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
      const renderingParsed = WebRenderingOutput.safeParse(renderingRow.data)
      if (!renderingParsed.success) {
        throw new Error("Invalid web-rendering data")
      }
      const section = renderingParsed.data.sections.find((s) => s.sectionIndex === sectionIndex)
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

    // Load the original page image so the LLM can see the intended layout
    let pageImageBase64: string | undefined
    try {
      pageImageBase64 = storage.getPageImageBase64(pageId)
    } catch {
      // Page image not available — proceed without it
    }

    const result = await model.generateObject<{ reasoning: string; content: string }>({
      schema: webRenderingLLMSchema,
      prompt: "html_edit",
      context: { current_html: currentHtml, instruction, page_image_base64: pageImageBase64 },
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

    // Visual refinement loop — screenshot the edited HTML and verify
    if (webAssetsDir) {
      // Find first render strategy with visual refinement enabled
      const vrStrategyConfig = Object.values(config.render_strategies ?? {})
        .find((s) => s.config?.visual_refinement?.enabled)?.config?.visual_refinement
      if (vrStrategyConfig?.enabled) {
        const maxIterations = vrStrategyConfig.max_iterations ?? 3
        const vrModelId = vrStrategyConfig.model ?? "openai:gpt-5.2"
        const vrTimeout = vrStrategyConfig.timeout ?? 120
        const vrTemperature = vrStrategyConfig.temperature

        const reviewModel = createLLMModel({
          modelId: vrModelId,
          cacheDir,
          promptEngine,
          onLog: (entry) => storage.appendLlmLog(entry),
        })

        // Build image map from data-ids in the HTML for screenshot rendering
        const imagesForScreenshot = new Map<string, { base64: string }>()
        for (const [imgDataId] of existingImgs) {
          try {
            imagesForScreenshot.set(imgDataId, { base64: storage.getImageBase64(imgDataId) })
          } catch {
            // Image not found in storage — skip (will show broken in screenshot)
          }
        }

        // Render the review prompt template to get system message
        const initialMessages = await reviewModel.renderPrompt("visual_review_edit", {
          instruction,
          viewports: getViewportBreakpoints(),
        })
        const systemMsg = initialMessages.find((m) => m.role === "system")
        const systemPrompt = typeof systemMsg?.content === "string" ? systemMsg.content : undefined

        const screenshotRenderer = await createScreenshotRenderer()
        try {
          const conversationMessages: Message[] = []

          for (let iteration = 0; iteration < maxIterations; iteration++) {
            const screenshotHtml = await buildScreenshotHtml({
              sectionHtml: html,
              label,
              images: imagesForScreenshot,
              webAssetsDir,
            })

            // Take screenshots at multiple viewport sizes
            const screenshotParts: ContentPart[] = []
            for (const vp of SCREENSHOT_VIEWPORTS) {
              const base64 = await screenshotRenderer.screenshot(
                screenshotHtml,
                { width: vp.width, height: vp.height }
              )
              // Store for debug UI
              const hash = crypto.createHash("sha256").update(base64).digest("hex").slice(0, 16)
              storage.putDebugImage(hash, Buffer.from(base64, "base64"))
              screenshotParts.push(
                { type: "text", text: `${vp.label} screenshot (${vp.width}px wide):` },
                { type: "image", image: base64 },
              )
            }

            // Build user message
            const userParts: ContentPart[] = []
            if (iteration === 0) {
              if (pageImageBase64) {
                userParts.push(
                  { type: "text", text: "Here is the original page image for reference:" },
                  { type: "image", image: pageImageBase64 },
                )
              }
              userParts.push(
                { type: "text", text: "\nHere are screenshots of the edited HTML at three viewport sizes:\n" },
              )
            } else {
              userParts.push(
                { type: "text", text: "Here are the updated screenshots after your revision:\n" },
              )
            }
            userParts.push(...screenshotParts)
            userParts.push(
              { type: "text", text: `\nEdit instruction: ${instruction}\n\nCurrent HTML:\n\`\`\`html\n${html}\n\`\`\`` },
            )

            conversationMessages.push({ role: "user", content: userParts })

            const reviewResult = await reviewModel.generateObject<{
              approved: boolean
              reasoning: string
              content: string
            }>({
              schema: visualReviewLLMSchema,
              system: systemPrompt,
              messages: conversationMessages,
              maxRetries: 2,
              maxTokens: 16384,
              temperature: vrTemperature,
              timeoutMs: vrTimeout * 1000,
              log: {
                taskType: "visual-review",
                pageId,
                promptName: "visual_review_edit",
              },
            })

            conversationMessages.push({
              role: "assistant",
              content: JSON.stringify(reviewResult.object, null, 2),
            })

            if (reviewResult.object.approved) break
            if (!reviewResult.object.content) break

            // Validate the revised HTML structurally before accepting
            const revised = reviewResult.object.content
              .replace(/^```(?:html)?\s*\n?/i, "")
              .replace(/\n?```\s*$/, "")

            const errors: string[] = []
            if (!revised.includes("<section")) {
              errors.push("Result must contain a <section> element")
            }
            for (const id of existingIds) {
              if (!revised.includes(`data-id="${id}"`)) {
                errors.push(`Missing data-id="${id}" in result`)
              }
            }
            for (const [imgDataId, imgSrc] of existingImgs) {
              const imgCheck = new RegExp(`<img\\s[^>]*data-id="${imgDataId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`)
              if (!imgCheck.test(revised)) {
                const imgCheck2 = new RegExp(`<img\\s[^>]*src="[^"]*"[^>]*data-id="${imgDataId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`)
                if (!imgCheck2.test(revised)) {
                  errors.push(`Image data-id="${imgDataId}" must remain an <img> tag`)
                }
              }
              if (!revised.includes(imgSrc)) {
                errors.push(`Image src="${imgSrc}" was removed or changed`)
              }
            }

            if (errors.length === 0) {
              html = revised
            } else {
              conversationMessages.push({
                role: "user",
                content: "Your revision failed structural validation with these errors:\n" +
                  errors.map((e) => `- ${e}`).join("\n") +
                  "\n\nPlease fix these issues in your next revision.",
              })
            }
          }
        } finally {
          await screenshotRenderer.close()
        }
      }
    }

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
