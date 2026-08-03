import { Hono } from "hono"
import type { Context } from "hono"
import type { z } from "zod"
import {
  PUBLICATION_SNAPSHOT_MAX_BYTES,
  PUBLISH_WORKER_VERSION,
  PublicationCreateRequest,
  PublicationExpiryUpdateRequest,
  PublicationToken,
  PublicationVersionCreateRequest,
  type Publication,
  type PublicationCreateResponse,
  type PublicationDetail,
  type PublicationResponse,
  type PublicationVersionCreateResponse,
  type PublishWorkerHealth,
} from "@adt/types"
import { createD1PublicationStore } from "./d1-store.js"
import type { Env } from "./env.js"
import { errorResponse } from "./errors.js"
import { mgmtAuth } from "./middleware/mgmt-auth.js"
import { publicationLookup, type PublicationVariables } from "./middleware/publication-lookup.js"
import {
  cacheControlFor,
  contentTypeFor,
  snapshotPathFromUrl,
} from "./serve.js"
import {
  isSnapshotUnpackError,
  normalizeSnapshotPath,
  unpackSnapshotToR2,
  type SnapshotLimits,
} from "./snapshot.js"
import type { PublicationStore } from "./store.js"

const METADATA_FIELD = "metadata"
const SNAPSHOT_FIELD = "snapshot"

export type AppEnv = { Bindings: Env; Variables: PublicationVariables }

export interface AppOptions {
  store?: PublicationStore
  createStore?: (env: Env) => PublicationStore
  maxSnapshotBytes?: number
  snapshotLimits?: SnapshotLimits
  now?: () => Date
}

type SnapshotUpload<T> =
  | { ok: true; metadata: T; snapshot: File }
  | { ok: false; code: "invalid_request"; status: 400; message: string }
  | { ok: false; code: "payload_too_large"; status: 413; message: string }

async function readSnapshotUpload<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
  maxSnapshotBytes: number,
): Promise<SnapshotUpload<z.infer<S>>> {
  let body: Record<string, unknown>
  try {
    body = await c.req.parseBody()
  } catch {
    return {
      ok: false,
      code: "invalid_request",
      status: 400,
      message: "Expected a multipart/form-data body",
    }
  }

  const rawMetadata = body[METADATA_FIELD]
  if (typeof rawMetadata !== "string") {
    return {
      ok: false,
      code: "invalid_request",
      status: 400,
      message: `Missing "${METADATA_FIELD}" form field`,
    }
  }

  let metadata: unknown
  try {
    metadata = JSON.parse(rawMetadata)
  } catch {
    return {
      ok: false,
      code: "invalid_request",
      status: 400,
      message: `The "${METADATA_FIELD}" form field is not valid JSON`,
    }
  }

  const parsed = schema.safeParse(metadata)
  if (!parsed.success) {
    return { ok: false, code: "invalid_request", status: 400, message: parsed.error.message }
  }

  const snapshot = body[SNAPSHOT_FIELD]
  if (!(snapshot instanceof File)) {
    return {
      ok: false,
      code: "invalid_request",
      status: 400,
      message: `Missing "${SNAPSHOT_FIELD}" form file`,
    }
  }

  if (snapshot.size > maxSnapshotBytes) {
    return {
      ok: false,
      code: "payload_too_large",
      status: 413,
      message: `Snapshot exceeds the ${maxSnapshotBytes} byte upload limit`,
    }
  }

  return { ok: true, metadata: parsed.data, snapshot }
}

