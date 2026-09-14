import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { PublicationList } from "@adt/types"
import { createApp } from "./app.js"
import { publishSnapshot } from "../test/fixtures.js"

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"
const MANIFEST = [{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]
let counter = 0
function app() { return createApp() }
async function publish(title: string) {
  const token = `listing${String(++counter).padStart(4, "0")}TokenAbcdefghijk`.slice(0, 32)
  await publishSnapshot((input, init) => app().request(input, init, env), BASE, SECRET, {
    token, title, bookLabel: title, pageManifest: MANIFEST, files: { "index.html": `<h1>${title}</h1>` },
  })
  return token
}
async function list(): Promise<PublicationList> {
  const response = await app().request(`${BASE}/api/publications`, { headers: { Authorization: `Bearer ${SECRET}` } }, env)
  expect(response.status).toBe(200)
  return response.json() as Promise<PublicationList>
}
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM publication_upload_files"), env.DB.prepare("DELETE FROM publication_uploads"), env.DB.prepare("DELETE FROM versions"), env.DB.prepare("DELETE FROM publications")])
})

describe("GET /api/publications", () => {
  it("requires management authentication", async () => {
    expect((await app().request(`${BASE}/api/publications`, {}, env)).status).toBe(401)
  })
  it("lists publications newest first with stable hosting fields", async () => {
    const first = await publish("First")
    const second = await publish("Second")
    const result = await list()
    expect(result.publications.map((entry) => entry.publication.token)).toEqual([second, first])
    expect(result.publications[0]).toMatchObject({ url: `${BASE}/p/${second}/`, version_count: 1, comment_count: 0, unresolved_count: 0 })
  })
  it("removes a publication and its immutable snapshot", async () => {
    const token = await publish("Disposable")
    const deleted = await app().request(`${BASE}/api/publications/${token}`, { method: "DELETE", headers: { Authorization: `Bearer ${SECRET}` } }, env)
    expect(deleted.status).toBe(200)
    expect((await app().request(`${BASE}/p/${token}/`, {}, env)).status).toBe(404)
    expect((await list()).publications).toEqual([])
  })
})
