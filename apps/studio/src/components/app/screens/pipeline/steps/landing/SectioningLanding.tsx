import { useState, useEffect, useMemo , type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { StepLandingShell } from "./StepLandingShell"
import { CascadeWarning } from "@/components/pipeline/components/CascadeWarning"
import { LandingPageWarning } from "@/components/pipeline/components/LandingPageWarning"
import { SettingsCard, SettingsField } from "./ui/SettingsCard"
import { SettingExplainer } from "./ui/SettingExplainer"
import { ToggleCard } from "./ui/ToggleCard"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useBookConfig } from "@/hooks/use-book-config"
import { usePages } from "@/hooks/use-pages"
import { useSplitStatus } from "@/hooks/use-parts"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { SectioningModeVisual } from "@/components/pipeline/stages/sectioning/components/SectioningModeVisual"
import { SectioningPreview } from "@/components/pipeline/stages/sectioning/components/SectioningPreview"
import { resolveSectioningStartStage } from "@/components/pipeline/stages/sectioning/SectioningLandingPage.helpers"

type SectioningModeKey = "dynamic" | "page"

export function SectioningLanding({ bookLabel, beforeRun }: { bookLabel: string; beforeRun?: ReactNode }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)
  const { data: splitStatus, isLoading: splitStatusLoading } = useSplitStatus(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("sectioning")
  const extractStatus = useStageStatus("extract")
  const extractReady = extractStatus.isCompleted
  const extractCovered = extractStatus.isCompleted || extractStatus.isRunning
  const hasExtractedPages = (pages?.length ?? 0) > 0
  const hasAssembledPages = hasExtractedPages && splitStatus?.hasMergeActivity === true
  const resolvingStoredState =
    !extractCovered && (pagesLoading || (hasExtractedPages && splitStatusLoading))

  const [sectioningMode, setSectioningMode] = useState<SectioningModeKey>("dynamic")
  const [generateActivities, setGenerateActivities] = useState(true)

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined

  const activityNames = useMemo(() => {
    if (!merged) return [] as string[]
    const sectionTypes = (merged.section_types ?? {}) as Record<string, unknown>
    const strategies = (merged.render_strategies ?? {}) as Record<string, { render_type?: string }>
    const names = new Set<string>()
    for (const key of Object.keys(sectionTypes)) {
      if (key.startsWith("activity_")) names.add(key)
    }
    for (const [name, strat] of Object.entries(strategies)) {
      if (strat?.render_type === "activity") names.add(name)
    }
    return Array.from(names)
  }, [merged])

  const activitiesEnabled = activityNames.length > 0 && generateActivities

  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    if (m.page_sectioning && typeof m.page_sectioning === "object") {
      const ps = m.page_sectioning as Record<string, unknown>
      if (ps.mode === "page" || ps.mode === "dynamic") setSectioningMode(ps.mode)
    }
    setGenerateActivities(m.generate_activities !== false)
  }, [activeConfigData])

  const handleModeChange = (value: SectioningModeKey) => {
    setSectioningMode(value)
    const existingPS = (bookConfigData?.config?.page_sectioning ?? {}) as Record<string, unknown>
    persist({ page_sectioning: { ...existingPS, mode: value } })
  }

  const handleActivityDetectionChange = (next: boolean) => {
    if (activityNames.length === 0) return
    setGenerateActivities(next)
    persist({ generate_activities: next })
  }

  const handleRun = () => {
    if (!hasApiKey || status.isRunning || resolvingStoredState) return
    const fromStage = resolveSectioningStartStage(extractCovered, hasAssembledPages)
    queueRun({ fromStage, toStage: "sectioning", apiKey })
  }

  const modeOptions = useMemo(
    () => [
      { value: "dynamic" as const, label: t`Dynamic` },
      { value: "page" as const, label: t`By Page` },
    ],
    [t],
  )

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run sectioning.</Trans>
  ) : undefined

  return (
    <StepLandingShell
      beforeRun={beforeRun}
      bookLabel={bookLabel}
      stageSlug="sectioning"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey || resolvingStoredState}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Sectioning</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Sectioning Preview`}
      onRun={handleRun}
      preview={<SectioningPreview />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          <Trans>Sectioning</Trans>
        </h1>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          <Trans>
            Group each page's text and images into typed sections with a
            structured content tree. Sections drive how downstream stages
            render, translate, and read the book aloud.
          </Trans>
        </p>
      </div>

      {extractReady ? (
        <CascadeWarning stageSlug="sectioning" />
      ) : !extractCovered && hasAssembledPages ? (
        <LandingPageWarning
          variant="prereq"
          title={<Trans>Book hierarchy needs rebuilding</Trans>}
          description={
            <Trans>
              Running Sectioning will rebuild the book-wide outline from the
              merged pages, then apply it without re-running PDF extraction.
            </Trans>
          }
        />
      ) : !extractCovered ? (
        <LandingPageWarning
          variant="prereq"
          title={<Trans>Extract hasn't run yet</Trans>}
          description={
            <Trans>
              Running Sectioning will run Extract first, then section the
              extracted pages.
            </Trans>
          }
        />
      ) : null}

      <SettingsCard>
        <SettingsField
          label={<Trans>Sectioning Mode</Trans>}
          labelAction={
            <SettingExplainer
              visual={<SectioningModeVisual />}
            />
          }
          hint={
            sectioningMode === "page" ? (
              <Trans>
                Treat each page as a single section. Best for storybooks and
                self-contained pages.
              </Trans>
            ) : (
              <Trans>
                Keep pages whole by default, but split when distinct activity
                types are detected on the same page.
              </Trans>
            )
          }
        >
          <SegmentedControl
            options={modeOptions}
            value={sectioningMode}
            onValueChange={handleModeChange}
          />
        </SettingsField>
      </SettingsCard>

      <ToggleCard
        title={<Trans>Activity Detection</Trans>}
        description={
          <Trans>
            Detects exercises and quizzes embedded in the book and classifies
            them as their own sections so they can render as interactive
            elements downstream.
          </Trans>
        }
        checked={activitiesEnabled}
        disabled={activityNames.length === 0}
        onCheckedChange={handleActivityDetectionChange}
      />
    </StepLandingShell>
  )
}
