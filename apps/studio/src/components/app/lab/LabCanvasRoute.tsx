import { Suspense, lazy, type ComponentType } from "react"
import { Trans } from "@lingui/react/macro"

const canvasModules = import.meta.glob<{ CanvasView: ComponentType }>("./canvas/CanvasView.tsx") // eslint-disable-line lingui/no-unlocalized-strings -- module path for the optional local-only canvas
const loadCanvas = canvasModules["./canvas/CanvasView.tsx"]
const LazyCanvas = loadCanvas ? lazy(() => loadCanvas().then((module) => ({ default: module.CanvasView }))) : null

export const HAS_CANVAS = LazyCanvas !== null

export function LabCanvasRoute() {
  if (!LazyCanvas) return null
  return (
    <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground"><Trans>Loading the canvas…</Trans></div>}>
      <LazyCanvas />
    </Suspense>
  )
}
