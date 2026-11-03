import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Loader2 } from "lucide-react"
import { useSectionScreenshot } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { ThumbSkeleton } from "./PageSkeleton"
import { useVariant } from "@/components/app/lab/variants"
import { PageThumbnailImage } from "@/components/app/screens/pipeline/shared/page-thumbnail/PageThumbnailImage"
import { useRenderedWidth } from "@/components/app/screens/pipeline/shared/page-thumbnail/useRenderedWidth"

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
  layered?: boolean
  viewport?: "mobile" | "desktop"
  shotWidth?: number
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
  layered = false,
  viewport = "mobile",
  shotWidth,
}: PageThumbProps) {
  const contentLoaders = useVariant("loaders") === "content"
  const [ref, inView] = useInView<HTMLDivElement>(contentLoaders ? "800px" : "200px")
  const [baseSettled, setBaseSettled] = useState(false)
  const screenshot = useSectionScreenshot(label, pageId, sectionIndex, {
    viewport,
    cacheKey,
    width: shotWidth,
    enabled: inView && !pruned && (!layered || (baseSettled && !pending)),
  })
  const needsPdf = sectionIndex == null || pruned === true || pending === true || screenshot.isError
  const awaitingShot = contentLoaders && !needsPdf && !screenshot.data
  const renderedWidth = useRenderedWidth(ref, inView, fit)
  const showPdf = inView && renderedWidth > 0 && (needsPdf || awaitingShot)

  if (layered) {
    const shot = !pruned && !pending && sectionIndex != null ? screenshot.data : undefined
    return (
      <div ref={ref} className={cn("relative shrink-0 overflow-hidden rounded-[5px] border bg-muted", className)} style={style}>
        {inView && renderedWidth > 0 ? (
          <PageThumbnailImage
            label={label}
            pageId={pageId}
            cssWidth={renderedWidth}
            dimmed={!!pending}
            onSettled={() => setBaseSettled(true)}
            className={cn("absolute inset-0 size-full object-contain object-center", pruned && "grayscale")}
          />
        ) : (
          <ThumbSkeleton className="absolute inset-0" />
        )}
        {shot && (
          <img
            src={shot.src}
            alt=""
            className="absolute inset-0 size-full bg-white object-cover object-top animate-in fade-in-0 duration-300 motion-reduce:animate-none"
          />
        )}
        {pending && (
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <Loader2 className="size-4 animate-spin text-white" />
          </div>
        )}
      </div>
    )
  }

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
      ) : showPdf ? (
        <>
          <ThumbSkeleton className="absolute inset-0" />
          <PageThumbnailImage
            label={label}
            pageId={pageId}
            cssWidth={renderedWidth}
            dimmed={awaitingShot || !(contentLoaders && !pending && !pruned)}
            className={cn(
              "relative size-full object-center",
              fit === "contain" ? "bg-muted object-contain" : "object-cover",
              pruned && "grayscale",
            )}
          />
        </>
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
