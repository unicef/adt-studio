import { useState, useMemo, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Lock } from "lucide-react"
import type { FigureExtractionMode } from "@adt/types"
import { useBook } from "@/hooks/use-books"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { StepLandingShell } from "./StepLandingShell"
import { CascadeWarning } from "@/components/pipeline/components/CascadeWarning"
import { SettingsCard, SettingsField } from "./ui/SettingsCard"
import { SettingExplainer } from "./ui/SettingExplainer"
import { HelpHint } from "./ui/HelpHint"
import { ToggleCard } from "./ui/ToggleCard"
import { RangeSlider } from "@/components/ui/range-slider"
import { SegmentedControl } from "@/components/ui/segmented-control"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useBookConfig } from "@/hooks/use-book-config"
import { usePartInfo } from "@/hooks/use-parts"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { PageGroupingVisual } from "@/components/pipeline/stages/extract/components/PageGroupingVisual"
import { ExtractPreview } from "@/components/pipeline/stages/extract/components/ExtractPreview"
import { readFigureExtractionMode } from "../extract/figureMode"

type SpreadModeKey = "single" | "spread"

export function ExtractLanding({ bookLabel, beforeRun }: { bookLabel: string; beforeRun?: ReactNode }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("extract")
  const { data: book } = useBook(bookLabel)
  const { data: sourcePdfInfo, isPending: sourcePdfPending } = useSourcePdfInfo(bookLabel)
  const { data: partInfo } = usePartInfo(bookLabel)
  const isPart = !!partInfo

  const totalPages = sourcePdfInfo?.pageCount ?? book?.pageCount ?? 0

  const config = bookConfigData?.config
  const spreadMode: SpreadModeKey = config?.spread_mode === true ? "spread" : "single"
  const removeWatermarks = config?.remove_watermarks === true
  const figureExtractionMode: FigureExtractionMode = config
    ? readFigureExtractionMode(config)
    : "all"
  const serverStart = config?.start_page != null ? Number(config.start_page) : 1
  const serverEnd =
    config?.end_page != null
      ? Number(config.end_page)
      : Math.max(serverStart, totalPages || 1)

  const [dragRange, setDragRange] = useState<[number, number] | null>(null)
  const pageRange: [number, number] = dragRange ?? [serverStart, serverEnd]

  const commitPageRange = ([start, end]: [number, number]) => {
    persist({ start_page: start, end_page: end })
    setDragRange(null)
  }

  const handleSpreadModeChange = (value: SpreadModeKey) => {
    persist({ spread_mode: value === "spread" })
  }

  const handleFigureExtractionModeChange = (next: FigureExtractionMode) => {
    persist({
      figure_extraction_mode: next,
      vector_text_grouping: next !== "off",
    })
  }

  const handleRemoveWatermarksChange = (next: boolean) => {
    persist({ remove_watermarks: next })
  }

  const spreadOptions = useMemo(
    () => [
      { value: "single" as const, label: t`Single` },
      { value: "spread" as const, label: t`Spread` },
    ],
    [t],
  )

  const figureExtractionOptions = useMemo(
    () => [
      { value: "off" as const, label: t`Off` },
      { value: "auto" as const, label: t`Auto` },
      { value: "all" as const, label: t`All` },
    ],
    [t],
  )

  const pageRangeDisabled = sourcePdfPending || !totalPages

  const handleRun = () => {
    if (!hasApiKey || status.isRunning) return
    queueRun({ fromStage: "extract", toStage: "extract", apiKey })
  }

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run extraction.</Trans>
  ) : undefined

  return (
    <StepLandingShell
      beforeRun={beforeRun}
      bookLabel={bookLabel}
      stageSlug="extract"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Extract</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Extract Preview`}
      onRun={handleRun}
      preview={
        <ExtractPreview
          bookTitle={book?.title ?? bookLabel}
          pageCount={totalPages || null}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          <Trans>Extract</Trans>
        </h1>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          <Trans>
            Pull structured content from the source PDF. Extraction identifies
            headings, paragraphs, lists, and images so downstream stages work
            with clean, typed content instead of raw PDF.
          </Trans>
        </p>
      </div>

      <CascadeWarning stageSlug="extract" />

      <SettingsCard>
        <SettingsField
          label={<Trans>Page Range</Trans>}
          labelAction={
            isPart ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    aria-label={t`Page range locked`}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  >
                    <Lock className="h-3 w-3" strokeWidth={2} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[260px] text-center">
                  <Trans>
                    This book is a part — its page range is fixed to the assigned
                    subset and cannot be changed.
                  </Trans>
                </TooltipContent>
              </Tooltip>
            ) : (
              <HelpHint
                ariaLabel={t`Page range help`}
                content={t`In case you don't want to convert the whole book, adjust the sliders to define which pages will be digitized.`}
              />
            )
          }
          hint={
            isPart ? (
              <Trans>
                This book is a part — its page range is fixed to the assigned
                subset and cannot be changed.
              </Trans>
            ) : undefined
          }
        >
          <RangeSlider
            label={t`Page Range`}
            hideLabel
            min={1}
            max={totalPages || 1}
            startLabel={t`Initial Page`}
            endLabel={t`Final Page`}
            value={pageRange}
            onChange={setDragRange}
            onCommit={commitPageRange}
            disabled={pageRangeDisabled}
            readOnly={isPart}
          />
        </SettingsField>
      </SettingsCard>

      <SettingsCard>
        <SettingsField
          label={<Trans>Page Grouping Mode</Trans>}
          labelAction={
            <SettingExplainer
              visual={<PageGroupingVisual />}
            />
          }
          hint={
            <Trans>
              Use Spread for printed books with facing-page layouts (covers
              stay solo, then 2+3, 4+5, …). Use Single when each PDF page
              should be processed on its own.
            </Trans>
          }
        >
          <SegmentedControl
            options={spreadOptions}
            value={spreadMode}
            onValueChange={handleSpreadModeChange}
          />
        </SettingsField>
      </SettingsCard>

      <SettingsCard>
        <SettingsField
          label={<Trans>Figure Extraction</Trans>}
          hint={
            <Trans>
              Auto preserves charts, labeled images, and complex infographics as
              single assets while leaving styled headings, callouts, and
              conventional tables for accessible HTML. All keeps every composite
              candidate. Off prevents PDF text from being merged into figures.
            </Trans>
          }
        >
          <SegmentedControl
            options={figureExtractionOptions}
            value={figureExtractionMode}
            onValueChange={handleFigureExtractionModeChange}
          />
        </SettingsField>
      </SettingsCard>

      <ToggleCard
        title={<Trans>Remove Watermarks</Trans>}
        description={
          <Trans>
            Detects text stamped identically across pages — like a diagonal
            &ldquo;for online reading only&rdquo; notice — and removes it from
            page renders, extracted figures, and the book text. Turn off to
            keep pages exactly as printed.
          </Trans>
        }
        checked={removeWatermarks}
        onCheckedChange={handleRemoveWatermarksChange}
      />
    </StepLandingShell>
  )
}
