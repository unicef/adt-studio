import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { Link } from "@tanstack/react-router"
import { AudioLines, ImageIcon, TriangleAlert } from "lucide-react"
import {
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEFAULT_OPENAI_TTS_MODEL_ID,
  STEPS_BY_DEFAULT_MODEL_KIND,
} from "@adt/types"
import type { ModelModalitySupport } from "@/api/provider-credentials"
import {
  ALL_TTS_MODEL_GROUPS,
  IMAGE_MODEL_GROUPS,
  type ModelGroup,
} from "@/components/pipeline/components/ModelSelect"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { getStepLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { SETTINGS_ANCHORS } from "../nav"
import { DEFAULT_MODEL, type DefaultLlmSetting, type SpecializedDefaults } from "../modelDefaults"
import type { TaskModelDrafts } from "../taskModels/useTaskModelDrafts"

export interface ModelsTableProps {
  llm: DefaultLlmSetting
  specialized: SpecializedDefaults
  tasks: TaskModelDrafts
}

export function UnsupportedModelNotice({
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

export function PromptWarning({ savedModel, className }: { savedModel: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 border-amber-500/30 bg-amber-500/10 px-[18px] py-3.5 text-[12.5px]",
        className,
      )}
    >
      <TriangleAlert className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 space-y-1.5">
        <p className="text-pretty leading-relaxed">
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
  )
}

export interface SpecializedItem {
  key: "image" | "speech"
  anchorId: string
  icon: typeof ImageIcon
  tile: string
  title: string
  description: string
  usedBy: string[]
  inputId: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  groups: ModelGroup[]
  prefixProvider?: boolean
  support: ModelModalitySupport | null
}

export function useSpecializedItems(specialized: SpecializedDefaults): SpecializedItem[] {
  const { t } = useLingui()
  return [
    {
      key: "image",
      anchorId: SETTINGS_ANCHORS.imageModel,
      icon: ImageIcon,
      tile: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
      title: t`Image generation and editing`,
      description: t`AI image generation and editing.`,
      usedBy: STEPS_BY_DEFAULT_MODEL_KIND["image-generation"].map((step) => getStepLabelI18n(step.name)),
      inputId: "app-image-generation-model",
      value: specialized.imageDraft,
      onChange: specialized.setImageDraft,
      placeholder: DEFAULT_IMAGE_GENERATION_MODEL_ID,
      groups: IMAGE_MODEL_GROUPS,
      support: specialized.imageSupport,
    },
    {
      key: "speech",
      anchorId: SETTINGS_ANCHORS.speechModel,
      icon: AudioLines,
      tile: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
      title: t`Speech generation`,
      description: t`OpenAI, Azure, and Gemini text-to-speech.`,
      usedBy: STEPS_BY_DEFAULT_MODEL_KIND["speech-generation"].map((step) => getStepLabelI18n(step.name)),
      inputId: "app-speech-generation-model",
      value: specialized.speechDraft,
      onChange: specialized.setSpeechDraft,
      placeholder: DEFAULT_OPENAI_TTS_MODEL_ID,
      groups: ALL_TTS_MODEL_GROUPS,
      prefixProvider: false,
      support: null,
    },
  ]
}

export function useModelsFloatingSave({ llm, specialized, tasks }: ModelsTableProps) {
  const { t } = useLingui()
  const llmDirty = llm.isDirty
  const changeCount = Number(llmDirty) + specialized.changeCount + tasks.changes.length
  const blocked =
    llm.support?.ok === false || specialized.imageSupport?.ok === false || tasks.hasUnsupported

  useFloatingSave({
    id: "settings-models",
    dirty: changeCount > 0,
    saving: llm.isSaving || specialized.isSaving || tasks.isSaving,
    label: (
      <span className="text-[11px] font-medium tabular-nums text-foreground">
        <Plural value={changeCount} one="# model change" other="# model changes" />
      </span>
    ),
    labelKey: String(changeCount),
    saveDisabledReason: blocked ? t`Choose a model from a registered provider before saving.` : undefined,
    onDiscard: () => {
      llm.discard()
      specialized.discard()
      tasks.discard()
    },
    onSave: () => {
      if (llmDirty) llm.save()
      if (specialized.isDirty) specialized.save()
      if (tasks.changes.length > 0) tasks.save()
    },
  })
}
