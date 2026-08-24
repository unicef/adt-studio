import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { streamSSE } from "hono/streaming"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import {
  BookLabel,
  BookPublishRequest,
  PUBLISH_AUTHOR_NAME_HEADER,
  PublicationToken,
  type PublicationDeleteResult,
  PublicationUpdateRequest,
  PublishCommentCreateRequest,
  PublishCommentListQuery,
  PublishCommentResolveRequest,
  PublishCommentUpdateRequest,
  parseBookLabel,
  publicationStateAt,
  type BookPublicationRecord,
  type BookPublicationStatus,
  type PublicationListEntry,
  type PublicationPageEntry,
  type PublicationResponse,
  type PublicationSummary,
  type PublicationsOverview,
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
  readContentRevision,
  clearPublicationRecord,
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
import { readBookTitle, type prepareExport } from "../services/export-service.js"

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

  const resolvedBooksDir = (): string => path.resolve(deps.booksDir)

  const bookExists = (label: string): boolean =>
    BookLabel.safeParse(label).success &&
    fs.existsSync(path.join(resolvedBooksDir(), label)) &&
    fs.statSync(path.join(resolvedBooksDir(), label)).isDirectory()

  /** The book's *current* name, not the one frozen into the publication at publish time — the
   *  author renames a book and expects the dashboard to follow. Falls back to whatever the
   *  worker stored when the book is gone or its title is unreadable. */
  const localTitle = (label: string, fallback: string): string => {
    if (!bookExists(label)) return fallback
    try {
      const title = readBookTitle(label, resolvedBooksDir()).trim()
      return title.length === 0 ? fallback : title
    } catch {
      return fallback
    }
  }

  /** The plaintext code, which only this machine has. Read per row rather than merged from one
   *  pass over `books/` because the shelf is tens of rows and each record is a small JSON file
   *  the route already knows how to read. */
  const localAccessCode = (label: string): string | null => {
    if (!bookExists(label)) return null
    try {
      return readPublicationRecord(label, resolvedBooksDir())?.access_code ?? null
    } catch {
      return null
    }
  }

  const summaryFromWorker = (entry: PublicationListEntry): PublicationSummary => {
    const label = entry.publication.book_label
    return {
      token: entry.publication.token,
      title: localTitle(label, entry.publication.title),
      book_label: label,
      book_exists: bookExists(label),
      url: entry.url,
      current_version: entry.publication.current_version,
      version_count: entry.version_count,
      created_at: entry.publication.created_at,
      last_published_at: entry.last_published_at,
      expires_at: entry.publication.expires_at,
      revoked_at: entry.publication.revoked_at,
      has_access_code: entry.has_access_code,
      access_code: entry.has_access_code ? localAccessCode(label) : null,
      comment_count: entry.comment_count,
      unresolved_count: entry.unresolved_count,
      snapshot_bytes: entry.snapshot_bytes,
      source: "worker",
    }
  }

  /**
   * Whether the account still holds this publication. Only ever asked to interpret a 404.
   *
   * The worker answers a request for a route it does not have with its own catch-all —
   * `{"error":"not_found"}`, 404 — which is byte-identical to what it answers for a token that
   * is not in the account. Status and code therefore cannot tell "your service is too old" from
   * "that book is gone", and guessing wrong either sends the author hunting for a lost
   * publication or tells them to reinstall over a genuine miss. Reading the publication back
   * does distinguish them: if it is still there, the 404 was about the route.
   *
   * `null` when the question could not be answered at all, which is the unreachable case.
   */
  const publicationStillExists = async (
    client: PublishWorkerClient,
    token: string,
  ): Promise<boolean | null> => {
    try {
      await client.getPublication(token)
      return true
    } catch (error) {
      if (isPublishWorkerError(error) && error.status === 404) return false
      return null
    }
  }

  const outdatedWorker = (c: Context, action: string): Response =>
    c.json(
      {
        error:
          `Your publishing service is older than this Studio. Install the update in ` +
          `Settings → Publishing to ${action}.`,
        code: "worker_outdated",
      },
      409,
    )

  /** Which book on this computer holds this token, if any. `null` is the ordinary answer for
   *  the rows this exists to serve: the book was deleted, and only the account still remembers
   *  the publication. */
  const labelForToken = (token: string): string | null => {
    const dir = resolvedBooksDir()
    if (!fs.existsSync(dir)) return null

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (!BookLabel.safeParse(entry.name).success) continue
      try {
        if (readPublicationRecord(entry.name, dir)?.token === token) return entry.name
      } catch {
        continue
      }
    }
    return null
  }

  /** The degraded list: every book on this machine that remembers a publication. It cannot see
   *  a publication whose book directory is gone — that row only exists in the account — which is
   *  exactly why the screen says the list is incomplete while the worker is unreachable. */
  const summariesFromDisk = (): PublicationSummary[] => {
    const dir = resolvedBooksDir()
    if (!fs.existsSync(dir)) return []

    const summaries: PublicationSummary[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (!BookLabel.safeParse(entry.name).success) continue

      let record: BookPublicationRecord | null = null
      try {
        record = readPublicationRecord(entry.name, dir)
      } catch {
        record = null
      }
      if (!record) continue

      const versions = [...record.versions].sort((a, b) => a.version - b.version)
      const newest = versions.at(-1) ?? null
      summaries.push({
        token: record.token,
        title: localTitle(entry.name, entry.name),
        book_label: entry.name,
        book_exists: true,
        url: record.base_url,
        current_version: newest?.version ?? 1,
        version_count: versions.length,
        created_at: record.created_at,
        last_published_at: newest?.published_at ?? null,
        expires_at: record.expires_at,
        revoked_at: record.revoked_at,
        has_access_code: record.has_access_code,
        access_code: record.access_code,
        comment_count: 0,
        unresolved_count: 0,
        snapshot_bytes: null,
        source: "local",
      })
    }

    return summaries.sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || a.token.localeCompare(b.token),
    )
  }

  const overviewOf = (publications: PublicationSummary[], reachable: boolean): PublicationsOverview => {
    const at = (deps.now ?? (() => new Date()))()
    const measured = publications.filter(
      (summary): summary is PublicationSummary & { snapshot_bytes: number } =>
        summary.snapshot_bytes !== null,
    )
    return {
      worker_reachable: reachable,
      publications,
      totals: {
        published_count: publications.length,
        active_count: publications.filter(
          (summary) => publicationStateAt(summary, at) === "active",
        ).length,
        total_snapshot_bytes: measured.reduce((total, summary) => total + summary.snapshot_bytes, 0),
        snapshot_bytes_complete: measured.length === publications.length,
        total_unresolved: publications.reduce((total, summary) => total + summary.unresolved_count, 0),
      },
    }
  }

  /** GET /publications — the account's whole shelf, for the Publications dashboard.
   *
   *  Unlike `GET /books/:label/publication`, a missing connection is a `412` and not a `200`
   *  with a flag: the per-book panel still has a local record to render without a connection,
   *  whereas this screen's entire content lives in the account. A worker that cannot be
   *  reached — or one too old to have §4.18 — degrades to what this machine remembers,
   *  flagged `worker_reachable: false`, rather than to an error page. */
  app.get("/publications", async (c) => {
    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account to see your published books",
      )
    }

    let entries: PublicationListEntry[]
    try {
      entries = (await clientFor(connection).listPublications()).publications
    } catch (error) {
      if (!isPublishWorkerError(error)) throw error
      return c.json(overviewOf(summariesFromDisk(), false))
    }

    return c.json(overviewOf(entries.map(summaryFromWorker), true))
  })

  /** GET /publications/:token/readers — who joined this publication.
   *
   *  Keyed by token rather than by book label on purpose: the dashboard lists publications
   *  whose book directory is no longer on this machine, and their readers are exactly the ones
   *  the author has lost every other way of seeing. */
  app.get("/publications/:token/readers", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return c.json({ error: "That is not a publication token", code: "not_published" }, 404)
    }

    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account to see who has joined",
      )
    }

    const client = clientFor(connection)
    try {
      return c.json(await client.listReaders(token.data))
    } catch (error) {
      if (!isPublishWorkerError(error)) throw error
      if (error.status === 404) {
        const stillThere = await publicationStillExists(client, token.data)
        if (stillThere === true) return outdatedWorker(c, "see who has joined")
        if (stillThere === false) {
          return c.json(
            { error: "That publication is not in this account", code: "not_published" },
            404,
          )
        }
      }
      return failure(
        c,
        502,
        "worker_unreachable",
        "Your publishing service didn't answer — try again in a moment",
      )
    }
  })

  /** DELETE /publications/:token — erase a publication for good.
   *
   *  Token-keyed, like the readers route and unlike every other mutation here, because the
   *  book may no longer be on this computer. That is not an edge case: a deleted book leaves
   *  a row nobody can act on, since "stop sharing" is keyed by label and disabled without one,
   *  so the shelf accumulates publications the author has no way to remove.
   *
   *  The local tombstone is written after the worker confirms, and only when the book still
   *  exists. Doing it first would let a worker failure leave the Studio believing the book was
   *  never published while the link kept serving. */
  app.delete("/publications/:token", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return c.json({ error: "That is not a publication token", code: "not_published" }, 404)
    }

    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account to manage published books",
      )
    }

    const client = clientFor(connection)
    let result: PublicationDeleteResult
    try {
      result = await client.deletePublication(token.data)
    } catch (error) {
      if (!isPublishWorkerError(error)) throw error
      if (error.status === 404) {
        const stillThere = await publicationStillExists(client, token.data)
        if (stillThere === true) return outdatedWorker(c, "delete a published book")
        if (stillThere === false) {
          return c.json(
            { error: "That publication is not in this account", code: "not_published" },
            404,
          )
        }
      }
      return failure(
        c,
        502,
        "worker_unreachable",
        "Your publishing service didn't answer — nothing was deleted",
      )
    }

    const label = labelForToken(token.data)
    if (label) {
      clearPublicationRecord(label, resolvedBooksDir(), (deps.now ?? (() => new Date()))().toISOString())
    }

    return c.json(result)
  })

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
        has_access_code: record?.has_access_code ?? false,
        content_revision: readContentRevision(label, deps.booksDir),
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
        has_access_code: detail.has_access_code,
        content_revision: readContentRevision(label, deps.booksDir),
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
          has_access_code: record.has_access_code,
          content_revision: readContentRevision(label, deps.booksDir),
        }
        return c.json(status)
      }
      const status: BookPublicationStatus = {
        connected: true,
        record,
        publication: null,
        url: record.base_url,
        worker_reachable: false,
        has_access_code: record.has_access_code,
        content_revision: readContentRevision(label, deps.booksDir),
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
        await publishBook({
          ...publishDeps(label),
          connection,
          emit,
          expiresAt: body.data.expires_at ?? null,
          accessCode: body.data.access_code ?? null,
          ...(body.data.features ? { features: body.data.features } : {}),
        })
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

  // POST /books/:label/publication/resume — bring the same link back to life
  app.post("/books/:label/publication/resume", async (c) => {
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
    if (record.revoked_at === null) {
      return failure(
        c,
        409,
        "not_revoked",
        "This book's link is not stopped, so there is nothing to resume",
      )
    }

    let response: PublicationResponse
    try {
      response = await clientFor(connection).reinstate(record.token)
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

  // PATCH /books/:label/publication — set or clear the expiry and/or the access code
  app.patch("/books/:label/publication", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const body = PublicationUpdateRequest.safeParse(await readBody(c))
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
      response = await clientFor(connection).updatePublication(record.token, body.data)
    } catch (error) {
      return workerFailure(c, error)
    }

    /** The plaintext copy only moves when the request actually carried a code, and it follows
     *  the worker's own `has_access_code`: the local record never claims a lock the worker did
     *  not confirm, and it never keeps a code the worker has forgotten. */
    savePublicationRecord(label, deps.booksDir, {
      ...record,
      expires_at: response.publication.expires_at,
      revoked_at: response.publication.revoked_at,
      has_access_code: response.has_access_code,
      access_code: response.has_access_code
        ? (body.data.access_code ?? record.access_code)
        : null,
    })

    return c.json(response)
  })

  /** §5.3 author proxies. They add `MGMT_SECRET` on the way out so the browser never holds
   *  it, and they answer with the worker's own error envelope so a rejected comment write is
   *  not laundered into a publish-step code. */
  const authorProxy = async (
    c: Context,
    rawLabel: string,
    call: (client: PublishWorkerClient, token: string, authorName?: string) => Promise<unknown>,
  ): Promise<Response> => {
    const label = parseBookLabel(rawLabel)
    requireBook(label)

    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account before reading this book's feedback",
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) {
      return failure(c, 409, "not_published", "This book has never been published")
    }

    const authorName = c.req.header(PUBLISH_AUTHOR_NAME_HEADER)
    try {
      const payload = await call(clientFor(connection), record.token, authorName)
      return c.json(payload as Record<string, unknown>)
    } catch (error) {
      return proxyFailure(c, error)
    }
  }

  /** POST /books/:label/publication/room-ticket — the Feedback view's realtime credential.
   *  `MGMT_SECRET` cannot go to the browser and a worker cookie cannot be presented from the
   *  Studio's origin, so the browser gets a signed 60-second ticket and the `wss://` address
   *  to spend it at. Same guards and same transparent envelope as the comment proxies. */
  app.post("/books/:label/publication/room-ticket", async (c) =>
    authorProxy(c, c.req.param("label"), (client, token) => client.roomTicket(token)),
  )

  // GET /books/:label/publication/comments — author read of every comment, deleted included
  app.get("/books/:label/publication/comments", async (c) => {
    const query = PublishCommentListQuery.safeParse(c.req.query())
    if (!query.success) {
      return c.json({ error: query.error.message, code: "invalid_request" }, 400)
    }
    return authorProxy(c, c.req.param("label"), (client, token, authorName) =>
      client.listComments(token, query.data, authorName),
    )
  })

  // POST /books/:label/publication/comments — author reply or new author comment
  app.post("/books/:label/publication/comments", async (c) => {
    const body = PublishCommentCreateRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }
    return authorProxy(c, c.req.param("label"), (client, token, authorName) =>
      client.createComment(token, body.data, authorName),
    )
  })

  // POST /books/:label/publication/comments/:id/resolve — author resolve or unresolve
  app.post("/books/:label/publication/comments/:id/resolve", async (c) => {
    const body = PublishCommentResolveRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }
    const id = c.req.param("id")
    return authorProxy(c, c.req.param("label"), (client, token, authorName) =>
      client.resolveComment(token, id, body.data, authorName),
    )
  })

  // PATCH /books/:label/publication/comments/:id — the author edits their own comment
  app.patch("/books/:label/publication/comments/:id", async (c) => {
    const body = PublishCommentUpdateRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }
    const id = c.req.param("id")
    return authorProxy(c, c.req.param("label"), (client, token, authorName) =>
      client.updateComment(token, id, body.data, authorName),
    )
  })

  // DELETE /books/:label/publication/comments/:id — the author deletes their own comment
  app.delete("/books/:label/publication/comments/:id", async (c) => {
    const id = c.req.param("id")
    return authorProxy(c, c.req.param("label"), (client, token, authorName) =>
      client.deleteComment(token, id, authorName),
    )
  })

  /** GET /books/:label/publication/pages — the published version's own page manifest.
   *  The Feedback view navigates the *snapshot*, whose pages can differ from the local
   *  book's after an edit, so the manifest has to come from the publication record and
   *  not from the book directory. */
  app.get("/books/:label/publication/pages", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const connection = store.read()
    if (!connection) {
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account before reading this book's feedback",
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) {
      return failure(c, 409, "not_published", "This book has never been published")
    }

    try {
      const detail = await clientFor(connection).getPublication(record.token)
      const current = detail.versions.find(
        (version) => version.version === detail.publication.current_version,
      )
      const pages: PublicationPageEntry[] = current?.page_manifest ?? []
      return c.json({ current_version: detail.publication.current_version, pages })
    } catch (error) {
      return proxyFailure(c, error)
    }
  })

  /** GET /books/:label/publication/preview/* — the published snapshot, same-origin.
   *
   *  This is what the Feedback view frames: the exact bytes reviewers saw, not a fresh
   *  local package. `MGMT_SECRET` goes out with the request (so the access gate and the
   *  410 ladder are bypassed for the author) and never comes back; nothing in the body is
   *  rewritten, because the snapshot is relative-path'd and the runtime's own comments
   *  overlay stays inert off the `/p/<token>/` prefix. */
  app.get("/books/:label/publication/preview/*", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const connection = store.read()
    if (!connection) {
      return c.json(
        {
          error: "Connect a Cloudflare account before reading this book's feedback",
          code: "publish_not_connected" satisfies PublishErrorCodeStudio,
        },
        412,
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) {
      /** A `404` rather than the `409` the JSON routes answer: this route's client is an
       *  `<iframe>`, and a missing snapshot is a missing document, not a bad request. */
      return c.json(
        {
          error: "This book has never been published",
          code: "not_published" satisfies PublishErrorCodeStudio,
        },
        404,
      )
    }

    const prefix = `/books/${c.req.param("label")}/publication/preview/`
    const rawPath = c.req.path.slice(c.req.path.indexOf(prefix) + prefix.length)
    const forwarded: Record<string, string> = {}
    const ifNoneMatch = c.req.header("if-none-match")
    if (ifNoneMatch !== undefined) forwarded["if-none-match"] = ifNoneMatch

    let upstream: Response
    try {
      upstream = await clientFor(connection).fetchSnapshotFile(
        record.token,
        decodeSnapshotPath(rawPath),
        forwarded,
      )
    } catch (error) {
      return proxyFailure(c, error)
    }

    return streamSnapshotResponse(upstream)
  })

  return app
}

