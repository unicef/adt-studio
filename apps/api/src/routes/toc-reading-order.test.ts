import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { packageAdtWeb, packageWebpub } from "@adt/pipeline"
import { createAdtPreviewRoutes } from "./adt-preview.js"
import { createPageRoutes } from "./pages.js"
import { createTocRoutes } from "./toc.js"

describe("TOC hierarchy across saved data, preview and export", () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it.each(["unlinked", "pruned"])("keeps children under a %s parent", async (parentKind) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-toc-order-"))
    roots.push(root)
    const label = "toc-book"
    const assets = path.join(root, "assets")
    fs.mkdirSync(assets)
    for (const filename of ["base.bundle.min.js", "base.bundle.local.js"]) {
      fs.writeFileSync(path.join(assets, filename), "window.__ADT_TEST__ = true;")
    }
    fs.writeFileSync(path.join(assets, "fonts.css"), "body { font-family: serif; }")
    fs.writeFileSync(path.join(assets, "tailwind_css.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;")
    const storage = createBookStorage(label, root)
    try {
      for (const n of [3, 2, 1]) {
        const pageId = `pg00${n}`
        storage.putExtractedPage({
          pageId, pageNumber: n, text: "",
          pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("x"), format: "png", hash: `h${n}`, width: 10, height: 10 },
          images: [],
        })
        storage.putNodeData("page-sectioning", pageId, {
          reasoning: "", sections: [{
            sectionId: `${pageId}_sec001`, sectionType: "content", backgroundColor: "#fff", textColor: "#000",
            pageNumber: n, isPruned: false,
            nodes: [{ nodeId: `${pageId}_h1`, role: "heading", text: `Chapter ${n}`, isPruned: false }],
          }],
        })
        storage.putNodeData("web-rendering", pageId, {
          sections: [{ sectionId: `${pageId}_sec001`, sectionIndex: 0, sectionType: "content", reasoning: "", html: `<h1 data-id="${pageId}_h1">Chapter ${n}</h1>` }],
        })
      }
      const parentId = parentKind === "pruned" ? "pg002_sec001" : ""
      const entry = (id: string, sectionId: string, level: number) => ({
        id, title: id, sectionId, href: sectionId ? `${sectionId}.html` : "", chapterId: "", level,
      })
      // The second unit is intentionally stored first: sibling groups should
      // move into reading order without separating either parent and child.
      const entries = [
        entry("Unit two", "pg003_sec001", 1),
        entry("Chapter two", "pg003_sec001", 2),
        entry("Unit one", parentId, 1),
        entry("Chapter one", "pg001_sec001", 2),
      ]
      const toc = createTocRoutes(root)
      const save = await toc.request(`/books/${label}/toc`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseVersion: 0, entries, pageCount: 3, generatedAt: "2026-01-01T00:00:00Z" }),
      })
      expect(save.status).toBe(200)
      const pageRoutes = createPageRoutes(root, path.resolve("prompts"), assets)
      const originalPage = storage.getLatestNodeData("page-sectioning", "pg002")!
      const originalRendering = storage.getLatestNodeData("web-rendering", "pg002")!
      const originalToc = storage.getLatestNodeData("toc-generation", "book")!
      if (parentKind === "pruned") {
        const prune = await pageRoutes.request(`/books/${label}/pages/pg002/sectioning`, {
          method: "PUT", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...originalPage.data, baseVersion: originalPage.version,
            sections: originalPage.data.sections.map((section) => ({ ...section, isPruned: true })) }),
        })
        expect(prune.status).toBe(200)
      }
      const readSaved = async () => (await (await toc.request(`/books/${label}/toc`)).json()).entries
      expect(await readSaved()).toEqual(entries)

      const preview = createAdtPreviewRoutes(root, assets, path.resolve("config.yaml"))
      const response = await preview.request(`/books/${label}/adt-preview/content/toc.json`)
      expect(response.status).toBe(200)
      const previewToc = await response.json()
      expect(previewToc.map((e: { title: string }) => e.title)).toEqual([
        "Unit one", "Chapter one", "Unit two", "Chapter two",
      ])

      expect(previewToc.find((entry: { title: string }) => entry.title === "Unit one").href).toBe("")
      if (parentKind === "pruned") {
        expect((await preview.request(`/books/${label}/adt-preview/${parentId}.html`)).status).toBe(404)
      }

      const bookDir = path.join(root, label)
      const options = { bookDir, label, language: "en", outputLanguages: ["en"], title: "TOC book", webAssetsDir: assets }
      await packageAdtWeb(storage, options)
      packageWebpub(storage, options)
      const packagedToc = JSON.parse(fs.readFileSync(path.join(bookDir, "adt/content/toc.json"), "utf8"))
      // Packaged pages and preview share stable section URLs.
      expect(packagedToc.map((e: { title: string; level: number }) => [e.title, e.level]))
        .toEqual(previewToc.map((e: { title: string; level: number }) => [e.title, e.level]))
      const manifest = JSON.parse(fs.readFileSync(path.join(bookDir, "webpub/manifest.json"), "utf8"))
      expect(manifest.toc).toBeUndefined()
      expect(manifest.resources).toContainEqual({ href: "contents.html", type: "text/html", rel: "contents" })
      const contents = fs.readFileSync(path.join(bookDir, "webpub/contents.html"), "utf8")
      expect(contents).toContain('<li><span>Unit one</span><ol><li><a href="pg001_sec001.html">Chapter one</a></li></ol></li>')
      expect(contents).toContain('<li><a href="pg003_sec001.html">Unit two</a><ol><li><a href="pg003_sec001.html">Chapter two</a></li></ol></li>')
      expect(contents).not.toContain('href=""')
      expect(contents).not.toContain('href="pg002_sec001.html"')
      expect(await readSaved()).toEqual(entries)
      expect(storage.getLatestNodeData("toc-generation", "book")).toEqual(originalToc)
      expect(storage.getLatestNodeData("web-rendering", "pg002")).toEqual(originalRendering)
      expect(packagedToc.find((entry: { title: string }) => entry.title === "Unit one").href).toBe("")
      if (parentKind === "pruned") {
        expect(fs.existsSync(path.join(bookDir, "adt", `${parentId}.html`))).toBe(false)
        const restore = await pageRoutes.request(`/books/${label}/versions/page-sectioning/pg002/restore`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: originalPage.version, baseVersion: storage.getCurrentNodeVersion("page-sectioning", "pg002") }),
        })
        expect(restore.status).toBe(200)
        const restored = await (await preview.request(`/books/${label}/adt-preview/content/toc.json`)).json()
        expect(restored.find((entry: { title: string }) => entry.title === "Unit one").href).toBe(`${parentId}.html`)
        expect((await preview.request(`/books/${label}/adt-preview/${parentId}.html`)).status).toBe(200)
        await packageAdtWeb(storage, options)
        packageWebpub(storage, options)
        const restoredManifest = JSON.parse(fs.readFileSync(path.join(bookDir, "webpub/manifest.json"), "utf8"))
        expect(restoredManifest.toc.find((entry: { title: string }) => entry.title === "Unit one").href).toBe(`${parentId}.html`)
        expect(fs.existsSync(path.join(bookDir, "webpub/contents.html"))).toBe(false)
        const restoredPackage = JSON.parse(fs.readFileSync(path.join(bookDir, "adt/content/toc.json"), "utf8"))
        expect(restoredPackage.find((entry: { title: string }) => entry.title === "Unit one").href).toBe(`${parentId}.html`)
        expect(fs.existsSync(path.join(bookDir, "adt", `${parentId}.html`))).toBe(true)
        expect(storage.getLatestNodeData("toc-generation", "book")).toEqual(originalToc)
        expect(storage.getLatestNodeData("web-rendering", "pg002")).toEqual(originalRendering)
      }
      // Deleting every authored heading is a saved document, not permission to
      // reconstruct a fresh heading-based TOC in preview/export.
      const empty = await toc.request(`/books/${label}/toc`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseVersion: originalToc.version, entries: [], pageCount: 3, generatedAt: "2026-01-01T00:00:00Z" }),
      })
      expect(empty.status).toBe(200)
      expect(await (await preview.request(`/books/${label}/adt-preview/content/toc.json`)).json()).toEqual([])
      await packageAdtWeb(storage, options)
      expect(JSON.parse(fs.readFileSync(path.join(bookDir, "adt/content/toc.json"), "utf8"))).toEqual([])
      expect(storage.getLatestNodeData("toc-generation", "book")?.data).toMatchObject({ entries: [], source: "manual" })
    } finally {
      storage.close()
    }
  })
})
