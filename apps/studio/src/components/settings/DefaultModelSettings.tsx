import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { Link } from "@tanstack/react-router"
import { AudioLines, ImageIcon, Loader2, TriangleAlert } from "lucide-react"
import {
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  STEPS_BY_DEFAULT_MODEL_KIND,
  type StepDef,
} from "@adt/types"
import { api } from "@/api/client"
import {
  ALL_TTS_MODEL_GROUPS,
  IMAGE_MODEL_GROUPS,
  LLM_MODEL_GROUPS,
  ModelSelect,
} from "@/components/pipeline/components/ModelSelect"
import {
  DEFAULT_MODEL,
  mergePromptModelGroups,
  normalizePromptModelInput,
} from "@/components/pipeline/stages/book/GlobalPromptsSettings/promptSettings"
import { promptModelForSelectedModel } from "@/components/pipeline/components/PromptViewer/promptModel"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { getStepLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"

function normalizeDefaultModelInput(value: string): string {
  const normalized = normalizePromptModelInput(value)
  return normalized && !normalized.includes(":")
    ? `openai:${normalized}`
    : normalized
}

function normalizeSpeechModelInput(value: string): string {
  return value.trim().replace(/^openai:/i, "").toLowerCase()
}

function TaskList({
  steps,
  compact = false,
}: {
  steps: readonly StepDef[]
  compact?: boolean
}) {
  return (
    <ul
      className={cn(
        "mt-4 grid gap-2 text-sm text-foreground",
        compact ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {steps.map((step) => (
        <li
          key={step.name}
          className="flex min-h-10 items-center gap-2.5 rounded-md border bg-background px-3 py-2 leading-5 text-pretty"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
          <span className="min-w-0">{getStepLabelI18n(step.name)}</span>
        </li>
      ))}
    </ul>
  )
}

export function DefaultModelSettings() {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(DEFAULT_MODEL)
  const [imageDraft, setImageDraft] = useState(
    DEFAULT_IMAGE_GENERATION_MODEL_ID,
  )
  const [speechDraft, setSpeechDraft] = useState(
    DEFAULT_OPENAI_TTS_MODEL_ID,
  )

  const defaultModelQuery = useQuery({
    queryKey: ["default-model"],
    queryFn: api.getDefaultModel,
  })
  const promptModelsQuery = useQuery({
    queryKey: ["prompt-models"],
    queryFn: api.listPromptModels,
  })
  const specializedDefaultsQuery = useQuery({
    queryKey: ["specialized-model-defaults"],
    queryFn: api.getSpecializedModelDefaults,
  })

  const savedModel = defaultModelQuery.data?.model ?? DEFAULT_MODEL
  const modelGroups = useMemo(
    () => mergePromptModelGroups(
      LLM_MODEL_GROUPS,
      [...(promptModelsQuery.data?.models ?? []), savedModel],
    ),
    [promptModelsQuery.data?.models, savedModel],
  )

  useEffect(() => {
    if (defaultModelQuery.data?.model) setDraft(defaultModelQuery.data.model)
  }, [defaultModelQuery.data?.model])

  useEffect(() => {
    if (!specializedDefaultsQuery.data) return
    setImageDraft(specializedDefaultsQuery.data.imageGeneration)
    setSpeechDraft(specializedDefaultsQuery.data.speechGeneration)
  }, [specializedDefaultsQuery.data])

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
        error instanceof Error
          ? error.message
          : t`Unable to update the default LLM.`,
      )
    },
  })

  const specializedMutation = useMutation({
    mutationFn: () => {
      const imageGeneration = normalizeDefaultModelInput(imageDraft)
      const speechGeneration = normalizeSpeechModelInput(speechDraft)
      if (!imageGeneration || !speechGeneration) {
        throw new Error(t`Enter a model id for each task.`)
      }
      return api.updateSpecializedModelDefaults({
        imageGeneration,
        speechGeneration,
      })
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

  const promptModels = promptModelsQuery.data?.models ?? []
  const savedModelRequiresPrompts = promptModelForSelectedModel(savedModel) != null
  const hasPromptsForSavedModel = promptModels.some(
    (model) =>
      normalizePromptModelInput(model) === normalizePromptModelInput(savedModel),
  )
  const showPromptWarning = savedModelRequiresPrompts && !hasPromptsForSavedModel

  const normalizedDraft = normalizeDefaultModelInput(draft)
  const isDirty = normalizedDraft.length > 0 && normalizedDraft !== savedModel
  const savedSpecializedDefaults = specializedDefaultsQuery.data ?? {
    imageGeneration: DEFAULT_IMAGE_GENERATION_MODEL_ID,
    speechGeneration: DEFAULT_OPENAI_TTS_MODEL_ID,
  }
  const normalizedImageDraft = normalizeDefaultModelInput(imageDraft)
  const normalizedSpeechDraft = normalizeSpeechModelInput(speechDraft)
  const specializedIsDirty =
    normalizedImageDraft !== savedSpecializedDefaults.imageGeneration ||
    normalizedSpeechDraft !== savedSpecializedDefaults.speechGeneration
  const isLoading = defaultModelQuery.isLoading || promptModelsQuery.isLoading
  const specializedIsLoading = specializedDefaultsQuery.isLoading

  return (
    <div className="flex w-full flex-col p-5 antialiased">
      <header className="border-b pb-6">
        <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground">
          <Trans>Models</Trans>
        </h1>
        <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-muted-foreground">
          <Trans>Each kind of pipeline task uses a compatible model. Image generation and speech use their own task-specific defaults.</Trans>
        </p>
      </header>

      <section className="border-b py-8" aria-label={t`Default model`}>
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <label htmlFor="settings-default-model" className="mb-2 block text-sm font-medium text-foreground">
                <Trans>LLM model</Trans>
              </label>
              <ModelSelect
                inputId="settings-default-model"
                value={draft}
                onChange={setDraft}
                placeholder={DEFAULT_MODEL}
                groups={modelGroups}
                inputClassName="h-11 font-mono text-sm"
                disabled={isLoading || mutation.isPending}
                commitOnInput
              />
            </div>
            <Button
              type="button"
              className="h-11 shrink-0 transition-[background-color,transform] duration-150 ease-out motion-safe:active:scale-[0.96]"
              disabled={isLoading || mutation.isPending || !isDirty}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              )}
              {mutation.isPending ? <Trans>Saving...</Trans> : <Trans>Save changes</Trans>}
            </Button>
          </div>
          {defaultModelQuery.isError && (
            <p role="alert" className="border-t px-5 py-3 text-sm text-destructive">
              <Trans>Unable to load the default LLM.</Trans>
            </p>
          )}
          {showPromptWarning && (
            <div
              role="status"
              className="flex items-start gap-3 border-t border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-foreground"
            >
              <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="min-w-0 space-y-1.5">
                <p className="text-pretty leading-6">
                  <Trans>
                    The built-in prompts are optimized for {DEFAULT_MODEL}. You switched
                    the default LLM to <span className="font-mono">{savedModel}</span>,
                    so we recommend generating new global prompt files tuned for it.
                    You can also continue with the existing prompts.
                  </Trans>
                </p>
                <Link
                  to="/settings"
                  search={{ section: "prompts" }}
                  className="inline-flex items-center font-medium text-primary underline-offset-4 hover:underline"
                >
                  <Trans>Generate global prompts</Trans>
                </Link>
              </div>
            </div>
          )}
          <div className="border-t bg-muted/20 p-5">
            <h3 className="text-balance break-words text-sm font-semibold text-foreground">
              {t`Pipeline tasks using ${savedModel}`}
            </h3>
            <p className="mt-1 text-pretty text-sm leading-5 text-muted-foreground">
              <Trans>These tasks inherit the default LLM unless their own settings specify another model.</Trans>
            </p>
            <TaskList steps={STEPS_BY_DEFAULT_MODEL_KIND.llm} />
            <p className="mt-4 text-pretty text-xs leading-5 text-muted-foreground">
              <Trans>Font assignment, styleguide generation, and visual review also use this default unless overridden.</Trans>
            </p>
          </div>
        </div>
      </section>

      <section className="py-8" aria-labelledby="task-models-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="task-models-heading" className="text-balance text-base font-semibold tracking-tight text-foreground">
              <Trans>Task-specific defaults</Trans>
            </h2>
            <p className="mt-1 max-w-3xl text-pretty text-sm leading-6 text-muted-foreground">
              <Trans>These tasks require specialized models and do not inherit the default LLM above.</Trans>
            </p>
          </div>
          <Button
            type="button"
            className="h-10 shrink-0 transition-[background-color,transform] duration-150 ease-out motion-safe:active:scale-[0.96]"
            disabled={
              specializedIsLoading ||
              specializedMutation.isPending ||
              !specializedIsDirty
            }
            onClick={() => specializedMutation.mutate()}
          >
            {specializedMutation.isPending && (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            {specializedMutation.isPending ? <Trans>Saving...</Trans> : <Trans>Save changes</Trans>}
          </Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="rounded-lg border bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <ImageIcon className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-balance text-sm font-semibold text-foreground">
                  <Trans>Image generation and editing</Trans>
                </h3>
              </div>
            </div>
            <label htmlFor="settings-image-generation-model" className="mt-5 block text-xs font-medium text-foreground">
              <Trans>Platform default</Trans>
            </label>
            <ModelSelect
              inputId="settings-image-generation-model"
              value={imageDraft}
              onChange={setImageDraft}
              placeholder={DEFAULT_IMAGE_GENERATION_MODEL_ID}
              groups={IMAGE_MODEL_GROUPS}
              inputClassName="h-10 font-mono text-sm"
              disabled={specializedIsLoading || specializedMutation.isPending}
              commitOnInput
            />
            <p className="mt-5 text-pretty text-sm leading-6 text-muted-foreground">
              <Trans>Used for AI image generation, editing, and these pipeline tasks:</Trans>
            </p>
            <TaskList compact steps={STEPS_BY_DEFAULT_MODEL_KIND["image-generation"]} />
          </article>
          <article className="rounded-lg border bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <AudioLines className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-balance text-sm font-semibold text-foreground">
                  <Trans>Speech generation</Trans>
                </h3>
              </div>
            </div>
            <label htmlFor="settings-speech-generation-model" className="mt-5 block text-xs font-medium text-foreground">
              <Trans>Platform default</Trans>
            </label>
            <ModelSelect
              inputId="settings-speech-generation-model"
              value={speechDraft}
              onChange={setSpeechDraft}
              placeholder={DEFAULT_OPENAI_TTS_MODEL_ID}
              groups={ALL_TTS_MODEL_GROUPS}
              inputClassName="h-10 font-mono text-sm"
              disabled={specializedIsLoading || specializedMutation.isPending}
              commitOnInput
              prefixProvider={false}
            />
            <p className="mt-5 text-pretty text-sm leading-6 text-muted-foreground">
              <Trans>Used for OpenAI, Azure, Gemini, and ElevenLabs text-to-speech in these pipeline tasks:</Trans>
            </p>
            <TaskList compact steps={STEPS_BY_DEFAULT_MODEL_KIND["speech-generation"]} />
          </article>
        </div>
        {specializedDefaultsQuery.isError && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            <Trans>Unable to load the task-specific model defaults.</Trans>
          </p>
        )}
      </section>
    </div>
  )
}
