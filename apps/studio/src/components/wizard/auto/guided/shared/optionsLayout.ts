import { createContext } from "react"

/**
 * Compact option cards (a small picture beside the words). "others": under a sure pick, its other
 * options (the picked one is shown large above, so it's left out). "all": every option, the picked
 * one marked (a screen with more than one question). False: the full cards.
 */
export const CompactOptionsContext = createContext<false | "others" | "all">(false)
