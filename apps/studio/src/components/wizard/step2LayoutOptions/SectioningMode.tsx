import { useMemo } from "react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { Label } from "@/components/ui/label"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { usePresetRecommendations } from "@/components/wizard/usePresetRecommendations"
import { PRESETS, getPresetAccent } from "@/components/wizard/constants"
import { InfoCarousel, type CarouselSlide } from "@/components/ui/info-carousel"
import { SectioningModeSelect } from "./SectioningModeSelect"

const INFO_CAROUSEL_LABEL = msg`About section mode`

const CAROUSEL_PAGE_TITLE = msg`Page Mode`
const CAROUSEL_PAGE_DESCRIPTION = msg`The entire page is treated as a single section - all text and images stay together as one unit. Best for storybooks, reference books, and any content where each page is self-contained.`

const CAROUSEL_DYNAMIC_TITLE = msg`Dynamic Mode`
const CAROUSEL_DYNAMIC_DESCRIPTION = msg`Keeps the page as one section by default, but intelligently splits when it detects multiple distinct activities - such as a mix of multiple-choice, open-ended, and sorting exercises on the same page. Best for textbooks with varied exercises.`

function PageDiagram() {
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <div className="flex h-[72px] w-[52px] flex-col rounded border border-primary/30 bg-primary/5 p-1.5">
        <div className="flex flex-1 flex-col gap-1">
          <div className="h-1 w-full rounded-full bg-primary/30" />
          <div className="h-1 w-3/4 rounded-full bg-primary/30" />
          <div className="mt-1 h-4 w-full rounded bg-primary/15" />
          <div className="h-1 w-full rounded-full bg-primary/30" />
          <div className="h-1 w-2/3 rounded-full bg-primary/30" />
        </div>
      </div>
      <div className="text-[8px] text-muted-foreground">
        <Trans>=</Trans>
      </div>
      <div className="flex h-[72px] w-[52px] flex-col rounded border-2 border-primary/40 bg-primary/5 p-1.5">
        <div className="flex flex-1 flex-col gap-1">
          <div className="h-1 w-full rounded-full bg-primary/40" />
          <div className="h-1 w-3/4 rounded-full bg-primary/40" />
          <div className="mt-1 h-4 w-full rounded bg-primary/20" />
          <div className="h-1 w-full rounded-full bg-primary/40" />
          <div className="h-1 w-2/3 rounded-full bg-primary/40" />
        </div>
      </div>
    </div>
  )
}

function DynamicDiagram() {
  return (
    <div className="flex items-center justify-center gap-4 py-2">
      <div className="flex h-[72px] w-[52px] flex-col rounded border border-primary/30 bg-primary/5 p-1.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full border border-primary/40" />
            <div className="h-0.5 w-full rounded-full bg-primary/30" />
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full border border-primary/40 bg-primary/30" />
            <div className="h-0.5 w-3/4 rounded-full bg-primary/30" />
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full border border-primary/40" />
            <div className="h-0.5 w-2/3 rounded-full bg-primary/30" />
          </div>
          <div className="mt-0.5 h-px w-full border-t border-dashed border-amber-400/30" />
          <div className="mt-0.5 h-0.5 w-full rounded-full bg-amber-400/40" />
          <div className="mt-1 h-px w-full border-b border-amber-400/30" />
          <div className="mt-1 h-px w-full border-b border-amber-400/30" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex h-[30px] w-[52px] flex-col justify-center gap-0.5 rounded border-2 border-primary/40 bg-primary/5 px-1.5">
          <div className="flex items-center gap-0.5">
            <div className="h-1 w-1 shrink-0 rounded-full border border-primary/40" />
            <div className="h-0.5 w-full rounded-full bg-primary/40" />
          </div>
          <div className="flex items-center gap-0.5">
            <div className="h-1 w-1 shrink-0 rounded-full border border-primary/40 bg-primary/30" />
            <div className="h-0.5 w-3/4 rounded-full bg-primary/40" />
          </div>
        </div>
        <div className="flex h-[30px] w-[52px] flex-col justify-center gap-0.5 rounded border-2 border-amber-400/40 bg-amber-500/10 px-1.5">
          <div className="h-0.5 w-full rounded-full bg-amber-400/50" />
          <div className="mt-0.5 h-px w-full border-b border-amber-400/30" />
          <div className="mt-0.5 h-px w-full border-b border-amber-400/30" />
        </div>
      </div>
    </div>
  )
}

export function SectioningMode() {
  const form = useWizardForm()
  const sectioningMode = useStore(form.store, (s) => s.values.sectioningMode)
  const selectedPresetId = useStore(form.store, (s) => s.values.selectedPreset)
  const { i18n } = useLingui()
  const recommendations = usePresetRecommendations()
  const recommended = recommendations.sectioningMode || undefined
  const preset = PRESETS.find((p) => p.id === selectedPresetId)
  const accent = getPresetAccent(selectedPresetId)

  const slides = useMemo(
    (): CarouselSlide[] => [
      {
        title: i18n._(CAROUSEL_PAGE_TITLE),
        description: i18n._(CAROUSEL_PAGE_DESCRIPTION),
        Diagram: PageDiagram,
      },
      {
        title: i18n._(CAROUSEL_DYNAMIC_TITLE),
        description: i18n._(CAROUSEL_DYNAMIC_DESCRIPTION),
        Diagram: DynamicDiagram,
      },
    ],
    [i18n, i18n.locale],
  )

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-1">
        <Label htmlFor="wizard-sectioning-mode" className="text-sm font-medium text-foreground">
          <Trans>Section Mode</Trans>
        </Label>
        <span className="text-sm font-medium text-destructive" aria-hidden>
          *
        </span>
        <InfoCarousel label={i18n._(INFO_CAROUSEL_LABEL)} slides={slides} />
      </div>
      <SectioningModeSelect
        id="wizard-sectioning-mode"
        value={sectioningMode}
        onValueChange={(v) => form.setFieldValue("sectioningMode", v)}
        recommended={recommended}
        presetLabel={preset?.title}
        accent={accent}
      />
    </div>
  )
}
