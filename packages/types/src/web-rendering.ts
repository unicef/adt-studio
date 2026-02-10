import { z } from "zod"

export const SectionRendering = z.object({
  sectionIndex: z.number().int(),
  sectionType: z.string(),
  reasoning: z.string(),
  html: z.string(),
})
export type SectionRendering = z.infer<typeof SectionRendering>

export const WebRenderingOutput = z.object({
  sections: z.array(SectionRendering),
})
export type WebRenderingOutput = z.infer<typeof WebRenderingOutput>

export const webRenderingLLMSchema = z.object({
  reasoning: z.string(),
  content: z.string(),
})
