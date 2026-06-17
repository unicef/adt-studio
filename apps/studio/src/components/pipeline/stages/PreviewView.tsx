import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from "react"
import type { AccessibilityFinding } from "@adt/types"
import { Trans } from "@lingui/react/macro"
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
import { PreviewAccessibilityCard } from "./PreviewAccessibilityCard"
import { PreviewValidationCard } from "./PreviewValidationCard"

const HIGHLIGHT_STYLE_ID = "adt-preview-a11y-highlights"
const HIGHLIGHT_ATTR = "data-adt-a11y-hover"
const HIGHLIGHT_SEVERITY_ATTR = "data-adt-a11y-hover-severity"
const HIGHLIGHT_PAGE_ATTR = "data-adt-a11y-hover-page"

export function PreviewView({ bookLabel }: { bookLabel: string }) {
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
  // Fixed-layout pages render at their native pixel viewport (e.g.
  // 1587×1224) which usually exceeds the studio preview pane. Detect the
  // page's intrinsic size from the iframe body's inline width/height and
  // CSS-scale the iframe to fit, mirroring the storyboard preview.
  // null = reflowable (no scaling).
  // `referenceWidth` is the book-wide widest page (a full spread in spread
  // mode), read from `#content`'s `data-fl-reference-width`. Scaling off it —
  // not this page's own width — keeps every page at one uniform scale, so a
  // single cover/end page renders centered at half-width rather than upscaled
  // to fill the pane. Falls back to the page's own width when absent.
  const [fixedLayoutSize, setFixedLayoutSize] = useState<{ height: number; referenceWidth: number } | null>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const { panelOpen } = useDebugPanelState()
  const [isSubmittingPackage, setIsSubmittingPackage] = useState(false)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [pendingVersion, setPendingVersion] = useState<string | null>(null)
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

  const highlightFindingTargets = useCallback((finding: AccessibilityFinding | null) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    clearHighlight(doc)
    if (!finding) return
    const targets = finding.nodes.flatMap((node) => node.target)
    if (targets.length === 0) return
    ensureHighlightStyles(doc)
    const severity = getHighlightSeverity(finding.impact)
    for (const selector of targets) {
      const elements = querySelectorAllSafe(doc, selector)
      const hasRootMatch = selector.trim().toLowerCase() === "html" || elements.some((el) => el === doc.documentElement)
      if (hasRootMatch) {
        setPageHighlight(doc, severity)
      }
      for (const el of elements) {
        el.setAttribute(HIGHLIGHT_ATTR, "true")
        el.setAttribute(HIGHLIGHT_SEVERITY_ATTR, severity)
      }
    }
  }, [])

  const syncCurrentPreviewPage = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow || !iframe.contentDocument) {
      return
    }

    try {
      const sectionId = iframe.contentDocument
        .querySelector('meta[name="title-id"]')
        ?.getAttribute("content") ?? null
      const href = normalizeAccessibilityHref(iframe.contentWindow.location.pathname)
      const title = iframe.contentDocument.title || null
      const hasImages = iframe.contentDocument.querySelectorAll("img").length > 0
      const hasActivity = iframe.contentDocument.querySelector('[data-section-type^="activity_"]') !== null
      const signLanguageEnabled =
        iframe.contentDocument.querySelector("#sl-quick-toggle-button, #sign-language-video") !== null

      // Detect fixed-layout pages — `package-web.ts` emits inline
      // `style="...width:Wpx;height:Hpx..."` on `<body>` for fixed-layout
      // page HTML. Parse those values; null otherwise. The book-wide
      // reference width lives on `#content`'s `data-fl-reference-width`.
      const body = iframe.contentDocument.body
      const w = parsePxStyle(body?.style.width)
      const h = parsePxStyle(body?.style.height)
      const contentEl = iframe.contentDocument.getElementById("content")
      const refRaw = contentEl?.getAttribute("data-fl-reference-width")
      const ref = refRaw ? parseFloat(refRaw) : NaN
      if (w !== null && h !== null && body) {
        // The iframe is laid out at the book's reference (spread) width so the
        // reader's full-width bottom dock — fixed to the iframe viewport —
        // stays one constant width on every page (see iframeStyle). Center this
        // page's (possibly narrower) body within that viewport so a single
        // cover/end page sits in the middle with the dock spanning the whole
        // panel beneath it. Overrides the produced page's inline `margin:0`.
        body.style.marginLeft = "auto"
        body.style.marginRight = "auto"
        setFixedLayoutSize({ height: h, referenceWidth: Number.isFinite(ref) && ref > 0 ? ref : w })
      } else {
        setFixedLayoutSize(null)
      }

      setCurrentPreviewPage({ sectionId, href, title, hasImages, hasActivity, signLanguageEnabled })
    } catch {
      setFixedLayoutSize(null)
      setCurrentPreviewPage({ sectionId: null, href: null, title: null, hasImages: false, hasActivity: false, signLanguageEnabled: false })
    }
  }, [])

  // Track wrapper width so the scale recomputes when the panel resizes
  // (debug panel toggle, window resize, sidebar collapse, etc.). Depends
  // on `ready` because the wrapper only renders once packaging is done —
  // without that dep the effect runs once on mount when the wrapper
  // doesn't exist yet, ref is null, and the observer never attaches.
  useEffect(() => {
    if (!ready) return
    const el = wrapperRef.current
    if (!el) return
    setAvailableWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setAvailableWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ready])

  const scale = fixedLayoutSize && availableWidth > 0
    ? Math.min(1, availableWidth / fixedLayoutSize.referenceWidth)
    : 1

  const packaging = !ready && (isSubmittingPackage || isTaskRunning("package-adt"))

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
      })
    } else if (task.status === "failed") {
      setPendingTaskId(null)
      setPendingVersion(null)
      setIsSubmittingPackage(false)
      if (!ready) {
        setError(task.error ?? "Packaging failed")
      }
    }
  }, [pendingTaskId, getTask, bookLabel, queryClient, ready])

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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Packaging failed")
      setIsSubmittingPackage(false)
    }
  }, [bookLabel, queryClient])

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

  const navigatePreviewToHref = useCallback((href: string) => {
    const iframe = iframeRef.current
    const iframeWindow = iframe?.contentWindow
    if (!iframeWindow) {
      return
    }

    const normalizedHref = href.replace(/^\/+/, "")
    const currentHref = iframeWindow.location.href
    const fallbackBase = typeof window === "undefined"
      ? `${getAdtUrl(bookLabel)}/v-${version}/`
      : new URL(`${getAdtUrl(bookLabel)}/v-${version}/`, window.location.origin).toString()
    const baseHref = currentHref && currentHref !== "about:blank" ? currentHref : fallbackBase
    const nextUrl = new URL(normalizedHref, baseHref)
    iframeWindow.location.href = nextUrl.toString()
  }, [bookLabel, version])

  useEffect(() => {
    if (!ready || !search.previewHref) {
      return
    }

    const currentHref = currentPreviewPage.href
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
    // Fixed-layout: lay the iframe out at the book's reference (spread) width —
    // not this page's own width — and CSS-scale it via transform to fit the
    // pane. Using the constant reference width keeps the reader's bottom dock
    // (fixed to the iframe viewport, full-width) one consistent width on every
    // page; a single page's narrower body is centered within that viewport
    // (see syncCurrentPreviewPage), so the cover sits in the middle with the
    // dock spanning the whole panel. The sizing div takes the *scaled*
    // dimensions (the iframe's layout box stays at native size despite the
    // transform, so we wrap it to keep page layout honest).
    // Reflowable: iframe fills the wrapper as before.
    const iframeStyle: CSSProperties = fixedLayoutSize
      ? {
          width: fixedLayoutSize.referenceWidth,
          height: fixedLayoutSize.height,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }
      : { width: "100%", height: "100%" }
    const sizerStyle: CSSProperties = fixedLayoutSize
      ? {
          width: fixedLayoutSize.referenceWidth * scale,
          height: fixedLayoutSize.height * scale,
          overflow: "hidden",
          // Center the reader within the pane when it's narrower than the pane
          // (large screens, scale capped at 1×).
          margin: "0 auto",
        }
      : { width: "100%", height: "100%" }
    return (
      <div ref={wrapperRef} className="relative h-full w-full bg-muted/20 overflow-auto">
        <div style={sizerStyle}>
          <iframe
            ref={iframeRef}
            src={`${getAdtUrl(bookLabel)}/v-${version}/`}
            className="border-0"
            style={iframeStyle}
            title="ADT Preview"
            onLoad={syncCurrentPreviewPage}
          />
        </div>

        <PreviewAccessibilityCard
          label={bookLabel}
          assessment={assessment}
          isLoading={assessmentLoading}
          error={assessmentError ?? null}
          currentPage={currentPageSummary ?? (currentPreviewPage.href ? {
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

/** Parse a pixel value (e.g. "1587px") to a number, or null for missing/non-px values. */
function parsePxStyle(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
  return match ? parseFloat(match[1]) : null
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

function clearHighlight(doc: Document): void {
  for (const el of doc.querySelectorAll(`[${HIGHLIGHT_ATTR}]`)) {
    el.removeAttribute(HIGHLIGHT_ATTR)
    el.removeAttribute(HIGHLIGHT_SEVERITY_ATTR)
  }
  doc.documentElement.removeAttribute(HIGHLIGHT_PAGE_ATTR)
  doc.body?.removeAttribute(HIGHLIGHT_PAGE_ATTR)
}

function ensureHighlightStyles(doc: Document): void {
  if (doc.getElementById(HIGHLIGHT_STYLE_ID)) return
  const style = doc.createElement("style")
  style.id = HIGHLIGHT_STYLE_ID
  style.textContent = `
    [${HIGHLIGHT_ATTR}="true"] {
      outline-width: 2px !important;
      outline-style: solid !important;
      outline-offset: 2px !important;
      transition: outline-color 120ms ease, box-shadow 120ms ease;
    }

    [${HIGHLIGHT_ATTR}="true"][${HIGHLIGHT_SEVERITY_ATTR}="critical"] {
      outline-color: rgba(239, 68, 68, 0.98) !important;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.98), 0 0 0 6px rgba(239, 68, 68, 0.28) !important;
    }

    [${HIGHLIGHT_ATTR}="true"][${HIGHLIGHT_SEVERITY_ATTR}="serious"] {
      outline-color: rgba(249, 115, 22, 0.98) !important;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.98), 0 0 0 6px rgba(249, 115, 22, 0.28) !important;
    }

    [${HIGHLIGHT_ATTR}="true"][${HIGHLIGHT_SEVERITY_ATTR}="moderate"] {
      outline-color: rgba(234, 179, 8, 0.98) !important;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.98), 0 0 0 6px rgba(234, 179, 8, 0.3) !important;
    }

    [${HIGHLIGHT_ATTR}="true"][${HIGHLIGHT_SEVERITY_ATTR}="minor"] {
      outline-color: rgba(96, 165, 250, 0.98) !important;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.98), 0 0 0 6px rgba(96, 165, 250, 0.28) !important;
    }

    [${HIGHLIGHT_ATTR}="true"][${HIGHLIGHT_SEVERITY_ATTR}="unknown"] {
      outline-color: rgba(107, 114, 128, 0.98) !important;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.98), 0 0 0 6px rgba(107, 114, 128, 0.24) !important;
    }

    body[${HIGHLIGHT_PAGE_ATTR}]::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      border: 4px solid transparent;
      box-sizing: border-box;
      z-index: 2147483647;
    }

    body[${HIGHLIGHT_PAGE_ATTR}="critical"]::before {
      border-color: rgba(239, 68, 68, 0.95);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 0 6px rgba(239, 68, 68, 0.24);
    }

    body[${HIGHLIGHT_PAGE_ATTR}="serious"]::before {
      border-color: rgba(249, 115, 22, 0.95);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 0 6px rgba(249, 115, 22, 0.22);
    }

    body[${HIGHLIGHT_PAGE_ATTR}="moderate"]::before {
      border-color: rgba(234, 179, 8, 0.95);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 0 6px rgba(234, 179, 8, 0.22);
    }

    body[${HIGHLIGHT_PAGE_ATTR}="minor"]::before {
      border-color: rgba(96, 165, 250, 0.95);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 0 6px rgba(96, 165, 250, 0.22);
    }

    body[${HIGHLIGHT_PAGE_ATTR}="unknown"]::before {
      border-color: rgba(107, 114, 128, 0.95);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.92), 0 0 0 6px rgba(107, 114, 128, 0.2);
    }
  `
  doc.head.appendChild(style)
}

function setPageHighlight(doc: Document, severity: "critical" | "serious" | "moderate" | "minor" | "unknown"): void {
  doc.documentElement.setAttribute(HIGHLIGHT_PAGE_ATTR, severity)
  doc.body?.setAttribute(HIGHLIGHT_PAGE_ATTR, severity)
}

function getHighlightSeverity(impact: string | null | undefined): "critical" | "serious" | "moderate" | "minor" | "unknown" {
  if (impact === "critical" || impact === "serious" || impact === "moderate" || impact === "minor") {
    return impact
  }

  return "unknown"
}

function querySelectorAllSafe(doc: Document, selector: string): Element[] {
  try {
    return Array.from(doc.querySelectorAll(selector))
  } catch {
    return []
  }
}
