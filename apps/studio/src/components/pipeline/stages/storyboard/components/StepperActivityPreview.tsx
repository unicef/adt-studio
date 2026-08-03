/**
 * Device-framed preview for step-by-step activities. The stepper renders in a
 * plain server-preview iframe (its content is runtime-generated, so the
 * WYSIWYG BookPreviewFrame doesn't apply) — this wrapper gives that iframe
 * the same iPhone/iPad chrome and fit-to-width scaling the classic activity
 * preview gets, so tablet/mobile checks look identical across both modes.
 */
import { useLayoutEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { getDeviceFrame } from "./style-editor/device-chrome"
import { DEVICE_WIDTHS, type DeviceView } from "./style-editor/device-breakpoint"
import { IPhoneFrame } from "./style-editor/device-frames/iphone-frame"
import { IPadFrame } from "./style-editor/device-frames/ipad-frame"

export function StepperActivityPreview({
  src,
  deviceView,
}: {
  src: string
  deviceView: DeviceView
}) {
  const { t } = useLingui()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const measure = () => setAvailableWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (deviceView === "desktop") {
    return (
      <div className="flex justify-center">
        <iframe
          src={src}
          title={t`Step-by-step activity preview`}
          className="rounded border bg-white"
          style={{ width: DEVICE_WIDTHS.desktop, maxWidth: "100%", height: "80vh" }}
        />
      </div>
    )
  }

  const frame = getDeviceFrame(deviceView, DEVICE_WIDTHS[deviceView])
  // The chrome is wider than the screen — scale the whole device down when
  // the pane is narrower than the frame (transform doesn't affect layout, so
  // the wrapper height is set to the scaled chrome height explicitly).
  const scale = availableWidth ? Math.min(1, availableWidth / frame.chromeWidth) : 1
  const iframeNode = (
    <iframe
      src={src}
      title={t`Step-by-step activity preview`}
      className="bg-white"
      style={{
        width: frame.screenWidth,
        height: frame.screenHeight,
        border: "none",
        display: "block",
      }}
    />
  )

  return (
    <div
      ref={wrapperRef}
      className="flex justify-center"
      style={{ height: Math.round(frame.chromeHeight * scale) }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "50% 0" }}>
        {deviceView === "mobile" ? (
          <IPhoneFrame width={frame.chromeWidth}>{iframeNode}</IPhoneFrame>
        ) : (
          <IPadFrame screenWidth={frame.screenWidth} screenHeight={frame.screenHeight}>
            {iframeNode}
          </IPadFrame>
        )}
      </div>
    </div>
  )
}
