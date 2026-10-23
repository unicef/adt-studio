import type { CSSProperties } from "react"

export function useChromeRoot(hex: string): {
  "data-chrome-panels": string
  style: CSSProperties
} {
  return {
    "data-chrome-panels": "arc",
    style: { "--chrome-hex": hex } as CSSProperties,
  }
}
