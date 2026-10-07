import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { createBookStorage } from "@adt/storage"
import {
  BookPublicationRecord as BookPublicationRecordSchema,
  PendingPublicationCommit as PendingPublicationCommitSchema,
  PUBLICATION_TOKEN_LENGTH,
  PUBLISH_STEPS,
  PublicationPageEntry,
  parseBookLabel,
  type BookPublicationRecord,
  type PendingPublicationCommit,
  type Publication,
  type PublicationPageEntry as PublicationPageEntryType,
  type PublicationUploadFile,
  type PublicationVersion,
  type PublishErrorCodeStudio,
  type PublishFeatureSelection,
  type PublishProgressEvent,
  type PublishStepId,
  isVersionAtLeast,
} from "@adt/types"
import { BookHostDeployError, deleteBookHost, deployBookHost } from "./cloudflare/book-host-deploy.js"
import { CloudflareApiError, isRetryableCloudflareError, type CloudflareClient } from "./cloudflare/client.js"
import type { CloudflareConnectionRecord } from "./cloudflare/connection-store.js"
import { staticAssetHash, type RetainedStaticAsset, type StaticAsset } from "./cloudflare/static-assets.js"
import type { BookHostArtifact } from "./cloudflare/worker-artifact.js"
import { prepareExport, readBookTitle } from "./export-service.js"
import {
  createPublishWorkerClient,
  isPublishWorkerError,
  type PublishWorkerClient,
} from "./publish-worker-client.js"

export const BOOK_PUBLICATION_NODE = "publication"
export const BOOK_PUBLICATION_ITEM_ID = "book"
export const PENDING_COMMIT_NODE = "publication-pending-commit"

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

export function readPendingCommit(label: string, booksDir: string): PendingPublicationCommit | null {
  const { safeLabel, bookDir } = bookDirOf(label, booksDir)
  if (!fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) return null
  const storage = createBookStorage(safeLabel, path.resolve(booksDir))
  try {
    const row = storage.getLatestNodeData(PENDING_COMMIT_NODE, BOOK_PUBLICATION_ITEM_ID)
    if (!row) return null
    const parsed = PendingPublicationCommitSchema.safeParse(row.data)
    return parsed.success && parsed.data.settled_at === null ? parsed.data : null
  } finally {
    storage.close()
  }
}

function savePendingCommit(label: string, booksDir: string, pending: PendingPublicationCommit): void {
  const { safeLabel } = requireBook(label, booksDir)
  const storage = createBookStorage(safeLabel, path.resolve(booksDir))
  try {
    storage.putNodeData(PENDING_COMMIT_NODE, BOOK_PUBLICATION_ITEM_ID, PendingPublicationCommitSchema.parse(pending))
  } finally {
    storage.close()
  }
}

function settlePendingCommit(label: string, booksDir: string, pending: PendingPublicationCommit, at: string): void {
  savePendingCommit(label, booksDir, { ...pending, settled_at: at })
}

/** The record a commit files, from the note written before it — shared by a run that heard
 *  back and by the recovery of one that didn't, so the two can never disagree. */
function recordFromCommit(
  pending: PendingPublicationCommit,
  committed: { publication: Publication; version: PublicationVersion; has_access_code: boolean },
): BookPublicationRecord {
  const entry = {
    version: committed.version.version,
    published_at: committed.version.created_at,
    page_count: pending.page_count,
    content_revision: pending.content_revision,
  }
  if (pending.previous) {
    return {
      ...pending.previous,
      expires_at: committed.publication.expires_at,
      revoked_at: committed.publication.revoked_at,
      versions: [
        ...pending.previous.versions.filter((version) => version.version !== entry.version),
        entry,
      ].sort((a, b) => a.version - b.version),
      host_version: pending.host_version,
    }
  }
  return {
    token: pending.token,
    base_url: pending.base_url,
    worker_url: pending.worker_url,
    created_at: committed.publication.created_at,
    expires_at: committed.publication.expires_at,
    revoked_at: committed.publication.revoked_at,
    versions: [entry],
    access_code: pending.access_code,
    has_access_code: committed.has_access_code,
    deleted_at: null,
    features: pending.features,
    host_version: pending.host_version,
  }
}

/**
 * Finishes the paperwork of a run that never heard how its commit ended.
 *
 * Asks the control plane, and only reads: a committed upload's result becomes the record the run
 * would have filed; one that never committed is retired and the note settled. Unreachable leaves
 * the note for next time. Callers must not run this while a run for the book is in flight —
 * that run's own note is pending on purpose.
 */
