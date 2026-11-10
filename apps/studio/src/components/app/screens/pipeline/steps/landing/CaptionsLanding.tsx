import { useState, useEffect, useMemo , type ReactNode } from "react"
import { BookOpen, GraduationCap, Sprout } from "lucide-react"
import { CustomInstructionsField } from "./ui/CustomInstructionsField"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n as linguiI18n } from "@lingui/core"
import type { MessageDescriptor } from "@lingui/core"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { StepLandingShell } from "./StepLandingShell"
import { ImageWallCanvas } from "./book-canvas/ImageWallCanvas"
import { LandingBookCanvas } from "./book-canvas/LandingBookCanvas"
import { useVariant } from "@/components/app/lab/variants"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { useBook } from "@/hooks/use-books"
import { usePages } from "@/hooks/use-pages"
import { useLandingRunGate } from "./useLandingRunGate"
import { RunErrorNotice } from "../shared/RunErrorNotice"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import {
  SettingsCard,
  SettingsField,
} from "./ui/SettingsCard"
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
} from "@/components/pipeline/stages/captions/components/CaptionsPreview"

const GRADE_LEVEL_HINTS: Record<GradeLevelKey, MessageDescriptor> = {
  early: msg`Short, simple sentences for kindergarten through 5th grade.`,
  middle: msg`Clear, detailed descriptions for middle and high school readers.`,
  advanced: msg`Detailed, technical descriptions for college and adult readers.`,
}

export function CaptionsLanding({ bookLabel, beforeRun }: { bookLabel: string; beforeRun?: ReactNode }) {
  const { t } = useLingui()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("captions")
  const storyboardStatus = useStageStatus("storyboard")
  const storyboardReady = storyboardStatus.isCompleted
  const gate = useLandingRunGate(bookLabel, "captions", [
    { ok: storyboardReady, reason: <Trans>Run Storyboard first. Image descriptions describe the images Storyboard places.</Trans> },
  ])
  const { compose: composeBookContext, canAutoFill } = useComposeBookContext(
    bookLabel,
    t`When describing images, mention any culturally specific objects, locations, or recurring characters by name.`,
  )

  const landing = useVariant("caplanding")
  const { data: pageList } = usePages(bookLabel)
  const bookHasNoImages = !!pageList && pageList.every((page) => page.imageCount === 0)
  const { data: book } = useBook(bookLabel)
  const { data: sourcePdfInfo, isError: sourcePdfFailed } = useSourcePdfInfo(bookLabel)
  const config = (activeConfigData?.merged ?? undefined) as { spread_mode?: boolean; start_page?: number; end_page?: number } | undefined
  const totalPages = sourcePdfInfo?.pageCount ?? book?.pageCount ?? 0
  const startPage = config?.start_page != null ? Number(config.start_page) : 1
  const pageRange: [number, number] = [startPage, config?.end_page != null ? Number(config.end_page) : Math.max(startPage, totalPages || 1)]

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
    if (gate.blocked || status.isRunning) return
    queueRun({ fromStage: "captions", toStage: "captions", apiKey })
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


  return (
    <StepLandingShell
      title={getStageLabelI18n("captions")}
      description={<Trans>Write a short description of every picture in the book, so screen readers and translations can tell readers what's in it.</Trans>}
      notice={status.hasError ? <RunErrorNotice label={bookLabel} stage="captions" /> : undefined}
      beforeRun={beforeRun}
      bookLabel={bookLabel}
      stageSlug="captions"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={gate.blocked}
      disabledReason={storyboardReady ? gate.disabledReason : undefined}
      runLabel={<Trans>Describe images</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Image descriptions preview`}
      onRun={handleRun}
      preview={landing === "sample" ? <CaptionsPreview grade={gradeLevel} /> : undefined}
      canvas={
        landing === "images" || (landing === "pages" && bookHasNoImages) ? (
          <ImageWallCanvas bookLabel={bookLabel} />
        ) : landing === "pages" && !bookHasNoImages ? (
          <LandingBookCanvas
            bookLabel={bookLabel}
            range={pageRange}
            spread={config?.spread_mode === true}
            totalPages={totalPages}
            failed={sourcePdfFailed}
            caption={t`Image descriptions cover every picture on these pages.`}
          />
        ) : undefined
      }
    >

      <PrereqGuard
        upstreamSlug="storyboard"
        stageSlug="captions"
        description={
          <Trans>
            Image descriptions describe the images that Storyboard places into pages.
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
            dialogDescription={t`Optional notes to steer how image descriptions are written. Use Auto-fill to start from the book's title, language, and summary.`}
            placeholder={t`e.g. emphasize cultural context, avoid technical jargon, mention colors when relevant…`}
          />
        </SettingsField>
      </SettingsCard>
    </StepLandingShell>
  )
}

