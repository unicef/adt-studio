import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { unzipSync } from "fflate"
import { exportBook } from "./export-service.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-export-service-"))
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

function addPdf(label: string): void {
  fs.writeFileSync(
    path.join(tmpDir, label, `${label}.pdf`),
    Buffer.from("%PDF-1.0 fake content")
  )
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

function addConfigYaml(label: string): void {
  fs.writeFileSync(
    path.join(tmpDir, label, "config.yaml"),
    "concurrency: 4\n"
  )
}

describe("exportBook", () => {
  it("produces a valid ZIP containing the db file", () => {
    createTestDb("export-test")
    addPages("export-test", 1)
    addAcceptance("export-test")

    const result = exportBook("export-test", tmpDir)
    expect(result.zipBuffer).toBeInstanceOf(Uint8Array)
    expect(result.filename).toBe("export-test.zip")

    const files = unzipSync(result.zipBuffer)
    expect(files["export-test.db"]).toBeDefined()
  })

  it("includes PDF in the ZIP", () => {
    createTestDb("with-pdf")
    addPages("with-pdf", 1)
    addAcceptance("with-pdf")
    addPdf("with-pdf")

    const result = exportBook("with-pdf", tmpDir)
    const files = unzipSync(result.zipBuffer)
    expect(files["with-pdf.pdf"]).toBeDefined()
    expect(Buffer.from(files["with-pdf.pdf"]).toString()).toContain("%PDF")
  })

  it("includes images directory", () => {
    createTestDb("with-imgs")
    addPages("with-imgs", 1)
    addAcceptance("with-imgs")
    addImageFile("with-imgs", "my-img")

    const result = exportBook("with-imgs", tmpDir)
    const files = unzipSync(result.zipBuffer)
    expect(files["images/my-img.png"]).toBeDefined()
    expect(Buffer.from(files["images/my-img.png"]).toString()).toBe("fake-png-data")
  })

  it("includes config.yaml when present", () => {
    createTestDb("with-config")
    addPages("with-config", 1)
    addAcceptance("with-config")
    addConfigYaml("with-config")

    const result = exportBook("with-config", tmpDir)
    const files = unzipSync(result.zipBuffer)
    expect(files["config.yaml"]).toBeDefined()
    const content = new TextDecoder().decode(files["config.yaml"])
    expect(content).toContain("concurrency: 4")
  })

  it("throws when storyboard is not accepted", () => {
    createTestDb("not-accepted")
    addPages("not-accepted", 1)

    expect(() => exportBook("not-accepted", tmpDir)).toThrow(
      "Storyboard must be accepted"
    )
  })

  it("throws for non-existent book", () => {
    expect(() => exportBook("ghost", tmpDir)).toThrow("not found")
  })

  it("includes all book directory contents recursively", () => {
    createTestDb("full-book")
    addPages("full-book", 2)
    addAcceptance("full-book")
    addPdf("full-book")
    addImageFile("full-book", "img-a")
    addImageFile("full-book", "img-b")
    addConfigYaml("full-book")

    const result = exportBook("full-book", tmpDir)
    const files = unzipSync(result.zipBuffer)
    const paths = Object.keys(files).sort()

    expect(paths).toContain("full-book.db")
    expect(paths).toContain("full-book.pdf")
    expect(paths).toContain("config.yaml")
    expect(paths).toContain("images/img-a.png")
    expect(paths).toContain("images/img-b.png")
  })
})
