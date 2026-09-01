import { describe, expect, it } from "vitest"
import {
  COMMENTER_SESSION_COOKIE,
  type CommenterSessionResponse,
  type PublishComment,
  type PublishCommentListResponse,
} from "@adt/types"
import { createApp } from "./app.js"
import { filterCommentThreads } from "./comment-threads.js"
import { createMemoryPublicationStore, createMemoryR2Bucket } from "./testing.js"
import type { PublicationStore } from "./store.js"

const TOKEN = "aBcDeFgHiJkLmNoPqRsTuVwXyZ012345"
const SECRET = "mgmt-secret-value"
const SECTION = "pg001_sec001"
const ANCHOR = { selector: "#content [data-id='b1']", xOffsetPct: 10, yOffsetPct: 20 }

const env = { MGMT_SECRET: SECRET }

async function harness(): Promise<{ app: ReturnType<typeof createApp>; store: PublicationStore }> {
  const store = createMemoryPublicationStore()
  await store.create({
    publication: {
      token: TOKEN,
      title: "Raven and the Sun",
      book_label: "raven",
      current_version: 1,
      created_at: "2026-08-03T10:00:00.000Z",
      expires_at: null,
      revoked_at: null,
    },
    pageManifest: [{ section_id: SECTION, href: "index.html", page_number: 1 }],
  })
  let counter = 0
  const app = createApp({
    store,
    now: () => new Date("2026-08-03T11:00:00.000Z"),
    newId: () => {
      counter += 1
      return `id-${counter}`
    },
  })
  return { app, store }
}

function comment(overrides: Partial<PublishComment> = {}): PublishComment {
  return {
    id: "c1",
    token: TOKEN,
    version: 1,
    page_section_id: SECTION,
    parent_id: null,
    session_id: "s1",
    author_name: "Maria",
    author_color: "#e5484d",
    body: "Pin",
    anchor: ANCHOR,
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-03T11:00:00.000Z",
    ...overrides,
  }
}

