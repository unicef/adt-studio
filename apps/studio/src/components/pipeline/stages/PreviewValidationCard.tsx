import { useEffect, useMemo, useState } from "react"
import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { useQuery } from "@tanstack/react-query"
import type {
  ReviewerPageValidationRecord,
  ReviewerValidationSection,
  ReviewerValidationStatus,
} from "@adt/types"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  SkipForward,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/api/client"
import { useBookRun } from "@/hooks/use-book-run"
import { useGlossary } from "@/hooks/use-glossary"
import {
  hasLanguageEntries,
  resolveReviewerValidationCriterionStatus,
  type DerivedCriterionStatus,
} from "@/lib/reviewer-validation-applicability"
import { findResumeReviewerPage } from "@/lib/reviewer-validation-progress"
import { getReviewerSessionStorageKey } from "@/lib/reviewer-validation-session"
import { formatReviewerValidationDefaultReason } from "@/lib/reviewer-validation-defaults"
import { cn } from "@/lib/utils"
import {
  useReviewerPageValidationRecords,
  useReviewerValidationCatalog,
  useReviewerValidationSessions,
  useSaveReviewerPageValidationRecord,
  useSaveReviewerValidationSession,
} from "@/hooks/use-reviewer-validation"

interface PreviewValidationPageContext {
  pageId: string | null
  pageNumber: number | null
  sectionId: string | null
  href: string | null
  title: string | null
  hasImages: boolean
  hasActivity: boolean
  signLanguageEnabled: boolean
}

interface PreviewValidationCardProps {
  label: string
  panelOpen: boolean
  otherCardExpanded?: boolean
  currentPage: PreviewValidationPageContext
  onOpenValidation: () => void
  onNavigateToPage?: (href: string) => void
  onExpandedChange?: (expanded: boolean) => void
}

type DraftResult = {
  status: ReviewerValidationStatus
  comment: string
  suggested_modification: string
}

type DraftResultMap = Record<string, DraftResult>

type SessionFormState = {
  reviewerName: string
  institution: string
  language: string
  startPage: string
  endPage: string
  comments: string
}

const COLLAPSED_STORAGE_PREFIX = "adt-preview-review-card"
const STATUS_OPTIONS: Array<{ value: ReviewerValidationStatus }> = [
  { value: "pass" },
  { value: "needs-changes" },
  { value: "not-applicable" },
  { value: "not-reviewed" },
]

function getStatusLabel(i18n: I18n, value: ReviewerValidationStatus): string {
  switch (value) {
    case "pass":
      return i18n._(msg`Pass`)
    case "needs-changes":
      return i18n._(msg`Needs changes`)
    case "not-applicable":
      return i18n._(msg`N/A`)
    default:
      return i18n._(msg`Not reviewed`)
  }
}

const DEFAULT_SESSION_FORM: SessionFormState = {
  reviewerName: "",
  institution: "",
  language: "",
  startPage: "",
  endPage: "",
  comments: "",
}

function emptyDraftResult(): DraftResult {
  return {
    status: "not-reviewed",
    comment: "",
    suggested_modification: "",
  }
}

function buildInitialDraftResults(
  _pageSections: ReviewerValidationSection[],
  record?: ReviewerPageValidationRecord | null,
): DraftResultMap {
  const draft: DraftResultMap = {}

  if (record) {
    for (const result of record.results) {
      draft[result.criterion_id] = {
        status: result.status,
        comment: result.comment ?? "",
        suggested_modification: result.suggested_modification ?? "",
      }
    }
  }

  return draft
}


