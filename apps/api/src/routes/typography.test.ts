import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { DEFAULT_TYPOGRAPHY } from "@adt/types"
import { createTypographyRoutes } from "./typography.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-typography-route-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.close()
}

describe("GET /books/:label/typography", () => {
  it("returns accessible defaults (isDefault) when none is saved", async () => {
    createTestBook("no-typo")
    const app = createTypographyRoutes(tmpDir)
    const res = await app.request("/books/no-typo/typography")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isDefault).toBe(true)
    expect(body.version).toBe(0)
    expect(body.data).toEqual(DEFAULT_TYPOGRAPHY)
  })

  it("returns 404 for a missing book", async () => {
    const app = createTypographyRoutes(tmpDir)
    const res = await app.request("/books/ghost/typography")
    expect(res.status).toBe(404)
  })

  it("returns 400 for an invalid label", async () => {
    const app = createTypographyRoutes(tmpDir)
    const res = await app.request("/books/-bad/typography")
    expect(res.status).toBe(400)
  })
})

describe("PUT /books/:label/typography", () => {
  it("saves and reads back an edited scale", async () => {
    createTestBook("save-typo")
    const app = createTypographyRoutes(tmpDir)
    const edited = {
      styles: DEFAULT_TYPOGRAPHY.styles.map((s) =>
        s.key === "body" ? { ...s, desktopPx: 26, mobilePx: 18 } : s,
      ),
    }

    const put = await app.request("/books/save-typo/typography", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edited),
    })
    expect(put.status).toBe(200)

    const get = await app.request("/books/save-typo/typography")
    const body = await get.json()
    expect(body.isDefault).toBe(false)
    const body_ = body.data.styles.find((s: { key: string }) => s.key === "body")
    expect(body_.desktopPx).toBe(26)
    expect(body_.mobilePx).toBe(18)
  })

  it("rejects out-of-range font sizes", async () => {
    createTestBook("bad-size")
    const app = createTypographyRoutes(tmpDir)
    const res = await app.request("/books/bad-size/typography", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        styles: [{ key: "body", label: "Body", className: "adt-body", desktopPx: 900, mobilePx: 16 }],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects an unsafe class name", async () => {
    createTestBook("bad-class")
    const app = createTypographyRoutes(tmpDir)
    const res = await app.request("/books/bad-class/typography", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        styles: [{ key: "body", label: "Body", className: "adt-body { } body", desktopPx: 24, mobilePx: 16 }],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects an empty styles array", async () => {
    createTestBook("empty-styles")
    const app = createTypographyRoutes(tmpDir)
    const res = await app.request("/books/empty-styles/typography", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styles: [] }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 (not 500) for a malformed JSON body", async () => {
    createTestBook("bad-json")
    const app = createTypographyRoutes(tmpDir)
    const res = await app.request("/books/bad-json/typography", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    })
    expect(res.status).toBe(400)
  })

  it("is append-only: each save creates a new version, latest wins", async () => {
    createTestBook("versioned")
    const app = createTypographyRoutes(tmpDir)
    const put = (styles: unknown) =>
      app.request("/books/versioned/typography", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styles }),
      })
    const bodyAt = (px: number) =>
      DEFAULT_TYPOGRAPHY.styles.map((s) => (s.key === "body" ? { ...s, desktopPx: px } : s))

    const first = await (await put(bodyAt(22))).json()
    expect(first.version).toBe(1)
    const second = await (await put(bodyAt(28))).json()
    expect(second.version).toBe(2)

    const latest = await (await app.request("/books/versioned/typography")).json()
    expect(latest.version).toBe(2)
    expect(latest.data.styles.find((s: { key: string }) => s.key === "body").desktopPx).toBe(28)
  })
})
