import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { Link } from "@tanstack/react-router"
import { AudioLines, Brain, ImageIcon, Loader2, TriangleAlert } from "lucide-react"
import {
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  STEPS_BY_DEFAULT_MODEL_KIND,
  type StepDef,
} from "@adt/types"
import type { ModelModalitySupport } from "@/api/provider-credentials"
import {
  ALL_TTS_MODEL_GROUPS,
  IMAGE_MODEL_GROUPS,
  ModelSelect,
  type ModelGroup,
} from "@/components/pipeline/components/ModelSelect"
import { getStepLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SettingsHeading, SettingsLead } from "./ui"
import { SETTINGS_ANCHORS } from "./nav"
import {
  DEFAULT_MODEL,
  useDefaultLlmSetting,
  useSpecializedDefaults,
} from "./modelDefaults"

/**
 * Advisory manifest check surfaced next to the picker: the backend validates
 * provider/modality again on save, so this only saves a round trip.
 */
function UnsupportedModelNotice({
  support,
  modality,
  className,
}: {
  support: ModelModalitySupport | null
  modality: "text" | "image"
  className?: string
}) {
  const { t } = useLingui()
  if (!support || support.ok) return null
  const { providerId } = support
  const message =
    support.reason === "unknown-provider"
      ? t`Provider "${providerId}" is not registered. Add its API keys in Settings or choose another model.`
      : modality === "image"
        ? t`Provider "${providerId}" does not support image generation.`
        : t`Provider "${providerId}" does not support text generation.`
  return (
    <p role="alert" className={cn("text-[12.5px] text-destructive", className)}>
      {message}
    </p>
  )
}

function TaskChips({ steps }: { steps: readonly StepDef[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {steps.map((step) => (
        <span
          key={step.name}
          className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-brand-500" />
          {getStepLabelI18n(step.name)}
        </span>
      ))}
    </div>
  )
}

function SaveButton({
  disabled,
  saving,
  onClick,
}: {
  disabled: boolean
  saving: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      className="h-9 shrink-0"
      disabled={disabled}
      onClick={onClick}
    >
      {saving && <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />}
      {saving ? <Trans>Saving...</Trans> : <Trans>Save changes</Trans>}
    </Button>
  )
}

function SpecializedCard({
  anchorId,
  icon: Icon,
  tile,
  title,
  description,
  inputId,
  value,
  onChange,
  placeholder,
  groups,
  disabled,
  prefixProvider,
  steps,
  support,
}: {
  anchorId: string
  icon: typeof ImageIcon
  tile: string
  title: React.ReactNode
  description: React.ReactNode
  inputId: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  groups: ModelGroup[]
  disabled: boolean
  prefixProvider?: boolean
  steps: readonly StepDef[]
  support?: ModelModalitySupport | null
}) {
  return (
    <article id={anchorId} className="flex scroll-mt-24 flex-col rounded-2xl border bg-card p-[18px] shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-[11px]", tile)}>
          <Icon className="size-[19px]" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <label htmlFor={inputId} className="mb-1.5 mt-4 block text-[12.5px] font-medium">
        <Trans>Platform default</Trans>
      </label>
      <ModelSelect
        inputId={inputId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        groups={groups}
        inputClassName="h-10 font-mono text-[13px]"
        disabled={disabled}
        commitOnInput
        prefixProvider={prefixProvider}
      />
      <UnsupportedModelNotice support={support ?? null} modality="image" className="mt-2" />
      <div className="mt-4 border-t pt-3.5">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Plural value={steps.length} one="Used by # task" other="Used by # tasks" />
        </div>
        <TaskChips steps={steps} />
      </div>
    </article>
  )
}

