import {
  BookSummaryOutput,
  type AppConfig,
  type StepWarning,
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_LLM_MODEL_ID,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import { buildLanguageContext, normalizeLocale } from "./language-context.js"
import { shortErrorText } from "./image-pass-failures.js"

export interface BookSummaryConfig {
  promptName: string
  modelId: string
  maxRetries: number
  outputLanguage: string
}

export interface BookSummaryPageInput {
  pageNumber: number
  text: string
}

/** A full-page render sent in place of missing page text. */
export interface BookSummaryRenderInput {
  pageNumber: number
  imageBase64: string
}

export interface BookSummaryInput {
  pages: BookSummaryPageInput[]
  renders?: BookSummaryRenderInput[]
}

/** The extracted page as stored: id, number and text layer. */
export interface BookSummarySourcePage {
  pageId: string
  pageNumber: number
  text: string
}

export interface BookSummarySelectionOptions {
  /** Longest page text sent, in characters; longer pages are cut. */
  maxPageChars?: number
  /** Budget for all page text together; above it, pages are sampled evenly. */
  maxTotalChars?: number
  /** Below this share of pages with text, page renders are sent as well. */
  minTextPageRatio?: number
  /** How many page renders at most. */
  maxRenderPages?: number
}

export interface BookSummarySelection {
  pages: BookSummaryPageInput[]
  /** Page ids whose render should accompany the text, in page order. */
  renderPageIds: string[]
  /** Pages whose text layer holds anything beyond whitespace. */
  textPages: number
  totalPages: number
  /** True when some pages with text were left out to fit the budget. */
  sampled: boolean
}

export const BOOK_SUMMARY_MAX_PAGE_CHARS = 2_000
export const BOOK_SUMMARY_MAX_TOTAL_CHARS = 60_000
export const BOOK_SUMMARY_MIN_TEXT_PAGE_RATIO = 0.2
export const BOOK_SUMMARY_MAX_RENDER_PAGES = 8
const TRUNCATION_MARK = " […]"

/** `count` indices spread evenly over `0..total-1`, first and last included. */
export function evenlySpacedIndices(total: number, count: number): number[] {
  if (total <= 0 || count <= 0) return []
  if (count >= total) return Array.from({ length: total }, (_, index) => index)
  if (count === 1) return [0]
  // The spacing is at least 1, so the rounded indices are already distinct and ascending.
  return Array.from({ length: count }, (_, step) => Math.round((step * (total - 1)) / (count - 1)))
}

/**
 * The page text cut to `maxChars`, with its length in code points (not UTF-16
 * units, so the budget does not double on emoji or astral CJK text). The cut
 * mark counts towards the length.
 */
function truncatePageText(text: string, maxChars: number): { text: string; length: number } {
  const trimmed = text.trim()
  const chars = Array.from(trimmed)
  if (chars.length <= maxChars) return { text: trimmed, length: chars.length }
  const head = chars.slice(0, maxChars)
  // Cut at the last whitespace of the head, unless that loses over half of it.
  let lastBreak = -1
  for (let index = head.length - 1; index > maxChars / 2; index--) {
    if (/\s/.test(head[index])) {
      lastBreak = index
      break
    }
  }
  const cut = Array.from((lastBreak > 0 ? head.slice(0, lastBreak) : head).join("").trimEnd())
  return { text: `${cut.join("")}${TRUNCATION_MARK}`, length: cut.length + Array.from(TRUNCATION_MARK).length }
}

/**
 * The most pages whose even sample across the book fits the character
 * budget, or none when not even one page does. Whether a sample fits is not
 * monotonic in its size (each size picks different pages), so every size is
 * tried from the largest down. Deterministic: plain arithmetic on known sizes.
 */
function evenSampleWithinBudget(sizes: number[], maxTotalChars: number): number[] {
  for (let keep = sizes.length; keep > 0; keep--) {
    const picked = evenlySpacedIndices(sizes.length, keep)
    if (picked.reduce((sum, index) => sum + sizes[index], 0) <= maxTotalChars) return picked
  }
  return []
}

/**
 * Decide what the summary prompt receives. Pages without a text layer are
 * dropped, each remaining page is cut to `maxPageChars`, and when the whole
 * still exceeds `maxTotalChars` the largest even sample of pages across the
 * book that fits is kept, so the input is bounded for any page count and a
 * book of short pages is not sampled harder than a book of long ones. When
 * fewer than `minTextPageRatio` of the pages carry text (scanned or
 * image-only books), up to `maxRenderPages` renders spread over the pages
 * without text are requested so the model still sees what the book is.
 * Deterministic: the same pages give the same selection, so reruns hit the
 * LLM cache.
 */
export function selectBookSummaryInput(
  pages: BookSummarySourcePage[],
  options: BookSummarySelectionOptions = {},
): BookSummarySelection {
  const maxPageChars = options.maxPageChars ?? BOOK_SUMMARY_MAX_PAGE_CHARS
  const maxTotalChars = options.maxTotalChars ?? BOOK_SUMMARY_MAX_TOTAL_CHARS
  const minTextPageRatio = options.minTextPageRatio ?? BOOK_SUMMARY_MIN_TEXT_PAGE_RATIO
  const maxRenderPages = options.maxRenderPages ?? BOOK_SUMMARY_MAX_RENDER_PAGES

  // A cut page, mark included, never exceeds the whole budget, so one page always fits.
  const pageChars = Math.max(1, Math.min(maxPageChars, maxTotalChars - Array.from(TRUNCATION_MARK).length))
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber)
  const withText = ordered
    .filter((page) => page.text.trim().length > 0)
    .map((page) => ({ pageNumber: page.pageNumber, ...truncatePageText(page.text, pageChars) }))

  const selected = evenSampleWithinBudget(withText.map((page) => page.length), maxTotalChars)
    .map((index) => ({ pageNumber: withText[index].pageNumber, text: withText[index].text }))
  const sampled = selected.length < withText.length

  const textPages = withText.length
  const totalPages = ordered.length
  const needsRenders = totalPages > 0 && textPages / totalPages < minTextPageRatio
  // The renders stand in for the pages the text cannot show, so they are drawn
  // from the pages without a text layer (needing renders implies there are some).
  const blankPages = needsRenders ? ordered.filter((page) => page.text.trim().length === 0) : []
  const renderPageIds = evenlySpacedIndices(blankPages.length, maxRenderPages).map((index) => blankPages[index].pageId)

  return { pages: selected, renderPageIds, textPages, totalPages, sampled }
}

