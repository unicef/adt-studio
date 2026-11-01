import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { publicationsKey } from "./use-publications"
import {
  api,
  type CloudflareConnectionDeleteResponse,
  type CloudflareConnectionStatus,
  type CloudflareCredentials,
} from "@/api/client"

export const cloudflareConnectionKey = ["cloudflare", "connection"] as const

export function useCloudflareConnection(
  credentials: Partial<CloudflareCredentials>,
  options?: { enabled?: boolean },
) {
  return useQuery<CloudflareConnectionStatus>({
    queryKey: cloudflareConnectionKey,
    queryFn: () => api.getCloudflareConnection(credentials),
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 30_000,
  })
}

export interface DisconnectCloudflareInput {
  credentials: Partial<CloudflareCredentials>
  deleteResources?: boolean
}

export function useDisconnectCloudflare() {
  const queryClient = useQueryClient()
  return useMutation<CloudflareConnectionDeleteResponse, Error, DisconnectCloudflareInput>({
    mutationFn: ({ credentials, deleteResources }) =>
      api.disconnectCloudflare(credentials, { deleteResources }),
    /**
     * Everything that was true *because* an account was connected has to go with it.
     *
     * Clearing only the connection left the shelf, each book's publication status and the
     * comment counts sitting in the cache at their 30s `staleTime`, so the home and library
     * cards kept their Shared badges — and after "delete everything" they were badges for
     * books that no longer existed anywhere. The author had to reload the app to be told the
     * truth.
     *
     * `removeQueries` rather than `invalidateQueries`: there is no longer an account to answer
     * for them, so the honest state is *absent*, not *stale*. The book-scoped keys are matched
     * by prefix, which covers the publication status, its comments and its page manifest.
     */
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: cloudflareConnectionKey })
      queryClient.removeQueries({ queryKey: publicationsKey })
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === "books" && key[2] === "publication"
        },
      })
    },
  })
}
