import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test"
import { afterEach, describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import {
  COMMENTER_SESSION_COOKIE,
  PUBLICATION_ACCESS_COOKIE,
  PUBLICATION_ROOM_MAX_FRAME_BYTES,
  PUBLICATION_ROOM_MAX_PEERS,
  PUBLISH_ANONYMOUS_COLOR,
  PUBLISH_ANONYMOUS_NAME,
  PUBLISH_AUTHOR_DEFAULT_NAME,
  type CommenterSessionResponse,
  type PublicationRoomTicketResponse,
  type PublishCommentResponse,
  type RoomPresenceFrame,
  type RoomServerFrame,
} from "@adt/types"
import { createApp } from "./app.js"

/**
 * The realtime room against real workerd: real Durable Objects, real WebSockets, real D1.
 *
 * Two peers are two `Response.webSocket` clients from two upgrade requests through the same
 * app, which is what makes "did the other side actually see it" assertable rather than
 * simulated.
 */

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"

const MANIFEST = [
  { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
  { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
]

let tokenCounter = 0

function nextToken(): string {
  tokenCounter += 1
  return `room${String(tokenCounter).padStart(4, "0")}TokenAbcdefghijklmn`.slice(0, 32)
}

function app() {
  return createApp()
}

function snapshot(): File {
  const zipped = zipSync({ "index.html": new TextEncoder().encode("<h1>page one</h1>") })
  return new File([zipped], "snapshot.zip", { type: "application/zip" })
}

async function publish(accessCode?: string): Promise<string> {
  const token = nextToken()
  const body = new FormData()
  body.set(
    "metadata",
    JSON.stringify({
      token,
      title: "Raven and the Sun",
      book_label: "raven",
      page_manifest: MANIFEST,
      ...(accessCode === undefined ? {} : { access_code: accessCode }),
    }),
  )
  body.set("snapshot", snapshot())

  const res = await app().request(
    `${BASE}/api/publications`,
    { method: "POST", headers: { Authorization: `Bearer ${SECRET}` }, body },
    env,
  )
  expect(res.status).toBe(201)
  return token
}

async function ticketFor(token: string): Promise<PublicationRoomTicketResponse> {
  const res = await app().request(
    `${BASE}/api/publications/${token}/room-ticket`,
    { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
    env,
  )
  expect(res.status).toBe(200)
  return (await res.json()) as PublicationRoomTicketResponse
}

async function commenterCookie(token: string, name: string): Promise<string> {
  const res = await app().request(
    `${BASE}/p/${token}/session`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    },
    env,
  )
  expect(res.status).toBe(201)
  await res.json<CommenterSessionResponse>()
  const value = /adt_pub_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1]
  expect(value).toBeDefined()
  return value as string
}

async function accessCookie(token: string, code: string): Promise<string> {
  const res = await app().request(
    `${BASE}/p/${token}/access`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    },
    env,
  )
  expect(res.status).toBe(204)
  const value = /adt_pub_access=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1]
  expect(value).toBeDefined()
  return value as string
}

interface RoomPeerClient {
  ws: WebSocket
  frames: RoomServerFrame[]
  presence: () => RoomPresenceFrame[]
  send: (frame: unknown) => void
}

const open: WebSocket[] = []

afterEach(() => {
  while (open.length > 0) {
    try {
      open.pop()?.close()
    } catch {
      /* already gone */
    }
  }
})

async function connect(
  token: string,
  options: { ticket?: string; cookies?: string[]; tab?: string } = {},
): Promise<Response> {
  const params = new URLSearchParams()
  if (options.ticket !== undefined) params.set("ticket", options.ticket)
  if (options.tab !== undefined) params.set("tab", options.tab)
  const query = params.size === 0 ? "" : `?${params.toString()}`
  return app().request(
    `${BASE}/p/${token}/room${query}`,
    {
      headers: {
        Upgrade: "websocket",
        ...(options.cookies === undefined ? {} : { Cookie: options.cookies.join("; ") }),
      },
    },
    env,
  )
}

