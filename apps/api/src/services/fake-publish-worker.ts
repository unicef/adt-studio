import { unzipSync } from "fflate"
import {
  PUBLISH_AUTHOR_COLOR,
  PUBLISH_AUTHOR_DEFAULT_NAME,
  PUBLISH_AUTHOR_NAME_HEADER,
  PublicationCreateRequest,
  PublicationUpdateRequest,
  PublicationVersionCreateRequest,
  PublishCommentCreateRequest,
  PublishCommentResolveRequest,
  PublishCommentUpdateRequest,
  publicationStateAt,
  type CommenterSession,
  type Publication,
  type PublicationPageEntry,
  type PublicationReader,
  type PublishComment,
} from "@adt/types"
import type { FetchLike } from "./cloudflare/client.js"

/** Test double for a user's deployed adt-publish worker. Lives in src so it is
 *  typechecked against the contract types it mirrors; nothing outside tests imports it. */

export interface FakePublishedVersion {
  version: number
  page_manifest: PublicationPageEntry[]
  created_at: string
  files: string[]
  /** What the real worker counts while unpacking: the bytes this version occupies in R2. */
  snapshot_bytes: number
}

export interface FakePublishWorkerState {
  publications: Map<string, Publication>
  /** What the real worker keeps as a PBKDF2 hash. The double keeps the plaintext instead, so a
   *  test can assert *which* code the Studio sent — the point here is the wire, not the KDF. */
  accessCodes: Map<string, string>
  versions: Map<string, FakePublishedVersion[]>
  /** Seeded by tests: the real worker derives these from its `sessions` and `comments` tables,
   *  which this double does not model. */
  readers: Map<string, PublicationReader[]>
  comments: PublishComment[]
  authorNames: Array<string | undefined>
  bearerTokens: string[]
  /** Tokens the Studio asked a realtime ticket for. */
  roomTickets: string[]
  /** Tokens whose size a test wants reported as unknown — a version written before
   *  migration 0004. Add to it to exercise the "at least" storage total. */
  unmeasuredTokens: Set<string>
  calls: Array<{ method: string; path: string; search: string }>
}

export interface FakePublishWorkerOptions {
  baseUrl?: string
  mgmtSecret?: string
  now?: string
  unreachable?: boolean
  failCreateStatus?: number
  failCreateBody?: { error: string; message?: string }
  /** Simulates a worker that cannot answer §4.18 — a pre-0.7.0 deployment answers `404`. */
  failListStatus?: number
  failListBody?: { error: string; message?: string }
  /** Simulates a worker deployed before a route existed. Answers exactly what the real
   *  worker's catch-all does, which is indistinguishable from a genuine miss — see
   *  `missingRoute`. */
  missingRoutes?: string[]
}

export interface FakePublishWorker {
  fetchFn: FetchLike
  state: FakePublishWorkerState
  baseUrl: string
  shareUrl(token: string): string
}

const DEFAULT_BASE_URL = "https://adt-publish.example.workers.dev"
const DEFAULT_SECRET = "fake-mgmt-secret"
const DEFAULT_NOW = "2026-08-03T12:00:00.000Z"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/**
 * What a worker answers for a route it does not have.
 *
 * The real worker installs `app.notFound(() => errorResponse(c, "not_found", 404))`, so a route
 * that predates a Studio feature is indistinguishable *by status and code* from a publication
 * that was never in the account. This used to return bare text, which made the Studio's
 * "is this worker too old?" check look correct when it was not.
 */
function missingRoute(): Response {
  return json({ error: "not_found" }, 404)
}

