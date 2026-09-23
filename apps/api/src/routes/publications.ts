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
  PublicationToken,
  PublicationUpdateRequest,
  PublishCommentCreateRequest,
  PublishCommentListQuery,
  PublishCommentResolveRequest,
  PublishCommentUpdateRequest,
  parseBookLabel,
  publicationStateAt,
  PUBLISH_WORKER_VERSION,
  workersDevUrl,
  type BookPublicationRecord,
  type BookPublicationStatus,
  type PublicationDeleteResult,
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
import type { prepareExport } from "../services/export-service.js"
import {
  clearPublicationRecord,
  publishBook,
  readContentRevision,
  readLocalBookSnapshot,
  readPublicationRecord,
  republishBook,
  savePublicationRecord,
  toPublishErrorEvent,
  type LocalBookSnapshot,
} from "../services/publish-service.js"
import {
  createPublishRunView,
  PublishCancelledError,
} from "../services/publish-run-progress.js"
import { bookHostAuthorSecret, bookWorkerName } from "../services/cloudflare/book-host.js"
import { deleteBookHost } from "../services/cloudflare/book-host-deploy.js"
import { createCloudflareClient, type CloudflareClient } from "../services/cloudflare/client.js"
import { resolveCloudflareCredentials } from "../services/cloudflare/credentials.js"
import { createCloudflareOAuthService } from "../services/cloudflare/oauth.js"
import {
  loadBookHostArtifact,
  resolveWorkerArtifactPaths,
} from "../services/cloudflare/worker-artifact.js"
import type { BookHostDeps } from "../services/publish-service.js"
import {
  createPublishWorkerClient,
  isPublishWorkerError,
  type PublishWorkerClient,
} from "../services/publish-worker-client.js"

