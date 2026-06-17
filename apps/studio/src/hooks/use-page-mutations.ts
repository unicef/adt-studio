import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

/** Invalidate data derived from storyboard changes. */
export function invalidateStoryboardDependents(queryClient: QueryClient, label: string): void {
  queryClient.invalidateQueries({ queryKey: ["books", label, "easy-read"] })
  queryClient.invalidateQueries({ queryKey: ["books", label, "text-catalog"] })
  queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] })
  queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
  queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] })
  queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", label] })
  queryClient.invalidateQueries({ queryKey: ["debug", "versions", label, "accessibility-assessment", "book"] })
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
