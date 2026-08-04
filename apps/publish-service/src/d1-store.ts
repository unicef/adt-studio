import {
  CommentAnchor,
  PublicationPageEntry,
  type CommenterSession,
  type Publication,
  type PublicationVersion,
  type PublishComment,
} from "@adt/types"
import type {
  AddVersionInput,
  AddVersionResult,
  CommentListFilter,
  CreateCommentInput,
  CreatePublicationInput,
  CreateSessionInput,
  PublicationStore,
  StoredCommenterSession,
  UpdateCommentInput,
} from "./store.js"

interface PublicationRow {
  token: string
  title: string
  book_label: string
  current_version: number
  created_at: string
  expires_at: string | null
  revoked_at: string | null
}

interface VersionRow {
  version: number
  page_manifest: string
  created_at: string
}

interface SessionRow {
  id: string
  token: string
  name: string
  color: string
  is_author: number
  pin: string | null
}

interface CommentRow {
  id: string
  token: string
  version: number
  page_section_id: string
  parent_id: string | null
  session_id: string
  author_name: string
  author_color: string
  body: string
  anchor: string | null
  resolved_at: string | null
  edited_at: string | null
  deleted_at: string | null
  created_at: string
}

const PageManifest = PublicationPageEntry.array()

const COMMENT_COLUMNS = `c.id, c.token, c.version, c.page_section_id, c.parent_id, c.session_id,
         s.name AS author_name, s.color AS author_color, c.body, c.anchor,
         c.resolved_at, c.edited_at, c.deleted_at, c.created_at`

const SESSION_COLUMNS = `id, token, name, color, is_author, pin`

function toSession(row: SessionRow): StoredCommenterSession {
  return {
    id: row.id,
    token: row.token,
    name: row.name,
    color: row.color,
    is_author: row.is_author === 1,
    pin: row.pin ?? null,
  }
}

function publicSession(session: StoredCommenterSession): CommenterSession {
  return {
    id: session.id,
    name: session.name,
    color: session.color,
    is_author: session.is_author,
  }
}

function toComment(row: CommentRow): PublishComment {
  const anchor = row.anchor === null ? null : CommentAnchor.safeParse(JSON.parse(row.anchor))
  return {
    id: row.id,
    token: row.token,
    version: row.version,
    page_section_id: row.page_section_id,
    parent_id: row.parent_id,
    session_id: row.session_id,
    author_name: row.author_name,
    author_color: row.author_color,
    body: row.body,
    anchor: anchor && anchor.success ? anchor.data : null,
    resolved_at: row.resolved_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
  }
}

function toPublication(row: PublicationRow): Publication {
  return {
    token: row.token,
    title: row.title,
    book_label: row.book_label,
    current_version: row.current_version,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
  }
}

function toVersion(row: VersionRow): PublicationVersion {
  const parsed = PageManifest.safeParse(JSON.parse(row.page_manifest) as unknown)
  return {
    version: row.version,
    page_manifest: parsed.success ? parsed.data : [],
    created_at: row.created_at,
  }
}

