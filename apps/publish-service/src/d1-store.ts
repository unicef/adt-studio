import {
  CommentAnchor,
  PublicationPageEntry,
  type CommenterSession,
  type Publication,
  type PublicationVersion,
  type PublishComment,
} from "@adt/types"
import { ATTEMPT_WINDOW_SECONDS } from "./access-throttle.js"
import { nameKey } from "./identity.js"
import { PinnedNameConflictError } from "./store.js"
import type {
  AddVersionInput,
  AddVersionResult,
  CommentListFilter,
  CreateCommentInput,
  CreatePublicationInput,
  CreateSessionInput,
  CommitPublicationUploadResult,
  CommittedPublicationUpload,
  PublicationStore,
  StartPublicationUploadInput,
  StartPublicationUploadResult,
  StoredPublicationUpload,
  StoredPublicationUploadFile,
  StoredCommenterSession,
  StoredPublication,
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
  access_code: string | null
}

interface VersionRow {
  version: number
  page_manifest: string
  created_at: string
}

interface UploadRow {
  upload_id: string
  kind: "create" | "version"
  token: string
  version: number
  state: "open" | "committed" | "aborted"
  title: string | null
  book_label: string | null
  page_manifest: string
  snapshot_prefix: string
  snapshot_bytes: number
  expected_files: number
  expires_at: string | null
  access_code: string | null
  created_at: string
  committed_at: string | null
  committed_result: string | null
}

interface UploadFileRow {
  upload_id: string
  path: string
  bytes: number
  sha256: string
  completed_at: string | null
}

interface PublicationListSqlRow extends PublicationRow {
  version_count: number
  snapshot_bytes: number | null
  last_published_at: string | null
  comment_count: number
  unresolved_count: number
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

/** D1 surfaces a SQLite `UNIQUE constraint failed` as a plain `Error` with that text somewhere in
 *  the message — there is no structured error code to match on instead. `sessions` has exactly
 *  one constraint besides its primary key (`idx_sessions_pinned_name_key`, migration 0008), so
 *  any unique-constraint failure reaching one of its writes is that index, not a coincidence. */
function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message)
}

/** Rows older than the counting window can never affect a verdict again. */
function pruneBefore(at: string): string {
  return new Date(Date.parse(at) - ATTEMPT_WINDOW_SECONDS * 1000).toISOString()
}

const COMMENT_COLUMNS = `c.id, c.token, c.version, c.page_section_id, c.parent_id, c.session_id,
         s.name AS author_name, s.color AS author_color, c.body, c.anchor,
         c.resolved_at, c.edited_at, c.deleted_at, c.created_at`

const SESSION_COLUMNS = `id, token, name, color, is_author, pin`

/**
 * The whole dashboard in one statement.
 *
 * Both aggregates are pre-grouped subqueries rather than joins onto the base rows, because
 * joining `versions` and `comments` to `publications` at the same time multiplies them and
 * every count would be wrong by the other table's cardinality. `SUM(snapshot_bytes)` returns
 * NULL only when no version of that publication was ever measured, which is precisely the
 * "unknown, do not invent a number" case the dashboard reports as a floor.
 *
 * `unresolved_count` counts roots, not messages: resolution is thread-level (§4.13 is
 * roots-only), so a reply under a resolved root is closed even though its own `resolved_at`
 * is NULL. This is the same rule `unresolvedThreadCount` applies in the Studio, so the
 * dashboard and the Feedback badge can never disagree.
 */
const PUBLICATION_LIST_SQL = `
  SELECT p.token, p.title, p.book_label, p.current_version, p.created_at, p.expires_at,
         p.revoked_at, p.access_code,
         COALESCE(v.version_count, 0) AS version_count,
         v.snapshot_bytes AS snapshot_bytes,
         v.last_published_at AS last_published_at,
         COALESCE(c.comment_count, 0) AS comment_count,
         COALESCE(c.unresolved_count, 0) AS unresolved_count
  FROM publications p
  LEFT JOIN (
    SELECT token,
           COUNT(*) AS version_count,
           SUM(snapshot_bytes) AS snapshot_bytes,
           MAX(created_at) AS last_published_at
    FROM versions GROUP BY token
  ) v ON v.token = p.token
  LEFT JOIN (
    SELECT token,
           COUNT(*) AS comment_count,
           SUM(CASE WHEN parent_id IS NULL AND resolved_at IS NULL THEN 1 ELSE 0 END)
             AS unresolved_count
    FROM comments WHERE deleted_at IS NULL GROUP BY token
  ) c ON c.token = p.token
  ORDER BY p.created_at DESC, p.token ASC`

