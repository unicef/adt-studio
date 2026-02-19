import { useEffect } from "react"
import { AlignLeft, ArrowLeft, ArrowRight, BookOpen, Building2, FileText, Globe, Image, Loader2, User } from "lucide-react"
import { useBook } from "@/hooks/use-books"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useStepRun } from "@/hooks/use-step-run"
import { ExtractPageDetail } from "./ExtractPageDetail"
import { useStepHeader } from "../StepViewRouter"
import { StepRunCard } from "../StepRunCard"
import type { PageSummaryItem } from "@/api/client"

function PageCard({
  bookLabel,
  page,
  onClick,
}: {
  bookLabel: string
  page: PageSummaryItem
  onClick: () => void
}) {
  const { data: imageData, isLoading: imageLoading } = usePageImage(bookLabel, page.pageId)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col rounded-lg border bg-card overflow-hidden hover:border-blue-300 transition-colors cursor-pointer text-left"
    >
      {/* Page image — edge-to-edge, no crop */}
      <div className="w-full bg-muted/30">
        {imageLoading ? (
          <div className="flex aspect-[3/4] items-center justify-center text-[10px] text-muted-foreground">
            ...
          </div>
        ) : imageData ? (
          <img
            src={`data:image/png;base64,${imageData.imageBase64}`}
            alt={`Page ${page.pageNumber}`}
            className="w-full h-auto block"
          />
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center text-[10px] text-muted-foreground">
            No image
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-2.5 py-2 border-t">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium">Page {page.pageNumber}</span>
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
          {page.textPreview?.replace(/\n/g, " ") || "No text extracted"}
        </p>
      </div>
    </button>
  )
}

const EXTRACT_SUB_STEPS = [
  { key: "extract", label: "Extract PDF" },
  { key: "metadata", label: "Extract Metadata" },
  { key: "image-classification", label: "Classify Images" },
  { key: "text-classification", label: "Classify Text" },
  { key: "translation", label: "Translate" },
  { key: "book-summary", label: "Book Summary" },
]

function BookBanner({ bookLabel, pages }: { bookLabel: string; pages: PageSummaryItem[] | undefined }) {
  const { data: book } = useBook(bookLabel)
  const coverPageNumber = book?.metadata?.cover_page_number ?? 1
  const coverPage = pages?.find((p) => p.pageNumber === coverPageNumber)
  const { data: coverImage } = usePageImage(bookLabel, coverPage?.pageId ?? "")

  if (!book) return null

  const title = book.title ?? book.metadata?.title ?? bookLabel
  const authors = book.metadata?.authors?.join(", ")
  const publisher = book.publisher ?? book.metadata?.publisher
  const language = book.languageCode ?? book.metadata?.language_code

  return (
    <div className="flex gap-5 items-start p-4 pb-0">
      {/* Cover thumbnail */}
      <div className="shrink-0 w-24 rounded-md overflow-hidden shadow-sm bg-muted">
        {coverImage ? (
          <img
            src={`data:image/png;base64,${coverImage.imageBase64}`}
            alt={`Cover of ${title}`}
            className="w-full h-auto block"
          />
        ) : (
          <div className="w-full aspect-[3/4] flex items-center justify-center text-muted-foreground">
            <BookOpen className="w-8 h-8" />
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex-1 min-w-0 space-y-2">
        <h3 className="text-lg font-semibold tracking-tight truncate">{title}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {authors && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {authors}
            </span>
          )}
          {publisher && (
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {publisher}
            </span>
          )}
          {language && (
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {language}
            </span>
          )}
          {book.pageCount > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {book.pageCount} pages
            </span>
          )}
        </div>
        {book.bookSummary?.summary && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {book.bookSummary.summary}
          </p>
        )}
      </div>
    </div>
  )
}

export function ExtractView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { data: pages, isLoading } = usePages(bookLabel)
  const { progress: stepProgress } = useStepRun()
  const selectedPageId = selectedPageIdProp ?? null
  const setSelectedPageId = onSelectPage ?? (() => {})
  const { setExtra, setOnLabelClick } = useStepHeader()
  const extractState = stepProgress.steps.get("extract")?.state
  const extractRunning = extractState === "running" || extractState === "queued"

  const pageList = pages ?? []
  const currentIndex = selectedPageId ? pageList.findIndex((p) => p.pageId === selectedPageId) : -1
  const selectedPage = currentIndex >= 0 ? pageList[currentIndex] : null
  const prevPageId = currentIndex > 0 ? pageList[currentIndex - 1].pageId : null
  const nextPageId = currentIndex < pageList.length - 1 ? pageList[currentIndex + 1].pageId : null

  // Header breadcrumb + navigation
  useEffect(() => {
    if (selectedPage) {
      setOnLabelClick(() => setSelectedPageId(null))
      setExtra(
        <>
          <span className="text-white/40 text-sm">/</span>
          <span className="text-sm font-medium">Page {selectedPage.pageNumber}</span>
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
    } else if (pageList.length > 0 && !extractRunning) {
      setOnLabelClick(null)
      setExtra(
        <span className="ml-auto text-[11px] font-medium bg-white/20 rounded-full px-2.5 py-0.5">
          {pageList.length} pages
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
  }, [selectedPageId, selectedPage?.pageNumber, pageList.length, prevPageId, nextPageId, extractRunning, setExtra, setOnLabelClick])

  // Keyboard arrow navigation
  useEffect(() => {
    if (!selectedPageId) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && prevPageId) {
        setSelectedPageId(prevPageId)
      } else if (e.key === "ArrowRight" && nextPageId) {
        setSelectedPageId(nextPageId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedPageId, prevPageId, nextPageId])

  if (isLoading && !extractRunning) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading pages...
      </div>
    )
  }

  // Page detail view (only when extract run is not active)
  if (selectedPageId && pages && !extractRunning) {
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
      {!extractRunning && pageList.length > 0 && <BookBanner bookLabel={bookLabel} pages={pages} />}
      <div className="p-4">
      {extractRunning ? (
        <StepRunCard
          stepSlug="extract"
          subSteps={EXTRACT_SUB_STEPS}
          isRunning
          onRun={() => {}}
          disabled
        />
      ) : pageList.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pages extracted yet. Run the pipeline to extract content.
        </p>
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
