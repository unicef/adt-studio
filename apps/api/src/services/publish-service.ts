import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { createBookStorage } from "@adt/storage"
import {
  BookPublicationRecord as BookPublicationRecordSchema,
  PUBLICATION_SNAPSHOT_MAX_BYTES,
  type PublishFeatureSelection,
  PUBLICATION_TOKEN_LENGTH,
  PUBLISH_STEPS,
  PublicationPageEntry,
  parseBookLabel,
  type BookPublicationRecord,
  type Publication,
  type PublicationPageEntry as PublicationPageEntryType,
  type PublicationVersion,
  type PublishErrorCodeStudio,
  type PublishProgressEvent,
  type PublishStepId,
} from "@adt/types"
import type { CloudflareConnectionRecord } from "./cloudflare/connection-store.js"
import { prepareExport, readBookTitle } from "./export-service.js"
import {
  createPublishWorkerClient,
  isPublishWorkerError,
  type PublishWorkerClient,
} from "./publish-worker-client.js"
import { createZipStream } from "./zip-util.js"

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

/** 32 url-safe characters from a CSPRNG — the share link *is* the read capability, so the
 *  token is minted here rather than derived from anything guessable about the book. */
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

/**
 * Marks the book as no longer published, without erasing the history of it.
 *
 * A tombstone rather than a delete: book data is versioned, never overwritten, so the previous
 * record stays readable at its own version and this appends the fact that it ended. Silent when
 * the book is gone from this computer, which is the common case for the row an author is
 * clearing — the record died with the directory.
 */
export function clearPublicationRecord(
  label: string,
  booksDir: string,
  deletedAt: string,
): void {
  const existing = readPublicationRecord(label, booksDir)
  if (!existing) return
  savePublicationRecord(label, booksDir, { ...existing, deleted_at: deletedAt })
}

/**
 * The book's content revision: the highest `node_data` version across every node except the
 * publication record itself.
 *
 * The exclusion is the whole point. The publication record lives in the same table, so counting
 * it would make every publish look like a fresh edit and the "you have unpublished changes"
 * notice would never turn off.
 */
export function readContentRevision(label: string, booksDir: string): number | null {
  const { safeLabel } = requireBook(label, booksDir)
  const storage = createBookStorage(safeLabel, path.resolve(booksDir))
  try {
    return storage.maxNodeVersionExcluding(BOOK_PUBLICATION_NODE)
  } catch {
    /** A book whose database cannot be read says "unknown" rather than "unchanged". */
    return null
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
    const version = storage.putNodeData(
      BOOK_PUBLICATION_NODE,
      BOOK_PUBLICATION_ITEM_ID,
      parsed,
    )
    return { version, record: parsed }
  } finally {
    storage.close()
  }
}

/** The built `adt/` bundle already carries the page list the runtime itself loads
 *  (`content/pages.json`, written by `packageAdtWeb`), so the publication manifest is that
 *  exact array — same `section_id` / `href` / `page_number` shape, no second derivation. */
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

/** `features.comments` is a *publish-only* capability: the runtime turns the
 *  pinned-comments overlay on when it sees the flag and is being read through a
 *  `/p/<token>/` link. The plain `adt` download must not carry it, so the flag is
 *  patched into `assets/config.json` for the length of the zip and the original
 *  bytes are put back afterwards — the same `adt/` directory is what the user
 *  downloads. */
export const PUBLISH_CONFIG_RELATIVE_PATH = path.join("adt", "assets", "config.json")

/** The offline preloader inlines `assets/config.json` and replaces `window.fetch`
 *  on *every* protocol, not just `file:` — so the runtime reads the inlined copy
 *  and a snapshot whose served `config.json` alone was patched would ship with
 *  the flag invisible. */
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
  const preloaderOriginal = fs.existsSync(preloaderPath)
    ? fs.readFileSync(preloaderPath)
    : null
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

/** How many files are in flight at once. Enough to hide the round trip on a book of a few
 *  hundred files, low enough that a flaky connection is not made worse by saturating it. */
const UPLOAD_CONCURRENCY = 6

