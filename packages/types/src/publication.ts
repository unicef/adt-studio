import { z } from "zod"
import { CommenterDisplayName } from "./commenter-name.js"

export const PUBLISH_WORKER_VERSION = "0.10.0"

/** R2's free allowance. Used only to give the dashboard's storage total a sense of scale —
 *  never to claim a usage number we did not measure ourselves. */
export const R2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024

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

/** One row of the account-wide list (§4.18). `snapshot_bytes` is the bytes this publication
 *  actually occupies in R2 — the sum over every version's unpacked files, measured by the
 *  worker as it wrote them — and is `null` for versions published before migration 0004.
 *  `comment_count` is every surviving message, replies included; `unresolved_count` counts
 *  open *threads* (undeleted roots with no `resolved_at`), which is exactly what the Feedback
 *  stage's badge counts, so the two screens can never disagree. */
export const PublicationListEntry = z.object({
  publication: Publication,
  url: z.string().url(),
  has_access_code: z.boolean().default(false),
  version_count: z.number().int().min(0),
  comment_count: z.number().int().min(0),
  unresolved_count: z.number().int().min(0),
  snapshot_bytes: z.number().int().min(0).nullable(),
  /** When the newest version was uploaded — "last updated" on the dashboard. `null` only for a
   *  publication whose `versions` rows are somehow gone. */
  last_published_at: z.string().datetime().nullable(),
})
export type PublicationListEntry = z.infer<typeof PublicationListEntry>

export const PublicationList = z.object({
  publications: z.array(PublicationListEntry),
})
export type PublicationList = z.infer<typeof PublicationList>

/**
 * One reader of a publication.
 *
 * A row exists for every person the worker minted a session for — which happens at exactly two
 * doors: the access-code gate, which asks for a name on the way in, and the comment composer,
 * which asks before the first comment. It is therefore **not** a visit log: somebody who opens
 * an un-coded link, reads and leaves is not here, because nothing about them was ever recorded.
 * Every screen showing this list has to phrase it as "readers who joined", never as "everyone
 * who opened the link".
 */
export const PublicationReader = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  joined_at: z.string().datetime(),
  comment_count: z.number().int().min(0),
  /** `null` for a reader who gave a name and never wrote anything. */
  last_comment_at: z.string().datetime().nullable(),
})
export type PublicationReader = z.infer<typeof PublicationReader>

export const PublicationReaderList = z.object({
  readers: z.array(PublicationReader),
})
export type PublicationReaderList = z.infer<typeof PublicationReaderList>

export const PublicationDeleteResult = z.object({
  token: PublicationToken,
  /** `false` when the token was already unknown to the account. The call still succeeded —
   *  the caller asked for it to be gone, and it is — so this is information, not an error. */
  deleted: z.boolean(),
  objects_deleted: z.number().int().min(0),
})
export type PublicationDeleteResult = z.infer<typeof PublicationDeleteResult>

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
  /** The worker answered, but it is older than the Studio and has never heard of the route that
   *  was asked for. Distinct from `worker_unreachable` (nothing answered) and from
   *  `not_published` (it answered *our* 404), because the only cure is installing the update. */
  "worker_outdated",
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
  /**
   * The book's content revision at the moment this version was published — the highest
   * `node_data` version across every node except the publication record itself.
   *
   * It exists to answer one question the author has every time they open Publishing: *is what my
   * reviewers see still current?* Comparing file timestamps cannot answer it, because publishing
   * writes the publication record into the same database and so always looks like a fresh edit.
   * Comparing revisions can: the number only moves when a pipeline step or a manual edit writes
   * a new node version.
   *
   * `null` for versions published before this was recorded — which must read as "unknown", never
   * as "no changes".
   */
  content_revision: z.number().int().min(0).nullable().default(null),
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
  /** Set when the author deleted the publication for good. The row is not removed, because
   *  book data is versioned rather than overwritten — so this is the tombstone that says the
   *  book has no publication any more. `readPublicationRecord` turns it back into `null`,
   *  which is what every caller already handles. */
  deleted_at: z.string().datetime().nullable().default(null),
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
  /** The book's content revision *now*, to compare against the live version's. `null` when the
   *  book is gone from this machine, which is the one case where nothing can be said. */
  content_revision: z.number().int().min(0).nullable().default(null),
})
export type BookPublicationStatus = z.infer<typeof BookPublicationStatus>

/** One dashboard row: the account's publication joined to what the Studio knows locally.
 *  `book_exists` is the load-bearing merge result — a publication whose book directory is gone
 *  is still live on the internet, and the screen has to say so instead of hiding it. */
export const PublicationSummary = z.object({
  token: PublicationToken,
  /** The local book's title when it still exists, the worker's stored title otherwise. */
  title: z.string().min(1),
  book_label: z.string().min(1),
  book_exists: z.boolean(),
  url: z.string().url().nullable(),
  current_version: z.number().int().min(1),
  version_count: z.number().int().min(0),
  created_at: z.string().datetime(),
  last_published_at: z.string().datetime().nullable(),
  expires_at: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
  has_access_code: z.boolean(),
  /** The code **in plaintext**, read back from the book's own record on this machine — the same
   *  one the Publish panel shows. `null` when the publication has no code, or when the book has
   *  left this computer: the worker keeps only a PBKDF2 hash and can never answer "what was the
   *  code", so a lost book means a lost code. Never leaves the Studio's own localhost origin. */
  access_code: z.string().nullable().default(null),
  comment_count: z.number().int().min(0),
  unresolved_count: z.number().int().min(0),
  snapshot_bytes: z.number().int().min(0).nullable(),
  /** `local` rows come from the book's own `node_data` record because the worker could not be
   *  reached: their counts are unknown (`0` / `null`), not measured. */
  source: z.enum(["worker", "local"]),
})
export type PublicationSummary = z.infer<typeof PublicationSummary>

export const PublicationsTotals = z.object({
  published_count: z.number().int().min(0),
  active_count: z.number().int().min(0),
  /** Sum of the per-publication R2 occupancy the worker measured. Not a Cloudflare analytics
   *  read — the Studio holds no scope for one. */
  total_snapshot_bytes: z.number().int().min(0),
  /** `false` when at least one listed publication has no measured size (published before
   *  migration 0004, or listed from the local record), so the UI can say "at least". */
  snapshot_bytes_complete: z.boolean(),
  total_unresolved: z.number().int().min(0),
})
export type PublicationsTotals = z.infer<typeof PublicationsTotals>

export const PublicationsOverview = z.object({
  worker_reachable: z.boolean(),
  publications: z.array(PublicationSummary),
  totals: PublicationsTotals,
})
export type PublicationsOverview = z.infer<typeof PublicationsOverview>

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
