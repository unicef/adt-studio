import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import {
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  ReasoningEffort,
  taskConfigPath,
  type TaskModelsResponse,
} from "@adt/types"
import { api } from "@/api/client"
import { checkModelModalitySupport } from "@/api/provider-credentials"
import { LLM_MODEL_GROUPS } from "@/components/pipeline/components/ModelSelect"
import { mergePromptModelGroups } from "@/components/pipeline/stages/book/GlobalPromptsSettings/promptSettings"
import {
  normalizeSpeechModelInput,
  type DefaultLlmSetting,
  type SpecializedDefaults,
} from "@/components/app/screens/settings/modelDefaults"
import type { ModelsTableProps } from "@/components/app/screens/settings/models/shared"
import { useTaskModelDrafts } from "@/components/app/screens/settings/taskModels/useTaskModelDrafts"
import {
  TASK_MODELS_QUERY_KEY,
  type TaskModelsSave,
  type TaskModelsState,
} from "@/components/app/screens/settings/taskModels/useTaskModels"
import { toast } from "@/components/ui/sonner"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useDiscoveredModelIds } from "@/hooks/use-discovered-models"
import { useProviderCredentials } from "@/hooks/use-provider-credentials"
import { normalizeQualifiedModelInput } from "@/lib/model-id"

import { readPath, writePath, type BookConfig as Config } from "./bookConfigPath"

function readString(config: Config, path: string[]): string {
  const value = readPath(config, path)
  return typeof value === "string" ? value : ""
}

function readEffort(config: Config, path: string[]): ReasoningEffort | null {
  const parsed = ReasoningEffort.safeParse(readPath(config, path))
  return parsed.success ? parsed.data : null
}

