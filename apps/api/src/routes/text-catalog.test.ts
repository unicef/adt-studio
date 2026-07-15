import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { createTextCatalogRoutes } from "./text-catalog.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-text-catalog-route-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/** Book with an extracted page AND rendered HTML — buildTextCatalog yields entries. */
function seedRenderedBook(label: string): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [],
    })
    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "",
          html: '<p data-id="pg001_t001">Hello world</p>',
        },
      ],
    })
  } finally {
    storage.close()
  }
}

/** Book extracted but not yet rendered (Storyboard not run) — buildTextCatalog yields nothing. */
function seedUnrenderedBook(label: string): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [],
    })
  } finally {
    storage.close()
  }
}

describe("GET /books/:label/text-catalog lazy build", () => {
  it("builds and persists a non-empty catalog on demand", async () => {
    seedRenderedBook("rendered")
    const app = createTextCatalogRoutes(tmpDir)
    const res = await app.request("/books/rendered/text-catalog")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries.length).toBeGreaterThan(0)

    // Persisted so downstream consumers (translate, speech, packaging) can read it.
    const verify = createBookStorage("rendered", tmpDir)
    try {
      expect(verify.getLatestNodeData("text-catalog", "book")).toBeTruthy()
    } finally {
      verify.close()
    }
  })

  it("does not persist an empty catalog (book opened before Storyboard ran)", async () => {
    seedUnrenderedBook("not-rendered")
    const app = createTextCatalogRoutes(tmpDir)
    const res = await app.request("/books/not-rendered/text-catalog")
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()

    // The empty catalog must NOT be written — a persisted empty node would
    // poison Translate (it only rebuilds when the node is absent).
    const verify = createBookStorage("not-rendered", tmpDir)
    try {
      expect(verify.getLatestNodeData("text-catalog", "book")).toBeFalsy()
    } finally {
      verify.close()
    }
  })

  it("returns 404 for a missing book", async () => {
    const app = createTextCatalogRoutes(tmpDir)
    const res = await app.request("/books/ghost/text-catalog")
    expect(res.status).toBe(404)
  })
})
