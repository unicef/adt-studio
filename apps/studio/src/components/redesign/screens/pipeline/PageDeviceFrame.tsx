import { getDeviceFrame } from "@/components/pipeline/stages/storyboard/components/style-editor/device-chrome"
import { IPadFrame } from "@/components/pipeline/stages/storyboard/components/style-editor/device-frames/ipad-frame"
import { IPhoneFrame } from "@/components/pipeline/stages/storyboard/components/style-editor/device-frames/iphone-frame"

export interface PageDeviceFrameProps {
  viewport: "tablet" | "mobile"
  /** Logical width the sections were rendered at. */
  screenWidth: number
  zoom: number
  /** Pane space the device has to fit into; 0 before the first measurement. */
  available: { width: number; height: number }
  children: React.ReactNode
}

/** iPhone / iPad chrome around the rendered page, reusing the shells the
 *  classic storyboard preview uses. */
export function PageDeviceFrame({
  viewport,
  screenWidth,
  zoom,
  available,
  children,
}: PageDeviceFrameProps) {
  const frame = getDeviceFrame(viewport, screenWidth)
  const fit =
    available.width && available.height
      ? Math.min(1, available.width / frame.chromeWidth, available.height / frame.chromeHeight)
      : 1
  const scale = fit * zoom
  const screen = <div className="size-full overflow-y-auto">{children}</div>

  return (
    <div
      style={{
        width: Math.round(frame.chromeWidth * scale),
        height: Math.round(frame.chromeHeight * scale),
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        {viewport === "mobile" ? (
          <IPhoneFrame width={frame.chromeWidth}>{screen}</IPhoneFrame>
        ) : (
          <IPadFrame screenWidth={frame.screenWidth} screenHeight={frame.screenHeight}>
            {screen}
          </IPadFrame>
        )}
      </div>
    </div>
  )
}
