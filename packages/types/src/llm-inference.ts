import { z } from "zod"

/** Non-secret, effective request identity, resolved before caching. */
export const InferenceOptions = z.object({
  providerOptions: z.record(z.unknown()).optional(),
  endpoint: z.string().optional(),
})
export type InferenceOptions = z.infer<typeof InferenceOptions>

/** Opaque Responses output replayed with tool results, including encrypted reasoning. */
export const ProviderContinuation = z.array(z.record(z.unknown()))
export type ProviderContinuation = z.infer<typeof ProviderContinuation>

export const SolReasoningEffort = z.enum(["low", "medium", "high", "xhigh", "max"])
export type SolReasoningEffort = z.infer<typeof SolReasoningEffort>

export const OpenAiResponse = z.object({
  model: z.string(),
  status: z.string(),
  output: ProviderContinuation,
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    input_tokens_details: z.object({ cached_tokens: z.number().optional() }).optional(),
    output_tokens_details: z.object({ reasoning_tokens: z.number().optional() }).optional(),
  }),
})
export type OpenAiResponse = z.infer<typeof OpenAiResponse>
