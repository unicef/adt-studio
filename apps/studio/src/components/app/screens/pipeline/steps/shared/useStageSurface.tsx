import type { ReactNode } from "react"
import { CirclePlay } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { NextStepCardView } from "@/components/app/screens/pipeline/chrome/NextStepCard"
import { CollapsingRunStrip } from "@/components/app/screens/pipeline/runs/CollapsingRunStrip"
import { isQuietNextStep, useNextStep } from "@/components/app/screens/pipeline/shared/useNextStep"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useBookRun } from "@/hooks/use-book-run"
import { useOptionalStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useStageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import { useRerunConfirm } from "@/components/app/screens/pipeline/runs/useRerunConfirm"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import { useHasUnsavedChanges } from "@/components/pipeline/components/floating-save"
import { useHowItWorks } from "./how-it-works/useHowItWorks"
import type { StepNote } from "./notes/NoteRow"
import { NotesStrip } from "./notes/NotesStrip"
import { ProblemStrip } from "./problems/ProblemStrip"
import { FoldedProblem } from "./problems/FoldedProblem"
import { ProblemNotice } from "./problems/ProblemNotice"
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
  hasOutput?: boolean
  hintOpen?: boolean
  boldNext?: boolean
}

export interface StageSurface {
  top: ReactNode
  help: ReactNode
  locked: boolean
  interrupted: boolean
  retry: { run: () => void; canRun: boolean; reason?: string | null }
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
  hasOutput = false,
  hintOpen = false,
  boldNext = false,
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
  const next = useNextStep(label, slug, { partial: problem.partial })
  const { stageState } = useBookRun()
  const retry = { run: confirm.request, canRun: confirm.canRun, reason: confirm.disabledReason }
  const quietNext = !boldNext && !!next && isQuietNextStep(next)
  const fold = !!failed && failed.level === "partial" && !dirty && !!next && ready
  const interrupted = pipeline && !failed && hasOutput && !(activity?.isActive ?? false) && stageState(slug) === "idle"
  const stageName = getStageLabelI18n(slug)

  const top = (
    <>
      {activity && <CollapsingRunStrip stage={activity} outcome={outcome} />}
      {interrupted && (
        <ProblemNotice
          level="resume"
          hex={hex}
          icon={CirclePlay}
          title={<Trans>{stageName} stopped before it finished</Trans>}
          body={<Trans>Some pages weren't done. Resume to finish them; everything already done is kept.</Trans>}
          action={{
            label: <Trans>Resume</Trans>,
            icon: CirclePlay,
            onClick: rerun.run,
            disabled: !rerun.canRun,
            disabledReason: rerun.disabledReason ?? undefined,
          }}
        />
      )}
      {failed && !fold && failView.form === "strip" && (
        <ProblemStrip problem={failed} action={actionFor(failed, { run: confirm.request, canRun: confirm.canRun, reason: confirm.disabledReason })} />
      )}
      {failed && !fold && failView.form === "notice" && (
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
      {!dirty && (!failed || fold) && !interrupted && (
        <NextStepCardView
          next={next}
          slug={slug}
          ready={ready}
          confirm={problem.partialConfirm}
          bold={boldNext}
          aside={
            fold ? (
              <FoldedProblem
                label={label}
                problem={failed}
                retry={retry}
                onOpenPage={onOpenPage}
                onShowItems={showFailed}
                presentation={quietNext ? "strip" : "inline"}
              />
            ) : null
          }
        />
      )}
      <NotesStrip notes={allNotes} hex={hex} defaultOpen={hintOpen && !!howItWorks.note && !(activity?.isActive ?? false)} />
      {confirm.dialogs}
    </>
  )

  return { top, help: howItWorks.help, locked: activity?.isActive ?? false, interrupted, retry, problem: failed, failView, marks }
}
