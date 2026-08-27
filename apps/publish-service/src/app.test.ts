import { describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import { PUBLISH_WORKER_VERSION, type Publication } from "@adt/types"
import { createApp } from "./app.js"
import { emptyPublicationStore, type PublicationStore } from "./store.js"
import { createMemoryPublicationStore, createMemoryR2Bucket } from "./testing.js"

const TOKEN = "aBcDeFgHiJkLmNoPqRsTuVwXyZ012345"
const SECRET = "mgmt-secret-value"

const env = { MGMT_SECRET: SECRET }

function publication(overrides: Partial<Publication> = {}): Publication {
  return {
    token: TOKEN,
    title: "Raven and the Sun",
    book_label: "raven",
    current_version: 1,
    created_at: "2020-01-01T00:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    ...overrides,
  }
}

function storeOf(record: Publication | null, accessCode: string | null = null): PublicationStore {
  const of = (token: string): Publication | null =>
    record && record.token === token ? record : null
  return {
    ...emptyPublicationStore,
    async findByToken(token) {
      return of(token)
    },
    async findRecord(token) {
      const found = of(token)
      return found ? { publication: found, accessCode } : null
    },
  }
}

function snapshotForm(metadata: unknown, snapshotBytes = 16): FormData {
  const form = new FormData()
  form.set("metadata", JSON.stringify(metadata))
  form.set(
    "snapshot",
    new File([new Uint8Array(snapshotBytes)], "snapshot.zip", { type: "application/zip" }),
  )
  return form
}

function zipForm(metadata: unknown, files: Record<string, string>): FormData {
  const encoder = new TextEncoder()
  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, body]) => [name, encoder.encode(body)])),
  )
  const form = new FormData()
  form.set("metadata", JSON.stringify(metadata))
  form.set("snapshot", new File([zipped], "snapshot.zip", { type: "application/zip" }))
  return form
}

const createMetadata = {
  token: TOKEN,
  title: "Raven and the Sun",
  book_label: "raven",
  page_manifest: [{ section_id: "sec-1", href: "content/pages/page-1.html", page_number: 1 }],
}