/** Every file of the packaged book, as paths relative to `adt/`. */
function adtFilePaths(adtDir: string, prefix = ""): string[] {
  const paths: string[] = []
  for (const entry of fs.readdirSync(path.join(adtDir, prefix), { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) paths.push(...adtFilePaths(adtDir, relative))
    else if (entry.isFile()) paths.push(relative)
  }
  return paths
}

/**
 * Streams the packaged book to the worker a file at a time.
 *
 * Replaces posting one zip, which put a whole book through a single worker request: unpacked in
 * a 128 MB sandbox, written file by file, weighed against the account's 100 MB request cap, and
 * spending one subrequest per file against a limit of fifty on the Workers free plan. All of
 * those are per-request ceilings, so this simply stops meeting them — and a refusal now costs
 * one file, which the retry above can absorb, rather than the entire upload.
 *
 * Returns the byte total, because the worker no longer counts it: nothing it receives sees the
 * whole book any more.
 */
async function uploadAdtFiles(
  client: PublishWorkerClient,
  token: string,
  version: number,
  bookDir: string,
  emit: PublishEmit,
  sleep: (ms: number) => Promise<void>,
): Promise<number> {
  const adtDir = path.join(bookDir, "adt")
  const files = adtFilePaths(adtDir)
  if (files.length === 0) {
    throw new PublishStepError(
      "package_failed",
      "package",
      "The web export directory is empty — run the pipeline for this book first",
    )
  }

  let uploaded = 0
  let bytes = 0
  let cursor = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor
      cursor += 1
      const relative = files[index]
      if (relative === undefined) return

      const body = fs.readFileSync(path.join(adtDir, relative))
      /** Retried per file, which is the point of sending them separately: one refusal costs one
       *  file and is usually gone a second later, where the same refusal used to discard the
       *  whole book. Non-retryable answers — a file over the per-entry limit, a bad secret —
       *  still fail immediately, and `uploadWithRetry` turns them into a `PublishStepError` so
       *  the step reports them like any other upload failure. */
      const result = await uploadWithRetry(
        () => client.uploadFile(token, version, relative, body),
        emit,
        sleep,
      )
      bytes += result.bytes
      uploaded += 1
      /** Named rather than counted alone: on a slow connection this is the longest step by far,
       *  and a number that only goes up says less than the file it is working on. */
      await emit(
        stepEvent("upload", "running", {
          message: `${uploaded} of ${files.length} files`,
        }),
      )
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker),
  )
  return bytes
}

/**
 * How much there is to send, without building anything.
 *
 * There is deliberately no whole-book ceiling any more. The old one was not a policy but a
 * transport fact — Cloudflare measures a *request body* against the account plan's 100 MB — and
 * with each file travelling in its own request that number stops applying. What still binds is
 * per file, and the worker enforces it. A book that used to be refused for its narration can now
 * be published with it.
 */
function measureAdtBundle(bookDir: string): { files: number; bytes: number } {
  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throw new PublishStepError(
      "package_failed",
      "package",
      "The web export directory is missing — run the pipeline for this book first",
    )
  }
  const paths = adtFilePaths(adtDir)
  const bytes = paths.reduce(
    (total, relative) => total + fs.statSync(path.join(adtDir, relative)).size,
    0,
  )
  return { files: paths.length, bytes }
}

export interface PublishExportOptions {
  label: string
  booksDir: string
  webAssetsDir: string
  configPath?: string
  prepareExportFn?: typeof prepareExport
  /** What to leave out of the snapshot. Absent publishes the whole book, so nothing that omits
   *  it changes behaviour — packaging has honoured these flags all along and the publish path
   *  simply never passed any. Shared with "Update site": a book first published without its
   *  narration would otherwise balloon back over the transport cap on its next update. */
  features?: PublishFeatureSelection
}

export interface PublishSnapshot {
  pageManifest: PublicationPageEntryType[]
  title: string
}

export type PublishEmit = (event: PublishProgressEvent) => Promise<void>

