import { createFileRoute, Link } from "@tanstack/react-router"
import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Check, Clock, CheckCircle2, ChevronLeft, ChevronRight, ImageOff, Loader2, ExternalLink, RefreshCw, Settings2, AlertCircle, HelpCircle, Lightbulb, BookOpen, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useBook, useExportBook } from "@/hooks/use-books"
import { usePages, usePage, usePageImage } from "@/hooks/use-pages"
import { usePipelineSSE, usePipelineStatus, useRunPipeline } from "@/hooks/use-pipeline"
import { useApiKey } from "@/hooks/use-api-key"
import { useReRenderPage } from "@/hooks/use-page-mutations"
import { STEP_LABELS } from "@/components/pipeline/StepIndicator"
import { RenderedHtml } from "@/components/storyboard/RenderedHtml"
import { ActivityAnswerPanel } from "@/components/storyboard/ActivityAnswerPanel"
import { isActivitySection, formatSectionType } from "@/lib/activity-utils"
import { StoryboardSettingsSheet } from "@/components/storyboard/StoryboardSettingsSheet"
import { AcceptStoryboardDialog } from "@/components/storyboard/AcceptStoryboardDialog"
import { StoryboardGuideDialog } from "@/components/storyboard/StoryboardGuideDialog"
import { useGuideDismissed } from "@/hooks/use-guide-dismissed"
import type { StepName } from "@/hooks/use-pipeline"

export const Route = createFileRoute("/books/$label/storyboard")({
  component: StoryboardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
})

type Filter = "all" | "rendered" | "pending"

function MiniPageCard({
  label,
  pageId,
  pageNumber,
  textPreview,
  hasRendering,
  isSelected,
  onClick,
}: {
  label: string
  pageId: string
  pageNumber: number
  textPreview: string
  hasRendering: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const { data: imageData } = usePageImage(label, pageId)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
        isSelected
          ? "bg-primary/5 border-l-2 border-l-primary"
          : "border-l-2 border-l-transparent hover:bg-muted/50"
      }`}
    >
      <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-muted">
        {imageData ? (
          <img
            src={`data:image/png;base64,${imageData.imageBase64}`}
            alt={`Page ${pageNumber}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
            {pageNumber}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">Page {pageNumber}</div>
        {textPreview && (
          <div className="text-xs text-muted-foreground truncate">
            {textPreview}
          </div>
        )}
      </div>
      <div className="shrink-0">
        {hasRendering ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
    </button>
  )
}

