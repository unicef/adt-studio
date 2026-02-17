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
  ChevronDown,
  PanelLeftClose,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBook, useExportBook } from "@/hooks/use-books"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { usePipelineSSE, usePipelineStatus, useRunPipeline } from "@/hooks/use-pipeline"
import { useRunProof, useProofSSE, useProofStatus } from "@/hooks/use-proof"
import { useRunMaster, useMasterSSE, useMasterStatus } from "@/hooks/use-master"
import { useApiKey } from "@/hooks/use-api-key"
import { STEP_LABELS } from "@/components/pipeline/StepIndicator"
import { PhaseTrack } from "@/components/storyboard/PhaseTrack"
import type { PhaseStatus } from "@/components/storyboard/PhaseTrack"
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

function ExportDropdown({
  isPending,
  onExport,
}: {
  isPending: boolean
  onExport: (format: "web" | "epub") => void
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  const handleSelect = (format: "web" | "epub") => {
    setOpen(false)
    onExport(format)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="mr-1.5 h-4 w-4" />
        )}
        Export
        <ChevronDown className="ml-1 h-3 w-3" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border bg-popover py-1 shadow-md">
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            onClick={() => handleSelect("web")}
          >
            ADT Web (.zip)
          </button>
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            onClick={() => handleSelect("epub")}
          >
            EPUB (.epub)
          </button>
        </div>
      )}
    </div>
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

  // Proof hooks
  const runProof = useRunProof()
  const [proofSseEnabled, setProofSseEnabled] = useState(false)
  const { progress: proofProgress, reset: proofReset } = useProofSSE(label, proofSseEnabled)
  const { data: proofStatusData } = useProofStatus(label)

  // Master hooks
  const runMaster = useRunMaster()
  const [masterSseEnabled, setMasterSseEnabled] = useState(false)
  const { progress: masterProgress, reset: masterReset } = useMasterSSE(label, masterSseEnabled)
  const { data: masterStatusData } = useMasterStatus(label)

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

  // Auto-reconnect to SSE if proof is already running
  useEffect(() => {
    if (proofStatusData?.status === "running" && !proofSseEnabled) {
      setProofSseEnabled(true)
    }
  }, [proofStatusData?.status, proofSseEnabled])

  // Auto-reconnect to SSE if master is already running
  useEffect(() => {
    if (masterStatusData?.status === "running" && !masterSseEnabled) {
      setMasterSseEnabled(true)
    }
  }, [masterStatusData?.status, masterSseEnabled])

  const handleRunProof = useCallback(() => {
    if (!hasApiKey) return
    proofReset()
    setProofSseEnabled(true)
    runProof.mutate(
      { label, apiKey },
      {
        onError: () => setProofSseEnabled(false),
      }
    )
  }, [label, apiKey, hasApiKey, proofReset, runProof])

  const handleRunMaster = useCallback(() => {
    if (!hasApiKey) return
    masterReset()
    setMasterSseEnabled(true)
    runMaster.mutate(
      { label, apiKey },
      {
        onError: () => setMasterSseEnabled(false),
      }
    )
  }, [label, apiKey, hasApiKey, masterReset, runMaster])

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

  // Phase status computations
  const storyboardPhase: PhaseStatus = isAccepted ? "completed" : "active"
  const proofPhase: PhaseStatus = proofProgress.isRunning
    ? "running"
    : proofProgress.error
      ? "error"
      : (book?.proofCompleted || proofProgress.isComplete)
        ? "completed"
        : isAccepted
          ? "active"
          : "pending"
  const masterPhase: PhaseStatus = masterProgress.isRunning
    ? "running"
    : masterProgress.error
      ? "error"
      : masterProgress.isComplete
        ? "completed"
        : (book?.proofCompleted || proofProgress.isComplete)
          ? "active"
          : "pending"

  const canRunProof = isAccepted && hasApiKey && !proofProgress.isRunning
  const canRunMaster =
    (book?.proofCompleted || proofProgress.isComplete) &&
    hasApiKey &&
    !masterProgress.isRunning

  // Step labels for proof/master progress
  const proofStepLabel = proofProgress.currentStep
    ? STEP_LABELS[proofProgress.currentStep as StepName] ?? proofProgress.currentStep
    : null
  const masterStepLabel = masterProgress.currentStep
    ? STEP_LABELS[masterProgress.currentStep as StepName] ?? masterProgress.currentStep
    : null

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

  // Current step label for pipeline banner
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
          <span className="text-sm font-semibold shrink-0">Storyboard</span>
        </div>
        <PhaseTrack
          storyboardStatus={storyboardPhase}
          proofStatus={proofPhase}
          masterStatus={masterPhase}
          onAcceptStoryboard={() => setAcceptDialogOpen(true)}
          onRunProof={handleRunProof}
          onRunMaster={handleRunMaster}
          canAccept={canAccept}
          canRunProof={canRunProof}
          canRunMaster={!!canRunMaster}
          pendingCount={pendingCount}
        />
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
          {isAccepted && (
            <ExportDropdown
              isPending={exportBook.isPending}
              onExport={(format) => exportBook.mutate({ label, format })}
            />
          )}
        </div>
      </div>

      {/* Pipeline progress banner */}
      {progress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-4 py-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span className="flex-1">
            Building storyboard{currentStepLabel ? ` \u2014 ${currentStepLabel}` : ""}...
          </span>
        </div>
      )}
      {progress.error && !progress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Build failed: {progress.error}</span>
        </div>
      )}

      {/* Proof progress banner */}
      {proofProgress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-4 py-1.5 text-xs text-primary">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span className="flex-1">
            Running proof{proofStepLabel ? ` \u2014 ${proofStepLabel}` : ""}...
          </span>
        </div>
      )}
      {proofProgress.error && !proofProgress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="flex-1">Proof failed: {proofProgress.error}</span>
        </div>
      )}
      {proofProgress.isComplete && !proofProgress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-green-50 px-4 py-1.5 text-xs text-green-700">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span className="flex-1">Proof complete</span>
        </div>
      )}

      {/* Master progress banner */}
      {masterProgress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-4 py-1.5 text-xs text-primary">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span className="flex-1">
            Running master{masterStepLabel ? ` \u2014 ${masterStepLabel}` : ""}...
          </span>
        </div>
      )}
      {masterProgress.error && !masterProgress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="flex-1">Master failed: {masterProgress.error}</span>
        </div>
      )}
      {masterProgress.isComplete && !masterProgress.isRunning && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-green-50 px-4 py-1.5 text-xs text-green-700">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span className="flex-1">Master complete</span>
        </div>
      )}

      {/* Main layout: Sidebar + Edit Panel */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — fully collapsible */}
        {sidebarExpanded && (
          <div className="flex w-[272px] shrink-0 flex-col border-r">
            {/* Sidebar header */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b bg-muted/30 px-3">
              <span className="text-xs font-medium text-muted-foreground">Pages</span>
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

            {/* Page list + Quiz panel */}
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
              onCollapseSidebar={() => setSidebarExpanded(false)}
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
