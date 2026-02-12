import { z } from "zod"
import { ImageFilters } from "./image-classification.js"

export const RateLimitConfig = z.object({
  requests_per_minute: z.number().int().min(1),
})
export type RateLimitConfig = z.infer<typeof RateLimitConfig>

export const StepConfig = z.object({
  prompt: z.string().optional(),
  model: z.string().optional(),
  max_retries: z.number().int().min(0).optional(),
  timeout: z.number().int().min(1).optional(),
})
export type StepConfig = z.infer<typeof StepConfig>

export const BookFormat = z.enum(["web", "epub", "webpub"])
export type BookFormat = z.infer<typeof BookFormat>

export const LayoutType = z.enum(["textbook", "storybook", "reference"])
export type LayoutType = z.infer<typeof LayoutType>

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

export const AppConfig = z.object({
  text_types: z.record(z.string(), z.string()),
  text_group_types: z.record(z.string(), z.string()),
  section_types: z.record(z.string(), z.string()).optional(),
  pruned_text_types: z.array(z.string()).optional(),
  pruned_section_types: z.array(z.string()).optional(),
  text_classification: StepConfig.optional(),
  metadata: StepConfig.optional(),
  page_sectioning: StepConfig.optional(),
  default_render_strategy: z.string().optional(),
  render_strategies: z.record(z.string(), RenderStrategyConfig).optional(),
  section_render_strategies: z.record(z.string(), z.string()).optional(),
  image_filters: ImageFilters.optional(),
  concurrency: z.number().int().min(1).optional(),
  rate_limit: RateLimitConfig.optional(),
  editing_language: z.string().optional(),
  output_languages: z.array(z.string()).optional(),
  book_format: z.array(BookFormat).optional(),
  layout_type: LayoutType.optional(),
})
export type AppConfig = z.infer<typeof AppConfig>

export interface TypeDef {
  key: string
  description: string
}
