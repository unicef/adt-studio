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
  { key: "book-summary-prompt", label: "Summary Prompt" },
]

const STORYBOARD_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "sectioning-prompt", label: "Sectioning Mode" },
  { key: "rendering-prompt", label: "AI Rendering" },
  { key: "rendering-template", label: "Template Rendering" },
  { key: "activity-prompts", label: "Activity Rendering" },
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

const HOVER_BG_BY_COLOR: Record<string, string> = {
  "bg-gray-500": "hover:bg-gray-500",
  "bg-blue-500": "hover:bg-blue-500",
  "bg-violet-500": "hover:bg-violet-500",
  "bg-orange-500": "hover:bg-orange-500",
  "bg-teal-500": "hover:bg-teal-500",
  "bg-lime-500": "hover:bg-lime-500",
  "bg-pink-500": "hover:bg-pink-500",
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

  // Icon rail: one Link per step, always navigates
  const iconRailSteps = STAGES.map((step) => {
    const isActive = step.slug === activeStep
    const Icon = step.icon
    const stepProgress = stepRunProgress.steps.get(step.slug)
    const ringState = stepProgress?.state ?? "idle"

    return (
      <Link
        key={step.slug}
        to="/books/$label/$step"
        params={{ label: bookLabel, step: step.slug }}
        title={step.label}
        className={cn(
          "flex items-center justify-center py-2 mx-1.5 rounded-md transition-colors",
          isActive ? cn(step.bgLight) : "text-muted-foreground hover:bg-muted/50"
        )}
      >
        <div className="relative shrink-0">
          <div
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-full transition-colors",
              isActive || step.slug === "book" || isStageCompleted(step.slug, completedSteps) || ringState === "done"
                ? cn(step.color, "text-white")
                : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <StepProgressRing size={28} state={ringState} colorClass={step.color} />
        </div>
      </Link>
    )
  })

  return (
    <nav className="flex flex-col h-full">
      {effectivePagesOpen ? (
        // ── Icon rail (56px) + pages panel ───────────────────────────────────
        <div className="flex flex-1 min-h-0 hidden lg:flex group-hover/sidebar:flex">

          {/* Icon rail */}
          <div className="w-14 shrink-0 flex flex-col">
            <div className="flex flex-col py-2 gap-0.5 flex-1 overflow-y-auto">
              {iconRailSteps}
            </div>
            {/* Toggle button — closes the pages panel */}
            <div className="shrink-0 border-t px-1.5 py-2 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setPagesOpen(false)}
                title="Close pages panel"
                className="flex items-center justify-center w-7 h-7 rounded bg-muted text-foreground transition-colors hover:bg-muted/70"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Pages panel */}
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
        </div>

      ) : (
        // ── Full step list with labels ────────────────────────────────────────
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex flex-col py-3 gap-0.5 flex-1">
              {STAGES.map((step, index) => {
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
                      <div className="absolute left-[33px] top-[34px] bottom-[-10px] w-0.5 bg-border hidden lg:block group-hover/sidebar:block" />
                    )}

                    {/* Step row */}
                    <div
                      className={cn(
                        "flex items-center gap-0 lg:gap-2.5 group-hover/sidebar:gap-2.5 px-0 lg:px-3 group-hover/sidebar:px-3 py-2 mx-1 lg:mx-2 group-hover/sidebar:mx-2 rounded-md text-sm transition-colors relative justify-center lg:justify-start group-hover/sidebar:justify-start",
                        isActive
                          ? cn(step.bgLight, step.textColor, "font-medium")
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Link
                        to="/books/$label/$step"
                        params={{ label: bookLabel, step: step.slug }}
                        className="flex items-center gap-2.5 lg:flex-1 group-hover/sidebar:flex-1 min-w-0"
                        title={step.label}
                      >
                        <div className="relative shrink-0">
                          <div
                            className={cn(
                              "flex items-center justify-center w-7 h-7 rounded-full transition-colors",
                              isActive || step.slug === "book" || isStageCompleted(step.slug, completedSteps) || ringState === "done"
                                ? cn(step.color, "text-white")
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <StepProgressRing size={28} state={ringState} colorClass={step.color} />
                        </div>
                        <span className="truncate hidden lg:inline group-hover/sidebar:inline">
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
                            "w-6 h-6 rounded shrink-0 hidden lg:inline-flex group-hover/sidebar:inline-flex [&_svg]:size-3.5",
                            isSettings
                              ? cn(step.color, "text-white hover:text-white", HOVER_BG_BY_COLOR[step.color])
                              : "hover:bg-black/5 text-current opacity-50 hover:opacity-100"
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
                            "w-6 h-6 rounded shrink-0 hidden lg:inline-flex group-hover/sidebar:inline-flex [&_svg]:size-3.5",
                            "hover:bg-black/5 text-current opacity-50 hover:opacity-100"
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
                      <div className="ml-[52px] mr-2 mt-0.5 mb-1 flex-col gap-0.5 hidden lg:flex group-hover/sidebar:flex">
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
              })}
            </div>

            {/* Export + open-pages toggle */}
            <div className="shrink-0 border-t border-border px-3 py-2 hidden lg:flex group-hover/sidebar:flex items-center gap-2">
              {hasPages && (
                <button
                  type="button"
                  onClick={() => setPagesOpen(true)}
                  title="Show pages"
                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <ExportButton bookLabel={bookLabel} />
              </div>
            </div>
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
