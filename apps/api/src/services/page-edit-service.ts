import { createRenderCachePublication, readOutputCatalog, outputIdentityKey } from "@adt/pipeline"
import { withBookWriter, resolveBookPaths } from "@adt/storage"
import {
  createStoryboardPublication, FIXED_LAYOUT_SECTIONING_NODE, SectioningSafetyError,
  isFixedLayoutBook, processFixedLayoutPages, stampGeneratedRendering, renderedSectionId,
  readGenerationCatalog, inputSignature, reconcileTextCatalog, storyboardGenerationContent,
} from "@adt/pipeline"
import crypto from "node:crypto"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import type { LLMModel, ResolvedCredentials, PromptEngine } from "@adt/llm"
import { renderPage, buildRenderStrategyResolver, buildBookFontsPromptContext, readTypography, buildTypographyCss, collectReferencedImageIds, collectSourcePageImages, createTemplateEngine, loadBookConfig, createScreenshotRenderer, runVisualReviewLoop, DEFAULT_VISUAL_REVIEW_MODEL_ID, buildScreenshotHtml, SCREENSHOT_VIEWPORTS, inspectOrderingActivityHtml, validateRetainedHeadingHierarchy } from "@adt/pipeline"
import type { VisualRefinementDeps } from "@adt/pipeline"
import { OUTPUT_KIND_TO_STEP, STAGE_BY_NAME, type OutputStatus, type StepName, PageSectioningOutput, WebRenderingOutput, webRenderingLLMSchema, editVerifyLLMSchema, DEFAULT_LLM_MODEL_ID } from "@adt/types"
import { loadStyleguideContent } from "./styleguide.js"
import { resolvePromptRoots, resolvePromptOverridesDir } from "./prompt-roots.js"
import { storedSynchronization, synchronizationLayout } from "./storyboard-save.js"
import { assertEditVersion } from "./catalog-output-service.js"
import type { SectioningRepairRequest } from "@adt/types"

export interface ReRenderOptions {
  label: string
  pageId: string
  sectionIndex?: number
  repair?: SectioningRepairRequest
  repairPurpose?: "synchronization" | "validation"
  recheckAdmission?: () => void
  signal?: AbortSignal
  /** Optional user prompt/instructions to guide the LLM during re-render */
  prompt?: string
  booksDir: string
  promptsDir: string
  webAssetsDir?: string
  configPath?: string
  credentials: ResolvedCredentials
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
  credentials: ResolvedCredentials
}

export interface AiEditSectionResult {
  html: string
  reasoning: string
  activityAnswers?: Record<string, string>
}

export async function reRenderPage(options: ReRenderOptions): Promise<ReRenderResult> {
  return (await reRenderPages([options]))[0]
}

