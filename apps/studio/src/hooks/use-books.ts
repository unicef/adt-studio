import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { toast } from "sonner"
import type { BookMetadata, SetupRecommendationWarning } from "@adt/types"
import { api } from "@/api/client"

export function useBooks() {
  return useQuery({
    queryKey: ["books"],
    queryFn: api.getBooks,
    // Book access can verify a summary that was unknown on a cold listing.
    // Refresh on SPA return even within the application's five-minute cache.
    refetchOnMount: "always",
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
      setupRecommendationId,
    }: {
      label: string
      pdf: File
      config?: Record<string, unknown>
      setupRecommendationId?: string
    }) => api.createBook(label, pdf, config, setupRecommendationId),
    onSuccess: (book) => {
      queryClient.invalidateQueries({ queryKey: ["books"] })
      if (book.setupRecommendationWarning) warnSetupRecommendationNotSaved(book.setupRecommendationWarning)
    },
  })
}

/**
 * The book was made with the chosen settings, but the AI setup's record (its findings and AI calls)
 * couldn't be kept in the book folder. Said once, as a toast: nothing about the book needs doing.
 */
function warnSetupRecommendationNotSaved(warning: SetupRecommendationWarning) {
  const title =
    warning.reason === "expired"
      ? i18n._(msg`Your book was created, but the AI setup's notes expired before they could be saved with it.`)
      : warning.reason === "other-pdf"
        ? i18n._(msg`Your book was created, but the AI setup's notes were made for another PDF, so they weren't saved with it.`)
        : i18n._(msg`Your book was created, but the AI setup's notes couldn't be saved with it.`)
  toast.warning(title, { description: warning.reason === "failed" ? warning.message : undefined })
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

export function useImportAdtProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      zip,
      activityDecisions,
    }: {
      zip: File
      activityDecisions: Array<{ sectionId: string; type: string | null }>
    }) => api.importAdtProject(zip, activityDecisions),
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
