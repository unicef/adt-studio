import { Link, useMatchRoute, useSearch } from "@tanstack/react-router"
import {
  FileText,
  LayoutGrid,
  HelpCircle,
  Image,
  BookOpen,
  Languages,
  Volume2,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const STEPS = [
  { slug: "extract", label: "Extract", icon: FileText, color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-50", bgDark: "bg-blue-700", borderColor: "border-blue-200" },
  { slug: "storyboard", label: "Storyboard", icon: LayoutGrid, color: "bg-violet-500", textColor: "text-violet-600", bgLight: "bg-violet-50", bgDark: "bg-violet-700", borderColor: "border-violet-200" },
  { slug: "quizzes", label: "Quizzes", icon: HelpCircle, color: "bg-orange-500", textColor: "text-orange-600", bgLight: "bg-orange-50", bgDark: "bg-orange-700", borderColor: "border-orange-200" },
  { slug: "captions", label: "Captions", icon: Image, color: "bg-teal-500", textColor: "text-teal-600", bgLight: "bg-teal-50", bgDark: "bg-teal-700", borderColor: "border-teal-200" },
  { slug: "glossary", label: "Glossary", icon: BookOpen, color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-50", bgDark: "bg-emerald-700", borderColor: "border-emerald-200" },
  { slug: "translations", label: "Translations", icon: Languages, color: "bg-pink-500", textColor: "text-pink-600", bgLight: "bg-pink-50", bgDark: "bg-pink-700", borderColor: "border-pink-200" },
  { slug: "text-to-speech", label: "Text to Speech", icon: Volume2, color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-50", bgDark: "bg-amber-700", borderColor: "border-amber-200" },
] as const

export type StepSlug = (typeof STEPS)[number]["slug"]

const EXTRACT_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "text-types", label: "Text Types" },
  { key: "prompt", label: "Extraction Prompt" },
]

const STORYBOARD_SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "sectioning-prompt", label: "Sectioning Prompt" },
  { key: "rendering-prompt", label: "Rendering Prompt" },
]

const SETTINGS_TABS: Record<string, { key: string; label: string }[]> = {
  extract: EXTRACT_SETTINGS_TABS,
  storyboard: STORYBOARD_SETTINGS_TABS,
}

export function StepSidebar({ bookLabel, activeStep }: { bookLabel: string; activeStep: string }) {
  const matchRoute = useMatchRoute()
  const search = useSearch({ strict: false }) as { tab?: string }

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

        return (
          <div key={step.slug} className="relative">
            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <div className="absolute left-[33px] top-[34px] bottom-[-10px] w-0.5 bg-border" />
            )}

            {/* Step row */}
            <div
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 mx-2 rounded-md text-sm transition-colors relative",
                isActive
                  ? cn(step.bgLight, step.textColor, "font-medium")
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Link
                to="/books/$label/v2/$step"
                params={{ label: bookLabel, step: step.slug }}

                className="flex items-center gap-2.5 flex-1 min-w-0"
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors",
                    isActive ? cn(step.color, "text-white") : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="truncate">{step.label}</span>
              </Link>

              {/* Settings gear icon (only for active step) */}
              {isActive && (
                <Link
                  to="/books/$label/v2/$step/settings"
                  params={{ label: bookLabel, step: step.slug }}
                  search={{ tab: "general" }}
                  className={cn(
                    "flex items-center justify-center w-6 h-6 rounded shrink-0 transition-colors",
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
              <div className="ml-[52px] mr-2 mt-0.5 mb-1 flex flex-col gap-0.5">
                {settingsTabs!.map((tab) => (
                  <Link
                    key={tab.key}
                    to="/books/$label/v2/$step/settings"
                    params={{ label: bookLabel, step: step.slug }}
                    search={{ tab: tab.key }}
                    className={cn(
                      "text-xs px-2 py-1 rounded transition-colors",
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
