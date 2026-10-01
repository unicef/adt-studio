import { useEffect, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { useWidthPresets } from "adt-html-editor"
import { PreviewViewportToggle } from "@/components/pipeline/components/PreviewViewportToggle"
import { CAPTURE_WIDTH } from "@/components/app/screens/pipeline/canvas/canvasLayout"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"

export interface CanvasWidthControlProps {
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
}

export function CanvasWidthControl({ viewport, onViewportChange }: CanvasWidthControlProps) {
  const { t } = useLingui()
  const presets = useMemo(
    () => [
      { id: "desktop", label: t`Desktop`, width: 0 },
      { id: "tablet", label: t`Tablet`, width: CAPTURE_WIDTH.tablet },
      { id: "mobile", label: t`Mobile`, width: CAPTURE_WIDTH.mobile },
    ],
    [t],
  )

  const control = useWidthPresets(presets)
  const { activeId, select } = control

  useEffect(() => {
    if (activeId !== viewport) select(viewport)
  }, [viewport, activeId, select])

  return (
    <PreviewViewportToggle
      value={viewport}
      onChange={onViewportChange}
      variant="surface"
      className="h-8"
    />
  )
}
