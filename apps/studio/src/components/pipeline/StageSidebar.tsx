import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Link, useMatchRoute, useSearch } from "@tanstack/react-router"
import {
  FileDown,
  ChevronDown,
  Loader2,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useStageRun } from "@/hooks/use-stage-run"
import { StepProgressRing } from "./StepProgressRing"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useExportBook } from "@/hooks/use-books"
import {
  STAGES,
  hasStagePages,
  isStageCompleted,
  toCamelLabel,
} from "./stage-config"

const EXTRACT_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "text-types", label: "Text Types" },
  { key: "metadata-prompt", label: "Metadata Prompt" },
  { key: "prompt", label: "Extraction Prompt" },
  { key: "meaningfulness-prompt", label: "Meaningfulness Prompt" },
  { key: "cropping-prompt", label: "Cropping Prompt" },
  { key: "segmentation-prompt", label: "Segmentation Prompt" },
  { key: "book-summary-prompt", label: "Summary Prompt" },
]

const STORYBOARD_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "sectioning-prompt", label: "Sectioning Mode" },
  { key: "rendering-prompt", label: "AI Rendering" },
  { key: "rendering-template", label: "Template Rendering" },
  { key: "activity-prompts", label: "Activity Rendering" },
  { key: "image-generation", label: "Image Generation" },
]

const QUIZ_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "prompt", label: "Quiz Prompt" },
]

const GLOSSARY_SETTINGS_TABS = [
  { key: "general", label: "Glossary Prompt" },
]

const CAPTIONS_SETTINGS_TABS = [
  { key: "general", label: "Caption Prompt" },
]

const TRANSLATIONS_SETTINGS_TABS = [
  { key: "general", label: "Languages" },
  { key: "prompt", label: "Translation Prompt" },
  { key: "speech", label: "Speech" },
  { key: "speech-prompts", label: "Speech Prompts" },
  { key: "voices", label: "Voices" },
]

const SETTINGS_TABS: Record<string, { key: string; label: string }[]> = {
  extract: EXTRACT_SETTINGS_TABS,
  storyboard: STORYBOARD_SETTINGS_TABS,
  quizzes: QUIZ_SETTINGS_TABS,
  glossary: GLOSSARY_SETTINGS_TABS,
  captions: CAPTIONS_SETTINGS_TABS,
  "text-and-speech": TRANSLATIONS_SETTINGS_TABS,
}

