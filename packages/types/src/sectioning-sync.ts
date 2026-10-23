import { z } from "zod"

// Read-only schema shared with the published SPEC-0012/#888 implementation.
// SPEC-0001 supplies ownership drift only; it does not certify other sync states.
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
