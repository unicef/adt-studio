import { useState, useEffect, useRef } from "react"
import { Link, useMatchRoute, useSearch } from "@tanstack/react-router"
import {
  Settings,
  RotateCcw,
  FileDown,
  ChevronDown,
  PanelLeftOpen,
  Loader2,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useStepRun } from "@/hooks/use-step-run"
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
  const { progress: stepRunProgress } = useStepRun()
  const { data: stepStatusData } = useQuery({
    queryKey: ["books", bookLabel, "step-status"],
    queryFn: () => api.getStepStatus(bookLabel),
    enabled: !!bookLabel,
  })
  const completedSteps = stepStatusData?.steps ?? {}

  const hasPages = hasStagePages(activeStep)
  const [pagesOpen, setPagesOpen] = useState(true)
  const effectivePagesOpen = hasPages && pagesOpen

  const isSettings = !!matchRoute({
    to: "/books/$label/$step/settings",
    params: { label: bookLabel, step: activeStep },
  })
  const activeTab = search.tab ?? "general"

  // The rail collapses (icon-only, hover to expand) only when pages are showing
  // and we're not in settings. Otherwise it's always expanded with labels visible.
  const railCollapsed = effectivePagesOpen && !isSettings
  const alwaysExpanded = !railCollapsed
  const x = {
    gap:       cn("group-hover/rail:gap-2.5",       alwaysExpanded && "gap-2.5"),
    showLabel: cn("group-hover/rail:inline",     alwaysExpanded && "inline"),
    showBtn:   cn("group-hover/rail:inline-flex", alwaysExpanded && "inline-flex"),
    showFlex:  cn("group-hover/rail:flex",        alwaysExpanded && "flex"),
    flex1:     cn("group-hover/rail:flex-1",      alwaysExpanded && "flex-1"),
  }

  const stageItems = STAGES.map((step, index) => {
    const isActive = step.slug === activeStep
    const Icon = step.icon
    const settingsTabs = SETTINGS_TABS[step.slug]
    const showSubTabs = isActive && isSettings && !!settingsTabs
    const stepProgress = stepRunProgress.steps.get(step.slug)
    const ringState = stepProgress?.state ?? "idle"

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
                  step.slug === "book" || isStageCompleted(step.slug, completedSteps) || ringState === "done"
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

          {/* Settings gear */}
          {isActive && step.slug !== "book" && step.slug !== "preview" && (
            <Button
              variant="ghost"
              size="icon"
              asChild
              className={cn(
                "w-6 h-6 rounded shrink-0 hidden [&_svg]:size-3.5",
                x.showBtn,
                isSettings
                  ? "bg-white/20 text-white hover:text-white hover:bg-white/30"
                  : "hover:bg-white/10 text-white/60 hover:text-white"
              )}
            >
              <Link
                to="/books/$label/$step/settings"
                params={{ label: bookLabel, step: step.slug }}
                search={{ tab: "general" }}
                title={`${step.label} settings`}
              >
                <Settings className="w-3.5 h-3.5" />
              </Link>
            </Button>
          )}
          {isActive && step.slug === "preview" && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-6 h-6 rounded shrink-0 hidden [&_svg]:size-3.5",
                x.showBtn,
                "hover:bg-white/10 text-white/60 hover:text-white"
              )}
              onClick={() => window.dispatchEvent(new CustomEvent("adt:repackage"))}
              title="Re-package ADT"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
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
    <nav className="flex flex-1 min-h-0">
      {/* Stage rail — always the same DOM structure, group/rail always present */}
      <div className={cn(
        "shrink-0 relative group/rail",
        railCollapsed ? "w-12" : "flex-1"
      )}>
        <div className={cn(
          "absolute inset-y-0 left-0 flex flex-col bg-background overflow-hidden",
          railCollapsed
            ? "w-12 group-hover/rail:w-[220px] z-20 transition-[width] duration-150 group-hover/rail:shadow-lg"
            : "inset-x-0"
        )}>
          <div className="flex flex-col pt-1.5 pb-2 gap-0.5 flex-1 overflow-y-auto">
            {stageItems}
          </div>
          <div className="shrink-0 border-t py-2 px-1.5 flex items-center justify-center gap-2">
            {hasPages && (
              <button
                type="button"
                onClick={() => setPagesOpen(!pagesOpen)}
                title={effectivePagesOpen ? "Close pages panel" : "Show pages"}
                className="flex items-center justify-center w-7 h-7 rounded bg-muted text-foreground transition-colors hover:bg-muted/70"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
              </button>
            )}
            {!railCollapsed && (
              <div className="flex-1 min-w-0">
                <ExportButton bookLabel={bookLabel} />
              </div>
            )}
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
          <div className="shrink-0 border-t px-3 py-2">
            <ExportButton bookLabel={bookLabel} />
          </div>
        </div>
      )}
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
          <button
            key={page.pageId}
            type="button"
            onClick={() => onSelectPage?.(page.pageId)}
            className={cn(
              "flex items-start gap-2 px-2 py-1.5 text-left transition-colors",
              isActive
                ? cn(activeStepDef?.bgLight ?? "bg-violet-50", activeStepDef?.textColor ?? "text-violet-600", "font-medium")
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <PageThumbnailPortrait bookLabel={bookLabel} pageId={page.pageId} />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1 pt-0.5">
              <span className="text-[11px] leading-snug line-clamp-2">
                {page.textPreview || "Untitled"}
              </span>
              <span className="text-[9px] font-mono opacity-50 leading-none mt-0.5">
                pg {page.pageNumber}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- PageThumbnailPortrait ---------- */

function PageThumbnailPortrait({ bookLabel, pageId }: { bookLabel: string; pageId: string }) {
  const { data, isLoading } = usePageImage(bookLabel, pageId)

  if (isLoading || !data?.imageBase64) {
    return <div className="shrink-0 w-9 h-12 bg-muted rounded" />
  }

  return (
    <img
      src={`data:image/png;base64,${data.imageBase64}`}
      alt=""
      className="shrink-0 w-9 h-12 rounded object-cover object-top"
    />
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
