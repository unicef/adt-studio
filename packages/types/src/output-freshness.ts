import { z } from "zod"
import { StageName } from "./pipeline.js"

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
  reason: z.enum(["source-changed", "source-conflict", "output-conflict", "legacy", "preparation-failed", "preparation-missing", "preparation-outdated", "upstream"]),
  source: OutputIdentity.optional(),
  conflictId: z.string().optional(),
})
export type OutputWarning = z.infer<typeof OutputWarning>

/** Actual source references; page and section membership must stay paired. */
export const OutputLocation = z.object({
  pageId: z.string().optional(),
  sectionId: z.string().optional(),
  group: z.enum(["glossary", "quizzes"]).optional(),
  role: z.string().optional(),
})
export type OutputLocation = z.infer<typeof OutputLocation>

export const OutputStatus = z.object({
  included: z.boolean().optional(),
  text: z.string().optional(),
  sourceText: z.string().optional(),
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
  locations: z.array(OutputLocation).optional(),
  pageIds: z.array(z.string()).default([]),
  sectionIds: z.array(z.string()).default([]),
  group: z.enum(["glossary", "quizzes"]).optional(),
})
export type OutputStatus = z.infer<typeof OutputStatus>

export const OutputSelection = z.object({
  identities: z.array(OutputIdentity).optional(),
  kinds: z.array(OutputKind).optional(),
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
  reviews: z.number().int().nonnegative().optional(),
  updates: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
})
export type OutputSummary = z.infer<typeof OutputSummary>

/** Content status is independent of the most recent generation attempt. */
export const OutputScopeSummary = OutputSummary.extend({
  applicable: z.number().int().nonnegative(),
  current: z.boolean(),
})
export type OutputScopeSummary = z.infer<typeof OutputScopeSummary>
export const OutputSummaries = z.object({
  stages: z.record(OutputScopeSummary),
  pages: z.record(OutputScopeSummary),
  sections: z.record(OutputScopeSummary),
  groups: z.record(OutputScopeSummary),
})
export type OutputSummaries = z.infer<typeof OutputSummaries>

/** Compact sidebar projection. Missing output becomes attention only in
 * `missingStages`, the stages that have been attempted (SPEC-0001 §6). */
export const OutputStageSummaryResponse = z.object({
  stages: z.record(OutputScopeSummary),
  stagesWithoutMissing: z.record(OutputScopeSummary),
  missingStages: z.array(StageName),
})
export type OutputStageSummaryResponse = z.infer<typeof OutputStageSummaryResponse>

export const BookWriterOwner = z.object({
  token: z.string().uuid(),
  pid: z.number().int().positive(),
  host: z.string().min(1),
}).strict()
export type BookWriterOwner = z.infer<typeof BookWriterOwner>

/** Explicit replacement is bound to the content and inputs shown during review. */
export const OutputReplacement = z.object({
  identity: OutputIdentity,
  signature: z.string(),
  contentHash: z.string(),
}).strict()
export type OutputReplacement = z.infer<typeof OutputReplacement>
export const OutputRunScope = z.object({
  selection: OutputSelection.optional(),
  skip: z.array(OutputIdentity).optional(),
  retry: z.array(OutputIdentity).optional(),
  replace: z.array(OutputReplacement).optional(),
}).strict()
export type OutputRunScope = z.infer<typeof OutputRunScope>
export const OutputSkipRequest = z.object({ identities: z.array(OutputIdentity).min(1).max(1000) }).strict()
export type OutputSkipRequest = z.infer<typeof OutputSkipRequest>

export const TranslatedImageAsset = z.object({
  ...OutputMetadata.shape,
  imageId: z.string(), sourceImageId: z.string(), language: z.string(), pageId: z.string(),
  relativePath: z.string().min(1), hash: z.string().regex(/^(?:[a-f0-9]{16}|[a-f0-9]{64})$/), width: z.number().positive(), height: z.number().positive(),
})
export type TranslatedImageAsset = z.infer<typeof TranslatedImageAsset>

/** Captured when opening an editor, never refreshed silently over a draft. */
export const OutputEditGuard = z.object({
  baseVersion: z.number().int().nonnegative(),
  sourceSignature: z.string().min(1),
})
export type OutputEditGuard = z.infer<typeof OutputEditGuard>

export const OutputDisclosureOptions = z.object({
  glossary: z.boolean().optional(), quizzes: z.boolean().optional(), readAloud: z.boolean().optional(), languages: z.array(z.string()).optional(),
}).strict()
export type OutputDisclosureOptions = z.infer<typeof OutputDisclosureOptions>