async function join(
  token: string,
  options: {
    ticket?: string
    cookies?: string[]
    section?: string | null
    tab?: string
  } = {},
): Promise<RoomPeerClient> {
  const response = await connect(token, options)
  expect(response.status).toBe(101)
  const ws = response.webSocket
  expect(ws).toBeDefined()

  const frames: RoomServerFrame[] = []
  const socket = ws as WebSocket
  socket.addEventListener("message", (event) => {
    frames.push(JSON.parse(String(event.data)) as RoomServerFrame)
  })
  socket.accept()
  open.push(socket)

  const client: RoomPeerClient = {
    ws: socket,
    frames,
    presence: () => frames.filter(isPresence),
    send: (frame) => socket.send(JSON.stringify(frame)),
  }

  if (options.section !== undefined) {
    client.send({ t: "hello", section_id: options.section })
  }

  return client
}

function isPresence(frame: RoomServerFrame): frame is RoomPresenceFrame {
  return frame.t === "presence"
}

async function waitFor<T>(read: () => T | null | undefined, label: string): Promise<T> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const value = read()
    if (value !== null && value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function lastPresence(client: RoomPeerClient): RoomPresenceFrame | null {
  return client.presence().at(-1) ?? null
}

async function presenceWith(client: RoomPeerClient, count: number): Promise<RoomPresenceFrame> {
  return waitFor(() => {
    const frame = lastPresence(client)
    return frame && frame.peers.length === count ? frame : null
  }, `a roster of ${count}`)
}

describe("POST /api/publications/:token/room-ticket", () => {
  it("mints a ticket and the socket address to spend it at", async () => {
    const token = await publish()
    const body = await ticketFor(token)

    expect(body.ticket.split(".")).toHaveLength(4)
    expect(body.ws_url).toBe(`wss://adt-publish.example.workers.dev/p/${token}/room`)
    expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now())
    expect(body.ticket).not.toContain(SECRET)
  })

  it("needs MGMT_SECRET", async () => {
    const token = await publish()
    const res = await app().request(
      `${BASE}/api/publications/${token}/room-ticket`,
      { method: "POST" },
      env,
    )
    expect(res.status).toBe(401)
  })

  it("is 404 for an unknown publication", async () => {
    const res = await app().request(
      `${BASE}/api/publications/${nextToken()}/room-ticket`,
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(res.status).toBe(404)
  })
})

describe("GET /p/:token/room", () => {
  it("refuses a plain GET that is not an upgrade", async () => {
    const token = await publish()
    const res = await app().request(`${BASE}/p/${token}/room`, {}, env)
    expect(res.status).toBe(400)
  })

  it("is 404 for an unknown publication and 410 for a revoked one", async () => {
    const unknown = await connect(nextToken())
    expect(unknown.status).toBe(404)

    const token = await publish()
    await app().request(
      `${BASE}/api/publications/${token}/revoke`,
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    const revoked = await connect(token)
    expect(revoked.status).toBe(410)
  })

  it("joins a named reviewer under the name their session cookie carries", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "Maria")
    const maria = await join(token, {
      cookies: [`${COMMENTER_SESSION_COOKIE}=${cookie}`],
      section: "pg001_sec001",
    })

    const frame = await presenceWith(maria, 1)
    expect(frame.peers[0]?.name).toBe("Maria")
    expect(frame.peers[0]?.is_author).toBe(false)
    expect(frame.self_id).toBe(frame.peers[0]?.id)
  })

  it("carries a name that is not ASCII, which a header cannot hold raw", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "João 婷婷")
    const reader = await join(token, {
      cookies: [`${COMMENTER_SESSION_COOKIE}=${cookie}`],
      section: "pg001_sec001",
    })

    const frame = await presenceWith(reader, 1)
    expect(frame.peers[0]?.name).toBe("João 婷婷")
  })

  it("joins a reader who never commented as an unnamed peer", async () => {
    const token = await publish()
    const stranger = await join(token, { section: "pg001_sec001" })

    const frame = await presenceWith(stranger, 1)
    expect(frame.peers[0]?.name).toBe(PUBLISH_ANONYMOUS_NAME)
    expect(frame.peers[0]?.color).toBe(PUBLISH_ANONYMOUS_COLOR)
  })

  it("marks a ticketed join as the author", async () => {
    const token = await publish()
    const { ticket } = await ticketFor(token)
    const author = await join(token, { ticket, section: "pg001_sec001" })

    const frame = await presenceWith(author, 1)
    expect(frame.peers[0]?.is_author).toBe(true)
    expect(frame.peers[0]?.name).toBe(PUBLISH_AUTHOR_DEFAULT_NAME)
  })

  it("refuses a tampered or expired ticket", async () => {
    const token = await publish("SUNSET")
    const { ticket } = await ticketFor(token)
    const parts = ticket.split(".")
    const tampered = [parts[0], parts[1], parts[2], "AAAA"].join(".")

    expect((await connect(token, { ticket: tampered })).status).toBe(401)
    expect((await connect(token, { ticket: "v1.1.nonce.tag" })).status).toBe(401)
  })

  it("does not carry authorship onto another publication", async () => {
    const mine = await publish()
    const openLink = await publish()
    const gated = await publish("SUNSET")
    const { ticket } = await ticketFor(mine)

    /** The gated link is where a foreign ticket is visibly worthless: it buys nothing at all. */
    expect((await connect(gated, { ticket })).status).toBe(401)

    /** An open link admits anyone who has it — but as a reader, never as the author. */
    const stranger = await join(openLink, { ticket, section: "pg001_sec001" })
    const frame = await presenceWith(stranger, 1)
    expect(frame.peers[0]?.is_author).toBe(false)
    expect(frame.peers[0]?.name).toBe(PUBLISH_ANONYMOUS_NAME)
  })

  describe("on a gated publication", () => {
    it("refuses a reader with no grant cookie", async () => {
      const token = await publish("SUNSET")
      const res = await connect(token)
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: "unauthorized" })
    })

    it("admits a reader who entered the code", async () => {
      const token = await publish("SUNSET")
      const grant = await accessCookie(token, "sunset")
      const reader = await join(token, {
        cookies: [`${PUBLICATION_ACCESS_COOKIE}=${grant}`],
        section: "pg001_sec001",
      })

      await presenceWith(reader, 1)
    })

    it("admits the author on a ticket alone, with no grant cookie", async () => {
      const token = await publish("SUNSET")
      const { ticket } = await ticketFor(token)
      const author = await join(token, { ticket, section: "pg001_sec001" })

      const frame = await presenceWith(author, 1)
      expect(frame.peers[0]?.is_author).toBe(true)
    })
  })

  it("refuses the sixty-fifth socket", async () => {
    const token = await publish()
    for (let index = 0; index < PUBLICATION_ROOM_MAX_PEERS; index += 1) {
      const response = await connect(token)
      expect(response.status).toBe(101)
      const socket = response.webSocket as WebSocket
      socket.accept()
      open.push(socket)
    }

    const refused = await connect(token)
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: "rate_limited" })
  })
})

