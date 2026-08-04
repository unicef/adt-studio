import {
  PUBLICATION_ROOM_MAX_FRAME_BYTES,
  PUBLICATION_ROOM_MAX_PEERS,
  RoomClientFrame,
  RoomPeer,
  RoomServerFrame,
  type PublishErrorResponse,
  type RoomPeerCursorFrame,
  type RoomPresenceFrame,
} from "@adt/types"
import type { Env } from "./env.js"

/**
 * One realtime room per publication (M6).
 *
 * ## Hibernation
 *
 * The room keeps **no in-memory state at all**. Every peer's identity rides on its own socket
 * through `serializeAttachment`, and the roster is derived from `state.getWebSockets()` on
 * demand. That is what makes the WebSocket Hibernation API honest here: workerd may evict this
 * object between any two frames and reconstruct it on the next one, and nothing is lost —
 * there is no `Map` to rebuild, no timer to re-arm, no `blockConcurrencyWhile` to wait on. An
 * idle room with fifty readers holding sockets open costs nothing until somebody moves.
 *
 * There is no storage write and no alarm anywhere in this class. Cursors in particular are
 * relayed and forgotten: they are never attached, never stored, and never reach D1.
 *
 * ## Reachability
 *
 * `fetch` is only ever called through the namespace stub, which only the worker holds. The
 * public surface is `GET /p/:token/room`, which authenticates the connection and *then* builds
 * a fresh internal request — so `/notify` cannot be reached from outside, and the peer identity
 * header cannot be spoofed by a reader (their own header is dropped, never forwarded).
 */

const CONNECT_PATH = "/connect"

const NOTIFY_PATH = "/notify"

/** How the authenticated worker route hands a validated identity to the room. */
export const ROOM_PEER_HEADER = "x-adt-room-peer"

const CLOSE_GOING_AWAY = 1001

type PeerAttachment = RoomPeer

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function errorBody(error: PublishErrorResponse["error"], message: string): PublishErrorResponse {
  return { error, message }
}

export class PublicationRoom {
  private readonly state: DurableObjectState

  private readonly env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === CONNECT_PATH) return this.connect(request)
    if (pathname === NOTIFY_PATH) return this.notify(request)
    return json(errorBody("not_found", "Unknown room endpoint"), 404)
  }

  private connect(request: Request): Response {
    if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
      return json(errorBody("invalid_request", "Expected a WebSocket upgrade"), 400)
    }

    const peer = this.peerFrom(request)
    if (!peer) {
      return json(errorBody("invalid_request", "Malformed room peer"), 400)
    }

    const sockets = this.state.getWebSockets()
    if (sockets.length >= PUBLICATION_ROOM_MAX_PEERS) {
      return json(
        errorBody(
          "rate_limited",
          `This book already has ${PUBLICATION_ROOM_MAX_PEERS} people in its live session`,
        ),
        429,
      )
    }

    const pair = new WebSocketPair()
    const client = pair[0] as WebSocket
    const server = pair[1] as WebSocket

    /** Accept first, attach second: `getWebSockets()` has to be able to find this peer's
     *  identity the moment the presence broadcast below runs. */
    this.state.acceptWebSocket(server)
    server.serializeAttachment(peer)

    this.broadcastPresence()

    return new Response(null, { status: 101, webSocket: client })
  }

  private async notify(request: Request): Promise<Response> {
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return json(errorBody("invalid_request", "Expected a JSON frame"), 400)
    }

    const frame = RoomServerFrame.safeParse(payload)
    if (!frame.success) {
      return json(errorBody("invalid_request", frame.error.message), 400)
    }

    /** Comment events reach every peer, whatever page they are on: a reader's dock badge and
     *  the author's whole-publication panel both care about pages nobody is looking at. */
    for (const socket of this.state.getWebSockets()) {
      send(socket, frame.data)
    }

    return new Response(null, { status: 204 })
  }

  /** Hibernation entry point. Anything unparseable is dropped in silence — a peer cannot be
   *  told it is speaking nonsense without giving a malformed-frame flood a reply to amplify. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return
    if (message.length > PUBLICATION_ROOM_MAX_FRAME_BYTES) return

    let payload: unknown
    try {
      payload = JSON.parse(message)
    } catch {
      return
    }

    const parsed = RoomClientFrame.safeParse(payload)
    if (!parsed.success) return

    const peer = attachmentOf(ws)
    if (!peer) return

    const frame = parsed.data

    if (frame.t === "cursor") {
      const relay: RoomPeerCursorFrame = {
        t: "cursor",
        peer_id: peer.id,
        section_id: frame.section_id,
        selector: frame.selector,
        xOffsetPct: frame.xOffsetPct,
        yOffsetPct: frame.yOffsetPct,
      }
      /** Same page only. A cursor is a position inside a document; relaying it to somebody
       *  reading a different one would resolve the selector against the wrong DOM. */
      for (const socket of this.state.getWebSockets()) {
        if (socket === ws) continue
        if (attachmentOf(socket)?.page_section_id !== frame.section_id) continue
        send(socket, relay)
      }
      return
    }

    const section = frame.t === "hello" ? (frame.section_id ?? null) : frame.section_id
    if (peer.page_section_id === section) {
      /** `hello` still answers with a roster even when the page did not change: it is the
       *  frame a reconnecting client uses to re-learn who is here. */
      if (frame.t === "hello") this.broadcastPresence()
      return
    }

    ws.serializeAttachment({ ...peer, page_section_id: section })
    this.broadcastPresence()
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(closeCodeFor(code), reason)
    } catch {
      /** Already closing from the other end — nothing to complete. */
    }
    this.broadcastPresence(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(ws)
  }

  /**
   * The roster, re-derived from the live sockets every time. `exclude` is the socket whose
   * close is being handled: workerd may still list it, and a peer who just left must not
   * appear in the roster that announces their leaving.
   */
  private broadcastPresence(exclude?: WebSocket): void {
    const sockets = this.state.getWebSockets().filter((socket) => socket !== exclude)
    const entries = sockets.map((socket) => ({ socket, peer: attachmentOf(socket) }))
    const peers = entries.flatMap((entry) => (entry.peer ? [entry.peer] : []))

    for (const entry of entries) {
      if (!entry.peer) continue
      const frame: RoomPresenceFrame = { t: "presence", self_id: entry.peer.id, peers }
      send(entry.socket, frame)
    }
  }

  /** Percent-encoded on the way in (header values must be ASCII, and reviewer names are not). */
  private peerFrom(request: Request): PeerAttachment | null {
    const header = request.headers.get(ROOM_PEER_HEADER)
    if (!header) return null
    try {
      const parsed = RoomPeer.safeParse(JSON.parse(decodeURIComponent(header)))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}

function attachmentOf(socket: WebSocket): PeerAttachment | null {
  try {
    const parsed = RoomPeer.safeParse(socket.deserializeAttachment())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** A close code echoed back has to be one the runtime will accept; 1005 ("no status") and the
 *  reserved range below 1000 are not. */
function closeCodeFor(code: number): number {
  return code >= 1000 && code !== 1005 && code < 5000 ? code : CLOSE_GOING_AWAY
}

function send(socket: WebSocket, frame: unknown): void {
  try {
    socket.send(JSON.stringify(frame))
  } catch {
    /** A socket that died between the roster read and this send is not an error worth
     *  failing a comment POST or another peer's frame over. */
  }
}
