import { Check, Minus, XCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBookRun } from "@/hooks/use-book-run"
import { getStepLabelI18n } from "../pipeline-i18n"

export function RunProgress({
  stepKey,
  spinnerColorClass = "text-blue-500",
}: {
  stepKey: string
  spinnerColorClass?: string
}) {
  const { stepState, stepProgress, stepError } = useBookRun()
  const state = stepState(stepKey)
  const progress = stepProgress(stepKey)
  const errorMsg = stepError(stepKey)
  const isDone = state === "done"
  const isRunning = state === "running"
  const isError = state === "error"
  const isSkipped = state === "skipped"
  const hasPages =
    isRunning && progress?.page != null && progress?.totalPages != null && progress.totalPages > 0
  const numericProgressLabel = hasPages ? `${progress?.page}/${progress?.totalPages}` : null
  const progressLabel = progress?.message?.trim() || numericProgressLabel

  return (
    <div className="w-full max-w-sm">
      <div
        className={cn(
          "flex items-center gap-2.5 text-xs px-4 py-3 rounded-xl border bg-white",
          isError ? "border-red-200 bg-red-50" : "border-[#e5e5e5]"
        )}
      >
        {isDone ? (
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
        ) : isSkipped ? (
          <Minus className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={3} />
        ) : isError ? (
          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
        ) : isRunning ? (
          <Loader2 className={cn("w-4 h-4 animate-spin shrink-0", spinnerColorClass)} />
        ) : (
          <div className="w-4 h-4 rounded-full border border-current opacity-30 shrink-0" />
        )}
        <span
          className={cn(
            "flex-1 font-medium",
            isError ? "text-red-600" : isRunning ? "text-[#0a0a0a]" : "text-[#737373]"
          )}
        >
          {getStepLabelI18n(stepKey)}
        </span>
        {isRunning && progressLabel && (
          <span className="max-w-36 truncate text-[#737373] tabular-nums" title={progressLabel}>
            {progressLabel}
          </span>
        )}
      </div>
      {isError && errorMsg && (
        <p className="text-[10px] text-red-500 px-1 pt-1 truncate" title={errorMsg}>
          {errorMsg}
        </p>
      )}
    </div>
  )
}
