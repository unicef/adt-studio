import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import type { RenderingData } from "./renderingDraft"

export function useSaveRendering(label: string, pageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rendering: RenderingData) => api.saveStoryboard(label, pageId, { rendering }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] }),
        queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] }),
      ])
      invalidateStoryboardDependents(queryClient, label)
    },
  })
}
