import type { Ref } from "react"

export type SectionKind = "images" | "text" | "fonts"

export interface SectionMore {
  open: boolean
  onMore: () => void
  buttonRef: Ref<HTMLButtonElement>
}
