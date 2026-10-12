import { z } from "zod"
import { OutputMetadata } from "./output-freshness.js"

export const GlossaryItem = z.object({
  generationEvidence: OutputMetadata.optional(),
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

/** Editor content never supplies server-owned provenance. */
export const SaveGlossaryRequest = GlossaryOutput.extend({
  baseVersion: z.number().int().nonnegative(),
  items: z.array(GlossaryItem.omit({ source: true, generationEvidence: true })),
})

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
