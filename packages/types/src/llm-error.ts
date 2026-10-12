import { z } from "zod"

export const LLMErrorClass = z.enum([
  "connect-timeout",
  "request-timeout",
  "connection-closed",
  "model-output",
  "rate-limit",
  "server-error",
  "unknown",
  "non-retryable",
  "cancelled",
])
export type LLMErrorClass = z.infer<typeof LLMErrorClass>
export const LLMErrorClassification = z.object({
  errorClass: LLMErrorClass,
  retryable: z.boolean(),
  statusCode: z.number().int().optional(),
})
export type LLMErrorClassification = z.infer<typeof LLMErrorClassification>

/** Additive fields: absent on historical records, never inferred as success. */
export const LLMCallDiagnostics = z.object({
  errorClass: LLMErrorClass.optional(),
  retryable: z.boolean().optional(),
  retryDelayMs: z.number().nonnegative().optional(),
  finalError: z.boolean().optional(),
  maxAttempts: z.number().int().positive().optional(),
  providerCall: z.boolean().optional(),
  pageRecovery: z.boolean().optional(),
  outcome: z.enum(["success", "retrying", "failed", "cancelled", "skipped-with-error"]).optional(),
})
export type LLMCallDiagnostics = z.infer<typeof LLMCallDiagnostics>