export function createD1PublicationStore(db: D1Database): PublicationStore {
  const readComment = async (token: string, id: string): Promise<PublishComment | null> => {
    const row = await db
      .prepare(
        `SELECT ${COMMENT_COLUMNS} FROM comments c JOIN sessions s ON s.id = c.session_id
         WHERE c.token = ? AND c.id = ?`,
      )
      .bind(token, id)
      .first<CommentRow>()
    return row ? toComment(row) : null
  }

  const readSession = async (id: string): Promise<StoredCommenterSession | null> => {
    const row = await db
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`)
      .bind(id)
      .first<SessionRow>()
    return row ? toSession(row) : null
  }

  const readPublication = async (token: string): Promise<Publication | null> => {
    const row = await db
      .prepare(
        `SELECT token, title, book_label, current_version, created_at, expires_at, revoked_at
         FROM publications WHERE token = ?`,
      )
      .bind(token)
      .first<PublicationRow>()
    return row ? toPublication(row) : null
  }

  return {
    findByToken: readPublication,

    async listVersions(token) {
      const result = await db
        .prepare(
          `SELECT version, page_manifest, created_at FROM versions
           WHERE token = ? ORDER BY version ASC`,
        )
        .bind(token)
        .all<VersionRow>()
      return (result.results ?? []).map(toVersion)
    },

    async findVersion(token, version) {
      const row = await db
        .prepare(
          `SELECT version, page_manifest, created_at FROM versions
           WHERE token = ? AND version = ?`,
        )
        .bind(token, version)
        .first<VersionRow>()
      return row ? toVersion(row) : null
    },

    async create({ publication, pageManifest }: CreatePublicationInput) {
      const manifestJson = JSON.stringify(pageManifest)
      await db.batch([
        db
          .prepare(
            `INSERT INTO publications
               (token, title, book_label, current_version, created_at, expires_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          )
          .bind(
            publication.token,
            publication.title,
            publication.book_label,
            publication.current_version,
            publication.created_at,
            publication.expires_at,
          ),
        db
          .prepare(
            `INSERT INTO versions (token, version, page_manifest, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            publication.token,
            publication.current_version,
            manifestJson,
            publication.created_at,
          ),
      ])

      return {
        version: publication.current_version,
        page_manifest: pageManifest,
        created_at: publication.created_at,
      }
    },

    async addVersion({
      token,
      version,
      pageManifest,
      createdAt,
    }: AddVersionInput): Promise<AddVersionResult | null> {
      const manifestJson = JSON.stringify(pageManifest)
      const [, bump] = await db.batch([
        db
          .prepare(
            `INSERT INTO versions (token, version, page_manifest, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(token, version, manifestJson, createdAt),
        db
          .prepare(
            `UPDATE publications SET current_version = ?
             WHERE token = ? AND current_version = ?`,
          )
          .bind(version, token, version - 1),
      ])

      if ((bump?.meta.changes ?? 0) === 0) return null

      const publication = await readPublication(token)
      if (!publication) return null

      return {
        publication,
        version: { version, page_manifest: pageManifest, created_at: createdAt },
      }
    },

    async revoke(token, revokedAt) {
      const result = await db
        .prepare(`UPDATE publications SET revoked_at = COALESCE(revoked_at, ?) WHERE token = ?`)
        .bind(revokedAt, token)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readPublication(token)
    },

    async reinstate(token) {
      const result = await db
        .prepare(`UPDATE publications SET revoked_at = NULL WHERE token = ?`)
        .bind(token)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readPublication(token)
    },

    async setExpiry(token, expiresAt) {
      const result = await db
        .prepare(`UPDATE publications SET expires_at = ? WHERE token = ?`)
        .bind(expiresAt, token)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readPublication(token)
    },

    async createSession(input: CreateSessionInput) {
      await db
        .prepare(
          `INSERT INTO sessions (id, token, name, color, is_author, created_at, pin)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.token,
          input.name,
          input.color,
          input.isAuthor ? 1 : 0,
          input.createdAt,
          input.pin ?? null,
        )
        .run()
      return { id: input.id, name: input.name, color: input.color, is_author: input.isAuthor }
    },

    async ensureAuthorSession(input: CreateSessionInput) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO sessions (id, token, name, color, is_author, created_at)
           VALUES (?, ?, ?, ?, 1, ?)`,
        )
        .bind(input.id, input.token, input.name, input.color, input.createdAt)
        .run()
      const existing = await readSession(input.id)
      return existing
        ? publicSession(existing)
        : { id: input.id, name: input.name, color: input.color, is_author: true }
    },

    async findAuthorSession(token) {
      const row = await db
        .prepare(
          `SELECT ${SESSION_COLUMNS} FROM sessions
           WHERE token = ? AND is_author = 1 LIMIT 1`,
        )
        .bind(token)
        .first<SessionRow>()
      return row ? publicSession(toSession(row)) : null
    },

    findSession: readSession,

    async listCommenterSessions(token) {
      const result = await db
        .prepare(
          `SELECT ${SESSION_COLUMNS} FROM sessions
           WHERE token = ? AND is_author = 0 ORDER BY created_at ASC, id ASC`,
        )
        .bind(token)
        .all<SessionRow>()
      return (result.results ?? []).map(toSession)
    },

    async renameSession(id, name) {
      const result = await db
        .prepare(`UPDATE sessions SET name = ? WHERE id = ?`)
        .bind(name, id)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      const renamed = await readSession(id)
      return renamed ? publicSession(renamed) : null
    },

    async setSessionPin(id, pin) {
      const result = await db
        .prepare(`UPDATE sessions SET pin = ? WHERE id = ?`)
        .bind(pin, id)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      const updated = await readSession(id)
      return updated ? publicSession(updated) : null
    },

    async countCommenterSessions(token) {
      const row = await db
        .prepare(`SELECT COUNT(*) AS total FROM sessions WHERE token = ? AND is_author = 0`)
        .bind(token)
        .first<{ total: number }>()
      return row?.total ?? 0
    },

    async createComment(input: CreateCommentInput) {
      await db
        .prepare(
          `INSERT INTO comments
             (id, token, version, page_section_id, parent_id, session_id, body, anchor, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.token,
          input.version,
          input.pageSectionId,
          input.parentId,
          input.sessionId,
          input.body,
          input.anchor === null ? null : JSON.stringify(input.anchor),
          input.createdAt,
        )
        .run()
      const created = await readComment(input.token, input.id)
      if (!created) {
        throw new Error(`Comment ${input.id} vanished immediately after insert`)
      }
      return created
    },

    findComment: readComment,

    async listComments({ token, pageSectionId }: CommentListFilter) {
      const statement =
        pageSectionId === undefined
          ? db
              .prepare(
                `SELECT ${COMMENT_COLUMNS} FROM comments c JOIN sessions s ON s.id = c.session_id
                 WHERE c.token = ? ORDER BY c.created_at ASC, c.id ASC`,
              )
              .bind(token)
          : db
              .prepare(
                `SELECT ${COMMENT_COLUMNS} FROM comments c JOIN sessions s ON s.id = c.session_id
                 WHERE c.token = ? AND c.page_section_id = ?
                 ORDER BY c.created_at ASC, c.id ASC`,
              )
              .bind(token, pageSectionId)
      const result = await statement.all<CommentRow>()
      return (result.results ?? []).map(toComment)
    },

    async updateComment({ token, id, body, anchor, editedAt }: UpdateCommentInput) {
      const assignments = ["edited_at = ?"]
      const values: Array<string | null> = [editedAt]
      if (body !== undefined) {
        assignments.push("body = ?")
        values.push(body)
      }
      if (anchor !== undefined) {
        assignments.push("anchor = ?")
        values.push(anchor === null ? null : JSON.stringify(anchor))
      }

      const result = await db
        .prepare(`UPDATE comments SET ${assignments.join(", ")} WHERE token = ? AND id = ?`)
        .bind(...values, token, id)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readComment(token, id)
    },

    async softDeleteComment(token, id, deletedAt) {
      const result = await db
        .prepare(
          `UPDATE comments SET deleted_at = COALESCE(deleted_at, ?) WHERE token = ? AND id = ?`,
        )
        .bind(deletedAt, token, id)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readComment(token, id)
    },

    async setCommentResolved(token, id, resolvedAt) {
      const result = await db
        .prepare(`UPDATE comments SET resolved_at = ? WHERE token = ? AND id = ?`)
        .bind(resolvedAt, token, id)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readComment(token, id)
    },
  }
}
