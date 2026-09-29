/** The per-file ceiling for an uploaded snapshot file. */
export interface SnapshotLimits {
  maxEntryBytes: number
}

/** One file at a time is the only upload protocol, so this bounds a single `PUT` body rather
 *  than what an archive could expand into. The whole-snapshot cap the Studio enforces before
 *  it starts uploading is `PUBLICATION_SNAPSHOT_MAX_BYTES`. */
export const SNAPSHOT_LIMITS: SnapshotLimits = {
  maxEntryBytes: 32 * 1024 * 1024,
}

const UNSAFE_SEGMENT = /^(\.|\.\.)$/

/** Returns the safe relative key for an uploaded file, or `null` when the path escapes the
 *  snapshot prefix, is absolute, or carries a Windows drive / device path. */
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


/** R2 accepts at most 1000 keys per delete call. */
const DELETE_BATCH = 1000

/**
 * Removes every object under a snapshot prefix.
 *
 * Pass a token to drop a whole publication, or `<token>/v<N>` to drop one version — a failed
 * version has to be cleaned without touching the live one beside it.
 *
 * Paginates rather than assuming one listing covers the book: `list` truncates at 1000 keys
 * and a picture-heavy book passes that in a single version. Stopping early would leave the
 * remainder billed to the author's own bucket forever, with nothing left in D1 pointing at it.
 */
export async function deleteSnapshotObjects(
  bucket: R2Bucket,
  prefix: string,
): Promise<number> {
  let cursor: string | undefined
  let deleted = 0

  for (;;) {
    const listed = await bucket.list({ prefix: `${prefix}/`, cursor, limit: DELETE_BATCH })
    const keys = listed.objects.map((object) => object.key)
    if (keys.length > 0) {
      await bucket.delete(keys)
      deleted += keys.length
    }
    if (!listed.truncated) return deleted
    cursor = listed.cursor
  }
}
