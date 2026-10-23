import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useSaveTranslation(label: string, language: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.updateTranslation(label, language, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["books", label, "text-catalog"] })
      void queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
    },
  })
}
