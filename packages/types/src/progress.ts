import { z } from "zod"
import { LLMErrorClass } from "./llm-error.js"
import { StepName, StageName } from "./pipeline.js"

export const ProgressEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("page-error-skipped"),
    step: StepName,
    pageId: z.string(),
    errorClass: LLMErrorClass,
    requestId: z.string().optional(),
    attemptCount: z.number().int().nonnegative().optional(),
  }),
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
    message: z.string().optional(),
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
    type: z.literal("stage-complete"),
    stage: StageName,
  }),
  z.object({
    type: z.literal("stage-error"),
    stage: StageName,
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
