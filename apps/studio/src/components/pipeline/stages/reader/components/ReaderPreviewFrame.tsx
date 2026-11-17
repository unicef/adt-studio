import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { RotateCcw } from "lucide-react"
import { LoadingState } from "@/components/pipeline/components/LoadingState"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DEVICE_WIDTHS, type DeviceView } from "../../storyboard/components/style-editor/device-breakpoint"
import { getDeviceFrame, getTargetVisibleWidth } from "../../storyboard/components/style-editor/device-chrome"
import { IPhoneFrame } from "../../storyboard/components/style-editor/device-frames/iphone-frame"
import { IPadFrame } from "../../storyboard/components/style-editor/device-frames/ipad-frame"
import type { ReaderPreview } from "../hooks/use-reader-preview"

interface ReaderPreviewFrameProps {
  preview: ReaderPreview
  device: DeviceView
  className?: string
}

/** The packaged book in a device frame, fitted to the space it is given. */
export function ReaderPreviewFrame({ preview, device, className }: ReaderPreviewFrameProps) {
  const { t } = useLingui()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const update = () => setAvailable({ width: wrapper.clientWidth, height: wrapper.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [preview.state, device])

  if (preview.state === "packaging") {
    return (
      <div className={cn("relative h-full w-full", className)}>
        <LoadingState stageSlug="reader" label={<Trans>Packaging preview...</Trans>} />
      </div>
    )
  }

  if (preview.state === "error" || !preview.src) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center p-6", className)}>
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="whitespace-pre-wrap break-words">{preview.error ?? t`Packaging failed`}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={preview.repackage}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            <Trans>Try again</Trans>
          </Button>
        </div>
      </div>
    )
  }

  const isDesktop = device === "desktop"
  const frame = getDeviceFrame(device, DEVICE_WIDTHS[device])
  const cap = getTargetVisibleWidth(device) / frame.chromeWidth
  const fitScale = Math.min(
    Math.max(0, available.width - 32) / frame.chromeWidth,
    Math.max(0, available.height - 32) / frame.chromeHeight,
  )
  const scale = Number.isFinite(fitScale) ? Math.max(0, Math.min(cap, fitScale)) : 1
  const measured = available.width > 0 && available.height > 0
  const title = t`Reader preview`

  const framed = (
    <iframe
      ref={preview.iframeRef}
      src={preview.src}
      title={title}
      onLoad={preview.onLoad}
      className="block border-0 bg-white"
      style={{ width: frame.screenWidth, height: frame.screenHeight }}
    />
  )

  return (
    <div ref={wrapperRef} className={cn("relative flex h-full w-full items-center justify-center overflow-hidden", className)}>
      {isDesktop ? (
        <iframe
          ref={preview.iframeRef}
          src={preview.src}
          title={title}
          onLoad={preview.onLoad}
          className="h-full w-full border-0 bg-white"
        />
      ) : (
        <div
          className="transition-[transform,opacity] duration-200 ease-out"
          style={{ transform: `scale(${scale})`, transformOrigin: "center", opacity: measured ? 1 : 0 }}
        >
          {device === "mobile" ? (
            <IPhoneFrame width={frame.chromeWidth}>{framed}</IPhoneFrame>
          ) : (
            <IPadFrame screenWidth={frame.screenWidth} screenHeight={frame.screenHeight}>
              {framed}
            </IPadFrame>
          )}
        </div>
      )}
    </div>
  )
}
