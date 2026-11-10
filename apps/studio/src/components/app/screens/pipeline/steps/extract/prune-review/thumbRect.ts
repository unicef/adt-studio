import { rectOf, type PageRect } from "@/components/app/screens/pipeline/steps/shared/page-inspector/pageRect"
import type { ImageBounds, PageSize } from "@/components/app/screens/pipeline/steps/shared/page-inspector/types"

export type ThumbFit = "cover" | "contain"

function clip(start: number, size: number): [number, number] {
  const from = Math.max(0, start)
  const to = Math.min(100, start + size)
  return [from, to - from]
}

export function fitRect(rect: PageRect, pageAspect: number, boxAspect: number, fit: ThumbFit): PageRect | null {
  if (!(pageAspect > 0) || !(boxAspect > 0)) return null
  const scale = fit === "cover" ? Math.max(boxAspect / pageAspect, 1) : Math.min(boxAspect / pageAspect, 1)
  const drawnWidth = pageAspect * scale
  const offsetX = (boxAspect - drawnWidth) / 2
  const offsetY = (1 - scale) / 2
  const left = ((offsetX + (rect.left / 100) * drawnWidth) / boxAspect) * 100
  const width = (((rect.width / 100) * drawnWidth) / boxAspect) * 100
  const top = (offsetY + (rect.top / 100) * scale) * 100
  const height = (rect.height / 100) * scale * 100
  const [clippedLeft, clippedWidth] = clip(left, width)
  const [clippedTop, clippedHeight] = clip(top, height)
  if (clippedWidth <= 0 || clippedHeight <= 0) return null
  return { left: clippedLeft, top: clippedTop, width: clippedWidth, height: clippedHeight }
}

export function thumbRect(bounds: ImageBounds | undefined, pageSize: PageSize | null, boxAspect: number, fit: ThumbFit): PageRect | null {
  if (!bounds || !pageSize || !(pageSize.w > 0) || !(pageSize.h > 0)) return null
  const rect = rectOf({ imageId: "", number: 0, bounds }, pageSize)
  return rect ? fitRect(rect, pageSize.w / pageSize.h, boxAspect, fit) : null
}
