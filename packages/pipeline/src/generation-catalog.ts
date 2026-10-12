import { bindOutputRevisions } from "./output-revision.js"
import { storyboardCoverage } from "./storyboard-coverage.js"
import { storyboardPackageComplete } from "./storyboard-package-coverage.js"
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
import { createPromptEngine } from "@adt/llm"
import { readExtractionManifest, type Storage } from "@adt/storage"
import { BookMetadata, BookSummaryOutput, BookOutlineOutput, WebRenderingOutput, GlossaryOutput, QuizGenerationOutput, TocGenerationOutput, PageSectioningOutput, OutputMetadata, withResolvedQuizIds, type AppConfig, type OutputStatus, type StageName } from "@adt/types"
import { deriveOutputStatus, inputSignature, outputEvidence } from "./output-freshness.js"
import { buildMetadataConfig } from "./metadata-extraction.js"
import { buildBookSummaryConfig } from "./book-summary.js"
import { buildBookOutlineConfig } from "./book-outline.js"
import { buildPageSectioningConfig } from "./page-sectioning.js"
import { buildTranslationConfig } from "./translation.js"
import { extractTextFromHtml, buildQuizGenerationConfig, batchPages } from "./quiz-generation.js"
import { buildGlossaryConfig, getGlossaryItemTextId } from "./glossary.js"
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
  kinds?: GenerationKind[]
  storage: Storage; config: AppConfig; bookDir: string; promptsDir: string; templatesDir?: string; webAssetsDir?: string; configDir?: string; configPath?: string
}

/** Shared output projection for the generation units outside the V1 text catalog.
 * Explicit relevant inputs; downstream language/voice changes cannot invalidate
 * extraction/Sectioning. No completed step is used as generation evidence.
 */
