import { Loader2, RotateCcw, TriangleAlert, X } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import type { ExtractRun } from "@/components/app/screens/pipeline/runs/useExtractRun"

function BannerAction({
  onClick,
  disabled,
  tone,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  tone: "amber" | "red"
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold",
        "transition-colors disabled:pointer-events-none disabled:opacity-60",
        tone === "amber" &&
          "border-amber-300 bg-white/70 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/50",
        tone === "red" &&
          "border-red-300 bg-white/70 text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-950/40",
      )}
    >
      {children}
    </button>
  )
}

export function ExtractRunBanner({ run }: { run: ExtractRun }) {
  const extract = useStageActivity("extract")
  const activity = useRunActivity()

  if (extract.isActive) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-[12px]">
        <Loader2
          className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          style={{ color: extract.hex }}
        />
        <span className="min-w-0 flex-1 truncate">
          {extract.current ? (
            <>
              <span className="font-medium">{extract.current.label}</span>
              {extract.current.progress && (
                <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                  {extract.current.progress}
                </span>
              )}
            </>
          ) : (
            extract.runningLabel
          )}
        </span>
        <BannerAction onClick={activity.cancelRun} disabled={activity.isCancelling} tone="red">
          {activity.isCancelling ? (
            <>
              <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
              <Trans>Cancelling…</Trans>
            </>
          ) : (
            <>
              <X className="size-3" />
              <Trans>Cancel</Trans>
            </>
          )}
        </BannerAction>
      </div>
    )
  }

  if (run.hasError) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            <Trans>Extraction failed.</Trans>
          </p>
          <p className="mt-0.5 leading-relaxed">
            {activity.error ?? <Trans>Something went wrong while extracting the PDF.</Trans>}
          </p>
        </div>
        <BannerAction onClick={run.run} disabled={!run.canRun} tone="red">
          <RotateCcw className="size-3" />
          <Trans>Retry</Trans>
        </BannerAction>
      </div>
    )
  }

  if (run.isInterrupted) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            <Trans>Extraction was interrupted.</Trans>
          </p>
          <p className="mt-0.5 leading-relaxed">
            <Trans>Some steps didn't finish — resume the run to complete this stage.</Trans>
          </p>
        </div>
        <BannerAction onClick={run.run} disabled={!run.canRun} tone="amber">
          <RotateCcw className="size-3" />
          <Trans>Resume</Trans>
        </BannerAction>
      </div>
    )
  }

  return null
}
