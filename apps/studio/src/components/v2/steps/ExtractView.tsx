import { useEffect } from "react"
import { AlignLeft, ArrowLeft, ArrowRight, Image, Loader2 } from "lucide-react"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { ExtractPageDetail } from "./ExtractPageDetail"
import { useStepHeader } from "../StepViewRouter"
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
          {page.textPreview || "No text extracted"}
        </p>
      </div>
    </button>
  )
}

export function ExtractView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { data: pages, isLoading } = usePages(bookLabel)
  const selectedPageId = selectedPageIdProp ?? null
  const setSelectedPageId = onSelectPage ?? (() => {})
  const { setExtra, setOnLabelClick } = useStepHeader()

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
    } else if (pageList.length > 0) {
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
  }, [selectedPageId, selectedPage?.pageNumber, pageList.length, prevPageId, nextPageId, setExtra, setOnLabelClick])

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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading pages...
      </div>
    )
  }

  // Page detail view
  if (selectedPageId && pages) {
    return (
      <ExtractPageDetail
        bookLabel={bookLabel}
        pageId={selectedPageId}
      />
    )
  }

  // Page grid view
  return (
    <div className="p-4">
      {pageList.length === 0 ? (
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
  )
}
