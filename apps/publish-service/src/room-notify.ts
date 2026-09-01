import type { Context, Env as HonoEnv } from "hono"
import type { PublishComment, RoomCommentEvent, RoomCommentFrame } from "@adt/types"
import type { Env } from "./env.js"

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
  token: string,
  event: RoomCommentEvent,
  comment: PublishComment,
): void {
  const namespace = (c.env as Env | undefined)?.PUBLICATION_ROOM
  if (!namespace) return

  const frame: RoomCommentFrame = { t: event, comment }
  const delivery = deliver(namespace, token, frame)

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
): Promise<void> {
  try {
    const stub = namespace.get(namespace.idFromName(token))
    await stub.fetch("https://publication-room.invalid/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(frame),
    })
  } catch {
    /** A dead room is not a failed comment. */
  }
}
