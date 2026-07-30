import { z } from "zod"

export const PromptSource = z.enum(["book", "global", "bundled"])
export type PromptSource = z.infer<typeof PromptSource>

export const PromptSaveTarget = z.enum(["book", "global"])
export type PromptSaveTarget = z.infer<typeof PromptSaveTarget>

export const PromptPersistence = z.object({
  source: PromptSource,
  saveTarget: PromptSaveTarget,
  /** User-facing path relative to the owning book or global override root. */
  logicalPath: z.string(),
})
export type PromptPersistence = z.infer<typeof PromptPersistence>

export const PromptResponse = z.object({
  name: z.string(),
  resolvedName: z.string(),
  content: z.string(),
  source: PromptSource,
  modelId: z.string().nullable(),
  version: z.string().optional(),
  revision: z.string(),
  persistence: PromptPersistence,
})
export type PromptResponse = z.infer<typeof PromptResponse>

export const PromptVersionSummary = z.object({
  version: z.string(),
  createdAt: z.string().nullable(),
  content: z.string(),
  isCurrent: z.boolean(),
})
export type PromptVersionSummary = z.infer<typeof PromptVersionSummary>

export const PromptVersionsResponse = z.object({
  name: z.string(),
  resolvedName: z.string(),
  modelId: z.string().nullable(),
  fallbackContent: z.string().nullable(),
  fallbackResolvedName: z.string().nullable(),
  currentVersion: z.string().nullable(),
  isFallbackCurrent: z.boolean(),
  versions: z.array(PromptVersionSummary),
})
export type PromptVersionsResponse = z.infer<typeof PromptVersionsResponse>
