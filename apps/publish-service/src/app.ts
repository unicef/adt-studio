import { Hono } from "hono"
import type { Context } from "hono"
import {
  PUBLISH_WORKER_VERSION,
  PublicationToken,
  PublicationUploadStartRequest,
  PublicationUpdateRequest,
  type Publication,
  type PublicationDetail,
  type PublicationList,
  type PublicationResponse,
  type PublishWorkerHealth,
} from "@adt/types"
import { accessGate, registerAccessRoute } from "./access.js"
import { createD1PublicationStore } from "./d1-store.js"
import type { Env } from "./env.js"
import { errorResponse } from "./errors.js"
import { readJsonBody } from "./http.js"
import { hashAccessCode, randomId } from "./identity.js"
import { mgmtAuth } from "./middleware/mgmt-auth.js"
import { publicationLookup, type PublicationVariables } from "./middleware/publication-lookup.js"
import {
  cacheControlFor,
  conditionalEtag,
  contentTypeFor,
  snapshotPathFromUrl,
} from "./serve.js"
import {
  deleteSnapshotObjects,
  normalizeSnapshotPath,
  SNAPSHOT_LIMITS,
  type SnapshotLimits,
} from "./snapshot.js"
import type { PublicationStore } from "./store.js"

export type AppEnv = { Bindings: Env; Variables: PublicationVariables }

export interface AppOptions {
  store?: PublicationStore
  createStore?: (env: Env) => PublicationStore
  snapshotLimits?: SnapshotLimits
  now?: () => Date
  newId?: () => string
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const injected = options.store
  const resolveStore = (env: Env): PublicationStore =>
    injected ?? (options.createStore ?? ((e: Env) => createD1PublicationStore(e.DB)))(env)
  const now = options.now ?? (() => new Date())
  const timestamp = (): string => now().toISOString()
  const requirePublication = publicationLookup(resolveStore)

  const shareUrl = (c: Context, token: string): string =>
    `${new URL(c.req.url).origin}/p/${token}/`

  /** Management answers report *whether* a code is set, never the code or its hash. */
  const publicationBody = async (
    store: PublicationStore,
    publication: Publication,
  ): Promise<PublicationResponse> => ({
    publication,
    has_access_code: ((await store.findRecord(publication.token))?.accessCode ?? null) !== null,
  })

  const app = new Hono<AppEnv>()

  app.get("/health", (c) => {
    const health: PublishWorkerHealth = { ok: true, version: PUBLISH_WORKER_VERSION }
    return c.json(health)
  })

  app.use("/api/*", mgmtAuth)

  app.get("/api/publications", async (c) => {
    const store = resolveStore(c.env)
    const rows = await store.listPublications()
    const body: PublicationList = {
      publications: rows.map((row) => ({
        publication: row.publication,
        url: shareUrl(c, row.publication.token),
        has_access_code: row.hasAccessCode,
        version_count: row.versionCount,
        comment_count: row.commentCount,
        unresolved_count: row.unresolvedCount,
        snapshot_bytes: row.snapshotBytes,
        last_published_at: row.lastPublishedAt,
      })),
    }
    return c.json(body)
  })

  app.post("/api/publication-uploads", async (c) => {
    const body = await readJsonBody(c, PublicationUploadStartRequest)
    if (!body.ok) return errorResponse(c, "invalid_request", 400, body.message)
    for (const file of body.data.files) {
      if (normalizeSnapshotPath(file.path) !== file.path) {
        return errorResponse(c, "invalid_request", 400, `Unsafe file path: ${file.path}`)
      }
    }
    const declared = new Set(body.data.files.map((file) => file.path))
    if (body.data.page_manifest.some((page) => !declared.has(page.href))) {
      return errorResponse(c, "invalid_request", 400, "Every page manifest href must be uploaded")
    }
    const uploadId = (options.newId ?? (() => randomId()))()
    const accessCode = body.data.kind === "create" && body.data.access_code
      ? await hashAccessCode(body.data.access_code)
      : null
    const result = await resolveStore(c.env).startUpload({
      uploadId,
      snapshotPrefix: `uploads/${uploadId}`,
      request: body.data,
      accessCode,
      createdAt: timestamp(),
    })
    if (!result.ok) return errorResponse(c, result.reason === "not_found" ? "not_found" : "invalid_request", result.reason === "not_found" ? 404 : 409)
    return c.json({ upload_id: uploadId, token: result.upload.token, version: result.upload.version }, 201)
  })