function stepEvent(
  id: PublishStepId,
  status: "running" | "done" | "error",
  extra: { message?: string; error?: string } = {},
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
  /** Measured, not zipped. The zip existed to be the request body; now that files travel one at
   *  a time there is nothing to compress, and compressing a 673 MB book to report a number in a
   *  progress line would be the slowest step in the publish. */
  const measured = measureAdtBundle(bookDir)
  await emit(
    stepEvent("package", "done", {
      message: `${pageManifest.length} pages, ${measured.files} files, ${Math.round(
        measured.bytes / 1024,
      )} kB`,
    }),
  )

  return {
    pageManifest,
    title: readBookTitle(safeLabel, path.resolve(options.booksDir)),
  }
}

/** Injected so a test can exercise the retry without waiting out the backoff. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface PublishBookOptions extends PublishExportOptions {
  connection: CloudflareConnectionRecord
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

function clientFor(options: PublishBookOptions, fetchFn?: never): PublishWorkerClient {
  if (options.createClient) return options.createClient(options.connection)
  return createPublishWorkerClient({
    workerUrl: options.connection.worker_url,
    mgmtSecret: options.connection.mgmt_secret,
    ...(fetchFn === undefined ? {} : { fetchFn }),
  })
}

/** Attempts, including the first. Three is enough to ride out an edge hiccup and few enough
 *  that a genuinely broken account fails while the author is still watching. */
const UPLOAD_ATTEMPTS = 3

const UPLOAD_BACKOFF_MS = [1_000, 3_000]

/**
 * Whether this failure is worth trying again.
 *
 * A 5xx is the worker or the edge in trouble, not the request: the same bytes may well be
 * accepted a second later, and 503 in particular is Cloudflare saying "not now" rather than
 * "not this". Unreachable is the same story one layer down. Everything else — a rejected zip, a
 * payload over the cap, a bad secret — will fail identically however many times it is sent, and
 * retrying it only makes the author wait longer for the same answer.
 */
function isRetryableUpload(error: unknown): boolean {
  if (!isPublishWorkerError(error)) return false
  if (error.unreachable) return true
  return error.status !== null && error.status >= 500
}

/**
 * The upload, retried.
 *
 * A snapshot costs a full export to produce, and one 503 used to throw all of it away and ask
 * the author to start again — which they did, by hand, at the same odds. The bytes are already
 * in memory, so trying again is nearly free, and the step reports it rather than appearing to
 * hang.
 */
