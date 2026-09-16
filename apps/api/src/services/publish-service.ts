import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { createBookStorage } from "@adt/storage"
import {
  BookPublicationRecord as BookPublicationRecordSchema,
  PUBLICATION_TOKEN_LENGTH,
  PUBLISH_STEPS,
  PublicationPageEntry,
  parseBookLabel,
  type BookPublicationRecord,
  type Publication,
  type PublicationPageEntry as PublicationPageEntryType,
  type PublicationUploadFile,
  type PublicationVersion,
  type PublishErrorCodeStudio,
  type PublishFeatureSelection,
  type PublishProgressEvent,
  type PublishStepId,
} from "@adt/types"
import { deployBookHost } from "./cloudflare/book-host-deploy.js"
import type { CloudflareClient } from "./cloudflare/client.js"
import type { CloudflareConnectionRecord } from "./cloudflare/connection-store.js"
import { staticAssetHash, type StaticAsset } from "./cloudflare/static-assets.js"
import type { BookHostArtifact } from "./cloudflare/worker-artifact.js"
import { prepareExport, readBookTitle } from "./export-service.js"
import {
  createPublishWorkerClient,
  isPublishWorkerError,
  type PublishWorkerClient,
} from "./publish-worker-client.js"

export const BOOK_PUBLICATION_NODE = "publication"
export const BOOK_PUBLICATION_ITEM_ID = "book"

const PageManifest = PublicationPageEntry.array()

export class PublishStepError extends Error {
  readonly code: PublishErrorCodeStudio
  readonly stepId: PublishStepId | null

  constructor(code: PublishErrorCodeStudio, stepId: PublishStepId | null, message: string) {
    super(message)
    this.name = "PublishStepError"
    this.code = code
    this.stepId = stepId
  }
}

