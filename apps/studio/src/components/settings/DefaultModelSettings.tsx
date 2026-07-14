import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import {
  LLM_MODEL_GROUPS,
  ModelSelect,
} from "@/components/pipeline/components/ModelSelect"
import {
  DEFAULT_MODEL,
  mergePromptModelGroups,
  normalizePromptModelInput,
} from "@/components/pipeline/stages/book/GlobalPromptsSettings/promptSettings"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"

function normalizeDefaultModelInput(value: string): string {
  const normalized = normalizePromptModelInput(value)
  return normalized && !normalized.includes(":")
    ? `openai:${normalized}`
    : normalized
}

export function DefaultModelSettings() {
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
      ])
      toast.success(t`Default model updated.`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to update the default model.`,
      )
    },
  })

  const normalizedDraft = normalizeDefaultModelInput(draft)
  const isDirty = normalizedDraft.length > 0 && normalizedDraft !== savedModel
  const isLoading = defaultModelQuery.isLoading || promptModelsQuery.isLoading

  return (
    <div className="flex w-full flex-col gap-6 p-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          <Trans>Default model</Trans>
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          <Trans>Choose the model used when a pipeline step does not specify its own model.</Trans>
        </p>
      </header>

      <section className="rounded-xl border bg-card" aria-labelledby="default-model-heading">
        <div className="border-b px-5 py-4">
          <h2 id="default-model-heading" className="text-sm font-semibold text-foreground">
            <Trans>Pipeline default</Trans>
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            <Trans>Individual steps can still override this model in their own settings.</Trans>
          </p>
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="settings-default-model" className="mb-1.5 block text-sm font-medium text-foreground">
              <Trans>Model</Trans>
            </label>
            <ModelSelect
              inputId="settings-default-model"
              value={draft}
              onChange={setDraft}
              placeholder={DEFAULT_MODEL}
              groups={modelGroups}
              inputClassName="h-10 font-mono text-sm"
              disabled={isLoading || mutation.isPending}
              commitOnInput
            />
          </div>
          <Button
            type="button"
            className="h-10 shrink-0"
            disabled={isLoading || mutation.isPending || !isDirty}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Trans>Saving...</Trans> : <Trans>Save changes</Trans>}
          </Button>
        </div>
        {defaultModelQuery.isError && (
          <p role="alert" className="px-5 pb-5 text-sm text-destructive">
            <Trans>Unable to load the default model.</Trans>
          </p>
        )}
      </section>
    </div>
  )
}
