import { z } from "zod"
import { CommenterDisplayName } from "./commenter-name.js"

export const PUBLISH_WORKER_VERSION = "0.6.0"

export const PUBLICATION_SNAPSHOT_MAX_BYTES = 100 * 1024 * 1024

export const PUBLICATION_TOKEN_LENGTH = 32

export const PUBLICATION_ACCESS_COOKIE = "adt_pub_access"

/** 90 days, matching the commenter session cookie: one code entry per device per season. */
export const PUBLICATION_ACCESS_MAX_AGE_SECONDS = 90 * 24 * 60 * 60

export const PUBLICATION_ACCESS_CODE_MIN_LENGTH = 4

export const PUBLICATION_ACCESS_CODE_MAX_LENGTH = 12

export const PUBLICATION_ACCESS_CODE_LENGTH = 6

/** No `O`/`I`/`0`/`1`: the code is read off a screen and typed on a phone, often by a child,
 *  so every character has to survive being spoken aloud and copied by hand. */
export const PUBLICATION_ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Case is normalized away on both sides (set and verify), so the code a reviewer types is
 *  never wrong for having been shouted across a classroom in lower case. */
export const PublicationAccessCode = z
  .string()
  .trim()
  .min(PUBLICATION_ACCESS_CODE_MIN_LENGTH)
  .max(PUBLICATION_ACCESS_CODE_MAX_LENGTH)
  .regex(/^\S+$/)
export type PublicationAccessCode = z.infer<typeof PublicationAccessCode>

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
  /** Plaintext in the HTTPS body, PBKDF2 at rest — the worker never stores what was sent. */
  access_code: PublicationAccessCode.nullable().optional(),
})
export type PublicationCreateRequest = z.infer<typeof PublicationCreateRequest>

export const PublicationCreateResponse = z.object({
  publication: Publication,
  version: PublicationVersion,
  url: z.string().url(),
  has_access_code: z.boolean().default(false),
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

/** Both fields are optional and independent: an absent key is "leave this alone", so setting a
 *  code can never silently clear an end date. `access_code: null` removes the code. */
export const PublicationUpdateRequest = z
  .object({
    expires_at: z.string().datetime().nullable().optional(),
    access_code: PublicationAccessCode.nullable().optional(),
  })
  .refine(
    (value) => value.expires_at !== undefined || value.access_code !== undefined,
    { message: "Provide expires_at, access_code, or both" },
  )
export type PublicationUpdateRequest = z.infer<typeof PublicationUpdateRequest>

/** The code a reviewer types, and the name they type beside it. Deliberately lenient — a wrong
 *  code is `401`, never a `400`, so the route cannot be used to probe the code's length. `name`
 *  is optional for API compatibility: without it the door only grants admission, and the
 *  reader's composer asks for a name at the first comment instead. */
export const PublicationAccessRequest = z.object({
  code: z.string().max(256),
  name: CommenterDisplayName.optional(),
})
export type PublicationAccessRequest = z.infer<typeof PublicationAccessRequest>

/** `has_access_code` is `default(false)` rather than required so a Studio running ahead of a
 *  0.4.x worker still parses its answers. Never the code or its hash. */
export const PublicationResponse = z.object({
  publication: Publication,
  has_access_code: z.boolean().default(false),
})
export type PublicationResponse = z.infer<typeof PublicationResponse>

export const PublicationDetail = z.object({
  publication: Publication,
  versions: z.array(PublicationVersion),
  url: z.string().url(),
  has_access_code: z.boolean().default(false),
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
  "name_taken",
  "invalid_claim",
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
  "not_revoked",
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
  /** The access code **in plaintext**, on the author's own machine only. The worker keeps a
   *  PBKDF2 hash and can never answer "what was the code" — but the author has to be able to
   *  read it back to share it, so this is the one place it is legible. Never leaves the API's
   *  own host: it reaches the browser through the Studio's own localhost origin, exactly like
   *  the book's contents. `default(null)` so pre-M3.5 records still parse. */
  access_code: z.string().nullable().default(null),
  has_access_code: z.boolean().default(false),
})
export type BookPublicationRecord = z.infer<typeof BookPublicationRecord>

export const BookPublicationStatus = z.object({
  connected: z.boolean(),
  record: BookPublicationRecord.nullable(),
  publication: Publication.nullable(),
  url: z.string().url().nullable(),
  worker_reachable: z.boolean(),
  /** The worker's answer when it is reachable, the local record's otherwise. */
  has_access_code: z.boolean().default(false),
})
export type BookPublicationStatus = z.infer<typeof BookPublicationStatus>

export const BookPublishRequest = z.object({
  expires_at: z.string().datetime().nullable().optional(),
  access_code: PublicationAccessCode.nullable().optional(),
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
