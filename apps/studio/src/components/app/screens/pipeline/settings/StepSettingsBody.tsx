import { Trans } from "@lingui/react/macro"
import { CaptionsSettings } from "@/components/pipeline/stages/captions/CaptionsSettings"
import { EasyReadSettings } from "@/components/pipeline/stages/easy-read/EasyReadSettings"
import { ExtractSettings } from "@/components/pipeline/stages/extract/ExtractSettings"
import { GlossarySettings } from "@/components/pipeline/stages/glossary/GlossarySettings"
import { LanguageSettings } from "@/components/pipeline/stages/languages/LanguageSettings"
import { QuizzesSettings } from "@/components/pipeline/stages/quizzes/QuizzesSettings"
import { SectioningSettings } from "@/components/pipeline/stages/sectioning/SectioningSettings"
import { SpeechSettings } from "@/components/pipeline/stages/speech/SpeechSettings"
import { StoryboardSettings } from "@/components/pipeline/stages/storyboard/StoryboardSettings"
import { TocSettings } from "@/components/pipeline/stages/toc/TocSettings"
import { ValidationSettings } from "@/components/pipeline/stages/ValidationSettings"
import { StepLanding, hasStepLanding } from "@/components/app/screens/pipeline/steps/shared/StepLanding"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import type { StepSettingsSlug } from "./slugs"

export interface StepSettingsBodyProps {
  label: string
  slug: StepSettingsSlug
  tab: string
}

export function StepSettingsBody({ label, slug, tab }: StepSettingsBodyProps) {
  // Overview is the stage's landing page, the same surface the step view shows
  // before the stage has ever run.
  if (tab === "overview" && hasStepLanding(slug)) {
    return <StepLanding label={label} slug={slug as DockSlug} />
  }

  switch (slug) {
    case "extract":
      return <ExtractSettings bookLabel={label} tab={tab} />
    case "sectioning":
      return <SectioningSettings bookLabel={label} tab={tab} />
    case "storyboard":
      return <StoryboardSettings bookLabel={label} tab={tab} />
    case "captions":
      return <CaptionsSettings bookLabel={label} tab={tab} />
    case "quizzes":
      return <QuizzesSettings bookLabel={label} tab={tab} />
    case "glossary":
      return <GlossarySettings bookLabel={label} tab={tab} />
    case "toc":
      return <TocSettings bookLabel={label} />
    case "easy-read":
      return <EasyReadSettings bookLabel={label} tab={tab} />
    case "translate":
      return <LanguageSettings bookLabel={label} tab={tab} stageSlug="translate" />
    case "speech":
      return <SpeechSettings bookLabel={label} tab={tab} />
    case "validation":
      return <ValidationSettings bookLabel={label} tab={tab} />
    default:
      return (
        <p className="p-4 text-sm text-muted-foreground">
          <Trans>Settings for this step are not yet available.</Trans>
        </p>
      )
  }
}
