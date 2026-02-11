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

export function useAcceptStoryboard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => api.acceptStoryboard(label),
    onSuccess: (_data, label) => {
      queryClient.invalidateQueries({ queryKey: ["books"] })
      queryClient.invalidateQueries({ queryKey: ["books", label] })
    },
  })
}

export function useExportBook() {
  return useMutation({
    mutationFn: (label: string) => api.exportBook(label),
    onSuccess: (blob, label) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${label}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })
}
