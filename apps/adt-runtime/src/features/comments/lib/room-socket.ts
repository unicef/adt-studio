import { parseServerFrame, type RoomServerFrame } from "@/features/comments/lib/room-protocol"

/**
 * One reconnecting WebSocket to the publication's room.
 *
 * Two properties matter more than anything else here:
 *
 * - **Jittered backoff.** A worker restart drops every socket in a room at the same instant. A
 *   fixed retry delay would bring all of them back at the same instant too, and the room would
 *   knock itself over on the way up. Every delay is therefore a *random* point in the window up
 *   to the current cap (full jitter), not the cap itself.
 * - **The address is resolved per attempt.** The author's credential is a 60-second ticket, so
 *   the URL cannot be captured once at construction — `resolveUrl` runs again before every
 *   attempt, and answering `null` means "not connectable right now", which is a retry rather
 *   than a failure.
 *
 * Everything injectable is injected (`createSocket`, `random`, `schedule`) so the reconnect
 * ladder is testable without a real socket or a real clock.
 */

export type RoomStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed"

export const ROOM_BACKOFF_BASE_MS = 500

export const ROOM_BACKOFF_MAX_MS = 15_000

const BACKOFF_FACTOR = 1.8

export interface RoomSocketLike {
  send: (data: string) => void
  close: () => void
  addEventListener: (type: string, listener: (event: unknown) => void) => void
}

export interface RoomSocketOptions {
  /** `null` = nothing to connect to yet; the ladder waits and asks again. */
  resolveUrl: () => Promise<string | null>
  onFrame: (frame: RoomServerFrame) => void
  /** Fired after every successful open, including reconnects — where a client re-sends the
   *  `hello` that tells the room which page it is on. */
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

function defaultSocket(url: string): RoomSocketLike {
  return new WebSocket(url) as unknown as RoomSocketLike
}

function defaultSchedule(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs)
  return () => clearTimeout(timer)
}

export function backoffDelay(attempt: number, random: () => number): number {
  const window = Math.min(ROOM_BACKOFF_MAX_MS, ROOM_BACKOFF_BASE_MS * BACKOFF_FACTOR ** attempt)
  return Math.round(random() * window)
}

export function createRoomSocket(options: RoomSocketOptions): RoomSocket {
  const createSocket = options.createSocket ?? defaultSocket
  const random = options.random ?? Math.random
  const schedule = options.schedule ?? defaultSchedule

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

    /** Both endings funnel here: a socket that errored will also close, and a socket that
     *  closed after an error must not schedule two retries. */
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
        /** A socket that died mid-frame will announce itself through `close`. */
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
        /** Already gone. */
      }
    },

    status: () => status,
  }
}
