import { pageBoundsToCropRect } from "@/components/pipeline/stages/storyboard/components/ImageCropDialog"
import type { PageBox, PageSize } from "./types"

export interface PageRect {
  left: number
  top: number
  width: number
  height: number
}

export function rectOf(entry: PageBox, size: PageSize): PageRect | null {
  if (!entry.bounds) return null
  const rect = pageBoundsToCropRect(entry.bounds)
  return { left: (rect.x / size.w) * 100, top: (rect.y / size.h) * 100, width: (rect.width / size.w) * 100, height: (rect.height / size.h) * 100 }
}

export function sameRect(a: PageRect | null, b: PageRect | null): boolean {
  if (!a || !b) return a === b
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

export function entryAt(entries: readonly PageBox[], size: PageSize, x: number, y: number): PageBox | null {
  let best: PageBox | null = null
  let bestArea = Infinity
  for (const entry of entries) {
    const rect = rectOf(entry, size)
    if (!rect) continue
    if (x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) continue
    const area = rect.width * rect.height
    if (area < bestArea) {
      best = entry
      bestArea = area
    }
  }
  return best
}
