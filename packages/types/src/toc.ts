import { z } from "zod"

export const TocEntry = z.object({
  id: z.string(),
  title: z.string(),
  sectionId: z.string(),
  href: z.string(),
  chapterId: z.string(),
  level: z.number().int().min(1).max(6),
})
export type TocEntry = z.infer<typeof TocEntry>

export const TocGenerationOutput = z.object({
  entries: z.array(TocEntry),
  pageCount: z.number().int(),
  generatedAt: z.string(),
})
export type TocGenerationOutput = z.infer<typeof TocGenerationOutput>

export const tocLLMSchema = z.object({
  reasoning: z.string(),
  entries: z.array(z.object({
    title: z.string(),
    level: z.number().int().min(1).max(6),
    sectionId: z.string(),
  })),
})
