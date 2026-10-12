import * as pipelineModule from "@adt/pipeline"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import type { ExtractedPage } from "@adt/pdf"
import { createBookStorage, openBookDb, writeSectioningLifecycle } from "@adt/storage"
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
          html: '<main><p data-id="pg001_n0001">Original text</p><img src="cover.png"></main>',
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
    it("rejects stale mode output even when an existing build can be cached", async () => {
      createRenderedBook("stale-mode")
      createWebAssets()
      const first = await app.request("/api/books/stale-mode/package-adt", { method: "POST" })
      expect(first.status, await first.clone().text()).toBe(200)
      const dir = path.join(tmpDir, "stale-mode")
      const hash = fs.readFileSync(path.join(dir, "adt", ".build-hash"), "utf8")
      writeSectioningLifecycle(dir, "dynamic", false)
      const response = await app.request("/api/books/stale-mode/package-adt", { method: "POST" })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: "SECTIONING_STALE" })
      expect(fs.readFileSync(path.join(dir, "adt", ".build-hash"), "utf8")).toBe(hash)
    })
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

    it("returns no warnings when rendering and sectioning agree", { timeout: 20_000 }, async () => {
      createRenderedBook("book-clean")
      createWebAssets()

      const res = await app.request("/api/books/book-clean/package-adt", { method: "POST" })

      expect(res.status).toBe(200)
      const body = await res.json() as { warnings?: unknown[] }
      expect(body.warnings).toEqual([])
    })

    it("reports sections omitted from the bundle, and still reports them on a cache hit", { timeout: 30_000 }, async () => {
      createRenderedBook("book-orphan")
      createWebAssets()

      // Give the page a second rendering entry with no sectioning row behind
      // it — the state restoring an older `page-sectioning` version leaves,
      // since that does not resync `web-rendering`. Packaging cannot invent a
      // sectionId for it (ids are never reused, so a positional guess could
      // name a real section) so it drops the section.
      const storage = createBookStorage("book-orphan", tmpDir)
      storage.putNodeData("web-rendering", "pg001", {
        sections: [
          { sectionIndex: 0, sectionType: "content", reasoning: "ok", html: "<main><p>Kept</p></main>" },
          { sectionIndex: 1, sectionType: "content", reasoning: "ok", html: "<main><p>Orphan</p></main>" },
        ],
      })
      storage.close()

      const res = await app.request("/api/books/book-orphan/package-adt", { method: "POST" })
      expect(res.status).toBe(200)
      const body = await res.json() as {
        warnings?: Array<{ kind: string; pageId: string; sectionIndex: number }>
      }
      expect(body.warnings).toEqual([
        { kind: "orphaned-rendering", pageId: "pg001", sectionIndex: 1 },
      ])

      // Packaging again hits the build cache and skips the work. The bundle on
      // disk is still short, so the warning has to come back with it — reading
      // it off the cached sidecar rather than vanishing.
      const cached = await app.request("/api/books/book-orphan/package-adt", { method: "POST" })
      expect(cached.status).toBe(200)
      const cachedBody = await cached.json() as {
        warnings?: Array<{ kind: string; pageId: string; sectionIndex: number }>
      }
      expect(cachedBody.warnings).toEqual(body.warnings)

      // A build cached before the sidecar existed — the state every book is in
      // on upgrade. The hash still matches, so without treating a missing
      // sidecar as a stale cache this returns a clean result over the same
      // short bundle.
      fs.rmSync(path.join(tmpDir, "book-orphan", "adt", ".build-warnings"))
      const upgraded = await app.request("/api/books/book-orphan/package-adt", { method: "POST" })
      expect(upgraded.status).toBe(200)
      const upgradedBody = await upgraded.json() as {
        warnings?: Array<{ kind: string; pageId: string; sectionIndex: number }>
      }
      expect(upgradedBody.warnings).toEqual(body.warnings)
    })

    it("stores accessibility assessment output after packaging", { timeout: 20_000 }, async () => {
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
      expect(parsed.success && parsed.data.artifactHash).toBe(pipelineModule.validationArtifactHash(path.join(tmpDir, "book-a11y", "adt")))
    })

    it("rejects changed artifacts after browser recheck, including an unavailable-browser fallback", { timeout: 20_000 }, async () => {
      createRenderedBook("book-browser-race"); createWebAssets()
      const spy = vi.spyOn(pipelineModule, "runBrowserAccessibilityAssessment").mockImplementation(async ({ bookDir }) => {
        fs.writeFileSync(path.join(bookDir, "adt", "changed-during-browser.html"), "different artifact")
        throw new Error("Browser stopped after files changed")
      })
      try {
        const res = await app.request("/api/books/book-browser-race/package-adt", { method: "POST" })
        expect(res.status).toBe(500)
        const storage = createBookStorage("book-browser-race", tmpDir)
        try { expect(storage.getAllNodeVersions("accessibility-assessment", "book")).toEqual([]) } finally { storage.close() }
      } finally { spy.mockRestore() }
    })

    it("explicit revalidation creates separate evidence and failed rechecks preserve package bytes and all prior evidence", { timeout: 40000 }, async () => {
      const label = "revalidate-history", url = `/api/books/${label}/package-adt`
      createRenderedBook(label); createWebAssets()
      expect((await app.request(url, { method: "POST" })).status).toBe(200)
      const book = path.join(tmpDir, label), active = path.join(book, "adt")
      const storage = createBookStorage(label, tmpDir)
      try {
        const before = structuredClone(storage.getAllNodeVersions("accessibility-assessment", "book"))
        const artifactHash = pipelineModule.validationArtifactHash(active)
        const inventory = fs.readFileSync(path.join(active, ".build-inventory"), "utf8")
        const spy = vi.spyOn(pipelineModule, "runBrowserAccessibilityAssessment").mockImplementation(async ({ bookDir }) => {
          fs.writeFileSync(path.join(bookDir, "adt", "interrupted.html"), "must never replace active bundle")
          throw new Error("interrupted recheck")
        })
        try {
          expect((await app.request(`${url}?refreshValidation=true`, { method: "POST" })).status).toBe(500)
          expect(storage.getAllNodeVersions("accessibility-assessment", "book")).toEqual(before)
          expect(pipelineModule.validationArtifactHash(active)).toBe(artifactHash)
          expect(fs.readFileSync(path.join(active, ".build-inventory"), "utf8")).toBe(inventory)
        } finally { spy.mockRestore() }
        expect((await app.request(url, { method: "POST" })).status).toBe(200)
        expect(storage.getAllNodeVersions("accessibility-assessment", "book")).toEqual(before)
        expect((await app.request(`${url}?refreshValidation=true`, { method: "POST" })).status).toBe(200)
        const after = storage.getAllNodeVersions("accessibility-assessment", "book")
        expect(after).toHaveLength(before.length + 1)
        expect(after.slice(0, before.length)).toEqual(before)
        expect((after.at(-1)!.data as { artifactHash: string }).artifactHash).toBe(pipelineModule.validationArtifactHash(active))
        expect(fs.readdirSync(book).some((name) => name.startsWith(".package-attempt-") && fs.existsSync(path.join(book, name, "previous", ".build-inventory")))).toBe(true)
      } finally { storage.close() }
    })

    it("rolls back package activation and staged rows when SQLite refuses fresh evidence", { timeout: 40000 }, async () => {
      const label = "revalidate-db-failure", url = `/api/books/${label}/package-adt`
      createRenderedBook(label); createWebAssets()
      expect((await app.request(url, { method: "POST" })).status).toBe(200)
      const book = path.join(tmpDir, label), active = path.join(book, "adt")
      const db = openBookDb(path.join(book, `${label}.db`))
      try {
        const rows = () => db.all("SELECT * FROM node_data ORDER BY node, item_id, version")
        const before = rows(), hash = pipelineModule.validationArtifactHash(active)
        db.exec("CREATE TRIGGER fail_assessment BEFORE INSERT ON node_data WHEN NEW.node = 'accessibility-assessment' BEGIN SELECT RAISE(ABORT, 'injected assessment failure'); END")
        expect((await app.request(`${url}?refreshValidation=true`, { method: "POST" })).status).toBe(500)
        expect(rows()).toEqual(before)
        expect(pipelineModule.validationArtifactHash(active)).toBe(hash)
        expect(fs.existsSync(path.join(book, ".package-publication.json"))).toBe(false)
      } finally { db.close() }
    })

    it("rejects a pending Storyboard transition during assessment without changing package or evidence", { timeout: 40000 }, async () => {
      const label = "pending-during-validation", url = `/api/books/${label}/package-adt`
      createRenderedBook(label); createWebAssets()
      expect((await app.request(url, { method: "POST" })).status).toBe(200)
      const book = path.join(tmpDir, label), active = path.join(book, "adt"), hash = pipelineModule.validationArtifactHash(active)
      const storage = createBookStorage(label, tmpDir), before = storage.getAllNodeVersions("accessibility-assessment", "book")
      const spy = vi.spyOn(pipelineModule, "runBrowserAccessibilityAssessment").mockImplementation(async () => {
        writeSectioningLifecycle(book, "dynamic", true, true)
        throw new Error("Browser unavailable after concurrent lifecycle change")
      })
      try {
        expect((await app.request(`${url}?refreshValidation=true`, { method: "POST" })).status).toBe(500)
        expect(pipelineModule.validationArtifactHash(active)).toBe(hash)
        expect(storage.getAllNodeVersions("accessibility-assessment", "book")).toEqual(before)
      } finally { spy.mockRestore(); storage.close() }
    })

    it("repackages when Easy Read content changes even if the stored version is unchanged", { timeout: 20_000 }, async () => {
      createRenderedBook("book-easy-cache")
      fs.writeFileSync(path.join(tmpDir, "book-easy-cache", "config.yaml"), "easy_read:\n  enabled: true\n")
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

    it("repackages when a sign-language video assignment changes", { timeout: 20_000 }, async () => {
      const label = "book-sign-language-cache"
      createRenderedBook(label)
      createWebAssets()

      const storage = createBookStorage(label, tmpDir)
      storage.putSignLanguageVideo(
        "video-1",
        Buffer.from("video-content"),
        "video.mp4",
        "video/mp4",
      )
      storage.close()

      const packageBook = async () => {
        const response = await app.request(`/api/books/${label}/package-adt`, {
          method: "POST",
        })
        expect(response.status).toBe(200)
        return await response.json() as { version: string }
      }
      const videosPath = path.join(
        tmpDir,
        label,
        "adt",
        "content",
        "i18n",
        "en",
        "videos.json",
      )
      const configPath = path.join(tmpDir, label, "adt", "assets", "config.json")

      const unassignedPackage = await packageBook()
      expect(JSON.parse(fs.readFileSync(videosPath, "utf-8"))).toEqual({})
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).features.signLanguage).toBe(false)

      const assignedStorage = createBookStorage(label, tmpDir)
      assignedStorage.assignSignLanguageVideo("video-1", "pg001_sec001")
      assignedStorage.close()

      const assignedPackage = await packageBook()
      expect(assignedPackage.version).not.toBe(unassignedPackage.version)
      expect(JSON.parse(fs.readFileSync(videosPath, "utf-8"))).toEqual({
        pg001_sec001: "sl_pg001_sec001.mp4",
      })
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).features.signLanguage).toBe(true)

      const unassignedStorage = createBookStorage(label, tmpDir)
      unassignedStorage.assignSignLanguageVideo("video-1", null)
      unassignedStorage.close()

      const unassignedAgainPackage = await packageBook()
      expect(unassignedAgainPackage.version).not.toBe(assignedPackage.version)
      expect(JSON.parse(fs.readFileSync(videosPath, "utf-8"))).toEqual({})
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).features.signLanguage).toBe(false)
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
    it.each([
      { mode: "dynamic" as const, ready: false, pending: true },
      { mode: "dynamic" as const, ready: true, pending: true },
      { mode: "page" as const, ready: true, pending: false },
    ])("reports retained mode-incompatible packages without deleting them: %j", async ({ mode, ready, pending }) => {
      createRenderedBook("retained")
      const dir = path.join(tmpDir, "retained")
      const pagesPath = path.join(dir, "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      const pages = JSON.stringify([{ section_id: "pg001", href: "pg001.html" }])
      fs.writeFileSync(pagesPath, pages)
      writeSectioningLifecycle(dir, mode, ready, pending)
      const response = await app.request("/api/books/retained/package-adt/status")
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ hasAdt: true, modeCompatible: false })
      expect(fs.readFileSync(pagesPath, "utf8")).toBe(pages)

      // Compatible warning-bearing output remains available under SPEC-0001.
      writeSectioningLifecycle(dir, "dynamic", true, false)
      fs.writeFileSync(path.join(dir, "adt", ".build-warnings"), JSON.stringify([{ kind: "orphaned-rendering", pageId: "pg001", sectionIndex: 2 }]))
      const usable = await app.request("/api/books/retained/package-adt/status")
      const usableStatus = await usable.json()
      expect(usableStatus).toMatchObject({ hasAdt: true })
      expect(usableStatus.modeCompatible).not.toBe(false)
    })

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
