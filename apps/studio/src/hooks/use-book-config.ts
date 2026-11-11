import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query"
import { api } from "@/api/client"
import { isRunConfirmationQuery } from "./run-confirmation-query"

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
    },
    onSettled: (data, _error, { label }) => {
      // These two projections seed subsequent config writes. Without a receipt,
      // keep neighboring controls pending until the authoritative reads settle.
      const authoritative = Promise.all([
        queryClient.invalidateQueries({ queryKey: ["book-config", label], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["debug", "config", label], exact: true }),
      ])
      // Derived summaries may be slow. Refresh only this book and the Library;
      // request-owned confirmation reads are independent of these projections.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["books", label], predicate: query => !isRunConfirmationQuery(query) }),
        queryClient.invalidateQueries({ queryKey: ["book", label] }),
        queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] }),
        queryClient.invalidateQueries({ queryKey: ["validation", "catalog", label] }),
        queryClient.invalidateQueries({ queryKey: ["debug"], predicate: query => query.queryKey[2] === label && query.queryKey[1] !== "config" }),
      ])
      // The validated receipt already supplies both authoritative projections.
      return data && "activeConfig" in data ? undefined : authoritative
    },
  })
}
