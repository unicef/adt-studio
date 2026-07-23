import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { BookTypography } from "@adt/types"

export function useTypography(label: string) {
  return useQuery({
    queryKey: ["book-typography", label],
    queryFn: () => api.getTypography(label),
    enabled: !!label,
  })
}

export function useUpdateTypography(label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: BookTypography) => api.updateTypography(label, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-typography", label] })
      // Preview CSS is rebuilt from this node — nudge preview-related caches.
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
    },
  })
}
