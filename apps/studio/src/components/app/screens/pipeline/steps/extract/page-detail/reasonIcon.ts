import { CircleSlash, Copy, Crop, EyeOff, FileImage, LayoutTemplate, Maximize2, Minimize2, Scissors, ShieldCheck, Square, UserRound, type LucideIcon } from "lucide-react"
import type { ReasonKind } from "./humanReason"

export const REASON_ICON: Record<ReasonKind, LucideIcon> = {
  "page-elements": LayoutTemplate,
  "not-meaningful": CircleSlash,
  duplicate: Copy,
  "too-small": Minimize2,
  "too-large": Maximize2,
  blank: Square,
  segmented: Scissors,
  cropped: Crop,
  manual: UserRound,
  "full-page": FileImage,
  "guard-kept": ShieldCheck,
  other: EyeOff,
}
