import { useCallback, useEffect, useRef, useState } from "react"
import { AlignLeft, ArrowLeft, ArrowRight, FileText, Image } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { ExtractPageDetail } from "./components/ExtractPageDetail"
import { BookHeader } from "./BookHeader"
import { LoadingState } from "../../components/LoadingState"
import { useStepHeader } from "../../components/StepViewRouter"
import { StageRunCard } from "../../components/StageRunCard"
import { StageEmptyState } from "../../components/StageEmptyState"
import type { PageSummaryItem } from "@/api/client"

/** Returns true once the element has scrolled into view. */
function useInView(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: "200px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, inView]
}

function PageCard({
  bookLabel,
  page,
  onClick,
}: {
  bookLabel: string
  page: PageSummaryItem
  onClick: () => void
}) {
  const { t } = useLingui()
  const [ref, inView] = useInView()
  const { data: imageData, isLoading: imageLoading } = usePageImage(
    bookLabel,
    page.pageId,
    { enabled: inView },
  )

  return (
    <div ref={ref}>
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col w-full rounded-lg border bg-card overflow-hidden hover:border-blue-300 transition-colors cursor-pointer text-left"
    >
      {/* Page image — fixed aspect ratio so all cards in a row match */}
      <div className="w-full aspect-[3/4] bg-muted/30">
        {!inView || imageLoading ? (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
            ...
          </div>
        ) : imageData ? (
          <img
            src={`data:image/png;base64,${imageData.imageBase64}`}
            alt={t`Page ${String(page.pageNumber)}`}
            className="w-full h-full object-contain block"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
            <Trans>No image</Trans>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-2.5 py-2 border-t">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium"><Trans>Page {String(page.pageNumber)}</Trans></span>
          <div className="flex items-center gap-2">
            {page.wordCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <AlignLeft className="h-2.5 w-2.5" />
                {page.wordCount}
              </span>
            )}
            {page.imageCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Image className="h-2.5 w-2.5" />
                {page.imageCount}
              </span>
            )}
          </div>
        </div>
        <p className="line-clamp-2 text-[11px] text-muted-foreground leading-relaxed">
          {page.textPreview?.replace(/\n/g, " ") || t`No text extracted`}
        </p>
      </div>
    </button>
    </div>
  )
}


export function ExtractView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { t } = useLingui()
  const { data: pages, isLoading } = usePages(bookLabel)
  const { stageState, stepState, queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const selectedPageId = selectedPageIdProp ?? null
  const setSelectedPageId = onSelectPage ?? (() => {})
  const { setExtra, setOnLabelClick } = useStepHeader()
  const extractState = stageState("extract")
  const extractDone = extractState === "done"
  const extractRunning = extractState === "running" || extractState === "queued"
  const extractError = extractState === "error"
  const metadataRunning = stepState("metadata") === "running"
  // Show pages progressively: once pages appear in the DB (during or after
  // the PDF extraction step), display the grid. Only show the run card when
  // no pages exist yet — remaining steps (and re-queued derived steps like
  // book-summary) run in the background TaskIndicator without hiding the grid.
  const hasPages = (pages ?? []).length > 0
  const showRunCard = extractError ? true : !hasPages

  const handleRetryExtract = useCallback(() => {
    if (!hasApiKey || extractRunning) return
    queueRun({ fromStage: "extract", toStage: "extract", apiKey })
  }, [hasApiKey, extractRunning, apiKey, queueRun])

  const pageList = pages ?? []
  const currentIndex = selectedPageId ? pageList.findIndex((p) => p.pageId === selectedPageId) : -1
  const selectedPage = currentIndex >= 0 ? pageList[currentIndex] : null
  const prevPageId = currentIndex > 0 ? pageList[currentIndex - 1].pageId : null
  const nextPageId = currentIndex < pageList.length - 1 ? pageList[currentIndex + 1].pageId : null

  // Header breadcrumb + navigation
  useEffect(() => {
    if (showRunCard) {
      setOnLabelClick(null)
      setExtra(null)
      return () => {
        setExtra(null)
        setOnLabelClick(null)
      }
    }

    if (selectedPage) {
      setOnLabelClick(() => setSelectedPageId(null))
      setExtra(
        <>
          <span className="text-white/40 text-sm">/</span>
          <span className="text-sm font-medium">{t`Page ${String(selectedPage.pageNumber)}`}</span>
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              className="flex items-center justify-center w-7 h-7 rounded bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-30 disabled:cursor-default"
              disabled={!prevPageId}
              onClick={() => prevPageId && setSelectedPageId(prevPageId)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex items-center justify-center w-7 h-7 rounded bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-30 disabled:cursor-default"
              disabled={!nextPageId}
              onClick={() => nextPageId && setSelectedPageId(nextPageId)}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )
    } else if (pageList.length > 0 && !showRunCard) {
      setOnLabelClick(null)
      setExtra(
        <span className="ml-auto text-[11px] font-medium bg-white/20 rounded-full px-2.5 py-0.5">
          {pageList.length} {pageList.length === 1 ? t`page` : t`pages`}
        </span>
      )
    } else {
      setOnLabelClick(null)
      setExtra(null)
    }
    return () => {
      setExtra(null)
      setOnLabelClick(null)
    }
  }, [selectedPageId, selectedPage?.pageNumber, pageList.length, prevPageId, nextPageId, showRunCard, setExtra, setOnLabelClick, setSelectedPageId])

  // Keyboard arrow navigation
  useEffect(() => {
    if (!selectedPageId || showRunCard) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && prevPageId) {
        setSelectedPageId(prevPageId)
      } else if (e.key === "ArrowRight" && nextPageId) {
        setSelectedPageId(nextPageId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedPageId, prevPageId, nextPageId, showRunCard, setSelectedPageId])

  if (!showRunCard && isLoading) {
    return <LoadingState stageSlug="extract" label={<Trans>Loading pages...</Trans>} />
  }

  // Page detail view — available once pages exist (even while later steps run)
  if (!showRunCard && selectedPageId && pages) {
    return (
      <ExtractPageDetail
        bookLabel={bookLabel}
        pageId={selectedPageId}
      />
    )
  }

  // Page grid view
  return (
    <div>
      {!showRunCard && pageList.length > 0 && (
        <BookHeader bookLabel={bookLabel} pages={pages} metadataRunning={metadataRunning} />
      )}
      <div className="p-4">
      {showRunCard ? (
        <StageRunCard
          stageSlug="extract"
          isRunning={extractRunning}
          completed={extractDone}
          onRun={handleRetryExtract}
          disabled={!extractError || !hasApiKey || extractRunning}
        />
      ) : pageList.length === 0 ? (
        <StageEmptyState
          icon={FileText}
          color="blue"
          title={t`No pages extracted yet`}
          subtitle={t`Run the pipeline to extract content`}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {pageList.map((page) => (
            <PageCard
              key={page.pageId}
              bookLabel={bookLabel}
              page={page}
              onClick={() => setSelectedPageId(page.pageId)}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
