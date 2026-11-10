import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { api, type TaskInfoResponse, type TranslationEvaluationStatusResponse } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { countReview, currentReviewItems, type ReviewCounts, type ReviewItem } from "./reviewState"

export interface TranslationReview {
  enabled: boolean
  items: ReadonlyMap<string, ReviewItem>
  counts: ReviewCounts
  hasResults: boolean
  isStale: boolean
  failed: boolean
  task: TaskInfoResponse | null
  reviewing: boolean
  canReview: boolean
  error: Error | null
  applied: ReadonlyMap<string, ReviewItem>
  accepting: string | null
  run: () => void
  acceptAnyway: (id: string) => void
  markApplied: (item: ReviewItem) => void
}

const NO_COUNTS: ReviewCounts = { total: 0, needsAttention: 0, acceptable: 0, acceptedAnyway: 0 }
const NO_ITEMS: ReadonlyMap<string, ReviewItem> = new Map()

export function useTranslationReview({
  label,
  language,
  enabled,
  scopeIds,
  pageId,
  sourceById,
  targetById,
  locked,
}: {
  label: string
  language: string
  enabled: boolean
  scopeIds: readonly string[]
  pageId: string | null
  sourceById: ReadonlyMap<string, string>
  targetById: ReadonlyMap<string, string>
  locked: boolean
}): TranslationReview {
  const { i18n } = useLingui()
  const queryClient = useQueryClient()
  const { apiKey, anthropicKey, googleKey, customBaseUrl, customApiKey } = useApiKey()
  const { tasks, isTaskRunning } = useBookTasks(label)
  const [applied, setApplied] = useState<ReadonlyMap<string, ReviewItem>>(() => new Map())
  const [appliedFor, setAppliedFor] = useState(language)
  if (appliedFor !== language) {
    setAppliedFor(language)
    setApplied(new Map())
  }

  const key = ["evaluations", "translations", label, language] as const
  const status = useQuery({
    queryKey: key,
    queryFn: () => api.getTranslationEvaluation(label, language),
    enabled: enabled && !!label && !!language,
    retry: false,
  })
  const data: TranslationEvaluationStatusResponse | null = enabled ? (status.data ?? null) : null

  const items = useMemo(
    () => (enabled ? currentReviewItems(data, scopeIds, sourceById, targetById) : NO_ITEMS),
    [enabled, data, scopeIds, sourceById, targetById],
  )
  const counts = useMemo(() => (items.size > 0 ? countReview(items) : NO_COUNTS), [items])

  const task = useMemo(
    () =>
      enabled
        ? ([...tasks]
            .filter((entry) => entry.kind === "translation-evaluation" && (entry.status === "running" || entry.status === "queued"))
            .sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0))[0] ?? null)
        : null,
    [enabled, tasks],
  )

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["evaluations", "translations", label] })
  }, [queryClient, label])

  const runMutation = useMutation({
    mutationFn: async () => {
      if (scopeIds.length === 0) throw new Error(i18n._(msg`No visible translations to review.`))
      return api.runTranslationEvaluation(
        label,
        language,
        apiKey,
        { pageId: pageId ?? undefined, entryIds: [...scopeIds] },
        {
          anthropicApiKey: anthropicKey || undefined,
          googleApiKey: googleKey || undefined,
          customBaseUrl: customBaseUrl || undefined,
          customApiKey: customApiKey || undefined,
        },
      )
    },
    onSuccess: async () => {
      setApplied(new Map())
      await refresh()
    },
  })

  const acceptMutation = useMutation({
    mutationFn: (entryId: string) => api.acceptTranslationEvaluationItemAnyway(label, language, entryId),
    onSuccess: refresh,
  })

  const markApplied = useCallback((item: ReviewItem) => {
    setApplied((current) => new Map(current).set(item.entry_id, item))
  }, [])

  const runReview = runMutation.mutate
  const run = useCallback(() => runReview(), [runReview])
  const acceptItem = acceptMutation.mutate
  const acceptAnyway = useCallback((id: string) => acceptItem(id), [acceptItem])
  const reviewing = runMutation.isPending || !!task
  return {
    enabled,
    items,
    counts,
    hasResults: items.size > 0,
    isStale: !!data?.evaluation && data.isStale,
    failed: !!data?.evaluation && !data.isStale && (data.evaluation.metadata?.failed_pages ?? 0) > 0,
    task,
    reviewing,
    canReview: enabled && !locked && scopeIds.length > 0 && !reviewing && !isTaskRunning("translation-evaluation"),
    error: (runMutation.error as Error | null) ?? (acceptMutation.error as Error | null),
    applied,
    accepting: acceptMutation.isPending ? (acceptMutation.variables ?? null) : null,
    run,
    acceptAnyway,
    markApplied,
  }
}
