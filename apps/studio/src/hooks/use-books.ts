import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { BookMetadata } from "@adt/types"
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

export function useUpdateBookMetadata() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ label, metadata }: { label: string; metadata: BookMetadata }) =>
      api.updateMetadata(label, metadata),
    onSuccess: (result, { label }) => {
      // ["books", label] is a prefix match, so this also refreshes step-status and
      // every downstream book sub-resource query (easy-read, text-catalog, tts, ...).
      queryClient.invalidateQueries({ queryKey: ["books", label] })
      queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] })
      if (result.languageChanged) {
        queryClient.invalidateQueries({ queryKey: ["debug"] })
      }
    },
  })
}

export function useRegenerateBookSummary() {
  // Submits a background regeneration task. The book detail is refreshed when
  // the task completes (handled by the task-event listener in use-book-run),
  // so there's nothing to invalidate on submit.
  return useMutation({
    mutationFn: ({ label, apiKey }: { label: string; apiKey: string }) =>
      api.regenerateBookSummary(label, apiKey),
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

export function useImportBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (zip: File) => api.importBook(zip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] })
    },
  })
}

export function usePackageAdt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => api.packageAdt(label),
    onSuccess: (_data, label) => {
      queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] })
    },
  })
}

export function usePackageAdtStatus(
  label: string,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: ["package-adt-status", label],
    queryFn: () => api.getPackageAdtStatus(label),
    enabled: !!label,
    refetchInterval: options?.refetchInterval,
  })
}
