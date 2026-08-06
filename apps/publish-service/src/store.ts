import type {
  CommentAnchor,
  CommenterSession,
  Publication,
  PublicationPageEntry,
  PublicationReader,
  PublicationVersion,
  PublishComment,
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

export interface StoredCommenterSession extends CommenterSession {
  token: string
  /** `pbkdf2-sha256$<iterations>$<salt>$<hash>`, or `null` for the pinless sessions every
   *  reviewer had before M2.5 — those keep working, they just cannot be reclaimed. */
  pin: string | null
}

export interface CreateSessionInput {
  id: string
  token: string
  name: string
  color: string
  isAuthor: boolean
  createdAt: string
  pin?: string | null
}

export interface CommentListFilter {
  token: string
  pageSectionId?: string
}

export interface CreateCommentInput {
  id: string
  token: string
  version: number
  pageSectionId: string
  parentId: string | null
  sessionId: string
  body: string
  anchor: CommentAnchor | null
  createdAt: string
}

export interface UpdateCommentInput {
  token: string
  id: string
  body?: string
  anchor?: CommentAnchor | null
  /** Absent for anchor-only updates: moving a pin is not an edit. */
  editedAt?: string
}

export interface PublicationStore {
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
  setExpiry(token: string, expiresAt: string | null): Promise<Publication | null>
  /** Sets, rotates or (with `null`) removes the packed hash. Every previously issued access
   *  cookie stops verifying, because the cookie's tag is keyed over the value replaced here. */
  setAccessCode(token: string, accessCode: string | null): Promise<Publication | null>

  createSession(input: CreateSessionInput): Promise<CommenterSession>
  /** Find-or-create for the single `is_author = 1` session of a publication. */
  ensureAuthorSession(input: CreateSessionInput): Promise<CommenterSession>
  findAuthorSession(token: string): Promise<CommenterSession | null>
  findSession(id: string): Promise<StoredCommenterSession | null>
  /** Every commenter (`is_author = 0`) row of a publication, so name matching can run on the
   *  Unicode-aware key `nameKey()` builds instead of SQLite's ASCII-only `lower()`. */
  listCommenterSessions(token: string): Promise<StoredCommenterSession[]>
  /** The same rows as `listCommenterSessions`, joined to what each one wrote, for the author's
   *  reader list. Separate because it costs a join the name-matching path has no use for. */
  listReaders(token: string): Promise<PublicationReader[]>
  renameSession(id: string, name: string): Promise<CommenterSession | null>
  setSessionPin(id: string, pin: string): Promise<CommenterSession | null>
  countCommenterSessions(token: string): Promise<number>

  createComment(input: CreateCommentInput): Promise<PublishComment>
  /** Returns soft-deleted rows too — visibility is a route concern, not a storage one. */
  findComment(token: string, id: string): Promise<PublishComment | null>
  listComments(filter: CommentListFilter): Promise<PublishComment[]>
  updateComment(input: UpdateCommentInput): Promise<PublishComment | null>
  softDeleteComment(token: string, id: string, deletedAt: string): Promise<PublishComment | null>
  setCommentResolved(
    token: string,
    id: string,
    resolvedAt: string | null,
  ): Promise<PublishComment | null>
}

export const emptyPublicationStore: PublicationStore = {
  async findByToken() {
    return null
  },
  async findRecord() {
    return null
  },
  async listPublications() {
    return []
  },
  async listVersions() {
    return []
  },
  async findVersion() {
    return null
  },
  async create(input) {
    return {
      version: input.publication.current_version,
      page_manifest: input.pageManifest,
      created_at: input.publication.created_at,
    }
  },
  async addVersion() {
    return null
  },
  async revoke() {
    return null
  },
  async reinstate() {
    return null
  },
  async setExpiry() {
    return null
  },
  async setAccessCode() {
    return null
  },
  async createSession(input) {
    return { id: input.id, name: input.name, color: input.color, is_author: input.isAuthor }
  },
  async ensureAuthorSession(input) {
    return { id: input.id, name: input.name, color: input.color, is_author: true }
  },
  async findAuthorSession() {
    return null
  },
  async findSession() {
    return null
  },
  async listCommenterSessions() {
    return []
  },
  async listReaders() {
    return []
  },
  async renameSession() {
    return null
  },
  async setSessionPin() {
    return null
  },
  async countCommenterSessions() {
    return 0
  },
  async createComment(input) {
    return {
      id: input.id,
      token: input.token,
      version: input.version,
      page_section_id: input.pageSectionId,
      parent_id: input.parentId,
      session_id: input.sessionId,
      author_name: "Author",
      author_color: "#8d8d8d",
      body: input.body,
      anchor: input.anchor,
      resolved_at: null,
      edited_at: null,
      deleted_at: null,
      created_at: input.createdAt,
    }
  },
  async findComment() {
    return null
  },
  async listComments() {
    return []
  },
  async updateComment() {
    return null
  },
  async softDeleteComment() {
    return null
  },
  async setCommentResolved() {
    return null
  },
}
