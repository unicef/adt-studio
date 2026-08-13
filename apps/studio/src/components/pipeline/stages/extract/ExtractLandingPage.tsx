import { useState, useEffect, useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Lock } from "lucide-react"
import { FigureExtractionMode } from "@adt/types"
import { useBook } from "@/hooks/use-books"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { CascadeWarning } from "@/components/pipeline/components/CascadeWarning"
import { SettingsCard, SettingsField } from "@/components/pipeline/components/SettingsCard"
import { SettingExplainer } from "@/components/pipeline/components/SettingExplainer"
import { HelpHint } from "@/components/pipeline/components/HelpHint"
import { ToggleCard } from "@/components/pipeline/components/ToggleCard"
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
import { PageGroupingVisual } from "./components/PageGroupingVisual"
import { ExtractPreview } from "./components/ExtractPreview"

type SpreadModeKey = "single" | "spread"

export function ExtractLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("extract")
  const { data: book } = useBook(bookLabel)
  const { data: sourcePdfInfo, isPending: sourcePdfPending } = useSourcePdfInfo(bookLabel)
  // A book imported as a part is scoped to a fixed page window — show the
  // assigned range read-only so the contributor processes exactly that subset.
  const { data: partInfo } = usePartInfo(bookLabel)
  const isPart = !!partInfo

  const totalPages = sourcePdfInfo?.pageCount ?? book?.pageCount ?? 0

  const [pageRange, setPageRange] = useState<[number, number]>([1, 1])
  const [spreadMode, setSpreadMode] = useState<SpreadModeKey>("single")
  const [figureExtractionMode, setFigureExtractionMode] =
    useState<FigureExtractionMode>("all")
  const [removeWatermarks, setRemoveWatermarks] = useState(false)

  useEffect(() => {
    if (!bookConfigData) return
    const c = bookConfigData.config
    setSpreadMode(c.spread_mode === true ? "spread" : "single")
    setRemoveWatermarks(c.remove_watermarks === true)
    const explicitFigureMode = FigureExtractionMode.safeParse(c.figure_extraction_mode)
    setFigureExtractionMode(
      explicitFigureMode.success
        ? explicitFigureMode.data
        : c.vector_text_grouping === false
          ? "off"
          : "all",
    )
    const start = c.start_page != null ? Number(c.start_page) : 1
    const end = c.end_page != null ? Number(c.end_page) : Math.max(start, totalPages || 1)
    setPageRange([start, end])
  }, [bookConfigData, totalPages])

  const handlePageRangeChange = ([start, end]: [number, number]) => {
    setPageRange([start, end])
    persist({ start_page: start, end_page: end })
  }

  const handleSpreadModeChange = (value: SpreadModeKey) => {
    setSpreadMode(value)
    persist({ spread_mode: value === "spread" })
  }

  const handleFigureExtractionModeChange = (next: FigureExtractionMode) => {
    setFigureExtractionMode(next)
    persist({
      figure_extraction_mode: next,
      // Keep the legacy key synchronized for older ADT Studio versions.
      vector_text_grouping: next !== "off",
    })
  }

  const handleRemoveWatermarksChange = (next: boolean) => {
    setRemoveWatermarks(next)
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
    queueRun({ fromStage: "extract", toStage: "extract", apiKey, viewAfter: true })
  }

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run extraction.</Trans>
  ) : undefined

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="extract"
      settingsTab="general"
      colorClass="bg-blue-600 hover:bg-blue-700"
      accentColor="#2563eb"
      accentColorSoft="#dbeafe"
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
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Extract</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
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
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[#a3a3a3] transition-colors hover:text-[#737373] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
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
            onChange={handlePageRangeChange}
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
              accentColor="#2563eb"
              accentColorSoft="#dbeafe"
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
    </LandingPageShell>
  )
}