describe("presence", () => {
  it("tells both peers about each other, then about the leaver", async () => {
    const token = await publish()
    const first = await join(token, { section: "pg001_sec001" })
    const second = await join(token, { section: "pg001_sec001" })

    /** Both `hello` frames have to land before the roster settles — the second peer's join
     *  broadcast can beat the first peer's `hello` through the object. */
    const roster = await waitFor(() => {
      const frame = lastPresence(first)
      if (!frame || frame.peers.length !== 2) return null
      return frame.peers.every((peer) => peer.page_section_id === "pg001_sec001") ? frame : null
    }, "a settled roster of two readers on page one")
    expect(new Set(roster.peers.map((peer) => peer.id)).size).toBe(2)

    const seen = await presenceWith(second, 2)
    expect(seen.self_id).not.toBe(roster.self_id)

    second.ws.close()
    const afterLeave = await presenceWith(first, 1)
    expect(afterLeave.peers[0]?.id).toBe(roster.self_id)
  })

  it("re-broadcasts the roster when a peer turns the page", async () => {
    const token = await publish()
    const reader = await join(token, { section: "pg001_sec001" })
    const watcher = await join(token, { section: "pg001_sec001" })
    await presenceWith(watcher, 2)

    reader.send({ t: "page", section_id: "pg002_sec001" })

    const moved = await waitFor(() => {
      const frame = lastPresence(watcher)
      const pages = frame?.peers.map((peer) => peer.page_section_id).sort()
      return pages?.join("|") === "pg001_sec001|pg002_sec001" ? frame : null
    }, "the roster to show the page turn")
    expect(moved.peers).toHaveLength(2)
  })
})

