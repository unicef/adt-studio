import type { Context, Hono } from "hono"
import {
  PUBLICATION_ROOM_TAB_PARAM,
  PUBLICATION_ROOM_TAB_PATTERN,
  PUBLICATION_ROOM_TICKET_PARAM,
  PUBLISH_ANONYMOUS_COLOR,
  PUBLISH_ANONYMOUS_NAME,
  PUBLISH_AUTHOR_COLOR,
  PUBLISH_AUTHOR_DEFAULT_NAME,
  PublicationToken,
  type PublicationRoomTicketResponse,
  type RoomPeer,
} from "@adt/types"
import { accessGranted } from "./access.js"
import type { Env } from "./env.js"
import { errorResponse } from "./errors.js"
import { randomId } from "./identity.js"
import type { PublicationVariables } from "./middleware/publication-lookup.js"
import { ROOM_PEER_HEADER } from "./room.js"
import { signRoomTicket, verifyRoomTicket } from "./room-ticket.js"
import { commenterFromCookie, type SessionDeps } from "./sessions.js"

export type RoomAppEnv = { Bindings: Env; Variables: PublicationVariables }

type RoomContext = Context<RoomAppEnv>

export type RoomRoutesDeps = SessionDeps

const MISSING_SECRET_MESSAGE =
  "This worker has no MGMT_SECRET bound, so it cannot run realtime rooms"

const NO_ROOM_BINDING_MESSAGE = "This worker has no PUBLICATION_ROOM binding"

/** `wss` for a deployed worker, `ws` for `wrangler dev` over plain http. */
function socketUrl(c: RoomContext, token: string): string {
  const url = new URL(c.req.url)
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:"
  url.search = ""
  url.hash = ""
  url.pathname = `/p/${token}/room`
  return url.toString()
}

/**
 * Who is on the other end of this socket, decided entirely server-side.
 *
 * The `hello` frame deliberately carries no name: a client that could name itself could name
 * itself somebody else, and a cursor with a borrowed name beside it is worse than an anonymous
 * one. A reviewer is whoever their `adt_pub_session` cookie says they are; a reader who has
 * never commented has no session and joins as an unnamed peer, because a room that hides the
 * people in it is lying about how private the reading is.
 */
/**
 * The peer id: who they are, plus which of their tabs.
 *
 * Identity comes from the connection's own credentials and never from the request, so a client
 * cannot borrow another reader's row by asking for it. The tab *is* the client's to choose,
 * because only the client knows which of its windows this is — and the worst it can do with
 * that is split or merge its own tabs.
 *
 * A client that sends no tab falls back to a fresh random id, which is exactly the old
 * behaviour: a reader on a snapshot published before this existed keeps working, they simply
 * keep blinking out of the roster on every page turn.
 */
function peerIdFor(c: RoomContext, identity: string): string {
  const raw = c.req.query(PUBLICATION_ROOM_TAB_PARAM)
  if (!raw || !PUBLICATION_ROOM_TAB_PATTERN.test(raw)) return randomId(9)
  return `${identity}.${raw}`
}

async function peerFor(
  c: RoomContext,
  deps: RoomRoutesDeps,
  token: string,
  isAuthor: boolean,
): Promise<RoomPeer> {
  if (isAuthor) {
    const store = deps.resolveStore(c.env)
    const session = await store.findAuthorSession(token)
    return {
      id: peerIdFor(c, session?.id ?? `author-${token}`),
      name: session?.name ?? PUBLISH_AUTHOR_DEFAULT_NAME,
      color: session?.color ?? PUBLISH_AUTHOR_COLOR,
      is_author: true,
      page_section_id: null,
      /** Overwritten by the client's first `hello`; a peer who never reports one is reading at
       *  full width, which is what everybody who has not touched the preview is doing. */
      device: "full",
    }
  }

  const commenter = await commenterFromCookie(c, deps.resolveStore(c.env), token)
  return {
    /** An unnamed reader has no server-side identity to key on, so the tab carries it alone.
     *  Two anonymous readers who chose the same tab would share a row — harmless, since an
     *  anonymous peer has no name and nothing attributed to it, and tab ids are random. */
    id: peerIdFor(c, commenter?.id ?? "anon"),
    name: commenter?.name ?? PUBLISH_ANONYMOUS_NAME,
    color: commenter?.color ?? PUBLISH_ANONYMOUS_COLOR,
    is_author: false,
    page_section_id: null,
    device: "full",
  }
}

export function registerRoomRoutes(app: Hono<RoomAppEnv>, deps: RoomRoutesDeps): void {
  /**
   * The author's join credential. Behind `mgmtAuth` like every other `/api/*` route, and
   * deliberately *not* behind the publication lookup: minting a ticket for a revoked link is
   * correct, because draining feedback from a killed link is the whole author carve-out (§4.7).
   */
  app.post("/api/publications/:token/room-ticket", async (c) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "invalid_request", 400, token.error.message)
    }

    const secret = c.env?.MGMT_SECRET
    if (!secret) {
      return errorResponse(c, "internal_error", 500, MISSING_SECRET_MESSAGE)
    }

    const store = deps.resolveStore(c.env)
    if (!(await store.findByToken(token.data))) {
      return errorResponse(c, "not_found", 404)
    }

    const signed = await signRoomTicket(token.data, secret, new Date(deps.timestamp()))
    const body: PublicationRoomTicketResponse = {
      ticket: signed.ticket,
      ws_url: socketUrl(c, token.data),
      expires_at: signed.expiresAt,
    }
    return c.json(body)
  })

  /**
   * The socket. Registered *before* `accessGate` and enforcing admission itself, for the same
   * reason `POST /p/:token/access` is: a ticket is an alternative credential, and a middleware
   * that only understands the grant cookie would refuse the author before this handler ran.
   *
   * The 404/410 ladder still applies — the lookup middleware runs ahead of this — so a revoked
   * link has no room for its readers, while `MGMT_SECRET` and a ticket both pass.
   */
  app.get("/p/:token/room", async (c) => {
    const publication = c.get("publication")

    if ((c.req.header("upgrade") ?? "").toLowerCase() !== "websocket") {
      return errorResponse(
        c,
        "invalid_request",
        400,
        "GET /p/:token/room is a WebSocket endpoint",
      )
    }

    const namespace = c.env?.PUBLICATION_ROOM
    if (!namespace) {
      return errorResponse(c, "internal_error", 500, NO_ROOM_BINDING_MESSAGE)
    }

    const ticketed = await verifyRoomTicket(
      c.req.query(PUBLICATION_ROOM_TICKET_PARAM),
      publication.token,
      c.env?.MGMT_SECRET,
      new Date(deps.timestamp()),
    )

    if (!ticketed && !(await accessGranted(c))) {
      return errorResponse(c, "unauthorized", 401, "This book needs an access code")
    }

    const peer = await peerFor(c, deps, publication.token, ticketed || c.get("isAuthor"))

    /** A brand-new request, never the reader's own: this is what makes `ROOM_PEER_HEADER`
     *  unspoofable and `/notify` unreachable from outside the worker. */
    const stub = namespace.get(namespace.idFromName(publication.token))
    return stub.fetch("https://publication-room.invalid/connect", {
      headers: {
        upgrade: "websocket",
        /** Percent-encoded, because a header value must be ASCII: a reviewer called "João" or
         *  "婷婷" would otherwise be a non-conformant header that workerd tolerates and a
         *  browser's `fetch` rejects outright. Found by the two-browser run, not by a test. */
        [ROOM_PEER_HEADER]: encodeURIComponent(JSON.stringify(peer)),
      },
    })
  })
}
