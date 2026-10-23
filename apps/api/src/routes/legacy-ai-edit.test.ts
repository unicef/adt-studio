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


it("does not expose an orphaned clone under a live index after Sectioning restore, and preserves it across an unrelated save", async () => {
  const db = storage()
  const original = db.putNodeData("page-sectioning", "pg001", { reasoning: "original", sections: [section("A"), section("B")] })
  db.putNodeData("page-sectioning", "pg001", { reasoning: "cloned", sections: [section("A"), section("clone"), section("B")] })
  const retained: WebRenderingOutput = { sections: ["A", "clone", "B"].map((id, sectionIndex) => ({ sectionId: id, sectionIndex, sectionType: "content", reasoning: "retained",
    html: `<section data-section-id="${id}"><p data-id="text-${id}">${id}</p></section>`, activityAnswers: { answer: `answer-${id}` } })) }
  const renderedVersion = db.putNodeData("web-rendering", "pg001", retained)
  db.setCurrentNodeVersion("page-sectioning", "pg001", original)
  const beforeRead = db.getNodeVersionFingerprint()
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"))
  const response = await app.request("/books/book/pages/pg001")
  expect(response.status).toBe(200)
  const page = await response.json()
  expect(db.getNodeVersionFingerprint()).toEqual(beforeRead)
  expect(page.rendering.sections.find((entry: { sectionIndex: number }) => entry.sectionIndex === 1).sectionId).toBe("B")
  expect(page.rendering.sections.find((entry: { sectionId: string }) => entry.sectionId === "clone").sectionIndex).toBeLessThan(0)
  expect(page.sectioningSynchronization).toMatchObject({ sourceVersion: original, renderingVersion: renderedVersion,
    sections: [{ sectionId: "clone", status: "structural-drift", action: "review" }] })
  page.rendering.sections.find((entry: { sectionIndex: number }) => entry.sectionIndex === 1).html = '<section data-section-id="B"><p data-id="text-B">Edited B</p></section>'
  expect((await app.request("/books/book/pages/pg001/rendering", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(page.rendering) })).status).toBe(200)
  const saved = db.getLatestNodeData("web-rendering", "pg001")!.data as WebRenderingOutput
  expect(saved.sections.find(entry => entry.sectionId === "B")?.html).toContain("Edited B")
  expect(saved.sections.find(entry => entry.sectionId === "clone")).toMatchObject({ html: retained.sections[1].html, activityAnswers: retained.sections[1].activityAnswers })
  expect(db.getAllNodeVersions("web-rendering", "pg001").find(row => row.version === renderedVersion)?.data).toEqual(retained)
  db.putNodeData("page-sectioning", "pg001", { reasoning: "restored clone", sections: [section("A"), section("clone"), section("B")] })
  const restored = await (await app.request("/books/book/pages/pg001")).json()
  expect(restored.rendering.sections.find((entry: { sectionIndex: number }) => entry.sectionIndex === 1).sectionId).toBe("clone")
  expect(restored.sectioningSynchronization).toBeNull()
  db.close()
})

it("rejects conflicting owner selections and negative image targets before provider work, retaining every copy", async () => {
  const db = storage()
  const retained: WebRenderingOutput = { sections: ["A", "A", "B"].map((sectionId, sectionIndex) => ({ sectionId, sectionIndex, sectionType: "content", reasoning: "copy",
    html: `<section data-section-id="${sectionId}"><p data-id="copy-${sectionIndex}">${sectionIndex}</p></section>`, activityAnswers: { answer: `answer-${sectionIndex}` } })) }
  db.putNodeData("web-rendering", "pg001", retained)
  const before = db.getNodeVersionFingerprint()
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"))
  const page = await (await app.request("/books/book/pages/pg001")).json()
  expect(page.rendering.sections.map((entry: { sectionIndex: number }) => entry.sectionIndex)).toEqual([-1, -2, 0])
  expect(page.sectioningSynchronization.sections).toHaveLength(2)
  const { createBookTools } = await import("@adt/agents")
  const tools = createBookTools({ storage: db, bookLabel: "book", booksDir: root, promptsDir: path.resolve("prompts"), credentials: {} }).tools
  const edit = await tools.updateSection.execute!({ pageId: "pg001", sectionIndex: 1, html: "<section>Changed</section>", reasoning: "test", activityAnswers: null }, {} as never)
  expect(edit).toMatchObject({ ok: false })
  for (const sectionIndex of [-2, 0.5, "0", 1]) {
    const result = await app.request("/books/book/images/ai-generate?pageId=pg001", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Image", sectionIndex, mode: "add" }) })
    expect(result.status).toBe(sectionIndex === 1 ? 409 : 400)
  }
  expect(db.getNodeVersionFingerprint()).toEqual(before)
  expect(db.getLatestNodeData("web-rendering", "pg001")?.data).toEqual(retained)
  db.close()
})
