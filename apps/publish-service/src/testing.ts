import type {
  CommenterSession,
  Publication,
  PublicationVersion,
  PublishComment,
} from "@adt/types"
import type { PublicationStore, StoredCommenterSession } from "./store.js"

/**
 * In-memory doubles for the D1 and R2 bindings.
 *
 * They exist so the route-shape suite can exercise real publish behaviour (zip
 * unpacking, version bumps, snapshot serving) without booting workerd. The
 * `*.integration.test.ts` suite covers the same paths against real D1 and R2 through
 * `@cloudflare/vitest-pool-workers`; these doubles are never imported by `index.ts`, so
 * they are tree-shaken out of the deployed artifact.
 */

export interface MemoryR2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string): Promise<unknown>
  get(key: string, options?: { onlyIf?: { etagDoesNotMatch?: string } }): Promise<unknown>
  keys(): string[]
  text(key: string): string | null
}

function etagOf(bytes: Uint8Array): string {
  let hash = 2166136261
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 16777619)
  }
  return `${bytes.length.toString(16)}-${(hash >>> 0).toString(16)}`
}

function toBytes(value: ArrayBuffer | ArrayBufferView | string): Uint8Array {
  if (typeof value === "string") return new TextEncoder().encode(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

export function createMemoryR2Bucket(): MemoryR2Bucket {
  const objects = new Map<string, Uint8Array>()

  return {
    async put(key, value) {
      objects.set(key, toBytes(value))
      return { key }
    },

    async get(key, options) {
      const bytes = objects.get(key)
      if (!bytes) return null
      const httpEtag = `"${etagOf(bytes)}"`

      const condition = options?.onlyIf?.etagDoesNotMatch
      if (condition !== undefined) {
        if (condition.includes('"') || condition.startsWith("W/")) {
          throw new Error("etagDoesNotMatch must be an unquoted etag (workerd rejects quoted forms)")
        }
        if (condition === etagOf(bytes)) {
          return { key, size: bytes.length, httpEtag, etag: httpEtag.slice(1, -1) }
        }
      }

      return {
        key,
        size: bytes.length,
        httpEtag,
        etag: httpEtag.slice(1, -1),
        body: new Response(bytes).body,
      }
    },

    keys() {
      return [...objects.keys()].sort()
    },

    text(key) {
      const bytes = objects.get(key)
      return bytes ? new TextDecoder().decode(bytes) : null
    },
  }
}

export function createMemoryPublicationStore(): PublicationStore {
  const publications = new Map<string, Publication>()
  const accessCodes = new Map<string, string>()
  const versions = new Map<string, PublicationVersion[]>()
  /** `snapshot_bytes` lives beside the versions rather than on `PublicationVersion`, which is a
   *  wire type and deliberately does not carry it. Keyed `<token>/v<N>`, mirroring R2. */
  const snapshotBytes = new Map<string, number | null>()
  const sessions = new Map<string, StoredCommenterSession>()
  const comments = new Map<string, PublishComment>()

  const sumSnapshotBytes = (token: string): number | null => {
    const measured = (versions.get(token) ?? [])
      .map((entry) => snapshotBytes.get(`${token}/v${entry.version}`) ?? null)
      .filter((bytes): bytes is number => bytes !== null)
    return measured.length === 0 ? null : measured.reduce((total, bytes) => total + bytes, 0)
  }

  const publicSession = (session: StoredCommenterSession): CommenterSession => ({
    id: session.id,
    name: session.name,
    color: session.color,
    is_author: session.is_author,
  })

  const withAuthor = (comment: PublishComment): PublishComment => {
    const session = sessions.get(comment.session_id)
    return {
      ...comment,
      author_name: session?.name ?? comment.author_name,
      author_color: session?.color ?? comment.author_color,
    }
  }

  const readComment = (token: string, id: string): PublishComment | null => {
    const comment = comments.get(id)
    return comment && comment.token === token ? withAuthor(comment) : null
  }

  return {
    async findByToken(token) {
      const record = publications.get(token)
      return record ? { ...record } : null
    },

    async findRecord(token) {
      const record = publications.get(token)
      if (!record) return null
      return { publication: { ...record }, accessCode: accessCodes.get(token) ?? null }
    },

    async listPublications() {
      return [...publications.values()]
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) || a.token.localeCompare(b.token),
        )
        .map((publication) => {
          const own = [...comments.values()].filter(
            (comment) => comment.token === publication.token && comment.deleted_at === null,
          )
          const entries = versions.get(publication.token) ?? []
          return {
            publication: { ...publication },
            hasAccessCode: accessCodes.has(publication.token),
            versionCount: entries.length,
            commentCount: own.length,
            unresolvedCount: own.filter(
              (comment) => comment.parent_id === null && comment.resolved_at === null,
            ).length,
            snapshotBytes: sumSnapshotBytes(publication.token),
            lastPublishedAt:
              entries.length === 0
                ? null
                : entries
                    .map((entry) => entry.created_at)
                    .sort((a, b) => b.localeCompare(a))[0] ?? null,
          }
        })
    },

    async listVersions(token) {
      return [...(versions.get(token) ?? [])].sort((a, b) => a.version - b.version)
    },

    async create({ publication, pageManifest, accessCode, snapshotBytes: bytes }) {
      publications.set(publication.token, { ...publication })
      if (accessCode) accessCodes.set(publication.token, accessCode)
      const version: PublicationVersion = {
        version: publication.current_version,
        page_manifest: pageManifest,
        created_at: publication.created_at,
      }
      versions.set(publication.token, [version])
      snapshotBytes.set(`${publication.token}/v${version.version}`, bytes ?? null)
      return version
    },

    async addVersion({ token, version, pageManifest, createdAt, snapshotBytes: bytes }) {
      const record = publications.get(token)
      if (!record || record.current_version !== version - 1) return null

      const next: PublicationVersion = {
        version,
        page_manifest: pageManifest,
        created_at: createdAt,
      }
      versions.set(token, [...(versions.get(token) ?? []), next])
      snapshotBytes.set(`${token}/v${version}`, bytes ?? null)
      const updated: Publication = { ...record, current_version: version }
      publications.set(token, updated)
      return { publication: updated, version: next }
    },

    async revoke(token, revokedAt) {
      const record = publications.get(token)
      if (!record) return null
      const updated: Publication = { ...record, revoked_at: record.revoked_at ?? revokedAt }
      publications.set(token, updated)
      return updated
    },

    async reinstate(token) {
      const record = publications.get(token)
      if (!record) return null
      const updated: Publication = { ...record, revoked_at: null }
      publications.set(token, updated)
      return updated
    },

    async setExpiry(token, expiresAt) {
      const record = publications.get(token)
      if (!record) return null
      const updated: Publication = { ...record, expires_at: expiresAt }
      publications.set(token, updated)
      return updated
    },

    async setAccessCode(token, accessCode) {
      const record = publications.get(token)
      if (!record) return null
      if (accessCode === null) accessCodes.delete(token)
      else accessCodes.set(token, accessCode)
      return { ...record }
    },

    async findVersion(token, version) {
      return (versions.get(token) ?? []).find((entry) => entry.version === version) ?? null
    },

    async createSession(input) {
      const session: StoredCommenterSession = {
        id: input.id,
        token: input.token,
        name: input.name,
        color: input.color,
        is_author: input.isAuthor,
        pin: input.pin ?? null,
      }
      sessions.set(session.id, session)
      return publicSession(session)
    },

    async ensureAuthorSession(input) {
      const existing = sessions.get(input.id)
      if (existing) return publicSession(existing)
      const session: StoredCommenterSession = {
        id: input.id,
        token: input.token,
        name: input.name,
        color: input.color,
        is_author: true,
        pin: null,
      }
      sessions.set(session.id, session)
      return publicSession(session)
    },

    async findAuthorSession(token) {
      const found = [...sessions.values()].find(
        (session) => session.token === token && session.is_author,
      )
      return found ? publicSession(found) : null
    },

    async findSession(id) {
      const session = sessions.get(id)
      return session ? { ...session } : null
    },

    async listCommenterSessions(token) {
      return [...sessions.values()]
        .filter((session) => session.token === token && !session.is_author)
        .map((session) => ({ ...session }))
    },

    async renameSession(id, name) {
      const session = sessions.get(id)
      if (!session) return null
      const updated: StoredCommenterSession = { ...session, name }
      sessions.set(id, updated)
      return publicSession(updated)
    },

    async setSessionPin(id, pin) {
      const session = sessions.get(id)
      if (!session) return null
      const updated: StoredCommenterSession = { ...session, pin }
      sessions.set(id, updated)
      return publicSession(updated)
    },

    async countCommenterSessions(token) {
      return [...sessions.values()].filter(
        (session) => session.token === token && !session.is_author,
      ).length
    },

    async createComment(input) {
      const session = sessions.get(input.sessionId)
      const comment: PublishComment = {
        id: input.id,
        token: input.token,
        version: input.version,
        page_section_id: input.pageSectionId,
        parent_id: input.parentId,
        session_id: input.sessionId,
        author_name: session?.name ?? "",
        author_color: session?.color ?? "#8d8d8d",
        body: input.body,
        anchor: input.anchor,
        resolved_at: null,
        edited_at: null,
        deleted_at: null,
        created_at: input.createdAt,
      }
      comments.set(comment.id, comment)
      return withAuthor(comment)
    },

    async findComment(token, id) {
      return readComment(token, id)
    },

    async listComments({ token, pageSectionId }) {
      return [...comments.values()]
        .filter(
          (comment) =>
            comment.token === token &&
            (pageSectionId === undefined || comment.page_section_id === pageSectionId),
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map(withAuthor)
    },

    async updateComment({ token, id, body, anchor, editedAt }) {
      const comment = comments.get(id)
      if (!comment || comment.token !== token) return null
      const updated: PublishComment = {
        ...comment,
        ...(body === undefined ? {} : { body }),
        ...(anchor === undefined ? {} : { anchor }),
        ...(editedAt === undefined ? {} : { edited_at: editedAt }),
      }
      comments.set(id, updated)
      return withAuthor(updated)
    },

    async softDeleteComment(token, id, deletedAt) {
      const comment = comments.get(id)
      if (!comment || comment.token !== token) return null
      const updated: PublishComment = {
        ...comment,
        deleted_at: comment.deleted_at ?? deletedAt,
      }
      comments.set(id, updated)
      return withAuthor(updated)
    },

    async setCommentResolved(token, id, resolvedAt) {
      const comment = comments.get(id)
      if (!comment || comment.token !== token) return null
      const updated: PublishComment = { ...comment, resolved_at: resolvedAt }
      comments.set(id, updated)
      return withAuthor(updated)
    },
  }
}
