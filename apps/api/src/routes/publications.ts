import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { streamSSE } from "hono/streaming"
import {
  BookPublishRequest,
  PublicationExpiryUpdateRequest,
  parseBookLabel,
  type BookPublicationRecord,
  type BookPublicationStatus,
  type PublicationResponse,
  type PublishErrorCodeStudio,
  type PublishProgressEvent,
} from "@adt/types"
import type { FetchLike } from "../services/cloudflare/client.js"
import {
  createConnectionStore,
  resolvePublishStateDir,
  type CloudflareConnectionRecord,
  type ConnectionStore,
} from "../services/cloudflare/connection-store.js"
import {
  publishBook,
  readPublicationRecord,
  republishBook,
  savePublicationRecord,
  toPublishErrorEvent,
} from "../services/publish-service.js"
import {
  createPublishWorkerClient,
  isPublishWorkerError,
  type PublishWorkerClient,
} from "../services/publish-worker-client.js"
import type { prepareExport } from "../services/export-service.js"

export interface PublishRoutesDeps {
  booksDir: string
  webAssetsDir: string
  configPath?: string
  stateDir?: string
  fetchFn?: FetchLike
  now?: () => Date
  generateToken?: () => string
  prepareExportFn?: typeof prepareExport
  createClient?: (connection: CloudflareConnectionRecord) => PublishWorkerClient
}

type GuardStatus = 409 | 412 | 502

function failure(
  c: Context,
  status: GuardStatus,
  code: PublishErrorCodeStudio,
  message: string,
): Response {
  return c.json({ error: message, code }, status)
}

/** A revoked publication is terminal — the Studio offers "Publish again", which mints a
 *  fresh token. Expiry is not terminal: it can be lifted with PATCH, so an expired record
 *  still counts as the book's active publication. */
function isActiveRecord(record: BookPublicationRecord | null): record is BookPublicationRecord {
  return record !== null && record.revoked_at === null
}

export function createPublishRoutes(deps: PublishRoutesDeps): Hono {
  const app = new Hono()

  const requireBook = (label: string): void => {
    if (!fs.existsSync(path.join(deps.booksDir, label))) {
      throw new HTTPException(404, { message: `Book not found: ${label}` })
    }
  }

  const store: ConnectionStore = createConnectionStore(
    deps.stateDir ?? resolvePublishStateDir(deps.booksDir),
  )

  const clientFor = (connection: CloudflareConnectionRecord): PublishWorkerClient =>
    deps.createClient
      ? deps.createClient(connection)
      : createPublishWorkerClient({
          workerUrl: connection.worker_url,
          mgmtSecret: connection.mgmt_secret,
          ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
        })

  const publishDeps = (label: string) => ({
    label,
    booksDir: deps.booksDir,
    webAssetsDir: deps.webAssetsDir,
    ...(deps.configPath === undefined ? {} : { configPath: deps.configPath }),
    ...(deps.prepareExportFn === undefined ? {} : { prepareExportFn: deps.prepareExportFn }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.generateToken === undefined ? {} : { generateToken: deps.generateToken }),
    createClient: clientFor,
  })

  const readBody = async (c: Context): Promise<unknown> => {
    const raw = await c.req.text().catch(() => "")
    if (raw.trim().length === 0) return {}
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }

  // GET /books/:label/publication — the local record merged with the worker's live state
  app.get("/books/:label/publication", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)
    const record = readPublicationRecord(label, deps.booksDir)
    const connection = store.read()

    if (!connection || !record) {
      const status: BookPublicationStatus = {
        connected: connection !== null,
        record,
        publication: null,
        url: record?.base_url ?? null,
        worker_reachable: false,
      }
      return c.json(status)
    }

    try {
      const detail = await clientFor(connection).getPublication(record.token)
      const status: BookPublicationStatus = {
        connected: true,
        record,
        publication: detail.publication,
        url: detail.url,
        worker_reachable: true,
      }
      return c.json(status)
    } catch (error) {
      if (isPublishWorkerError(error) && error.status === 404) {
        const status: BookPublicationStatus = {
          connected: true,
          record,
          publication: null,
          url: record.base_url,
          worker_reachable: true,
        }
        return c.json(status)
      }
      const status: BookPublicationStatus = {
        connected: true,
        record,
        publication: null,
        url: record.base_url,
        worker_reachable: false,
      }
      return c.json(status)
    }
  })

  // POST /books/:label/publication — export, upload and register, progress over SSE
  app.post("/books/:label/publication", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const body = BookPublishRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account before publishing this book",
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (isActiveRecord(record)) {
      return failure(
        c,
        409,
        "published_already",
        "This book is already published — use Update site to publish a new version",
      )
    }

    return streamSSE(c, async (stream) => {
      const emit = async (event: PublishProgressEvent) => {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      }

      try {
        await publishBook({ ...publishDeps(label), connection, emit, expiresAt: body.data.expires_at ?? null })
      } catch (error) {
        await emit(toPublishErrorEvent(error))
      }
    })
  })

  // POST /books/:label/publication/versions — "Update site"
  app.post("/books/:label/publication/versions", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const body = BookPublishRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account before publishing this book",
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (!isActiveRecord(record)) {
      return failure(
        c,
        409,
        "not_published",
        "This book has no active publication — publish it first",
      )
    }

    return streamSSE(c, async (stream) => {
      const emit = async (event: PublishProgressEvent) => {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      }

      try {
        await republishBook({ ...publishDeps(label), connection, emit, record })
      } catch (error) {
        await emit(toPublishErrorEvent(error))
      }
    })
  })

  // POST /books/:label/publication/revoke — kill the share link
  app.post("/books/:label/publication/revoke", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account before managing this publication",
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) {
      return failure(c, 409, "not_published", "This book has never been published")
    }

    let response: PublicationResponse
    try {
      response = await clientFor(connection).revoke(record.token)
    } catch (error) {
      return workerFailure(c, error)
    }

    savePublicationRecord(label, deps.booksDir, {
      ...record,
      expires_at: response.publication.expires_at,
      revoked_at: response.publication.revoked_at,
    })

    return c.json(response)
  })

  // PATCH /books/:label/publication — set or clear the expiry
  app.patch("/books/:label/publication", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const body = PublicationExpiryUpdateRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account before managing this publication",
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) {
      return failure(c, 409, "not_published", "This book has never been published")
    }

    let response: PublicationResponse
    try {
      response = await clientFor(connection).setExpiry(record.token, body.data.expires_at)
    } catch (error) {
      return workerFailure(c, error)
    }

    savePublicationRecord(label, deps.booksDir, {
      ...record,
      expires_at: response.publication.expires_at,
      revoked_at: response.publication.revoked_at,
    })

    return c.json(response)
  })

  return app
}

function workerFailure(c: Context, error: unknown): Response {
  if (isPublishWorkerError(error)) {
    if (error.unreachable) {
      return failure(c, 502, "worker_unreachable", error.message)
    }
    if (error.status === 404) {
      return failure(
        c,
        409,
        "not_published",
        "Your Cloudflare worker no longer has this publication",
      )
    }
    return failure(c, 502, "upload_failed", error.message)
  }
  throw error
}
