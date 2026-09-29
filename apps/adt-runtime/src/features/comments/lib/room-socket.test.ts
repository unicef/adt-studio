import { describe, expect, it, vi } from "vitest"
import {
  ROOM_BACKOFF_BASE_MS,
  ROOM_BACKOFF_MAX_MS,
  backoffDelay,
  createRoomSocket,
  type RoomSocketLike,
} from "@/features/comments/lib/room-socket"
import type { RoomServerFrame } from "@/features/comments/lib/room-protocol"

type Listener = (event: unknown) => void

class FakeSocket implements RoomSocketLike {
  readonly sent: string[] = []
  closed = false
  private readonly listeners = new Map<string, Listener[]>()

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? []
    this.listeners.set(type, [...existing, listener])
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

interface Harness {
  sockets: FakeSocket[]
  frames: RoomServerFrame[]
  statuses: string[]
  opens: number
  runNext: () => number
  pending: () => number
}

function harness(
  options: { resolveUrl?: () => Promise<string | null>; random?: () => number } = {},
) {
  const sockets: FakeSocket[] = []
  const frames: RoomServerFrame[] = []
  const statuses: string[] = []
  let opens = 0
  const queue: Array<{ run: () => void; delay: number }> = []

  const socket = createRoomSocket({
    resolveUrl: options.resolveUrl ?? (async () => "wss://example.test/p/token/room"),
    onFrame: (frame) => frames.push(frame),
    onOpen: () => {
      opens += 1
    },
    onStatus: (status) => statuses.push(status),
    createSocket: (url) => {
      const next = new FakeSocket(url)
      sockets.push(next)
      return next
    },
    random: options.random ?? (() => 0.5),
    schedule: (run, delay) => {
      const entry = { run, delay }
      queue.push(entry)
      return () => {
        const index = queue.indexOf(entry)
        if (index >= 0) queue.splice(index, 1)
      }
    },
  })

  const state: Harness = {
    sockets,
    frames,
    statuses,
    get opens() {
      return opens
    },
    runNext: () => {
      const entry = queue.shift()
      if (!entry) throw new Error("Nothing scheduled")
      entry.run()
      return entry.delay
    },
    pending: () => queue.length,
  }

  return { socket, state }
}

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe("backoff", () => {
  it("grows, then caps", () => {
    const full = () => 1
    expect(backoffDelay(0, full)).toBe(ROOM_BACKOFF_BASE_MS)
    expect(backoffDelay(1, full)).toBeGreaterThan(ROOM_BACKOFF_BASE_MS)
    expect(backoffDelay(20, full)).toBe(ROOM_BACKOFF_MAX_MS)
  })

  it("is jittered, so a room does not come back all at once", () => {
    /** The whole point: with the same attempt number, two clients get different delays, and a
     *  delay is a point *inside* the window rather than its edge. */
    expect(backoffDelay(5, () => 0)).toBe(0)
    expect(backoffDelay(5, () => 0.5)).toBeLessThan(backoffDelay(5, () => 1))
    expect(backoffDelay(5, () => 0.25)).not.toBe(backoffDelay(5, () => 0.75))
  })
})

describe("the room socket", () => {
  it("connects, reports open, and delivers parsed frames", async () => {
    const { state } = harness()
    await flush()

    expect(state.sockets).toHaveLength(1)
    state.sockets[0]?.emit("open")
    expect(state.opens).toBe(1)
    expect(state.statuses).toEqual(["connecting", "open"])

    state.sockets[0]?.emit("message", {
      data: JSON.stringify({ t: "presence", self_id: "a", peers: [] }),
    })
    expect(state.frames).toEqual([{ t: "presence", self_id: "a", peers: [] }])
  })

  it("drops frames it cannot parse instead of surfacing them", async () => {
    const { state } = harness()
    await flush()
    state.sockets[0]?.emit("open")

    state.sockets[0]?.emit("message", { data: "not json" })
    state.sockets[0]?.emit("message", { data: JSON.stringify({ t: "invented" }) })
    state.sockets[0]?.emit("message", { data: JSON.stringify({ t: "presence" }) })

    expect(state.frames).toEqual([])
  })

  it("only sends while open", async () => {
    const { socket, state } = harness()
    await flush()

    socket.send({ t: "hello", section_id: null })
    expect(state.sockets[0]?.sent).toEqual([])

    state.sockets[0]?.emit("open")
    socket.send({ t: "hello", section_id: "pg001_sec001" })
    expect(state.sockets[0]?.sent).toEqual(['{"t":"hello","section_id":"pg001_sec001"}'])
  })

  it("reconnects after a drop with a growing, jittered delay", async () => {
    const random = vi.fn(() => 1)
    const { state } = harness({ random })
    await flush()
    state.sockets[0]?.emit("open")

    state.sockets[0]?.emit("close")
    expect(state.statuses.at(-1)).toBe("reconnecting")
    const firstDelay = state.runNext()
    await flush()
    expect(firstDelay).toBe(ROOM_BACKOFF_BASE_MS)
    expect(state.sockets).toHaveLength(2)

    state.sockets[1]?.emit("close")
    const secondDelay = state.runNext()
    await flush()
    expect(secondDelay).toBeGreaterThan(firstDelay)
    expect(state.sockets).toHaveLength(3)
  })

  it("resets the ladder once a reconnect succeeds", async () => {
    const { state } = harness({ random: () => 1 })
    await flush()
    state.sockets[0]?.emit("open")
    state.sockets[0]?.emit("close")
    state.runNext()
    await flush()

    state.sockets[1]?.emit("open")
    expect(state.opens).toBe(2)
    state.sockets[1]?.emit("close")
    expect(state.runNext()).toBe(ROOM_BACKOFF_BASE_MS)
  })

  it("schedules exactly one retry when a socket errors and then closes", async () => {
    const { state } = harness()
    await flush()
    state.sockets[0]?.emit("open")

    state.sockets[0]?.emit("error")
    state.sockets[0]?.emit("close")

    expect(state.pending()).toBe(1)
  })

  it("retries rather than gives up when there is no address yet", async () => {
    let url: string | null = null
    const { state } = harness({ resolveUrl: async () => url })
    await flush()

    expect(state.sockets).toHaveLength(0)
    expect(state.pending()).toBe(1)

    url = "wss://example.test/p/token/room"
    state.runNext()
    await flush()
    expect(state.sockets).toHaveLength(1)
  })

  it("retries when the address cannot be fetched at all", async () => {
    const { state } = harness({
      resolveUrl: async () => {
        throw new Error("ticket route is down")
      },
    })
    await flush()

    expect(state.sockets).toHaveLength(0)
    expect(state.pending()).toBe(1)
  })

  it("stops for good once closed, and never reconnects behind the caller's back", async () => {
    const { socket, state } = harness()
    await flush()
    state.sockets[0]?.emit("open")

    socket.close()
    expect(state.sockets[0]?.closed).toBe(true)
    expect(socket.status()).toBe("closed")

    state.sockets[0]?.emit("close")
    expect(state.pending()).toBe(0)
    expect(state.sockets).toHaveLength(1)
  })

  it("cancels a scheduled retry when closed mid-backoff", async () => {
    const { socket, state } = harness()
    await flush()
    state.sockets[0]?.emit("open")
    state.sockets[0]?.emit("close")
    expect(state.pending()).toBe(1)

    socket.close()
    expect(state.pending()).toBe(0)
  })
})