export function isPublishStepError(error: unknown): error is PublishStepError {
  return error instanceof PublishStepError
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function describeHttp(error: unknown): string {
  if (error instanceof HTTPException) return error.message
  return describe(error)
}

function bookDirOf(label: string, booksDir: string): { safeLabel: string; bookDir: string } {
  const safeLabel = parseBookLabel(label)
  return { safeLabel, bookDir: path.join(path.resolve(booksDir), safeLabel) }
}

function requireBook(label: string, booksDir: string): { safeLabel: string; bookDir: string } {
  const resolved = bookDirOf(label, booksDir)
  if (!fs.existsSync(resolved.bookDir)) {
    throw new HTTPException(404, { message: `Book not found: ${resolved.safeLabel}` })
  }
  return resolved
}

/** 32 url-safe characters from a CSPRNG — the share link *is* the read capability. */
export function mintPublicationToken(): string {
  const bytes = Math.ceil((PUBLICATION_TOKEN_LENGTH * 3) / 4)
  return crypto.randomBytes(bytes).toString("base64url").slice(0, PUBLICATION_TOKEN_LENGTH)
}

export function readPublicationRecord(
  label: string,
  booksDir: string,
): BookPublicationRecord | null {
  const { safeLabel, bookDir } = bookDirOf(label, booksDir)
  if (!fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) return null

  const storage = createBookStorage(safeLabel, path.resolve(booksDir))
  try {
    const row = storage.getLatestNodeData(BOOK_PUBLICATION_NODE, BOOK_PUBLICATION_ITEM_ID)
    if (!row) return null
    const parsed = BookPublicationRecordSchema.safeParse(row.data)
    if (!parsed.success) return null
    return parsed.data.deleted_at === null ? parsed.data : null
  } finally {
    storage.close()
  }
}

export interface LocalBookSnapshot {
  title: string | null
  record: BookPublicationRecord | null
}

export function readLocalBookSnapshot(label: string, booksDir: string): LocalBookSnapshot {
  const { safeLabel, bookDir } = bookDirOf(label, booksDir)
  if (!fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) return { title: null, record: null }

  const storage = createBookStorage(safeLabel, path.resolve(booksDir))
  try {
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { title?: string | null } | null
    const title = metadata?.title ?? null

    const row = storage.getLatestNodeData(BOOK_PUBLICATION_NODE, BOOK_PUBLICATION_ITEM_ID)
    const parsed = row ? BookPublicationRecordSchema.safeParse(row.data) : null
    const record = parsed?.success && parsed.data.deleted_at === null ? parsed.data : null

    return { title, record }
  } finally {
    storage.close()
  }
}

export function savePublicationRecord(
  label: string,
  booksDir: string,
  record: BookPublicationRecord,
): { version: number; record: BookPublicationRecord } {
  const { safeLabel } = requireBook(label, booksDir)
  const parsed = BookPublicationRecordSchema.parse(record)
  const storage = createBookStorage(safeLabel, path.resolve(booksDir))
  try {
    const version = storage.putNodeData(BOOK_PUBLICATION_NODE, BOOK_PUBLICATION_ITEM_ID, parsed)
    return { version, record: parsed }
  } finally {
    storage.close()
  }
}

/** A tombstone rather than a delete: book data is versioned, never overwritten. */
export function clearPublicationRecord(label: string, booksDir: string, deletedAt: string): void {
  const existing = readPublicationRecord(label, booksDir)
  if (!existing) return
  savePublicationRecord(label, booksDir, { ...existing, deleted_at: deletedAt })
}

/**
 * Tombstone every book's publication record on this machine.
 *
 * Used when the account's whole publishing setup is torn down: the Worker and the database are
 * gone, so every token they held is gone with them, and a book that still remembers one claims
 * to be published behind a link that no longer resolves.
 *
 * Reconnecting does not rescue those records, it hides the problem — the same account provisions
 * the same `adt-publish.<subdomain>.workers.dev`, so `belongsToConnection` keeps matching them
 * against a control plane that has never heard of them.
 *
 * Best effort per book: one unreadable database must not leave the rest remembering links that
 * are gone. Returns the labels it cleared.
 */
export function clearAllPublicationRecords(booksDir: string, deletedAt: string): string[] {
  const resolved = path.resolve(booksDir)
  if (!fs.existsSync(resolved)) return []
  const cleared: string[] = []
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      if (readPublicationRecord(entry.name, resolved) === null) continue
      clearPublicationRecord(entry.name, resolved, deletedAt)
      cleared.push(entry.name)
    } catch {
      /* A book whose database cannot be opened keeps its record; the rest are still cleared. */
    }
  }
  return cleared
}

/**
 * The highest `node_data` version across every node except the publication record itself.
 *
 * The exclusion is the point: the record lives in the same table, so counting it would make
 * every publish look like a fresh edit and "you have unpublished changes" would never clear.
 */
export function readContentRevision(label: string, booksDir: string): number | null {
  const { safeLabel } = requireBook(label, booksDir)
  const storage = createBookStorage(safeLabel, path.resolve(booksDir))
  try {
    return storage.maxNodeVersionExcluding(BOOK_PUBLICATION_NODE)
  } catch {
    return null
  } finally {
    storage.close()
  }
}

/** The built `adt/` bundle already carries the page list the runtime loads, so the publication
 *  manifest is that exact array — no second derivation. */