/** One line for the run log: what the summary was built from. */
export function describeBookSummarySelection(selection: BookSummarySelection): string {
  const text = `${selection.pages.length} of ${selection.textPages} text page(s), ${selection.totalPages} page(s) in the book`
  const renders = selection.renderPageIds.length ? `, ${selection.renderPageIds.length} page render(s)` : ""
  const sampled = selection.sampled ? ", sampled to fit the input budget" : ""
  return `${text}${renders}${sampled}`
}

/**
 * Build the prompt input, loading only the renders the selection asks for.
 * The loader is the storage accessor; it is not called for other pages.
 */
export function buildBookSummaryInput(
  selection: BookSummarySelection,
  pages: BookSummarySourcePage[],
  loadRender: (pageId: string) => string,
): BookSummaryInput {
  const numberById = new Map(pages.map((page) => [page.pageId, page.pageNumber]))
  const renders = selection.renderPageIds.map((pageId) => {
    const pageNumber = numberById.get(pageId)
    if (pageNumber === undefined) throw new Error(`Book summary selection names an unknown page: ${pageId}`)
    return { pageNumber, imageBase64: loadRender(pageId) }
  })
  return { pages: selection.pages, renders }
}

/**
 * The step warning for a failed summary call (SPEC-0021, §Step warnings). The
 * summary only seeds later prompts (captions, fonts, packaging), each of which
 * already copes without one, so a failed call must not fail the Extract stage:
 * the step completes with this warning and later steps run without a summary.
 */
export function bookSummaryWarning(err: unknown): StepWarning {
  return { kind: "summary-missing", error: shortErrorText(err) }
}

/**
 * Generate the summary as an optional step, the same way in both runners.
 * The prompt is rendered first, outside the catch: a broken prompt template
 * is a book problem the step must fail on, not a model failure. A failed
 * model call yields the `summary-missing` warning instead of a summary.
 * `isCancellation` says which errors are a cancelled run and must propagate;
 * the CLI has no cancellation, so it passes none.
 */
export async function summarizeBookOptionally(
  input: BookSummaryInput,
  config: BookSummaryConfig,
  llmModel: LLMModel,
  isCancellation: (err: unknown) => boolean = () => false,
): Promise<{ summary: BookSummaryOutput } | { warning: StepWarning }> {
  await llmModel.renderPrompt(config.promptName, bookSummaryContext(input, config))
  try {
    return { summary: await generateBookSummary(input, config, llmModel) }
  } catch (err) {
    if (isCancellation(err)) throw err
    return { warning: bookSummaryWarning(err) }
  }
}

function bookSummaryContext(input: BookSummaryInput, config: BookSummaryConfig): Record<string, unknown> {
  const outputLanguage = buildLanguageContext(config.outputLanguage)
  return {
    pages: input.pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
    })),
    page_renders: (input.renders ?? []).map((render) => ({
      pageNumber: render.pageNumber,
      imageBase64: render.imageBase64,
    })),
    output_language_code: outputLanguage.language_code,
    output_language: outputLanguage.language,
  }
}

/**
 * Generate a brief narrative summary of a book from its page text and, for
 * books without a usable text layer, a few page renders.
 * Pure async function — no side effects.
 */
export async function generateBookSummary(
  input: BookSummaryInput,
  config: BookSummaryConfig,
  llmModel: LLMModel
): Promise<BookSummaryOutput> {
  const renders = input.renders ?? []
  if (input.pages.length === 0 && renders.length === 0) {
    throw new Error("No page text or page renders provided for book summary")
  }

  const result = await llmModel.generateObject<BookSummaryOutput>({
    schema: BookSummaryOutput,
    prompt: config.promptName,
    context: bookSummaryContext(input, config),
    maxRetries: config.maxRetries,
    maxTokens: 1024,
    log: {
      taskType: "book-summary",
      promptName: config.promptName,
    },
  })

  return result.object
}

/**
 * Build BookSummaryConfig from AppConfig.
 *
 * `language` is the resolved book/editing language (from the metadata step).
 * When omitted, falls back to the editing-language override or English so the
 * summary is still produced for callers that don't resolve metadata.
 */
export function buildBookSummaryConfig(
  appConfig: AppConfig,
  language?: string,
): BookSummaryConfig {
  return {
    promptName: appConfig.book_summary?.prompt ?? "book_summary",
    modelId: appConfig.book_summary?.model ?? appConfig.default_model ?? DEFAULT_LLM_MODEL_ID,
    maxRetries:
      appConfig.book_summary?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    outputLanguage: normalizeLocale(language ?? appConfig.editing_language ?? "en"),
  }
}
