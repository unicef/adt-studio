import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { exportProject } from "./export-service.js"
import { importProject } from "./import-service.js"

let root: string
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }) })
it("project archive/import retains skipped pages, manual filtering history and referenced media", async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-archive-"))
  const books = path.join(root, "source"), imported = path.join(root, "imported")
  const storage = createBookStorage("book", books)
  const pdf = path.resolve("tests/fixtures/raven.pdf")
  fs.copyFileSync(pdf, path.join(storage.bookDir!, "book.pdf"))
  for (let n = 1; n <= 3; n++) {
    const pageId = `pg00${n}`, imageId = `${pageId}_im001`
    storage.putExtractedPage({ pageId, pageNumber: n, text: `Page ${n}`, images: [], pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from(`retained media ${n}`), format: "png", hash: `hash${n}`, width: 10, height: 10 } })
    storage.putNodeData("image-filtering", pageId, { images: [{ imageId, isPruned: false }] })
    storage.putNodeData("image-filtering", pageId, { images: [{ imageId, isPruned: true, reason: "manual choice" }] })
  }
  storage.appendLlmLog({ requestId: "archive-fixture", timestamp: new Date().toISOString(), taskType: "image-meaningfulness", pageId: "pg002", promptName: "page-error-decision", modelId: "", durationMs: 0, attempt: 2, success: false, errorCount: 0, cacheHit: false, providerCall: false, pageRecovery: true, outcome: "skipped-with-error", errorClass: "rate-limit", messages: [] })
  const pages = storage.getPages(), errors = storage.getPageRecovery(), history = pages.map((page) => storage.getAllNodeVersions("image-filtering", page.pageId)), images = pages.map((page) => storage.getPageImageBase64(page.pageId))
  storage.close()
  const exported = await exportProject("book", books)
  const zip = Buffer.from(await new Response(exported.stream).arrayBuffer())
  const result = await importProject(zip, imported)
  const restored = createBookStorage(result.label, imported)
  try {
    expect(restored.getPages()).toEqual(pages)
    expect(restored.getPageRecovery()).toEqual(errors)
    expect(pages.map((page) => restored.getAllNodeVersions("image-filtering", page.pageId))).toEqual(history)
    expect(pages.map((page) => restored.getPageImageBase64(page.pageId))).toEqual(images)
  } finally { restored.close() }
})
