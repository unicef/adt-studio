import { createHash } from "node:crypto"
import {
  PUBLICATION_SNAPSHOT_MAX_FILE_BYTES,
  PUBLISH_WORKER_VERSION,
  PublicationToken,
  PublicationUpdateRequest,
  PublicationUploadStartRequest,
  publicationStateAt,
  type Publication,
  type PublicationPageEntry,
  type PublicationUploadFile,
} from "@adt/types"
import type { FetchLike } from "./cloudflare/client.js"

export interface FakePublishedFile {
  path: string
  bytes: number
  text: string
}

export interface FakePublishedVersion {
  version: number
  page_manifest: PublicationPageEntry[]
  created_at: string
  files: FakePublishedFile[]
  snapshot_bytes: number
}

export interface FakeUpload {
  upload_id: string
  token: string
  version: number
  state: "open" | "committed" | "aborted"
  declared: PublicationUploadFile[]
  received: Map<string, FakePublishedFile>
  page_manifest: PublicationPageEntry[]
  create: { title: string; book_label: string; expires_at: string | null } | null
  access_code: string | null
}

export interface FakePublishWorkerState {
  publications: Map<string, Publication>
  accessCodes: Map<string, string>
  versions: Map<string, FakePublishedVersion[]>
  uploads: Map<string, FakeUpload>
  unmeasuredTokens: Set<string>
  bearerTokens: string[]
  calls: Array<{ method: string; path: string; search: string }>
}

