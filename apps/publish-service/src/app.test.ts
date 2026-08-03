import { describe, expect, it } from "vitest"
import { PUBLISH_WORKER_VERSION, type Publication } from "@adt/types"
import { createApp } from "./app.js"
import type { PublicationStore } from "./store.js"

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

function storeOf(record: Publication | null): PublicationStore {
  return {
    async findByToken(token) {
      return record && record.token === token ? record : null
    },
  }
}

function snapshotForm(metadata: unknown, snapshotBytes = 16): FormData {
  const form = new FormData()
  form.set("metadata", JSON.stringify(metadata))
  form.set("snapshot", new File([new Uint8Array(snapshotBytes)], "snapshot.zip", {
    type: "application/zip",
  }))
  return form
}

const createMetadata = {
  token: TOKEN,
  title: "Raven and the Sun",
  book_label: "raven",
  page_manifest: [{ section_id: "sec-1", href: "content/pages/page-1.html", page_number: 1 }],
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
      ["PATCH", `/api/publications/${TOKEN}`],
    ]

    for (const [method, path] of routes) {
      const res = await app.request(path, { method }, env)
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })
})

describe("POST /api/publications", () => {
  it("accepts a validated snapshot upload and reports the handler as unimplemented", async () => {
    const res = await createApp().request(
      "/api/publications",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
        body: snapshotForm(createMetadata),
      },
      env,
    )
    expect(res.status).toBe(501)
    await expect(res.json()).resolves.toEqual({ error: "not_implemented" })
  })

  it("rejects metadata that does not match the contract", async () => {
    const res = await createApp().request(
      "/api/publications",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
        body: snapshotForm({ ...createMetadata, title: "" }),
      },
      env,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
  })

  it("rejects a request with no snapshot file", async () => {
    const form = new FormData()
    form.set("metadata", JSON.stringify(createMetadata))
    const res = await createApp().request(
      "/api/publications",
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` }, body: form },
      env,
    )
    expect(res.status).toBe(400)
  })

  it("rejects a snapshot larger than the upload limit", async () => {
    const res = await createApp({ maxSnapshotBytes: 8 }).request(
      "/api/publications",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
        body: snapshotForm(createMetadata, 64),
      },
      env,
    )
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({ error: "payload_too_large" })
  })
})

describe("POST /api/publications/:token/versions", () => {
  it("accepts a republish upload", async () => {
    const res = await createApp().request(
      `/api/publications/${TOKEN}/versions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
        body: snapshotForm({ page_manifest: createMetadata.page_manifest }),
      },
      env,
    )
    expect(res.status).toBe(501)
  })

  it("rejects a malformed token", async () => {
    const res = await createApp().request(
      "/api/publications/nope/versions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
        body: snapshotForm({ page_manifest: [] }),
      },
      env,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" })
  })
})

describe("POST /api/publications/:token/revoke", () => {
  it("is authenticated and unimplemented", async () => {
    const res = await createApp().request(
      `/api/publications/${TOKEN}/revoke`,
      { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } },
      env,
    )
    expect(res.status).toBe(501)
    await expect(res.json()).resolves.toEqual({ error: "not_implemented" })
  })
})

describe("PATCH /api/publications/:token", () => {
  it("accepts an ISO expiry and a null expiry", async () => {
    const app = createApp()
    for (const expires_at of ["2026-12-31T23:59:59.000Z", null]) {
      const res = await app.request(
        `/api/publications/${TOKEN}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
          body: JSON.stringify({ expires_at }),
        },
        env,
      )
      expect(res.status).toBe(501)
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

  it("reaches the (unimplemented) snapshot handler for an active publication", async () => {
    const store = storeOf(publication({ expires_at: "2099-01-01T00:00:00.000Z" }))
    const app = createApp({ store })

    for (const path of [`/p/${TOKEN}`, `/p/${TOKEN}/`, `/p/${TOKEN}/content/pages/page-1.html`]) {
      const res = await app.request(path)
      expect(res.status, path).toBe(501)
    }
  })

  it("requires no management auth", async () => {
    const store = storeOf(publication())
    const res = await createApp({ store }).request(`/p/${TOKEN}/index.html`, {}, {})
    expect(res.status).toBe(501)
  })
})

describe("unknown routes", () => {
  it("answer with the shared error envelope", async () => {
    const res = await createApp().request("/nope")
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "not_found" })
  })
})