export function useBookModelSettings(bookLabel: string): ModelsTableProps & { onSave: () => void } {
  const { t } = useLingui()
  const { providers } = useProviderCredentials()
  const discoveredModelIds = useDiscoveredModelIds("structured-text")
  const bookConfigQuery = useBookConfig(bookLabel)
  const platformTasksQuery = useQuery({ queryKey: TASK_MODELS_QUERY_KEY, queryFn: api.getTaskModels })
  const platformSpecializedQuery = useQuery({
    queryKey: ["specialized-model-defaults"],
    queryFn: api.getSpecializedModelDefaults,
  })
  const updateConfig = useUpdateBookConfig()

  const bookConfig = bookConfigQuery.data?.config
  const platform = platformTasksQuery.data
  const savedLlm = bookConfig ? readString(bookConfig, ["default_model"]) : ""
  const savedImage = bookConfig ? readString(bookConfig, ["default_image_generation_model"]) : ""
  const savedSpeech = bookConfig ? readString(bookConfig, ["default_speech_generation_model"]) : ""
  const platformLlm = platform?.defaultModel ?? DEFAULT_LLM_MODEL_ID
  const platformImage = platformSpecializedQuery.data?.imageGeneration ?? DEFAULT_IMAGE_GENERATION_MODEL_ID
  const platformSpeech = platformSpecializedQuery.data?.speechGeneration ?? DEFAULT_OPENAI_TTS_MODEL_ID

  const [llmDraft, setLlmDraft] = useState("")
  const [imageDraft, setImageDraft] = useState("")
  const [speechDraft, setSpeechDraft] = useState("")
  useEffect(() => setLlmDraft(savedLlm), [savedLlm])
  useEffect(() => setImageDraft(savedImage), [savedImage])
  useEffect(() => setSpeechDraft(savedSpeech), [savedSpeech])

  const { bookTasks, inheritedTasks } = useMemo((): {
    bookTasks?: TaskModelsResponse
    inheritedTasks?: TaskModelsResponse
  } => {
    if (!platform || !bookConfig) return {}
    const clearedByBook = (path: string[]) => readPath(bookConfig, path) === null
    return {
      bookTasks: {
        defaultModel: platform.defaultModel,
        defaultReasoningEffort: readEffort(bookConfig, ["default_reasoning_effort"]),
        tasks: platform.tasks.map((task) => ({
          ...task,
          model: readString(bookConfig, taskConfigPath(task, "model")) || null,
          reasoningEffort: readEffort(bookConfig, taskConfigPath(task, "reasoning_effort")),
        })),
      },
      inheritedTasks: {
        defaultModel: platform.defaultModel,
        defaultReasoningEffort: clearedByBook(["default_reasoning_effort"]) ? null : platform.defaultReasoningEffort,
        tasks: platform.tasks.map((task) => ({
          ...task,
          model: clearedByBook(taskConfigPath(task, "model")) ? null : task.model,
          reasoningEffort: clearedByBook(taskConfigPath(task, "reasoning_effort")) ? null : task.reasoningEffort,
        })),
      },
    }
  }, [platform, bookConfig])

  const normalizedLlm = normalizeQualifiedModelInput(llmDraft)
  const normalizedImage = normalizeQualifiedModelInput(imageDraft)
  const normalizedSpeech = normalizeSpeechModelInput(speechDraft)

  const mutation = useMutation({
    mutationFn: ({ changes, defaultReasoningEffort }: TaskModelsSave) => {
      const config: Config = structuredClone(bookConfig ?? {})
      writePath(config, ["default_model"], normalizedLlm)
      writePath(config, ["default_image_generation_model"], normalizedImage)
      writePath(config, ["default_speech_generation_model"], normalizedSpeech)
      if (defaultReasoningEffort !== undefined) {
        writePath(config, ["default_reasoning_effort"], defaultReasoningEffort)
      }
      for (const change of changes) {
        const task = platform?.tasks.find((entry) => entry.id === change.id)
        if (!task) continue
        if (change.model !== undefined) writePath(config, taskConfigPath(task, "model"), change.model)
        if (change.reasoningEffort !== undefined) {
          writePath(config, taskConfigPath(task, "reasoning_effort"), change.reasoningEffort)
        }
      }
      return updateConfig.mutateAsync({ label: bookLabel, config })
    },
    onSuccess: () => toast.success(t`Book model overrides updated.`),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t`Unable to update the book model overrides.`),
  })

  const taskModels: TaskModelsState = {
    data: bookTasks,
    inherited: inheritedTasks,
    isLoading: bookConfigQuery.isLoading || platformTasksQuery.isLoading,
    isError: bookConfigQuery.isError || platformTasksQuery.isError,
    isSaving: mutation.isPending,
    save: (save) => mutation.mutate(save),
  }
  const tasks = useTaskModelDrafts(llmDraft, taskModels)
  const save = () => tasks.save()

  const modelGroups = useMemo(
    () => mergePromptModelGroups(LLM_MODEL_GROUPS, [...discoveredModelIds, platformLlm, ...(savedLlm ? [savedLlm] : [])]),
    [discoveredModelIds, platformLlm, savedLlm],
  )

  const llm: DefaultLlmSetting = {
    draft: llmDraft,
    placeholder: platformLlm,
    setDraft: setLlmDraft,
    savedModel: savedLlm || platformLlm,
    modelGroups,
    isDirty: normalizedLlm !== savedLlm,
    isLoading: bookConfigQuery.isLoading,
    isError: bookConfigQuery.isError,
    isSaving: mutation.isPending,
    showPromptWarning: false,
    support:
      providers.length > 0 && normalizedLlm
        ? checkModelModalitySupport(providers, normalizedLlm, "structured-text")
        : null,
    save,
    discard: () => setLlmDraft(savedLlm),
  }

  const specializedChanges = Number(normalizedImage !== savedImage) + Number(normalizedSpeech !== savedSpeech)
  const specialized: SpecializedDefaults = {
    imageDraft,
    imagePlaceholder: platformImage,
    setImageDraft,
    speechDraft,
    speechPlaceholder: platformSpeech,
    setSpeechDraft,
    isDirty: specializedChanges > 0,
    changeCount: specializedChanges,
    isLoading: bookConfigQuery.isLoading || platformSpecializedQuery.isLoading,
    isError: bookConfigQuery.isError || platformSpecializedQuery.isError,
    isSaving: mutation.isPending,
    imageSupport:
      providers.length > 0 && normalizedImage
        ? checkModelModalitySupport(providers, normalizedImage, "image")
        : null,
    save,
    discard: () => {
      setImageDraft(savedImage)
      setSpeechDraft(savedSpeech)
    },
  }

  return { llm, specialized, tasks, floatingSaveId: `book-models-${bookLabel}`, onSave: save }
}
