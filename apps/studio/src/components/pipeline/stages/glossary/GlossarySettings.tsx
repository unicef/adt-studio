import { useState } from "react"
import { useUpdateBookConfig, useBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/components/PromptViewer"
import { useStageSettingsBar } from "@/hooks/use-stage-settings-bar"
import { useStepConfig } from "@/hooks/use-step-config"
import { useLingui } from "@lingui/react/macro"

export function GlossarySettings({ bookLabel }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const [promptDraft, setPromptDraft] = useState<string | null>(null)

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const glossary = useStepConfig(merged, "glossary", markDirty)

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    if (bookConfigData?.config) Object.assign(overrides, bookConfigData.config)

    if (shouldWrite("glossary")) {
      const existing = (bookConfigData?.config?.glossary ?? {}) as Record<string, unknown>
      overrides.glossary = { ...existing, ...glossary.configOverrides }
    }
    return overrides
  }

  const save = async () => {
    if (promptDraft != null) await api.updatePrompt("glossary", promptDraft, bookLabel)
    await updateConfig.mutateAsync({ label: bookLabel, config: buildOverrides() })
    setDirty({})
    setPromptDraft(null)
  }

  const isDirty = Object.keys(dirty).length > 0 || promptDraft != null
  useStageSettingsBar({
    stage: "glossary",
    bookLabel,
    dirty: isDirty,
    dirtyTabs: isDirty ? ["general"] : [],
    saving: updateConfig.isPending,
    save,
  })

  return (
    <div className="h-full max-w-4xl">
      <PromptViewer
        promptName="glossary"
        bookLabel={bookLabel}
        title={t`Glossary Prompt`}
        description={t`The prompt template used to generate glossary terms from book content.`}
        model={glossary.model}
        onModelChange={glossary.onModelChange}
        maxRetries={glossary.maxRetries}
        onMaxRetriesChange={glossary.onMaxRetriesChange}
        onContentChange={setPromptDraft}
      />
    </div>
  )
}