  app.put("/api/publication-uploads/:uploadId/files/*", async (c) => {
    const uploadId = c.req.param("uploadId")
    const routePrefix = `/api/publication-uploads/${uploadId}/files/`
    let raw: string
    try { raw = decodeURIComponent(c.req.path.slice(c.req.path.indexOf(routePrefix) + routePrefix.length)) } catch { return errorResponse(c, "invalid_request", 400, "Invalid file path") }
    const path = normalizeSnapshotPath(raw)
    if (path === null) return errorResponse(c, "invalid_request", 400, "Unsafe file path")
    const store = resolveStore(c.env)
    const upload = await store.findUpload(uploadId)
    if (!upload) return errorResponse(c, "not_found", 404)
    if (upload.state !== "open") return errorResponse(c, "invalid_request", 409, "Upload is no longer open")
    const expected = await store.findUploadFile(uploadId, path)
    if (!expected) return errorResponse(c, "invalid_request", 400, "File was not declared")
    const body = await c.req.arrayBuffer()
    if (body.byteLength > SNAPSHOT_LIMITS.maxEntryBytes) return errorResponse(c, "payload_too_large", 413, `Files are limited to ${SNAPSHOT_LIMITS.maxEntryBytes} bytes`)
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", body))).map((byte) => byte.toString(16).padStart(2, "0")).join("")
    if (body.byteLength !== expected.bytes || digest !== expected.sha256) return errorResponse(c, "invalid_request", 400, "File does not match its declared size and digest")
    if (expected.completedAt !== null) return c.json({ path, bytes: expected.bytes })
    await c.env.SNAPSHOTS.put(`${upload.snapshotPrefix}/${path}`, body)
    if (!(await store.completeUploadFile(uploadId, path, timestamp()))) {
      await c.env.SNAPSHOTS.delete(`${upload.snapshotPrefix}/${path}`)
      return errorResponse(c, "invalid_request", 409, "Upload is no longer open")
    }
    return c.json({ path, bytes: expected.bytes })
  })

  app.post("/api/publication-uploads/:uploadId/commit", async (c) => {
    const result = await resolveStore(c.env).commitUpload(c.req.param("uploadId"), timestamp())
    if (!result.ok) return errorResponse(c, result.reason === "not_found" ? "not_found" : "invalid_request", result.reason === "not_found" ? 404 : result.reason === "incomplete" ? 400 : 409)
    return c.json({ upload_id: c.req.param("uploadId"), ...result.committed, url: shareUrl(c, result.committed.publication.token) }, 201)
  })

  app.delete("/api/publication-uploads/:uploadId", async (c) => {
    const store = resolveStore(c.env)
    const upload = await store.findUpload(c.req.param("uploadId"))
    if (!upload) return errorResponse(c, "not_found", 404)
    const state = await store.abortUpload(upload.uploadId)
    if (state === "committed") return errorResponse(c, "invalid_request", 409, "Committed uploads cannot be aborted")
    const objectsDeleted = await deleteSnapshotObjects(c.env.SNAPSHOTS, upload.snapshotPrefix)
    return c.json({ upload_id: upload.uploadId, state: "aborted", objects_deleted: objectsDeleted })
  })

  app.post("/api/publications/:token/revoke", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }

    const store = resolveStore(c.env)
    const publication = await store.revoke(token.data, timestamp())
    if (!publication) {
      return errorResponse(c, "not_found", 404)
    }

