import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Puzzle, Search, X } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { QuizItem } from "@/api/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { QuizRailRow } from "./QuizRailRow"
import { groupQuizzesByPage } from "./railOrder"
import { RailCollapseButton } from "./SideRail"
import { SegmentedTabs, tabPanelProps } from "@/components/app/screens/pipeline/shared/SegmentedTabs"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export interface PagesRailProps {
  label: string
  pages: PipelinePage[]
  quizzes: QuizItem[]
  activePageId: string | null
  activeQuizIndex: number | null
  onSelect: (pageId: string) => void
  onSelectQuiz: (quizIndex: number) => void
  storyboardRunning?: boolean
  outdatedPageIds?: ReadonlySet<string>
  tab?: RailTab
  onTabChange?: (tab: RailTab) => void
  layers?: React.ReactNode
  layersDisabled?: boolean
}

export type RailTab = "pages" | "layers"

type RailItem =
  | { type: "page"; page: PipelinePage }
  | { type: "quiz"; quiz: QuizItem; pageNumber: number }

const PAGE_ROW_ESTIMATE = 92
const QUIZ_ROW_ESTIMATE = 48

export function PagesRail({
  label,
  pages,
  quizzes,
  activePageId,
  activeQuizIndex,
  onSelect,
  onSelectQuiz,
  storyboardRunning,
  outdatedPageIds,
  tab,
  onTabChange,
  layers,
  layersDisabled = false,
}: PagesRailProps) {
  const { t } = useLingui()

  const [query, setQuery] = useState("")
  const fieldShown = tab !== "layers"
  const needle = fieldShown ? query.trim().toLowerCase() : ""

  const items = useMemo<RailItem[]>(() => {
    const quizzesByPage = groupQuizzesByPage(quizzes)
    const out: RailItem[] = []
    for (const page of pages) {
      if (needle) {
        if (String(page.pageNumber).startsWith(needle) || page.textPreview.toLowerCase().includes(needle)) out.push({ type: "page", page })
        continue
      }
      out.push({ type: "page", page })
      for (const quiz of quizzesByPage.get(page.pageId) ?? []) {
        out.push({ type: "quiz", quiz, pageNumber: page.pageNumber })
      }
    }
    return out
  }, [pages, quizzes, needle])

  const activeIndex = useMemo(
    () =>
      items.findIndex((item) =>
        activeQuizIndex != null
          ? item.type === "quiz" && item.quiz.quizIndex === activeQuizIndex
          : item.type === "page" && item.page.pageId === activePageId,
      ),
    [items, activePageId, activeQuizIndex],
  )

  const idBase = useId()
  const tabbed = !!tab && !!onTabChange
  const focusIndex = activeIndex >= 0 ? activeIndex : 0
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      items[index]?.type === "quiz" ? QUIZ_ROW_ESTIMATE : PAGE_ROW_ESTIMATE,
    overscan: 8,
  })

  useEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: "auto" })
  }, [activeIndex, virtualizer])

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const from = Number((event.target as HTMLElement).closest<HTMLElement>("[data-index]")?.dataset.index ?? focusIndex)
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
    const target = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : step ? from + step : -1
    if (target < 0 || target >= items.length) return
    event.preventDefault()
    virtualizer.scrollToIndex(target, { align: "auto" })
    requestAnimationFrame(() => parentRef.current?.querySelector<HTMLElement>(`[data-index="${target}"] button`)?.focus())
  }

  return (
    <aside aria-label={tabbed ? t`Pages and layers` : t`Pages`} className="flex h-full w-64 shrink-0 flex-col border-r bg-card">
      <div data-chrome="railhead" className="flex h-11 shrink-0 items-center gap-1.5 border-b px-2.5">
        <RailCollapseButton className="size-7 rounded-md" />
        {tab && onTabChange ? (
          <SegmentedTabs
            idBase={idBase}
            label={t`Left panel`}
            value={tab}
            onChange={onTabChange}
            tabs={[
              {
                value: "pages",
                ariaLabel: t`Pages, ${pages.length}`,
                label: (
                  <>
                    <Trans>Pages</Trans>
                    <span aria-hidden className="font-mono text-[10.5px] text-foreground/60">{pages.length}</span>
                  </>
                ),
              },
              { value: "layers", label: <Trans>Layers</Trans>, disabled: layersDisabled, hint: layersDisabled ? t`Quizzes have no layers to edit` : undefined },
            ]}
          />
        ) : (
          <>
            <h2 className="pl-1 text-[13px] font-semibold">
              <Trans>Pages</Trans>
            </h2>
            <span className="mr-auto font-mono text-[11px] text-muted-foreground">{pages.length}</span>
          </>
        )}
      </div>

      {fieldShown && (
        <label className="mx-2.5 mt-2 flex h-8 shrink-0 items-center gap-2 rounded-lg bg-muted/70 px-2.5 transition-[background-color,box-shadow] duration-150 focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-inset">
          <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const first = items.find((item) => item.type === "page")
                if (first?.type === "page") onSelect(first.page.pageId)
              } else if (event.key === "Escape") setQuery("")
            }}
            placeholder={t`Go to page or find text`}
            aria-label={t`Go to page or find text`}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
          />
          {needle && (
            <>
              <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground tabular-nums">{items.length}</span>
              <button type="button" aria-label={t`Clear`} onClick={() => setQuery("")} className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground">
                <X className="size-3" />
              </button>
            </>
          )}
        </label>
      )}
      {needle && items.length === 0 && tab !== "layers" && (
        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground animate-in fade-in duration-200">{t`No pages match “${query.trim()}”.`}</p>
      )}
      {tab === "layers" && (
        <div {...tabPanelProps(idBase, "layers")} className="flex min-h-0 flex-1 flex-col focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
          {layers}
        </div>
      )}
      <ScrollArea
        {...(tabbed ? tabPanelProps(idBase, "pages") : {})}
        tabIndex={-1}
        onKeyDown={moveFocus}
        className={cn("min-h-0 flex-1", tab === "layers" && "hidden")}
        viewportRef={parentRef}
        viewportClassName="px-2.5 pb-2.5 pt-2"
      >
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index]
            const rowStyle: React.CSSProperties = {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }

            if (item.type === "quiz") {
              return (
                <div
                  key={`quiz-${item.quiz.quizIndex}`}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={rowStyle}
                  className="pb-1.5"
                >
                  <QuizRailRow
                    tabIndex={virtualRow.index === focusIndex ? 0 : -1}
                    quiz={item.quiz}
                    pageNumber={item.pageNumber}
                    active={item.quiz.quizIndex === activeQuizIndex}
                    onSelect={() => onSelectQuiz(item.quiz.quizIndex)}
                  />
                </div>
              )
            }

            const page = item.page
            const active = activeQuizIndex == null && page.pageId === activePageId
            const pending = !!storyboardRunning && !page.hasRendering && !page.isDiscarded
            const hasActivity = page.sections.some((s) => s.isActivity && !s.isPruned)
            const outdated = outdatedPageIds?.has(page.pageId) ?? false
            return (
              <div
                key={page.pageId}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={rowStyle}
                className="pb-1.5"
              >
                <button
                  type="button"
                  tabIndex={virtualRow.index === focusIndex ? 0 : -1}
                  onClick={() => onSelect(page.pageId)}
                  aria-label={[
                    t`Page ${page.pageNumber}`,
                    page.isDiscarded ? t`discarded` : null,
                    pending ? t`still being built` : null,
                    outdated ? t`out of date` : null,
                    hasActivity ? t`has an interactive activity` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  aria-current={active ? "page" : undefined}
                  aria-busy={pending || undefined}
                  title={
                    page.isDiscarded
                      ? t`Page ${page.pageNumber} (discarded)`
                      : pending
                        ? t`Page ${page.pageNumber} is still being built`
                        : undefined
                  }
                  style={{ ["--tint" as string]: STORYBOARD_HEX }}
                  className={cn(
                    "flex w-full gap-2.5 rounded-[9px] p-2 text-left transition-[background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                    active
                      ? "bg-[color-mix(in_srgb,var(--tint)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tint)_30%,transparent)] dark:bg-[color-mix(in_srgb,var(--tint)_16%,transparent)]"
                      : "hover:bg-muted",
                    page.isDiscarded && "[&>*]:opacity-50",
                  )}
                >
                  <span className={cn("relative shrink-0 rounded-[6px] transition-shadow duration-150", active && "ring-2 ring-[var(--tint)] ring-offset-1 ring-offset-card")}>
                    <PageThumb
                      label={label}
                      pageId={page.pageId}
                      sectionIndex={page.sections[0]?.sectionIndex ?? null}
                      cacheKey={page.renderingVersion}
                      pruned={page.isDiscarded}
                      pending={pending}
                      className="h-[70px] w-[52px]"
                    />
                    {outdated && (
                      <span
                        title={t`Out of date`}
                        className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-amber-500 text-white ring-1 ring-background"
                      >
                        <AlertTriangle className="size-2.5" />
                      </span>
                    )}
                    {hasActivity && (
                      <span
                        title={t`This page has an interactive activity`}
                        className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-violet-600 text-white ring-1 ring-background"
                      >
                        <Puzzle className="size-2.5" />
                      </span>
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        active && "text-[color-mix(in_srgb,var(--tint)_82%,black)] dark:text-violet-200",
                        page.isDiscarded && "line-through",
                      )}
                    >
                      {t`Page ${page.pageNumber}`}
                    </span>
                    <span className={cn("line-clamp-2 text-[11px] leading-snug", active ? "text-foreground/75" : "text-muted-foreground")}>
                      {page.textPreview || t`No text`}
                    </span>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}
