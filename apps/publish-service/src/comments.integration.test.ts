import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import {
  COMMENTER_SESSION_COOKIE,
  COMMENTER_SESSION_MAX_AGE_SECONDS,
  PUBLISH_AUTHOR_NAME_HEADER,
  type CommenterSession,
  type CommenterSessionResponse,
  type PublishComment,
  type PublishCommentListResponse,
  type PublishCommentResponse,
} from "@adt/types"
import { createApp } from "./app.js"
import { sessionCookieValue } from "./identity.js"

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"

const MANIFEST = [
  { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
  { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
]

const ANCHOR = { selector: "#content [data-id='b3']", xOffsetPct: 42.5, yOffsetPct: 12 }

let tokenCounter = 0

function nextToken(): string {
  tokenCounter += 1
  return `comments${String(tokenCounter).padStart(4, "0")}TokenAbcdefghij`.slice(0, 32)
}

function app() {
  return createApp()
}

function snapshot(): File {
  const encoder = new TextEncoder()
  const zipped = zipSync({ "index.html": encoder.encode("<h1>page one</h1>") })
  return new File([zipped], "snapshot.zip", { type: "application/zip" })
}

function form(metadata: unknown): FormData {
  const body = new FormData()
  body.set("metadata", JSON.stringify(metadata))
  body.set("snapshot", snapshot())
  return body
}

async function publish(): Promise<string> {
  const token = nextToken()
  const res = await app().request(
    `${BASE}/api/publications`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      body: form({
        token,
        title: "Raven and the Sun",
        book_label: "raven",
        page_manifest: MANIFEST,
      }),
    },
    env,
  )
  expect(res.status).toBe(201)
  return token
}

async function republish(token: string): Promise<void> {
  const res = await app().request(
    `${BASE}/api/publications/${token}/versions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      body: form({ page_manifest: MANIFEST }),
    },
    env,
  )
  expect(res.status).toBe(201)
}

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? ""
  const value = /adt_pub_session=([^;]+)/.exec(header)?.[1]
  expect(value).toBeDefined()
  return value as string
}

interface Reviewer {
  cookie: string
  session: CommenterSession
}

async function claim(token: string, name: string, cookie?: string): Promise<Reviewer> {
  const res = await app().request(
    `${BASE}/p/${token}/session`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie === undefined ? {} : { Cookie: `${COMMENTER_SESSION_COOKIE}=${cookie}` }),
      },
      body: JSON.stringify({ name }),
    },
    env,
  )
  expect(res.status).toBe(201)
  const body = (await res.json()) as CommenterSessionResponse
  return { cookie: cookieFrom(res), session: body.session }
}

async function session(
  token: string,
  body: { name: string; pin?: string },
  cookie?: string,
): Promise<Response> {
  return app().request(
    `${BASE}/p/${token}/session`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie === undefined ? {} : { Cookie: `${COMMENTER_SESSION_COOKIE}=${cookie}` }),
      },
      body: JSON.stringify(body),
    },
    env,
  )
}

async function claimIdentity(token: string, name: string, pin: string): Promise<Response> {
  return app().request(
    `${BASE}/p/${token}/session/claim`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, pin }),
    },
    env,
  )
}

function asReviewer(reviewer: Reviewer | null, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
      ...(reviewer === null
        ? {}
        : { Cookie: `${COMMENTER_SESSION_COOKIE}=${reviewer.cookie}` }),
    },
  }
}

function asAuthor(init: RequestInit = {}, authorName?: string): RequestInit {
  return {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${SECRET}`,
      ...(authorName === undefined ? {} : { [PUBLISH_AUTHOR_NAME_HEADER]: authorName }),
      ...(init.headers as Record<string, string> | undefined),
    },
  }
}

async function comment(
  token: string,
  reviewer: Reviewer | null,
  payload: Record<string, unknown>,
): Promise<Response> {
  return app().request(
    `${BASE}/p/${token}/comments`,
    asReviewer(reviewer, { method: "POST", body: JSON.stringify(payload) }),
    env,
  )
}

async function commentBody(response: Response): Promise<PublishComment> {
  expect(response.status).toBe(201)
  return ((await response.json()) as PublishCommentResponse).comment
}

