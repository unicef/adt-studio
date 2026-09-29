import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { PUBLISH_WORKER_VERSION } from "@adt/types"
import { createApp } from "./app.js"
import { createBookHostApp } from "./book-host-app.js"
import { publishSnapshot, resetBindings } from "../test/fixtures.js"

const SECRET = "local-dev-secret"
const BASE = "https://adt-book-66eb73ad64155e2f5456b607ed460974.example.workers.dev"
const TOKEN = "bookHostRoundTripTokenAbcdefghi1"
const MANIFEST = [{ section_id: "page-1", href: "index.html", page_number: 1 }]

beforeEach(resetBindings)

/** Publishing still runs through the control plane — the book host has no route that could
 *  accept an upload, which is the property under test. */
function control(input: string, init?: RequestInit): Promise<Response> {
  return createApp().request(input, init, env)
}

function bookHost(input: string, init?: RequestInit): Promise<Response> {
  return createBookHostApp().request(input, init, env)
}

/** Every management route the control plane serves. A book host must answer none of them. */
const MANAGEMENT_ROUTES: Array<[string, string]> = [
  ["GET", "/api/publications"],
  ["POST", "/api/publication-uploads"],
  ["GET", "/api/static-assets/manifest"],
  ["GET", `/api/publications/${TOKEN}`],
  ["GET", `/api/publications/${TOKEN}/readers`],
  ["POST", `/api/publications/${TOKEN}/revoke`],
  ["POST", `/api/publications/${TOKEN}/reinstate`],
  ["PATCH", `/api/publications/${TOKEN}`],
  ["DELETE", `/api/publications/${TOKEN}`],
]

describe("book host worker", () => {
  beforeEach(async () => {
    await publishSnapshot(control, BASE, SECRET, {
      token: TOKEN,
      title: "Raven and the Sun",
      bookLabel: "raven",
      pageManifest: MANIFEST,
      files: { "index.html": "<h1>page one</h1>" },
    })
  })

  it("answers the health check the provisioner verifies", async () => {
    const response = await bookHost(`${BASE}/health`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, version: PUBLISH_WORKER_VERSION })
  })

  it("serves the book to a reader", async () => {
    const response = await bookHost(`${BASE}/p/${TOKEN}/index.html`)
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain("page one")
  })

  /** The point of a separate host: the management API is absent, not guarded. A correct
   *  MGMT_SECRET must still find nothing, or the book Worker is a second way into the
   *  account's publications. */
  it("has no management API, even for a caller holding the management secret", async () => {
    for (const [method, route] of MANAGEMENT_ROUTES) {
      const response = await bookHost(`${BASE}${route}`, {
        method,
        headers: { Authorization: `Bearer ${SECRET}` },
      })
      expect(response.status, `${method} ${route}`).toBe(404)
    }
  })

  /** Same routes on the control plane, to prove the assertion above is about the book host and
   *  not about the routes having moved or been renamed. */
  it("covers routes the control plane really does serve", async () => {
    for (const [method, route] of MANAGEMENT_ROUTES) {
      const response = await control(`${BASE}${route}`, {
        method,
        headers: { Authorization: `Bearer ${SECRET}` },
      })
      expect(response.status, `${method} ${route}`).not.toBe(404)
    }
  })
})
