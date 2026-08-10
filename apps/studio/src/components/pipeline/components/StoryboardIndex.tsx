import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react"
import { useLingui as useLinguiMacro } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { AlertTriangle, ArrowLeftRight, CheckCircle2, EyeOff, FileText, HelpCircle, Loader2, Monitor, Puzzle } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useQuizzes } from "@/hooks/use-quizzes"
import { getSectionScreenshotUrl, type PageSummaryItem, type PageSummarySection } from "@/api/client"
import { STAGES } from "../stage-config"
import { useReadingOrder, useSaveReadingOrder, moveReadingOrderItem } from "@/hooks/use-reading-order"
import { announceToScreenReader } from "@/lib/aria-live"
import { resolveQuizId, type Quiz } from "@adt/types"

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
  const { data: readingOrder } = useReadingOrder(bookLabel)
  const saveOrder = useSaveReadingOrder(bookLabel)
  const navigate = useNavigate()
  const parentRef = useRef<HTMLDivElement>(null)
  const storyboardStageDef = STAGES.find((s) => s.slug === "storyboard")
  const { t } = useLinguiMacro()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; after: boolean } | null>(null)

  /**
   * HTML5 drag does not scroll an `overflow-y-auto` container, so a drag can't
   * reach a target that is off-screen. Nudge the list when the pointer nears
   * either edge.
   */
  const autoScroll = useCallback((clientY: number) => {
    const el = parentRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const zone = 48
    if (clientY < rect.top + zone) el.scrollTop -= 12
    else if (clientY > rect.bottom - zone) el.scrollTop += 12
  }, [])

  // The list *is* the reading order — the server resolves it, so the sidebar,
  // the live preview and every export agree by construction rather than by
  // three walks being kept in step.
  const items = useMemo<StoryboardListItem[]>(() => {
    if (!pages || !readingOrder) return []

    const sectionById = new Map<string, { page: PageSummaryItem; section: PageSummarySection }>()
    for (const page of pages) {
      for (const section of page.sections) sectionById.set(section.sectionId, { page, section })
    }
    const quizById = new Map<string, { quiz: Quiz; page: PageSummaryItem }>()
    const pageById = new Map(pages.map((page) => [page.pageId, page]))
    ;(quizzesData?.quizzes?.quizzes ?? []).forEach((quiz, i) => {
      const page = pageById.get(quiz.afterPageId)
      if (page) quizById.set(resolveQuizId(quiz, i), { quiz, page })
    })

    return readingOrder.items.flatMap<StoryboardListItem>((entry) => {
      if (entry.kind === "quiz") {
        const hit = quizById.get(entry.id)
        return hit ? [{ kind: "quiz", page: hit.page, quiz: hit.quiz, quizId: entry.id }] : []
      }
      const hit = sectionById.get(entry.id)
      return hit ? [{ kind: "section", page: hit.page, section: hit.section }] : []
    })
  }, [pages, quizzesData, readingOrder])

  /**
   * Move `id` so it lands at `toVisibleIndex` of the *visible* list, then save.
   *
   * The saved order also carries items excluded from the output (pruned ones),
   * which hold a slot so re-including them restores their place. The visible
   * target is therefore translated into a position in the full order, anchored
   * on the row currently at that index.
   */
  const moveTo = useCallback(
    (id: string, toVisibleIndex: number) => {
      if (!readingOrder) return
      const anchor = items[Math.max(0, Math.min(toVisibleIndex, items.length))]
      const fullTarget = anchor
        ? readingOrder.order.findIndex((entry) => entry.id === itemIdOf(anchor))
        : readingOrder.order.length
      if (fullTarget < 0) return

      const next = moveReadingOrderItem(readingOrder.order, id, fullTarget)
      if (next.every((entry, i) => entry.id === readingOrder.order[i]?.id)) return

      const visible = new Set(items.map(itemIdOf))
      const position = next.filter((entry) => visible.has(entry.id)).findIndex((e) => e.id === id)
      announceToScreenReader(
        t`Moved to position ${String(position + 1)} of ${String(items.length)}`,
      )

      saveOrder.mutate({ items: next, expectedVersion: readingOrder.version })
    },
    [readingOrder, items, saveOrder, t],
  )

  const moveBy = useCallback(
    (id: string, delta: number) => {
      const from = items.findIndex((item) => itemIdOf(item) === id)
      if (from < 0) return
      // splice-based move: stepping down needs +1 because the item is removed
      // from its old slot before being reinserted.
      moveTo(id, delta > 0 ? from + 2 : from - 1)
    },
    [items, moveTo],
  )

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
  // storyboard view detects that prefix and renders the quiz panel.
  const selectedQuizId = selectedPageId?.startsWith("quiz-")
    ? selectedPageId.slice("quiz-".length)
    : null
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

  return (
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
          const itemId = itemIdOf(item)
          const isActive =
            item.kind === "section"
              ? item.page.pageId === selectedPageId &&
                item.section.sectionIndex === (sectionIndex ?? 0)
              : item.quizId === selectedQuizId
          const isDragging = dragId === itemId
          return (
            <div
              key={
                item.kind === "section"
                  ? `s:${item.section.sectionId}`
                  : `q:${item.quizId}`
              }
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              // Rows are absolutely positioned by the virtualizer and unmount
              // when scrolled away, so the tree editor's standalone drop-zone
              // slivers can't be reused. Each row is its own drop target and
              // decides "before" or "after" from the pointer's position within
              // it, drawn as a border on the matching edge.
              draggable={!stageRunning}
              onDragStart={(e) => {
                if (stageRunning) {
                  e.preventDefault()
                  return
                }
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData(READING_ORDER_DRAG_TYPE, itemId)
                // Defer the state change: a synchronous re-render can replace
                // the dragged node and make some browsers abort the drag
                // before the first dragover fires.
                requestAnimationFrame(() => setDragId(itemId))
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropTarget(null)
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(READING_ORDER_DRAG_TYPE)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                const rect = e.currentTarget.getBoundingClientRect()
                const after = e.clientY > rect.top + rect.height / 2
                setDropTarget({ index: virtualRow.index, after })
                autoScroll(e.clientY)
              }}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes(READING_ORDER_DRAG_TYPE)) return
                e.preventDefault()
                const sourceId = e.dataTransfer.getData(READING_ORDER_DRAG_TYPE)
                const rect = e.currentTarget.getBoundingClientRect()
                const after = e.clientY > rect.top + rect.height / 2
                setDragId(null)
                setDropTarget(null)
                if (sourceId) moveTo(sourceId, virtualRow.index + (after ? 1 : 0))
              }}
              onKeyDown={(e) => {
                if (!e.altKey || stageRunning) return
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  moveBy(itemId, -1)
                } else if (e.key === "ArrowDown") {
                  e.preventDefault()
                  moveBy(itemId, 1)
                }
              }}
              className={cn(
                "border-y border-transparent",
                isDragging && "opacity-40",
                dropTarget?.index === virtualRow.index &&
                  !isDragging &&
                  (dropTarget.after ? "border-b-primary" : "border-t-primary"),
              )}
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
                  position={virtualRow.index + 1}
                  isActive={isActive}
                  activeColor={storyboardStageDef?.bgLight}
                  activeText={storyboardStageDef?.textColor}
                  onSelect={() =>
                    onSelectSection?.(item.page.pageId, item.section.sectionIndex)
                  }
                  stageRunning={stageRunning}
                />
              ) : (
                <QuizRow
                  bookLabel={bookLabel}
                  page={item.page}
                  quiz={item.quiz}
                  position={virtualRow.index + 1}
                  isActive={isActive}
                  onSelect={() => handleQuizClick(item.quizId)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type StoryboardListItem =
  | { kind: "section"; page: PageSummaryItem; section: PageSummarySection }
  | { kind: "quiz"; page: PageSummaryItem; quiz: Quiz; quizId: string }

/** Custom MIME type so the list only accepts its own rows, not arbitrary drags. */
const READING_ORDER_DRAG_TYPE = "application/x-adt-reading-order"

/**
 * The row's two numbers, which are different things and stop agreeing as soon
 * as the book is reordered: where the page sits in the book (the filled chip,
 * first, because it is the order the reader meets it in) and where it came from
 * in the PDF. The `PDF` prefix is what makes the second unambiguous — this line
 * is only a few characters wide, so the word does the work a tooltip alone
 * cannot.
 */
function RowPosition({
  position,
  pageNumber,
  kind,
}: {
  position: number
  pageNumber: number
  /** A quiz sits *after* a source page rather than coming from one. */
  kind: "section" | "quiz"
}) {
  const { t } = useLinguiMacro()
  return (
    <>
      <span
        title={t`Page ${String(position)} of the book`}
        className="inline-flex items-center justify-center min-w-[15px] h-[13px] px-0.5 rounded bg-foreground/10 text-[9px] font-semibold leading-none tabular-nums"
      >
        {position}
      </span>
      <span title={t`From page ${String(pageNumber)} of the source PDF`} className="ml-1">
        {/* One whole message per case rather than a translated word glued onto
            a number — word order around "PDF" differs by language. */}
        {kind === "quiz" ? t`after PDF ${String(pageNumber)}` : t`PDF ${String(pageNumber)}`}
      </span>
    </>
  )
}

/** The row's stable output id — what the reading order is expressed in. */
function itemIdOf(item: StoryboardListItem): string {
  return item.kind === "section" ? item.section.sectionId : item.quizId
}

/* ---------- SectionRow ---------- */

function SectionRow({
  bookLabel,
  page,
  section,
  position,
  isActive,
  activeColor,
  activeText,
  onSelect,
  stageRunning,
}: {
  bookLabel: string
  page: PageSummaryItem
  section: PageSummarySection
  position: number
  isActive: boolean
  activeColor?: string
  activeText?: string
  onSelect: () => void
  stageRunning?: boolean
}) {
  const { i18n } = useLingui()
  const { t } = useLinguiMacro()
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
          ? t`Book page ${String(position)} · PDF page ${String(page.pageNumber)} (pruned)`
          : section.sectionType
            ? t`Book page ${String(position)} · PDF page ${String(page.pageNumber)} · ${section.sectionType}`
            : t`Book page ${String(position)} · PDF page ${String(page.pageNumber)}`
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
          <RowPosition position={position} pageNumber={page.pageNumber} kind="section" />
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
            position={position}
            pageNumber={page.pageNumber}
            sectionIndex={section.sectionIndex}
            sectionCount={page.sectionCount}
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
  position,
  isActive,
  onSelect,
}: {
  bookLabel: string
  page: PageSummaryItem
  quiz: Quiz
  position: number
  isActive: boolean
  onSelect: () => void
}) {
  const { i18n } = useLingui()
  const { t } = useLinguiMacro()
  const rowRef = useRef<HTMLButtonElement>(null)
  const hover = useHoverPreview(rowRef, { width: 420, height: 340 })
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      onMouseEnter={hover.handleEnter}
      onMouseLeave={hover.handleLeave}
      title={t`Book page ${String(position)} · quiz after PDF page ${String(page.pageNumber)}`}
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
        <span className="mt-1 inline-flex items-center text-[10px] opacity-60 leading-none">
          <RowPosition position={position} pageNumber={page.pageNumber} kind="quiz" />
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
            <Trans>after PDF page {String(pageNumber)}</Trans>
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
  position,
  pageNumber,
  sectionIndex,
  sectionCount,
  sectionType,
  isActivity,
  isPruned,
  isStale,
}: {
  pos: { top: number; left: number }
  pdfThumb: string | null
  renderedThumb: string | null
  position: number
  pageNumber: number
  sectionIndex: number
  sectionCount: number
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
            {/* Two different numbers that used to read as one: where the page
                sits in the book, and where it came from in the PDF. Naming both
                "page" keeps them parallel and short — after a reorder they
                simply differ. */}
            <span className="text-xs font-semibold text-foreground">
              <Trans>Book page {String(position)}</Trans>
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              <Trans>PDF page {String(pageNumber)}</Trans>
            </span>
            {sectionCount > 1 && (
              <span className="text-xs text-muted-foreground">
                <Trans>
                  · part {String(sectionIndex + 1)} of {String(sectionCount)}
                </Trans>
              </span>
            )}
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