async function list(
  token: string,
  reviewer: Reviewer | null,
  query = "",
): Promise<PublishCommentListResponse> {
  const res = await app().request(`${BASE}/p/${token}/comments${query}`, asReviewer(reviewer), env)
  expect(res.status).toBe(200)
  return (await res.json()) as PublishCommentListResponse
}

async function authorList(token: string, query = ""): Promise<PublishCommentListResponse> {
  const res = await app().request(`${BASE}/p/${token}/comments${query}`, asAuthor(), env)
  expect(res.status).toBe(200)
  return (await res.json()) as PublishCommentListResponse
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM comments").run()
  await env.DB.prepare("DELETE FROM sessions").run()
  await env.DB.prepare("DELETE FROM versions").run()
  await env.DB.prepare("DELETE FROM publications").run()
})

describe("commenter sessions", () => {
  it("issues a cookie-scoped session with a server-assigned color", async () => {
    const token = await publish()
    const res = await app().request(
      `${BASE}/p/${token}/session`,
      { method: "POST", body: JSON.stringify({ name: "  Maria  " }) },
      env,
    )

    expect(res.status).toBe(201)
    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain(`${COMMENTER_SESSION_COOKIE}=`)
    expect(setCookie).toContain(`Path=/p/${token}`)
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("Secure")
    expect(setCookie).toContain("SameSite=Lax")

    const body = (await res.json()) as CommenterSessionResponse
    expect(Object.keys(body.session).sort()).toEqual(["color", "id", "is_author", "name"])
    expect(body.session.name).toBe("Maria")
    expect(body.session.is_author).toBe(false)
    expect(body.session.color).toBe("#e5484d")
  })

  it("rotates colors deterministically per publication", async () => {
    const token = await publish()
    const first = await claim(token, "Maria")
    const second = await claim(token, "João")
    const third = await claim(token, "Ana")

    expect([first.session.color, second.session.color, third.session.color]).toEqual([
      "#e5484d",
      "#f76808",
      "#ffb224",
    ])
  })

  it("renames the existing session and renames that reviewer's comments everywhere", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const created = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "The cover feels dark",
        anchor: ANCHOR,
      }),
    )
    expect(created.author_name).toBe("Maria")

    const renamed = await claim(token, "Maria Silva", maria.cookie)
    expect(renamed.session).toEqual({
      id: maria.session.id,
      name: "Maria Silva",
      color: maria.session.color,
      is_author: false,
    })

    const after = await list(token, maria)
    expect(after.comments).toHaveLength(1)
    expect(after.comments[0]?.id).toBe(created.id)
    expect(after.comments[0]?.author_name).toBe("Maria Silva")
    expect(after.session?.name).toBe("Maria Silva")

    const sessionRows = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM sessions WHERE token = ?",
    )
      .bind(token)
      .first<{ total: number }>()
    expect(sessionRows?.total).toBe(1)
  })

  it("rejects an empty name and a name over the cap", async () => {
    const token = await publish()
    for (const name of ["   ", "x".repeat(61)]) {
      const res = await app().request(
        `${BASE}/p/${token}/session`,
        { method: "POST", body: JSON.stringify({ name }) },
        env,
      )
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
    }
  })
})

