import { createContext, useContext, type ReactNode } from "react"
import type { Ranks } from "./ranking"
import type { RepeatIndex } from "./tier"
import type { FilteredImage } from "./useFilteredImages"
import type { BannerModel } from "./banner/bannerModel"
import type { Opinion } from "./second-opinion/opinionStore"

export interface LeftOutPageApi {
  hex: string
  showAll: boolean
  focus: { pageId: string; imageId: string } | null
  ranks: Ranks
  repeats: RepeatIndex
  model: BannerModel | null
  reviewTab: ReviewTab | null
}

export interface ReviewTab {
  content: ReactNode
  left: number
  keep: number
  unsure: number
  asked: boolean
  top: FilteredImage | null
  label: string
  running: boolean
  start: () => void
  pick: (key: string) => void
  opinionOf: (item: FilteredImage) => Opinion | null
}

const LeftOutContext = createContext<LeftOutPageApi | null>(null)

export function LeftOutProvider({ value, children }: { value: LeftOutPageApi | null; children: ReactNode }) {
  return <LeftOutContext.Provider value={value}>{children}</LeftOutContext.Provider>
}

export function useLeftOutPage(): LeftOutPageApi | null {
  return useContext(LeftOutContext)
}
