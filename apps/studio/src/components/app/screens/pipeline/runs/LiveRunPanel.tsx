import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import type { RunStageActivity } from "./useRunActivity"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"

export function progressCounts(stage: RunStageActivity | null): { done: number; total: number } | null {
  const match = stage?.current?.progress?.match(/(\d+)\s*\/\s*(\d+)/)
  if (!match) return null
  const done = Number(match[1])
  const total = Number(match[2])
  return total > 0 ? { done: Math.min(done, total), total } : null
}

export function LiveRunStrip({ stage, outcome }: { stage: RunStageActivity; outcome?: React.ReactNode }) {
  const counts = progressCounts(stage)
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border bg-card px-3.5 py-3 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none"
      style={{ borderColor: tint(stage.hex, 0.3) }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full text-white"
          style={{ background: stage.hex }}
        >
          <stage.icon className="size-3.5" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" style={{ color: stage.hex }} />
            <span className="truncate">{stage.state === "queued" ? stage.label : stage.runningLabel}</span>
            {counts && (
              <span className="ml-auto shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                {counts.done} / {counts.total}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            {stage.steps.map((step) => (
              <span key={step.name} className="flex items-center gap-1">
                {step.state === "done" || step.state === "skipped" ? (
                  <Check className="size-3 text-emerald-600" />
                ) : step.state === "running" ? (
                  <span className="size-1.5 rounded-full motion-safe:animate-pulse" style={{ background: stage.hex }} />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/30" />
                )}
                <span className={cn(step.state === "running" && "font-medium text-foreground")}>{step.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={counts?.total ?? 100}
        aria-valuenow={counts ? counts.done : stage.isDeterminate ? Math.round(stage.fraction * 100) : undefined}
        aria-label={stage.state === "queued" ? stage.label : stage.runningLabel}
        className="relative h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        {counts || stage.isDeterminate ? (
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${(counts ? counts.done / counts.total : stage.fraction) * 100}%`, background: stage.hex }}
          />
        ) : (
          <div
            className="absolute inset-y-0 left-0 w-2/5 rounded-full motion-safe:animate-indeterminate"
            style={{ background: stage.hex }}
          />
        )}
      </div>
      {outcome && <p className="text-[11px] leading-relaxed text-muted-foreground">{outcome}</p>}
    </div>
  )
}

export interface PendingPageCardProps {
  index: number
  hex: string
  arrived?: boolean
  label?: string
  pageId?: string
  pageNumber?: number
  textPreview?: boolean
  aspect?: number
  numbered?: boolean
}

export function PendingPageCard({ index, hex, arrived = false, label, pageId, pageNumber, textPreview = false, aspect = 3 / 4, numbered = true }: PendingPageCardProps) {
  const number = pageNumber ?? index + 1
  const { t } = useLingui()
  return (
    <div
      aria-hidden={!arrived || undefined}
      className="flex flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] duration-500"
      style={arrived ? { borderColor: tint(hex, 0.45), boxShadow: `0 0 0 3px ${tint(hex, 0.1)}` } : undefined}
    >
      <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: aspect }}>
        {label && pageId && (
          <PageThumb
            label={label}
            pageId={pageId}
            sectionIndex={null}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-700",
              arrived ? "opacity-100 grayscale-0" : "opacity-45 grayscale",
            )}
          />
        )}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-500",
            arrived ? "opacity-100" : "opacity-0",
          )}
          style={{ background: `linear-gradient(160deg, ${tint(hex, 0.16)}, ${tint(hex, 0.04)})` }}
        />
        {!arrived && (
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent motion-safe:animate-shimmer dark:via-white/10" />
        )}
        {!pageId && (
          <div className="absolute inset-x-4 top-5 flex flex-col gap-1.5">
            <div className="h-2 w-3/5 rounded bg-muted-foreground/15" />
            <div className="h-1.5 w-full rounded bg-muted-foreground/10" />
            <div className="h-1.5 w-5/6 rounded bg-muted-foreground/10" />
          </div>
        )}
        {arrived && (
          <span
            className="absolute right-2 top-2 grid size-5 place-items-center rounded-full text-white animate-in zoom-in-50 fade-in duration-300"
            style={{ background: hex }}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      {textPreview ? (
        <div className="flex flex-col gap-0.5 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            {numbered ? (
              <span className="text-[12px] font-medium text-muted-foreground">
                <Trans>Page {number}</Trans>
              </span>
            ) : (
              <span className="h-2.5 w-12 rounded bg-muted-foreground/15" />
            )}
            <span className="h-1.5 w-8 rounded bg-muted-foreground/10" />
          </div>
          <div className="flex min-h-[2lh] flex-col justify-center gap-1.5 text-[11px] leading-relaxed">
            <span className="h-1.5 w-full rounded bg-muted-foreground/10" />
            <span className="h-1.5 w-2/3 rounded bg-muted-foreground/10" />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-3 py-2">
          {numbered ? (
            <span className="text-[12px] font-semibold text-muted-foreground">
              <Trans>Page {number}</Trans>
            </span>
          ) : (
            <span className="h-2.5 w-12 rounded bg-muted-foreground/15" />
          )}
          <span className="h-1.5 w-8 rounded bg-muted-foreground/10" />
        </div>
      )}
    </div>
  )
}

export interface LiveRunPanelProps {
  stage: RunStageActivity
  total: number
  outcome?: React.ReactNode
  label?: string
  pages?: ReadonlyArray<{ pageId: string; pageNumber: number; pageWidth?: number | null; pageHeight?: number | null }>
}

export function LiveRunPanel({ stage, total, outcome, label, pages }: LiveRunPanelProps) {
  const counts = progressCounts(stage)
  const count = pages?.length || counts?.total || total
  const arrived = counts?.done ?? (stage.fraction >= 1 ? count : 0)
  const aspect = usePageAspect(label ?? "", pages)
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 py-7 pb-40 animate-in fade-in duration-500">
      <LiveRunStrip stage={stage} outcome={outcome} />
      <div className={aspect.gridClass}>
        {Array.from({ length: Math.max(count, 1) }, (_, index) => (
          <PendingPageCard
            key={pages?.[index]?.pageId ?? index}
            index={index}
            hex={stage.hex}
            arrived={index < arrived}
            label={label}
            pageId={pages?.[index]?.pageId}
            pageNumber={pages?.[index]?.pageNumber}
            aspect={aspect.ratio}
          />
        ))}
      </div>
    </div>
  )
}

export function RunChecklist({ stage, outcome }: { stage: RunStageActivity; outcome?: React.ReactNode }) {
  const { t } = useLingui()
  const counts = progressCounts(stage)
  const fraction = counts ? counts.done / counts.total : stage.fraction
  const determinate = !!counts || stage.isDeterminate
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-5 py-10 pb-36 animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className="grid size-14 place-items-center rounded-2xl text-white"
          style={{ background: stage.hex, boxShadow: `0 14px 34px -16px ${stage.hex}` }}
        >
          <stage.icon className="size-6" strokeWidth={2.2} />
        </span>
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">{stage.state === "queued" ? stage.label : stage.runningLabel}</h2>
          {outcome && <p className="mx-auto mt-1 max-w-[400px] text-[12.5px] leading-relaxed text-muted-foreground">{outcome}</p>}
        </div>
      </div>
      <div
        className="overflow-hidden rounded-2xl border bg-card shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)]"
        style={{ borderColor: tint(stage.hex, 0.25) }}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={counts?.total ?? 100}
            aria-valuenow={counts ? counts.done : determinate ? Math.round(fraction * 100) : undefined}
            aria-label={stage.state === "queued" ? stage.label : stage.runningLabel}
            className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            {determinate ? (
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${fraction * 100}%`, background: stage.hex }}
              />
            ) : (
              <div className="absolute inset-y-0 left-0 w-2/5 rounded-full motion-safe:animate-indeterminate" style={{ background: stage.hex }} />
            )}
          </div>
          {counts && (
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
              {counts.done} / {counts.total}
            </span>
          )}
        </div>
        <ol className="flex flex-col p-1.5">
          {stage.steps.map((step) => {
            const done = step.state === "done" || step.state === "skipped"
            const running = step.state === "running"
            return (
              <li
                key={step.name}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors duration-300",
                  running && "bg-muted/70",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                    done ? "border-transparent text-white" : !running && "border-muted-foreground/30",
                  )}
                  style={done ? { background: stage.hex } : running ? { borderColor: tint(stage.hex, 0.5) } : undefined}
                >
                  {done ? (
                    <Check className="size-3 animate-in zoom-in-50 duration-300" strokeWidth={3} />
                  ) : running ? (
                    <Loader2 className="size-3 animate-spin motion-reduce:animate-none" style={{ color: stage.hex }} />
                  ) : null}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", running ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {step.label}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {done ? t`Done` : running ? (counts ? t`${counts.done} of ${counts.total}` : t`Running`) : t`Waiting`}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

export function RunStripOnly({ stage, outcome }: { stage: RunStageActivity; outcome?: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3 py-7 pb-40">
      <LiveRunStrip stage={stage} outcome={outcome} />
    </div>
  )
}
