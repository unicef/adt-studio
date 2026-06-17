import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/components/PromptViewer"
import { useApiKey } from "@/hooks/use-api-key"
import { useActiveConfig } from "@/hooks/use-debug"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useBookRun } from "@/hooks/use-book-run"
import { useStepConfig } from "@/hooks/use-step-config"
import { useLingui } from "@lingui/react/macro"

const DEFAULT_PROMPT = "easy_read"
const DEFAULT_BATCH_SIZE = "50"

export function EasyReadSettings({
  bookLabel,
  headerTarget,
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
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const navigate = useNavigate()
  const [showRerunDialog, setShowRerunDialog] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSavingAndRunning, setIsSavingAndRunning] = useState(false)
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

  const confirmSaveAndRerun = async () => {
    const selectedPrompt = promptName.trim() || DEFAULT_PROMPT
    setSaveError(null)
    setIsSavingAndRunning(true)

    try {
      if (promptDraft != null) {
        const savedPrompt = await api.updatePrompt(selectedPrompt, promptDraft, bookLabel)
        queryClient.setQueryData(["prompts", selectedPrompt, bookLabel], savedPrompt)
        await queryClient.invalidateQueries({ queryKey: ["prompts", selectedPrompt, bookLabel] })
      }

      await updateConfig.mutateAsync({ label: bookLabel, config: buildOverrides() })
      setDirty({})
      setPromptDraft(null)
      setShowRerunDialog(false)
      queueRun({ fromStage: "easy-read", toStage: "easy-read", apiKey })
      navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: "easy-read" } })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSavingAndRunning(false)
    }
  }

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

      {headerTarget && createPortal(
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs bg-black/15 text-white hover:bg-black/25"
          onClick={() => {
            setSaveError(null)
            setShowRerunDialog(true)
          }}
          disabled={updateConfig.isPending || isSavingAndRunning || !hasApiKey}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {t`Save & Rerun`}
        </Button>,
        headerTarget,
      )}

      <Dialog open={showRerunDialog} onOpenChange={setShowRerunDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Save & Rerun Easy Read`}</DialogTitle>
            <DialogDescription>
              {t`This will save your Easy Read settings and generate a new editable Easy Read version.`}
            </DialogDescription>
          </DialogHeader>
          {saveError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {saveError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRerunDialog(false)} disabled={isSavingAndRunning}>
              {t`Cancel`}
            </Button>
            <Button onClick={confirmSaveAndRerun} disabled={updateConfig.isPending || isSavingAndRunning}>
              {updateConfig.isPending || isSavingAndRunning ? t`Saving...` : t`Confirm Rerun`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
