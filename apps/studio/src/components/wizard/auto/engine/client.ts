import { useMemo } from "react"
import type { SetupRecommendation } from "@adt/types"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"

/**
 * The one seam between the Add Book screens and the setup recommender (engine E3, POST
 * /api/setup-recommendation), with the user's key.
 */
export interface EngineClient {
  recommend(file: File, signal: AbortSignal): Promise<SetupRecommendation>
}

export function useEngineClient(): EngineClient {
  const { apiKey } = useApiKey()
  return useMemo(() => ({ recommend: (file, signal) => api.recommendSetup(file, apiKey, signal) }), [apiKey])
}