interface ReaderRow {
  id: string
  name: string
  color: string
  created_at: string
  comment_count: number
  last_comment_at: string | null
}

/**
 * The author's reader list, one statement. Deleted comments are excluded so a reader whose only
 * message was withdrawn still appears — they did join — with a count of zero, which is the
 * truth about them rather than a row silently dropped.
 *
 * Newest first: the interesting reader is the one who just arrived.
 */
const READER_LIST_SQL = `
  SELECT s.id, s.name, s.color, s.created_at,
         COALESCE(c.comment_count, 0) AS comment_count,
         c.last_comment_at AS last_comment_at
  FROM sessions s
  LEFT JOIN (
    SELECT session_id,
           COUNT(*) AS comment_count,
           MAX(created_at) AS last_comment_at
    FROM comments WHERE deleted_at IS NULL GROUP BY session_id
  ) c ON c.session_id = s.id
  WHERE s.token = ? AND s.is_author = 0
  ORDER BY s.created_at DESC, s.id ASC`

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

function toUpload(row: UploadRow): StoredPublicationUpload {
  const pageManifest = PageManifest.safeParse(JSON.parse(row.page_manifest) as unknown)
  const committed = row.committed_result === null ? null : JSON.parse(row.committed_result) as CommittedPublicationUpload
  return {
    uploadId: row.upload_id,
    kind: row.kind,
    token: row.token,
    version: row.version,
    state: row.state,
    title: row.title,
    bookLabel: row.book_label,
    pageManifest: pageManifest.success ? pageManifest.data : [],
    snapshotPrefix: row.snapshot_prefix,
    snapshotBytes: row.snapshot_bytes,
    expectedFiles: row.expected_files,
    expiresAt: row.expires_at,
    accessCode: row.access_code,
    createdAt: row.created_at,
    committedAt: row.committed_at,
    committedResult: committed,
  }
}

