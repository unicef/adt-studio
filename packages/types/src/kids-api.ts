import { z } from "zod"
import { KIDS_BUDDY_IDS, KIDS_OPENAI_VOICES } from "./kids.js"

const KidsBuddyIdSchema = z.enum(KIDS_BUDDY_IDS)
const KidsOpenAiVoiceSchema = z.enum(KIDS_OPENAI_VOICES)

export const KidsModeConfigSchema = z
  .object({
    enabled: z.boolean(),
    buddies: z
      .array(KidsBuddyIdSchema)
      .min(1)
      .max(KIDS_BUDDY_IDS.length)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Buddy ids must be unique",
      }),
  })
  .strict()
export type KidsModeConfig = z.infer<typeof KidsModeConfigSchema>

export const GenerateKidsVoiceRequestSchema = z
  .object({
    languages: z.array(z.string().min(1)).optional(),
    characters: z.array(z.string().min(1)).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict()
export type GenerateKidsVoiceRequest = z.infer<
  typeof GenerateKidsVoiceRequestSchema
>

export const TranslateKidsInterfaceRequestSchema = z
  .object({
    languages: z.array(z.string().min(1)).optional(),
  })
  .strict()
export type TranslateKidsInterfaceRequest = z.infer<
  typeof TranslateKidsInterfaceRequestSchema
>

export const KidsVoiceOverrideRequestSchema = z
  .object({
    voice: KidsOpenAiVoiceSchema,
    instructions: z.string().trim().min(1),
  })
  .strict()
export type KidsVoiceOverrideRequest = z.infer<
  typeof KidsVoiceOverrideRequestSchema
>

export const KidsVoicesFileSchema = z
  .object({
    overrides: z.record(
      z.string(),
      z
        .object({
          voice: z.string(),
          instructions: z.string(),
        })
        .strict(),
    ),
  })
  .strict()
export type KidsVoicesFile = z.infer<typeof KidsVoicesFileSchema>

export const KidsVoiceLanguageStatusSchema = z.object({
  language: z.string(),
  hasPack: z.boolean(),
  clipCount: z.number().int().nonnegative(),
  characters: z.array(z.string()),
  completeCharacters: z.array(z.string()),
  narratorReady: z.boolean(),
})
export type KidsVoiceLanguageStatus = z.infer<
  typeof KidsVoiceLanguageStatusSchema
>

export const KidsVoiceStatusSchema = z.object({
  languages: z.array(KidsVoiceLanguageStatusSchema),
})
export type KidsVoiceStatus = z.infer<typeof KidsVoiceStatusSchema>

export const KidsVoiceClipSummarySchema = z.object({
  language: z.string(),
  character: z.string(),
  lineKey: z.string(),
  fileName: z.string(),
  cached: z.boolean(),
})
export type KidsVoiceClipSummary = z.infer<
  typeof KidsVoiceClipSummarySchema
>

export const KidsVoiceGenerationSummarySchema = z.object({
  languages: z.array(z.string()),
  characters: z.array(z.string()),
  model: z.string(),
  total: z.number().int().nonnegative(),
  generated: z.number().int().nonnegative(),
  cachedHits: z.number().int().nonnegative(),
  dryRun: z.boolean(),
  clips: z.array(KidsVoiceClipSummarySchema),
})
export type KidsVoiceGenerationSummary = z.infer<
  typeof KidsVoiceGenerationSummarySchema
>

export const KidsBuddyVoiceOverrideSchema = z.object({
  id: KidsBuddyIdSchema,
  voice: KidsOpenAiVoiceSchema,
  instructions: z.string(),
  isDefault: z.boolean(),
})
export type KidsBuddyVoiceOverride = z.infer<
  typeof KidsBuddyVoiceOverrideSchema
>

export const KidsVoicesResponseSchema = z.object({
  voices: z.array(KidsOpenAiVoiceSchema),
  buddies: z.array(KidsBuddyVoiceOverrideSchema),
})
export type KidsVoicesResponse = z.infer<typeof KidsVoicesResponseSchema>

export const TranslateKidsInterfaceResponseSchema = z.object({
  languages: z.array(z.string()),
  keyCount: z.number().int().nonnegative(),
})
export type TranslateKidsInterfaceResponse = z.infer<
  typeof TranslateKidsInterfaceResponseSchema
>

export const KidsInterfaceLanguageStatusSchema = z.object({
  language: z.string(),
  ready: z.boolean(),
  missingKeys: z.array(z.string()),
})
export type KidsInterfaceLanguageStatus = z.infer<
  typeof KidsInterfaceLanguageStatusSchema
>

export const KidsInterfaceStatusSchema = z.object({
  ready: z.boolean(),
  sourceKeyCount: z.number().int().nonnegative(),
  languages: z.array(KidsInterfaceLanguageStatusSchema),
})
export type KidsInterfaceStatus = z.infer<typeof KidsInterfaceStatusSchema>
