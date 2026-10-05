import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type BookConfigResponse } from "@/api/client"

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
    mutationFn: ({
      label,
      config,
    }: {
      label: string
      config: Record<string, unknown>
    }) => api.updateBookConfig(label, config),
    onMutate: async ({ label, config }) => {
      await queryClient.cancelQueries({ queryKey: ["book-config", label] })
      const previous = queryClient.getQueryData<BookConfigResponse>(["book-config", label])
      queryClient.setQueryData<BookConfigResponse>(["book-config", label], { config })
      return { previous }
    },
    onError: (_error, { label }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["book-config", label], context.previous)
      } else {
        queryClient.removeQueries({ queryKey: ["book-config", label] })
      }
    },
    onSettled: (_data, _error, { label }) => {
      queryClient.invalidateQueries({ queryKey: ["book-config", label] })
      queryClient.invalidateQueries({ queryKey: ["validation", "catalog", label] })
      queryClient.invalidateQueries({ queryKey: ["debug", "config", label] })
      queryClient.invalidateQueries({ queryKey: ["debug"] })
    },
  })
}
