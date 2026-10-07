import {
  publicationStateAt,
  PUBLICATION_ROOM_MAX_FRAME_BYTES,
  PUBLICATION_ROOM_MAX_PEERS,
  RoomClientFrame,
  RoomPeer,
  RoomServerFrame,
  type PublishErrorResponse,
  type RoomPeerCursorFrame,
  type RoomPeerViewportFrame,
  type RoomPresenceFrame,
} from "@adt/types"
import { createD1PublicationStore } from "./d1-store.js"
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
 * The only storage is the alarm that closes readers when the book's end date arrives. Cursors
 * in particular are relayed and forgotten: they are never attached, never stored, and never
 * reach D1. The room reads D1 for one thing: whether the book still admits its readers, as a
 * reader joins and before a comment reaches them.
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

/** Internal: closes every reader's socket. Reachable only through the namespace stub, like
 *  `/notify`, so only the worker's own routes can call it. */
const EVICT_PATH = "/evict"

/** On `/connect`: when the publication stops admitting readers, so the room can close them then
 *  without a request to prompt it. */
export const ROOM_EXPIRES_HEADER = "x-adt-room-expires-at"

/** On a reader's `/connect`: the book and the access-code hash its grant was checked against.
 *  The room re-reads both before admitting the socket, so a join checked just before a revoke
 *  or a new code can't slip in after the sweep that closed everyone else. */
export const ROOM_TOKEN_HEADER = "x-adt-room-token"
export const ROOM_CODE_HEADER = "x-adt-room-code"

/** A reader's access ended — revoked, expired, a new code, or deleted. The reader reconnects as it
 *  does after any drop, and the door then decides: still allowed, it is back; not, it stays out. */
const CLOSE_ACCESS_CHANGED = 4403

const CLOSE_GOING_AWAY = 1001

/** On a reader's `/connect`: an HMAC of the caller's network, never the address itself. Kept in
 *  a socket tag rather than the peer, so it never reaches anybody's roster. */
export const ROOM_CLIENT_HEADER = "x-adt-room-client"

/** One network's share of the room. A classroom behind one address still fits; one client
 *  holding sockets open leaves the rest of the room to everybody else. */
export const ROOM_MAX_PEERS_PER_CLIENT = 32

/** The author joins outside the readers' cap, so a full room never shuts them out, with a
 *  bound of their own: a few Studio windows, not an unbounded number of sockets. */
export const ROOM_MAX_AUTHOR_PEERS = 8

/** On `/connect`: which room protocol the calling Worker speaks. A book host deployed before
 *  this one cannot vouch for who it admits — its ticket route was open and it served every book
 *  in the account — so the room refuses it until the host is updated. Only Worker code can set
 *  it: the room is reachable through its namespace binding alone. */
export const ROOM_PROTOCOL_HEADER = "x-adt-room-protocol"
export const ROOM_PROTOCOL = "2"