/** The wildcard arrives percent-encoded; the client re-encodes per segment, so decoding
 *  here keeps a file named `Página 2.png` addressable without double-encoding it. */
function decodeSnapshotPath(rawPath: string): string {
  const [withoutQuery] = rawPath.split("?")
  return (withoutQuery ?? "")
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join("/")
}

const SNAPSHOT_PASSTHROUGH_HEADERS = ["content-type", "cache-control", "etag", "last-modified"]

function streamSnapshotResponse(upstream: Response): Response {
  const headers = new Headers()
  for (const name of SNAPSHOT_PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  /** `fetch` transparently decodes a compressed body, so an upstream `Content-Length`
   *  only still describes what we are about to write when nothing was encoded. */
  const length = upstream.headers.get("content-length")
  if (length !== null && upstream.headers.get("content-encoding") === null) {
    headers.set("content-length", length)
  }

  if (upstream.status === 304 || upstream.body === null) {
    return new Response(null, { status: upstream.status, headers })
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}

function proxyFailure(c: Context, error: unknown): Response {
  if (isPublishWorkerError(error)) {
    if (error.unreachable) {
      return failure(c, 502, "worker_unreachable", error.message)
    }
    return c.json(
      { error: error.code ?? "internal_error", message: error.message },
      (error.status ?? 502) as ContentfulStatusCode,
    )
  }
  throw error
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
