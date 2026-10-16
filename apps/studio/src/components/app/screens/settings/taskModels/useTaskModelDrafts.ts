import { useEffect, useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import {
  fitReasoningEffort,
  resolveInheritedTaskModel,
  type InheritedModelSource,
  type ReasoningEffort,
  type ReasoningEffortSupport,
  type TaskModelEntry,
} from "@adt/types"
import {
  checkModelModalitySupport,
  reasoningEffortSupportFor,
  type ModelModalitySupport,
} from "@/api/provider-credentials"
import { useProviderCredentials } from "@/hooks/use-provider-credentials"
import { normalizeQualifiedModelInput } from "@/lib/model-id"
import { groupTaskModels, taskModelLabel, type TaskModelGroup } from "./taskModelGroups"
import { useTaskModels, type TaskModelChange } from "./useTaskModels"

export type EffortDraft = ReasoningEffort | ""

export type EffortProblem = "unsupported-model" | "unsupported-effort" | null

export interface TaskEffortState {
  draft: EffortDraft
  support: ReasoningEffortSupport | null
  inherited: ReasoningEffort | undefined
  problem: EffortProblem
  isDirty: boolean
}

export interface TaskModelDrafts {
  tasks: TaskModelEntry[]
  groups: TaskModelGroup[]
  defaultModel: string
  draftOf: (id: string) => string
  inheritedOf: (id: string) => { model: string; source: InheritedModelSource }
  effectiveModelOf: (id: string) => string
  setDraft: (id: string, value: string) => void
  effortOf: (id: string) => TaskEffortState
  setEffort: (id: string, value: EffortDraft) => void
  defaultEffort: EffortDraft
  setDefaultEffort: (value: EffortDraft) => void
  isDefaultEffortDirty: boolean
  defaultModelEffortSupport: ReasoningEffortSupport | null
  labelOf: (task: TaskModelEntry) => string
  isCustom: (id: string) => boolean
  isDirty: (id: string) => boolean
  supportFor: (id: string) => ModelModalitySupport | null
  changes: TaskModelChange[]
  changeCount: number
  customCount: number
  hasUnsupported: boolean
  isLoading: boolean
  isError: boolean
  isSaving: boolean
  busy: boolean
  save: () => void
  discard: () => void
}

function savedModels(tasks: TaskModelEntry[]): Record<string, string> {
  return Object.fromEntries(tasks.map((task) => [task.id, task.model ?? ""]))
}

function savedEfforts(tasks: TaskModelEntry[]): Record<string, EffortDraft> {
  return Object.fromEntries(tasks.map((task) => [task.id, task.reasoningEffort ?? ""]))
}

export function useTaskModelDrafts(defaultModelDraft: string): TaskModelDrafts {
  const { i18n } = useLingui()
  const { providers } = useProviderCredentials()
  const taskModels = useTaskModels()
  const tasks = useMemo(() => taskModels.data?.tasks ?? [], [taskModels.data?.tasks])
  const savedDefaultEffort: EffortDraft = taskModels.data?.defaultReasoningEffort ?? ""
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [effortDrafts, setEffortDrafts] = useState<Record<string, EffortDraft>>({})
  const [defaultEffort, setDefaultEffort] = useState<EffortDraft>("")

  useEffect(() => {
    setDrafts(savedModels(tasks))
    setEffortDrafts(savedEfforts(tasks))
  }, [tasks])

  useEffect(() => {
    setDefaultEffort(savedDefaultEffort)
  }, [savedDefaultEffort])

  const groups = useMemo(() => groupTaskModels(tasks), [tasks])
  const defaultModel = normalizeQualifiedModelInput(defaultModelDraft) || taskModels.data?.defaultModel || ""
  const normalized = (id: string) => normalizeQualifiedModelInput(drafts[id] ?? "")
  const taskOf = (id: string) => tasks.find((task) => task.id === id)
  const inheritedOf = (id: string) => {
    const task = taskOf(id)
    return task
      ? resolveInheritedTaskModel(task, (sourceId) => normalized(sourceId) || null, defaultModel)
      : { model: defaultModel, source: { kind: "default" } as InheritedModelSource }
  }
  const effectiveModelOf = (id: string) => normalized(id) || inheritedOf(id).model
  const isModelDirty = (id: string) => normalized(id) !== (taskOf(id)?.model ?? "")
  const isEffortDirty = (id: string) => (effortDrafts[id] ?? "") !== (taskOf(id)?.reasoningEffort ?? "")
  const isDirty = (id: string) => isModelDirty(id) || isEffortDirty(id)
  const supportFor = (id: string) => {
    const model = normalized(id)
    return providers.length > 0 && model
      ? checkModelModalitySupport(providers, model, "structured-text")
      : null
  }

  const effortOf = (id: string): TaskEffortState => {
    const draft = effortDrafts[id] ?? ""
    const support = providers.length > 0 ? reasoningEffortSupportFor(providers, effectiveModelOf(id)) : null
    const inherited = fitReasoningEffort(support, defaultEffort || undefined) ?? support?.default
    const problem: EffortProblem =
      !draft || providers.length === 0
        ? null
        : !support
          ? "unsupported-model"
          : support.efforts.includes(draft)
            ? null
            : "unsupported-effort"
    return { draft, support, inherited, problem, isDirty: isEffortDirty(id) }
  }

  const changes = tasks
    .filter((task) => isDirty(task.id))
    .map((task): TaskModelChange => ({
      id: task.id,
      ...(isModelDirty(task.id) ? { model: normalized(task.id) || null } : {}),
      ...(isEffortDirty(task.id) ? { reasoningEffort: effortDrafts[task.id] || null } : {}),
    }))
  const isDefaultEffortDirty = defaultEffort !== savedDefaultEffort

  return {
    tasks,
    groups,
    defaultModel,
    draftOf: (id) => drafts[id] ?? "",
    inheritedOf,
    effectiveModelOf,
    setDraft: (id, value) => setDrafts((current) => ({ ...current, [id]: value })),
    effortOf,
    setEffort: (id, value) => setEffortDrafts((current) => ({ ...current, [id]: value })),
    defaultEffort,
    setDefaultEffort,
    isDefaultEffortDirty,
    defaultModelEffortSupport: providers.length > 0 ? reasoningEffortSupportFor(providers, defaultModel) : null,
    labelOf: (task) => taskModelLabel(task, i18n),
    isCustom: (id) => normalized(id).length > 0,
    isDirty,
    supportFor,
    changes,
    changeCount: changes.length + Number(isDefaultEffortDirty),
    customCount: tasks.filter((task) => normalized(task.id).length > 0).length,
    hasUnsupported: tasks.some((task) => supportFor(task.id)?.ok === false || effortOf(task.id).problem !== null),
    isLoading: taskModels.isLoading,
    isError: taskModels.isError,
    isSaving: taskModels.isSaving,
    busy: taskModels.isLoading || taskModels.isSaving,
    save: () =>
      taskModels.save({
        changes,
        ...(isDefaultEffortDirty ? { defaultReasoningEffort: defaultEffort || null } : {}),
      }),
    discard: () => {
      setDrafts(savedModels(tasks))
      setEffortDrafts(savedEfforts(tasks))
      setDefaultEffort(savedDefaultEffort)
    },
  }
}