async function uploadWithRetry<T>(
  attempt: () => Promise<T>,
  emit: PublishEmit,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  let lastError: unknown
  for (let index = 0; index < UPLOAD_ATTEMPTS; index += 1) {
    try {
      return await attempt()
    } catch (error) {
      lastError = error
      const final = index === UPLOAD_ATTEMPTS - 1
      if (final || !isRetryableUpload(error)) break
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

export async function publishBook(options: PublishBookOptions): Promise<PublishBookResult> {
  const emit = options.emit
  const now = options.now ?? (() => new Date())
  const built = await buildSnapshot(options, emit)
  /** Read after the build, not after the upload: it has to describe the content that went into
   *  the snapshot, and a big book can be uploading for minutes while the author keeps editing. */
  const contentRevision = readContentRevision(options.label, options.booksDir)
  const token = (options.generateToken ?? mintPublicationToken)()
  const client = clientFor(options)

  await emit(stepEvent("upload", "running"))
  /** Inside the same patched window the zip used to be built in: `withPublishConfig` turns on
   *  `features.comments` for the duration and puts the author's own config back afterwards, so
   *  uploading outside it would publish a book with commenting quietly switched off. */
  const { bookDir } = requireBook(options.label, options.booksDir)
  const snapshotBytes = await withPublishConfig(bookDir, () =>
    uploadAdtFiles(client, token, 1, bookDir, emit, options.sleep ?? delay),
  )

  const created = await uploadWithRetry(
    () =>
      client.createPublication({
        token,
        title: built.title,
        book_label: parseBookLabel(options.label),
        page_manifest: built.pageManifest,
        snapshot_bytes: snapshotBytes,
        ...(options.expiresAt === undefined ? {} : { expires_at: options.expiresAt }),
        ...(options.accessCode ? { access_code: options.accessCode } : {}),
      }),
    emit,
    options.sleep ?? delay,
  )
  await emit(stepEvent("upload", "done"))

  await emit(stepEvent("register", "running"))
  const record: BookPublicationRecord = {
    token,
    base_url: created.url,
    worker_url: options.connection.worker_url,
    created_at: created.publication.created_at,
    expires_at: created.publication.expires_at,
    revoked_at: created.publication.revoked_at,
    versions: [
      {
        version: created.version.version,
        published_at: created.version.created_at,
        page_count: built.pageManifest.length,
        content_revision: contentRevision,
      },
    ],
    access_code: options.accessCode ?? null,
    has_access_code: created.has_access_code,
    deleted_at: null,
    features: options.features ?? null,
  }
  savePublicationRecord(options.label, options.booksDir, record)
  await emit(stepEvent("register", "done"))

  await emit({
    type: "complete",
    publication: created.publication,
    version: created.version,
    url: created.url,
  })

  return { publication: created.publication, version: created.version, url: created.url, record }
}

export interface RepublishBookOptions extends PublishBookOptions {
  record: BookPublicationRecord
}

export async function republishBook(
  options: RepublishBookOptions,
): Promise<PublishBookResult> {
  const emit = options.emit
  /** Repeat whatever the first publish left out, unless this call says otherwise. A book that
   *  fits under the cap only because its narration was excluded would otherwise fail on update
   *  at the same wall the exclusion existed to avoid — after the author had already waited
   *  through a full export. */
  const built = await buildSnapshot(
    { ...options, features: options.features ?? options.record.features ?? undefined },
    emit,
  )
  const contentRevision = readContentRevision(options.label, options.booksDir)
  const client = clientFor(options)

  await emit(stepEvent("upload", "running"))
  /** The worker owns the version counter, so it is read rather than guessed: writing to the
   *  wrong prefix would leave the files where nothing will ever serve them. Two publishes racing
   *  still collide, and `addVersion` refuses the loser rather than overwriting the winner. */
  const current = await client.getPublication(options.record.token)
  const nextVersion = current.publication.current_version + 1
  const { bookDir: updateDir } = requireBook(options.label, options.booksDir)
  const snapshotBytes = await withPublishConfig(updateDir, () =>
    uploadAdtFiles(
      client,
      options.record.token,
      nextVersion,
      updateDir,
      emit,
      options.sleep ?? delay,
    ),
  )

  const created = await uploadWithRetry(
    () =>
      client.createVersion(options.record.token, built.pageManifest, {
        snapshot_bytes: snapshotBytes,
      }),
    emit,
    options.sleep ?? delay,
  )
  await emit(stepEvent("upload", "done"))

  await emit(stepEvent("register", "running"))
  const record: BookPublicationRecord = {
    ...options.record,
    expires_at: created.publication.expires_at,
    revoked_at: created.publication.revoked_at,
    versions: [
      ...options.record.versions.filter(
        (version) => version.version !== created.version.version,
      ),
      {
        version: created.version.version,
        published_at: created.version.created_at,
        page_count: built.pageManifest.length,
        content_revision: contentRevision,
      },
    ].sort((a, b) => a.version - b.version),
  }
  savePublicationRecord(options.label, options.booksDir, record)
  await emit(stepEvent("register", "done"))

  await emit({
    type: "complete",
    publication: created.publication,
    version: created.version,
    url: options.record.base_url,
  })

  return {
    publication: created.publication,
    version: created.version,
    url: options.record.base_url,
    record,
  }
}

export function toPublishErrorEvent(error: unknown): PublishProgressEvent {
  if (isPublishStepError(error)) {
    return { type: "error", code: error.code, message: error.message, step_id: error.stepId }
  }
  return {
    type: "error",
    code: "upload_failed",
    message: describe(error),
    step_id: null,
  }
}

export { stepEvent as publishStepEvent }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function describeHttp(error: unknown): string {
  if (error instanceof HTTPException) return error.message
  return describe(error)
}
