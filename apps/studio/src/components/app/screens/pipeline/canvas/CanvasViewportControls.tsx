import { useLingui } from "@lingui/react/macro"
import { PreviewViewportToggle } from "@/components/pipeline/components/PreviewViewportToggle"
import { ChromeToggleIcon } from "@/components/app/screens/pipeline/chrome/ChromeToggleIcon"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { ZoomControl } from "./ZoomControl"

export interface CanvasViewportControlsProps {
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  chromeHidden: boolean
  onToggleChrome: () => void
}

export function CanvasViewportControls({
  viewport,
  onViewportChange,
  zoom,
  onZoomChange,
  chromeHidden,
  onToggleChrome,
}: CanvasViewportControlsProps) {
  const { t } = useLingui()

  return (
    <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5">
      {!chromeHidden && (
        <>
          <PreviewViewportToggle
            value={viewport}
            onChange={onViewportChange}
            variant="surface"
            className="h-8 rounded-lg border shadow-sm"
          />
          <ZoomControl
            value={zoom}
            onChange={onZoomChange}
            className="bg-card/85 shadow-sm backdrop-blur-sm"
          />
        </>
      )}
      <button
        type="button"
        onClick={onToggleChrome}
        aria-pressed={chromeHidden}
        title={chromeHidden ? t`Show the controls` : t`Hide the controls`}
        aria-label={chromeHidden ? t`Show the controls` : t`Hide the controls`}
        className="grid size-8 place-items-center rounded-lg border bg-card/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted"
      >
        <ChromeToggleIcon hidden={chromeHidden} className="size-4" />
      </button>
    </div>
  )
}
