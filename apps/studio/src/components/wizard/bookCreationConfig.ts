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

  const config: Record<string, unknown> = {
    ...baseConfig,
    default_render_strategy: values.renderStrategy,
    page_sectioning: { mode: values.sectioningMode },
    spread_mode: values.pageGrouping === "spread",
    vector_text_grouping: values.figureExtraction,
    apply_body_background: true,
    // Single flag governs activities everywhere (sectioning + web-rendering),
    // via the `activity_` prefix — no hand-maintained type list to drift.
    // Activities are off when the user disabled the generator, or for
    // fixed-layout books (activities are baked into the page image, so
    // detecting them as their own interactive sections just adds noise —
    // still overridable on the Sectioning page).
    ...((!values.activitiesGenerator || values.renderStrategy === "fixed_layout") && {
      generate_activities: false,
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
  // Only a "range" scope bakes a global page window into the book. "whole"
  // processes every page; "split" treats the whole book as the canonical basis
  // and sets per-part windows at export time — neither writes start/end_page.
  if (values.scope === "range") {
    if (validPageRange && parsedStartPage !== undefined) config.start_page = parsedStartPage
    if (validPageRange && parsedEndPage !== undefined) config.end_page = parsedEndPage
  }
  if (values.imageSegmentation && values.segmentationMinSide.trim()) {
    const n = Number(values.segmentationMinSide.trim())
    if (Number.isInteger(n) && n >= 0) config.image_segmentation = { min_side: n }
  }

  return config
}