export function ModelsSection() {
  const { t } = useLingui()
  const llm = useDefaultLlmSetting()
  const specialized = useSpecializedDefaults()

  const savedModel = llm.savedModel
  const llmSteps = STEPS_BY_DEFAULT_MODEL_KIND.llm

  return (
    <>
      <SettingsHeading>
        <Trans>Models</Trans>
      </SettingsHeading>
      <SettingsLead>
        <Trans>Each kind of pipeline task uses a compatible model. Image generation and speech use their own task-specific defaults.</Trans>
      </SettingsLead>

      <section
        id={SETTINGS_ANCHORS.defaultLlm}
        className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card shadow-sm"
        aria-label={t`Default model`}
      >
        <div className="flex items-center gap-3 px-[18px] pt-[18px]">
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-brand-50 text-brand-600">
            <Brain className="size-[19px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">
              <Trans>Default LLM</Trans>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Trans>Every text task falls back to this model unless it overrides it.</Trans>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 px-[18px] pb-[18px] pt-4">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="app-default-model" className="mb-1.5 block text-[12.5px] font-medium">
              <Trans>LLM model</Trans>
            </label>
            <ModelSelect
              inputId="app-default-model"
              value={llm.draft}
              onChange={llm.setDraft}
              placeholder={DEFAULT_MODEL}
              groups={llm.modelGroups}
              inputClassName="h-10 font-mono text-[13px]"
              disabled={llm.isLoading || llm.isSaving}
              commitOnInput
            />
          </div>
          <SaveButton
            disabled={llm.isLoading || llm.isSaving || !llm.isDirty || llm.support?.ok === false}
            saving={llm.isSaving}
            onClick={llm.save}
          />
        </div>

        {llm.support?.ok === false && (
          <div className="border-t px-[18px] py-3">
            <UnsupportedModelNotice support={llm.support} modality="text" />
          </div>
        )}

        {llm.isError && (
          <p role="alert" className="border-t px-[18px] py-3 text-[12.5px] text-destructive">
            <Trans>Unable to load the default LLM.</Trans>
          </p>
        )}

        {llm.showPromptWarning && (
          <div
            role="status"
            className="flex items-start gap-2.5 border-t border-amber-500/30 bg-amber-500/10 px-[18px] py-3.5 text-[12.5px]"
          >
            <TriangleAlert className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 space-y-1.5">
              <p className="leading-relaxed">
                <Trans>
                  The built-in prompts are optimized for {DEFAULT_MODEL}. You switched
                  the default LLM to <span className="font-mono">{savedModel}</span>,
                  so we recommend generating new global prompt files tuned for it.
                  You can also continue with the existing prompts.
                </Trans>
              </p>
              <Link
                to="/settings/prompts"
                className="inline-flex items-center font-semibold text-brand-700 underline-offset-4 hover:underline"
              >
                <Trans>Generate global prompts</Trans>
              </Link>
            </div>
          </div>
        )}

        <div className="border-t bg-muted/30 px-[18px] py-4">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Plural
              value={llmSteps.length}
              one="# task inherits this model"
              other="# tasks inherit this model"
            />
          </div>
          <p className="mt-1 text-[12.5px] leading-normal text-muted-foreground">
            <Trans>These tasks inherit the default LLM unless their own settings specify another model.</Trans>
          </p>
          <TaskChips steps={llmSteps} />
          <p className="mt-3 text-[11.5px] leading-normal text-muted-foreground">
            <Trans>Font assignment, styleguide generation, and visual review also use this default unless overridden.</Trans>
          </p>
        </div>
      </section>

      <div className="mb-3.5 mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-[-0.01em]">
            <Trans>Task-specific defaults</Trans>
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            <Trans>These tasks require specialized models and do not inherit the default LLM above.</Trans>
          </p>
        </div>
        <SaveButton
          disabled={
            specialized.isLoading ||
            specialized.isSaving ||
            !specialized.isDirty ||
            specialized.imageSupport?.ok === false
          }
          saving={specialized.isSaving}
          onClick={specialized.save}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SpecializedCard
          anchorId={SETTINGS_ANCHORS.imageModel}
          icon={ImageIcon}
          tile="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400"
          title={<Trans>Image generation and editing</Trans>}
          description={<Trans>AI image generation and editing.</Trans>}
          inputId="app-image-generation-model"
          value={specialized.imageDraft}
          onChange={specialized.setImageDraft}
          placeholder={DEFAULT_IMAGE_GENERATION_MODEL_ID}
          groups={IMAGE_MODEL_GROUPS}
          disabled={specialized.isLoading || specialized.isSaving}
          support={specialized.imageSupport}
          steps={STEPS_BY_DEFAULT_MODEL_KIND["image-generation"]}
        />
        <SpecializedCard
          anchorId={SETTINGS_ANCHORS.speechModel}
          icon={AudioLines}
          tile="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
          title={<Trans>Speech generation</Trans>}
          description={<Trans>OpenAI, Azure, and Gemini text-to-speech.</Trans>}
          inputId="app-speech-generation-model"
          value={specialized.speechDraft}
          onChange={specialized.setSpeechDraft}
          placeholder={DEFAULT_OPENAI_TTS_MODEL_ID}
          groups={ALL_TTS_MODEL_GROUPS}
          disabled={specialized.isLoading || specialized.isSaving}
          prefixProvider={false}
          steps={STEPS_BY_DEFAULT_MODEL_KIND["speech-generation"]}
        />
      </div>

      {specialized.isError && (
        <p role="alert" className="mt-3 text-[12.5px] text-destructive">
          <Trans>Unable to load the task-specific model defaults.</Trans>
        </p>
      )}
    </>
  )
}
