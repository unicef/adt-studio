import { getDeviceFrame } from "@/components/pipeline/stages/storyboard/components/style-editor/device-chrome"
import { IPadFrame } from "@/components/pipeline/stages/storyboard/components/style-editor/device-frames/ipad-frame"
import { IPhoneFrame } from "@/components/pipeline/stages/storyboard/components/style-editor/device-frames/iphone-frame"
import { deviceFitScale } from "./canvasLayout"

export interface PageDeviceFrameProps {
  viewport: "tablet" | "mobile"
  screenWidth: number
  zoom: number
  available: { width: number; height: number }
  children: React.ReactNode
}

export function PageDeviceFrame({
  viewport,
  screenWidth,
  zoom,
  available,
  children,
}: PageDeviceFrameProps) {
  const frame = getDeviceFrame(viewport, screenWidth)
  const scale = deviceFitScale(frame, available) * zoom
  const screen = <div className="size-full overflow-y-auto">{children}</div>

  return (
    <div
      className="shrink-0 transition-[width,height] duration-200 ease-out motion-reduce:transition-none"
      style={{
        width: Math.round(frame.chromeWidth * scale),
        height: Math.round(frame.chromeHeight * scale),
      }}
    >
      <div
        className="transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}
      >
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