function StoryboardPage() {
  const { label } = Route.useParams()
  const { page: initialPageId } = Route.useSearch()
  const { data: book } = useBook(label)
  const { data: pages, isLoading, error } = usePages(label)

  const { apiKey, hasApiKey } = useApiKey()
  const runPipeline = useRunPipeline()
  const [sseEnabled, setSseEnabled] = useState(false)
  const { progress, reset } = usePipelineSSE(label, sseEnabled)
  const { data: pipelineStatus } = usePipelineStatus(label)

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false)
  const [guideDismissed, dismissGuide] = useGuideDismissed("storyboard")
  const [guideOpen, setGuideOpen] = useState(!guideDismissed)

  // Track whether we've consumed the initial page search param
  const initialPageConsumed = useRef(false)

  // Auto-reconnect to SSE if pipeline is already running
  useEffect(() => {
    if (pipelineStatus?.status === "running" && !sseEnabled) {
      setSseEnabled(true)
    }
  }, [pipelineStatus?.status, sseEnabled])

  const handleRebuild = useCallback(() => {
    if (!hasApiKey) return
    reset()
    setSseEnabled(true)
    runPipeline.mutate(
      { label, apiKey },
      {
        onError: () => {
          setSseEnabled(false)
        },
      }
    )
  }, [label, apiKey, hasApiKey, reset, runPipeline])

  const filteredPages = useMemo(() => {
    if (!pages) return []
    switch (filter) {
      case "rendered":
        return pages.filter((p) => p.hasRendering)
      case "pending":
        return pages.filter((p) => !p.hasRendering)
      default:
        return pages
    }
  }, [pages, filter])

  const renderedCount = useMemo(
    () => pages?.filter((p) => p.hasRendering).length ?? 0,
    [pages]
  )
  const totalCount = pages?.length ?? 0
  const pendingCount = totalCount - renderedCount

  const isAccepted = book?.storyboardAccepted ?? false
  const canAccept = !isAccepted && renderedCount > 0 && renderedCount === totalCount && !progress.isRunning
  const exportBook = useExportBook()

  // Auto-select page: prefer initialPageId from search param, then first page
  useEffect(() => {
    if (filteredPages.length === 0) {
      setSelectedPageId(null)
      return
    }

    // Use search param page on first load
    if (initialPageId && !initialPageConsumed.current) {
      const found = filteredPages.some((p) => p.pageId === initialPageId)
      if (found) {
        setSelectedPageId(initialPageId)
        initialPageConsumed.current = true
        return
      }
    }

    const currentStillVisible = selectedPageId && filteredPages.some((p) => p.pageId === selectedPageId)
    if (!currentStillVisible) {
      setSelectedPageId(filteredPages[0].pageId)
    }
  }, [filteredPages, selectedPageId, initialPageId])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        const idx = filteredPages.findIndex((p) => p.pageId === selectedPageId)
        if (idx > 0) setSelectedPageId(filteredPages[idx - 1].pageId)
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        const idx = filteredPages.findIndex((p) => p.pageId === selectedPageId)
        if (idx < filteredPages.length - 1) setSelectedPageId(filteredPages[idx + 1].pageId)
      }
    },
    [filteredPages, selectedPageId]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const selectedIndex = filteredPages.findIndex((p) => p.pageId === selectedPageId)
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex < filteredPages.length - 1

  // Current step label for rebuild banner
  const currentStepLabel = progress.currentStep
    ? STEP_LABELS[progress.currentStep as StepName] ?? progress.currentStep
    : null

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading pages...</div>
  }

  if (error) {
    return (
      <div className="p-4 text-destructive">
        Failed to load pages: {error.message}
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
            ADT Studio
          </Link>
          <span className="text-muted-foreground/50 text-xs">/</span>
          <Link to="/books/$label" params={{ label }} search={{ autoRun: undefined, startPage: undefined, endPage: undefined }} className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
            {book?.title ?? label}
          </Link>
          <span className="text-muted-foreground/50 text-xs">/</span>
          <span className="text-sm font-semibold">Storyboard Review</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setGuideOpen(true)}
            title="Show guide"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="mr-1.5 h-4 w-4" />
            Settings
          </Button>
          {isAccepted ? (
            <>
              <Button variant="outline" size="sm" disabled>
                <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
                Accepted
              </Button>
              <Button
                size="sm"
                onClick={() => exportBook.mutate(label)}
                disabled={exportBook.isPending}
              >
                {exportBook.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-1.5 h-4 w-4" />
                )}
                Export
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={!canAccept}
              onClick={() => setAcceptDialogOpen(true)}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Accept Storyboard
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  {pendingCount} pending
                </Badge>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Rebuild progress banner */}
      {progress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-4 py-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span className="flex-1">
            Rebuilding storyboard{currentStepLabel ? ` \u2014 ${currentStepLabel}` : ""}...
          </span>
        </div>
      )}
      {progress.error && !progress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Rebuild failed: {progress.error}</span>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="flex w-[272px] shrink-0 flex-col border-r">
          {/* Progress bar */}
          <div className="shrink-0 border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{renderedCount} of {totalCount} rendered</span>
              <span>{totalCount > 0 ? Math.round((renderedCount / totalCount) * 100) : 0}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-green-600 transition-all"
                style={{ width: totalCount > 0 ? `${(renderedCount / totalCount) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex shrink-0 gap-1 border-b px-3 py-2">
            <Button
              variant={filter === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter("all")}
            >
              All ({totalCount})
            </Button>
            <Button
              variant={filter === "rendered" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter("rendered")}
            >
              Rendered ({renderedCount})
            </Button>
            <Button
              variant={filter === "pending" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter("pending")}
            >
              Pending ({pendingCount})
            </Button>
          </div>

          {/* Page list */}
          <div className="flex-1 overflow-y-auto">
            {filteredPages.map((page) => (
              <MiniPageCard
                key={page.pageId}
                label={label}
                pageId={page.pageId}
                pageNumber={page.pageNumber}
                textPreview={page.textPreview}
                hasRendering={page.hasRendering}
                isSelected={page.pageId === selectedPageId}
                onClick={() => setSelectedPageId(page.pageId)}
              />
            ))}
            {filteredPages.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No pages match this filter.
              </div>
            )}
          </div>
        </div>

        {/* Preview panel */}
        <div className="flex flex-1 min-w-0 flex-col">
          {selectedPageId ? (
            <PreviewPanel
              label={label}
              pageId={selectedPageId}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={() => hasPrev && setSelectedPageId(filteredPages[selectedIndex - 1].pageId)}
              onNext={() => hasNext && setSelectedPageId(filteredPages[selectedIndex + 1].pageId)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              {totalCount === 0 ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground/50" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">No pages extracted yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Run the pipeline from the{" "}
                      <Link
                        to="/books/$label"
                        params={{ label }}
                        search={{ autoRun: undefined, startPage: undefined, endPage: undefined }}
                        className="underline hover:text-foreground"
                      >
                        book detail page
                      </Link>{" "}
                      to extract pages.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a page to preview.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Settings Sheet */}
      <StoryboardSettingsSheet
        label={label}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onRebuild={handleRebuild}
        isRebuilding={progress.isRunning || runPipeline.isPending}
        pageCount={totalCount}
      />

      {/* Accept Dialog */}
      <AcceptStoryboardDialog
        open={acceptDialogOpen}
        onOpenChange={setAcceptDialogOpen}
        renderedCount={renderedCount}
        totalCount={totalCount}
        label={label}
      />

      {/* Guide Dialog */}
      <StoryboardGuideDialog
        open={guideOpen}
        onOpenChange={(open) => {
          setGuideOpen(open)
          if (!open) dismissGuide()
        }}
      />
    </div>
  )
}

function PreviewPanel({
  label,
  pageId,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  label: string
  pageId: string
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const { data: page, isLoading } = usePage(label, pageId)
  const { apiKey, hasApiKey } = useApiKey()
  const reRender = useReRenderPage(label, pageId)
  const [showAnswers, setShowAnswers] = useState(false)

  const combinedHtml = useMemo(
    () => page?.rendering?.sections.map((s) => s.html).join("\n"),
    [page]
  )

  const sectionCount = page?.rendering?.sections.length ?? 0
  const activityCount = page?.rendering?.sections.filter((s) => isActivitySection(s.sectionType)).length ?? 0
  const hasRenderingData = !!page?.textClassification

  const reRenderTitle = !hasApiKey
    ? "Set your API key first"
    : !hasRenderingData
      ? "Run the pipeline first"
      : reRender.isPending
        ? "Re-rendering..."
        : ""

  return (
    <>
      {/* Preview header */}
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Page {page?.pageNumber ?? "..."}</span>
          {sectionCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {sectionCount} section{sectionCount !== 1 && "s"}
              {activityCount > 0 && ` \u00b7 ${activityCount} activity`}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activityCount > 0 && combinedHtml && (
            <Button
              variant={showAnswers ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowAnswers((v) => !v)}
            >
              {showAnswers ? "Hide Answers" : "Show Answers"}
            </Button>
          )}
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => hasApiKey && reRender.mutate(apiKey)}
            disabled={!hasApiKey || reRender.isPending || !hasRenderingData}
            title={reRenderTitle}
          >
            {reRender.isPending ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3 w-3" />
            )}
            Re-render
          </Button>
          <Link to="/books/$label/pages/$pageId" params={{ label, pageId }}>
            <Button variant="outline" size="sm">
              Edit Page
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Success banner after re-render */}
      {reRender.isSuccess && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-green-50 px-5 py-1.5 text-xs text-green-800">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          Page re-rendered successfully.
          {activityCount > 0 && " Activity answers were also regenerated."}
        </div>
      )}

      {/* Error banner after re-render */}
      {reRender.error && !reRender.isPending && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-5 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          Re-render failed: {reRender.error.message}
        </div>
      )}

      {/* Inline hint */}
      {combinedHtml && !reRender.isSuccess && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-5 py-1.5 text-xs text-muted-foreground">
          <Lightbulb className="h-3 w-3 shrink-0" />
          Edit text and images on the <strong className="font-medium">Edit Page</strong>, or re-render directly from here.
        </div>
      )}

      {/* Preview content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reRender.isPending ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Re-rendering page...</p>
            </div>
          </div>
        ) : combinedHtml && !showAnswers ? (
          <RenderedHtml
            html={combinedHtml}
            className="prose prose-sm max-w-none rounded-lg border bg-white p-6 shadow-sm"
          />
        ) : combinedHtml && showAnswers && page?.rendering ? (
          <div className="space-y-4">
            {page.rendering.sections.map((section, i) => (
              <div key={i}>
                <RenderedHtml
                  html={section.html}
                  className="prose prose-sm max-w-none rounded-lg border bg-white p-6 shadow-sm"
                />
                {isActivitySection(section.sectionType) && section.activityAnswers && Object.keys(section.activityAnswers).length > 0 && (
                  <div className="mt-2">
                    <ActivityAnswerPanel
                      answers={section.activityAnswers}
                      reasoning={section.activityReasoning}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm font-medium">Not yet rendered</p>
            <p className="text-xs text-center max-w-xs">
              Open <strong className="font-medium">Settings → Save & Rebuild</strong> to run the pipeline, or go to the{" "}
              <Link
                to="/books/$label"
                params={{ label }}
                search={{ autoRun: undefined, startPage: undefined, endPage: undefined }}
                className="underline hover:text-foreground"
              >
                book detail page
              </Link>{" "}
              for full pipeline controls.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
