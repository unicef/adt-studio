import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createTextCatalogRoutes } from "./text-catalog.js"
import { createTocRoutes } from "./toc.js"
import { createQuizRoutes } from "./quizzes.js"
import { createPageRoutes } from "./pages.js"

/** Slice 1 must not turn stored-schema support into client-authored provenance.
 * These are request-boundary checks, not guarded-save/preservation acceptance. */
describe("stored authorship is not client-writable", () => {
  let booksDir: string
  const label = "authorship"

  beforeEach(() => {
    booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-authorship-boundary-"))
    const book = createBookStorage(label, booksDir)
    try {
      book.putExtractedPage({
        pageId: "pg001", pageNumber: 1, text: "Source text", images: [],
        pageImage: { imageId: "pg001_page", buffer: Buffer.from("fixture"), format: "png", hash: "fixture", width: 1, height: 1 },
      })
    } finally {
      book.close()
    }
  })
  afterEach(() => fs.rmSync(booksDir, { recursive: true, force: true }))

  it.each(["ai", "manual"])("ignores caller source=%s at every affected edit boundary", async (source) => {
    const app = createTextCatalogRoutes(booksDir)
    app.route("/", createTocRoutes(booksDir))
    app.route("/", createQuizRoutes(booksDir))
    app.route("/", createPageRoutes(booksDir, "", ""))
    const sectioning = { source, reasoning: "Edited", sections: [] }
    const cases = [
      { route: "pages/pg001/sectioning", node: "page-sectioning", itemId: "pg001", body: sectioning },
      { route: "pages/pg001/storyboard", node: "page-sectioning", itemId: "pg001", body: { sectioning } },
      { route: "toc", node: "toc-generation", itemId: "book", body: { source, entries: [], pageCount: 1, generatedAt: "2026-10-10" } },
      { route: "quizzes", node: "quiz-generation", itemId: "book", body: {
        generatedAt: "2026-10-10", language: "en", pagesPerQuiz: 1,
        quizzes: [{ source, quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"], question: "How many?", answerIndex: 0, reasoning: "Counting", options: [
          { text: "One", explanation: "First" }, { text: "Two", explanation: "Second" }, { text: "Three", explanation: "Third" },
        ] }],
      } },
      { route: "text-catalog-translation/fr", node: "text-catalog-translation", itemId: "fr", body: { entries: [{ id: "pg001_t001", text: "Bonjour", source }] } },
    ]
    for (const { route, node, itemId, body } of cases) {
      const response = await app.request(`/books/${label}/${route}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      expect(response.status, route).toBe(200)
      const book = createBookStorage(label, booksDir)
      try {
        const saved = book.getLatestNodeData(node, itemId)
        expect(saved, route).not.toBeNull()
        // All source fields in these requests are attacker-controlled; none is
        // newly trusted just because stored-output schemas gained the field.
        expect(JSON.stringify(saved!.data), route).not.toContain('"source"')
      } finally {
        book.close()
      }
    }
  })
})
