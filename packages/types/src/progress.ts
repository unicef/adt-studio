import { z } from "zod"

export const StepName = z.enum(["extract", "metadata", "text-classification", "image-classification", "page-sectioning", "web-rendering"])
export type StepName = z.infer<typeof StepName>

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
    type: z.literal("step-error"),
    step: StepName,
    error: z.string(),
  }),
])
export type ProgressEvent = z.infer<typeof ProgressEvent>
