import { useState, useEffect } from "react"
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
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/v2/PromptViewer"
import { LanguagePicker } from "@/components/LanguagePicker"
import { useStepRun } from "@/hooks/use-step-run"

export function TranslationsSettings({ bookLabel, headerTarget, tab = "general" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { apiKey, hasApiKey } = useApiKey()
  const { startRun, setSseEnabled } = useStepRun()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showRerunDialog, setShowRerunDialog] = useState(false)

  const [model, setModel] = useState("")
  const [outputLanguages, setOutputLanguages] = useState<Set<string>>(new Set())
  const [promptDraft, setPromptDraft] = useState<string | null>(null)

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  useEffect(() => {
    if (!activeConfigData) return
    const merged = activeConfigData.merged as Record<string, unknown>
    if (merged.translation && typeof merged.translation === "object") {
      const t = merged.translation as Record<string, unknown>
      if (t.model) setModel(String(t.model))
    }
    if (Array.isArray(merged.output_languages)) {
      setOutputLanguages(new Set(merged.output_languages as string[]))
    }
  }, [activeConfigData])

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    if (bookConfigData?.config) Object.assign(overrides, bookConfigData.config)

    if (shouldWrite("translation")) {
      const existing = (bookConfigData?.config?.translation ?? {}) as Record<string, unknown>
      overrides.translation = {
        ...existing,
        model: model.trim() || undefined,
      }
    }
    if (shouldWrite("output_languages")) {
      overrides.output_languages = outputLanguages.size > 0 ? Array.from(outputLanguages) : undefined
    }
    return overrides
  }

  const toggleLanguage = (code: string) => {
    setOutputLanguages((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
    markDirty("output_languages")
  }

  const confirmSaveAndRerun = async () => {
    const promptSaves: Promise<unknown>[] = []
    if (promptDraft != null) promptSaves.push(api.updatePrompt("translation", promptDraft, bookLabel))
    if (promptSaves.length > 0) await Promise.all(promptSaves)

    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: async () => {
          setDirty({})
          setPromptDraft(null)
          setShowRerunDialog(false)
          startRun("translations", "translations")
          setSseEnabled(true)
          await api.runSteps(bookLabel, apiKey, { fromStep: "translations", toStep: "translations" })
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "text-catalog"] })
          queryClient.removeQueries({ queryKey: ["books", bookLabel] })
          navigate({ to: "/books/$label/v2/$step", params: { label: bookLabel, step: "translations" } })
        },
      }
    )
  }

  return (
    <div className={tab === "prompt" ? "h-full max-w-4xl" : "p-4 max-w-2xl space-y-6"}>
      {tab === "general" && (
        <LanguagePicker
          selected={outputLanguages}
          onSelect={toggleLanguage}
          multiple
          label="Output Languages"
          hint="Languages to translate the text catalog into for final output."
        />
      )}

      {tab === "prompt" && (
        <PromptViewer
          promptName="translation"
          bookLabel={bookLabel}
          title="Translation Prompt"
          description="The prompt template used to translate text catalog entries."
          model={model}
          onModelChange={(v) => { setModel(v); markDirty("translation") }}
          onContentChange={setPromptDraft}
          enabled={tab === "prompt"}
        />
      )}

      {headerTarget && createPortal(
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs bg-black/15 text-white hover:bg-black/25"
          onClick={() => setShowRerunDialog(true)}
          disabled={updateConfig.isPending || !hasApiKey}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Save &amp; Rerun
        </Button>,
        headerTarget
      )}

      <Dialog open={showRerunDialog} onOpenChange={setShowRerunDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save &amp; Rerun Translations</DialogTitle>
            <DialogDescription>
              This will save your settings and re-run translations,
              rebuilding the text catalog and translating to output languages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRerunDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSaveAndRerun} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? "Saving..." : "Confirm Rerun"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
