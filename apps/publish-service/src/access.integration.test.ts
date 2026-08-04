import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import {
  COMMENTER_SESSION_COOKIE,
  PUBLICATION_ACCESS_COOKIE,
  PUBLICATION_ACCESS_MAX_AGE_SECONDS,
  type PublicationDetail,
  type PublicationResponse,
  type PublishCommentListResponse,
} from "@adt/types"
import { createApp } from "./app.js"

/**
 * The access gate against real workerd, D1 and R2 — the whole point of the gate is what the
 * *edge* does with a request, so nothing here goes through a double.
 */

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"
const CODE = "K7M4QP"

const MANIFEST = [{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]

let tokenCounter = 0

function nextToken(): string {
  tokenCounter += 1
  return `access${String(tokenCounter).padStart(4, "0")}TokenAbcdefghijkl`.slice(0, 32)
}

function app() {
  return createApp()
}

function snapshot(): File {
  const encoder = new TextEncoder()
  const zipped = zipSync({
    "index.html": encoder.encode("<h1>page one</h1>"),
    "assets/app.css": encoder.encode("h1{color:red}"),
  })
  return new File([zipped], "snapshot.zip", { type: "application/zip" })
}

async function publish(accessCode?: string | null): Promise<string> {
  const token = nextToken()
  const body = new FormData()
  body.set(
    "metadata",
    JSON.stringify({
      token,
      title: "Raven & the <Sun>",
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
  await expect(res.json()).resolves.toMatchObject({
    has_access_code: accessCode !== undefined && accessCode !== null,
  })
  return token
}

/** What a browser sends when the address bar changes. */
function navigation(cookie?: string): RequestInit {
  return {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "sec-fetch-mode": "navigate",
      ...(cookie === undefined ? {} : { Cookie: `${PUBLICATION_ACCESS_COOKIE}=${cookie}` }),
    },
  }
}

/** What the same page sends for its own stylesheet. */
function subresource(cookie?: string): RequestInit {
  return {
    headers: {
      accept: "text/css,*/*;q=0.1",
      "sec-fetch-mode": "no-cors",
      ...(cookie === undefined ? {} : { Cookie: `${PUBLICATION_ACCESS_COOKIE}=${cookie}` }),
    },
  }
}

function get(token: string, path: string, init: RequestInit): Promise<Response> {
  return app().request(`${BASE}/p/${token}/${path}`, init, env)
}

async function enter(token: string, code: string): Promise<Response> {
  return app().request(
    `${BASE}/p/${token}/access`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    },
    env,
  )
}

function accessCookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? ""
  const value = new RegExp(`${PUBLICATION_ACCESS_COOKIE}=([^;]+)`).exec(header)?.[1]
  expect(value, header).toBeDefined()
  return value as string
}

async function unlocked(token: string, code = CODE): Promise<string> {
  const res = await enter(token, code)
  expect(res.status).toBe(204)
  return accessCookieFrom(res)
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM comments").run()
  await env.DB.prepare("DELETE FROM sessions").run()
  await env.DB.prepare("DELETE FROM versions").run()
  await env.DB.prepare("DELETE FROM publications").run()
})

