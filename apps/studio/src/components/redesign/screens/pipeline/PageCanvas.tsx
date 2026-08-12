import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ImageOff } from "lucide-react"
import { useSectionScreenshot } from "@/hooks/use-pages"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { PageDeviceFrame } from "./PageDeviceFrame"
import { PageEmptyState } from "./PageEmptyState"
import { SectionSkeleton } from "./PageSkeleton"
import type { Viewport } from "./types"
import type { SectioningRun } from "./useSectioningRun"
import type { PipelinePage } from "./usePipelineState"
import { zoomBy } from "./zoom"

/** Tablet and mobile emulate a device, so their width is fixed — these mirror
 *  the widths the screenshots are captured at, keeping the device screen 1:1.
 *  Desktop takes whatever the pane gives it. */
const DEVICE_WIDTH: Record<Exclude<Viewport, "desktop">, number> = {
  tablet: 768,
  mobile: 390,
}

const CANVAS_PADDING = 48
/** px-6 on both sides plus pt-6 / pb-10 around the device. */
const DEVICE_PADDING = 64
const DESKTOP_FALLBACK_WIDTH = 760

export interface PageCanvasProps {
  label: string
  page: PipelinePage
  viewport: Viewport
  zoom: number
  onZoomChange: (zoom: number) => void
  sectioning: SectioningRun
  onOpenSectioning: () => void
}

function SectionSlice({
  label,
  page,
  sectionIndex,
  viewport,
  single,
}: {
  label: string
  page: PipelinePage
  sectionIndex: number
  viewport: Viewport
  single: boolean
}) {
  const { t } = useLingui()
  const screenshot = useSectionScreenshot(label, page.pageId, sectionIndex, {
    viewport,
    cacheKey: page.renderingVersion,
  })

  if (screenshot.isError) {
    return (
      <div className="flex flex-col items-center gap-2 border-b border-dashed py-14 text-muted-foreground last:border-b-0">
        <ImageOff className="size-5" />
        <span className="text-[12.5px]">
          <Trans>No preview rendered for this section yet</Trans>
        </span>
      </div>
    )
  }

  if (!screenshot.data) {
    return <SectionSkeleton className={single ? "min-h-96 border-0" : "min-h-64 border-0"} />
  }

  return (
    <img
      src={screenshot.data}
      alt={t`Preview of section ${sectionIndex + 1}`}
      className="block w-full duration-200 animate-in fade-in-0"
    />
  )
}

/** The rendered page as the reader will see it, at the selected viewport width. */
export function PageCanvas({
  label,
  page,
  viewport,
  zoom,
  onZoomChange,
  sectioning,
  onOpenSectioning,
}: PageCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pane, setPane] = useState({ width: 0, height: 0 })
  // The page width follows the pane, so an animated width would lag a whole
  // 200ms behind the window while dragging. Suspend it until the drag settles.
  const [resizing, setResizing] = useState(false)
  const sections = page.sections.filter((s) => !s.isPruned)
  const empty = sections.length === 0

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    setPane({ width: node.clientWidth, height: node.clientHeight })
    let settle: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(([entry]) => {
      setPane({ width: entry.contentRect.width, height: entry.contentRect.height })
      setResizing(true)
      clearTimeout(settle)
      settle = setTimeout(() => setResizing(false), 150)
    })
    observer.observe(node)
    return () => {
      clearTimeout(settle)
      observer.disconnect()
    }
  }, [empty])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    // Registered manually: React's onWheel is passive, so preventDefault there
    // cannot stop the browser from zooming the whole app instead.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      onZoomChange(zoomBy(zoom, event.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [zoom, onZoomChange])

  if (empty) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center px-6 pb-24">
        <PageEmptyState
          label={label}
          page={page}
          sectioning={sectioning}
          onOpenSectioning={onOpenSectioning}
        />
      </div>
    )
  }

  const slices = sections.map((section) => (
    <SectionSlice
      key={section.sectionId}
      label={label}
      page={page}
      sectionIndex={section.sectionIndex}
      viewport={viewport}
      single={sections.length === 1}
    />
  ))

  const captionsWarning = page.missingCaptions > 0 && (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <AlertTriangle className="size-3.5 shrink-0" />
      <Trans>This page has images without an alternative description.</Trans>
    </div>
  )

  if (viewport !== "desktop") {
    return (
      <ScrollArea ref={scrollRef} horizontal className="min-h-0 w-full flex-1">
        <div className="flex min-w-max flex-col items-center gap-4 px-6 pb-10 pt-6">
          {captionsWarning}
          <PageDeviceFrame
            viewport={viewport}
            screenWidth={DEVICE_WIDTH[viewport]}
            zoom={zoom}
            available={{
              width: pane.width - CANVAS_PADDING,
              height: pane.height - DEVICE_PADDING,
            }}
          >
            {slices}
          </PageDeviceFrame>
        </div>
      </ScrollArea>
    )
  }

  const baseWidth = pane.width ? pane.width - CANVAS_PADDING : DESKTOP_FALLBACK_WIDTH

  return (
    <ScrollArea ref={scrollRef} horizontal className="min-h-0 w-full flex-1">
      <div className="flex min-w-max justify-center px-6 pb-[190px] pt-6">
        <div
          className={cn("flex flex-col gap-4", !resizing && "transition-[width] duration-200")}
          style={{ width: baseWidth * zoom }}
        >
          {captionsWarning}

          <div className="overflow-hidden rounded-lg bg-card">{slices}</div>
        </div>
      </div>
    </ScrollArea>
  )
}
