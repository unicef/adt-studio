import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"

vi.mock("@adt/pdf", async (original) => ({ ...await original<typeof import("@adt/pdf")>(),
  countPdfPages: () => 1,
  extractPages: async () => [{ pageId: "pg001", pageNumber: 1, text: "New page", positionedText: { blocks: [] },
    pageImage: { imageId: "pg001_page", buffer: Buffer.from("new"), format: "png", hash: "new", width: 1, height: 1 }, images: [] }],
}))
import { createPageRoutes } from "./pages.js"

// Retained from the independent review's real-storage failure reproduction.
it("resets attempts with a committed page addition even if later recording preservation fails", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-partial-spread-"))
  let db = createBookStorage("book", root)
  try {
    db.putExtractedPage({ pageId: "pg002", pageNumber: 2, text: "Old page",
      pageImage: { imageId: "pg002_page", buffer: Buffer.from("old"), format: "png", hash: "old", width: 1, height: 1 }, images: [] })
    const source = { reasoning: "old", sections: [{ sectionId: "pg002_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 2, isPruned: false,
      nodes: [{ nodeId: "pg002_t001", role: "text", text: "Old page", isPruned: false }] }] }
    db.putNodeData("page-sectioning", "pg002", source)
    fs.mkdirSync(path.join(db.bookDir!, "audio", "en"), { recursive: true })
    const recording = path.join(db.bookDir!, "audio", "en", "old.wav")
    fs.writeFileSync(recording, "uploaded")
    const speech = { entries: [{ textId: "pg002_sec001_ans_a", language: "en", fileName: "old.wav", voice: "uploaded", model: "uploaded", provider: "manual", cached: false }], generatedAt: "fixture" }
    db.putNodeData("tts", "en", speech)
    fs.writeFileSync(path.join(db.bookDir!, "book.pdf"), "fixture")
    const configPath = path.join(root, "config.yaml")
    fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\nstart_page: 1\nend_page: 1\n")
    const steps = ["quiz-generation", "glossary", "toc-generation"]
    for (const step of [...steps, "tts"]) db.markStepCompleted(step)
    for (const node of steps) db.putNodeData(node, "book", { manual: "retained" })
    db.close()
    const app = createPageRoutes(root, root, root, configPath)
    const copy = vi.spyOn(fs, "copyFileSync").mockImplementationOnce(() => { throw new Error("disk full preserving recording") })
    let response: Response
    try {
      response = await app.request("/books/book/spreads/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadPairs: [] }) })
    } finally { copy.mockRestore() }
    db = createBookStorage("book", root)
    expect(response.status).toBe(500)
    expect(db.getPages().map((page) => page.pageId)).toEqual(["pg001", "pg002"])
    const actual = db.getStepRuns().map((run) => run.step)
    // The committed page is not yet rendered: only TOC page membership changed.
    expect(actual).not.toContain("toc-generation")
    expect(actual).toEqual(expect.arrayContaining(["quiz-generation", "glossary"]))
    expect(actual).toContain("tts")
    for (const node of steps) expect(db.getAllNodeVersions(node, "book").map((row) => row.data)).toEqual([{ manual: "retained" }])
    expect(db.getLatestNodeData("page-sectioning", "pg002")?.data).toEqual(source)
    expect(db.getLatestNodeData("tts", "en")?.data).toEqual(speech)
    expect(fs.readFileSync(recording, "utf8")).toBe("uploaded")
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
