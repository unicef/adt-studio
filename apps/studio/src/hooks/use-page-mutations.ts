import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import { readingOrderKey } from "@/hooks/use-reading-order"

/** Invalidate data derived from storyboard changes. */
export function invalidateStoryboardDependents(queryClient: QueryClient, label: string): void {
  queryClient.invalidateQueries({ queryKey: ["books", label, "easy-read"] })
  queryClient.invalidateQueries({ queryKey: ["books", label, "text-catalog"] })
  queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] })
  queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
  queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] })
  queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", label] })
  queryClient.invalidateQueries({ queryKey: ["debug", "versions", label, "accessibility-assessment", "book"] })
  // The reading order is derived too: the server resolves it from the sections
  // that exist and the ones the storyboard has rendered, so cloning, splitting,
  // merging, deleting, pruning or re-rendering all change either which slots
  // there are or which of them have a book page. Every one of those operations
  // already routes through here, which is the only reason this belongs in the
  // shared helper rather than at each call site — and why re-adding a removed
  // page used to leave the order stale until something unrelated refetched it.
  queryClient.invalidateQueries({ queryKey: readingOrderKey(label) })
}

export function useSaveImageClassification(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.updateImageClassification(label, pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
    },
  })
}

export function useSaveSectioning(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.updateSectioning(label, pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
      invalidateStoryboardDependents(queryClient, label)
    },
  })
}

export function useReRenderPage(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (apiKey: string) => api.reRenderPage(label, pageId, apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
      invalidateStoryboardDependents(queryClient, label)
    },
  })
}
