import { z } from "zod"

export const PUBLISH_WORKER_VERSION = "0.3.0"

export const PUBLICATION_SNAPSHOT_MAX_BYTES = 100 * 1024 * 1024

export const PUBLICATION_TOKEN_LENGTH = 32

export const PublicationToken = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/)
export type PublicationToken = z.infer<typeof PublicationToken>

export const PublicationState = z.enum(["active", "expired", "revoked"])
export type PublicationState = z.infer<typeof PublicationState>

export const PublicationPageEntry = z.object({
  section_id: z.string().min(1),
  href: z.string().min(1),
  page_number: z.number().int().min(1).optional(),
})
export type PublicationPageEntry = z.infer<typeof PublicationPageEntry>

export const PublicationVersion = z.object({
  version: z.number().int().min(1),
  page_manifest: z.array(PublicationPageEntry),
  created_at: z.string().datetime(),
})
export type PublicationVersion = z.infer<typeof PublicationVersion>

export const Publication = z.object({
  token: PublicationToken,
  title: z.string().min(1),
  book_label: z.string().min(1),
  current_version: z.number().int().min(1),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
})
export type Publication = z.infer<typeof Publication>

export const PublicationCreateRequest = z.object({
  token: PublicationToken,
  title: z.string().min(1),
  book_label: z.string().min(1),
  page_manifest: z.array(PublicationPageEntry),
  expires_at: z.string().datetime().nullable().optional(),
})
export type PublicationCreateRequest = z.infer<typeof PublicationCreateRequest>

export const PublicationCreateResponse = z.object({
  publication: Publication,
  version: PublicationVersion,
  url: z.string().url(),
})
export type PublicationCreateResponse = z.infer<typeof PublicationCreateResponse>

export const PublicationVersionCreateRequest = z.object({
  page_manifest: z.array(PublicationPageEntry),
})
export type PublicationVersionCreateRequest = z.infer<typeof PublicationVersionCreateRequest>

export const PublicationVersionCreateResponse = z.object({
  publication: Publication,
  version: PublicationVersion,
})
export type PublicationVersionCreateResponse = z.infer<typeof PublicationVersionCreateResponse>

export const PublicationExpiryUpdateRequest = z.object({
  expires_at: z.string().datetime().nullable(),
})
export type PublicationExpiryUpdateRequest = z.infer<typeof PublicationExpiryUpdateRequest>

export const PublicationResponse = z.object({
  publication: Publication,
})
export type PublicationResponse = z.infer<typeof PublicationResponse>

export const PublicationDetail = z.object({
  publication: Publication,
  versions: z.array(PublicationVersion),
  url: z.string().url(),
})
export type PublicationDetail = z.infer<typeof PublicationDetail>

export const PublishWorkerHealth = z.object({
  ok: z.literal(true),
  version: z.string().min(1),
})
export type PublishWorkerHealth = z.infer<typeof PublishWorkerHealth>

export const PublishErrorCode = z.enum([
  "invalid_request",
  "unauthorized",
  "not_found",
  "expired",
  "revoked",
  "payload_too_large",
  "rate_limited",
  "not_implemented",
  "internal_error",
])
export type PublishErrorCode = z.infer<typeof PublishErrorCode>

export const PublishErrorResponse = z.object({
  error: PublishErrorCode,
  message: z.string().optional(),
})
export type PublishErrorResponse = z.infer<typeof PublishErrorResponse>

export const PublishStepId = z.enum(["export", "package", "upload", "register"])
export type PublishStepId = z.infer<typeof PublishStepId>

export const PublishStepDescriptor = z.object({
  id: PublishStepId,
  number: z.number().int().min(1).max(4),
  label: z.string().min(1),
})
export type PublishStepDescriptor = z.infer<typeof PublishStepDescriptor>

export const PUBLISH_STEPS: readonly PublishStepDescriptor[] = [
  { id: "export", number: 1, label: "Build the web version" },
  { id: "package", number: 2, label: "Package the files" },
  { id: "upload", number: 3, label: "Upload to your Cloudflare" },
  { id: "register", number: 4, label: "Create the share link" },
]

export const PUBLISH_STEP_COUNT = PUBLISH_STEPS.length

/** `pending` is a client-side display state for steps the stream has not reached yet —
 *  the SSE stream itself only ever emits the other three. Mirrors `ProvisionStepStatus`. */
export const PublishStepStatus = z.enum(["pending", "running", "done", "error"])
export type PublishStepStatus = z.infer<typeof PublishStepStatus>

export const PublishErrorCodeStudio = z.enum([
  "publish_not_connected",
  "published_already",
  "not_published",
  "export_failed",
  "package_failed",
  "upload_failed",
  "worker_unreachable",
  "snapshot_too_large",
])
export type PublishErrorCodeStudio = z.infer<typeof PublishErrorCodeStudio>

/** What the wire can carry — `pending` exists only in the client's own step table. */
export const PublishStepEventStatus = PublishStepStatus.exclude(["pending"])
export type PublishStepEventStatus = z.infer<typeof PublishStepEventStatus>

export const PublishStepEvent = z.object({
  type: z.literal("step"),
  id: PublishStepId,
  number: z.number().int().min(1),
  label: z.string().min(1),
  status: PublishStepEventStatus,
  message: z.string().optional(),
  error: z.string().optional(),
})
export type PublishStepEvent = z.infer<typeof PublishStepEvent>

export const PublishCompleteEvent = z.object({
  type: z.literal("complete"),
  publication: Publication,
  version: PublicationVersion,
  url: z.string().url(),
})
export type PublishCompleteEvent = z.infer<typeof PublishCompleteEvent>

export const PublishErrorEvent = z.object({
  type: z.literal("error"),
  code: PublishErrorCodeStudio,
  message: z.string(),
  step_id: PublishStepId.nullable(),
})
export type PublishErrorEvent = z.infer<typeof PublishErrorEvent>

export const PublishProgressEvent = z.discriminatedUnion("type", [
  PublishStepEvent,
  PublishCompleteEvent,
  PublishErrorEvent,
])
export type PublishProgressEvent = z.infer<typeof PublishProgressEvent>

export const BookPublicationVersionRecord = z.object({
  version: z.number().int().min(1),
  published_at: z.string().datetime(),
  page_count: z.number().int().min(0),
})
export type BookPublicationVersionRecord = z.infer<typeof BookPublicationVersionRecord>

/** The book-local half of a publication: enough to rebuild the share link, list the
 *  version history and recover from a partial upload without reaching the worker. */
export const BookPublicationRecord = z.object({
  token: PublicationToken,
  base_url: z.string().url(),
  worker_url: z.string().min(1),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
  versions: z.array(BookPublicationVersionRecord),
})
export type BookPublicationRecord = z.infer<typeof BookPublicationRecord>

export const BookPublicationStatus = z.object({
  connected: z.boolean(),
  record: BookPublicationRecord.nullable(),
  publication: Publication.nullable(),
  url: z.string().url().nullable(),
  worker_reachable: z.boolean(),
})
export type BookPublicationStatus = z.infer<typeof BookPublicationStatus>

export const BookPublishRequest = z.object({
  expires_at: z.string().datetime().nullable().optional(),
})
export type BookPublishRequest = z.infer<typeof BookPublishRequest>

export function publicationStateAt(
  publication: Pick<Publication, "expires_at" | "revoked_at">,
  now: Date = new Date(),
): PublicationState {
  if (publication.revoked_at !== null) return "revoked"
  if (publication.expires_at !== null && Date.parse(publication.expires_at) <= now.getTime()) {
    return "expired"
  }
  return "active"
}
