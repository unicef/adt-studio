import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowDownZA,
  ArrowUpDown,
  ArrowUpNarrowWide,
  BookOpen,
  Check,
  ChevronDown,
  EyeOff,
  Hash,
  ImagePlus,
  ListOrdered,
  Loader2,
  MapPin,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Video,
  X,
  type LucideIcon,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api, BASE_URL, getSignLanguageVideoUrl } from "@/api/client"
import type { GlossaryItem, GlossaryOutput, SignLanguageVideo, VersionEntry } from "@/api/client"
import { useGlossary } from "@/hooks/use-glossary"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import {
  useSignLanguageVideos,
  useUploadSignLanguageVideo,
  useAssignSignLanguageVideo,
  useDeleteSignLanguageVideo,
} from "@/hooks/use-sign-language-videos"
import { getGlossaryItemTextId } from "@/lib/glossary-video"
import { useStepHeader } from "../../components/StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../../components/StageRunCard"
import { StageContentGuard } from "../../components/StageContentGuard"
import { FilteredEmptyState } from "../../components/FilteredEmptyState"
import { VersionPicker } from "../../components/VersionPicker"
import { usePendingChanges } from "../../components/change-summary"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLingui } from "@lingui/react/macro"
import { AddGlossaryDialog } from "./AddGlossaryDialog"
import { GlossaryImagePickerDialog } from "./components/GlossaryImagePickerDialog"
import { GlossaryHintBanner } from "./components/GlossaryHintBanner"
import { useGlossaryOccurrences, type TermOccurrence } from "./lib/occurrences"


type GlossaryData = Omit<GlossaryOutput, "version">
type GlossaryFilter = "all" | "active" | "pruned"
type SortMode = "default" | "az" | "za" | "usage-desc" | "usage-asc"

const TOOLBAR_HEIGHT = 64

function createEmptyGlossary(): GlossaryData {
  return {
    items: [],
    pageCount: 0,
    generatedAt: new Date().toISOString(),
  }
}

