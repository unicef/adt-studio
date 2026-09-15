import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { PUBLICATION_ACCESS_COOKIE } from "@adt/types"
import { createApp } from "./app.js"
import { publishSnapshot } from "../test/fixtures.js"

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"
const CODE = "K7M4QP"
const MANIFEST = [{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]
let counter = 0

function app() { return createApp() }
async function publish(code = CODE) {
  const token = `access${String(++counter).padStart(4, "0")}TokenAbcdefghijkl`.slice(0, 32)
  await publishSnapshot((input, init) => app().request(input, init, env), BASE, SECRET, {
    token, title: "Raven & the <Sun>", bookLabel: "raven", pageManifest: MANIFEST,
    files: { "index.html": "<h1>page one</h1>", "assets/app.css": "h1{}" }, accessCode: code,
  })
  return token
}
function navigation(cookie?: string): RequestInit {
  return { headers: { accept: "text/html", "sec-fetch-mode": "navigate", ...(cookie ? { Cookie: `${PUBLICATION_ACCESS_COOKIE}=${cookie}` } : {}) } }
}
async function enter(token: string, code: string) {
  return app().request(`${BASE}/p/${token}/access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }, env)
}
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM publication_upload_files"), env.DB.prepare("DELETE FROM publication_uploads"), env.DB.prepare("DELETE FROM versions"), env.DB.prepare("DELETE FROM publications")])
})

describe("access-code gate", () => {
  it("prompts navigations and rejects assets without a grant", async () => {
    const token = await publish()
    const page = await app().request(`${BASE}/p/${token}/`, navigation(), env)
    expect(page.status).toBe(401)
    const html = await page.text()
    expect(html).toContain("Enter the code you were given")
    expect(html).not.toContain('name="name"')
    expect(html).toContain("Raven &amp; the &lt;Sun&gt;")
    expect((await app().request(`${BASE}/p/${token}/assets/app.css`, {}, env)).status).toBe(401)
  })

  it("issues a scoped cookie for the correct code and serves the snapshot", async () => {
    const token = await publish()
    expect((await enter(token, "wrong")).status).toBe(401)
    const granted = await enter(token, " k7m4qp ")
    expect(granted.status).toBe(204)
    const cookie = new RegExp(`${PUBLICATION_ACCESS_COOKIE}=([^;]+)`).exec(granted.headers.get("set-cookie") ?? "")?.[1]
    expect(cookie).toBeDefined()
    expect(granted.headers.get("set-cookie")).not.toContain("adt_pub_session")
    const page = await app().request(`${BASE}/p/${token}/`, navigation(cookie), env)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain("page one")
  })

  it("invalidates the cookie when the code changes", async () => {
    const token = await publish()
    const granted = await enter(token, CODE)
    const cookie = new RegExp(`${PUBLICATION_ACCESS_COOKIE}=([^;]+)`).exec(granted.headers.get("set-cookie") ?? "")?.[1] as string
    const changed = await app().request(`${BASE}/api/publications/${token}`, { method: "PATCH", headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json" }, body: JSON.stringify({ access_code: "N3W9CD" }) }, env)
    expect(changed.status).toBe(200)
    expect((await app().request(`${BASE}/p/${token}/`, navigation(cookie), env)).status).toBe(401)
  })
})
