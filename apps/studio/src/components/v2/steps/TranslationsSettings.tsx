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
  const { apiKey, hasApiKey, azureKey, azureRegion } = useApiKey()
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
  const [defaultProvider, setDefaultProvider] = useState("openai")
  const [openaiModel, setOpenaiModel] = useState("")
  const [openaiLanguages, setOpenaiLanguages] = useState("")
  const [azureModel, setAzureModel] = useState("")
  const [azureLanguages, setAzureLanguages] = useState("")
  const [bitRate, setBitRate] = useState("")
  const [sampleRate, setSampleRate] = useState("")

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
      if (s.default_provider) setDefaultProvider(String(s.default_provider))
      if (s.bit_rate) setBitRate(String(s.bit_rate))
      if (s.sample_rate) setSampleRate(String(s.sample_rate))
      if (s.providers && typeof s.providers === "object") {
        const providers = s.providers as Record<string, Record<string, unknown>>
        if (providers.openai) {
          if (providers.openai.model) setOpenaiModel(String(providers.openai.model))
          if (Array.isArray(providers.openai.languages)) setOpenaiLanguages((providers.openai.languages as string[]).join(", "))
        }
        if (providers.azure) {
          if (providers.azure.model) setAzureModel(String(providers.azure.model))
          if (Array.isArray(providers.azure.languages)) setAzureLanguages((providers.azure.languages as string[]).join(", "))
        }
      }
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
      const openaiLangs = openaiLanguages.split(",").map((s) => s.trim()).filter(Boolean)
      const azureLangs = azureLanguages.split(",").map((s) => s.trim()).filter(Boolean)
      const providers: Record<string, unknown> = {}
      if (openaiModel.trim() || openaiLangs.length > 0) {
        providers.openai = {
          model: openaiModel.trim() || undefined,
          languages: openaiLangs.length > 0 ? openaiLangs : undefined,
        }
      }
      if (azureModel.trim() || azureLangs.length > 0) {
        providers.azure = {
          model: azureModel.trim() || undefined,
          languages: azureLangs.length > 0 ? azureLangs : undefined,
        }
      }
      overrides.speech = {
        ...existing,
        model: speechModel.trim() || undefined,
        voice: voice.trim() || undefined,
        format: format.trim() || undefined,
        default_provider: defaultProvider || undefined,
        providers: Object.keys(providers).length > 0 ? providers : undefined,
        bit_rate: bitRate.trim() || undefined,
        sample_rate: sampleRate.trim() ? Number(sampleRate.trim()) : undefined,
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
          await api.runSteps(bookLabel, apiKey, { fromStep: "translations", toStep: "text-to-speech" }, { key: azureKey, region: azureRegion })
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
        <div className="space-y-6">
          {/* Provider Routing */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider Routing</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Provider</Label>
              <select
                value={defaultProvider}
                onChange={(e) => { setDefaultProvider(e.target.value); markDirty("speech") }}
                className="flex h-8 w-48 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
              >
                <option value="openai">OpenAI</option>
                <option value="azure">Azure</option>
              </select>
              <p className="text-xs text-muted-foreground">Provider used for languages not assigned to a specific provider.</p>
            </div>
          </div>

          {/* OpenAI Provider */}
          <div className="space-y-3 rounded-md border p-3">
            <h3 className="text-xs font-semibold">OpenAI</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              <Input
                value={openaiModel}
                onChange={(e) => { setOpenaiModel(e.target.value); markDirty("speech") }}
                placeholder="e.g. gpt-4o-mini-tts"
                className="w-72 h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Languages</Label>
              <Input
                value={openaiLanguages}
                onChange={(e) => { setOpenaiLanguages(e.target.value); markDirty("speech") }}
                placeholder="e.g. en, fr"
                className="w-72 h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground">Comma-separated language codes routed to OpenAI.</p>
            </div>
          </div>

          {/* Azure Provider */}
          <div className="space-y-3 rounded-md border p-3">
            <h3 className="text-xs font-semibold">Azure Speech</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              <Input
                value={azureModel}
                onChange={(e) => { setAzureModel(e.target.value); markDirty("speech") }}
                placeholder="e.g. azure-tts"
                className="w-72 h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Languages</Label>
              <Input
                value={azureLanguages}
                onChange={(e) => { setAzureLanguages(e.target.value); markDirty("speech") }}
                placeholder="e.g. es, ta, si, sw"
                className="w-72 h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground">Comma-separated language codes routed to Azure.</p>
            </div>
          </div>

          {/* Audio Settings */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audio Settings</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Voice</Label>
              <Input
                value={voice}
                onChange={(e) => { setVoice(e.target.value); markDirty("speech") }}
                placeholder="e.g. alloy"
                className="w-72 h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground">Override voice (leave blank to use voices.yaml per-language mappings).</p>
            </div>

            <div className="flex gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Format</Label>
                <Input
                  value={format}
                  onChange={(e) => { setFormat(e.target.value); markDirty("speech") }}
                  placeholder="mp3"
                  className="w-32 h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bit Rate</Label>
                <Input
                  value={bitRate}
                  onChange={(e) => { setBitRate(e.target.value); markDirty("speech") }}
                  placeholder="64k"
                  className="w-32 h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sample Rate</Label>
                <Input
                  value={sampleRate}
                  onChange={(e) => { setSampleRate(e.target.value); markDirty("speech") }}
                  placeholder="24000"
                  className="w-32 h-8 text-xs"
                />
              </div>
            </div>
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
