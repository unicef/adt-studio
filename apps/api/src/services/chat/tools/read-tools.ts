import { z } from "zod"
import { defineChatTool, type ChatTool } from "@adt/chat"
import { ALL_STEP_NAMES, getTextCatalogCategory } from "@adt/types"
import { getBookConfig } from "../../book-service.js"
import type { ChatToolContext } from "../context.js"
import {
  bookLanguages,
  readNode,
  sectionText,
  sectioningText,
  stageStatuses,
  withStorage,
  type SectioningNodeData,
} from "./book-access.js"
import {
  budgetedPage,
  clampText,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TEXT_FIELD_CHAR_BUDGET,
  TOOL_RESULT_CHAR_BUDGET,
} from "./budget.js"

const Pagination = {
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
}

/** Nodes a chat user can reasonably ask about, keyed by the id they'd use. */
const BOOK_LEVEL_NODES = [
  "book-summary",
  "book-outline",
  "metadata",
  "glossary",
  "quiz-generation",
  "toc-generation",
  "easy-read",
  "accessibility-assessment",
  "font-profile",
  "text-catalog",
] as const

const PAGE_LEVEL_NODES = [
  "page-sectioning",
  "web-rendering",
  "image-captioning",
  "image-filtering",
  "editable-activity",
] as const

export const getBookOverview = defineChatTool<ChatToolContext, Record<string, never>>({
  name: "get_book_overview",
  description:
    "Overview of the current book: title, authors, language, page count, summary, and the status of every pipeline stage. Start here when the user asks what the book is or what still needs to run.",
  inputSchema: z.object({}),
  mutating: false,
  execute: (ctx) =>
    withStorage(ctx, (storage) => {
      const metadata = readNode<{
        title?: string | null
        authors?: string[]
        publisher?: string | null
        language_code?: string | null
      }>(storage, "metadata", "book")
      const summary = readNode<{ summary?: string }>(storage, "book-summary", "book")
      const config = getBookConfig(ctx.safeLabel, ctx.paths.booksDir)
      const languages = bookLanguages(storage, config)
      const pages = storage.getPages()

      return {
        label: ctx.safeLabel,
        title: metadata?.title ?? null,
        authors: metadata?.authors ?? [],
        publisher: metadata?.publisher ?? null,
        sourceLanguage: metadata?.language_code ?? null,
        editingLanguage: languages.editingLanguage,
        outputLanguages: languages.outputLanguages,
        pageCount: pages.length,
        summary: summary?.summary ? clampText(summary.summary).text : null,
        stages: stageStatuses(storage),
      }
    }),
})

export const listPages = defineChatTool<
  ChatToolContext,
  { offset: number; limit: number }
>({
  name: "list_pages",
  description:
    "List the book's pages with their section counts and a short text preview. Paginated: pass the returned nextOffset to continue.",
  inputSchema: z.object(Pagination),
  mutating: false,
  execute: (ctx, input) =>
    withStorage(ctx, (storage) => {
      const pages = storage.getPages()
      return budgetedPage(
        pages,
        (page) => {
          const sectioning = readNode<SectioningNodeData>(
            storage,
            "page-sectioning",
            page.pageId,
          )
          const sections = sectioning?.sections ?? []
          return {
            pageId: page.pageId,
            pageNumber: page.pageNumber,
            sectionCount: sections.filter((section) => !section.isPruned).length,
            hasRendering: readNode(storage, "web-rendering", page.pageId) !== null,
            preview: clampText(sectioningText(sectioning) || page.text, 220).text,
          }
        },
        { offset: input.offset, limit: input.limit },
      )
    }),
})

export const getPage = defineChatTool<
  ChatToolContext,
  { pageId: string; includeHtml: boolean }
