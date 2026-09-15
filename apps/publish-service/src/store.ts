import type {
  Publication,
  PublicationPageEntry,
  PublicationUploadStartRequest,
  PublicationUploadStatus,
  PublicationVersion,
} from "@adt/types"

export interface CreatePublicationInput {
  publication: Publication
  pageManifest: PublicationPageEntry[]
  /** `pbkdf2-sha256$<iterations>$<salt>$<hash>`, or absent for a publication the link alone
   *  opens. The plaintext code never reaches the store. */
  accessCode?: string | null
  /** Bytes written to R2 for this version, as counted while unpacking. Absent means "not
   *  measured", which is what every version stored before migration 0004 reads as. */
  snapshotBytes?: number | null
}

/** The publication as the worker itself needs it: the public record plus the access-code hash,
 *  which is deliberately absent from `Publication` so it cannot ride along into a JSON body. */
export interface StoredPublication {
  publication: Publication
  accessCode: string | null
}

export interface AddVersionInput {
  token: string
  version: number
  pageManifest: PublicationPageEntry[]
  createdAt: string
  snapshotBytes?: number | null
}

/** One account-wide list row (§4.18): the publication plus the aggregates the dashboard needs,
 *  all of them computed in the store so the route stays a single read. */
export interface PublicationListRow {
  publication: Publication
  hasAccessCode: boolean
  versionCount: number
  /** Every surviving message, replies included. */
  commentCount: number
  /** Open threads: undeleted roots with no `resolved_at`. Matches the Feedback stage badge. */
  unresolvedCount: number
  /** Sum over the publication's versions, `null` when none of them was ever measured. */
  snapshotBytes: number | null
  lastPublishedAt: string | null
}

export interface AddVersionResult {
  publication: Publication
  version: PublicationVersion
}

export interface StoredPublicationUpload {
  uploadId: string
  kind: PublicationUploadStartRequest["kind"]
  token: string
  version: number
  state: PublicationUploadStatus
  title: string | null
  bookLabel: string | null
  pageManifest: PublicationPageEntry[]
  snapshotPrefix: string
  snapshotBytes: number
  expectedFiles: number
  expiresAt: string | null
  accessCode: string | null
  createdAt: string
  committedAt: string | null
  committedResult: CommittedPublicationUpload | null
}

export interface StoredPublicationUploadFile {
  uploadId: string
  path: string
  bytes: number
  sha256: string
  completedAt: string | null
}

export interface CommittedPublicationUpload {
  publication: Publication
  version: PublicationVersion
  hasAccessCode: boolean
}

export interface StartPublicationUploadInput {
  uploadId: string
  snapshotPrefix: string
  request: PublicationUploadStartRequest
  /** Packed access-code hash for create, never plaintext. */
  accessCode: string | null
  createdAt: string
}

export type StartPublicationUploadResult =
  | { ok: true; upload: StoredPublicationUpload }
  | { ok: false; reason: "not_found" | "conflict" }

export type CommitPublicationUploadResult =
  | { ok: true; committed: CommittedPublicationUpload }
  | { ok: false; reason: "not_found" | "aborted" | "incomplete" | "conflict" }

export type AccessAttemptKind = "access"

export interface PublicationStore {
  startUpload(input: StartPublicationUploadInput): Promise<StartPublicationUploadResult>
  findUpload(uploadId: string): Promise<StoredPublicationUpload | null>
  findUploadFile(uploadId: string, path: string): Promise<StoredPublicationUploadFile | null>
  completeUploadFile(uploadId: string, path: string, completedAt: string): Promise<boolean>
  commitUpload(uploadId: string, committedAt: string): Promise<CommitPublicationUploadResult>
  abortUpload(uploadId: string): Promise<PublicationUploadStatus | null>
  /** The committed object's prefix only when this exact path belongs to its immutable manifest. */
  findSnapshotPrefix(token: string, version: number, path: string): Promise<string | null>
  /** Includes open uploads so deleting a publication token cannot strand an upload prefix. */
  listSnapshotPrefixes(token: string): Promise<string[]>
  findByToken(token: string): Promise<Publication | null>
  /** One read for the ladder *and* the access gate, so gating costs no extra round trip per
   *  asset request. */
  findRecord(token: string): Promise<StoredPublication | null>
  /** Every publication in this account, newest first. One query: the dashboard is the only
   *  caller and it draws tens of rows, so per-row follow-up reads are not acceptable. */
  listPublications(): Promise<PublicationListRow[]>
  listVersions(token: string): Promise<PublicationVersion[]>
  findVersion(token: string, version: number): Promise<PublicationVersion | null>
  create(input: CreatePublicationInput): Promise<PublicationVersion>
  /** Resolves to `null` when the publication is gone or `current_version` moved under
   *  us — the caller has already written the R2 objects for `version`, so the guard has
   *  to live in the same statement that bumps the pointer. */
  addVersion(input: AddVersionInput): Promise<AddVersionResult | null>
  revoke(token: string, revokedAt: string): Promise<Publication | null>
  /** Clears `revoked_at`. Idempotent, and deliberately blind to `expires_at`: resuming a
   *  publication re-opens the link, it does not extend it. */
  reinstate(token: string): Promise<Publication | null>
  /** Counts recent failures at one door, for one caller and for the publication as a whole.
   *  Both numbers are needed: the per-caller one does the enforcing, and the per-token one is
   *  the backstop against a distributed guess. Scoped to `kind` throughout — the access code and
   *  the access code is the only secret tracked by this worker. */
  countAccessFailures(input: {
    token: string
    client: string
    kind: AccessAttemptKind
    since: string
  }): Promise<{ byClient: number; byToken: number }>
  /** Recorded for *this* attempt before its own gate reads a count — see access-throttle.ts's
   *  `attemptGate` for why the order matters. */
  recordAccessFailure(input: {
    token: string
    client: string
    kind: AccessAttemptKind
    at: string
  }): Promise<void>
  clearAccessFailures(input: { token: string; client: string; kind: AccessAttemptKind }): Promise<void>

  /** Erases the publication and all of its versions.
   *  Unlike `revoke`, there is nothing to resume afterwards: the token stops resolving and
   *  the reviewers' names and threads go with it. Returns the row as it was, so the caller
   *  can report what it removed, or `null` when the token was already gone. */
  deletePublication(token: string): Promise<Publication | null>
  setExpiry(token: string, expiresAt: string | null): Promise<Publication | null>
  /** Sets, rotates or (with `null`) removes the packed hash. Every previously issued access
   *  cookie stops verifying, because the cookie's tag is keyed over the value replaced here. */
  setAccessCode(token: string, accessCode: string | null): Promise<Publication | null>


}
