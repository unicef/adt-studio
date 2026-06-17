import { z } from "zod"

export const EasyReadEntry = z.object({
  sourceId: z.string(),
  easyReadId: z.string(),
  originalText: z.string(),
  text: z.string(),
  pageId: z.string(),
  sectionId: z.string(),
  sectionIndex: z.number().int().min(0),
})
export type EasyReadEntry = z.infer<typeof EasyReadEntry>

export const EasyReadSectionBlock = z.object({
  pageId: z.string(),
  pageNumber: z.number().int(),
  sectionId: z.string(),
  sectionIndex: z.number().int().min(0),
  sectionType: z.string(),
  entries: z.array(EasyReadEntry),
})
export type EasyReadSectionBlock = z.infer<typeof EasyReadSectionBlock>

export const EasyReadOutput = z.object({
  blocks: z.array(EasyReadSectionBlock),
  generatedAt: z.string(),
})
export type EasyReadOutput = z.infer<typeof EasyReadOutput>
