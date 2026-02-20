import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { STAGES, isStageSlug } from "@/components/pipeline/stage-config"
import { ExtractSettings } from "@/components/pipeline/stages/ExtractSettings"
import { StoryboardSettings } from "@/components/pipeline/stages/StoryboardSettings"
import { QuizzesSettings } from "@/components/pipeline/stages/QuizzesSettings"
import { GlossarySettings } from "@/components/pipeline/stages/GlossarySettings"
import { CaptionsSettings } from "@/components/pipeline/stages/CaptionsSettings"
import { TranslationsSettings } from "@/components/pipeline/stages/TranslationsSettings"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/books/$label/$step/settings")({
  component: StepSettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) ?? "general",
  }),
})

function StepSettingsPage() {
  const { label, step } = Route.useParams()
  const { tab } = Route.useSearch()
  const stage = isStageSlug(step) ? STAGES.find((s) => s.slug === step) : undefined

  if (!stage) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 h-10 px-4 flex items-center gap-2 text-white bg-gray-700">
          <span className="text-sm font-semibold">Unknown stage</span>
        </div>
        <div className="p-4 max-w-2xl">
          <p className="text-sm text-muted-foreground">
            Unknown step slug: {step}
          </p>
          <Link
            to="/books/$label/$step"
            params={{ label, step: "book" }}
            className="text-sm text-primary hover:underline"
          >
            Go to book
          </Link>
        </div>
      </div>
    )
  }

  const stepLabel = stage.label
  const Icon = stage.icon
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null)

  return (
    <div className="flex flex-col h-full">
      {/* Step header */}
      <div className={cn("shrink-0 h-10 px-4 flex items-center gap-2 text-white", stage.color)}>
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
          <Icon className="w-3 h-3" />
        </div>
        <Link
          to="/books/$label/$step"
          params={{ label, step }}
          className="text-sm font-semibold hover:text-white/70 transition-colors"
        >
          {stepLabel}
        </Link>
        <span className="text-white/40 text-sm">/</span>
        <span className="text-sm font-medium">Settings</span>
        <div ref={setHeaderTarget} className="ml-auto" />
      </div>

      {/* Settings content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {step === "extract" ? (
          <ExtractSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
        ) : step === "storyboard" ? (
          <StoryboardSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
        ) : step === "quizzes" ? (
          <QuizzesSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
        ) : step === "glossary" ? (
          <GlossarySettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
        ) : step === "captions" ? (
          <CaptionsSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
        ) : step === "text-and-speech" ? (
          <TranslationsSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
        ) : (
          <div className="p-4 max-w-2xl">
            <p className="text-sm text-muted-foreground">
              Settings for this step are not yet available.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
