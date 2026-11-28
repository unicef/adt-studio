import {
  BookMetadata,
  BookSummaryOutput,
  type AppConfig,
  type BookOutlineEntry,
  type BookOutlineOutput,
  type ContentNodeData,
  type PageSectioningOutput,
  type PageSectioningSection,
} from "@adt/types"
import type { Storage } from "@adt/storage"
import { readBookOutline } from "./book-outline.js"

export const DEFAULT_NEIGHBOR_PAGES = 1
export const DEFAULT_NEIGHBOR_CHARS = 600
export const SIBLING_PREVIEW_CHARS = 160

export interface RenderContextOptions {
  summary: boolean
  outlinePosition: boolean
  neighborPages: number
  neighborChars: number
}

export interface BookContextHeading {
  level: number
  kind: string
  title: string
}

export interface BookContextSectionDigest {
  sectionIndex: number
  sectionType: string
  text: string
}

export interface BookContextNeighborPage {
  relation: "previous" | "next"
  pageNumber: number
  sections: BookContextSectionDigest[]
}

export interface RenderBookContext {
  pageNumber: number
  book: {
    title: string | null
    authors: string[]
    languageCode: string | null
    summary: string | null
  } | null
  position: BookContextHeading[]
  pageHeadings: BookContextHeading[]
  pageSections: BookContextSectionDigest[]
  neighborPages: BookContextNeighborPage[]
}

export interface RenderBookContextSources {
  pageId: string
  pages: Array<{ pageId: string; pageNumber: number }>
  metadata: BookMetadata | null
  summary: string | null
  outline: BookOutlineOutput | null
  sectioningFor: (pageId: string) => PageSectioningOutput | null
}

export type RenderBookContextScope = "render" | "review"

export interface BookContextPromptValue {
  page_number: number
  book: {
    title: string | null
    authors: string[]
    language_code: string | null
    summary: string | null
  } | null
  position: BookContextHeading[]
  page_headings: BookContextHeading[]
  section_number: number | null
  page_sections: Array<{
    number: number
    section_type: string
    text: string
    is_current: boolean
  }>
  neighbor_pages: Array<{
    relation: string
    page_number: number
    sections: Array<{ section_type: string; text: string }>
  }>
}

export function resolveRenderContextOptions(config: AppConfig): RenderContextOptions | null {
  const settings = config.render_context
  if (!settings?.enabled) return null
  return {
    summary: settings.summary ?? true,
    outlinePosition: settings.outline_position ?? true,
    neighborPages: settings.neighbor_pages ?? DEFAULT_NEIGHBOR_PAGES,
    neighborChars: settings.neighbor_chars ?? DEFAULT_NEIGHBOR_CHARS,
  }
}

export function truncateText(text: string, maxChars: number): string {
  if (maxChars <= 0) return ""
  if (text.length <= maxChars) return text
  if (maxChars === 1) return "…"
  return `${text.slice(0, maxChars - 1).trimEnd()}…`
}

