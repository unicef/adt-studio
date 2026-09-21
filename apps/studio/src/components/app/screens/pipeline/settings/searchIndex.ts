import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"
import { rankBySearch, searchTokens } from "@/components/app/search"
import type { StepSettingsTab } from "./slugs"

/**
 * Anchor ids for fields the search can scroll to. A field indexed without an
 * anchor still opens its tab — only the jump-and-flash is missing.
 */
export const STEP_SETTINGS_ANCHORS = {
  extractEditingLanguage: "step-extract-editing-language",
  extractImageFilters: "step-extract-image-filters",
  extractImageSize: "step-extract-image-size",
  extractMinComplexity: "step-extract-min-complexity",
  extractMeaningfulness: "step-extract-meaningfulness",
  extractCropping: "step-extract-cropping",
  extractSegmentation: "step-extract-segmentation",
  extractSegmentationMinSide: "step-extract-segmentation-min-side",
  quizzesPagesPerQuiz: "step-quizzes-pages-per-quiz",
  quizzesMatchStyle: "step-quizzes-match-style",
  quizzesAddQuiz: "step-quizzes-add-quiz",
  quizzesSectionTypes: "step-quizzes-section-types",
  easyReadTemplate: "step-easy-read-template",
  easyReadBatchSize: "step-easy-read-batch-size",
  storyboardStyleguide: "step-storyboard-styleguide",
  storyboardTemperature: "step-storyboard-temperature",
  storyboardDisplay: "step-storyboard-display",
  storyboardMatchDesign: "step-storyboard-match-design",
  storyboardMaxIterations: "step-storyboard-max-iterations",
} as const

export interface StepSettingField {
  stage: string
  tab: string
  label: MessageDescriptor
  hint?: MessageDescriptor
  keywords?: MessageDescriptor
  anchor?: string
}

const A = STEP_SETTINGS_ANCHORS

