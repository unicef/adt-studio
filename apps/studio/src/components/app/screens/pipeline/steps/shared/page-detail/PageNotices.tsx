import { Trans, useLingui } from "@lingui/react/macro"
import { Hourglass, RotateCcw, ScanText, TriangleAlert } from "lucide-react"
import { ProblemNotice } from "../problems/ProblemNotice"
import { NotesStrip } from "../notes/NotesStrip"
import type { StepNote } from "../notes/NoteRow"

export function PageLoadError({ pageNumber, onRetry }: { pageNumber: number | null; onRetry?: () => void }) {
  const { t } = useLingui()
  return (
    <ProblemNotice
      level="blocked"
      icon={TriangleAlert}
      title={pageNumber != null ? t`Couldn't load page ${pageNumber}` : t`Couldn't load this page`}
      body={t`Something went wrong while reading it. Try again in a moment.`}
      action={onRetry ? { label: <Trans>Try again</Trans>, icon: RotateCcw, onClick: onRetry } : undefined}
    />
  )
}

export function PageRefreshFailed({ pageNumber, hex, onRetry }: { pageNumber: number; hex?: string; onRetry: () => void }) {
  const { t } = useLingui()
  return (
    <ProblemNotice
      level="temporary"
      hex={hex}
      icon={Hourglass}
      title={t`Couldn't refresh page ${pageNumber}`}
      body={t`You're seeing the last loaded copy.`}
      action={{ label: <Trans>Try again</Trans>, icon: RotateCcw, onClick: onRetry }}
    />
  )
}

function usePageNotes({ storyboardBuilt, scanned }: { storyboardBuilt: boolean; scanned: boolean }): StepNote[] {
  const { t } = useLingui()
  const notes: StepNote[] = []
  if (storyboardBuilt)
    notes.push({
      id: "storyboard-built",
      icon: RotateCcw,
      title: t`Storyboard already built`,
      body: t`Changes made here reach the book after Storyboard runs again.`,
    })
  if (scanned)
    notes.push({
      id: "scanned",
      icon: ScanText,
      title: t`This page was read from an image`,
      body: t`It has no text layer, so its text was read from the page picture. That works, but a digital PDF (one you can select text in) gives better summaries and translations.`,
    })
  return notes
}

export function PageNoticeGroup({ hex, storyboardBuilt, scanned }: { hex: string; storyboardBuilt: boolean; scanned: boolean }) {
  const notes = usePageNotes({ storyboardBuilt, scanned })
  return <NotesStrip notes={notes} hex={hex} />
}