export async function reRenderPages(options: ReRenderOptions[]): Promise<ReRenderResult[]> {
  if (!options.length) return []
  const { label, booksDir, configPath } = options[0]
  if (options.some((item) => item.label !== label || item.booksDir !== booksDir || item.configPath !== configPath)) throw new Error("A rendering batch must belong to one book")
  return withBookWriter(resolveBookPaths(label, booksDir).bookDir, async () => {
    const storage = createBookStorage(label, booksDir)
    try {
      const cachePublication = createRenderCachePublication(storage)
      const config = loadBookConfig(label, booksDir, configPath)
      const capturedEngine = createPromptEngine(resolvePromptRoots({ booksDir, promptsDir: options[0].promptsDir, bookPromptsDir: path.join(resolveBookPaths(label, booksDir).bookDir, "prompts") }), { basePromptModelId: config.base_prompt_model, capture: true })
      const scoped = options.every((item) => item.repair)
      const consumers = (): OutputStatus[] => {
        const shared = { storage, config: loadBookConfig(label, booksDir, configPath), bookDir: storage.bookDir!,
          promptsDir: options[0].promptsDir, promptOverridesDir: resolvePromptOverridesDir(booksDir),
          configDir: configPath ? path.join(path.dirname(configPath), "config") : path.resolve("config"), configPath }
        return [...readOutputCatalog(shared), ...readGenerationCatalog({ ...shared, webAssetsDir: options[0].webAssetsDir })]
          .filter((value) => !["extract-generation", "sectioning", "storyboard"].includes(value.identity.kind))
      }
      const beforeConsumers = scoped ? new Map(consumers().map((value) => [outputIdentityKey(value.identity), value])) : null
      const invalidateConsumers = beforeConsumers ? () => {
        const after = new Map(consumers().map((value) => [outputIdentityKey(value.identity), value]))
        const steps = new Set<StepName>()
        for (const key of new Set([...beforeConsumers.keys(), ...after.keys()])) {
          const previous = beforeConsumers.get(key), current = after.get(key)
          if (previous?.signature === current?.signature && previous?.excluded === current?.excluded) continue
          const kind = (current ?? previous)!.identity.kind
          if (kind === "package") STAGE_BY_NAME.package.steps.forEach((step) => steps.add(step.name))
          else steps.add(OUTPUT_KIND_TO_STEP[kind])
        }
        // Even a caller without packaged-asset options has changed the rendered
        // artifact. Its package/evidence step is the direct consumer.
        STAGE_BY_NAME.package.steps.forEach((step) => steps.add(step.name))
        return [...steps]
      } : undefined
      const publication = createStoryboardPublication(storage, label, booksDir, configPath,
        scoped ? options.map((item) => item.pageId) : undefined, false, invalidateConsumers)
      const generationInputs = (promptEngine?: PromptEngine) => readGenerationCatalog({ storage, promptEngine, config: loadBookConfig(label, booksDir, configPath),
        bookDir: resolveBookPaths(label, booksDir).bookDir, promptsDir: options[0].promptsDir,
        promptOverridesDir: resolvePromptOverridesDir(booksDir), configPath }).filter((status) => status.identity.kind === "storyboard" && options.some((item) => item.pageId === status.identity.id))
      const capturedInputs = options.some((item) => item.repair) ? inputSignature(generationInputs(capturedEngine).map((status) => [status.identity, status.signature, status.contentHash])) : null
      const validate = () => {
        for (const item of options) {
          item.signal?.throwIfAborted()
          item.recheckAdmission?.()
          if (!item.repair) continue
          assertEditVersion(storage.getLatestNodeData("page-sectioning", item.pageId)?.version, item.repair.baseVersion)
          assertEditVersion(storage.getLatestNodeData("web-rendering", item.pageId)?.version, item.repair.renderingVersion)
          const sync = storedSynchronization(storage, item.pageId, synchronizationLayout(storage, item.pageId, config), undefined, item.repairPurpose)
          if (item.repair.sectionIds.some((id) => sync.sections.filter((section) => section.sectionId === id && section.action === "repair").length !== 1)) {
            throw new Error("The requested sections are no longer eligible for repair. Reload and review their current protection and source.")
          }
        }
        if (capturedInputs && capturedInputs !== inputSignature(generationInputs().map((status) => [status.identity, status.signature, status.contentHash]))) throw new Error("Rendering inputs changed during repair. Previous output is retained.")
      }
      validate()
      const pages = new Set(publication.storage.getPages().map((page) => page.pageId))
      if (options.some((item) => !pages.has(item.pageId))) throw new Error("Requested page is outside the active source-page window")
      if (isFixedLayoutBook(loadBookConfig(label, booksDir, configPath))) {
        if (options.some((item) => item.sectionIndex !== undefined)) {
          throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "A fixed-layout page must be re-rendered as a whole. Existing output is kept.")
        }
        if (options.some((item) => item.prompt?.trim())) {
          throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Fixed-layout rendering uses extracted positioned content and cannot apply an LLM prompt. Existing output is kept.")
        }
        const pageIds = options.map((item) => item.pageId)
        processFixedLayoutPages(publication.storage, `/api/books/${label}/images`, pageIds)
        publication.publish(pageIds)
        return pageIds.map((pageId) => {
          const row = storage.getLatestNodeData("web-rendering", pageId)!
          return { version: row.version, rendering: row.data }
        })
      }
      const results: ReRenderResult[] = []
      for (const item of options) results.push(await reRenderAdmittedPage(item, publication, capturedEngine, cachePublication.write))
      validate()
      for (const item of options) if (item.repair) {
        const verified = storedSynchronization(publication.storage, item.pageId, "reflowable")
        if (item.repair.sectionIds.some((id) => verified.sections.find((section) => section.sectionId === id)?.status !== "current")) throw new Error("Generated output did not establish safe source correspondence. Previous output is retained; review the section.")
      }
      cachePublication.publish(options.map((item) => {
        const row = publication.storage.getLatestNodeData("web-rendering", item.pageId)!
        return { pageId: item.pageId, version: row.version, signature: inputSignature(row.data) }
      }), () => { validate(); publication.publish(options.map((item) => item.pageId)) })
      return results.map((result, index) => ({ ...result, version: storage.getLatestNodeData("web-rendering", options[index].pageId)!.version }))
    } finally { storage.close() }
  })
}

