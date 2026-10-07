import type { Context } from "hono"
import { publicationStateAt, type Publication, type PublishComment, type RoomCommentEvent, type RoomCommentFrame } from "@adt/types"
import type { Env } from "./env.js"
import type { PublicationVariables } from "./middleware/publication-lookup.js"
import { ROOM_CODE_HEADER, ROOM_READERS_HEADER } from "./room.js"

/**
 * Comment writes tell the room after D1 has committed.
 *
 * Two properties are load-bearing:
 *
 * - **After the commit.** A client that missed frames recovers by re-listing, so a frame must
 *   never describe a row that a failed transaction would have taken back.
 * - **Fire and forget.** A room that is unreachable, full, hibernating or simply empty must not
 *   be able to fail a reviewer's comment. The notification is handed to `waitUntil` and its
 *   result is never read; when there is no `ExecutionContext` (the route-shape suite calls the
 *   app directly) the promise is detached with its rejection swallowed instead.
 */
export function notifyRoom(
  c: Context<{ Bindings: Env; Variables: PublicationVariables }>,
  publication: Publication,
  event: RoomCommentEvent,
  comment: PublishComment,
): void {
  const namespace = (c.env as Env | undefined)?.PUBLICATION_ROOM
  if (!namespace) return

  const frame: RoomCommentFrame = { t: event, comment }
  /** The author can still write to a revoked or expired book; only the author hears it. */
  const readersAllowed = publicationStateAt(publication) === "active"
  const delivery = deliver(namespace, publication.token, frame, readersAllowed, c.get("accessCodeHash") ?? "")

  try {
    c.executionCtx.waitUntil(delivery)
  } catch {
    void delivery
  }
}

async function deliver(
  namespace: DurableObjectNamespace,
  token: string,
  frame: RoomCommentFrame,
  readersAllowed: boolean,
  accessCode: string,
): Promise<void> {
  try {
    const stub = namespace.get(namespace.idFromName(token))
    await stub.fetch("https://publication-room.invalid/notify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [ROOM_READERS_HEADER]: readersAllowed ? "1" : "0",
        [ROOM_CODE_HEADER]: accessCode,
      },
      body: JSON.stringify(frame),
    })
  } catch {
    /** A dead room is not a failed comment. */
  }
}

/** Pauses before each background attempt, once the change has already answered. */
export const EVICT_RETRY_DELAYS_MS = [1_000, 4_000, 10_000]

/**
 * Closes every reader's socket in a book's room, after a change that may have ended their access:
 * revoked, deleted, a new code or a new expiry. Awaited, so readers are gone before the change's
 * response returns; readers still allowed simply reconnect. Never fails the change itself.
 *
 * Two attempts inline. If the room still can't be reached, `later` keeps trying after the
 * response: the next comment would close a stale reader anyway, but a book nobody comments on
 * would otherwise leave them watching the roster and cursors indefinitely.
 */
export async function evictRoomReaders(
  env: Env | undefined,
  token: string,
  later?: (work: Promise<unknown>) => void,
  retryDelaysMs: readonly number[] = EVICT_RETRY_DELAYS_MS,
): Promise<void> {
  const namespace = env?.PUBLICATION_ROOM
  if (!namespace) return
  const attempt = async (): Promise<boolean> => {
    try {
      const stub = namespace.get(namespace.idFromName(token))
      return (await stub.fetch("https://publication-room.invalid/evict", { method: "POST" })).ok
    } catch {
      return false
    }
  }
  if ((await attempt()) || (await attempt())) return
  later?.(
    (async () => {
      for (const delay of retryDelaysMs) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        if (await attempt()) return
      }
    })(),
  )
}

