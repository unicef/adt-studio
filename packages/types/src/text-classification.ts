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
 * Build an LLM-facing schema with enum-constrained types.
 * The LLM sees restricted enums; we store with string types for flexibility.
 */
export function buildTextClassificationLLMSchema(
  textTypes: [string, ...string[]],
  groupTypes: [string, ...string[]]
) {
  return z.object({
    reasoning: z.string(),
    groups: z.array(
      z.object({
        group_type: z.enum(groupTypes),
        texts: z.array(
          z.object({
            text_type: z.enum(textTypes),
            text: z.string(),
          })
        ),
      })
    ),
  })
}
