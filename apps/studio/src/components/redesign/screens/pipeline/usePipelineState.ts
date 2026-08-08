import { useMemo } from "react"
import type { BookSummary, PageSummaryItem } from "@/api/client"
import { useBooks } from "@/hooks/use-books"
import { usePages } from "@/hooks/use-pages"
import { FOUNDATIONS, PLUGINS, type DockEntry, type DockSlug } from "./plugins"

export type DockState = "done" | "ready" | "locked"

export interface DockItem extends DockEntry {
  state: DockState
  /** Outstanding work surfaced as a badge on the dock disc. */
  pending: number
}

export interface PipelinePage extends PageSummaryItem {
  /** Images on this page that still have no caption. */
  missingCaptions: number
}

export interface PipelineState {
  book: BookSummary | undefined
  pages: PipelinePage[]
  isLoading: boolean
  error: Error | null
  extractDone: boolean
  sectionsDone: boolean
  hasSections: boolean
  imageCount: number
  missingCaptions: number
  foundations: DockItem[]
  plugins: DockItem[]
}

const NO_PAGES: PageSummaryItem[] = []

export function usePipelineState(label: string): PipelineState {
  const booksQuery = useBooks()
  const pagesQuery = usePages(label)

  const book = useMemo(
    () => booksQuery.data?.find((b) => b.label === label),
    [booksQuery.data, label],
  )

  return useMemo(() => {
    const raw = pagesQuery.data ?? NO_PAGES
    const pages: PipelinePage[] = raw.map((page) => ({
      ...page,
      missingCaptions: page.hasCaptioning ? 0 : page.imageCount,
    }))

    const done = new Set(book?.completedStages ?? [])
    const extractDone = done.has("extract")
    const sectionsDone = done.has("sectioning")
    const hasSections = pages.some((p) => p.sectionCount > 0)
    const imageCount = pages.reduce((sum, p) => sum + p.imageCount, 0)
    const missingCaptions = pages.reduce((sum, p) => sum + p.missingCaptions, 0)

    const pendingFor = (slug: DockSlug) => (slug === "captions" ? missingCaptions : 0)

    const toItem = (item: DockEntry, locked: boolean): DockItem => ({
      ...item,
      state: done.has(item.slug) ? "done" : locked ? "locked" : "ready",
      pending: done.has(item.slug) ? pendingFor(item.slug) : 0,
    })

    return {
      book,
      pages,
      isLoading: booksQuery.isLoading || pagesQuery.isLoading,
      error: (booksQuery.error ?? pagesQuery.error) as Error | null,
      extractDone,
      sectionsDone,
      hasSections,
      imageCount,
      missingCaptions,
      foundations: FOUNDATIONS.map((item) =>
        toItem(item, item.slug !== "extract" && !extractDone),
      ),
      plugins: PLUGINS.map((item) => toItem(item, !hasSections)),
    }
  }, [book, pagesQuery.data, booksQuery.isLoading, pagesQuery.isLoading, booksQuery.error, pagesQuery.error])
}