describe("filterCommentThreads", () => {
  const root = comment({ id: "root" })
  const reply = comment({ id: "reply", parent_id: "root", anchor: null })

  it("keeps an unresolved thread whole", () => {
    expect(
      filterCommentThreads([root, reply], { includeResolved: false, includeDeleted: false }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["root", "reply"])
  })

  it("drops a resolved root and its replies unless resolved are included", () => {
    const resolved = comment({ id: "root", resolved_at: "2026-08-03T12:00:00.000Z" })
    expect(
      filterCommentThreads([resolved, reply], { includeResolved: false, includeDeleted: false }),
    ).toEqual([])
    expect(
      filterCommentThreads([resolved, reply], { includeResolved: true, includeDeleted: false }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["root", "reply"])
  })

  it("drops a deleted root's thread but keeps siblings of a deleted reply", () => {
    const deletedRoot = comment({ id: "root", deleted_at: "2026-08-03T12:00:00.000Z" })
    expect(
      filterCommentThreads([deletedRoot, reply], { includeResolved: false, includeDeleted: false }),
    ).toEqual([])

    const deletedReply = comment({ id: "reply", parent_id: "root", deleted_at: "2026-08-03Z" })
    const otherReply = comment({ id: "reply-2", parent_id: "root" })
    expect(
      filterCommentThreads([root, deletedReply, otherReply], {
        includeResolved: false,
        includeDeleted: false,
      }).map((entry) => entry.id),
    ).toEqual(["root", "reply-2"])
  })

  it("reads the version off the root so a later reply travels with its thread", () => {
    const laterReply = comment({ id: "reply", parent_id: "root", version: 2, anchor: null })
    expect(
      filterCommentThreads([root, laterReply], {
        version: 1,
        includeResolved: false,
        includeDeleted: false,
      }).map((entry) => entry.id),
    ).toEqual(["root", "reply"])
    expect(
      filterCommentThreads([root, laterReply], {
        version: 2,
        includeResolved: false,
        includeDeleted: false,
      }),
    ).toEqual([])
  })
})

describe("comment route shapes", () => {
  it("issues a session and accepts the cookie it just set", async () => {
    const { app } = await harness()
    const claimed = await app.request(
      `/p/${TOKEN}/session`,
      { method: "POST", body: JSON.stringify({ name: "Maria" }) },
      env,
    )
    expect(claimed.status).toBe(201)
    const session = ((await claimed.json()) as CommenterSessionResponse).session
    expect(session.id).toBe("id-1")

    const cookie = /adt_pub_session=([^;]+)/.exec(claimed.headers.get("set-cookie") ?? "")?.[1]
    const created = await app.request(
      `/p/${TOKEN}/comments`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: `${COMMENTER_SESSION_COOKIE}=${cookie ?? ""}`,
        },
        body: JSON.stringify({ page_section_id: SECTION, body: "Pin", anchor: ANCHOR }),
      },
      env,
    )
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toMatchObject({
      comment: { author_name: "Maria", version: 1, anchor: ANCHOR },
    })
  })

  it("cannot issue sessions when the worker has no MGMT_SECRET bound", async () => {
    const { app } = await harness()
    for (const path of [`/p/${TOKEN}/session`, `/p/${TOKEN}/session/claim`]) {
      const res = await app.request(
        path,
        { method: "POST", body: JSON.stringify({ name: "Maria", pin: "2468" }) },
        {},
      )
      expect(res.status, path).toBe(500)
      await expect(res.json(), path).resolves.toMatchObject({ error: "internal_error" })
    }
  })

  it("claims a pinned identity with a fresh cookie and refuses a wrong PIN", async () => {
    const { app } = await harness()
    const created = await app.request(
      `/p/${TOKEN}/session`,
      { method: "POST", body: JSON.stringify({ name: "Maria", pin: "2468" }) },
      env,
    )
    expect(created.status).toBe(201)

    const claimed = await app.request(
      `/p/${TOKEN}/session/claim`,
      { method: "POST", body: JSON.stringify({ name: "Maria", pin: "2468" }) },
      env,
    )
    expect(claimed.status).toBe(200)
    await expect(claimed.json()).resolves.toMatchObject({
      session: { id: "id-1", name: "Maria", is_author: false },
    })
    expect(claimed.headers.get("set-cookie")).toContain("Max-Age=7776000")

    const wrong = await app.request(
      `/p/${TOKEN}/session/claim`,
      { method: "POST", body: JSON.stringify({ name: "Maria", pin: "1111" }) },
      env,
    )
    expect(wrong.status).toBe(401)
    await expect(wrong.json()).resolves.toMatchObject({ error: "invalid_claim" })
  })

  /** M3.5: only a name that is *claimable* is reserved, and only against another claim. Two
   *  pinless namesakes are two invited readers, which the access code already vouched for. */
  it("refuses a second pinned session on a name that is already claimable here", async () => {
    const { app } = await harness()
    await app.request(
      `/p/${TOKEN}/session`,
      { method: "POST", body: JSON.stringify({ name: "Maria", pin: "2468" }) },
      env,
    )
    const again = await app.request(
      `/p/${TOKEN}/session`,
      { method: "POST", body: JSON.stringify({ name: "maria", pin: "1357" }) },
      env,
    )
    expect(again.status).toBe(409)
    await expect(again.json()).resolves.toMatchObject({ error: "name_taken" })
  })

  it("lets two pinless namesakes both take the name", async () => {
    const { app } = await harness()
    const first = await app.request(
      `/p/${TOKEN}/session`,
      { method: "POST", body: JSON.stringify({ name: "Maria" }) },
      env,
    )
    const second = await app.request(
      `/p/${TOKEN}/session`,
      { method: "POST", body: JSON.stringify({ name: "maria" }) },
      env,
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
  })

  it("requires a PIN on the claim route", async () => {
    const { app } = await harness()
    const res = await app.request(
      `/p/${TOKEN}/session/claim`,
      { method: "POST", body: JSON.stringify({ name: "Maria" }) },
      env,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
  })

  it("answers 404 for comment routes on an unknown or malformed token", async () => {
    const { app } = await harness()
    for (const token of ["nope", "aBcDeFgHiJkLmNoPqRsTuVwXyZ099999"]) {
      const res = await app.request(`/p/${token}/comments`, {}, env)
      expect(res.status).toBe(404)
      await expect(res.json()).resolves.toEqual({ error: "not_found" })
    }
  })

  it("lists nothing and no session for an anonymous reader", async () => {
    const { app } = await harness()
    const res = await app.request(`/p/${TOKEN}/comments`, {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as PublishCommentListResponse
    expect(body).toEqual({ comments: [], session: null })
  })

  it("rejects a malformed list query", async () => {
    const { app } = await harness()
    const res = await app.request(`/p/${TOKEN}/comments?version=zero`, {}, env)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
  })

  it("leaves neighbouring snapshot paths to the serve catch-all", async () => {
    const { app } = await harness()
    const bucket = createMemoryR2Bucket()
    await bucket.put(`${TOKEN}/v1/comments.html`, "<h1>a page called comments</h1>")

    const res = await app.request(
      `/p/${TOKEN}/comments.html`,
      {},
      { ...env, SNAPSHOTS: bucket as unknown as R2Bucket },
    )
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe("<h1>a page called comments</h1>")
  })
})
