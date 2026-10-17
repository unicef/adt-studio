import { useQuery } from "@tanstack/react-query"
import type { OutputDisclosureOptions } from "@adt/types"
import { api } from "@/api/client"

export function useOutputs(bookLabel: string, disclosure = false, features?: OutputDisclosureOptions) {
  const summary = useOutputSummary(bookLabel)
  // Summary performs the one-time compatibility baseline under writer admission.
  // Gate cold reads, and key retries by its receipt: an older in-flight response
  // must never overwrite the post-baseline catalog when a busy book unlocks.
  return useQuery({ queryKey: ["books", bookLabel, "outputs", disclosure, features, summary.data?.legacyBaselineRevision ?? 0], queryFn: () => disclosure ? api.getOutputDisclosure(bookLabel, features) : api.getOutputs(bookLabel), staleTime: 30_000, refetchOnWindowFocus: false, enabled: !!bookLabel && summary.isSuccess })
}

export function useOutputSummary(bookLabel: string) {
  return useQuery({ queryKey: ["books", bookLabel, "outputs", "summary"], queryFn: () => api.getOutputSummary(bookLabel), staleTime: 30_000, refetchOnWindowFocus: false, enabled: !!bookLabel })
}
