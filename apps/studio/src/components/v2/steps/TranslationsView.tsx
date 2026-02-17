import { useState, useEffect, useRef, useCallback } from "react"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { TextCatalogEntry, VersionEntry } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStepHeader } from "../StepViewRouter"
import { useStepRun } from "@/hooks/use-step-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StepRunCard } from "../StepRunCard"
import { STEP_DESCRIPTIONS } from "../StepSidebar"
import { cn } from "@/lib/utils"

const langNames = new Intl.DisplayNames(["en"], { type: "language" })
function displayLang(code: string): string {
  try { return langNames.of(code) ?? code } catch { return code }
}

const TRANSLATIONS_SUB_STEPS = [
  { key: "text-catalog", label: "Build Text Catalog" },
  { key: "catalog-translation", label: "Translate Entries" },
]

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

export function TranslationsView({ bookLabel }: { bookLabel: string }) {
  const { setExtra } = useStepHeader()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const queryClient = useQueryClient()
  const { progress: stepProgress, startRun, setSseEnabled } = useStepRun()
  const { apiKey, hasApiKey } = useApiKey()
  const translationsRunning = stepProgress.isRunning && stepProgress.targetSteps.has("translations")

  const handleRunTranslations = useCallback(async () => {
    if (!hasApiKey || translationsRunning) return
    startRun("translations", "translations")
    setSseEnabled(true)
    await api.runSteps(bookLabel, apiKey, { fromStep: "translations", toStep: "translations" })
    queryClient.removeQueries({ queryKey: ["books", bookLabel, "text-catalog"] })
  }, [bookLabel, apiKey, hasApiKey, translationsRunning, startRun, setSseEnabled, queryClient])

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel),
    enabled: !!bookLabel,
  })

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const outputLanguages = (merged?.output_languages as string[] | undefined) ?? []
  const editingLanguage = (merged?.editing_language as string | undefined) ?? "English"

  const [selectedLang, setSelectedLang] = useState<string | null>(null)

  // Default to first output language when available
  useEffect(() => {
    if (outputLanguages.length > 0 && !selectedLang) {
      setSelectedLang(outputLanguages[0])
    }
  }, [outputLanguages.length])

  const entries = catalog?.entries ?? []
  const hasTranslations = outputLanguages.length > 0

  // The editing language code from config (e.g. "fr")
  const editingLangCode = (merged?.editing_language as string | undefined) ?? null

  // Pending state for edits (keyed by language)
  const [pendingEntries, setPendingEntries] = useState<TextCatalogEntry[] | null>(null)
  const [saving, setSaving] = useState(false)

  // When the selected language IS the source/editing language, there is no
  // separate translation — the source catalog entries are already in that language.
  const isSourceLang = selectedLang != null && editingLangCode != null && selectedLang === editingLangCode

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

  useEffect(() => {
    if (!catalog) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{entries.length} texts</span>
        {hasTranslations && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{outputLanguages.length} languages</span>
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
  }, [catalog, entries.length, outputLanguages.length, hasTranslations, selectedLang, translationVersion, saving, dirty, bookLabel, isSourceLang])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading text catalog...</span>
      </div>
    )
  }

  if (!catalog || entries.length === 0 || translationsRunning) {
    return (
      <div className="p-4">
        <StepRunCard
          stepSlug="translations"
          subSteps={TRANSLATIONS_SUB_STEPS}
          description={STEP_DESCRIPTIONS.translations}
          isRunning={translationsRunning}
          onRun={handleRunTranslations}
          disabled={!hasApiKey || translationsRunning}
        />
      </div>
    )
  }

  // No output languages — just show source entries
  if (!hasTranslations) {
    return (
      <div className="space-y-1">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
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
      <div className="space-y-1">
        <div className="grid grid-cols-2 gap-3 px-3 py-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{editingLanguage}</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{selectedLang ? displayLang(selectedLang) : selectedLang}</span>
        </div>
        {entries.map((entry) => {
          const translated = translatedMap.get(entry.id)
          return (
            <div key={entry.id} className="grid grid-cols-2 gap-3 px-3 py-2.5 rounded-md border bg-card">
              <div>
                <span className="text-[10px] text-muted-foreground">{entry.id}</span>
                <p className="text-sm leading-relaxed mt-0.5">{entry.text}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">&nbsp;</span>
                {isSourceLang ? (
                  <p className="text-sm leading-relaxed mt-0.5">{translated ?? ""}</p>
                ) : (
                  <textarea
                    value={translated ?? ""}
                    onChange={(e) => updateEntry(entry.id, e.target.value)}
                    placeholder="Pending..."
                    className="w-full text-sm leading-relaxed mt-0.5 resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors placeholder:text-muted-foreground placeholder:italic"
                    style={{ fieldSizing: "content" } as React.CSSProperties}
                    rows={1}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EntryRow({ entry }: { entry: TextCatalogEntry }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-card">
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground w-32 truncate pt-0.5" title={entry.id}>
        {entry.id}
      </span>
      <p className="text-sm leading-relaxed flex-1 min-w-0">{entry.text}</p>
    </div>
  )
}