>({
  name: "get_page",
  description:
    "Read one page's current sections: id, type and visible text per section. Rendered HTML is excluded unless includeHtml is true, because it is large and rarely needed to answer a question about content.",
  inputSchema: z.object({
    pageId: z.string().min(1).max(128),
    includeHtml: z
      .boolean()
      .default(false)
      .describe("Include the storyboard's rendered HTML for each section."),
  }),
  mutating: false,
  execute: (ctx, input) =>
    withStorage(ctx, (storage) => {
      const row = storage.getLatestNodeData("page-sectioning", input.pageId)
      if (!row) {
        return {
          status: "not-found" as const,
          message: `No sectioning for page ${input.pageId}. Run the Sectioning stage first, or call list_pages to see the available page ids.`,
        }
      }

      const sectioning = row.data as SectioningNodeData
      const rendering = input.includeHtml
        ? readNode<{ sections?: Array<{ sectionIndex?: number; html?: string }> }>(
            storage,
            "web-rendering",
            input.pageId,
          )
        : null
      const htmlByIndex = new Map(
        (rendering?.sections ?? []).map((section) => [section.sectionIndex, section.html ?? ""]),
      )

      const page = budgetedPage(
        sectioning.sections ?? [],
        (section, index) => {
          const text = clampText(sectionText(section), TEXT_FIELD_CHAR_BUDGET)
          const html = input.includeHtml
            ? clampText(htmlByIndex.get(index) ?? "", TEXT_FIELD_CHAR_BUDGET)
            : undefined
          return {
            sectionIndex: index,
            sectionId: section.sectionId ?? null,
            sectionType: section.sectionType ?? null,
            isPruned: section.isPruned ?? false,
            text: text.text,
            textTruncated: text.truncated,
            ...(html ? { html: html.text, htmlTruncated: html.truncated } : {}),
          }
        },
        { offset: 0, limit: MAX_PAGE_SIZE, charBudget: TOOL_RESULT_CHAR_BUDGET },
      )

      return {
        status: "ok" as const,
        pageId: input.pageId,
        version: row.version,
        sections: page.items,
        sectionCount: page.total,
        truncated: page.truncated,
        nextOffset: page.nextOffset,
      }
    }),
})

export const getStageOutput = defineChatTool<
  ChatToolContext,
  { node: string; itemId?: string }
>({
  name: "get_stage_output",
  description: `Read the current stored output of one pipeline node. Book-level nodes (itemId defaults to "book"): ${BOOK_LEVEL_NODES.join(", ")}. Page-level nodes (pass the page id as itemId): ${PAGE_LEVEL_NODES.join(", ")}.`,
  inputSchema: z.object({
    node: z.string().min(1).max(64),
    itemId: z.string().min(1).max(128).optional(),
  }),
  mutating: false,
  execute: (ctx, input) =>
    withStorage(ctx, (storage) => {
      const known = new Set<string>([...BOOK_LEVEL_NODES, ...PAGE_LEVEL_NODES])
      if (!known.has(input.node)) {
        return {
          status: "unknown-node" as const,
          message: `Unknown node: ${input.node}`,
          available: [...known],
        }
      }

      const itemId =
        input.itemId ??
        ((BOOK_LEVEL_NODES as readonly string[]).includes(input.node) ? "book" : "")
      if (!itemId) {
        return {
          status: "missing-item-id" as const,
          message: `${input.node} is page-scoped — pass the page id as itemId.`,
        }
      }

      const row = storage.getLatestNodeData(input.node, itemId)
      if (!row) {
        return {
          status: "not-found" as const,
          message: `No ${input.node} output for ${itemId}. The stage producing it has not run, or has been cleared.`,
        }
      }

      const serialized = JSON.stringify(row.data)
      if (serialized.length <= TOOL_RESULT_CHAR_BUDGET) {
        return { status: "ok" as const, node: input.node, itemId, version: row.version, data: row.data }
      }

      return {
        status: "ok" as const,
        node: input.node,
        itemId,
        version: row.version,
        truncated: true,
        message: `Output is ${serialized.length} characters, over the ${TOOL_RESULT_CHAR_BUDGET} budget. Only a prefix is shown — use a narrower tool (get_page, get_translations) for the detail you need.`,
        dataPreview: serialized.slice(0, TOOL_RESULT_CHAR_BUDGET),
      }
    }),
})

