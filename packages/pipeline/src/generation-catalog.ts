import { qualifyPageRecovery } from "./page-recovery.js"
import { STEP_TO_STAGE, getStageDependents, type StepName } from "@adt/types"
import { FIXED_LAYOUT_SECTIONING_NODE } from "./render-sectioning.js"
import { isFixedLayoutBook } from "./fixed-layout-rendering.js"
import { collectReferencedImageIds } from "./web-rendering.js"
import { buildMeaningfulnessConfig } from "./image-meaningfulness.js"
import { buildSegmentationConfig } from "./image-segmentation.js"
import { buildCroppingConfig } from "./image-cropping.js"
import { buildRenderStrategyResolver } from "./web-rendering.js"
import { loadStyleguideContent } from "./styleguide.js"
import { computePackagingInputHash } from "./packaging/web.js"
import fs from "node:fs"
import path from "node:path"
import { createPromptEngine, promptRoots, type PromptEngine } from "@adt/llm"
import { readExtractionManifest, ExtractionAdmissionError, type Storage } from "@adt/storage"
import { ImageClassificationOutput, BookMetadata, BookSummaryOutput, BookOutlineOutput, WebRenderingOutput, GlossaryOutput, QuizGenerationOutput, TocGenerationOutput, PageSectioningOutput, OutputMetadata, type AppConfig, type OutputStatus, type StageName } from "@adt/types"
import { deriveOutputStatus, inputSignature } from "./output-freshness.js"
import { buildMetadataConfig } from "./metadata-extraction.js"
import { buildBookSummaryConfig } from "./book-summary.js"
import { buildBookOutlineConfig } from "./book-outline.js"
import { buildPageSectioningConfig } from "./page-sectioning.js"
import { buildTranslationConfig } from "./translation.js"
import { extractTextFromHtml, buildQuizGenerationConfig } from "./quiz-generation.js"
import { buildGlossaryConfig } from "./glossary.js"
import { buildTocGenerationConfig, collectHeadingsAndToc } from "./toc-generation.js"
import { activeSectioningPages } from "./sectioning-lifecycle.js"
import { normalizeLocale } from "./language-context.js"

export const GENERATION_NODES = {
  "extract-generation": "metadata", sectioning: "page-sectioning", storyboard: "web-rendering",
  quizzes: "quiz-generation", glossary: "glossary", toc: "toc-generation", package: "accessibility-assessment",
} as const
export type GenerationKind = keyof typeof GENERATION_NODES
export const isGenerationKind = (kind: string): kind is GenerationKind => Object.hasOwn(GENERATION_NODES, kind)
const kindStage = (kind: GenerationKind): StageName => kind === "extract-generation" ? "extract" : kind

/** Evidence is adjacent to content in the same version; it is not content input. */
export function generationContent(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const { generationEvidence: _evidence, ...content } = value as Record<string, unknown>
  if (Array.isArray(content.sections)) content.sections = content.sections.map((section) => {
    if (!section || typeof section !== "object" || typeof section.html !== "string") return section
    const { generationEvidence: _sectionEvidence, ...rendering } = section
    return rendering
  })
  return content
}

