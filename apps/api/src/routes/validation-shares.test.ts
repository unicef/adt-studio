import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createValidationShareRoutes } from "./validation-shares.js"

describe("validation share routes", () => {
  const label = "shared-book"
  let tmpDir: string
  let app: Hono

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "validation-share-"))
    createBookStorage(label, tmpDir).close()
    const adtDir = path.join(tmpDir, label, "adt")
    fs.mkdirSync(adtDir, { recursive: true })
    fs.writeFileSync(path.join(adtDir, ".build-version"), "abc123")
    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", createValidationShareRoutes(tmpDir))
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  async function createShare() {
    const response = await app.request(`/api/books/${label}/validation/shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expires_in_days: 14 }),
    })
    expect(response.status).toBe(201)
    return response.json() as Promise<{ url: string; share: { share_id: string; token_hash: string } }>
  }

  it("creates an opaque link without returning the stored token hash in the URL", async () => {
    const created = await createShare()
    expect(created.url).toContain(`/api/public/validation/${label}/`)
    expect(created.url).not.toContain(created.share.token_hash)
    expect(created.share.token_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("serves the pinned interactive preview and accepts categorized feedback", async () => {
    const created = await createShare()
    const publicPath = new URL(created.url).pathname
    const page = await app.request(publicPath)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain(`/adt/v-abc123/index.html`)

    const feedback = await app.request(`${publicPath}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer_name: "Validator", category: "voice", comment: "The second phrase is too fast." }),
    })
    expect(feedback.status).toBe(201)
    const listed = await app.request(`/api/books/${label}/validation/shares`)
    const body = await listed.json() as { feedback: Array<{ feedback: { category: string; comment: string } }> }
    expect(body.feedback[0]?.feedback).toMatchObject({ category: "voice", comment: "The second phrase is too fast." })
  })

  it("rejects a revoked link and prevents further feedback", async () => {
    const created = await createShare()
    await app.request(`/api/books/${label}/validation/shares/${created.share.share_id}/revoke`, { method: "POST" })
    const publicPath = new URL(created.url).pathname
    expect((await app.request(publicPath)).status).toBe(404)
    expect((await app.request(`${publicPath}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewer_name: "A", category: "other", comment: "No" }),
    })).status).toBe(404)
  })

  it("validates feedback instead of storing malformed public input", async () => {
    const created = await createShare()
    const response = await app.request(`${new URL(created.url).pathname}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewer_name: "", category: "unknown", comment: "" }),
    })
    expect(response.status).toBe(400)
  })

  it("publishes a newly packaged revision to the same link", async () => {
    const created = await createShare()
    fs.writeFileSync(path.join(tmpDir, label, "adt", ".build-version"), "def456")
    const response = await app.request(`/api/books/${label}/validation/shares/${created.share.share_id}/publish`, { method: "POST" })
    expect(response.status).toBe(200)
    const page = await app.request(new URL(created.url).pathname)
    expect(await page.text()).toContain(`/adt/v-def456/index.html`)
  })
})
