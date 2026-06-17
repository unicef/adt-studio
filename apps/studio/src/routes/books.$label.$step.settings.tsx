import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { X } from "lucide-react"
import { STAGES, isStageSlug } from "@/components/pipeline/stage-config"
import { resolveSettingsStageSlug } from "@/components/pipeline/settings-routing"
import { ExtractSettings } from "@/components/pipeline/stages/extract/ExtractSettings"
import { ExtractLandingPage } from "@/components/pipeline/stages/extract/ExtractLandingPage"
import { SectioningSettings } from "@/components/pipeline/stages/sectioning/SectioningSettings"
import { SectioningLandingPage } from "@/components/pipeline/stages/sectioning/SectioningLandingPage"
import { StoryboardSettings } from "@/components/pipeline/stages/storyboard/StoryboardSettings"
import { StoryboardLandingPage } from "@/components/pipeline/stages/storyboard/StoryboardLandingPage"
import { QuizzesSettings } from "@/components/pipeline/stages/quizzes/QuizzesSettings"
import { QuizzesLandingPage } from "@/components/pipeline/stages/quizzes/QuizzesLandingPage"
import { GlossarySettings } from "@/components/pipeline/stages/glossary/GlossarySettings"
import { GlossaryLandingPage } from "@/components/pipeline/stages/glossary/GlossaryLandingPage"
import { TocSettings } from "@/components/pipeline/stages/toc/TocSettings"
import { TocLandingPage } from "@/components/pipeline/stages/toc/TocLandingPage"
import { EasyReadSettings } from "@/components/pipeline/stages/easy-read/EasyReadSettings"
import { EasyReadLandingPage } from "@/components/pipeline/stages/easy-read/EasyReadLandingPage"
import { CaptionsSettings } from "@/components/pipeline/stages/captions/CaptionsSettings"
import { CaptionsLandingPage } from "@/components/pipeline/stages/captions/CaptionsLandingPage"
import { LanguageSettings } from "@/components/pipeline/stages/languages/LanguageSettings"
import { LanguageLandingPage } from "@/components/pipeline/stages/languages/LanguageLandingPage"
import { SpeechSettings } from "@/components/pipeline/stages/speech/SpeechSettings"
import { SpeechLandingPage } from "@/components/pipeline/stages/speech/SpeechLandingPage"
import { ValidationSettings } from "@/components/pipeline/stages/ValidationSettings"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { Trans } from "@lingui/react/macro"

export const Route = createFileRoute("/books/$label/$step/settings")({
  component: StepSettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) ?? "general",
  }),
})

export function StepSettingsPage() {
  const { label, step } = Route.useParams()
  const { tab } = Route.useSearch()
  const stage = isStageSlug(step) ? STAGES.find((s) => s.slug === step) : undefined

  if (!stage) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 h-10 px-4 flex items-center gap-2 text-white bg-gray-700">
          <span className="text-sm font-semibold"><Trans>Unknown stage</Trans></span>
        </div>
        <div className="p-4 max-w-2xl">
          <p className="text-sm text-muted-foreground">
            <Trans>Unknown step slug: {step}</Trans>
          </p>
          <Link
            to="/books/$label/$step"
            params={{ label, step: "book" }}
            className="text-sm text-primary hover:underline"
          >
            <Trans>Go to book</Trans>
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
          {getStageLabelI18n(step)}
        </Link>
        <span className="text-white/40 text-sm">/</span>
        <span className="text-sm font-medium"><Trans>Settings</Trans></span>
        <div ref={setHeaderTarget} className="ml-auto" />
        <Link
          to="/books/$label/$step"
          params={{ label, step }}
          className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-black/15 text-white/80 hover:bg-black/25 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </Link>
      </div>

      {/* Settings content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {(() => {
          const settingsStage = resolveSettingsStageSlug(step)

          if (tab === "overview") {
            switch (settingsStage) {
              case "extract":
                return <ExtractLandingPage bookLabel={label} />
              case "sectioning":
                return <SectioningLandingPage bookLabel={label} />
              case "storyboard":
                return <StoryboardLandingPage bookLabel={label} />
              case "captions":
                return <CaptionsLandingPage bookLabel={label} />
              case "glossary":
                return <GlossaryLandingPage bookLabel={label} />
              case "quizzes":
                return <QuizzesLandingPage bookLabel={label} />
              case "translate":
                return <LanguageLandingPage bookLabel={label} />
              case "speech":
                return <SpeechLandingPage bookLabel={label} />
              case "toc":
                return <TocLandingPage bookLabel={label} />
              case "easy-read":
                return <EasyReadLandingPage bookLabel={label} />
            }
          }

          switch (settingsStage) {
            case "extract":
              return <ExtractSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "sectioning":
              return <SectioningSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "storyboard":
              return <StoryboardSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "quizzes":
              return <QuizzesSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "glossary":
              return <GlossarySettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "toc":
              return <TocSettings bookLabel={label} headerTarget={headerTarget} />
            case "easy-read":
              return <EasyReadSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "captions":
              return <CaptionsSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "translate":
              return <LanguageSettings bookLabel={label} headerTarget={headerTarget} tab={tab} stageSlug="translate" />
            case "speech":
              return <SpeechSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "validation":
              return <ValidationSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            default:
              return (
                <div className="p-4 max-w-2xl">
                  <p className="text-sm text-muted-foreground">
                    <Trans>Settings for this step are not yet available.</Trans>
                  </p>
                </div>
              )
          }
        })()}
      </div>
    </div>
  )
}
