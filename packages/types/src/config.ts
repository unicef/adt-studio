import { z } from "zod"
import { ImageFilters } from "./image-filtering.js"
import { SpeechConfig } from "./speech.js"
import { ReviewerValidationConfig } from "./reviewer-validation-config.js"
import { REFLOWABLE_FONT_SETTINGS } from "./reflowable-fonts.js"

export const DEFAULT_LLM_MAX_RETRIES = 5

export const RateLimitConfig = z.object({
  requests_per_minute: z.number().int().min(1),
})
export type RateLimitConfig = z.infer<typeof RateLimitConfig>

export const StepConfig = z.object({
  prompt: z.string().optional(),
  model: z.string().optional(),
  max_retries: z.number().int().min(0).optional(),
  timeout: z.number().int().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
})
export type StepConfig = z.infer<typeof StepConfig>

export const QuizGenerationConfig = StepConfig.extend({
  pages_per_quiz: z.number().int().min(1).optional(),
  quiz_section_types: z.array(z.string()).optional(),
})
export type QuizGenerationConfig = z.infer<typeof QuizGenerationConfig>

export const EasyReadConfig = StepConfig.extend({
  enabled: z.boolean().optional(),
  batch_size: z.number().int().min(1).optional(),
  tts: z.boolean().optional(),
})
export type EasyReadConfig = z.infer<typeof EasyReadConfig>

export const PageSectioningConfig = StepConfig.extend({
  max_refinements: z.number().int().min(0).optional(),
  mode: z.enum(["page", "dynamic"]).catch("dynamic").optional(),
})
export type PageSectioningConfig = z.infer<typeof PageSectioningConfig>

export const ImageTranslationConfig = StepConfig.extend({
  enabled: z.boolean().optional(),
  /** Image model id (e.g. "openai:gpt-image-2"). When unset, the step is a no-op. */
  image_model: z.string().optional(),
  /** Image IDs the user has chosen to translate. Empty = no images regenerated. */
  selected_image_ids: z.array(z.string()).optional(),
})
export type ImageTranslationConfig = z.infer<typeof ImageTranslationConfig>

export const BookFormat = z.enum(["web", "webpub", "epub"])
export type BookFormat = z.infer<typeof BookFormat>

export const LayoutType = z.enum(["textbook", "storybook", "reference", "custom"])
export type LayoutType = z.infer<typeof LayoutType>

export const StyleguideName = z.string().regex(/^[a-zA-Z0-9_-]+$/)
export type StyleguideName = z.infer<typeof StyleguideName>

export const RenderType = z.enum(["llm", "template", "activity", "fixed_layout"])
export type RenderType = z.infer<typeof RenderType>

export const VisualRefinementStrategyConfig = z.object({
  enabled: z.boolean().optional(),
  max_iterations: z.number().int().min(1).max(50).optional(),
  prompt: z.string().optional(),
  timeout: z.number().int().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
})
export type VisualRefinementStrategyConfig = z.infer<typeof VisualRefinementStrategyConfig>

export const RenderStrategyConfig = z
  .object({
    render_type: RenderType,
    config: z
      .object({
        // llm / activity render type
        prompt: z.string().optional(),
        model: z.string().optional(),
        max_retries: z.number().int().min(0).optional(),
        timeout: z.number().int().min(1).optional(),
        temperature: z.number().min(0).max(2).optional(),
        // activity render type — answer generation prompt
        answer_prompt: z.string().optional(),
        // template render type
        template: z.string().optional(),
        // visual refinement — screenshot-based LLM feedback loop
        visual_refinement: VisualRefinementStrategyConfig.optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.render_type !== "activity" && value.config?.answer_prompt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "answer_prompt is only supported for render_type: activity",
        path: ["config", "answer_prompt"],
      })
    }
  })
export type RenderStrategyConfig = z.infer<typeof RenderStrategyConfig>

export const AccessibilityAssessmentConfig = z.object({
  run_only_tags: z.array(z.string().min(1)).min(1).optional(),
  disabled_rules: z.array(z.string().min(1)).optional(),
})
export type AccessibilityAssessmentConfig = z.infer<typeof AccessibilityAssessmentConfig>

