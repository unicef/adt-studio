import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query"
import { api } from "@/api/client"

const configMutationKey = ["book-config-update"]

export function useBookConfigSaving(label: string) {
  return useIsMutating({
    mutationKey: configMutationKey,
    predicate: (mutation) => (mutation.state.variables as { label?: string } | undefined)?.label === label,
  }) > 0
}

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
    mutationKey: configMutationKey,
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
    // Keep all config controls pending until authoritative state has returned.
    // Otherwise a neighboring control can submit the previous override map and
    // silently undo a just-confirmed mode transition.
    onSettled: (data, _error, { label }) => {
      const refresh = Promise.all([
      queryClient.invalidateQueries({ queryKey: ["books"] }),
      queryClient.invalidateQueries({ queryKey: ["book", label] }),
      queryClient.invalidateQueries({ queryKey: ["book-config", label] }),
      queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] }),
      queryClient.invalidateQueries({ queryKey: ["validation", "catalog", label] }),
      queryClient.invalidateQueries({ queryKey: ["debug"] }),
      ])
      // A validated receipt already is authoritative. Background reads may be
      // delayed or fail; they must not hold an acknowledged Settings draft.
      return data && "activeConfig" in data ? undefined : refresh
    },
  })
}
