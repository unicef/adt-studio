import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  publicationStateAt,
  type PublicationReaderList,
  type PublicationSummary,
  type PublicationsOverview,
} from "@adt/types"
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

/** Between two publications of the same book, the one the author means is the one readers can
 *  still open; a link that was stopped and then re-minted leaves the dead one listed too. Written
 *  order-independently on purpose — the shelf's sort is the API's business, not this map's. */
function preferred(a: PublicationSummary, b: PublicationSummary): PublicationSummary {
  const liveA = publicationStateAt(a) === "active"
  if (liveA !== (publicationStateAt(b) === "active")) return liveA ? a : b
  const when = (summary: PublicationSummary) => summary.last_published_at ?? summary.created_at
  return when(a).localeCompare(when(b)) >= 0 ? a : b
}

/**
 * Every published book on this machine, keyed by book label.
 *
 * One request feeds a whole screen of book cards: the shelf endpoint already answers for the
 * entire account, so asking per book would be N round trips for the same JSON — and the query
 * key is shared, so a second caller costs nothing.
 *
 * A missing Cloudflare connection (`412`) leaves the map empty rather than raising, because the
 * callers use it to *decorate*. The home screen is the first thing the author sees, and an author
 * who has never published anything should not meet an error there.
 */
export function usePublicationsByBook() {
  const query = usePublications()

  return useMemo(() => {
    const byLabel = new Map<string, PublicationSummary>()
    for (const publication of query.data?.publications ?? []) {
      const held = byLabel.get(publication.book_label)
      byLabel.set(publication.book_label, held ? preferred(held, publication) : publication)
    }
    return {
      byLabel,
      /** Comment counts are `0` in a locally-reconstructed summary because nobody counted them,
       *  not because nobody commented — so they are only ever shown when the worker answered. */
      countsKnown: query.data?.worker_reachable ?? false,
    }
  }, [query.data])
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
