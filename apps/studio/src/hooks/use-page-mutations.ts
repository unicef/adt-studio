import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useSaveTextClassification(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.updateTextClassification(label, pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
    },
  })
}

export function useSaveImageClassification(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.updateImageClassification(label, pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
    },
  })
}

export function useSaveSectioning(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.updateSectioning(label, pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
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
    },
  })
}
