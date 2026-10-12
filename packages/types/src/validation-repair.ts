import { z } from "zod"

/** Captured by packaging, never accepted as a generated-origin assertion. */
export const ValidationSectionSnapshot = z.object({
  pageId: z.string().min(1), sectionId: z.string().min(1), href: z.string().min(1),
  sourceVersion: z.number().int().positive(), renderingVersion: z.number().int().positive(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/), renderingHash: z.string().regex(/^[a-f0-9]{64}$/),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
})
export type ValidationSectionSnapshot = z.infer<typeof ValidationSectionSnapshot>
export const ValidationArtifactSnapshot = z.object({
  id: z.string().uuid().optional(),
  sections: z.array(ValidationSectionSnapshot),
})
export type ValidationArtifactSnapshot = z.infer<typeof ValidationArtifactSnapshot>
export const ValidationFindingReference = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["violation", "incomplete"]), assessmentVersion: z.number().int().positive(), ruleId: z.string().min(1) }),
  z.object({ kind: z.literal("reviewer"), sessionId: z.string().min(1), recordItemId: z.string().min(1), recordVersion: z.number().int().positive(), criterionId: z.string().min(1) }),
])
export type ValidationFindingReference = z.infer<typeof ValidationFindingReference>
export const ValidationRepairTarget = z.object({ sectionId: z.string().min(1), finding: ValidationFindingReference })
export type ValidationRepairTarget = z.infer<typeof ValidationRepairTarget>
export const ValidationRepairRequest = ValidationRepairTarget.extend({
  requestId: z.string().uuid(), baseVersion: z.number().int().positive(), renderingVersion: z.number().int().positive(),
})
export type ValidationRepairRequest = z.infer<typeof ValidationRepairRequest>
export const ValidationRepairAvailability = z.object({
  available: z.boolean(), reason: z.enum(["ready", "historical", "unproven", "protected", "unsupported", "unavailable"]),
  pageId: z.string().optional(), baseVersion: z.number().int().positive().optional(), renderingVersion: z.number().int().positive().optional(),
})
export type ValidationRepairAvailability = z.infer<typeof ValidationRepairAvailability>