describe("comment lifecycle", () => {
  it("walks pin → reply → edit → drag → delete → resolve → unresolve", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const joao = await claim(token, "João")

    const root = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "The sun looks angry here",
        anchor: ANCHOR,
      }),
    )
    expect(root.version).toBe(1)
    expect(root.parent_id).toBeNull()
    expect(root.anchor).toEqual(ANCHOR)
    expect(root.author_color).toBe(maria.session.color)

    const reply = await commentBody(
      await comment(token, joao, {
        page_section_id: "pg001_sec001",
        body: "Agreed — softer colours?",
        parent_id: root.id,
      }),
    )
    expect(reply.parent_id).toBe(root.id)
    expect(reply.anchor).toBeNull()
    expect(reply.author_name).toBe("João")

    const edited = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asReviewer(maria, {
        method: "PATCH",
        body: JSON.stringify({ body: "The sun looks angry on this page" }),
      }),
      env,
    )
    expect(edited.status).toBe(200)
    const editedBody = ((await edited.json()) as PublishCommentResponse).comment
    expect(editedBody.body).toBe("The sun looks angry on this page")
    expect(editedBody.edited_at).not.toBeNull()
    expect(editedBody.anchor).toEqual(ANCHOR)

    const dragged = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asReviewer(maria, {
        method: "PATCH",
        body: JSON.stringify({ anchor: { ...ANCHOR, xOffsetPct: 80 } }),
      }),
      env,
    )
    expect(dragged.status).toBe(200)
    const draggedBody = ((await dragged.json()) as PublishCommentResponse).comment
    expect(draggedBody.anchor?.xOffsetPct).toBe(80)
    expect(draggedBody.body).toBe("The sun looks angry on this page")
    expect(draggedBody.edited_at).toBe(editedBody.edited_at)

    const deleted = await app().request(
      `${BASE}/p/${token}/comments/${reply.id}`,
      asReviewer(joao, { method: "DELETE" }),
      env,
    )
    expect(deleted.status).toBe(200)
    const deletedBody = ((await deleted.json()) as PublishCommentResponse).comment
    expect(deletedBody.deleted_at).not.toBeNull()

    const deletedAgain = await app().request(
      `${BASE}/p/${token}/comments/${reply.id}`,
      asReviewer(joao, { method: "DELETE" }),
      env,
    )
    expect(deletedAgain.status).toBe(200)
    await expect(deletedAgain.json()).resolves.toMatchObject({
      comment: { deleted_at: deletedBody.deleted_at },
    })

    const reviewerView = await list(token, maria)
    expect(reviewerView.comments.map((entry) => entry.id)).toEqual([root.id])

    const resolved = await app().request(
      `${BASE}/p/${token}/comments/${root.id}/resolve`,
      asAuthor({ method: "POST", body: JSON.stringify({ resolved: true }) }),
      env,
    )
    expect(resolved.status).toBe(200)
    await expect(resolved.json()).resolves.toMatchObject({
      comment: { resolved_at: expect.any(String) as unknown as string },
    })

    expect((await list(token, maria)).comments).toHaveLength(0)
    expect((await list(token, maria, "?include_resolved=true")).comments).toHaveLength(1)

    const unresolved = await app().request(
      `${BASE}/p/${token}/comments/${root.id}/resolve`,
      asAuthor({ method: "POST", body: JSON.stringify({ resolved: false }) }),
      env,
    )
    expect(unresolved.status).toBe(200)
    await expect(unresolved.json()).resolves.toMatchObject({ comment: { resolved_at: null } })
    expect((await list(token, maria)).comments).toHaveLength(1)
  })

  it("hides a resolved thread's replies with its root and keeps them with include_resolved", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )
    await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "Follow-up",
        parent_id: root.id,
      }),
    )

    await app().request(
      `${BASE}/p/${token}/comments/${root.id}/resolve`,
      asAuthor({ method: "POST", body: JSON.stringify({ resolved: true }) }),
      env,
    )

    expect((await list(token, maria)).comments).toHaveLength(0)
    const withResolved = await list(token, maria, "?include_resolved=true")
    expect(withResolved.comments).toHaveLength(2)
    expect(withResolved.comments[1]?.resolved_at).toBeNull()
  })

  it("filters by page and returns the caller's own session", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "Page one",
      anchor: ANCHOR,
    })
    await comment(token, maria, {
      page_section_id: "pg002_sec001",
      body: "Page two",
      anchor: ANCHOR,
    })

    const page = await list(token, maria, "?page_section_id=pg002_sec001")
    expect(page.comments.map((entry) => entry.body)).toEqual(["Page two"])
    expect(page.session?.id).toBe(maria.session.id)

    const anonymous = await list(token, null)
    expect(anonymous.comments).toHaveLength(2)
    expect(anonymous.session).toBeNull()
  })
})

