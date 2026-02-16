import { createFileRoute, Link } from "@tanstack/react-router"
import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import {
  Check,
  Clock,
  CheckCircle2,
  Loader2,
  Settings2,
  AlertCircle,
  HelpCircle,
  BookOpen,
  FileDown,
  PanelLeftClose,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useBook, useExportBook } from "@/hooks/use-books"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { usePipelineSSE, usePipelineStatus, useRunPipeline } from "@/hooks/use-pipeline"
import { useApiKey } from "@/hooks/use-api-key"
import { STEP_LABELS } from "@/components/pipeline/StepIndicator"
import { StoryboardSettingsSheet } from "@/components/storyboard/StoryboardSettingsSheet"
import { AcceptStoryboardDialog } from "@/components/storyboard/AcceptStoryboardDialog"
import { StoryboardGuideDialog } from "@/components/storyboard/StoryboardGuideDialog"
import { PageEditPanel } from "@/components/storyboard/PageEditPanel"
import { UnsavedChangesDialog } from "@/components/storyboard/UnsavedChangesDialog"
import { useGuideDismissed } from "@/hooks/use-guide-dismissed"
import type { PageEditPanelHandle } from "@/components/storyboard/PageEditPanel"
import type { StepName } from "@/hooks/use-pipeline"

export const Route = createFileRoute("/books/$label/storyboard")({
  component: StoryboardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
})

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false)
  const [guideDismissed, dismissGuide] = useGuideDismissed("storyboard")
  const [guideOpen, setGuideOpen] = useState(!guideDismissed)
  const [showOriginalImage, setShowOriginalImage] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  // Unsaved changes dialog state
  const [pendingPageSwitch, setPendingPageSwitch] = useState<string | null>(null)

  const editPanelRef = useRef<PageEditPanelHandle>(null)

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

  const allPages = useMemo(() => pages ?? [], [pages])

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
    if (allPages.length === 0) {
      setSelectedPageId(null)
      return
    }

    // Use search param page on first load
    if (initialPageId && !initialPageConsumed.current) {
      const found = allPages.some((p) => p.pageId === initialPageId)
      if (found) {
        setSelectedPageId(initialPageId)
        initialPageConsumed.current = true
        return
      }
    }

    const currentStillVisible = selectedPageId && allPages.some((p) => p.pageId === selectedPageId)
    if (!currentStillVisible) {
      setSelectedPageId(allPages[0].pageId)
    }
  }, [allPages, selectedPageId, initialPageId])

  // Guard page switching with unsaved-changes check
  const requestPageSwitch = useCallback(
    (targetPageId: string) => {
      if (targetPageId === selectedPageId) return
      if (editPanelRef.current?.hasChanges) {
        setPendingPageSwitch(targetPageId)
      } else {
        setSelectedPageId(targetPageId)
      }
    },
    [selectedPageId]
  )

  const handleSaveAndSwitch = useCallback(async () => {
    if (editPanelRef.current && pendingPageSwitch) {
      await editPanelRef.current.save()
      setSelectedPageId(pendingPageSwitch)
      setPendingPageSwitch(null)
    }
  }, [pendingPageSwitch])

  const handleDiscardAndSwitch = useCallback(() => {
    if (editPanelRef.current && pendingPageSwitch) {
      editPanelRef.current.discard()
      setSelectedPageId(pendingPageSwitch)
      setPendingPageSwitch(null)
    }
  }, [pendingPageSwitch])

  const handleCancelSwitch = useCallback(() => {
    setPendingPageSwitch(null)
  }, [])

  // Keyboard navigation with unsaved-changes guard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if ((e.target as HTMLElement)?.isContentEditable) return

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        const idx = allPages.findIndex((p) => p.pageId === selectedPageId)
        if (idx > 0) requestPageSwitch(allPages[idx - 1].pageId)
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        const idx = allPages.findIndex((p) => p.pageId === selectedPageId)
        if (idx < allPages.length - 1) requestPageSwitch(allPages[idx + 1].pageId)
      }
    },
    [allPages, selectedPageId, requestPageSwitch]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Current step label for rebuild banner
  const currentStepLabel = progress.currentStep
    ? STEP_LABELS[progress.currentStep as StepName] ?? progress.currentStep
    : null

  // Find selected page's number
  const selectedPage = allPages.find((p) => p.pageId === selectedPageId)
  const selectedPageNumber = selectedPage?.pageNumber ?? 0

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

      {/* Main layout: Sidebar + Edit Panel */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — fully collapsible */}
        {sidebarExpanded && (
          <div className="flex w-[272px] shrink-0 flex-col border-r">
            {/* Sidebar header with progress + collapse */}
            <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{renderedCount}/{totalCount}</span>
                  <span>{totalCount > 0 ? Math.round((renderedCount / totalCount) * 100) : 0}%</span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted">
                  <div
                    className="h-1 rounded-full bg-green-600 transition-all"
                    style={{ width: totalCount > 0 ? `${(renderedCount / totalCount) * 100}%` : "0%" }}
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setSidebarExpanded(false)}
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>

            {/* Page list */}
            <div className="flex-1 overflow-y-auto">
              {allPages.map((page) => (
                <MiniPageCard
                  key={page.pageId}
                  label={label}
                  pageId={page.pageId}
                  pageNumber={page.pageNumber}
                  textPreview={page.textPreview}
                  hasRendering={page.hasRendering}
                  isSelected={page.pageId === selectedPageId}
                  onClick={() => requestPageSwitch(page.pageId)}
                />
              ))}
              {allPages.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No pages match this filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit panel */}
        <div className="flex flex-1 min-w-0 flex-col">
          {selectedPageId ? (
            <PageEditPanel
              key={selectedPageId}
              ref={editPanelRef}
              label={label}
              pageId={selectedPageId}
              pageNumber={selectedPageNumber}
              showOriginalImage={showOriginalImage}
              onToggleOriginalImage={() => setShowOriginalImage((v) => !v)}
              sidebarVisible={sidebarExpanded}
              onExpandSidebar={() => setSidebarExpanded(true)}
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
                <p className="text-sm text-muted-foreground">Select a page to edit.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        open={!!pendingPageSwitch}
        changedEntities={editPanelRef.current?.changedEntities ?? []}
        isSaving={false}
        onSaveAndContinue={handleSaveAndSwitch}
        onDiscard={handleDiscardAndSwitch}
        onCancel={handleCancelSwitch}
      />

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