export function GlossaryView({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { data, isLoading } = useGlossary(bookLabel)
  const { setExtra } = useStepHeader()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const glossaryState = stageState("glossary")
  const glossaryDone = glossaryState === "done"
  const glossaryRunning = glossaryState === "running" || glossaryState === "queued"

  const handleRunGlossary = useCallback(() => {
    if (!hasApiKey || glossaryRunning) return
    queueRun({ fromStage: "glossary", toStage: "glossary", apiKey })
  }, [hasApiKey, glossaryRunning, apiKey, queueRun])

  const [pending, setPending] = useState<GlossaryData | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState<GlossaryFilter>("active")
  const [manualOnly, setManualOnly] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>("default")

  // Reset pending when data changes
  useEffect(() => {
    setPending(null)
  }, [data?.version])

  const effective = pending ?? data ?? null
  const items = effective?.items ?? []
  const {
    label: pendingLabel,
    labelKey: pendingLabelKey,
    hasChanges: dirty,
  } = usePendingChanges({
    prev: data?.items ?? [],
    next: pending?.items,
    keyOf: (i) => i.id ?? i.word,
    isEqual: (a, b) =>
      a.word === b.word &&
      a.definition === b.definition &&
      a.emojis.join("|") === b.emojis.join("|") &&
      a.variations.join("|") === b.variations.join("|") &&
      (a.imageId ?? "") === (b.imageId ?? "") &&
      !!a.pruned === !!b.pruned,
    classifyChanged: (before, after) =>
      !!after.pruned && !before.pruned ? "pruned" : "edited",
    noun: { one: t`term`, other: t`terms` },
  })
  const currentVersion = data?.version ?? null
  const prunedCount = useMemo(() => items.filter((item) => item.pruned).length, [items])
  const manualCount = useMemo(() => items.filter((item) => item.source === "manual").length, [items])
  const visibleCount = items.length - prunedCount
  const { byItem: occurrences, isLoading: occurrencesLoading } = useGlossaryOccurrences(
    bookLabel,
    items,
  )
  const { data: signVideosData } = useSignLanguageVideos(bookLabel)

  // Text-catalog id per item, computed over the FULL items array (including
  // pruned items) to match the pipeline's getGlossaryItemTextId. Sign-language
  // videos attach to glossary items via this id.
  const textIdByItem = useMemo(() => {
    const map = new Map<GlossaryItem, string>()
    items.forEach((item, index) => map.set(item, getGlossaryItemTextId(item, index)))
    return map
  }, [items])

  const signVideoBySectionId = useMemo(() => {
    const map = new Map<string, SignLanguageVideo>()
    for (const video of signVideosData?.videos ?? []) {
      if (video.sectionId) map.set(video.sectionId, video)
    }
    return map
  }, [signVideosData])

  // Don't strand the "Manual only" filter active-but-disabled when the last
  // manual term is removed — turn it off so the list isn't stuck empty.
  useEffect(() => {
    if (manualCount === 0) setManualOnly(false)
  }, [manualCount])

  const displayItems = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase()
    const list = items.filter((item) => {
      if (filter === "active" && item.pruned) return false
      if (filter === "pruned" && !item.pruned) return false
      if (manualOnly && item.source !== "manual") return false
      if (!q) return true
      const haystack = [item.word, item.definition, ...item.variations]
        .join(" ")
        .toLocaleLowerCase()
      return haystack.includes(q)
    })
    const usage = (item: GlossaryItem) => occurrences.get(item.id ?? item.word)?.count ?? 0
    const firstPage = (item: GlossaryItem) =>
      occurrences.get(item.id ?? item.word)?.pages[0] ?? Infinity
    const byWord = (a: GlossaryItem, b: GlossaryItem) =>
      a.word.localeCompare(b.word, undefined, { sensitivity: "base" })
    const sorted = [...list]
    switch (sortMode) {
      case "default":
        sorted.sort((a, b) => firstPage(a) - firstPage(b) || byWord(a, b))
        break
      case "az":
        sorted.sort(byWord)
        break
      case "za":
        sorted.sort((a, b) => byWord(b, a))
        break
      case "usage-desc":
        sorted.sort((a, b) => usage(b) - usage(a) || byWord(a, b))
        break
      case "usage-asc":
        sorted.sort((a, b) => usage(a) - usage(b) || byWord(a, b))
        break
    }
    return sorted
  }, [items, searchQuery, filter, manualOnly, sortMode, occurrences])

  const openAddDialog = useCallback(() => {
    setShowAddDialog(true)
  }, [])

  const saveGlossary = useCallback(async () => {
    if (!pending) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    const result = await api.updateGlossary(bookLabel, pending)
    setPending(null)
    if (result.imageRequirementsChanged) {
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      invalidateStoryboardDependents(queryClient, bookLabel)
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "glossary"] }),
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "text-catalog"] }),
    ])
    await minDelay
    setSaving(false)
  }, [pending, bookLabel, queryClient])

  // Use ref so the header always calls the latest save
  const saveRef = useRef(saveGlossary)
  saveRef.current = saveGlossary

  useEffect(() => {
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(visibleCount)} terms`}</span>
        <VersionPicker
          step="glossary"
          itemId="book"
          currentVersion={currentVersion}
          saving={saving}
          dirty={dirty}
          bookLabel={bookLabel}
          saveDisabledReason={glossaryRunning ? t`Wait for glossary generation to finish` : undefined}
          pendingLabel={pendingLabel}
          pendingLabelKey={pendingLabelKey}
          onRestored={() => setPending(null)}
          onSave={() => saveRef.current()}
          onDiscard={() => setPending(null)}
          diff={{
            items: (d) => (d as GlossaryData | null)?.items?.filter((i) => !i.pruned) ?? [],
            keyOf: (it) => (it as GlossaryItem).id ?? (it as GlossaryItem).word,
            diffText: (it) => (it as GlossaryItem).definition ?? "",
            searchText: (it) => {
              const item = it as GlossaryItem
              return `${item.word} ${item.definition ?? ""}`
            },
            searchPlaceholder: t`Search terms or definitions…`,
            renderItem: (it, ctx) => {
              const item = it as GlossaryItem
              return (
                <span>
                  <span className="font-semibold text-foreground">
                    {item.emojis?.[0] ? `${item.emojis[0]} ` : ""}
                    {item.word}
                  </span>
                  {ctx?.diff ? (
                    <span className="text-muted-foreground"> — {ctx.diff}</span>
                  ) : item.definition ? (
                    <span className="text-muted-foreground"> — {item.definition}</span>
                  ) : null}
                </span>
              )
            },
          }}
        />
      </div>
    )
    return () => setExtra(null)
  }, [visibleCount, saving, dirty, bookLabel, currentVersion, glossaryRunning, t, setExtra, pendingLabel, pendingLabelKey])

  const updateDefinition = (itemId: string, newDefinition: string) => {
    const base = pending ?? data ?? createEmptyGlossary()
    if (!base) return
    setPending({
      ...base,
      generatedAt: base.generatedAt || new Date().toISOString(),
      items: base.items.map((item) =>
        (item.id ?? item.word) === itemId
          ? { ...item, definition: newDefinition, source: "manual" }
          : item
      ),
    })
  }

  const updateEmojis = (itemId: string, newEmojis: string[]) => {
    const base = pending ?? data ?? createEmptyGlossary()
    if (!base) return
    setPending({
      ...base,
      generatedAt: base.generatedAt || new Date().toISOString(),
      items: base.items.map((item) =>
        (item.id ?? item.word) === itemId
          ? { ...item, emojis: newEmojis, source: "manual" }
          : item
      ),
    })
  }

  const updateImageId = (itemId: string, newImageId: string | undefined) => {
    const base = pending ?? data ?? createEmptyGlossary()
    if (!base) return
    setPending({
      ...base,
      generatedAt: base.generatedAt || new Date().toISOString(),
      items: base.items.map((item) =>
        (item.id ?? item.word) === itemId
          ? { ...item, imageId: newImageId }
          : item
      ),
    })
  }

  const removeManualItem = (itemId: string) => {
    const base = pending ?? data ?? createEmptyGlossary()
    setPending({
      ...base,
      generatedAt: base.generatedAt || new Date().toISOString(),
      items: base.items.filter((item) => (item.id ?? item.word) !== itemId),
    })
  }

  const togglePruned = (itemId: string, pruned: boolean) => {
    const base = pending ?? data ?? createEmptyGlossary()
    setPending({
      ...base,
      generatedAt: base.generatedAt || new Date().toISOString(),
      items: base.items.map((item) =>
        (item.id ?? item.word) === itemId ? { ...item, pruned } : item
      ),
    })
  }

  const addManualItem = (manualItem: GlossaryItem) => {
    const base = pending ?? data ?? createEmptyGlossary()
    setPending({
      ...base,
      generatedAt: base.generatedAt || new Date().toISOString(),
      items: [...base.items, manualItem],
    })
  }

  const chipBase =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-200 cursor-pointer"

  return (
    <StageContentGuard
      stageSlug="glossary"
      isLoading={isLoading && !effective}
      loadingLabel={t`Loading glossary...`}
      showRunCard={items.length === 0}
      runCard={
        <>
          <StageRunCard
            stageSlug="glossary"
            isRunning={glossaryRunning}
            completed={glossaryDone}
            onRun={handleRunGlossary}
            disabled={!hasApiKey || glossaryRunning}
          />
          <AddGlossaryDialog
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
            bookLabel={bookLabel}
            existingItems={items}
            onAdd={addManualItem}
          />
        </>
      }
    >
      <div className="flex flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
        <GlossaryHintBanner />
        <div
          className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3 bg-background/95 backdrop-blur-md border-b border-border/60"
          style={{ height: TOOLBAR_HEIGHT }}
        >
          <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5">
            {([
              { value: "all", label: t`All`, count: items.length },
              { value: "active", label: t`Active`, count: visibleCount },
              { value: "pruned", label: t`Pruned`, count: prunedCount },
            ] as const).map((opt) => {
              const active = filter === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  aria-pressed={active}
                  className={`${chipBase} ${
                    active
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`tabular-nums text-[11px] ${
                      active
                        ? opt.value === "pruned"
                          ? "text-muted-foreground"
                          : "text-lime-700"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setManualOnly((v) => !v)}
            role="switch"
            aria-checked={manualOnly}
            disabled={manualCount === 0}
            title={
              manualCount === 0
                ? t`You haven't added any terms manually yet`
                : manualOnly
                  ? t`Showing only terms you added — click to show all`
                  : t`Show only the terms you added manually`
            }
            className={`group/manual inline-flex h-8 shrink-0 items-center gap-2 rounded-md border pl-1.5 pr-2.5 text-[12px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              manualOnly
                ? "border-lime-300 bg-lime-50 text-lime-800"
                : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
                manualOnly
                  ? "bg-lime-600 text-white"
                  : "border border-muted-foreground/40 group-hover/manual:border-muted-foreground/70"
              }`}
            >
              {manualOnly ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <PencilLine className="h-2.5 w-2.5 text-muted-foreground/70" />
              )}
            </span>
            {t`Manual only`}
            <span className={`tabular-nums text-[11px] ${manualOnly ? "text-lime-700/70" : "text-muted-foreground/60"}`}>
              {manualCount}
            </span>
          </button>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t`Search terms or definitions…`}
              className="w-full h-8 rounded-md border border-border/70 bg-background pl-8 pr-8 text-[12px] placeholder:text-muted-foreground/60 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-200 transition-colors"
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
            <SortMenu value={sortMode} onChange={setSortMode} />
            <button
              type="button"
              onClick={openAddDialog}
              disabled={glossaryRunning}
              title={glossaryRunning ? t`Wait for glossary generation to finish` : undefined}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-lime-600 px-3 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-lime-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              {t`Add Term`}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-4 pb-12 pt-4">
          {displayItems.length === 0 ? (
            <FilteredEmptyState
              icon={BookOpen}
              color="lime"
              title={
                searchQuery
                  ? t`No terms match your search`
                  : manualOnly
                    ? t`No manual terms yet`
                    : filter === "pruned"
                      ? t`No pruned terms`
                      : t`No terms to show`
              }
              onClear={
                searchQuery || manualOnly || filter !== "active"
                  ? () => {
                      setSearchQuery("")
                      setManualOnly(false)
                      setFilter("active")
                    }
                  : undefined
              }
              clearLabel={searchQuery ? t`Clear search` : t`Clear filters`}
            />
          ) : (
            displayItems.map((item) => {
              const textId = textIdByItem.get(item) ?? ""
              return (
                <GlossaryItemCard
                  key={item.id ?? item.word}
                  item={item}
                  bookLabel={bookLabel}
                  textId={textId}
                  signVideo={signVideoBySectionId.get(textId) ?? null}
                  signVideos={signVideosData?.videos ?? []}
                  occurrence={occurrences.get(item.id ?? item.word)}
                  occurrenceLoading={occurrencesLoading}
                  onDefinitionChange={updateDefinition}
                  onEmojisChange={updateEmojis}
                  onImageIdChange={updateImageId}
                  onRemoveManual={removeManualItem}
                  onTogglePruned={togglePruned}
                />
              )
            })
          )}
        </div>

        <AddGlossaryDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          bookLabel={bookLabel}
          existingItems={items}
          onAdd={addManualItem}
        />
      </div>
    </StageContentGuard>
  )
}

