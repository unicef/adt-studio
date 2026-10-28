import { createHash } from "node:crypto"
import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "./app.js"

const SECRET = "local-dev-secret"
const BASE = "https://adt-publish.example.workers.dev"
const TOKEN = "UploadTokenAbcdefghijklmnopqrs1234"

function headers(): HeadersInit {
  return { Authorization: `Bearer ${SECRET}` }
}

function digest(body: string): string {
  return createHash("sha256").update(body).digest("hex")
}

async function start(
  kind: "create" | "version",
  files: Record<string, string>,
  accessCode?: string,
) {
  const app = createApp()
  const manifest = Object.entries(files).map(([path, body]) => ({
    path,
    bytes: Buffer.byteLength(body),
    sha256: digest(body),
  }))
  const response = await app.request(`${BASE}/api/publication-uploads`, {
    method: "POST",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      token: TOKEN,
      page_manifest: [{ section_id: "page-1", href: "index.html", page_number: 1 }],
      files: manifest,
      ...(kind === "create" ? { title: "Upload test", book_label: "upload" } : {}),
      ...(accessCode === undefined ? {} : { access_code: accessCode }),
    }),
  }, env)
  expect(response.status).toBe(201)
  return { app, upload: await response.json() as { upload_id: string; version: number } }
}

async function put(app: ReturnType<typeof createApp>, uploadId: string, path: string, body: string) {
  return app.request(`${BASE}/api/publication-uploads/${uploadId}/files/${path}`, {
    method: "PUT",
    headers: headers(),
    body,
  }, env)
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM publication_upload_files"),
    env.DB.prepare("DELETE FROM publication_uploads"),
    env.DB.prepare("DELETE FROM versions"),
    env.DB.prepare("DELETE FROM publications"),
  ])
})

