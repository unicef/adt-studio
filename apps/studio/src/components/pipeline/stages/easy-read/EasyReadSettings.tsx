import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/components/PromptViewer"
import { useStageSettingsBar } from "@/hooks/use-stage-settings-bar"
import { useActiveConfig } from "@/hooks/use-debug"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useStepConfig } from "@/hooks/use-step-config"
import { useLingui } from "@lingui/react/macro"

const DEFAULT_PROMPT = "easy_read"
const DEFAULT_BATCH_SIZE = "50"

export function EasyReadSettings({
  bookLabel,
}: {
  bookLabel: string
  headerTarget?: HTMLDivElement | null
  tab?: string
}) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const queryClient = useQueryClient()
  const [promptDraft, setPromptDraft] = useState<string | null>(null)
  const [promptName, setPromptName] = useState(DEFAULT_PROMPT)
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE)

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const easyRead = useStepConfig(merged, "easy_read", markDirty)

  useEffect(() => {
    if (!activeConfigData) return
    const cfg = (activeConfigData.merged as Record<string, unknown>).easy_read
    if (cfg && typeof cfg === "object") {
      const easyReadConfig = cfg as Record<string, unknown>
      setPromptName(typeof easyReadConfig.prompt === "string" ? easyReadConfig.prompt : DEFAULT_PROMPT)
      setBatchSize(easyReadConfig.batch_size != null ? String(easyReadConfig.batch_size) : DEFAULT_BATCH_SIZE)
    } else {
      setPromptName(DEFAULT_PROMPT)
      setBatchSize(DEFAULT_BATCH_SIZE)
    }
  }, [activeConfigData])

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    if (bookConfigData?.config) Object.assign(overrides, bookConfigData.config)

    if (shouldWrite("easy_read")) {
      const existing = (bookConfigData?.config?.easy_read ?? {}) as Record<string, unknown>
      overrides.easy_read = {
        ...existing,
        ...easyRead.configOverrides,
        // Saving + rerunning from settings implies Easy Read should be on —
        // there is no separate enable toggle; running the stage enables it.
        enabled: true,
        prompt: promptName.trim() || DEFAULT_PROMPT,
        batch_size: batchSize.trim() ? Number(batchSize.trim()) : undefined,
      }
    }

    return overrides
  }

  const save = async () => {
    const promptToSave = promptName.trim() || DEFAULT_PROMPT
    if (promptDraft != null) {
      const savedPrompt = await api.updatePrompt(promptToSave, promptDraft, bookLabel)
      queryClient.setQueryData(["prompts", promptToSave, bookLabel], savedPrompt)
      await queryClient.invalidateQueries({ queryKey: ["prompts", promptToSave, bookLabel] })
    }

    await updateConfig.mutateAsync({ label: bookLabel, config: buildOverrides() })
    setDirty({})
    setPromptDraft(null)
  }

  const isDirty = Object.keys(dirty).length > 0 || promptDraft != null
  useStageSettingsBar({
    stage: "easy-read",
    bookLabel,
    dirty: isDirty,
    dirtyTabs: isDirty ? ["general"] : [],
    saving: updateConfig.isPending,
    save,
  })

  const selectedPrompt = promptName.trim() || DEFAULT_PROMPT

  return (
    <div className="h-full max-w-4xl">
      <div className="border-b px-4 py-3">
        <div className="grid gap-3 md:grid-cols-[minmax(180px,260px)_auto] md:items-end">
          <div>
            <Label className="text-xs">{t`Prompt template`}</Label>
            <Input
              value={promptName}
              onChange={(event) => {
                setPromptName(event.target.value)
                markDirty("easy_read")
              }}
              placeholder={DEFAULT_PROMPT}
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">{t`Batch size`}</Label>
            <Input
              type="number"
              min={1}
              value={batchSize}
              onChange={(event) => {
                setBatchSize(event.target.value)
                markDirty("easy_read")
              }}
              placeholder={DEFAULT_BATCH_SIZE}
              className="mt-1 w-24 text-xs"
            />
          </div>
        </div>
      </div>

      <PromptViewer
        promptName={selectedPrompt}
        bookLabel={bookLabel}
        title={t`Easy Read Prompt`}
        description={t`The prompt template used to generate editable Easy Read text blocks.`}
        model={easyRead.model}
        onModelChange={easyRead.onModelChange}
        maxRetries={easyRead.maxRetries}
        onMaxRetriesChange={easyRead.onMaxRetriesChange}
        onContentChange={setPromptDraft}
      />
    </div>
  )
}
