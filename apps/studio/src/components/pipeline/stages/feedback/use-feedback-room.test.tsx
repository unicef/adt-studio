// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PublishComment, PublishCommentListResponse } from "@/api/client"

const createPublicationRoomTicket = vi.fn()
const getPublicationComments = vi.fn()

vi.mock("@/api/client", () => ({
  api: { createPublicationRoomTicket, getPublicationComments },
  ApiError: class extends Error {},
  apiErrorCode: () => null,
}))

const { useFeedbackRoom } = await import("./use-feedback-room")
const { publicationCommentsKey } = await import("@/hooks/use-publication-feedback")

const LABEL = "raven"
const TOKEN = "abcdefghijklmnopqrstuvwxyz012345"
const PAGE = "pg001_sec001"
const OTHER_PAGE = "pg002_sec001"

type Listener = (event: unknown) => void

/** A WebSocket the test drives by hand. Nothing about the room's behaviour needs a real one —
 *  what needs proving is which frames go out, and what the hook does with the ones coming in. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readonly sent: string[] = []
  closed = false
  private readonly listeners = new Map<string, Listener[]>()

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  removeEventListener(): void {
    /* the hook never removes listeners; it closes the socket */
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  frames(): unknown[] {
    return this.sent.map((raw) => JSON.parse(raw) as unknown)
  }

  static latest(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1)
    if (!socket) throw new Error("No socket was opened")
    return socket
  }
}

function comment(overrides: Partial<PublishComment> = {}): PublishComment {
  return {
    id: "c1",
    token: TOKEN,
    version: 2,
    page_section_id: PAGE,
    parent_id: null,
    session_id: "s1",
    author_name: "Maria",
    author_color: "#0091ff",
    body: "bigger raven",
    anchor: null,
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T12:00:00.000Z",
    ...overrides,
  }
}

function peer(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    color: "#0091ff",
    is_author: false,
    page_section_id: PAGE,
    ...overrides,
  }
}

let queryClient: QueryClient

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function mount(sectionId: string | null = PAGE, enabled = true) {
  return renderHook(({ section }: { section: string | null }) => useFeedbackRoom(LABEL, enabled, section), {
    wrapper,
    initialProps: { section: sectionId },
  })
}

async function opened(): Promise<FakeWebSocket> {
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
  const socket = FakeWebSocket.latest()
  act(() => socket.emit("open"))
  return socket
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal("WebSocket", FakeWebSocket)
  createPublicationRoomTicket.mockReset()
  createPublicationRoomTicket.mockResolvedValue({
    ticket: "v1.9999999999.nonce.tag",
    ws_url: `wss://adt-publish.example.workers.dev/p/${TOKEN}/room`,
    expires_at: "2026-08-04T12:01:00.000Z",
  })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  queryClient.clear()
})

