import { Link } from "@tanstack/react-router"
import { Check, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { usePageImage } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"

interface PageCardProps {
  label: string
  pageId: string
  pageNumber: number
  hasRendering: boolean
  viewMode: "grid" | "list"
}

export function PageCard({
  label,
  pageId,
  pageNumber,
  hasRendering,
  viewMode,
}: PageCardProps) {
  const { data: imageData, isLoading } = usePageImage(label, pageId)

  return (
    <Link
      to="/books/$label/pages/$pageId"
      params={{ label, pageId }}
      className="block"
    >
      <Card
        className={cn(
          "group cursor-pointer overflow-hidden transition-colors hover:border-primary/50",
          viewMode === "list" && "flex flex-row items-center"
        )}
      >
        <div
          className={cn(
            "relative bg-muted",
            viewMode === "grid"
              ? "aspect-[3/4] w-full"
              : "h-24 w-16 shrink-0"
          )}
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              ...
            </div>
          ) : imageData ? (
            <img
              src={`data:image/png;base64,${imageData.imageBase64}`}
              alt={`Page ${pageNumber}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}
          <div className="absolute right-1 top-1">
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0", hasRendering && "bg-green-100 text-green-700")}
            >
              {hasRendering ? (
                <Check className="mr-0.5 h-3 w-3" />
              ) : (
                <Clock className="mr-0.5 h-3 w-3" />
              )}
              {hasRendering ? "Done" : "Pending"}
            </Badge>
          </div>
        </div>
        <CardContent
          className={cn(
            viewMode === "grid" ? "p-2" : "flex-1 p-3"
          )}
        >
          <p className="text-sm font-medium">Page {pageNumber}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
