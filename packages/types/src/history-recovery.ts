import { z } from "zod"

/** The history already consulted by the shared content/section ID factories. */
export const IDENTITY_HISTORY_NODES = [
  "page-sectioning", "fixed-layout-sectioning", "web-rendering", "glossary",
  "quiz-generation", "text-catalog", "text-catalog-translation", "core-tts-catalog",
  "easy-read", "tts", "tts-timestamps", "word-timestamps", "image-captioning",
] as const

export const HistoryTuple = z.object({ node: z.enum(IDENTITY_HISTORY_NODES), itemId: z.string(), version: z.number().int().positive() })
export type HistoryTuple = z.infer<typeof HistoryTuple>
export const IdentityHistoryRecord = HistoryTuple.extend({ data: z.unknown() })
export type IdentityHistoryRecord = z.infer<typeof IdentityHistoryRecord>
export const HistoryBytes = z.object({ storageType: z.string(), hex: z.string().regex(/^(?:[0-9A-F]{2})*$/) })
export type HistoryBytes = z.infer<typeof HistoryBytes>
export const HistoryWitness = HistoryTuple.extend({
  bookId: z.string().uuid(), incarnation: z.string().regex(/^[0-9a-f]{32}$/),
  bytes: HistoryBytes, digest: z.string().length(64),
  origin: z.enum(["write", "checkpoint", "part-import"]),
  importedFrom: HistoryTuple.extend({ bookId: z.string().uuid().nullable() }).optional(),
})
export type HistoryWitness = z.infer<typeof HistoryWitness>
export const HistoryIssue = HistoryTuple.extend({
  reason: z.enum(["recoverable", "missing-witness", "invalid-witness", "changed-record", "missing-record"]),
  beforeHash: z.string().length(64), witnessHash: z.string().length(64).optional(),
})
export type HistoryIssue = z.infer<typeof HistoryIssue>
export const HistoryRecoveryStatus = z.object({
  snapshot: z.string(), bookId: z.string().nullable(), checkpointable: z.number(), checkpointRecords: z.array(HistoryTuple),
  issueCount: z.number(), issues: z.array(HistoryIssue), revision: z.number(),
})
export type HistoryRecoveryStatus = z.infer<typeof HistoryRecoveryStatus>
export const HistoryCheckpointRequest = z.object({ snapshot: z.string().length(64), requestId: z.string().uuid(), confirmed: z.literal(true) }).strict()
export type HistoryCheckpointRequest = z.infer<typeof HistoryCheckpointRequest>
export const HistoryRepairRequest = HistoryCheckpointRequest.extend({
  records: z.array(HistoryIssue.pick({ node: true, itemId: true, version: true, beforeHash: true, witnessHash: true }).required()).min(1).max(20),
}).strict()
export type HistoryRepairRequest = z.infer<typeof HistoryRepairRequest>
export const HistoryRecoveryReceipt = z.object({
  requestId: z.string().uuid(), operation: z.enum(["checkpoint", "repair"]),
  count: z.number(), revision: z.number(), replayed: z.boolean(),
  selectedVersions: z.array(HistoryTuple),
})
export type HistoryRecoveryReceipt = z.infer<typeof HistoryRecoveryReceipt>
