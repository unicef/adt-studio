import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import {
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
} from "@adt/types"
import { api } from "@/api/client"
import { LLM_MODEL_GROUPS, type ModelGroup } from "@/components/pipeline/components/ModelSelect"
import {
  DEFAULT_MODEL,
  mergePromptModelGroups,
  normalizePromptModelInput,
} from "@/components/pipeline/stages/book/GlobalPromptsSettings/promptSettings"
import { promptModelForSelectedModel } from "@/components/pipeline/components/PromptViewer/promptModel"
import { toast } from "@/components/ui/sonner"

export { DEFAULT_MODEL }

export function normalizeDefaultModelInput(value: string): string {
  const normalized = normalizePromptModelInput(value)
  return normalized && !normalized.includes(":") ? `openai:${normalized}` : normalized
}

export function normalizeSpeechModelInput(value: string): string {
  return value.trim().replace(/^openai:/i, "").toLowerCase()
}

export interface DefaultLlmSetting {
  draft: string
  setDraft: (value: string) => void
  savedModel: string
  modelGroups: ModelGroup[]
  isDirty: boolean
  isLoading: boolean
  isError: boolean
  isSaving: boolean
  showPromptWarning: boolean
  save: () => void
}

export function useDefaultLlmSetting(): DefaultLlmSetting {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(DEFAULT_MODEL)

  const defaultModelQuery = useQuery({
    queryKey: ["default-model"],
    queryFn: api.getDefaultModel,
  })
  const promptModelsQuery = useQuery({
    queryKey: ["prompt-models"],
    queryFn: api.listPromptModels,
  })

  const savedModel = defaultModelQuery.data?.model ?? DEFAULT_MODEL

  useEffect(() => {
    if (defaultModelQuery.data?.model) setDraft(defaultModelQuery.data.model)
  }, [defaultModelQuery.data?.model])

  const modelGroups = useMemo(
    () =>
      mergePromptModelGroups(LLM_MODEL_GROUPS, [
        ...(promptModelsQuery.data?.models ?? []),
        savedModel,
      ]),
    [promptModelsQuery.data?.models, savedModel],
  )

  const mutation = useMutation({
    mutationFn: () => {
      const model = normalizeDefaultModelInput(draft)
      if (!model) throw new Error(t`Enter a model id.`)
      return api.updateDefaultModel(model)
    },
    onSuccess: async (saved) => {
      setDraft(saved.model)
      queryClient.setQueryData(["default-model"], saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["global-config"] }),
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "config"] }),
      ])
      toast.success(t`Default LLM updated.`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t`Unable to update the default LLM.`,
      )
    },
  })

  const promptModels = promptModelsQuery.data?.models ?? []
  const savedModelRequiresPrompts = promptModelForSelectedModel(savedModel) != null
  const hasPromptsForSavedModel = promptModels.some(
    (model) => normalizePromptModelInput(model) === normalizePromptModelInput(savedModel),
  )

  const normalizedDraft = normalizeDefaultModelInput(draft)

  return {
    draft,
    setDraft,
    savedModel,
    modelGroups,
    isDirty: normalizedDraft.length > 0 && normalizedDraft !== savedModel,
    isLoading: defaultModelQuery.isLoading || promptModelsQuery.isLoading,
    isError: defaultModelQuery.isError,
    isSaving: mutation.isPending,
    showPromptWarning: savedModelRequiresPrompts && !hasPromptsForSavedModel,
    save: () => mutation.mutate(),
  }
}

export interface SpecializedDefaults {
  imageDraft: string
  setImageDraft: (value: string) => void
  speechDraft: string
  setSpeechDraft: (value: string) => void
  isDirty: boolean
  isLoading: boolean
  isError: boolean
  isSaving: boolean
  save: () => void
}

export function useSpecializedDefaults(): SpecializedDefaults {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [imageDraft, setImageDraft] = useState(DEFAULT_IMAGE_GENERATION_MODEL_ID)
  const [speechDraft, setSpeechDraft] = useState(DEFAULT_OPENAI_TTS_MODEL_ID)

  const query = useQuery({
    queryKey: ["specialized-model-defaults"],
    queryFn: api.getSpecializedModelDefaults,
  })

  useEffect(() => {
    if (!query.data) return
    setImageDraft(query.data.imageGeneration)
    setSpeechDraft(query.data.speechGeneration)
  }, [query.data])

  const mutation = useMutation({
    mutationFn: () => {
      const imageGeneration = normalizeDefaultModelInput(imageDraft)
      const speechGeneration = normalizeSpeechModelInput(speechDraft)
      if (!imageGeneration || !speechGeneration) {
        throw new Error(t`Enter a model id for each task.`)
      }
      return api.updateSpecializedModelDefaults({ imageGeneration, speechGeneration })
    },
    onSuccess: async (saved) => {
      setImageDraft(saved.imageGeneration)
      setSpeechDraft(saved.speechGeneration)
      queryClient.setQueryData(["specialized-model-defaults"], saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["global-config"] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "config"] }),
      ])
      toast.success(t`Task-specific model defaults updated.`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to update the task-specific model defaults.`,
      )
    },
  })

  const saved = query.data ?? {
    imageGeneration: DEFAULT_IMAGE_GENERATION_MODEL_ID,
    speechGeneration: DEFAULT_OPENAI_TTS_MODEL_ID,
  }

  return {
    imageDraft,
    setImageDraft,
    speechDraft,
    setSpeechDraft,
    isDirty:
      normalizeDefaultModelInput(imageDraft) !== saved.imageGeneration ||
      normalizeSpeechModelInput(speechDraft) !== saved.speechGeneration,
    isLoading: query.isLoading,
    isError: query.isError,
    isSaving: mutation.isPending,
    save: () => mutation.mutate(),
  }
}
