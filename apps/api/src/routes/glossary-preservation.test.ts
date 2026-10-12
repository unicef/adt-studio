import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { createGlossaryRoutes } from "./glossary.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"
let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "glossary-preservation-"))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
it("binds glossary replacement to its editor version and retains server authorship and downstream history", async () => {
  const storage = createBookStorage("book", root)
  const original = {
    items: [
      {
        id: "term",
        word: "Tree",
        definition: "A plant",
        variations: [],
        emojis: [],
        source: "ai",
      },
    ],
    pageCount: 1,
    generatedAt: "before",
  }
  storage.putNodeData("glossary", "book", original)
  storage.putNodeData("text-catalog-translation", "fr", {
    entries: [{ id: "term", text: "Arbre", source: "manual" }],
    generatedAt: "before",
  })
  const history = storage.getAllNodeVersions("text-catalog-translation", "fr")
  const app = new Hono()
    .use("/books/:label/*", bookWriterMiddleware(root))
    .route("/", createGlossaryRoutes(root))
    .onError(errorHandler)
  const save = (data: unknown) =>
    app.request("/books/book/glossary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  try {
    expect((await save(original)).status).toBe(400)
    const replacement = {
      ...original,
      baseVersion: 1,
      items: [
        {
          ...original.items[0],
          definition: "A saved replacement",
          generationEvidence: {
            source: "ai",
            input: { signature: "forged", contentHash: "forged" },
          },
        },
      ],
    }
    expect((await save(replacement)).status).toBe(200)
    const saved = storage.getLatestNodeData("glossary", "book")!
    expect(saved.data).toMatchObject({
      items: [
        { id: "term", source: "manual", definition: "A saved replacement" },
      ],
    })
    expect(JSON.stringify(saved.data)).not.toContain("forged")
    expect((await save({ ...original, baseVersion: 1 })).status).toBe(409)
    expect(storage.getLatestNodeData("glossary", "book")).toEqual(saved)
    expect(storage.getAllNodeVersions("glossary", "book")[0].data).toEqual(
      original,
    )
    expect(
      storage.getAllNodeVersions("text-catalog-translation", "fr"),
    ).toEqual(history)
  } finally {
    storage.close()
  }
})