function toUploadFile(row: UploadFileRow): StoredPublicationUploadFile {
  return { uploadId: row.upload_id, path: row.path, bytes: row.bytes, sha256: row.sha256, completedAt: row.completed_at }
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

  const readRecord = async (token: string): Promise<StoredPublication | null> => {
    const row = await db
      .prepare(
        `SELECT token, title, book_label, current_version, created_at, expires_at, revoked_at,
                access_code
         FROM publications WHERE token = ?`,
      )
      .bind(token)
      .first<PublicationRow>()
    return row ? { publication: toPublication(row), accessCode: row.access_code ?? null } : null
  }

  const readPublication = async (token: string): Promise<Publication | null> =>
    (await readRecord(token))?.publication ?? null

  return {
    async startUpload(input: StartPublicationUploadInput): Promise<StartPublicationUploadResult> {
      const request = input.request
      if (request.kind === "version" && !(await readPublication(request.token))) {
        return { ok: false, reason: "not_found" }
      }
      if (request.kind === "create" && (await readPublication(request.token))) {
        return { ok: false, reason: "conflict" }
      }
      const version = request.kind === "create" ? 1 : (await readPublication(request.token))!.current_version + 1
      const pageManifest = JSON.stringify(request.page_manifest)
      const snapshotBytes = request.files.reduce((total, file) => total + file.bytes, 0)
      try {
        await db.batch([
          db.prepare(
            `INSERT INTO publication_uploads
             (upload_id, kind, token, version, title, book_label, page_manifest, snapshot_prefix,
              snapshot_bytes, expected_files, expires_at, access_code, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            input.uploadId, request.kind, request.token, version,
            request.kind === "create" ? request.title : null,
            request.kind === "create" ? request.book_label : null,
            pageManifest, input.snapshotPrefix, snapshotBytes, request.files.length,
            request.kind === "create" ? request.expires_at ?? null : null,
            input.accessCode, input.createdAt,
          ),
          ...request.files.map((file) => db.prepare(
            `INSERT INTO publication_upload_files (upload_id, path, bytes, sha256) VALUES (?, ?, ?, ?)`,
          ).bind(input.uploadId, file.path, file.bytes, file.sha256)),
        ])
      } catch {
        return { ok: false, reason: "conflict" }
      }
      const upload = await this.findUpload(input.uploadId)
      return upload ? { ok: true, upload } : { ok: false, reason: "conflict" }
    },

    async findUpload(uploadId) {
      const row = await db.prepare(`SELECT * FROM publication_uploads WHERE upload_id = ?`).bind(uploadId).first<UploadRow>()
      return row ? toUpload(row) : null
    },

    async findUploadFile(uploadId, path) {
      const row = await db.prepare(`SELECT * FROM publication_upload_files WHERE upload_id = ? AND path = ?`).bind(uploadId, path).first<UploadFileRow>()
      return row ? toUploadFile(row) : null
    },

    async completeUploadFile(uploadId, path, completedAt) {
      const result = await db.prepare(
        `UPDATE publication_upload_files SET completed_at = COALESCE(completed_at, ?)
         WHERE upload_id = ? AND path = ?
           AND EXISTS (SELECT 1 FROM publication_uploads WHERE upload_id = ? AND state = 'open')`,
      ).bind(completedAt, uploadId, path, uploadId).run()
      return (result.meta.changes ?? 0) > 0
    },

    async commitUpload(uploadId, committedAt): Promise<CommitPublicationUploadResult> {
      const upload = await this.findUpload(uploadId)
      if (!upload) return { ok: false, reason: "not_found" }
      if (upload.state === "aborted") return { ok: false, reason: "aborted" }
      if (upload.state === "committed" && upload.committedResult) return { ok: true, committed: upload.committedResult }
      const count = await db.prepare(
        `SELECT COUNT(*) AS completed FROM publication_upload_files WHERE upload_id = ? AND completed_at IS NOT NULL`,
      ).bind(uploadId).first<{ completed: number }>()
      if ((count?.completed ?? 0) !== upload.expectedFiles) return { ok: false, reason: "incomplete" }

      const publication: Publication = upload.kind === "create"
        ? { token: upload.token, title: upload.title ?? "", book_label: upload.bookLabel ?? "", current_version: 1, created_at: committedAt, expires_at: upload.expiresAt, revoked_at: null }
        : (await readPublication(upload.token)) as Publication
      if (!publication) return { ok: false, reason: "not_found" }
      const nextPublication: Publication = upload.kind === "create" ? publication : { ...publication, current_version: upload.version }
      const version: PublicationVersion = { version: upload.version, page_manifest: upload.pageManifest, created_at: committedAt }
      const committed: CommittedPublicationUpload = { publication: nextPublication, version, hasAccessCode: upload.kind === "create" && upload.accessCode !== null ? true : (await readRecord(upload.token))?.accessCode !== null }
      try {
        const statements = upload.kind === "create"
          ? [
              db.prepare(`INSERT INTO publications (token, title, book_label, current_version, created_at, expires_at, revoked_at, access_code) VALUES (?, ?, ?, 1, ?, ?, NULL, ?)`)
                .bind(publication.token, publication.title, publication.book_label, committedAt, publication.expires_at, upload.accessCode),
              db.prepare(`INSERT INTO versions (token, version, page_manifest, created_at, snapshot_bytes, snapshot_prefix, upload_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .bind(upload.token, upload.version, JSON.stringify(upload.pageManifest), committedAt, upload.snapshotBytes, upload.snapshotPrefix, uploadId),
            ]
          : [
              db.prepare(`INSERT INTO versions (token, version, page_manifest, created_at, snapshot_bytes, snapshot_prefix, upload_id)
                          SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM publications WHERE token = ? AND current_version = ?)`)
                .bind(upload.token, upload.version, JSON.stringify(upload.pageManifest), committedAt, upload.snapshotBytes, upload.snapshotPrefix, uploadId, upload.token, upload.version - 1),
              db.prepare(`UPDATE publications SET current_version = ? WHERE token = ? AND current_version = ?`).bind(upload.version, upload.token, upload.version - 1),
            ]
        const results = await db.batch([...statements, db.prepare(`UPDATE publication_uploads SET state = 'committed', committed_at = ?, committed_result = ? WHERE upload_id = ? AND state = 'open'`).bind(committedAt, JSON.stringify(committed), uploadId)])
        if (upload.kind === "version" && ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1)) return { ok: false, reason: "conflict" }
        return { ok: true, committed }
      } catch {
        const again = await this.findUpload(uploadId)
        return again?.state === "committed" && again.committedResult ? { ok: true, committed: again.committedResult } : { ok: false, reason: "conflict" }
      }
    },

    async abortUpload(uploadId) {
      const upload = await this.findUpload(uploadId)
      if (!upload) return null
      if (upload.state === "committed") return "committed"
      if (upload.state === "aborted") return "aborted"
      await db.prepare(`UPDATE publication_uploads SET state = 'aborted' WHERE upload_id = ? AND state = 'open'`).bind(uploadId).run()
      return "aborted"
    },

    async findSnapshotPrefix(token, version, path) {
      const row = await db.prepare(
        `SELECT v.snapshot_prefix FROM versions v JOIN publication_upload_files f ON f.upload_id = v.upload_id
         WHERE v.token = ? AND v.version = ? AND f.path = ? AND f.completed_at IS NOT NULL`,
      ).bind(token, version, path).first<{ snapshot_prefix: string | null }>()
      return row?.snapshot_prefix ?? null
    },

    async listSnapshotPrefixes(token) {
      const rows = await db.prepare(
        `SELECT snapshot_prefix FROM publication_uploads WHERE token = ? UNION SELECT snapshot_prefix FROM versions WHERE token = ?`,
      ).bind(token, token).all<{ snapshot_prefix: string | null }>()
      return (rows.results ?? []).flatMap((row) => row.snapshot_prefix === null ? [] : [row.snapshot_prefix])
    },

    findByToken: readPublication,

    findRecord: readRecord,

    async listPublications() {
      const result = await db.prepare(PUBLICATION_LIST_SQL).all<PublicationListSqlRow>()
      return (result.results ?? []).map((row) => ({
        publication: toPublication(row),
        hasAccessCode: (row.access_code ?? null) !== null,
        versionCount: row.version_count,
        commentCount: row.comment_count,
        unresolvedCount: row.unresolved_count,
        snapshotBytes: row.snapshot_bytes ?? null,
        lastPublishedAt: row.last_published_at ?? null,
      }))
    },

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

    async create({
      publication,
      pageManifest,
      accessCode,
      snapshotBytes,
    }: CreatePublicationInput) {
      const manifestJson = JSON.stringify(pageManifest)
      await db.batch([
        db
          .prepare(
            `INSERT INTO publications
               (token, title, book_label, current_version, created_at, expires_at, revoked_at,
                access_code)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
          )
          .bind(
            publication.token,
            publication.title,
            publication.book_label,
            publication.current_version,
            publication.created_at,
            publication.expires_at,
            accessCode ?? null,
          ),
        db
          .prepare(
            `INSERT INTO versions (token, version, page_manifest, created_at, snapshot_bytes)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            publication.token,
            publication.current_version,
            manifestJson,
            publication.created_at,
            snapshotBytes ?? null,
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
      snapshotBytes,
    }: AddVersionInput): Promise<AddVersionResult | null> {
      const manifestJson = JSON.stringify(pageManifest)
      const [, bump] = await db.batch([
        db
          .prepare(
            `INSERT INTO versions (token, version, page_manifest, created_at, snapshot_bytes)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(token, version, manifestJson, createdAt, snapshotBytes ?? null),
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

    async countAccessFailures({ token, client, kind, since }) {
      const rows = (await db
        .prepare(
          `SELECT
             SUM(CASE WHEN client = ? THEN 1 ELSE 0 END) AS by_client,
             COUNT(*) AS by_token
           FROM access_attempts
           WHERE token = ? AND kind = ? AND at >= ?`,
        )
        .bind(client, token, kind, since)
        .first()) as { by_client: number | null; by_token: number | null } | null
      return { byClient: rows?.by_client ?? 0, byToken: rows?.by_token ?? 0 }
    },

    async recordAccessFailure({ token, client, kind, at }) {
      /** Pruned on write rather than on a schedule: the table only grows when someone is
       *  getting a code wrong, and the row that pays for the cleanup is the one that caused
       *  the growth. */
      await db.batch([
        db
          .prepare(`INSERT INTO access_attempts (token, client, kind, at) VALUES (?, ?, ?, ?)`)
          .bind(token, client, kind, at),
        db.prepare(`DELETE FROM access_attempts WHERE at < ?`).bind(pruneBefore(at)),
      ])
    },

    async clearAccessFailures({ token, client, kind }) {
      await db
        .prepare(`DELETE FROM access_attempts WHERE token = ? AND client = ? AND kind = ?`)
        .bind(token, client, kind)
        .run()
    },

    async deletePublication(token) {
      const publication = await readPublication(token)
      if (!publication) return null
      /** The schema cascades from `publications`, but the children are deleted explicitly
       *  anyway: D1 does not guarantee `PRAGMA foreign_keys` is on for every connection, and
       *  a half-deleted publication would leave comments pointing at a token that no longer
       *  resolves — invisible rows that still count against every total on the shelf. */
      await db.batch([
        db.prepare(`DELETE FROM comments WHERE token = ?`).bind(token),
        db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token),
        db
          .prepare(
            `DELETE FROM publication_upload_files
             WHERE upload_id IN (SELECT upload_id FROM publication_uploads WHERE token = ?)`,
          )
          .bind(token),
        db.prepare(`DELETE FROM publication_uploads WHERE token = ?`).bind(token),
        db.prepare(`DELETE FROM versions WHERE token = ?`).bind(token),
        db.prepare(`DELETE FROM publications WHERE token = ?`).bind(token),
      ])
      return publication
    },

    async setExpiry(token, expiresAt) {
      const result = await db
        .prepare(`UPDATE publications SET expires_at = ? WHERE token = ?`)
        .bind(expiresAt, token)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readPublication(token)
    },

    async setAccessCode(token, accessCode) {
      const result = await db
        .prepare(`UPDATE publications SET access_code = ? WHERE token = ?`)
        .bind(accessCode, token)
        .run()
      if ((result.meta.changes ?? 0) === 0) return null
      return readPublication(token)
    },

    async createSession(input: CreateSessionInput) {
      try {
        await db
          .prepare(
            `INSERT INTO sessions (id, token, name, name_key, color, is_author, created_at, pin)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.id,
            input.token,
            input.name,
            nameKey(input.name),
            input.color,
            input.isAuthor ? 1 : 0,
            input.createdAt,
            input.pin ?? null,
          )
          .run()
      } catch (error) {
        /** Only reachable when `input.pin` is set — a NULL pin never matches the partial index's
         *  `WHERE pin IS NOT NULL`, so nothing else in this INSERT can trip it. */
        if (isUniqueConstraintError(error)) throw new PinnedNameConflictError(input.name)
        throw error
      }
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

    async listReaders(token) {
      const result = await db.prepare(READER_LIST_SQL).bind(token).all<ReaderRow>()
      return (result.results ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        joined_at: row.created_at,
        comment_count: row.comment_count,
        last_comment_at: row.last_comment_at,
      }))
    },

    async renameSession(id, name) {
      let result
      try {
        result = await db
          .prepare(`UPDATE sessions SET name = ?, name_key = ? WHERE id = ?`)
          .bind(name, nameKey(name), id)
          .run()
      } catch (error) {
        /** Only reachable when this row already carries a pin — the partial index is silent on
         *  a pinless row regardless of what its name changes to. */
        if (isUniqueConstraintError(error)) throw new PinnedNameConflictError(name)
        throw error
      }
      if ((result.meta.changes ?? 0) === 0) return null
      const renamed = await readSession(id)
      return renamed ? publicSession(renamed) : null
    },

    async setSessionPin(id, pin) {
      let result
      try {
        result = await db
          .prepare(`UPDATE sessions SET pin = ? WHERE id = ?`)
          .bind(pin, id)
          .run()
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const row = await readSession(id)
          throw new PinnedNameConflictError(row?.name ?? "")
        }
        throw error
      }
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
      const assignments: string[] = []
      const values: Array<string | null> = []
      if (editedAt !== undefined) {
        assignments.push("edited_at = ?")
        values.push(editedAt)
      }
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
