import { forwardRef, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { StackedRuns, toStageRuns } from "./MultiRun"
import { Check, RefreshCw, type LucideIcon } from "lucide-react"
import { StaleRing } from "./StaleRing"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { NO_DRAG_REGION } from "@/constants"
import { useBookRun } from "@/hooks/use-book-run"
import { cn } from "@/lib/utils"
import { PipelineRunIndicator } from "@/components/app/screens/pipeline/runs/PipelineRunIndicator"
import { progressCounts } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import { useRunActivity, type RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { useStageError } from "@/components/app/screens/pipeline/steps/shared/RunErrorNotice"
import { useDescribeProblem, type ProblemStage } from "@/components/app/screens/pipeline/steps/shared/problems/useDescribeProblem"
import { problemTone, type ProblemTone } from "@/components/app/screens/pipeline/steps/shared/problems/problemTone"

type Tone = "run" | ProblemTone | "done" | "stale"

export interface RingModel {
  tone: Tone
  icon: LucideIcon
  hex: string
  name: string
  text: string
  fraction: number | null
  waiting: number
}

const RADIUS = 13
const LENGTH = 2 * Math.PI * RADIUS

function StageDot({ icon: Icon, hex }: { icon: LucideIcon; hex: string }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full text-white" style={{ background: hex }}>
      <Icon className="size-3" strokeWidth={2.4} />
    </span>
  )
}

export function Ring({ model }: { model: RingModel }) {
  const running = model.tone === "run"
  const failed = model.tone === "attention" || model.tone === "critical"
  const filled = running && model.fraction !== null ? model.fraction * LENGTH : LENGTH * 0.25
  return (
    <span className="relative grid size-8 place-items-center">
      <svg
        viewBox="0 0 30 30"
        className={cn("absolute inset-0 size-8", running && model.fraction === null && "animate-spin motion-reduce:animate-none")}
      >
        <circle cx="15" cy="15" r={RADIUS} fill="none" strokeWidth="2.5" className="stroke-border" />
        {running && (
          <circle
            cx="15"
            cy="15"
            r={RADIUS}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            stroke={model.hex}
            strokeDasharray={`${filled} ${LENGTH}`}
            transform="rotate(-90 15 15)"
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        )}
      </svg>
      {model.tone === "done" ? (
        <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : (
        <StageDot icon={model.icon} hex={model.hex} />
      )}
      {failed && (
        <span
          className={cn(
            "absolute -right-1 -top-1 grid size-4 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-card",
            model.tone === "critical" ? "bg-destructive" : "bg-amber-600",
          )}
        >
          !
        </span>
      )}
      {model.tone === "stale" && (
        <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-amber-400 text-zinc-950 ring-2 ring-card">
          <RefreshCw className="size-2.5" strokeWidth={3} />
        </span>
      )}
      {running && model.waiting > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-600 px-1 font-mono text-[9.5px] font-bold text-white ring-2 ring-card">
          {model.waiting + 1}
        </span>
      )}
    </span>
  )
}

export const RingButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button"> & { label: string; children: ReactNode }>(
  function RingButton({ label, children, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={label}
        style={NO_DRAG_REGION}
        className={cn(
          "flex shrink-0 items-center rounded-lg transition-[background-color,scale] duration-150 ease-out hover:bg-muted/70 active:scale-[0.97] motion-reduce:active:scale-100",
          "animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

function runningModel(stage: RunStageActivity, waiting: number): RingModel {
  const counts = progressCounts(stage)
  return {
    tone: "run",
    icon: stage.icon,
    hex: stage.hex,
    name: stage.label,
    text: stage.runningLabel,
    fraction: counts ? counts.done / counts.total : stage.isDeterminate ? stage.fraction : null,
    waiting,
  }
}

function FailedRing({ label, slug }: { label: string; slug: string }) {
  const { t } = useLingui()
  const nav = usePipelineNavigation(label)
  const error = useStageError(slug as ProblemStage)
  const describe = useDescribeProblem()
  const problem = describe(slug as ProblemStage, error)
  const stage = STAGES.find((candidate) => candidate.slug === slug)
  const name = getStageLabelI18n(slug)
  const model: RingModel = {
    tone: problemTone(problem.level),
    icon: stage?.icon ?? Check,
    hex: stage?.hex ?? "#52525b",
    name,
    text: name,
    fraction: null,
    waiting: 0,
  }
  return (
    <RingButton label={t`Open ${name} — ${problem.title}`} onClick={() => nav.openStep(slug)}>
      <Ring model={model} />
    </RingButton>
  )
}

export function StatusRing({ label }: { label: string }) {
  const { t } = useLingui()
  const run = useRunActivity()
  const { stageState } = useBookRun()
  const [finished, setFinished] = useState<RingModel | null>(null)
  const lastRunning = useRef<RingModel | null>(null)
  const active = run.activeStages.find((stage) => stage.state === "running") ?? run.activeStages[0] ?? null

  useEffect(() => {
    if (active) {
      lastRunning.current = runningModel(active, 0)
      setFinished(null)
      return
    }
    const last = lastRunning.current
    if (!last) return
    lastRunning.current = null
    setFinished({ ...last, tone: "done", text: t`${last.name} done`, fraction: 1 })
    const timer = window.setTimeout(() => setFinished(null), 3000)
    return () => window.clearTimeout(timer)
  }, [active, t])

  if (active && run.activeStages.length > 1) {
    const runs = toStageRuns(run.activeStages)
    const count = runs.length
    return (
      <PipelineRunIndicator
        trigger={
          <RingButton label={t`${plural(count, { one: "# stage running", other: "# stages running or waiting" })} — show progress`}>
            <StackedRuns runs={runs} />
          </RingButton>
        }
      />
    )
  }

  if (active) {
    const model = runningModel(active, 0)
    return (
      <PipelineRunIndicator
        trigger={
          <RingButton label={t`${model.text} — show progress`}>
            <Ring model={model} />
          </RingButton>
        }
      />
    )
  }

  if (finished) {
    return (
      <RingButton label={finished.text} className="pointer-events-none">
        <Ring model={finished} />
      </RingButton>
    )
  }

  const failed = STAGES.find((stage) => stage.slug !== "book" && stageState(stage.slug) === "error")
  return failed ? <FailedRing label={label} slug={failed.slug} /> : <StaleRing label={label} />
}