export function readPageManifest(bookDir: string): PublicationPageEntryType[] {
  const manifestPath = path.join(bookDir, "adt", "content", "pages.json")
  if (!fs.existsSync(manifestPath)) {
    throw new PublishStepError(
      "package_failed",
      "package",
      "The web export produced no content/pages.json — run the pipeline for this book first",
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as unknown
  } catch (error) {
    throw new PublishStepError(
      "package_failed",
      "package",
      `content/pages.json is not readable JSON: ${describe(error)}`,
    )
  }

  const parsed = PageManifest.safeParse(raw)
  if (!parsed.success) {
    throw new PublishStepError(
      "package_failed",
      "package",
      `content/pages.json does not match the page manifest contract: ${parsed.error.message}`,
    )
  }
  if (parsed.data.length === 0) {
    throw new PublishStepError(
      "package_failed",
      "package",
      "The web export has no pages to publish",
    )
  }

  return parsed.data
}

/** `features.comments` is a publish-only capability. Keep it out of the author's local export,
 * but enable it in the bytes declared and uploaded to the publication worker. */
export const PUBLISH_CONFIG_RELATIVE_PATH = path.join("adt", "assets", "config.json")
export const PUBLISH_PRELOADER_RELATIVE_PATH = path.join("adt", "assets", "offline-preloader.js")

const PRELOADER_CONFIG_KEY = '"./assets/config.json":'

function inlineFeaturesComments(
  source: string,
  originalConfig: unknown,
  patchedConfig: unknown,
): string | null {
  const needle = `${PRELOADER_CONFIG_KEY}${JSON.stringify(originalConfig)}`
  if (!source.includes(needle)) return null
  return source.replace(needle, `${PRELOADER_CONFIG_KEY}${JSON.stringify(patchedConfig)}`)
}

async function withPublishConfig<T>(bookDir: string, run: () => Promise<T>): Promise<T> {
  const configPath = path.join(bookDir, PUBLISH_CONFIG_RELATIVE_PATH)
  if (!fs.existsSync(configPath)) {
    throw new PublishStepError(
      "package_failed",
      "package",
      "The web export produced no assets/config.json — run the pipeline for this book first",
    )
  }

  const original = fs.readFileSync(configPath)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(original.toString("utf-8")) as Record<string, unknown>
  } catch (error) {
    throw new PublishStepError(
      "package_failed",
      "package",
      `assets/config.json is not readable JSON: ${describe(error)}`,
    )
  }

  const features =
    typeof parsed.features === "object" && parsed.features !== null
      ? (parsed.features as Record<string, unknown>)
      : {}
  const patched = { ...parsed, features: { ...features, comments: true } }

  const preloaderPath = path.join(bookDir, PUBLISH_PRELOADER_RELATIVE_PATH)
  const preloaderOriginal = fs.existsSync(preloaderPath) ? fs.readFileSync(preloaderPath) : null
  let preloaderPatched: string | null = null
  if (preloaderOriginal) {
    preloaderPatched = inlineFeaturesComments(
      preloaderOriginal.toString("utf-8"),
      parsed,
      patched,
    )
    if (preloaderPatched === null) {
      throw new PublishStepError(
        "package_failed",
        "package",
        "assets/offline-preloader.js does not inline this book's config.json in the expected shape — the publish flag would be dropped",
      )
    }
  }

  try {
    fs.writeFileSync(configPath, `${JSON.stringify(patched, null, 2)}\n`)
    if (preloaderPatched !== null) fs.writeFileSync(preloaderPath, preloaderPatched)
    return await run()
  } finally {
    fs.writeFileSync(configPath, original)
    if (preloaderOriginal) fs.writeFileSync(preloaderPath, preloaderOriginal)
  }
}

interface AdtFileEntry {
  relativePath: string
  bytes: number
}

function walkAdtFiles(adtDir: string, prefix = ""): AdtFileEntry[] {
  const entries: AdtFileEntry[] = []
  for (const entry of fs.readdirSync(path.join(adtDir, prefix), { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      entries.push(...walkAdtFiles(adtDir, relative))
    } else if (entry.isFile()) {
      entries.push({ relativePath: relative, bytes: fs.statSync(path.join(adtDir, relative)).size })
    }
  }
  return entries
}

function measureAdtBundle(bookDir: string): { files: AdtFileEntry[]; bytes: number } {
  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throw new PublishStepError(
      "package_failed",
      "package",
      "The web export directory is missing — run the pipeline for this book first",
    )
  }
  const files = walkAdtFiles(adtDir)
  const bytes = files.reduce((total, entry) => total + entry.bytes, 0)
  return { files, bytes }
}

/**
 * Sizes and digests every file, as the worker will check them.
 *
 * Read inside the patched-config window rather than from the walk: `config.json` and
 * `offline-preloader.js` are rewritten for the upload, so their size and digest from before the
 * patch would describe bytes that are never sent, and the worker rejects the mismatch.
 */
