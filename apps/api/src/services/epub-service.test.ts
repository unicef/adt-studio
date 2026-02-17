import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { unzipSync } from "fflate"
import { exportBookEpub } from "./epub-service.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-epub-service-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestDb(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.close()
}

function addPages(label: string, count: number): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  for (let i = 1; i <= count; i++) {
    db.run(
      "INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)",
      [`pg${String(i).padStart(3, "0")}`, i, `Page ${i} text`]
    )
  }
  db.close()
}

function addAcceptance(label: string): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "storyboard-acceptance",
      "book",
      1,
      JSON.stringify({ acceptedAt: new Date().toISOString(), renderedPageCount: 1 }),
    ]
  )
  db.close()
}

function addMetadata(label: string): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "metadata",
      "book",
      1,
      JSON.stringify({
        title: "Test Book",
        authors: ["Author One"],
        publisher: "Test Publisher",
        language_code: "en",
        cover_page_number: null,
        reasoning: "test",
      }),
    ]
  )
  db.close()
}

function addRendering(label: string, pageId: string, html: string): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "web-rendering",
      pageId,
      1,
      JSON.stringify({
        sections: [{ html, sectionIndex: 0, sectionType: "content", reasoning: "" }],
      }),
    ]
  )
  db.close()
}

function addImageFile(label: string, imageId: string): void {
  const bookDir = path.join(tmpDir, label)
  const imagePath = path.join(bookDir, "images", `${imageId}.png`)
  fs.writeFileSync(imagePath, Buffer.from("fake-png-data"))

  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run(
    "INSERT INTO images (image_id, page_id, path, hash, width, height, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [imageId, "pg001", `images/${imageId}.png`, "hash123", 100, 100, "extract"]
  )
  db.close()
}

describe("exportBookEpub", () => {
  it("produces a valid EPUB ZIP with correct mimetype", async () => {
    createTestDb("epub-test")
    addPages("epub-test", 1)
    addAcceptance("epub-test")
    addMetadata("epub-test")
    addRendering("epub-test", "pg001", "<p>Hello world</p>")

    const result = await exportBookEpub("epub-test", tmpDir)
    expect(result.zipBuffer).toBeInstanceOf(Uint8Array)
    expect(result.filename).toBe("epub-test.epub")

    const files = unzipSync(result.zipBuffer)
    const mimetype = new TextDecoder().decode(files["mimetype"])
    expect(mimetype).toBe("application/epub+zip")
  })

  it("contains required EPUB3 structure", async () => {
    createTestDb("epub-struct")
    addPages("epub-struct", 1)
    addAcceptance("epub-struct")
    addMetadata("epub-struct")
    addRendering("epub-struct", "pg001", "<p>Content</p>")

    const result = await exportBookEpub("epub-struct", tmpDir)
    const files = unzipSync(result.zipBuffer)
    const paths = Object.keys(files)

    expect(paths).toContain("mimetype")
    expect(paths).toContain("META-INF/container.xml")
    expect(paths).toContain("OEBPS/content.opf")
    expect(paths).toContain("OEBPS/toc.xhtml")
    expect(paths).toContain("OEBPS/styles/book.css")
  })

  it("includes chapter XHTML files for rendered pages", async () => {
    createTestDb("epub-chapters")
    addPages("epub-chapters", 2)
    addAcceptance("epub-chapters")
    addMetadata("epub-chapters")
    addRendering("epub-chapters", "pg001", "<p>Chapter one</p>")
    addRendering("epub-chapters", "pg002", "<p>Chapter two</p>")

    const result = await exportBookEpub("epub-chapters", tmpDir)
    const files = unzipSync(result.zipBuffer)
    const paths = Object.keys(files)

    expect(paths).toContain("OEBPS/chapters/pg001.xhtml")
    expect(paths).toContain("OEBPS/chapters/pg002.xhtml")

    const ch1 = new TextDecoder().decode(files["OEBPS/chapters/pg001.xhtml"])
    expect(ch1).toContain("Chapter one")
    expect(ch1).toContain('xmlns="http://www.w3.org/1999/xhtml"')
  })

  it("includes referenced images in OEBPS/images/", async () => {
    createTestDb("epub-imgs")
    addPages("epub-imgs", 1)
    addAcceptance("epub-imgs")
    addMetadata("epub-imgs")
    addImageFile("epub-imgs", "my-img")
    addRendering(
      "epub-imgs",
      "pg001",
      '<p><img src="/api/books/epub-imgs/images/my-img" alt="test" /></p>'
    )

    const result = await exportBookEpub("epub-imgs", tmpDir)
    const files = unzipSync(result.zipBuffer)

    expect(files["OEBPS/images/my-img.png"]).toBeDefined()
    expect(Buffer.from(files["OEBPS/images/my-img.png"]).toString()).toBe("fake-png-data")
  })

  it("XHTML has no <script> tags", async () => {
    createTestDb("epub-noscript")
    addPages("epub-noscript", 1)
    addAcceptance("epub-noscript")
    addMetadata("epub-noscript")
    addRendering(
      "epub-noscript",
      "pg001",
      '<p>Text</p><script>alert("hi")</script>'
    )

    const result = await exportBookEpub("epub-noscript", tmpDir)
    const files = unzipSync(result.zipBuffer)
    const ch = new TextDecoder().decode(files["OEBPS/chapters/pg001.xhtml"])
    expect(ch).not.toContain("<script")
  })

  it("throws when storyboard not accepted", async () => {
    createTestDb("epub-noaccept")
    addPages("epub-noaccept", 1)

    await expect(exportBookEpub("epub-noaccept", tmpDir)).rejects.toThrow(
      "Storyboard must be accepted"
    )
  })

  it("throws for non-existent book", async () => {
    await expect(exportBookEpub("ghost", tmpDir)).rejects.toThrow("not found")
  })

  it("content.opf contains metadata", async () => {
    createTestDb("epub-meta")
    addPages("epub-meta", 1)
    addAcceptance("epub-meta")
    addMetadata("epub-meta")
    addRendering("epub-meta", "pg001", "<p>Text</p>")

    const result = await exportBookEpub("epub-meta", tmpDir)
    const files = unzipSync(result.zipBuffer)
    const opf = new TextDecoder().decode(files["OEBPS/content.opf"])

    expect(opf).toContain("<dc:title>Test Book</dc:title>")
    expect(opf).toContain("<dc:creator>Author One</dc:creator>")
    expect(opf).toContain("<dc:publisher>Test Publisher</dc:publisher>")
    expect(opf).toContain("<dc:language>en</dc:language>")
    expect(opf).toContain('version="3.0"')
  })

  it("toc.xhtml lists all chapters", async () => {
    createTestDb("epub-toc")
    addPages("epub-toc", 2)
    addAcceptance("epub-toc")
    addMetadata("epub-toc")
    addRendering("epub-toc", "pg001", "<p>One</p>")
    addRendering("epub-toc", "pg002", "<p>Two</p>")

    const result = await exportBookEpub("epub-toc", tmpDir)
    const files = unzipSync(result.zipBuffer)
    const toc = new TextDecoder().decode(files["OEBPS/toc.xhtml"])

    expect(toc).toContain("chapters/pg001.xhtml")
    expect(toc).toContain("chapters/pg002.xhtml")
    expect(toc).toContain('epub:type="toc"')
  })
})
