import { useMemo } from "react"
import { plural } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { EyeOff, FileQuestion, ScanText, SkipForward } from "lucide-react"
import { useBookRun } from "@/hooks/use-book-run"
import type { RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { StepNote } from "../shared/notes/NoteRow"

export function useSectioningNotes({
  pages,
  sectioning,
  busy,
  onOpenPage,
}: {
  pages: PipelinePage[]
  sectioning: RunStageActivity
  busy: boolean
  onOpenPage: (pageId: string) => void
}): StepNote[] {
  const { t } = useLingui()
  const bookRun = useBookRun()

  const prunedPages = useMemo(() => pages.filter((page) => page.prunedSections.length > 0), [pages])
  const droppedCount = useMemo(() => prunedPages.reduce((sum, page) => sum + page.prunedSections.length, 0), [prunedPages])
  const warnCount = useMemo(() => pages.filter((page) => page.extractionWarning).length, [pages])
  const emptyPages = useMemo(() => pages.filter((page) => page.sectionCount === 0), [pages])

  const firstPruned = prunedPages[0]
  const droppedNote: StepNote | null =
    droppedCount > 0
      ? {
          id: "dropped",
          icon: EyeOff,
          title: t`${plural(droppedCount, { one: "# section dropped", other: "# sections dropped" })}`,
          body: t`Dropped sections stay in the book but won't reach readers. Open a page to see which parts were left out.`,
          actions: firstPruned ? [{ label: t`Open page ${firstPruned.pageNumber}`, onClick: () => onOpenPage(firstPruned.pageId) }] : undefined,
        }
      : null

  const scannedNote: StepNote | null =
    warnCount > 0
      ? {
          id: "scanned",
          icon: ScanText,
          title: t`${plural(warnCount, { one: "# page was read from images", other: "# pages were read from images" })}`,
          body: t`These pages have no text layer, so their text was read from the page pictures. That works, but a digital PDF (one you can select text in) gives better summaries and translations.`,
        }
      : null

  const firstEmpty = emptyPages[0]
  const emptyNote: StepNote | null =
    !busy && emptyPages.length > 0 && emptyPages.length < pages.length
      ? {
          id: "empty",
          icon: FileQuestion,
          title: t`${plural(emptyPages.length, { one: "# page has no sections", other: "# pages have no sections" })}`,
          body: t`Sectioning found nothing to group on them. Open one to check it, or re-run Sectioning.`,
          actions: firstEmpty ? [{ label: t`Open page ${firstEmpty.pageNumber}`, onClick: () => onOpenPage(firstEmpty.pageId) }] : undefined,
        }
      : null

  const skippedSteps = sectioning.steps
    .map((step) => ({ label: step.label, count: Number(/(\d+) page\(s\) skipped/.exec(bookRun.stepMessage?.(step.name) ?? "")?.[1] ?? 0) }))
    .filter((step) => step.count > 0)
  const skippedCount = skippedSteps.reduce((total, step) => total + step.count, 0)
  const skippedNames = skippedSteps.map((step) => step.label).join(", ")
  const skippedNote: StepNote | null =
    skippedCount > 0
      ? {
          id: "skipped",
          icon: SkipForward,
          title: t`${plural(skippedCount, { one: "# page was skipped", other: "# pages were skipped" })}`,
          body: t`${skippedNames} couldn't process them, so the run went on without them. Re-run Sectioning to try them again.`,
        }
      : null

  return [skippedNote, droppedNote, emptyNote, scannedNote].filter((note): note is StepNote => note !== null)
}
