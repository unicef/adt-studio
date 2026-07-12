import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Info } from "lucide-react"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { StageBlockedState } from "@/components/pipeline/components/StageBlockedState"
import { LoadingState } from "@/components/pipeline/components/LoadingState"
import {
  SettingsCard,
  SettingsField,
} from "@/components/pipeline/components/SettingsCard"
import { useBookRun } from "@/hooks/use-book-run"
import { useAllPagesPruned } from "@/hooks/use-all-pages-pruned"
import { usePartInfo } from "@/hooks/use-parts"
import { useExportWatcher } from "@/hooks/use-export-watcher"
import {
  type ExportFeatureToggles,
  useAllProjectFeatures,
} from "@/hooks/use-export-features"
import {
  buildExportFormatConfig,
  type ExportFormat,
} from "./export-formats"
import { ExportDialog } from "./ExportDialog"
import { FormatPicker } from "./components/FormatPicker"
import { ExportPreview } from "./components/ExportPreview"
import { useCapturedPreviewSettings } from "@/hooks/use-preview-settings-listener"

export function ExportLandingPage({ bookLabel }: { bookLabel: string }) {
  const { stageState, isStatusLoading } = useBookRun()
  const storyboardDone = stageState("storyboard") === "done"
  const { allPruned, isLoading: prunedLoading } = useAllPagesPruned(bookLabel)
  // A book imported as a page-range part should be exported as a Project
  // Archive (the artifact the coordinator merges back) — wait for this to
  // resolve before mounting the body so the default format is correct.
  const { data: partInfo, isLoading: partInfoLoading } = usePartInfo(bookLabel)

  if (isStatusLoading || prunedLoading || partInfoLoading) {
    return <LoadingState stageSlug="export" label={<Trans>Loading export...</Trans>} />
  }

  if (!storyboardDone) {
    return <StageBlockedState bookLabel={bookLabel} reason="storyboard-missing" stageLabel={<Trans>Export</Trans>} />
  }

  if (allPruned) {
    return <StageBlockedState bookLabel={bookLabel} reason="all-pruned" stageLabel={<Trans>Export</Trans>} />
  }

  return <ExportLandingBody bookLabel={bookLabel} isPart={!!partInfo} />
}

function ExportLandingBody({
  bookLabel,
  isPart,
}: {
  bookLabel: string
  isPart: boolean
}) {
  const { t } = useLingui()
  const { startExport, isPreparing, preparingFormat, error } =
    useExportWatcher()
  const projectFeatures = useAllProjectFeatures(bookLabel)
  const available = projectFeatures.toggleable
  const capturedPreviewSettings = useCapturedPreviewSettings(bookLabel)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(
    isPart ? "project" : "adt",
  )
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [languageOrder, setLanguageOrder] = useState<string[] | null>(null)
  const [featureToggles, setFeatureToggles] = useState<ExportFeatureToggles>({
    glossary: true,
    readAloud: true,
    quizzes: true,
    signLanguage: true,
  })

  const handleOpenDialog = () => {
    setExportDialogOpen(true)
  }

  const handleConfirmExport = () => {
    const features =
      selectedFormat === "project"
        ? undefined
        : {
            glossary: featureToggles.glossary && available.glossary,
            readAloud: featureToggles.readAloud && available.readAloud,
            quizzes: featureToggles.quizzes && available.quizzes,
            signLanguage:
              featureToggles.signLanguage && available.signLanguage,
            languages: languageOrder ?? undefined,
          }
    const defaultSettings =
      selectedFormat === "project" ? undefined : capturedPreviewSettings
    startExport(selectedFormat, features, defaultSettings)
    setExportDialogOpen(false)
  }

  const formatLabels = buildExportFormatConfig(t, { isPart })

  const formatError =
    error?.format === selectedFormat ? error.message : null

  const isThisFormatPreparing = preparingFormat === selectedFormat

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="export"
      settingsTab="general"
      colorClass="bg-indigo-700 hover:bg-indigo-800"
      accentColor="#4338ca"
      accentColorSoft="#e0e7ff"
      isRunning={isThisFormatPreparing}
      isCompleted={false}
      hasError={!!formatError}
      canRun={true}
      runLabel={
        <Trans>Export {formatLabels[selectedFormat].label}</Trans>
      }
      rerunLabel={<Trans>Retry Export</Trans>}
      previewLabel={t`Export Preview`}
      hideAdvancedSettings
      onRun={handleOpenDialog}
      preview={<ExportPreview format={selectedFormat} isPart={isPart} />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Export</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Package the book for distribution. Pick a format, choose what
            content goes in, and we'll bundle everything into a downloadable
            archive.
          </Trans>
        </p>
      </div>

      {isPart && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p>
            <Trans>
              This book is a part. Export it as a{" "}
              <span className="font-medium text-foreground">Completed Part</span>{" "}
              and send the file back to the coordinator to merge into the source
              book.
            </Trans>
          </p>
        </div>
      )}

      <SettingsCard>
        <SettingsField label={<Trans>Format</Trans>}>
          <FormatPicker
            selected={selectedFormat}
            onSelect={setSelectedFormat}
            t={t}
            errorFormat={error?.format ?? null}
            isPart={isPart}
          />
        </SettingsField>
      </SettingsCard>

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        selectedFormat={selectedFormat}
        bookLabel={bookLabel}
        featureToggles={featureToggles}
        onFeatureToggleChange={(feature, value) =>
          setFeatureToggles((prev) => ({ ...prev, [feature]: value }))
        }
        languageOrder={languageOrder}
        onLanguageOrderChange={setLanguageOrder}
        onConfirmExport={handleConfirmExport}
        isPreparing={isPreparing}
        preparingFormat={preparingFormat}
        error={error}
      />
    </LandingPageShell>
  )
}
