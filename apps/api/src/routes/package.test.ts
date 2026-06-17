import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import type { ExtractedPage } from "@adt/pdf"
import { createBookStorage, openBookDb } from "@adt/storage"
import { AccessibilityAssessmentOutput, type TaskInfo } from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import type { TaskService } from "../services/task-service.js"
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

  function createRenderedBook(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    const page: ExtractedPage = {
      pageId: "pg001",
      pageNumber: 1,
      text: "Page one",
      pageImage: {
        imageId: "pg001_page",
        pageId: "pg001",
        buffer: Buffer.from("fake-png-800x1200"),
        format: "png",
        width: 800,
        height: 1200,
        hash: "page-hash",
      },
      images: [],
    }

    storage.putExtractedPage(page)
    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "ok",
      sections: [
        {
          sectionId: "pg001_sec001",
          sectionType: "content",
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: 1,
          isPruned: false,
          nodes: [],
        },
      ],
    })
    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "ok",
          html: '<main><img src="cover.png"></main>',
        },
      ],
    })
    storage.close()
  }

  function createWebAssets(): void {
    fs.writeFileSync(path.join(webAssetsDir, "base.js"), 'window.__ADT_BUNDLE_TEST__ = "ok";\n')
    fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
    fs.writeFileSync(
      path.join(webAssetsDir, "tailwind_css.css"),
      "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
    )
  }

  function easyReadOutput(text: string) {
    return {
      blocks: [
        {
          pageId: "pg001",
          pageNumber: 1,
          sectionId: "pg001_sec001",
          sectionIndex: 0,
          sectionType: "content",
          entries: [
            {
              sourceId: "pg001_n0001",
              easyReadId: "pg001_n0001_easy_read",
              originalText: "Original text",
              text,
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
          ],
        },
      ],
      generatedAt: "2026-05-20T00:00:00.000Z",
    }
  }

  function overwriteEasyReadVersion(label: string, text: string): void {
    const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
    try {
      db.run(
        "UPDATE node_data SET data = ? WHERE node = ? AND item_id = ? AND version = ?",
        [JSON.stringify(easyReadOutput(text)), "easy-read", "book", 1],
      )
    } finally {
      db.close()
    }
  }

  describe("POST /api/books/:label/package-adt", () => {
    it("returns 404 for missing book", async () => {
      const res = await app.request("/api/books/missing/package-adt", {
        method: "POST",
      })
      expect(res.status).toBe(404)
    })

    it("returns 409 when no pages have web rendering", async () => {
      createTestBook("book1")

      const res = await app.request("/api/books/book1/package-adt", {
        method: "POST",
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("web rendering")
    })

    it("stores accessibility assessment output after packaging", { timeout: 15_000 }, async () => {
      createRenderedBook("book-a11y")
      createWebAssets()

      const res = await app.request("/api/books/book-a11y/package-adt", {
        method: "POST",
      })

      expect(res.status).toBe(200)

      const storage = createBookStorage("book-a11y", tmpDir)
      const row = storage.getLatestNodeData("accessibility-assessment", "book")
      storage.close()

      expect(row?.version).toBe(1)
      const parsed = AccessibilityAssessmentOutput.safeParse(row?.data)
      expect(parsed.success).toBe(true)
      expect(parsed.success && parsed.data.summary.pageCount).toBe(1)
    })

    it("repackages when Easy Read content changes even if the stored version is unchanged", { timeout: 20_000 }, async () => {
      createRenderedBook("book-easy-cache")
      createWebAssets()

      const storage = createBookStorage("book-easy-cache", tmpDir)
      storage.putNodeData("easy-read", "book", easyReadOutput("First easy text"))
      storage.close()

      const firstRes = await app.request("/api/books/book-easy-cache/package-adt", {
        method: "POST",
      })
      expect(firstRes.status).toBe(200)
      const firstBody = await firstRes.json() as { version?: string }
      expect(firstBody.version).toMatch(/^[a-f0-9]{16}$/)

      const textsPath = path.join(tmpDir, "book-easy-cache", "adt", "content", "i18n", "en", "texts.json")
      const configPath = path.join(tmpDir, "book-easy-cache", "adt", "assets", "config.json")
      expect(JSON.parse(fs.readFileSync(textsPath, "utf-8")).pg001_n0001_easy_read).toBe("First easy text")
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).bundleVersion).toBe(firstBody.version)

      overwriteEasyReadVersion("book-easy-cache", "Updated easy text")
      const updatedStorage = createBookStorage("book-easy-cache", tmpDir)
      const updatedEasyRead = updatedStorage.getLatestNodeData("easy-read", "book")?.data as ReturnType<typeof easyReadOutput>
      updatedStorage.close()
      expect(updatedEasyRead.blocks[0]?.entries[0]?.text).toBe("Updated easy text")

      const secondRes = await app.request("/api/books/book-easy-cache/package-adt", {
        method: "POST",
      })
      expect(secondRes.status).toBe(200)
      const secondBody = await secondRes.json() as { version?: string }
      expect(secondBody.version).toMatch(/^[a-f0-9]{16}$/)
      expect(JSON.parse(fs.readFileSync(textsPath, "utf-8")).pg001_n0001_easy_read).toBe("Updated easy text")
      expect(secondBody.version).not.toBe(firstBody.version)
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).bundleVersion).toBe(secondBody.version)
    })

    it("reuses an active packaging task for duplicate preview requests", async () => {
      createRenderedBook("book-package-dedupe")
      createWebAssets()

      const activeTasks: TaskInfo[] = []
      let submitCount = 0
      const taskService: TaskService = {
        submitTask(label, kind, description) {
          submitCount += 1
          const taskId = `task-${submitCount}`
          activeTasks.push({
            taskId,
            kind,
            status: "running",
            description,
            url: `/books/${label}/preview`,
          })
          return { taskId }
        },
        getActiveTasks() {
          return activeTasks
        },
      }
      const taskApp = new Hono()
      taskApp.onError(errorHandler)
      taskApp.route("/api", createPackageRoutes(tmpDir, webAssetsDir, undefined, taskService))

      const firstRes = await taskApp.request("/api/books/book-package-dedupe/package-adt", {
        method: "POST",
      })
      const secondRes = await taskApp.request("/api/books/book-package-dedupe/package-adt", {
        method: "POST",
      })

      expect(firstRes.status).toBe(200)
      expect(secondRes.status).toBe(200)
      expect(await firstRes.json()).toMatchObject({ status: "submitted", taskId: "task-1" })
      expect(await secondRes.json()).toMatchObject({ status: "submitted", taskId: "task-1" })
      expect(submitCount).toBe(1)
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
