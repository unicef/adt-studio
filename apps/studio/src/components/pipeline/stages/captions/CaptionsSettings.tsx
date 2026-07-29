import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { PromptViewer, savePromptDraft, toPromptDraft, type PromptDraft } from "@/components/pipeline/components/PromptViewer"
import { useStageSettingsBar } from "@/hooks/use-stage-settings-bar"
import { useStepConfig } from "@/hooks/use-step-config"
import { useLingui } from "@lingui/react/macro"

export function CaptionsSettings({ bookLabel }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const queryClient = useQueryClient()
  const [promptDraft, setPromptDraft] = useState<PromptDraft | null>(null)

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
    if (promptDraft != null) {
      await savePromptDraft(queryClient, "image_captioning", bookLabel, promptDraft)
    }
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
    showSaveOnly: true,
  })

  return (
    <div className="h-full w-full">
      <PromptViewer
        promptName="image_captioning"
        bookLabel={bookLabel}
        title={t`Caption Prompt`}
        description={t`The prompt template used to generate captions for images in the book.`}
        draft={promptDraft}
        model={caption.model}
        onModelChange={caption.onModelChange}
        maxRetries={caption.maxRetries}
        onMaxRetriesChange={caption.onMaxRetriesChange}
        onContentChange={(content, modelId) => setPromptDraft(toPromptDraft(content, modelId))}
      />
    </div>
  )
}