async function readJsonBody<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; message: string }> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return { ok: false, message: "Expected a JSON body" }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.message }
  }

  return { ok: true, data: parsed.data }
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const injected = options.store
  const resolveStore = (env: Env): PublicationStore =>
    injected ?? (options.createStore ?? ((e: Env) => createD1PublicationStore(e.DB)))(env)
  const maxSnapshotBytes = options.maxSnapshotBytes ?? PUBLICATION_SNAPSHOT_MAX_BYTES
  const now = options.now ?? (() => new Date())
  const timestamp = (): string => now().toISOString()
  const requirePublication = publicationLookup(resolveStore)

  const shareUrl = (c: Context, token: string): string =>
    `${new URL(c.req.url).origin}/p/${token}/`

  const unpack = async (
    c: Context<AppEnv>,
    token: string,
    version: number,
    snapshot: File,
  ): Promise<Response | null> => {
    try {
      await unpackSnapshotToR2({
        bucket: c.env.SNAPSHOTS,
        prefix: `${token}/v${version}`,
        zip: snapshot.stream() as ReadableStream<Uint8Array>,
        ...(options.snapshotLimits === undefined ? {} : { limits: options.snapshotLimits }),
      })
      return null
    } catch (error) {
      if (isSnapshotUnpackError(error)) {
        return errorResponse(
          c,
          error.code,
          error.code === "payload_too_large" ? 413 : 400,
          error.message,
        )
      }
      throw error
    }
  }

  const app = new Hono<AppEnv>()

  app.get("/health", (c) => {
    const health: PublishWorkerHealth = { ok: true, version: PUBLISH_WORKER_VERSION }
    return c.json(health)
  })

  app.use("/api/*", mgmtAuth)

  app.post("/api/publications", async (c) => {
    const upload = await readSnapshotUpload(c, PublicationCreateRequest, maxSnapshotBytes)
    if (!upload.ok) {
      return errorResponse(c, upload.code, upload.status, upload.message)
    }

    const store = resolveStore(c.env)
    const { token, title, book_label, page_manifest, expires_at } = upload.metadata

    if (await store.findByToken(token)) {
      return errorResponse(
        c,
        "invalid_request",
        400,
        "A publication already exists for this token — republish through POST /api/publications/:token/versions",
      )
    }

    const failed = await unpack(c, token, 1, upload.snapshot)
    if (failed) return failed

    const publication: Publication = {
      token,
      title,
      book_label,
      current_version: 1,
      created_at: timestamp(),
      expires_at: expires_at ?? null,
      revoked_at: null,
    }

    const version = await store.create({ publication, pageManifest: page_manifest })
    const body: PublicationCreateResponse = {
      publication,
      version,
      url: shareUrl(c, token),
    }
    return c.json(body, 201)
  })

  app.post("/api/publications/:token/versions", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }
    const upload = await readSnapshotUpload(c, PublicationVersionCreateRequest, maxSnapshotBytes)
    if (!upload.ok) {
      return errorResponse(c, upload.code, upload.status, upload.message)
    }

    const store = resolveStore(c.env)
    const existing = await store.findByToken(token.data)
    if (!existing) {
      return errorResponse(c, "not_found", 404)
    }

    const version = existing.current_version + 1
    const failed = await unpack(c, token.data, version, upload.snapshot)
    if (failed) return failed

    const result = await store.addVersion({
      token: token.data,
      version,
      pageManifest: upload.metadata.page_manifest,
      createdAt: timestamp(),
    })
    if (!result) {
      return errorResponse(
        c,
        "invalid_request",
        400,
        "The publication changed while this version was uploading — try again",
      )
    }

    const body: PublicationVersionCreateResponse = {
      publication: result.publication,
      version: result.version,
    }
    return c.json(body, 201)
  })

  app.post("/api/publications/:token/revoke", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }

    const publication = await resolveStore(c.env).revoke(token.data, timestamp())
    if (!publication) {
      return errorResponse(c, "not_found", 404)
    }

    const body: PublicationResponse = { publication }
    return c.json(body)
  })

  app.patch("/api/publications/:token", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }
    const body = await readJsonBody(c, PublicationExpiryUpdateRequest)
    if (!body.ok) {
      return errorResponse(c, "invalid_request", 400, body.message)
    }

    const publication = await resolveStore(c.env).setExpiry(token.data, body.data.expires_at)
    if (!publication) {
      return errorResponse(c, "not_found", 404)
    }

    const response: PublicationResponse = { publication }
    return c.json(response)
  })

  app.get("/api/publications/:token", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }

    const store = resolveStore(c.env)
    const publication = await store.findByToken(token.data)
    if (!publication) {
      return errorResponse(c, "not_found", 404)
    }

    const body: PublicationDetail = {
      publication,
      versions: await store.listVersions(token.data),
      url: shareUrl(c, token.data),
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

    const key = `${publication.token}/v${publication.current_version}/${relative}`
    const ifNoneMatch = c.req.header("If-None-Match")
    const object = await c.env.SNAPSHOTS.get(
      key,
      ifNoneMatch === undefined ? undefined : { onlyIf: { etagDoesNotMatch: ifNoneMatch } },
    )

    if (!object) {
      return errorResponse(c, "not_found", 404)
    }

    const headers = new Headers({
      "content-type": contentTypeFor(relative),
      "cache-control": cacheControlFor(relative),
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
  app.get("/p/:token", serveSnapshot)
  app.get("/p/:token/*", serveSnapshot)

  app.notFound((c) => errorResponse(c, "not_found", 404))

  app.onError((err, c) => {
    console.error(err)
    return errorResponse(c, "internal_error", 500)
  })

  return app
}
