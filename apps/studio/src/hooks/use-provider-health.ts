import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import type { ProviderHealthResponse } from "@adt/types"
import { getProviderHealth } from "@/api/client"

const HEALTH_STALE_TIME_MS = 30 * 1000

/**
 * Query-key prefix for a provider's live connection checks — both the saved-key
 * check and the Settings draft check. Invalidate it after a save, sign-in or
 * sign-out; `["provider-health"]` alone covers every provider.
 */
export const providerHealthKey = (providerId: string) => ["provider-health", providerId] as const

/**
 * Live connection check for one provider.
 *
 * Without `draftCredentials` it checks the saved keys (the request carries the
 * stored keys and the API falls back to its own). That result is what the app's
 * "key rejected" warnings read, so a form's unsaved draft is checked under a
 * separate cache entry and can never stand in for the saved key.
 *
 * Neither key includes the draft values, so typing never triggers a probe: the
 * draft is read when a check actually runs, and `refetch` re-runs it with
 * whatever is typed now.
 */
export function useProviderHealth(
  providerId: string,
  draftCredentials: Record<string, string> | undefined,
  enabled: boolean,
): UseQueryResult<ProviderHealthResponse> {
  const scope = draftCredentials ? "draft" : "stored"
  return useQuery({
    queryKey: [...providerHealthKey(providerId), scope],
    queryFn: () => getProviderHealth(providerId, draftCredentials),
    enabled: enabled && Boolean(providerId),
    staleTime: HEALTH_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })
}
