import { useLingui } from "@lingui/react/macro"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatImageThumbnailsProps {
  images: string[]
  onRemove?: (index: number) => void
  className?: string
}

export function ChatImageThumbnails({ images, onRemove, className }: ChatImageThumbnailsProps) {
  const { t } = useLingui()
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {images.map((src, index) => {
        const position = index + 1
        return (
          <div key={index} className="relative">
            <img
              src={src}
              alt={t`Attached image ${position}`}
              className={cn("rounded-lg border border-border bg-muted object-cover", onRemove ? "size-14" : "max-h-48 max-w-60")}
            />
            {onRemove && (
              <button
                type="button"
                aria-label={t`Remove image ${position}`}
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-muted"
                onClick={() => onRemove(index)}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
