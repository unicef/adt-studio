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
  requestedModelId: z.string().nullable().optional(),
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

/** Candidate names are filenames, never caller-supplied paths. */
export const PromptName = z.string().regex(/^[a-zA-Z0-9_]{1,512}$/)
export const PromptVersion = z.string().regex(/^\d{8}T\d{6}(?:\d{3})?Z(?:-(?:\d{3}|[a-f0-9-]{36}))?\.liquid$/)
export const PromptRevision = z.string().regex(/^[a-f0-9]{64}$/)
export const PromptMutation = z.object({ revision: PromptRevision }).strict()
export const PromptSave = PromptMutation.extend({ content: z.string().max(2_000_000) })
export const PromptModels = z.object({ models: z.array(z.string().max(256)).max(256) }).strict()

export const PromptSelection = z.object({
  format: z.literal(1),
  id: z.string().uuid(),
  kind: z.enum(["version", "fallback", "default", "flat"]),
  version: PromptVersion.optional(),
  modelId: z.string().nullable(),
  previous: z.string().uuid().nullable(),
}).strict().refine((value) => (value.kind === "version") === (value.version != null))
export type PromptSelection = z.infer<typeof PromptSelection>

export const ResolvedPromptFile = z.object({
  root: z.string(),
  requestedName: z.string(),
  resolvedName: z.string(),
  modelId: z.string().nullable(),
  filePath: z.string(),
  content: z.string(),
  version: z.string().optional(),
  selectionState: z.array(z.string()),
})
export type ResolvedPromptFile = z.infer<typeof ResolvedPromptFile>
