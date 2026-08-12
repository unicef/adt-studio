import { useEffect, useRef, useState } from "react"
import { FileText, Loader2 } from "lucide-react"
import { usePageImage, useSectionScreenshot } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { ThumbSkeleton } from "./PageSkeleton"

export interface PageThumbProps {
  label: string
  pageId: string
  /** Section rendered into the thumbnail — the page's first section. */
  sectionIndex: number | null
  cacheKey?: number | null
  /** Discarded page: no section is rendered, so the PDF page stands in, greyed out. */
  pruned?: boolean
  /** The storyboard has not reached this page yet — the PDF page stands in behind a spinner. */
  pending?: boolean
  className?: string
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true)
      },
      { rootMargin: "200px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [inView])

  return [ref, inView] as const
}

/** Section screenshot for a page, falling back to the PDF page then to a paper-like placeholder. */
export function PageThumb({
  label,
  pageId,
  sectionIndex,
  cacheKey,
  pruned,
  pending,
  className,
}: PageThumbProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const screenshot = useSectionScreenshot(label, pageId, sectionIndex, {
    viewport: "mobile",
    cacheKey,
    enabled: inView && !pruned,
  })
  // Pruned and not-yet-rendered sections have no screenshot to serve, so the
  // PDF page is the only thing left to show.
  const needsPdf = sectionIndex == null || pruned === true || pending === true || screenshot.isError
  const pdf = usePageImage(label, pageId, { enabled: inView && needsPdf })
  const pdfSrc = pdf.data?.imageBase64 ? `data:image/png;base64,${pdf.data.imageBase64}` : null

  return (
    <div
      ref={ref}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[5px] border bg-card",
        className,
      )}
    >
      {!needsPdf && screenshot.data ? (
        <img
          src={screenshot.data}
          alt=""
          className="size-full object-cover object-top duration-200 animate-in fade-in-0"
        />
      ) : needsPdf && pdfSrc ? (
        <img
          src={pdfSrc}
          alt=""
          className={cn(
            "size-full object-cover object-center opacity-60 duration-200 animate-in fade-in-0",
            pruned && "grayscale",
          )}
        />
      ) : needsPdf && pdf.isError ? (
        <div className="grid size-full place-items-center bg-muted text-muted-foreground/50">
          <FileText className="size-4" />
        </div>
      ) : (
        <ThumbSkeleton className="size-full" />
      )}

      {pending && (
        <div className="absolute inset-0 grid place-items-center bg-black/30">
          <Loader2 className="size-4 animate-spin text-white" />
        </div>
      )}
    </div>
  )
}
