import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { AudioLines, Bot, ImageIcon, Loader2 } from "lucide-react"
import {
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
} from "@adt/types"
import { api } from "@/api/client"
import {
  IMAGE_MODEL_GROUPS,
  LLM_MODEL_GROUPS,
  ModelSelect,
  OPENAI_TTS_MODELS,
} from "@/components/pipeline/components/ModelSelect"
import {
  SettingsCard,
  SettingsField,
} from "@/components/pipeline/components/SettingsCard"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"

const LLM_MODEL_KEY = "default_model"
const IMAGE_MODEL_KEY = "default_image_generation_model"
const SPEECH_MODEL_KEY = "default_speech_generation_model"

function normalizeProviderModel(value: string): string {
  const normalized = value.trim().toLowerCase()
  return normalized && !normalized.includes(":")
    ? `openai:${normalized}`
    : normalized
}

function normalizeSpeechModel(value: string): string {
  return value.trim().replace(/^openai:/i, "").toLowerCase()
}

export function BookModelSettings({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const bookConfigQuery = useBookConfig(bookLabel)
  const platformDefaultsQuery = useQuery({
    queryKey: ["specialized-model-defaults"],
    queryFn: api.getSpecializedModelDefaults,
  })
  const platformLlmQuery = useQuery({
    queryKey: ["default-model"],
    queryFn: api.getDefaultModel,
  })
  const updateConfig = useUpdateBookConfig()
  const [llmModel, setLlmModel] = useState("")
  const [imageModel, setImageModel] = useState("")
  const [speechModel, setSpeechModel] = useState("")

  const savedLlmModel =
    typeof bookConfigQuery.data?.config[LLM_MODEL_KEY] === "string"
      ? String(bookConfigQuery.data.config[LLM_MODEL_KEY])
      : ""
  const savedImageModel =
    typeof bookConfigQuery.data?.config[IMAGE_MODEL_KEY] === "string"
      ? String(bookConfigQuery.data.config[IMAGE_MODEL_KEY])
      : ""
  const savedSpeechModel =
    typeof bookConfigQuery.data?.config[SPEECH_MODEL_KEY] === "string"
      ? String(bookConfigQuery.data.config[SPEECH_MODEL_KEY])
      : ""

  useEffect(() => {
    if (!bookConfigQuery.data) return
    setLlmModel(savedLlmModel)
    setImageModel(savedImageModel)
    setSpeechModel(savedSpeechModel)
  }, [bookConfigQuery.data, savedImageModel, savedLlmModel, savedSpeechModel])

  const normalizedLlmModel = normalizeProviderModel(llmModel)
  const normalizedImageModel = normalizeProviderModel(imageModel)
  const normalizedSpeechModel = normalizeSpeechModel(speechModel)
  const isDirty =
    normalizedLlmModel !== savedLlmModel ||
    normalizedImageModel !== savedImageModel ||
    normalizedSpeechModel !== savedSpeechModel
  const platformLlmModel = platformLlmQuery.data?.model ?? DEFAULT_LLM_MODEL_ID
  const platformImageModel =
    platformDefaultsQuery.data?.imageGeneration ??
    DEFAULT_IMAGE_GENERATION_MODEL_ID
  const platformSpeechModel =
    platformDefaultsQuery.data?.speechGeneration ??
    DEFAULT_OPENAI_TTS_MODEL_ID

  const save = async () => {
    const config = { ...(bookConfigQuery.data?.config ?? {}) }
    if (normalizedLlmModel) config[LLM_MODEL_KEY] = normalizedLlmModel
    else delete config[LLM_MODEL_KEY]
    if (normalizedImageModel) config[IMAGE_MODEL_KEY] = normalizedImageModel
    else delete config[IMAGE_MODEL_KEY]
    if (normalizedSpeechModel) config[SPEECH_MODEL_KEY] = normalizedSpeechModel
    else delete config[SPEECH_MODEL_KEY]

    try {
      await updateConfig.mutateAsync({ label: bookLabel, config })
      toast.success(t`Book model overrides updated.`)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to update the book model overrides.`,
      )
    }
  }

  const isLoading =
    bookConfigQuery.isLoading ||
    platformDefaultsQuery.isLoading ||
    platformLlmQuery.isLoading
  const hasError =
    bookConfigQuery.isError ||
    platformDefaultsQuery.isError ||
    platformLlmQuery.isError

  return (
    <SettingsCard
      title={<Trans>Model overrides</Trans>}
      description={
        <Trans>
          Override the default LLM and specialized models for this book. Empty
          fields inherit the platform defaults.
        </Trans>
      }
    >
      <SettingsField
        htmlFor="book-default-llm-model"
        label={
          <span className="inline-flex items-center gap-2">
            <Bot className="size-4 text-primary" aria-hidden="true" />
            <Trans>LLM model</Trans>
          </span>
        }
        hint={t`Platform default: ${platformLlmModel}`}
      >
        <ModelSelect
          inputId="book-default-llm-model"
          value={llmModel}
          onChange={setLlmModel}
          placeholder={platformLlmModel}
          groups={LLM_MODEL_GROUPS}
          inputClassName="h-10 font-mono text-sm"
          disabled={isLoading || updateConfig.isPending}
          commitOnInput
        />
      </SettingsField>

      <div className="grid gap-5 border-t pt-5 md:grid-cols-2">
        <SettingsField
          htmlFor="book-image-generation-model"
          label={
            <span className="inline-flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" aria-hidden="true" />
              <Trans>Image generation and editing</Trans>
            </span>
          }
          hint={t`Platform default: ${platformImageModel}`}
        >
          <ModelSelect
            inputId="book-image-generation-model"
            value={imageModel}
            onChange={setImageModel}
            placeholder={platformImageModel}
            groups={IMAGE_MODEL_GROUPS}
            inputClassName="h-10 font-mono text-sm"
            disabled={isLoading || updateConfig.isPending}
            commitOnInput
          />
        </SettingsField>

        <SettingsField
          htmlFor="book-speech-generation-model"
          label={
            <span className="inline-flex items-center gap-2">
              <AudioLines className="size-4 text-primary" aria-hidden="true" />
              <Trans>Speech generation</Trans>
            </span>
          }
          hint={t`Platform default: ${platformSpeechModel}`}
        >
          <ModelSelect
            inputId="book-speech-generation-model"
            value={speechModel}
            onChange={setSpeechModel}
            placeholder={platformSpeechModel}
            groups={OPENAI_TTS_MODELS}
            inputClassName="h-10 font-mono text-sm"
            disabled={isLoading || updateConfig.isPending}
            commitOnInput
            prefixProvider={false}
          />
        </SettingsField>
      </div>

      {hasError && (
        <p role="alert" className="text-sm text-destructive">
          <Trans>Unable to load the model settings.</Trans>
        </p>
      )}

      <div className="flex justify-end border-t pt-4">
        <Button
          type="button"
          className="h-10 transition-[background-color,transform] duration-150 ease-out motion-safe:active:scale-[0.96]"
          disabled={isLoading || updateConfig.isPending || !isDirty}
          onClick={save}
        >
          {updateConfig.isPending && (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {updateConfig.isPending ? (
            <Trans>Saving...</Trans>
          ) : (
            <Trans>Save changes</Trans>
          )}
        </Button>
      </div>
    </SettingsCard>
  )
}
