import { useState, useEffect, useRef, useCallback } from "react"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { api } from "@/api/client"
import type { GlossaryOutput, VersionEntry } from "@/api/client"
import { useGlossary } from "@/hooks/use-glossary"
import { useStepHeader } from "../StepViewRouter"
import { useStepRun } from "@/hooks/use-step-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../StageRunCard"
import { STEP_DESCRIPTIONS } from "../StepSidebar"


type GlossaryData = Omit<GlossaryOutput, "version">

function VersionPicker({
  currentVersion,
  saving,
  dirty,
  bookLabel,
  onPreview,
  onSave,
  onDiscard,
}: {
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
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
    const res = await api.getVersionHistory(bookLabel, "glossary", "book", true)
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

export function GlossaryView({ bookLabel }: { bookLabel: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useGlossary(bookLabel)
  const { setExtra } = useStepHeader()
  const { progress: stepProgress, startRun, setSseEnabled } = useStepRun()
  const { apiKey, hasApiKey } = useApiKey()
  const glossaryState = stepProgress.steps.get("glossary")?.state
  const glossaryRunning = glossaryState === "running" || glossaryState === "queued"

  const handleRunGlossary = useCallback(async () => {
    if (!hasApiKey || glossaryRunning) return
    startRun("glossary", "glossary")
    setSseEnabled(true)
    await api.runSteps(bookLabel, apiKey, { fromStep: "glossary", toStep: "glossary" })
    queryClient.removeQueries({ queryKey: ["books", bookLabel, "glossary"] })
  }, [bookLabel, apiKey, hasApiKey, glossaryRunning, startRun, setSseEnabled, queryClient])

  const [pending, setPending] = useState<GlossaryData | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset pending when data changes
  useEffect(() => {
    setPending(null)
  }, [data?.version])

  const effective = pending ?? data
  const items = effective?.items ?? []
  const dirty = pending != null

  const saveGlossary = useCallback(async () => {
    if (!pending) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateGlossary(bookLabel, pending)
    setPending(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "glossary"] })
    await minDelay
    setSaving(false)
  }, [pending, bookLabel, queryClient])

  // Use ref so the header always calls the latest save
  const saveRef = useRef(saveGlossary)
  saveRef.current = saveGlossary

  useEffect(() => {
    if (!data) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{items.length} terms</span>
        <VersionPicker
          currentVersion={data.version}
          saving={saving}
          dirty={dirty}
          bookLabel={bookLabel}
          onPreview={(d) => setPending(d as GlossaryData)}
          onSave={() => saveRef.current()}
          onDiscard={() => setPending(null)}
        />
      </div>
    )
    return () => setExtra(null)
  }, [data, items.length, saving, dirty, bookLabel])

  const updateDefinition = (word: string, newDefinition: string) => {
    const base = pending ?? data
    if (!base) return
    setPending({
      ...base,
      items: base.items.map((item) =>
        item.word === word ? { ...item, definition: newDefinition } : item
      ),
    })
  }

  if (isLoading && !glossaryRunning) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading glossary...</span>
      </div>
    )
  }

  if (items.length === 0 || glossaryRunning) {
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="glossary"
          description={STEP_DESCRIPTIONS.glossary}
          isRunning={glossaryRunning}
          onRun={handleRunGlossary}
          disabled={!hasApiKey || glossaryRunning}
        />
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.word}
          className="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-card"
        >
          <div className="shrink-0 w-32">
            <span className="text-sm font-medium">{item.word}</span>
            {item.emojis.length > 0 && (
              <span className="ml-1.5">{item.emojis.join(" ")}</span>
            )}
          </div>
          <textarea
            value={item.definition}
            onChange={(e) => updateDefinition(item.word, e.target.value)}
            className="flex-1 min-w-0 text-sm text-foreground leading-relaxed resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            rows={1}
          />
          {item.variations.length > 0 && (
            <div className="flex gap-1 shrink-0 flex-wrap">
              {item.variations.map((v) => (
                <Badge key={v} variant="outline" className="text-[10px] h-4 px-1.5">
                  {v}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
