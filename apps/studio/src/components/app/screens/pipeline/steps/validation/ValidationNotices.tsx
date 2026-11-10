import { Trans, useLingui } from "@lingui/react/macro"
import { FileWarning, PackageX, RotateCcw, Scissors, TriangleAlert } from "lucide-react"
import { ProblemNotice } from "../shared/problems/ProblemNotice"
import type { StepNote } from "../shared/notes/NoteRow"

export function PackagingFailedNotice({
  error,
  hex,
  hasResults,
  onRetry,
  disabled,
}: {
  error: string
  hex: string
  hasResults: boolean
  onRetry: () => void
  disabled?: boolean
}) {
  return (
    <ProblemNotice
      level="blocked"
      hex={hex}
      icon={PackageX}
      title={<Trans>The book couldn't be packaged, so it wasn't checked</Trans>}
      body={
        hasResults ? (
          <Trans>The results below are from the check before. Try again; if it keeps failing, the details say which page is the problem.</Trans>
        ) : (
          <Trans>Try again. If it keeps failing, the details say which page is the problem.</Trans>
        )
      }
      details={error}
      action={{ label: <Trans>Try again</Trans>, icon: RotateCcw, onClick: onRetry, disabled }}
    />
  )
}

export function ReportUnreadableNotice({
  error,
  hex,
  onRetry,
  disabled,
}: {
  error: string
  hex: string
  onRetry: () => void
  disabled?: boolean
}) {
  return (
    <ProblemNotice
      level="blocked"
      hex={hex}
      icon={FileWarning}
      title={<Trans>Couldn't read the last check</Trans>}
      body={<Trans>The report on disk can't be opened. Check again to write a fresh one.</Trans>}
      details={error}
      action={{ label: <Trans>Check again</Trans>, icon: RotateCcw, onClick: onRetry, disabled }}
    />
  )
}

export function AllPrunedNotice({ hex, onOpenStoryboard }: { hex: string; onOpenStoryboard: () => void }) {
  return (
    <ProblemNotice
      level="blocked"
      hex={hex}
      icon={Scissors}
      title={<Trans>Every page is pruned</Trans>}
      body={
        <Trans>Every section in the Storyboard is pruned, so there's nothing to package or check. Restore at least one section to continue.</Trans>
      }
      action={{ label: <Trans>Review pruned sections</Trans>, onClick: onOpenStoryboard }}
    />
  )
}

export function usePackagingWarningNote(warning: string | null): StepNote | null {
  const { t } = useLingui()
  if (!warning) return null
  return {
    id: "packaging-warning",
    icon: TriangleAlert,
    title: t`Some content was left out of the check`,
    body: warning,
    attention: true,
  }
}
