import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { PromptViewer, savePromptDraft, toPromptDraft, type PromptDraft } from "@/components/pipeline/components/PromptViewer"
import { useStageSettingsBar } from "@/hooks/use-stage-settings-bar"
import { useStepConfig } from "@/hooks/use-step-config"
import { useLingui } from "@lingui/react/macro"

export function TocSettings({ bookLabel }: { bookLabel: string; headerTarget?: HTMLDivElement | null }) {
  return <TocSettingsSession key={bookLabel} bookLabel={bookLabel} />
}

function TocSettingsSession({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig({ withReceipt: true })
  const queryClient = useQueryClient()
  const [generationPromptDraft, setGenerationPromptDraft] = useState<PromptDraft | null>(null)

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const tocGen = useStepConfig(merged, "toc_generation", markDirty, !!dirty.toc_generation)

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    if (bookConfigData?.config) Object.assign(overrides, bookConfigData.config)

    if (shouldWrite("toc_generation")) {
      const existing = (bookConfigData?.config?.toc_generation ?? {}) as Record<string, unknown>
      overrides.toc_generation = { ...existing, ...tocGen.configOverrides }
    }
    return overrides
  }

  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      if (generationPromptDraft != null) {
        await savePromptDraft(queryClient, "toc_generation", bookLabel, generationPromptDraft)
      }
      await updateConfig.mutateAsync({ label: bookLabel, config: buildOverrides() })
      setDirty({})
      setGenerationPromptDraft(null)
    } finally { setSaving(false) }
  }

  const isDirty = Object.keys(dirty).length > 0 || generationPromptDraft != null
  const runConfirmation = useStageSettingsBar({
    stage: "toc",
    bookLabel,
    dirty: isDirty,
    dirtyTabs: isDirty ? ["general"] : [],
    saving: saving || updateConfig.isPending,
    save,
    showSaveOnly: true,
  })

  return (
    <div className="h-full w-full">
      {runConfirmation.content}
      <fieldset disabled={runConfirmation.busy} inert={runConfirmation.busy || undefined} className="contents">
      <PromptViewer
        readOnly={runConfirmation.busy}
        promptName="toc_generation"
        bookLabel={bookLabel}
        title={t`TOC Generation Prompt`}
        description={t`The prompt template used to generate the table of contents from book headings.`}
        draft={generationPromptDraft}
        model={tocGen.model}
        onModelChange={tocGen.onModelChange}
        maxRetries={tocGen.maxRetries}
        onMaxRetriesChange={tocGen.onMaxRetriesChange}
        onContentChange={(content, modelId) => setGenerationPromptDraft(toPromptDraft(content, modelId))}
      />
      </fieldset>
    </div>
  )
}
