import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { usePreviewBridge } from "@/hooks/use-preview-bridge"
import {
  PREVIEW_HIGHLIGHT_SEVERITIES,
  type AccessibilityFinding,
  type PreviewBridgePage,
  type PreviewHighlightSeverity,
} from "@adt/types"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react"
import { toastPackagingWarnings } from "@/lib/packaging-warnings"
import { StageBlockedState } from "@/components/pipeline/components/StageBlockedState"
import { LoadingState } from "@/components/pipeline/components/LoadingState"
import { useAllPagesPruned } from "@/hooks/use-all-pages-pruned"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { api, getAdtUrl } from "@/api/client"
import { useDebugPanelState } from "@/components/debug/debug-panel-state"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import { usePackageAdtStatus } from "@/hooks/use-books"
import { useReviewerValidationCatalog } from "@/hooks/use-reviewer-validation"
import { useBookRun } from "@/hooks/use-book-run"
import { useBookTasks } from "@/hooks/use-book-tasks"
import {
  findAccessibilityPage,
  normalizeAccessibilityHref,
  summarizeAccessibilityPage,
} from "@/lib/accessibility-summary"
import { createPortal } from "react-dom"
import { useStepHeader } from "@/components/pipeline/components/StepViewRouter"
import { PreviewAccessibilityCard } from "./PreviewAccessibilityCard"
import { PreviewValidationCard } from "./PreviewValidationCard"
import { useDeviceView, DEVICE_WIDTHS } from "./storyboard/components/style-editor/device-breakpoint"
import { getDeviceFrame, getTargetVisibleWidth } from "./storyboard/components/style-editor/device-chrome"
import { ViewportToggle } from "./storyboard/components/style-editor/ViewportToggle"
import { IPhoneFrame } from "./storyboard/components/style-editor/device-frames/iphone-frame"
import { IPadFrame } from "./storyboard/components/style-editor/device-frames/ipad-frame"

