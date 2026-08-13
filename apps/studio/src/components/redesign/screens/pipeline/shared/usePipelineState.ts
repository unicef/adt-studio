import { useMemo } from "react"
import type { BookSummary, PageSummaryItem } from "@/api/client"
import { useBooks } from "@/hooks/use-books"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"
import { FOUNDATIONS, PLUGINS, type DockEntry, type DockSlug } from "./plugins"
import { STEP_PREREQ, isStepLocked, type StageEvidence } from "./stepPrereq"

export type DockState = "done" | "ready" | "locked"

export interface DockItem extends DockEntry {
  state: DockState
  /** Outstanding work surfaced as a badge on the dock disc. */
  pending: number
  /** Upstream stage holding this one back, when locked. */
  lockedBy?: string
}

export interface PipelinePage extends PageSummaryItem {
  /** Images on this page that still have no caption. */
  missingCaptions: number
  /** Every section pruned — the page is excluded from the rendered book. */
  isDiscarded: boolean
}

export interface PipelineState {
  book: BookSummary | undefined
  pages: PipelinePage[]
  isLoading: boolean
  error: Error | null
  extractDone: boolean
  sectionsDone: boolean
  hasSections: boolean
  hasRendering: boolean
  sectionCount: number
  imageCount: number
  missingCaptions: number
  foundations: DockItem[]
  plugins: DockItem[]
}

const NO_PAGES: PageSummaryItem[] = []

export function usePipelineState(label: string): PipelineState {
  const booksQuery = useBooks()
  const pagesQuery = usePages(label)
  const { stageState } = useBookRun()

  const book = useMemo(
    () => booksQuery.data?.find((b) => b.label === label),
    [booksQuery.data, label],
  )

  return useMemo(() => {
    const raw = pagesQuery.data ?? NO_PAGES
    const pages: PipelinePage[] = raw.map((page) => ({
      ...page,
      missingCaptions: page.hasCaptioning ? 0 : page.imageCount,
      isDiscarded: page.sectionCount > 0 && page.prunedSections.length >= page.sectionCount,
    }))

    const done = new Set(book?.completedStages ?? [])
    const extractDone = done.has("extract")
    const sectionsDone = done.has("sectioning")
    const hasSections = pages.some((p) => p.sectionCount > 0)
    const hasRendering = pages.some((p) => p.hasRendering)
    const sectionCount = pages.reduce((sum, p) => sum + p.sectionCount, 0)
    const imageCount = pages.reduce((sum, p) => sum + p.imageCount, 0)
    const missingCaptions = pages.reduce((sum, p) => sum + p.missingCaptions, 0)

    const pendingFor = (slug: DockSlug) => (slug === "captions" ? missingCaptions : 0)

    const evidence: StageEvidence = {
      covered: (stage) => {
        if (done.has(stage)) return true
        const state = stageState(stage)
        return state === "done" || state === "running" || state === "queued"
      },
      pageCount: pages.length,
      hasSections,
      hasRendering,
    }
    const isLocked = (slug: DockSlug) => isStepLocked(slug, evidence)

    const toItem = (item: DockEntry, locked: boolean): DockItem => ({
      ...item,
      state: done.has(item.slug) ? "done" : locked ? "locked" : "ready",
      pending: done.has(item.slug) ? pendingFor(item.slug) : 0,
      lockedBy: locked ? STEP_PREREQ[item.slug] ?? undefined : undefined,
    })

    return {
      book,
      pages,
      isLoading: booksQuery.isLoading || pagesQuery.isLoading,
      error: (booksQuery.error ?? pagesQuery.error) as Error | null,
      extractDone,
      sectionsDone,
      hasSections,
      hasRendering,
      sectionCount,
      imageCount,
      missingCaptions,
      // Extract and Sectioning never lock — they pull missing ancestors into
      // the run rather than refusing to start.
      foundations: FOUNDATIONS.map((item) => toItem(item, isLocked(item.slug))),
      plugins: PLUGINS.map((item) => toItem(item, isLocked(item.slug))),
    }
  }, [book, pagesQuery.data, booksQuery.isLoading, pagesQuery.isLoading, booksQuery.error, pagesQuery.error, stageState])
}