describe("cursors", () => {
  const CURSOR = {
    t: "cursor",
    section_id: "pg001_sec001",
    selector: "#content [data-id='b3']",
    xOffsetPct: 42.5,
    yOffsetPct: 12,
  }

  it("relays a cursor to a peer on the same page, stamped with the sender's id", async () => {
    const token = await publish()
    const pointer = await join(token, { section: "pg001_sec001" })
    const watcher = await join(token, { section: "pg001_sec001" })
    const roster = await presenceWith(pointer, 2)

    pointer.send(CURSOR)

    const relayed = await waitFor(
      () => watcher.frames.find((frame) => frame.t === "cursor") ?? null,
      "a relayed cursor",
    )
    expect(relayed).toMatchObject({
      peer_id: roster.self_id,
      selector: CURSOR.selector,
      xOffsetPct: 42.5,
    })
  })

  it("never echoes a cursor back to the peer that sent it", async () => {
    const token = await publish()
    const pointer = await join(token, { section: "pg001_sec001" })
    const watcher = await join(token, { section: "pg001_sec001" })
    await presenceWith(watcher, 2)

    pointer.send(CURSOR)
    await waitFor(() => watcher.frames.find((frame) => frame.t === "cursor") ?? null, "the relay")

    expect(pointer.frames.some((frame) => frame.t === "cursor")).toBe(false)
  })

  it("does not relay a cursor to a peer reading another page", async () => {
    const token = await publish()
    const pointer = await join(token, { section: "pg001_sec001" })
    const elsewhere = await join(token, { section: "pg002_sec001" })
    const alongside = await join(token, { section: "pg001_sec001" })
    await presenceWith(alongside, 3)

    pointer.send(CURSOR)
    await waitFor(
      () => alongside.frames.find((frame) => frame.t === "cursor") ?? null,
      "the same-page relay",
    )

    expect(elsewhere.frames.some((frame) => frame.t === "cursor")).toBe(false)
  })

  it("drops malformed, oversized and non-JSON frames without dropping the socket", async () => {
    const token = await publish()
    const pointer = await join(token, { section: "pg001_sec001" })
    const watcher = await join(token, { section: "pg001_sec001" })
    await presenceWith(watcher, 2)

    pointer.ws.send("not json at all")
    pointer.send({ t: "cursor", section_id: "pg001_sec001" })
    pointer.send({ t: "unknown-frame" })
    pointer.send({ ...CURSOR, selector: "x".repeat(PUBLICATION_ROOM_MAX_FRAME_BYTES) })
    pointer.send(CURSOR)

    const relayed = await waitFor(
      () => watcher.frames.find((frame) => frame.t === "cursor") ?? null,
      "the one good cursor",
    )
    expect(relayed).toMatchObject({ selector: CURSOR.selector })
    expect(watcher.frames.filter((frame) => frame.t === "cursor")).toHaveLength(1)
  })
})

