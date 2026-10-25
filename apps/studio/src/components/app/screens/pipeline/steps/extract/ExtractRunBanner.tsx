import { CircleAlert, CirclePlay, FileText } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import type { ExtractRun } from "@/components/app/screens/pipeline/runs/useExtractRun"
import { ProblemNotice } from "@/components/app/screens/pipeline/steps/shared/problems/ProblemNotice"
import { useDescribeProblem, type ProblemPage } from "@/components/app/screens/pipeline/steps/shared/problems/useDescribeProblem"
import { problemIcon, useProblemAction } from "@/components/app/screens/pipeline/steps/shared/problems/useProblemAction"
import { ProblemActionButton } from "@/components/app/screens/pipeline/steps/shared/problems/ProblemActionButton"

export function ExtractRunBanner({
  label,
  run,
  pages,
  onOpenPage,
  retry,
  hidePartial = false,
}: {
  label: string
  run: ExtractRun
  retry?: { run: () => void; canRun: boolean; reason?: string | null }
  pages?: readonly ProblemPage[]
  onOpenPage?: (pageId: string) => void
  hidePartial?: boolean
}) {
  const extract = useStageActivity("extract")
  const activity = useRunActivity()
  const describe = useDescribeProblem()
  const actionFor = useProblemAction(label)

  if (extract.isActive) return null

  if (run.hasError) {
    const problem = describe("extract", activity.error, pages)
    if (hidePartial && problem.level === "partial") return null
    return (
      <ProblemNotice
        level={problem.level}
        hex={extract.hex}
        icon={problemIcon(problem)}
        title={problem.title}
        body={problem.body}
        details={problem.details}
        pages={problem.pages}
        onOpenPage={onOpenPage}
        action={actionFor(problem, retry ?? run)}
      />
    )
  }

  if (run.isInterrupted) {
    return (
      <ProblemNotice
        level="resume"
        hex={extract.hex}
        icon={CirclePlay}
        title={<Trans>Extraction stopped before it finished</Trans>}
        body={<Trans>Some steps didn't run. Resume to finish them; everything already done is kept.</Trans>}
        action={{ label: <Trans>Resume</Trans>, icon: CirclePlay, onClick: run.run, disabled: !run.canRun }}
      />
    )
  }

  return null
}

export function ExtractProblemLine({
  label,
  run,
  pages,
  onOpenPage,
  retry,
}: {
  label: string
  run: ExtractRun
  pages?: readonly ProblemPage[]
  onOpenPage?: (pageId: string) => void
  retry?: { run: () => void; canRun: boolean; reason?: string | null }
}) {
  const extract = useStageActivity("extract")
  const activity = useRunActivity()
  const describe = useDescribeProblem()
  const actionFor = useProblemAction(label)
  if (extract.isActive || !run.hasError) return null
  const problem = describe("extract", activity.error, pages)
  if (problem.level !== "partial") return null
  const action = actionFor(problem, retry ?? run)
  return (
    <>
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/20">
        <CircleAlert className="size-3.5 text-white" strokeWidth={2.4} />
      </span>
      <span className="font-medium">{problem.title}</span>
      <span className="text-white/80">{problem.body}</span>
      {problem.pages.map((page) => (
        <button
          key={page.pageId}
          type="button"
          onClick={() => onOpenPage?.(page.pageId)}
          className="flex h-6 items-center gap-1 rounded-md bg-white/15 px-2 text-[11.5px] font-semibold transition-colors duration-150 hover:bg-white/25"
        >
          <FileText className="size-3" />
          <Trans>Open page {page.pageNumber}</Trans>
        </button>
      ))}
      {action && (
        <ProblemActionButton
          action={action}
          className="ml-auto h-6 rounded-md bg-white px-2 text-[11.5px] font-semibold text-[color:var(--next-hex,#0f172a)] hover:bg-white/90 aria-disabled:cursor-default aria-disabled:bg-white/20! aria-disabled:text-white/70!"
        />
      )}
    </>
  )
}
