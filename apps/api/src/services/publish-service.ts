import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { createBookStorage } from "@adt/storage"
import {
  BookPublicationRecord as BookPublicationRecordSchema,
  PUBLICATION_SNAPSHOT_MAX_BYTES,
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
    return parsed.success ? parsed.data : null
  } finally {
    storage.close()
  }
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

async function zipAdtBundle(bookDir: string): Promise<Uint8Array> {
  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throw new PublishStepError(
      "package_failed",
      "package",
      "The web export directory is missing — run the pipeline for this book first",
    )
  }

  let buffer: ArrayBuffer
  try {
    buffer = await new Response(createZipStream(adtDir)).arrayBuffer()
  } catch (error) {
    throw new PublishStepError(
      "package_failed",
      "package",
      `Could not package the web export: ${describe(error)}`,
    )
  }

  const bytes = new Uint8Array(buffer)
  if (bytes.byteLength > PUBLICATION_SNAPSHOT_MAX_BYTES) {
    throw new PublishStepError(
      "snapshot_too_large",
      "package",
      `This book packages to ${bytes.byteLength} bytes, over the ${PUBLICATION_SNAPSHOT_MAX_BYTES} byte publish limit`,
    )
  }

  return bytes
}

export interface PublishExportOptions {
  label: string
  booksDir: string
  webAssetsDir: string
  configPath?: string
  prepareExportFn?: typeof prepareExport
}

export interface PublishSnapshot {
  pageManifest: PublicationPageEntryType[]
  snapshot: Uint8Array
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
    )
  } catch (error) {
    throw new PublishStepError("export_failed", "export", describeHttp(error))
  }
  await emit(stepEvent("export", "done"))

  await emit(stepEvent("package", "running"))
  const pageManifest = readPageManifest(bookDir)
  const snapshot = await withPublishConfig(bookDir, () => zipAdtBundle(bookDir))
  await emit(
    stepEvent("package", "done", {
      message: `${pageManifest.length} pages, ${Math.round(snapshot.byteLength / 1024)} kB`,
    }),
  )

  return {
    pageManifest,
    snapshot,
    title: readBookTitle(safeLabel, path.resolve(options.booksDir)),
  }
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
  let created
  try {
    created = await client.createPublication(
      {
        token,
        title: built.title,
        book_label: parseBookLabel(options.label),
        page_manifest: built.pageManifest,
        ...(options.expiresAt === undefined ? {} : { expires_at: options.expiresAt }),
        ...(options.accessCode ? { access_code: options.accessCode } : {}),
      },
      built.snapshot,
    )
  } catch (error) {
    throw uploadFailure(error)
  }
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
  const built = await buildSnapshot(options, emit)
  const contentRevision = readContentRevision(options.label, options.booksDir)
  const client = clientFor(options)

  await emit(stepEvent("upload", "running"))
  let created
  try {
    created = await client.createVersion(options.record.token, built.pageManifest, built.snapshot)
  } catch (error) {
    throw uploadFailure(error)
  }
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
