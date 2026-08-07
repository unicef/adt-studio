import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createBookOutlineRoutes } from "./book-outline.js"

describe("book outline audit route", () => {
  let booksDir: string
  const label = "outline-book"

  beforeEach(() => {
    booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-outline-route-"))
  })

  afterEach(() => {
    fs.rmSync(booksDir, { recursive: true, force: true })
  })

  function addPage(): void {
    const storage = createBookStorage(label, booksDir)
    try {
      storage.putExtractedPage({
        pageId: "pg001",
        pageNumber: 1,
        text: "Chapter One",
        pageImage: {
          imageId: "pg001_page",
          buffer: Buffer.from("fake-png"),
          format: "png",
          hash: "hash-1",
          width: 100,
          height: 100,
        },
        images: [],
      })
    } finally {
      storage.close()
    }
  }

  it("returns the latest outline with current storyboard assignments", async () => {
    addPage()
    const storage = createBookStorage(label, booksDir)
    try {
      storage.putNodeData("book-outline", "book", {
        reasoning: "Large centered titles consistently introduce chapters.",
        styleClusters: [
          { styleClusterId: "chapter-style", description: "Large title", level: 1 },
        ],
        entries: [
          {
            outlineId: "outline-001",
            title: "Chapter One",
            level: 1,
            kind: "chapter",
            pageId: "pg001",
            pageNumber: 1,
            sourceCandidateIds: ["pg001_hc001"],
            parentId: null,
            styleClusterId: "chapter-style",
            confidence: 0.97,
          },
        ],
      })
      storage.putNodeData("page-sectioning", "pg001", {
        reasoning: "Matched the outline.",
        sections: [
          {
            sectionId: "pg001_sec001",
            sectionType: "text_only",
            backgroundColor: "#ffffff",
            textColor: "#000000",
            pageNumber: 1,
            isPruned: false,
            nodes: [
              {
                nodeId: "pg001_n001",
                isPruned: false,
                role: "chapter_title",
                text: "Chapter One",
                headingLevel: 1,
                outlineEntryId: "outline-001",
                headingStyleClusterId: "chapter-style",
              },
            ],
          },
        ],
      })
    } finally {
      storage.close()
    }

    const response = await createBookOutlineRoutes(booksDir).request(
      `/books/${label}/book-outline`,
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.version).toBe(1)
    expect(body.outline.entries[0]).toMatchObject({
      outlineId: "outline-001",
      level: 1,
    })
    expect(body.appliedHeadings).toEqual([
      {
        outlineEntryId: "outline-001",
        pageId: "pg001",
        nodeId: "pg001_n001",
        role: "chapter_title",
        text: "Chapter One",
        headingLevel: 1,
        headingStyleClusterId: "chapter-style",
      },
    ])
  })

  it("returns null when extraction has no outline yet", async () => {
    addPage()
    const response = await createBookOutlineRoutes(booksDir).request(
      `/books/${label}/book-outline`,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })
})
