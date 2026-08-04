import { RoomServerFrame, type PublishComment, type RoomPeer } from "@adt/types"

/**
 * The Studio's half of the realtime room (M6).
 *
 * The reconnect ladder and the cursor bookkeeping are deliberately a *second* implementation of
 * what `apps/adt-runtime/src/features/comments/lib/room-socket.ts` does: the layer rule in
 * AGENTS.md forbids the Studio from importing the runtime, and the two ends differ in the parts
 * that matter anyway — the author re-tickets before every attempt (a ticket lives 60 seconds)
 * and never sends a cursor at all. What must not drift is the protocol, and that is shared:
 * frames are validated here with the same zod schemas the worker validates them against.
 */

export type RoomStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed"

export const ROOM_BACKOFF_BASE_MS = 500

export const ROOM_BACKOFF_MAX_MS = 15_000

const BACKOFF_FACTOR = 1.8

/** A cursor with no update for this long is not drawn. There is no goodbye frame for a pointer
 *  that simply left the window. Mirrors the runtime's own window. */
export const ROOM_CURSOR_STALE_MS = 5000

export interface RoomSocketLike {
  send: (data: string) => void
  close: () => void
  addEventListener: (type: string, listener: (event: unknown) => void) => void
}

export interface RoomSocketOptions {
  resolveUrl: () => Promise<string | null>
  onFrame: (frame: RoomServerFrame) => void
  onOpen?: () => void
  onStatus?: (status: RoomStatus) => void
  createSocket?: (url: string) => RoomSocketLike
  random?: () => number
  schedule?: (run: () => void, delayMs: number) => () => void
}

export interface RoomSocket {
  send: (frame: unknown) => void
  close: () => void
  status: () => RoomStatus
}

export function parseServerFrame(raw: unknown): RoomServerFrame | null {
  if (typeof raw !== "string") return null
  try {
    const parsed = RoomServerFrame.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Full jitter: a random point inside the window, not the window's edge, so a worker restart
 *  does not bring every socket in a room back in the same millisecond. */
export function backoffDelay(attempt: number, random: () => number): number {
  const window = Math.min(ROOM_BACKOFF_MAX_MS, ROOM_BACKOFF_BASE_MS * BACKOFF_FACTOR ** attempt)
  return Math.round(random() * window)
}

export function createRoomSocket(options: RoomSocketOptions): RoomSocket {
  const createSocket =
    options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as RoomSocketLike)
  const random = options.random ?? Math.random
  const schedule =
    options.schedule ??
    ((run: () => void, delayMs: number) => {
      const timer = window.setTimeout(run, delayMs)
      return () => window.clearTimeout(timer)
    })

  let socket: RoomSocketLike | null = null
  let cancelRetry: (() => void) | null = null
  let attempt = 0
  let closed = false
  let status: RoomStatus = "idle"

  const setStatus = (next: RoomStatus): void => {
    if (status === next) return
    status = next
    options.onStatus?.(next)
  }

  const retry = (): void => {
    if (closed) return
    setStatus("reconnecting")
    const delay = backoffDelay(attempt, random)
    attempt += 1
    cancelRetry = schedule(() => {
      cancelRetry = null
      void connect()
    }, delay)
  }

  const connect = async (): Promise<void> => {
    if (closed || socket !== null) return
    setStatus(attempt === 0 ? "connecting" : "reconnecting")

    let url: string | null
    try {
      url = await options.resolveUrl()
    } catch {
      url = null
    }
    if (closed) return
    if (url === null) {
      retry()
      return
    }

    let next: RoomSocketLike
    try {
      next = createSocket(url)
    } catch {
      retry()
      return
    }
    socket = next

    const dropped = (): void => {
      if (socket !== next) return
      socket = null
      retry()
    }

    next.addEventListener("open", () => {
      if (socket !== next) return
      attempt = 0
      setStatus("open")
      options.onOpen?.()
    })
    next.addEventListener("message", (event) => {
      const frame = parseServerFrame((event as { data?: unknown }).data)
      if (frame) options.onFrame(frame)
    })
    next.addEventListener("close", dropped)
    next.addEventListener("error", dropped)
  }

  void connect()

  return {
    send(frame) {
      if (socket === null || status !== "open") return
      try {
        socket.send(JSON.stringify(frame))
      } catch {
        /* a socket that died mid-frame announces itself through `close` */
      }
    },

    close() {
      closed = true
      setStatus("closed")
      cancelRetry?.()
      cancelRetry = null
      const current = socket
      socket = null
      try {
        current?.close()
      } catch {
        /* already gone */
      }
    },

    status: () => status,
  }
}

export interface ReviewerCursor {
  peerId: string
  sectionId: string
  selector: string
  xOffsetPct: number
  yOffsetPct: number
  at: number
}

export interface VisibleCursor extends ReviewerCursor {
  name: string
  color: string
}

export function applyCursor(cursors: ReviewerCursor[], next: ReviewerCursor): ReviewerCursor[] {
  const index = cursors.findIndex((cursor) => cursor.peerId === next.peerId)
  if (index === -1) return [...cursors, next]
  const updated = [...cursors]
  updated[index] = next
  return updated
}

export function pruneCursors(
  cursors: ReviewerCursor[],
  now: number,
  peerIds: ReadonlySet<string>,
  staleMs = ROOM_CURSOR_STALE_MS,
): ReviewerCursor[] {
  const kept = cursors.filter((cursor) => now - cursor.at < staleMs && peerIds.has(cursor.peerId))
  return kept.length === cursors.length ? cursors : kept
}

/**
 * Cursors the author should see: reviewers only (the author's own peer is in the roster too),
 * on the page the frame is showing, still fresh, and still in the room. Name and color come
 * from the roster rather than from the cursor, so a reviewer who renames themselves mid-session
 * is relabelled without another frame.
 */
export function visibleCursors(
  cursors: ReviewerCursor[],
  peers: RoomPeer[],
  selfId: string | null,
  sectionId: string | null,
  now: number,
  staleMs = ROOM_CURSOR_STALE_MS,
): VisibleCursor[] {
  if (sectionId === null) return []
  const byId = new Map(peers.map((peer) => [peer.id, peer]))
  const visible: VisibleCursor[] = []
  for (const cursor of cursors) {
    if (cursor.peerId === selfId) continue
    if (cursor.sectionId !== sectionId) continue
    if (now - cursor.at >= staleMs) continue
    const peer = byId.get(cursor.peerId)
    if (!peer) continue
    visible.push({ ...cursor, name: peer.name, color: peer.color })
  }
  return visible
}

export function otherPeers(peers: RoomPeer[], selfId: string | null): RoomPeer[] {
  return peers.filter((peer) => peer.id !== selfId)
}

/**
 * A comment event merged into the author's cached list.
 *
 * Unlike the reader's, the author's list is unfiltered — it carries resolved *and* deleted rows
 * on purpose (§4.9) — so this is a plain upsert by id, with `created_at` order preserved. No
 * invalidation, no refetch: a busy classroom would otherwise turn every pin into a round trip.
 */
export function upsertComment(
  comments: PublishComment[],
  incoming: PublishComment,
): PublishComment[] {
  const index = comments.findIndex((comment) => comment.id === incoming.id)
  if (index !== -1) {
    const updated = [...comments]
    updated[index] = incoming
    return updated
  }
  const merged = [...comments, incoming]
  merged.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  return merged
}