describe("permissions", () => {
  it("refuses comment writes without a session", async () => {
    const token = await publish()
    const res = await comment(token, null, {
      page_section_id: "pg001_sec001",
      body: "Anonymous",
      anchor: ANCHOR,
    })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "unauthorized" })
  })

  it("stops a reviewer editing or deleting someone else's comment", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const joao = await claim(token, "João")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Mine", anchor: ANCHOR }),
    )

    const edit = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asReviewer(joao, { method: "PATCH", body: JSON.stringify({ body: "Hijacked" }) }),
      env,
    )
    expect(edit.status).toBe(401)

    const remove = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asReviewer(joao, { method: "DELETE" }),
      env,
    )
    expect(remove.status).toBe(401)

    const stillThere = await list(token, maria)
    expect(stillThere.comments[0]?.body).toBe("Mine")
  })

  it("refuses resolve for reviewers and anonymous callers", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )

    for (const caller of [maria, null]) {
      const res = await app().request(
        `${BASE}/p/${token}/comments/${root.id}/resolve`,
        asReviewer(caller, { method: "POST", body: JSON.stringify({ resolved: true }) }),
        env,
      )
      expect(res.status).toBe(401)
      await expect(res.json()).resolves.toMatchObject({ error: "unauthorized" })
    }
  })

  it("cannot be impersonated by putting a public session_id in the cookie", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Mine", anchor: ANCHOR }),
    )

    const forged = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Cookie: `${COMMENTER_SESSION_COOKIE}=${root.session_id}`,
        },
        body: JSON.stringify({ body: "Hijacked" }),
      },
      env,
    )
    expect(forged.status).toBe(401)

    const forgedAuthor = await app().request(
      `${BASE}/p/${token}/comments/${root.id}/resolve`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: `${COMMENTER_SESSION_COOKIE}=author-${token}`,
        },
        body: JSON.stringify({ resolved: true }),
      },
      env,
    )
    expect(forgedAuthor.status).toBe(401)
  })

  it("lets the author edit, delete and resolve anything", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )

    const edited = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asAuthor({ method: "PATCH", body: JSON.stringify({ body: "Edited by the author" }) }),
      env,
    )
    expect(edited.status).toBe(200)

    const resolved = await app().request(
      `${BASE}/p/${token}/comments/${root.id}/resolve`,
      asAuthor({ method: "POST", body: JSON.stringify({ resolved: true }) }),
      env,
    )
    expect(resolved.status).toBe(200)

    const removed = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asAuthor({ method: "DELETE" }),
      env,
    )
    expect(removed.status).toBe(200)
  })

  it("rejects a session cookie minted for another publication", async () => {
    const first = await publish()
    const second = await publish()
    const maria = await claim(first, "Maria")

    const res = await comment(second, maria, {
      page_section_id: "pg001_sec001",
      body: "Wrong publication",
      anchor: ANCHOR,
    })
    expect(res.status).toBe(401)
  })
})

describe("author identity", () => {
  it("materializes one author session and labels its comments", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )

    const first = await app().request(
      `${BASE}/p/${token}/comments`,
      asAuthor({
        method: "POST",
        body: JSON.stringify({
          page_section_id: "pg001_sec001",
          body: "Fixed in the next version",
          parent_id: root.id,
        }),
      }),
      env,
    )
    const authorReply = await commentBody(first)
    expect(authorReply.author_name).toBe("Author")
    expect(authorReply.author_color).toBe("#8d8d8d")

    const second = await commentBody(
      await app().request(
        `${BASE}/p/${token}/comments`,
        asAuthor(
          {
            method: "POST",
            body: JSON.stringify({
              page_section_id: "pg001_sec001",
              body: "Also softened the palette",
              parent_id: root.id,
            }),
          },
          "Eliezir",
        ),
        env,
      ),
    )
    expect(second.session_id).toBe(authorReply.session_id)
    expect(second.author_name).toBe("Eliezir")

    const listed = await authorList(token)
    expect(listed.session?.is_author).toBe(true)
    expect(listed.session?.name).toBe("Eliezir")
    expect(
      listed.comments.filter((entry) => entry.session_id === authorReply.session_id),
    ).toHaveLength(2)

    const authorRows = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM sessions WHERE token = ? AND is_author = 1",
    )
      .bind(token)
      .first<{ total: number }>()
    expect(authorRows?.total).toBe(1)
  })

  it("reports an author session marker before the first author write", async () => {
    const token = await publish()
    const listed = await authorList(token)
    expect(listed.session).toEqual({
      id: `author-${token}`,
      name: "Author",
      color: "#8d8d8d",
      is_author: true,
    })

    const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM sessions WHERE token = ?")
      .bind(token)
      .first<{ total: number }>()
    expect(rows?.total).toBe(0)
  })

  it("rejects an unusable author name header", async () => {
    const token = await publish()
    const res = await app().request(
      `${BASE}/p/${token}/comments`,
      asAuthor(
        {
          method: "POST",
          body: JSON.stringify({ page_section_id: "pg001_sec001", body: "Hi", anchor: ANCHOR }),
        },
        "x".repeat(61),
      ),
      env,
    )
    expect(res.status).toBe(400)
  })
})

