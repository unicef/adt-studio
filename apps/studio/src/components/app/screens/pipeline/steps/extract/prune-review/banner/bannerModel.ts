import type { KindCount, TierResult } from "../tier"
import type { FilteredImage } from "../useFilteredImages"
import type { SecondOpinionApi } from "../second-opinion/useSecondOpinion"

export interface BannerModel {
  label: string
  hex: string
  rankOf: (item: FilteredImage) => TierResult | undefined
  filtered: number
  kept: number
  counts: { needed: number; look: number; right: number }
  steps: number
  pages: number
  reviewed: number
  needed: FilteredImage[]
  look: FilteredImage[]
  repeatsOf: (item: FilteredImage) => number
  rightKinds: readonly KindCount[]
  loading: boolean
  session: { started: boolean; finished: boolean; back: number; kept: number }
  showAll: boolean
  onShowAll: (value: boolean) => void
  ai: { opinion: SecondOpinionApi; scope: readonly FilteredImage[]; onAsk: () => void }
  decisionOf: (item: FilteredImage) => "back" | "kept" | null
  busyOf: (item: FilteredImage) => boolean
  blocked: boolean
  simulated: boolean
  onBringBack: (item: FilteredImage) => void
  onLeaveOut: (item: FilteredImage) => void
  onUndo: (item: FilteredImage) => void
  onStart: () => void
  onOpen: (item: FilteredImage) => void
  onDismiss: () => void
}
