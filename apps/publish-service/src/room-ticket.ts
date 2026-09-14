import { PUBLICATION_ROOM_TICKET_TTL_SECONDS } from "@adt/types"
import { constantTimeEqual, hmacTag, randomId } from "./identity.js"

/**
 * The author's room credential.
 *
 * The Studio runs on the author's own machine, on a different origin from their worker, so it
 * cannot present the worker's cookies — and `MGMT_SECRET` must never reach a browser. A ticket
 * is the narrow substitute: an HMAC over this publication's token, an expiry and a nonce,
 * handed out by the `MGMT_SECRET`-authenticated management route and spent once, seconds later,
 * as a query parameter on the WebSocket upgrade.
 *
 * Nothing is stored. Verification is one HMAC, so a room join costs no D1 round trip, and
 * rotating `MGMT_SECRET` invalidates every outstanding ticket for free. Within its 60-second
 * window a ticket is replayable — accepted deliberately: all it buys is a seat in a room whose
 * only powers are seeing cursors and hearing comment events the holder could already read
 * through the link. It grants no write of any kind.
 */

const TICKET_VERSION = "v1"

const TICKET_SEPARATOR = "."

const NONCE_BYTES = 9

function payloadOf(token: string, expiresAtSeconds: number, nonce: string): string {
  return `room-ticket:${token}:${expiresAtSeconds}:${nonce}`
}

export interface SignedRoomTicket {
  ticket: string
  /** ISO-8601, for the response body and for a client that wants to re-ticket ahead of time. */
  expiresAt: string
}

export async function signRoomTicket(
  token: string,
  secret: string,
  now: Date = new Date(),
  ttlSeconds: number = PUBLICATION_ROOM_TICKET_TTL_SECONDS,
): Promise<SignedRoomTicket> {
  const expiresAtSeconds = Math.floor(now.getTime() / 1000) + ttlSeconds
  const nonce = randomId(NONCE_BYTES)
  const tag = await hmacTag(payloadOf(token, expiresAtSeconds, nonce), secret)
  return {
    ticket: [TICKET_VERSION, String(expiresAtSeconds), nonce, tag].join(TICKET_SEPARATOR),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  }
}

/**
 * Constant-time in the part that matters: the HMAC is always computed and always compared with
 * `constantTimeEqual`, so a near-miss tag takes the same time as a wild one. Structural
 * rejections (wrong version, unparseable expiry) are not secret — they carry no information an
 * attacker does not already have from the format.
 */
export async function verifyRoomTicket(
  ticket: string | null | undefined,
  token: string,
  secret: string | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if (!ticket || secret === undefined) return false

  const parts = ticket.split(TICKET_SEPARATOR)
  if (parts.length !== 4) return false

  const [version, rawExpiry, nonce, tag] = parts as [string, string, string, string]
  if (version !== TICKET_VERSION) return false

  const expiresAtSeconds = Number(rawExpiry)
  if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds <= 0) return false
  if (nonce.length === 0) return false

  const expected = await hmacTag(payloadOf(token, expiresAtSeconds, nonce), secret)
  if (!constantTimeEqual(tag, expected)) return false

  return expiresAtSeconds * 1000 > now.getTime()
}