export interface PublishRoutesDeps {
  booksDir: string
  webAssetsDir: string
  configPath?: string
  stateDir?: string
  projectRoot?: string
  artifactDir?: string
  /** Injected by tests. Publishing now deploys this book's own Worker, which needs account
   *  credentials and the book-host artifact — neither of which a worker-only test has. */
  bookHost?: (c: Context, connection: CloudflareConnectionRecord) => Promise<BookHostDeps>
  fetchFn?: FetchLike
  now?: () => Date
  generateToken?: () => string
  /** Injected by tests so the upload retry's backoff does not cost them real seconds. */
  sleep?: (ms: number) => Promise<void>
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

/** The sentence stays at the call site — "before publishing this book" and "to see who has
 *  joined" are the same 412 to a machine and quite different to a person. */
function requireConnection(
  c: Context,
  store: { read(): CloudflareConnectionRecord | null },
  message: string,
): CloudflareConnectionRecord | Response {
  const connection = store.read()
  if (connection) return connection
  return failure(c, 412, "publish_not_connected", message)
}

/**
 * Whether a stored publication belongs to the account that is connected now.
 *
 * The record is kept in the book, and the connection is kept on the machine, so they part
 * company whenever someone connects a different Cloudflare account — the book still remembers
 * a link on the old account's subdomain, which the new account has never heard of. Left
 * unchecked that book cannot be published at all: "Publish" is refused because a record
 * exists, and "Update site" asks the new worker for a version of a publication it does not
 * have and gets a 404.
 */
function belongsToConnection(
  record: BookPublicationRecord | null,
  connection: CloudflareConnectionRecord,
): boolean {
  return record !== null && record.worker_url === connection.worker_url
}

/** A revoked publication is terminal — the Studio offers "Publish again", which mints a fresh
 *  token. Expiry is not: it can be lifted with PATCH, so an expired record still counts.
 *
 *  A record from another account does not count either: on *this* account the book has never
 *  been published, which is exactly what the author is offered. */
function isActiveRecord(
  record: BookPublicationRecord | null,
  connection: CloudflareConnectionRecord,
): record is BookPublicationRecord {
  return belongsToConnection(record, connection) && record!.revoked_at === null
}

/**
 * Labels with a publish or "Update site" currently running.
 *
 * Module-level, not per-request: two overlapping POSTs for the same book are two separate HTTP
 * requests, so only a guard that outlives either can see both. Without it,
 * `withPublishConfig`'s read-patch-restore of `adt/assets/config.json` interleaves, and one
 * request's restore can land after the other's patch — baking `features.comments` into the
 * author's offline download for good.
 */
const publishesInFlight = new Set<string>()

/**
 * Claims the in-flight slot, or answers the 409 for a second request.
 *
 * Acquired before the route's own validation, so a concurrent request is turned away before it
 * reads anything the first might still be writing. Callers must `release()` on every exit path,
 * including the ones that return before reaching `streamSSE` — Hono drives that streamed
 * callback to completion independently of the promise the handler returns.
 */
function beginPublish(c: Context, label: string): { release: () => void } | Response {
  if (publishesInFlight.has(label)) {
    return failure(
      c,
      409,
      "publish_in_progress",
      "A publish or update for this book is already running — wait for it to finish and try again",
    )
  }
  publishesInFlight.add(label)
  let released = false
  return {
    release: () => {
      if (released) return
      released = true
      publishesInFlight.delete(label)
    },
  }
}

export function createPublishRoutes(deps: PublishRoutesDeps): Hono {
  const app = new Hono()
  /** What each book's run is doing, readable by a page that lost the stream. */
  const runs = createPublishRunView(deps.now)

  const requireBook = (label: string): void => {
    if (!fs.existsSync(path.join(deps.booksDir, label))) {
      throw new HTTPException(404, { message: `Book not found: ${label}` })
    }
  }

  const store: ConnectionStore = createConnectionStore(
    deps.stateDir ?? resolvePublishStateDir(deps.booksDir),
  )

  const oauth = createCloudflareOAuthService({
    store,
    ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
  })

  /**
   * What a publish needs beyond the control plane's management secret, now that it deploys
   * this book's own Worker: account credentials, and the artifact to deploy.
   */
  /** Account-level credentials. Managing a book's own Worker needs these; the control plane's
   *  management secret cannot create or remove a Worker. */
  const cloudflareClientFor = async (
    c: Context,
    connection: CloudflareConnectionRecord,
  ): Promise<CloudflareClient> => {
    if (deps.bookHost) return (await deps.bookHost(c, connection)).client
    const credentials = await resolveCloudflareCredentials(c, { store, oauth })
    return createCloudflareClient({
      token: credentials.token,
      accountId: credentials.accountId,
      ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
    })
  }

  const bookHostFor = async (
    c: Context,
    connection: CloudflareConnectionRecord,
  ): Promise<BookHostDeps> => {
    if (deps.bookHost) return deps.bookHost(c, connection)

    if (connection.workers_dev_subdomain === null) {
      throw new HTTPException(412, {
        message:
          "This Cloudflare account has no workers.dev subdomain yet, so a published book would have no web address. Pick one in the Cloudflare dashboard under Workers & Pages, then publish again.",
      })
    }

    const { artifactDir } = resolveWorkerArtifactPaths(deps.projectRoot ?? process.cwd(), {
      ...(deps.artifactDir === undefined ? {} : { artifactDir: deps.artifactDir }),
    })

    return {
      client: await cloudflareClientFor(c, connection),
      artifact: loadBookHostArtifact(artifactDir),
      d1DatabaseUuid: connection.d1_database_uuid,
      workersDevSubdomain: connection.workers_dev_subdomain,
      controlPlaneSecret: connection.mgmt_secret,
      controlPlaneName: connection.worker_name,
    }
  }

  /** Reader routes are served by the book's own Worker, so previewing a published snapshot
   *  talks to that host rather than the control plane — and authenticates with the per-book
   *  author secret, which is all that host will recognise. */
  const bookHostClientFor = (
    connection: CloudflareConnectionRecord,
    record: BookPublicationRecord,
  ): PublishWorkerClient => {
    /** Deliberately not `deps.createClient`: that stands in for the control plane, and a book
     *  host is a different origin with a different credential. */
    return createPublishWorkerClient({
      workerUrl: new URL(record.base_url).origin,
      mgmtSecret: bookHostAuthorSecret(connection.mgmt_secret, record.token),
      ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
    })
  }

  /** The stored field is the first source; the control plane's own address is the second, since
   *  `<name>.<subdomain>.workers.dev` carries the subdomain in it. A connection with neither is
   *  one this cannot derive an address for, and the caller keeps what it already had. */
  const workersDevSubdomainOf = (connection: CloudflareConnectionRecord): string | null => {
    if (connection.workers_dev_subdomain) return connection.workers_dev_subdomain
    try {
      const labels = new URL(connection.worker_url).hostname.split(".")
      const [, subdomain, workers, dev] = labels
      return labels.length === 4 && workers === "workers" && dev === "dev" && subdomain
        ? subdomain
        : null
    } catch {
      return null
    }
  }

  /**
   * Where a publication is actually served from.
   *
   * The control plane holds every publication's row but none of its bytes — those live on the
   * book's own Worker — so the `url` it reports is its own origin and answers the reader with
   * `{"error":"not_found"}` after the access gate has already let them through. Nothing in D1
   * records which host serves which book, but nothing needs to: `bookWorkerName` derives the
   * name from the token, and the subdomain is the account's. So the address is recomputed here
   * rather than believed.
   *
   * The local record wins when it is about *this* publication: it is what the publish itself
   * wrote down, and it stays right even for a book deployed somewhere this derivation would
   * not predict. It is checked against the token because a book can have been published more
   * than once — the record describes only the newest, and lending its address to the older
   * rows would point every one of them at the same book.
   */
  const bookHostUrlFor = (
    token: string,
    connection: CloudflareConnectionRecord,
    record: BookPublicationRecord | null,
    fallback: string,
  ): string => {
    if (record?.token === token && record.base_url) return record.base_url
    const subdomain = workersDevSubdomainOf(connection)
    if (subdomain === null) return fallback
    return `${workersDevUrl(bookWorkerName(token), subdomain)}/p/${token}/`
  }

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
    ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
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

  /** The book's title and its local publication record together — one filesystem check and,
   *  when the book is on this machine, one open of its database. */
  const localBookSnapshot = (label: string): { exists: boolean } & LocalBookSnapshot => {
    if (!bookExists(label)) return { exists: false, title: null, record: null }
    try {
      return { exists: true, ...readLocalBookSnapshot(label, resolvedBooksDir()) }
    } catch {
      return { exists: true, title: null, record: null }
    }
  }

  /** Whether "Update site" would move a live link onto this Studio's book host. Unknown counts
   *  as older: a link recorded before versions were kept is older than every host that keeps
   *  them. Only a book on this computer can be updated, and only a live link needs to be. */
  const hostFields = (
    record: BookPublicationRecord | null,
    exists: boolean,
    live: boolean,
  ): Pick<PublicationSummary, "host_version" | "host_update_available"> => {
    const hostVersion = record?.host_version ?? null
    return {
      host_version: hostVersion,
      host_update_available:
        exists && live && record !== null && hostVersion !== PUBLISH_WORKER_VERSION,
    }
  }

  const summaryFromWorker = (
    entry: PublicationListEntry,
    connection: CloudflareConnectionRecord,
  ): PublicationSummary => {
    const label = entry.publication.book_label
    const local = localBookSnapshot(label)
    /** The book's *current* name, not the one frozen into the publication at publish time — an
     *  author renames a book and expects the dashboard to follow. */
    const title = local.title?.trim()
    return {
      token: entry.publication.token,
      title: title && title.length > 0 ? title : entry.publication.title,
      book_label: label,
      book_exists: local.exists,
      url: bookHostUrlFor(entry.publication.token, connection, local.record, entry.url),
      current_version: entry.publication.current_version,
      version_count: entry.version_count,
      created_at: entry.publication.created_at,
      last_published_at: entry.last_published_at,
      expires_at: entry.publication.expires_at,
      revoked_at: entry.publication.revoked_at,
      has_access_code: entry.has_access_code,
      access_code: entry.has_access_code ? (local.record?.access_code ?? null) : null,
      comment_count: entry.comment_count,
      unresolved_count: entry.unresolved_count,
      snapshot_bytes: entry.snapshot_bytes,
      ...hostFields(local.record, local.exists, publicationStateAt(entry.publication) === "active"),
      source: "worker",
    }
  }

  /**
   * Whether the account still holds this publication. Only ever asked to interpret a 404.
   *
   * The worker answers a route it does not have with its own catch-all — `{"error":"not_found"}`,
   * 404 — byte-identical to what it answers for a token that is not in the account. Reading the
   * publication back does distinguish them: if it is still there, the 404 was about the route.
   * `null` when the question could not be answered at all.
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

  /** Which book on this computer holds this token. `null` is the ordinary answer for the rows
   *  this exists to serve: the book was deleted and only the account remembers it. */
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
   *  one whose book directory is gone, which is why the screen says the list is incomplete. */
  const summariesFromDisk = (): PublicationSummary[] => {
    const dir = resolvedBooksDir()
    if (!fs.existsSync(dir)) return []

    const summaries: PublicationSummary[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (!BookLabel.safeParse(entry.name).success) continue

      let local: LocalBookSnapshot = { title: null, record: null }
      try {
        local = readLocalBookSnapshot(entry.name, dir)
      } catch {
        local = { title: null, record: null }
      }
      const record = local.record
      if (!record) continue

      const versions = [...record.versions].sort((a, b) => a.version - b.version)
      const newest = versions.at(-1) ?? null
      const title = local.title?.trim()
      summaries.push({
        token: record.token,
        title: title && title.length > 0 ? title : entry.name,
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
        ...hostFields(record, true, publicationStateAt(record) === "active"),
        source: "local",
      })
    }

    return summaries.sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || a.token.localeCompare(b.token),
    )
  }