describe("comment events", () => {
  it("reaches every peer after the write commits, whatever page they are on", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "Maria")
    const onPage = await join(token, { section: "pg001_sec001" })
    const elsewhere = await join(token, { section: "pg002_sec001" })
    await presenceWith(elsewhere, 2)

    const ctx = createExecutionContext()
    const res = await app().request(
      `${BASE}/p/${token}/comments`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: `${COMMENTER_SESSION_COOKIE}=${cookie}`,
        },
        body: JSON.stringify({
          page_section_id: "pg001_sec001",
          body: "The raven should be bigger",
        }),
      },
      env,
      ctx,
    )
    expect(res.status).toBe(201)
    const { comment } = (await res.json()) as PublishCommentResponse
    await waitOnExecutionContext(ctx)

    for (const peer of [onPage, elsewhere]) {
      const frame = await waitFor(
        () => peer.frames.find((candidate) => candidate.t === "comment-created") ?? null,
        "comment-created",
      )
      expect(frame).toMatchObject({ comment: { id: comment.id, author_name: "Maria" } })
    }
  })

  it("broadcasts edits, deletes and resolutions", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "Ana")
    const watcher = await join(token, { section: "pg001_sec001" })
    await presenceWith(watcher, 1)

    const write = async (
      path: string,
      init: RequestInit,
      cookieHeader = true,
    ): Promise<Response> => {
      const ctx = createExecutionContext()
      const res = await app().request(
        `${BASE}${path}`,
        {
          ...init,
          headers: {
            "content-type": "application/json",
            ...(cookieHeader ? { Cookie: `${COMMENTER_SESSION_COOKIE}=${cookie}` } : {}),
            ...(init.headers as Record<string, string> | undefined),
          },
        },
        env,
        ctx,
      )
      await waitOnExecutionContext(ctx)
      return res
    }

    const created = await write(`/p/${token}/comments`, {
      method: "POST",
      body: JSON.stringify({ page_section_id: "pg001_sec001", body: "first" }),
    })
    const { comment } = (await created.json()) as PublishCommentResponse

    await write(`/p/${token}/comments/${comment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: "second" }),
    })
    await write(
      `/p/${token}/comments/${comment.id}/resolve`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ resolved: true }),
      },
      false,
    )
    await write(`/p/${token}/comments/${comment.id}`, { method: "DELETE" })

    const kinds = await waitFor(() => {
      const seen = watcher.frames.filter((frame) => frame.t.startsWith("comment-"))
      return seen.length >= 4 ? seen.map((frame) => frame.t) : null
    }, "four comment frames")

    expect(kinds).toEqual([
      "comment-created",
      "comment-updated",
      "comment-resolved",
      "comment-deleted",
    ])
  })

  it("still answers 201 when the room is unreachable", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "Bea")
    const ctx = createExecutionContext()
    const res = await app({ createStore: undefined }).request(
      `${BASE}/p/${token}/comments`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: `${COMMENTER_SESSION_COOKIE}=${cookie}`,
        },
        body: JSON.stringify({ page_section_id: "pg001_sec001", body: "no room, no problem" }),
      },
      { ...env, PUBLICATION_ROOM: undefined } as unknown as typeof env,
      ctx,
    )
    expect(res.status).toBe(201)
    await waitOnExecutionContext(ctx)
  })
})

describe("peer identity across a page turn", () => {
  /** Every navigation in a published book reloads the document, so the room sees a close and a
   *  fresh connect. While the id was minted per connection that read, to everybody else, as a
   *  reader leaving and a stranger arriving — the roster blinked on every page turn, and
   *  anything keyed on a peer had to key on a display name instead. */
  it("gives the same reader the same id when their tab reconnects", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "Maria")
    const cookies = [`${COMMENTER_SESSION_COOKIE}=${cookie}`]

    const first = await join(token, { cookies, section: "pg001_sec001", tab: "tab1" })
    const before = (await presenceWith(first, 1)).self_id
    first.ws.close()

    const second = await join(token, { cookies, section: "pg002_sec001", tab: "tab1" })
    expect((await presenceWith(second, 1)).self_id).toBe(before)
  })

  /** Two windows are two people in the room, so the tab has to separate them. */
  it("gives the same reader's other tab a different id", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "Maria")
    const cookies = [`${COMMENTER_SESSION_COOKIE}=${cookie}`]

    const one = await join(token, { cookies, section: "pg001_sec001", tab: "tab1" })
    const two = await join(token, { cookies, section: "pg001_sec001", tab: "tab2" })

    const roster = await presenceWith(two, 2)
    expect(new Set(roster.peers.map((peer) => peer.id)).size).toBe(2)
    expect(one.ws).toBeDefined()
  })

  /** The identity half is server-side, so asking for another reader's tab cannot borrow their
   *  name — the worst a client can do is split or merge its own tabs. */
  it("will not let a stranger's tab borrow a named reader's identity", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "Maria")

    const maria = await join(token, {
      cookies: [`${COMMENTER_SESSION_COOKIE}=${cookie}`],
      section: "pg001_sec001",
      tab: "tab1",
    })
    const mariaId = (await presenceWith(maria, 1)).self_id

    const stranger = await join(token, { section: "pg001_sec001", tab: "tab1" })
    const strangerId = (await presenceWith(stranger, 2)).self_id
    expect(strangerId).not.toBe(mariaId)
  })

  /** A reader on a snapshot published before the tab param existed keeps working. */
  it("falls back to a per-connection id when no tab is sent", async () => {
    const token = await publish()
    const cookie = await commenterCookie(token, "Maria")
    const cookies = [`${COMMENTER_SESSION_COOKIE}=${cookie}`]

    const first = await join(token, { cookies, section: "pg001_sec001" })
    const before = (await presenceWith(first, 1)).self_id
    first.ws.close()

    const second = await join(token, { cookies, section: "pg001_sec001" })
    expect((await presenceWith(second, 1)).self_id).not.toBe(before)
  })
})
