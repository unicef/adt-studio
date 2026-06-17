import { type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowRight, Check, Loader2, Minus, Play, RotateCcw, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PIPELINE } from "@adt/types"
import type { StageName } from "@adt/types"
import { STAGES } from "../stage-config"
import {
  getStageLabelI18n,
  getStageRunningLabelI18n,
  getStageDescriptionI18n,
  getStepLabelI18n,
} from "../pipeline-i18n"
import { useBookRun } from "@/hooks/use-book-run"
import { useLingui } from "@lingui/react/macro"

export interface StageSubStep {
  key: string
  label: string
}

/** Sub-steps for each stage, derived from the shared PIPELINE definition */
export const STAGE_SUB_STEPS: Record<StageName, StageSubStep[]> = Object.fromEntries(
  PIPELINE.map((stage) => [stage.name, stage.steps.map((s) => ({
    key: s.name,
    label: s.label,
  }))])
) as Record<StageName, StageSubStep[]>

interface StageRunCardProps {
  stageSlug: string
  isRunning: boolean
  completed?: boolean
  showRunButton?: boolean
  /** When provided, render a prominent "Go to {stage}" navigation button. */
  bookLabel?: string
  onRun: () => void
  disabled: boolean
  children?: ReactNode
}

const HOVER_BG_BY_COLOR: Record<string, string> = {
  "bg-gray-600": "hover:bg-gray-600",
  "bg-blue-600": "hover:bg-blue-600",
  "bg-violet-600": "hover:bg-violet-600",
  "bg-orange-600": "hover:bg-orange-600",
  "bg-teal-600": "hover:bg-teal-600",
  "bg-lime-600": "hover:bg-lime-600",
  "bg-cyan-600": "hover:bg-cyan-600",
  "bg-pink-600": "hover:bg-pink-600",
  "bg-rose-600": "hover:bg-rose-600",
  "bg-amber-600": "hover:bg-amber-600",
}

