import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import type { Publication, PublicationDetail } from "@adt/types"
import { createApp } from "./app.js"

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"

let tokenCounter = 0

function nextToken(): string {
  tokenCounter += 1
  return `integration${String(tokenCounter).padStart(4, "0")}TokenAbcdefghij`.slice(0, 32)
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

function app() {
  return createApp()
}

function mgmt(body?: BodyInit): RequestInit {
  return {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}` },
    ...(body === undefined ? {} : { body }),
  }
}

async function publish(
  token: string,
  files: Record<string, string>,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return app().request(
    `${BASE}/api/publications`,
    mgmt(
      form(
        { token, title: "Raven and the Sun", book_label: "raven", page_manifest: [], ...extra },
        files,
      ),
    ),
    env,
  )
}

async function r2Text(key: string): Promise<string | null> {
  const object = await env.SNAPSHOTS.get(key)
  return object ? await object.text() : null
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM publications").run()
  await env.DB.prepare("DELETE FROM versions").run()
})

describe("publish round-trip against real D1 and R2", () => {
  it("creates the D1 rows, writes every file to R2 and serves the snapshot back", async () => {
    const token = nextToken()
    const manifest = [
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
      { section_id: "pg002_sec001", href: "pg002_sec001.html" },
    ]

    const created = await app().request(
      `${BASE}/api/publications`,
      mgmt(
        form(
          {
            token,
            title: "Raven and the Sun",
            book_label: "raven",
            page_manifest: manifest,
          },
          {
            "index.html": "<h1>page one</h1>",
            "pg002_sec001.html": "<h1>page two</h1>",
            "content/pages.json": JSON.stringify(manifest),
            "assets/tailwind_output.css": "body{margin:0}",
            "images/cover.png": "fake-png-bytes",
          },
        ),
      ),
      env,
    )

    expect(created.status).toBe(201)
    const body = (await created.json()) as {
      publication: Publication
      version: { version: number; page_manifest: unknown[] }
      url: string
    }
    expect(body.publication.current_version).toBe(1)
    expect(body.version.page_manifest).toEqual(manifest)
    expect(body.url).toBe(`${BASE}/p/${token}/`)

    const row = await env.DB.prepare("SELECT * FROM publications WHERE token = ?")
      .bind(token)
      .first<{ title: string; current_version: number }>()
    expect(row?.title).toBe("Raven and the Sun")
    expect(row?.current_version).toBe(1)

    const versionRow = await env.DB.prepare(
      "SELECT page_manifest FROM versions WHERE token = ? AND version = 1",
    )
      .bind(token)
      .first<{ page_manifest: string }>()
    expect(JSON.parse(versionRow?.page_manifest ?? "[]")).toEqual(manifest)

    const index = await app().request(`${BASE}/p/${token}/`, {}, env)
    expect(index.status).toBe(200)
    expect(index.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(index.headers.get("cache-control")).toBe("no-cache")
    await expect(index.text()).resolves.toBe("<h1>page one</h1>")

    const pages = await app().request(`${BASE}/p/${token}/content/pages.json`, {}, env)
    expect(pages.headers.get("content-type")).toBe("application/json; charset=utf-8")
    await expect(pages.json()).resolves.toEqual(manifest)

    const png = await app().request(`${BASE}/p/${token}/images/cover.png`, {}, env)
    expect(png.status).toBe(200)
    expect(png.headers.get("content-type")).toBe("image/png")
    expect(png.headers.get("cache-control")).toBe("public, max-age=3600")

    const missing = await app().request(`${BASE}/p/${token}/nope.html`, {}, env)
    expect(missing.status).toBe(404)
    await expect(missing.json()).resolves.toEqual({ error: "not_found" })
  })

  it("republishes to v2, serves the new content and keeps v1 in the bucket", async () => {
    const token = nextToken()
    await publish(token, { "index.html": "version one" })

    const republished = await app().request(
      `${BASE}/api/publications/${token}/versions`,
      mgmt(
        form({ page_manifest: [{ section_id: "pg001_sec001", href: "index.html" }] }, {
          "index.html": "version two",
        }),
      ),
      env,
    )
    expect(republished.status).toBe(201)
    await expect(republished.json()).resolves.toMatchObject({
      publication: { current_version: 2 },
      version: { version: 2 },
    })

    const served = await app().request(`${BASE}/p/${token}/index.html`, {}, env)
    await expect(served.text()).resolves.toBe("version two")

    await expect(r2Text(`${token}/v1/index.html`)).resolves.toBe("version one")
    await expect(r2Text(`${token}/v2/index.html`)).resolves.toBe("version two")

    const detail = await app().request(
      `${BASE}/api/publications/${token}`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    const detailBody = (await detail.json()) as PublicationDetail
    expect(detailBody.versions.map((version) => version.version)).toEqual([1, 2])
    expect(detailBody.url).toBe(`${BASE}/p/${token}/`)
  })

  it("revokes a publication so the share link answers 410", async () => {
    const token = nextToken()
    await publish(token, { "index.html": "one" })

    const revoked = await app().request(`${BASE}/api/publications/${token}/revoke`, mgmt(), env)
    expect(revoked.status).toBe(200)
    const revokedBody = (await revoked.json()) as { publication: Publication }
    expect(revokedBody.publication.revoked_at).not.toBeNull()

    const served = await app().request(`${BASE}/p/${token}/index.html`, {}, env)
    expect(served.status).toBe(410)
    await expect(served.json()).resolves.toEqual({ error: "revoked" })

    const again = await app().request(`${BASE}/api/publications/${token}/revoke`, mgmt(), env)
    expect(again.status).toBe(200)
    await expect(again.json()).resolves.toMatchObject({
      publication: { revoked_at: revokedBody.publication.revoked_at },
    })

    const detail = await app().request(
      `${BASE}/api/publications/${token}`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(detail.status).toBe(200)
  })

  it("reinstates a revoked publication so the same link serves again", async () => {
    const token = nextToken()
    await publish(token, { "index.html": "one" })
    await app().request(`${BASE}/api/publications/${token}/revoke`, mgmt(), env)
    expect((await app().request(`${BASE}/p/${token}/index.html`, {}, env)).status).toBe(410)

    const resumed = await app().request(`${BASE}/api/publications/${token}/reinstate`, mgmt(), env)
    expect(resumed.status).toBe(200)
    await expect(resumed.json()).resolves.toMatchObject({ publication: { revoked_at: null } })

    const served = await app().request(`${BASE}/p/${token}/index.html`, {}, env)
    expect(served.status).toBe(200)
    await expect(served.text()).resolves.toBe("one")

    const again = await app().request(`${BASE}/api/publications/${token}/reinstate`, mgmt(), env)
    expect(again.status).toBe(200)
    await expect(again.json()).resolves.toMatchObject({ publication: { revoked_at: null } })
  })

  it("answers 404 when reinstating an unknown publication", async () => {
    const res = await app().request(
      `${BASE}/api/publications/nosuchtokennosuchtokennosuchtok/reinstate`,
      mgmt(),
      env,
    )
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "not_found" })
  })

  it("leaves the expiry alone, so an expired publication stays expired after reinstating", async () => {
    const token = nextToken()
    await publish(token, { "index.html": "one" }, { expires_at: "2020-01-01T00:00:00.000Z" })
    await app().request(`${BASE}/api/publications/${token}/revoke`, mgmt(), env)

    const resumed = await app().request(`${BASE}/api/publications/${token}/reinstate`, mgmt(), env)
    expect(resumed.status).toBe(200)
    await expect(resumed.json()).resolves.toMatchObject({
      publication: { revoked_at: null, expires_at: "2020-01-01T00:00:00.000Z" },
    })

    const served = await app().request(`${BASE}/p/${token}/index.html`, {}, env)
    expect(served.status).toBe(410)
    await expect(served.json()).resolves.toEqual({ error: "expired" })
  })

  it("expires a publication through PATCH and clears it again", async () => {
    const token = nextToken()
    await publish(token, { "index.html": "one" })

    const expire = await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ expires_at: "2020-01-01T00:00:00.000Z" }),
      },
      env,
    )
    expect(expire.status).toBe(200)

    const served = await app().request(`${BASE}/p/${token}/index.html`, {}, env)
    expect(served.status).toBe(410)
    await expect(served.json()).resolves.toEqual({ error: "expired" })

    const clear = await app().request(
      `${BASE}/api/publications/${token}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ expires_at: null }),
      },
      env,
    )
    expect(clear.status).toBe(200)

    const servedAgain = await app().request(`${BASE}/p/${token}/index.html`, {}, env)
    expect(servedAgain.status).toBe(200)
  })

  it("rejects a zip-slip entry and writes no D1 row", async () => {
    const token = nextToken()
    const res = await publish(token, { "../escape.html": "nope" })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })

    const row = await env.DB.prepare("SELECT token FROM publications WHERE token = ?")
      .bind(token)
      .first()
    expect(row).toBeNull()
  })

  it("rejects a snapshot over the compressed upload cap", async () => {
    const token = nextToken()
    const res = await createApp({ maxSnapshotBytes: 32 }).request(
      `${BASE}/api/publications`,
      mgmt(
        form(
          { token, title: "Raven", book_label: "raven", page_manifest: [] },
          { "index.html": "x".repeat(4096) },
        ),
      ),
      env,
    )
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({ error: "payload_too_large" })
  })

  it("rejects a zip whose entries expand past the per-entry cap", async () => {
    const token = nextToken()
    const res = await createApp({
      snapshotLimits: { maxEntries: 100, maxEntryBytes: 64, maxTotalBytes: 1024 },
    }).request(
      `${BASE}/api/publications`,
      mgmt(
        form(
          { token, title: "Raven", book_label: "raven", page_manifest: [] },
          { "index.html": "x".repeat(4096) },
        ),
      ),
      env,
    )
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({ error: "payload_too_large" })
  })

  it("rejects re-posting a token that already has a publication", async () => {
    const token = nextToken()
    expect((await publish(token, { "index.html": "one" })).status).toBe(201)
    const second = await publish(token, { "index.html": "two" })
    expect(second.status).toBe(400)
    await expect(r2Text(`${token}/v1/index.html`)).resolves.toBe("one")
  })

  it("unpacks a snapshot with many entries without holding them all in memory", async () => {
    const token = nextToken()
    const files: Record<string, string> = { "index.html": "cover" }
    for (let index = 0; index < 250; index += 1) {
      files[`content/pages/page-${index}.html`] = `<p>page ${index} ${"filler".repeat(200)}</p>`
    }

    const res = await publish(token, files)
    expect(res.status).toBe(201)

    const listing = await env.SNAPSHOTS.list({ prefix: `${token}/v1/` })
    expect(listing.objects.length).toBe(251)

    const page = await app().request(`${BASE}/p/${token}/content/pages/page-249.html`, {}, env)
    expect(page.status).toBe(200)
    await expect(page.text()).resolves.toContain("page 249")
  })
})
