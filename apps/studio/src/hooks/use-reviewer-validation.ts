import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ReviewerPageValidationRecord, ReviewerValidationSession } from "@adt/types"
import type { ReviewerPageValidationRecordEntry, ReviewerPageValidationRecordsResponse } from "@/api/client"
import { api } from "@/api/client"

export function useReviewerValidationCatalog(label: string) {
  return useQuery({
    queryKey: ["validation", "catalog", label],
    queryFn: () => api.getReviewerValidationCatalog(label),
    enabled: !!label,
  })
}

export function useReviewerValidationSessions(label: string) {
  return useQuery({
    queryKey: ["validation", "sessions", label],
    queryFn: () => api.getReviewerValidationSessions(label),
    enabled: !!label,
  })
}

export function useReviewerPageValidationRecords(
  label: string,
  params: { sessionId: string; pageId?: string; language?: string } | null,
) {
  return useQuery({
    queryKey: ["validation", "page-results", label, params],
    queryFn: () => api.getReviewerPageValidationRecords(label, params as { sessionId: string; pageId?: string; language?: string }),
    enabled: !!label && !!params?.sessionId,
  })
}

export function useSaveReviewerValidationSession(label: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (session: ReviewerValidationSession) => api.saveReviewerValidationSession(label, session),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["validation", "sessions", label] })
      queryClient.setQueryData(["validation", "session", label, saved.session.session_id], saved)
    },
  })
}

export function useSaveReviewerPageValidationRecord(label: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (record: ReviewerPageValidationRecord) => api.saveReviewerPageValidationRecord(label, record),
    onSuccess: (saved) => {
      queryClient.setQueriesData<ReviewerPageValidationRecordsResponse>(
        {
          queryKey: ["validation", "page-results", label],
          predicate: (query) => {
            const params = query.queryKey[3] as Parameters<typeof api.getReviewerPageValidationRecords>[1] | null
            return !!params && params.sessionId === saved.record.session_id
              && (!params.pageId || params.pageId === saved.record.page_id)
              && (!params.language || params.language === saved.record.language)
          },
        },
        (current) => updateReviewerPageResultsCache(current, saved),
      )
      queryClient.setQueryData(
        ["validation", "page-result", label, saved.record.session_id, saved.record.page_id, saved.record.language ?? "default"],
        saved,
      )
      queryClient.invalidateQueries({ queryKey: ["validation", "page-results", label] })
    },
  })
}

function updateReviewerPageResultsCache(
  current: ReviewerPageValidationRecordsResponse | undefined,
  saved: ReviewerPageValidationRecordEntry,
): ReviewerPageValidationRecordsResponse | undefined {
  if (!current) {
    return current
  }

  const nextRecords = [...current.records]
  const nextEntry = saved
  const targetLanguage = saved.record.language ?? undefined
  const existingIndex = nextRecords.findIndex((entry) => {
    const entryLanguage = entry.record.language ?? undefined
    return (
      entry.record.session_id === saved.record.session_id &&
      entry.record.page_id === saved.record.page_id &&
      entryLanguage === targetLanguage
    )
  })

  if (existingIndex >= 0) {
    nextRecords[existingIndex] = nextEntry
  } else {
    nextRecords.push(nextEntry)
  }

  return {
    ...current,
    records: nextRecords,
  }
}