export function PreviewView({ bookLabel }: { bookLabel: string }) {
  const { i18n } = useLingui()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { previewHref?: string }
  const { stageState, isStatusLoading } = useBookRun()
  const { isTaskRunning, getTask } = useBookTasks(bookLabel)
  const storyboardDone = stageState("storyboard") === "done"
  const { allPruned, isLoading: prunedLoading } = useAllPagesPruned(bookLabel)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ranRef = useRef(false)
  const { panelOpen } = useDebugPanelState()
  const { headerSlotEl } = useStepHeader()
  const [deviceView, setDeviceView] = useDeviceView(bookLabel, "desktop")
  const [available, setAvailable] = useState({ width: 0, height: 0 })
  const [isSubmittingPackage, setIsSubmittingPackage] = useState(false)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [pendingVersion, setPendingVersion] = useState<string | null>(null)
  const [awaitingAssessment, setAwaitingAssessment] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState("0")
  const [currentPreviewPage, setCurrentPreviewPage] = useState<{
    sectionId: string | null
    href: string | null
    title: string | null
    hasImages: boolean
    hasActivity: boolean
    signLanguageEnabled: boolean
  }>({ sectionId: null, href: null, title: null, hasImages: false, hasActivity: false, signLanguageEnabled: false })
  const [accessibilityCardExpanded, setAccessibilityCardExpanded] = useState(false)
  const [validationCardExpanded, setValidationCardExpanded] = useState(false)
  const { data, isLoading: assessmentLoading, error: assessmentError } = useAccessibilityAssessment(bookLabel)
  const { data: packageStatus } = usePackageAdtStatus(bookLabel, {
    refetchInterval: pendingVersion && !ready ? 1_000 : false,
  })
  const reviewerValidationCatalog = useReviewerValidationCatalog(bookLabel)
  const reviewerValidationEnabled = reviewerValidationCatalog.data?.enabled ?? false

  const assessment = data?.assessment ?? null
  const matchedPage = useMemo(
    () => (assessment ? findAccessibilityPage(assessment, currentPreviewPage) : null),
    [assessment, currentPreviewPage],
  )
  const currentPageSummary = useMemo(
    () => summarizeAccessibilityPage(matchedPage),
    [matchedPage],
  )
  const currentValidationPage = useMemo(() => {
    const pageId = deriveReviewPageId(currentPreviewPage.sectionId, currentPreviewPage.href)
    return {
      pageId,
      pageNumber: matchedPage?.pageNumber ?? deriveReviewPageNumber(pageId),
      sectionId: currentPreviewPage.sectionId,
      href: currentPreviewPage.href,
      title: currentPreviewPage.title,
      hasImages: currentPreviewPage.hasImages,
      hasActivity: currentPreviewPage.hasActivity,
      signLanguageEnabled: currentPreviewPage.signLanguageEnabled,
    }
  }, [currentPreviewPage, matchedPage])

  const handlePreviewPage = useCallback((page: PreviewBridgePage) => {
    setCurrentPreviewPage({ ...page, href: normalizeAccessibilityHref(page.href) })
  }, [])

  const previewSrc = `${getAdtUrl(bookLabel)}/v-${version}/`
  const { highlight: highlightPreview, navigate: navigatePreviewToHref } =
    usePreviewBridge(iframeRef, previewSrc, handlePreviewPage)

  const highlightFindingTargets = useCallback((finding: AccessibilityFinding | null) => {
    if (!finding) {
      highlightPreview([], "unknown")
      return
    }
    highlightPreview(finding.nodes.flatMap((node) => node.target), getHighlightSeverity(finding.impact))
  }, [highlightPreview])

  const packaging = !ready && (isSubmittingPackage || isTaskRunning("package-adt"))
  const assessmentPending = awaitingAssessment || isTaskRunning("package-adt")

  useEffect(() => {
    if (!pendingTaskId) return
    const task = getTask(pendingTaskId)
    if (!task) return
    if (task.status === "completed") {
      setPendingTaskId(null)
      setPendingVersion(null)
      setIsSubmittingPackage(false)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] }),
        queryClient.invalidateQueries({ queryKey: ["package-adt-status", bookLabel] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", bookLabel] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "versions", bookLabel, "accessibility-assessment", "book"] }),
      ]).then(() => {
        setVersion(readPackageVersion(task.result) ?? createPreviewVersion())
        setReady(true)
        setAwaitingAssessment(false)
        // Packaging skips rendered sections it cannot resolve a sectionId for.
        // The bundle is short but the task still succeeds, so without this the
        // omission is invisible.
        toastPackagingWarnings(task.result, i18n)
      })
    } else if (task.status === "failed") {
      setPendingTaskId(null)
      setPendingVersion(null)
      setIsSubmittingPackage(false)
      setAwaitingAssessment(false)
      if (!ready) {
        setError(task.error ?? "Packaging failed")
      }
    }
  }, [pendingTaskId, getTask, bookLabel, queryClient, ready, i18n])

  useEffect(() => {
    if (!pendingVersion || ready) return
    if (!packageStatus?.hasAdt || packageStatus.version !== pendingVersion) return
    setVersion(pendingVersion)
    setReady(true)
    setIsSubmittingPackage(false)
  }, [packageStatus?.hasAdt, packageStatus?.version, pendingVersion, ready])

  const runPackage = useCallback(async () => {
    setIsSubmittingPackage(true)
    setPendingTaskId(null)
    setPendingVersion(null)
    setError(null)
    setReady(false)
    setAwaitingAssessment(true)
    setCurrentPreviewPage({ sectionId: null, href: null, title: null, hasImages: false, hasActivity: false, signLanguageEnabled: false })
    let taskId: string | undefined
    try {
      const result = await api.packageAdt(bookLabel)
      taskId = result.taskId
      if (taskId) {
        setPendingTaskId(taskId)
        setPendingVersion(result.version ?? createPreviewVersion())
      } else {
        // Synchronous completion (cache hit) — no task to wait for
        setIsSubmittingPackage(false)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] }),
          queryClient.invalidateQueries({ queryKey: ["package-adt-status", bookLabel] }),
          queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", bookLabel] }),
          queryClient.invalidateQueries({ queryKey: ["debug", "versions", bookLabel, "accessibility-assessment", "book"] }),
        ])
        setVersion(result.version ?? createPreviewVersion())
        setReady(true)
        setAwaitingAssessment(false)
        // A cache hit replays the warnings of the build that produced the
        // bundle on disk, so this branch omits exactly as much as the task one.
        toastPackagingWarnings(result, i18n)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Packaging failed")
      setIsSubmittingPackage(false)
      setAwaitingAssessment(false)
    }
  }, [bookLabel, queryClient, i18n])

  // Only trigger packaging when storyboard is done
  useEffect(() => {
    if (!storyboardDone || ranRef.current) return
    ranRef.current = true
    runPackage()
  }, [runPackage, storyboardDone])

  useEffect(() => {
    if (!storyboardDone) return
    const handler = () => { runPackage() }
    window.addEventListener("adt:repackage", handler)
    return () => window.removeEventListener("adt:repackage", handler)
  }, [runPackage, storyboardDone])

  useEffect(() => {
    if (!ready || !search.previewHref) {
      return
    }

    const currentHref = currentPreviewPage.href
    if (!currentHref) {
      return
    }

    const normalizedTarget = normalizeAccessibilityHref(search.previewHref)
    if (currentHref !== normalizedTarget) {
      navigatePreviewToHref(search.previewHref)
      return
    }

    void navigate({
      to: "/books/$label/$step",
      params: { label: bookLabel, step: "preview" },
      search: {},
      replace: true,
    })
  }, [bookLabel, currentPreviewPage.href, navigate, navigatePreviewToHref, ready, search.previewHref])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const update = () => setAvailable({ width: wrapper.clientWidth, height: wrapper.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [ready, deviceView])

  if (isStatusLoading || prunedLoading) {
    return <LoadingState stageSlug="preview" label={<Trans>Loading preview...</Trans>} />
  }

  if (!storyboardDone) {
    return <StageBlockedState bookLabel={bookLabel} reason="storyboard-missing" stageLabel={<Trans>Preview</Trans>} />
  }

  if (allPruned) {
    return <StageBlockedState bookLabel={bookLabel} reason="all-pruned" stageLabel={<Trans>Preview</Trans>} />
  }

  if (packaging) {
    return <LoadingState stageSlug="preview" label={<Trans>Packaging preview...</Trans>} />
  }

  if (error) {
    return (
      <div className="p-4 max-w-xl">
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-700 whitespace-pre-wrap break-words">{error}</p>
        </div>
      </div>
    )
  }

  if (ready) {
    const isDesktop = deviceView === "desktop"
    const frame = getDeviceFrame(deviceView, DEVICE_WIDTHS[deviceView])
    const cap = getTargetVisibleWidth(deviceView) / frame.chromeWidth
    const fitScale = Math.min(
      Math.max(0, available.width - 48) / frame.chromeWidth,
      Math.max(0, available.height - 48) / frame.chromeHeight,
    )
    const scale = Number.isFinite(fitScale) ? Math.max(0, Math.min(cap, fitScale)) : 1
    const measured = available.width > 0 && available.height > 0

    const framedIframe = (
      <iframe
        ref={iframeRef}
        src={previewSrc}
        title="ADT Preview"
        className="block border-0 bg-white"
        style={{ width: frame.screenWidth, height: frame.screenHeight }}
      />
    )

    return (
      <div className="relative h-full w-full bg-muted/20 overflow-hidden">
        <div ref={wrapperRef} className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {isDesktop ? (
            <iframe
              ref={iframeRef}
              src={previewSrc}
              className="h-full w-full border-0"
              title="ADT Preview"
            />
          ) : (
            <div
              className="transition-[transform,opacity] duration-200 ease-out"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "center",
                opacity: measured ? 1 : 0,
              }}
            >
              {deviceView === "mobile" ? (
                <IPhoneFrame width={frame.chromeWidth}>{framedIframe}</IPhoneFrame>
              ) : (
                <IPadFrame screenWidth={frame.screenWidth} screenHeight={frame.screenHeight}>
                  {framedIframe}
                </IPadFrame>
              )}
            </div>
          )}
        </div>

        {headerSlotEl &&
          createPortal(
            <ViewportToggle
              value={deviceView}
              onChange={setDeviceView}
              currentWidth={isDesktop ? undefined : Math.round(frame.screenWidth * scale)}
            />,
            headerSlotEl,
          )}

        <PreviewAccessibilityCard
          label={bookLabel}
          assessment={assessment}
          isLoading={assessmentLoading || assessmentPending}
          error={assessmentError ?? null}
          currentPage={currentPageSummary ?? (assessment && currentPreviewPage.href ? {
            sectionId: currentPreviewPage.sectionId ?? currentPreviewPage.href,
            href: currentPreviewPage.href,
            title: currentPreviewPage.title,
            issueCount: 0,
            reviewCount: 0,
            totalCount: 0,
            hasError: false,
            status: "clean",
            categories: [],
          } : null)}
          currentPageResult={matchedPage}
          panelOpen={panelOpen}
          otherCardExpanded={validationCardExpanded}
          onExpandedChange={setAccessibilityCardExpanded}
          onFindingHover={highlightFindingTargets}
        />

        {reviewerValidationEnabled ? (
          <PreviewValidationCard
            label={bookLabel}
            panelOpen={panelOpen}
            otherCardExpanded={accessibilityCardExpanded}
            currentPage={currentValidationPage}
            onNavigateToPage={navigatePreviewToHref}
            onExpandedChange={setValidationCardExpanded}
            onOpenValidation={() => navigate({
              to: "/books/$label/$step",
              params: { label: bookLabel, step: "validation" },
              search: { tab: "reviewer-validation" },
            })}
          />
        ) : null}
      </div>
    )
  }

  return null
}

function deriveReviewPageId(sectionId: string | null, href: string | null): string | null {
  if (sectionId) {
    const sectionMatch = sectionId.match(/^(.+)_sec\d{3}$/)
    if (sectionMatch) {
      return sectionMatch[1] ?? null
    }
    return sectionId
  }

  if (href) {
    const fileName = href.split("/").pop() ?? href
    return fileName.replace(/\.html$/i, "") || null
  }

  return null
}

function createPreviewVersion(): string {
  return String(Date.now())
}

function readPackageVersion(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null
  const version = (result as { version?: unknown }).version
  return typeof version === "string" && version.length > 0 ? version : null
}

function deriveReviewPageNumber(pageId: string | null): number | null {
  if (!pageId) {
    return null
  }

  const match = pageId.match(/pg0*(\d+)/i)
  if (!match) {
    return null
  }

  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

function getHighlightSeverity(impact: string | null | undefined): PreviewHighlightSeverity {
  return PREVIEW_HIGHLIGHT_SEVERITIES.find((severity) => severity === impact) ?? "unknown"
}