async function reRenderAdmittedPage(
  options: ReRenderOptions, publication: ReturnType<typeof createStoryboardPublication>, capturedEngine: PromptEngine,
  writeCache: ReturnType<typeof createRenderCachePublication>["write"],
): Promise<ReRenderResult> {
  const { label, pageId, sectionIndex, prompt, booksDir, promptsDir, webAssetsDir, configPath, credentials } = options

  const storage = publication.storage
  let visualRefinement: VisualRefinementDeps | undefined
  // Book typography (editable size-per-role map), shared with every rendered page.
  const typography = readTypography(storage)

  try {
    if (sectionIndex !== undefined && storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId)?.data != null) {
      throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "A positioned page must be re-rendered as a whole before re-rendering a semantic section. Existing output is kept.")
    }
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
    for (const imageId of collectReferencedImageIds(sectioning.sections)) {
      if (!renderImages.has(imageId)) {
        const dims = storage.getImageDimensions(imageId)
        renderImages.set(imageId, { base64: storage.getImageBase64(imageId), width: dims?.width, height: dims?.height })
      }
    }

    // Load config and build render strategy resolver
    const config = loadBookConfig(label, booksDir, configPath)
    const resolveRenderConfig = buildRenderStrategyResolver(config)

    const styleguideContent = loadStyleguideContent(
      config.styleguide,
      configPath,
      booksDir,
      label,
    )

    // Explicit rerenders request a fresh attempt, including answers/review.
    // Keep write-through so later ordinary calls with identical inputs reuse it.
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = capturedEngine
    const templatesDir = path.join(path.dirname(promptsDir), "templates")
    const templateEngine = createTemplateEngine(templatesDir)
    const renderModels = new Map<string, LLMModel>()
    const resolveRenderModel = (modelId: string): LLMModel => {
      const existing = renderModels.get(modelId)
      if (existing) return existing
      const model = createLLMModel({
        modelId,
        cacheDir,
        forceFresh: true,
        writeCache,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
        providerCredentials: credentials,
      })
      renderModels.set(modelId, model)
      return model
    }

    // Get page image
    const pageImageBase64 = storage.getPageImageBase64(pageId)

    // Page images for content merged in from other pages (cross-page merges) —
    // per-section provenance recorded in sourcePageIds.
    const sourcePageImages = collectSourcePageImages(
      sectioning.sections,
      (id) => storage.getPageImageBase64(id)
    )

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
            config.default_model ?? DEFAULT_VISUAL_REVIEW_MODEL_ID,
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
    const targetIds = options.repair?.sectionIds ?? (sectionIndex === undefined ? undefined : [sectioning.sections[sectionIndex].sectionId])
    const structuringForRender = !targetIds
      ? sectioning
      : {
          ...sectioning,
          sections: sectioning.sections.map((section, idx) =>
            targetIds.includes(section.sectionId) ? section : { ...section, isPruned: true }
          ),
        }

    const renderResult = await renderPage(
      {
        label,
        pageId,
        pageImageBase64,
        sectioning: structuringForRender,
        images: renderImages,
        sourcePageImages,
        styleguide: styleguideContent,
        bookFonts: buildBookFontsPromptContext(storage),
        typography,
        userPrompt: prompt,
      },
      resolveRenderConfig,
      resolveRenderModel,
      templateEngine,
      visualRefinement,
      { signal: options.signal },
    )

    const proven = stampGeneratedRendering(renderResult, sectioning, pageId, structuringRow.version)
    options.signal?.throwIfAborted()
    if (!targetIds) {
      const version = storage.putNodeData("web-rendering", pageId, proven)
      return { version, rendering: proven }
    }
    const existing = storage.getLatestNodeData("web-rendering", pageId)
    const parsed = WebRenderingOutput.safeParse(existing?.data)
    if (existing && !parsed.success) throw new Error("Invalid web-rendering data")
    const incoming = new Map(proven.sections.map((section) => [renderedSectionId(section), section]))
    if (targetIds.some((id) => !incoming.has(id))) throw new Error("Generation omitted a requested stable section")
    const matched = new Set<string>()
    const merged = (parsed.success ? parsed.data.sections : []).map((section) => {
      const id = renderedSectionId(section)
      if (!id || !targetIds.includes(id)) return section
      if (matched.has(id)) throw new Error("Ambiguous rendered section identity")
      matched.add(id)
      return incoming.get(id)!
    })
    for (const id of targetIds) if (!matched.has(id)) merged.push(incoming.get(id)!)
    // Partial repair cannot certify unchanged siblings against new prompts or
    // configuration. Retain their previous generation signature as stale while
    // updating the content hash, so shared resume still recognizes AI output.
    const previousEvidence = parsed.success ? parsed.data.generationEvidence : undefined
    const rendering: WebRenderingOutput = { ...(parsed.success ? parsed.data : {}), sections: merged }
    if (previousEvidence?.source === "ai" && previousEvidence.input
      && previousEvidence.input.contentHash === inputSignature(storyboardGenerationContent(parsed.success ? parsed.data : null, storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId)?.data))) {
      rendering.generationEvidence = { source: "ai", input: { ...previousEvidence.input, contentHash: inputSignature(storyboardGenerationContent(rendering, storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId)?.data)) } }
    } else delete rendering.generationEvidence
    const version = storage.putNodeData("web-rendering", pageId, rendering)
    return { version, rendering }
  } finally {
    if (visualRefinement) await visualRefinement.screenshotRenderer.close()
  }
}

