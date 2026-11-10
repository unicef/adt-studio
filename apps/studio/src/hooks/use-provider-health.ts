import { useQuery, type QueryClient, type UseQueryResult } from "@tanstack/react-query"
import type { ProviderHealthResponse } from "@adt/types"
import { getProviderHealth } from "@/api/client"

const HEALTH_STALE_TIME_MS = 30 * 1000

/**
 * Query-key prefix for a provider's live connection checks — both the saved-key
 * check and the Settings draft check. Invalidate it after a save, sign-in or
 * sign-out; `["provider-health"]` alone covers every provider.
 */
export const providerHealthKey = (providerId: string) => ["provider-health", providerId] as const

/** The saved-key check of one provider — the entry the app-wide warnings read. */
const storedHealthKey = (providerId: string) => [...providerHealthKey(providerId), "stored"] as const

/** How long a save waits for a check before giving up and treating the key as not refused. */
const SAVE_CHECK_TIMEOUT_MS = 15 * 1000

/**
 * After credentials were saved: re-run every connection check (a key can be
 * shared, so other providers' results change too), wait for the saved-key
 * check of `providerIds`, and return the ids whose key the provider refused.
 *
 * Only an outright `invalid-credential` counts. An outage, a timeout or a
 * failed request says nothing about the key, so it never holds a save back.
 */
export async function recheckSavedKeys(
  queryClient: QueryClient,
  providerIds: readonly string[],
): Promise<string[]> {
  void queryClient.invalidateQueries({ queryKey: ["provider-health"] })
  const results = await Promise.all(
    providerIds.map(async (providerId) => {
      const check = queryClient
        .fetchQuery({
          queryKey: storedHealthKey(providerId),
          queryFn: () => getProviderHealth(providerId),
          staleTime: HEALTH_STALE_TIME_MS,
          retry: false,
        })
        .then((health) => health.code === "invalid-credential")
        .catch(() => false)
      const timeout = new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), SAVE_CHECK_TIMEOUT_MS),
      )
      return (await Promise.race([check, timeout])) ? providerId : null
    }),
  )
  return results.filter((id): id is string => id !== null)
}

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
  return useQuery({
    queryKey: draftCredentials
      ? [...providerHealthKey(providerId), "draft"]
      : storedHealthKey(providerId),
    queryFn: () => getProviderHealth(providerId, draftCredentials),
    enabled: enabled && Boolean(providerId),
    staleTime: HEALTH_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })
}
