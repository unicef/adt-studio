import { Hono } from "hono"
import type { Context } from "hono"
import type { z } from "zod"
import {
  PUBLICATION_SNAPSHOT_MAX_BYTES,
  PUBLISH_WORKER_VERSION,
  PublicationCreateRequest,
  PublicationToken,
  PublicationUpdateRequest,
  PublicationVersionCreateRequest,
  type Publication,
  type PublicationCreateResponse,
  type PublicationDetail,
  type PublicationResponse,
  type PublicationVersionCreateResponse,
  type PublishWorkerHealth,
} from "@adt/types"
import { accessGate, registerAccessRoute } from "./access.js"
import { registerCommentRoutes } from "./comments.js"
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
  newId?: () => string
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

  /** Management answers report *whether* a code is set, never the code or its hash. */
  const publicationBody = async (
    store: PublicationStore,
    publication: Publication,
  ): Promise<PublicationResponse> => ({
    publication,
    has_access_code: ((await store.findRecord(publication.token))?.accessCode ?? null) !== null,
  })

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
    const { token, title, book_label, page_manifest, expires_at, access_code } = upload.metadata

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

    const accessCode = access_code ? await hashAccessCode(access_code) : null
    const version = await store.create({
      publication,
      pageManifest: page_manifest,
      accessCode,
    })
    const body: PublicationCreateResponse = {
      publication,
      version,
      url: shareUrl(c, token),
      has_access_code: accessCode !== null,
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

    const store = resolveStore(c.env)
    const publication = await store.revoke(token.data, timestamp())
    if (!publication) {
      return errorResponse(c, "not_found", 404)
    }

    return c.json(await publicationBody(store, publication))
  })

  /** "Resume sharing": the same token starts serving again with every comment intact.
   *  `expires_at` is untouched on purpose — an expired publication that is reinstated is
   *  still expired until the Studio PATCHes a new end date. */
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

  /** Expiry and the access code are independent knobs on one route: an absent key is left
   *  alone, so rotating a code cannot silently drop an end date and vice versa. */
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

    const key = `${publication.token}/v${publication.current_version}/${relative}`
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

  /** Order is load-bearing three times over. The lookup ladder runs first, so an unknown token
   *  is still `404` and a revoked one still `410` — the gate only ever guards requests that
   *  would otherwise be served. `POST /access` is registered *before* the gate, because a
   *  handler that answers without calling `next()` ends the chain: the code prompt's own form
   *  target cannot sit behind the prompt. Everything after the gate — comments included — is
   *  reachable only with a valid grant or `MGMT_SECRET`.
   *
   *  The door shares the comment routes' deps because it now mints commenter sessions too: the
   *  gate collects the visitor's name, so both cookies are set on the one response. */
  const sessionDeps = {
    resolveStore,
    timestamp,
    newId: options.newId ?? (() => randomId()),
  }

  registerAccessRoute(app, sessionDeps)

  app.use("/p/:token", accessGate)
  app.use("/p/:token/*", accessGate)

  registerCommentRoutes(app, sessionDeps)

  app.get("/p/:token", serveSnapshot)
  app.get("/p/:token/*", serveSnapshot)

  app.notFound((c) => errorResponse(c, "not_found", 404))

  app.onError((err, c) => {
    console.error(err)
    return errorResponse(c, "internal_error", 500)
  })

  return app
}
