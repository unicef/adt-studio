import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, FileText, Loader2, RotateCcw, Search, Sparkles, X } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import type { EasyReadSectionBlock, VersionEntry } from "@/api/client"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useStepHeader } from "../../components/StepViewRouter"
import { StageEmptyState } from "../../components/StageEmptyState"
import { PageJumper, type PageJumperEntry } from "./components/PageJumper"
import { PageCover } from "./components/PageCover"
import { PageLightbox } from "../../components/PageLightbox"

const TOOLBAR_OFFSET = 80

export function EasyReadEditor({
  bookLabel,
  selectedPageId,
  onSelectPage,
  isRunning,
  hasApiKey,
  onRegenerate,
}: {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
  isRunning: boolean
  hasApiKey: boolean
  onRegenerate: () => void
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { setExtra } = useStepHeader()
  const { data } = useQuery({
    queryKey: ["books", bookLabel, "easy-read"],
    queryFn: () => api.getEasyRead(bookLabel),
    enabled: !!bookLabel,
  })
  const [draftBlocks, setDraftBlocks] = useState<EasyReadSectionBlock[] | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const blocks = draftBlocks ?? data?.blocks ?? []
  const dirty = draftBlocks !== null

  const pageScopedBlocks = useMemo(
    () => (selectedPageId ? blocks.filter((block) => block.pageId === selectedPageId) : blocks),
    [blocks, selectedPageId],
  )

  const filteredBlocks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return pageScopedBlocks
    return pageScopedBlocks.filter((block) => {
      if (block.sectionType.toLowerCase().includes(query)) return true
      return block.entries.some(
        (entry) =>
          entry.originalText.toLowerCase().includes(query) ||
          entry.text.toLowerCase().includes(query),
      )
    })
  }, [pageScopedBlocks, searchQuery])

  const filtersActive = searchQuery.trim().length > 0
  const clearFilters = () => setSearchQuery("")

  const pageGroups = useMemo(() => {
    const groups: { pageId: string; pageNumber: number; blocks: EasyReadSectionBlock[] }[] = []
    const indexByPage = new Map<string, number>()
    for (const block of filteredBlocks) {
      let gi = indexByPage.get(block.pageId)
      if (gi === undefined) {
        gi = groups.length
        indexByPage.set(block.pageId, gi)
        groups.push({ pageId: block.pageId, pageNumber: block.pageNumber, blocks: [] })
      }
      groups[gi].blocks.push(block)
    }
    return groups
  }, [filteredBlocks])

  const pageEntries = useMemo<PageJumperEntry[]>(
    () =>
      pageGroups.map((group) => ({
        pageId: group.pageId,
        pageNumber: group.pageNumber,
        preview: group.blocks[0]?.entries[0]?.text || group.blocks[0]?.entries[0]?.originalText || "",
      })),
    [pageGroups],
  )

  // Scroll-spy: track which page's blocks are at the top so the jumper can
  // highlight the active page (same approach as Captions).
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [lightboxPageId, setLightboxPageId] = useState<string | null>(null)

  useEffect(() => {
    const root = scrollContainerRef.current
    if (!root || filteredBlocks.length === 0) return
    let frame = 0
    const computeActive = () => {
      frame = 0
      const cards = root.querySelectorAll<HTMLElement>("[data-page-id]")
      if (cards.length === 0) return
      const rootTop = root.getBoundingClientRect().top
      let current = cards[0].dataset.pageId ?? null
      for (const card of cards) {
        if (card.getBoundingClientRect().top - rootTop <= TOOLBAR_OFFSET) {
          current = card.dataset.pageId ?? current
        } else {
          break
        }
      }
      if (current) setActivePageId(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(computeActive)
    }
    root.addEventListener("scroll", onScroll, { passive: true })
    computeActive()
    return () => {
      root.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [filteredBlocks])

  const handleJumpToPage = useCallback((pageId: string) => {
    const root = scrollContainerRef.current
    if (!root) return
    const card = root.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(pageId)}"]`)
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  useEffect(() => {
    setDraftBlocks(null)
  }, [data?.version])

  const invalidateEasyReadDependents = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "easy-read"] }),
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "text-catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "tts"] }),
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] }),
      queryClient.invalidateQueries({ queryKey: ["package-adt-status", bookLabel] }),
      queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", bookLabel] }),
      queryClient.invalidateQueries({ queryKey: ["debug", "versions", bookLabel, "accessibility-assessment", "book"] }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: async (nextBlocks: EasyReadSectionBlock[]) =>
      api.updateEasyRead(bookLabel, {
        blocks: nextBlocks,
        generatedAt: data?.generatedAt ?? new Date().toISOString(),
      }),
    onSuccess: async () => {
      setDraftBlocks(null)
      await invalidateEasyReadDependents()
    },
  })

  const mutationError = getErrorMessage(saveMutation.error)

  const updateEntry = (
    blockKey: { pageId: string; sectionId: string; sectionIndex: number },
    easyReadId: string,
    text: string,
  ) => {
    const base = draftBlocks ?? data?.blocks ?? []
    setDraftBlocks(base.map((block) => {
      if (
        block.pageId !== blockKey.pageId ||
        block.sectionId !== blockKey.sectionId ||
        block.sectionIndex !== blockKey.sectionIndex
      ) {
        return block
      }
      return {
        ...block,
        entries: block.entries.map((entry) =>
          entry.easyReadId === easyReadId ? { ...entry, text } : entry
        ),
      }
    }))
  }

  // Header controls live in the colored step header (same pattern as Glossary /
  // Quizzes). Refs keep the handlers fresh without re-running the effect on
  // every render.
  const actions = useRef({
    save: () => {},
    discard: () => {},
    preview: (_data: unknown) => {},
    regenerate: () => {},
  })
  actions.current = {
    save: () => saveMutation.mutate(blocks),
    discard: () => setDraftBlocks(null),
    preview: (versionData: unknown) => {
      const next = (versionData as { blocks?: EasyReadSectionBlock[] })?.blocks
      if (next) setDraftBlocks(next)
    },
    regenerate: onRegenerate,
  }

  const currentVersion = data?.version ?? null
  const saving = saveMutation.isPending
  const regenerateDisabled = !hasApiKey || isRunning || dirty

  useEffect(() => {
    setExtra(
      <div className="ml-auto flex items-center gap-1.5">
        {!dirty && !saving && (
          <button
            type="button"
            onClick={() => actions.current.regenerate()}
            disabled={regenerateDisabled}
            title={t`Regenerate Easy Read`}
            className="flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-white/30 disabled:cursor-default disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            {t`Regenerate`}
          </button>
        )}
        <VersionPicker
          currentVersion={currentVersion}
          saving={saving}
          dirty={dirty}
          bookLabel={bookLabel}
          onPreview={(d) => actions.current.preview(d)}
          onSave={() => actions.current.save()}
          onDiscard={() => actions.current.discard()}
        />
      </div>,
    )
    return () => setExtra(null)
  }, [setExtra, t, saving, dirty, currentVersion, regenerateDisabled, bookLabel])

  if (selectedPageId && pageScopedBlocks.length === 0) {
    return (
      <StageEmptyState
        icon={FileText}
        color="fuchsia"
        title={t`No Easy Read for this page`}
        subtitle={t`This page has no simplified text blocks`}
        cta={
          onSelectPage ? (
            <button
              type="button"
              onClick={() => onSelectPage(null)}
              className="text-xs font-medium text-fuchsia-600 transition-colors hover:text-fuchsia-700 hover:underline cursor-pointer"
            >
              {t`Show all pages`}
            </button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div ref={scrollContainerRef} className="flex flex-1 flex-col overflow-y-auto">
      <EasyReadHintBanner />

      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur-md">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t`Search original or Easy Read text…`}
            className="h-8 w-full rounded-md border border-border/70 bg-background pl-8 pr-8 text-[12px] transition-colors placeholder:text-muted-foreground/60 focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label={t`Clear search`}
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!selectedPageId && pageEntries.length > 1 && (
            <PageJumper
              pages={pageEntries}
              activePageId={activePageId}
              onJump={handleJumpToPage}
            />
          )}
          {selectedPageId && onSelectPage && (
            <button
              type="button"
              onClick={() => onSelectPage(null)}
              className="text-[12px] font-medium text-fuchsia-600 transition-colors hover:text-fuchsia-700 hover:underline cursor-pointer"
            >
              {t`Show all pages`}
            </button>
          )}
        </div>
      </div>

      {mutationError && (
        <div className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {mutationError}
        </div>
      )}

      {filteredBlocks.length === 0 ? (
        <div className="flex flex-1 flex-col py-12">
          <StageEmptyState
            icon={Search}
            color="fuchsia"
            title={t`No matching blocks`}
            subtitle={t`Try a different search or filter`}
            cta={
              filtersActive ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-fuchsia-600 transition-colors hover:text-fuchsia-700 hover:underline cursor-pointer"
                >
                  {t`Clear filters`}
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-4 pb-12 pt-4">
          {pageGroups.map((group) => (
            <section
              key={group.pageId}
              data-page-id={group.pageId}
              className="scroll-mt-20 overflow-hidden rounded-xl border border-border/70 bg-card"
            >
              <div className="flex items-center gap-3 border-b border-border/60 bg-muted/20 px-3.5 py-2.5">
                <PageCover
                  bookLabel={bookLabel}
                  pageId={group.pageId}
                  onClick={() => setLightboxPageId(group.pageId)}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-semibold leading-tight text-foreground">
                    {t`Page ${String(group.pageNumber)}`}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {group.blocks.length === 1
                      ? t`1 section`
                      : t`${String(group.blocks.length)} sections`}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-border/60">
                {group.blocks.map((block) => (
                  <div
                    key={`${block.sectionId}:${block.sectionIndex}`}
                    className="p-3.5"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
                            aria-label={t`Generated by AI`}
                          >
                            <Sparkles className="h-3.5 w-3.5 text-fuchsia-600" aria-hidden />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t`Generated by AI`}</TooltipContent>
                      </Tooltip>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t`Section ${String(block.sectionIndex + 1)}`}
                      </span>
                      <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                        {block.sectionType.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {block.entries.map((entry) => {
                        const unchanged = entry.text.trim() === entry.originalText.trim()
                        return (
                          <div key={entry.easyReadId} className="grid gap-3 md:grid-cols-2">
                            <div className="flex flex-col gap-1">
                              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                {t`Original`}
                              </p>
                              <div className="rounded-md border border-border/50 bg-muted/30 p-2.5 text-[13px] leading-relaxed text-muted-foreground">
                                {entry.originalText}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <p
                                className={`text-[10px] font-medium uppercase tracking-wider transition-colors duration-150 ${
                                  unchanged ? "text-muted-foreground/50" : "text-fuchsia-600"
                                }`}
                              >
                                {t`Easy Read`}
                              </p>
                              <AutoTextarea
                                value={entry.text}
                                onChange={(value) => updateEntry(block, entry.easyReadId, value)}
                                disabled={isRunning}
                                muted={unchanged}
                                ariaLabel={t`Easy Read text`}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <PageLightbox
        bookLabel={bookLabel}
        pageId={lightboxPageId}
        open={lightboxPageId != null}
        onOpenChange={(open) => {
          if (!open) setLightboxPageId(null)
        }}
      />
    </div>
  )
}

/** Version dropdown that doubles as a Save/Discard control while editing —
 * mirrors the Glossary / Quizzes header affordance, themed for Easy Read. */
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
  const { t } = useLingui()
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
    const res = await api.getVersionHistory(bookLabel, "easy-read", "book", true)
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
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
  }

  if (dirty) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded bg-black/15 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-black/25 cursor-pointer"
        >
          {t`Discard`}
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-fuchsia-800 transition-colors hover:bg-white/80 cursor-pointer"
        >
          <Check className="h-3 w-3" />
          {t`Save`}
        </button>
      </div>
    )
  }

  if (currentVersion == null) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-0.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-normal tabular-nums normal-case tracking-normal text-white transition-colors hover:bg-white/30 cursor-pointer"
      >
        v{currentVersion}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[80px] rounded border bg-popover py-1 shadow-md animate-in fade-in zoom-in-95 duration-150">
          {loading ? (
            <div className="flex items-center justify-center px-3 py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            versions.map((v) => (
              <button
                key={v.version}
                type="button"
                onClick={() => handlePick(v)}
                className={`w-full px-3 py-1 text-left text-xs transition-colors hover:bg-accent cursor-pointer ${
                  v.version === currentVersion ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                v{v.version}
              </button>
            ))
          ) : (
            <div className="px-3 py-1 text-xs text-muted-foreground">{t`No versions`}</div>
          )}
        </div>
      )}
    </div>
  )
}

/** Textarea that grows to fit its content, with the inline-edit affordance used
 * across the gallery: dashed resting border, fuchsia focus ring. */
function AutoTextarea({
  value,
  onChange,
  disabled,
  muted,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  muted?: boolean
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
      disabled={disabled}
      aria-label={ariaLabel}
      rows={1}
      className={`w-full resize-none overflow-hidden rounded-md border border-dashed border-border/60 bg-background/40 p-2.5 text-[13px] leading-relaxed text-foreground transition-all duration-150 hover:border-fuchsia-300 hover:bg-fuchsia-50/40 focus:border-solid focus:border-fuchsia-400 focus:bg-background focus:outline-none focus:ring-2 focus:ring-fuchsia-200 disabled:opacity-60 ${
        muted ? "opacity-55 hover:opacity-100 focus:opacity-100" : ""
      }`}
    />
  )
}

function EasyReadHintBanner() {
  const { t } = useLingui()
  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/60 px-4 py-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-700">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-fuchsia-900">
          {t`How Easy Read works`}
        </span>
        <p className="text-[12px] leading-relaxed text-fuchsia-800/80">
          {t`Each block was simplified by AI. Edit any Easy Read text to refine it against the original, then Save. Changes are stored as a new version, so you can always roll back or regenerate.`}
        </p>
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return null
}
