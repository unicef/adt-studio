import type { Context, Env as HonoEnv } from "hono"
import { publicationStateAt, type Publication, type PublishComment, type RoomCommentEvent, type RoomCommentFrame } from "@adt/types"
import type { Env } from "./env.js"
import { ROOM_READERS_HEADER } from "./room.js"

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
export function notifyRoom<E extends HonoEnv>(
  c: Context<E>,
  publication: Publication,
  event: RoomCommentEvent,
  comment: PublishComment,
): void {
  const namespace = (c.env as Env | undefined)?.PUBLICATION_ROOM
  if (!namespace) return

  const frame: RoomCommentFrame = { t: event, comment }
  /** The author can still write to a revoked or expired book; only the author hears it. */
  const readersAllowed = publicationStateAt(publication) === "active"
  const delivery = deliver(namespace, publication.token, frame, readersAllowed)

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
): Promise<void> {
  try {
    const stub = namespace.get(namespace.idFromName(token))
    await stub.fetch("https://publication-room.invalid/notify", {
      method: "POST",
      headers: { "content-type": "application/json", [ROOM_READERS_HEADER]: readersAllowed ? "1" : "0" },
      body: JSON.stringify(frame),
    })
  } catch {
    /** A dead room is not a failed comment. */
  }
}

/**
 * Closes every reader's socket in a book's room, after a change that may have ended their access:
 * revoked, deleted, a new code or a new expiry. Awaited, so readers are gone before the change's
 * response returns; readers still allowed simply reconnect. Never fails the change itself.
 */
export async function evictRoomReaders(env: Env | undefined, token: string): Promise<void> {
  const namespace = env?.PUBLICATION_ROOM
  if (!namespace) return
  /** Twice, because a reader left connected after a revoke is the failure this exists to stop;
   *  a room still unreachable after that has, for practical purposes, nobody in it. */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const stub = namespace.get(namespace.idFromName(token))
      const response = await stub.fetch("https://publication-room.invalid/evict", { method: "POST" })
      if (response.ok) return
    } catch {
      /** Try once more. */
    }
  }
}