describe("access-code gate", () => {
  it("answers a navigation with the code page and a subresource with JSON", async () => {
    const token = await publish(CODE)

    const page = await get(token, "", navigation())
    expect(page.status).toBe(401)
    expect(page.headers.get("content-type")).toContain("text/html")
    const html = await page.text()
    expect(html).toContain("This book is shared with an access code")
    expect(html).toContain(`action="/p/${token}/access"`)
    /** The title is escaped, never interpolated raw. */
    expect(html).toContain("Raven &amp; the &lt;Sun&gt;")
    expect(html).not.toContain("<Sun>")

    const asset = await get(token, "assets/app.css", subresource())
    expect(asset.status).toBe(401)
    expect(asset.headers.get("content-type")).toContain("application/json")
    await expect(asset.json()).resolves.toMatchObject({ error: "unauthorized" })
  })

  it("opens everything, comments included, once the code is entered", async () => {
    const token = await publish(CODE)
    const cookie = await unlocked(token)

    const page = await get(token, "", navigation(cookie))
    expect(page.status).toBe(200)
    await expect(page.text()).resolves.toContain("page one")

    const asset = await get(token, "assets/app.css", subresource(cookie))
    expect(asset.status).toBe(200)

    const comments = await app().request(
      `${BASE}/p/${token}/comments?page_section_id=pg001_sec001`,
      { headers: { Cookie: `${PUBLICATION_ACCESS_COOKIE}=${cookie}` } },
      env,
    )
    expect(comments.status).toBe(200)

    const named = await app().request(
      `${BASE}/p/${token}/session`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: `${PUBLICATION_ACCESS_COOKIE}=${cookie}`,
        },
        body: JSON.stringify({ name: "Maria" }),
      },
      env,
    )
    expect(named.status).toBe(201)
  })

  it("keeps the comments API behind the gate as hard as the pages", async () => {
    const token = await publish(CODE)

    const listed = await app().request(
      `${BASE}/p/${token}/comments?page_section_id=pg001_sec001`,
      {},
      env,
    )
    expect(listed.status).toBe(401)
    await expect(listed.json()).resolves.toMatchObject({ error: "unauthorized" })

    const named = await app().request(
      `${BASE}/p/${token}/session`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Maria" }),
      },
      env,
    )
    expect(named.status).toBe(401)
  })

  it("sets a 90-day host-only cookie scoped to the publication", async () => {
    const token = await publish(CODE)
    const res = await enter(token, CODE)
    const header = res.headers.get("set-cookie") ?? ""
    expect(header).toContain(`Path=/p/${token}`)
    expect(header).toContain("HttpOnly")
    expect(header).toContain("Secure")
    expect(header).toContain("SameSite=Lax")
    expect(header).toContain(`Max-Age=${PUBLICATION_ACCESS_MAX_AGE_SECONDS}`)
    expect(header).not.toContain("Domain=")
  })

  it("refuses a wrong code with one envelope and no cookie", async () => {
    const token = await publish(CODE)
    const res = await enter(token, "WRONG1")
    expect(res.status).toBe(401)
    expect(res.headers.get("set-cookie")).toBeNull()
    await expect(res.json()).resolves.toEqual({
      error: "unauthorized",
      message: "That code does not open this book",
    })
  })

  it("ignores the case and surrounding space of the code as typed", async () => {
    const token = await publish(CODE)
    for (const typed of [" k7m4qp ", "K7m4Qp"]) {
      const res = await enter(token, typed)
      expect(res.status, typed).toBe(204)
    }
  })

  it("refuses a cookie minted for another publication", async () => {
    const first = await publish(CODE)
    const second = await publish(CODE)
    const cookie = await unlocked(first)

    const crossed = await get(second, "", navigation(cookie))
    expect(crossed.status).toBe(401)
  })

  /** The cookie's tag is keyed over the stored hash, whose salt is fresh on every set, so
   *  rotating the code — even to the same string — retires every grant already handed out. */
  it("invalidates existing cookies when the code is rotated or removed", async () => {
    const token = await publish(CODE)
    const cookie = await unlocked(token)
    expect((await get(token, "", navigation(cookie))).status).toBe(200)

    const rotated = await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ access_code: "R9T2WX" }),
      },
      env,
    )
    expect(rotated.status).toBe(200)
    await expect(rotated.json()).resolves.toMatchObject({ has_access_code: true })

    expect((await get(token, "", navigation(cookie))).status).toBe(401)
    expect((await enter(token, CODE)).status).toBe(401)

    const fresh = await unlocked(token, "R9T2WX")
    expect(fresh).not.toBe(cookie)
    expect((await get(token, "", navigation(fresh))).status).toBe(200)

    const removed = await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ access_code: null }),
      },
      env,
    )
    expect(removed.status).toBe(200)
    await expect(removed.json()).resolves.toMatchObject({ has_access_code: false })
    expect((await get(token, "", navigation())).status).toBe(200)
  })

  it("re-locks a publication that was published without a code", async () => {
    const token = await publish()
    expect((await get(token, "", navigation())).status).toBe(200)

    const locked = await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ access_code: CODE }),
      },
      env,
    )
    expect(locked.status).toBe(200)
    expect((await get(token, "", navigation())).status).toBe(401)
    expect((await get(token, "", navigation(await unlocked(token)))).status).toBe(200)
  })

  it("leaves a publication without a code exactly as it was", async () => {
    const token = await publish()

    expect((await get(token, "", navigation())).status).toBe(200)
    expect((await get(token, "assets/app.css", subresource())).status).toBe(200)

    /** Nothing to unlock, so the door is a no-op rather than a lie in either direction. */
    const res = await enter(token, "ANYTHING")
    expect(res.status).toBe(204)
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("lets MGMT_SECRET past the gate", async () => {
    const token = await publish(CODE)

    const page = await app().request(
      `${BASE}/p/${token}/`,
      { headers: { ...navigation().headers, Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(page.status).toBe(200)

    const comments = await app().request(
      `${BASE}/p/${token}/comments?page_section_id=pg001_sec001`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(comments.status).toBe(200)
  })

  it("keeps the 404 and 410 ladder ahead of the gate", async () => {
    const unknown = await get("nosuchTokenAbcdefghijklmnopqrst", "", navigation())
    expect(unknown.status).toBe(404)

    const malformed = await get("short", "", navigation())
    expect(malformed.status).toBe(404)

    const token = await publish(CODE)
    const revoked = await app().request(
      `${BASE}/api/publications/${token}/revoke`,
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(revoked.status).toBe(200)

    /** A stopped link says it is stopped — asking for a code it would refuse anyway would be
     *  a worse answer, and it would leak that the token is real to anyone with the code. */
    const gone = await get(token, "", navigation())
    expect(gone.status).toBe(410)
    await expect(gone.json()).resolves.toMatchObject({ error: "revoked" })
    expect((await enter(token, CODE)).status).toBe(410)
  })

  it("carries the reader through to the page they were opening", async () => {
    const token = await publish(CODE)
    const page = await get(token, "assets/app.css", navigation())
    expect(page.status).toBe(401)
    await expect(page.text()).resolves.toContain('value="assets/app.css"')

    const body = new URLSearchParams({ code: CODE, next: "assets/app.css" })
    const submitted = await app().request(
      `${BASE}/p/${token}/access`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      env,
    )
    expect(submitted.status).toBe(303)
    expect(submitted.headers.get("location")).toBe(`/p/${token}/assets/app.css`)
    accessCookieFrom(submitted)
  })

  it("re-renders the form with an error for a wrong code posted from the page", async () => {
    const token = await publish(CODE)
    const submitted = await app().request(
      `${BASE}/p/${token}/access`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: "NOPE12", next: "" }).toString(),
      },
      env,
    )
    expect(submitted.status).toBe(401)
    expect(submitted.headers.get("set-cookie")).toBeNull()
    await expect(submitted.text()).resolves.toContain("That code doesn't open this book")
  })

  it("refuses to be an open redirect", async () => {
    const token = await publish(CODE)
    for (const next of ["https://evil.example/", "//evil.example/", "../../etc/passwd"]) {
      const submitted = await app().request(
        `${BASE}/p/${token}/access`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code: CODE, next }).toString(),
        },
        env,
      )
      expect(submitted.status, next).toBe(303)
      expect(submitted.headers.get("location"), next).toBe(`/p/${token}/`)
    }
  })

  it("never reports the code or its hash on the management routes", async () => {
    const token = await publish(CODE)

    const detail = await app().request(
      `${BASE}/api/publications/${token}`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(detail.status).toBe(200)
    const body = (await detail.json()) as PublicationDetail
    expect(body.has_access_code).toBe(true)
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(CODE)
    expect(serialized).not.toContain("pbkdf2")
    expect(serialized).not.toMatch(/"access_code"/)

    const revoked = await app().request(
      `${BASE}/api/publications/${token}/revoke`,
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    const revokedBody = (await revoked.json()) as PublicationResponse
    expect(revokedBody.has_access_code).toBe(true)
    expect(JSON.stringify(revokedBody)).not.toContain(CODE)
  })

  it("stores the code as a salted PBKDF2 hash, never as the code", async () => {
    const token = await publish(CODE)
    const row = await env.DB.prepare(`SELECT access_code FROM publications WHERE token = ?`)
      .bind(token)
      .first<{ access_code: string | null }>()
    expect(row?.access_code).toMatch(/^pbkdf2-sha256\$100000\$[\w-]+\$[\w-]+$/)
    expect(row?.access_code).not.toContain(CODE)

    const second = await publish(CODE)
    const other = await env.DB.prepare(`SELECT access_code FROM publications WHERE token = ?`)
      .bind(second)
      .first<{ access_code: string | null }>()
    /** Same code, different salt — two publications never share a stored value. */
    expect(other?.access_code).not.toBe(row?.access_code)
  })

  it("leaves expiry alone when only the code changes, and the code alone when only expiry does", async () => {
    const token = await publish(CODE)
    const expiry = "2099-01-01T00:00:00.000Z"

    const dated = await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ expires_at: expiry }),
      },
      env,
    )
    await expect(dated.json()).resolves.toMatchObject({
      publication: { expires_at: expiry },
      has_access_code: true,
    })

    const recoded = await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ access_code: "R9T2WX" }),
      },
      env,
    )
    await expect(recoded.json()).resolves.toMatchObject({
      publication: { expires_at: expiry },
      has_access_code: true,
    })

    const cleared = await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ expires_at: null }),
      },
      env,
    )
    await expect(cleared.json()).resolves.toMatchObject({
      publication: { expires_at: null },
      has_access_code: true,
    })
  })

  it("rejects an empty PATCH and a code that is too short or too long", async () => {
    const token = await publish(CODE)
    const bodies = [{}, { access_code: "abc" }, { access_code: "abcdefghijklm" }]
    for (const body of bodies) {
      const res = await app().request(
        `${BASE}/api/publications/${token}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", Authorization: `Bearer ${SECRET}` },
          body: JSON.stringify(body),
        },
        env,
      )
      expect(res.status, JSON.stringify(body)).toBe(400)
      await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
    }
  })

  it("refuses a create whose access code is too short", async () => {
    const body = new FormData()
    body.set(
      "metadata",
      JSON.stringify({
        token: nextToken(),
        title: "Raven",
        book_label: "raven",
        page_manifest: MANIFEST,
        access_code: "ab",
      }),
    )
    body.set("snapshot", snapshot())
    const res = await app().request(
      `${BASE}/api/publications`,
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` }, body },
      env,
    )
    expect(res.status).toBe(400)
  })
})

