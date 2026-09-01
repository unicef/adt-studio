import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import {
  COMMENTER_SESSION_COOKIE,
  type CommenterSessionResponse,
  type PublicationList,
  type PublicationListEntry,
  type PublicationReader,
  type PublicationReaderList,
  type PublishComment,
  type PublishCommentResponse,
} from "@adt/types"
import { createApp } from "./app.js"

/**
 * §4.18 — the account-wide list the Publications dashboard reads. Everything here runs against
 * real D1 through workerd, because the whole route is one SQL statement: an in-memory double
 * would prove nothing about the aggregate that matters.
 */

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"

const MANIFEST = [{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]

let tokenCounter = 0

function nextToken(): string {
  tokenCounter += 1
  return `listing${String(tokenCounter).padStart(4, "0")}TokenAbcdefghijk`.slice(0, 32)
}

function app() {
  return createApp()
}

function snapshot(files: Record<string, string>): File {
  const encoder = new TextEncoder()
  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, body]) => [name, encoder.encode(body)])),
  )
  return new File([zipped], "snapshot.zip", { type: "application/zip" })
}

function form(metadata: unknown, files: Record<string, string>): FormData {
  const body = new FormData()
  body.set("metadata", JSON.stringify(metadata))
  body.set("snapshot", snapshot(files))
  return body
}

interface PublishOptions {
  title?: string
  bookLabel?: string
  files?: Record<string, string>
  expiresAt?: string | null
  accessCode?: string
}

async function publish(options: PublishOptions = {}): Promise<string> {
  const token = nextToken()
  const res = await app().request(
    `${BASE}/api/publications`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      body: form(
        {
          token,
          title: options.title ?? "Raven and the Sun",
          book_label: options.bookLabel ?? "raven",
          page_manifest: MANIFEST,
          ...(options.expiresAt === undefined ? {} : { expires_at: options.expiresAt }),
          ...(options.accessCode === undefined ? {} : { access_code: options.accessCode }),
        },
        options.files ?? { "index.html": "<h1>page one</h1>" },
      ),
    },
    env,
  )
  expect(res.status).toBe(201)
  return token
}

