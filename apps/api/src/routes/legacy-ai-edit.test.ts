import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import type { WebRenderingOutput } from "@adt/types"
import type { TaskExecutor, TaskService } from "../services/task-service.js"
const { aiEditSection } = vi.hoisted(() => ({ aiEditSection: vi.fn() }))
vi.mock("../services/page-edit-service.js", () => ({ aiEditSection, reRenderPage: vi.fn() }))
import { createPageRoutes } from "./pages.js"
let root: string
const storage = () => createBookStorage("book", root)
const section = (id: string) => ({ sectionId: id, sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: `text-${id}`, role: "body_text", text: id, isPruned: false }] })
const old = { sections: ["A", "B"].map((id, sectionIndex) => ({ sectionIndex, sectionType: "content", reasoning: "legacy", html: `<section><p data-id="text-${id}">${id}</p></section>` })) }
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-legacy-ai-edit-"))
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 10, height: 10 }, images: [] })
  db.putNodeData("page-sectioning", "pg001", { reasoning: "reordered", sections: [section("B"), section("A")] })
  db.putNodeData("web-rendering", "pg001", old)
  db.close(); aiEditSection.mockReset()
})
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })
it.each(["success", "rendering-conflict", "source-conflict"])("publishes a queued legacy AI edit by captured owner (%s)", async mode => {
  let execute: TaskExecutor | undefined
  const tasks: TaskService = { submitTask: (_label, _kind, _description, fn) => { execute = fn; return { taskId: "test" } }, getActiveTasks: () => [] }
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"), undefined, tasks)
  const response = await app.request("/books/book/pages/pg001/sections/0/ai-edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction: "Edit B", currentHtml: old.sections[1].html }) })
  expect(response.status).toBe(200)
  aiEditSection.mockImplementation(async () => {
    if (mode !== "success") {
      const db = storage()
      const node = mode === "source-conflict" ? "page-sectioning" : "web-rendering"
      db.putNodeData(node, "pg001", db.getLatestNodeData(node, "pg001")!.data)
      db.close()
    }
    return { html: '<section><p data-id="text-B">Edited B</p></section>', reasoning: "updated" }
  })
  if (mode === "success") await execute!(() => {})
  else await expect(execute!(() => {})).rejects.toThrow("Page changed during AI editing")
  const db = storage()
  try {
    const saved = db.getLatestNodeData("web-rendering", "pg001")!.data as WebRenderingOutput
    if (mode === "success") {
      expect(saved.sections.find(entry => entry.sectionId === "A")?.html).toBe(old.sections[0].html)
      expect(saved.sections.find(entry => entry.sectionId === "B")?.html).toContain("Edited B")
    } else expect(saved).toEqual(old)
    expect(db.getAllNodeVersions("web-rendering", "pg001").find(row => row.version === 1)?.data).toEqual(old)
  } finally { db.close() }
})
