import { describe, it, expect, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "../db.js"
import type { ExtractedPage, PdfMetadata } from "@adt/pdf"
import { createBookStorage, resolveBookPaths } from "../book-storage.js"

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "adt-storage-test-"))
}

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  dirs.length = 0
})

function createTempStorage(label = "test-book") {
  const booksRoot = makeTempDir()
  dirs.push(booksRoot)
  const storage = createBookStorage(label, booksRoot)
  const paths = resolveBookPaths(label, booksRoot)
  return { storage, paths, booksRoot }
}

function fakePng(width: number, height: number): Buffer {
  // Minimal valid-ish buffer (not a real PNG, but sufficient for storage tests)
  return Buffer.from(`fake-png-${width}x${height}`)
}

function makePage(pageNumber: number): ExtractedPage {
  const pageId = `pg${String(pageNumber).padStart(3, "0")}`
  return {
    pageId,
    pageNumber,
    text: `Text for page ${pageNumber}`,
    pageImage: {
      imageId: `${pageId}_page`,
      pageId,
      pngBuffer: fakePng(800, 1200),
      width: 800,
      height: 1200,
      hash: `hash_page_${pageNumber}`,
    },
    images: [
      {
        imageId: `${pageId}_im001`,
        pageId,
        pngBuffer: fakePng(200, 150),
        width: 200,
        height: 150,
        hash: `hash_im001_${pageNumber}`,
      },
    ],
  }
}

describe("createBookStorage", () => {
  it("creates book directory and database", () => {
    const { storage, paths } = createTempStorage()

    expect(fs.existsSync(paths.bookDir)).toBe(true)
    expect(fs.existsSync(paths.imagesDir)).toBe(true)
    expect(fs.existsSync(paths.dbPath)).toBe(true)

    storage.close()
  })

  it("stores and retrieves pdf metadata", () => {
    const { storage, paths } = createTempStorage()

    const metadata: PdfMetadata = {
      title: "Test Book",
      author: "Test Author",
      format: "PDF 1.5",
    }

    storage.putPdfMetadata(metadata)

    // Verify by reading DB directly
    const db = openBookDb(paths.dbPath)
    const rows = db.all("SELECT data FROM pdf_metadata WHERE id = 1") as Array<{
      data: string
    }>
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].data)).toEqual(metadata)
    db.close()

    storage.close()
  })

  it("stores extracted pages with images", () => {
    const { storage, paths } = createTempStorage()

    const page = makePage(1)
    storage.putExtractedPage(page)

    // Verify page row in DB
    const db = openBookDb(paths.dbPath)
    const pageRows = db.all("SELECT * FROM pages") as Array<{
      page_id: string
      page_number: number
      text: string
    }>
    expect(pageRows).toHaveLength(1)
    expect(pageRows[0].page_id).toBe("pg001")
    expect(pageRows[0].page_number).toBe(1)
    expect(pageRows[0].text).toBe("Text for page 1")

    // Verify image rows in DB
    const imageRows = db.all("SELECT * FROM images ORDER BY image_id") as Array<{
      image_id: string
      page_id: string
      source: string
    }>
    expect(imageRows).toHaveLength(2)
    expect(imageRows[0].image_id).toBe("pg001_im001")
    expect(imageRows[1].image_id).toBe("pg001_page")
    expect(imageRows[0].source).toBe("extract")
    expect(imageRows[1].source).toBe("extract")

    // Verify PNG files on disk
    expect(
      fs.existsSync(path.join(paths.imagesDir, "pg001_page.png"))
    ).toBe(true)
    expect(
      fs.existsSync(path.join(paths.imagesDir, "pg001_im001.png"))
    ).toBe(true)

    db.close()
    storage.close()
  })

  it("handles multiple pages", () => {
    const { storage, paths } = createTempStorage()

    storage.putExtractedPage(makePage(1))
    storage.putExtractedPage(makePage(2))

    const db = openBookDb(paths.dbPath)
    const pageRows = db.all("SELECT * FROM pages ORDER BY page_number")
    expect(pageRows).toHaveLength(2)

    const imageRows = db.all("SELECT * FROM images")
    expect(imageRows).toHaveLength(4) // 2 pages × (1 page image + 1 extracted image)

    db.close()
    storage.close()
  })

  it("upserts image metadata for re-extraction", () => {
    const { storage, paths } = createTempStorage()

    const page = makePage(1)
    storage.putExtractedPage(page)
    const updatedPage = {
      ...page,
      pageImage: {
        ...page.pageImage,
        hash: "updated-hash",
        width: 999,
        height: 888,
      },
    }
    storage.putExtractedPage(updatedPage) // re-run

    const db = openBookDb(paths.dbPath)
    const pageRows = db.all("SELECT * FROM pages")
    expect(pageRows).toHaveLength(1) // ON CONFLICT updates

    const imageRows = db.all(
      "SELECT image_id, hash, width, height FROM images ORDER BY image_id"
    ) as Array<{
      image_id: string
      hash: string
      width: number
      height: number
    }>
    expect(imageRows).toHaveLength(2) // upsert updates existing image metadata
    expect(imageRows[1].image_id).toBe("pg001_page")
    expect(imageRows[1].hash).toBe("updated-hash")
    expect(imageRows[1].width).toBe(999)
    expect(imageRows[1].height).toBe(888)

    db.close()
    storage.close()
  })

  it("clears pages and images for a fresh extraction run", () => {
    const { storage, paths } = createTempStorage()

    storage.putExtractedPage(makePage(1))
    storage.putExtractedPage(makePage(2))
    storage.clearExtractedData()

    const db = openBookDb(paths.dbPath)
    const pageRows = db.all("SELECT * FROM pages")
    const imageRows = db.all("SELECT * FROM images")
    expect(pageRows).toHaveLength(0)
    expect(imageRows).toHaveLength(0)
    expect(fs.readdirSync(paths.imagesDir)).toHaveLength(0)

    db.close()
    storage.close()
  })

  it("does not clear DB rows when image cleanup fails", () => {
    const { storage, paths } = createTempStorage()

    storage.putExtractedPage(makePage(1))
    storage.putExtractedPage(makePage(2))

    vi.spyOn(fs, "readdirSync").mockImplementationOnce(() => {
      throw new Error("simulated filesystem failure")
    })

    expect(() => storage.clearExtractedData()).toThrow(
      "simulated filesystem failure"
    )

    const db = openBookDb(paths.dbPath)
    const pageRows = db.all("SELECT page_id FROM pages ORDER BY page_number")
    const imageRows = db.all("SELECT image_id FROM images ORDER BY image_id")
    expect(pageRows).toHaveLength(2)
    expect(imageRows).toHaveLength(4)
    db.close()
    storage.close()
  })

  it("rejects unsafe labels", () => {
    const booksRoot = makeTempDir()
    dirs.push(booksRoot)
    expect(() => createBookStorage("../escape", booksRoot)).toThrow(
      "Invalid book label"
    )
  })
})

