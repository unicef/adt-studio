import type { WizardFormValues } from "./wizardForm"
import { PRESETS } from "./constants"

function parsePositiveInt(raw: string): number | undefined {
  const n = Number(raw.trim())
  return raw.trim() && Number.isInteger(n) && n >= 1 ? n : undefined
}

export function buildConfigOverrides(values: WizardFormValues): Record<string, unknown> {
  const parsedStartPage = parsePositiveInt(values.startPage)
  const parsedEndPage = parsePositiveInt(values.endPage)
  const validPageRange =
    parsedStartPage === undefined || parsedEndPage === undefined || parsedStartPage <= parsedEndPage

  const preset = PRESETS.find((p) => p.id === values.selectedPreset)
  const baseConfig = preset?.baseConfig ?? {}
  const baseImageFilters = (baseConfig.image_filters ?? {}) as Record<string, unknown>

  const renderStrategies = (baseConfig.render_strategies ?? {}) as Record<string, { render_type?: string }>
  const activityTypeNames = Object.keys(renderStrategies).filter(
    (name) => renderStrategies[name].render_type === "activity"
  )

  const config: Record<string, unknown> = {
    ...baseConfig,
    default_render_strategy: values.renderStrategy,
    page_sectioning: { mode: values.sectioningMode },
    spread_mode: values.pageGrouping === "spread",
    vector_text_grouping: values.figureExtraction,
    apply_body_background: true,
    ...(!values.activitiesGenerator && activityTypeNames.length > 0 && {
      disabled_section_types: activityTypeNames,
    }),
    image_filters: {
      ...baseImageFilters,
      min_side: values.imageFilterMinSide,
      max_side: values.imageFilterMaxSide,
      cropping: values.imageCropping,
      segmentation: values.imageSegmentation,
      // Fixed-layout treats every extracted image as positioned page content
      // (speech bubbles, decorative strips, captions all matter visually).
      // Override the size / complexity / meaningfulness filters so nothing is
      // pruned at extract time except the full-page render itself (handled
      // separately by image-filtering's `_page` rule). The book config is
      // honest about what will run; users can flip any of these back on in
      // Extract Settings. `max_side: undefined` makes js-yaml omit the key
      // entirely, so the pipeline's max-side check is skipped.
      ...(values.renderStrategy === "fixed_layout" && {
        min_side: 0,
        max_side: undefined,
        min_stddev: 0,
        meaningfulness: false,
      }),
    },
  }

  if (values.selectedPreset && values.selectedPreset !== "custom") {
    config.layout_type = values.selectedPreset
  }
  if (values.styleguide.trim()) config.styleguide = values.styleguide.trim()
  if (values.editingLanguage.trim()) config.editing_language = values.editingLanguage.trim()
  if (values.outputLanguages.length > 0) config.output_languages = values.outputLanguages
  // When splitting, the whole book is the basis and per-part page windows are
  // set at export time — so don't bake a global page range into the book.
  if (values.intent !== "split") {
    if (validPageRange && parsedStartPage !== undefined) config.start_page = parsedStartPage
    if (validPageRange && parsedEndPage !== undefined) config.end_page = parsedEndPage
  }
  if (values.imageSegmentation && values.segmentationMinSide.trim()) {
    const n = Number(values.segmentationMinSide.trim())
    if (Number.isInteger(n) && n >= 0) config.image_segmentation = { min_side: n }
  }

  return config
}
