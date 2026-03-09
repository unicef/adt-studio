import { z } from "zod"

export const StyleguideGenerationOutput = z.object({
  reasoning: z.string(),
  content: z.string(),
  preview_html: z.string(),
})
export type StyleguideGenerationOutput = z.infer<typeof StyleguideGenerationOutput>
