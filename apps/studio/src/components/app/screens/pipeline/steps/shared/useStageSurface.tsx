import type { ReactNode } from "react"
import { NextStepCard } from "@/components/app/screens/pipeline/chrome/NextStepCard"
import { LiveRunStrip } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import { useOptionalStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useStageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import { useRerunConfirm } from "@/components/app/screens/pipeline/runs/useRerunConfirm"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import { useHasUnsavedChanges } from "@/components/pipeline/components/floating-save"
import { useHowItWorks } from "./how-it-works/useHowItWorks"
import type { StepNote } from "./notes/NoteRow"
import { NotesStrip } from "./notes/NotesStrip"
import { ProblemStrip } from "./problems/ProblemStrip"
import type { DescribedProblem, ProblemPage, ProblemStage } from "./problems/useDescribeProblem"
import { useProblemAction } from "./problems/useProblemAction"
import { useStageProblem } from "./problems/useStageProblem"
import { useStageFailView, type StageFailView } from "./problems/variants/useStageFailView"
import { RunErrorNotice } from "./RunErrorNotice"
import { useStageMarks, type StageMarks } from "./marks/useStageMarks"

export interface StageSurfaceOptions<P extends ProblemPage = ProblemPage> {
  label: string
  slug: DockSlug
  hex: string
  pages?: readonly P[]
  ready: boolean
  outcome: ReactNode
  hint: { title: ReactNode; body: ReactNode }
  notes?: StepNote[]
  onOpenPage: (pageId: string) => void
  markExtra?: (page: P) => boolean
  onShowFailed?: () => void
}

export interface StageSurface {
  top: ReactNode
  help: ReactNode
  locked: boolean
  problem: DescribedProblem | null
  failView: StageFailView
  marks: StageMarks
}

const NO_PAGES: readonly never[] = []

export function useStageSurface<P extends ProblemPage = ProblemPage>({
  label,
  slug,
  hex,
  pages = NO_PAGES,
  ready,
  outcome,
  hint,
  notes = [],
  onOpenPage,
  markExtra,
  onShowFailed,
}: StageSurfaceOptions<P>): StageSurface {
  const activity = useOptionalStageActivity(slug)
  const pipeline = activity !== null
  const rerun = useStageRerun(label, slug)
  const confirm = useRerunConfirm(slug, rerun)
  const failView = useStageFailView()
  const howItWorks = useHowItWorks(slug, hint)
  const dirty = useHasUnsavedChanges()
  const actionFor = useProblemAction(label)
  const problem = useStageProblem({ stage: slug as ProblemStage, pages, retry: confirm.request, onOpenPage })
  const allNotes = howItWorks.note ? [...notes, howItWorks.note] : notes
  const failed = pipeline && problem.failed && problem.problem ? problem.problem : null
  const marks = useStageMarks({ enabled: failView.marks, problem: failed, pages, extra: markExtra })
  const showFailed = failView.marks && marks.failedCount > 0 ? onShowFailed : undefined

  const top = (
    <>
      {activity?.isActive && <LiveRunStrip stage={activity} outcome={outcome} />}
      {failed && failView.form === "strip" && (
        <ProblemStrip problem={failed} action={actionFor(failed, { run: confirm.request, canRun: confirm.canRun, reason: confirm.disabledReason })} />
      )}
      {failed && failView.form === "notice" && (
        <RunErrorNotice
          label={label}
          stage={slug as ProblemStage}
          hex={hex}
          pages={pages}
          onOpenPage={onOpenPage}
          onShowFailed={showFailed}
          onRetry={confirm.request}
          canRetry={confirm.canRun}
          retryReason={confirm.disabledReason}
        />
      )}
      {!dirty && !failed && <NextStepCard label={label} slug={slug} partial={problem.partial} ready={ready} confirm={problem.partialConfirm} />}
      <NotesStrip notes={allNotes} hex={hex} />
      {confirm.dialogs}
    </>
  )

  return { top, help: howItWorks.help, locked: activity?.isActive ?? false, problem: failed, failView, marks }
}