export function readGenerationCatalog(options: GenerationCatalogOptions): OutputStatus[] {
  const { storage, config, bookDir, promptsDir } = options
  const pages = activeSectioningPages(storage, config, bookDir)
  const read = (node: string, id = "book") => {
    try { return generationContent(storage.getLatestNodeData(node, id)?.data) }
    catch (error) { if (error instanceof SyntaxError) return null; throw error }
  }
  const metadata = read("metadata") as { language_code?: string } | undefined
  const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")
  const engine = createPromptEngine([path.join(bookDir, "prompts"), promptsDir], { basePromptModelId: config.base_prompt_model })
  let unavailablePrompt = false
  const promptConfig = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value
    const c = value as { promptName?: string; modelId?: string; refinementPromptName?: string }
    const fingerprint = (name?: string): string | undefined => {
      if (!name) return undefined
      try { return engine.fingerprint(name, { modelId: c.modelId }) }
      catch (error) {
        if (error instanceof Error && error.message.includes("Dynamic prompt includes")) { unavailablePrompt = true; return "unsupported-dynamic-include" }
        return "missing"
      }
    }
    // Resolve only when the consuming kind is projected. An unrelated dynamic
    // prompt must not block a current/template/fixed output's ordinary run.
    return { ...c, get prompt() { return fingerprint(c.promptName) }, get refinement() { return fingerprint(c.refinementPromptName) } }
  }
  const wants = (kind: GenerationKind) => !options.kinds || options.kinds.includes(kind)

  const image = (id: string) => { try { return inputSignature(storage.getImageBase64(id)) } catch { return null } }
  const pageImages = (id: string) => {
    const filtered = read("image-filtering", id) as { images?: Array<{ imageId: string }> } | undefined
    return (Array.isArray(filtered?.images) ? filtered.images.filter((entry) => typeof entry?.imageId === "string").map((entry) => entry.imageId) : storage.getPageImages(id).map((entry) => entry.imageId)).map((imageId) => [imageId, image(imageId)])
  }
  const rendered = pages.map((page) => [page.pageId,
    (WebRenderingOutput.safeParse(read("web-rendering", page.pageId)).data?.sections ?? []).map((section) => extractTextFromHtml(section.html)),
    read("page-sectioning", page.pageId)])
  const statuses: OutputStatus[] = []
  const add = (kind: GenerationKind, id: string, inputs: unknown, content: unknown, excluded = false, usable = content != null, blocked = false) => {
    if (!wants(kind)) return
    let raw: { generationEvidence?: unknown } | undefined
    try { raw = storage.getLatestNodeData(GENERATION_NODES[kind], id)?.data as typeof raw }
    catch (error) { if (!(error instanceof SyntaxError)) throw error }
    const parsed = OutputMetadata.safeParse(raw?.generationEvidence)
    const data = raw as { source?: string; items?: Array<{ source?: string }>; quizzes?: Array<{ source?: string }> } | undefined
    const collection = (kind === "quizzes" || kind === "glossary") && id === "book"
    const manual = !collection && (data?.source === "manual" || [...(Array.isArray(data?.items) ? data.items : []), ...(Array.isArray(data?.quizzes) ? data.quizzes : [])].some((entry) => entry.source === "manual"))
    const evidence = parsed.success ? { ...parsed.data, ...(manual ? { source: "manual" as const } : {}) } : manual ? { source: "manual" as const } : undefined
    const savedSectioning = kind === "sectioning" && storage.getSelectedNodeVersion("page-sectioning", id) !== null
    unavailablePrompt = false
    const signature = inputSignature({ contract: 1, kind, inputs: savedSectioning ? "saved-tree" : inputs })
    const capabilityUnavailable = unavailablePrompt
    blocked ||= capabilityUnavailable
    const status = deriveOutputStatus({ identity: { kind, id }, signature, content,
      metadata: evidence, usable, excluded })
    if (collection || kind === "package") {
      // The book facet represents generated eligible content only. Authored
      // units are projected separately below, never implicitly accepted here.
      status.protected = false
      status.manual = false
      status.updateNeeded = !status.current && usable
      status.warnings = []
    }
    if (savedSectioning) {
      statuses.push({ ...status, current: usable, protected: true, updateNeeded: false,
        warnings: usable ? [] : [{ reason: "upstream" }], blocked: !usable, pageIds: [id] })
      return
    }
    statuses.push({ ...status, ...(capabilityUnavailable ? { capabilityUnavailable: true } : {}), current: status.current && !blocked, ...(blocked ? { blocked: true, warnings: [...status.warnings, { reason: "upstream" as const }] } : {}), pageIds: id === "book" ? pages.map((page) => page.pageId) : [id] })
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

  }, !onlyExtractionMetadata && extractedOutputs.some(([, value]) => value !== undefined) ? { extractedOutputs, classification } : undefined, false, [BookMetadata.safeParse(read("metadata")), BookSummaryOutput.safeParse(read("book-summary")), BookOutlineOutput.safeParse(read("book-outline"))].every((result) => result.success) && pages.every((page) => !!read("image-filtering", page.pageId)))
  const fixed = isFixedLayoutBook(config)
  const templateInputs = () => directoryContent(options.templatesDir ?? path.join(path.dirname(promptsDir), "templates"))
  const referenceWidth = fixed ? Math.max(0, ...pages.map((page) => {
    const positioned = read("positioned-text", page.pageId) as { pageWidth?: number } | undefined
    return positioned?.pageWidth ?? storage.getPageImages(page.pageId).find((image) => image.imageId.endsWith("_page"))?.width ?? 0
  })) : undefined
  for (const page of pages) {
    add("sectioning", page.pageId, { page, images: pageImages(page.pageId), classification: read("image-filtering", page.pageId), outline: read("book-outline"),
      sectioning: promptConfig(buildPageSectioningConfig(config)), translation: promptConfig(buildTranslationConfig(config, metadata?.language_code ?? null)) }, read("page-sectioning", page.pageId), false, PageSectioningOutput.safeParse(read("page-sectioning", page.pageId)).success)
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
    add("storyboard", page.pageId, { referenced, sourcePages, page, layout: fixed ? "fixed" : "reflowable", sectioning: read("page-sectioning", page.pageId), images: pageImages(page.pageId),
      positioned: fixed ? read("positioned-text", page.pageId) : undefined, referenceWidth,
      config: renderConfig, styleguide: fixed ? undefined : loadStyleguideContent(config.styleguide, options.configPath, path.dirname(bookDir), path.basename(bookDir)),
      templates: renderConfig.some((entry) => entry.renderType === "template") ? templateInputs() : undefined,
      fontAssets: directoryContent(path.join(bookDir, "fonts")), fonts: read("font-registry"), assignments: read("font-assignment"), typography: read("typography"), typeScale: read("type-scale"),
    }, read("web-rendering", page.pageId) ? { html: read("web-rendering", page.pageId), positioned: read(FIXED_LAYOUT_SECTIONING_NODE, page.pageId) } : undefined, false, storyboardCoverage(storage, [page.pageId]).complete && WebRenderingOutput.safeParse(read("web-rendering", page.pageId)).success && (!isFixedLayoutBook(config) || !!read(FIXED_LAYOUT_SECTIONING_NODE, page.pageId)), !semantic.success || [...referenced, ...sourcePages].some(([, hash]) => hash === null))
  }
  const quiz = buildQuizGenerationConfig(config, language)
  const quizOutput = QuizGenerationOutput.safeParse(read("quiz-generation"))
  let quizItems = quizOutput.success ? quizOutput.data.quizzes : []
  let quizIdentityValid = true
  try { if (quizOutput.success) quizItems = withResolvedQuizIds(quizOutput.data).quizzes } catch { quizIdentityValid = false }
  const quizPages = pages.flatMap((page) => {
    const rendering = WebRenderingOutput.safeParse(read("web-rendering", page.pageId))
    const sectioning = PageSectioningOutput.safeParse(read("page-sectioning", page.pageId))
    return rendering.success && sectioning.success ? [{ pageId: page.pageId, rendering: rendering.data, sectioning: sectioning.data }] : []
  })
  const eligibleQuizPages = new Set(quiz ? batchPages(quizPages, quiz.pagesPerQuiz, quiz.quizSectionTypes,
    quizItems.filter((item) => item.source !== "ai").map((item) => item.pageIds)).flatMap((group) => group.map((page) => page.pageId)) : [])
  const quizInputs = { pages: rendered.filter(([id]) => eligibleQuizPages.has(id as string)), config: promptConfig(quiz) }
  const quizContent = quizOutput.success ? { ...quizOutput.data, quizzes: quizItems.filter((item) => item.source === "ai").map(generationContent) } : undefined
  add("quizzes", "book", quizInputs, quizContent, !quiz || !eligibleQuizPages.size && !!quizItems.length && quizItems.every((item) => item.source !== "ai"), quizOutput.success && quizIdentityValid, !quizIdentityValid && quizItems.some((item) => item.source !== "ai") || storage.getSelectedNodeVersion("quiz-generation", "book") !== null && !quizOutput.success)
  const glossaryOutput = GlossaryOutput.safeParse(read("glossary"))
  const glossaryItems = glossaryOutput.success ? glossaryOutput.data.items.map((item, index) => ({ ...item, id: getGlossaryItemTextId(item, index) })) : []
  const glossaryIdentityValid = new Set(glossaryItems.map((item) => item.id)).size === glossaryItems.length
  const glossaryInputs = { pages: rendered, config: promptConfig(buildGlossaryConfig(config, language)) }
  const glossaryContent = glossaryOutput.success ? { ...glossaryOutput.data, items: glossaryItems.filter((item) => item.source === "ai").map(generationContent) } : undefined
  add("glossary", "book", glossaryInputs, glossaryContent, false, glossaryOutput.success, !glossaryIdentityValid || storage.getSelectedNodeVersion("glossary", "book") !== null && !glossaryOutput.success)
  for (const [kind, items, inputs] of [["quizzes", quizItems, { pages: rendered, config: promptConfig(quiz) }], ["glossary", glossaryItems, glossaryInputs]] as const) {
    if (!wants(kind)) continue
    for (const item of items.filter((item) => item.source !== "ai")) {
      const id = "quizId" in item ? item.quizId : "id" in item ? item.id : undefined
      if (!id) continue // Invalid identities block the collection above.
      const status = deriveOutputStatus({ identity: { kind, id }, signature: inputSignature({ contract: 1, kind, inputs }),
        content: generationContent(item), metadata: { ...item.generationEvidence, source: item.source }, usable: true, excluded: kind === "quizzes" ? !quiz : "pruned" in item && item.pruned === true })
      statuses.push({ ...status, pageIds: "pageIds" in item ? item.pageIds : pages.map((page) => page.pageId), group: kind })
    }
  }
  if (wants("toc")) add("toc", "book", { headings: collectHeadingsAndToc(storage, pages), config: promptConfig(buildTocGenerationConfig(config, language)) }, read("toc-generation"), false, TocGenerationOutput.safeParse(read("toc-generation")).success)
  if (options.webAssetsDir && wants("package")) {
    const hash = computePackagingInputHash({ storage, bookDir, label: path.basename(bookDir), language,
      outputLanguages: [...new Set([language, ...(config.output_languages ?? []).map(normalizeLocale)])],
      title: (read("metadata") as { title?: string })?.title ?? path.basename(bookDir),
      webAssetsDir: options.webAssetsDir, config, promptsDir, configDir: options.configDir,
      applyBodyBackground: config.apply_body_background,
    })
    const assessment = read("accessibility-assessment"), files = directoryContent(path.join(bookDir, "adt"))
    add("package", "book", hash, assessment && files ? { assessment, files } : undefined, false, !!assessment && !!files && storyboardPackageComplete(storage, bookDir, pages.map((page) => page.pageId)))
  }
  return bindOutputRevisions(storage, statuses)
}

export function generationStage(kind: GenerationKind): StageName { return kindStage(kind) }

/** Stamp trusted generation in the same content version, including targeted
 * whole-page rendering. Custom instructions/partial authored merges cannot
 * claim the ordinary generation fingerprint. */
export function annotateGeneration(options: GenerationCatalogOptions, kind: GenerationKind, id: string, data: object): object {
  const node = GENERATION_NODES[kind]
  const storage = { ...options.storage, getLatestNodeData: (n: string, item: string) => n === node && item === id ? { version: 0, data } : options.storage.getLatestNodeData(n, item) }
  const output = readGenerationCatalog({ ...options, kinds: [kind], storage }).find((status) => status.identity.kind === kind && status.identity.id === id)
  if (!output) throw new Error("Generated output is outside the active scope")
  return { ...data, generationEvidence: { source: "ai", input: { ...outputEvidence(output.signature, null), contentHash: output.contentHash } } }
}
