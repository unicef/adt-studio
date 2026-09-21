import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2, Workflow, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { RunStepRows } from "./RunStepRows"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { useRunActivity, type RunStageActivity } from "./useRunActivity"

function StageBlock({ stage }: { stage: RunStageActivity }) {
  return (
    <section className="rounded-xl border p-2.5" style={{ borderColor: tint(stage.hex, 0.35) }}>
      <header className="flex items-center gap-2 pb-2">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full text-white"
          style={{ background: stage.hex }}
        >
          <stage.icon className="size-3.5" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
          {stage.state === "queued" ? stage.label : stage.runningLabel}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {stage.doneCount}/{stage.steps.length}
        </span>
      </header>
      {stage.state === "queued" && (
        <p className="pb-2 text-[11px] text-muted-foreground">
          <Trans>Waiting for the running stage to finish</Trans>
        </p>
      )}
      <RunStepRows steps={stage.steps} hex={stage.hex} />
    </section>
  )
}

export interface PipelineRunIndicatorProps {
  className?: string
}

export function PipelineRunIndicator({ className }: PipelineRunIndicatorProps) {
  const { t } = useLingui()
  const run = useRunActivity()
  const active = run.badgeCount > 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={active ? t`${run.badgeCount} pipeline steps running` : t`Pipeline`}
          aria-label={active ? t`${run.badgeCount} pipeline steps running` : t`Pipeline`}
          className={cn(
            "relative grid size-8 place-items-center rounded-lg border transition-colors hover:bg-muted",
            active ? "border-brand-200 bg-brand-50 text-brand-700" : "text-foreground",
            className,
          )}
        >
          <Workflow className="size-3.5" />
          {active && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" />
              <span className="relative grid min-w-4 place-items-center rounded-full bg-brand-600 px-1 font-mono text-[9px] font-bold leading-4 text-white ring-2 ring-card">
                {run.badgeCount}
              </span>
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[336px] p-2.5">
        <div className="flex items-center gap-2 pb-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            <Trans>Pipeline</Trans>
          </span>
          {run.isRunning && (
            <Loader2 className="size-3 animate-spin text-brand-600" />
          )}
          {run.isRunning && (
            <button
              type="button"
              onClick={run.cancelRun}
              disabled={run.isCancelling}
              className={cn(
                "ml-auto flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors",
                run.isCancelling
                  ? "text-muted-foreground/60"
                  : "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40",
              )}
            >
              {run.isCancelling ? (
                <Trans>Cancelling…</Trans>
              ) : (
                <>
                  <X className="size-3" />
                  <Trans>Cancel run</Trans>
                </>
              )}
            </button>
          )}
        </div>

        {run.activeStages.length === 0 ? (
          <p className="pb-1 text-[12px] leading-relaxed text-muted-foreground">
            <Trans>Nothing is running right now. Stages you start show their steps here.</Trans>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {run.activeStages.map((stage) => (
              <StageBlock key={stage.slug} stage={stage} />
            ))}
          </div>
        )}

        {run.error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] leading-snug text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            {run.error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
