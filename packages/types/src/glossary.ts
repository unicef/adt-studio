import { z } from "zod"

export const GlossaryItem = z.object({
  id: z.string().optional(),
  source: z.enum(["ai", "manual"]).optional(),
  word: z.string(),
  definition: z.string(),
  variations: z.array(z.string()),
  emojis: z.array(z.string()),
  pruned: z.boolean().optional(),
  /** Book image (images table id) illustrating the term on glossary pages. */
  imageId: z.string().optional(),
})
export type GlossaryItem = z.infer<typeof GlossaryItem>

export const GlossaryOutput = z.object({
  items: z.array(GlossaryItem),
  pageCount: z.number().int(),
  generatedAt: z.string(),
})
export type GlossaryOutput = z.infer<typeof GlossaryOutput>

export const glossaryLLMSchema = z.object({
  reasoning: z.string(),
  items: z.array(
    z.object({
      word: z.string(),
      definition: z.string(),
      variations: z.array(z.string()),
      emojis: z.array(z.string()),
    })
  ),
})
