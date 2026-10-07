import { ATTEMPT_WINDOW_SECONDS, clientHandle } from "./access-throttle.js"
import type { PublicationStore, WriteKind } from "./store.js"

/**
 * Writes a reader may make at one book in `ATTEMPT_WINDOW_SECONDS`. Every book shares one D1
 * database, so without a ceiling one reader could fill it for all of them. Sized well above a
 * reviewer's pace: one comment every fifteen seconds for a quarter of an hour per name, and a
 * classroom behind one address writing together.
 */
export const WRITE_LIMITS = {
  "comment-session": 60,
  "comment-client": 400,
  "session-client": 100,
} as const satisfies Record<WriteKind, number>

/**
 * What readers may store at one book, ever. The rates above only slow a reader down; these
 * stop one book's link from filling the database every other book lives in. Far past a
 * classroom's review, and the author is never counted.
 */
export const BOOK_READER_COMMENT_LIMIT = 2000
export const BOOK_READER_SESSION_LIMIT = 500

/** Long enough for the oldest counted write to start leaving the window. */
const WRITE_RETRY_AFTER_SECONDS = 60

export interface WriteAllowanceDeps {
  store: PublicationStore
  secret: string
  ip: string
  token: string
  now: Date
  sessionId?: string
}

/**
 * `Retry-After` seconds when one of the caller's counters is full, otherwise `null` once this
 * write has been counted. Counted only when allowed, unlike the code doors: a refused write
 * stores nothing, and recording it would let one hammering reader keep a whole classroom's
 * shared address shut. A race can overshoot a limit by the requests in flight, which is fine
 * for a ceiling on storage.
 */
export async function writeAllowance(
  deps: WriteAllowanceDeps,
  kinds: { client: WriteKind; session?: WriteKind },
): Promise<number | null> {
  const client = await clientHandle(deps.ip, deps.secret)
  const since = new Date(deps.now.getTime() - ATTEMPT_WINDOW_SECONDS * 1000).toISOString()
  const entries: Array<{ client: string; kind: WriteKind }> = [{ client, kind: kinds.client }]
  if (kinds.session !== undefined && deps.sessionId !== undefined) {
    entries.push({ client: `session:${deps.sessionId}`, kind: kinds.session })
  }

  for (const entry of entries) {
    const count = await deps.store.countWrites({ token: deps.token, client: entry.client, kind: entry.kind, since })
    if (count >= WRITE_LIMITS[entry.kind]) return WRITE_RETRY_AFTER_SECONDS
  }

  await deps.store.recordWrites({ token: deps.token, entries, at: deps.now.toISOString() })
  return null
}
