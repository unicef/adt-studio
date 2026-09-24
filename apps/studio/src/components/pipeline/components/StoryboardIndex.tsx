import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react"
import { msg } from "@lingui/core/macro"
import { AlertTriangle, ArrowLeftRight, CheckCircle2, EyeOff, FileText, HelpCircle, Loader2, MessageSquare, Monitor, Puzzle } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useQuizzes } from "@/hooks/use-quizzes"
import { getSectionScreenshotUrl, type PageSummaryItem, type PageSummarySection } from "@/api/client"
import { STAGES } from "../stage-config"
import type { Quiz } from "@adt/types"
import { parseQuizRouteId } from "@/lib/quiz-route"
import { useBookComments } from "../stages/storyboard/components/feedback/use-book-comments"
import { sectionIdFor } from "../stages/storyboard/components/feedback/storyboard-pins"
import { useCommentsMode } from "../stages/storyboard/components/feedback/use-comments-mode"

/**
 * Sidebar list shown only on the storyboard stage. Lists every section
 * (one row = one generated page) and inserts quizzes right after the last
 * section of their `afterPageId`. Hovering a row shows a side-by-side
 * comparison of the original PDF page and the rendered section screenshot.
 */
export function StoryboardIndex({
  bookLabel,
  selectedPageId,
  sectionIndex,
  onSelectSection,
  stageRunning,
}: {
  bookLabel: string
  selectedPageId?: string
  sectionIndex?: number
  onSelectSection?: (pageId: string, sectionIndex: number) => void
  stageRunning?: boolean
}) {
  const { data: pages } = usePages(bookLabel)
  const { data: quizzesData } = useQuizzes(bookLabel)
  const navigate = useNavigate()
  const parentRef = useRef<HTMLDivElement>(null)
  const storyboardStageDef = STAGES.find((s) => s.slug === "storyboard")
  const bookComments = useBookComments(bookLabel)
  /** Comments mode, shared with the toolbar's Comments button: the list shows only the sections
   *  readers commented on while the page shows their pins. */
  const commentsMode = useCommentsMode(bookLabel)
  const filtering = commentsMode.on && bookComments.total > 0

  const items = useMemo<StoryboardListItem[]>(() => {
    if (!pages) return []
    // The API resolves legacy IDs before returning quizzes.
    const quizzesByAfterPageId = new Map<string, Array<{ quiz: Quiz; quizId: string }>>()
    ;(quizzesData?.quizzes?.quizzes ?? []).forEach((q) => {
      const list = quizzesByAfterPageId.get(q.afterPageId) ?? []
      list.push({ quiz: q, quizId: q.quizId })
      quizzesByAfterPageId.set(q.afterPageId, list)
    })

    const out: StoryboardListItem[] = []
    for (const page of pages) {
      for (const section of page.sections) {
        if (filtering && !bookComments.bySection.has(sectionIdFor(page.pageId, section.sectionIndex))) continue
        out.push({
          kind: "section",
          page,
          section,
        })
      }
      const quizzes = filtering ? undefined : quizzesByAfterPageId.get(page.pageId)
      if (quizzes) {
        for (const { quiz, quizId } of quizzes) {
          out.push({ kind: "quiz", page, quiz, quizId })
        }
      }
    }
    return out
  }, [pages, quizzesData, filtering, bookComments.bySection])

  const selectedItemIndex = useMemo(() => {
    if (!selectedPageId || sectionIndex == null) return -1
    return items.findIndex(
      (it) =>
        it.kind === "section" &&
        it.page.pageId === selectedPageId &&
        it.section.sectionIndex === sectionIndex,
    )
  }, [items, selectedPageId, sectionIndex])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 6,
  })

  useEffect(() => {
    if (selectedItemIndex >= 0) {
      virtualizer.scrollToIndex(selectedItemIndex, { align: "auto" })
    }
  }, [selectedItemIndex, virtualizer])

  // Quizzes are routed via a synthetic pageId of `quiz-{quizId}` so we can
  // reuse the existing route shape (`/books/$label/$step/$pageId`). The
  // storyboard view detects that prefix and renders the quiz panel; it parses
  // the id with the same helper, so a legacy `quiz-{arrayIndex}` link highlights
  // the row it renders.
  const selectedQuizId = selectedPageId ? parseQuizRouteId(selectedPageId) : null
  const handleQuizClick = useCallback(
    (quizId: string) => {
      navigate({
        to: "/books/$label/$step/$pageId",
        params: {
          label: bookLabel,
          step: "storyboard",
          pageId: `quiz-${quizId}`,
        },
      })
    },
    [navigate, bookLabel],
  )

  if (!pages?.length) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-4 text-xs text-muted-foreground text-center">
        <Trans>No pages extracted yet</Trans>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-4 text-xs text-muted-foreground text-center">
        <Trans>No sections yet — run the storyboard stage to generate pages.</Trans>
      </div>
    )
  }

  /** From the filtered list a click goes straight to the section's newest waiting comment, open. */
  const openComments = (pageId: string, sectionIndex: number) => {
    const entry = bookComments.bySection.get(sectionIdFor(pageId, sectionIndex))
    if (!entry) return onSelectSection?.(pageId, sectionIndex)
    commentsMode.open(entry.latestThreadId)
    void navigate({
      to: "/books/$label/$step/$pageId",
      params: { label: bookLabel, step: "storyboard", pageId },
      search: { section: sectionIndex, comment: entry.latestThreadId },
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {bookComments.total > 0 ? (
        <CommentsFilter
          total={bookComments.total}
          sections={bookComments.ordered.length}
          on={commentsMode.on}
          onChange={commentsMode.setOn}
        />
      ) : null}
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          const isActive =
            item.kind === "section"
              ? item.page.pageId === selectedPageId &&
                item.section.sectionIndex === (sectionIndex ?? 0)
              : item.quizId === selectedQuizId
          return (
            <div
              key={
                item.kind === "section"
                  ? `s:${item.section.sectionId}`
                  : `q:${item.quizId}`
              }
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {item.kind === "section" ? (
                <SectionRow
                  bookLabel={bookLabel}
                  page={item.page}
                  section={item.section}
                  isActive={isActive}
                  activeColor={storyboardStageDef?.bgLight}
                  activeText={storyboardStageDef?.textColor}
                  onSelect={() =>
                    filtering
                      ? openComments(item.page.pageId, item.section.sectionIndex)
                      : onSelectSection?.(item.page.pageId, item.section.sectionIndex)
                  }
                  stageRunning={stageRunning}
                  waiting={bookComments.bySection.get(sectionIdFor(item.page.pageId, item.section.sectionIndex))?.waiting ?? 0}
                />
              ) : (
                <QuizRow
                  bookLabel={bookLabel}
                  page={item.page}
                  quiz={item.quiz}
                  isActive={isActive}
                  onSelect={() => handleQuizClick(item.quizId)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
    </div>
  )
}

/**
 * "All pages · Comments": one switch between the whole book and only the sections readers
 * commented on, with how much is waiting. Shown only while there is something to find.
 */
function CommentsFilter({
  total,
  sections,
  on,
  onChange,
}: {
  total: number
  sections: number
  on: boolean
  onChange: (on: boolean) => void
}) {
  const { i18n } = useLingui()
  return (
    <div className="shrink-0 border-b px-2 py-1.5">
      <div role="group" aria-label={i18n._(msg`Which pages`)} className="flex gap-0.5 rounded-lg bg-muted/70 p-0.5 text-[11px]">
        <button
          type="button"
          aria-pressed={!on}
          onClick={() => onChange(false)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-md px-2 py-1 font-medium transition-colors duration-150 motion-reduce:transition-none",
            !on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Trans>All pages</Trans>
        </button>
        <button
          type="button"
          aria-pressed={on}
          onClick={() => onChange(true)}
          title={i18n._(msg`${total} comments waiting across ${sections} sections`)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 font-medium transition-colors duration-150 motion-reduce:transition-none",
            on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquare className="size-3" aria-hidden="true" />
          <Trans>Comments</Trans>
          <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            {total}
          </span>
        </button>
      </div>
    </div>
  )
}

type StoryboardListItem =
  | { kind: "section"; page: PageSummaryItem; section: PageSummarySection }
  | { kind: "quiz"; page: PageSummaryItem; quiz: Quiz; quizId: string }

/* ---------- SectionRow ---------- */

function SectionRow({
  bookLabel,
  page,
  section,
  isActive,
  activeColor,
  activeText,
  onSelect,
  stageRunning,
  waiting = 0,
}: {
  bookLabel: string
  page: PageSummaryItem
  section: PageSummarySection
  isActive: boolean
  activeColor?: string
  activeText?: string
  onSelect: () => void
  stageRunning?: boolean
  /** Reader comments waiting on this section. */
  waiting?: number
}) {
  const { i18n } = useLingui()
  const { data: pageImageData, isLoading: pageImageLoading } = usePageImage(bookLabel, page.pageId)
  const rowRef = useRef<HTMLButtonElement>(null)

  // Pruned sections are intentionally excluded from rendering, so the
  // screenshot endpoint would 404 and the browser would draw a broken-image
  // icon. Fall back to the PDF page thumb instead.
  const renderedThumb =
    page.hasRendering && !section.isPruned
      ? getSectionScreenshotUrl(bookLabel, page.pageId, section.sectionIndex, {
          viewport: "desktop",
          cacheKey: page.renderingVersion,
        })
      : null

  const pdfThumb = pageImageData?.imageBase64
    ? `data:image/png;base64,${pageImageData.imageBase64}`
    : null

  const sectionPending = stageRunning && !page.hasRendering

  const hover = useHoverPreview(rowRef)

  const previewLabel = section.textPreview?.trim() || i18n._(msg`Section ${section.sectionIndex + 1}`)

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      onMouseEnter={hover.handleEnter}
      onMouseLeave={hover.handleLeave}
      title={
        section.isPruned
          ? i18n._(msg`Section ${section.sectionIndex + 1} (pruned)`)
          : section.sectionType
            ? i18n._(msg`Section ${section.sectionIndex + 1} · ${section.sectionType}`)
            : i18n._(msg`Section ${section.sectionIndex + 1}`)
      }
      className={cn(
        "flex items-start gap-2 px-2 py-1.5 text-left transition-colors w-full",
        isActive
          ? cn(activeColor ?? "bg-violet-50", activeText ?? "text-violet-600", "font-medium")
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        section.isPruned && "opacity-50",
      )}
    >
      <div className="relative shrink-0 w-24 aspect-[4/3]">
        {renderedThumb ? (
          <img
            src={renderedThumb}
            alt=""
            className={cn(
              "w-full h-full rounded-md object-cover object-top ring-1 ring-border bg-white shadow-sm transition-opacity",
              section.isPruned && "grayscale",
            )}
          />
        ) : pageImageLoading || !pdfThumb ? (
          <div className="w-full h-full bg-muted rounded-md ring-1 ring-border" />
        ) : (
          <img
            src={pdfThumb}
            alt=""
            className={cn(
              "w-full h-full rounded-md object-cover object-center ring-1 ring-border opacity-60",
              section.isPruned && "grayscale",
            )}
          />
        )}
        {sectionPending && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/30">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          </div>
        )}
        {section.isActivity && (
          <div className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-violet-600 text-white ring-1 ring-background shadow-sm">
            <Puzzle className="w-2.5 h-2.5" />
          </div>
        )}
        {waiting > 0 && (
          <div
            aria-label={i18n._(msg`${waiting} comments waiting`)}
            className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center gap-0.5 rounded-full bg-amber-500 px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-background shadow-sm motion-safe:animate-in motion-safe:zoom-in-50"
          >
            <MessageSquare className="size-2.5" aria-hidden="true" />
            {waiting}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1 pt-0.5">
        <span
          className={cn(
            "text-[11px] leading-snug line-clamp-2",
            section.isPruned && "line-through",
          )}
        >
          {previewLabel}
        </span>
        <span className="mt-1 inline-flex items-center text-[10px] opacity-60 leading-none">
          {`pg ${String(page.pageNumber)}`}
          {page.sectionCount > 1 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[15px] h-[13px] px-0.5 rounded bg-black/10 text-[9px] font-semibold leading-none">
              {`${section.sectionIndex + 1}/${page.sectionCount}`}
            </span>
          )}
        </span>
      </div>
      {hover.show &&
        createPortal(
          <ComparisonPreview
            pos={hover.pos}
            pdfThumb={pdfThumb}
            renderedThumb={renderedThumb}
            pageNumber={page.pageNumber}
            sectionIndex={section.sectionIndex}
            sectionType={section.sectionType}
            isActivity={section.isActivity}
            isPruned={section.isPruned}
            isStale={
              !section.isPruned &&
              page.renderingVersion != null &&
              page.sectioningVersion != null &&
              page.sectioningVersion > page.renderingVersion
            }
          />,
          document.body,
        )}
    </button>
  )
}

/* ---------- QuizRow ---------- */

function QuizRow({
  page,
  quiz,
  isActive,
  onSelect,
}: {
  bookLabel: string
  page: PageSummaryItem
  quiz: Quiz
  isActive: boolean
  onSelect: () => void
}) {
  const { i18n } = useLingui()
  const rowRef = useRef<HTMLButtonElement>(null)
  const hover = useHoverPreview(rowRef, { width: 420, height: 340 })
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      onMouseEnter={hover.handleEnter}
      onMouseLeave={hover.handleLeave}
      title={i18n._(msg`Quiz after page ${page.pageNumber}`)}
      className={cn(
        "flex items-start gap-2 px-2 py-1.5 text-left transition-colors w-full",
        isActive
          ? "bg-orange-50 text-orange-700 font-medium"
          : "text-muted-foreground hover:bg-orange-50 hover:text-orange-700",
      )}
    >
      {/* Mini quiz preview: option bars with the correct answer highlighted */}
      <div
        className={cn(
          "relative shrink-0 w-24 aspect-[4/3] rounded-md overflow-hidden bg-white",
          isActive ? "ring-1 ring-orange-400 shadow-sm" : "ring-1 ring-orange-200",
        )}
      >
        <div className="absolute inset-0 px-1.5 flex flex-col justify-center gap-1">
          {quiz.options.map((_, i) => {
            const correct = i === quiz.answerIndex
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-1 h-2 rounded-sm px-1",
                  correct ? "bg-emerald-100" : "bg-muted",
                )}
              >
                <div
                  className={cn(
                    "w-1 h-1 rounded-full shrink-0",
                    correct ? "bg-emerald-500" : "bg-muted-foreground/30",
                  )}
                />
                <div
                  className={cn(
                    "h-0.5 rounded-full flex-1",
                    correct ? "bg-emerald-400/70" : "bg-muted-foreground/20",
                  )}
                />
              </div>
            )
          })}
        </div>
        <div className="absolute top-0.5 right-0.5 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-orange-500 text-white shadow-sm">
          <HelpCircle className="w-2.5 h-2.5" />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1 pt-0.5">
        <span className="text-[11px] leading-snug line-clamp-2">{quiz.question}</span>
        <span className="text-[9px] font-mono opacity-50 leading-none">
          <Trans>after pg {String(page.pageNumber)}</Trans>
        </span>
      </div>
      {hover.show &&
        createPortal(
          <QuizPreview pos={hover.pos} quiz={quiz} pageNumber={page.pageNumber} />,
          document.body,
        )}
    </button>
  )
}

/* ---------- QuizPreview (hover) ---------- */

function QuizPreview({
  pos,
  quiz,
  pageNumber,
}: {
  pos: { top: number; left: number }
  quiz: Quiz
  pageNumber: number
}) {
  return (
    <div
      className="fixed z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="w-[420px] rounded-xl bg-background shadow-2xl ring-1 ring-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
          <span className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded bg-orange-100 text-orange-700 text-[10px] font-semibold">
            <HelpCircle className="w-2.5 h-2.5" />
            <Trans>Quiz</Trans>
          </span>
          <span className="text-xs text-muted-foreground">
            <Trans>after page {String(pageNumber)}</Trans>
          </span>
        </div>
        {/* Question + options */}
        <div className="p-4 space-y-3 bg-background">
          <p className="text-sm font-medium leading-snug">{quiz.question}</p>
          <div className="space-y-1.5">
            {quiz.options.map((option, i) => {
              const correct = i === quiz.answerIndex
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 px-2.5 py-1.5 rounded-md text-xs",
                    correct ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-muted/40",
                  )}
                >
                  {correct ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-px" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full ring-1 ring-muted-foreground/30 shrink-0 mt-px" />
                  )}
                  <span className={cn("flex-1 min-w-0", correct && "text-emerald-900 font-medium")}>
                    {option.text}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Hover preview helpers ---------- */

function useHoverPreview(
  rowRef: React.RefObject<HTMLElement | null>,
  opts?: { width?: number; height?: number },
) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!rowRef.current) return
      const rect = rowRef.current.getBoundingClientRect()
      const previewW = opts?.width ?? 760
      const previewH = opts?.height ?? 510
      const gap = 20
      const margin = 8
      const top = Math.max(margin, Math.min(rect.top, window.innerHeight - previewH - margin))
      const rightEdge = window.innerWidth - margin
      const rightSideLeft = rect.right + gap
      const leftSideLeft = rect.left - previewW - gap
      const unclampedLeft =
        rightSideLeft + previewW <= rightEdge ? rightSideLeft : leftSideLeft
      const left = Math.max(margin, Math.min(unclampedLeft, rightEdge - previewW))
      setPos({ top, left })
      setShow(true)
    }, 800)
  }, [rowRef, opts?.width, opts?.height])

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setShow(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { show, pos, handleEnter, handleLeave }
}

