import { Check, Loader2, Play, RotateCcw, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PIPELINE } from "@adt/types"
import type { StageName } from "@adt/types"
import { STAGES } from "./stage-config"
import { useStepRun } from "@/hooks/use-step-run"

export interface StageSubStep {
  key: string
  label: string
}

/** Sub-steps for each stage, derived from the shared PIPELINE definition */
export const STAGE_SUB_STEPS: Record<StageName, StageSubStep[]> = Object.fromEntries(
  PIPELINE.map((stage) => [stage.name, stage.steps.map((s) => ({ key: s.name, label: s.label }))])
) as Record<StageName, StageSubStep[]>

interface StageRunCardProps {
  stageSlug: string
  description?: string
  isRunning: boolean
  completed?: boolean
  showRunButton?: boolean
  onRun: () => void
  disabled: boolean
}

const HOVER_BG_BY_COLOR: Record<string, string> = {
  "bg-gray-500": "hover:bg-gray-500",
  "bg-blue-500": "hover:bg-blue-500",
  "bg-violet-500": "hover:bg-violet-500",
  "bg-orange-500": "hover:bg-orange-500",
  "bg-teal-500": "hover:bg-teal-500",
  "bg-lime-500": "hover:bg-lime-500",
  "bg-pink-500": "hover:bg-pink-500",
  "bg-amber-500": "hover:bg-amber-500",
}

export function StageRunCard({
  stageSlug,
  description,
  isRunning,
  completed,
  showRunButton = true,
  onRun,
  disabled,
}: StageRunCardProps) {
  const stepConfig = STAGES.find((s) => s.slug === stageSlug)
  const { progress } = useStepRun()
  const { subSteps: subStepProgress, error, targetSteps } = progress

  const subSteps = STAGE_SUB_STEPS[stageSlug as StageName] ?? []
  const Icon = stepConfig?.icon ?? Play
  const bgDark = stepConfig?.bgDark ?? "bg-gray-700"
  const color = stepConfig?.color ?? "bg-gray-500"
  const borderColor = stepConfig?.borderColor ?? "border-gray-200"
  const hasError = !!error && targetSteps.has(stageSlug)
  const isCompleted = completed || progress.steps.get(stageSlug)?.state === "done"
  const hasSubSteps = subSteps.length > 0
  const hoverColorClass = HOVER_BG_BY_COLOR[color] ?? "hover:bg-gray-500"
  const buttonToneClass = isCompleted
    ? cn(color, "text-white", hoverColorClass, "hover:text-white")
    : cn("bg-gray-200 text-gray-700", hoverColorClass, "hover:text-white")

  return (
    <Card className={cn("overflow-hidden max-w-xl shadow-none", borderColor)}>
      {/* Colored header */}
      <CardHeader className={cn("flex-row items-center gap-2.5 space-y-0 px-4 py-2 text-white", bgDark)}>
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
          <Icon className="w-3 h-3" />
        </div>
        <CardTitle className="text-sm leading-normal tracking-normal">
          {isRunning
            ? `${stepConfig?.runningLabel ?? stageSlug}...`
            : stepConfig?.label ?? stageSlug}
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
            {subSteps.map(({ key, label }) => {
              const sub = subStepProgress.get(key)
              const isDone = sub?.state === "done" || (completed && !sub)
              const isSubRunning = sub?.state === "running"
              const isError = sub?.state === "error"
              const hasPages = sub?.page != null && sub?.totalPages != null && sub.totalPages > 0

              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center gap-2.5 text-xs whitespace-nowrap",
                    isDone ? "text-muted-foreground" : isError ? "text-red-500" : isSubRunning ? "text-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {isDone ? (
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                  ) : isError ? (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  ) : isSubRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-current opacity-30 shrink-0" />
                  )}
                  <span>{label}</span>
                  {isSubRunning && hasPages && (
                    <span className="text-muted-foreground tabular-nums">{sub.page}/{sub.totalPages}</span>
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
              <div className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full opacity-60",
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
                    ? "Retry"
                    : isCompleted
                      ? `Re-run ${stepConfig?.label?.toLowerCase() ?? stageSlug}`
                      : `Run ${stepConfig?.label?.toLowerCase() ?? stageSlug}`
                }
              >
                {hasError || isCompleted ? <RotateCcw className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </Button>
            )}
          </div>
        )}

        {/* Description */}
        {description && (
          <p
            className={cn(
              "min-w-0 text-xs text-muted-foreground leading-relaxed",
              showRunButton || hasSubSteps ? "flex-1" : "max-w-md text-center"
            )}
          >
            {description}
          </p>
        )}
      </CardContent>

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