export async function reconcilePendingCommit(
  label: string,
  booksDir: string,
  client: PublishWorkerClient,
  now: () => Date = () => new Date(),
): Promise<BookPublicationRecord | null> {
  const pending = readPendingCommit(label, booksDir)
  if (!pending) return null
  let upload: Awaited<ReturnType<PublishWorkerClient["getUpload"]>>
  try {
    upload = await client.getUpload(pending.upload_id)
  } catch (error) {
    if (isPublishWorkerError(error) && error.status === 404) {
      settlePendingCommit(label, booksDir, pending, now().toISOString())
    }
    return null
  }
  if (upload.state === "committed" && upload.result) {
    const record = recordFromCommit(pending, upload.result)
    savePublicationRecord(label, booksDir, record)
    settlePendingCommit(label, booksDir, pending, now().toISOString())
    return record
  }
  if (upload.state === "open") await abortQuietly(client, pending.upload_id)
  settlePendingCommit(label, booksDir, pending, now().toISOString())
  return null
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

/** Outside `adt/`, so the copies are never uploaded with the book. */
const PUBLISH_RESTORE_DIR = ".publish-restore"

/**
 * Puts back the files a share patched, if the run that patched them never got to.
 *
 * The share turns comments on in the book's own `config.json` (and its inlined copy) for as long
 * as it uploads, and puts them back afterwards. The app quitting mid-share skipped the putting
 * back, and the author's next offline export shipped with comments switched on. The originals are
 * copied aside before patching, so whichever comes first — the next share, or the Sharing page
 * opening — restores them.
 */
export function restoreInterruptedPublishConfig(bookDir: string): void {
  const restoreDir = path.join(bookDir, PUBLISH_RESTORE_DIR)
  if (!fs.existsSync(restoreDir)) return
  for (const relative of [PUBLISH_CONFIG_RELATIVE_PATH, PUBLISH_PRELOADER_RELATIVE_PATH]) {
    const saved = path.join(restoreDir, path.basename(relative))
    if (fs.existsSync(saved)) fs.copyFileSync(saved, path.join(bookDir, relative))
  }
  fs.rmSync(restoreDir, { recursive: true, force: true })
}

async function withPublishConfig<T>(bookDir: string, run: () => Promise<T>): Promise<T> {
  restoreInterruptedPublishConfig(bookDir)
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

  const restoreDir = path.join(bookDir, PUBLISH_RESTORE_DIR)
  fs.mkdirSync(restoreDir, { recursive: true })
  fs.writeFileSync(path.join(restoreDir, path.basename(configPath)), original)
  if (preloaderOriginal) fs.writeFileSync(path.join(restoreDir, path.basename(preloaderPath)), preloaderOriginal)

  try {
    fs.writeFileSync(configPath, `${JSON.stringify(patched, null, 2)}\n`)
    if (preloaderPatched !== null) fs.writeFileSync(preloaderPath, preloaderPatched)
    return await run()
  } finally {
    fs.writeFileSync(configPath, original)
    if (preloaderOriginal) fs.writeFileSync(preloaderPath, preloaderOriginal)
    fs.rmSync(restoreDir, { recursive: true, force: true })
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

/**
 * A commit is safe to repeat: the control plane answers a second commit of the same upload with
 * the first one's result. So unlike starting an upload, a reply lost on the way back is worth
 * asking again — that is exactly the case that otherwise left a version live on Cloudflare and
 * missing from the book's record.
 */
function isRetryableCommit(error: unknown): boolean {
  if (!isPublishWorkerError(error)) return false
  if (error.unreachable) return true
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
    /** The worker answered, and answered that it has no such publication — so there is nothing
     *  to add a version to. Never `upload_failed`, whose copy promises that waiting a moment
     *  and publishing again normally works; this one needs a fresh link, not patience. */
    if (error.status === 404) {
      return new PublishStepError("not_published", "upload", error.message)
    }
    return new PublishStepError("upload_failed", "upload", error.message)
  }
  return new PublishStepError("upload_failed", "upload", describe(error))
}

/** Retires an upload, and says whether the control plane confirmed it — only then is it known
 *  that nothing went live. */
async function abortQuietly(client: PublishWorkerClient, uploadId: string): Promise<boolean> {
  try {
    const aborted = await client.abortUpload(uploadId)
    return aborted.state === "aborted"
  } catch {
    return false
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
  sleep: (ms: number) => Promise<void>,
  retained: RetainedStaticAsset[],
): Promise<{ url: string; workerName: string }> {
  const adtDir = path.join(bookDir, "adt")

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
    sleep,
    retainedAssets: retained,
    onAssetProgress: async (progress) => {
      await emit(stepEvent("upload", "running", { ...progress, unit: "files" }))
    },
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

/**
 * The files this book's readers are on right now, so the deploy keeps serving them until the
 * new version is committed. A first share has none. Asking is best-effort: an older control
 * plane answers with every book's files, and Cloudflare simply asks for the ones this Worker
 * never had, which the deploy then drops; a failed answer means deploying the new files alone,
 * as before.
 */
async function liveFiles(client: PublishWorkerClient, token: string): Promise<RetainedStaticAsset[]> {
  try {
    const { assets } = await client.listStaticAssets(token)
    return assets.map((asset) => ({ path: asset.path, hash: asset.hash, size: asset.bytes }))
  } catch {
    return []
  }
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
  beforeCommit: (staged: { uploadId: string; url: string }) => void,
  firstShare: boolean,
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
        sleep,
        await liveFiles(client, token),
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
      /** The book host serves the reader, not the control plane, so the share link points at
       *  this book's own Worker. */
      const url = `${deployed.url}/p/${token}/`
      beforeCommit({ uploadId: started.upload_id, url })
      const committed = await uploadWithRetry(
        () => client.commitUpload(started.upload_id),
        emit,
        sleep,
        isRetryableCommit,
      )
      return {
        publication: committed.publication,
        version: committed.version,
        url,
        hasAccessCode: committed.has_access_code,
        workerName: deployed.workerName,
      }
    } catch (error) {
      const retired = await abortQuietly(client, started.upload_id)
      /** A first share's Worker is named after the token this run just minted, so nothing else
       *  can be using it; left behind, every failed share kept one, counting against the
       *  account's book limit. Removed only once the control plane confirms nothing went live. */
      if (firstShare && retired) await deleteBookHost(host.client, token).catch(() => {})
      throw error
    }
  })
}

/**
 * Refuses to deploy a book host the account's control plane is too old for.
 *
 * The host is new on every share, but the database it reads and the room it joins belong to the
 * control plane, which changes only when the author installs an update. Checked before anything
 * is built, so the author waits through nothing to be told, and the answer is the one thing
 * that fixes it: install the update. A version nobody recorded is allowed — blocking on a guess
 * would stop sharing for every account connected before versions were stored.
 */
export function assertControlPlaneFor(host: BookHostDeps, connection: CloudflareConnectionRecord): void {
  const minimum = host.artifact.metadata.min_control_plane_version
  if (!minimum) return
  if (isVersionAtLeast(connection.worker_version, minimum)) return
  throw new PublishStepError(
    "worker_outdated",
    null,
    `Your sharing service is version ${connection.worker_version}, and this Studio's books need ${minimum} or newer. Install the update in Settings → Sharing, then share again.`,
  )
}

/** The host version a share deployed, for the record. */
function hostVersionOf(host: BookHostDeps): string {
  return host.artifact.metadata.version
}

export async function publishBook(options: PublishBookOptions): Promise<PublishBookResult> {
  assertControlPlaneFor(options.bookHost, options.connection)
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
  const pending = (staged: { uploadId: string; url: string }): PendingPublicationCommit => ({
    upload_id: staged.uploadId,
    token,
    base_url: staged.url,
    worker_url: options.connection.worker_url,
    page_count: built.pageManifest.length,
    content_revision: contentRevision,
    access_code: options.accessCode ?? null,
    features: options.features ?? null,
    host_version: hostVersionOf(options.bookHost),
    previous: null,
    started_at: (options.now ?? (() => new Date()))().toISOString(),
    settled_at: null,
  })
  let note: PendingPublicationCommit | null = null
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
    (staged) => {
      note = pending(staged)
      savePendingCommit(options.label, options.booksDir, note)
    },
    true,
  )

  const record = recordFromCommit(note!, {
    publication: committed.publication,
    version: committed.version,
    has_access_code: committed.hasAccessCode,
  })
  savePublicationRecord(options.label, options.booksDir, record)
  settlePendingCommit(options.label, options.booksDir, note!, (options.now ?? (() => new Date()))().toISOString())
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
  assertControlPlaneFor(options.bookHost, options.connection)
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
  let note: PendingPublicationCommit | null = null
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
    (staged) => {
      note = {
        upload_id: staged.uploadId,
        token: options.record.token,
        base_url: options.record.base_url,
        worker_url: options.record.worker_url,
        page_count: built.pageManifest.length,
        content_revision: contentRevision,
        access_code: options.record.access_code,
        features: options.record.features,
        host_version: hostVersionOf(options.bookHost),
        previous: options.record,
        started_at: (options.now ?? (() => new Date()))().toISOString(),
        settled_at: null,
      }
      savePendingCommit(options.label, options.booksDir, note)
    },
    false,
  )

  const record = recordFromCommit(note!, {
    publication: committed.publication,
    version: committed.version,
    has_access_code: committed.hasAccessCode,
  })
  savePublicationRecord(options.label, options.booksDir, record)
  settlePendingCommit(options.label, options.booksDir, note!, (options.now ?? (() => new Date()))().toISOString())
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
  /** Everything else comes from sending the book to Cloudflare — deploying its Worker or its
   *  files — so it is the upload step, and the code says which kind of trouble it was. */
  if (error instanceof BookHostDeployError && error.bookLimitReached) {
    return { type: "error", code: "account_book_limit", message: error.message, step_id: "upload" }
  }
  const cause = error instanceof BookHostDeployError ? error.cause : error
  if (!(cause instanceof CloudflareApiError) && isRetryableCloudflareError(cause)) {
    return { type: "error", code: "worker_unreachable", message: describe(error), step_id: "upload" }
  }
  return { type: "error", code: "upload_failed", message: describe(error), step_id: "upload" }
}