export function PreviewValidationCard({
  label,
  panelOpen,
  otherCardExpanded = false,
  currentPage,
  onOpenValidation,
  onNavigateToPage,
  onExpandedChange,
}: PreviewValidationCardProps) {
  const { t, i18n } = useLingui()
  const storageKey = `${COLLAPSED_STORAGE_PREFIX}:${label}`
  const activeSessionStorageKey = getReviewerSessionStorageKey(label)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true
    }
    return window.sessionStorage.getItem(storageKey) !== "expanded"
  })
  const [showCollapsedCard, setShowCollapsedCard] = useState(() => collapsed && !panelOpen)
  const [collapsedCardVisible, setCollapsedCardVisible] = useState(() => collapsed && !panelOpen)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null
    }
    return window.sessionStorage.getItem(activeSessionStorageKey)
  })
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [hasRestoredSessionState, setHasRestoredSessionState] = useState(false)
  const [sessionForm, setSessionForm] = useState<SessionFormState>(DEFAULT_SESSION_FORM)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [draftResults, setDraftResults] = useState<DraftResultMap>({})
  const [explicitCriterionIds, setExplicitCriterionIds] = useState<Set<string>>(new Set())
  const [overallComment, setOverallComment] = useState("")
  const [dirty, setDirty] = useState(false)
  const [pendingResumeHref, setPendingResumeHref] = useState<string | null>(null)

  const { stageState } = useBookRun()
  const catalog = useReviewerValidationCatalog(label)
  const sessions = useReviewerValidationSessions(label)
  const glossary = useGlossary(label)
  const textCatalog = useQuery({
    queryKey: ["books", label, "text-catalog"],
    queryFn: () => api.getTextCatalog(label),
    enabled: !!label,
  })
  const tts = useQuery({
    queryKey: ["books", label, "tts"],
    queryFn: () => api.getTTS(label),
    enabled: !!label,
  })
  const easyRead = useQuery({
    queryKey: ["books", label, "easy-read"],
    queryFn: () => api.getEasyRead(label),
    enabled: !!label,
  })
  const saveSessionMutation = useSaveReviewerValidationSession(label)
  const saveRecordMutation = useSaveReviewerPageValidationRecord(label)

  const sortedSessions = useMemo(
    () => [...(sessions.data?.sessions ?? [])].sort((left, right) => right.version - left.version),
    [sessions.data?.sessions],
  )
  const activeSession = useMemo(
    () => sortedSessions.find((entry) => entry.session.session_id === activeSessionId) ?? null,
    [sortedSessions, activeSessionId],
  )
  const liveCatalogSnapshot = useMemo(
    () => (catalog.data ? {
      identificationFields: catalog.data.identificationFields,
      instructions: catalog.data.instructions,
      pageSections: catalog.data.pageSections,
    } : null),
    [catalog.data],
  )
  const activeCatalog = useMemo(
    () => activeSession?.session.catalog_snapshot ?? liveCatalogSnapshot,
    [activeSession?.session.catalog_snapshot, liveCatalogSnapshot],
  )
  const activePageSections = activeCatalog?.pageSections ?? []

  const currentPageQueryParams = useMemo(() => {
    if (!activeSessionId || !currentPage.pageId) {
      return null
    }

    return {
      sessionId: activeSessionId,
      pageId: currentPage.pageId,
      language: activeSession?.session.language,
    }
  }, [activeSession?.session.language, activeSessionId, currentPage.pageId])

  const sessionRecords = useReviewerPageValidationRecords(
    label,
    activeSessionId
      ? {
          sessionId: activeSessionId,
          language: activeSession?.session.language,
        }
      : null,
  )
  const pageRecords = useReviewerPageValidationRecords(label, currentPageQueryParams)
  const currentRecordEntry = pageRecords.data?.records[0] ?? null

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    window.sessionStorage.setItem(storageKey, collapsed ? "collapsed" : "expanded")
  }, [collapsed, storageKey])


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

  useEffect(() => {
    if (panelOpen) {
      setCollapsed(true)
    }
  }, [panelOpen])


  useEffect(() => {
    onExpandedChange?.(!collapsed)
  }, [collapsed, onExpandedChange])

  useEffect(() => {
    if (collapsed || !pendingResumeHref) {
      return
    }

    try {
      onNavigateToPage?.(pendingResumeHref)
    } catch {
      setCollapsed(false)
    } finally {
      setPendingResumeHref(null)
    }
  }, [collapsed, onNavigateToPage, pendingResumeHref])

  useEffect(() => {
    if (!collapsed || panelOpen || otherCardExpanded) {
      setCollapsedCardVisible(false)
      setShowCollapsedCard(false)
      return
    }

    if (typeof window === "undefined") {
      setShowCollapsedCard(true)
      setCollapsedCardVisible(true)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setShowCollapsedCard(true)
      window.requestAnimationFrame(() => setCollapsedCardVisible(true))
    }, 140)

    return () => window.clearTimeout(timeoutId)
  }, [collapsed, otherCardExpanded, panelOpen])

  useEffect(() => {
    if (sessions.isLoading) {
      return
    }

    if (sortedSessions.length === 0) {
      setActiveSessionId(null)
      setShowSessionForm(true)
      setHasRestoredSessionState(true)
      return
    }

    setActiveSessionId((current) => {
      if (current && sortedSessions.some((entry) => entry.session.session_id === current)) {
        return current
      }
      return sortedSessions[0]?.session.session_id ?? null
    })

    if (!hasRestoredSessionState) {
      setShowSessionForm(false)
      setHasRestoredSessionState(true)
    }
  }, [hasRestoredSessionState, sessions.isLoading, sortedSessions])


  useEffect(() => {
    if (!sessions.isLoading && activeSession) {
      setSessionError(null)
    }
  }, [activeSession, sessions.isLoading])

  useEffect(() => {
    if (activePageSections.length === 0) {
      return
    }

    const nextDraft = buildInitialDraftResults(activePageSections, currentRecordEntry?.record ?? null)
    setDraftResults(nextDraft)
    setExplicitCriterionIds(new Set(Object.keys(nextDraft)))
    setOverallComment(currentRecordEntry?.record.overall_comment ?? "")
    setDirty(false)
  }, [activePageSections, currentRecordEntry?.version, currentPage.pageId])

  const criteriaCount = useMemo(
    () => activePageSections.reduce((total, section) => total + section.criteria.length, 0),
    [activePageSections],
  )

  const resumeTarget = useMemo(
    () => findResumeReviewerPage(sessionRecords.data?.records ?? [], criteriaCount),
    [criteriaCount, sessionRecords.data?.records],
  )

  const sessionLanguage = activeSession?.session.language?.trim() || null
  const glossaryAvailable = (glossary.data?.items.length ?? 0) > 0
  const glossaryPending = stageState("glossary") === "done" && glossary.isLoading
  const translateStageDone = stageState("translate") === "done"
  const speechStageDone = stageState("speech") === "done"
  const ttsAvailable = hasLanguageEntries(tts.data?.languages, sessionLanguage)
  const ttsPending = speechStageDone && tts.isLoading
  const translationAvailable = hasLanguageEntries(textCatalog.data?.translations, sessionLanguage)
  const translationPending = translateStageDone && textCatalog.isLoading
  const easyReadAvailable = (easyRead.data?.blocks ?? []).some((block) => block.entries.length > 0)

  const resolvedResults = useMemo(() => {
    const map = new Map<string, DerivedCriterionStatus>()
    for (const section of activePageSections) {
      for (const criterion of section.criteria) {
        map.set(
          criterion.id,
          resolveReviewerValidationCriterionStatus({
            sectionId: section.id,
            explicitStatus: draftResults[criterion.id]?.status,
            glossaryAvailable,
            glossaryPending,
            translateStageDone,
            speechStageDone,
            ttsAvailable,
            ttsPending,
            sessionLanguage,
            translationAvailable,
            translationPending,
            easyReadAvailable,
            signLanguageEnabled: currentPage.signLanguageEnabled,
            pageHasImages: currentPage.hasImages,
            pageHasActivity: currentPage.hasActivity,
          }),
        )
      }
    }
    return map
  }, [
    activePageSections,
    draftResults,
    glossaryAvailable,
    glossaryPending,
    sessionLanguage,
    translateStageDone,
    speechStageDone,
    currentPage.hasActivity,
    currentPage.hasImages,
    currentPage.signLanguageEnabled,
    easyReadAvailable,
    translationAvailable,
    translationPending,
    ttsAvailable,
    ttsPending,
  ])

  const counts = useMemo(() => {
    const all = [...resolvedResults.values()]
    return {
      reviewed: all.filter((entry) => entry.status !== "not-reviewed").length,
      pass: all.filter((entry) => entry.status === "pass").length,
      needsChanges: all.filter((entry) => entry.status === "needs-changes").length,
      notApplicable: all.filter((entry) => entry.status === "not-applicable").length,
    }
  }, [resolvedResults])

  const isOnResumePage = !!resumeTarget && resumeTarget.pageId === currentPage.pageId

  const collapsedSummary = !activeSession
    ? t`Start reviewer validation`
    : !currentPage.pageId
      ? t`Open a page to review`
      : t`${counts.reviewed}/${criteriaCount} checked`
  const collapsedDetail = !activeSession
    ? t`Create a reviewer session for this book.`
    : resumeTarget
      ? isOnResumePage
        ? t`Resume target: page ${resumeTarget.pageNumber ?? resumeTarget.pageId}`
        : t`Continue on page ${resumeTarget.pageNumber ?? resumeTarget.pageId}`
      : currentPage.pageId
        ? counts.needsChanges > 0
          ? counts.needsChanges === 1
            ? t`1 item needs changes on this page`
            : t`${counts.needsChanges} items need changes on this page`
          : counts.reviewed > 0
            ? t`No changes flagged on this page`
            : t`This page has not been reviewed yet`
        : t`Navigate within Preview to capture page-specific review notes`

  const handleSessionFormChange = (field: keyof SessionFormState, value: string) => {
    setSessionForm((current) => ({ ...current, [field]: value }))
  }

  const handleCreateSession = async () => {
    setSessionError(null)
    if (!sessionForm.reviewerName.trim()) {
      setSessionError(t`Reviewer name is required.`)
      return
    }

    try {
      const saved = await saveSessionMutation.mutateAsync({
        session_id: crypto.randomUUID(),
        reviewer_name: sessionForm.reviewerName.trim(),
        institution: sessionForm.institution.trim() || undefined,
        language: sessionForm.language.trim() || undefined,
        start_page: sessionForm.startPage ? Number(sessionForm.startPage) : undefined,
        end_page: sessionForm.endPage ? Number(sessionForm.endPage) : undefined,
        comments: sessionForm.comments.trim() || undefined,
        started_at: new Date().toISOString(),
      })
      setHasRestoredSessionState(true)
      setActiveSessionId(saved.session.session_id)
      setShowSessionForm(false)
      setSessionForm(DEFAULT_SESSION_FORM)
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : t`Failed to create reviewer session`)
    }
  }

  const handleStatusChange = (criterionId: string, status: ReviewerValidationStatus) => {
    setDraftResults((current) => ({
      ...current,
      [criterionId]: {
        ...(current[criterionId] ?? emptyDraftResult()),
        status,
      },
    }))
    setExplicitCriterionIds((current) => new Set(current).add(criterionId))
    setDirty(true)
  }

  const handleTextChange = (
    criterionId: string,
    field: "comment" | "suggested_modification",
    value: string,
  ) => {
    setDraftResults((current) => ({
      ...current,
      [criterionId]: {
        ...(current[criterionId] ?? emptyDraftResult()),
        [field]: value,
      },
    }))
    setExplicitCriterionIds((current) => new Set(current).add(criterionId))
    setDirty(true)
  }

  const handleResumeReview = () => {
    if (!resumeTarget?.href) {
      return
    }

    setCollapsed(false)
    setPendingResumeHref(resumeTarget.href)
  }

  const handleSavePageReview = async () => {
    if (!activeSession || !currentPage.pageId || !currentPage.href) {
      return
    }

    const record: ReviewerPageValidationRecord = {
      session_id: activeSession.session.session_id,
      page_id: currentPage.pageId,
      page_number: currentPage.pageNumber ?? undefined,
      href: currentPage.href,
      language: activeSession.session.language,
      overall_comment: overallComment.trim() || undefined,
      reviewed_count: counts.reviewed,
      criteria_count: criteriaCount,
      updated_at: new Date().toISOString(),
      results: Object.entries(draftResults)
        .filter(([criterionId, draft]) => {
          if (explicitCriterionIds.has(criterionId)) {
            return true
          }
          return Boolean(draft.comment.trim() || draft.suggested_modification.trim())
        })
        .map(([criterionId, draft]) => ({
          criterion_id: criterionId,
          status: draft.status,
          comment: draft.comment.trim() || undefined,
          suggested_modification: draft.suggested_modification.trim() || undefined,
        })),
    }

    await saveRecordMutation.mutateAsync(record)
    setExplicitCriterionIds(new Set(Object.keys(draftResults)))
    setDirty(false)
  }

  if (collapsed) {
    if (!showCollapsedCard) {
      return null
    }

    const collapsedCardShowsResume = !!resumeTarget && !isOnResumePage

    return (
      <button
        type="button"
        className={cn(
          "fixed bottom-40 right-4 z-40 flex w-[min(22.5rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border bg-background/95 px-3.5 py-3 text-left shadow-md backdrop-blur-sm transition-all duration-150 ease-out supports-[backdrop-filter]:bg-background/90",
          collapsedCardVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
        )}
        onClick={() => {
          if (collapsedCardShowsResume) {
            handleResumeReview()
            return
          }
          setCollapsed(false)
        }}
        title={collapsedCardShowsResume ? t`Continue reviewer validation on page ${resumeTarget?.pageNumber ?? resumeTarget?.pageId}` : t`Show reviewer validation`}
      >
        <div className="mt-0.5 shrink-0">
          {saveRecordMutation.isPending || saveSessionMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : activeSession ? (
            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium"><Trans>Validation</Trans></span>
            {activeSession ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">{activeSession.session.reviewer_name}</span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{collapsedSummary}</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{collapsedDetail}</div>
        </div>

        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    )
  }

  return (
    <div className="absolute bottom-4 right-4 z-20 flex max-h-[calc(100%-2rem)] w-[460px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-3xl border bg-background/95 shadow-xl backdrop-blur-sm supports-[backdrop-filter]:bg-background/90">
      <div className="flex items-start gap-3 border-b px-4 py-3.5">
        <div className="mt-0.5 shrink-0 rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <ClipboardCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold"><Trans>Validation</Trans></h3>
            {activeSession?.session.language ? <Badge variant="outline">{activeSession.session.language}</Badge> : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            <Trans>Record reviewer findings for the current page and save them to the active validation session.</Trans>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => setCollapsed(true)}
          title={t`Collapse validation`}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <Select
            value={activeSessionId ?? undefined}
            onValueChange={(value) => {
              setHasRestoredSessionState(true)
              setActiveSessionId(value)
              setShowSessionForm(false)
            }}
          >
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
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setHasRestoredSessionState(true)
            setShowSessionForm((current) => !current)
            setSessionError(null)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          <Trans>New session</Trans>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3.5 text-sm">
        {sessions.isLoading || (!activeCatalog && catalog.isLoading) ? (
          <div className="flex items-center justify-center rounded-2xl border bg-card/70 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <Trans>Loading reviewer validation…</Trans>
          </div>
        ) : !activeCatalog && catalog.error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <Trans>Failed to load validation checklist:</Trans> {catalog.error.message}
          </div>
        ) : showSessionForm || !activeSession ? (
          <div className="space-y-4 rounded-2xl border bg-card/70 px-4 py-4">
            <div>
              <h4 className="text-sm font-medium"><Trans>Start a reviewer session</Trans></h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                <Trans>Sessions let different reviewers capture findings independently, including language-specific reviews.</Trans>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="reviewer-name" className="text-xs"><Trans>Reviewer name</Trans></Label>
                <Input
                  id="reviewer-name"
                  value={sessionForm.reviewerName}
                  onChange={(event) => handleSessionFormChange("reviewerName", event.target.value)}
                  className="h-8 text-xs"
                  placeholder={t`Jane Reviewer`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reviewer-institution" className="text-xs"><Trans>Institution</Trans></Label>
                <Input
                  id="reviewer-institution"
                  value={sessionForm.institution}
                  onChange={(event) => handleSessionFormChange("institution", event.target.value)}
                  className="h-8 text-xs"
                  placeholder={t`UNICEF`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reviewer-language" className="text-xs"><Trans>Language</Trans></Label>
                <Input
                  id="reviewer-language"
                  value={sessionForm.language}
                  onChange={(event) => handleSessionFormChange("language", event.target.value)}
                  className="h-8 text-xs"
                  placeholder={t`en`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reviewer-start-page" className="text-xs"><Trans>Start page</Trans></Label>
                <Input
                  id="reviewer-start-page"
                  type="number"
                  min={1}
                  value={sessionForm.startPage}
                  onChange={(event) => handleSessionFormChange("startPage", event.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reviewer-end-page" className="text-xs"><Trans>End page</Trans></Label>
                <Input
                  id="reviewer-end-page"
                  type="number"
                  min={1}
                  value={sessionForm.endPage}
                  onChange={(event) => handleSessionFormChange("endPage", event.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="reviewer-comments" className="text-xs"><Trans>Comments</Trans></Label>
                <Textarea
                  id="reviewer-comments"
                  value={sessionForm.comments}
                  onChange={(event) => handleSessionFormChange("comments", event.target.value)}
                  className="min-h-[88px] text-xs"
                  placeholder={t`Optional notes about the review scope or assignments`}
                />
              </div>
            </div>

            {sessionError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {sessionError}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              {sortedSessions.length > 0 ? (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowSessionForm(false)}>
                  <Trans>Cancel</Trans>
                </Button>
              ) : null}
              <Button size="sm" className="h-8 text-xs" onClick={() => void handleCreateSession()} disabled={saveSessionMutation.isPending}>
                {saveSessionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <Trans>Create session</Trans>
              </Button>
            </div>
          </div>
        ) : !currentPage.pageId || !currentPage.href ? (
          <div className="rounded-2xl border border-dashed bg-card/70 px-4 py-8 text-sm text-muted-foreground">
            <Trans>Open a page in Preview to start recording reviewer validation findings.</Trans>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="rounded-2xl border bg-card/70 px-3.5 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <h4 className="truncate text-sm font-semibold">{currentPage.title ?? currentPage.sectionId ?? currentPage.pageId}</h4>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{currentPage.href}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {currentPage.pageNumber != null ? t`Page ${currentPage.pageNumber}` : t`Current Preview Page`}
                  </Badge>
                  {resumeTarget ? (
                    isOnResumePage ? (
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        <Trans>Resume target</Trans>
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={handleResumeReview}
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        <Trans>Continue page {resumeTarget.pageNumber ?? resumeTarget.pageId}</Trans>
                      </Button>
                    )
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile label={t`Checked`} value={`${counts.reviewed}/${criteriaCount}`} />
                <SummaryTile label={t`Pass`} value={counts.pass} tone="success" />
                <SummaryTile label={t`Needs changes`} value={counts.needsChanges} tone="warning" />
                <SummaryTile label={t`N/A`} value={counts.notApplicable} />
              </div>
            </div>

            {activePageSections.map((section, index) => {
              const sectionResults = section.criteria.map(
                (criterion) => resolvedResults.get(criterion.id) ?? { status: "not-reviewed", isDerived: false, reason: null },
              )
              const reviewed = sectionResults.filter((entry) => entry.status !== "not-reviewed").length
              const needsChanges = sectionResults.filter((entry) => entry.status === "needs-changes").length

              return (
                <details key={section.id} className="overflow-hidden rounded-2xl border bg-card/70" open={index === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                    <div>
                      <div>{section.label}</div>
                      <div className="mt-1 text-xs font-normal text-muted-foreground">
                        {t`${reviewed}/${section.criteria.length} checked`}{needsChanges > 0 ? t` · ${needsChanges} need changes` : ""}
                      </div>
                    </div>
                    <Badge variant={needsChanges > 0 ? "destructive" : "outline"} className="text-[11px]">
                      {needsChanges > 0 ? t`${needsChanges} flagged` : t`${section.criteria.length - reviewed} pending`}
                    </Badge>
                  </summary>

                  <div className="border-t px-4 py-3">
                    <div className="space-y-3">
                      {section.criteria.map((criterion) => {
                        const draft = draftResults[criterion.id] ?? emptyDraftResult()
                        const resolved = resolvedResults.get(criterion.id) ?? { status: "not-reviewed", isDerived: false, reason: null }
                        const showNotes = draft.status === "needs-changes" || draft.comment || draft.suggested_modification

                        return (
                          <div key={criterion.id} className="rounded-xl border bg-background/80 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium leading-snug">{criterion.label}</div>
                                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                  {criterion.guidance}
                                </div>
                              </div>
                              {resolved.isDerived ? (
                                <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                                  <Trans>Default N/A</Trans>
                                </Badge>
                              ) : null}
                            </div>

                            {resolved.reason ? (
                              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground dark:border-slate-800 dark:bg-slate-950/30">
                                {formatReviewerValidationDefaultReason(i18n, resolved.reason)}
                              </div>
                            ) : null}

                            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                              {STATUS_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={cn(
                                    "rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors",
                                    resolved.status === option.value
                                      ? option.value === "needs-changes"
                                        ? "border-amber-300 bg-amber-50 text-amber-900"
                                        : option.value === "pass"
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                          : "border-slate-300 bg-slate-100 text-slate-900"
                                      : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                  )}
                                  onClick={() => handleStatusChange(criterion.id, option.value)}
                                >
                                  {getStatusLabel(i18n, option.value)}
                                </button>
                              ))}
                            </div>

                            {showNotes ? (
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5 sm:col-span-2">
                                  <Label htmlFor={`${criterion.id}-comment`} className="text-[11px]"><Trans>Comment</Trans></Label>
                                  <Textarea
                                    id={`${criterion.id}-comment`}
                                    value={draft.comment}
                                    onChange={(event) => handleTextChange(criterion.id, "comment", event.target.value)}
                                    className="min-h-[72px] text-xs"
                                    placeholder={t`Describe the issue or note why this criterion needs attention`}
                                  />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                  <Label htmlFor={`${criterion.id}-suggestion`} className="text-[11px]"><Trans>Suggested modification</Trans></Label>
                                  <Textarea
                                    id={`${criterion.id}-suggestion`}
                                    value={draft.suggested_modification}
                                    onChange={(event) => handleTextChange(criterion.id, "suggested_modification", event.target.value)}
                                    className="min-h-[72px] text-xs"
                                    placeholder={t`Optional suggestion for fixing or improving this item`}
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </details>
              )
            })}

            <div className="rounded-2xl border bg-card/70 px-3.5 py-3.5">
              <Label htmlFor="page-review-overall-comment" className="text-xs"><Trans>Overall page note</Trans></Label>
              <Textarea
                id="page-review-overall-comment"
                value={overallComment}
                onChange={(event) => {
                  setOverallComment(event.target.value)
                  setDirty(true)
                }}
                className="mt-2 min-h-[88px] text-xs"
                placeholder={t`Optional page-level summary or handoff note`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenValidation}>
          <ExternalLink className="h-3.5 w-3.5" />
          <Trans>Open Validation</Trans>
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={() => void handleSavePageReview()}
          disabled={!activeSession || !currentPage.pageId || !dirty || saveRecordMutation.isPending}
        >
          {saveRecordMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          <Trans>Save page review</Trans>
        </Button>
      </div>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string | number
  tone?: "default" | "warning" | "success"
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        tone === "warning"
          ? "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/20"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/20"
            : "bg-background/80",
      )}
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}
