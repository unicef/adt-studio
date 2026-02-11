import { Link } from "@tanstack/react-router"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PageSummaryItem } from "@/api/client"

interface PagePreviewGridProps {
  label: string
  isRunning: boolean
}

function MiniPageTile({ label, page }: { label: string; page: PageSummaryItem }) {
  const { data: imageData, isLoading } = usePageImage(label, page.pageId)

  return (
    <Link
      to="/books/$label/pages/$pageId"
      params={{ label, pageId: page.pageId }}
      className="block"
    >
      <div
        className={cn(
          "group rounded-lg border bg-card transition-colors hover:border-primary/50",
          "flex gap-3 p-2"
        )}
      >
        {/* Thumbnail */}
        <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-muted">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              ...
            </div>
          ) : imageData ? (
            <img
              src={`data:image/png;base64,${imageData.imageBase64}`}
              alt={`Page ${page.pageNumber}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              No img
            </div>
          )}
        </div>
        {/* Text preview */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium">Page {page.pageNumber}</span>
            {page.hasRendering && (
              <Badge variant="secondary" className="px-1 py-0 text-[10px] bg-green-100 text-green-700">
                Rendered
              </Badge>
            )}
          </div>
          <p className="line-clamp-3 text-xs text-muted-foreground leading-relaxed">
            {page.textPreview || "No text extracted"}
          </p>
        </div>
      </div>
    </Link>
  )
}

export function PagePreviewGrid({ label, isRunning }: PagePreviewGridProps) {
  const { data: pages } = usePages(label, {
    refetchInterval: isRunning ? 8000 : false,
  })

  if (!pages || pages.length === 0) return null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Extracted Pages ({pages.length})
        </h3>
        {isRunning && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Updating...
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pages.map((page) => (
          <MiniPageTile key={page.pageId} label={label} page={page} />
        ))}
      </div>
    </div>
  )
}
