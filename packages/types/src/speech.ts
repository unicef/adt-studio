import { z } from "zod"

export const SpeechConfig = z.object({
  model: z.string().optional(),
  format: z.string().optional(),
  voice: z.string().optional(),
  voices_config: z.string().optional(),
  instructions_config: z.string().optional(),
})
export type SpeechConfig = z.infer<typeof SpeechConfig>

export const SpeechFileEntry = z.object({
  textId: z.string(),
  language: z.string(),
  fileName: z.string(),
  voice: z.string(),
  model: z.string(),
  cached: z.boolean(),
})
export type SpeechFileEntry = z.infer<typeof SpeechFileEntry>

export const TTSOutput = z.object({
  entries: z.array(SpeechFileEntry),
  generatedAt: z.string(),
})
export type TTSOutput = z.infer<typeof TTSOutput>
