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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/v2/PromptViewer"
import { LanguagePicker } from "@/components/LanguagePicker"
import { useStepRun } from "@/hooks/use-step-run"
import { normalizeLocale } from "@/lib/languages"

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

  // Speech settings
  const [speechModel, setSpeechModel] = useState("")
  const [voice, setVoice] = useState("")
  const [format, setFormat] = useState("")

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
      const normalized = (merged.output_languages as string[]).map((code) => normalizeLocale(code))
      setOutputLanguages(new Set(normalized))
    }
    if (merged.speech && typeof merged.speech === "object") {
      const s = merged.speech as Record<string, unknown>
      if (s.model) setSpeechModel(String(s.model))
      if (s.voice) setVoice(String(s.voice))
      if (s.format) setFormat(String(s.format))
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
      const normalized = Array.from(outputLanguages).map((code) => normalizeLocale(code))
      overrides.output_languages = normalized.length > 0 ? normalized : undefined
    }
    if (shouldWrite("speech")) {
      const existing = (bookConfigData?.config?.speech ?? {}) as Record<string, unknown>
      overrides.speech = {
        ...existing,
        model: speechModel.trim() || undefined,
        voice: voice.trim() || undefined,
        format: format.trim() || undefined,
      }
    }
    return overrides
  }

  const toggleLanguage = (code: string) => {
    const normalizedCode = normalizeLocale(code)
    setOutputLanguages((prev) => {
      const next = new Set(prev)
      if (next.has(normalizedCode)) next.delete(normalizedCode)
      else next.add(normalizedCode)
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
          startRun("translations", "text-to-speech")
          setSseEnabled(true)
          await api.runSteps(bookLabel, apiKey, { fromStep: "translations", toStep: "text-to-speech" })
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "text-catalog"] })
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "tts"] })
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
          hint="Leave empty to output only in the book language."
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

      {tab === "speech" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Model</Label>
            <Input
              value={speechModel}
              onChange={(e) => { setSpeechModel(e.target.value); markDirty("speech") }}
              placeholder="e.g. gpt-4o-mini-tts"
              className="w-72 h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">The TTS model used for speech generation.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Voice</Label>
            <Input
              value={voice}
              onChange={(e) => { setVoice(e.target.value); markDirty("speech") }}
              placeholder="e.g. alloy"
              className="w-72 h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">Default voice for speech generation.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Audio Format</Label>
            <Input
              value={format}
              onChange={(e) => { setFormat(e.target.value); markDirty("speech") }}
              placeholder="e.g. mp3"
              className="w-48 h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">Output audio format (mp3, opus, aac, flac).</p>
          </div>
        </div>
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
            <DialogTitle>Save &amp; Rerun Translations + Audio</DialogTitle>
            <DialogDescription>
              This will save your settings and re-run translations and audio generation,
              rebuilding the text catalog, translating to output languages, and generating speech.
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