describe("getPages", () => {
  it("returns pages ordered by page number", () => {
    const { storage } = createTempStorage()

    storage.putExtractedPage(makePage(3))
    storage.putExtractedPage(makePage(1))
    storage.putExtractedPage(makePage(2))

    const pages = storage.getPages()
    expect(pages).toHaveLength(3)
    expect(pages[0].pageId).toBe("pg001")
    expect(pages[0].pageNumber).toBe(1)
    expect(pages[0].text).toBe("Text for page 1")
    expect(pages[1].pageNumber).toBe(2)
    expect(pages[2].pageNumber).toBe(3)

    storage.close()
  })

  it("returns empty array when no pages", () => {
    const { storage } = createTempStorage()
    expect(storage.getPages()).toEqual([])
    storage.close()
  })
})

describe("getPageImageBase64", () => {
  it("returns page image as base64", () => {
    const { storage } = createTempStorage()

    storage.putExtractedPage(makePage(1))
    const base64 = storage.getPageImageBase64("pg001")
    const decoded = Buffer.from(base64, "base64").toString()
    expect(decoded).toBe("fake-png-800x1200")

    storage.close()
  })

  it("throws for missing page image", () => {
    const { storage } = createTempStorage()
    expect(() => storage.getPageImageBase64("pg999")).toThrow(
      "No page image found"
    )
    storage.close()
  })

  it("rejects image paths that escape the book directory", () => {
    const { storage, paths } = createTempStorage()

    storage.putExtractedPage(makePage(1))

    const db = openBookDb(paths.dbPath)
    db.run("UPDATE images SET path = ? WHERE image_id = ?", [
      "../outside.png",
      "pg001_page",
    ])
    db.close()

    expect(() => storage.getPageImageBase64("pg001")).toThrow(
      "Resolved path escapes books root"
    )
    storage.close()
  })
})

describe("putNodeData / getLatestNodeData", () => {
  it("stores and retrieves versioned data", () => {
    const { storage } = createTempStorage()

    const v1 = storage.putNodeData("text-classification", "pg001", { reasoning: "v1" })
    expect(v1).toBe(1)

    const v2 = storage.putNodeData("text-classification", "pg001", { reasoning: "v2" })
    expect(v2).toBe(2)

    const latest = storage.getLatestNodeData("text-classification", "pg001")
    expect(latest).not.toBeNull()
    expect(latest!.version).toBe(2)
    expect(latest!.data).toEqual({ reasoning: "v2" })

    storage.close()
  })

  it("returns null for missing node data", () => {
    const { storage } = createTempStorage()
    expect(storage.getLatestNodeData("text-classification", "pg999")).toBeNull()
    storage.close()
  })

  it("handles different nodes independently", () => {
    const { storage } = createTempStorage()

    storage.putNodeData("text-classification", "pg001", { a: 1 })
    storage.putNodeData("page-sectioning", "pg001", { b: 2 })

    const tc = storage.getLatestNodeData("text-classification", "pg001")
    const ps = storage.getLatestNodeData("page-sectioning", "pg001")
    expect(tc!.data).toEqual({ a: 1 })
    expect(ps!.data).toEqual({ b: 2 })

    storage.close()
  })
})

describe("appendLlmLog", () => {
  it("appends log entries", () => {
    const { storage, paths } = createTempStorage()

    storage.appendLlmLog({ taskType: "test", modelId: "gpt-4o" })
    storage.appendLlmLog({ taskType: "test2", modelId: "gpt-4o" })

    const db = openBookDb(paths.dbPath)
    const rows = db.all("SELECT * FROM llm_log ORDER BY id") as Array<{
      id: number
      timestamp: string
      data: string
    }>
    expect(rows).toHaveLength(2)
    expect(JSON.parse(rows[0].data).taskType).toBe("test")
    expect(JSON.parse(rows[1].data).taskType).toBe("test2")
    expect(rows[0].timestamp).toBeTruthy()
    db.close()

    storage.close()
  })
})
