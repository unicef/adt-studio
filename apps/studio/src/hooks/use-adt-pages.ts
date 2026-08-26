import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

/** Reads the packaged ADT page manifest. Returns no data until the book has been
 *  packaged at least once — callers must treat a missing manifest as "open the
 *  preview at its first page" rather than an error. */
export function useAdtPages(label: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["books", label, "adt-pages"],
    queryFn: () => api.getAdtPages(label),
    enabled: !!label && (options?.enabled ?? true),
    retry: false,
    staleTime: 30_000,
  })
}
