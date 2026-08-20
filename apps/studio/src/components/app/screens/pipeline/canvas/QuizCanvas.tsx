import { useRef } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { HelpCircle } from "lucide-react"
import type { QuizItem } from "@/api/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  CANVAS_PADDING,
  CAPTURE_WIDTH,
  DEVICE_PADDING,
  canvasContentWidth,
  useCanvasPane,
  useCanvasWheelZoom,
} from "./canvasLayout"
import { InteractiveBlock } from "./InteractiveBlock"
import { PageDeviceFrame } from "./PageDeviceFrame"
import { PageThumb } from "./PageThumb"
import { quizPreviewUrl } from "./previewUrls"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

/** Fallback height until the live render reports how tall it lays out. */
const QUIZ_FRAME_HEIGHT = 520

export interface QuizCanvasProps {
  label: string
  quiz: QuizItem
  version: number | null
  pages: PipelinePage[]
  viewport: Viewport
  zoom: number
  onZoomChange: (zoom: number) => void
}

/** The pages the quiz was generated from, as thumbnails. */
function SourcePages({
  label,
  quiz,
  pages,
}: {
  label: string
  quiz: QuizItem
  pages: PipelinePage[]
}) {
  const { t } = useLingui()
  const sources = quiz.pageIds
    .map((pageId) => pages.find((page) => page.pageId === pageId))
    .filter((page): page is PipelinePage => !!page)

  if (sources.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Trans>Drawn from</Trans>
      </span>
      {sources.map((page) => (
        <span
          key={page.pageId}
          title={t`Page ${page.pageNumber}`}
          className="flex items-center gap-1.5 rounded-md border bg-card py-1 pl-1 pr-2"
        >
          <PageThumb
            label={label}
            pageId={page.pageId}
            sectionIndex={page.sections[0]?.sectionIndex ?? null}
            cacheKey={page.renderingVersion}
            className="h-[30px] w-[22px]"
          />
          <span className="font-mono text-[10px] text-muted-foreground">
            {t`pg ${page.pageNumber}`}
          </span>
        </span>
      ))}
    </div>
  )
}

/** The generated quiz as the reader will answer it, on its own storyboard page. */
export function QuizCanvas({
  label,
  quiz,
  version,
  pages,
  viewport,
  zoom,
  onZoomChange,
}: QuizCanvasProps) {
  const { t } = useLingui()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { pane, resizing } = useCanvasPane(scrollRef, true)
  useCanvasWheelZoom(scrollRef, zoom, onZoomChange)

  const contentWidth = canvasContentWidth(viewport, pane, zoom)
  const afterPage = pages.find((page) => page.pageId === quiz.afterPageId)

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="flex items-center gap-1.5 rounded-md bg-orange-100 px-1.5 py-1 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
        <HelpCircle className="size-3" />
        <Trans>Quiz</Trans>
      </span>
      {afterPage && (
        <span className="text-[11.5px] text-muted-foreground">
          {t`after page ${afterPage.pageNumber}`}
        </span>
      )}
      <SourcePages label={label} quiz={quiz} pages={pages} />
    </div>
  )

  const block = (
    <InteractiveBlock
      src={quizPreviewUrl(label, quiz.quizIndex, version)}
      frameTitle={t`Quiz ${quiz.quizIndex + 1}`}
      frameWidth={CAPTURE_WIDTH[viewport]}
      frameHeight={QUIZ_FRAME_HEIGHT}
      displayWidth={contentWidth}
    />
  )

  if (viewport !== "desktop") {
    return (
      <ScrollArea ref={scrollRef} horizontal className="min-h-0 w-full flex-1">
        <div className="flex min-w-max flex-col items-center gap-4 px-6 pb-10 pt-6">
          {header}
          <PageDeviceFrame
            viewport={viewport}
            screenWidth={CAPTURE_WIDTH[viewport]}
            zoom={zoom}
            available={{
              width: pane.width - CANVAS_PADDING,
              height: pane.height - DEVICE_PADDING,
            }}
          >
            {block}
          </PageDeviceFrame>
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea ref={scrollRef} horizontal className="min-h-0 w-full flex-1">
      <div className="flex min-w-max justify-center px-6 pb-[190px] pt-6">
        <div
          className={cn(
            "flex flex-col gap-4",
            !resizing && "transition-[width] duration-200",
          )}
          style={{ width: contentWidth }}
        >
          {header}

          <div className="overflow-hidden rounded-lg bg-card">{block}</div>
        </div>
      </div>
    </ScrollArea>
  )
}
