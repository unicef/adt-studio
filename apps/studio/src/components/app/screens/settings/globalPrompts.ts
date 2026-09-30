import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
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
  save: () => void
  reset: () => void
}

type DeletePromptVariables = {
  promptName: string
  modelId: string
}

type DeleteModelVariables = {
  modelId: string
  promptNames: string[]
}

export function useGlobalPrompts(): GlobalPromptsController {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [selectedPrompt, setSelectedPrompt] = useState("")
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [treeFilter, setTreeFilter] = useState("")
  const [draft, setDraft] = useState<string | null>(null)
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

  const promptModelId = promptModelForSelectedModel(model)
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
  }, [promptQuery.data?.content, promptModelId, selectedPrompt])

  const currentContent = promptQuery.data?.content ?? ""
  const displayContent = draft ?? currentContent
  const expectedModelPromptName = promptModelId
    ? promptNameForSelectedModel(selectedPrompt, promptModelId)
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
    if (!canDiscardDraft()) return
    setSelectedPrompt(promptName)
    setModel(modelId)
    setDraft(null)
  }

  const selectModel = (modelId: string) => {
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
      setDraft(null)
    }
    updatePromptCaches(queryClient, promptName, modelId, prompt)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["prompts"] }),
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", promptName, modelId] }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: () => api.updatePrompt(selectedPrompt, displayContent, undefined, promptModelId),
    onSuccess: async (saved) => {
      setDraft(null)
      updatePromptCaches(queryClient, selectedPrompt, promptModelId, saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({
          queryKey: ["prompt-versions", selectedPrompt, promptModelId],
        }),
      ])
      toast.success(t`Global prompt saved.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t`Unable to save global prompt.`)
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => api.resetPrompt(selectedPrompt, promptModelId),
    onSuccess: async (resetPrompt) => {
      setDraft(null)
      updatePromptCaches(queryClient, selectedPrompt, promptModelId, resetPrompt)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({
          queryKey: ["prompt-versions", selectedPrompt, promptModelId],
        }),
      ])
      toast.success(t`Global prompt reset to default.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t`Unable to reset global prompt.`)
    },
  })

  const deletePromptMutation = useMutation({
    mutationFn: ({ promptName, modelId }: DeletePromptVariables) => {
      if (isDefaultPromptModelId(modelId)) {
        throw new Error(t`Default prompt files cannot be deleted.`)
      }
      return api.resetPrompt(promptName, promptModelForSelectedModel(modelId))
    },
    onSuccess: async (resetPrompt, { promptName, modelId }) => {
      const deletedPromptModelId = promptModelForSelectedModel(modelId)
      updatePromptCaches(queryClient, promptName, deletedPromptModelId, resetPrompt)
      if (selectedPrompt === promptName && model === modelId) setDraft(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
      ])
      toast.success(t`Prompt file deleted.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t`Unable to delete prompt file.`)
    },
  })

  const deleteModelMutation = useMutation({
    mutationFn: async ({ modelId, promptNames }: DeleteModelVariables) => {
      if (isDefaultPromptModelId(modelId)) {
        throw new Error(t`Default prompt folders cannot be deleted.`)
      }

      const deletedPromptModelId = promptModelForSelectedModel(modelId)
      if (deletedPromptModelId) {
        for (const promptName of promptNames) {
          await api.resetPrompt(promptName, deletedPromptModelId)
        }
      }

      if (promptModels.includes(modelId)) {
        const savedModels = await api.updatePromptModels(
          promptModels.filter((promptModel) => promptModel !== modelId),
        )
        queryClient.setQueryData(["prompt-models"], savedModels)
      }
    },
    onSuccess: async (_, { modelId }) => {
      if (model === modelId) {
        setModel(defaultModelId)
        setDraft(null)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-models"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
      ])
      toast.success(t`Prompt folder deleted.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t`Unable to delete prompt folder.`)
    },
  })

  const createPromptFromTemplate = async (
    promptName: string,
    sourceModelId: string,
    targetModelId: string,
  ) => {
    const normalizedTargetModel = normalizePromptModelInput(targetModelId)
    try {
      if (!normalizedTargetModel) {
        throw new Error(t`Enter a model id.`)
      }
      if (isDefaultPromptModelId(normalizedTargetModel)) {
        throw new Error(t`Default model cannot be used as a template target.`)
      }

      const sourcePrompt = await api.getPrompt(
        promptName,
        undefined,
        promptModelForSelectedModel(sourceModelId),
      )
      const targetPromptModelId = promptModelForSelectedModel(normalizedTargetModel)
      const savedPrompt = await api.updatePrompt(
        promptName,
        sourcePrompt.content,
        undefined,
        targetPromptModelId,
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
      toast.success(t`Prompt file created from template.`)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Unable to create prompt file from template.`,
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
    isPromptEditorLoading: isPromptFilesLoading || promptQuery.isLoading,
    isSavingPrompt: saveMutation.isPending || resetMutation.isPending,
    setDraft,
    discardDraft: () => setDraft(null),
    selectPromptFile,
    selectModel,
    createPromptFromTemplate,
    deletePrompt: (promptName, modelId) =>
      deletePromptMutation.mutateAsync({ promptName, modelId }),
    deleteModel: (modelId, promptNames) => deleteModelMutation.mutateAsync({ modelId, promptNames }),
    handleCurrentVersionChanged,
    save: () => saveMutation.mutate(),
    reset: () => resetMutation.mutate(),
  }
}
