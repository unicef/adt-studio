import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "./app.js"
import { publishSnapshot, resetBindings } from "../test/fixtures.js"

const SECRET = "mgmt-secret-value"
const BASE = "https://adt-publish.example.workers.dev"
const TOKEN = "appRoutesTokenAbcdefghijklmnopq12"
const MANIFEST = [{ section_id: "page-1", href: "index.html", page_number: 1 }]

beforeEach(resetBindings)

function management(method = "POST", body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

async function publish(): Promise<void> {
  await publishSnapshot(
    (input, init) => createApp().request(input, init, { ...env, MGMT_SECRET: SECRET }),
    BASE,
    SECRET,
    {
      token: TOKEN,
      title: "Raven and the Sun",
      bookLabel: "raven",
      pageManifest: MANIFEST,
      files: { "index.html": "<h1>one</h1>" },
    },
  )
}

describe("publication management routes", () => {
  it("returns the publication, version history, and share URL", async () => {
    await publish()
    const response = await createApp().request(
      `${BASE}/api/publications/${TOKEN}`,
      management("GET"),
      { ...env, MGMT_SECRET: SECRET },
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      publication: { token: TOKEN, title: "Raven and the Sun", current_version: 1 },
      versions: [{ version: 1, page_manifest: MANIFEST }],
      url: `${BASE}/p/${TOKEN}/`,
    })
  })

  it("updates expiry and access settings without changing the current snapshot", async () => {
    await publish()
    const patch = await createApp().request(
      `${BASE}/api/publications/${TOKEN}`,
      management("PATCH", { expires_at: "2027-01-01T00:00:00.000Z", access_code: "S3cure" }),
      { ...env, MGMT_SECRET: SECRET },
    )
    expect(patch.status).toBe(200)
    await expect(patch.json()).resolves.toMatchObject({
      publication: { expires_at: "2027-01-01T00:00:00.000Z" },
      has_access_code: true,
    })
    const guarded = await createApp().request(`${BASE}/p/${TOKEN}/`, {}, { ...env, MGMT_SECRET: SECRET })
    expect(guarded.status).toBe(401)
    await expect(guarded.json()).resolves.toMatchObject({ error: "unauthorized" })
  })

  it("revokes and reinstates a publication idempotently", async () => {
    await publish()
    const bindings = { ...env, MGMT_SECRET: SECRET }
    expect((await createApp().request(`${BASE}/api/publications/${TOKEN}/revoke`, management(), bindings)).status).toBe(200)
    expect((await createApp().request(`${BASE}/p/${TOKEN}/`, {}, bindings)).status).toBe(410)
    expect((await createApp().request(`${BASE}/api/publications/${TOKEN}/revoke`, management(), bindings)).status).toBe(200)
    expect((await createApp().request(`${BASE}/api/publications/${TOKEN}/reinstate`, management(), bindings)).status).toBe(200)
    await expect((await createApp().request(`${BASE}/p/${TOKEN}/`, {}, bindings)).text()).resolves.toBe("<h1>one</h1>")
  })

  it("returns validation and authorization errors without modifying state", async () => {
    const bindings = { ...env, MGMT_SECRET: SECRET }
    expect((await createApp().request(`${BASE}/api/publications/${TOKEN}`, { method: "GET" }, bindings)).status).toBe(401)
    expect((await createApp().request(`${BASE}/api/publications/${TOKEN}`, management("PATCH", {}), bindings)).status).toBe(400)
    expect((await createApp().request(`${BASE}/api/publications/unknownTokenAbcdefghijklmnopq12`, management("GET"), bindings)).status).toBe(404)
  })
})
