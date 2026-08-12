import { z } from "zod"

export const screenshotIpcViewportSchema = z.object({
  width: z.number().finite().positive().int(),
  height: z.number().finite().positive().int(),
})

export const screenshotIpcRequestSchema = z.object({
  type: z.literal("screenshot-base64"),
  id: z.string().uuid(),
  html: z.string(),
  viewport: screenshotIpcViewportSchema.optional(),
  timeoutMs: z.number().finite().positive().int().optional(),
})

export const screenshotIpcCloseSchema = z.object({
  type: z.literal("screenshot-close"),
})

export const screenshotIpcUtilityToMainSchema = z.discriminatedUnion(
  "type",
  [screenshotIpcRequestSchema, screenshotIpcCloseSchema]
)

/** Main → child: success */
export const screenshotIpcReplySuccessSchema = z.object({
  type: z.literal("screenshot-base64-reply"),
  id: z.string().uuid(),
  base64: z.string().min(1),
})

/** Main → child: failure */
export const screenshotIpcReplyErrorSchema = z.object({
  type: z.literal("screenshot-base64-reply"),
  id: z.string().uuid(),
  error: z.string(),
})

export const screenshotIpcReplySchema = z.union([
  screenshotIpcReplySuccessSchema,
  screenshotIpcReplyErrorSchema,
])

export type ScreenshotIpcUtilityToMain = z.infer<
  typeof screenshotIpcUtilityToMainSchema
>
export type ScreenshotIpcReply = z.infer<typeof screenshotIpcReplySchema>
