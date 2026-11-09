import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useBookConfig(label: string) {
  return useQuery({
    queryKey: ["book-config", label],
    queryFn: () => api.getBookConfig(label),
    enabled: !!label,
  })
}

export function useUpdateBookConfig({ withReceipt = false } = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      label,
      config,
    }: {
      label: string
      config: Record<string, unknown>
    }) => withReceipt ? api.updateBookConfigWithReceipt(label, config) : api.updateBookConfig(label, config),
    onSuccess: async (data, { label }) => {
      if ("activeConfig" in data) {
        // Stop pre-Save reads before publishing the receipt to both caches.
        // A delayed/failed GET must not reset acknowledged fields when the
        // caller clears its draft, nor overwrite them on its next Save.
        await Promise.all([
          queryClient.cancelQueries({ queryKey: ["book-config", label], exact: true }),
          queryClient.cancelQueries({ queryKey: ["debug", "config", label], exact: true }),
        ])
        queryClient.setQueryData(["book-config", label], { config: data.config })
        queryClient.setQueryData(["debug", "config", label], data.activeConfig)
      }
      queryClient.invalidateQueries({ queryKey: ["book-config", label] })
      queryClient.invalidateQueries({ queryKey: ["validation", "catalog", label] })
      queryClient.invalidateQueries({ queryKey: ["debug", "config", label] })
      queryClient.invalidateQueries({ queryKey: ["debug"] })
      // Settings (read-aloud content, languages, voices, prompts, models) change
      // which outputs apply and their inputs; refresh the sidebar's attention.
      queryClient.invalidateQueries({ queryKey: ["books", label, "outputs"] })
    },
  })
}
