import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import type { ProviderHealthResponse } from "@adt/types"
import { getProviderHealth } from "@/api/client"

const HEALTH_STALE_TIME_MS = 30 * 1000

/**
 * Live connection check for one provider. Keyed by provider only, so typing in a
 * credential field never triggers a probe — the draft values are read when a
 * check actually runs, and `refetch` re-runs it with whatever is typed now.
 */
export function useProviderHealth(
  providerId: string,
  draftCredentials: Record<string, string> | undefined,
  enabled: boolean,
): UseQueryResult<ProviderHealthResponse> {
  return useQuery({
    queryKey: ["provider-health", providerId],
    queryFn: () => getProviderHealth(providerId, draftCredentials),
    enabled: enabled && Boolean(providerId),
    staleTime: HEALTH_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })
}