function SortMenu({
  value,
  onChange,
}: {
  value: SortMode
  onChange: (mode: SortMode) => void
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const groups: {
    label?: string
    options: { value: SortMode; label: string; icon: LucideIcon }[]
  }[] = [
    { options: [{ value: "default", label: t`Book order`, icon: ListOrdered }] },
    {
      label: t`Alphabetical`,
      options: [
        { value: "az", label: t`A → Z`, icon: ArrowDownAZ },
        { value: "za", label: t`Z → A`, icon: ArrowDownZA },
      ],
    },
    {
      label: t`By usage`,
      options: [
        { value: "usage-desc", label: t`Most used`, icon: ArrowDownWideNarrow },
        { value: "usage-asc", label: t`Least used`, icon: ArrowUpNarrowWide },
      ],
    },
  ]
  const allOptions = groups.flatMap((g) => g.options)
  const current = allOptions.find((o) => o.value === value) ?? allOptions[0]
  const isSorted = value !== "default"

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border pl-2.5 pr-2 text-[12px] font-medium transition-colors cursor-pointer ${
          isSorted
            ? "border-lime-300 bg-lime-50 text-lime-800"
            : "border-border/70 bg-background text-foreground hover:bg-muted/60"
        }`}
      >
        <ArrowUpDown className={`h-3.5 w-3.5 ${isSorted ? "text-lime-600" : "text-muted-foreground"}`} />
        <span className={isSorted ? "text-lime-700/70" : "text-muted-foreground"}>{t`Sort`}</span>
        <span>{current.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isSorted ? "text-lime-600" : "text-muted-foreground"} ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-lg border border-border bg-popover shadow-xl p-1 animate-in fade-in zoom-in-95 duration-150"
        >
          {groups.map((group, gi) => (
            <div key={group.label ?? "default"}>
              {gi > 0 && <div className="my-1 border-t border-border/50" />}
              {group.label && (
                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </div>
              )}
              {group.options.map((o) => {
                const Icon = o.icon
                const active = o.value === value
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors cursor-pointer ${
                      active
                        ? "bg-lime-50 font-medium text-lime-800"
                        : "text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-lime-600" : "text-muted-foreground"}`} />
                    <span className="flex-1">{o.label}</span>
                    {active && <Check className="h-3.5 w-3.5 text-lime-600" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GlossaryItemCard({
  item,
  bookLabel,
  textId,
  signVideo,
  signVideos,
  occurrence,
  occurrenceLoading,
  onDefinitionChange,
  onEmojisChange,
  onImageIdChange,
  onRemoveManual,
  onTogglePruned,
}: {
  item: GlossaryItem
  bookLabel: string
  textId: string
  signVideo: SignLanguageVideo | null
  signVideos: SignLanguageVideo[]
  occurrence?: TermOccurrence
  occurrenceLoading: boolean
  onDefinitionChange: (itemId: string, definition: string) => void
  onEmojisChange: (itemId: string, emojis: string[]) => void
  onImageIdChange: (itemId: string, imageId: string | undefined) => void
  onRemoveManual: (itemId: string) => void
  onTogglePruned: (itemId: string, pruned: boolean) => void
}) {
  const { t } = useLingui()
  const itemId = item.id ?? item.word
  const isPruned = item.pruned === true
  const isManual = item.source === "manual"

  const sourceLabel = isManual ? t`Added manually` : t`Generated by AI`

  return (
    <div
      className={`relative flex flex-col gap-2.5 rounded-xl border p-3.5 ${
        isPruned
          ? "border-border/50 bg-muted/20 opacity-70"
          : "border-border/70 bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
                  aria-label={sourceLabel}
                >
                  {isManual ? (
                    <PencilLine className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-lime-600" aria-hidden />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>{sourceLabel}</TooltipContent>
            </Tooltip>
            <span
              className={`text-[14px] font-semibold leading-tight ${
                isPruned ? "text-muted-foreground line-through" : "text-foreground"
              }`}
            >
              {item.word}
            </span>
          </span>
          <EmojiInput
            value={item.emojis}
            onChange={(next) => onEmojisChange(itemId, next)}
            placeholder={t`emoji`}
          />
          {isPruned && (
            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t`Pruned`}
            </span>
          )}
          {item.variations.map((v) => (
            <span
              key={v}
              className="inline-flex items-center rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {v}
            </span>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {isManual ? (
            <button
              type="button"
              onClick={() => onRemoveManual(itemId)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              title={t`Remove manual glossary term`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : isPruned ? (
            <button
              type="button"
              onClick={() => onTogglePruned(itemId, false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              title={t`Restore this term — it will be eligible again on the next regeneration.`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onTogglePruned(itemId, true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              title={t`Prune this term — it will be hidden from output and excluded from future regenerations.`}
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <AutoTextarea
        value={item.definition}
        onChange={(val) => onDefinitionChange(itemId, val)}
        placeholder={t`Add a definition…`}
        ariaLabel={t`Definition for ${item.word}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TermOccurrenceMeta occurrence={occurrence} loading={occurrenceLoading} />
        {/* Pruned items are excluded from output — hide the media affordances. */}
        {!isPruned && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <GlossaryItemPicture
              bookLabel={bookLabel}
              imageId={item.imageId}
              word={item.word}
              onChange={(imageId) => onImageIdChange(itemId, imageId)}
            />
            <GlossarySignVideo
              bookLabel={bookLabel}
              textId={textId}
              video={signVideo}
              videos={signVideos}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** Compact picture affordance for a glossary item: thumbnail with a remove
 * (×) affordance when an image is set, otherwise an "Add picture" button that
 * opens the single-select image picker. */
function GlossaryItemPicture({
  bookLabel,
  imageId,
  word,
  onChange,
}: {
  bookLabel: string
  imageId: string | undefined
  word: string
  onChange: (imageId: string | undefined) => void
}) {
  const { t } = useLingui()
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <>
      {imageId ? (
        <span className="group/pic relative inline-flex">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title={t`Change the picture for this term`}
            className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/30 transition-all hover:ring-2 hover:ring-lime-300 cursor-pointer"
          >
            <img
              src={`${BASE_URL}/books/${bookLabel}/images/${imageId}`}
              alt={t`Picture for ${word}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={t`Remove picture`}
            title={t`Remove picture`}
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover/pic:opacity-100 focus-visible:opacity-100 cursor-pointer"
          >
            <X className="h-2.5 w-2.5" strokeWidth={3} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border/70 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-lime-300 hover:bg-lime-50 hover:text-lime-700 cursor-pointer"
        >
          <ImagePlus className="h-3 w-3" aria-hidden />
          {t`Add picture`}
        </button>
      )}
      {pickerOpen && (
        <GlossaryImagePickerDialog
          bookLabel={bookLabel}
          initialSelected={imageId}
          onConfirm={(nextImageId) => {
            onChange(nextImageId)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}

/** Compact sign-language-video affordance for a glossary item: upload +
 * assign to the item's text-catalog id when missing, otherwise a popover
 * preview with a remove (delete) button. */
function GlossarySignVideo({
  bookLabel,
  textId,
  video,
  videos,
}: {
  bookLabel: string
  textId: string
  video: SignLanguageVideo | null
  videos: SignLanguageVideo[]
}) {
  const { t } = useLingui()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const uploadMutation = useUploadSignLanguageVideo(bookLabel)
  const assignMutation = useAssignSignLanguageVideo(bookLabel)
  const deleteMutation = useDeleteSignLanguageVideo(bookLabel)
  const busy = uploadMutation.isPending || assignMutation.isPending
  const unassignedVideos = videos.filter((candidate) => !candidate.sectionId)

  const assignVideo = (videoId: string) => {
    assignMutation.mutate(
      { videoId, sectionId: textId },
      { onSuccess: () => setPickerOpen(false) },
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    uploadMutation.mutate(file, {
      onSuccess: (data) => {
        if (data?.videoId) {
          assignVideo(data.videoId)
        }
      },
    })
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={handleFileChange}
      />
      {video ? (
        <span className="inline-flex items-center gap-0.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={video.originalName}
                className="inline-flex h-7 max-w-44 items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 text-[11px] font-medium text-cyan-800 transition-colors hover:border-cyan-300 hover:bg-cyan-100 cursor-pointer"
              >
                <Video className="h-3 w-3 shrink-0 text-cyan-600" aria-hidden />
                <span className="truncate">{video.originalName}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="end">
              <video
                src={getSignLanguageVideoUrl(bookLabel, video.videoId)}
                className="w-full rounded"
                controls
                preload="metadata"
              />
              <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={video.originalName}>
                {video.originalName}
              </p>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={() => deleteMutation.mutate(video.videoId)}
            disabled={deleteMutation.isPending}
            aria-label={t`Remove sign language video`}
            title={t`Remove sign language video`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 cursor-pointer"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3 w-3" aria-hidden />
            )}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border/70 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Video className="h-3 w-3" aria-hidden />
          )}
          {t`Add sign language video`}
        </button>
      )}

      <Dialog
        open={!video && pickerOpen}
        onOpenChange={(open) => {
          if (!busy) setPickerOpen(open)
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t`Add sign language video`}</DialogTitle>
            <DialogDescription>
              {t`Choose a previously uploaded video or upload a new one.`}
            </DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md bg-cyan-600 px-3 text-xs font-medium text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            {t`Upload new video`}
          </button>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground">
              {t`Previously uploaded videos`}
            </h4>
            {unassignedVideos.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                {t`No unassigned videos are available.`}
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {unassignedVideos.map((candidate) => {
                  const assigning =
                    assignMutation.isPending &&
                    assignMutation.variables?.videoId === candidate.videoId
                  const deleting =
                    deleteMutation.isPending &&
                    deleteMutation.variables === candidate.videoId
                  return (
                    <li
                      key={candidate.videoId}
                      className="flex items-center gap-3 rounded-lg border bg-card p-2"
                    >
                      <video
                        src={getSignLanguageVideoUrl(bookLabel, candidate.videoId)}
                        className="h-16 w-24 shrink-0 rounded bg-black object-contain"
                        controls
                        muted
                        preload="metadata"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-foreground"
                          title={candidate.originalName}
                        >
                          {candidate.originalName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t`Unassigned`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => assignVideo(candidate.videoId)}
                        disabled={busy || deleteMutation.isPending}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-cyan-600 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-50"
                      >
                        {assigning ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : (
                          <Check className="h-3 w-3" aria-hidden />
                        )}
                        {t`Use video`}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(candidate.videoId)}
                        disabled={busy || deleteMutation.isPending}
                        aria-label={t`Delete video from book`}
                        title={t`Delete video from book`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {deleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Shows how often the term appears in the book and on which pages. */
function TermOccurrenceMeta({
  occurrence,
  loading,
}: {
  occurrence?: TermOccurrence
  loading: boolean
}) {
  const { t } = useLingui()

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/40" />
        {t`Counting occurrences…`}
      </div>
    )
  }

  const count = occurrence?.count ?? 0
  const pages = occurrence?.pages ?? []

  if (count === 0) {
    return (
      <p className="text-[11px] italic text-muted-foreground/60">
        {t`Not found in the book text`}
      </p>
    )
  }

  const shown = pages.slice(0, 8)
  const shownStr = shown.join(", ")
  const more = pages.length - shown.length

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1 font-medium text-foreground/70">
        <Hash className="h-3 w-3 text-lime-600" aria-hidden />
        <span className="tabular-nums">{t`${String(count)}×`}</span>
        <span className="font-normal text-muted-foreground">{t`in the book`}</span>
      </span>
      {pages.length > 0 && (
        <span
          className="inline-flex items-center gap-1"
          title={t`Appears on pages ${pages.join(", ")}`}
        >
          <span className="text-muted-foreground/40">·</span>
          <MapPin className="h-3 w-3 text-muted-foreground/60" aria-hidden />
          <span className="tabular-nums">
            {pages.length === 1 ? t`page ${shownStr}` : t`pages ${shownStr}`}
            {more > 0 ? t` +${String(more)} more` : ""}
          </span>
        </span>
      )}
    </div>
  )
}

/** Textarea that grows to fit its content and matches the inline-edit affordance
 * used across the gallery: dashed resting border, lime focus ring. */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={1}
      className="w-full resize-none overflow-hidden rounded-md border border-dashed border-border/60 bg-background/40 p-2.5 text-[13px] leading-relaxed text-foreground transition-colors duration-150 hover:border-lime-300 hover:bg-lime-50/40 focus:border-solid focus:border-lime-400 focus:bg-background focus:outline-none focus:ring-2 focus:ring-lime-200"
    />
  )
}

/** Inline editor for an emoji list. Stores a draft string while the field is
 * focused so spaces can be typed naturally; commits to a deduped, whitespace-
 * split array on blur or Enter. */
function EmojiInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? value.join(" ")

  const commit = () => {
    if (draft === null) return
    const parsed = Array.from(new Set(draft.split(/\s+/).filter(Boolean)))
    if (parsed.length !== value.length || parsed.some((e, i) => e !== value[i])) {
      onChange(parsed)
    }
    setDraft(null)
  }

  return (
    <input
      type="text"
      value={display}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === "Escape") {
          e.preventDefault()
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
      className="w-20 shrink-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[14px] transition-colors hover:border-border hover:bg-muted/40 focus:border-lime-400 focus:bg-background focus:outline-none focus:ring-2 focus:ring-lime-200"
    />
  )
}
