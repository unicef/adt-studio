import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, Play, Pause, Volume2 } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getAudioUrl } from "@/api/client"
import { useStepHeader } from "../StepViewRouter"
import { useStepRun } from "@/hooks/use-step-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StepRunCard } from "../StepRunCard"
import { STEP_DESCRIPTIONS } from "../StepSidebar"
import { cn } from "@/lib/utils"

const TTS_SUB_STEPS = [
  { key: "text-catalog", label: "Build Text Catalog" },
  { key: "tts", label: "Generate Audio" },
]

export function TextToSpeechView({ bookLabel }: { bookLabel: string }) {
  const { setExtra } = useStepHeader()
  const queryClient = useQueryClient()
  const { progress: stepProgress, startRun, setSseEnabled } = useStepRun()
  const { apiKey, hasApiKey } = useApiKey()
  const ttsRunning = stepProgress.isRunning && stepProgress.targetSteps.has("text-to-speech")

  const handleRunTTS = useCallback(async () => {
    if (!hasApiKey || ttsRunning) return
    startRun("text-to-speech", "text-to-speech")
    setSseEnabled(true)
    await api.runSteps(bookLabel, apiKey, { fromStep: "text-to-speech", toStep: "text-to-speech" })
    queryClient.removeQueries({ queryKey: ["books", bookLabel, "tts"] })
    queryClient.removeQueries({ queryKey: ["books", bookLabel, "text-catalog"] })
  }, [bookLabel, apiKey, hasApiKey, ttsRunning, startRun, setSseEnabled, queryClient])

  const { data: ttsData, isLoading: ttsLoading } = useQuery({
    queryKey: ["books", bookLabel, "tts"],
    queryFn: () => api.getTTS(bookLabel),
    enabled: !!bookLabel,
  })
  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel),
    enabled: !!bookLabel,
  })

  const languages = ttsData ? Object.keys(ttsData.languages) : []
  const [selectedLang, setSelectedLang] = useState<string | null>(null)

  // Default to first language when available
  useEffect(() => {
    if (languages.length > 0 && !selectedLang) {
      setSelectedLang(languages[0])
    }
  }, [languages.length])

  const totalEntries = selectedLang && ttsData ? ttsData.languages[selectedLang]?.entries.length ?? 0 : 0

  // Build a map from textId to source text for display
  const textMap = new Map<string, string>()
  if (catalog?.entries) {
    for (const e of catalog.entries) {
      textMap.set(e.id, e.text)
    }
  }
  // Also include translated text if viewing a non-source language
  const translatedTextMap = new Map<string, string>()
  if (selectedLang && catalog?.translations?.[selectedLang]?.entries) {
    for (const e of catalog.translations[selectedLang].entries) {
      translatedTextMap.set(e.id, e.text)
    }
  }

  useEffect(() => {
    if (!ttsData) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        {languages.length > 0 && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{languages.length} {languages.length === 1 ? "language" : "languages"}</span>
        )}
        {totalEntries > 0 && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{totalEntries} audio files</span>
        )}
      </div>
    )
    return () => setExtra(null)
  }, [ttsData, languages.length, totalEntries, selectedLang])

  const isLoading = ttsLoading || catalogLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading audio data...</span>
      </div>
    )
  }

  if (!ttsData || languages.length === 0 || ttsRunning) {
    return (
      <div className="p-4">
        <StepRunCard
          stepSlug="text-to-speech"
          subSteps={TTS_SUB_STEPS}
          description={STEP_DESCRIPTIONS["text-to-speech"]}
          isRunning={ttsRunning}
          onRun={handleRunTTS}
          disabled={!hasApiKey || ttsRunning}
        />
      </div>
    )
  }

  const langData = selectedLang ? ttsData.languages[selectedLang] : null
  const entries = langData?.entries ?? []

  return (
    <div className="space-y-3">
      {/* Language tabs */}
      {languages.length > 1 && (
        <div className="flex gap-1.5">
          {languages.map((lang) => {
            const count = ttsData.languages[lang]?.entries.length ?? 0
            return (
              <button
                key={lang}
                type="button"
                onClick={() => setSelectedLang(lang)}
                className={cn(
                  "text-xs h-7 px-3 rounded-md font-medium transition-colors cursor-pointer",
                  selectedLang === lang
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {lang}
                <span className={cn(
                  "ml-1.5 text-[10px]",
                  selectedLang === lang ? "opacity-60" : "opacity-50"
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Audio entries */}
      <div className="space-y-1">
        {entries.map((entry) => {
          const displayText = translatedTextMap.get(entry.textId) ?? textMap.get(entry.textId)
          return (
            <AudioEntryRow
              key={entry.textId}
              textId={entry.textId}
              text={displayText}
              voice={entry.voice}
              audioUrl={getAudioUrl(bookLabel, selectedLang!, entry.fileName)}
            />
          )
        })}
      </div>
    </div>
  )
}

function AudioEntryRow({ textId, text, voice, audioUrl }: { textId: string; text?: string; voice: string; audioUrl: string }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.addEventListener("ended", () => setPlaying(false))
    }
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md border bg-card">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-colors",
          playing ? "bg-amber-500 text-white" : "bg-muted hover:bg-accent"
        )}
      >
        {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-muted-foreground">{textId}</span>
        {text && <p className="text-sm leading-relaxed truncate">{text}</p>}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground">{voice}</span>
    </div>
  )
}
