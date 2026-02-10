import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useBooks() {
  return useQuery({
    queryKey: ["books"],
    queryFn: api.getBooks,
  })
}

export function useBook(label: string) {
  return useQuery({
    queryKey: ["books", label],
    queryFn: () => api.getBook(label),
    enabled: !!label,
  })
}

export function useCreateBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      label,
      pdf,
      config,
    }: {
      label: string
      pdf: File
      config?: Record<string, unknown>
    }) => api.createBook(label, pdf, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] })
    },
  })
}

export function useDeleteBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => api.deleteBook(label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] })
    },
  })
}
