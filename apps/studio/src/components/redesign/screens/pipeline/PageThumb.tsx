import { useState } from "react"
import { FileText } from "lucide-react"
import { getSectionScreenshotUrl } from "@/api/client"
import { cn } from "@/lib/utils"

export interface PageThumbProps {
  label: string
  pageId: string
  /** Section rendered into the thumbnail — the page's first section. */
  sectionIndex: number | null
  cacheKey?: number | null
  className?: string
}

/** Section screenshot for a page, falling back to a paper-like placeholder. */
export function PageThumb({ label, pageId, sectionIndex, cacheKey, className }: PageThumbProps) {
  const [failed, setFailed] = useState(false)
  const src =
    sectionIndex == null || failed
      ? null
      : getSectionScreenshotUrl(label, pageId, sectionIndex, { viewport: "mobile", cacheKey })

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[5px] border bg-card",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover object-top" />
      ) : (
        <div className="grid size-full place-items-center bg-muted text-muted-foreground/50">
          <FileText className="size-4" />
        </div>
      )}
    </div>
  )
}
