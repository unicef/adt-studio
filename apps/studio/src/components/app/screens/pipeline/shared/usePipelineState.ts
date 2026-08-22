import { useMemo } from "react"
import type { BookSummary, PageSummaryItem } from "@/api/client"
import { useBooks } from "@/hooks/use-books"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"
import { useSignLanguageVideos } from "@/hooks/use-sign-language-videos"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import { FOUNDATIONS, PLUGINS, type DockEntry, type DockSlug } from "./plugins"
import { STEP_PREREQ, isStepLocked, type StageEvidence } from "./stepPrereq"

export type DockState = "done" | "running" | "queued" | "error" | "ready" | "locked"

export interface DockItem extends DockEntry {
  state: DockState
  pending: number
  lockedBy?: string
}

export interface PipelinePage extends PageSummaryItem {
  missingCaptions: number
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

export const ARTIFACT_DERIVED_SLUGS: ReadonlySet<DockSlug> = new Set<DockSlug>([
  "sign-language",
  "validation",
])

export function usePipelineState(label: string): PipelineState {
  const booksQuery = useBooks()
  const pagesQuery = usePages(label)
  const { stageState } = useBookRun()
  const signLanguageQuery = useSignLanguageVideos(label)

  // Sign Language has no `PIPELINE` stage, so it never lands in `completedStages`
  // and `stageState` always reads idle. Its own artifact is the completion signal,
  // exactly as the old sidebar's completion override read it.
  const signLanguageDone =
    signLanguageQuery.data?.videos?.some((v) => v.sectionId !== null) ?? false

  // Validation is likewise absent from `PIPELINE` — packaging the ADT is what
  // produces its assessment, so that artifact is its completion signal.
  const assessmentQuery = useAccessibilityAssessment(label)
  const validationDone = Boolean(assessmentQuery.data?.assessment)

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

    // Same precedence as the old sidebar: a stage's own completion signal wins,
    // then the live run state, and only an idle stage can read as locked.
    // `completedStages` is deliberately not consulted here — it is a snapshot of
    // step_runs with no notion of running or queued, so a re-run of a finished
    // stage kept showing it as done.
    const resolveState = (slug: DockSlug, locked: boolean): DockState => {
      if (slug === "sign-language" && signLanguageDone) return "done"
      if (slug === "validation" && validationDone) return "done"
      const run = stageState(slug)
      if (run === "done" || run === "running" || run === "queued" || run === "error") return run
      return locked ? "locked" : "ready"
    }

    const toItem = (item: DockEntry, locked: boolean): DockItem => {
      const state = resolveState(item.slug, locked)
      return {
        ...item,
        state,
        pending: state === "done" ? pendingFor(item.slug) : 0,
        lockedBy: locked ? STEP_PREREQ[item.slug] ?? undefined : undefined,
      }
    }

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
  }, [book, pagesQuery.data, booksQuery.isLoading, pagesQuery.isLoading, booksQuery.error, pagesQuery.error, stageState, signLanguageDone, validationDone])
}
