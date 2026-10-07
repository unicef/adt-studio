import { createExecutionContext, env, runDurableObjectAlarm, runInDurableObject, waitOnExecutionContext } from "cloudflare:test"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
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
import { Hono } from "hono"
import { createApp } from "./app.js"
import { createD1PublicationStore } from "./d1-store.js"
import { registerRoomTicketRoute, type RoomAppEnv } from "./room-routes.js"
import {
  ROOM_CLIENT_HEADER,
  ROOM_CODE_HEADER,
  ROOM_MAX_AUTHOR_PEERS,
  ROOM_MAX_FRAMES_PER_SECOND,
  ROOM_MAX_JOINS_PER_CLIENT_PER_MINUTE,
  ROOM_CHECK_MIN_INTERVAL_MS,
  ROOM_MAX_PEERS_PER_CLIENT,
  ROOM_PEER_HEADER,
  ROOM_PROTOCOL,
  ROOM_PROTOCOL_HEADER,
  ROOM_TOKEN_HEADER,
} from "./room.js"
import { createBookHostApp } from "./book-host-app.js"
import { hashAccessCode } from "./identity.js"
import { throttleSecretFor } from "./access-throttle.js"
import { publishSnapshot, resetBindings } from "../test/fixtures.js"

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

async function publish(accessCode?: string): Promise<string> {
  const token = nextToken()
  const sent = await publishSnapshot(
    (input, init) => app().request(input, init, { ...env, MGMT_SECRET: SECRET }),
    BASE,
    SECRET,
    {
      token,
      title: "Raven and the Sun",
      bookLabel: "raven",
      pageManifest: MANIFEST,
      files: {
        "index.html": "<h1>page one</h1>",
        "pg002_sec001.html": "<h1>page two</h1>",
      },
      ...(accessCode === undefined ? {} : { accessCode }),
    },
  )
  expect(sent.token).toBe(token)
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

beforeEach(resetBindings)

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
  options: { ticket?: string; cookies?: string[]; tab?: string; ip?: string } = {},
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
        ...(options.ip === undefined ? {} : { "cf-connecting-ip": options.ip }),
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

  /** The route must hold on its own, not only behind the middleware the control plane puts in
   *  front of it — registered without that guard, it once handed author tickets to anyone. */
  it("refuses a caller without MGMT_SECRET even where nothing guards it", async () => {
    const token = await publish()
    const bare = new Hono<RoomAppEnv>()
    registerRoomTicketRoute(bare, {
      resolveStore: (bindings) => createD1PublicationStore(bindings.DB),
      timestamp: () => new Date().toISOString(),
      newId: () => "unused",
    })
    const bindings = { ...env, MGMT_SECRET: SECRET }

    const refused = await bare.request(`${BASE}/api/publications/${token}/room-ticket`, { method: "POST" }, bindings)
    expect(refused.status).toBe(401)
    await expect(refused.text()).resolves.not.toContain("ticket")

    const allowed = await bare.request(
      `${BASE}/api/publications/${token}/room-ticket`,
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
      bindings,
    )
    expect(allowed.status).toBe(200)
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

  async function hold(response: Response): Promise<void> {
    expect(response.status).toBe(101)
    const socket = response.webSocket as WebSocket
    socket.accept()
    open.push(socket)
  }

  it("refuses the sixty-fifth reader", async () => {
    const token = await publish()
    for (let index = 0; index < PUBLICATION_ROOM_MAX_PEERS; index += 1) {
      await hold(await connect(token, { ip: `198.51.100.${index}` }))
    }

    const refused = await connect(token, { ip: "203.0.113.200" })
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: "rate_limited" })
  })

  /** One client holding sockets open used to take every seat, the author's included. */
  it("keeps one network to its share of the room, IPv6 by /64", async () => {
    const token = await publish()
    for (let index = 0; index < ROOM_MAX_PEERS_PER_CLIENT; index += 1) {
      await hold(await connect(token, { ip: `2001:db8:1:2::${(index + 1).toString(16)}` }))
    }

    expect((await connect(token, { ip: "2001:db8:1:2:ffff::1" })).status).toBe(429)
    await hold(await connect(token, { ip: "2001:db8:1:3::1" }))
  })

  it("admits the author to a room readers have filled, up to the author's own bound", async () => {
    const token = await publish()
    for (let index = 0; index < PUBLICATION_ROOM_MAX_PEERS; index += 1) {
      await hold(await connect(token, { ip: `198.51.100.${index}` }))
    }

    for (let index = 0; index < ROOM_MAX_AUTHOR_PEERS; index += 1) {
      await hold(await connect(token, { ticket: (await ticketFor(token)).ticket, ip: "198.51.100.0" }))
    }
    expect((await connect(token, { ticket: (await ticketFor(token)).ticket })).status).toBe(429)
    expect((await connect(token, { ip: "203.0.113.200" })).status).toBe(429)
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

/** A reader the author shut out used to keep receiving everything over the socket they already
 *  had open — new comments, replies and the roster — for as long as it lived. */
describe("when a book's access changes", () => {
  function admin(token: string, path: string, init: RequestInit = {}): Promise<Response> {
    return app().request(
      `${BASE}/api/publications/${token}${path}`,
      { ...init, headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json", ...init.headers } },
      env,
    )
  }

  function closeOf(client: RoomPeerClient): () => number | null {
    let code: number | null = null
    client.ws.addEventListener("close", (event) => {
      code = (event as CloseEvent).code
    })
    return () => code
  }

  async function readerAndAuthor(code = "SUNSET") {
    const token = await publish(code)
    const grant = await accessCookie(token, code.toLowerCase())
    const reader = await join(token, { cookies: [`${PUBLICATION_ACCESS_COOKIE}=${grant}`], section: "pg001_sec001" })
    const { ticket } = await ticketFor(token)
    const author = await join(token, { ticket, section: "pg001_sec001" })
    await presenceWith(author, 2)
    return { token, grant, reader, author, readerClosed: closeOf(reader) }
  }

  it("closes readers' sockets on revoke and keeps the author's", async () => {
    const { token, author, readerClosed } = await readerAndAuthor()
    expect((await admin(token, "/revoke", { method: "POST" })).status).toBe(200)

    expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
    const roster = await presenceWith(author, 1)
    expect(roster.peers[0]?.is_author).toBe(true)
  })

  it("closes readers' sockets on delete", async () => {
    const { token, readerClosed } = await readerAndAuthor()
    expect((await admin(token, "", { method: "DELETE" })).status).toBe(200)
    expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
  })

  it("closes readers on a new code; the old grant can't rejoin, the new code can", async () => {
    const { token, grant, readerClosed } = await readerAndAuthor()
    expect((await admin(token, "", { method: "PATCH", body: JSON.stringify({ access_code: "MOONRISE" }) })).status).toBe(200)

    expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
    expect((await connect(token, { cookies: [`${PUBLICATION_ACCESS_COOKIE}=${grant}`] })).status).toBe(401)
    const fresh = await accessCookie(token, "moonrise")
    await join(token, { cookies: [`${PUBLICATION_ACCESS_COOKIE}=${fresh}`], section: "pg001_sec001" })
  })

  it("tells only the author about a comment on a book that no longer admits readers", async () => {
    const { token, reader, author, readerClosed } = await readerAndAuthor()
    await env.DB.prepare("UPDATE publications SET expires_at = ? WHERE token = ?")
      .bind(new Date(Date.now() - 60_000).toISOString(), token)
      .run()

    const ctx = createExecutionContext()
    const res = await app().request(
      `${BASE}/p/${token}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ page_section_id: "pg001_sec001", body: "A note for my eyes only" }),
      },
      env,
      ctx,
    )
    expect(res.status).toBe(201)
    await waitOnExecutionContext(ctx)

    await waitFor(() => author.frames.find((frame) => frame.t === "comment-created") ?? null, "the author's frame")
    expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
    expect(reader.frames.some((frame) => frame.t === "comment-created")).toBe(false)
  })

  /** A join the door approved just before a new code can reach the room after the sweep. The
   *  room re-reads the book itself, so that late join is refused rather than left connected. */
  it("refuses a reader join that arrives after the code it was checked against changed", async () => {
    const token = await publish("SUNSET")
    const before = await env.DB.prepare("SELECT access_code FROM publications WHERE token = ?").bind(token).first<{ access_code: string }>()
    expect((await admin(token, "", { method: "PATCH", body: JSON.stringify({ access_code: "MOONRISE" }) })).status).toBe(200)

    const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
    const peer = { id: "late", name: "Late reader", color: "#336699", is_author: false, page_section_id: null, device: "full" }
    const late = await room.fetch("https://publication-room.invalid/connect", {
      headers: {
        upgrade: "websocket",
        [ROOM_PROTOCOL_HEADER]: ROOM_PROTOCOL,
        [ROOM_PEER_HEADER]: encodeURIComponent(JSON.stringify(peer)),
        [ROOM_TOKEN_HEADER]: token,
        [ROOM_CLIENT_HEADER]: "ab12",
        [ROOM_CODE_HEADER]: before?.access_code ?? "",
      },
    })
    const socket = late.webSocket as WebSocket
    let closedWith: number | null = null
    socket.addEventListener("close", (event) => {
      closedWith = (event as CloseEvent).code
    })
    socket.accept()
    open.push(socket)
    expect(await waitFor(() => closedWith, "the late join to be closed")).toBe(4403)
  })

  /** The sweep a code change sends can be lost. The next comment carries the book's code as it
   *  is now, and a reader who joined under another one is closed before that comment goes out. */
  it("closes a reader on the next comment when a new code's sweep never reached the room", async () => {
    const { token, reader, author, readerClosed } = await readerAndAuthor()
    await env.DB.prepare("UPDATE publications SET access_code = ? WHERE token = ?")
      .bind(await hashAccessCode("MOONRISE"), token)
      .run()

    const ctx = createExecutionContext()
    const res = await app().request(
      `${BASE}/p/${token}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ page_section_id: "pg001_sec001", body: "After the new code" }),
      },
      env,
      ctx,
    )
    expect(res.status).toBe(201)
    await waitOnExecutionContext(ctx)

    await waitFor(() => author.frames.find((frame) => frame.t === "comment-created") ?? null, "the author's frame")
    expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
    expect(reader.frames.some((frame) => frame.t === "comment-created")).toBe(false)
  })

  /** The room decides who hears a comment from the book as it is when the frame arrives. A
   *  sender may predate a revoke or a new code, or be a host too old to say anything at all. */
  describe("whoever sends the comment", () => {
    async function postedComment(token: string) {
      const res = await app().request(
        `${BASE}/p/${token}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
          body: JSON.stringify({ page_section_id: "pg001_sec001", body: "Before the change" }),
        },
        env,
      )
      expect(res.status).toBe(201)
      return ((await res.json()) as { comment: unknown }).comment
    }

    function notifyAsOldHost(token: string, comment: unknown, staleHeaders: Record<string, string> = {}) {
      const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
      return room.fetch("https://publication-room.invalid/notify", {
        method: "POST",
        headers: { "content-type": "application/json", ...staleHeaders },
        body: JSON.stringify({ t: "comment-updated", comment }),
      })
    }

    const changes: Array<[string, (token: string) => Promise<unknown>]> = [
      ["revoked", (token) => env.DB.prepare("UPDATE publications SET revoked_at = ? WHERE token = ?").bind(new Date().toISOString(), token).run()],
      ["expired", (token) => env.DB.prepare("UPDATE publications SET expires_at = ? WHERE token = ?").bind(new Date(Date.now() - 60_000).toISOString(), token).run()],
      ["given a new code", async (token) => env.DB.prepare("UPDATE publications SET access_code = ? WHERE token = ?").bind(await hashAccessCode("MOONRISE"), token).run()],
    ]

    it.each(changes)("tells only the author when the book was %s and the sender didn't say", async (_change, apply) => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      const comment = await postedComment(token)
      await waitFor(() => reader.frames.find((frame) => frame.t === "comment-created") ?? null, "the reader's first frame")
      await apply(token)

      expect((await notifyAsOldHost(token, comment)).status).toBe(204)

      await waitFor(() => author.frames.find((frame) => frame.t === "comment-updated") ?? null, "the author's frame")
      expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
      expect(reader.frames.some((frame) => frame.t === "comment-updated")).toBe(false)
    })

    it("ignores a sender that still believes the book admits its readers", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      const comment = await postedComment(token)
      const before = await env.DB.prepare("SELECT access_code FROM publications WHERE token = ?").bind(token).first<{ access_code: string }>()
      await env.DB.prepare("UPDATE publications SET revoked_at = ? WHERE token = ?").bind(new Date().toISOString(), token).run()

      await notifyAsOldHost(token, comment, { "x-adt-room-readers": "1", [ROOM_CODE_HEADER]: before?.access_code ?? "" })

      await waitFor(() => author.frames.find((frame) => frame.t === "comment-updated") ?? null, "the author's frame")
      expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
      expect(reader.frames.some((frame) => frame.t === "comment-updated")).toBe(false)
    })

    it("still reaches readers of a book with no code", async () => {
      const token = await publish()
      const reader = await join(token, { section: "pg001_sec001" })
      const comment = await postedComment(token)
      await waitFor(() => reader.frames.find((frame) => frame.t === "comment-created") ?? null, "the reader's frame")
      await notifyAsOldHost(token, comment)
      await waitFor(() => reader.frames.find((frame) => frame.t === "comment-updated") ?? null, "the reader's later frame")
    })
  })

  it("keeps delivering to a reader whose code still holds", async () => {
    const { token, reader } = await readerAndAuthor()
    const ctx = createExecutionContext()
    const res = await app().request(
      `${BASE}/p/${token}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ page_section_id: "pg001_sec001", body: "Same code" }),
      },
      env,
      ctx,
    )
    expect(res.status).toBe(201)
    await waitOnExecutionContext(ctx)
    await waitFor(() => reader.frames.find((frame) => frame.t === "comment-created") ?? null, "the reader's frame")
  })

  /** A host deployed before the room protocol could mint author tickets for anyone and answer for
   *  every book. The room cannot tell its honest joins from those, so it takes none of them. */
  it("refuses every join from a book host that predates the room protocol", async () => {
    const token = await publish()
    const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
    const asOldHost = (peer: Record<string, unknown>) =>
      room.fetch("https://publication-room.invalid/connect", {
        headers: { upgrade: "websocket", [ROOM_PEER_HEADER]: encodeURIComponent(JSON.stringify(peer)) },
      })
    const base = { name: "Visitor", color: "#336699", page_section_id: null, device: "full" }

    expect((await asOldHost({ ...base, id: "reader", is_author: false })).status).toBe(426)
    expect((await asOldHost({ ...base, id: "author", is_author: true })).status).toBe(426)
  })

  it("drops a socket's frames beyond its per-second allowance", async () => {
    const token = await publish()
    const sender = await join(token, { section: "pg001_sec001" })
    const watcher = await join(token, { section: "pg001_sec001" })
    await presenceWith(watcher, 2)

    for (let i = 0; i < ROOM_MAX_FRAMES_PER_SECOND * 3; i += 1) {
      sender.send({ t: "cursor", section_id: "pg001_sec001", selector: "#content", xOffsetPct: 1, yOffsetPct: 1 })
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
    const relayed = watcher.frames.filter((frame) => frame.t === "cursor").length
    expect(relayed).toBeGreaterThan(0)
    expect(relayed).toBeLessThanOrEqual(ROOM_MAX_FRAMES_PER_SECOND + 10)
  })

  /** Roster frames are checked against the book before anyone hears them, so they must not be a
   *  way to keep D1 reading: a no-op costs nothing, and real changes have a small allowance. */
  it("keeps a flood of roster frames from becoming a flood of reads", async () => {
    const token = await publish()
    const sender = await join(token, { section: "pg001_sec001" })
    const watcher = await join(token, { section: "pg001_sec001" })
    await presenceWith(watcher, 2)
    await new Promise((resolve) => setTimeout(resolve, 100))

    let reads = 0
    const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
    await runInDurableObject(room, (instance) => {
      const target = instance as unknown as { env: { DB: D1Database } }
      const real = target.env.DB
      target.env = { ...target.env, DB: { prepare: (sql: string) => ((reads += 1), real.prepare(sql)) } as unknown as D1Database }
    })

    for (let i = 0; i < 60; i += 1) sender.send({ t: "page", section_id: "pg001_sec001" })
    for (let i = 0; i < 60; i += 1) sender.send({ t: "device", device: "full" })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(reads).toBe(0)

    for (let i = 0; i < 60; i += 1) sender.send({ t: "page", section_id: i % 2 === 0 ? "pg002_sec001" : "pg003_sec001" })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(reads).toBeLessThanOrEqual(Math.ceil(300 / ROOM_CHECK_MIN_INTERVAL_MS) + 1)
    const roster = await waitFor(() => {
      const frame = watcher.presence().at(-1)
      return frame?.peers.some((peer) => peer.page_section_id === "pg003_sec001") ? frame : null
    }, "the roster to show the last page turned to")
    expect(roster.peers.some((peer) => peer.page_section_id === "pg003_sec001")).toBe(true)
  })

  /** A roster goes out once per batch, and a `hello` that changed nothing is answered to its
   *  sender alone, so a flood of either can't multiply into a roster per frame per peer. */
  it("sends one roster per batch and answers an idle hello only to its sender", async () => {
    const token = await publish()
    const watcher = await join(token, { section: "pg001_sec001" })
    const senders = await Promise.all(Array.from({ length: 8 }, () => join(token, { section: "pg001_sec001" })))
    await presenceWith(watcher, 9)
    await new Promise((resolve) => setTimeout(resolve, 200))

    const idle = watcher.presence().length
    for (let round = 0; round < 20; round += 1) for (const sender of senders) sender.send({ t: "hello", section_id: "pg001_sec001" })
    await waitFor(() => senders[0]!.presence().length > 1 ? true : null, "the asker's own roster")
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(watcher.presence().length).toBe(idle)

    const busy = watcher.presence().length
    for (const sender of senders) sender.send({ t: "page", section_id: "pg002_sec001" })
    await waitFor(() => {
      const frame = watcher.presence().at(-1)
      return frame && frame.peers.filter((peer) => peer.page_section_id === "pg002_sec001").length === 8 ? frame : null
    }, "every page turn in the roster")
    expect(watcher.presence().length - busy).toBeLessThanOrEqual(3)
  })

  /** Page turns faster than the room checks land on the last one, not on the first. */
  it("keeps the last of several quick page turns", async () => {
    const token = await publish()
    const sender = await join(token, { section: "pg001_sec001" })
    const watcher = await join(token, { section: "pg001_sec001" })
    await presenceWith(watcher, 2)

    for (const section of ["pg002_sec001", "pg003_sec001", "pg004_sec001", "pg002_sec001", "pg001_sec001", "pg004_sec001"]) {
      sender.send({ t: "page", section_id: section })
    }
    await waitFor(() => {
      const frame = watcher.presence().at(-1)
      return frame?.peers.some((peer) => peer.page_section_id === "pg004_sec001") ? frame : null
    }, "the roster to settle on the last page")
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(watcher.presence().at(-1)?.peers.some((peer) => peer.page_section_id === "pg004_sec001")).toBe(true)
  })

  /** Every join and departure reads the book, so reconnecting in a loop is bounded per network. */
  it("refuses a network that keeps reconnecting", async () => {
    const token = await publish()
    const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
    await runInDurableObject(room, (instance) => {
      const joins = (instance as unknown as { joins: Map<string, number[]> }).joins
      joins.set("ab12", Array.from({ length: ROOM_MAX_JOINS_PER_CLIENT_PER_MINUTE }, () => Date.now()))
    })
    const asReader = (client: string) =>
      room.fetch("https://publication-room.invalid/connect", {
        headers: {
          upgrade: "websocket",
          [ROOM_PROTOCOL_HEADER]: ROOM_PROTOCOL,
          [ROOM_PEER_HEADER]: encodeURIComponent(
            JSON.stringify({ id: "p", name: "Visitor", color: "#336699", is_author: false, page_section_id: null, device: "full" }),
          ),
          [ROOM_TOKEN_HEADER]: token,
          [ROOM_CLIENT_HEADER]: client,
          [ROOM_CODE_HEADER]: "",
        },
      })

    expect((await asReader("ab12")).status).toBe(429)
    const other = await asReader("cd34")
    expect(other.status).toBe(101)
    open.push(other.webSocket as WebSocket)
    ;(other.webSocket as WebSocket).accept()
  })

  it("seats nobody in a room that is not their book's", async () => {
    const token = await publish()
    const other = await publish()
    const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
    const join = (book: string | null, isAuthor: boolean) =>
      room.fetch("https://publication-room.invalid/connect", {
        headers: {
          upgrade: "websocket",
          [ROOM_PROTOCOL_HEADER]: ROOM_PROTOCOL,
          [ROOM_PEER_HEADER]: encodeURIComponent(
            JSON.stringify({ id: "p", name: "Visitor", color: "#336699", is_author: isAuthor, page_section_id: null, device: "full" }),
          ),
          [ROOM_CLIENT_HEADER]: "ab12",
          ...(book === null ? {} : { [ROOM_TOKEN_HEADER]: book }),
        },
      })

    expect((await join(other, true)).status).toBe(400)
    expect((await join(other, false)).status).toBe(400)
    expect((await join(null, true)).status).toBe(400)
  })

  /** A lost `/evict` used to leave a reader whose access ended trading cursors and the roster for
   *  as long as their socket lived. */
  describe("live traffic after a lost eviction", () => {
    const cursorOn = (section: string) => ({ t: "cursor" as const, section_id: section, selector: "#content", xOffsetPct: 10, yOffsetPct: 10 })

    /** Stands in for `ROOM_POSITION_CHECK_MS` passing: the next cursor or viewport reads the book. */
    async function forgetLastCheck(token: string): Promise<void> {
      const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
      await runInDurableObject(room, (instance) => {
        ;(instance as unknown as { positions: unknown }).positions = null
      })
    }

    it("closes an old-code reader the moment a reader joins under the new code", async () => {
      const { token, reader, readerClosed } = await readerAndAuthor()
      await env.DB.prepare("UPDATE publications SET access_code = ? WHERE token = ?").bind(await hashAccessCode("MOONRISE"), token).run()

      const fresh = await join(token, { cookies: [`${PUBLICATION_ACCESS_COOKIE}=${await accessCookie(token, "moonrise")}`], section: "pg001_sec001" })
      expect(await waitFor(readerClosed, "the old-code reader to close")).toBe(4403)

      fresh.send(cursorOn("pg001_sec001"))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(reader.frames.some((frame) => frame.t === "cursor")).toBe(false)
    })

    it("closes a reader whose book was revoked on the next live frame past the window", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      await env.DB.prepare("UPDATE publications SET revoked_at = ? WHERE token = ?").bind(new Date().toISOString(), token).run()
      await forgetLastCheck(token)

      author.send(cursorOn("pg001_sec001"))
      expect(await waitFor(readerClosed, "the revoked reader to close")).toBe(4403)
      expect(reader.frames.some((frame) => frame.t === "cursor")).toBe(false)
    })

    it("drops a cursor sent by a reader whose access ended", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      await env.DB.prepare("UPDATE publications SET revoked_at = ? WHERE token = ?").bind(new Date().toISOString(), token).run()
      await forgetLastCheck(token)

      reader.send(cursorOn("pg001_sec001"))
      expect(await waitFor(readerClosed, "the revoked reader to close")).toBe(4403)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(author.frames.some((frame) => frame.t === "cursor")).toBe(false)
    })

    it("sends no roster to a reader whose access ended when someone else leaves", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      const other = await join(token, { cookies: [`${PUBLICATION_ACCESS_COOKIE}=${await accessCookie(token, "sunset")}`], section: "pg001_sec001" })
      await presenceWith(author, 3)
      await env.DB.prepare("UPDATE publications SET revoked_at = ? WHERE token = ?").bind(new Date().toISOString(), token).run()
      await forgetLastCheck(token)
      const rostersBefore = reader.presence().length

      other.ws.close()
      expect(await waitFor(readerClosed, "the revoked reader to close")).toBe(4403)
      expect(reader.presence()).toHaveLength(rostersBefore)
    })

    /** A check that read the book before a new code must not close a reader who joined under
     *  that code while the read was in flight: their own join already judged them. */
    it("leaves alone a reader who joined while an older check was reading the book", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
      let release = () => {}
      const held = new Promise<void>((resolve) => (release = resolve))
      await runInDurableObject(room, (instance) => {
        const target = instance as unknown as { env: { DB: D1Database }; accessCheckedAt: number }
        const real = target.env.DB
        let first = true
        const slow = {
          prepare: (sql: string) => {
            const statement = real.prepare(sql)
            return {
              bind: (...values: unknown[]) => {
                const bound = statement.bind(...values)
                return {
                  first: async () => {
                    const row = await bound.first()
                    if (first) {
                      first = false
                      await held
                    }
                    return row
                  },
                }
              },
            }
          },
        }
        target.env = { ...target.env, DB: slow as unknown as D1Database }
        target.accessCheckedAt = 0
      })

      author.send(cursorOn("pg001_sec001"))
      await new Promise((resolve) => setTimeout(resolve, 50))
      await env.DB.prepare("UPDATE publications SET access_code = ? WHERE token = ?").bind(await hashAccessCode("MOONRISE"), token).run()
      const grant = await accessCookie(token, "moonrise")
      const joining = join(token, { cookies: [`${PUBLICATION_ACCESS_COOKIE}=${grant}`], section: "pg001_sec001" })
      await new Promise((resolve) => setTimeout(resolve, 50))

      release()
      const fresh = await joining
      expect(await waitFor(readerClosed, "the old-code reader to close")).toBe(4403)
      await new Promise((resolve) => setTimeout(resolve, 100))
      let freshClosed: number | null = null
      fresh.ws.addEventListener("close", (event) => (freshClosed = (event as CloseEvent).code))
      author.send({ ...cursorOn("pg001_sec001"), xOffsetPct: 77 })
      await waitFor(() => fresh.frames.find((frame) => frame.t === "cursor") ?? null, "the new reader to see the author's cursor")
      expect(freshClosed).toBeNull()
      expect(reader.frames.some((frame) => frame.t === "cursor" && frame.xOffsetPct === 77)).toBe(false)
    })

    async function failingDatabase(token: string): Promise<void> {
      const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
      await runInDurableObject(room, (instance) => {
        const target = instance as unknown as { env: { DB: D1Database } }
        const failing = {
          prepare: () => {
            throw new Error("D1 is unavailable")
          },
        }
        target.env = { ...target.env, DB: failing as unknown as D1Database }
      })
    }

    const liveFrames = (client: RoomPeerClient) =>
      client.frames.filter((frame) => frame.t === "cursor" || frame.t === "viewport" || frame.t === "presence").length

    it("sends a reader whose access ended nothing when an author joins", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      await env.DB.prepare("UPDATE publications SET access_code = ? WHERE token = ?").bind(await hashAccessCode("MOONRISE"), token).run()
      await forgetLastCheck(token)
      const before = liveFrames(reader)

      await join(token, { ticket: (await ticketFor(token)).ticket, section: "pg001_sec001" })
      await presenceWith(author, 2)
      expect(await waitFor(readerClosed, "the revoked reader to close")).toBe(4403)
      expect(liveFrames(reader)).toBe(before)
    })

    /** Rosters are checked on every delivery: no window, however recently positions were read. */
    it("sends a reader whose access ended no roster, however recently the room last checked", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      await env.DB.prepare("UPDATE publications SET revoked_at = ? WHERE token = ?").bind(new Date().toISOString(), token).run()
      const rosters = reader.presence().length

      author.send({ t: "page", section_id: "pg002_sec001" })
      expect(await waitFor(readerClosed, "the revoked reader to close")).toBe(4403)
      expect(reader.presence()).toHaveLength(rosters)
    })

    it("stops positions reaching a reader whose access ended once the position check expires", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      await env.DB.prepare("UPDATE publications SET revoked_at = ? WHERE token = ?").bind(new Date().toISOString(), token).run()
      await forgetLastCheck(token)
      const before = liveFrames(reader)

      author.send({ t: "viewport", section_id: "pg001_sec001", selector: "#content", xOffsetPct: 1, yOffsetPct: 1 })
      expect(await waitFor(readerClosed, "the revoked reader to close")).toBe(4403)
      expect(liveFrames(reader)).toBe(before)
    })

    it("sends readers no live frames while the book can't be read, and keeps the author", async () => {
      const { token, reader, author, readerClosed } = await readerAndAuthor()
      const other = await join(token, { cookies: [`${PUBLICATION_ACCESS_COOKIE}=${await accessCookie(token, "sunset")}`], section: "pg001_sec001" })
      await presenceWith(author, 3)
      await failingDatabase(token)
      await forgetLastCheck(token)
      const before = liveFrames(reader)
      const authorBefore = author.frames.length

      author.send(cursorOn("pg001_sec001"))
      author.send({ t: "viewport", section_id: "pg001_sec001", selector: "#content", xOffsetPct: 1, yOffsetPct: 1 })
      other.send(cursorOn("pg001_sec001"))
      other.ws.close()
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(liveFrames(reader)).toBe(before)
      expect(readerClosed()).toBeNull()
      expect(author.frames.slice(authorBefore).some((frame) => frame.t === "cursor")).toBe(false)
      const second = await join(token, { ticket: (await ticketFor(token)).ticket, section: "pg001_sec001" })
      await waitFor(() => second.frames.find((frame) => frame.t === "presence") ?? null, "a roster for the second author window")
    })

    it("keeps current readers and the author trading cursors", async () => {
      const { token, reader, author } = await readerAndAuthor()
      await forgetLastCheck(token)

      reader.send(cursorOn("pg001_sec001"))
      await waitFor(() => author.frames.find((frame) => frame.t === "cursor") ?? null, "the author to see the reader's cursor")
      author.send(cursorOn("pg001_sec001"))
      await waitFor(() => reader.frames.find((frame) => frame.t === "cursor") ?? null, "the reader to see the author's cursor")
    })
  })

  it("stops a revoked reader's cursor reaching the author, and drops them from the roster", async () => {
    const { token, reader, author, readerClosed } = await readerAndAuthor()
    expect((await admin(token, "/revoke", { method: "POST" })).status).toBe(200)
    await waitFor(readerClosed, "the reader's socket to close")

    try {
      reader.send({ t: "cursor", section_id: "pg001_sec001", selector: "#content", xOffsetPct: 10, yOffsetPct: 10 })
    } catch {
      /** A closed socket refusing to send is the point. */
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(author.frames.some((frame) => frame.t === "cursor")).toBe(false)
    expect((await presenceWith(author, 1)).peers.every((peer) => peer.is_author)).toBe(true)
  })

  it("leaves a revoked reader out after the book is reinstated", async () => {
    const { token, readerClosed, author } = await readerAndAuthor()
    expect((await admin(token, "/revoke", { method: "POST" })).status).toBe(200)
    await waitFor(readerClosed, "the reader's socket to close")
    expect((await admin(token, "/reinstate", { method: "POST" })).status).toBe(200)

    expect((await presenceWith(author, 1)).peers.every((peer) => peer.is_author)).toBe(true)
  })

  it("closes readers who joined freely when the book gains a code", async () => {
    const token = await publish()
    const reader = await join(token, { section: "pg001_sec001" })
    await presenceWith(reader, 1)
    const readerClosed = closeOf(reader)

    expect((await admin(token, "", { method: "PATCH", body: JSON.stringify({ access_code: "SUNSET" }) })).status).toBe(200)
    expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
    expect((await connect(token)).status).toBe(401)
  })

  /** Readers join through the book's own host and the author through the control plane; they
   *  must be the one room, or closing it from the control plane would miss every reader. */
  it("closes a reader who joined through the book's own host", async () => {
    const token = await publish("SUNSET")
    const hostSecret = (await throttleSecretFor({ MGMT_SECRET: SECRET }, token)) as string
    const hostEnv = { ...env, MGMT_SECRET: hostSecret, BOOK_TOKEN: token }
    const host = createBookHostApp()
    const door = await host.request(
      `${BASE}/p/${token}/access`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "sunset" }) },
      hostEnv,
    )
    expect(door.status).toBe(204)
    const grant = /adt_pub_access=([^;]+)/.exec(door.headers.get("set-cookie") ?? "")?.[1]
    const upgrade = await host.request(
      `${BASE}/p/${token}/room`,
      { headers: { Upgrade: "websocket", Cookie: `${PUBLICATION_ACCESS_COOKIE}=${grant}` } },
      hostEnv,
    )
    expect(upgrade.status).toBe(101)
    const socket = upgrade.webSocket as WebSocket
    let closedWith: number | null = null
    socket.addEventListener("close", (event) => {
      closedWith = (event as CloseEvent).code
    })
    socket.accept()
    open.push(socket)

    expect((await admin(token, "/revoke", { method: "POST" })).status).toBe(200)
    expect(await waitFor(() => closedWith, "the book host reader's socket to close")).toBe(4403)
  })

  it("closes readers when the book's end date arrives, with no request to prompt it", async () => {
    const token = await publish("SUNSET")
    expect(
      (await admin(token, "", { method: "PATCH", body: JSON.stringify({ expires_at: new Date(Date.now() + 3_600_000).toISOString() }) })).status,
    ).toBe(200)
    const grant = await accessCookie(token, "sunset")
    const reader = await join(token, { cookies: [`${PUBLICATION_ACCESS_COOKIE}=${grant}`], section: "pg001_sec001" })
    await presenceWith(reader, 1)
    const readerClosed = closeOf(reader)

    const room = env.PUBLICATION_ROOM.get(env.PUBLICATION_ROOM.idFromName(token))
    expect(await runDurableObjectAlarm(room)).toBe(true)
    expect(await waitFor(readerClosed, "the reader's socket to close")).toBe(4403)
  })
})

