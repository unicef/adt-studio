import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }))

vi.mock("@adt/llm", async () => {
  const actual = await vi.importActual<typeof import("@adt/llm")>("@adt/llm")
  return { ...actual, createLLMModel: vi.fn(() => ({ generateObject: generateObjectMock, renderPrompt: async () => [] })) }
})

import { createBookSummaryRoutes } from "./book-summary.js"

let tmpDir = ""
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "book-summary-route-"))
  generateObjectMock.mockReset()
})
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

it("clears the summary-missing warning and its note once a regenerate succeeds", async () => {
  const booksDir = path.join(tmpDir, "books")
  const configPath = path.join(tmpDir, "config.yaml")
  fs.writeFileSync(configPath, "role_types:\n  section_text: Main body text\nstructure_types:\n  paragraph: Paragraph\n")
  const storage = createBookStorage("book", booksDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Some text",
      pageImage: { imageId: "pg001_page", buffer: Buffer.from("png"), format: "png", hash: "h", width: 4, height: 6 },
      images: [],
    })
    // The Extract run's summary call failed.
    storage.markStepCompleted("book-summary", "Completed — no book summary after a failure: HTTP 404", [
      { kind: "summary-missing", error: "HTTP 404" },
    ])
  } finally {
    storage.close()
  }
  generateObjectMock.mockResolvedValue({ object: { summary: "A book." }, usage: { inputTokens: 1, outputTokens: 1 } })

  const app = createBookSummaryRoutes(booksDir, path.join(tmpDir, "prompts"), configPath)
  const res = await app.request("/books/book/book-summary/regenerate", { method: "POST", headers: { "X-OpenAI-Key": "sk-test" } })
  expect(res.status).toBe(200)

  const after = createBookStorage("book", booksDir)
  try {
    expect(after.getLatestNodeData("book-summary", "book")?.data).toEqual({ summary: "A book." })
    const row = after.getStepRuns().find((run) => run.step === "book-summary")
    expect(row).toMatchObject({ status: "done", warnings: null })
    expect(row?.message ?? "").toBe("")
  } finally {
    after.close()
  }
})
