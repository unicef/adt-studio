import { isLandscapeRatio } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { CANVAS_PAGE_RATIO } from "./useCanvasFit"

const SAME_RATIO = 0.01

export function canvasColumns(cols: number, cellRatio: number): number {
  return Math.max(1, Math.round(cols / Math.max(1, cellRatio / CANVAS_PAGE_RATIO)))
}

export function fitFor(pageRatio: number, boxRatio: number): "cover" | "contain" {
  return Math.abs(pageRatio / boxRatio - 1) <= SAME_RATIO ? "cover" : "contain"
}

export interface WallCell {
  span: 1 | 2
  half: "start" | "end" | null
  ratio: number
  fit: "cover" | "contain"
}

export function wallCell({
  pageRatio,
  wallRatio,
  first,
  columns,
}: {
  pageRatio: number
  wallRatio: number
  first: boolean
  columns: number
}): WallCell {
  const wallLandscape = isLandscapeRatio(wallRatio)
  const pageLandscape = isLandscapeRatio(pageRatio)
  if (wallLandscape === pageLandscape) return { span: 1, half: null, ratio: wallRatio, fit: fitFor(pageRatio, wallRatio) }
  if (wallLandscape) return { span: 1, half: first ? "end" : "start", ratio: wallRatio / 2, fit: fitFor(pageRatio, wallRatio / 2) }
  return { span: columns < 2 ? 1 : 2, half: null, ratio: wallRatio, fit: "contain" }
}