function mgmt(body?: BodyInit): RequestInit {
  return {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}` },
    ...(body === undefined ? {} : { body }),
  }
}

interface Harness {
  app: ReturnType<typeof createApp>
  env: { MGMT_SECRET: string; SNAPSHOTS: R2Bucket }
  bucket: ReturnType<typeof createMemoryR2Bucket>
  store: PublicationStore
}

function harness(): Harness {
  const bucket = createMemoryR2Bucket()
  const store = createMemoryPublicationStore()
  const app = createApp({ store, now: () => new Date("2026-08-03T10:00:00.000Z") })
  return { app, env: { MGMT_SECRET: SECRET, SNAPSHOTS: bucket as R2Bucket }, bucket, store }
}

describe("GET /health", () => {
  it("reports the worker version so the provisioner can detect stale deployments", async () => {
    const res = await createApp().request("/health")
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, version: PUBLISH_WORKER_VERSION })
  })

  it("does not require management auth", async () => {
    const res = await createApp().request("/health", {}, {})
    expect(res.status).toBe(200)
  })
})

describe("management auth", () => {
  it("rejects requests with no Authorization header", async () => {
    const res = await createApp().request("/api/publications", { method: "POST" }, env)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" })
  })

  it("rejects a wrong secret", async () => {
    const res = await createApp().request(
      "/api/publications",
      { method: "POST", headers: { Authorization: "Bearer wrong-secret-val" } },
      env,
    )
    expect(res.status).toBe(401)
  })

  it("rejects a non-bearer scheme", async () => {
    const res = await createApp().request(
      "/api/publications",
      { method: "POST", headers: { Authorization: `Basic ${SECRET}` } },
      env,
    )
    expect(res.status).toBe(401)
  })

  it("fails closed when the worker has no MGMT_SECRET configured", async () => {
    const res = await createApp().request(
      "/api/publications",
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
      {},
    )
    expect(res.status).toBe(401)
  })

  it("guards every management route", async () => {
    const app = createApp()
    const routes: Array<[string, string]> = [
      ["POST", "/api/publications"],
      ["POST", `/api/publications/${TOKEN}/versions`],
      ["POST", `/api/publications/${TOKEN}/revoke`],
      ["POST", `/api/publications/${TOKEN}/reinstate`],
      ["PATCH", `/api/publications/${TOKEN}`],
      ["GET", `/api/publications/${TOKEN}`],
    ]

    for (const [method, path] of routes) {
      const res = await app.request(path, { method }, env)
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })
})

describe("POST /api/publications", () => {
  it("unpacks the snapshot into R2 and returns the created publication", async () => {
    const { app, env: bindings, bucket } = harness()
    const res = await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "<h1>page one</h1>", "assets/app.js": "42" })),
      bindings,
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      publication: Publication
      version: { version: number; page_manifest: unknown[] }
      url: string
    }
    expect(body.publication).toMatchObject({
      token: TOKEN,
      title: "Raven and the Sun",
      book_label: "raven",
      current_version: 1,
      expires_at: null,
      revoked_at: null,
    })
    expect(body.version.version).toBe(1)
    expect(body.version.page_manifest).toEqual(createMetadata.page_manifest)
    expect(body.url).toBe(`http://localhost/p/${TOKEN}/`)
    expect(bucket.keys()).toEqual([
      `${TOKEN}/v1/assets/app.js`,
      `${TOKEN}/v1/index.html`,
    ])
  })

  it("stores the expiry the Studio asked for", async () => {
    const { app, env: bindings } = harness()
    const res = await app.request(
      "/api/publications",
      mgmt(
        zipForm(
          { ...createMetadata, expires_at: "2027-01-01T00:00:00.000Z" },
          { "index.html": "<h1>hi</h1>" },
        ),
      ),
      bindings,
    )
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      publication: { expires_at: "2027-01-01T00:00:00.000Z" },
    })
  })

  it("rejects re-posting a token that already exists", async () => {
    const { app, env: bindings } = harness()
    const first = await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )
    expect(first.status).toBe(201)

    const second = await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "two" })),
      bindings,
    )
    expect(second.status).toBe(400)
    await expect(second.json()).resolves.toMatchObject({ error: "invalid_request" })
  })

  it("rejects a zip-slip entry before writing anything", async () => {
    const { app, env: bindings, bucket } = harness()
    const res = await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "../escape.html": "nope" })),
      bindings,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
    expect(bucket.keys()).toEqual([])
  })

  it("rejects an entry that expands past the per-entry cap", async () => {
    const bucket = createMemoryR2Bucket()
    const app = createApp({
      store: createMemoryPublicationStore(),
      snapshotLimits: { maxEntries: 10, maxEntryBytes: 8, maxTotalBytes: 1024 },
    })
    const res = await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "x".repeat(64) })),
      { MGMT_SECRET: SECRET, SNAPSHOTS: bucket as R2Bucket },
    )
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({ error: "payload_too_large" })
  })

  it("rejects an empty zip", async () => {
    const { app, env: bindings } = harness()
    const res = await app.request("/api/publications", mgmt(zipForm(createMetadata, {})), bindings)
    expect(res.status).toBe(400)
  })

  it("rejects a snapshot that is not a zip at all", async () => {
    const { app, env: bindings } = harness()
    const form = new FormData()
    form.set("metadata", JSON.stringify(createMetadata))
    form.set("snapshot", new File([new Uint8Array(64).fill(7)], "snapshot.zip"))
    const res = await app.request("/api/publications", mgmt(form), bindings)
    expect(res.status).toBe(400)
  })

  it("rejects metadata that does not match the contract", async () => {
    const res = await createApp().request(
      "/api/publications",
      mgmt(snapshotForm({ ...createMetadata, title: "" })),
      env,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
  })

  it("rejects a request with no snapshot file", async () => {
    const form = new FormData()
    form.set("metadata", JSON.stringify(createMetadata))
    const res = await createApp().request("/api/publications", mgmt(form), env)
    expect(res.status).toBe(400)
  })

  it("rejects a snapshot larger than the upload limit", async () => {
    const res = await createApp({ maxSnapshotBytes: 8 }).request(
      "/api/publications",
      mgmt(snapshotForm(createMetadata, 64)),
      env,
    )
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({ error: "payload_too_large" })
  })
})

describe("POST /api/publications/:token/versions", () => {
  it("writes a new version prefix, bumps current_version and keeps the old prefix", async () => {
    const { app, env: bindings, bucket } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "version one" })),
      bindings,
    )

    const res = await app.request(
      `/api/publications/${TOKEN}/versions`,
      mgmt(
        zipForm({ page_manifest: createMetadata.page_manifest }, { "index.html": "version two" }),
      ),
      bindings,
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      publication: { current_version: 2 },
      version: { version: 2 },
    })
    expect(bucket.keys()).toEqual([`${TOKEN}/v1/index.html`, `${TOKEN}/v2/index.html`])
  })

  it("returns 404 for an unknown publication", async () => {
    const { app, env: bindings } = harness()
    const res = await app.request(
      `/api/publications/${TOKEN}/versions`,
      mgmt(zipForm({ page_manifest: [] }, { "index.html": "orphan" })),
      bindings,
    )
    expect(res.status).toBe(404)
  })

  it("rejects a malformed token", async () => {
    const res = await createApp().request(
      "/api/publications/nope/versions",
      mgmt(snapshotForm({ page_manifest: [] })),
      env,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
  })
})

