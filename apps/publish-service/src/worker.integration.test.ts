import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { PUBLISH_WORKER_VERSION } from "@adt/types"
import { createApp } from "./app.js"
import { publishSnapshot, resetBindings } from "../test/fixtures.js"

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"
const TOKEN = "workerRoundTripTokenAbcdefghijk12"
const MANIFEST = [{ section_id: "page-1", href: "index.html", page_number: 1 }]

beforeEach(resetBindings)

function send(input: string, init?: RequestInit): Promise<Response> {
  return createApp().request(input, init, env)
}

async function publish(files: Record<string, string>, version = false): Promise<void> {
  await publishSnapshot(send, BASE, SECRET, {
    token: TOKEN,
    ...(version ? {} : { title: "Raven and the Sun", bookLabel: "raven" }),
    pageManifest: MANIFEST,
    files,
  })
}

describe("publish worker", () => {
  it("reports the deployed API version without management credentials", async () => {
    const response = await createApp().request(`${BASE}/health`, {}, env)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, version: PUBLISH_WORKER_VERSION })
  })

  it("publishes files to D1/R2 and serves their appropriate response headers", async () => {
    await publish({
      "index.html": "<h1>page one</h1>",
      "content/pages.json": JSON.stringify(MANIFEST),
      "images/cover.png": "fake-png-bytes",
    })

    const detail = await send(`${BASE}/api/publications/${TOKEN}`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    })
    expect(detail.status).toBe(200)
    await expect(detail.json()).resolves.toMatchObject({
      publication: { token: TOKEN, current_version: 1 },
      versions: [{ version: 1, page_manifest: MANIFEST }],
      url: `${BASE}/p/${TOKEN}/`,
    })

    const page = await send(`${BASE}/p/${TOKEN}/`, {})
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8")
    await expect(page.text()).resolves.toBe("<h1>page one</h1>")
    const image = await send(`${BASE}/p/${TOKEN}/images/cover.png`, {})
    expect(image.headers.get("content-type")).toBe("image/png")
    expect(image.headers.get("cache-control")).toBe("public, max-age=3600")
  })

  it("keeps the old snapshot immutable when a new version is committed", async () => {
    await publish({ "index.html": "version one" })
    await publish({ "index.html": "version two" }, true)

    await expect((await send(`${BASE}/p/${TOKEN}/`, {})).text()).resolves.toBe("version two")
    const versions = await env.DB.prepare("SELECT version, snapshot_prefix FROM versions WHERE token = ? ORDER BY version")
      .bind(TOKEN)
      .all<{ version: number; snapshot_prefix: string }>()
    expect(versions.results).toHaveLength(2)
    expect(versions.results[0]?.snapshot_prefix).not.toBe(versions.results[1]?.snapshot_prefix)
    expect((await env.SNAPSHOTS.list()).objects).toHaveLength(2)
  })

  it("requires management authentication for upload and publication routes", async () => {
    for (const [method, path] of [
      ["POST", "/api/publication-uploads"],
      ["GET", `/api/publications/${TOKEN}`],
      ["POST", `/api/publications/${TOKEN}/revoke`],
    ]) {
      expect((await createApp().request(`${BASE}${path}`, { method }, env)).status).toBe(401)
    }
  })
})
