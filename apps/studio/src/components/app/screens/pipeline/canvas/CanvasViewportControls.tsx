import { useLingui } from "@lingui/react/macro"
import { PreviewViewportToggle } from "@/components/pipeline/components/PreviewViewportToggle"
import { ChromeToggleIcon } from "@/components/app/screens/pipeline/chrome/ChromeToggleIcon"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { cn } from "@/lib/utils"
import { useRailOpen, useRightPanelOpen } from "@/components/app/screens/pipeline/shared/panelFit"
import { ZoomControl } from "./ZoomControl"
import { StyleToolbar } from "./editing/style-toolbar/StyleToolbar"

export interface CanvasViewportControlsProps {
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  chromeHidden: boolean
  onToggleChrome: () => void
  tools?: React.ReactNode
}

export function CanvasViewportControls({
  viewport,
  onViewportChange,
  zoom,
  onZoomChange,
  chromeHidden,
  onToggleChrome,
  tools,
}: CanvasViewportControlsProps) {
  const { t } = useLingui()
  const [railOpen] = useRailOpen()
  const [rightOpen] = useRightPanelOpen()
  const chromeLabel = chromeHidden ? t`Show the controls` : t`Hide the controls`

  return (
    <>
      {tools && (
        <div
          className={cn(
            "absolute left-4 top-4 z-10 transition-[translate] duration-300 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none",
            railOpen ? "translate-x-0" : "translate-x-12",
          )}
        >
          <div
            aria-hidden={chromeHidden || undefined}
            inert={chromeHidden}
            className={cn(
              "flex items-center gap-1.5 transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none",
              chromeHidden ? "pointer-events-none -translate-y-1 opacity-0" : "translate-y-0 opacity-100",
            )}
          >
            {tools}
          </div>
        </div>
      )}
    <div
      className={cn(
        "absolute right-4 top-4 z-10 flex items-center gap-1.5 transition-[translate] duration-300 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none",
        rightOpen ? "translate-x-0" : "-translate-x-12",
      )}
    >
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
        title={chromeLabel}
        aria-label={chromeLabel}
        className="grid size-8 place-items-center rounded-lg border bg-card/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted"
      >
        <ChromeToggleIcon hidden={chromeHidden} className="size-4" />
      </button>
    </div>
    <StyleToolbar viewport={viewport} />
    </>
  )
}
