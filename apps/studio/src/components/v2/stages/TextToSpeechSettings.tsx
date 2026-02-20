import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useStepRun } from "@/hooks/use-step-run"

export function TextToSpeechSettings({ bookLabel, headerTarget }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string }) {
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { apiKey, hasApiKey, azureKey, azureRegion } = useApiKey()
  const { startRun, setSseEnabled } = useStepRun()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showRerunDialog, setShowRerunDialog] = useState(false)

  const [model, setModel] = useState("")
  const [voice, setVoice] = useState("")
  const [format, setFormat] = useState("")

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

  useEffect(() => {
    if (!activeConfigData) return
    const merged = activeConfigData.merged as Record<string, unknown>
    if (merged.speech && typeof merged.speech === "object") {
      const s = merged.speech as Record<string, unknown>
      if (s.model) setModel(String(s.model))
      if (s.voice) setVoice(String(s.voice))
      if (s.format) setFormat(String(s.format))
    }
  }, [activeConfigData])

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    if (bookConfigData?.config) Object.assign(overrides, bookConfigData.config)

    if (shouldWrite("speech")) {
      const existing = (bookConfigData?.config?.speech ?? {}) as Record<string, unknown>
      overrides.speech = {
        ...existing,
        model: model.trim() || undefined,
        voice: voice.trim() || undefined,
        format: format.trim() || undefined,
      }
    }
    return overrides
  }

  const confirmSaveAndRerun = async () => {
    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: async () => {
          setDirty({})
          setShowRerunDialog(false)
          startRun("text-and-speech", "text-and-speech")
          setSseEnabled(true)
          await api.runSteps(bookLabel, apiKey, { fromStep: "text-and-speech", toStep: "text-and-speech" }, { key: azureKey, region: azureRegion })
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "tts"] })
          queryClient.removeQueries({ queryKey: ["books", bookLabel, "text-catalog"] })
          queryClient.removeQueries({ queryKey: ["books", bookLabel] })
          navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: "text-and-speech" } })
        },
      }
    )
  }

  return (
    <div className="p-4 max-w-2xl space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Model</Label>
          <Input
            value={model}
            onChange={(e) => { setModel(e.target.value); markDirty("speech") }}
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
            <DialogTitle>Save &amp; Rerun Text to Speech</DialogTitle>
            <DialogDescription>
              This will save your settings and re-run text-to-speech,
              regenerating all audio files.
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
