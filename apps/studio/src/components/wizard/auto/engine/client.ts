import { createContext, createElement, useContext, useMemo, type ReactNode } from "react"
import type { SetupRecommendation } from "@adt/types"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"

/**
 * The one seam between the Add Book screens and the setup recommender (engine E3, POST
 * /api/setup-recommendation). Every screen asks through this, so the variant lab can answer with
 * saved recommendations, a slow answer or a provider error without the screens knowing.
 */
export interface EngineClient {
  recommend(file: File, signal: AbortSignal): Promise<SetupRecommendation>
}

const EngineClientContext = createContext<EngineClient | null>(null)

/** Replaces the API with another engine client (the lab's scenarios, tests). */
export function EngineClientProvider({ value, children }: { value: EngineClient; children: ReactNode }) {
  return createElement(EngineClientContext.Provider, { value }, children)
}

/** The engine client in use: the provider's, or the real API with the user's key. */
export function useEngineClient(): EngineClient {
  const override = useContext(EngineClientContext)
  const { apiKey } = useApiKey()
  return useMemo(() => override ?? { recommend: (file, signal) => api.recommendSetup(file, apiKey, signal) }, [override, apiKey])
}
