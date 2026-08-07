import { describe, it, expect, afterEach, vi } from "vitest"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "../db.js"
import type { ExtractedPage } from "@adt/pdf"
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
      buffer: fakePng(800, 1200),
      format: "png" as const,
      width: 800,
      height: 1200,
      hash: `hash_page_${pageNumber}`,
    },
    images: [
      {
        imageId: `${pageId}_im001`,
        pageId,
        buffer: fakePng(200, 150),
        format: "png" as const,
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

  it("stores metadata via putNodeData", () => {
    const { storage } = createTempStorage()

    const metadata = {
      title: "Test Book",
      author: "Test Author",
      format: "PDF 1.5",
    }

    const version = storage.putNodeData("metadata", "book", metadata)
    expect(version).toBe(1)

    const latest = storage.getLatestNodeData("metadata", "book")
    expect(latest).not.toBeNull()
    expect(latest!.data).toEqual(metadata)

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

  it("includes cropped images in getPageImages", () => {
    const { storage } = createTempStorage()
    storage.putExtractedPage(makePage(1))

    storage.putCroppedImage({
      imageId: "pg001_im001",
      pageId: "pg001",
      version: 1,
      buffer: fakePng(180, 140),
      width: 180,
      height: 140,
    })

    const images = storage.getPageImages("pg001")
    const ids = images.map((img) => img.imageId)
    expect(ids).toContain("pg001_im001")
    expect(ids).toContain("pg001_im001_crop_v1")
    expect(ids).toContain("pg001_page")

    storage.close()
  })

  it("persists segment placement bounds and returns them in getPageImages", () => {
    const { storage } = createTempStorage()
    storage.putExtractedPage(makePage(1))

    storage.putSegmentedImage({
      sourceImageId: "pg001_im001",
      segmentIndex: 1,
      pageId: "pg001",
      version: 1,
      buffer: fakePng(80, 60),
      width: 80,
      height: 60,
      bounds: { x: 12, y: 34, width: 80, height: 60 },
    })

    const seg = storage
      .getPageImages("pg001")
      .find((img) => img.imageId === "pg001_im001_seg001_v1")
    expect(seg).toBeDefined()
    expect(seg!.bounds).toEqual({ x: 12, y: 34, width: 80, height: 60 })

    storage.close()
  })

  it("stores a segment without bounds when none are provided", () => {
    const { storage } = createTempStorage()
    storage.putExtractedPage(makePage(1))

    storage.putSegmentedImage({
      sourceImageId: "pg001_im001",
      segmentIndex: 1,
      pageId: "pg001",
      version: 1,
      buffer: fakePng(80, 60),
      width: 80,
      height: 60,
    })

    const seg = storage
      .getPageImages("pg001")
      .find((img) => img.imageId === "pg001_im001_seg001_v1")
    expect(seg).toBeDefined()
    expect(seg!.bounds).toBeUndefined()

    storage.close()
  })

  it("writes translated image variants and looks them up by source id", () => {
    const { storage, paths } = createTempStorage()
    storage.putExtractedPage(makePage(1))

    const newId = storage.putTranslatedImage({
      sourceImageId: "pg001_im001",
      pageId: "pg001",
      languageCode: "es",
      buffer: fakePng(200, 150),
      width: 200,
      height: 150,
    })
    expect(newId).toBe("pg001_im001_tr_es")
    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001_tr_es.png"))).toBe(true)

    const db = openBookDb(paths.dbPath)
    const rows = db.all(
      "SELECT image_id, source, page_id FROM images WHERE source = 'translate'"
    ) as Array<{ image_id: string; source: string; page_id: string }>
    expect(rows).toEqual([
      { image_id: "pg001_im001_tr_es", source: "translate", page_id: "pg001" },
    ])
    db.close()
    storage.close()
  })

  it("clearTranslatedImages removes translate rows and files but leaves originals", () => {
    const { storage, paths } = createTempStorage()
    storage.putExtractedPage(makePage(1))

    storage.putTranslatedImage({
      sourceImageId: "pg001_im001",
      pageId: "pg001",
      languageCode: "es",
      buffer: fakePng(200, 150),
      width: 200,
      height: 150,
    })
    storage.putTranslatedImage({
      sourceImageId: "pg001_im001",
      pageId: "pg001",
      languageCode: "fr",
      buffer: fakePng(200, 150),
      width: 200,
      height: 150,
    })
    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001_tr_es.png"))).toBe(true)
    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001_tr_fr.png"))).toBe(true)

    storage.clearTranslatedImages()

    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001_tr_es.png"))).toBe(false)
    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001_tr_fr.png"))).toBe(false)
    // Original extracted image is untouched
    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001.png"))).toBe(true)

    const db = openBookDb(paths.dbPath)
    const remaining = db.all("SELECT image_id FROM images ORDER BY image_id") as Array<{
      image_id: string
    }>
    expect(remaining.map((r) => r.image_id)).toEqual(["pg001_im001", "pg001_page"])
    db.close()
    storage.close()
  })

  it("clearTranslatedImages with languageCodes filter only removes matching variants", () => {
    const { storage, paths } = createTempStorage()
    storage.putExtractedPage(makePage(1))
    for (const lang of ["es", "fr", "pt-BR"]) {
      storage.putTranslatedImage({
        sourceImageId: "pg001_im001",
        pageId: "pg001",
        languageCode: lang,
        buffer: fakePng(200, 150),
        width: 200,
        height: 150,
      })
    }

    storage.clearTranslatedImages({ languageCodes: ["fr"] })

    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001_tr_es.png"))).toBe(true)
    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001_tr_fr.png"))).toBe(false)
    expect(fs.existsSync(path.join(paths.imagesDir, "pg001_im001_tr_pt-BR.png"))).toBe(true)
    storage.close()
  })

  it("putTranslatedImage upsert overwrites the file and row for the same language", () => {
    const { storage, paths } = createTempStorage()
    storage.putExtractedPage(makePage(1))

    storage.putTranslatedImage({
      sourceImageId: "pg001_im001",
      pageId: "pg001",
      languageCode: "es",
      buffer: Buffer.from("first"),
      width: 100,
      height: 100,
    })
    storage.putTranslatedImage({
      sourceImageId: "pg001_im001",
      pageId: "pg001",
      languageCode: "es",
      buffer: Buffer.from("second"),
      width: 200,
      height: 150,
    })

    const onDisk = fs.readFileSync(path.join(paths.imagesDir, "pg001_im001_tr_es.png"))
    expect(onDisk.toString()).toBe("second")

    const db = openBookDb(paths.dbPath)
    const rows = db.all(
      "SELECT hash, width, height FROM images WHERE image_id = ?",
      ["pg001_im001_tr_es"]
    ) as Array<{ hash: string; width: number; height: number }>
    const expectedHash = createHash("sha256")
      .update(Buffer.from("second"))
      .digest("hex")
      .slice(0, 16)
    expect(rows).toEqual([{ hash: expectedHash, width: 200, height: 150 }])
    db.close()
    storage.close()
  })

  it("getImageMeta returns page id and relative path", () => {
    const { storage } = createTempStorage()
    storage.putExtractedPage(makePage(1))

    const meta = storage.getImageMeta("pg001_im001")
    expect(meta).toEqual({ pageId: "pg001", relativePath: "images/pg001_im001.png" })
    expect(storage.getImageMeta("nonexistent")).toBeNull()
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

  it("clears pages, images, and node_data for a fresh extraction run", () => {
    const { storage, paths } = createTempStorage()

    storage.putExtractedPage(makePage(1))
    storage.putExtractedPage(makePage(2))
    storage.putNodeData("metadata", "book", { title: "Test" })
    storage.putNodeData("page-sectioning", "pg001", { reasoning: "test" })
    storage.clearExtractedData()

    const db = openBookDb(paths.dbPath)
    const pageRows = db.all("SELECT * FROM pages")
    const imageRows = db.all("SELECT * FROM images")
    const nodeRows = db.all("SELECT * FROM node_data")
    expect(pageRows).toHaveLength(0)
    expect(imageRows).toHaveLength(0)
    expect(nodeRows).toHaveLength(0)
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

    const v1 = storage.putNodeData("page-sectioning", "pg001", { reasoning: "v1" })
    expect(v1).toBe(1)

    const v2 = storage.putNodeData("page-sectioning", "pg001", { reasoning: "v2" })
    expect(v2).toBe(2)

    const latest = storage.getLatestNodeData("page-sectioning", "pg001")
    expect(latest).not.toBeNull()
    expect(latest!.version).toBe(2)
    expect(latest!.data).toEqual({ reasoning: "v2" })

    storage.close()
  })

  it("returns null for missing node data", () => {
    const { storage } = createTempStorage()
    expect(storage.getLatestNodeData("page-sectioning", "pg999")).toBeNull()
    storage.close()
  })

  it("handles different nodes independently", () => {
    const { storage } = createTempStorage()

    storage.putNodeData("image-filtering", "pg001", { a: 1 })
    storage.putNodeData("page-sectioning", "pg001", { b: 2 })

    const imgFilt = storage.getLatestNodeData("image-filtering", "pg001")
    const ps = storage.getLatestNodeData("page-sectioning", "pg001")
    expect(imgFilt!.data).toEqual({ a: 1 })
    expect(ps!.data).toEqual({ b: 2 })

    storage.close()
  })

  it("rolls back every write when a transaction fails", () => {
    const { storage } = createTempStorage()
    storage.putNodeData("web-rendering", "pg001", { version: "before" })
    storage.markStepCompleted("web-rendering")

    expect(() =>
      storage.transaction(() => {
        storage.putNodeData("web-rendering", "pg001", { version: "after" })
        storage.putNodeData("page-sectioning", "pg001", { version: "after" })
        storage.clearStepRuns(["web-rendering"])
        throw new Error("abort save")
      })
    ).toThrow("abort save")

    expect(storage.getLatestNodeData("web-rendering", "pg001")).toEqual({
      version: 1,
      data: { version: "before" },
    })
    expect(storage.getLatestNodeData("page-sectioning", "pg001")).toBeNull()
    expect(storage.getStepRuns()).toContainEqual(
      expect.objectContaining({ step: "web-rendering", status: "done" })
    )
    storage.close()
  })
})

describe("appendLlmLog", () => {
  it("appends log entries with step, item_id, success, and error_count", () => {
    const { storage, paths } = createTempStorage()

    storage.appendLlmLog({
      requestId: "req-aaa",
      timestamp: "2024-01-01T00:00:00.000Z",
      taskType: "page-sectioning",
      pageId: "pg001",
      promptName: "page_sectioning",
      modelId: "gpt-4o",
      cacheHit: false,
      success: true,
      errorCount: 2,
      attempt: 2,
      durationMs: 1000,
      validationErrors: ["err1", "err2"],
      messages: [],
    })
    storage.appendLlmLog({
      requestId: "req-bbb",
      timestamp: "2024-01-01T00:00:01.000Z",
      taskType: "web-rendering",
      pageId: "pg002",
      promptName: "web_generation_html",
      modelId: "gpt-4o",
      cacheHit: false,
      success: false,
      errorCount: 1,
      attempt: 0,
      durationMs: 500,
      validationErrors: ["timeout"],
      messages: [],
    })

    const db = openBookDb(paths.dbPath)
    const rows = db.all("SELECT * FROM llm_log ORDER BY id") as Array<{
      id: number
      request_id: string
      timestamp: string
      step: string
      item_id: string
      success: number
      error_count: number
      data: string
    }>
    expect(rows).toHaveLength(2)
    expect(rows[0].request_id).toBe("req-aaa")
    expect(rows[0].step).toBe("page-sectioning")
    expect(rows[0].item_id).toBe("pg001")
    expect(rows[0].success).toBe(1)
    expect(rows[0].error_count).toBe(2)
    expect(rows[0].timestamp).toBe("2024-01-01T00:00:00.000Z")
    expect(JSON.parse(rows[0].data).taskType).toBe("page-sectioning")
    expect(rows[1].request_id).toBe("req-bbb")
    expect(rows[1].step).toBe("web-rendering")
    expect(rows[1].item_id).toBe("pg002")
    expect(rows[1].success).toBe(0)
    expect(rows[1].error_count).toBe(1)
    db.close()

    storage.close()
  })
})

describe("debug_images", () => {
  it("stores and clears debug images", () => {
    const { storage, paths } = createTempStorage()

    storage.putDebugImage("aaaaaaaaaaaaaaaa", Buffer.from("one"))
    storage.putDebugImage("bbbbbbbbbbbbbbbb", Buffer.from("two"))
    // Duplicate hash is ignored
    storage.putDebugImage("aaaaaaaaaaaaaaaa", Buffer.from("ignored"))

    const debugDir = path.join(paths.bookDir, ".debug-images")
    let files = fs.readdirSync(debugDir).sort()
    expect(files).toEqual([
      "aaaaaaaaaaaaaaaa.png",
      "bbbbbbbbbbbbbbbb.png",
    ])

    storage.clearDebugImages()

    files = fs.readdirSync(debugDir)
    expect(files).toHaveLength(0)

    storage.close()
  })

  describe("node version pointer (rollback)", () => {
    it("tracks latest as current by default, and rolls back without a new version", () => {
      const { storage } = createTempStorage()
      storage.putNodeData("web-rendering", "pg001", { v: 1 })
      storage.putNodeData("web-rendering", "pg001", { v: 2 })
      const v3 = storage.putNodeData("web-rendering", "pg001", { v: 3 })
      expect(v3).toBe(3)
      // Current == latest by default
      expect(storage.getLatestNodeData("web-rendering", "pg001")?.data).toEqual({ v: 3 })
      expect(storage.getCurrentNodeVersion("web-rendering", "pg001")).toBe(3)

      // Roll back to v1 — no new version is created, current now reads v1
      expect(storage.setCurrentNodeVersion("web-rendering", "pg001", 1)).toBe(true)
      expect(storage.getCurrentNodeVersion("web-rendering", "pg001")).toBe(1)
      expect(storage.getLatestNodeData("web-rendering", "pg001")?.data).toEqual({ v: 1 })

      // A subsequent write appends v4 and becomes current
      const v4 = storage.putNodeData("web-rendering", "pg001", { v: 4 })
      expect(v4).toBe(4)
      expect(storage.getLatestNodeData("web-rendering", "pg001")?.data).toEqual({ v: 4 })
      storage.close()
    })

    it("rejects restoring a nonexistent version", () => {
      const { storage } = createTempStorage()
      storage.putNodeData("glossary", "book", { a: 1 })
      expect(storage.setCurrentNodeVersion("glossary", "book", 99)).toBe(false)
      expect(storage.getLatestNodeData("glossary", "book")?.data).toEqual({ a: 1 })
      storage.close()
    })

    it("reports the current (pointer) version in the fingerprint", () => {
      const { storage } = createTempStorage()
      storage.putNodeData("page-sectioning", "pg001", { s: 1 })
      storage.putNodeData("page-sectioning", "pg001", { s: 2 })
      storage.setCurrentNodeVersion("page-sectioning", "pg001", 1)
      const fp = storage
        .getNodeVersionFingerprint()
        .find((f) => f.node === "page-sectioning" && f.itemId === "pg001")
      expect(fp?.version).toBe(1)
      storage.close()
    })
  })
})
