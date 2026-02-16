import { z } from "zod"

export const TextCatalogEntry = z.object({
  id: z.string(),
  text: z.string(),
})
export type TextCatalogEntry = z.infer<typeof TextCatalogEntry>

export const TextCatalogOutput = z.object({
  entries: z.array(TextCatalogEntry),
  generatedAt: z.string(),
})
export type TextCatalogOutput = z.infer<typeof TextCatalogOutput>
