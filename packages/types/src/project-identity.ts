import { z } from "zod"

export const PROJECT_IDENTITY_VERSION = 1 as const

export const ProjectSourceKind = z.enum(["pdf", "imported-adt", "unknown"])
export type ProjectSourceKind = z.infer<typeof ProjectSourceKind>

export const ProjectIdentity = z.object({
  version: z.literal(PROJECT_IDENTITY_VERSION),
  projectId: z.string().uuid(),
  sourceKind: ProjectSourceKind,
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  createdAt: z.string().datetime(),
  derivedFromProjectId: z.string().uuid().optional(),
}).strict()
export type ProjectIdentity = z.infer<typeof ProjectIdentity>

export const AdtExportLineage = z.object({
  originProjectId: z.string().uuid(),
  sourceKind: ProjectSourceKind,
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  publicationId: z.string().uuid(),
  exportedAt: z.string().datetime(),
}).strict()
export type AdtExportLineage = z.infer<typeof AdtExportLineage>
