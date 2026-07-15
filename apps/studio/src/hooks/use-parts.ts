import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../api/client"

/** Manifest info if this book was imported as a part (else null). */
export function usePartInfo(label: string) {
  return useQuery({
    queryKey: ["books", label, "part-info"],
    queryFn: () => api.getPartInfo(label),
    enabled: !!label,
  })
}

/** Coordinator-side split tracking: exported parts + merge coverage. */
export function useSplitStatus(label: string) {
  return useQuery({
    queryKey: ["books", label, "split-status"],
    queryFn: () => api.getSplitStatus(label),
    enabled: !!label,
  })
}

/** Dry-run a merge of a completed-part project zip. */
export function usePreviewMerge(label: string) {
  return useMutation({
    mutationFn: (zip: File) => api.previewMerge(label, zip),
  })
}

/** Merge a completed-part project zip into this book. */
export function useMergePart(label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ zip, acknowledge }: { zip: File; acknowledge: boolean }) =>
      api.mergePart(label, zip, acknowledge),
    onSuccess: () => {
      // Pages, node data and step status all change — refresh the book subtree.
      queryClient.invalidateQueries({ queryKey: ["books", label] })
      queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] })
      // The library card's split/merge badge reads the list query, which is
      // separate from the book subtree and otherwise stays fresh (global 5-min
      // staleTime) — invalidate it so merge progress shows on the card.
      queryClient.invalidateQueries({ queryKey: ["books"], exact: true })
    },
  })
}