async function republish(token: string, files: Record<string, string>): Promise<void> {
  const res = await app().request(
    `${BASE}/api/publications/${token}/versions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      body: form({ page_manifest: MANIFEST }, files),
    },
    env,
  )
  expect(res.status).toBe(201)
}

async function post(path: string): Promise<Response> {
  return app().request(
    `${BASE}${path}`,
    { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
    env,
  )
}

async function reviewer(token: string, name: string): Promise<string> {
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
  void ((await res.json()) as CommenterSessionResponse)
  const cookie = /adt_pub_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1]
  expect(cookie).toBeDefined()
  return cookie as string
}

async function comment(
  token: string,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<PublishComment> {
  const res = await app().request(
    `${BASE}/p/${token}/comments`,
    {
      method: "POST",
      headers: { "content-type": "application/json", Cookie: `${COMMENTER_SESSION_COOKIE}=${cookie}` },
      body: JSON.stringify(payload),
    },
    env,
  )
  expect(res.status).toBe(201)
  return ((await res.json()) as PublishCommentResponse).comment
}

async function resolve(token: string, id: string): Promise<void> {
  const res = await app().request(
    `${BASE}/p/${token}/comments/${id}/resolve`,
    {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ resolved: true }),
    },
    env,
  )
  expect(res.status).toBe(200)
}

async function deleteComment(token: string, id: string): Promise<void> {
  const res = await app().request(
    `${BASE}/p/${token}/comments/${id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${SECRET}` } },
    env,
  )
  expect(res.status).toBe(200)
}

async function listPublications(): Promise<PublicationList> {
  const res = await app().request(
    `${BASE}/api/publications`,
    { headers: { Authorization: `Bearer ${SECRET}` } },
    env,
  )
  expect(res.status).toBe(200)
  return (await res.json()) as PublicationList
}

function entryFor(list: PublicationList, token: string): PublicationListEntry {
  const found = list.publications.find((entry) => entry.publication.token === token)
  expect(found).toBeDefined()
  return found as PublicationListEntry
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM comments").run()
  await env.DB.prepare("DELETE FROM sessions").run()
  await env.DB.prepare("DELETE FROM versions").run()
  await env.DB.prepare("DELETE FROM publications").run()
})

describe("GET /api/publications", () => {
  it("requires MGMT_SECRET", async () => {
    const res = await app().request(`${BASE}/api/publications`, {}, env)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "unauthorized" })
  })

  it("answers with an empty list for an account that never published", async () => {
    expect(await listPublications()).toEqual({ publications: [] })
  })

  it("lists every publication newest first with its share url", async () => {
    const first = await publish({ title: "First", bookLabel: "first" })
    const second = await publish({ title: "Second", bookLabel: "second" })
    const third = await publish({ title: "Third", bookLabel: "third" })

    const list = await listPublications()
    expect(list.publications).toHaveLength(3)
    expect(list.publications.map((entry) => entry.publication.title)).toEqual([
      "Third",
      "Second",
      "First",
    ])
    expect(entryFor(list, first).url).toBe(`${BASE}/p/${first}/`)
    expect(entryFor(list, second).publication.book_label).toBe("second")
    expect(entryFor(list, third).version_count).toBe(1)
  })

  it("reports the revoked, expired and link-guarded mix without hiding any of them", async () => {
    const live = await publish({ title: "Live", bookLabel: "live" })
    const stopped = await publish({ title: "Stopped", bookLabel: "stopped" })
    const expired = await publish({
      title: "Expired",
      bookLabel: "expired",
      expiresAt: "2020-01-01T00:00:00.000Z",
    })
    const guarded = await publish({ title: "Guarded", bookLabel: "guarded", accessCode: "ABC234" })

    expect((await post(`/api/publications/${stopped}/revoke`)).status).toBe(200)

    const list = await listPublications()
    expect(list.publications).toHaveLength(4)

    expect(entryFor(list, live).publication.revoked_at).toBeNull()
    expect(entryFor(list, live).publication.expires_at).toBeNull()
    expect(entryFor(list, live).has_access_code).toBe(false)

    expect(entryFor(list, stopped).publication.revoked_at).not.toBeNull()
    expect(entryFor(list, expired).publication.expires_at).toBe("2020-01-01T00:00:00.000Z")

    expect(entryFor(list, guarded).has_access_code).toBe(true)
    /** Never the code, never its hash — the list is a management read like every other. */
    expect(JSON.stringify(list)).not.toContain("ABC234")
    expect(JSON.stringify(list)).not.toContain("pbkdf2")
  })

  it("counts versions and sums the bytes each one occupies in R2", async () => {
    const token = await publish({ files: { "index.html": "0123456789" } })

    const afterCreate = entryFor(await listPublications(), token)
    expect(afterCreate.version_count).toBe(1)
    expect(afterCreate.snapshot_bytes).toBe(10)
    expect(afterCreate.last_published_at).toBe(afterCreate.publication.created_at)

    await republish(token, { "index.html": "0123456789", "extra.txt": "12345" })

    const afterRepublish = entryFor(await listPublications(), token)
    expect(afterRepublish.version_count).toBe(2)
    /** Both prefixes still exist in R2, so both still count. */
    expect(afterRepublish.snapshot_bytes).toBe(25)
    expect(afterRepublish.publication.current_version).toBe(2)
  })

  it("reads snapshot_bytes as unknown for versions written before migration 0004", async () => {
    const token = await publish({ files: { "index.html": "0123456789" } })
    await env.DB.prepare("UPDATE versions SET snapshot_bytes = NULL WHERE token = ?")
      .bind(token)
      .run()

    expect(entryFor(await listPublications(), token).snapshot_bytes).toBeNull()
  })

  it("counts replies in comment_count but only open roots in unresolved_count", async () => {
    const token = await publish()
    const cookie = await reviewer(token, "Maria")

    const open = await comment(token, cookie, {
      page_section_id: "pg001_sec001",
      body: "the cover feels crowded",
    })
    await comment(token, cookie, {
      page_section_id: "pg001_sec001",
      parent_id: open.id,
      body: "agreed",
    })
    const closed = await comment(token, cookie, {
      page_section_id: "pg001_sec001",
      body: "typo on line two",
    })
    await comment(token, cookie, {
      page_section_id: "pg001_sec001",
      parent_id: closed.id,
      body: "fixed",
    })
    await resolve(token, closed.id)

    const entry = entryFor(await listPublications(), token)
    expect(entry.comment_count).toBe(4)
    /** Two roots, one resolved — and the reply under the *open* root is not a thread of its own. */
    expect(entry.unresolved_count).toBe(1)
  })

  it("excludes deleted comments from both counts", async () => {
    const token = await publish()
    const cookie = await reviewer(token, "Maria")
    const kept = await comment(token, cookie, {
      page_section_id: "pg001_sec001",
      body: "keep me",
    })
    const removed = await comment(token, cookie, {
      page_section_id: "pg001_sec001",
      body: "delete me",
    })
    await deleteComment(token, removed.id)

    const entry = entryFor(await listPublications(), token)
    expect(entry.comment_count).toBe(1)
    expect(entry.unresolved_count).toBe(1)
    expect(kept.deleted_at).toBeNull()
  })

  it("keeps every publication's counts to itself", async () => {
    const noisy = await publish({ title: "Noisy", bookLabel: "noisy" })
    const quiet = await publish({ title: "Quiet", bookLabel: "quiet" })
    const cookie = await reviewer(noisy, "Maria")
    await comment(noisy, cookie, { page_section_id: "pg001_sec001", body: "one" })
    await comment(noisy, cookie, { page_section_id: "pg001_sec001", body: "two" })

    const list = await listPublications()
    expect(entryFor(list, noisy).unresolved_count).toBe(2)
    expect(entryFor(list, quiet).comment_count).toBe(0)
    expect(entryFor(list, quiet).unresolved_count).toBe(0)
  })
})

/**
 * The roster behind the dashboard's Readers panel. Real D1 again: the whole route is the join
 * between `sessions` and `comments`, and the two facts worth proving — a reader with no
 * surviving comment still appears, and a deleted comment stops being counted — are exactly the
 * ones a fake store would decide by fiat.
 */
describe("GET /api/publications/:token/readers", () => {
  async function readers(token: string): Promise<PublicationReader[]> {
    const res = await app().request(
      `${BASE}/api/publications/${token}/readers`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(res.status).toBe(200)
    return ((await res.json()) as PublicationReaderList).readers
  }

  it("lists everyone who gave a name, with what each of them wrote", async () => {
    const token = await publish()
    const ana = await reviewer(token, "Ana")
    const luis = await reviewer(token, "Luís")

    await comment(token, ana, { page_section_id: "pg001_sec001", body: "the cover feels crowded" })
    await comment(token, ana, { page_section_id: "pg001_sec001", body: "and the title is small" })
    await comment(token, luis, { page_section_id: "pg001_sec001", body: "page two is lovely" })

    const list = await readers(token)
    expect(list.map((entry) => entry.name).sort()).toEqual(["Ana", "Luís"])

    const anaEntry = list.find((entry) => entry.name === "Ana")
    expect(anaEntry?.comment_count).toBe(2)
    expect(anaEntry?.last_comment_at).not.toBeNull()
    expect(anaEntry?.color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  /** A reader who joined and never wrote is the whole reason the panel exists — they are the
   *  only trace the worker keeps of somebody who just read. */
  it("keeps a reader who never commented, and drops the count of a deleted comment", async () => {
    const token = await publish()
    const silent = await reviewer(token, "Quiet One")
    void silent
    const noisy = await reviewer(token, "Noisy One")
    const written = await comment(token, noisy, {
      page_section_id: "pg001_sec001",
      body: "this one goes away",
    })

    await deleteComment(token, written.id)

    const list = await readers(token)
    expect(list.map((entry) => entry.name).sort()).toEqual(["Noisy One", "Quiet One"])
    expect(list.every((entry) => entry.comment_count === 0)).toBe(true)
    expect(list.every((entry) => entry.last_comment_at === null)).toBe(true)
  })

  it("answers 404 for a token this account never published", async () => {
    const res = await app().request(
      `${BASE}/api/publications/absentAbsentAbsentAbsent12/readers`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(res.status).toBe(404)
  })

  it("refuses without the management secret", async () => {
    const token = await publish()
    const res = await app().request(`${BASE}/api/publications/${token}/readers`, {}, env)
    expect(res.status).toBe(401)
  })
})

describe("DELETE /api/publications/:token", () => {
  async function del(token: string): Promise<Response> {
    return app().request(
      `${BASE}/api/publications/${token}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
  }

  it("removes the publication from the account and stops serving the link", async () => {
    const token = await publish()
    expect((await del(token)).status).toBe(200)

    expect((await listPublications()).publications).toHaveLength(0)
    const served = await app().request(`${BASE}/p/${token}`, {}, env)
    expect(served.status).toBe(404)
  })

  it("erases every version's objects, not only the current one", async () => {
    const token = await publish({ files: { "index.html": "<h1>v1</h1>" } })
    await republish(token, { "index.html": "<h1>v2</h1>" })

    const before = await env.SNAPSHOTS.list({ prefix: `${token}/` })
    expect(before.objects.length).toBeGreaterThan(1)

    const body = (await (await del(token)).json()) as { objects_deleted: number }
    expect(body.objects_deleted).toBe(before.objects.length)
    expect((await env.SNAPSHOTS.list({ prefix: `${token}/` })).objects).toHaveLength(0)
  })

  it("takes the comments and reader names with it", async () => {
    const token = await publish()
    const cookie = await reviewer(token, "Ana")
    await comment(token, cookie, { page_section_id: "pg001_sec001", body: "here" })

    await del(token)

    const readers = await app().request(
      `${BASE}/api/publications/${token}/readers`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(readers.status).toBe(404)
  })

  it("leaves other publications untouched", async () => {
    const doomed = await publish({ bookLabel: "doomed" })
    const kept = await publish({ bookLabel: "kept" })

    await del(doomed)

    const list = await listPublications()
    expect(list.publications).toHaveLength(1)
    expect(entryFor(list, kept).publication.token).toBe(kept)
    expect((await env.SNAPSHOTS.list({ prefix: `${kept}/` })).objects.length).toBeGreaterThan(0)
  })

  it("answers 200 for a token that is already gone, so a retry is not an error", async () => {
    const token = await publish()
    expect((await del(token)).status).toBe(200)

    const again = await del(token)
    expect(again.status).toBe(200)
    expect((await again.json()) as { deleted: boolean }).toMatchObject({ deleted: false })
  })

  it("refuses without the management secret", async () => {
    const token = await publish()
    const res = await app().request(`${BASE}/api/publications/${token}`, { method: "DELETE" }, env)
    expect(res.status).toBe(401)
    expect((await listPublications()).publications).toHaveLength(1)
  })
})
