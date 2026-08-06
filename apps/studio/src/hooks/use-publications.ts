import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { PublicationReaderList, PublicationsOverview } from "@adt/types"
import { api, type PublicationResponse } from "@/api/client"
import { bookPublicationKey } from "./use-book-publication"

export const publicationsKey = ["publications"] as const

/**
 * The account's whole shelf, for the Publications dashboard.
 *
 * `retry: false` because the two answers that matter are both deliberate: `412` means no
 * Cloudflare account is connected, and a `200` with `worker_reachable: false` already *is* the
 * degraded answer. Retrying would only delay the screen.
 */
export function usePublications() {
  return useQuery<PublicationsOverview>({
    queryKey: publicationsKey,
    queryFn: api.getPublications,
    retry: false,
    staleTime: 30_000,
  })
}

export const publicationReadersKey = (token: string) => ["publications", token, "readers"] as const

/**
 * Who has joined one publication. Only fetched while its panel is open — the shelf draws tens
 * of rows and none of them needs a roster until the author asks for one.
 */
export function usePublicationReaders(token: string, enabled: boolean) {
  return useQuery<PublicationReaderList>({
    queryKey: publicationReadersKey(token),
    queryFn: () => api.getPublicationReaders(token),
    enabled,
    retry: false,
    staleTime: 30_000,
  })
}

/** Both sharing switches take the book label, so one mutation serves every row: `variables`
 *  tells a row whether the in-flight call is its own. Each invalidates the shelf *and* that
 *  book's own publication query, so the Export panel and the stage rail never lag behind. */
function useSharingMutation(call: (label: string) => Promise<PublicationResponse>) {
  const queryClient = useQueryClient()
  return useMutation<PublicationResponse, Error, string>({
    mutationFn: call,
    onSuccess: (_response, label) => {
      void queryClient.invalidateQueries({ queryKey: publicationsKey })
      void queryClient.invalidateQueries({ queryKey: bookPublicationKey(label) })
    },
  })
}

export function useStopSharing() {
  return useSharingMutation((label) => api.revokeBookPublication(label))
}

export function useResumeSharing() {
  return useSharingMutation((label) => api.resumeBookPublication(label))
}
