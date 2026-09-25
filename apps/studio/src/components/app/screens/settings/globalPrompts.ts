import { useEffectiveBasePromptModel } from "@/hooks/use-effective-base-prompt-model"
import { useEffect, useMemo, useRef, useState } from "react"
import { useIsFetching, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, ApiError } from "@/api/client"
import type { PromptResponse } from "@/api/client"
import { LLM_MODEL_GROUPS, type ModelGroup } from "@/components/pipeline/components/ModelSelect"
import {
  promptModelForSelectedModel,
  promptNameForSelectedModel,
} from "@/components/pipeline/components/PromptViewer/promptModel"
import {
  DEFAULT_MODEL,
  isDefaultPromptModelId,
  mergePromptModelGroups,
  modelIdsFromGroups,
  normalizePromptModelInput,
  promptFileNameForModel,
  promptTreeKey,
  updatePromptCaches,
} from "@/components/pipeline/stages/book/GlobalPromptsSettings/promptSettings"
import { toast } from "@/components/ui/sonner"

export { DEFAULT_MODEL }

type PromptSummary = {
  name: string
  variants: string[]
  variantSources?: Record<string, "file" | "version" | "file+version">
}

export interface GlobalPromptsController {
  promptSummaries: PromptSummary[]
  promptModels: string[]
  modelGroups: ModelGroup[]
  defaultModelId: string
  selectedPrompt: string
  model: string
  promptModelId: string | null
  treeFilter: string
  setTreeFilter: (value: string) => void
  isDiffOpen: boolean
  toggleDiff: () => void
  promptState: PromptResponse | undefined
  revision: string
  conflict: boolean
  reloadLatest: () => void
  keepDraft: () => void
  promptContent: string | undefined
  currentContent: string
  displayContent: string
  activePromptLabel: string
  selectedTreeKey: string
  deletingTreeKey: string | null
  deletingModelId: string | null
  isUsingFallback: boolean
  isEditedGlobalVersion: boolean
  isDirty: boolean
  hasResettableVersion: boolean
  isPromptFilesLoading: boolean
  isPromptEditorLoading: boolean
  isSavingPrompt: boolean
  isChangingSelection: boolean
  setDraft: (value: string) => void
  discardDraft: () => void
  selectPromptFile: (promptName: string, modelId: string) => void
  selectModel: (modelId: string) => void
  createPromptFromTemplate: (
    promptName: string,
    sourceModelId: string,
    targetModelId: string,
  ) => Promise<void>
  deletePrompt: (promptName: string, modelId: string) => Promise<unknown>
  deleteModel: (modelId: string, promptNames: string[]) => Promise<unknown>
  handleCurrentVersionChanged: (
    promptName: string,
    modelId: string | null,
    prompt: PromptResponse,
  ) => Promise<void>
  save: () => Promise<void>
  reset: () => void
}

type DeletePromptVariables = {
  promptName: string
  modelId: string
  draft: string | null
}

type DeleteModelVariables = {
  modelId: string
  promptNames: string[]
  draft: string | null
}

