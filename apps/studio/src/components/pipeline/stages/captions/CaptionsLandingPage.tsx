import { useState, useEffect, useMemo } from "react"
import { BookOpen, GraduationCap, Sprout } from "lucide-react"
import { CustomInstructionsField } from "@/components/pipeline/components/CustomInstructionsField"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n as linguiI18n } from "@lingui/core"
import type { MessageDescriptor } from "@lingui/core"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import {
  SettingsCard,
  SettingsField,
} from "@/components/pipeline/components/SettingsCard"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { useComposeBookContext } from "@/hooks/use-compose-book-context"
import {
  CaptionsPreview,
  type GradeLevelKey,
} from "./components/CaptionsPreview"

const GRADE_LEVEL_HINTS: Record<GradeLevelKey, MessageDescriptor> = {
  early: msg`Short, simple sentences for kindergarten through 5th grade.`,
  middle: msg`Clear, descriptive captions for middle and high school readers.`,
  advanced: msg`Detailed, technical captions for college and adult readers.`,
}

export function CaptionsLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("captions")
  const storyboardStatus = useStageStatus("storyboard")
  const storyboardReady = storyboardStatus.isCompleted
  const { compose: composeBookContext, canAutoFill } = useComposeBookContext(
    bookLabel,
    t`When describing images, mention any culturally specific objects, locations, or recurring characters by name.`,
  )

  const [gradeLevel, setGradeLevel] = useState<GradeLevelKey>("middle")
  const [userPrompt, setUserPrompt] = useState("")

  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    if (
      m.image_captioning_grade_level === "early" ||
      m.image_captioning_grade_level === "middle" ||
      m.image_captioning_grade_level === "advanced"
    ) {
      setGradeLevel(m.image_captioning_grade_level)
    }
    if (typeof m.image_captioning_user_prompt === "string") {
      setUserPrompt(m.image_captioning_user_prompt)
    }
  }, [activeConfigData])

  const handleGradeChange = (value: GradeLevelKey) => {
    setGradeLevel(value)
    persist({ image_captioning_grade_level: value })
  }

  const handleUserPromptChange = (value: string) => {
    setUserPrompt(value)
    persist({ image_captioning_user_prompt: value })
  }

  const handleRun = () => {
    if (!hasApiKey || !storyboardReady || status.isRunning) return
    queueRun({ fromStage: "captions", toStage: "captions", apiKey, viewAfter: true })
  }

  const gradeOptions = useMemo(
    () => [
      {
        value: "early" as const,
        label: t`Early`,
        icon: <Sprout className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />,
      },
      {
        value: "middle" as const,
        label: t`Middle`,
        icon: <BookOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />,
      },
      {
        value: "advanced" as const,
        label: t`Advanced`,
        icon: (
          <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        ),
      },
    ],
    [t],
  )

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run captions.</Trans>
  ) : !storyboardReady ? (
    <Trans>Run Storyboard first — captions describe the images placed by Storyboard.</Trans>
  ) : undefined

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="captions"
      settingsTab="general"
      colorClass="bg-teal-600 hover:bg-teal-700"
      accentColor="#0d9488"
      accentColorSoft="#ccfbf1"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey || !storyboardReady}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Captions</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Captions Preview`}
      onRun={handleRun}
      preview={<CaptionsPreview grade={gradeLevel} />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Image Captions</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Generate descriptive captions for every image in the book. Pick a
            reading level so captions match your audience, and add custom
            instructions if you want to nudge the tone or focus.
          </Trans>
        </p>
      </div>

      <PrereqGuard
        upstreamSlug="storyboard"
        stageSlug="captions"
        description={
          <Trans>
            Captions describe the images that Storyboard places into pages.
            Finish Storyboard before running this stage.
          </Trans>
        }
      />

      <SettingsCard>
        <SettingsField
          label={<Trans>Grade Level</Trans>}
          hint={linguiI18n._(GRADE_LEVEL_HINTS[gradeLevel])}
        >
          <SegmentedControl
            options={gradeOptions}
            value={gradeLevel}
            onValueChange={handleGradeChange}
          />
        </SettingsField>
      </SettingsCard>

      <SettingsCard>
        <SettingsField
          label={<Trans>Custom Instructions</Trans>}
          hint={
            <Trans>
              Optional. Add notes about tone, focus, or vocabulary. Use
              Auto-fill to start from the book's title, language, and summary.
            </Trans>
          }
        >
          <CustomInstructionsField
            value={userPrompt}
            onChange={handleUserPromptChange}
            compose={composeBookContext}
            canAutoFill={canAutoFill}
            accentHex="#0d9488"
            dialogDescription={t`Optional notes to steer how captions are generated. Use Auto-fill to start from the book's title, language, and summary.`}
            placeholder={t`e.g. emphasize cultural context, avoid technical jargon, mention colors when relevant…`}
          />
        </SettingsField>
      </SettingsCard>
    </LandingPageShell>
  )
}