export function StageSidebar({
  bookLabel,
  activeStep,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  activeStep: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const matchRoute = useMatchRoute()
  const search = useSearch({ strict: false }) as { tab?: string }
  const { progress: stepRunProgress } = useStageRun()
  const { data: stepStatusData } = useQuery({
    queryKey: ["books", bookLabel, "step-status"],
    queryFn: () => api.getStepStatus(bookLabel),
    enabled: !!bookLabel,
  })
  const completedSteps = stepStatusData?.steps ?? {}

  const effectivePagesOpen = hasStagePages(activeStep) && isStageCompleted(activeStep, completedSteps)

  const isSettings = !!matchRoute({
    to: "/books/$label/$step/settings",
    params: { label: bookLabel, step: activeStep },
  })
  const activeTab = search.tab ?? "general"

  // The rail collapses (icon-only, hover to expand) only when pages are showing
  // and we're not in settings. Otherwise it's always expanded with labels visible.
  const railCollapsed = effectivePagesOpen && !isSettings
  // When the rail is collapsed, labels/buttons are always in the DOM but clipped
  // by overflow-hidden on the inner panel. This avoids display toggling which
  // would flash before the width transition completes.
  const x = {
    gap:       "gap-2.5",
    showLabel: "inline",
    showBtn:   "inline-flex",
    showFlex:  "flex",
    flex1:     "flex-1",
  }

  const stageItems = STAGES.map((step, index) => {
    const isActive = step.slug === activeStep
    const Icon = step.icon
    const settingsTabs = SETTINGS_TABS[step.slug]
    const showSubTabs = isActive && isSettings && !!settingsTabs
    const stepProgress = stepRunProgress.steps.get(step.slug)
    const rawRingState = stepProgress?.state ?? "idle"
    const stageCompleted = isStageCompleted(step.slug, completedSteps)
    // DB says complete → stop the spinner, same logic as BookView
    const ringState = stageCompleted && (rawRingState === "running" || rawRingState === "queued") ? "idle" : rawRingState

    return (
      <div key={step.slug} className="relative">
        {/* Connector line */}
        {index < STAGES.length - 1 && (
          <div className="absolute left-[24px] top-[36px] bottom-[-10px] w-0.5 bg-border z-10" />
        )}

        {/* Step row */}
        <div
          className={cn(
            "flex items-center gap-0 py-2 text-sm transition-colors",
            x.gap,
            "justify-start mx-0 px-0",
            isActive
              ? cn(step.color, "text-white font-medium rounded-l-[14px] ml-0.5 pl-2")
              : "text-muted-foreground hover:text-foreground hover:bg-muted px-2.5"
          )}
        >
          <Link
            to="/books/$label/$step"
            params={{ label: bookLabel, step: step.slug }}
            className={cn("flex items-center gap-2.5 min-w-0", x.flex1)}
            title={step.label}
          >
            <div className="relative shrink-0">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full transition-colors",
                  step.slug === "book" || stageCompleted
                    ? isActive
                      ? "bg-white/20 text-white"
                      : cn(step.color, "text-white")
                    : "bg-muted text-muted-foreground ring-1 ring-border"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <StepProgressRing size={28} state={ringState} colorClass={isActive ? "bg-white" : step.color} />
            </div>
            <span className={cn("truncate hidden", x.showLabel)}>
              {step.slug === "book" ? toCamelLabel(bookLabel) : step.label}
            </span>
          </Link>

        </div>

        {/* Settings sub-tabs */}
        {showSubTabs && (
          <div className={cn("ml-[42px] mr-2 mt-0.5 mb-1 flex-col gap-0.5 hidden", x.showFlex)}>
            {settingsTabs!.map((tab) => (
              <Button
                key={tab.key}
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  "h-auto justify-start rounded text-xs px-2 py-1 whitespace-nowrap",
                  activeTab === tab.key
                    ? cn(step.textColor, "font-medium", step.bgLight)
                    : "font-normal text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Link
                  to="/books/$label/$step/settings"
                  params={{ label: bookLabel, step: step.slug }}
                  search={{ tab: tab.key }}
                >
                  {tab.label}
                </Link>
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  })

  return (
    <nav className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 min-h-0">
        {/* Stage rail */}
        <div className={cn(
          "shrink-0 relative group/rail",
          railCollapsed ? "w-12" : "flex-1"
        )}>
          <div className={cn(
            "absolute inset-y-0 left-0 flex flex-col bg-background overflow-hidden",
            railCollapsed
              ? "w-12 group-hover/rail:w-[220px] z-20 transition-[width] duration-150 delay-150 group-hover/rail:delay-100 group-hover/rail:shadow-lg"
              : "inset-x-0"
          )}>
            <div className="flex flex-col pt-1.5 pb-2 gap-0.5 flex-1 overflow-y-auto overflow-x-hidden">
              {stageItems}
            </div>
            {/* Right edge — follows the expanding rail */}
            <div className="absolute inset-y-0 right-0 w-px border-r" />
          </div>
        </div>

        {/* Pages panel — only when pages are open and not in settings */}
        {effectivePagesOpen && !isSettings && (
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l">
            <div className="flex-1 overflow-y-auto">
              <PageIndex
                bookLabel={bookLabel}
                activeStep={activeStep}
                selectedPageId={selectedPageId}
                onSelectPage={onSelectPage}
              />
            </div>
          </div>
        )}
      </div>

      {/* Export button — fixed at the bottom, outside the expanding rail */}
      <div className="shrink-0 border-t py-2 px-1.5">
        <ExportButton bookLabel={bookLabel} />
      </div>
    </nav>
  )
}

/* ---------- PageIndex ---------- */

function PageIndex({
  bookLabel,
  activeStep,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  activeStep: string
  selectedPageId?: string
  onSelectPage?: (pageId: string) => void
}) {
  const { data: pages } = usePages(bookLabel)
  const activeStepDef = STAGES.find((s) => s.slug === activeStep)

  if (!pages?.length) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
        No pages extracted yet
      </div>
    )
  }

  return (
    <div className="flex flex-col py-1">
      {pages.map((page) => {
        const isActive = page.pageId === selectedPageId
        return (
          <PageRow
            key={page.pageId}
            bookLabel={bookLabel}
            page={page}
            isActive={isActive}
            activeStepDef={activeStepDef}
            onSelect={() => onSelectPage?.(page.pageId)}
          />
        )
      })}
    </div>
  )
}

/* ---------- PageRow ---------- */

function PageRow({
  bookLabel,
  page,
  isActive,
  activeStepDef,
  onSelect,
}: {
  bookLabel: string
  page: { pageId: string; textPreview: string; pageNumber: number }
  isActive: boolean
  activeStepDef?: (typeof STAGES)[number]
  onSelect: () => void
}) {
  const { data, isLoading } = usePageImage(bookLabel, page.pageId)
  const [showPreview, setShowPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState({ top: 0, left: 0 })
  const rowRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!rowRef.current) return
      const rect = rowRef.current.getBoundingClientRect()
      const previewH = 400
      const previewW = 300
      const gap = 20
      const margin = 8
      const top = Math.max(margin, Math.min(rect.top, window.innerHeight - previewH - margin))
      const rightEdge = window.innerWidth - margin
      const rightSideLeft = rect.right + gap
      const leftSideLeft = rect.left - previewW - gap
      const unclampedLeft =
        rightSideLeft + previewW <= rightEdge
          ? rightSideLeft
          : leftSideLeft
      const left = Math.max(margin, Math.min(unclampedLeft, rightEdge - previewW))
      setPreviewPos({ top, left })
      setShowPreview(true)
    }, 600)
  }, [])

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setShowPreview(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const imgSrc = data?.imageBase64 ? `data:image/png;base64,${data.imageBase64}` : null

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2 px-2 py-1.5 text-left transition-colors",
        isActive
          ? cn(activeStepDef?.bgLight ?? "bg-violet-50", activeStepDef?.textColor ?? "text-violet-600", "font-medium")
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      {isLoading || !imgSrc ? (
        <div className="shrink-0 w-16 h-12 bg-muted rounded ring-1 ring-border" />
      ) : (
        <img
          src={imgSrc}
          alt=""
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          className="shrink-0 w-16 h-12 rounded object-cover object-center ring-1 ring-border"
        />
      )}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1 pt-0.5">
        <span className="text-[11px] leading-snug line-clamp-2">
          {page.textPreview || "Untitled"}
        </span>
        <span className="text-[9px] font-mono opacity-50 leading-none">
          pg {page.pageNumber}
        </span>
      </div>
      {showPreview && imgSrc && createPortal(
        <div
          className="fixed z-50 pointer-events-none animate-in fade-in duration-150"
          style={{ top: previewPos.top, left: previewPos.left }}
        >
          <img
            src={imgSrc}
            alt=""
            className="h-[400px] w-auto rounded-lg shadow-xl ring-1 ring-border"
          />
        </div>,
        document.body
      )}
    </button>
  )
}

/* ---------- ExportButton ---------- */

function ExportButton({ bookLabel }: { bookLabel: string }) {
  const exportBook = useExportBook()
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [exportOpen])

  const handleExport = (format: "web" | "epub") => {
    setExportOpen(false)
    exportBook.mutate({ label: bookLabel, format })
  }

  return (
    <div className="relative" ref={exportRef}>
      <Button
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100"
        onClick={() => setExportOpen(!exportOpen)}
        disabled={exportBook.isPending}
      >
        {exportBook.isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileDown className="mr-1.5 h-3.5 w-3.5" />
        )}
        Export
        <ChevronDown className="ml-1 h-3 w-3" />
      </Button>
      {exportOpen && (
        <div className="absolute left-0 bottom-full z-50 mb-1 w-full rounded-md border bg-popover py-1 shadow-md">
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            onClick={() => handleExport("web")}
          >
            ADT Web (.zip)
          </button>
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            onClick={() => handleExport("epub")}
          >
            EPUB (.epub)
          </button>
        </div>
      )}
    </div>
  )
}
