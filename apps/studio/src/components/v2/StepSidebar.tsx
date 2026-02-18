import { Link, useMatchRoute, useSearch } from "@tanstack/react-router"
import {
  BookMarked,
  FileText,
  LayoutGrid,
  HelpCircle,
  Image,
  BookOpen,
  Languages,
  Volume2,
  Eye,
  Settings,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import { cn } from "@/lib/utils"
import { useStepRun } from "@/hooks/use-step-run"
import { StepProgressRing } from "./StepProgressRing"

export const STEPS = [
  { slug: "book", label: "Book", runningLabel: "Loading Book", icon: BookMarked, color: "bg-gray-500", textColor: "text-gray-600", bgLight: "bg-gray-50", bgDark: "bg-gray-700", borderColor: "border-gray-200" },
  { slug: "extract", label: "Extract", runningLabel: "Extracting", icon: FileText, color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-50", bgDark: "bg-blue-700", borderColor: "border-blue-200" },
  { slug: "storyboard", label: "Storyboard", runningLabel: "Building Storyboard", icon: LayoutGrid, color: "bg-violet-500", textColor: "text-violet-600", bgLight: "bg-violet-50", bgDark: "bg-violet-700", borderColor: "border-violet-200" },
  { slug: "quizzes", label: "Quizzes", runningLabel: "Generating Quizzes", icon: HelpCircle, color: "bg-orange-500", textColor: "text-orange-600", bgLight: "bg-orange-50", bgDark: "bg-orange-700", borderColor: "border-orange-200" },
  { slug: "captions", label: "Captions", runningLabel: "Captioning Images", icon: Image, color: "bg-teal-500", textColor: "text-teal-600", bgLight: "bg-teal-50", bgDark: "bg-teal-700", borderColor: "border-teal-200" },
  { slug: "glossary", label: "Glossary", runningLabel: "Generating Glossary", icon: BookOpen, color: "bg-lime-500", textColor: "text-lime-600", bgLight: "bg-lime-50", bgDark: "bg-lime-700", borderColor: "border-lime-200" },
  { slug: "translations", label: "Translations", runningLabel: "Translating", icon: Languages, color: "bg-pink-500", textColor: "text-pink-600", bgLight: "bg-pink-50", bgDark: "bg-pink-700", borderColor: "border-pink-200" },
  { slug: "text-to-speech", label: "Text to Speech", runningLabel: "Generating Audio", icon: Volume2, color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-50", bgDark: "bg-amber-700", borderColor: "border-amber-200" },
  { slug: "preview", label: "Preview", runningLabel: "Building Preview", icon: Eye, color: "bg-gray-500", textColor: "text-gray-600", bgLight: "bg-gray-50", bgDark: "bg-gray-700", borderColor: "border-gray-200" },
] as const

export type StepSlug = (typeof STEPS)[number]["slug"]

export const STEP_DESCRIPTIONS: Record<string, string> = {
  extract: "Extract text and images from each page of the PDF using AI-powered analysis.",
  storyboard: "Arrange extracted content into a structured storyboard with pages, sections, and layouts.",
  quizzes: "Generate comprehension quizzes and activities based on the book content.",
  captions: "Create descriptive captions for images to improve accessibility.",
  glossary: "Build a glossary of key terms and definitions found in the text.",
  translations: "Translate the book content into additional languages.",
  "text-to-speech": "Generate audio narration for the book using text-to-speech.",
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
  { key: "sectioning-prompt", label: "Sectioning Prompt" },
  { key: "rendering-prompt", label: "Rendering" },
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
]

const TTS_SETTINGS_TABS = [
  { key: "general", label: "Speech Settings" },
]

const SETTINGS_TABS: Record<string, { key: string; label: string }[]> = {
  extract: EXTRACT_SETTINGS_TABS,
  storyboard: STORYBOARD_SETTINGS_TABS,
  quizzes: QUIZ_SETTINGS_TABS,
  glossary: GLOSSARY_SETTINGS_TABS,
  captions: CAPTIONS_SETTINGS_TABS,
  translations: TRANSLATIONS_SETTINGS_TABS,
  "text-to-speech": TTS_SETTINGS_TABS,
}

export function StepSidebar({ bookLabel, activeStep }: { bookLabel: string; activeStep: string }) {
  const matchRoute = useMatchRoute()
  const search = useSearch({ strict: false }) as { tab?: string }
  const { progress: stepRunProgress } = useStepRun()
  const { data: stepStatusData } = useQuery({
    queryKey: ["books", bookLabel, "step-status"],
    queryFn: () => api.getStepStatus(bookLabel),
    enabled: !!bookLabel,
  })
  const completedSteps = stepStatusData?.steps ?? {}

  const isSettings = !!matchRoute({
    to: "/books/$label/v2/$step/settings",
    params: { label: bookLabel, step: activeStep },
  })

  const activeTab = search.tab ?? "general"

  return (
    <nav className="flex flex-col py-3 gap-0.5">
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
                      isActive || step.slug === "book" || completedSteps[step.slug] || ringState === "done"
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

              {/* Settings gear icon (only for active step, not for book) */}
              {isActive && step.slug !== "book" && (
                <Link
                  to="/books/$label/v2/$step/settings"
                  params={{ label: bookLabel, step: step.slug }}
                  search={{ tab: "general" }}
                  className={cn(
                    "items-center justify-center w-6 h-6 rounded shrink-0 transition-colors hidden lg:flex group-hover/sidebar:flex",
                    isSettings
                      ? cn(step.color, "text-white")
                      : "hover:bg-black/5 text-current opacity-50 hover:opacity-100"
                  )}
                  title={`${step.label} settings`}
                >
                  <Settings className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {/* Settings sub-tabs (extract only, when settings active) */}
            {showSubTabs && (
              <div className="ml-[52px] mr-2 mt-0.5 mb-1 flex-col gap-0.5 hidden lg:flex group-hover/sidebar:flex">
                {settingsTabs!.map((tab) => (
                  <Link
                    key={tab.key}
                    to="/books/$label/v2/$step/settings"
                    params={{ label: bookLabel, step: step.slug }}
                    search={{ tab: tab.key }}
                    className={cn(
                      "text-xs px-2 py-1 rounded transition-colors whitespace-nowrap",
                      activeTab === tab.key
                        ? cn(step.textColor, "font-medium", step.bgLight)
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
