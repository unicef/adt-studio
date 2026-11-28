import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
import { putSourceNodeData, resolveReadingOrder } from "@adt/pipeline"
import { currentStoryboardCoverage, currentStoryboardSourceWarnings } from "./storyboard-package-coverage.js"
import { currentReadingOwners } from "./storyboard-read-model.js"

const work = vi.hoisted(() => ({ projectedPages: 0 }))
vi.mock("@adt/pipeline", async original => {
  const actual = await original<typeof import("@adt/pipeline")>()
  return { ...actual,
    storyboardCoverage: (...args: Parameters<typeof actual.storyboardCoverage>) => { work.projectedPages += args[1]?.length ?? args[0].getPages().length; return actual.storyboardCoverage(...args) },
    storyboardSourceWarnings: (...args: Parameters<typeof actual.storyboardSourceWarnings>) => { work.projectedPages += args[1]?.length ?? args[0].getPages().length; return actual.storyboardSourceWarnings(...args) },
  }
})
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

it("recomputes only changed page facts after a single save while detecting raw rewrites and ownership collisions", { timeout: 60_000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-read-model-")); roots.push(root)
  const bookDir = path.join(root, "book"), storage = createBookStorage("book", root)
  const ids = Array.from({ length: 150 }, (_, i) => "pg" + String(i + 1).padStart(3, "0"))
  const source = (id: string, text = "Original") => ({ reasoning: "", sections: [{ sectionId: id + "_sec001", sectionType: "text", pageNumber: 1, isPruned: false, backgroundColor: "white", textColor: "black", nodes: [{ nodeId: id + "_n001", role: "heading", text, isPruned: false }] }] })
  try {
    storage.transaction(() => {
      for (const [index, id] of ids.entries()) {
        storage.putExtractedPage({ pageId: id, pageNumber: index + 1, text: "source", images: [], pageImage: { imageId: id + "_page", buffer: Buffer.from("image"), hash: "image", format: "png", width: 10, height: 10 } })
        storage.putNodeData("page-sectioning", id, source(id))
        storage.putNodeData("web-rendering", id, { sections: [{ sectionId: id + "_sec001", sectionIndex: 0, sectionType: "text", reasoning: "", html: `<section data-section-id="${id}_sec001"><h1 data-id="${id}_n001">Original</h1>${"<p>Retained content</p>".repeat(100)}</section>` }] })
      }
    })
    const read = () => ({ coverage: currentStoryboardCoverage(storage, bookDir, ids), warnings: currentStoryboardSourceWarnings(storage, bookDir, ids) })
    const checkOwners = () => expect([...currentReadingOwners(storage, bookDir)]).toEqual(resolveReadingOrder(storage).items.map(item => [item.id, item.kind === "section" ? item.pageId : null]))
    work.projectedPages = 0
    expect(read().coverage.complete).toBe(true)
    expect(work.projectedPages).toBe(300) // both real projections process every page initially
    checkOwners()
    putSourceNodeData(storage, "page-sectioning", ids[0], source(ids[0], "Edited"))
    work.projectedPages = 0
    const start = performance.now(), changed = read()
    process.stdout.write(JSON.stringify({ pages: 150, afterSingleSaveMs: performance.now() - start, projectedPages: work.projectedPages }) + "\n")
    expect(changed).toMatchObject({ coverage: { complete: true }, warnings: [{ pageId: ids[0] }] })
    expect(work.projectedPages).toBe(2)
    checkOwners()
    work.projectedPages = 0
    expect(read()).toEqual(changed)
    expect(work.projectedPages).toBe(0)
    const raw = openBookDb(path.join(bookDir, "book.db"))
    try {
      const saved = raw.get("SELECT data FROM node_data WHERE node='web-rendering' AND item_id=?", [ids[1]]) as { data: string }
      raw.run("UPDATE node_data SET data='{' WHERE node='web-rendering' AND item_id=?", [ids[1]])
      expect(read().coverage.complete).toBe(false)
      checkOwners()
      raw.run("UPDATE node_data SET data=? WHERE node='web-rendering' AND item_id=?", [saved.data, ids[1]])
      expect(read().coverage.complete).toBe(true)
      checkOwners()
    } finally { raw.close() }
    storage.putNodeData("page-sectioning", ids[1], source(ids[0]))
    const conflict = read().coverage
    expect(conflict.complete).toBe(false)
    expect(conflict.missingSections.map(section => section.pageId)).toContain(ids[0])
    checkOwners()
    storage.putNodeData("page-sectioning", ids[1], source(ids[1]))
    storage.putNodeData("quiz-generation", "book", { quizzes: [{ quizId: "qz001", afterPageId: ids[0], question: "Question", options: [], answer: "" }] })
    checkOwners() // membership iteration retains page/quiz reading order
    const partFile = path.join(bookDir, "part.json")
    fs.writeFileSync(partFile, JSON.stringify({ adtPart: 1, sourceLabel: "book", title: null, range: { startPage: 2, endPage: 3 }, pageCount: 150, fingerprint: {}, identityHash: "id", semanticsHash: "sem", createdAt: "test", partLabelSuggestion: "part" }))
    checkOwners()
    expect([...currentReadingOwners(storage, bookDir).keys()]).toEqual([ids[1] + "_sec001", ids[2] + "_sec001"])
    const changedOrder = openBookDb(path.join(bookDir, "book.db"))
    try { changedOrder.run("UPDATE pages SET page_number=151 WHERE page_id=?", [ids[1]]) }
    finally { changedOrder.close() }
    checkOwners()
    expect(currentReadingOwners(storage, bookDir).has(ids[1] + "_sec001")).toBe(false)
    fs.rmSync(partFile)
    checkOwners()
  } finally { storage.close() }
})
