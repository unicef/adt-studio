import { z } from "zod"

export const TextEntry = z.object({
  textType: z.string(),
  text: z.string(),
  isPruned: z.boolean(),
})
export type TextEntry = z.infer<typeof TextEntry>

export const TextGroup = z.object({
  groupId: z.string(),
  groupType: z.string(),
  texts: z.array(TextEntry),
})
export type TextGroup = z.infer<typeof TextGroup>

export const TextClassificationOutput = z.object({
  reasoning: z.string(),
  groups: z.array(TextGroup),
})
export type TextClassificationOutput = z.infer<typeof TextClassificationOutput>

/**
 * Build an LLM-facing schema for text classification.
 * Enum fields use z.string() so invalid values are caught by our validate
 * callback (which feeds errors back to the LLM) instead of causing a
 * NoObjectGeneratedError that retries blindly.
 */
export function buildTextClassificationLLMSchema() {
  return z.object({
    reasoning: z.string(),
    groups: z.array(
      z.object({
        group_type: z.string(),
        texts: z.array(
          z.object({
            text_type: z.string(),
            text: z.string(),
          })
        ),
      })
    ),
  })
}
