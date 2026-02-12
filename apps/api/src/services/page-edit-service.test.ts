import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createBookStorage } from "@adt/storage"
import { reRenderPage } from "./page-edit-service.js"

describe("page-edit-service", () => {
  let tmpDir: string
  const label = "test-book"

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "page-edit-svc-"))

    // Create a book with extracted pages but no pipeline data
    const storage = createBookStorage(label, tmpDir)
    try {
      const fakeImage = {
        imageId: `${label}_p1_page`,
        buffer: Buffer.from("fake-png-data"),
        format: "png" as const,
        hash: "abc123",
        width: 800,
        height: 600,
      }
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one text content",
        pageImage: fakeImage,
        images: [],
      })
    } finally {
      storage.close()
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("reRenderPage", () => {
    it("throws when pipeline data is missing", async () => {
      await expect(
        reRenderPage({
          label,
          pageId: `${label}_p1`,
          booksDir: tmpDir,
          promptsDir: tmpDir,
          apiKey: "test-key",
        })
      ).rejects.toThrow(
        "Page must have text-classification, image-classification, and page-sectioning data before re-rendering"
      )
    })
  })
})
