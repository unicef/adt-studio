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
 * Every peer's identity rides on its own socket through `serializeAttachment`, and the roster
 * is derived from `state.getWebSockets()` on demand. The in-memory read cache, queues and rate
 * counters are temporary: hibernation clears them, so the next frame checks access afresh.
 * An idle room with fifty readers holding sockets open costs nothing until somebody moves.
 *
 * The only durable room storage is the alarm that closes readers when the book's end date
 * arrives. Cursor positions are relayed and forgotten; only the access verdict is cached for
 * one second. The room checks D1 on joins, comments and roster changes, and periodically while
 * relaying positions.
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

/**
 * How long one read of the book covers cursor and viewport traffic, measured from when the read
 * started. Positions are the room's most frequent frames — about thirty a second per reader — and
 * a read for each would put a classroom's cursors on the account's one D1 database, every book's.
 * So, after an `/evict` lost five times over, a reader whose access ended can still send and
 * receive pointer positions for up to this long. Joins, comments, rosters and departures are
 * checked on every delivery and never use this.
 */
export const ROOM_POSITION_CHECK_MS = 1_000

/** Cursor and viewport frames one socket may send per second, sustained and in a burst. The
 *  reader throttles its own cursor to ~33 a second; anything beyond this is dropped. Page and
 *  width changes aren't counted: they coalesce per socket, and dropping one would leave the
 *  reader on the wrong page. */
export const ROOM_MAX_FRAMES_PER_SECOND = 60

/** Routine strict checks start at least this far apart. An idle room checks at once; a busy one
 *  batches waiting traffic into at most four reads a second. Joins bypass the delay. */
export const ROOM_CHECK_MIN_INTERVAL_MS = 250

/** Repeated page, device and hello frames from one socket share the latest state before the
 *  next check. This also bounds idle hello requests, which otherwise each read D1. */
export const ROOM_ROSTER_MIN_INTERVAL_MS = 250

/** Joins one network may make per minute. Every join and every departure is a D1 read, so
 *  opening and closing sockets in a loop is bounded here rather than by the frame limit. A
 *  classroom behind one address turning pages together stays well inside it. */
export const ROOM_MAX_JOINS_PER_CLIENT_PER_MINUTE = 120

const AUTHOR_TAG = "author"
/** Which book a reader joined; every reader in a room carries the same one. */
const BOOK_TAG_PREFIX = "book:"
const READER_TAG = "reader"
const CLIENT_KEY_PATTERN = /^[0-9a-f]{1,64}$/

type PeerAttachment = RoomPeer

/** Who the book admitted when it was last read: `readers` were in the room when the read began,
 *  `admitted` are those of them it still lets in. `null` when the book couldn't be read. */
type AccessCheck = { readers: ReadonlySet<WebSocket>; admitted: ReadonlySet<WebSocket> } | null