describe("publication upload lifecycle", () => {
  it("publishes an immutable manifest and repeats commit safely", async () => {
    const files = { "index.html": "version one", "assets/app.js": "console.log(1)" }
    const { app, upload } = await start("create", files)
    for (const [path, body] of Object.entries(files)) expect((await put(app, upload.upload_id, path, body)).status).toBe(200)

    const commit = () => app.request(`${BASE}/api/publication-uploads/${upload.upload_id}/commit`, { method: "POST", headers: headers() }, env)
    const first = await commit()
    const second = await commit()
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect((await second.json()) as { publication: { current_version: number } }).toMatchObject({ publication: { current_version: 1 } })

    expect((await app.request(`${BASE}/p/${TOKEN}/`, {}, env)).status).toBe(200)
    await expect((await app.request(`${BASE}/p/${TOKEN}/`, {}, env)).text()).resolves.toBe("version one")
    expect((await put(app, upload.upload_id, "index.html", "version one")).status).toBe(409)
    expect((await app.request(`${BASE}/p/${TOKEN}/not-declared.html`, {}, env)).status).toBe(404)
  })

  /**
   * The store calls it `hasAccessCode` and the response schema reads `has_access_code`, so
   * spreading the record put the wrong key in the body and the field fell back to its `false`
   * default. The Studio writes that answer into the book's record, so a publish behind a code
   * was filed as an open link — visible nowhere until a reviewer hit a gate nobody knew about.
   */
  it("reports the access code it was given back to the publisher", async () => {
    const files = { "index.html": "gated" }
    const { app, upload } = await start("create", files, "S3cure")
    for (const [path, body] of Object.entries(files)) {
      expect((await put(app, upload.upload_id, path, body)).status).toBe(200)
    }

    const committed = await app.request(
      `${BASE}/api/publication-uploads/${upload.upload_id}/commit`,
      { method: "POST", headers: headers() },
      env,
    )
    expect(committed.status).toBe(201)
    await expect(committed.json()).resolves.toMatchObject({ has_access_code: true })

    // The gate is the second opinion: the body has to describe the book that was published.
    expect((await app.request(`${BASE}/p/${TOKEN}/`, {}, env)).status).toBe(401)
  })

  it("reports an ungated publication as ungated", async () => {
    const files = { "index.html": "open" }
    const { app, upload } = await start("create", files)
    for (const [path, body] of Object.entries(files)) {
      expect((await put(app, upload.upload_id, path, body)).status).toBe(200)
    }

    const committed = await app.request(
      `${BASE}/api/publication-uploads/${upload.upload_id}/commit`,
      { method: "POST", headers: headers() },
      env,
    )
    await expect(committed.json()).resolves.toMatchObject({ has_access_code: false })
    expect((await app.request(`${BASE}/p/${TOKEN}/`, {}, env)).status).toBe(200)
  })

  it("records the complete account-wide Static Assets manifest without writing an R2 object", async () => {
    const app = createApp()
    const body = "static bytes"
    const objectsBefore = (await env.SNAPSHOTS.list()).objects.length
    const startResponse = await app.request(`${BASE}/api/publication-uploads`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        kind: "create",
        token: TOKEN,
        title: "Static upload",
        book_label: "static",
        page_manifest: [{ section_id: "page-1", href: "index.html", page_number: 1 }],
        files: [{
          path: "index.html",
          bytes: Buffer.byteLength(body),
          sha256: digest(body),
          asset_hash: "a".repeat(32),
        }],
      }),
    }, env)
    const { upload_id: uploadId } = await startResponse.json() as { upload_id: string }

    expect((await app.request(`${BASE}/api/publication-uploads/${uploadId}/complete-static-assets`, {
      method: "POST", headers: headers(),
    }, env)).status).toBe(200)
    expect((await app.request(`${BASE}/api/publication-uploads/${uploadId}/commit`, {
      method: "POST", headers: headers(),
    }, env)).status).toBe(201)

    const manifest = await app.request(`${BASE}/api/static-assets/manifest`, { headers: headers() }, env)
    await expect(manifest.json()).resolves.toMatchObject({
      assets: [{ path: expect.stringMatching(/^\/uploads\/.+\/index\.html$/), hash: "a".repeat(32), bytes: body.length }],
    })
    expect((await env.SNAPSHOTS.list()).objects).toHaveLength(objectsBefore)
  })

  it("rejects incomplete, wrong, and undeclared files and only advances after a complete republish", async () => {
    const first = await start("create", { "index.html": "one" })
    expect((await first.app.request(`${BASE}/api/publication-uploads/${first.upload.upload_id}/commit`, { method: "POST", headers: headers() }, env)).status).toBe(400)
    expect((await put(first.app, first.upload.upload_id, "missing.html", "no")).status).toBe(400)
    expect((await put(first.app, first.upload.upload_id, "index.html", "wrong")).status).toBe(400)
    expect((await put(first.app, first.upload.upload_id, "index.html", "one")).status).toBe(200)
    expect((await first.app.request(`${BASE}/api/publication-uploads/${first.upload.upload_id}/commit`, { method: "POST", headers: headers() }, env)).status).toBe(201)

    const second = await start("version", { "index.html": "two" })
    expect(second.upload.version).toBe(2)
    expect((await put(second.app, second.upload.upload_id, "index.html", "two")).status).toBe(200)
    expect((await second.app.request(`${BASE}/api/publication-uploads/${second.upload.upload_id}/commit`, { method: "POST", headers: headers() }, env)).status).toBe(201)
    await expect((await second.app.request(`${BASE}/p/${TOKEN}/`, {}, env)).text()).resolves.toBe("two")
  })

  it("aborts an upload without touching the active snapshot", async () => {
    const first = await start("create", { "index.html": "live" })
    expect((await put(first.app, first.upload.upload_id, "index.html", "live")).status).toBe(200)
    await first.app.request(`${BASE}/api/publication-uploads/${first.upload.upload_id}/commit`, { method: "POST", headers: headers() }, env)
    const pending = await start("version", { "index.html": "unpublished" })
    expect((await put(pending.app, pending.upload.upload_id, "index.html", "unpublished")).status).toBe(200)
    expect((await pending.app.request(`${BASE}/api/publication-uploads/${pending.upload.upload_id}`, { method: "DELETE", headers: headers() }, env)).status).toBe(200)
    expect((await put(pending.app, pending.upload.upload_id, "index.html", "unpublished")).status).toBe(409)
    await expect((await pending.app.request(`${BASE}/p/${TOKEN}/`, {}, env)).text()).resolves.toBe("live")
  })
})