describe("POST /api/publications/:token/revoke", () => {
  it("sets revoked_at and is idempotent", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )

    const first = await app.request(`/api/publications/${TOKEN}/revoke`, mgmt(), bindings)
    expect(first.status).toBe(200)
    const firstBody = (await first.json()) as { publication: Publication }
    expect(firstBody.publication.revoked_at).toBe("2026-08-03T10:00:00.000Z")

    const second = await app.request(`/api/publications/${TOKEN}/revoke`, mgmt(), bindings)
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toMatchObject({
      publication: { revoked_at: "2026-08-03T10:00:00.000Z" },
    })
  })

  it("returns 404 for an unknown publication", async () => {
    const { app, env: bindings } = harness()
    const res = await app.request(`/api/publications/${TOKEN}/revoke`, mgmt(), bindings)
    expect(res.status).toBe(404)
  })
})

describe("POST /api/publications/:token/reinstate", () => {
  it("clears revoked_at and is idempotent", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )
    await app.request(`/api/publications/${TOKEN}/revoke`, mgmt(), bindings)

    const first = await app.request(`/api/publications/${TOKEN}/reinstate`, mgmt(), bindings)
    expect(first.status).toBe(200)
    await expect(first.json()).resolves.toMatchObject({ publication: { revoked_at: null } })

    const second = await app.request(`/api/publications/${TOKEN}/reinstate`, mgmt(), bindings)
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toMatchObject({ publication: { revoked_at: null } })
  })

  it("returns 404 for an unknown publication and 400 for a malformed token", async () => {
    const { app, env: bindings } = harness()
    expect(
      (await app.request(`/api/publications/${TOKEN}/reinstate`, mgmt(), bindings)).status,
    ).toBe(404)
    expect((await app.request("/api/publications/nope/reinstate", mgmt(), bindings)).status).toBe(
      400,
    )
  })
})

describe("PATCH /api/publications/:token", () => {
  it("sets and clears the expiry", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )

    for (const expires_at of ["2026-12-31T23:59:59.000Z", null]) {
      const res = await app.request(
        `/api/publications/${TOKEN}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
          body: JSON.stringify({ expires_at }),
        },
        bindings,
      )
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toMatchObject({ publication: { expires_at } })
    }
  })

  it("rejects a non-ISO expiry", async () => {
    const res = await createApp().request(
      `/api/publications/${TOKEN}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ expires_at: "next tuesday" }),
      },
      env,
    )
    expect(res.status).toBe(400)
  })

  it("rejects a missing body", async () => {
    const res = await createApp().request(
      `/api/publications/${TOKEN}`,
      { method: "PATCH", headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(res.status).toBe(400)
  })
})

describe("GET /api/publications/:token", () => {
  it("returns the publication, its versions and the share url", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )
    await app.request(
      `/api/publications/${TOKEN}/versions`,
      mgmt(zipForm({ page_manifest: [] }, { "index.html": "two" })),
      bindings,
    )

    const res = await app.request(
      `/api/publications/${TOKEN}`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      bindings,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      publication: Publication
      versions: Array<{ version: number }>
      url: string
    }
    expect(body.publication.current_version).toBe(2)
    expect(body.versions.map((version) => version.version)).toEqual([1, 2])
    expect(body.url).toBe(`http://localhost/p/${TOKEN}/`)
  })

  it("still returns a revoked publication so the Studio can show its state", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )
    await app.request(`/api/publications/${TOKEN}/revoke`, mgmt(), bindings)

    const res = await app.request(
      `/api/publications/${TOKEN}`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      bindings,
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      publication: { revoked_at: "2026-08-03T10:00:00.000Z" },
    })
  })

  it("returns 404 for an unknown publication", async () => {
    const { app, env: bindings } = harness()
    const res = await app.request(
      `/api/publications/${TOKEN}`,
      { headers: { Authorization: `Bearer ${SECRET}` } },
      bindings,
    )
    expect(res.status).toBe(404)
  })
})

