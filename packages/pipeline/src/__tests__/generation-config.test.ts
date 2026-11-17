import { expect, it } from "vitest"
import { AppConfig } from "@adt/types"
import { sectioningConfigInputs, storyboardConfigInputs } from "../generation-config.js"

it("requires an explicit publication-guard decision for every new application setting", () => {
  // Extraction inputs are already persisted/version-bound; other downstream
  // output, agent, UI and scheduling preferences do not drive these generators.
  const unrelated = [
    "accessibility_assessment",
    "agents",
    "apply_body_background",
    "book_format",
    "book_summary",
    "concurrency",
    "core_tts",
    "default_image_generation_model",
    "default_settings",
    "default_speech_generation_model",
    "easy_read",
    "epub_glossary",
    "figure_extraction_mode",
    "font_assignment",
    "glossary",
    "glossary_amount",
    "glossary_seed_terms",
    "glossary_user_prompt",
    "image_captioning",
    "image_captioning_grade_level",
    "image_captioning_user_prompt",
    "image_cropping",
    "image_filters",
    "image_meaningfulness",
    "image_segmentation",
    "image_translation",
    "layout_type",
    "locked_settings",
    "metadata",
    "quiz_generation",
    "rate_limit",
    "remove_watermarks",
    "reviewer_validation",
    "speech",
    "split_mode",
    "spread_mode",
    "spread_pairs",
    "toc_generation",
    "toc_mode",
    "translation_evaluation",
    "vector_text_grouping",
  ]
  const config = AppConfig.parse({ structure_types: {}, role_types: {} })
  const projected = new Set([...Object.keys(sectioningConfigInputs(config)), ...Object.keys(storyboardConfigInputs(config))]
    .filter(key => key !== "fixedLayout" && key !== "sectioningMode"))
  expect(unrelated.filter(key => projected.has(key))).toEqual([])
  expect([...new Set([...projected, ...unrelated])].sort()).toEqual(Object.keys(AppConfig.innerType().shape).sort())
})