describe("useFeedbackRoom", () => {
  it("spends a fresh ticket on the URL the worker named", async () => {
    mount()
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))

    const url = new URL(FakeWebSocket.latest().url)
    expect(url.protocol).toBe("wss:")
    expect(url.pathname).toBe(`/p/${TOKEN}/room`)
    expect(url.searchParams.get("ticket")).toBe("v1.9999999999.nonce.tag")
    expect(createPublicationRoomTicket).toHaveBeenCalledWith(LABEL)
  })

  it("says hello with the page it is showing, and never sends a cursor", async () => {
    mount()
    const socket = await opened()

    expect(socket.frames()).toEqual([{ t: "hello", section_id: PAGE }])
    expect(socket.frames().some((frame) => (frame as { t: string }).t === "cursor")).toBe(false)
  })

  it("tells the room when the framed page changes", async () => {
    const view = mount()
    const socket = await opened()

    act(() => view.rerender({ section: OTHER_PAGE }))
    expect(socket.frames().at(-1)).toEqual({ t: "page", section_id: OTHER_PAGE })
  })

  it("reports the roster without the author's own seat", async () => {
    const view = mount()
    const socket = await opened()

    act(() =>
      socket.emit("message", {
        data: JSON.stringify({
          t: "presence",
          self_id: "author-seat",
          peers: [peer("author-seat", { is_author: true }), peer("maria"), peer("ana")],
        }),
      }),
    )

    await waitFor(() => expect(view.result.current.peers).toHaveLength(2))
    expect(view.result.current.peers.map((entry) => entry.id)).toEqual(["maria", "ana"])
    expect(view.result.current.status).toBe("open")
  })

  it("surfaces a reviewer cursor for the page being framed, and only that page", async () => {
    const view = mount()
    const socket = await opened()

    act(() => {
      socket.emit("message", {
        data: JSON.stringify({
          t: "presence",
          self_id: "author-seat",
          peers: [peer("author-seat", { is_author: true }), peer("maria")],
        }),
      })
      socket.emit("message", {
        data: JSON.stringify({
          t: "cursor",
          peer_id: "maria",
          section_id: PAGE,
          selector: "#content [data-id='b3']",
          xOffsetPct: 40,
          yOffsetPct: 20,
        }),
      })
    })

    await waitFor(() => expect(view.result.current.cursorsFor(PAGE)).toHaveLength(1))
    expect(view.result.current.cursorsFor(PAGE)[0]).toMatchObject({
      peerId: "maria",
      name: "maria",
      selector: "#content [data-id='b3']",
    })
    expect(view.result.current.cursorsFor(OTHER_PAGE)).toEqual([])
  })

  it("ignores a cursor from a peer who is not on the roster", async () => {
    const view = mount()
    const socket = await opened()

    act(() =>
      socket.emit("message", {
        data: JSON.stringify({
          t: "cursor",
          peer_id: "ghost",
          section_id: PAGE,
          selector: "#content",
          xOffsetPct: 10,
          yOffsetPct: 10,
        }),
      }),
    )

    expect(view.result.current.cursorsFor(PAGE)).toEqual([])
  })

  it("drops a malformed frame instead of tearing the room down", async () => {
    const view = mount()
    const socket = await opened()

    act(() => {
      socket.emit("message", { data: "not json" })
      socket.emit("message", { data: JSON.stringify({ t: "presence", self_id: "x" }) })
    })

    expect(view.result.current.status).toBe("open")
    expect(view.result.current.peers).toEqual([])
  })

  describe("live comments", () => {
    function seed(comments: PublishComment[]): void {
      queryClient.setQueryData<PublishCommentListResponse>(publicationCommentsKey(LABEL), {
        comments,
        session: null,
      })
    }

    function cached(): PublishComment[] {
      return (
        queryClient.getQueryData<PublishCommentListResponse>(publicationCommentsKey(LABEL))
          ?.comments ?? []
      )
    }

    it("adds a new comment to the cache without refetching", async () => {
      seed([])
      mount()
      const socket = await opened()

      act(() =>
        socket.emit("message", {
          data: JSON.stringify({ t: "comment-created", comment: comment() }),
        }),
      )

      expect(cached().map((entry) => entry.id)).toEqual(["c1"])
      expect(getPublicationComments).not.toHaveBeenCalled()
    })

    it("applies an edit, a resolution and a delete in place", async () => {
      seed([comment()])
      mount()
      const socket = await opened()

      act(() =>
        socket.emit("message", {
          data: JSON.stringify({
            t: "comment-updated",
            comment: comment({ body: "second thoughts" }),
          }),
        }),
      )
      expect(cached()[0]?.body).toBe("second thoughts")

      act(() =>
        socket.emit("message", {
          data: JSON.stringify({
            t: "comment-resolved",
            comment: comment({ resolved_at: "2026-08-04T13:00:00.000Z" }),
          }),
        }),
      )
      expect(cached()[0]?.resolved_at).not.toBeNull()

      act(() =>
        socket.emit("message", {
          data: JSON.stringify({
            t: "comment-deleted",
            comment: comment({ deleted_at: "2026-08-04T14:00:00.000Z" }),
          }),
        }),
      )
      /** Kept, not removed: the author's list carries deleted rows so a thread still reads. */
      expect(cached()).toHaveLength(1)
      expect(cached()[0]?.deleted_at).not.toBeNull()
    })

    it("leaves an unloaded cache alone rather than inventing a list", async () => {
      mount()
      const socket = await opened()

      act(() =>
        socket.emit("message", {
          data: JSON.stringify({ t: "comment-created", comment: comment() }),
        }),
      )

      expect(
        queryClient.getQueryData<PublishCommentListResponse>(publicationCommentsKey(LABEL)),
      ).toBeUndefined()
    })
  })

  it("re-tickets on every reconnect, so an expired ticket is never retried", async () => {
    vi.useFakeTimers()
    try {
      mount()
      await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
      const first = FakeWebSocket.latest()
      act(() => first.emit("open"))

      createPublicationRoomTicket.mockResolvedValue({
        ticket: "v1.9999999999.second.tag",
        ws_url: `wss://adt-publish.example.workers.dev/p/${TOKEN}/room`,
        expires_at: "2026-08-04T12:02:00.000Z",
      })

      act(() => first.emit("close"))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2))
      expect(new URL(FakeWebSocket.latest().url).searchParams.get("ticket")).toBe(
        "v1.9999999999.second.tag",
      )
      expect(createPublicationRoomTicket).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not join at all when the book has no publication to join", async () => {
    mount(PAGE, false)
    await Promise.resolve()

    expect(createPublicationRoomTicket).not.toHaveBeenCalled()
    expect(FakeWebSocket.instances).toEqual([])
  })

  it("closes the socket when the view unmounts", async () => {
    const view = mount()
    const socket = await opened()

    view.unmount()
    expect(socket.closed).toBe(true)
  })
})