  const overviewOf = (
    publications: PublicationSummary[],
    reachable: boolean,
  ): PublicationsOverview => {
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
        total_snapshot_bytes: measured.reduce(
          (total, summary) => total + summary.snapshot_bytes,
          0,
        ),
        snapshot_bytes_complete: measured.length === publications.length,
        total_unresolved: publications.reduce(
          (total, summary) => total + summary.unresolved_count,
          0,
        ),
      },
    }
  }

  /** GET /publications — the account's whole shelf.
   *
   *  Unlike the per-book route, a missing connection is a 412 rather than a 200 with a flag:
   *  this screen's entire content lives in the account. A worker that cannot be reached
   *  degrades to what this machine remembers, flagged `worker_reachable: false`. */
  app.get("/publications", async (c) => {
    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account to see your published books",
    )
    if (connection instanceof Response) return connection

    let entries: PublicationListEntry[]
    try {
      entries = (await clientFor(connection).listPublications()).publications
    } catch (error) {
      if (!isPublishWorkerError(error)) throw error
      return c.json(overviewOf(summariesFromDisk(), false))
    }

    return c.json(
      overviewOf(entries.map((entry) => summaryFromWorker(entry, connection)), true),
    )
  })

  app.delete("/publications/:token", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return c.json({ error: "That is not a publication token", code: "not_published" }, 404)
    }

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account to manage published books",
    )
    if (connection instanceof Response) return connection

    /** Before the control plane forgets it: a failure here leaves a book that is still
     *  recorded and still reachable, rather than a public Worker serving a book nothing
     *  remembers and no one can find to delete. */
    try {
      await deleteBookHost(await cloudflareClientFor(c, connection), token.data)
    } catch (error) {
      return failure(
        c,
        502,
        "worker_unreachable",
        `This book's own web service could not be removed, so nothing was deleted: ${
          error instanceof Error ? error.message : String(error)
        }`,
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
      clearPublicationRecord(
        label,
        resolvedBooksDir(),
        (deps.now ?? (() => new Date()))().toISOString(),
      )
    }

    return c.json(result)
  })

  app.get("/books/:label/publication", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)
    const record = readPublicationRecord(label, deps.booksDir)
    const connection = store.read()

    /** Read once here rather than once per branch: it opens the book's database, and this
     *  route is polled while the publish screen is open. */
    const contentRevision = readContentRevision(label, deps.booksDir)
    const statusOf = (over: Partial<BookPublicationStatus>): BookPublicationStatus => ({
      connected: connection !== null,
      record,
      publication: null,
      url: record?.base_url ?? null,
      worker_reachable: false,
      has_access_code: record?.has_access_code ?? false,
      content_revision: contentRevision,
      ...over,
    })

    /** A record from another account describes a link on a subdomain this account does not
     *  own, so reporting it would offer "Update site" for a publication the connected worker
     *  has never heard of. On this account the book is simply unpublished. */
    if (!connection || !record || !belongsToConnection(record, connection)) {
      return c.json(statusOf(record && connection ? { record: null, url: null } : {}))
    }

    try {
      const detail = await clientFor(connection).getPublication(record.token)
      return c.json(
        /** `url` is deliberately left at `statusOf`'s default, the record's own `base_url`.
         *  `detail.url` is the control plane talking about itself, and it serves no book. */
        statusOf({
          publication: detail.publication,
          worker_reachable: true,
          has_access_code: detail.has_access_code,
        }),
      )
    } catch (error) {
      /** A 404 is the worker *answering*: it is reachable, it simply has no publication under
       *  this token any more — a different thing to tell the author than "we could not ask". */
      const answered = isPublishWorkerError(error) && error.status === 404
      if (!answered) return c.json(statusOf({ worker_reachable: false }))

      /**
       * The worker is there and has never heard of this token, so the book is not published —
       * and the record in it is describing something that no longer exists anywhere.
       *
       * `belongsToConnection` cannot catch this on its own. It compares `worker_url`, which
       * answers "did someone connect a *different* account", and the case that gets here is
       * the opposite: the same account, torn down and provisioned again. The new control
       * plane lands on the identical `adt-publish.<subdomain>.workers.dev`, so every stale
       * record still matches it, and each book claimed to be published behind a link whose
       * Worker had been deleted.
       *
       * Tombstoned rather than merely hidden: the answer is not going to change, and leaving
       * it would make the book unpublishable — "Share" is refused while a record exists, and
       * "Update site" would keep asking for a version of a publication that is gone.
       */
      clearPublicationRecord(
        label,
        resolvedBooksDir(),
        (deps.now ?? (() => new Date()))().toISOString(),
      )
      return c.json(statusOf({ record: null, url: null, worker_reachable: true }))
    }
  })

  app.post("/books/:label/publication", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const guard = beginPublish(c, label)
    if (guard instanceof Response) return guard
    const { release } = guard

    const body = BookPublishRequest.safeParse(await readBody(c))
    if (!body.success) {
      release()
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = store.read()
    if (!connection) {
      release()
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account before publishing this book",
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (isActiveRecord(record, connection)) {
      release()
      return failure(
        c,
        409,
        "published_already",
        "This book is already published — use Update site to publish a new version",
      )
    }

    runs.begin(label, "publish")
    return streamSSE(c, async (stream) => {
      /** Recorded before it is written: the stream may already be gone — the author reloaded or
       *  left the page — and the run carries on regardless, so the snapshot is the record. */
      const emit = async (event: PublishProgressEvent) => {
        runs.record(label, event)
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      }

      try {
        await publishBook({
          ...publishDeps(label),
          connection,
          bookHost: await bookHostFor(c, connection),
          emit,
          expiresAt: body.data.expires_at ?? null,
          accessCode: body.data.access_code ?? null,
          ...(body.data.features ? { features: body.data.features } : {}),
        })
      } catch (error) {
        if (error instanceof PublishCancelledError) runs.cancelled(label)
        else await emit(toPublishErrorEvent(error))
      } finally {
        release()
      }
    })
  })

  app.post("/books/:label/publication/versions", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const guard = beginPublish(c, label)
    if (guard instanceof Response) return guard
    const { release } = guard

    const body = BookPublishRequest.safeParse(await readBody(c))
    if (!body.success) {
      release()
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = store.read()
    if (!connection) {
      release()
      return failure(
        c,
        412,
        "publish_not_connected",
        "Connect a Cloudflare account before publishing this book",
      )
    }

    const record = readPublicationRecord(label, deps.booksDir)
    if (!isActiveRecord(record, connection)) {
      release()
      return failure(
        c,
        409,
        "not_published",
        "This book has no active publication — publish it first",
      )
    }

    runs.begin(label, "update")
    return streamSSE(c, async (stream) => {
      /** Recorded before it is written: the stream may already be gone — the author reloaded or
       *  left the page — and the run carries on regardless, so the snapshot is the record. */
      const emit = async (event: PublishProgressEvent) => {
        runs.record(label, event)
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      }

      try {
        await republishBook({
          ...publishDeps(label),
          connection,
          bookHost: await bookHostFor(c, connection),
          emit,
          record,
          ...(body.data.features ? { features: body.data.features } : {}),
        })
      } catch (error) {
        if (error instanceof PublishCancelledError) runs.cancelled(label)
        else await emit(toPublishErrorEvent(error))
      } finally {
        release()
      }
    })
  })

  /** The run a page lost the stream to, or the last one's ending. `null` when none has run. */
  app.get("/books/:label/publication/run", (c) => {
    const label = parseBookLabel(c.req.param("label"))
    return c.json({ run: runs.get(label) })
  })

  /** Every run still going, so the Studio can watch runs a reload left behind on any page. */
  app.get("/publication-runs", (c) => c.json({ runs: runs.running() }))

  /**
   * The author's Stop. A request rather than an order: the run honours it at its next step, and
   * refuses it once the link is being created, where stopping could leave a half-made link.
   */
  app.post("/books/:label/publication/run/cancel", (c) => {
    const label = parseBookLabel(c.req.param("label"))
    return c.json({ cancelled: runs.requestCancel(label) })
  })

  app.post("/books/:label/publication/revoke", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before managing this publication",
    )
    if (connection instanceof Response) return connection

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

  app.post("/books/:label/publication/resume", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before managing this publication",
    )
    if (connection instanceof Response) return connection

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

  app.patch("/books/:label/publication", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const body = PublicationUpdateRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before managing this publication",
    )
    if (connection instanceof Response) return connection

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
     *  not confirm, and never keeps a code the worker has forgotten. */
    savePublicationRecord(label, deps.booksDir, {
      ...record,
      expires_at: response.publication.expires_at,
      revoked_at: response.publication.revoked_at,
      has_access_code: response.has_access_code,
      access_code: response.has_access_code ? (body.data.access_code ?? record.access_code) : null,
    })

    return c.json(response)
  })

  app.get("/books/:label/publication/pages", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before reading this book's pages",
    )
    if (connection instanceof Response) return connection

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

  /* Keyed by token, not by book label, because the publications shelf lists rosters for books
   * that have left this computer (`book_exists: false`) — a label would have nothing to resolve.
   * Same shape as `DELETE /publications/:token` for that reason. */
  app.get("/publications/:token/readers", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return c.json({ error: "That is not a publication token", code: "not_published" }, 404)
    }

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before reading this publication's readers",
    )
    if (connection instanceof Response) return connection

    try {
      return c.json(await clientFor(connection).listReaders(token.data))
    } catch (error) {
      return proxyFailure(c, error)
    }
  })

  app.post("/books/:label/publication/room-ticket", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before joining this publication's live review",
    )
    if (connection instanceof Response) return connection

    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) return failure(c, 409, "not_published", "This book has never been published")

    try {
      return c.json(await clientFor(connection).roomTicket(record.token))
    } catch (error) {
      return proxyFailure(c, error)
    }
  })

  app.get("/books/:label/publication/comments", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const query = PublishCommentListQuery.safeParse(c.req.query())
    if (!query.success) {
      return c.json({ error: query.error.message, code: "invalid_request" }, 400)
    }

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before reading this publication's comments",
    )
    if (connection instanceof Response) return connection

    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) return failure(c, 409, "not_published", "This book has never been published")

    try {
      return c.json(await clientFor(connection).listComments(record.token, query.data))
    } catch (error) {
      return proxyFailure(c, error)
    }
  })

  app.post("/books/:label/publication/comments", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)
    const body = PublishCommentCreateRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before adding publication comments",
    )
    if (connection instanceof Response) return connection
    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) return failure(c, 409, "not_published", "This book has never been published")

    try {
      return c.json(await clientFor(connection).createComment(record.token, body.data), 201)
    } catch (error) {
      return proxyFailure(c, error)
    }
  })

  app.patch("/books/:label/publication/comments/:commentId", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)
    const body = PublishCommentUpdateRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before editing publication comments",
    )
    if (connection instanceof Response) return connection
    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) return failure(c, 409, "not_published", "This book has never been published")

    try {
      return c.json(
        await clientFor(connection).updateComment(record.token, c.req.param("commentId"), body.data),
      )
    } catch (error) {
      return proxyFailure(c, error)
    }
  })

  app.delete("/books/:label/publication/comments/:commentId", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)
    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before deleting publication comments",
    )
    if (connection instanceof Response) return connection
    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) return failure(c, 409, "not_published", "This book has never been published")

    try {
      return c.json(
        await clientFor(connection).deleteComment(record.token, c.req.param("commentId")),
      )
    } catch (error) {
      return proxyFailure(c, error)
    }
  })

  app.post("/books/:label/publication/comments/:commentId/resolve", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)
    const body = PublishCommentResolveRequest.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.message, code: "invalid_request" }, 400)
    }

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before resolving publication comments",
    )
    if (connection instanceof Response) return connection
    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) return failure(c, 409, "not_published", "This book has never been published")

    try {
      return c.json(
        await clientFor(connection).resolveComment(
          record.token,
          c.req.param("commentId"),
          body.data,
        ),
      )
    } catch (error) {
      return proxyFailure(c, error)
    }
  })

  /** GET /books/:label/publication/preview/* — the published snapshot, same-origin.
   *
   *  The exact bytes reviewers saw, not a fresh local package. `MGMT_SECRET` goes out with the
   *  request (so the access gate and the 410 ladder are bypassed for the author) and never
   *  comes back. */
  app.get("/books/:label/publication/preview/*", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    requireBook(label)

    const connection = requireConnection(
      c,
      store,
      "Connect a Cloudflare account before previewing this book",
    )
    if (connection instanceof Response) return connection

    const record = readPublicationRecord(label, deps.booksDir)
    if (!record) {
      /** A 404 rather than the 409 the JSON routes answer: this route's client is an
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
    const decodedPath = decodeSnapshotPath(rawPath)
    if (decodedPath === null) {
      /** Before the worker call, not after: `fetchSnapshotFile` attaches `MGMT_SECRET`, which is
       *  exactly the credential a traversal riding an encoded segment is trying to walk out of
       *  `/p/<token>/` with and into the authenticated management API. */
      return c.json({ error: "That path is not valid", code: "invalid_request" }, 400)
    }

    const forwarded: Record<string, string> = {}
    const ifNoneMatch = c.req.header("if-none-match")
    if (ifNoneMatch !== undefined) forwarded["if-none-match"] = ifNoneMatch

    let upstream: Response
    try {
      /** The bytes live on this book's own host, not the control plane, and that host knows
       *  the author by a secret derived for this book alone. */
      upstream = await bookHostClientFor(connection, record).fetchSnapshotFile(
        record.token,
        decodedPath,
        forwarded,
      )
    } catch (error) {
      return proxyFailure(c, error)
    }

    return streamSnapshotResponse(upstream)
  })

  return app
}

/**
 * The wildcard arrives percent-encoded; the client re-encodes per segment, so decoding here
 * keeps a file named `Página 2.png` addressable without double-encoding it. Decoded per original
 * segment so one malformed sequence falls back to its raw text instead of taking the rest down.
 *
 * `null` when a *decoded* segment is `.` or `..`. The check runs against the decoded path
 * re-split on `/`, not the pre-decode split: an encoded slash inside a single segment only
 * becomes a literal `/` here, and `..%2F..%2Fadmin` is indistinguishable from an ordinary file
 * name until it does.
 */
function decodeSnapshotPath(rawPath: string): string | null {
  const [withoutQuery] = rawPath.split("?")
  const decoded = (withoutQuery ?? "")
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join("/")
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) return null
  return decoded
}

const SNAPSHOT_PASSTHROUGH_HEADERS = ["content-type", "cache-control", "etag", "last-modified"]

function streamSnapshotResponse(upstream: Response): Response {
  const headers = new Headers()
  for (const name of SNAPSHOT_PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  /** `fetch` transparently decodes a compressed body, so an upstream `Content-Length` only
   *  still describes what we are about to write when nothing was encoded. */
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