describe("GET /p/:token/*", () => {
  it("returns 404 for an unknown token", async () => {
    const res = await createApp({ store: storeOf(null) }).request(`/p/${TOKEN}/index.html`)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "not_found" })
  })

  it("returns 404 for a malformed token without leaking existence", async () => {
    const res = await createApp({ store: storeOf(publication()) }).request("/p/short/index.html")
    expect(res.status).toBe(404)
  })

  it("returns 410 revoked for a revoked publication", async () => {
    const store = storeOf(publication({ revoked_at: "2026-01-01T00:00:00.000Z" }))
    const res = await createApp({ store }).request(`/p/${TOKEN}/index.html`)
    expect(res.status).toBe(410)
    await expect(res.json()).resolves.toEqual({ error: "revoked" })
  })

  it("returns 410 expired once the expiry has passed", async () => {
    const store = storeOf(publication({ expires_at: "2020-06-01T00:00:00.000Z" }))
    const res = await createApp({ store }).request(`/p/${TOKEN}/index.html`)
    expect(res.status).toBe(410)
    await expect(res.json()).resolves.toEqual({ error: "expired" })
  })

  it("prefers revoked over expired when both apply", async () => {
    const store = storeOf(
      publication({
        expires_at: "2020-06-01T00:00:00.000Z",
        revoked_at: "2020-05-01T00:00:00.000Z",
      }),
    )
    const res = await createApp({ store }).request(`/p/${TOKEN}/index.html`)
    await expect(res.json()).resolves.toEqual({ error: "revoked" })
  })

  it("serves index.html for the bare and directory-style token paths", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "<h1>cover</h1>" })),
      bindings,
    )

    for (const path of [`/p/${TOKEN}`, `/p/${TOKEN}/`, `/p/${TOKEN}/index.html`]) {
      const res = await app.request(path, {}, bindings)
      expect(res.status, path).toBe(200)
      expect(res.headers.get("content-type"), path).toBe("text/html; charset=utf-8")
      expect(res.headers.get("cache-control"), path).toBe("no-cache")
      await expect(res.text(), path).resolves.toBe("<h1>cover</h1>")
    }
  })

  it("serves a nested asset with its own content type and cache policy", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(
        zipForm(createMetadata, {
          "index.html": "<h1>cover</h1>",
          "assets/tailwind_output.css": "body{}",
          "images/cover.png": "png-bytes",
          "assets/app.a1b2c3d4e5.js": "hashed",
        }),
      ),
      bindings,
    )

    const css = await app.request(`/p/${TOKEN}/assets/tailwind_output.css`, {}, bindings)
    expect(css.status).toBe(200)
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8")
    expect(css.headers.get("cache-control")).toBe("no-cache")

    const png = await app.request(`/p/${TOKEN}/images/cover.png`, {}, bindings)
    expect(png.headers.get("content-type")).toBe("image/png")
    expect(png.headers.get("cache-control")).toBe("public, max-age=3600")

    const hashed = await app.request(`/p/${TOKEN}/assets/app.a1b2c3d4e5.js`, {}, bindings)
    expect(hashed.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
  })

  it("serves the current version after a republish and leaves the old prefix addressable", async () => {
    const { app, env: bindings, bucket } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "version one" })),
      bindings,
    )
    await app.request(
      `/api/publications/${TOKEN}/versions`,
      mgmt(zipForm({ page_manifest: [] }, { "index.html": "version two" })),
      bindings,
    )

    const res = await app.request(`/p/${TOKEN}/index.html`, {}, bindings)
    await expect(res.text()).resolves.toBe("version two")
    expect(bucket.text(`${TOKEN}/v1/index.html`)).toBe("version one")
  })

  it("returns 404 json for a file that is not in the snapshot", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )
    const res = await app.request(`/p/${TOKEN}/missing.html`, {}, bindings)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "not_found" })
  })

  it("returns 404 for a traversal attempt in the request path", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )
    const res = await app.request(`/p/${TOKEN}/..%2Fescape.html`, {}, bindings)
    expect(res.status).toBe(404)
  })

  it("answers 304 when the reviewer already has the current etag", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )

    const first = await app.request(`/p/${TOKEN}/index.html`, {}, bindings)
    const etag = first.headers.get("etag")
    expect(etag).toBeTruthy()

    const second = await app.request(
      `/p/${TOKEN}/index.html`,
      { headers: { "If-None-Match": etag as string } },
      bindings,
    )
    expect(second.status).toBe(304)
  })

  it("requires no management auth", async () => {
    const { app, env: bindings } = harness()
    await app.request(
      "/api/publications",
      mgmt(zipForm(createMetadata, { "index.html": "one" })),
      bindings,
    )
    const res = await app.request(
      `/p/${TOKEN}/index.html`,
      {},
      { SNAPSHOTS: bindings.SNAPSHOTS } as never,
    )
    expect(res.status).toBe(200)
  })
})

describe("unknown routes", () => {
  it("answer with the shared error envelope", async () => {
    const res = await createApp().request("/nope")
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "not_found" })
  })
})