/** `asset_hash` is Cloudflare's content address for the same bytes, and the control plane
 *  stores it so it can rebuild a book's asset list without holding the bytes. It is safe to
 *  compute here, before the upload id exists, because the address keys on the content and the
 *  file extension only — never on the snapshot prefix the path later gains. */
function declareSnapshotFiles(bookDir: string, files: AdtFileEntry[]): PublicationUploadFile[] {
  const adtDir = path.join(bookDir, "adt")
  return files.map((file) => {
    const body = fs.readFileSync(path.join(adtDir, file.relativePath))
    return {
      path: file.relativePath,
      bytes: body.byteLength,
      sha256: crypto.createHash("sha256").update(body).digest("hex"),
      asset_hash: staticAssetHash(file.relativePath, body),
    }
  })
}

export interface PublishExportOptions {
  label: string
  booksDir: string
  webAssetsDir: string
  configPath?: string
  prepareExportFn?: typeof prepareExport
  /** What to leave out of the snapshot. Absent publishes the whole book. */
  features?: PublishFeatureSelection
}

export interface PublishSnapshot {
  pageManifest: PublicationPageEntryType[]
  title: string
  adtFiles: AdtFileEntry[]
}

export type PublishEmit = (event: PublishProgressEvent) => Promise<void>

function stepEvent(
  id: PublishStepId,
  status: "running" | "done" | "error",
  extra: {
    message?: string
    error?: string
    done?: number
    total?: number
    unit?: "files" | "pages" | "bytes"
  } = {},
): PublishProgressEvent {
  const descriptor = PUBLISH_STEPS.find((step) => step.id === id)
  if (!descriptor) {
    throw new Error(`Unknown publish step: ${id}`)
  }
  return {
    type: "step",
    id,
    number: descriptor.number,
    label: descriptor.label,
    status,
    ...(extra.message === undefined ? {} : { message: extra.message }),
    ...(extra.error === undefined ? {} : { error: extra.error }),
    ...(extra.done === undefined ? {} : { done: extra.done }),
    ...(extra.total === undefined ? {} : { total: extra.total }),
    ...(extra.unit === undefined ? {} : { unit: extra.unit }),
  }
}

async function buildSnapshot(
  options: PublishExportOptions,
  emit: PublishEmit,
): Promise<PublishSnapshot> {
  const { safeLabel, bookDir } = requireBook(options.label, options.booksDir)
  const runExport = options.prepareExportFn ?? prepareExport

  await emit(stepEvent("export", "running"))
  try {
    await runExport(
      safeLabel,
      "adt",
      options.booksDir,
      options.webAssetsDir,
      options.configPath,
      options.features,
    )
  } catch (error) {
    throw new PublishStepError("export_failed", "export", describeHttp(error))
  }
  await emit(stepEvent("export", "done"))

  await emit(stepEvent("package", "running"))
  const pageManifest = readPageManifest(bookDir)
  const measured = measureAdtBundle(bookDir)
  if (measured.files.length === 0) {
    throw new PublishStepError(
      "package_failed",
      "package",
      "The web export directory is empty — run the pipeline for this book first",
    )
  }
  await emit(
    stepEvent("package", "done", {
      message: `${pageManifest.length} pages, ${measured.files.length} files, ${Math.round(
        measured.bytes / 1024,
      )} kB`,
    }),
  )

  return {
    pageManifest,
    title: readBookTitle(safeLabel, path.resolve(options.booksDir)),
    adtFiles: measured.files,
  }
}

