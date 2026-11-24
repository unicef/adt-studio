import { createContext, useContext } from "react"
import type { SetupResult } from "./contract"

const RecommendationContext = createContext<SetupResult | null>(null)

/** The recommendation the current book was set up with, shared by the loader, Decide, Review and Create. */
export const RecommendationProvider = RecommendationContext.Provider

export function useRecommendation(): SetupResult | null {
  return useContext(RecommendationContext)
}