describe("version stamping", () => {
  it("keeps a v1 comment on v1 and stamps new comments with the current version", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const onV1 = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "Made on v1",
        anchor: ANCHOR,
      }),
    )
    expect(onV1.version).toBe(1)

    await republish(token)

    const onV2 = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "Made on v2",
        anchor: ANCHOR,
      }),
    )
    expect(onV2.version).toBe(2)

    const stillV1 = await list(token, maria, "?version=1")
    expect(stillV1.comments.map((entry) => entry.body)).toEqual(["Made on v1"])
    const v2Only = await list(token, maria, "?version=2")
    expect(v2Only.comments.map((entry) => entry.body)).toEqual(["Made on v2"])
  })

  it("ignores a client-supplied version and keeps replies with their root's version", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "Root on v1",
        anchor: ANCHOR,
        version: 99,
      }),
    )
    expect(root.version).toBe(1)

    await republish(token)
    const reply = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "Reply on v2",
        parent_id: root.id,
      }),
    )
    expect(reply.version).toBe(2)

    const v1 = await list(token, maria, "?version=1")
    expect(v1.comments.map((entry) => entry.body)).toEqual(["Root on v1", "Reply on v2"])
  })
})

describe("deleted visibility", () => {
  it("omits deleted comments for reviewers and includes them for the author", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )
    const reply = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "Reply",
        parent_id: root.id,
      }),
    )

    await app().request(
      `${BASE}/p/${token}/comments/${reply.id}`,
      asReviewer(maria, { method: "DELETE" }),
      env,
    )

    const reviewerView = await list(token, maria)
    expect(reviewerView.comments.map((entry) => entry.id)).toEqual([root.id])

    const authorView = await authorList(token)
    expect(authorView.comments.map((entry) => entry.id)).toEqual([root.id, reply.id])
    expect(authorView.comments[1]?.deleted_at).not.toBeNull()
  })

  it("hides a deleted root's whole thread from reviewers and 404s on editing it", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )
    await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "Reply",
      parent_id: root.id,
    })

    await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asReviewer(maria, { method: "DELETE" }),
      env,
    )

    expect((await list(token, maria)).comments).toHaveLength(0)
    expect((await authorList(token)).comments).toHaveLength(2)

    const edit = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asReviewer(maria, { method: "PATCH", body: JSON.stringify({ body: "Back from the dead" }) }),
      env,
    )
    expect(edit.status).toBe(404)

    const reply = await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "Late reply",
      parent_id: root.id,
    })
    expect(reply.status).toBe(400)
  })
})

describe("validation", () => {
  it("rejects an unknown page_section_id", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const res = await comment(token, maria, {
      page_section_id: "pg999_sec001",
      body: "Ghost page",
      anchor: ANCHOR,
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
  })

  it("rejects an anchored reply, a nested reply and a mismatched reply page", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )
    const reply = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "Reply",
        parent_id: root.id,
      }),
    )

    const anchored = await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "Anchored reply",
      parent_id: root.id,
      anchor: ANCHOR,
    })
    expect(anchored.status).toBe(400)

    const nested = await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "Reply to a reply",
      parent_id: reply.id,
    })
    expect(nested.status).toBe(400)

    const crossPage = await comment(token, maria, {
      page_section_id: "pg002_sec001",
      body: "Wrong page",
      parent_id: root.id,
    })
    expect(crossPage.status).toBe(400)

    const unknownParent = await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "Orphan",
      parent_id: "does-not-exist",
    })
    expect(unknownParent.status).toBe(400)
  })

  it("rejects an empty body, an over-long body and a no-op patch", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")

    const empty = await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "   ",
      anchor: ANCHOR,
    })
    expect(empty.status).toBe(400)

    const tooLong = await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "x".repeat(2001),
      anchor: ANCHOR,
    })
    expect(tooLong.status).toBe(413)
    await expect(tooLong.json()).resolves.toMatchObject({ error: "payload_too_large" })

    const root = await commentBody(
      await comment(token, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )
    const noop = await app().request(
      `${BASE}/p/${token}/comments/${root.id}`,
      asReviewer(maria, { method: "PATCH", body: JSON.stringify({}) }),
      env,
    )
    expect(noop.status).toBe(400)
  })

  it("answers 404 for an unknown comment id instead of leaking a shape", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")

    for (const id of ["not-a-real-id", "../../etc/passwd", "%00"]) {
      const res = await app().request(
        `${BASE}/p/${token}/comments/${encodeURIComponent(id)}`,
        asReviewer(maria, { method: "PATCH", body: JSON.stringify({ body: "Hello" }) }),
        env,
      )
      expect(res.status).toBe(404)
      await expect(res.json()).resolves.toEqual({ error: "not_found" })
    }
  })

  it("keeps a comment id from one publication out of another", async () => {
    const first = await publish()
    const second = await publish()
    const maria = await claim(first, "Maria")
    const ana = await claim(second, "Ana")
    const root = await commentBody(
      await comment(first, maria, { page_section_id: "pg001_sec001", body: "Pin", anchor: ANCHOR }),
    )

    const res = await app().request(
      `${BASE}/p/${second}/comments/${root.id}`,
      asReviewer(ana, { method: "PATCH", body: JSON.stringify({ body: "Cross publication" }) }),
      env,
    )
    expect(res.status).toBe(404)
  })
})

