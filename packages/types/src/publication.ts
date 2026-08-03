import { z } from "zod"

export const PUBLISH_WORKER_VERSION = "0.1.0"

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
