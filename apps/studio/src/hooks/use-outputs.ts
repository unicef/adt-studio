import { useQuery } from "@tanstack/react-query"
import type { OutputDisclosureOptions } from "@adt/types"
import { api } from "@/api/client"

export function useOutputs(bookLabel: string, disclosure = false, features?: OutputDisclosureOptions) {
  return useQuery({ queryKey: ["books", bookLabel, "outputs", disclosure, features], queryFn: () => disclosure ? api.getOutputDisclosure(bookLabel, features) : api.getOutputs(bookLabel), staleTime: 30_000, refetchOnWindowFocus: false, enabled: !!bookLabel })
}

export function useOutputSummary(bookLabel: string) {
  return useQuery({ queryKey: ["books", bookLabel, "outputs", "summary"], queryFn: () => api.getOutputSummary(bookLabel), staleTime: 30_000, refetchOnWindowFocus: false, enabled: !!bookLabel })
}
