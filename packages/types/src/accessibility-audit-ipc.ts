import { z } from "zod"

export const accessibilityAuditIpcViewportSchema = z.object({
  width: z.number().finite().positive().int(),
  height: z.number().finite().positive().int(),
})

export const accessibilityAuditIpcRequestSchema = z.object({
  type: z.literal("axe-audit"),
  id: z.string().uuid(),
  filePath: z.string().min(1),
  ruleIds: z.array(z.string()),
  viewport: accessibilityAuditIpcViewportSchema.optional(),
})

export const accessibilityAuditIpcCloseSchema = z.object({
  type: z.literal("axe-audit-close"),
})

export const accessibilityAuditIpcUtilityToMainSchema = z.discriminatedUnion(
  "type",
  [accessibilityAuditIpcRequestSchema, accessibilityAuditIpcCloseSchema]
)

/**
 * Raw axe-core findings travel as opaque JSON — normalization happens on the
 * utility-process side so we can reuse normalizeFinding without pulling
 * @adt/pipeline into the Electron main process.
 */
export const accessibilityAuditIpcReplySuccessSchema = z.object({
  type: z.literal("axe-audit-reply"),
  id: z.string().uuid(),
  title: z.string().nullable(),
  violations: z.array(z.unknown()),
  incomplete: z.array(z.unknown()),
  passCount: z.number().int().nonnegative(),
  inapplicableCount: z.number().int().nonnegative(),
})

export const accessibilityAuditIpcReplyErrorSchema = z.object({
  type: z.literal("axe-audit-reply"),
  id: z.string().uuid(),
  error: z.string(),
})

export const accessibilityAuditIpcReplySchema = z.union([
  accessibilityAuditIpcReplySuccessSchema,
  accessibilityAuditIpcReplyErrorSchema,
])

export type AccessibilityAuditIpcUtilityToMain = z.infer<
  typeof accessibilityAuditIpcUtilityToMainSchema
>
export type AccessibilityAuditIpcReply = z.infer<typeof accessibilityAuditIpcReplySchema>