function ComparisonPreview({
  pos,
  pdfThumb,
  renderedThumb,
  pageNumber,
  sectionIndex,
  sectionType,
  isActivity,
  isPruned,
  isStale,
}: {
  pos: { top: number; left: number }
  pdfThumb: string | null
  renderedThumb: string | null
  pageNumber: number
  sectionIndex: number
  sectionType: string
  isActivity: boolean
  isPruned: boolean
  isStale: boolean
}) {
  return (
    <div
      className="fixed z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="rounded-xl bg-background shadow-2xl ring-1 ring-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-foreground">
              <Trans>Page {String(pageNumber)}</Trans>
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              <Trans>Section {String(sectionIndex + 1)}</Trans>
            </span>
            {isActivity && (
              <span className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded bg-violet-100 text-violet-700 text-[10px] font-semibold">
                <Puzzle className="w-2.5 h-2.5" />
                <Trans>Activity</Trans>
              </span>
            )}
            {sectionType && (
              <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/80 truncate">
                {sectionType}
              </span>
            )}
          </div>
          {isPruned ? (
            <span className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded bg-zinc-200 text-zinc-700 text-[10px] font-semibold shrink-0">
              <EyeOff className="w-2.5 h-2.5" />
              <Trans>Pruned</Trans>
            </span>
          ) : isStale ? (
            <span className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded bg-amber-100 text-amber-800 text-[10px] font-semibold shrink-0">
              <AlertTriangle className="w-2.5 h-2.5" />
              <Trans>Out of date</Trans>
            </span>
          ) : null}
        </div>
        {/* Comparison */}
        <div className="flex items-stretch p-3 gap-3 bg-background">
          <PreviewPanel
            src={pdfThumb}
            icon={<FileText className="w-3 h-3" />}
            label={<Trans>Source PDF</Trans>}
            fallback={<Trans>No source image</Trans>}
          />
          <div className="flex items-center justify-center px-1">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted/60 text-muted-foreground">
              <ArrowLeftRight className="w-3 h-3" />
            </div>
          </div>
          <PreviewPanel
            src={renderedThumb}
            icon={<Monitor className="w-3 h-3" />}
            label={<Trans>Generated section</Trans>}
            fallback={
              isPruned ? (
                <Trans>This section is pruned and isn't rendered.</Trans>
              ) : (
                <Trans>Not rendered yet</Trans>
              )
            }
            tint={isStale ? "amber" : isPruned ? "zinc" : undefined}
          />
        </div>
      </div>
    </div>
  )
}

function PreviewPanel({
  src,
  icon,
  label,
  fallback,
  tint,
}: {
  src: string | null
  icon: React.ReactNode
  label: React.ReactNode
  fallback?: React.ReactNode
  tint?: "amber" | "zinc"
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "h-[400px] w-[340px] rounded-lg bg-muted/40 ring-1 ring-border overflow-hidden flex items-center justify-center",
          tint === "amber" && "ring-amber-200 bg-amber-50/40",
          tint === "zinc" && "ring-zinc-200 bg-zinc-100/60",
        )}
      >
        {src ? (
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground px-3 text-center">
            {fallback ?? <Trans>No preview available</Trans>}
          </span>
        )}
      </div>
    </div>
  )
}