export function directoryContent(directory: string): unknown {
  let stat: fs.Stats
  try { stat = fs.lstatSync(directory) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
  if (!stat.isDirectory()) throw new Error("Invalid generation resource directory")
  const walk = (dir: string): unknown[] => fs.readdirSync(dir).sort().map((name) => {
    const file = path.join(dir, name), stat = fs.lstatSync(file)
    if (!stat.isDirectory() && !stat.isFile()) throw new Error("Generation resources must be regular files or directories")
    return [path.relative(directory, file), stat.isDirectory() ? walk(file) : inputSignature(fs.readFileSync(file).toString("base64"))]
  })
  return walk(directory)
}

export interface GenerationCatalogOptions {
  storage: Storage; config: AppConfig; bookDir: string; promptsDir: string; promptOverridesDir?: string; promptEngine?: PromptEngine; templatesDir?: string; webAssetsDir?: string; configDir?: string; configPath?: string
}

/** Shared output projection for the generation units outside the V1 text catalog.
 * Explicit relevant inputs; downstream language/voice changes cannot invalidate
 * extraction/Sectioning. No completed step is used as generation evidence.
 */
/** Exact shared content projection for Storyboard freshness and publication. */
export function storyboardGenerationContent(rendering: unknown, positioned: unknown): unknown {
  return rendering ? { html: generationContent(rendering), positioned: generationContent(positioned) } : undefined
}

export function readGenerationCatalog(options: GenerationCatalogOptions): OutputStatus[] {
  const { storage, config, bookDir, promptsDir } = options
  const pages = activeSectioningPages(storage, config, bookDir)
  const read = (node: string, id = "book") => generationContent(storage.getLatestNodeData(node, id)?.data)
  const metadata = read("metadata") as { language_code?: string } | undefined
  const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")
  const engine = options.promptEngine ?? createPromptEngine(promptRoots(path.dirname(bookDir), promptsDir, options.promptOverridesDir, path.join(bookDir, "prompts")), { basePromptModelId: config.base_prompt_model })
  const promptConfig = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value
    const c = value as { promptName?: string; modelId?: string; refinementPromptName?: string }
    let prompt: string | undefined
    if (c.promptName) { try { prompt = engine.fingerprint(c.promptName, { modelId: c.modelId }) } catch (error) { if (error instanceof Error && error.message.includes("Dynamic prompt includes")) throw new ExtractionAdmissionError("UNSAFE_RESUME_UNAVAILABLE"); prompt = "missing" } }
    let refinement: string | undefined
    if (c.refinementPromptName) { try { refinement = engine.fingerprint(c.refinementPromptName, { modelId: c.modelId }) } catch (error) { if (error instanceof Error && error.message.includes("Dynamic prompt includes")) throw new ExtractionAdmissionError("UNSAFE_RESUME_UNAVAILABLE"); refinement = "missing" } }
    return { ...c, prompt, refinement }
  }
  const image = (id: string) => { try { return inputSignature(storage.getImageBase64(id)) } catch { return null } }
  const pageImages = (id: string) => {
    const filtered = read("image-filtering", id) as { images?: Array<{ imageId: string }> } | undefined
    return (Array.isArray(filtered?.images) ? filtered.images.filter((entry) => typeof entry?.imageId === "string").map((entry) => entry.imageId) : storage.getPageImages(id).map((entry) => entry.imageId)).map((imageId) => [imageId, image(imageId)])
  }
  const rendered = pages.map((page) => [page.pageId,
    (WebRenderingOutput.safeParse(read("web-rendering", page.pageId)).data?.sections ?? []).map((section) => extractTextFromHtml(section.html)),
    read("page-sectioning", page.pageId)])
  const statuses: OutputStatus[] = []
  const pageErrors = storage.getPageRecovery()
  const add = (kind: GenerationKind, id: string, inputs: unknown, content: unknown, excluded = false, usable = content != null, blocked = false) => {
    const raw = storage.getLatestNodeData(GENERATION_NODES[kind], id)?.data as { generationEvidence?: unknown } | undefined
    const parsed = OutputMetadata.safeParse(raw?.generationEvidence)
    const data = raw as { source?: string; items?: Array<{ source?: string }>; quizzes?: Array<{ source?: string }> } | undefined
    const manual = data?.source === "manual" || [...(Array.isArray(data?.items) ? data.items : []), ...(Array.isArray(data?.quizzes) ? data.quizzes : [])].some((entry) => entry.source === "manual")
    const evidence = parsed.success ? { ...parsed.data, ...(manual ? { source: "manual" as const } : {}) } : manual ? { source: "manual" as const } : undefined
    const status = deriveOutputStatus({ identity: { kind, id }, signature: inputSignature({ contract: 1, kind, inputs }), content,
      metadata: evidence, usable, excluded })
    statuses.push({ ...status, current: status.current && !blocked, ...(blocked ? { blocked: true, warnings: [...status.warnings, { reason: "upstream" as const }] } : {}), pageIds: id === "book" ? pages.map((page) => page.pageId) : [id] })
  }
  // Source inputs are immutable extraction data, not the current derived images.
  const manifest = readExtractionManifest(bookDir)
  const extractedOutputs = ["metadata", "book-summary", "book-outline"].map((node) => [node, read(node)])
  const classification = pages.map((page) => [page.pageId, ...["image-filtering", "image-segmentation", "image-cropping"].map((node) => read(node, page.pageId)), pageImages(page.pageId)])
  const initialMetadata = manifest?.nodes?.find((entry: { node: string; itemId: string }) => entry.node === "metadata" && entry.itemId === "book")
  const onlyExtractionMetadata = initialMetadata?.version === storage.getLatestNodeData("metadata", "book")?.version
    && !read("book-summary") && !read("book-outline") && pages.every((page) => !read("image-filtering", page.pageId))
  add("extract-generation", "book", { source: manifest?.inputFingerprint, sourceHash: manifest?.sourceHash, pages,
    metadata: promptConfig(buildMetadataConfig(config)), summary: promptConfig(buildBookSummaryConfig(config, config.editing_language ?? "detected")), outline: promptConfig(buildBookOutlineConfig(config)),
    imageConfig: { filters: config.image_filters, meaningfulness: promptConfig(buildMeaningfulnessConfig(config)), segmentation: promptConfig(buildSegmentationConfig(config)), cropping: promptConfig(buildCroppingConfig(config)) }, typeScale: read("type-scale"),

  }, !onlyExtractionMetadata && extractedOutputs.some(([, value]) => value !== undefined) ? { extractedOutputs, classification } : undefined, false, [BookMetadata.safeParse(read("metadata")), BookSummaryOutput.safeParse(read("book-summary")), BookOutlineOutput.safeParse(read("book-outline"))].every((result) => result.success) && pages.every((page) => ImageClassificationOutput.safeParse(read("image-filtering", page.pageId)).success))
  const fixed = isFixedLayoutBook(config)
  const templateInputs = () => directoryContent(options.templatesDir ?? path.join(path.dirname(promptsDir), "templates"))
  const referenceWidth = fixed ? Math.max(0, ...pages.map((page) => {
    const positioned = read("positioned-text", page.pageId) as { pageWidth?: number } | undefined
    return positioned?.pageWidth ?? storage.getPageImages(page.pageId).find((image) => image.imageId.endsWith("_page"))?.width ?? 0
  })) : undefined
  for (const page of pages) {
    add("sectioning", page.pageId, { page, images: pageImages(page.pageId), classification: read("image-filtering", page.pageId), outline: read("book-outline"),
      sectioning: promptConfig(buildPageSectioningConfig(config)), translation: promptConfig(buildTranslationConfig(config, metadata?.language_code ?? null)) }, read("page-sectioning", page.pageId), false, PageSectioningOutput.safeParse(read("page-sectioning", page.pageId)).success, !ImageClassificationOutput.safeParse(read("image-filtering", page.pageId)).success && (!PageSectioningOutput.safeParse(read("page-sectioning", page.pageId)).success || pageErrors.some((error) => error.pageId === page.pageId && ["image-filtering", "image-meaningfulness"].includes(error.step))))
    const sections = PageSectioningOutput.safeParse(read("page-sectioning", page.pageId)).data?.sections ?? []
    const renderConfig = fixed ? [] : sections.map((section) => {
      const c = buildRenderStrategyResolver(config)(section.sectionType)
      return { ...c, prompt: c.renderType === "llm" || c.renderType === "activity" ? promptConfig(c) : undefined,
        answer: c.answerPromptName ? promptConfig({ promptName: c.answerPromptName, modelId: c.modelId }) : undefined,
        visual: c.visualRefinement ? promptConfig({ ...c.visualRefinement, modelId: config.default_model }) : undefined }
    })
    const semantic = PageSectioningOutput.safeParse(read("page-sectioning", page.pageId))
    const referenced = semantic.success ? [...collectReferencedImageIds(semantic.data.sections)].map((id) => [id, image(id)]) : []
    const sourcePages = semantic.success ? [...new Set([page.pageId, ...semantic.data.sections.flatMap((section) => section.sourcePageIds ?? [])])].map((id) => {
      try { return [id, inputSignature(storage.getPageImageBase64(id))] } catch { return [id, null] }
    }) : []
    add("storyboard", page.pageId, { referenced, sourcePages, page, mode: config.page_sectioning?.mode ?? "dynamic", sectioning: read("page-sectioning", page.pageId), images: pageImages(page.pageId),
      positioned: fixed ? read("positioned-text", page.pageId) : undefined, referenceWidth,
      config: renderConfig, styleguide: fixed ? undefined : loadStyleguideContent(config.styleguide, options.configPath, path.dirname(bookDir), path.basename(bookDir)),
      templates: renderConfig.some((entry) => entry.renderType === "template") ? templateInputs() : undefined,
      fontAssets: directoryContent(path.join(bookDir, "fonts")), fonts: read("font-registry"), assignments: read("font-assignment"), typography: read("typography"), typeScale: read("type-scale"),
    }, storyboardGenerationContent(read("web-rendering", page.pageId), read(FIXED_LAYOUT_SECTIONING_NODE, page.pageId)), false, WebRenderingOutput.safeParse(read("web-rendering", page.pageId)).success && (!isFixedLayoutBook(config) || !!read(FIXED_LAYOUT_SECTIONING_NODE, page.pageId)), (!ImageClassificationOutput.safeParse(read("image-filtering", page.pageId)).success && (!WebRenderingOutput.safeParse(read("web-rendering", page.pageId)).success || pageErrors.some((error) => error.pageId === page.pageId && ["image-filtering", "image-meaningfulness"].includes(error.step)))) || !semantic.success || [...referenced, ...sourcePages].some(([, hash]) => hash === null))
  }
  const quiz = buildQuizGenerationConfig(config, language)
  add("quizzes", "book", { pages: rendered, config: promptConfig(quiz) }, read("quiz-generation"), !quiz, QuizGenerationOutput.safeParse(read("quiz-generation")).success)
  add("glossary", "book", { pages: rendered, config: promptConfig(buildGlossaryConfig(config, language)) }, read("glossary"), false, GlossaryOutput.safeParse(read("glossary")).success)
  add("toc", "book", { headings: collectHeadingsAndToc(storage, pages), config: promptConfig(buildTocGenerationConfig(config, language)) }, read("toc-generation"), false, TocGenerationOutput.safeParse(read("toc-generation")).success)
  if (options.webAssetsDir) {
    const hash = computePackagingInputHash({ storage, bookDir, label: path.basename(bookDir), language,
      outputLanguages: [...new Set([language, ...(config.output_languages ?? []).map(normalizeLocale)])],
      title: (read("metadata") as { title?: string })?.title ?? path.basename(bookDir),
      webAssetsDir: options.webAssetsDir, config, promptsDir, promptOverridesDir: options.promptOverridesDir, configDir: options.configDir,
      applyBodyBackground: config.apply_body_background,
    })
    const assessment = read("accessibility-assessment"), files = directoryContent(path.join(bookDir, "adt"))
    add("package", "book", hash, assessment && files ? { assessment, files } : undefined)
  }
  return qualifyPageRecovery(statuses, pageErrors)
}

export function generationStage(kind: GenerationKind): StageName { return kindStage(kind) }
