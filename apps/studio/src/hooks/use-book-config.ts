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

export function useUpdateBookConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: configMutationKey,
    mutationFn: ({
      label,
      config,
    }: {
      label: string
      config: Record<string, unknown>
    }) => api.updateBookConfig(label, config),
    // Keep all config controls pending until authoritative state has returned.
    // Otherwise a neighboring control can submit the previous override map and
    // silently undo a just-confirmed mode transition.
    onSettled: (_data, _error, { label }) => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["books"] }),
      queryClient.invalidateQueries({ queryKey: ["book", label] }),
      queryClient.invalidateQueries({ queryKey: ["book-config", label] }),
      queryClient.invalidateQueries({ queryKey: ["validation", "catalog", label] }),
      queryClient.invalidateQueries({ queryKey: ["debug"] }),
    ]),
  })
}
