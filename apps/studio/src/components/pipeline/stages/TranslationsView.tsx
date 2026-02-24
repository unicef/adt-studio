import { useState, useEffect, useRef, useCallback } from "react"
import { Check, ChevronDown, Languages, Loader2, Play, Pause } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getAudioUrl } from "@/api/client"
import type { TextCatalogEntry, VersionEntry } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"
import { useBook } from "@/hooks/use-books"
import { useStepHeader } from "../StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../StageRunCard"
import { STAGE_DESCRIPTIONS } from "../stage-config"
import { cn } from "@/lib/utils"
import { normalizeLocale } from "@/lib/languages"
import { resolveTranslationLanguageState } from "./translations-view-state"

const IMAGE_ID_RE = /_im\d{3}/
function isImageEntry(id: string): boolean {
  return IMAGE_ID_RE.test(id)
}

const langNames = new Intl.DisplayNames(["en"], { type: "language" })
function displayLang(code: string): string {
  try { return langNames.of(code) ?? code } catch { return code }
}


function VersionPicker({
  currentVersion,
  saving,
  dirty,
  bookLabel,
  language,
  onPreview,
  onSave,
  onDiscard,
}: {
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
  language: string
  onPreview: (data: unknown) => void
  onSave: () => void
  onDiscard: () => void
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleOpen = async () => {
    if (saving || currentVersion == null) return
    setOpen(true)
    setLoading(true)
    const res = await api.getVersionHistory(bookLabel, "text-catalog-translation", language, true)
    setVersions(res.versions)
    setLoading(false)
  }

  const handlePick = (v: VersionEntry) => {
    if (v.version === currentVersion && !dirty) {
      setOpen(false)
      return
    }
    setOpen(false)
    onPreview(v.data)
  }

  if (saving) {
    return <Loader2 className="h-3 w-3 animate-spin" />
  }

  if (currentVersion == null) return null

  if (dirty) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDiscard}
          className="text-[10px] font-medium rounded px-2 py-0.5 bg-black/15 text-black hover:bg-black/25 cursor-pointer transition-colors"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 bg-white text-green-800 hover:bg-white/80 cursor-pointer transition-colors"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal bg-white/20 text-white hover:bg-white/30 rounded px-1.5 py-0.5 transition-colors"
      >
        v{currentVersion}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-popover border rounded shadow-md min-w-[80px] py-1">
          {loading ? (
            <div className="flex items-center justify-center py-2 px-3">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            versions.map((v) => (
              <button
                key={v.version}
                type="button"
                onClick={() => handlePick(v)}
                className={`w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors ${
                  v.version === currentVersion ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                v{v.version}
              </button>
            ))
          ) : (
            <div className="px-3 py-1 text-xs text-muted-foreground">No versions</div>
          )}
        </div>
      )}
    </div>
  )
}

export function TranslationsView({ bookLabel, selectedPageId, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { setExtra } = useStepHeader()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const { data: book, isLoading: isBookLoading } = useBook(bookLabel)
  const queryClient = useQueryClient()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey, azureKey, azureRegion } = useApiKey()
  const ttsState = stageState("text-and-speech")
  const textAndSpeechDone = ttsState === "done"
  const isRunning = ttsState === "running" || ttsState === "queued"
  const showRunCard = !textAndSpeechDone || isRunning

  const handleRunTranslations = useCallback(() => {
    if (!hasApiKey || isRunning) return
    queueRun({ fromStage: "text-and-speech", toStage: "text-and-speech", apiKey, azure: { key: azureKey, region: azureRegion } })
  }, [hasApiKey, isRunning, apiKey, azureKey, azureRegion, queueRun])

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel),
    enabled: !!bookLabel,
  })

  const { data: ttsData } = useQuery({
    queryKey: ["books", bookLabel, "tts"],
    queryFn: () => api.getTTS(bookLabel),
    enabled: !!bookLabel,
  })

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const outputLanguages = Array.from(
    new Set(((merged?.output_languages as string[] | undefined) ?? []).map((code) => normalizeLocale(code)))
  )
  const bookLanguage = book?.languageCode ?? book?.metadata?.language_code ?? null
  const configuredEditingLanguage = merged?.editing_language as string | undefined

  const [selectedLang, setSelectedLang] = useState<string | null>(null)

  // Default to first output language when available
  useEffect(() => {
    if (outputLanguages.length > 0 && !selectedLang) {
      setSelectedLang(outputLanguages[0])
    }
  }, [outputLanguages.length])

  const entries = catalog?.entries ?? []
  const displayEntries = selectedPageId
    ? entries.filter((e) => e.id.startsWith(selectedPageId + "_"))
    : entries
  const hasTranslations = outputLanguages.length > 0

  const { editingLanguage, isSourceLang, isSourceLanguagePending } = resolveTranslationLanguageState({
    selectedLang,
    configuredEditingLanguage,
    bookLanguage,
    isBookLoading,
  })

  // Pending state for edits (keyed by language)
  const [pendingEntries, setPendingEntries] = useState<TextCatalogEntry[] | null>(null)
  const [saving, setSaving] = useState(false)

  // Get translated entries for selected language
  const translationData = selectedLang ? catalog?.translations?.[selectedLang] : undefined
  const translatedEntries = isSourceLang ? entries : (translationData?.entries ?? [])
  const translationVersion = isSourceLang ? (catalog?.version ?? null) : (translationData?.version ?? null)

  // Reset pending when version or language changes
  useEffect(() => {
    setPendingEntries(null)
  }, [translationVersion, selectedLang])

  // Effective translated entries (pending overrides fetched data)
  const effectiveEntries = pendingEntries ?? translatedEntries
  const translatedMap = new Map(effectiveEntries.map((e) => [e.id, e.text]))
  const dirty = pendingEntries != null

  const saveTranslation = useCallback(async () => {
    if (!pendingEntries || !selectedLang) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateTranslation(bookLabel, selectedLang, { entries: pendingEntries })
    setPendingEntries(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "text-catalog"] })
    await minDelay
    setSaving(false)
  }, [pendingEntries, selectedLang, bookLabel, queryClient])

  const saveRef = useRef(saveTranslation)
  saveRef.current = saveTranslation

  const updateEntry = (entryId: string, newText: string) => {
    const base = pendingEntries ?? translatedEntries
    // If no existing entry for this id, add one
    const exists = base.some((e) => e.id === entryId)
    if (exists) {
      setPendingEntries(
        base.map((e) => (e.id === entryId ? { ...e, text: newText } : e))
      )
    } else {
      setPendingEntries([...base, { id: entryId, text: newText }])
    }
  }

  // Build audio lookup for selected language
  const audioMap = new Map<string, { fileName: string; voice: string }>()
  if (ttsData && selectedLang && ttsData.languages[selectedLang]) {
    for (const e of ttsData.languages[selectedLang].entries) {
      audioMap.set(e.textId, { fileName: e.fileName, voice: e.voice })
    }
  }
  const totalAudioFiles = ttsData
    ? Object.values(ttsData.languages).reduce((sum, lang) => sum + lang.entries.length, 0)
    : 0

  useEffect(() => {
    if (!catalog) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{displayEntries.length} texts</span>
        {hasTranslations && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{outputLanguages.length} languages</span>
        )}
        {totalAudioFiles > 0 && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{totalAudioFiles} audio</span>
        )}
        {hasTranslations && selectedLang && translationVersion != null && !isSourceLang && (
          <VersionPicker
            currentVersion={translationVersion}
            saving={saving}
            dirty={dirty}
            bookLabel={bookLabel}
            language={selectedLang}
            onPreview={(d) => {
              const data = d as { entries?: TextCatalogEntry[] }
              setPendingEntries(data?.entries ?? [])
            }}
            onSave={() => saveRef.current()}
            onDiscard={() => setPendingEntries(null)}
          />
        )}
      </div>
    )
    return () => setExtra(null)
  }, [catalog, displayEntries.length, outputLanguages.length, hasTranslations, selectedLang, translationVersion, saving, dirty, bookLabel, isSourceLang, totalAudioFiles, selectedPageId])

  if (!showRunCard && isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading text catalog...</span>
      </div>
    )
  }

  if (showRunCard || !catalog || entries.length === 0) {
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="text-and-speech"
          description={STAGE_DESCRIPTIONS["text-and-speech"]}
          isRunning={isRunning}
          completed={textAndSpeechDone}
          onRun={handleRunTranslations}
          disabled={!hasApiKey || isRunning}
        />
      </div>
    )
  }

  const showAllButton = selectedPageId ? (
    <div className="flex justify-center pt-2 pb-4">
      <button
        type="button"
        onClick={() => onSelectPage?.(null)}
        className="text-xs font-medium text-pink-600 hover:text-pink-700 hover:underline transition-colors"
      >
        Show all text &amp; speech
      </button>
    </div>
  ) : null

  // No output languages — just show source entries
  if (!hasTranslations) {
    if (selectedPageId && displayEntries.length === 0 && entries.length > 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center mb-3">
            <Languages className="w-6 h-6 text-pink-300" />
          </div>
          <p className="text-sm font-medium">No translations for this page</p>
          <p className="text-xs mt-1">This page has no translatable text entries</p>
        </div>
      )
    }
    return (
      <div className="space-y-1">
        {displayEntries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} bookLabel={bookLabel} />
        ))}
      </div>
    )
  }

  // With output languages — language tabs + side-by-side
  return (
    <div className="space-y-3">
      {/* Language tabs */}
      <div className="flex gap-1.5">
        {outputLanguages.map((lang) => (
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
              {displayLang(lang)}
              <span className={cn(
                "ml-1 text-[10px]",
                selectedLang === lang ? "opacity-60" : "opacity-50"
              )}>
                ({lang})
              </span>
            </button>
        ))}
      </div>

      {/* Side-by-side */}
      {isSourceLanguagePending ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">Resolving source language...</span>
        </div>
      ) : selectedPageId && displayEntries.length === 0 && entries.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center mb-3">
            <Languages className="w-6 h-6 text-pink-300" />
          </div>
          <p className="text-sm font-medium">No translations for this page</p>
          <p className="text-xs mt-1">This page has no translatable text entries</p>
        </div>
      ) : (
      <div className="space-y-1">
        {!isSourceLang && (
          <div className="grid grid-cols-2 gap-3 px-3 py-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {displayLang(editingLanguage)}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{selectedLang ? displayLang(selectedLang) : selectedLang}</span>
          </div>
        )}
        {displayEntries.map((entry) => {
          const translated = translatedMap.get(entry.id)
          const audio = audioMap.get(entry.id)
          const isImg = isImageEntry(entry.id)

          if (isSourceLang) {
            return (
              <div key={entry.id} className="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-card">
                {isImg && (
                  <img
                    src={`/api/books/${bookLabel}/images/${entry.id}`}
                    alt=""
                    className="shrink-0 w-16 h-12 rounded object-cover ring-1 ring-border"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-muted-foreground">{entry.id}</span>
                  <p className="text-sm leading-relaxed mt-0.5">{entry.text}</p>
                </div>
                {audio && selectedLang && (
                  <PlayButton key={selectedLang} audioUrl={getAudioUrl(bookLabel, selectedLang, audio.fileName)} />
                )}
              </div>
            )
          }

          return (
            <div key={entry.id} className="grid grid-cols-2 gap-3 px-3 py-2.5 rounded-md border bg-card">
              <div className="flex items-start gap-3">
                {isImg && (
                  <img
                    src={`/api/books/${bookLabel}/images/${entry.id}`}
                    alt=""
                    className="shrink-0 w-16 h-12 rounded object-cover ring-1 ring-border"
                  />
                )}
                <div className="min-w-0">
                  <span className="text-[10px] text-muted-foreground">{entry.id}</span>
                  <p className="text-sm leading-relaxed mt-0.5">{entry.text}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-muted-foreground">&nbsp;</span>
                  <textarea
                    value={translated ?? ""}
                    onChange={(e) => updateEntry(entry.id, e.target.value)}
                    placeholder="Pending..."
                    className="w-full text-sm leading-relaxed mt-0.5 resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors placeholder:text-muted-foreground placeholder:italic"
                    style={{ fieldSizing: "content" } as React.CSSProperties}
                    rows={1}
                  />
                </div>
                {audio && selectedLang && (
                  <PlayButton key={selectedLang} audioUrl={getAudioUrl(bookLabel, selectedLang, audio.fileName)} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}
      {showAllButton}
    </div>
  )
}

function PlayButton({ audioUrl }: { audioUrl: string }) {
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

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-colors mt-3",
        playing ? "bg-pink-500 text-white" : "bg-muted hover:bg-accent"
      )}
    >
      {playing ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
    </button>
  )
}

function EntryRow({ entry, bookLabel }: { entry: TextCatalogEntry; bookLabel: string }) {
  const isImg = isImageEntry(entry.id)
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-card">
      {isImg && (
        <img
          src={`/api/books/${bookLabel}/images/${entry.id}`}
          alt=""
          className="shrink-0 w-16 h-12 rounded object-cover ring-1 ring-border"
        />
      )}
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground w-32 truncate pt-0.5" title={entry.id}>
        {entry.id}
      </span>
      <p className="text-sm leading-relaxed flex-1 min-w-0">{entry.text}</p>
    </div>
  )
}
