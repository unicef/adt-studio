import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { progressCounts } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import type { RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"

interface StageRun {
  slug: string
  icon: LucideIcon
  hex: string
  queued: boolean
  fraction: number | null
}

export function toStageRuns(stages: RunStageActivity[]): StageRun[] {
  return [...stages]
    .sort((a, b) => Number(a.state === "queued") - Number(b.state === "queued"))
    .map((stage) => {
      const counts = progressCounts(stage)
      return {
        slug: stage.slug,
        icon: stage.icon,
        hex: stage.hex,
        queued: stage.state === "queued",
        fraction: stage.state === "queued" ? null : counts ? counts.done / counts.total : stage.isDeterminate ? stage.fraction : null,
      }
    })
}

const R = 13
const L = 2 * Math.PI * R

function Dot({ run, size = "size-5" }: { run: StageRun; size?: string }) {
  const Icon = run.icon
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full text-white transition-[filter,opacity] duration-300", size, run.queued && "opacity-60 grayscale")}
      style={{ background: run.hex }}
    >
      <Icon className="size-3" strokeWidth={2.4} />
    </span>
  )
}

function MiniRing({ run }: { run: StageRun }) {
  const filled = run.fraction !== null ? run.fraction * L : L * 0.25
  return (
    <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-card">
      <svg viewBox="0 0 30 30" className={cn("absolute inset-0 size-8", !run.queued && run.fraction === null && "animate-spin motion-reduce:animate-none")}>
        <circle cx="15" cy="15" r={R} fill="none" strokeWidth="2.5" className="stroke-border" strokeDasharray={run.queued ? "3 3" : undefined} />
        {!run.queued && (
          <circle
            cx="15"
            cy="15"
            r={R}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            stroke={run.hex}
            strokeDasharray={`${filled} ${L}`}
            transform="rotate(-90 15 15)"
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        )}
      </svg>
      <Dot run={run} />
    </span>
  )
}

export function StackedRuns({ runs }: { runs: StageRun[] }) {
  const shown = runs.slice(0, 3)
  const extra = runs.length - shown.length
  return (
    <span className="group/stack flex items-center">
      {shown.map((run, index) => (
        <span
          key={run.slug}
          className={cn(
            "rounded-full ring-2 ring-card transition-[margin] duration-200 ease-out motion-reduce:transition-none",
            index > 0 && "-ml-3 group-hover/stack:-ml-1",
          )}
          style={{ zIndex: shown.length - index }}
        >
          <MiniRing run={run} />
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2 grid size-8 place-items-center rounded-full bg-muted font-mono text-[11px] font-semibold text-muted-foreground ring-2 ring-card transition-[margin] duration-200 group-hover/stack:-ml-1">
          +{extra}
        </span>
      )}
    </span>
  )
}
