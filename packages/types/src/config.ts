import { z } from "zod"
import { ImageFilters } from "./image-classification.js"

export const StepConfig = z.object({
  prompt: z.string().optional(),
  model: z.string().optional(),
  concurrency: z.number().int().min(1).optional(),
})
export type StepConfig = z.infer<typeof StepConfig>

export const AppConfig = z.object({
  text_types: z.record(z.string(), z.string()),
  text_group_types: z.record(z.string(), z.string()),
  pruned_text_types: z.array(z.string()).optional(),
  text_classification: StepConfig.optional(),
  metadata: StepConfig.optional(),
  image_filters: ImageFilters.optional(),
})
export type AppConfig = z.infer<typeof AppConfig>

export interface TypeDef {
  key: string
  description: string
}
