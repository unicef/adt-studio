import crypto from "node:crypto"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import type { LLMModel } from "@adt/llm"
import { renderPage, buildRenderStrategyResolver, createTemplateEngine, loadBookConfig, createScreenshotRenderer, runVisualReviewLoop, DEFAULT_VISUAL_REVIEW_MODEL_ID, buildScreenshotHtml, SCREENSHOT_VIEWPORTS } from "@adt/pipeline"
import type { VisualRefinementDeps } from "@adt/pipeline"
import { PageSectioningOutput, WebRenderingOutput, webRenderingLLMSchema, editVerifyLLMSchema } from "@adt/types"
import { loadStyleguideContent } from "./styleguide.js"

export interface ReRenderOptions {
  label: string
  pageId: string
  sectionIndex?: number
  /** Optional user prompt/instructions to guide the LLM during re-render */
  prompt?: string
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
  const { label, pageId, sectionIndex, prompt, booksDir, promptsDir, webAssetsDir, configPath, apiKey } = options

  // Set API key
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)
  let visualRefinement: VisualRefinementDeps | undefined

  try {
    const structuringRow = storage.getLatestNodeData("page-sectioning", pageId)

    if (!structuringRow) {
      throw new Error(
        "Page must have page-sectioning data before re-rendering"
      )
    }

    const structuringParsed = PageSectioningOutput.safeParse(structuringRow.data)
    if (!structuringParsed.success) {
      throw new Error("Invalid page-sectioning data")
    }
    const sectioning = structuringParsed.data

    // Build image map: start with all page images, then add any additional images
    // referenced by image_group nodes (e.g. from cross-page merges).
    const allImages = storage.getPageImages(pageId)
    const renderImages = new Map<string, { base64: string; width?: number; height?: number }>()
    for (const img of allImages) {
      renderImages.set(img.imageId, { base64: storage.getImageBase64(img.imageId), width: img.width, height: img.height })
    }
    // Walk the tree to find any image leaf nodeIds not already covered
    const collectImageIds = (
      node: { role?: string; nodeId?: string; isPruned?: boolean; children?: unknown[] },
      out: Set<string>,
    ): void => {
      if (node.isPruned) return
      if (node.role === "image" && node.nodeId) out.add(node.nodeId)
      if (Array.isArray(node.children)) {
        for (const c of node.children) collectImageIds(c as Parameters<typeof collectImageIds>[0], out)
      }
    }
    const referencedIds = new Set<string>()
    for (const section of sectioning.sections) {
      if (section.isPruned) continue
      for (const n of section.nodes) collectImageIds(n, referencedIds)
    }
    for (const imageId of referencedIds) {
      if (!renderImages.has(imageId)) {
        const dims = storage.getImageDimensions(imageId)
        renderImages.set(imageId, { base64: storage.getImageBase64(imageId), width: dims?.width, height: dims?.height })
      }
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
          llmModel: resolveRenderModel(DEFAULT_VISUAL_REVIEW_MODEL_ID),
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
    const structuringForRender = sectionIndex === undefined
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
        sectioning: structuringForRender,
        images: renderImages,
        styleguide: styleguideContent,
        userPrompt: prompt,
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
    storage.clearNodesByType([
      "image-captioning",
      "text-catalog",
      "easy-read",
      "text-catalog-translation",
      "tts",
      "tts-timestamps",
      "accessibility-assessment",
    ])
    storage.clearStepRuns([
      "image-captioning",
      "text-catalog",
      "easy-read",
      "catalog-translation",
      "image-translation",
      "tts",
      "word-timestamps",
      "package-web",
      "accessibility-assessment",
    ])
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

    // Gather the imageIds referenced in the HTML so screenshots render their
    // actual pixels instead of broken tags.
    const referencedImageIds = new Set<string>()
    const imgDataIdRegex = /<img\s[^>]*data-id="([^"]+)"/g
    let m: RegExpExecArray | null
    while ((m = imgDataIdRegex.exec(currentHtml)) !== null) {
      referencedImageIds.add(m[1])
    }
    const imagesForScreenshot = new Map<string, { base64: string }>()
    for (const id of referencedImageIds) {
      try {
        imagesForScreenshot.set(id, { base64: storage.getImageBase64(id) })
      } catch {
        // image not in storage — screenshot will show a broken image but that's fine
      }
    }

    // Screenshot the CURRENT HTML at all three viewports so the LLM sees what the
    // user sees in the preview — not the original PDF page (which would anchor
    // edits toward the book's layout and fight the user's instruction).
    // We deliberately do NOT run the visual-review loop on the edit output: that
    // reviewer compares against the original page and would revert user-requested
    // changes. AI edits are final — users can roll back via entity versioning.
    const screenshots: { label: string; width: number; base64: string }[] = []
    if (webAssetsDir) {
      const screenshotHtml = await buildScreenshotHtml({
        sectionHtml: currentHtml,
        label,
        images: imagesForScreenshot,
        webAssetsDir,
      })
      const renderer = await createScreenshotRenderer()
      try {
        for (const vp of SCREENSHOT_VIEWPORTS) {
          const base64 = await renderer.screenshot(screenshotHtml, {
            width: vp.width,
            height: vp.height,
          })
          const hash = crypto.createHash("sha256").update(base64).digest("hex").slice(0, 16)
          storage.putDebugImage(hash, Buffer.from(base64, "base64"))
          screenshots.push({ label: vp.label, width: vp.width, base64 })
        }
      } finally {
        await renderer.close()
      }
    }

    // Structural check only. We deliberately do NOT enforce data-id / image
    // preservation here: the instruction may legitimately ask the LLM to remove
    // or replace elements, and silently retrying three times hides that intent.
    const validateEditedHtml = (rawHtml: string) => {
      const cleanedHtml = rawHtml
        .replace(/^```(?:html)?\s*\n?/i, "")
        .replace(/\n?```\s*$/, "")
      const errors: string[] = []
      if (!cleanedHtml.includes("<section")) {
        errors.push("Result must contain a <section> element")
      }
      return { valid: errors.length === 0, errors, cleanedHtml }
    }

    // One correlationId groups every LLM call produced by this single user
    // edit (first edit + verify + optional retry) so the history UI can show
    // them as a single conversation turn.
    const correlationId = crypto.randomUUID()

    const runEditPass = async (previousAttemptFailure?: string) => {
      const r = await model.generateObject<{ reasoning: string; content: string }>({
        schema: webRenderingLLMSchema,
        prompt: "html_edit",
        context: {
          current_html: currentHtml,
          instruction,
          screenshots,
          previous_attempt_failure: previousAttemptFailure,
        },
        validate: (obj) => {
          const resp = obj as { content: string }
          const check = validateEditedHtml(resp.content)
          return { valid: check.valid, errors: check.errors }
        },
        maxRetries: 3,
        log: {
          taskType: "web-rendering",
          pageId,
          promptName: "html_edit",
          sectionIndex,
          correlationId,
        },
      })
      return {
        html: validateEditedHtml(r.object.content).cleanedHtml,
        reasoning: r.object.reasoning,
      }
    }

    let { html, reasoning } = await runEditPass()

    // Lightweight verification: screenshot the edited HTML at desktop width and
    // ask a small vision model whether the instruction was actually applied.
    // If not, retry the edit once, then re-verify so the history UI reflects
    // the retry's real outcome (turn.verify is last-write-wins in the history
    // endpoint). Skipped when webAssetsDir isn't available.
    const desktopBefore = screenshots.find((s) => s.label === "desktop")?.base64
    if (webAssetsDir && desktopBefore) {
      const assetsDir = webAssetsDir
      const desktopVp = SCREENSHOT_VIEWPORTS.find((v) => v.label === "desktop")!
      const verifyModel = createLLMModel({
        modelId: DEFAULT_VISUAL_REVIEW_MODEL_ID,
        cacheDir,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
      })

      const runVerify = async (candidateHtml: string) => {
        const afterImageIds = new Set<string>()
        let am: RegExpExecArray | null
        imgDataIdRegex.lastIndex = 0
        while ((am = imgDataIdRegex.exec(candidateHtml)) !== null) {
          afterImageIds.add(am[1])
        }
        const afterImages = new Map<string, { base64: string }>()
        for (const id of afterImageIds) {
          const existing = imagesForScreenshot.get(id)
          if (existing) {
            afterImages.set(id, existing)
            continue
          }
          try {
            afterImages.set(id, { base64: storage.getImageBase64(id) })
          } catch {
            // image not in storage — will show broken in screenshot
          }
        }

        const afterHtmlDoc = await buildScreenshotHtml({
          sectionHtml: candidateHtml,
          label,
          images: afterImages,
          webAssetsDir: assetsDir,
        })
        const renderer = await createScreenshotRenderer()
        let desktopAfter: string
        try {
          desktopAfter = await renderer.screenshot(afterHtmlDoc, {
            width: desktopVp.width,
            height: desktopVp.height,
          })
        } finally {
          await renderer.close()
        }
        const hash = crypto.createHash("sha256").update(desktopAfter).digest("hex").slice(0, 16)
        storage.putDebugImage(hash, Buffer.from(desktopAfter, "base64"))

        return verifyModel.generateObject<{ applied: boolean; reason: string }>({
          schema: editVerifyLLMSchema,
          prompt: "html_edit_verify",
          context: {
            instruction,
            before_base64: desktopBefore,
            after_base64: desktopAfter,
          },
          maxRetries: 1,
          log: {
            taskType: "web-rendering",
            pageId,
            promptName: "html_edit_verify",
            sectionIndex,
            correlationId,
          },
        })
      }

      const verify = await runVerify(html)

      if (!verify.object.applied) {
        const retry = await runEditPass(verify.object.reason)
        html = retry.html
        reasoning = retry.reasoning
        await runVerify(html)
      }
    }

    return { html, reasoning }
  } finally {
    storage.close()
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
  }
}