/**
 * Use LLM to edit a single section's HTML based on a natural language instruction.
 * Returns the edited HTML and reasoning without saving — the frontend previews first.
 */
export async function aiEditSection(
  options: AiEditSectionOptions
): Promise<AiEditSectionResult> {
  const { label, pageId, sectionIndex, instruction, currentHtml: providedHtml, booksDir, promptsDir, webAssetsDir, configPath, credentials } = options

  const storage = createBookStorage(label, booksDir)
  // Book typography CSS so edit screenshots match the packaged book's sizes.
  const typographyCss = buildTypographyCss(readTypography(storage))

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
    const originalOrdering = inspectOrderingActivityHtml(currentHtml)

    // Load config to get model ID for editing. Same fallback chain every other
    // "thoughtful" LLM step uses — `page_sectioning` may exist without a `model`
    // key, so never key the fallback off the section's presence.
    const config = loadBookConfig(label, booksDir, configPath)
    const modelId =
      config.page_sectioning?.model ?? config.default_model ?? DEFAULT_LLM_MODEL_ID

    // Build LLM model
    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine(resolvePromptRoots({ booksDir, promptsDir, bookPromptsDir }), { basePromptModelId: config.base_prompt_model, capture: true })
    const model = createLLMModel({
      modelId,
      cacheDir,
      promptEngine,
      onLog: (entry) => storage.appendLlmLog(entry),
      providerCredentials: credentials,
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
        typographyCss,
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
      errors.push(...validateRetainedHeadingHierarchy(currentHtml, cleanedHtml))
      if (originalOrdering.isOrdering) {
        const ordering = inspectOrderingActivityHtml(cleanedHtml)
        if (!ordering.isOrdering) {
          errors.push("AI editing must preserve the activity_ordering section type")
        } else {
          errors.push(...ordering.errors)
        }
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
        modelId: config.default_model ?? DEFAULT_VISUAL_REVIEW_MODEL_ID,
        cacheDir,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
        providerCredentials: credentials,
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
          typographyCss,
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

    const ordering = inspectOrderingActivityHtml(html)
    return {
      html,
      reasoning,
      ...(ordering.contract ? { activityAnswers: ordering.contract.answers } : {}),
    }
  } finally {
    storage.close()
  }
}
