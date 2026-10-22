import { CAPTURE_WIDTH } from "@/components/app/screens/pipeline/canvas/canvasLayout"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"

export interface PreviewSize {
  width: number
  height: number
}

export const DEVICE_SIZE: Record<Viewport, PreviewSize> = {
  desktop: { width: CAPTURE_WIDTH.desktop, height: 800 },
  tablet: { width: CAPTURE_WIDTH.tablet, height: 1024 },
  mobile: { width: CAPTURE_WIDTH.mobile, height: 844 },
}

const MIN_SIZE = 240
const MAX_SIZE = 4096

export function clampSize(value: number): number {
  return Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, value)))
}
