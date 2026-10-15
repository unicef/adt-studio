import { useEffect, useRef, useState, type CSSProperties } from "react"
import { FileText, Loader2 } from "lucide-react"
import { usePageImage, useSectionScreenshot } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { ThumbSkeleton } from "./PageSkeleton"
import { useVariant } from "@/components/app/lab/variants"

export interface PageThumbProps {
  label: string
  pageId: string
  sectionIndex: number | null
  cacheKey?: number | null
  pruned?: boolean
  pending?: boolean
  className?: string
  style?: CSSProperties
  fit?: "cover" | "contain"
}

function useInView<T extends Element>(rootMargin = "200px") {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true)
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return [ref, inView] as const
}

export function PageThumb({
  label,
  pageId,
  sectionIndex,
  cacheKey,
  pruned,
  pending,
  className,
  style,
  fit = "cover",
}: PageThumbProps) {
  const contentLoaders = useVariant("loaders") === "content"
  const [ref, inView] = useInView<HTMLDivElement>(contentLoaders ? "800px" : "200px")
  const screenshot = useSectionScreenshot(label, pageId, sectionIndex, {
    viewport: "mobile",
    cacheKey,
    enabled: inView && !pruned,
  })
  const needsPdf = sectionIndex == null || pruned === true || pending === true || screenshot.isError
  const awaitingShot = contentLoaders && !needsPdf && !screenshot.data
  const pdf = usePageImage(label, pageId, { enabled: inView && (needsPdf || awaitingShot) })
  const pdfSrc = pdf.data?.imageBase64 ? `data:image/png;base64,${pdf.data.imageBase64}` : null

  return (
    <div
      ref={ref}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[5px] border bg-card",
        className,
      )}
      style={style}
    >
      {!needsPdf && screenshot.data ? (
        <img
          src={screenshot.data.src}
          alt=""
          className="size-full object-cover object-top duration-200 animate-in fade-in-0"
        />
      ) : needsPdf && pdfSrc ? (
        <img
          src={pdfSrc}
          alt=""
          className={cn(
            "size-full object-center duration-200 animate-in fade-in-0",
            fit === "contain" ? "bg-muted object-contain" : "object-cover",
            contentLoaders && !pending && !pruned ? "opacity-100" : "opacity-60",
            pruned && "grayscale",
          )}
        />
      ) : awaitingShot && pdfSrc ? (
        <img src={pdfSrc} alt="" className={cn("size-full object-center opacity-70 duration-300 animate-in fade-in-0", fit === "contain" ? "bg-muted object-contain" : "object-cover")} />
      ) : needsPdf && pdf.isError ? (
        <div className="grid size-full place-items-center bg-muted text-muted-foreground/50">
          <FileText className="size-4" />
        </div>
      ) : (
        <ThumbSkeleton className="size-full" />
      )}

      {(pending || awaitingShot) && contentLoaders && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-brand-400/35 to-transparent motion-safe:animate-scan" />
      )}
      {pending && !contentLoaders && (
        <div className="absolute inset-0 grid place-items-center bg-black/30">
          <Loader2 className="size-4 animate-spin text-white" />
        </div>
      )}
    </div>
  )
}
