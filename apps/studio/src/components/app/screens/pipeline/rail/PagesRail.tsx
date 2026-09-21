import { useEffect, useMemo, useRef } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Puzzle } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { QuizItem } from "@/api/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { QuizRailRow } from "./QuizRailRow"
import { groupQuizzesByPage } from "./railOrder"
import { RailCollapseButton } from "./SideRail"
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
}

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
}: PagesRailProps) {
  const { t } = useLingui()

  const items = useMemo<RailItem[]>(() => {
    const quizzesByPage = groupQuizzesByPage(quizzes)
    const out: RailItem[] = []
    for (const page of pages) {
      out.push({ type: "page", page })
      for (const quiz of quizzesByPage.get(page.pageId) ?? []) {
        out.push({ type: "quiz", quiz, pageNumber: page.pageNumber })
      }
    }
    return out
  }, [pages, quizzes])

  const activeIndex = useMemo(
    () =>
      items.findIndex((item) =>
        activeQuizIndex != null
          ? item.type === "quiz" && item.quiz.quizIndex === activeQuizIndex
          : item.type === "page" && item.page.pageId === activePageId,
      ),
    [items, activePageId, activeQuizIndex],
  )

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

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Trans>Pages</Trans>
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{pages.length}</span>
        <RailCollapseButton className="-mr-1" />
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportRef={parentRef} viewportClassName="px-2.5 pb-2.5">
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
                  onClick={() => onSelect(page.pageId)}
                  aria-current={active ? "page" : undefined}
                  aria-busy={pending || undefined}
                  title={
                    page.isDiscarded
                      ? t`Page ${page.pageNumber} (discarded)`
                      : pending
                        ? t`Page ${page.pageNumber} is still being built`
                        : undefined
                  }
                  className={cn(
                    "flex w-full gap-2.5 rounded-[9px] p-2 text-left transition-colors",
                    active
                      ? "bg-brand-50 shadow-[inset_0_0_0_1px_var(--brand-200)]"
                      : "hover:bg-muted",
                    page.isDiscarded && "opacity-50",
                  )}
                >
                  <span className="relative shrink-0">
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
                        active && "text-brand-700",
                        page.isDiscarded && "line-through",
                      )}
                    >
                      {t`Page ${page.pageNumber}`}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
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