export function sectionPlainText(section: PageSectioningSection): string {
  const parts: string[] = []
  const walk = (node: ContentNodeData): void => {
    if (node.isPruned) return
    if (node.role && node.role !== "image" && node.text) parts.push(node.text)
    for (const child of node.children ?? []) walk(child)
  }
  for (const node of section.nodes) walk(node)
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

function toHeading(entry: BookOutlineEntry): BookContextHeading {
  return { level: entry.level, kind: entry.kind, title: entry.title }
}

export function outlinePositionForPage(
  outline: BookOutlineOutput | null,
  pageNumber: number,
): BookContextHeading[] {
  if (!outline) return []
  let current: BookOutlineEntry | undefined
  for (const entry of outline.entries) {
    if (entry.pageNumber >= pageNumber) continue
    if (!current || entry.pageNumber >= current.pageNumber) current = entry
  }
  if (!current) return []
  const byId = new Map(outline.entries.map((entry) => [entry.outlineId, entry]))
  const chain: BookOutlineEntry[] = []
  const seen = new Set<string>()
  let cursor: BookOutlineEntry | undefined = current
  while (cursor && !seen.has(cursor.outlineId)) {
    seen.add(cursor.outlineId)
    chain.push(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return chain.reverse().map(toHeading)
}

export function outlineHeadingsOnPage(
  outline: BookOutlineOutput | null,
  pageId: string,
): BookContextHeading[] {
  if (!outline) return []
  return outline.entries.filter((entry) => entry.pageId === pageId).map(toHeading)
}

export function digestSections(
  sectioning: PageSectioningOutput | null,
  maxCharsPerSection: number,
): BookContextSectionDigest[] {
  if (!sectioning) return []
  const digests: BookContextSectionDigest[] = []
  sectioning.sections.forEach((section, sectionIndex) => {
    if (section.isPruned) return
    digests.push({
      sectionIndex,
      sectionType: section.sectionType,
      text: truncateText(sectionPlainText(section), maxCharsPerSection),
    })
  })
  return digests
}

export function digestSectionsWithinBudget(
  sectioning: PageSectioningOutput | null,
  budgetChars: number,
): BookContextSectionDigest[] {
  let remaining = budgetChars
  const digests: BookContextSectionDigest[] = []
  for (const digest of digestSections(sectioning, Number.MAX_SAFE_INTEGER)) {
    if (remaining <= 0) break
    const text = truncateText(digest.text, remaining)
    remaining -= Math.max(text.length, 1)
    digests.push({ ...digest, text })
  }
  return digests
}

function neighborPagesFor(
  sources: RenderBookContextSources,
  pageIndex: number,
  options: RenderContextOptions,
): BookContextNeighborPage[] {
  if (options.neighborPages <= 0 || options.neighborChars <= 0) return []
  const neighbors: BookContextNeighborPage[] = []
  const collect = (index: number, relation: BookContextNeighborPage["relation"]): void => {
    const page = sources.pages[index]
    if (!page) return
    const sections = digestSectionsWithinBudget(sources.sectioningFor(page.pageId), options.neighborChars)
    if (sections.length === 0) return
    neighbors.push({ relation, pageNumber: page.pageNumber, sections })
  }
  for (let distance = options.neighborPages; distance >= 1; distance--) collect(pageIndex - distance, "previous")
  for (let distance = 1; distance <= options.neighborPages; distance++) collect(pageIndex + distance, "next")
  return neighbors
}

export function buildRenderBookContext(
  sources: RenderBookContextSources,
  options: RenderContextOptions,
): RenderBookContext | undefined {
  const pageIndex = sources.pages.findIndex((page) => page.pageId === sources.pageId)
  if (pageIndex < 0) return undefined
  const page = sources.pages[pageIndex]
  const hasBook = sources.metadata !== null || (options.summary && sources.summary)
  return {
    pageNumber: page.pageNumber,
    book: hasBook
      ? {
          title: sources.metadata?.title ?? null,
          authors: sources.metadata?.authors ?? [],
          languageCode: sources.metadata?.language_code ?? null,
          summary: options.summary ? sources.summary?.trim() || null : null,
        }
      : null,
    position: options.outlinePosition ? outlinePositionForPage(sources.outline, page.pageNumber) : [],
    pageHeadings: options.outlinePosition ? outlineHeadingsOnPage(sources.outline, page.pageId) : [],
    pageSections: digestSections(sources.sectioningFor(page.pageId), SIBLING_PREVIEW_CHARS),
    neighborPages: neighborPagesFor(sources, pageIndex, options),
  }
}

export function bookContextPromptValue(
  context: RenderBookContext | undefined,
  sectionIndex: number,
  scope: RenderBookContextScope,
): BookContextPromptValue | null {
  if (!context) return null
  const includeNeighborhood = scope === "render"
  const pageSections = includeNeighborhood
    ? context.pageSections.map((section, position) => ({
        number: position + 1,
        section_type: section.sectionType,
        text: section.text,
        is_current: section.sectionIndex === sectionIndex,
      }))
    : []
  const current = pageSections.find((section) => section.is_current)
  return {
    page_number: context.pageNumber,
    book: context.book
      ? {
          title: context.book.title,
          authors: context.book.authors,
          language_code: context.book.languageCode,
          summary: context.book.summary,
        }
      : null,
    position: context.position,
    page_headings: context.pageHeadings,
    section_number: current?.number ?? null,
    page_sections: pageSections,
    neighbor_pages: includeNeighborhood
      ? context.neighborPages.map((page) => ({
          relation: page.relation === "previous" ? "Previous" : "Next",
          page_number: page.pageNumber,
          sections: page.sections.map((section) => ({
            section_type: section.sectionType,
            text: section.text,
          })),
        }))
      : [],
  }
}

function readParsed<T>(
  storage: Storage,
  node: string,
  itemId: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): T | null {
  const row = storage.getLatestNodeData(node, itemId)
  if (!row) return null
  const parsed = schema.safeParse(row.data)
  return parsed.success ? parsed.data : null
}

export function createRenderBookContextReader(
  storage: Storage,
  config: AppConfig,
): (pageId: string) => RenderBookContext | undefined {
  const options = resolveRenderContextOptions(config)
  if (!options) return () => undefined
  const metadata = readParsed(storage, "metadata", "book", BookMetadata)
  const summary = readParsed(storage, "book-summary", "book", BookSummaryOutput)?.summary ?? null
  const outline = options.outlinePosition ? readBookOutline(storage) : null
  const pages = storage.getPages().map((page) => ({ pageId: page.pageId, pageNumber: page.pageNumber }))
  const sectioningFor = (pageId: string): PageSectioningOutput | null =>
    (storage.getLatestNodeData("page-sectioning", pageId)?.data as PageSectioningOutput | undefined) ?? null
  return (pageId) =>
    buildRenderBookContext({ pageId, pages, metadata, summary, outline, sectioningFor }, options)
}