/**
 * Identity is established at the door (worker 0.5.1): the visitor names themselves to get in, so
 * the grant response carries a commenter session too and the pin composer never asks.
 */
describe("the access-code door as the identity step", () => {
  function cookieFrom(response: Response, name: string): string | null {
    const header = response.headers.get("set-cookie") ?? ""
    return new RegExp(`${name}=([^;,]+)`).exec(header)?.[1] ?? null
  }

  function bothCookies(response: Response): string {
    const access = cookieFrom(response, PUBLICATION_ACCESS_COOKIE)
    const session = cookieFrom(response, COMMENTER_SESSION_COOKIE)
    expect(access, response.headers.get("set-cookie") ?? "").not.toBeNull()
    expect(session, response.headers.get("set-cookie") ?? "").not.toBeNull()
    return `${PUBLICATION_ACCESS_COOKIE}=${access}; ${COMMENTER_SESSION_COOKIE}=${session}`
  }

  function enterAs(token: string, code: string, name?: string): Promise<Response> {
    return app().request(
      `${BASE}/p/${token}/access`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(name === undefined ? { code } : { code, name }),
      },
      env,
    )
  }

  function submit(token: string, fields: Record<string, string>, cookie?: string): Promise<Response> {
    return app().request(
      `${BASE}/p/${token}/access`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          ...(cookie === undefined ? {} : { Cookie: cookie }),
        },
        body: new URLSearchParams(fields).toString(),
      },
      env,
    )
  }

  async function sessions(): Promise<{ id: string; name: string }[]> {
    const { results } = await env.DB.prepare(
      `SELECT id, name FROM sessions ORDER BY created_at`,
    ).all<{ id: string; name: string }>()
    return results
  }

  it("asks for a name beside the code, and keeps the page script-free", async () => {
    const token = await publish(CODE)
    const html = await (await get(token, "", navigation())).text()

    expect(html).toContain(">Your name<")
    expect(html).toContain(`name="name"`)
    expect(html).toContain(`id="name"`)
    expect(html).toContain("required")
    expect(html).toContain(`id="code"`)
    expect(html).not.toContain("<script")
  })

  it("grants access and issues a commenter session on the same response", async () => {
    const token = await publish(CODE)
    const res = await enterAs(token, CODE, "  Maria  ")
    expect(res.status).toBe(204)

    const cookie = bothCookies(res)
    await expect(sessions()).resolves.toMatchObject([{ name: "Maria" }])

    const posted = await app().request(
      `${BASE}/p/${token}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json", Cookie: cookie },
        body: JSON.stringify({ page_section_id: "pg001_sec001", body: "the fox is lovely" }),
      },
      env,
    )
    expect(posted.status).toBe(201)
    await expect(posted.json()).resolves.toMatchObject({ comment: { author_name: "Maria" } })

    const listed = await app().request(
      `${BASE}/p/${token}/comments?page_section_id=pg001_sec001`,
      { headers: { Cookie: cookie } },
      env,
    )
    const body = (await listed.json()) as PublishCommentListResponse
    expect(body.session).toMatchObject({ name: "Maria", is_author: false })
  })

  it("still grants access, and creates nothing, when no name is sent", async () => {
    const token = await publish(CODE)
    const res = await enterAs(token, CODE)
    expect(res.status).toBe(204)
    expect(cookieFrom(res, PUBLICATION_ACCESS_COOKIE)).not.toBeNull()
    expect(cookieFrom(res, COMMENTER_SESSION_COOKIE)).toBeNull()
    await expect(sessions()).resolves.toEqual([])

    /** The composer is the fallback path, so the name still lands through `/session`. */
    const named = await app().request(
      `${BASE}/p/${token}/session`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: `${PUBLICATION_ACCESS_COOKIE}=${cookieFrom(res, PUBLICATION_ACCESS_COOKIE)}`,
        },
        body: JSON.stringify({ name: "Maria" }),
      },
      env,
    )
    expect(named.status).toBe(201)
  })

  /** A name over 60 characters cannot become an identity, but the code was right, so the door
   *  opens and the composer asks again rather than the reader being stuck outside. */
  it("opens the book but skips the session when the name is unusable", async () => {
    const token = await publish(CODE)
    const res = await enterAs(token, CODE, "M".repeat(61))
    expect(res.status).toBe(204)
    expect(cookieFrom(res, PUBLICATION_ACCESS_COOKIE)).not.toBeNull()
    expect(cookieFrom(res, COMMENTER_SESSION_COOKIE)).toBeNull()
    await expect(sessions()).resolves.toEqual([])
  })

  it("renames the returning visitor instead of giving them a second identity", async () => {
    const token = await publish(CODE)
    const first = await enterAs(token, CODE, "Maria")
    const cookie = bothCookies(first)
    const [created] = await sessions()

    await app().request(
      `${BASE}/p/${token}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json", Cookie: cookie },
        body: JSON.stringify({ page_section_id: "pg001_sec001", body: "first pass" }),
      },
      env,
    )

    const again = await submit(token, { code: CODE, name: "Maria Silva", next: "" }, cookie)
    expect(again.status).toBe(303)

    const rows = await sessions()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: created?.id, name: "Maria Silva" })

    /** The rename reaches the pin she already dropped — same session, same color, same comment. */
    const listed = await app().request(
      `${BASE}/p/${token}/comments?page_section_id=pg001_sec001`,
      { headers: { Cookie: bothCookies(again) } },
      env,
    )
    const body = (await listed.json()) as PublishCommentListResponse
    expect(body.comments).toHaveLength(1)
    expect(body.comments[0]).toMatchObject({ author_name: "Maria Silva" })
    expect(body.session).toMatchObject({ id: created?.id, name: "Maria Silva" })
  })

  it("creates no session when the code is wrong, however the name was sent", async () => {
    const token = await publish(CODE)

    const json = await enterAs(token, "WRONG1", "Maria")
    expect(json.status).toBe(401)
    expect(json.headers.get("set-cookie")).toBeNull()

    const form = await submit(token, { code: "WRONG1", name: "Maria", next: "" })
    expect(form.status).toBe(401)
    expect(form.headers.get("set-cookie")).toBeNull()
    /** Her name comes back on the re-render: the code is what she has to retype. */
    await expect(form.text()).resolves.toContain(`value="Maria"`)

    await expect(sessions()).resolves.toEqual([])
  })

  it("escapes a name on its way back into the page", async () => {
    const token = await publish(CODE)
    const form = await submit(token, {
      code: "WRONG1",
      name: `Maria" onfocus="alert(1)`,
      next: "",
    })
    const html = await form.text()
    expect(html).toContain("Maria&quot; onfocus=&quot;alert(1)")
    expect(html).not.toContain(`onfocus="alert(1)"`)
  })

  it("carries name and code through the form path to the page being opened", async () => {
    const token = await publish(CODE)
    const submitted = await submit(token, {
      code: CODE,
      name: "João",
      next: "assets/app.css",
    })
    expect(submitted.status).toBe(303)
    expect(submitted.headers.get("location")).toBe(`/p/${token}/assets/app.css`)
    bothCookies(submitted)
    await expect(sessions()).resolves.toMatchObject([{ name: "João" }])
  })

  it("leaves a codeless publication alone — the composer is the name step there", async () => {
    const token = await publish()
    const res = await enterAs(token, "ANYTHING", "Maria")
    expect(res.status).toBe(204)
    expect(res.headers.get("set-cookie")).toBeNull()
    await expect(sessions()).resolves.toEqual([])
  })
})