/** Injected so a test can exercise the retry without waiting out the backoff. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface PublishBookOptions extends PublishExportOptions {
  connection: CloudflareConnectionRecord
  /** Per-book hosting deploys this book's own Worker as part of publishing, so the account
   *  credentials and the book-host artifact travel with the publish. */
  bookHost: BookHostDeps
  emit: PublishEmit
  expiresAt?: string | null
  /** Plaintext. It goes to the worker to be hashed, and into the book's own record so the
   *  author can read back the code they have to share — the worker cannot tell them. */
  accessCode?: string | null
  now?: () => Date
  generateToken?: () => string
  sleep?: (ms: number) => Promise<void>
  createClient?: (connection: CloudflareConnectionRecord) => PublishWorkerClient
}

export interface PublishBookResult {
  publication: Publication
  version: PublicationVersion
  url: string
  record: BookPublicationRecord
}

function clientFor(options: PublishBookOptions): PublishWorkerClient {
  if (options.createClient) return options.createClient(options.connection)
  return createPublishWorkerClient({
    workerUrl: options.connection.worker_url,
    mgmtSecret: options.connection.mgmt_secret,
  })
}

const UPLOAD_ATTEMPTS = 3

const UPLOAD_BACKOFF_MS = [1_000, 3_000]

/**
 * A 5xx is the worker or the edge in trouble, not the request, and unreachable is the same
 * story one layer down. Everything else fails identically however many times it is sent.
 */
function isRetryableUpload(error: unknown): boolean {
  if (!isPublishWorkerError(error)) return false
  if (error.unreachable) return true
  return error.status !== null && error.status >= 500
}

/**
 * Whether the two non-idempotent calls — starting an upload and committing one — are worth
 * repeating.
 *
 * `neverDelivered` means the request provably never reached the worker, so nothing was created
 * and repeating it is as safe as the first send. Any other transport failure is ambiguous: the
 * worker may already have minted the upload or the version, and a reply lost on the way back
 * looks identical to a request that failed outright. A phantom version is worse than a publish
 * the author has to retry by hand.
 */
function isRetryableRegistration(error: unknown): boolean {
  if (!isPublishWorkerError(error)) return false
  if (error.unreachable) return error.neverDelivered
  return error.status !== null && error.status >= 500
}

async function uploadWithRetry<T>(
  attempt: () => Promise<T>,
  emit: PublishEmit,
  sleep: (ms: number) => Promise<void>,
  isRetryable: (error: unknown) => boolean = isRetryableUpload,
): Promise<T> {
  let lastError: unknown
  for (let index = 0; index < UPLOAD_ATTEMPTS; index += 1) {
    try {
      return await attempt()
    } catch (error) {
      lastError = error
      const final = index === UPLOAD_ATTEMPTS - 1
      if (final || !isRetryable(error)) break
      await emit(
        stepEvent("upload", "running", {
          message: `Cloudflare didn't take it — trying again (${index + 2} of ${UPLOAD_ATTEMPTS})`,
        }),
      )
      await sleep(UPLOAD_BACKOFF_MS[index] ?? 3_000)
    }
  }
  throw uploadFailure(lastError)
}

function uploadFailure(error: unknown): PublishStepError {
  if (isPublishStepError(error)) return error
  if (isPublishWorkerError(error)) {
    if (error.unreachable) {
      return new PublishStepError("worker_unreachable", "upload", error.message)
    }
    if (error.code === "payload_too_large") {
      return new PublishStepError("snapshot_too_large", "upload", error.message)
    }
    return new PublishStepError("upload_failed", "upload", error.message)
  }
  return new PublishStepError("upload_failed", "upload", describe(error))
}

/** The snapshot is already staged behind an id nothing else will ever use, so a failed abort
 *  costs an orphaned prefix the worker expires on its own — never the error the author needs. */
async function abortQuietly(client: PublishWorkerClient, uploadId: string): Promise<void> {
  try {
    await client.abortUpload(uploadId)
  } catch {
    return
  }
}

/** Where the control plane files a snapshot, and therefore the path prefix every asset of
 *  that version carries. Mirrors `uploads/${uploadId}` in the worker's upload route. */
const SNAPSHOT_PREFIX = "uploads"