export function StageRunCard({
  stageSlug,
  isRunning,
  completed,
  showRunButton = true,
  bookLabel,
  onRun,
  disabled,
  children,
}: StageRunCardProps) {
  const { t } = useLingui()
  const stage = STAGES.find((s) => s.slug === stageSlug) ?? STAGES[0]
  const { stageState, stepState, stepProgress, stepError, error } = useBookRun()
  const stageStatus = stageState(stageSlug)
  const subSteps = STAGE_SUB_STEPS[stageSlug as StageName] ?? []
  const Icon = stage.icon
  const color = stage.color
  const borderColor = stage.borderDark
  const hasError = stageStatus === "error"
  const isCompleted = completed ?? (stageStatus === "done")
  const hasSubSteps = subSteps.length > 0
  const hoverColorClass = HOVER_BG_BY_COLOR[color] ?? "hover:bg-gray-600"
  const buttonToneClass = hasError
    ? "bg-red-600 text-white hover:bg-red-700 hover:text-white"
    : isCompleted
      ? cn(color, "text-white", hoverColorClass, "hover:text-white")
      : cn("bg-gray-200 text-gray-700", hoverColorClass, "hover:text-white")

  const stageLabel = getStageLabelI18n(stageSlug)
  const activeProgress = subSteps
    .map(({ key }) => {
      const progress = stepProgress(key)
      const hasPages = progress?.page != null && progress?.totalPages != null && progress.totalPages > 0
      const numericProgressLabel = hasPages ? `${progress.page}/${progress.totalPages}` : null
      const progressLabel = progress?.message?.trim() || numericProgressLabel
      const state = stepState(key)
      return progressLabel && state === "running"
        ? { key, stepLabel: getStepLabelI18n(key), progressLabel }
        : null
    })
    .find((item) => item !== null)

  return (
    <Card className={cn("overflow-hidden max-w-xl shadow-none", borderColor)}>
      {/* Colored header */}
      <CardHeader className={cn("flex-row items-center gap-2.5 space-y-0 px-4 py-2 text-white", color)}>
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
          <Icon className="w-3 h-3" />
        </div>
        <CardTitle className="text-sm leading-normal tracking-normal">
          {isRunning
            ? getStageRunningLabelI18n(stageSlug)
            : stageLabel}
        </CardTitle>
      </CardHeader>

      {/* Main row: sub-steps | button | description */}
      <CardContent
        className={cn(
          "flex items-center px-5 py-3",
          showRunButton || hasSubSteps ? "gap-5" : "justify-center"
        )}
      >
        {/* Sub-steps */}
        {hasSubSteps && (
          <div className="space-y-1.5 w-48 shrink-0">
            {subSteps.map(({ key }) => {
              const state = stepState(key)
              const progress = stepProgress(key)
              const errorMsg = stepError(key)
              const isDone = state === "done"
              const isSkipped = state === "skipped"
              const isError = state === "error"
              const hasPages = progress?.page != null && progress?.totalPages != null && progress.totalPages > 0
              const numericProgressLabel = hasPages ? `${progress.page}/${progress.totalPages}` : null
              const messageProgressLabel = progress?.message?.trim()
              const progressLabel = messageProgressLabel || numericProgressLabel
              const isSubRunning = state === "running"
              const showInlineProgress = Boolean(
                isSubRunning &&
                progressLabel &&
                (!messageProgressLabel || messageProgressLabel === numericProgressLabel)
              )
              const showDetailProgress = Boolean(
                isSubRunning &&
                progressLabel &&
                !showInlineProgress
              )

              return (
                <div key={key}>
                  <div
                    className={cn(
                      "flex items-center gap-2.5 text-xs whitespace-nowrap min-w-0",
                      isDone
                        ? "text-muted-foreground"
                        : isSkipped
                          ? "text-muted-foreground/40"
                          : isError
                            ? "text-red-500"
                            : isSubRunning
                              ? "text-foreground"
                              : "text-muted-foreground/50",
                    )}
                  >
                    {isDone ? (
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                    ) : isSkipped ? (
                      <Minus
                        className="w-4 h-4 text-muted-foreground/40 shrink-0"
                        strokeWidth={2}
                        aria-label={t`Disabled`}
                      />
                    ) : isError ? (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : isSubRunning ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-current opacity-30 shrink-0" />
                    )}
                    <span className={cn("min-w-0 truncate", isSkipped && "line-through decoration-muted-foreground/30")}>
                      {getStepLabelI18n(key)}
                    </span>
                    {showInlineProgress && (
                      <span className="text-muted-foreground tabular-nums shrink-0">{progressLabel}</span>
                    )}
                  </div>
                  {showDetailProgress && (
                    <p className="text-[10px] text-muted-foreground pl-6 truncate" title={progressLabel ?? undefined}>
                      {progressLabel}
                    </p>
                  )}
                  {isError && errorMsg && (
                    <p className="text-[10px] text-red-400 pl-6 truncate" title={errorMsg}>{errorMsg}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Play / Retry / Spinner button */}
        {showRunButton && (
          <div className="shrink-0">
            {isRunning ? (
              <div
                onClick={(e) => { e.stopPropagation(); e.preventDefault() }}
                className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full opacity-60 cursor-default",
                color, "text-white",
              )}>
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "w-12 h-12 rounded-full transition-all cursor-pointer [&_svg]:size-5",
                  "hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-default disabled:hover:scale-100",
                  buttonToneClass,
                )}
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRun() }}
                title={
                  hasError
                    ? t`Retry`
                    : isCompleted
                      ? t`Re-run ${stageLabel}`
                      : t`Run ${stageLabel}`
                }
              >
                {hasError || isCompleted ? <RotateCcw className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </Button>
            )}
          </div>
        )}

        {/* Description */}
        {getStageDescriptionI18n(stageSlug) && (
          <div
            className={cn(
              "min-w-0 text-xs leading-relaxed",
              showRunButton || hasSubSteps ? "flex-1" : "max-w-md text-center"
            )}
          >
            <p className="text-muted-foreground">
              {getStageDescriptionI18n(stageSlug)}
            </p>
            {activeProgress && (
              <p className="mt-1 font-medium text-foreground tabular-nums truncate" title={activeProgress.progressLabel}>
                {activeProgress.stepLabel}: {activeProgress.progressLabel}
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* "Go to {stage}" navigation button — outlined by default, illuminated once complete */}
      {bookLabel && (
        <div className="px-5 pb-4 pt-0">
          <Link
            to="/books/$label/$step"
            params={{ label: bookLabel, step: stageSlug }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors",
              isCompleted
                ? cn(color, "border-transparent text-white hover:opacity-90")
                : cn(
                    "border-input bg-white text-foreground",
                    "hover:bg-muted/60 hover:border-muted-foreground/40",
                  ),
            )}
          >
            {t`Go to ${stageLabel}`}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Injected config content */}
      {children && (
        <CardContent className="px-5 pb-4 pt-3 mt-0 border-t border-border/50 bg-muted/30">
          {children}
        </CardContent>
      )}

      {/* Error footer */}
      {hasError && (
        <CardFooter className="px-5 pb-5 -mt-1">
          <Alert variant="destructive" className="rounded-md px-3 py-2">
            <AlertDescription className="text-xs whitespace-pre-wrap break-words">
              {error}
            </AlertDescription>
          </Alert>
        </CardFooter>
      )}
    </Card>
  )
}