describe("revoked and expired publications", () => {
  it("blocks reviewers but lets the author keep reading and resolving", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    const root = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "Please fix the cover",
        anchor: ANCHOR,
      }),
    )

    const revoked = await app().request(
      `${BASE}/api/publications/${token}/revoke`,
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(revoked.status).toBe(200)

    const reviewerList = await app().request(
      `${BASE}/p/${token}/comments`,
      asReviewer(maria),
      env,
    )
    expect(reviewerList.status).toBe(410)
    await expect(reviewerList.json()).resolves.toEqual({ error: "revoked" })

    const reviewerWrite = await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "One more",
      anchor: ANCHOR,
    })
    expect(reviewerWrite.status).toBe(410)

    const authorView = await authorList(token)
    expect(authorView.comments.map((entry) => entry.id)).toEqual([root.id])

    const resolved = await app().request(
      `${BASE}/p/${token}/comments/${root.id}/resolve`,
      asAuthor({ method: "POST", body: JSON.stringify({ resolved: true }) }),
      env,
    )
    expect(resolved.status).toBe(200)
  })

  it("does not turn the carve-out into a token oracle", async () => {
    const res = await app().request(
      `${BASE}/p/nosuchtokennosuchtokennosuchtok/comments`,
      asAuthor(),
      env,
    )
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "not_found" })
  })

  it("lets the author read comments on an expired publication", async () => {
    const token = await publish()
    const maria = await claim(token, "Maria")
    await comment(token, maria, {
      page_section_id: "pg001_sec001",
      body: "Before expiry",
      anchor: ANCHOR,
    })

    await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ expires_at: "2020-01-01T00:00:00.000Z" }),
      },
      env,
    )

    const reviewerList = await app().request(`${BASE}/p/${token}/comments`, asReviewer(maria), env)
    expect(reviewerList.status).toBe(410)
    await expect(reviewerList.json()).resolves.toEqual({ error: "expired" })

    expect((await authorList(token)).comments).toHaveLength(1)
  })
})