export interface FakePublishWorkerOptions {
  baseUrl?: string
  mgmtSecret?: string
  now?: string
  unreachable?: boolean
  failStartStatus?: number
  failStartBody?: { error: string; message?: string }
  failListStatus?: number
  failListBody?: { error: string; message?: string }
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

const UNSAFE_SEGMENT = /^(\.|\.\.)$/

function normalizeSnapshotPath(raw: string): string | null {
  if (raw.length === 0) return null
  if (raw.includes("\\")) return null
  if (raw.includes("\0")) return null
  if (raw.startsWith("/")) return null
  if (/^[A-Za-z]:/.test(raw)) return null

  const segments = raw.split("/")
  if (segments.some((segment) => segment.length === 0 || UNSAFE_SEGMENT.test(segment))) {
    return null
  }
  return segments.join("/")
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function fail(error: string, status: number, message?: string): Response {
  return json(message === undefined ? { error } : { error, message }, status)
}

function notFound(): Response {
  return fail("not_found", 404)
}

function sha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex")
}

export function createFakePublishWorker(
  options: FakePublishWorkerOptions = {},
): FakePublishWorker {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const secret = options.mgmtSecret ?? DEFAULT_SECRET
  const now = options.now ?? DEFAULT_NOW
  const missingRoutes = new Set(options.missingRoutes ?? [])

  const state: FakePublishWorkerState = {
    publications: new Map(),
    accessCodes: new Map(),
    versions: new Map(),
    uploads: new Map(),
    unmeasuredTokens: new Set(),
    bearerTokens: [],
    calls: [],
  }

  let nextUploadId = 1

  const shareUrl = (token: string): string => `${baseUrl}/p/${token}/`

  const versionsOf = (token: string): FakePublishedVersion[] => state.versions.get(token) ?? []

  const toWireVersion = (version: FakePublishedVersion) => ({
    version: version.version,
    page_manifest: version.page_manifest,
    created_at: version.created_at,
  })

  const publicationBody = (publication: Publication) => ({
    publication,
    has_access_code: state.accessCodes.has(publication.token),
  })

  const listEntry = (publication: Publication) => {
    const versions = versionsOf(publication.token)
    const measured = state.unmeasuredTokens.has(publication.token)
      ? null
      : versions.reduce((total, version) => total + version.snapshot_bytes, 0)
    return {
      publication,
      url: shareUrl(publication.token),
      has_access_code: state.accessCodes.has(publication.token),
      version_count: versions.length,
      comment_count: 0,
      unresolved_count: 0,
      snapshot_bytes: versions.length === 0 ? null : measured,
      last_published_at: versions.map((version) => version.created_at).sort().at(-1) ?? null,
    }
  }

  const fetchFn: FetchLike = async (input, init) => {
    if (options.unreachable) {
      throw new TypeError("fetch failed")
    }

    const url = new URL(input)
    const method = (init?.method ?? "GET").toUpperCase()
    state.calls.push({ method, path: url.pathname, search: url.search })

    if (missingRoutes.has(url.pathname)) return notFound()

    const request = new Request(url, init as RequestInit)
    const authorization = new Headers(init?.headers).get("Authorization")
    const presented = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : ""
    const isAuthor = presented === secret

    if (url.pathname === "/health") {
      return json({ ok: true, version: PUBLISH_WORKER_VERSION })
    }

    const serveMatch = /^\/p\/([^/]+)(?:\/(.*))?$/.exec(url.pathname)
    if (serveMatch && method === "GET") {
      const [, rawToken, rest] = serveMatch as unknown as [string, string, string | undefined]
      const token = PublicationToken.safeParse(rawToken)
      if (!token.success) return notFound()
      const publication = state.publications.get(token.data)
      if (!publication) return notFound()

      if (!isAuthor) {
        const publicationState = publicationStateAt(publication, new Date(now))
        if (publicationState === "revoked") return fail("revoked", 410)
        if (publicationState === "expired") return fail("expired", 410)
      }

      let requested: string
      try {
        requested = decodeURIComponent(rest ?? "")
      } catch {
        return notFound()
      }
      const relative = normalizeSnapshotPath(requested)
      if (relative === null) return notFound()

      const current = versionsOf(token.data).find(
        (version) => version.version === publication.current_version,
      )
      const file = current?.files.find((entry) => entry.path === relative)
      if (!file) return notFound()
      return new Response(file.text, { status: 200 })
    }

    state.bearerTokens.push(presented)
    if (!isAuthor) return fail("unauthorized", 401)

    if (url.pathname === "/api/publications" && method === "GET") {
      if (options.failListStatus) {
        return json(options.failListBody ?? { error: "not_found" }, options.failListStatus)
      }
      const publications = [...state.publications.values()]
        .sort(
          (a, b) => b.created_at.localeCompare(a.created_at) || a.token.localeCompare(b.token),
        )
        .map(listEntry)
      return json({ publications })
    }

    if (url.pathname === "/api/publication-uploads" && method === "POST") {
      if (options.failStartStatus) {
        return json(options.failStartBody ?? { error: "internal_error" }, options.failStartStatus)
      }
      const parsed = PublicationUploadStartRequest.safeParse(await request.json())
      if (!parsed.success) return fail("invalid_request", 400, parsed.error.message)
      const start = parsed.data

      for (const file of start.files) {
        if (normalizeSnapshotPath(file.path) !== file.path) {
          return fail("invalid_request", 400, `Unsafe file path: ${file.path}`)
        }
      }
      const declared = new Set(start.files.map((file) => file.path))
      if (start.page_manifest.some((page) => !declared.has(page.href))) {
        return fail("invalid_request", 400, "Every page manifest href must be uploaded")
      }

      const existing = state.publications.get(start.token)
      if (start.kind === "create" && existing) return fail("invalid_request", 409)
      if (start.kind === "version" && !existing) return notFound()

      const version = existing ? existing.current_version + 1 : 1
      const upload: FakeUpload = {
        upload_id: `upload-${nextUploadId++}`,
        token: start.token,
        version,
        state: "open",
        declared: start.files,
        received: new Map(),
        page_manifest: start.page_manifest,
        create:
          start.kind === "create"
            ? {
                title: start.title,
                book_label: start.book_label,
                expires_at: start.expires_at ?? null,
              }
            : null,
        access_code: start.kind === "create" ? (start.access_code ?? null) : null,
      }
      state.uploads.set(upload.upload_id, upload)
      return json({ upload_id: upload.upload_id, token: upload.token, version }, 201)
    }

    const fileMatch = /^\/api\/publication-uploads\/([^/]+)\/files\/(.+)$/.exec(url.pathname)
    if (fileMatch && method === "PUT") {
      const [, rawUploadId, rest] = fileMatch as unknown as [string, string, string]
      let requested: string
      try {
        requested = decodeURIComponent(rest)
      } catch {
        return fail("invalid_request", 400, "Invalid file path")
      }
      const path = normalizeSnapshotPath(requested)
      if (path === null) return fail("invalid_request", 400, "Unsafe file path")

      const upload = state.uploads.get(decodeURIComponent(rawUploadId))
      if (!upload) return notFound()
      if (upload.state !== "open") {
        return fail("invalid_request", 409, "Upload is no longer open")
      }

      const expected = upload.declared.find((entry) => entry.path === path)
      if (!expected) return fail("invalid_request", 400, "File was not declared")

      const body = new Uint8Array(await request.arrayBuffer())
      if (body.byteLength > PUBLICATION_SNAPSHOT_MAX_FILE_BYTES) {
        return fail(
          "payload_too_large",
          413,
          `Files are limited to ${PUBLICATION_SNAPSHOT_MAX_FILE_BYTES} bytes`,
        )
      }
      if (body.byteLength !== expected.bytes || sha256(body) !== expected.sha256) {
        return fail("invalid_request", 400, "File does not match its declared size and digest")
      }

      upload.received.set(path, {
        path,
        bytes: body.byteLength,
        text: new TextDecoder().decode(body),
      })
      return json({ path, bytes: expected.bytes })
    }

    const commitMatch = /^\/api\/publication-uploads\/([^/]+)\/commit$/.exec(url.pathname)
    if (commitMatch && method === "POST") {
      const upload = state.uploads.get(decodeURIComponent(commitMatch[1] as string))
      if (!upload) return notFound()
      if (upload.state !== "open") return fail("invalid_request", 409)
      if (upload.declared.some((entry) => !upload.received.has(entry.path))) {
        return fail("invalid_request", 400)
      }

      const files = [...upload.received.values()].sort((a, b) => a.path.localeCompare(b.path))
      const version: FakePublishedVersion = {
        version: upload.version,
        page_manifest: upload.page_manifest,
        created_at: now,
        files,
        snapshot_bytes: files.reduce((total, file) => total + file.bytes, 0),
      }

      const existing = state.publications.get(upload.token)
      const publication: Publication = existing
        ? { ...existing, current_version: upload.version }
        : {
            token: upload.token,
            title: upload.create?.title ?? upload.token,
            book_label: upload.create?.book_label ?? upload.token,
            current_version: upload.version,
            created_at: now,
            expires_at: upload.create?.expires_at ?? null,
            revoked_at: null,
          }

      state.publications.set(publication.token, publication)
      state.versions.set(publication.token, [...versionsOf(publication.token), version])
      if (upload.access_code) state.accessCodes.set(publication.token, upload.access_code)
      upload.state = "committed"

      return json(
        {
          upload_id: upload.upload_id,
          publication,
          version: toWireVersion(version),
          url: shareUrl(publication.token),
          has_access_code: state.accessCodes.has(publication.token),
        },
        201,
      )
    }

    const uploadMatch = /^\/api\/publication-uploads\/([^/]+)$/.exec(url.pathname)
    if (uploadMatch && method === "DELETE") {
      const upload = state.uploads.get(decodeURIComponent(uploadMatch[1] as string))
      if (!upload) return notFound()
      if (upload.state === "committed") {
        return fail("invalid_request", 409, "Committed uploads cannot be aborted")
      }
      const objectsDeleted = upload.received.size
      upload.state = "aborted"
      upload.received.clear()
      return json({
        upload_id: upload.upload_id,
        state: "aborted",
        objects_deleted: objectsDeleted,
      })
    }

    const mgmtToken = (raw: string) => PublicationToken.safeParse(raw)

    const revokeMatch = /^\/api\/publications\/([^/]+)\/revoke$/.exec(url.pathname)
    if (revokeMatch && method === "POST") {
      const token = mgmtToken(revokeMatch[1] as string)
      if (!token.success) return fail("invalid_request", 400, token.error.message)
      const publication = state.publications.get(token.data)
      if (!publication) return notFound()
      const revoked: Publication = { ...publication, revoked_at: now }
      state.publications.set(revoked.token, revoked)
      return json(publicationBody(revoked))
    }

    const reinstateMatch = /^\/api\/publications\/([^/]+)\/reinstate$/.exec(url.pathname)
    if (reinstateMatch && method === "POST") {
      const token = mgmtToken(reinstateMatch[1] as string)
      if (!token.success) return fail("invalid_request", 400, token.error.message)
      const publication = state.publications.get(token.data)
      if (!publication) return notFound()
      const active: Publication = { ...publication, revoked_at: null }
      state.publications.set(active.token, active)
      return json(publicationBody(active))
    }

    const detailMatch = /^\/api\/publications\/([^/]+)$/.exec(url.pathname)
    if (detailMatch) {
      const token = mgmtToken(detailMatch[1] as string)
      if (!token.success) return fail("invalid_request", 400, token.error.message)
      const publication = state.publications.get(token.data)

      if (method === "DELETE") {
        const objectsDeleted = versionsOf(token.data).reduce(
          (total, version) => total + version.files.length,
          0,
        )
        state.publications.delete(token.data)
        state.versions.delete(token.data)
        state.accessCodes.delete(token.data)
        return json({
          token: token.data,
          deleted: publication !== undefined,
          objects_deleted: publication ? objectsDeleted : 0,
        })
      }

      if (!publication) return notFound()

      if (method === "GET") {
        return json({
          publication,
          versions: versionsOf(token.data).map(toWireVersion),
          url: shareUrl(token.data),
          has_access_code: state.accessCodes.has(token.data),
        })
      }

      if (method === "PATCH") {
        const parsed = PublicationUpdateRequest.safeParse(await request.json())
        if (!parsed.success) return fail("invalid_request", 400, parsed.error.message)
        const update = parsed.data
        const patched: Publication = {
          ...publication,
          expires_at:
            update.expires_at === undefined ? publication.expires_at : update.expires_at,
        }
        state.publications.set(patched.token, patched)
        if (update.access_code === null) state.accessCodes.delete(patched.token)
        else if (update.access_code !== undefined) {
          state.accessCodes.set(patched.token, update.access_code)
        }
        return json(publicationBody(patched))
      }
    }

    return notFound()
  }

  return { fetchFn, state, baseUrl, shareUrl }
}
