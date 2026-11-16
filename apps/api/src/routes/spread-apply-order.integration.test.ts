import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"

const idOf = (group: number[]) => "pg" + group.map((index) => String(index + 1).padStart(3, "0")).join("")
const fakePage = (pageId: string, pageNumber: number) => ({ pageId, pageNumber, text: pageId, positionedText: { blocks: [] },
  pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from(pageId), format: "png" as const, hash: pageId, width: 1, height: 1 }, images: [] })

// Extraction that takes a moment, as it does while a watermark stamp is learned.
vi.mock("@adt/pdf", async (original) => ({ ...await original<typeof import("@adt/pdf")>(),
  countPdfPages: () => 6,
  extractPages: async ({ groups }: { groups: number[][] }) => {
    await new Promise((resolve) => setTimeout(resolve, 30))
    return groups.map((group) => fakePage(idOf(group), group[0] + 1))
  },
}))
import { createPageRoutes } from "./pages.js"

it("finishes one spread apply before starting the next on the same book", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-spread-order-"))
  try {
    const seed = createBookStorage("book", root)
    try {
      for (let n = 1; n <= 6; n++) seed.putExtractedPage(fakePage(idOf([n - 1]), n))
      fs.writeFileSync(path.join(seed.bookDir!, "book.pdf"), "fixture")
    } finally { seed.close() }
    const configPath = path.join(root, "config.yaml")
    fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\n")
    const app = createPageRoutes(root, root, root, configPath)
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
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
