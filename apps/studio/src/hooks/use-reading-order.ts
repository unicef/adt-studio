import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type ReadingOrderEntry, type ReadingOrderResponse } from "@/api/client"

export function readingOrderKey(label: string) {
  return ["books", label, "reading-order"] as const
}

export function useReadingOrder(label: string) {
  return useQuery({
    queryKey: readingOrderKey(label),
    queryFn: () => api.getReadingOrder(label),
    enabled: !!label,
  })
}

/** Move `id` to `toIndex` within `order`, accounting for the removal shift. */
export function moveReadingOrderItem(
  order: readonly ReadingOrderEntry[],
  id: string,
  toIndex: number,
): ReadingOrderEntry[] {
  const from = order.findIndex((entry) => entry.id === id)
  if (from === -1) return [...order]
  const next = [...order]
  const [moved] = next.splice(from, 1)
  // Removing the item first shifts every later position down by one, so a
  // target that was after the original index has to come back by one too.
  next.splice(from < toIndex ? toIndex - 1 : toIndex, 0, moved)
  return next
}

/**
 * Save a reordering, updating the cache before the request lands so the row
 * doesn't visibly snap back to its old slot while the save is in flight.
 * Restores the previous cache entry if the save fails.
 */
export function useSaveReadingOrder(label: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      items,
      expectedVersion,
    }: {
      items: ReadingOrderEntry[]
      expectedVersion: number | null
    }) => api.updateReadingOrder(label, items, expectedVersion),

    onMutate: async ({ items }) => {
      await queryClient.cancelQueries({ queryKey: readingOrderKey(label) })
      const previous = queryClient.getQueryData<ReadingOrderResponse>(readingOrderKey(label))
      if (previous) {
        const byId = new Map(previous.items.map((item) => [item.id, item]))
        // Excluded (pruned) ids hold a slot in `order` but have no rendered
        // item, so the visible list is the saved order filtered through what
        // was actually being shown.
        const nextItems = items
          .flatMap((entry) => {
            const item = byId.get(entry.id)
            return item ? [item] : []
          })
          .map((item, index) => ({ ...item, position: index + 1 }))
        queryClient.setQueryData<ReadingOrderResponse>(readingOrderKey(label), {
          ...previous,
          items: nextItems,
          order: items,
        })
      }
      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(readingOrderKey(label), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: readingOrderKey(label) })
      // The packaged bundle and its accessibility assessment were invalidated
      // server-side; nothing else about the book changed.
      void queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
      void queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] })
    },
  })
}
