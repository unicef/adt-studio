import type { CSSProperties } from "react"
import { useVariants } from "./variants"

export function useChromeRoot(hex: string, panels?: string): {
  "data-chrome-panels": string
  "data-tb-action": string
  "data-top-step": string
  style: CSSProperties
} {
  const variants = useVariants()
  return {
    "data-chrome-panels": panels ?? variants.panels,
    "data-tb-action": variants.topaction,
    "data-top-step": variants.topstep,
    style: { "--chrome-hex": hex } as CSSProperties,
  }
}