export interface BookHostDeps {
  /** Account-level credentials. Per-book hosting deploys a Worker on every publish, so
   *  publishing needs these and no longer just the control plane's management secret. */
  client: CloudflareClient
  artifact: BookHostArtifact
  d1DatabaseUuid: string
  workersDevSubdomain: string
  /** The control plane's secret. Each book host gets a value derived from it, never this. */
  controlPlaneSecret: string
  controlPlaneName?: string
}

/**
 * Sends this book's bytes straight to Cloudflare and deploys the Worker that serves them.
 *
 * The bytes never pass through the control plane. Each asset is addressed by the snapshot
 * prefix the control plane assigned plus its path inside the bundle, which is exactly what the
 * reader routes resolve an incoming request to.
 */
async function deployBookAssets(
  host: BookHostDeps,
  token: string,
  uploadId: string,
  bookDir: string,
  declared: PublicationUploadFile[],
  emit: PublishEmit,
): Promise<{ url: string; workerName: string }> {
  const adtDir = path.join(bookDir, "adt")
  await emit(stepEvent("upload", "running", { done: 0, total: declared.length, unit: "files" }))

  const assets: StaticAsset[] = declared.map((file) => ({
    path: `/${SNAPSHOT_PREFIX}/${uploadId}/${file.path}`,
    content: fs.readFileSync(path.join(adtDir, file.path)),
  }))

  const deployed = await deployBookHost({
    client: host.client,
    artifact: host.artifact,
    token,
    assets,
    d1DatabaseUuid: host.d1DatabaseUuid,
    workersDevSubdomain: host.workersDevSubdomain,
    controlPlaneSecret: host.controlPlaneSecret,
    ...(host.controlPlaneName === undefined ? {} : { controlPlaneName: host.controlPlaneName }),
  })

  await emit(
    stepEvent("upload", "running", {
      done: declared.length,
      total: declared.length,
      unit: "files",
    }),
  )
  return deployed
}

interface StagedCommit {
  publication: Publication
  version: PublicationVersion
  url: string
  hasAccessCode: boolean
  workerName: string
}

async function stageAndCommit(
  client: PublishWorkerClient,
  host: BookHostDeps,
  token: string,
  bookDir: string,
  files: AdtFileEntry[],
  start: (declared: PublicationUploadFile[]) => Promise<{ upload_id: string }>,
  emit: PublishEmit,
  sleep: (ms: number) => Promise<void>,
): Promise<StagedCommit> {
  return withPublishConfig(bookDir, async () => {
    const declared = declareSnapshotFiles(bookDir, files)
    const started = await uploadWithRetry(
      () => start(declared),
      emit,
      sleep,
      isRetryableRegistration,
    )

    try {
      const deployed = await deployBookAssets(
        host,
        token,
        started.upload_id,
        bookDir,
        declared,
        emit,
      )
      await emit(stepEvent("upload", "done"))

      await emit(stepEvent("register", "running"))
      /** The control plane never saw the bytes, so it is told the collection landed rather
       *  than having each file marked as it arrived. */
      await uploadWithRetry(
        () => client.completeStaticAssetUpload(started.upload_id),
        emit,
        sleep,
        isRetryableRegistration,
      )
      const committed = await uploadWithRetry(
        () => client.commitUpload(started.upload_id),
        emit,
        sleep,
        isRetryableRegistration,
      )
      return {
        publication: committed.publication,
        version: committed.version,
        /** The book host serves the reader, not the control plane, so the share link points at
         *  this book's own Worker. */
        url: `${deployed.url}/p/${committed.publication.token}/`,
        hasAccessCode: committed.has_access_code,
        workerName: deployed.workerName,
      }
    } catch (error) {
      await abortQuietly(client, started.upload_id)
      throw error
    }
  })
}

