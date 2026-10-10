import { z } from "zod"

/** Authorship of content, never inferred from a timestamp or a successful run. */
export const OutputSource = z.enum(["ai", "manual"])
export type OutputSource = z.infer<typeof OutputSource>

export const OutputReference = z.object({
  node: z.string(),
  itemId: z.string(),
  version: z.number().int().positive(),
})
export type OutputReference = z.infer<typeof OutputReference>

export const OutputInputEvidence = z.object({
  signature: z.string(),
  contentHash: z.string(),
  references: z.array(OutputReference).default([]),
})
export type OutputInputEvidence = z.infer<typeof OutputInputEvidence>

/** Review does not change authorship or claim that generation succeeded. */
export const OutputReview = z.object({
  signature: z.string(),
  contentHash: z.string(),
  action: z.enum(["keep", "checked"]),
})
export type OutputReview = z.infer<typeof OutputReview>

export const OutputMetadata = z.object({
  source: OutputSource.optional(),
  input: OutputInputEvidence.optional(),
  review: OutputReview.optional(),
})
export type OutputMetadata = z.infer<typeof OutputMetadata>

export const OutputKind = z.enum([
  "caption", "translation", "easy-read", "preparation", "audio", "timestamps", "image-translation",
])
export type OutputKind = z.infer<typeof OutputKind>

export const OutputIdentity = z.object({
  kind: OutputKind,
  id: z.string().min(1),
  language: z.string().optional(),
  voiceSlot: z.enum(["primary", "secondary"]).optional(),
})
export type OutputIdentity = z.infer<typeof OutputIdentity>

export const OutputWarning = z.object({
  reason: z.enum(["source-changed", "legacy", "preparation-failed", "preparation-missing", "preparation-outdated", "upstream"]),
  source: OutputIdentity.optional(),
})
export type OutputWarning = z.infer<typeof OutputWarning>

export const OutputStatus = z.object({
  identity: OutputIdentity,
  signature: z.string(),
  contentHash: z.string(),
  usable: z.boolean(),
  current: z.boolean(),
  protected: z.boolean(),
  manual: z.boolean(),
  excluded: z.boolean(),
  missing: z.boolean(),
  updateNeeded: z.boolean(),
  warnings: z.array(OutputWarning),
  pageIds: z.array(z.string()).default([]),
  sectionIds: z.array(z.string()).default([]),
  group: z.enum(["glossary", "quizzes"]).optional(),
})
export type OutputStatus = z.infer<typeof OutputStatus>

export const OutputSelection = z.object({
  pageIds: z.array(z.string()).optional(),
  sectionIds: z.array(z.string()).optional(),
  ids: z.array(z.string()).optional(),
  groups: z.array(z.enum(["glossary", "quizzes"])).optional(),
  languages: z.array(z.string()).optional(),
  voiceSlots: z.array(z.enum(["primary", "secondary"])).optional(),
}).strict()
export type OutputSelection = z.infer<typeof OutputSelection>

export const OutputReviewRequest = z.object({
  identity: OutputIdentity,
  signature: z.string(),
  contentHash: z.string(),
  action: z.enum(["keep", "checked"]),
}).strict()
export type OutputReviewRequest = z.infer<typeof OutputReviewRequest>

export const OutputSummary = z.object({
  updates: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
})
export type OutputSummary = z.infer<typeof OutputSummary>

export const BookWriterOwner = z.object({
  token: z.string().uuid(),
  pid: z.number().int().positive(),
  host: z.string().min(1),
}).strict()
export type BookWriterOwner = z.infer<typeof BookWriterOwner>
