import type {
  CommentAnchor,
  CommenterSession,
  Publication,
  PublicationPageEntry,
  PublicationVersion,
  PublishComment,
} from "@adt/types"

export interface CreatePublicationInput {
  publication: Publication
  pageManifest: PublicationPageEntry[]
}

export interface AddVersionInput {
  token: string
  version: number
  pageManifest: PublicationPageEntry[]
  createdAt: string
}

export interface AddVersionResult {
  publication: Publication
  version: PublicationVersion
}

export interface StoredCommenterSession extends CommenterSession {
  token: string
}

export interface CreateSessionInput {
  id: string
  token: string
  name: string
  color: string
  isAuthor: boolean
  createdAt: string
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
  editedAt: string
}

export interface PublicationStore {
  findByToken(token: string): Promise<Publication | null>
  listVersions(token: string): Promise<PublicationVersion[]>
  findVersion(token: string, version: number): Promise<PublicationVersion | null>
  create(input: CreatePublicationInput): Promise<PublicationVersion>
  /** Resolves to `null` when the publication is gone or `current_version` moved under
   *  us — the caller has already written the R2 objects for `version`, so the guard has
   *  to live in the same statement that bumps the pointer. */
  addVersion(input: AddVersionInput): Promise<AddVersionResult | null>
  revoke(token: string, revokedAt: string): Promise<Publication | null>
  setExpiry(token: string, expiresAt: string | null): Promise<Publication | null>

  createSession(input: CreateSessionInput): Promise<CommenterSession>
  /** Find-or-create for the single `is_author = 1` session of a publication. */
  ensureAuthorSession(input: CreateSessionInput): Promise<CommenterSession>
  findAuthorSession(token: string): Promise<CommenterSession | null>
  findSession(id: string): Promise<StoredCommenterSession | null>
  renameSession(id: string, name: string): Promise<CommenterSession | null>
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
  async setExpiry() {
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
  async renameSession() {
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
