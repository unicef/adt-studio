import { useEffect, useRef } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { CANVAS_PADDING, CAPTURE_WIDTH, useCanvasPane } from "@/components/app/screens/pipeline/canvas/canvasLayout"
import { PageDeviceFrame } from "@/components/app/screens/pipeline/canvas/PageDeviceFrame"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"

const LOCATION_MESSAGE = "adt-runtime/location"

export interface PreviewViewportProps {
  src: string | null
  viewport: Viewport
  onLocation?: (href: string) => void
}

function useFrameLocation(ref: React.RefObject<HTMLIFrameElement | null>, src: string | null, onLocation?: (href: string) => void) {
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (!src || !onLocation) return
    last.current = null
    const report = (href: string | undefined) => {
      if (!href || href === "about:blank" || href === last.current) return
      last.current = href
      onLocation(href)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow) return
      const data = event.data as { type?: unknown; href?: unknown } | null
      if (data?.type === LOCATION_MESSAGE && typeof data.href === "string") report(data.href)
    }
    const read = () => {
      try {
        report(ref.current?.contentWindow?.location.href)
      } catch {
        return
      }
    }
    window.addEventListener("message", onMessage)
    const timer = window.setInterval(read, 400)
    return () => {
      window.removeEventListener("message", onMessage)
      window.clearInterval(timer)
    }
  }, [ref, src, onLocation])
}

function Building() {
  return (
    <div className="flex size-full flex-col bg-white text-neutral-500 animate-in fade-in duration-300 motion-reduce:animate-none">
      <div className="flex min-h-0 flex-1 items-center gap-[6%] px-[8%]" aria-hidden>
        <div className="flex flex-1 flex-col gap-2.5">
          <span className="h-3 w-2/3 animate-pulse rounded-full bg-neutral-200" />
          <span className="h-2.5 w-full animate-pulse rounded-full bg-neutral-100" />
          <span className="h-2.5 w-11/12 animate-pulse rounded-full bg-neutral-100" />
          <span className="h-2.5 w-4/5 animate-pulse rounded-full bg-neutral-100" />
          <span className="mt-3 h-2.5 w-full animate-pulse rounded-full bg-neutral-100" />
          <span className="h-2.5 w-3/4 animate-pulse rounded-full bg-neutral-100" />
        </div>
        <span className="aspect-[3/4] w-[34%] animate-pulse rounded-lg bg-neutral-100" />
      </div>
      <div className="flex h-11 shrink-0 items-center justify-center gap-2 bg-neutral-800 text-[12px] text-neutral-300">
        <Loader2 className="size-3.5 animate-spin" />
        <Trans>Building the preview…</Trans>
      </div>
    </div>
  )
}

export function PreviewViewport({ src, viewport, onLocation }: PreviewViewportProps) {
  const { t } = useLingui()
  const paneRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const { pane } = useCanvasPane(paneRef, true)
  useFrameLocation(frameRef, src, onLocation)

  const content = src ? (
    <iframe
      ref={frameRef}
      key={viewport}
      src={src}
      title={t`Book preview`}
      className="size-full border-0 bg-white animate-in fade-in duration-300 motion-reduce:animate-none"
    />
  ) : (
    <Building />
  )

  if (viewport === "desktop") {
    return (
      <div ref={paneRef} className="flex min-h-0 min-w-0 flex-1 bg-muted/40 p-5">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)] ring-1 ring-black/5 dark:ring-white/10">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div ref={paneRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-muted/40">
      <PageDeviceFrame
        viewport={viewport}
        screenWidth={CAPTURE_WIDTH[viewport]}
        zoom={1}
        available={{
          width: pane.width - CANVAS_PADDING,
          height: pane.height - CANVAS_PADDING,
        }}
      >
        {content}
      </PageDeviceFrame>
    </div>
  )
}
