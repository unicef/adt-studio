import { ImageOff, Image } from "lucide-react"
import { usePageImage } from "@/hooks/use-pages"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface OriginalPagePanelProps {
  label: string
  pageId: string
  pageNumber: number
  onClose: () => void
}

/** Inline column version for xl+ screens */
export function OriginalPageColumn({
  label,
  pageId,
  pageNumber,
}: Omit<OriginalPagePanelProps, "onClose">) {
  const { data: imageData } = usePageImage(label, pageId)

  return (
    <div className="flex flex-col overflow-hidden border-l">
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-4 py-2">
        <Image className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Original Page</span>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-4">
        {imageData ? (
          <img
            src={`data:image/png;base64,${imageData.imageBase64}`}
            alt={`Page ${pageNumber}`}
            className="max-h-full w-auto rounded border object-contain"
          />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <ImageOff className="h-6 w-6" />
              No image available
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Sheet overlay version for smaller screens */
export function OriginalPageSheet({
  label,
  pageId,
  pageNumber,
  onClose,
}: OriginalPagePanelProps) {
  const { data: imageData } = usePageImage(label, pageId)

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>Original Page {pageNumber}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 items-start justify-center overflow-auto p-6">
          {imageData ? (
            <img
              src={`data:image/png;base64,${imageData.imageBase64}`}
              alt={`Page ${pageNumber}`}
              className="max-h-full w-auto rounded border object-contain"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <ImageOff className="h-6 w-6" />
                No image available
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
