import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { unzipSync } from "fflate"
import { createBookStorage, openBookDb } from "@adt/storage"
import { createPromptRoutes } from "../routes/prompts.js"
import { exportProject } from "./export-service.js"
import { importProject } from "./import-service.js"

it("moves immutable book prompts, assets and inspectable call bytes through a real project archive", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-portability-"))
  const source = path.join(root, "source"), destination = path.join(root, "destination"), bundled = path.join(root, "resources", "prompts")
  fs.mkdirSync(bundled, { recursive: true }); fs.mkdirSync(destination)
  fs.writeFileSync(path.join(bundled, "test.liquid"), "bundled")
  const storage = createBookStorage("book", source)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64")
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "original", pageImage: { imageId: "pg001_page", buffer: png, format: "png", hash: "page", width: 1, height: 1 }, images: [] })
  storage.appendLlmLog({ requestId: "saved-call", timestamp: new Date().toISOString(), taskType: "metadata", promptName: "test", modelId: "openai:gpt-4o", cacheHit: false, success: true, errorCount: 0, attempt: 1, durationMs: 1, messages: [{ role: "user", content: [{ type: "text", text: "actual historical prompt bytes" }] }] })
  storage.close()
  fs.copyFileSync(path.join(process.cwd(), "tests/fixtures/raven.pdf"), path.join(source, "book", "book.pdf"))
  try {
    const api = createPromptRoutes(bundled, source)
    const loaded = await (await api.request("/books/book/prompts/test")).json()
    const saved = await (await api.request("/books/book/prompts/test", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: loaded.revision, content: "portable book" }) })).json()
    const archive = await exportProject("book", source)
    // A writer may publish while ZIP streaming is still in progress. The
    // archive must retain its captured selection, and never copy the gate.
    await api.request("/books/book/prompts/test", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: saved.revision, content: "later book edit" }) })
    const zip = Buffer.from(await new Response(archive.stream).arrayBuffer())
    expect(Object.keys(unzipSync(zip)).some((name) => name.includes(".prompt-write.lock"))).toBe(false)
    await importProject(zip, destination)
    const moved = createPromptRoutes(bundled, destination)
    const global = await (await moved.request("/prompts/test")).json()
    await moved.request("/prompts/test", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: global.revision, content: "different host global" }) })
    const actual = await (await moved.request("/books/book/prompts/test")).json()
    expect(actual.content).toBe("portable book")
    expect(actual.source).toBe("book")
    expect(actual.version).toBe(saved.version)
    const promptFile = path.join("book", "prompts", ".versions", "test", saved.version)
    expect(fs.readFileSync(path.join(destination, promptFile))).toEqual(fs.readFileSync(path.join(source, promptFile)))
    const db = openBookDb(path.join(destination, "book", "book.db"))
    try {
      expect(JSON.stringify(db.all("SELECT data FROM llm_log"))).toContain("actual historical prompt bytes")
      expect(db.all("SELECT page_id, text FROM pages")).toEqual([{ page_id: "pg001", text: "original" }])
    } finally { db.close() }
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