const AUTHOR_TAG = "author"
/** Which book a reader joined; every reader in a room carries the same one. */
const BOOK_TAG_PREFIX = "book:"
const READER_TAG = "reader"
const CLIENT_KEY_PATTERN = /^[0-9a-f]{1,64}$/

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
    if (pathname === EVICT_PATH) {
      this.evictReaders()
      return new Response(null, { status: 204 })
    }
    return json(errorBody("not_found", "Unknown room endpoint"), 404)
  }

  /** The book as it is now, against what the reader's door saw: still live, same code. */
  private async readerStillAdmitted(request: Request): Promise<boolean> {
    const token = request.headers.get(ROOM_TOKEN_HEADER)
    if (!token || !this.env.DB) return false
    const record = await createD1PublicationStore(this.env.DB).findRecord(token)
    if (!record || publicationStateAt(record.publication) !== "active") return false
    return (record.accessCode ?? "") === (request.headers.get(ROOM_CODE_HEADER) ?? "")
  }

  /**
   * The reader sockets the book admits right now: still live, joined under its current code.
   * `null` when the book can't be read: nobody is evicted on a database hiccup, but nobody but
   * the author is sent anything either, and readers recover by re-listing.
   */
  private async admittedReaders(): Promise<ReadonlySet<WebSocket> | null> {
    const readers = this.state.getWebSockets(READER_TAG)
    if (readers.length === 0) return new Set()
    const token = this.state
      .getTags(readers[0]!)
      .find((tag) => tag.startsWith(BOOK_TAG_PREFIX))
      ?.slice(BOOK_TAG_PREFIX.length)
    if (!token || !this.env.DB) return null
    try {
      const record = await createD1PublicationStore(this.env.DB).findRecord(token)
      if (!record || publicationStateAt(record.publication) !== "active") return new Set()
      return new Set(this.state.getWebSockets(await codeTag(record.accessCode ?? "")))
    } catch {
      return null
    }
  }

  /** The publication's expiry, set when a reader joined: readers go when it does. */
  async alarm(): Promise<void> {
    this.evictReaders()
  }

  /**
   * Closes every socket but the author's. Readers who are still allowed come straight back
   * through the door; the ones whose access ended stay out — so one rule covers revoke, a new
   * code, a changed expiry and delete without the room having to know which it was.
   */
  private evictReaders(keep: ReadonlySet<WebSocket> = new Set()): void {
    const closed: WebSocket[] = []
    for (const socket of this.state.getWebSockets()) {
      if (attachmentOf(socket)?.is_author || keep.has(socket)) continue
      try {
        socket.close(CLOSE_ACCESS_CHANGED, "Access to this book changed")
      } catch {
        /** Already gone. */
      }
      closed.push(socket)
    }
    if (closed.length === 0) return
    const remaining = this.state.getWebSockets().filter((socket) => !closed.includes(socket))
    const peers = remaining.flatMap((socket) => {
      const peer = attachmentOf(socket)
      return peer ? [peer] : []
    })
    for (const socket of remaining) {
      const peer = attachmentOf(socket)
      if (!peer) continue
      send(socket, { t: "presence", self_id: peer.id, peers } satisfies RoomPresenceFrame)
    }
  }

  private async connect(request: Request): Promise<Response> {
    if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
      return json(errorBody("invalid_request", "Expected a WebSocket upgrade"), 400)
    }

    if (request.headers.get(ROOM_PROTOCOL_HEADER) !== ROOM_PROTOCOL) {
      return json(
        errorBody("invalid_request", "This book's site needs an update before its live session can open"),
        426,
      )
    }

    /** Every join names its book, and only that book's room takes it: a host can never seat
     *  anybody in another book's room, whatever it believes it is serving. */
    const token = request.headers.get(ROOM_TOKEN_HEADER)
    if (!token || !this.env.PUBLICATION_ROOM.idFromName(token).equals(this.state.id)) {
      return json(errorBody("invalid_request", "This join is for another book's room"), 400)
    }

    const peer = this.peerFrom(request)
    if (!peer) {
      return json(errorBody("invalid_request", "Malformed room peer"), 400)
    }

    const clientKey = request.headers.get(ROOM_CLIENT_HEADER) ?? ""
    if (!peer.is_author && !CLIENT_KEY_PATTERN.test(clientKey)) {
      return json(errorBody("invalid_request", "Malformed room client"), 400)
    }
    const full = peer.is_author
      ? this.state.getWebSockets(AUTHOR_TAG).length >= ROOM_MAX_AUTHOR_PEERS
      : this.state.getWebSockets(READER_TAG).length >= PUBLICATION_ROOM_MAX_PEERS ||
        this.state.getWebSockets(clientTag(clientKey)).length >= ROOM_MAX_PEERS_PER_CLIENT
    if (full) {
      return json(
        errorBody("rate_limited", "This book's live session is full. Try again in a little while"),
        429,
      )
    }

    const pair = new WebSocketPair()
    const client = pair[0] as WebSocket
    const server = pair[1] as WebSocket

    /** Accept first, attach second: `getWebSockets()` has to be able to find this peer's
     *  identity the moment the presence broadcast below runs. */
    const tags = peer.is_author
      ? [AUTHOR_TAG]
      : [READER_TAG, clientTag(clientKey), await codeTag(request.headers.get(ROOM_CODE_HEADER) ?? ""), `${BOOK_TAG_PREFIX}${token}`]
    this.state.acceptWebSocket(server, tags)
    server.serializeAttachment(peer)

    /**
     * Accepted first, checked second: the book is re-read only once this socket is already in the
     * room. A join the door approved just before a revoke or a new code then can't slip past the
     * sweep — either this read sees the change and closes it, or the sweep that follows the change
     * finds it here and does.
     */
    if (!peer.is_author && !(await this.readerStillAdmitted(request))) {
      try {
        server.close(CLOSE_ACCESS_CHANGED, "Access to this book changed")
      } catch {
        /** Already gone. */
      }
      return new Response(null, { status: 101, webSocket: client })
    }

    const expiresAt = Date.parse(request.headers.get(ROOM_EXPIRES_HEADER) ?? "")
    if (!peer.is_author && Number.isFinite(expiresAt)) {
      const current = await this.state.storage.getAlarm()
      if (current === null || expiresAt < current) await this.state.storage.setAlarm(expiresAt)
    }

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

    /**
     * Comment events reach every peer, whatever page they are on: a reader's dock badge and the
     * author's whole-publication panel both care about pages nobody is looking at. But only
     * readers the book admits *now*: the room reads that itself rather than trusting the sender,
     * whose view of the book may predate a revoke or a new code, and which may be a host too old
     * to say. The author may still write to a revoked or expired book; only the author hears it.
     */
    const admitted = await this.admittedReaders()
    if (admitted !== null) this.evictReaders(admitted)

    for (const socket of this.state.getWebSockets()) {
      if (!attachmentOf(socket)?.is_author && !admitted?.has(socket)) continue
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

    /** Relayed on the same terms as a cursor, and for the same reason: it is a position inside
     *  one document, so it means nothing to somebody reading another. */
    if (frame.t === "viewport") {
      const relay: RoomPeerViewportFrame = {
        t: "viewport",
        peer_id: peer.id,
        section_id: frame.section_id,
        selector: frame.selector,
        xOffsetPct: frame.xOffsetPct,
        yOffsetPct: frame.yOffsetPct,
      }
      for (const socket of this.state.getWebSockets()) {
        if (socket === ws) continue
        if (attachmentOf(socket)?.page_section_id !== frame.section_id) continue
        send(socket, relay)
      }
      return
    }

    /** A width change on its own: the page is untouched, so only the attachment moves. */
    if (frame.t === "device") {
      if (peer.device === frame.device) return
      ws.serializeAttachment({ ...peer, device: frame.device })
      this.broadcastPresence()
      return
    }

    const section = frame.t === "hello" ? (frame.section_id ?? null) : frame.section_id
    const device = frame.t === "hello" ? (frame.device ?? peer.device) : peer.device
    if (peer.page_section_id === section && peer.device === device) {
      /** `hello` still answers with a roster even when nothing changed: it is the frame a
       *  reconnecting client uses to re-learn who is here. */
      if (frame.t === "hello") this.broadcastPresence()
      return
    }

    ws.serializeAttachment({ ...peer, page_section_id: section, device })
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

function clientTag(client: string): string {
  return `client:${client}`
}

/** The access code a reader joined under, as a short digest: the stored hash is longer than a
 *  socket tag may be. `""` is a book with no code. */
async function codeTag(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code))
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return `code:${hex.slice(0, 32)}`
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