type PositionVerdict = { check: AccessCheck; startedAt: number; readId: number }

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

  /** Sockets this instance has closed; workerd may still list them until the close completes. */
  private readonly closing = new WeakSet<WebSocket>()

  /** Outbound work waiting for its access check, and whether a check is running. */
  private readonly queued: Array<{ deliver: (check: AccessCheck) => void; urgent: boolean }> = []

  private draining = false

  /** How many items have been queued and how many delivered, in order: a position frame waits
   *  for the work queued before it — never for work queued after, which could starve it. */
  private enqueued = 0

  private delivered = 0

  private readonly waiters: Array<{ upTo: number; resolve: () => void }> = []

  /** Set by anything in a batch that changes who is here or where; the batch then sends one
   *  roster, however many joins, page turns and departures it carried. */
  private rosterChanged = false

  /** A socket's newest requested page and width, not yet applied. One roster update per socket
   *  is queued at a time and applies whatever is newest when it runs, so a quick run of page
   *  turns lands on the last one and costs one check, not one each. */
  private readonly pendingRoster = new WeakMap<
    WebSocket,
    { section: string | null; device: PeerAttachment["device"]; hello: boolean }
  >()

  /** The read that cursor and viewport frames rely on, while it is younger than
   *  `ROOM_POSITION_CHECK_MS`. A failed read is remembered as `null`, so positions go to no
   *  reader until the next read rather than costing a read per frame. */
  private positions: PositionVerdict | null = null

  private positionRead: Promise<PositionVerdict> | null = null

  /** Every read gets a distinct number, even if two start in the same millisecond. An older
   *  position verdict cannot outlive a newer strict check or an in-flight newer read. */
  private readId = 0

  /** A newer completed read supersedes an older result that returns late. */
  private latestCompletedReadId = 0

  /** When the last strict check started, to space the next one. */
  private lastStrictReadAt = 0

  /** Each socket's frame allowances, refilled continuously. In memory only. */
  private readonly allowance = new WeakMap<WebSocket, { tokens: number; at: number }>()

  /** Last roster update queued by each socket; pending updates coalesce until their turn. */
  private readonly lastRosterQueuedAt = new WeakMap<WebSocket, number>()

  /** Recent join times per caller network. In memory only: a room that hibernated starts over. */
  private readonly joins = new Map<string, number[]>()

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
      await this.checked(() => (this.rosterChanged = true))
      return new Response(null, { status: 204 })
    }
    return json(errorBody("not_found", "Unknown room endpoint"), 404)
  }

  /**
   * Everything the room sends goes through here: joins, comments, cursors, viewports, page
   * changes and departures alike. `deliver` runs after a read of the book that *started after*
   * it was queued, so nothing reaches a reader on the strength of a check that predates the
   * moment it was asked for — a lost `/evict` ends that reader's live traffic at the very next
   * frame, not after a window. Work that queues while a read is in flight waits for the next
   * read, and shares it: one D1 read per batch, never one per frame and never a reused one.
   */
  private checked(deliver: (check: AccessCheck) => void, urgent = false): Promise<void> {
    this.enqueued += 1
    const seq = this.enqueued
    return new Promise((resolve) => {
      this.queued.push({
        urgent,
        deliver: (check) => {
          try {
            deliver(check)
          } finally {
            this.delivered = seq
            resolve()
          }
        },
      })
      void this.drain()
    })
  }

  /** Settles once everything queued up to `upTo` has been delivered. */
  private caughtUp(upTo: number): Promise<void> {
    if (this.delivered >= upTo) return Promise.resolve()
    return new Promise((resolve) => this.waiters.push({ upTo, resolve }))
  }

  private releaseWaiters(): void {
    for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
      const waiter = this.waiters[i]!
      if (waiter.upTo > this.delivered) continue
      this.waiters.splice(i, 1)
      waiter.resolve()
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.queued.length > 0) {
        const wait = this.queued.some((entry) => entry.urgent) || this.lastStrictReadAt === 0
          ? 0
          : this.lastStrictReadAt + ROOM_CHECK_MIN_INTERVAL_MS - performance.now()
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
        const batch = this.queued.splice(0)
        const startedAt = performance.now()
        const readId = ++this.readId
        this.lastStrictReadAt = startedAt
        const result = await this.admittedReaders()
        const check = readId < this.latestCompletedReadId ? null : result
        this.latestCompletedReadId = Math.max(this.latestCompletedReadId, readId)
        if (check !== null) this.evictReaders(check.admitted, check.readers)
        this.rememberForPositions(check, startedAt, readId)
        for (const entry of batch) entry.deliver(check)
        if (this.rosterChanged) {
          this.rosterChanged = false
          this.sendPresence(check)
        }
        this.releaseWaiters()
      }
    } finally {
      this.draining = false
      this.releaseWaiters()
    }
  }

  /**
   * The check cursor and viewport frames go by: the newest read if it started less than
   * `ROOM_POSITION_CHECK_MS` ago, otherwise one new read shared by every position frame that
   * arrives while it runs. At most one read per window for positions, however busy the room.
   */
  private async positionCheck(): Promise<PositionVerdict> {
    if (this.positions && performance.now() - this.positions.startedAt < ROOM_POSITION_CHECK_MS) {
      return this.positions
    }
    this.positionRead ??= (async () => {
      const startedAt = performance.now()
      const readId = ++this.readId
      try {
        const result = await this.admittedReaders()
        const check = readId < this.latestCompletedReadId ? null : result
        this.latestCompletedReadId = Math.max(this.latestCompletedReadId, readId)
        /** An expired or overtaken position read cannot authorize delivery or close sockets. */
        if (readId === this.readId && performance.now() - startedAt < ROOM_POSITION_CHECK_MS) {
          if (check !== null) this.evictReaders(check.admitted, check.readers)
          this.rememberForPositions(check, startedAt, readId)
        }
        return { check, startedAt, readId }
      } finally {
        this.positionRead = null
      }
    })()
    return this.positionRead
  }

  /**
   * A read that found the room as it was is kept for positions; one that failed is kept as
   * "nobody", so an outage sends positions to no reader without a read per frame; one that had to
   * close somebody is not kept at all, so the next position frame reads the book afresh. A read
   * never replaces a newer one.
   */
  private rememberForPositions(check: AccessCheck, startedAt: number, readId: number): void {
    if (readId !== this.readId) return
    if (check !== null && check.admitted.size < check.readers.size) {
      this.positions = null
      return
    }
    this.positions = { check, startedAt, readId }
  }

  /** Token bucket per socket: refills at `perSecond`, holds as many. */
  private withinAllowance(
    buckets: WeakMap<WebSocket, { tokens: number; at: number }>,
    ws: WebSocket,
    perSecond: number,
  ): boolean {
    const now = Date.now()
    const state = buckets.get(ws) ?? { tokens: perSecond, at: now }
    const tokens = Math.min(perSecond, state.tokens + ((now - state.at) / 1000) * perSecond)
    if (tokens < 1) {
      buckets.set(ws, { tokens, at: now })
      return false
    }
    buckets.set(ws, { tokens: tokens - 1, at: now })
    return true
  }

  /** Records a join for `client` unless it has made too many in the last minute. */
  private withinJoinAllowance(client: string): boolean {
    const now = Date.now()
    const recent = (this.joins.get(client) ?? []).filter((at) => now - at < 60_000)
    if (recent.length >= ROOM_MAX_JOINS_PER_CLIENT_PER_MINUTE) {
      this.joins.set(client, recent)
      return false
    }
    recent.push(now)
    this.joins.set(client, recent)
    return true
  }

  /** Whether a socket may be sent reader-facing traffic under `check`. The author always may;
   *  a reader only when this check admitted them, so a book that can't be read sends readers
   *  nothing until it can. */
  private hears(socket: WebSocket, check: AccessCheck): boolean {
    if (this.closing.has(socket)) return false
    if (attachmentOf(socket)?.is_author) return true
    return check?.admitted.has(socket) ?? false
  }

  private live(exclude?: WebSocket): WebSocket[] {
    return this.state.getWebSockets().filter((socket) => socket !== exclude && !this.closing.has(socket))
  }

  /**
   * The reader sockets the book admits right now: still live, joined under its current code.
   * `readers` is who was in the room when the book was read, and the verdict covers only them:
   * a reader who joined while the read was in flight was judged by their own join, against a
   * book this read may predate. `null` when the book can't be read: nobody is evicted on a
   * database hiccup, but nobody but the author is sent anything either, and readers recover by
   * re-listing.
   */
  private async admittedReaders(): Promise<AccessCheck> {
    const readers = this.state.getWebSockets(READER_TAG).filter((socket) => !this.closing.has(socket))
    const considered = new Set(readers)
    if (readers.length === 0) return { readers: considered, admitted: new Set() }
    const token = this.state
      .getTags(readers[0]!)
      .find((tag) => tag.startsWith(BOOK_TAG_PREFIX))
      ?.slice(BOOK_TAG_PREFIX.length)
    if (!token || !this.env.DB) return null
    try {
      const record = await createD1PublicationStore(this.env.DB).findRecord(token)
      if (!record || publicationStateAt(record.publication) !== "active") {
        return { readers: considered, admitted: new Set() }
      }
      const current = new Set(this.state.getWebSockets(await codeTag(record.accessCode ?? "")))
      return { readers: considered, admitted: new Set([...considered].filter((socket) => current.has(socket))) }
    } catch {
      return null
    }
  }

  /** The publication's expiry, set when a reader joined: readers go when it does. */
  async alarm(): Promise<void> {
    this.evictReaders()
    await this.checked(() => (this.rosterChanged = true))
  }

  /**
   * Closes every socket but the author's, or with `among` only those sockets. Readers who are
   * still allowed come straight back through the door; the ones whose access ended stay out — so
   * one rule covers revoke, a new code, a changed expiry and delete without the room having to
   * know which it was. Sends nothing itself: the roster that follows goes through `checked`.
   */
  private evictReaders(keep: ReadonlySet<WebSocket> = new Set(), among?: ReadonlySet<WebSocket>): void {
    for (const socket of this.live()) {
      if (attachmentOf(socket)?.is_author || keep.has(socket)) continue
      if (among && !among.has(socket)) continue
      this.closing.add(socket)
      try {
        socket.close(CLOSE_ACCESS_CHANGED, "Access to this book changed")
      } catch {
        /** Already gone. */
      }
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
    if (!peer.is_author && !this.withinJoinAllowance(clientKey)) {
      return json(
        errorBody("rate_limited", "Too many reconnects from this network. Try again in a minute"),
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
     * finds it here and does. The same read closes every other reader whose access has ended, and
     * the roster that announces the newcomer goes only to those it admitted.
     */
    await this.checked((check) => {
      if (!peer.is_author && !check?.admitted.has(server) && !this.closing.has(server)) {
        this.closing.add(server)
        try {
          server.close(CLOSE_ACCESS_CHANGED, "Access to this book changed")
        } catch {
          /** Already gone. */
        }
      }
      this.rosterChanged = true
    }, true)
    if (this.closing.has(server)) return new Response(null, { status: 101, webSocket: client })

    const expiresAt = Date.parse(request.headers.get(ROOM_EXPIRES_HEADER) ?? "")
    if (!peer.is_author && Number.isFinite(expiresAt)) {
      const current = await this.state.storage.getAlarm()
      if (current === null || expiresAt < current) await this.state.storage.setAlarm(expiresAt)
    }

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
    await this.checked((check) => {
      for (const socket of this.live()) {
        if (this.hears(socket, check)) send(socket, frame.data)
      }
    })

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

    const sender = attachmentOf(ws)
    if (!sender || this.closing.has(ws)) return
    const frame = parsed.data

    /** The sender is judged by the same check as the recipients: a reader the book no longer
     *  admits, or one the room can't vouch for while the book can't be read, reaches nobody.
     *  Positions go by the short-lived position check, after any roster change queued before
     *  them; everything that changes the roster is checked on delivery. */
    if (frame.t === "cursor" || frame.t === "viewport") {
      if (!this.withinAllowance(this.allowance, ws, ROOM_MAX_FRAMES_PER_SECOND)) return
      await this.caughtUp(this.enqueued)
      const verdict = await this.positionCheck()
      /** A slow read may finish after its one-second lease or after a newer check has started.
       *  Neither result can authorize a position frame, even if it was valid when read. */
      if (verdict.readId !== this.readId || performance.now() - verdict.startedAt >= ROOM_POSITION_CHECK_MS) return
      const check = verdict.check
      const peer = attachmentOf(ws)
      if (!peer || !this.hears(ws, check)) return
      this.relayPosition(ws, peer, frame, check)
      return
    }

    const pending = this.pendingRoster.get(ws)
    const base = pending ?? { section: sender.page_section_id, device: sender.device, hello: false }
    const next = {
      section: frame.t === "device" ? base.section : frame.t === "hello" ? (frame.section_id ?? null) : frame.section_id,
      device: frame.t === "device" ? frame.device : frame.t === "hello" ? (frame.device ?? base.device) : base.device,
      hello: base.hello || frame.t === "hello",
    }
    /** A page or width the room already has changes nothing and is answered with nothing, so it
     *  costs no read. `hello` is different: it asks for the roster. */
    if (!pending && !next.hello && next.section === base.section && next.device === base.device) return
    this.pendingRoster.set(ws, next)
    if (pending) return

    const lastQueuedAt = this.lastRosterQueuedAt.get(ws)
    const wait = lastQueuedAt === undefined ? 0 : lastQueuedAt + ROOM_ROSTER_MIN_INTERVAL_MS - performance.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    this.lastRosterQueuedAt.set(ws, performance.now())

    await this.checked((check) => {
      const latest = this.pendingRoster.get(ws)
      this.pendingRoster.delete(ws)
      const peer = attachmentOf(ws)
      if (!latest || !peer || !this.hears(ws, check)) return
      if (peer.page_section_id !== latest.section || peer.device !== latest.device) {
        ws.serializeAttachment({ ...peer, page_section_id: latest.section, device: latest.device })
        this.rosterChanged = true
        return
      }
      /** `hello` still answers with a roster even when nothing changed: it is the frame a
       *  reconnecting client uses to re-learn who is here. Nothing changed for anyone else, so
       *  only the asker hears it. */
      if (latest.hello) this.sendPresence(check, ws)
    })
  }

  private relayPosition(
    ws: WebSocket,
    peer: PeerAttachment,
    frame: Extract<RoomClientFrame, { t: "cursor" | "viewport" }>,
    check: AccessCheck,
  ): void {
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
      for (const socket of this.live(ws)) {
        if (!this.hears(socket, check)) continue
        if (attachmentOf(socket)?.page_section_id !== frame.section_id) continue
        send(socket, relay)
      }
      return
    }

    /** Relayed on the same terms as a cursor, and for the same reason: it is a position inside
     *  one document, so it means nothing to somebody reading another. */
    const relay: RoomPeerViewportFrame = {
      t: "viewport",
      peer_id: peer.id,
      section_id: frame.section_id,
      selector: frame.selector,
      xOffsetPct: frame.xOffsetPct,
      yOffsetPct: frame.yOffsetPct,
    }
    for (const socket of this.live(ws)) {
      if (!this.hears(socket, check)) continue
      if (attachmentOf(socket)?.page_section_id !== frame.section_id) continue
      send(socket, relay)
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(closeCodeFor(code), reason)
    } catch {
      /** Already closing from the other end — nothing to complete. */
    }
    await this.departed(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.departed(ws)
  }

  /** A peer who just left must not appear in the roster that announces their leaving, and
   *  workerd may still list their socket while the close completes. */
  private departed(ws: WebSocket): Promise<void> {
    this.closing.add(ws)
    return this.checked(() => (this.rosterChanged = true))
  }

  /**
   * The roster, re-derived from the live sockets every time and sent to those `check` lets hear
   * it. It lists the same peers, except while the book can't be read: then only the author hears
   * it, and it still lists every reader connected, so their view doesn't flicker through an
   * outage. With `only`, the roster goes to that socket alone.
   */
  private sendPresence(check: AccessCheck, only?: WebSocket): void {
    const sockets = this.live()
    const listed = check === null ? sockets : sockets.filter((socket) => this.hears(socket, check))
    const peers = listed.flatMap((socket) => {
      const peer = attachmentOf(socket)
      return peer ? [peer] : []
    })
    const entries = sockets
      .filter((socket) => (only === undefined || socket === only) && this.hears(socket, check))
      .map((socket) => ({ socket, peer: attachmentOf(socket) }))

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
