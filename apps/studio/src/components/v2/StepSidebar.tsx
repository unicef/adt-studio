import { useState, useEffect, useRef } from "react"
import { Link, useMatchRoute, useSearch } from "@tanstack/react-router"
import {
  BookMarked,
  FileText,
  LayoutGrid,
  HelpCircle,
  Image,
  BookOpen,
  Languages,
  Eye,
  Settings,
  RotateCcw,
  FileDown,
  ChevronDown,
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

export const STEPS = [
  { slug: "book", label: "Book", runningLabel: "Loading Book", icon: BookMarked, color: "bg-gray-500", textColor: "text-gray-600", bgLight: "bg-gray-50", bgDark: "bg-gray-700", borderColor: "border-gray-200" },
  { slug: "extract", label: "Extract", runningLabel: "Extracting", icon: FileText, color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-50", bgDark: "bg-blue-700", borderColor: "border-blue-200" },
  { slug: "storyboard", label: "Storyboard", runningLabel: "Building Storyboard", icon: LayoutGrid, color: "bg-violet-500", textColor: "text-violet-600", bgLight: "bg-violet-50", bgDark: "bg-violet-700", borderColor: "border-violet-200" },
  { slug: "quizzes", label: "Quizzes", runningLabel: "Generating Quizzes", icon: HelpCircle, color: "bg-orange-500", textColor: "text-orange-600", bgLight: "bg-orange-50", bgDark: "bg-orange-700", borderColor: "border-orange-200" },
  { slug: "captions", label: "Captions", runningLabel: "Captioning Images", icon: Image, color: "bg-teal-500", textColor: "text-teal-600", bgLight: "bg-teal-50", bgDark: "bg-teal-700", borderColor: "border-teal-200" },
  { slug: "glossary", label: "Glossary", runningLabel: "Generating Glossary", icon: BookOpen, color: "bg-lime-500", textColor: "text-lime-600", bgLight: "bg-lime-50", bgDark: "bg-lime-700", borderColor: "border-lime-200" },
  { slug: "translations", label: "Translate", runningLabel: "Translating", icon: Languages, color: "bg-pink-500", textColor: "text-pink-600", bgLight: "bg-pink-50", bgDark: "bg-pink-700", borderColor: "border-pink-200" },
  { slug: "preview", label: "Preview", runningLabel: "Building Preview", icon: Eye, color: "bg-gray-500", textColor: "text-gray-600", bgLight: "bg-gray-50", bgDark: "bg-gray-700", borderColor: "border-gray-200" },
] as const

export type StepSlug = (typeof STEPS)[number]["slug"]

export const STEP_DESCRIPTIONS: Record<string, string> = {
  extract: "Extract text and images from each page of the PDF using AI-powered analysis.",
  storyboard: "Arrange extracted content into a structured storyboard with pages, sections, and layouts.",
  quizzes: "Generate comprehension quizzes and activities based on the book content.",
  captions: "Create descriptive captions for images to improve accessibility.",
  glossary: "Build a glossary of key terms and definitions found in the text.",
  translations: "Translate the book content and generate audio narration.",
  preview: "Package and preview the final ADT web application.",
}

export function toCamelLabel(label: string): string {
  return label.split(/[-_]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("")
}

const EXTRACT_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "text-types", label: "Text Types" },
  { key: "metadata-prompt", label: "Metadata Prompt" },
  { key: "prompt", label: "Extraction Prompt" },
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
]

const SETTINGS_TABS: Record<string, { key: string; label: string }[]> = {
  extract: EXTRACT_SETTINGS_TABS,
  storyboard: STORYBOARD_SETTINGS_TABS,
  quizzes: QUIZ_SETTINGS_TABS,
  glossary: GLOSSARY_SETTINGS_TABS,
  captions: CAPTIONS_SETTINGS_TABS,
  translations: TRANSLATIONS_SETTINGS_TABS,
}

/** Translations step is "complete" only when both translations AND TTS are done. */
export function isStepCompleted(slug: string, completedSteps: Record<string, boolean>): boolean {
  if (slug === "translations") return !!completedSteps["translations"] && !!completedSteps["text-to-speech"]
  return !!completedSteps[slug]
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


/** Steps that support per-page filtering in the Pages tab */
const STEPS_WITH_PAGES = new Set(["storyboard", "quizzes", "captions", "translations"])

export function StepSidebar({
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
  const [mode, setMode] = useState<"steps" | "pages">("steps")
  const hasPages = STEPS_WITH_PAGES.has(activeStep)
  // Force steps when active step doesn't support pages (no useEffect — avoids 1-frame flicker)
  const effectiveMode = hasPages ? mode : "steps"

  const handleSwitchToSteps = () => {
    setMode("steps")
    if (selectedPageId) onSelectPage?.(null)
  }

  const isSettings = !!matchRoute({
    to: "/books/$label/v2/$step/settings",
    params: { label: bookLabel, step: activeStep },
  })

  const activeTab = search.tab ?? "general"

  return (
    <nav className="flex flex-col h-full">
      {/* Toggle tabs — only visible when sidebar is expanded and step supports pages */}
      {hasPages && (
        <div className="hidden lg:flex group-hover/sidebar:flex border-b border-border mx-2 mt-2 mb-1">
          <button
            onClick={handleSwitchToSteps}
            className={cn(
              "flex-1 text-xs py-1.5 font-medium transition-colors border-b-2",
              effectiveMode === "steps"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Steps
          </button>
          <button
            onClick={() => setMode("pages")}
            className={cn(
              "flex-1 text-xs py-1.5 font-medium transition-colors border-b-2",
              effectiveMode === "pages"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Pages
          </button>
        </div>
      )}

      {/* Main area */}
      <div className={cn(
        "flex-1 min-h-0",
        effectiveMode === "pages" ? "flex flex-col" : ""
      )}>
        {/* Steps list: always visible on collapsed sidebar; on expanded only in steps mode */}
        <div className={cn(
          effectiveMode === "steps" ? "flex-1 overflow-y-auto flex flex-col" : "",
          effectiveMode === "pages" && "lg:hidden group-hover/sidebar:hidden"
        )}>
        <div className="flex flex-col py-3 gap-0.5 flex-1">
      {STEPS.map((step, index) => {
        const isActive = step.slug === activeStep
        const Icon = step.icon
        const settingsTabs = SETTINGS_TABS[step.slug]
        const showSubTabs = isActive && isSettings && !!settingsTabs

        // Step progress state
        const stepProgress = stepRunProgress.steps.get(step.slug)
        const ringState = stepProgress?.state ?? "idle"

        return (
          <div key={step.slug} className="relative">
            {/* Connector line */}
            {index < STEPS.length - 1 && (
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
                to="/books/$label/v2/$step"
                params={{ label: bookLabel, step: step.slug }}
                className="flex items-center gap-2.5 lg:flex-1 group-hover/sidebar:flex-1 min-w-0"
                title={step.label}
              >
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-full transition-colors",
                      isActive || step.slug === "book" || isStepCompleted(step.slug, completedSteps) || ringState === "done"
                        ? cn(step.color, "text-white")
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <StepProgressRing
                    size={28}
                    state={ringState}
                    colorClass={step.color}
                  />
                </div>
                <span className="truncate hidden lg:inline group-hover/sidebar:inline">
                  {step.slug === "book" ? toCamelLabel(bookLabel) : step.label}
                </span>
              </Link>

              {/* Action button (only for active step, not for book) */}
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
                    to="/books/$label/v2/$step/settings"
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

            {/* Settings sub-tabs (extract only, when settings active) */}
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
                      to="/books/$label/v2/$step/settings"
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
        {/* Export button in steps pane — only when expanded */}
        {effectiveMode === "steps" && (
          <div className="shrink-0 border-t border-border px-3 py-2 hidden lg:block group-hover/sidebar:block">
            <ExportButton bookLabel={bookLabel} />
          </div>
        )}
        </div>

        {/* Page index (~75%) + compact step list (~25%) — only when expanded in pages mode */}
        {effectiveMode === "pages" && (
          <>
            <div className="flex-[3] overflow-y-auto min-h-0 hidden lg:block group-hover/sidebar:block">
              <PageIndex
                bookLabel={bookLabel}
                activeStep={activeStep}
                selectedPageId={selectedPageId}
                onSelectPage={onSelectPage}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto hidden lg:block group-hover/sidebar:block">
              <CompactStepGrid
                bookLabel={bookLabel}
                activeStep={activeStep}
                completedSteps={completedSteps}
              />
            </div>
          </>
        )}
      </div>
    </nav>
  )
}

/* ---------- PageIndex sub-component ---------- */

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
  const activeStepDef = STEPS.find((s) => s.slug === activeStep)

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
            onClick={() => onSelectPage?.(page.pageId)}
            className={cn(
              "flex items-start gap-2 px-3 py-1.5 mx-2 rounded text-left text-xs transition-colors",
              isActive
                ? cn(activeStepDef?.bgLight ?? "bg-violet-50", activeStepDef?.textColor ?? "text-violet-600", "font-medium")
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <PageThumbnail bookLabel={bookLabel} pageId={page.pageId} />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-[10px] opacity-60 w-4 text-right shrink-0">
                  {page.pageNumber}
                </span>
                <span className="truncate flex-1">{page.textPreview || "Untitled"}</span>
                {page.hasRendering && (
                  <span className="text-green-600 text-[10px] shrink-0 font-bold">&#10003;</span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-[22px] text-[10px] opacity-50">
                {page.imageCount > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Image className="w-2.5 h-2.5" /> {page.imageCount}
                  </span>
                )}
                <span>{page.wordCount} words</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- PageThumbnail sub-component ---------- */

function PageThumbnail({ bookLabel, pageId }: { bookLabel: string; pageId: string }) {
  const { data, isLoading } = usePageImage(bookLabel, pageId)

  if (isLoading || !data?.imageBase64) {
    return <div className="shrink-0 w-8 h-6 bg-muted rounded" />
  }

  return (
    <img
      src={`data:image/png;base64,${data.imageBase64}`}
      alt=""
      className="shrink-0 w-8 h-6 rounded object-cover"
    />
  )
}

/* ---------- ExportButton sub-component ---------- */

function ExportButton({ bookLabel }: { bookLabel: string }) {
  const exportBook = useExportBook()
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    if (exportOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
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

/* ---------- CompactStepGrid sub-component ---------- */

const PIPELINE_STEPS = STEPS.filter((s) => s.slug !== "book")

function CompactStepGrid({
  bookLabel,
  activeStep,
  completedSteps,
}: {
  bookLabel: string
  activeStep: string
  completedSteps: Record<string, boolean>
}) {
  return (
    <div className="border-t border-border px-2 py-2">
      <div className="grid grid-cols-4 gap-1">
        {PIPELINE_STEPS.map((step) => {
          const isActive = step.slug === activeStep
          const isCompleted = isStepCompleted(step.slug, completedSteps)
          const Icon = step.icon

          return (
            <Link
              key={step.slug}
              to="/books/$label/v2/$step"
              params={{ label: bookLabel, step: step.slug }}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 transition-colors",
                isActive
                  ? cn(step.bgLight, step.textColor, "font-semibold ring-1", step.borderColor)
                  : isCompleted
                    ? "text-muted-foreground hover:bg-muted/50"
                    : "text-muted-foreground/60 hover:bg-muted/50"
              )}
            >
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                  isActive || isCompleted
                    ? cn(step.color, "text-white")
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="w-3 h-3" />
              </div>
              <span className="text-[9px] leading-tight truncate max-w-full">{step.label}</span>
            </Link>
          )
        })}
      </div>

      <div className="mt-2">
        <ExportButton bookLabel={bookLabel} />
      </div>
    </div>
  )
}
