import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { RunStepRows } from "./RunStepRows"
import { tint } from "@/components/redesign/screens/pipeline/shared/plugins"
import type { RunStageActivity } from "./useRunActivity"

export interface StageRunningPanelProps {
  stage: RunStageActivity
  isCancelling?: boolean
  onCancel?: () => void
  outcome?: React.ReactNode
  className?: string
}

export function StageRunningPanel({
  stage,
  isCancelling,
  onCancel,
  outcome,
  className,
}: StageRunningPanelProps) {
  const { t } = useLingui()
  const progress = stage.steps.length > 0 ? (stage.doneCount / stage.steps.length) * 100 : 0

  return (
    <div
      className={cn(
        "w-[440px] overflow-hidden rounded-2xl border bg-card shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)]",
        className,
      )}
      style={{ borderColor: tint(stage.hex, 0.35) }}
    >
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: tint(stage.hex, 0.08) }}>
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full text-white"
          style={{ background: stage.hex }}
        >
          <stage.icon className="size-4.5" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Loader2 className="size-3.5 shrink-0 animate-spin" style={{ color: stage.hex }} />
            <span className="truncate text-[14px] font-bold tracking-[-0.01em]">
              {stage.state === "queued" ? stage.label : stage.runningLabel}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
            {stage.state === "queued" ? (
              <Trans>Queued — it starts as soon as the running stage finishes</Trans>
            ) : stage.current ? (
              <>
                <span className="truncate">{stage.current.label}</span>
                {stage.current.progress && (
                  <span className="shrink-0 font-mono font-medium tabular-nums text-foreground/70">
                    {stage.current.progress}
                  </span>
                )}
              </>
            ) : (
              <Trans>Starting…</Trans>
            )}
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
            title={t`Cancel run`}
            aria-label={t`Cancel run`}
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg border transition-colors",
              isCancelling
                ? "text-muted-foreground/50"
                : "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40",
            )}
          >
            {isCancelling ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          </button>
        )}
      </div>

      <div className="h-1 w-full bg-muted">
        <div
          className="h-full rounded-r-full transition-[width] duration-500"
          style={{ width: `${progress}%`, background: stage.hex }}
        />
      </div>

      <div className="px-4 py-3.5">
        <RunStepRows steps={stage.steps} hex={stage.hex} />
        {outcome && (
          <p className="mt-3 border-t pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
            {outcome}
          </p>
        )}
      </div>
    </div>
  )
}
