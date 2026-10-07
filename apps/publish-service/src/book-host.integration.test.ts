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

/** Bound the way the Studio deploys a book host: pinned to its one book. */
function bookHost(input: string, init?: RequestInit, bindings: Record<string, unknown> = { ...env, BOOK_TOKEN: TOKEN }): Promise<Response> {
  return createBookHostApp().request(input, init, bindings)
}

const OTHER_TOKEN = "bookHostOtherTokenAbcdefghijklmn"

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
  ["POST", `/api/publications/${TOKEN}/room-ticket`],
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

  /** An author room ticket is an author credential. A book host must never hand one out — least
   *  of all to a caller presenting nothing at all. */
  it("gives no author room ticket to a caller with no credentials", async () => {
    const response = await bookHost(`${BASE}/api/publications/${TOKEN}/room-ticket`, { method: "POST" })
    expect(response.status).toBe(404)
    await expect(response.text()).resolves.not.toContain("ticket")
  })

  /** Every book shares the account's database, so before the pin any host answered for any book
   *  — and one book's author secret was an author credential for all of them. */
  it("serves only its own book, even to that book's author", async () => {
    await publishSnapshot(control, BASE, SECRET, {
      token: OTHER_TOKEN,
      title: "Another book",
      bookLabel: "other",
      pageManifest: MANIFEST,
      files: { "index.html": "<h1>other book</h1>" },
    })
    for (const path of [`/p/${OTHER_TOKEN}/`, `/p/${OTHER_TOKEN}/index.html`, `/p/${OTHER_TOKEN}/comments`]) {
      expect((await bookHost(`${BASE}${path}`)).status, path).toBe(404)
      expect(
        (await bookHost(`${BASE}${path}`, { headers: { Authorization: `Bearer ${SECRET}` } })).status,
        `${path} with a secret`,
      ).toBe(404)
    }
    expect((await bookHost(`${BASE}/p/${TOKEN}/index.html`)).status).toBe(200)
  })

  /** Variants of a path that must still land on the pin, never on another book. */
  it("refuses another book under every spelling of its path", async () => {
    await publishSnapshot(control, BASE, SECRET, {
      token: OTHER_TOKEN,
      title: "Another book",
      bookLabel: "other",
      pageManifest: MANIFEST,
      files: { "index.html": "<h1>other book</h1>", "cover.png": "png" },
    })
    const variants = [
      `/p/${[...OTHER_TOKEN].map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")}/index.html`,
      `/p/${OTHER_TOKEN}`,
      `/p/${OTHER_TOKEN}/cover.png`,
      `/p/${OTHER_TOKEN}/access`,
      `/p/${TOKEN}/../${OTHER_TOKEN}/index.html`,
      `/p/${TOKEN}/%2e%2e/${OTHER_TOKEN}/index.html`,
      `//p/${OTHER_TOKEN}/index.html`,
      `/p//${OTHER_TOKEN}/index.html`,
    ]
    for (const path of variants) {
      const response = await bookHost(`${BASE}${path}`, { headers: { Authorization: `Bearer ${SECRET}` } })
      expect(response.status, path).not.toBe(200)
      await expect(response.text(), path).resolves.not.toContain("other book")
    }
  })

  it("refuses another book's live room, even to an author", async () => {
    await publishSnapshot(control, BASE, SECRET, {
      token: OTHER_TOKEN,
      title: "Another book",
      bookLabel: "other",
      pageManifest: MANIFEST,
      files: { "index.html": "<h1>other book</h1>" },
    })
    const response = await bookHost(`${BASE}/p/${OTHER_TOKEN}/room`, {
      headers: { Authorization: `Bearer ${SECRET}`, Upgrade: "websocket" },
    })
    expect(response.status).toBe(404)
  })

  it("serves nothing when no book is bound to it", async () => {
    expect((await bookHost(`${BASE}/p/${TOKEN}/index.html`, undefined, { ...env })).status).toBe(404)
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
