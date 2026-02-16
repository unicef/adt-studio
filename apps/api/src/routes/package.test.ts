import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createPackageRoutes } from "./package.js"

describe("Package routes", () => {
  let tmpDir: string
  let webAssetsDir: string
  let app: Hono

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "package-routes-"))
    webAssetsDir = path.join(tmpDir, "web-assets")
    fs.mkdirSync(webAssetsDir, { recursive: true })

    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", createPackageRoutes(tmpDir, webAssetsDir))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function createTestBook(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    storage.close()
  }

  describe("POST /api/books/:label/package-adt", () => {
    it("returns 404 for missing book", async () => {
      const res = await app.request("/api/books/missing/package-adt", {
        method: "POST",
      })
      expect(res.status).toBe(404)
    })

    it("returns 409 when master is not completed", async () => {
      createTestBook("book1")

      const res = await app.request("/api/books/book1/package-adt", {
        method: "POST",
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("Master phase must be completed")
    })
  })

  describe("GET /api/books/:label/package-adt/status", () => {
    it("returns hasAdt=false when pages.json is missing", async () => {
      createTestBook("book2")

      const res = await app.request("/api/books/book2/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ label: "book2", hasAdt: false })
    })

    it("returns hasAdt=false when pages.json is invalid JSON", async () => {
      createTestBook("book3")
      const pagesPath = path.join(tmpDir, "book3", "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      fs.writeFileSync(pagesPath, "{not-json")

      const res = await app.request("/api/books/book3/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ label: "book3", hasAdt: false })
    })

    it("returns hasAdt=false when pages.json has no href entries", async () => {
      createTestBook("book4")
      const pagesPath = path.join(tmpDir, "book4", "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      fs.writeFileSync(pagesPath, JSON.stringify([{ section_id: "pg001" }]))

      const res = await app.request("/api/books/book4/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ label: "book4", hasAdt: false })
    })

    it("returns hasAdt=true when pages.json has at least one href entry", async () => {
      createTestBook("book5")
      const pagesPath = path.join(tmpDir, "book5", "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      fs.writeFileSync(
        pagesPath,
        JSON.stringify([{ section_id: "pg001", href: "pg001.html" }]),
      )

      const res = await app.request("/api/books/book5/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ label: "book5", hasAdt: true })
    })
  })
})
