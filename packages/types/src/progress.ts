import { z } from "zod"
import { StepName } from "./pipeline.js"

export const ProgressEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("step-start"),
    step: StepName,
  }),
  z.object({
    type: z.literal("step-progress"),
    step: StepName,
    message: z.string(),
    page: z.number().int().optional(),
    totalPages: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("step-complete"),
    step: StepName,
  }),
  z.object({
    type: z.literal("step-skip"),
    step: StepName,
  }),
  z.object({
    type: z.literal("step-error"),
    step: StepName,
    error: z.string(),
  }),
  z.object({
    type: z.literal("llm-log"),
    step: StepName,
    itemId: z.string(),
    promptName: z.string(),
    modelId: z.string(),
    cacheHit: z.boolean(),
    durationMs: z.number(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    validationErrors: z.array(z.string()).optional(),
  }),
])
export type ProgressEvent = z.infer<typeof ProgressEvent>