export const STEP_SETTINGS_FIELDS: StepSettingField[] = [
  // Extract
  {
    stage: "extract",
    tab: "general",
    label: msg`Editing Language`,
    hint: msg`Leave empty to use the book language.`,
    anchor: A.extractEditingLanguage,
  },
  {
    stage: "extract",
    tab: "general",
    label: msg`Image Filters`,
    anchor: A.extractImageFilters,
  },
  { stage: "extract", tab: "general", label: msg`Min side (px)`, anchor: A.extractImageSize },
  { stage: "extract", tab: "general", label: msg`Max side (px)`, anchor: A.extractImageSize },
  {
    stage: "extract",
    tab: "general",
    label: msg`Min complexity`,
    hint: msg`Higher values filter out simple or blank images.`,
    anchor: A.extractMinComplexity,
  },
  {
    stage: "extract",
    tab: "general",
    label: msg`LLM meaningfulness filter`,
    anchor: A.extractMeaningfulness,
  },
  { stage: "extract", tab: "general", label: msg`LLM image cropping`, anchor: A.extractCropping },
  {
    stage: "extract",
    tab: "general",
    label: msg`LLM image segmentation`,
    anchor: A.extractSegmentation,
  },
  { stage: "extract", tab: "metadata-prompt", label: msg`Metadata Extraction Prompt` },
  { stage: "extract", tab: "meaningfulness-prompt", label: msg`Image Meaningfulness Prompt` },
  { stage: "extract", tab: "cropping-prompt", label: msg`Image Cropping Prompt` },
  {
    stage: "extract",
    tab: "segmentation-prompt",
    label: msg`Min image dimension (px)`,
    anchor: A.extractSegmentationMinSide,
  },
  { stage: "extract", tab: "segmentation-prompt", label: msg`Image Segmentation Prompt` },

  // Sectioning
  { stage: "sectioning", tab: "section-types", label: msg`Sectioning Mode` },
  { stage: "sectioning", tab: "section-types", label: msg`Section Types` },
  { stage: "sectioning", tab: "section-types", label: msg`Render Strategy` },
  { stage: "sectioning", tab: "sectioning-prompt", label: msg`Page Sectioning Prompt` },
  { stage: "sectioning", tab: "refinement-prompt", label: msg`Max Refinements` },
  { stage: "sectioning", tab: "refinement-prompt", label: msg`Page Sectioning Refinement Prompt` },
  { stage: "sectioning", tab: "container-types", label: msg`Container Types` },
  { stage: "sectioning", tab: "text-types", label: msg`Text Types` },

  // Storyboard
  { stage: "storyboard", tab: "general", label: msg`Default Render Strategy` },
  { stage: "storyboard", tab: "fonts", label: msg`Book Fonts` },
  { stage: "storyboard", tab: "fonts", label: msg`Attached fonts` },
  {
    stage: "storyboard",
    tab: "rendering-prompt",
    label: msg`Styleguide`,
    anchor: A.storyboardStyleguide,
  },
  {
    stage: "storyboard",
    tab: "rendering-prompt",
    label: msg`Temperature`,
    anchor: A.storyboardTemperature,
  },
  {
    stage: "storyboard",
    tab: "rendering-prompt",
    label: msg`Apply page background colors`,
    anchor: A.storyboardDisplay,
  },
  { stage: "storyboard", tab: "rendering-prompt", label: msg`Rendering Prompt` },
  { stage: "storyboard", tab: "rendering-template", label: msg`Template Rendering` },
  { stage: "storyboard", tab: "activity-prompts", label: msg`Generation Prompt` },
  { stage: "storyboard", tab: "activity-prompts", label: msg`Answer Prompt` },
  { stage: "storyboard", tab: "image-generation", label: msg`Image Generation Prompt` },
  { stage: "storyboard", tab: "image-generation", label: msg`Image Edit Prompt` },
  {
    stage: "storyboard",
    tab: "visual-review-prompt",
    label: msg`Match Design`,
    anchor: A.storyboardMatchDesign,
  },
  {
    stage: "storyboard",
    tab: "visual-review-prompt",
    label: msg`Max Iterations`,
    anchor: A.storyboardMaxIterations,
  },

  // Quizzes
  {
    stage: "quizzes",
    tab: "general",
    label: msg`Pages per Quiz`,
    anchor: A.quizzesPagesPerQuiz,
  },
  {
    stage: "quizzes",
    tab: "general",
    label: msg`Match book style`,
    anchor: A.quizzesMatchStyle,
  },
  { stage: "quizzes", tab: "general", label: msg`Add a quiz`, anchor: A.quizzesAddQuiz },
  {
    stage: "quizzes",
    tab: "general",
    label: msg`Quiz Section Types`,
    anchor: A.quizzesSectionTypes,
  },
  { stage: "quizzes", tab: "prompt", label: msg`Quiz Generation Prompt` },

  // Captions, glossary, ToC
  { stage: "captions", tab: "general", label: msg`Caption Prompt` },
  { stage: "glossary", tab: "general", label: msg`Glossary Prompt` },
  { stage: "toc", tab: "general", label: msg`TOC Generation Prompt` },

  // Easy read
  { stage: "easy-read", tab: "general", label: msg`Prompt template`, anchor: A.easyReadTemplate },
  { stage: "easy-read", tab: "general", label: msg`Batch size`, anchor: A.easyReadBatchSize },
  { stage: "easy-read", tab: "general", label: msg`Easy Read Prompt` },

  // Translate
  { stage: "translate", tab: "general", label: msg`Base Language` },
  { stage: "translate", tab: "general", label: msg`Additional Languages` },
  { stage: "translate", tab: "prompt", label: msg`Translation Prompt` },
  { stage: "translate", tab: "translation-review", label: msg`Review style` },
  { stage: "translate", tab: "translation-review", label: msg`What should the review focus on?` },
  { stage: "translate", tab: "translation-review", label: msg`Audience or reading level` },
  { stage: "translate", tab: "translation-review", label: msg`Guidance for this book` },
  { stage: "translate", tab: "translation-review", label: msg`Judge model` },
  { stage: "translate", tab: "translation-review", label: msg`Retries` },
  { stage: "translate", tab: "translation-review", label: msg`Temperature` },
  { stage: "translate", tab: "translation-review", label: msg`Flag severity threshold` },
  { stage: "translate", tab: "translation-review", label: msg`Review strictness` },
  { stage: "translate", tab: "translation-review", label: msg`Issue types to check` },
  { stage: "translate", tab: "translation-review", label: msg`Suggestion behavior` },
  { stage: "translate", tab: "translation-review", label: msg`Context included` },
  { stage: "translate", tab: "translation-review", label: msg`Style guidance` },
  { stage: "translate", tab: "translation-review", label: msg`Terminology guidance` },
  { stage: "translate", tab: "translation-review", label: msg`Judge instructions` },
  { stage: "translate", tab: "image-translation", label: msg`Image model` },
  { stage: "translate", tab: "image-translation", label: msg`Selected images` },
  { stage: "translate", tab: "image-translation", label: msg`Image translation prompt` },

  // Speech
  { stage: "speech", tab: "general", label: msg`Default Provider` },
  { stage: "speech", tab: "general", label: msg`Format` },
  { stage: "speech", tab: "general", label: msg`Bit Rate` },
  { stage: "speech", tab: "general", label: msg`Sample Rate` },
  { stage: "speech", tab: "general", label: msg`Temperature` },
  { stage: "speech", tab: "general", label: msg`Seed` },
  { stage: "speech", tab: "general", label: msg`Word-level highlighting` },
  {
    stage: "speech",
    tab: "general",
    label: msg`Batch a whole page per request (experimental)`,
  },
  { stage: "speech", tab: "general", label: msg`Use adjacent text as context` },
  { stage: "speech", tab: "general", label: msg`Text Normalization` },
  { stage: "speech", tab: "voices", label: msg`Voice` },
  { stage: "speech", tab: "voices", label: msg`Accent Prompt` },

  // Validation
  { stage: "validation", tab: "general", label: msg`Enabled axe tags` },
  { stage: "validation", tab: "general", label: msg`Disabled axe rules` },
]