describe("reviewer PINs and identity reclaim", () => {
  it("applied migration 0002, so sessions carry a pin column", async () => {
    const columns = await env.DB.prepare(`PRAGMA table_info(sessions)`).all<{ name: string }>()
    expect((columns.results ?? []).map((column) => column.name)).toContain("pin")
  })

  it("keeps the PIN out of every response and stores it hashed with a per-session salt", async () => {
    const token = await publish()
    const first = await session(token, { name: "Maria", pin: "2468" })
    expect(first.status).toBe(201)
    expect(await first.clone().text()).not.toContain("2468")

    const second = await session(token, { name: "Ana", pin: "2468" })
    expect(second.status).toBe(201)

    const rows = await env.DB.prepare(`SELECT name, pin FROM sessions WHERE token = ?`)
      .bind(token)
      .all<{ name: string; pin: string | null }>()
    const pins = (rows.results ?? []).map((row) => row.pin)
    expect(pins.every((pin) => pin?.startsWith("pbkdf2-sha256$100000$"))).toBe(true)
    expect(pins[0]).not.toBe(pins[1])
    expect(pins.some((pin) => pin?.includes("2468"))).toBe(false)
  })

  it("sets a 90-day cookie on both create and claim", async () => {
    const token = await publish()
    const created = await session(token, { name: "Maria", pin: "2468" })
    expect(created.headers.get("set-cookie")).toContain(
      `Max-Age=${COMMENTER_SESSION_MAX_AGE_SECONDS}`,
    )

    const reclaimed = await claimIdentity(token, "Maria", "2468")
    expect(reclaimed.status).toBe(200)
    expect(reclaimed.headers.get("set-cookie")).toContain(
      `Max-Age=${COMMENTER_SESSION_MAX_AGE_SECONDS}`,
    )
  })

  it("reclaims the same session from a clean cookie jar and can edit the old comment", async () => {
    const token = await publish()
    const created = await session(token, { name: "Maria", pin: "2468" })
    const maria: Reviewer = {
      cookie: cookieFrom(created),
      session: ((await created.json()) as CommenterSessionResponse).session,
    }
    const pin = await commentBody(
      await comment(token, maria, {
        page_section_id: "pg001_sec001",
        body: "The sun looks angry here",
        anchor: ANCHOR,
      }),
    )

    const reclaimed = await claimIdentity(token, "  maria ", "2468")
    expect(reclaimed.status).toBe(200)
    const session2 = ((await reclaimed.json()) as CommenterSessionResponse).session
    expect(session2).toEqual(maria.session)

    const nothing = { cookie: cookieFrom(reclaimed), session: session2 }
    const edited = await app().request(
      `${BASE}/p/${token}/comments/${pin.id}`,
      asReviewer(nothing, { method: "PATCH", body: JSON.stringify({ body: "Softer, please" }) }),
      env,
    )
    expect(edited.status).toBe(200)
    await expect(edited.json()).resolves.toMatchObject({
      comment: { body: "Softer, please", author_name: "Maria", session_id: maria.session.id },
    })
  })

  it("answers one 401 invalid_claim for a wrong PIN, an unknown name and a pinless session", async () => {
    const token = await publish()
    await session(token, { name: "Maria", pin: "2468" })
    await session(token, { name: "João" })

    const attempts = [
      ["Maria", "1111"],
      ["Nobody", "2468"],
      ["João", "2468"],
    ] as const

    for (const [name, pin] of attempts) {
      const res = await claimIdentity(token, name, pin)
      expect(res.status, `${name}/${pin}`).toBe(401)
      await expect(res.json(), `${name}/${pin}`).resolves.toEqual({
        error: "invalid_claim",
        message:
          "That name and PIN do not match. Check the PIN, or pick a different name to start fresh",
      })
    }
  })

  it("rejects a PIN that is too short, too long or has whitespace", async () => {
    const token = await publish()
    for (const pin of ["123", "1234567890123", "12 34"]) {
      const res = await session(token, { name: `Reviewer ${pin}`, pin })
      expect(res.status, pin).toBe(400)
      await expect(res.json(), pin).resolves.toMatchObject({ error: "invalid_request" })
    }
    const claimed = await claimIdentity(token, "Maria", "123")
    expect(claimed.status).toBe(400)
  })

  it("reserves a pinned name per publication, ignoring case and surrounding space", async () => {
    const token = await publish()
    await session(token, { name: "Maria", pin: "2468" })

    const taken = await session(token, { name: "  MARIA  ", pin: "1357" })
    expect(taken.status).toBe(409)
    const body = (await taken.json()) as { error: string; message: string }
    expect(body.error).toBe("name_taken")
    expect(body.message).toContain("Enter that person's PIN")

    const elsewhere = await session(await publish(), { name: "Maria", pin: "1357" })
    expect(elsewhere.status).toBe(201)
  })

  /** M3.5: the access code gates the audience, so a name is no longer scarce. Two invited
   *  Marias must both be able to comment, and both must keep their own pins. */
  it("lets two pinless reviewers share a name and both post", async () => {
    const token = await publish()
    const first = await session(token, { name: "João" })
    const second = await session(token, { name: "joão" })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)

    const firstId = ((await first.json()) as CommenterSessionResponse).session.id
    const secondBody = (await second.json()) as CommenterSessionResponse
    expect(secondBody.session.id).not.toBe(firstId)

    for (const reviewer of [
      { cookie: cookieFrom(first), session: { id: firstId } },
      { cookie: cookieFrom(second), session: { id: secondBody.session.id } },
    ]) {
      const posted = await comment(
        token,
        reviewer as unknown as Reviewer,
        { page_section_id: "pg001_sec001", body: "Both of us", anchor: ANCHOR },
      )
      expect(posted.status).toBe(201)
    }
  })

  /** A pinless namesake must not be able to shadow a pinned identity: the claim lookup only
   *  ever considers rows that actually have a PIN. */
  it("keeps a pinned identity claimable next to a pinless namesake", async () => {
    const token = await publish()
    await session(token, { name: "Maria" })
    const pinned = await session(token, { name: "Maria", pin: "2468" })
    expect(pinned.status).toBe(201)
    const pinnedId = ((await pinned.json()) as CommenterSessionResponse).session.id

    const reclaimed = await claimIdentity(token, "maria", "2468")
    expect(reclaimed.status).toBe(200)
    await expect(reclaimed.json()).resolves.toMatchObject({ session: { id: pinnedId } })
  })

  it("lets the author and a reviewer share a display name", async () => {
    const token = await publish()
    await app().request(
      `${BASE}/p/${token}/comments`,
      asAuthor(
        {
          method: "POST",
          body: JSON.stringify({ page_section_id: "pg001_sec001", body: "Mine", anchor: ANCHOR }),
        },
        "Eliezir",
      ),
      env,
    )

    const reviewer = await session(token, { name: "Eliezir", pin: "2468" })
    expect(reviewer.status).toBe(201)
    const claimed = await claimIdentity(token, "Eliezir", "2468")
    expect(claimed.status).toBe(200)
    await expect(claimed.json()).resolves.toMatchObject({ session: { is_author: false } })
  })

  it("renames through the cookie, keeps the PIN and refuses another reviewer's name", async () => {
    const token = await publish()
    const created = await session(token, { name: "Maria", pin: "2468" })
    const cookie = cookieFrom(created)
    await session(token, { name: "Ana", pin: "1357" })

    const collision = await session(token, { name: "ANA" }, cookie)
    expect(collision.status).toBe(409)

    const renamed = await session(token, { name: "Maria Silva" }, cookie)
    expect(renamed.status).toBe(201)

    expect((await claimIdentity(token, "Maria", "2468")).status).toBe(401)
    const reclaimed = await claimIdentity(token, "Maria Silva", "2468")
    expect(reclaimed.status).toBe(200)
    await expect(reclaimed.json()).resolves.toMatchObject({
      session: { name: "Maria Silva", color: "#e5484d" },
    })
  })

  it("lets a reviewer add a PIN later through the authenticated repost", async () => {
    const token = await publish()
    const created = await session(token, { name: "João" })
    const cookie = cookieFrom(created)
    expect((await claimIdentity(token, "João", "2468")).status).toBe(401)

    const upgraded = await session(token, { name: "João", pin: "2468" }, cookie)
    expect(upgraded.status).toBe(201)
    expect((await claimIdentity(token, "João", "2468")).status).toBe(200)
  })

  /** A row written before migration 0002 has no `pin` value at all. It must keep commenting
   *  and renaming; only reclaiming is unavailable to it until it sets a PIN. */
  it("keeps sessions stored before the migration working", async () => {
    const token = await publish()
    await env.DB.prepare(
      `INSERT INTO sessions (id, token, name, color, is_author, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
      .bind("legacy-session", token, "Legacy Maria", "#e5484d", "2026-07-01T10:00:00.000Z")
      .run()

    const legacy: Reviewer = {
      cookie: await sessionCookieValue("legacy-session", SECRET),
      session: {
        id: "legacy-session",
        name: "Legacy Maria",
        color: "#e5484d",
        is_author: false,
      },
    }

    const created = await commentBody(
      await comment(token, legacy, {
        page_section_id: "pg001_sec001",
        body: "Written before the migration",
        anchor: ANCHOR,
      }),
    )
    expect(created.author_name).toBe("Legacy Maria")

    /** Pinless, so since M3.5 the name is free — and still unclaimable. */
    expect((await session(token, { name: "legacy maria" })).status).toBe(201)
    expect((await claimIdentity(token, "Legacy Maria", "2468")).status).toBe(401)

    const renamed = await session(token, { name: "Maria (legacy)" }, legacy.cookie)
    expect(renamed.status).toBe(201)
    await expect(renamed.json()).resolves.toMatchObject({
      session: { id: "legacy-session", name: "Maria (legacy)" },
    })
  })
})
