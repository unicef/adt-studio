import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { FileLock, FileWarning, Hourglass, KeyRound, RotateCcw, Settings, TriangleAlert, type LucideIcon } from "lucide-react"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import type { ProblemAction } from "./ProblemNotice"
import type { DescribedProblem } from "./useDescribeProblem"

export function useProblemAction(label: string) {
  const navigate = useNavigate()
  const nav = usePipelineNavigation(label)
  return (problem: DescribedProblem, retry?: { run: () => void; canRun: boolean; reason?: string | null }): ProblemAction | undefined => {
    if (problem.fix === "key") {
      return {
        label: <Trans>Set up AI access</Trans>,
        icon: KeyRound,
        onClick: () => void navigate({ to: "/pipeline/$label/settings/$section", params: { label, section: "api-keys" } }),
      }
    }
    if (problem.fix === "pdf") return { label: <Trans>Book settings</Trans>, icon: Settings, onClick: nav.openBookInfo }
    if (!retry) return undefined
    return { label: <Trans>Try again</Trans>, icon: RotateCcw, onClick: retry.run, disabled: !retry.canRun, disabledReason: retry.canRun ? undefined : (retry.reason ?? undefined) }
  }
}

export function problemIcon(problem: DescribedProblem): LucideIcon {
  if (problem.fix === "key") return KeyRound
  if (problem.fix === "pdf") return FileLock
  if (problem.level === "temporary") return Hourglass
  if (problem.level === "partial") return FileWarning
  return TriangleAlert
}