export async function publishBook(options: PublishBookOptions): Promise<PublishBookResult> {
  const emit = options.emit
  const built = await buildSnapshot(options, emit)
  /** Read after the build, not after the upload: it has to describe the content that went into
   *  the snapshot, and a big book can be uploading for minutes while the author keeps editing. */
  const contentRevision = readContentRevision(options.label, options.booksDir)
  const token = (options.generateToken ?? mintPublicationToken)()
  const client = clientFor(options)
  const bookLabel = parseBookLabel(options.label)

  await emit(stepEvent("upload", "running"))
  const { bookDir } = requireBook(options.label, options.booksDir)
  const committed = await stageAndCommit(
    client,
    options.bookHost,
    token,
    bookDir,
    built.adtFiles,
    (declared) =>
      client.startUpload({
        kind: "create",
        token,
        title: built.title,
        book_label: bookLabel,
        page_manifest: built.pageManifest,
        files: declared,
        ...(options.expiresAt === undefined ? {} : { expires_at: options.expiresAt }),
        ...(options.accessCode ? { access_code: options.accessCode } : {}),
      }),
    emit,
    options.sleep ?? delay,
  )

  const record: BookPublicationRecord = {
    token,
    base_url: committed.url,
    worker_url: options.connection.worker_url,
    created_at: committed.publication.created_at,
    expires_at: committed.publication.expires_at,
    revoked_at: committed.publication.revoked_at,
    versions: [
      {
        version: committed.version.version,
        published_at: committed.version.created_at,
        page_count: built.pageManifest.length,
        content_revision: contentRevision,
      },
    ],
    access_code: options.accessCode ?? null,
    has_access_code: committed.hasAccessCode,
    deleted_at: null,
    features: options.features ?? null,
  }
  savePublicationRecord(options.label, options.booksDir, record)
  await emit(stepEvent("register", "done"))

  await emit({
    type: "complete",
    publication: committed.publication,
    version: committed.version,
    url: committed.url,
  })

  return {
    publication: committed.publication,
    version: committed.version,
    url: committed.url,
    record,
  }
}

export interface RepublishBookOptions extends PublishBookOptions {
  record: BookPublicationRecord
}

export async function republishBook(options: RepublishBookOptions): Promise<PublishBookResult> {
  const emit = options.emit
  /** Repeat whatever the first publish left out, unless this call says otherwise: a book that
   *  fits only because its narration was excluded would otherwise fail on update, after the
   *  author had already waited through a full export. */
  const built = await buildSnapshot(
    { ...options, features: options.features ?? options.record.features ?? undefined },
    emit,
  )
  const contentRevision = readContentRevision(options.label, options.booksDir)
  const client = clientFor(options)

  await emit(stepEvent("upload", "running"))
  const { bookDir } = requireBook(options.label, options.booksDir)
  /** The worker owns the version counter, so the new version comes back from the upload it
   *  opens rather than being guessed here. */
  const committed = await stageAndCommit(
    client,
    options.bookHost,
    options.record.token,
    bookDir,
    built.adtFiles,
    (declared) =>
      client.startUpload({
        kind: "version",
        token: options.record.token,
        page_manifest: built.pageManifest,
        files: declared,
      }),
    emit,
    options.sleep ?? delay,
  )

  const record: BookPublicationRecord = {
    ...options.record,
    expires_at: committed.publication.expires_at,
    revoked_at: committed.publication.revoked_at,
    versions: [
      ...options.record.versions.filter(
        (version) => version.version !== committed.version.version,
      ),
      {
        version: committed.version.version,
        published_at: committed.version.created_at,
        page_count: built.pageManifest.length,
        content_revision: contentRevision,
      },
    ].sort((a, b) => a.version - b.version),
  }
  savePublicationRecord(options.label, options.booksDir, record)
  await emit(stepEvent("register", "done"))

  await emit({
    type: "complete",
    publication: committed.publication,
    version: committed.version,
    url: options.record.base_url,
  })

  return {
    publication: committed.publication,
    version: committed.version,
    url: options.record.base_url,
    record,
  }
}

export function toPublishErrorEvent(error: unknown): PublishProgressEvent {
  if (isPublishStepError(error)) {
    return { type: "error", code: error.code, message: error.message, step_id: error.stepId }
  }
  return { type: "error", code: "upload_failed", message: describe(error), step_id: null }
}