export function useGlobalPrompts(): GlobalPromptsController {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [selectedPrompt, setSelectedPrompt] = useState("")
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [treeFilter, setTreeFilter] = useState("")
  const [draft, setDraft] = useState<string | null>(null)
  const draftRevision = useRef<string | null>(null)
  const [, refreshRevision] = useState(0)
  const basePromptModel = useEffectiveBasePromptModel()
  const loadingBaseModel = useIsFetching({ queryKey: ["global-config"] }) > 0
  const [isDiffOpen, setIsDiffOpen] = useState(false)
  const defaultModelInitializedRef = useRef(false)
  const currentSelectionRef = useRef<{ promptName: string; modelId: string | null }>({
    promptName: "",
    modelId: null,
  })

  const promptListQuery = useQuery({
    queryKey: ["prompts"],
    queryFn: api.listPrompts,
  })
  const promptSummaries = useMemo(
    () => promptListQuery.data?.prompts ?? [],
    [promptListQuery.data],
  )

  const promptModelsQuery = useQuery({
    queryKey: ["prompt-models"],
    queryFn: api.listPromptModels,
  })
  const promptModels = useMemo(
    () => promptModelsQuery.data?.models ?? [],
    [promptModelsQuery.data],
  )

  const defaultModelQuery = useQuery({
    queryKey: ["default-model"],
    queryFn: api.getDefaultModel,
  })
  const defaultModelId = defaultModelQuery.data?.model ?? DEFAULT_MODEL

  const modelGroups = useMemo(
    () => mergePromptModelGroups(LLM_MODEL_GROUPS, [...promptModels, defaultModelId]),
    [defaultModelId, promptModels],
  )
  const staticModelIds = useMemo(() => new Set(modelIdsFromGroups(LLM_MODEL_GROUPS)), [])

  useEffect(() => {
    if (defaultModelQuery.data?.model && !defaultModelInitializedRef.current) {
      defaultModelInitializedRef.current = true
      if (model === DEFAULT_MODEL) setModel(defaultModelQuery.data.model)
    }
  }, [defaultModelQuery.data?.model, model])

  useEffect(() => {
    if (!selectedPrompt && promptSummaries.length > 0) {
      setSelectedPrompt(promptSummaries[0].name)
    }
  }, [promptSummaries, selectedPrompt])

  const promptModelId = promptModelForSelectedModel(model, basePromptModel)
  useEffect(() => {
    currentSelectionRef.current = { promptName: selectedPrompt, modelId: promptModelId }
  }, [selectedPrompt, promptModelId])

  const promptQuery = useQuery({
    queryKey: ["prompts", selectedPrompt, undefined, promptModelId],
    queryFn: () => api.getPrompt(selectedPrompt, undefined, promptModelId),
    enabled: selectedPrompt.length > 0,
  })

  useEffect(() => {
    setDraft(null)
    draftRevision.current = null
  }, [model, selectedPrompt])

  const currentContent = promptQuery.data?.content ?? ""
  const displayContent = draft ?? currentContent
  const expectedModelPromptName = promptModelId
    ? promptNameForSelectedModel(selectedPrompt, promptModelId, basePromptModel)
    : null
  const isUsingFallback = Boolean(
    promptModelId &&
      promptQuery.data?.content != null &&
      promptQuery.data.resolvedName !== expectedModelPromptName,
  )
  const isEditedGlobalVersion = Boolean(promptQuery.data?.version)
  const isDirty = draft != null && draft !== currentContent
  const hasResettableVersion = selectedPrompt.length > 0 && isEditedGlobalVersion

  const canDiscardDraft = () => !isDirty || window.confirm(t`Discard unsaved prompt changes?`)

  const selectPromptFile = (promptName: string, modelId: string) => {
    if (isSavingPrompt) return
    if (!canDiscardDraft()) return
    setSelectedPrompt(promptName)
    setModel(modelId)
    setDraft(null)
  }

  const selectModel = (modelId: string) => {
    if (isSavingPrompt) return
    if (!canDiscardDraft()) return
    setModel(modelId)
    setDraft(null)
  }

  const handleCurrentVersionChanged = async (
    promptName: string,
    modelId: string | null,
    prompt: PromptResponse,
  ) => {
    if (
      currentSelectionRef.current.promptName === promptName &&
      currentSelectionRef.current.modelId === modelId
    ) {
      draftRevision.current = prompt.revision
      setDraft(null)
    }
    updatePromptCaches(queryClient, promptName, modelId, prompt)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["prompts"] }),
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", promptName, modelId] }),
    ])
  }

  const showError = async (error: unknown, submitted: { name: string; model: string | null }) => {
    if (error instanceof ApiError && error.status === 409) {
      const current = (error.body as { current?: PromptResponse })?.current
      if (current) updatePromptCaches(queryClient, submitted.name, submitted.model, current)
      toast.error(t`This prompt changed after you loaded it. Your draft was not overwritten.`)
    } else {
      // A lost response may follow a committed write. Reconcile by reading;
      // never retry a mutation automatically or replace the retained draft.
      await api.getPrompt(submitted.name, undefined, submitted.model)
        .then((current) => updatePromptCaches(queryClient, submitted.name, submitted.model, current))
        .catch(() => {})
      toast.error(t`Save failed`)
    }
  }
  const saveMutation = useMutation({
    mutationFn: (submitted: { name: string; model: string | null; content: string; revision: string }) =>
      api.updatePrompt(submitted.name, submitted.content, undefined, submitted.model, submitted.revision),
    onSuccess: async (saved, submitted) => {
      if (currentSelectionRef.current.promptName === submitted.name && currentSelectionRef.current.modelId === submitted.model) {
        setDraft((current) => current === submitted.content ? null : current)
        draftRevision.current = saved.revision
      }
      updatePromptCaches(queryClient, submitted.name, submitted.model, saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions", submitted.name, submitted.model] }),
      ])
      toast.success(t`Prompt saved to global overrides at ${saved.persistence.logicalPath}.`)
    },
    onError: showError,
  })
  const resetMutation = useMutation({
    mutationFn: (submitted: { name: string; model: string | null; revision: string; draft: string | null }) =>
      api.resetPrompt(submitted.name, submitted.model, undefined, submitted.revision),
    onSuccess: async (saved, submitted) => {
      if (currentSelectionRef.current.promptName === submitted.name && currentSelectionRef.current.modelId === submitted.model) {
        setDraft((current) => current === submitted.draft ? null : current)
        draftRevision.current = saved.revision
      }
      updatePromptCaches(queryClient, submitted.name, submitted.model, saved)
      await queryClient.invalidateQueries({ queryKey: ["prompt-versions", submitted.name, submitted.model] })
      toast.success(t`Global prompt reset to default.`)
    },
    onError: showError,
  })

  const loadedRevision = async (promptName: string, targetModel: string | null) => {
    if (selectedPrompt === promptName && promptModelId === targetModel && promptQuery.data) {
      return draftRevision.current ?? promptQuery.data.revision
    }
    const loaded = queryClient.getQueryData<PromptResponse>(["prompts", promptName, undefined, targetModel])
      ?? await api.getPrompt(promptName, undefined, targetModel)
    return loaded.revision
  }
  const deletePromptMutation = useMutation({
    mutationFn: async ({ promptName, modelId }: DeletePromptVariables) => {
      if (isDefaultPromptModelId(modelId, basePromptModel)) {
        throw new Error(t`Default prompt files cannot be deleted.`)
      }
      const targetModel = promptModelForSelectedModel(modelId, basePromptModel)
      return api.resetPrompt(promptName, targetModel, undefined, await loadedRevision(promptName, targetModel))
    },
    onSuccess: async (resetPrompt, { promptName, modelId, draft: submittedDraft }) => {
      const deletedPromptModelId = promptModelForSelectedModel(modelId, basePromptModel)
      updatePromptCaches(queryClient, promptName, deletedPromptModelId, resetPrompt)
      if (selectedPrompt === promptName && model === modelId) {
        setDraft((current) => current === submittedDraft ? null : current)
        draftRevision.current = resetPrompt.revision
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
      ])
      toast.success(t`Global prompt reset to default.`)
    },
    onError: (error, { promptName, modelId }) => {
      return showError(error, { name: promptName, model: promptModelForSelectedModel(modelId, basePromptModel) })
    },
  })

  const deleteModelMutation = useMutation({
    mutationFn: async ({ modelId, promptNames }: DeleteModelVariables) => {
      if (isDefaultPromptModelId(modelId, basePromptModel)) {
        throw new Error(t`Default prompt folders cannot be deleted.`)
      }

      const deletedPromptModelId = promptModelForSelectedModel(modelId, basePromptModel)
      if (deletedPromptModelId) {
        for (const promptName of promptNames) {
          const saved = await api.resetPrompt(promptName, deletedPromptModelId, undefined, await loadedRevision(promptName, deletedPromptModelId))
          updatePromptCaches(queryClient, promptName, deletedPromptModelId, saved)
        }
      }

      if (promptModels.includes(modelId)) {
        const savedModels = await api.updatePromptModels(
          promptModels.filter((promptModel) => promptModel !== modelId),
        )
        queryClient.setQueryData(["prompt-models"], savedModels)
      }
    },
    onSuccess: async (_, { modelId, draft: submittedDraft }) => {
      if (model === modelId && draft === submittedDraft) {
        setModel(defaultModelId)
        setDraft(null)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-models"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
      ])
      toast.success(t`Global prompt reset to default.`)
    },
    onError: (error, { modelId }) => {
      const current = error instanceof ApiError && error.status === 409
        ? (error.body as { current?: PromptResponse })?.current : undefined
      if (current) return showError(error, { name: current.name, model: promptModelForSelectedModel(modelId, basePromptModel) })
      toast.error(error instanceof Error && !(error instanceof ApiError) ? error.message : t`Unable to delete prompt folder.`)
    },
  })

  const createPromptFromTemplate = async (
    promptName: string,
    sourceModelId: string,
    targetModelId: string,
  ) => {
    if (!canDiscardDraft()) return
    const normalizedTargetModel = normalizePromptModelInput(targetModelId)
    try {
      if (!normalizedTargetModel) {
        throw new Error(t`Enter a model id.`)
      }
      if (isDefaultPromptModelId(normalizedTargetModel, basePromptModel)) {
        throw new Error(t`Default model cannot be used as a template target.`)
      }

      const sourcePrompt = await api.getPrompt(
        promptName,
        undefined,
        promptModelForSelectedModel(sourceModelId, basePromptModel),
      )
      const targetPromptModelId = promptModelForSelectedModel(normalizedTargetModel, basePromptModel)
      const targetPrompt = await api.getPrompt(promptName, undefined, targetPromptModelId)
      const savedPrompt = await api.updatePrompt(
        promptName,
        sourcePrompt.content,
        undefined,
        targetPromptModelId,
        targetPrompt.revision,
      )

      if (
        targetPromptModelId &&
        !staticModelIds.has(normalizedTargetModel) &&
        !promptModels.includes(normalizedTargetModel)
      ) {
        const savedModels = await api.updatePromptModels(
          [...promptModels, normalizedTargetModel].sort((a, b) => a.localeCompare(b)),
        )
        queryClient.setQueryData(["prompt-models"], savedModels)
      }

      updatePromptCaches(queryClient, promptName, targetPromptModelId, savedPrompt)
      setSelectedPrompt(promptName)
      setModel(normalizedTargetModel)
      setDraft(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-models"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
      ])
      toast.success(savedPrompt.revision === targetPrompt.revision
        ? t`This model already uses the template content; no new version was created.`
        : t`Prompt file created from template.`)
    } catch (error) {
      toast.error(
        error instanceof Error && !(error instanceof ApiError) ? error.message : t`Unable to create prompt file from template.`,
      )
      throw error
    }
  }

  const deletingTreeKey =
    deletePromptMutation.isPending && deletePromptMutation.variables
      ? promptTreeKey(
          deletePromptMutation.variables.modelId,
          deletePromptMutation.variables.promptName,
        )
      : null
  const deletingModelId =
    deleteModelMutation.isPending && deleteModelMutation.variables
      ? deleteModelMutation.variables.modelId
      : null
  const isPromptFilesLoading = promptListQuery.isLoading || promptModelsQuery.isLoading
  const isChangingSelection = resetMutation.isPending || deletePromptMutation.isPending || deleteModelMutation.isPending
  const isSavingPrompt = saveMutation.isPending || isChangingSelection

  return {
    promptSummaries,
    promptModels,
    modelGroups,
    defaultModelId,
    selectedPrompt,
    model,
    promptModelId,
    treeFilter,
    setTreeFilter,
    isDiffOpen,
    toggleDiff: () => setIsDiffOpen((isOpen) => !isOpen),
    promptState: promptQuery.data,
    revision: draftRevision.current ?? promptQuery.data?.revision ?? "",
    conflict: Boolean(isDirty && draftRevision.current && draftRevision.current !== promptQuery.data?.revision),
    reloadLatest: () => { if (canDiscardDraft()) { setDraft(null); draftRevision.current = null } },
    keepDraft: () => { draftRevision.current = promptQuery.data?.revision ?? null; refreshRevision((value) => value + 1); },
    promptContent: promptQuery.data?.content,
    currentContent,
    displayContent,
    activePromptLabel: promptFileNameForModel(selectedPrompt, model),
    selectedTreeKey: selectedPrompt ? promptTreeKey(model, selectedPrompt) : "",
    deletingTreeKey,
    deletingModelId,
    isUsingFallback,
    isEditedGlobalVersion,
    isDirty,
    hasResettableVersion,
    isPromptFilesLoading,
    isPromptEditorLoading: isPromptFilesLoading || promptQuery.isLoading || defaultModelQuery.isLoading || loadingBaseModel,
    isSavingPrompt,
    isChangingSelection,
    setDraft: (value) => {
      // While a save is pending, even the old server bytes are a newer edit:
      // clearing them here would let the submitted response replace the buffer.
      if (value === currentContent && !saveMutation.isPending) { setDraft(null); draftRevision.current = null; return }
      if (draft == null) draftRevision.current = promptQuery.data?.revision ?? null
      setDraft(value)
    },
    discardDraft: () => { setDraft(null); draftRevision.current = null },
    selectPromptFile,
    selectModel,
    createPromptFromTemplate,
    deletePrompt: async (promptName, modelId) => {
      if (!isSavingPrompt && canDiscardDraft()) return deletePromptMutation.mutateAsync({ promptName, modelId, draft })
    },
    deleteModel: async (modelId, promptNames) => {
      if (!isSavingPrompt && canDiscardDraft()) return deleteModelMutation.mutateAsync({ modelId, promptNames, draft })
    },
    handleCurrentVersionChanged,
    save: async () => { await saveMutation.mutateAsync({ name: selectedPrompt, model: promptModelId, content: displayContent, revision: draftRevision.current ?? promptQuery.data?.revision ?? "" }) },
    reset: () => {
      if (canDiscardDraft()) resetMutation.mutate({ name: selectedPrompt, model: promptModelId, revision: draftRevision.current ?? promptQuery.data?.revision ?? "", draft })
    },
  }
}
