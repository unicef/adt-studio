import { useEffect, useMemo, useRef } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Puzzle } from "lucide-react"
import type { QuizItem } from "@/api/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { PageThumb } from "./PageThumb"
import { QuizRailRow } from "./QuizRailRow"
import { groupQuizzesByPage } from "./railOrder"
import { RailCollapseButton } from "./SideRail"
import type { PipelinePage } from "./usePipelineState"

export interface PagesRailProps {
  label: string
  pages: PipelinePage[]
  /** Quizzes are storyboard pages of their own, listed after the page they follow. */
  quizzes: QuizItem[]
  activePageId: string | null
  activeQuizIndex: number | null
  onSelect: (pageId: string) => void
  onSelectQuiz: (quizIndex: number) => void
  /** Storyboard stage in flight — pages it has not reached yet show a spinner. */
  storyboardRunning?: boolean
}

type Health = "ok" | "warn" | "todo"

function healthDots(page: PipelinePage): Health[] {
  const sectioned: Health = page.sectionCount > 0 ? "ok" : "todo"
  const rendered: Health = page.hasRendering ? "ok" : page.sectionCount > 0 ? "todo" : "todo"
  const captioned: Health =
    page.imageCount === 0 ? "ok" : page.missingCaptions > 0 ? "warn" : "ok"
  return [sectioned, rendered, captioned]
}

const DOT_CLASS: Record<Health, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  todo: "bg-border",
}

export function PagesRail({
  label,
  pages,
  quizzes,
  activePageId,
  activeQuizIndex,
  onSelect,
  onSelectQuiz,
  storyboardRunning,
}: PagesRailProps) {
  const { t } = useLingui()
  const quizzesByPage = useMemo(() => groupQuizzesByPage(quizzes), [quizzes])

  // The arrow keys move the selection without touching the rail, so the active
  // row — page or quiz, both marked `aria-current` — brings itself into view.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current
      ?.querySelector("[aria-current='page']")
      ?.scrollIntoView({ block: "nearest" })
  }, [activePageId, activeQuizIndex])

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Trans>Pages</Trans>
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{pages.length}</span>
        <RailCollapseButton className="-mr-1" />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div ref={listRef} className="flex flex-col gap-1.5 px-2.5 pb-2.5">
          {pages.map((page) => {
            const active = activeQuizIndex == null && page.pageId === activePageId
            const missing = page.missingCaptions
            const pending = !!storyboardRunning && !page.hasRendering && !page.isDiscarded
            const hasActivity = page.sections.some((s) => s.isActivity && !s.isPruned)
            return (
              <div key={page.pageId} className="flex flex-col gap-1.5">
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
                    "flex gap-2.5 rounded-[9px] p-2 text-left transition-colors",
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
                    <span className="flex items-center gap-1">
                      {healthDots(page).map((health, i) => (
                        <span key={i} className={cn("size-1.5 rounded-full", DOT_CLASS[health])} />
                      ))}
                      {missing > 0 && (
                        <span className="ml-0.5 text-[10px] font-semibold text-amber-600">
                          {t`${missing} alt-text pending`}
                        </span>
                      )}
                    </span>
                  </div>
                </button>

                {(quizzesByPage.get(page.pageId) ?? []).map((quiz) => (
                  <QuizRailRow
                    key={quiz.quizIndex}
                    quiz={quiz}
                    pageNumber={page.pageNumber}
                    active={quiz.quizIndex === activeQuizIndex}
                    onSelect={() => onSelectQuiz(quiz.quizIndex)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}
