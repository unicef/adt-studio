import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { createPageRoutes } from "./pages.js"
import { errorHandler } from "../middleware/error-handler.js"

// Instrument real storage reads, without replacing the transaction/history logic.
const reads = vi.hoisted(() => [] as Array<[string, string]>)
vi.mock("@adt/storage", async original => {
  const actual = await original<typeof import("@adt/storage")>()
  return { ...actual, createBookStorage: (...args: Parameters<typeof actual.createBookStorage>) => {
    const storage = actual.createBookStorage(...args), read = storage.getLatestNodeData
    storage.getLatestNodeData = (node, id) => { reads.push([node, id]); return read(node, id) }
    return storage
  } }
})
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); reads.length = 0 })

it("restores one page in a 150-page book without hydrating unrelated Storyboard baselines", { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-restore-scope-")); roots.push(root)
  const storage = createBookStorage("book", root)
  const source = (id: string, version: number) => ({ reasoning: "", sections: [{ sectionId: id + "_sec001", sectionType: "text", pageNumber: 1, isPruned: false, backgroundColor: "white", textColor: "black", nodes: [{ nodeId: id + "_n001", role: "heading", text: "Version " + version, isPruned: false }] }] })
  const output = (id: string, version: number) => ({ sections: [{ sectionId: id + "_sec001", sectionIndex: 0, sectionType: "text", reasoning: "", html: `<h1 data-id="${id}_n001">Version ${version}</h1>` }] })
  storage.transaction(() => {
    for (let n = 1; n <= 150; n++) {
      const id = "pg" + String(n).padStart(3, "0")
      storage.putExtractedPage({ pageId: id, pageNumber: n, text: "source", images: [], pageImage: { imageId: id + "_page", buffer: Buffer.from("image"), hash: "image", format: "png", width: 10, height: 10 } })
      storage.putNodeData("page-sectioning", id, source(id, 1))
      storage.putNodeData("web-rendering", id, output(id, 1))
      storage.putNodeData("image-filtering", id, { images: [] })
      storage.putNodeData("image-captioning", id, { captions: [] })
    }
    storage.putNodeData("page-sectioning", "pg001", source("pg001", 2))
    storage.putNodeData("web-rendering", "pg001", output("pg001", 2))
    storage.putNodeData("image-filtering", "pg001", { images: [], marker: "second" })
    storage.putNodeData("image-captioning", "pg001", { captions: [], marker: "second" })
  })
  const neighbor = storage.getAllNodeVersions("web-rendering", "pg150")
  storage.close()
  const app = new Hono().onError(errorHandler).route("/", createPageRoutes(root, "prompts"))
  for (const node of ["page-sectioning", "web-rendering", "image-filtering", "image-captioning"]) {
    for (const [version, baseVersion] of [[1, 2], [2, 1]]) {
      reads.length = 0
      const started = performance.now()
      const response = await app.request(`/books/book/versions/${node}/pg001/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, baseVersion }) })
      expect(response.status, await response.clone().text()).toBe(200)
      const unrelated = reads.filter(([readNode, id]) => readNode === "web-rendering" && id !== "pg001")
      process.stdout.write(JSON.stringify({ node, version, pages: 150, durationMs: performance.now() - started, unrelatedRenderingReads: unrelated.length }) + "\n")
      expect(unrelated).toHaveLength(0)
    }
  }
  reads.length = 0
  const stale = await app.request("/books/book/versions/page-sectioning/pg001/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, baseVersion: 1 }) })
  expect(stale.status).toBe(409)
  expect(await stale.json()).toMatchObject({ code: "VERSION_CONFLICT" })
  expect(reads.filter(([node]) => node === "web-rendering")).toEqual([])
  const after = createBookStorage("book", root)
  try {
    expect(after.getAllNodeVersions("web-rendering", "pg150")).toEqual(neighbor)
    expect(after.getNodeItemIds("source-generation-state").filter(id => id.startsWith("["))).toEqual([JSON.stringify(["web-rendering", "pg001", 2])])
    expect(after.getSelectedNodeVersion("page-sectioning", "pg001")).toBe(2)
  } finally { after.close() }
})
