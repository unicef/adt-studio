import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { useLingui, Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { usePresetRecommendations } from "@/components/wizard/usePresetRecommendations"
import { PRESETS, getPresetAccent } from "@/components/wizard/constants"
import { SingleValueSlider, RangeSlider } from "@/components/ui/range-slider"
import { ImageProcessingFeatureSwitch } from "./ImageProcessingFeatureSwitch"
import { useDelayedPreviewFocus } from "@/components/wizard"

function parseMinSidePx(raw: string): number {
  const n = parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const MIN_SIDE_SLIDER_MAX = 2048

const MIN_DIM_LABEL = msg`Minimum image dimension`
const MIN_DIM_NONE = msg`None`
const MIN_DIM_HELP = msg`Leave at None to run segmentation on all qualifying images (subject to pipeline rules).`
const VALUE_UNIT_PX = msg`px`

const TITLE_ACTIVITIES = msg`Activity Converter`
const SUBTITLE_ACTIVITIES = msg`Detects activities already present in the book and transforms them into interactive HTML elements like radio buttons and text inputs.`

const TITLE_FIGURE_EXTRACTION = msg`Figure Extraction`
const SUBTITLE_FIGURE_EXTRACTION = msg`Detects complex charts and figures that contain a mix of text, vectors and images and crops them out of the page.`

const TITLE_SMART_CROPPING = msg`Smart Cropping`
const SUBTITLE_SMART_CROPPING = msg`Best for complex content like textbooks - automatically trims stray text, artifacts, and extra margins from extracted images.`

const TITLE_SEGMENTATION = msg`Image Segmentation`
const SUBTITLE_SEGMENTATION = msg`Detects and splits composited illustrations into separate regions so each asset can be placed and refined on its own.`

const FILTER_LABEL = msg`Image Filter Size`
const FILTER_MIN_LABEL = msg`Min Size (px)`
const FILTER_MAX_LABEL = msg`Max Size (px)`

function SegmentationThresholdPanel({
  segmentationMinSide,
  onMinSideChange,
  disabled,
  color,
  id,
}: {
  segmentationMinSide: string
  onMinSideChange: (v: string) => void
  disabled: boolean
  color?: string
  id?: string
}) {
  const { i18n } = useLingui()
  // Preview focus id (not user-visible).
  // eslint-disable-next-line lingui/no-unlocalized-strings -- ImageProcessingPreviewFocus key
  const { onMouseEnter, onMouseLeave } = useDelayedPreviewFocus("minSide")
  const px = parseMinSidePx(segmentationMinSide)

  return (
    <div
      id={id}
      className={cn(
        "mt-3 rounded-lg border border-border bg-white px-4 py-3 shadow-sm transition-colors",
        !disabled && "hover:bg-muted hover:border-input",
      )}
      onMouseEnter={() => {
        if (!disabled) onMouseEnter()
      }}
      onMouseLeave={onMouseLeave}
    >
      <SingleValueSlider
        label={i18n._(MIN_DIM_LABEL)}
        min={0}
        max={MIN_SIDE_SLIDER_MAX}
        value={px}
        onChange={(n) => onMinSideChange(n === 0 ? "" : String(n))}
        disabled={disabled}
        minValueLabel={i18n._(MIN_DIM_NONE)}
        valueUnit={i18n._(VALUE_UNIT_PX)}
        color={color}
      />
      <p className="mt-3 text-sm text-muted-foreground">{i18n._(MIN_DIM_HELP)}</p>
    </div>
  )
}

export function Step3() {
  const form = useWizardForm()
  const { i18n } = useLingui()
  const recommendations = usePresetRecommendations()
  const selectedPresetId = useStore(form.store, (s) => s.values.selectedPreset)
  const renderStrategy = useStore(form.store, (s) => s.values.renderStrategy)
  const preset = PRESETS.find((p) => p.id === selectedPresetId)
  const accent = getPresetAccent(selectedPresetId)
  // eslint-disable-next-line lingui/no-unlocalized-strings -- ImageProcessingPreviewFocus key
  const filterSizeHover = useDelayedPreviewFocus("filterSize")

  const activitiesGenerator = useStore(form.store, (s) => s.values.activitiesGenerator)
  const figureExtraction = useStore(form.store, (s) => s.values.figureExtraction)
  const imageCropping = useStore(form.store, (s) => s.values.imageCropping)
  const imageSegmentation = useStore(form.store, (s) => s.values.imageSegmentation)
  const segmentationMinSide = useStore(form.store, (s) => s.values.segmentationMinSide)
  const imageFilterMinSide = useStore(form.store, (s) => s.values.imageFilterMinSide)
  const imageFilterMaxSide = useStore(form.store, (s) => s.values.imageFilterMaxSide)

  if (renderStrategy === "fixed_layout") {
    return (
      <div className="flex w-full flex-col gap-4 p-8">
        <div
          className="rounded-lg border border-dashed px-5 py-6"
          style={{ borderColor: accent.bg, backgroundColor: `${accent.bg}0d` }}
        >
          <h3 className="text-sm font-semibold text-[#0a0a0a]">
            <Trans>No content processing needed</Trans>
          </h3>
          <p className="mt-2 text-sm text-[#525252]">
            <Trans>
              Fixed-layout books use the original page images as backgrounds with positioned text extracted from the PDF. Activities detection, figure extraction, and image cropping or segmentation don't apply to this layout.
            </Trans>
          </p>
          <p className="mt-2 text-sm text-[#525252]">
            <Trans>Click Next to continue to language settings.</Trans>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-8 p-8">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-[#737373]">
          <Trans>Activities</Trans>
        </p>
        <ImageProcessingFeatureSwitch
          id="wizard-activities-generator"
          title={i18n._(TITLE_ACTIVITIES)}
          subtitle={i18n._(SUBTITLE_ACTIVITIES)}
          previewFocus="activities"
          checked={activitiesGenerator}
          onCheckedChange={(checked) => form.setFieldValue("activitiesGenerator", checked)}
          recommended={recommendations.activitiesGenerator === true}
          presetLabel={preset?.title}
          accent={accent}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-[#737373]">
          <Trans>Images</Trans>
        </p>

        <ImageProcessingFeatureSwitch
          id="wizard-figure-extraction"
          title={i18n._(TITLE_FIGURE_EXTRACTION)}
          subtitle={i18n._(SUBTITLE_FIGURE_EXTRACTION)}
          previewFocus="figureExtraction"
          checked={figureExtraction}
          onCheckedChange={(checked) => form.setFieldValue("figureExtraction", checked)}
          recommended={recommendations.figureExtraction === true && selectedPresetId !== "textbook"}
          presetLabel={preset?.title}
          accent={accent}
        />

        <ImageProcessingFeatureSwitch
          id="wizard-image-cropping"
          title={i18n._(TITLE_SMART_CROPPING)}
          subtitle={i18n._(SUBTITLE_SMART_CROPPING)}
          previewFocus="cropping"
          checked={imageCropping}
          onCheckedChange={(checked) => form.setFieldValue("imageCropping", checked)}
          recommended={recommendations.imageCropping === true}
          presetLabel={preset?.title}
          accent={accent}
        />

        <div className="flex w-full flex-col">
          <ImageProcessingFeatureSwitch
            id="wizard-image-segmentation"
            title={i18n._(TITLE_SEGMENTATION)}
            subtitle={i18n._(SUBTITLE_SEGMENTATION)}
            previewFocus="segmentation"
            checked={imageSegmentation}
            onCheckedChange={(checked) => form.setFieldValue("imageSegmentation", checked)}
            recommended={recommendations.imageSegmentation === true && selectedPresetId !== "textbook"}
            presetLabel={preset?.title}
            accent={accent}
          />
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
              imageSegmentation ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div
              className={cn(
                "min-h-0 overflow-hidden transition-[opacity,transform] duration-300 ease-in-out motion-reduce:transition-none",
                imageSegmentation
                  ? "opacity-100 translate-y-0"
                  : "pointer-events-none opacity-0 -translate-y-1",
              )}
              aria-hidden={!imageSegmentation}
              inert={!imageSegmentation ? true : undefined}
            >
              <SegmentationThresholdPanel
                id="wizard-segmentation-min-side"
                segmentationMinSide={segmentationMinSide}
                onMinSideChange={(v) => form.setFieldValue("segmentationMinSide", v)}
                disabled={!imageSegmentation}
                color={accent.bg}
              />
            </div>
          </div>
        </div>

        <div
          className={cn(
            "rounded-lg border border-border bg-white px-4 py-3 shadow-sm transition-colors",
            "hover:bg-muted hover:border-input",
          )}
          onMouseEnter={filterSizeHover.onMouseEnter}
          onMouseLeave={filterSizeHover.onMouseLeave}
        >
          <RangeSlider
            label={i18n._(FILTER_LABEL)}
            min={0}
            max={10000}
            value={[imageFilterMinSide, imageFilterMaxSide]}
            onChange={([lo, hi]) => {
              form.setFieldValue("imageFilterMinSide", lo)
              form.setFieldValue("imageFilterMaxSide", hi)
            }}
            startLabel={i18n._(FILTER_MIN_LABEL)}
            endLabel={i18n._(FILTER_MAX_LABEL)}
            color={accent.bg}
          />
        </div>
      </div>
    </div>
  )
}