export const getTranslations = defineChatTool<
  ChatToolContext,
  { language?: string; category?: string; offset: number; limit: number }
>({
  name: "get_translations",
  description:
    "Read the source text catalog and, when a language is given, its translations side by side. Paginated and category-filterable, because a whole book's catalog will not fit in one answer.",
  inputSchema: z.object({
    language: z
      .string()
      .min(2)
      .max(32)
      .optional()
      .describe("Output language code. Omit to read only the source catalog."),
    category: z
      .enum(["text", "captions", "answers", "glossary", "easy-read"])
      .optional(),
    ...Pagination,
  }),
  mutating: false,
  execute: (ctx, input) =>
    withStorage(ctx, (storage) => {
      const catalog = readNode<{ entries?: Array<{ id: string; text: string }> }>(
        storage,
        "text-catalog",
        "book",
      )
      if (!catalog?.entries?.length) {
        return {
          status: "not-found" as const,
          message:
            "No text catalog yet. It is built by the Easy Read stage — run it (or the Translate stage) first.",
        }
      }

      const translations = input.language
        ? readNode<{ entries?: Array<{ id: string; text: string }> }>(
            storage,
            "text-catalog-translation",
            input.language,
          )
        : null
      if (input.language && !translations) {
        return {
          status: "not-translated" as const,
          message: `No translation stored for ${input.language}. Run the Translate stage for that language.`,
        }
      }

      const translated = new Map(
        (translations?.entries ?? []).map((entry) => [entry.id, entry.text]),
      )
      const entries = input.category
        ? catalog.entries.filter((entry) => getTextCatalogCategory(entry.id) === input.category)
        : catalog.entries

      const page = budgetedPage(
        entries,
        (entry) => ({
          id: entry.id,
          category: getTextCatalogCategory(entry.id),
          source: clampText(entry.text, 600).text,
          ...(input.language
            ? { translation: clampText(translated.get(entry.id) ?? "", 600).text }
            : {}),
        }),
        { offset: input.offset, limit: input.limit },
      )

      return {
        status: "ok" as const,
        language: input.language ?? null,
        category: input.category ?? null,
        ...page,
      }
    }),
})

export const getStageConfig = defineChatTool<ChatToolContext, { stage?: string }>({
  name: "get_stage_config",
  description:
    "Read this book's config overrides — the settings the pipeline runs with. Pass a stage or step name to narrow the result to keys mentioning it.",
  inputSchema: z.object({
    stage: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("Stage or step name, e.g. \"storyboard\" or \"glossary\"."),
  }),
  mutating: false,
  execute: (ctx, input) => {
    const config = getBookConfig(ctx.safeLabel, ctx.paths.booksDir) ?? {}
    if (!input.stage) {
      return { status: "ok" as const, scope: "book" as const, config }
    }

    const needle = input.stage.toLowerCase().replace(/-/g, "_")
    const filtered = Object.fromEntries(
      Object.entries(config).filter(([key]) => key.toLowerCase().includes(needle)),
    )
    return {
      status: "ok" as const,
      scope: input.stage,
      config: filtered,
      isKnownStep: (ALL_STEP_NAMES as ReadonlySet<string>).has(input.stage),
      message:
        Object.keys(filtered).length === 0
          ? `No book-level override mentions "${input.stage}"; the global defaults apply.`
          : undefined,
    }
  },
})

export const READ_TOOLS: ChatTool<ChatToolContext, never>[] = [
  getBookOverview,
  listPages,
  getPage,
  getStageOutput,
  getTranslations,
  getStageConfig,
]
