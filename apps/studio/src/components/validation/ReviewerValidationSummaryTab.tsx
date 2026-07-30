import { useEffect, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useQueries } from "@tanstack/react-query"
import { ClipboardCheck, ExternalLink, FileWarning, SkipForward } from "lucide-react"
import type { ReviewerValidationCatalogSnapshot, ReviewerValidationStatus } from "@adt/types"
import { api, type ReviewerPageValidationRecordEntry } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import {
  useReviewerValidationCatalog,
  useReviewerValidationSessions,
} from "@/hooks/use-reviewer-validation"
import { findResumeReviewerPage } from "@/lib/reviewer-validation-progress"
import { getReviewerSessionStorageKey } from "@/lib/reviewer-validation-session"
import { cn } from "@/lib/utils"


function normalizeChecklistSnapshot(snapshot: ReviewerValidationCatalogSnapshot | null | undefined) {
  if (!snapshot) {
    return null
  }

  return {
    identificationFields: snapshot.identificationFields.map((field) => ({
      id: field.id,
      label: field.label,
      description: field.description ?? null,
      type: field.type,
      required: field.required,
    })),
    instructions: snapshot.instructions.map((instruction) => ({
      id: instruction.id,
      title: instruction.title,
      body: instruction.body,
      bullets: instruction.bullets ?? [],
    })),
    pageSections: snapshot.pageSections.map((section) => ({
      id: section.id,
      label: section.label,
      fix_stage: section.fix_stage ?? null,
      criteria: section.criteria.map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        guidance: criterion.guidance,
        fix_stage: criterion.fix_stage ?? null,
        requires_comment_on_failure: criterion.requires_comment_on_failure,
        requires_suggested_modification_on_failure: criterion.requires_suggested_modification_on_failure,
      })),
    })),
  }
}

function hasChecklistSnapshotDrift(
  sessionSnapshot: ReviewerValidationCatalogSnapshot | null | undefined,
  currentCatalog: ReviewerValidationCatalogSnapshot | null | undefined,
): boolean {
  if (!sessionSnapshot || !currentCatalog) {
    return false
  }

  return JSON.stringify(normalizeChecklistSnapshot(sessionSnapshot)) !== JSON.stringify(normalizeChecklistSnapshot(currentCatalog))
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: number | string
  tone?: "default" | "warning" | "success"
}) {
  const toneClass =
    tone === "warning"
      ? "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20"
        : "bg-card"

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function LoadingState({ message }: { message: string }) {
  return <div className="p-6 text-sm text-muted-foreground">{message}</div>
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {message}
      </div>
    </div>
  )
}

function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-dashed bg-card px-4 py-6 text-sm text-muted-foreground">
        <div>{message}</div>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  )
}

interface ReviewerValidationSummaryTabProps {
  label: string
  onOpenPreview?: () => void
  onOpenPreviewToPage?: (href: string) => void
}