    return c.json(await publicationBody(store, publication))
  })

  /** Reinstating does not extend an existing expiry. */
  app.post("/api/publications/:token/reinstate", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }

    const store = resolveStore(c.env)
    const publication = await store.reinstate(token.data)
    if (!publication) {
      return errorResponse(c, "not_found", 404)
    }

    return c.json(await publicationBody(store, publication))
  })

  /** Delete R2 objects before metadata so a failed delete remains retryable. */
  app.delete("/api/publications/:token", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }

    const store = resolveStore(c.env)
    const prefixes = await store.listSnapshotPrefixes(token.data)
    const deletedCounts = await Promise.all(
      prefixes.map((prefix) => deleteSnapshotObjects(c.env.SNAPSHOTS, prefix)),
    )
    const publication = await store.deletePublication(token.data)

    return c.json({
      token: token.data,
      deleted: publication !== null,
      objects_deleted: deletedCounts.reduce((total, count) => total + count, 0),
    })
  })

  /** Omitted fields remain unchanged. */
  app.patch("/api/publications/:token", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }
    const body = await readJsonBody(c, PublicationUpdateRequest)
    if (!body.ok) {
      return errorResponse(c, "invalid_request", 400, body.message)
    }

    const store = resolveStore(c.env)
    let publication: Publication | null = null

    if (body.data.expires_at !== undefined) {
      publication = await store.setExpiry(token.data, body.data.expires_at)
      if (!publication) {
        return errorResponse(c, "not_found", 404)
      }
    }

    if (body.data.access_code !== undefined) {
      const hashed =
        body.data.access_code === null ? null : await hashAccessCode(body.data.access_code)
      publication = await store.setAccessCode(token.data, hashed)
      if (!publication) {
        return errorResponse(c, "not_found", 404)
      }
    }

    if (!publication) {
      return errorResponse(c, "not_found", 404)
    }

    return c.json(await publicationBody(store, publication))
  })

  app.get("/api/publications/:token", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }

    const store = resolveStore(c.env)
    const record = await store.findRecord(token.data)
    if (!record) {
      return errorResponse(c, "not_found", 404)
    }

    const body: PublicationDetail = {
      publication: record.publication,
      versions: await store.listVersions(token.data),
      url: shareUrl(c, token.data),
      has_access_code: record.accessCode !== null,
    }
    return c.json(body)
  })

  const serveSnapshot = async (c: Context<AppEnv>): Promise<Response> => {
    const publication = c.get("publication")
    const requested = snapshotPathFromUrl(c.req.url, publication.token)
    const relative = normalizeSnapshotPath(requested)
    if (relative === null) {
      return errorResponse(c, "not_found", 404)
    }

    const prefix = await resolveStore(c.env).findSnapshotPrefix(
      publication.token,
      publication.current_version,
      relative,
    )
    if (prefix === null) return errorResponse(c, "not_found", 404)
    const key = `${prefix}/${relative}`
    const ifNoneMatch = conditionalEtag(c.req.header("If-None-Match"))
    const object = await c.env.SNAPSHOTS.get(
      key,
      ifNoneMatch === undefined ? undefined : { onlyIf: { etagDoesNotMatch: ifNoneMatch } },
    )

    if (!object) {
      return errorResponse(c, "not_found", 404)
    }

    const headers = new Headers({
      "content-type": contentTypeFor(relative),
      "cache-control": cacheControlFor(relative, c.get("accessCodeHash") !== null),
      etag: object.httpEtag,
    })

    if (!("body" in object)) {
      return new Response(null, { status: 304, headers })
    }

    headers.set("content-length", String(object.size))
    return new Response(object.body, { headers })
  }

  app.use("/p/:token", requirePublication)
  app.use("/p/:token/*", requirePublication)

  /** Lookup precedes gating so missing and revoked links retain their status codes. */
  const accessDeps = {
    resolveStore,
    timestamp,
  }

  registerAccessRoute(app, accessDeps)

  app.use("/p/:token", accessGate)
  app.use("/p/:token/*", accessGate)

  app.get("/p/:token", serveSnapshot)
  app.get("/p/:token/*", serveSnapshot)

  app.notFound((c) => errorResponse(c, "not_found", 404))

  app.onError((err, c) => {
    console.error(err)
    return errorResponse(c, "internal_error", 500)
  })

  return app
}
