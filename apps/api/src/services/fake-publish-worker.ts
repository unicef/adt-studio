import { unzipSync } from "fflate"
import {
  PUBLISH_AUTHOR_COLOR,
  PUBLISH_AUTHOR_DEFAULT_NAME,
  PUBLISH_AUTHOR_NAME_HEADER,
  PublicationCreateRequest,
  PublicationVersionCreateRequest,
  PublishCommentCreateRequest,
  PublishCommentResolveRequest,
  publicationStateAt,
  type CommenterSession,
  type Publication,
  type PublicationPageEntry,
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
}

export interface FakePublishWorkerState {
  publications: Map<string, Publication>
  versions: Map<string, FakePublishedVersion[]>
  comments: PublishComment[]
  authorNames: Array<string | undefined>
  bearerTokens: string[]
  calls: Array<{ method: string; path: string; search: string }>
}

export interface FakePublishWorkerOptions {
  baseUrl?: string
  mgmtSecret?: string
  now?: string
  unreachable?: boolean
  failCreateStatus?: number
  failCreateBody?: { error: string; message?: string }
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

export function createFakePublishWorker(
  options: FakePublishWorkerOptions = {},
): FakePublishWorker {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const secret = options.mgmtSecret ?? DEFAULT_SECRET
  const createdAt = options.now ?? DEFAULT_NOW

  const state: FakePublishWorkerState = {
    publications: new Map(),
    versions: new Map(),
    comments: [],
    authorNames: [],
    bearerTokens: [],
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
      const files = await snapshotFiles(form.get("snapshot"))
      if (files === null) {
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
        files,
      }
      state.publications.set(publication.token, publication)
      state.versions.set(publication.token, [version])

      return json(
        {
          publication,
          version: toWireVersion(version),
          url: shareUrl(publication.token),
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
      const files = await snapshotFiles(form.get("snapshot"))
      if (files === null) {
        return json({ error: "invalid_request", message: "missing snapshot" }, 400)
      }

      const nextVersion = publication.current_version + 1
      const version: FakePublishedVersion = {
        version: nextVersion,
        page_manifest: metadata.data.page_manifest,
        created_at: createdAt,
        files,
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
      return json({ publication: updated })
    }

    const reinstateMatch = /^\/api\/publications\/([^/]+)\/reinstate$/.exec(url.pathname)
    if (reinstateMatch && method === "POST") {
      const token = reinstateMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)
      const updated: Publication = { ...publication, revoked_at: null }
      state.publications.set(token, updated)
      return json({ publication: updated })
    }

    const detailMatch = /^\/api\/publications\/([^/]+)$/.exec(url.pathname)
    if (detailMatch && method === "PATCH") {
      const token = detailMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)
      const body = (await request.json()) as { expires_at: string | null }
      const updated: Publication = { ...publication, expires_at: body.expires_at }
      state.publications.set(token, updated)
      return json({ publication: updated })
    }

    if (detailMatch && method === "GET") {
      const token = detailMatch[1] as string
      const publication = state.publications.get(token)
      if (!publication) return json({ error: "not_found" }, 404)
      return json({
        publication,
        versions: (state.versions.get(token) ?? []).map(toWireVersion),
        url: shareUrl(token),
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
      const publicationState = publicationStateAt(publication)
      if (publicationState !== "active") {
        return json({ error: publicationState === "revoked" ? "revoked" : "expired" }, 410)
      }
      const requested = (serveMatch[2] as string) || "index.html"
      const current = (state.versions.get(token) ?? []).find(
        (version) => version.version === publication.current_version,
      )
      if (!current?.files.includes(requested)) return json({ error: "not_found" }, 404)
      return new Response(`served ${requested}`, { status: 200 })
    }

    return json({ error: "not_found" }, 404)
  }

  return { fetchFn, state, baseUrl, shareUrl }
}

function toWireVersion(version: FakePublishedVersion) {
  return {
    version: version.version,
    page_manifest: version.page_manifest,
    created_at: version.created_at,
  }
}

async function snapshotFiles(value: unknown): Promise<string[] | null> {
  if (!(value instanceof File)) return null
  const bytes = new Uint8Array(await value.arrayBuffer())
  return Object.keys(unzipSync(bytes)).sort()
}
