import { useCallback, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { LucideIcon } from "lucide-react"
import type { TaskInfoResponse } from "@/api/client"
import { getStageLabelI18n, getStageRunningLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useStageActivity, type RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { usePackageAdt } from "@/hooks/use-books"
import { describePackagingWarnings, readPackagingWarnings } from "@/lib/packaging-warnings"

export interface ValidationRun {
  activity: RunStageActivity
  active: boolean
  error: string | null
  warning: string | null
  run: () => void
}

const PACKAGE_TASK = "package-adt"

function latestPackageTask(tasks: readonly TaskInfoResponse[]): TaskInfoResponse | undefined {
  return tasks
    .filter((task) => task.kind === PACKAGE_TASK)
    .reduce<TaskInfoResponse | undefined>((latest, task) => (!latest || (task.startedAt ?? 0) >= (latest.startedAt ?? 0) ? task : latest), undefined)
}

function taskActivity(base: RunStageActivity, task: TaskInfoResponse | undefined): RunStageActivity {
  const percent = task?.progressPercent
  const fraction = percent != null ? Math.min(1, Math.max(0, percent / 100)) : undefined
  const steps = base.steps.map((step, index) => ({
    ...step,
    state: index === 0 ? ("running" as const) : ("idle" as const),
    progress: index === 0 ? task?.progressMessage : undefined,
    fraction: index === 0 ? fraction : undefined,
    error: undefined,
  }))
  return {
    ...base,
    state: task?.status === "queued" ? "queued" : "running",
    isActive: true,
    steps,
    runningCount: 1,
    doneCount: 0,
    fraction: fraction ?? 0,
    isDeterminate: fraction != null,
    current: steps[0],
  }
}

export function useValidationRun(label: string, visual: { hex: string; icon: LucideIcon }): ValidationRun {
  const { t, i18n } = useLingui()
  const packageAdt = usePackageAdt()
  const { tasks } = useBookTasks(label)
  const pipeline = useStageActivity("package")
  const submittedId = packageAdt.data?.taskId
  const submitted = submittedId ? tasks.find((entry) => entry.taskId === submittedId) : undefined
  const task = submitted ?? latestPackageTask(tasks)
  const taskRunning = task?.status === "running" || task?.status === "queued"
  const awaiting = !!submittedId && !submitted
  const active = pipeline.isActive || packageAdt.isPending || awaiting || taskRunning

  const activity = useMemo(() => {
    const base: RunStageActivity = {
      ...pipeline,
      label: getStageLabelI18n("validation"),
      runningLabel: getStageRunningLabelI18n("validation"),
      hex: visual.hex,
      icon: visual.icon,
    }
    if (pipeline.isActive) return base
    if (active) return taskActivity(base, taskRunning ? task : undefined)
    return base
  }, [pipeline, visual.hex, visual.icon, active, taskRunning, task])

  const inline = packageAdt.data && !packageAdt.data.taskId ? packageAdt.data : null
  const error = active
    ? null
    : packageAdt.isError
      ? packageAdt.error.message || t`Packaging failed`
      : !inline && task?.status === "failed"
        ? task.error || t`Packaging failed`
        : null
  const warningSource = inline ?? (task?.status === "completed" ? task.result : null)
  const warning = active || error ? null : describePackagingWarnings(readPackagingWarnings(warningSource), i18n)

  const mutate = packageAdt.mutate
  const run = useCallback(() => mutate(label), [mutate, label])

  return { activity, active, error, warning, run }
}