export function ReviewerValidationSummaryTab({
  label,
  onOpenPreview,
  onOpenPreviewToPage,
}: ReviewerValidationSummaryTabProps) {
  const { t } = useLingui()
  const catalog = useReviewerValidationCatalog(label)
  const sessions = useReviewerValidationSessions(label)
  const accessibilityAssessment = useAccessibilityAssessment(label)
  const activeSessionStorageKey = getReviewerSessionStorageKey(label)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null
    }
    return window.sessionStorage.getItem(activeSessionStorageKey)
  })

  const sortedSessions = useMemo(
    () => [...(sessions.data?.sessions ?? [])].sort((left, right) => right.version - left.version),
    [sessions.data?.sessions],
  )

  useEffect(() => {
    if (sortedSessions.length === 0) {
      setActiveSessionId(null)
      return
    }

    setActiveSessionId((current) => {
      if (current && sortedSessions.some((entry) => entry.session.session_id === current)) {
        return current
      }
      return sortedSessions[0]?.session.session_id ?? null
    })
  }, [sortedSessions])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (activeSessionId) {
      window.sessionStorage.setItem(activeSessionStorageKey, activeSessionId)
    } else {
      window.sessionStorage.removeItem(activeSessionStorageKey)
    }
  }, [activeSessionId, activeSessionStorageKey])

  const sessionRecordQueries = useQueries({
    queries: sortedSessions.map((entry) => ({
      queryKey: ["validation", "page-results", label, entry.session.session_id, entry.session.language],
      queryFn: () => api.getReviewerPageValidationRecords(label, {
        sessionId: entry.session.session_id,
        language: entry.session.language,
      }),
      enabled: !!label,
    })),
  })

  const recordsBySessionId = useMemo(() => {
    const map = new Map<string, ReviewerPageValidationRecordEntry[]>()
    sortedSessions.forEach((entry, index) => {
      map.set(entry.session.session_id, sessionRecordQueries[index]?.data?.records ?? [])
    })
    return map
  }, [sessionRecordQueries, sortedSessions])

  const activeSession = useMemo(
    () => sortedSessions.find((entry) => entry.session.session_id === activeSessionId) ?? null,
    [sortedSessions, activeSessionId],
  )
  const activeSessionRecords = useMemo(
    () => (activeSessionId ? recordsBySessionId.get(activeSessionId) ?? [] : []),
    [activeSessionId, recordsBySessionId],
  )
  const activeCatalog = useMemo(
    () => activeSession?.session.catalog_snapshot ?? catalog.data ?? null,
    [activeSession?.session.catalog_snapshot, catalog.data],
  )
  const activePageSections = activeCatalog?.pageSections ?? []
  const sessionUsesOlderChecklistSnapshot = useMemo(
    () => hasChecklistSnapshotDrift(activeSession?.session.catalog_snapshot, catalog.data ?? null),
    [activeSession?.session.catalog_snapshot, catalog.data],
  )

  const criterionMeta = useMemo(() => {
    const map = new Map<string, { sectionLabel: string; criterionLabel: string }>()
    for (const section of activePageSections) {
      for (const criterion of section.criteria) {
        map.set(criterion.id, {
          sectionLabel: section.label,
          criterionLabel: criterion.label,
        })
      }
    }
    return map
  }, [activePageSections])

  const aggregate = useMemo(() => {
    const allSessionRecords = [...recordsBySessionId.values()].flat()
    const uniqueLanguageCount = new Set(
      sortedSessions.map((entry) => entry.session.language).filter(Boolean),
    ).size
    const totalPagesReviewed = allSessionRecords.length
    const allResults = allSessionRecords.flatMap((entry) => entry.record.results)

    return {
      sessions: sortedSessions.length,
      languages: uniqueLanguageCount,
      pagesReviewed: totalPagesReviewed,
      criteriaReviewed: allResults.filter((result) => result.status !== "not-reviewed").length,
      flagged: allResults.filter((result) => result.status === "needs-changes").length,
    }
  }, [recordsBySessionId, sortedSessions])

  const criteriaCount = useMemo(
    () => activePageSections.reduce((total, section) => total + section.criteria.length, 0),
    [activePageSections],
  )

  const activeMetrics = useMemo(() => {
    const results = activeSessionRecords.flatMap((entry) => entry.record.results)
    const flagged = results.filter((result) => result.status === "needs-changes")
    return {
      pagesReviewed: activeSessionRecords.length,
      criteriaReviewed: results.filter((result) => result.status !== "not-reviewed").length,
      passCount: results.filter((result) => result.status === "pass").length,
      notApplicable: results.filter((result) => result.status === "not-applicable").length,
      flagged,
    }
  }, [activeSessionRecords])

  const activeProgress = useMemo(() => {
    const criteriaPerPage = criteriaCount
    const assignedPageCount =
      activeSession?.session.start_page != null &&
      activeSession?.session.end_page != null &&
      activeSession.session.end_page >= activeSession.session.start_page
        ? activeSession.session.end_page - activeSession.session.start_page + 1
        : null
    const totalBookPages = accessibilityAssessment.data?.assessment?.summary.pageCount ?? null
    const pageTarget = totalBookPages ?? assignedPageCount ?? activeMetrics.pagesReviewed

    const expectedCriteriaCount =
      criteriaPerPage > 0 && pageTarget > 0
        ? pageTarget * criteriaPerPage
        : 0

    const percent =
      expectedCriteriaCount > 0
        ? Math.min(100, Math.round((activeMetrics.criteriaReviewed / expectedCriteriaCount) * 100))
        : 0

    const flaggedRatio =
      activeMetrics.criteriaReviewed > 0
        ? activeMetrics.flagged.length / activeMetrics.criteriaReviewed
        : 0

    const toneClass =
      percent >= 100 && activeMetrics.flagged.length === 0
        ? "bg-emerald-500"
        : activeMetrics.flagged.length > 0
          ? flaggedRatio >= 0.2
            ? "bg-orange-500"
            : "bg-orange-400"
          : "bg-emerald-300"

    return {
      criteriaPerPage,
      assignedPageCount,
      totalBookPages,
      pageTarget,
      expectedCriteriaCount,
      percent,
      flaggedRatio,
      toneClass,
      isBookScoped: totalBookPages != null,
      isSessionScoped: totalBookPages == null && assignedPageCount != null,
    }
  }, [
    activeMetrics.criteriaReviewed,
    activeMetrics.flagged.length,
    activeMetrics.pagesReviewed,
    activeSession,
    accessibilityAssessment.data?.assessment?.summary.pageCount,
    criteriaCount,
  ])

  const resumeTarget = useMemo(
    () => findResumeReviewerPage(activeSessionRecords, criteriaCount),
    [activeSessionRecords, criteriaCount],
  )

  const flaggedEntries = useMemo(() => {
    return activeSessionRecords.flatMap((entry) =>
      entry.record.results
        .filter((result) => result.status === "needs-changes")
        .map((result) => ({
          pageId: entry.record.page_id,
          pageNumber: entry.record.page_number,
          href: entry.record.href,
          comment: result.comment,
          suggestedModification: result.suggested_modification,
          ...criterionMeta.get(result.criterion_id),
        })),
    )
  }, [activeSessionRecords, criterionMeta])

  const flaggedSectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of flaggedEntries) {
      const sectionLabel = entry.sectionLabel ?? t`Uncategorized`
      counts.set(sectionLabel, (counts.get(sectionLabel) ?? 0) + 1)
    }

    return [...counts.entries()]
      .map(([sectionLabel, count]) => ({ sectionLabel, count }))
      .sort((left, right) => right.count - left.count || left.sectionLabel.localeCompare(right.sectionLabel))
  }, [flaggedEntries])

  const anyRecordQueryLoading = sessionRecordQueries.some((query) => query.isLoading)
  const anyRecordQueryError = sessionRecordQueries.find((query) => query.error)?.error
  const pagesReviewed = activeMetrics.pagesReviewed

  if (sessions.isLoading || anyRecordQueryLoading || (!activeCatalog && catalog.isLoading)) {
    return <LoadingState message={t`Loading reviewer validation summary...`} />
  }

  if (!activeCatalog && catalog.error) {
    return <ErrorState message={t`Failed to load reviewer validation checklist: ${catalog.error.message}`} />
  }

  if (sessions.error) {
    return <ErrorState message={t`Failed to load reviewer validation sessions: ${sessions.error.message}`} />
  }

  if (anyRecordQueryError) {
    return <ErrorState message={t`Failed to load reviewer page results: ${anyRecordQueryError.message}`} />
  }

  if (sortedSessions.length === 0) {
    return (
      <EmptyState
        message={t`No reviewer validation sessions have been started yet. Open Preview to create a reviewer session and begin recording page-level findings.`}
        action={onOpenPreview ? (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenPreview}>
            <ExternalLink className="h-3.5 w-3.5" />
            <Trans>Open Preview</Trans>
          </Button>
        ) : undefined}
      />
    )
  }

  return (
    <div className="space-y-6 p-6">
      <SectionHeader
        title={t`Reviewer validation summary`}
        description={t`Track reviewer progress and review findings captured from Preview.`}
        action={
          onOpenPreview || (resumeTarget && onOpenPreviewToPage) ? (
            <div className="flex flex-wrap gap-2">
              {resumeTarget && onOpenPreviewToPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => onOpenPreviewToPage(resumeTarget.href)}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <Trans>Continue page {resumeTarget.pageNumber ?? resumeTarget.pageId}</Trans>
                </Button>
              ) : null}
              {onOpenPreview ? (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenPreview}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  <Trans>Open Preview</Trans>
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label={t`Sessions`} value={aggregate.sessions} />
        <SummaryCard label={t`Languages`} value={aggregate.languages} />
        <SummaryCard label={t`Pages reviewed`} value={aggregate.pagesReviewed} />
        <SummaryCard label={t`Criteria reviewed`} value={aggregate.criteriaReviewed} />
        <SummaryCard label={t`Flagged findings`} value={aggregate.flagged} tone={aggregate.flagged > 0 ? "warning" : "success"} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-sm font-medium"><Trans>Active reviewer session</Trans></h4>
            <p className="mt-1 text-xs text-muted-foreground">
              <Trans>Review one session at a time to inspect page coverage and flagged findings.</Trans>
            </p>
          </div>
          <div className="w-full sm:w-72">
            <Select value={activeSessionId ?? undefined} onValueChange={setActiveSessionId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t`Select reviewer session`} />
              </SelectTrigger>
              <SelectContent>
                {sortedSessions.map((entry) => (
                  <SelectItem key={entry.session.session_id} value={entry.session.session_id} className="text-xs">
                    {entry.session.reviewer_name}{entry.session.language ? ` · ${entry.session.language}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {activeSession ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
                {activeSession.session.reviewer_name}
              </Badge>
              {activeSession.session.language ? <Badge variant="outline">{activeSession.session.language}</Badge> : null}
              {activeSession.session.institution ? <Badge variant="outline">{activeSession.session.institution}</Badge> : null}
              {activeSession.session.start_page != null || activeSession.session.end_page != null ? (
                <Badge variant="outline">
                  <Trans>Pages {activeSession.session.start_page ?? "?"}–{activeSession.session.end_page ?? "?"}</Trans>
                </Badge>
              ) : null}
            </div>

            {sessionUsesOlderChecklistSnapshot ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                <Trans>This session is using an older reviewer checklist snapshot. Newer checklist settings will apply only to newly created reviewer sessions.</Trans>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label={t`Pages reviewed`} value={activeMetrics.pagesReviewed} />
              <SummaryCard label={t`Criteria reviewed`} value={activeMetrics.criteriaReviewed} />
              <SummaryCard label={t`Passed`} value={activeMetrics.passCount} tone="success" />
              <SummaryCard label={t`Needs changes`} value={activeMetrics.flagged.length} tone={activeMetrics.flagged.length > 0 ? "warning" : "success"} />
            </div>

            <div className="rounded-lg border bg-background/60 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h5 className="text-sm font-medium"><Trans>Review progress</Trans></h5>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {activeProgress.isBookScoped
                      ? t`Completion across all pages in this book for the active reviewer session.`
                      : activeProgress.isSessionScoped
                        ? t`Completion across the assigned page range for this reviewer session.`
                        : t`Completion across pages that have been opened and reviewed in this session.`}
                  </p>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  <Trans>{activeProgress.percent}% complete</Trans>
                </Badge>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    activeProgress.toneClass,
                  )}
                  style={{ width: `${activeProgress.percent}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {activeMetrics.criteriaReviewed}
                  {activeProgress.expectedCriteriaCount > 0 ? ` / ${activeProgress.expectedCriteriaCount}` : ""} <Trans>criteria reviewed</Trans>
                </span>
                {activeProgress.isBookScoped ? (
                  <span>
                    <Trans>{activeMetrics.pagesReviewed} of {activeProgress.totalBookPages} book pages reviewed</Trans>
                  </span>
                ) : activeProgress.isSessionScoped ? (
                  <span>
                    <Trans>{activeMetrics.pagesReviewed} of {activeProgress.assignedPageCount} assigned pages reviewed</Trans>
                  </span>
                ) : (
                  <span>
                    {t`${pagesReviewed} {pagesReviewed, plural, one {page} other {pages}} reviewed so far`}
                  </span>
                )}
                {activeProgress.criteriaPerPage > 0 ? (
                  <span><Trans>{activeProgress.criteriaPerPage} checks per page</Trans></span>
                ) : null}
                {activeMetrics.flagged.length > 0 ? (
                  <span><Trans>{activeMetrics.flagged.length} flagged findings in this review</Trans></span>
                ) : activeProgress.percent >= 100 ? (
                  <span><Trans>No flagged findings in reviewed pages</Trans></span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
              <div className="rounded-lg border bg-background/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-sm font-medium"><Trans>Flagged by review area</Trans></h5>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Trans>Review areas with the most items marked as needing changes in this session.</Trans>
                    </p>
                  </div>
                  <Badge variant={flaggedSectionCounts.length > 0 ? "secondary" : "outline"}>
                    {flaggedSectionCounts.length} <Trans>areas</Trans>
                  </Badge>
                </div>

                {flaggedSectionCounts.length > 0 ? (
                  <div className="space-y-2">
                    {flaggedSectionCounts.map((entry) => (
                      <div
                        key={entry.sectionLabel}
                        className="flex items-center justify-between rounded-lg border border-border/70 bg-card/70 px-3 py-2"
                      >
                        <div className="pr-3 text-sm font-medium leading-snug">{entry.sectionLabel}</div>
                        <Badge variant="outline" className="tabular-nums">
                          {entry.count} <Trans>flagged</Trans>
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
                    <Trans>No review areas are currently flagged in this reviewer session.</Trans>
                  </div>
                )}
              </div>

              <div className="rounded-lg border bg-background/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-sm font-medium"><Trans>Flagged findings</Trans></h5>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Trans>Items marked as needing changes for this reviewer session.</Trans>
                    </p>
                  </div>
                  <Badge variant="outline" className={cn(flaggedEntries.length > 0 && "border-red-200 bg-red-50 text-red-700")}>
                    {flaggedEntries.length} <Trans>flagged</Trans>
                  </Badge>
                </div>

                {flaggedEntries.length > 0 ? (
                  <div className="space-y-3">
                    {flaggedEntries.map((entry, index) => (
                      <div key={`${entry.pageId}-${entry.criterionLabel ?? index}-${index}`} className="rounded-lg border px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="outline">{entry.sectionLabel ?? t`Uncategorized`}</Badge>
                          {entry.pageNumber != null ? <Badge variant="secondary"><Trans>Page {entry.pageNumber}</Trans></Badge> : null}
                          <Badge variant="outline" className="font-mono text-[11px]">{entry.pageId}</Badge>
                        </div>
                        <div className="mt-2 text-sm font-medium leading-snug">{entry.criterionLabel ?? t`Unknown criterion`}</div>
                        <div className="mt-1 text-xs break-all text-muted-foreground">{entry.href}</div>
                        {entry.comment ? (
                          <div className="mt-2 text-sm text-foreground">{entry.comment}</div>
                        ) : null}
                        {entry.suggestedModification ? (
                          <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground"><Trans>Suggested modification:</Trans></span> {entry.suggestedModification}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
                    <Trans>No items are currently flagged as needing changes in this reviewer session.</Trans>
                  </div>
                )}
              </div>
            </div>

            {activeSession.session.comments ? (
              <div className="rounded-lg border bg-background/60 p-4">
                <div className="mb-1 text-xs font-medium text-muted-foreground"><Trans>Session comments</Trans></div>
                <div className="text-sm whitespace-pre-wrap text-foreground">{activeSession.session.comments}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
            <Trans>Select a reviewer session to inspect its progress and findings.</Trans>
          </div>
        )}
      </div>
    </div>
  )
}
