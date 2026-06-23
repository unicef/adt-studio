import { useState } from "react"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/components/PromptViewer"
import { useStageSettingsBar } from "@/hooks/use-stage-settings-bar"
import { useStepConfig } from "@/hooks/use-step-config"
import { useLingui } from "@lingui/react/macro"

export function CaptionsSettings({ bookLabel }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const [promptDraft, setPromptDraft] = useState<string | null>(null)

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const caption = useStepConfig(merged, "image_captioning", markDirty)

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    if (bookConfigData?.config) Object.assign(overrides, bookConfigData.config)

    if (shouldWrite("image_captioning")) {
      const existing = (bookConfigData?.config?.image_captioning ?? {}) as Record<string, unknown>
      overrides.image_captioning = { ...existing, ...caption.configOverrides }
    }
    return overrides
  }

  const save = async () => {
    if (promptDraft != null) await api.updatePrompt("image_captioning", promptDraft, bookLabel)
    await updateConfig.mutateAsync({ label: bookLabel, config: buildOverrides() })
    setDirty({})
    setPromptDraft(null)
  }

  const isDirty = Object.keys(dirty).length > 0 || promptDraft != null
  useStageSettingsBar({
    stage: "captions",
    bookLabel,
    dirty: isDirty,
    dirtyTabs: isDirty ? ["general"] : [],
    saving: updateConfig.isPending,
    save,
  })

  return (
    <div className="h-full max-w-4xl">
      <PromptViewer
        promptName="image_captioning"
        bookLabel={bookLabel}
        title={t`Caption Prompt`}
        description={t`The prompt template used to generate captions for images in the book.`}
        model={caption.model}
        onModelChange={caption.onModelChange}
        maxRetries={caption.maxRetries}
        onMaxRetriesChange={caption.onMaxRetriesChange}
        onContentChange={setPromptDraft}
      />
    </div>
  )
}