export const AppConfig = z
  .object({
    structure_types: z.record(z.string(), z.string()),
    role_types: z.record(z.string(), z.string()),
    section_types: z.record(z.string(), z.string()).optional(),
    pruned_role_types: z.array(z.string()).optional(),
    pruned_section_types: z.array(z.string()).optional(),
    disabled_section_types: z.array(z.string()).optional(),
    page_sectioning: PageSectioningConfig.optional(),
    translation: StepConfig.optional(),
    metadata: StepConfig.optional(),
    book_summary: StepConfig.optional(),
    quiz_generation: QuizGenerationConfig.optional(),
    easy_read: EasyReadConfig.optional(),
    default_render_strategy: z.string().optional(),
    render_strategies: z.record(z.string(), RenderStrategyConfig).optional(),
    /** Base font for reflowable (non-fixed-layout) output. `auto` (default)
     *  picks the detected serif/sans category's default; an explicit id
     *  overrides. Ignored for fixed-layout books (they keep original fonts). */
    reflowable_font: z.enum(REFLOWABLE_FONT_SETTINGS).optional(),
    visual_review_prompt: z.string().optional(),
    visual_review_max_iterations: z.number().int().min(1).max(50).optional(),
    section_render_strategies: z.record(z.string(), z.string()).optional(),
    storyboard_effort: z.enum(["high", "medium", "relaxed"]).optional(),
    storyboard_activity_mode: z
      .enum(["dynamic", "match_source", "template"])
      .optional(),
    image_filters: ImageFilters.optional(),
    image_meaningfulness: StepConfig.optional(),
    glossary: StepConfig.optional(),
    toc_generation: StepConfig.optional(),
    toc_mode: z.enum(["extract", "dynamic"]).optional(),
    concurrency: z.number().int().min(1).optional(),
    rate_limit: RateLimitConfig.optional(),
    editing_language: z.string().optional(),
    output_languages: z.array(z.string()).optional(),
    book_format: z.array(BookFormat).optional(),
    image_captioning: StepConfig.optional(),
    image_captioning_grade_level: z
      .enum(["early", "middle", "advanced"])
      .optional(),
    image_captioning_user_prompt: z.string().optional(),
    glossary_amount: z
      .enum(["concise", "standard", "comprehensive"])
      .optional(),
    glossary_user_prompt: z.string().optional(),
    glossary_seed_terms: z
      .array(
        z.object({
          id: z.string(),
          word: z.string(),
          definition: z.string(),
          variations: z.array(z.string()).default([]),
          emojis: z.array(z.string()).default([]),
        }),
      )
      .optional(),
    image_translation: ImageTranslationConfig.optional(),
    image_segmentation: StepConfig.extend({
      min_side: z.number().int().min(0).optional(),
    }).optional(),
    image_cropping: StepConfig.optional(),
    layout_type: LayoutType.optional(),
    spread_mode: z.boolean().optional(),
    vector_text_grouping: z.boolean().optional(),
    apply_body_background: z.boolean().optional(),
    generate_activities: z.boolean().optional(),
    start_page: z.number().int().min(1).optional(),
    end_page: z.number().int().min(1).optional(),
    speech: SpeechConfig.optional(),
    styleguide: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
    default_settings: z
      .object({
        dock_layout: z
          .object({
            width: z.enum(["compact", "full"]).optional(),
            position: z.enum(["top", "bottom"]).optional(),
            align: z.enum(["center", "spread"]).optional(),
          })
          .optional(),
        theme: z.enum(["light", "dark", "system"]).optional(),
        icon_size: z.enum(["sm", "md", "lg"]).optional(),
        reduce_motion: z.boolean().optional(),
      })
      .optional(),
    locked_settings: z
      .array(z.enum(["dockLayout", "theme", "iconSize", "reduceMotion"]))
      .optional(),
    accessibility_assessment: AccessibilityAssessmentConfig.optional(),
    reviewer_validation: ReviewerValidationConfig.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.start_page !== undefined &&
      value.end_page !== undefined &&
      value.end_page < value.start_page
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_page"],
        message: "end_page must be greater than or equal to start_page",
      })
    }
  })
export type AppConfig = z.infer<typeof AppConfig>

export interface TypeDef {
  key: string
  description: string
}
