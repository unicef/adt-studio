import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Check, ChevronDown, ChevronRight, ChevronLeft, ExternalLink, List, Loader2, Plus, Search, Trash2, X } from "lucide-react"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import type { TocGenerationOutput, TocEntry, TocSection, VersionEntry } from "@/api/client"
import { useToc } from "@/hooks/use-toc"
import { useStepHeader } from "../../components/StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../../components/StageRunCard"
import { StageContentGuard } from "../../components/StageContentGuard"
import { StageEmptyState } from "../../components/StageEmptyState"
import { TocHintBanner } from "./components/TocHintBanner"
import { VersionPicker } from "../../components/VersionPicker"
import { usePendingChanges } from "../../components/change-summary"

type TocData = Omit<TocGenerationOutput, "version">

const TOOLBAR_HEIGHT = 64

function SectionPicker({
  value,
  sections,
  onChange,
  bookLabel,
}: {
  value: string
  sections: TocSection[]
  onChange: (sectionId: string, href: string) => void
  bookLabel: string
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = filter
    ? sections.filter((s) =>
        s.title.toLowerCase().includes(filter.toLowerCase()) ||
        s.sectionId.toLowerCase().includes(filter.toLowerCase()),
      )
    : sections

  const current = sections.find((s) => s.sectionId === value)
  const previewUrl = `/api/books/${bookLabel}/adt-preview/${value}.html?embed=1`

  return (
    <div ref={ref} className="relative shrink-0">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => { setOpen(!open); setFilter("") }}
          className={`flex items-center gap-1 text-[11px] rounded-md border px-2 py-1 transition-colors max-w-[180px] truncate cursor-pointer ${
            value
              ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
              : "border-dashed border-border/70 bg-transparent text-muted-foreground hover:border-amber-300 hover:text-foreground"
          }`}
          title={value ? t`Linked to: ${value}` : t`No page linked`}
        >
          {current ? t`p${String(current.pageNumber)}` : value ? value.slice(0, 12) : t`Link page`}
          <ChevronDown className="h-2.5 w-2.5 shrink-0" />
        </button>
        {value && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={t`Preview linked page`}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 bg-popover border rounded-lg shadow-xl w-72 py-1 animate-in fade-in zoom-in-95 duration-150">
          <div className="relative border-b border-border/60 p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t`Search sections...`}
              className="w-full h-8 rounded-md bg-muted/40 pl-8 pr-3 text-[12px] placeholder:text-muted-foreground/60 focus:bg-background focus:outline-none focus:ring-2 focus:ring-amber-200 transition-colors"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length > 0 ? (
              filtered.map((s) => (
                <button
                  key={s.sectionId}
                  type="button"
                  onClick={() => {
                    onChange(s.sectionId, s.href)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 transition-colors flex items-center gap-2 ${
                    s.sectionId === value ? "bg-amber-100/70 font-medium" : ""
                  }`}
                >
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums w-6">p{s.pageNumber}</span>
                  <span className="truncate">{s.title}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">{t`No matching sections`}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function TocView({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { data, isLoading } = useToc(bookLabel)
  const { setExtra } = useStepHeader()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const tocState = stageState("toc")
  const tocDone = tocState === "done"
  const tocRunning = tocState === "running" || tocState === "queued"
  const showRunCard = !tocDone || tocRunning

  const { data: sections } = useQuery({
    queryKey: ["books", bookLabel, "toc-sections"],
    queryFn: () => api.getTocSections(bookLabel),
    enabled: !!bookLabel && tocDone,
  })

  const handleRunToc = useCallback(() => {
    if (!hasApiKey || tocRunning) return
    queueRun({ fromStage: "toc", toStage: "toc", apiKey })
  }, [hasApiKey, tocRunning, apiKey, queueRun])

  const [pending, setPending] = useState<TocData | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Reset pending when data changes
  useEffect(() => {
    setPending(null)
  }, [data?.version])

  const effective = pending ?? data
  const entries = effective?.entries ?? []

  const {
    label: pendingLabel,
    labelKey: pendingLabelKey,
    hasChanges: dirty,
  } = usePendingChanges({
    prev: data?.entries ?? [],
    next: pending?.entries,
    keyOf: (e) => e.id,
    isEqual: (a, b) =>
      a.title === b.title &&
      a.sectionId === b.sectionId &&
      a.href === b.href &&
      a.level === b.level,
    noun: { one: t`entry`, other: t`entries` },
  })

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.title.toLowerCase().includes(q))
  }, [entries, searchQuery])

  const saveToc = useCallback(async () => {
    if (!pending) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    try {
      await api.updateToc(bookLabel, pending)
      setPending(null)
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "toc"] })
    } finally {
      await minDelay
      setSaving(false)
    }
  }, [pending, bookLabel, queryClient])

  const saveRef = useRef(saveToc)
  saveRef.current = saveToc

  useEffect(() => {
    if (!data) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">
          {t`${entries.length} entries`}
        </span>
        <VersionPicker
          step="toc-generation"
          itemId="book"
          currentVersion={data.version}
          saving={saving}
          dirty={dirty}
          bookLabel={bookLabel}
          pendingLabel={pendingLabel}
          pendingLabelKey={pendingLabelKey}
          onPreview={(d) => setPending(d as TocData)}
          onSave={() => saveRef.current()}
          onDiscard={() => setPending(null)}
        />
      </div>,
    )
    return () => setExtra(null)
  }, [data, entries.length, saving, dirty, bookLabel, t, setExtra, pendingLabel, pendingLabelKey])

  const updateEntry = (id: string, updates: Partial<TocEntry>) => {
    const base = pending ?? data
    if (!base) return
    setPending({
      ...base,
      entries: base.entries.map((e) =>
        e.id === id ? { ...e, ...updates } : e,
      ),
    })
  }

  const removeEntry = (id: string) => {
    const base = pending ?? data
    if (!base) return
    setPending({
      ...base,
      entries: base.entries.filter((e) => e.id !== id),
    })
  }

  const insertEntry = (afterId: string | null, level: number) => {
    const base = pending ?? data
    if (!base) return
    // Clear any active search so the new entry isn't immediately filtered out.
    setSearchQuery("")
    const newEntry: TocEntry = {
      id: `toc_new_${Date.now()}`,
      title: t`New Entry`,
      sectionId: "",
      href: "",
      chapterId: "",
      level,
    }
    if (afterId == null) {
      setPending({ ...base, entries: [...base.entries, newEntry] })
      return
    }
    const idx = base.entries.findIndex((e) => e.id === afterId)
    if (idx === -1) return
    const updated = [...base.entries]
    updated.splice(idx + 1, 0, newEntry)
    setPending({ ...base, entries: updated })
  }

  const changeLevel = (id: string, delta: number) => {
    const base = pending ?? data
    if (!base) return
    const entry = base.entries.find((e) => e.id === id)
    if (!entry) return
    const newLevel = Math.max(1, Math.min(3, entry.level + delta))
    if (newLevel === entry.level) return
    updateEntry(id, { level: newLevel })
  }

  return (
    <StageContentGuard
      stageSlug="toc"
      isLoading={!showRunCard && isLoading}
      loadingLabel={t`Loading table of contents...`}
      showRunCard={showRunCard || entries.length === 0}
      runCard={
        <StageRunCard
          stageSlug="toc"
          isRunning={tocRunning}
          completed={tocDone}
          onRun={handleRunToc}
          disabled={!hasApiKey || tocRunning}
        />
      }
    >
      <div className="flex flex-1 flex-col overflow-y-auto">
        <TocHintBanner />
        <div
          className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3 bg-background/95 backdrop-blur-md border-b border-border/60"
          style={{ height: TOOLBAR_HEIGHT }}
        >
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t`Search entries…`}
              className="w-full h-8 rounded-md border border-border/70 bg-background pl-8 pr-8 text-[12px] placeholder:text-muted-foreground/60 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={t`Clear search`}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => insertEntry(null, 1)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-600 px-3 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-amber-500 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              {t`Add entry`}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 px-4 pb-12 pt-4">
          {filteredEntries.length === 0 ? (
            <StageEmptyState
              icon={List}
              color="amber"
              title={searchQuery ? t`No entries match your search` : t`No entries yet`}
            />
          ) : (
            filteredEntries.map((entry) => (
              <div
                key={entry.id}
                style={{ marginLeft: (Math.min(entry.level, 3) - 1) * 28 }}
                className="group/row flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 transition-all duration-200 hover:shadow-sm hover:border-amber-300/70"
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.level === 1 ? "bg-amber-500" : "bg-amber-300"}`}
                />
                <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 tabular-nums">
                  {t`L${entry.level}`}
                </span>

                <input
                  type="text"
                  value={entry.title}
                  onChange={(e) => updateEntry(entry.id, { title: e.target.value })}
                  aria-label={t`Entry title`}
                  placeholder={t`Untitled entry`}
                  className="flex-1 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-foreground placeholder:text-muted-foreground/50 placeholder:italic transition-colors hover:border-border/70 hover:bg-muted/30 focus:border-amber-400 focus:bg-background focus:outline-none focus:ring-2 focus:ring-amber-200"
                />

                {sections && (
                  <SectionPicker
                    value={entry.sectionId}
                    sections={sections}
                    bookLabel={bookLabel}
                    onChange={(sectionId, href) => updateEntry(entry.id, { sectionId, href })}
                  />
                )}

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => changeLevel(entry.id, -1)}
                    disabled={entry.level <= 1}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60 cursor-pointer"
                    title={t`Decrease indent`}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeLevel(entry.id, 1)}
                    disabled={entry.level >= 3}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60 cursor-pointer"
                    title={t`Increase indent`}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <span className="mx-0.5 h-4 w-px bg-border/70" aria-hidden />
                  <button
                    type="button"
                    onClick={() => insertEntry(entry.id, entry.level)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                    title={t`Add entry below`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                    title={t`Remove entry`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </StageContentGuard>
  )
}
