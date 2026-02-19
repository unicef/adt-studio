import { z } from "zod"
import { ImageFilters } from "./image-classification.js"
import { SpeechConfig } from "./speech.js"

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

export const SectioningMode = z.enum(["section", "page"])
export type SectioningMode = z.infer<typeof SectioningMode>

export const PageSectioningConfig = StepConfig.extend({
  mode: SectioningMode.optional(),
})
export type PageSectioningConfig = z.infer<typeof PageSectioningConfig>

export const BookFormat = z.enum(["web", "epub", "webpub"])
export type BookFormat = z.infer<typeof BookFormat>

export const LayoutType = z.enum(["textbook", "storybook", "reference", "custom"])
export type LayoutType = z.infer<typeof LayoutType>

export const PresetName = z.enum(["textbook", "storybook", "reference"])
export type PresetName = z.infer<typeof PresetName>

export const StyleguideName = z.string().regex(/^[a-zA-Z0-9_-]+$/)
export type StyleguideName = z.infer<typeof StyleguideName>

export const RenderType = z.enum(["llm", "template", "activity"])
export type RenderType = z.infer<typeof RenderType>

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

export const AppConfig = z
  .object({
    text_types: z.record(z.string(), z.string()),
    text_group_types: z.record(z.string(), z.string()),
    section_types: z.record(z.string(), z.string()).optional(),
    pruned_text_types: z.array(z.string()).optional(),
    pruned_section_types: z.array(z.string()).optional(),
    text_classification: StepConfig.optional(),
    translation: StepConfig.optional(),
    metadata: StepConfig.optional(),
    page_sectioning: PageSectioningConfig.optional(),
    quiz_generation: QuizGenerationConfig.optional(),
    default_render_strategy: z.string().optional(),
    render_strategies: z.record(z.string(), RenderStrategyConfig).optional(),
    section_render_strategies: z.record(z.string(), z.string()).optional(),
    image_filters: ImageFilters.optional(),
    glossary: StepConfig.optional(),
    concurrency: z.number().int().min(1).optional(),
    rate_limit: RateLimitConfig.optional(),
    editing_language: z.string().optional(),
    output_languages: z.array(z.string()).optional(),
    book_format: z.array(BookFormat).optional(),
    image_captioning: StepConfig.optional(),
    layout_type: LayoutType.optional(),
    spread_mode: z.boolean().optional(),
    start_page: z.number().int().min(1).optional(),
    end_page: z.number().int().min(1).optional(),
    speech: SpeechConfig.optional(),
    styleguide: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
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
