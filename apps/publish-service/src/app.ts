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
  type PublishWorkerHealth,
} from "@adt/types"
import type { Env } from "./env.js"
import { errorResponse } from "./errors.js"
import { mgmtAuth } from "./middleware/mgmt-auth.js"
import { publicationLookup, type PublicationVariables } from "./middleware/publication-lookup.js"
import { emptyPublicationStore, type PublicationStore } from "./store.js"

const METADATA_FIELD = "metadata"
const SNAPSHOT_FIELD = "snapshot"

export type AppEnv = { Bindings: Env; Variables: PublicationVariables }

export interface AppOptions {
  store?: PublicationStore
  maxSnapshotBytes?: number
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
  const store = options.store ?? emptyPublicationStore
  const maxSnapshotBytes = options.maxSnapshotBytes ?? PUBLICATION_SNAPSHOT_MAX_BYTES
  const requirePublication = publicationLookup(store)

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
    return errorResponse(c, "not_implemented", 501)
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
    return errorResponse(c, "not_implemented", 501)
  })

  app.post("/api/publications/:token/revoke", (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }
    return errorResponse(c, "not_implemented", 501)
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
    return errorResponse(c, "not_implemented", 501)
  })

  const serveSnapshot = (c: Context<AppEnv>) => errorResponse(c, "not_implemented", 501)

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
