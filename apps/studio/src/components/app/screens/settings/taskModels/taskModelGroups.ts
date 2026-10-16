import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"
import { STAGE_ORDER, STEP_TO_STAGE, type StageName, type TaskModelEntry } from "@adt/types"
import { getStageLabelI18n, getStepLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { getSectionTypeLabel } from "@/lib/section-constants"

const STANDALONE_TASK_LABELS: Record<string, MessageDescriptor> = {
  font_assignment: msg`Font Assignment`,
  styleguide_generation: msg`Styleguide Generation`,
}

const STRATEGY_LABELS: Record<string, MessageDescriptor> = {
  llm: msg`Web Rendering`,
  "llm-overlay": msg`Web Rendering (overlay)`,
}

const RENDERING_STAGE: StageName = STEP_TO_STAGE["web-rendering"]

export interface TaskModelGroup {
  stage: StageName
  label: string
  tasks: TaskModelEntry[]
}

export function taskModelLabel(task: TaskModelEntry, i18n: I18n): string {
  if (task.kind === "render-strategy") {
    const descriptor = STRATEGY_LABELS[task.configKey]
    if (descriptor) return i18n._(descriptor)
    return task.configKey.startsWith("activity_") ? getSectionTypeLabel(task.configKey) : task.configKey
  }
  if (task.step) return getStepLabelI18n(task.step)
  const descriptor = STANDALONE_TASK_LABELS[task.configKey]
  return descriptor ? i18n._(descriptor) : task.configKey
}

function stageOf(task: TaskModelEntry): StageName {
  return task.step ? STEP_TO_STAGE[task.step] : RENDERING_STAGE
}

export function groupTaskModels(tasks: TaskModelEntry[]): TaskModelGroup[] {
  return STAGE_ORDER.flatMap((stage) => {
    const stageTasks = tasks.filter((task) => stageOf(task) === stage)
    return stageTasks.length > 0
      ? [{ stage, label: getStageLabelI18n(stage), tasks: stageTasks }]
      : []
  })
}