const FIELDS_BY_STAGE = STEP_SETTINGS_FIELDS.reduce<Record<string, StepSettingField[]>>(
  (acc, field) => {
    ;(acc[field.stage] ??= []).push(field)
    return acc
  },
  {},
)

export interface RailSearchResult {
  id: string
  kind: "tab" | "field"
  tab: string
  title: string
  sub?: string
  keywords?: string
  anchor?: string
}

/**
 * Ranks the step's own tabs together with the individual fields inside them, so
 * typing a field name surfaces the field rather than only the tab that hides it.
 * Tabs come first in the candidate list, so an equal-scoring tab outranks its
 * fields under the stable sort.
 */
export function rankStepSettings(
  query: string,
  stage: string,
  tabs: StepSettingsTab[],
  i18n: I18n,
): RailSearchResult[] {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return []

  const tabByKey = new Map(tabs.map((tab) => [tab.key, tab.label]))
  const candidates: RailSearchResult[] = tabs.map((tab) => ({
    id: `tab:${tab.key}`,
    kind: "tab",
    tab: tab.key,
    title: tab.label,
  }))

  for (const field of FIELDS_BY_STAGE[stage] ?? []) {
    const tabLabel = tabByKey.get(field.tab)
    if (!tabLabel) continue
    candidates.push({
      id: `field:${field.tab}:${field.label.id ?? ""}`,
      kind: "field",
      tab: field.tab,
      title: i18n._(field.label),
      sub: tabLabel,
      keywords: field.hint ? i18n._(field.hint) : undefined,
      anchor: field.anchor,
    })
  }

  return rankBySearch(candidates, tokens, (item) => ({
    title: item.title,
    extra: `${item.sub ?? ""} ${item.keywords ?? ""}`,
  }))
}
