import { useEffect, useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { TaskModelEntry } from "@adt/types"
import { checkModelModalitySupport, type ModelModalitySupport } from "@/api/provider-credentials"
import { useProviderCredentials } from "@/hooks/use-provider-credentials"
import { normalizeQualifiedModelInput } from "@/lib/model-id"
import { groupTaskModels, taskModelLabel, type TaskModelGroup } from "./taskModelGroups"
import { useTaskModels, type TaskModelChange } from "./useTaskModels"

export interface TaskModelDrafts {
  tasks: TaskModelEntry[]
  groups: TaskModelGroup[]
  defaultModel: string
  draftOf: (id: string) => string
  setDraft: (id: string, value: string) => void
  labelOf: (task: TaskModelEntry) => string
  isCustom: (id: string) => boolean
  isDirty: (id: string) => boolean
  supportFor: (id: string) => ModelModalitySupport | null
  changes: TaskModelChange[]
  customCount: number
  hasUnsupported: boolean
  isLoading: boolean
  isError: boolean
  isSaving: boolean
  busy: boolean
  save: () => void
  discard: () => void
}

function savedDrafts(tasks: TaskModelEntry[]): Record<string, string> {
  return Object.fromEntries(tasks.map((task) => [task.id, task.model ?? ""]))
}

export function useTaskModelDrafts(): TaskModelDrafts {
  const { i18n } = useLingui()
  const { providers } = useProviderCredentials()
  const taskModels = useTaskModels()
  const tasks = useMemo(() => taskModels.data?.tasks ?? [], [taskModels.data?.tasks])
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    setDrafts(savedDrafts(tasks))
  }, [tasks])

  const groups = useMemo(() => groupTaskModels(tasks), [tasks])
  const normalized = (id: string) => normalizeQualifiedModelInput(drafts[id] ?? "")
  const savedOf = (id: string) => tasks.find((task) => task.id === id)?.model ?? ""
  const isDirty = (id: string) => normalized(id) !== savedOf(id)
  const supportFor = (id: string) => {
    const model = normalized(id)
    return providers.length > 0 && model
      ? checkModelModalitySupport(providers, model, "structured-text")
      : null
  }
  const changes = tasks
    .filter((task) => isDirty(task.id))
    .map((task) => ({ id: task.id, model: normalized(task.id) || null }))

  return {
    tasks,
    groups,
    defaultModel: taskModels.data?.defaultModel ?? "",
    draftOf: (id) => drafts[id] ?? "",
    setDraft: (id, value) => setDrafts((current) => ({ ...current, [id]: value })),
    labelOf: (task) => taskModelLabel(task, i18n),
    isCustom: (id) => normalized(id).length > 0,
    isDirty,
    supportFor,
    changes,
    customCount: tasks.filter((task) => normalized(task.id).length > 0).length,
    hasUnsupported: tasks.some((task) => supportFor(task.id)?.ok === false),
    isLoading: taskModels.isLoading,
    isError: taskModels.isError,
    isSaving: taskModels.isSaving,
    busy: taskModels.isLoading || taskModels.isSaving,
    save: () => taskModels.save(changes),
    discard: () => setDrafts(savedDrafts(tasks)),
  }
}
