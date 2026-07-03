import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

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
    onSuccess: (_data, { label }) => {
      queryClient.invalidateQueries({ queryKey: ["book-config", label] })
      queryClient.invalidateQueries({ queryKey: ["validation", "catalog", label] })
      queryClient.invalidateQueries({ queryKey: ["debug", "config", label] })
      queryClient.invalidateQueries({ queryKey: ["debug"] })
    },
  })
}
