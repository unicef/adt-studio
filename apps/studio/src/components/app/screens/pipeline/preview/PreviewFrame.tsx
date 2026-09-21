import { useRef } from "react"
import { useLingui } from "@lingui/react/macro"
import { CANVAS_PADDING, CAPTURE_WIDTH, useCanvasPane } from "@/components/app/screens/pipeline/canvas/canvasLayout"
import { PageDeviceFrame } from "@/components/app/screens/pipeline/canvas/PageDeviceFrame"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"

export interface PreviewFrameProps {
  src: string
  viewport: Viewport
}

export function PreviewFrame({ src, viewport }: PreviewFrameProps) {
  const { t } = useLingui()
  const paneRef = useRef<HTMLDivElement>(null)
  const { pane } = useCanvasPane(paneRef, true)

  const iframe = (
    <iframe key={viewport} src={src} title={t`Book preview`} className="size-full border-0 bg-white" />
  )

  if (viewport === "desktop") {
    return (
      <div ref={paneRef} className="min-h-0 min-w-0 flex-1 bg-muted/20">
        {iframe}
      </div>
    )
  }

  return (
    <div
      ref={paneRef}
      className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-muted/20 p-6"
    >
      <PageDeviceFrame
        viewport={viewport}
        screenWidth={CAPTURE_WIDTH[viewport]}
        zoom={1}
        available={{
          width: pane.width - CANVAS_PADDING,
          height: pane.height - CANVAS_PADDING,
        }}
      >
        {iframe}
      </PageDeviceFrame>
    </div>
  )
}
