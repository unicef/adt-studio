import { z } from "zod"
import { PageSectioningOutput } from "./page-sectioning.js"
import { WebRenderingOutput } from "./web-rendering.js"

export const SectionSyncStatus = z.enum([
  "current", "text-patched", "text-drift", "structural-drift", "invalid-rendering",
  "protected-divergence", "unknown-origin", "fixed-layout-unmapped",
])
export type SectionSyncStatus = z.infer<typeof SectionSyncStatus>

export const SectionSyncResult = z.object({
  sectionId: z.string(),
  status: SectionSyncStatus,
  diagnostics: z.array(z.string()),
  action: z.enum(["repair", "review", "none"]).optional(),
})
export type SectionSyncResult = z.infer<typeof SectionSyncResult>

/** Read projection only. No repair permission or freshness claim is implied. */
export const SectioningSynchronization = z.object({
  sourceVersion: z.number().int().positive().nullable(),
  renderingVersion: z.number().int().positive().nullable(),
  layout: z.enum(["reflowable", "fixed", "unknown"]),
  sections: z.array(SectionSyncResult),
  diagnostics: z.array(z.string()),
})
export type SectioningSynchronization = z.infer<typeof SectioningSynchronization>

/**
 * Ephemeral evidence supplied by a trusted caller, never a client save flag.
 * Derived from shared OutputMetadata and retained source history by the server.
 */
export const SectionSyncProof = z.object({
  sectionId: z.string(),
  pageId: z.string(),
  sourceVersion: z.number().int().positive(),
  renderingVersion: z.number().int().positive(),
  origin: z.enum(["generated", "manual", "unknown"]),
})
export type SectionSyncProof = z.infer<typeof SectionSyncProof>

export const SectioningSyncInput = z.object({
  pageId: z.string(),
  priorSource: PageSectioningOutput.nullable(),
  priorSources: z.array(z.object({ version: z.number().int().positive(), source: PageSectioningOutput })).optional(),
  source: PageSectioningOutput,
  rendering: WebRenderingOutput.nullable(),
  sourceVersion: z.number().int().positive(),
  renderingVersion: z.number().int().positive().nullable(),
  layout: z.enum(["reflowable", "fixed", "unknown"]),
  /** Exact owners from the active book graph, including duplicate ownership. */
  sectionOwners: z.record(z.string(), z.array(z.string())),
  proofs: z.array(SectionSyncProof),
})
export type SectioningSyncInput = z.infer<typeof SectioningSyncInput>

export const SectioningSyncCandidate = z.object({
  rendering: WebRenderingOutput.nullable(),
  changed: z.boolean(),
  sections: z.array(SectionSyncResult),
  diagnostics: z.array(z.string()),
})
export type SectioningSyncCandidate = z.infer<typeof SectioningSyncCandidate>

export const StoryboardSaveRequest = z.object({
  baseVersion: z.number().int().nonnegative(),
  renderingVersion: z.number().int().nonnegative(),
  sectioning: PageSectioningOutput.omit({ source: true }).optional(),
  rendering: WebRenderingOutput.optional(),
  renderingInSync: z.boolean().optional(), // Compatibility hint; never proof.
}).refine((value) => value.sectioning || value.rendering, "A source or rendering edit is required")
export type StoryboardSaveRequest = z.infer<typeof StoryboardSaveRequest>

export const StoryboardSaveResponse = z.object({
  sectioningVersion: z.number().int().positive().nullable(),
  renderingVersion: z.number().int().positive().nullable(),
  synchronization: SectioningSynchronization,
})
export type StoryboardSaveResponse = z.infer<typeof StoryboardSaveResponse>

export const SectioningRepairRequest = z.object({
  baseVersion: z.number().int().positive(),
  renderingVersion: z.number().int().nonnegative(),
  sectionIds: z.array(z.string().min(1)).min(1).refine((ids) => new Set(ids).size === ids.length, "Duplicate section identities"),
})
export type SectioningRepairRequest = z.infer<typeof SectioningRepairRequest>