export function createFakePublishWorker(
  options: FakePublishWorkerOptions = {},
): FakePublishWorker {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const secret = options.mgmtSecret ?? DEFAULT_SECRET
  const createdAt = options.now ?? DEFAULT_NOW

  const state: FakePublishWorkerState = {
    publications: new Map(),
    accessCodes: new Map(),
    versions: new Map(),
    readers: new Map(),
    comments: [],
    authorNames: [],
    bearerTokens: [],
    roomTickets: [],
    unmeasuredTokens: new Set(),
    calls: [],
  }

  const authorSession = (token: string, name: string | undefined): CommenterSession => ({
    id: `author-${token}`,
    name: name ?? PUBLISH_AUTHOR_DEFAULT_NAME,
    color: PUBLISH_AUTHOR_COLOR,
    is_author: true,
  })

  const shareUrl = (token: string): string => `${baseUrl}/p/${token}/`

  const fetchFn: FetchLike = async (input, init) => {
    if (options.unreachable) {
      throw new TypeError("fetch failed")
    }

    const url = new URL(input)
    const method = (init?.method ?? "GET").toUpperCase()
    state.calls.push({ method, path: url.pathname, search: url.search })

    const headers = new Headers(init?.headers)
    const authorName = headers.get(PUBLISH_AUTHOR_NAME_HEADER) ?? undefined
    state.authorNames.push(authorName)

    const authorization = new Headers(init?.headers).get("Authorization")
    const presented = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : ""
    state.bearerTokens.push(presented)
    if (presented !== secret) {
      return json({ error: "unauthorized" }, 401)
    }

    const request = new Request(url, init as RequestInit)

    if (url.pathname === "/health") {
      return json({ ok: true, version: "0.2.0" })
    }

    /** §4.18. The aggregates are recomputed the way the worker's SQL does: replies count as
     *  messages, deleted rows count as nothing, and `unresolved_count` counts open *roots*. */
    if (url.pathname === "/api/publications" && method === "GET") {
      if (options.failListStatus) {
        return json(options.failListBody ?? { error: "not_found" }, options.failListStatus)
      }

      const publications = [...state.publications.values()]
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) || a.token.localeCompare(b.token),
        )
        .map((publication) => {
          const versions = state.versions.get(publication.token) ?? []
          const own = state.comments.filter(
            (comment) => comment.token === publication.token && comment.deleted_at === null,
          )
          const measured = state.unmeasuredTokens.has(publication.token)
            ? null
            : versions.reduce((total, version) => total + version.snapshot_bytes, 0)
          return {
            publication,
            url: shareUrl(publication.token),
            has_access_code: state.accessCodes.has(publication.token),
            version_count: versions.length,
            comment_count: own.length,
            unresolved_count: own.filter(
              (comment) => comment.parent_id === null && comment.resolved_at === null,
            ).length,
            snapshot_bytes: versions.length === 0 ? null : measured,
            last_published_at:
              versions.map((version) => version.created_at).sort().at(-1) ?? null,
          }
        })

      return json({ publications })
    }

    if (url.pathname === "/api/publications" && method === "POST") {
      if (options.failCreateStatus) {
        return json(options.failCreateBody ?? { error: "internal_error" }, options.failCreateStatus)
      }

      const form = await request.formData()
      const metadata = PublicationCreateRequest.safeParse(
        JSON.parse(String(form.get("metadata"))) as unknown,
      )
      if (!metadata.success) {
        return json({ error: "invalid_request", message: metadata.error.message }, 400)
      }
      const unpacked = await snapshotFiles(form.get("snapshot"))
      if (unpacked === null) {
        return json({ error: "invalid_request", message: "missing snapshot" }, 400)
      }
      if (state.publications.has(metadata.data.token)) {
        return json({ error: "invalid_request", message: "token already published" }, 400)
      }

      const publication: Publication = {
        token: metadata.data.token,
        title: metadata.data.title,
        book_label: metadata.data.book_label,
        current_version: 1,
        created_at: createdAt,
        expires_at: metadata.data.expires_at ?? null,
        revoked_at: null,
      }
      const version: FakePublishedVersion = {
        version: 1,
        page_manifest: metadata.data.page_manifest,
        created_at: createdAt,
        files: unpacked.files,
        snapshot_bytes: unpacked.totalBytes,
      }
      state.publications.set(publication.token, publication)
      state.versions.set(publication.token, [version])
      if (metadata.data.access_code) {
        state.accessCodes.set(publication.token, metadata.data.access_code)
      }

      return json(
        {
          publication,
          version: toWireVersion(version),
          url: shareUrl(publication.token),
          has_access_code: state.accessCodes.has(publication.token),
        },
        201,
      )
    }

    const versionsMatch = /^\/api\/publications\/([^/]+)\/versions$/.exec(url.pathname)
    if (versionsMatch && method === "POST") {
      const token = versionsMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)

      const form = await request.formData()
      const metadata = PublicationVersionCreateRequest.safeParse(
        JSON.parse(String(form.get("metadata"))) as unknown,
      )
      if (!metadata.success) {
        return json({ error: "invalid_request", message: metadata.error.message }, 400)
      }
      const unpacked = await snapshotFiles(form.get("snapshot"))
      if (unpacked === null) {
        return json({ error: "invalid_request", message: "missing snapshot" }, 400)
      }

      const nextVersion = publication.current_version + 1
      const version: FakePublishedVersion = {
        version: nextVersion,
        page_manifest: metadata.data.page_manifest,
        created_at: createdAt,
        files: unpacked.files,
        snapshot_bytes: unpacked.totalBytes,
      }
      state.versions.set(token, [...(state.versions.get(token) ?? []), version])
      const updated: Publication = { ...publication, current_version: nextVersion }
      state.publications.set(token, updated)

      return json({ publication: updated, version: toWireVersion(version) }, 201)
    }

    const revokeMatch = /^\/api\/publications\/([^/]+)\/revoke$/.exec(url.pathname)
    if (revokeMatch && method === "POST") {
      const token = revokeMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)
      const updated: Publication = {
        ...publication,
        revoked_at: publication.revoked_at ?? createdAt,
      }
      state.publications.set(token, updated)
      return json({ publication: updated, has_access_code: state.accessCodes.has(token) })
    }

    const reinstateMatch = /^\/api\/publications\/([^/]+)\/reinstate$/.exec(url.pathname)
    if (reinstateMatch && method === "POST") {
      const token = reinstateMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)
      const updated: Publication = { ...publication, revoked_at: null }
      state.publications.set(token, updated)
      return json({ publication: updated, has_access_code: state.accessCodes.has(token) })
    }

    const roomTicketMatch = /^\/api\/publications\/([^/]+)\/room-ticket$/.exec(url.pathname)
    if (roomTicketMatch && method === "POST") {
      const token = roomTicketMatch[1] as string
      if (!state.publications.has(token)) return json({ error: "not_found" }, 404)
      state.roomTickets.push(token)
      return json({
        ticket: `v1.9999999999.fake.${token}`,
        ws_url: `${baseUrl.replace(/^http/, "ws")}/p/${token}/room`,
        expires_at: createdAt,
      })
    }

    const readersMatch = /^\/api\/publications\/([^/]+)\/readers$/.exec(url.pathname)
    if (readersMatch && method === "GET") {
      if (options.missingRoutes?.includes("readers")) return missingRoute()
      const token = readersMatch[1] as string
      if (!state.publications.has(token)) return json({ error: "not_found" }, 404)
      return json({ readers: state.readers.get(token) ?? [] })
    }

    const detailMatch = /^\/api\/publications\/([^/]+)$/.exec(url.pathname)
    if (detailMatch && method === "DELETE") {
      if (options.missingRoutes?.includes("delete")) return missingRoute()
      const token = detailMatch[1] as string
      if (!state.publications.has(token)) {
        return json({ token, deleted: false, objects_deleted: 0 })
      }
      state.publications.delete(token)
      state.accessCodes.delete(token)
      state.readers.delete(token)
      return json({ token, deleted: true, objects_deleted: 2 })
    }

    if (detailMatch && method === "PATCH") {
      const token = detailMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)
      const body = PublicationUpdateRequest.safeParse((await request.json()) as unknown)
      if (!body.success) {
        return json({ error: "invalid_request", message: body.error.message }, 400)
      }
      /** Absent keys are left alone, exactly as the worker does. */
      const updated: Publication = {
        ...publication,
        ...(body.data.expires_at === undefined ? {} : { expires_at: body.data.expires_at }),
      }
      state.publications.set(token, updated)
      if (body.data.access_code === null) state.accessCodes.delete(token)
      else if (body.data.access_code !== undefined) {
        state.accessCodes.set(token, body.data.access_code)
      }
      return json({ publication: updated, has_access_code: state.accessCodes.has(token) })
    }

    if (detailMatch && method === "GET") {
      const token = detailMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)
      return json({
        publication,
        versions: (state.versions.get(token) ?? []).map(toWireVersion),
        url: shareUrl(token),
        has_access_code: state.accessCodes.has(token),
      })
    }

    /** Every call from the Studio carries `MGMT_SECRET`, so the comment routes below answer
     *  as the worker does for the author: revoked and expired publications stay readable. */
    const commentsMatch = /^\/p\/([^/]+)\/comments$/.exec(url.pathname)
    if (commentsMatch) {
      const token = commentsMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)

      if (method === "GET") {
        const includeResolved = url.searchParams.get("include_resolved") === "true"
        const pageSectionId = url.searchParams.get("page_section_id")
        const version = url.searchParams.get("version")
        const comments = state.comments.filter((comment) => {
          if (comment.token !== token) return false
          if (pageSectionId !== null && comment.page_section_id !== pageSectionId) return false
          if (version !== null && comment.version !== Number(version)) return false
          return includeResolved || comment.resolved_at === null
        })
        return json({ comments, session: authorSession(token, authorName) })
      }

      if (method === "POST") {
        const parsed = PublishCommentCreateRequest.safeParse((await request.json()) as unknown)
        if (!parsed.success) {
          return json({ error: "invalid_request", message: parsed.error.message }, 400)
        }
        const comment: PublishComment = {
          id: `comment-${state.comments.length + 1}`,
          token,
          version: publication.current_version,
          page_section_id: parsed.data.page_section_id,
          parent_id: parsed.data.parent_id ?? null,
          session_id: `author-${token}`,
          author_name: authorName ?? PUBLISH_AUTHOR_DEFAULT_NAME,
          author_color: PUBLISH_AUTHOR_COLOR,
          body: parsed.data.body,
          anchor: parsed.data.anchor ?? null,
          resolved_at: null,
          edited_at: null,
          deleted_at: null,
          created_at: createdAt,
        }
        state.comments.push(comment)
        return json({ comment }, 201)
      }
    }

    const commentMatch = /^\/p\/([^/]+)\/comments\/([^/]+)$/.exec(url.pathname)
    if (commentMatch && (method === "PATCH" || method === "DELETE")) {
      const token = commentMatch[1] as string
      const id = decodeURIComponent(commentMatch[2] as string)
      const index = state.comments.findIndex(
        (comment) => comment.token === token && comment.id === id,
      )
      if (index === -1) return json({ error: "not_found" }, 404)

      if (method === "DELETE") {
        const comment: PublishComment = {
          ...(state.comments[index] as PublishComment),
          deleted_at: (state.comments[index] as PublishComment).deleted_at ?? createdAt,
        }
        state.comments[index] = comment
        return json({ comment })
      }

      const parsed = PublishCommentUpdateRequest.safeParse((await request.json()) as unknown)
      if (!parsed.success) {
        return json({ error: "invalid_request", message: parsed.error.message }, 400)
      }
      const previous = state.comments[index] as PublishComment
      const comment: PublishComment = {
        ...previous,
        ...(parsed.data.body === undefined ? {} : { body: parsed.data.body }),
        ...(parsed.data.anchor === undefined ? {} : { anchor: parsed.data.anchor }),
        edited_at: createdAt,
      }
      state.comments[index] = comment
      return json({ comment })
    }

    const resolveMatch = /^\/p\/([^/]+)\/comments\/([^/]+)\/resolve$/.exec(url.pathname)
    if (resolveMatch && method === "POST") {
      const token = resolveMatch[1] as string
      const id = decodeURIComponent(resolveMatch[2] as string)
      const parsed = PublishCommentResolveRequest.safeParse((await request.json()) as unknown)
      if (!parsed.success) {
        return json({ error: "invalid_request", message: parsed.error.message }, 400)
      }
      const index = state.comments.findIndex(
        (comment) => comment.token === token && comment.id === id,
      )
      if (index === -1) return json({ error: "not_found" }, 404)
      const comment: PublishComment = {
        ...(state.comments[index] as PublishComment),
        resolved_at: parsed.data.resolved ? createdAt : null,
      }
      state.comments[index] = comment
      return json({ comment })
    }

    const serveMatch = /^\/p\/([^/]+)\/?(.*)$/.exec(url.pathname)
    if (serveMatch && method === "GET") {
      const token = serveMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)
      /** The double is only ever called with `MGMT_SECRET`, and §4.7 step 3 lets the author
       *  read a revoked or expired snapshot — that carve-out is exactly what the Feedback
       *  view depends on, so the double honours it instead of answering `410`. */
      void publicationStateAt(publication)
      const requested = decodeURIComponent((serveMatch[2] as string) || "index.html")
      const current = (state.versions.get(token) ?? []).find(
        (version) => version.version === publication.current_version,
      )
      if (!current?.files.includes(requested)) return json({ error: "not_found" }, 404)
      const etag = `"${token}-${String(publication.current_version)}-${requested}"`
      if (headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers: { etag } })
      }
      return new Response(`served ${requested}`, {
        status: 200,
        headers: {
          "content-type": contentTypeFor(requested),
          "cache-control": requested.endsWith(".html") ? "no-cache" : "public, max-age=3600",
          etag,
        },
      })
    }

    return json({ error: "not_found" }, 404)
  }

  return { fetchFn, state, baseUrl, shareUrl }
}

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith(".html")) return "text/html"
  if (fileName.endsWith(".css")) return "text/css"
  if (fileName.endsWith(".js") || fileName.endsWith(".mjs")) return "application/javascript"
  if (fileName.endsWith(".json")) return "application/json"
  if (fileName.endsWith(".png")) return "image/png"
  return "application/octet-stream"
}

function toWireVersion(version: FakePublishedVersion) {
  return {
    version: version.version,
    page_manifest: version.page_manifest,
    created_at: version.created_at,
  }
}

interface UnpackedSnapshot {
  files: string[]
  totalBytes: number
}

async function snapshotFiles(value: unknown): Promise<UnpackedSnapshot | null> {
  if (!(value instanceof File)) return null
  const bytes = new Uint8Array(await value.arrayBuffer())
  const unpacked = unzipSync(bytes)
  return {
    files: Object.keys(unpacked).sort(),
    totalBytes: Object.values(unpacked).reduce((total, file) => total + file.byteLength, 0),
  }
}
