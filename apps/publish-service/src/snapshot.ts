import { Unzip, UnzipInflate } from "fflate"

export type SnapshotUnpackErrorCode = "invalid_request" | "payload_too_large"

export class SnapshotUnpackError extends Error {
  readonly code: SnapshotUnpackErrorCode

  constructor(code: SnapshotUnpackErrorCode, message: string) {
    super(message)
    this.name = "SnapshotUnpackError"
    this.code = code
  }
}

export function isSnapshotUnpackError(error: unknown): error is SnapshotUnpackError {
  return error instanceof SnapshotUnpackError
}

export interface SnapshotLimits {
  maxEntries: number
  maxEntryBytes: number
  maxTotalBytes: number
}

/** The compressed cap is `PUBLICATION_SNAPSHOT_MAX_BYTES`; these bound what a zip can
 *  expand into, so a zip bomb cannot exhaust the worker's 128 MB heap or the bucket. */
export const SNAPSHOT_LIMITS: SnapshotLimits = {
  maxEntries: 20_000,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
}

const UNSAFE_SEGMENT = /^(\.|\.\.)$/

/** Returns the safe relative key for a zip entry, or `null` when the entry escapes the
 *  snapshot prefix (zip slip), is absolute, or carries a Windows drive / device path. */
export function normalizeSnapshotPath(raw: string): string | null {
  if (raw.length === 0) return null
  if (raw.includes("\\")) return null
  if (raw.includes("\0")) return null
  if (raw.startsWith("/")) return null
  if (/^[A-Za-z]:/.test(raw)) return null

  const segments = raw.split("/")
  if (segments.some((segment) => segment.length === 0 || UNSAFE_SEGMENT.test(segment))) {
    return null
  }

  return segments.join("/")
}

export interface UnpackSnapshotOptions {
  bucket: R2Bucket
  /** R2 key prefix without a trailing slash, e.g. `<token>/v1`. */
  prefix: string
  zip: ReadableStream<Uint8Array>
  limits?: SnapshotLimits
}

export interface UnpackSnapshotResult {
  fileCount: number
  totalBytes: number
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  if (chunks.length === 1) return chunks[0] as Uint8Array
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * Streams a zip straight into R2, one entry at a time.
 *
 * Workers have no native unzip and ~128 MB of memory, so neither the zip nor the
 * expanded tree is ever held whole: the upload body is read in chunks, fflate's
 * streaming `Unzip` emits each entry as it inflates, and the entry is written to R2 the
 * moment it completes. Uploads started while decoding one source chunk are awaited
 * before the next chunk is pushed, which is what keeps the queue of finished-but-
 * unwritten entries bounded rather than growing with the archive.
 */
export async function unpackSnapshotToR2({
  bucket,
  prefix,
  zip,
  limits = SNAPSHOT_LIMITS,
}: UnpackSnapshotOptions): Promise<UnpackSnapshotResult> {
  const unzip = new Unzip()
  unzip.register(UnzipInflate)

  let failure: SnapshotUnpackError | null = null
  let fileCount = 0
  let totalBytes = 0
  let pending: Array<Promise<unknown>> = []

  const fail = (code: SnapshotUnpackErrorCode, message: string): void => {
    failure ??= new SnapshotUnpackError(code, message)
  }

  unzip.onfile = (file) => {
    if (failure) return
    if (file.name.endsWith("/")) return

    const relative = normalizeSnapshotPath(file.name)
    if (relative === null) {
      fail("invalid_request", `Snapshot contains an unsafe entry path: ${file.name}`)
      return
    }

    fileCount += 1
    if (fileCount > limits.maxEntries) {
      fail("payload_too_large", `Snapshot contains more than ${limits.maxEntries} files`)
      return
    }

    let chunks: Uint8Array[] = []
    let size = 0

    file.ondata = (error, chunk, final) => {
      if (failure) return
      if (error) {
        fail("invalid_request", `Snapshot is not a readable zip: ${error.message}`)
        return
      }

      size += chunk.length
      totalBytes += chunk.length
      if (size > limits.maxEntryBytes) {
        fail("payload_too_large", `Snapshot entry ${relative} exceeds ${limits.maxEntryBytes} bytes`)
        return
      }
      if (totalBytes > limits.maxTotalBytes) {
        fail("payload_too_large", `Snapshot expands to more than ${limits.maxTotalBytes} bytes`)
        return
      }

      chunks.push(chunk.slice())

      if (final) {
        const body = concat(chunks, size)
        chunks = []
        pending.push(bucket.put(`${prefix}/${relative}`, body))
      }
    }

    file.start()
  }

  const drain = async (): Promise<void> => {
    if (pending.length === 0) return
    const inFlight = pending
    pending = []
    await Promise.all(inFlight)
  }

  const reader = zip.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      try {
        unzip.push(value, false)
      } catch (error) {
        fail("invalid_request", `Snapshot is not a readable zip: ${describe(error)}`)
      }
      if (failure) break
      await drain()
    }

    if (!failure) {
      try {
        unzip.push(new Uint8Array(0), true)
      } catch (error) {
        fail("invalid_request", `Snapshot is not a readable zip: ${describe(error)}`)
      }
      await drain()
    }
  } finally {
    reader.releaseLock()
  }

  await drain()

  if (failure) throw failure
  if (fileCount === 0) {
    throw new SnapshotUnpackError("invalid_request", "Snapshot zip contains no files")
  }

  return { fileCount, totalBytes }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** R2 accepts at most 1000 keys per delete call. */
const DELETE_BATCH = 1000

/**
 * Removes every object a publication ever wrote — all versions, not just the current one.
 *
 * Paginates rather than assuming one listing covers the book: `list` truncates at 1000 keys
 * and a picture-heavy book passes that in a single version. Stopping early would leave the
 * remainder billed to the author's own bucket forever, with nothing left in D1 pointing at it.
 */
export async function deleteSnapshotObjects(
  bucket: R2Bucket,
  token: string,
): Promise<number> {
  let cursor: string | undefined
  let deleted = 0

  for (;;) {
    const listed = await bucket.list({ prefix: `${token}/`, cursor, limit: DELETE_BATCH })
    const keys = listed.objects.map((object) => object.key)
    if (keys.length > 0) {
      await bucket.delete(keys)
      deleted += keys.length
    }
    if (!listed.truncated) return deleted
    cursor = listed.cursor
  }
}
