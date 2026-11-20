import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { createBookStorage, withBookWriter } from "@adt/storage"
import { Hono } from "hono"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"

const extraction = vi.hoisted(() => ({ failNext: false, entered: undefined as (() => void) | undefined, wait: undefined as Promise<void> | undefined }))

const idOf = (group: number[]) => "pg" + group.map((index) => String(index + 1).padStart(3, "0")).join("")
const fakePage = (pageId: string, pageNumber: number) => ({ pageId, pageNumber, text: pageId, positionedText: { blocks: [] },
  pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from(pageId), format: "png" as const, hash: pageId, width: 1, height: 1 }, images: [] })

// Extraction that takes a moment, as it does while a watermark stamp is learned.
vi.mock("@adt/pdf", async (original) => ({ ...await original<typeof import("@adt/pdf")>(),
  countPdfPages: () => 6,
  extractPages: async ({ groups }: { groups: number[][] }) => {
    extraction.entered?.()
    if (extraction.wait) await extraction.wait
    if (extraction.failNext) { extraction.failNext = false; throw new Error("injected extraction failure") }
    await new Promise((resolve) => setTimeout(resolve, 30))
    return groups.map((group) => fakePage(idOf(group), group[0] + 1))
  },
}))
import { createPageRoutes } from "./pages.js"

it.each([false, true])("finishes one spread apply before starting the next, with app-level guard: %s", async outerGuard => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-spread-order-"))
  try {
    const seed = createBookStorage("book", root)
    try {
      for (let n = 1; n <= 6; n++) seed.putExtractedPage(fakePage(idOf([n - 1]), n))
      fs.writeFileSync(path.join(seed.bookDir!, "book.pdf"), "fixture")
    } finally { seed.close() }
    const configPath = path.join(root, "config.yaml")
    fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\n")
    const routes = createPageRoutes(root, root, root, configPath)
    const app = outerGuard ? new Hono().onError(errorHandler).use("/books/:label/*", bookWriterMiddleware(root)).route("/", routes) : routes
    const apply = (spreadPairs: number[]) => app.request("/books/book/spreads/apply", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadPairs }) })

    // "Merge 5–6", then "no spreads" while the merge is still extracting.
    const [merge, undo] = await Promise.all([apply([5]), apply([])])
    expect(merge.status).toBe(200)
    expect(undo.status).toBe(200)

    // The book matches the apply that came last. Unqueued, "no spreads" reads
    // the pages before the merge lands, finds nothing to do, and the merge
    // then leaves pg005006 behind.
    const verify = createBookStorage("book", root)
    try {
      expect(verify.getPages().map((page) => page.pageId)).toEqual(["pg001", "pg002", "pg003", "pg004", "pg005", "pg006"])
    } finally { verify.close() }
    expect(await undo.json()).toMatchObject({ merged: 2, removed: 1, pageCount: 6 })
    expect(fs.existsSync(path.join(root, "book", ".book-writer.json"))).toBe(false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

it("keeps unrelated writers excluded and releases admission after a failed queued apply", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-spread-failure-"))
  const bookDir = path.join(root, "book")
  let resume!: () => void
  try {
    const seed = createBookStorage("book", root)
    try {
      for (let n = 1; n <= 6; n++) seed.putExtractedPage(fakePage(idOf([n - 1]), n))
      fs.writeFileSync(path.join(bookDir, "book.pdf"), "fixture")
    } finally { seed.close() }
    const configPath = path.join(root, "config.yaml")
    fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\n")
    const app = new Hono().onError(errorHandler).use("/books/:label/*", bookWriterMiddleware(root))
      .route("/", createPageRoutes(root, root, root, configPath))
    const apply = (spreadPairs: number[]) => app.request("/books/book/spreads/apply", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadPairs }) })
    const entered = new Promise<void>(resolve => { extraction.entered = resolve })
    extraction.wait = new Promise<void>(resolve => { resume = resolve })
    extraction.failNext = true
    const first = apply([5])
    await entered
    const next = apply([])
    expect(() => withBookWriter(bookDir, () => "unrelated write")).toThrow("BOOK_BUSY")
    resume()
    expect((await first).status).toBe(500)
    expect((await next).status).toBe(200)
    expect(fs.existsSync(path.join(bookDir, ".book-writer.json"))).toBe(false)
    expect(withBookWriter(bookDir, () => "next writer")).toBe("next writer")
  } finally {
    resume?.(); extraction.entered = undefined; extraction.wait = undefined; extraction.failNext = false
    fs.rmSync(root, { recursive: true, force: true })
  }
})
