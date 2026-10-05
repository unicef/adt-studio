import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { packageAdtWeb, packageWebpub } from "@adt/pipeline"
import { createAdtPreviewRoutes } from "./adt-preview.js"
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
            pageNumber: n, isPruned: n === 2,
            nodes: [{ nodeId: `${pageId}_h1`, role: "heading", text: `Chapter ${n}`, isPruned: false }],
          }],
        })
        storage.putNodeData("web-rendering", pageId, {
          sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html: `<h1 data-id="${pageId}_h1">Chapter ${n}</h1>` }],
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
        body: JSON.stringify({ entries, pageCount: 3, generatedAt: "2026-01-01T00:00:00Z" }),
      })
      expect(save.status).toBe(200)
      const readSaved = async () => (await (await toc.request(`/books/${label}/toc`)).json()).entries
      expect(await readSaved()).toEqual(entries)

      const preview = createAdtPreviewRoutes(root, assets, path.resolve("config.yaml"))
      const response = await preview.request(`/books/${label}/adt-preview/content/toc.json`)
      expect(response.status).toBe(200)
      const previewToc = await response.json()
      expect(previewToc.map((e: { title: string }) => e.title)).toEqual([
        "Unit one", "Chapter one", "Unit two", "Chapter two",
      ])

      const bookDir = path.join(root, label)
      const options = { bookDir, label, language: "en", outputLanguages: ["en"], title: "TOC book", webAssetsDir: assets }
      await packageAdtWeb(storage, options)
      packageWebpub(storage, options)
      const packagedToc = JSON.parse(fs.readFileSync(path.join(bookDir, "adt/content/toc.json"), "utf8"))
      // Packaged pages and preview share stable section URLs.
      expect(packagedToc.map((e: { title: string; level: number }) => [e.title, e.level]))
        .toEqual(previewToc.map((e: { title: string; level: number }) => [e.title, e.level]))
      const manifest = JSON.parse(fs.readFileSync(path.join(bookDir, "webpub/manifest.json"), "utf8"))
      expect(manifest.toc).toEqual([
        { title: "Unit one", href: parentId ? `${parentId}.html` : "", children: [{ title: "Chapter one", href: "pg001_sec001.html" }] },
        { title: "Unit two", href: "pg003_sec001.html", children: [{ title: "Chapter two", href: "pg003_sec001.html" }] },
      ])
      expect(await readSaved()).toEqual(entries)
    } finally {
      storage.close()
    }
  })
})
