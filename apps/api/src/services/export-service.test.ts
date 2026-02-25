import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { unzipSync } from "fflate"
import { exportBook } from "./export-service.js"

let tmpDir: string
let webAssetsDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-export-service-"))
  webAssetsDir = path.join(tmpDir, "assets-web")
  createWebAssets(webAssetsDir)
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

function createWebAssets(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "base.js"), 'window.__ADT_BUNDLE_TEST__ = "ok";\n')
  fs.writeFileSync(path.join(dir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(dir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"
  )
}

describe("exportBook", () => {
  it("produces a valid ZIP containing the db file", async () => {
    createTestDb("export-test")
    addPages("export-test", 1)

    const result = await exportBook("export-test", tmpDir, webAssetsDir)
    expect(result.zipBuffer).toBeInstanceOf(Uint8Array)
    expect(result.filename).toBe("export-test.zip")

    const files = unzipSync(result.zipBuffer)
    expect(files["export-test.db"]).toBeDefined()
  })

  it("includes PDF in the ZIP", async () => {
    createTestDb("with-pdf")
    addPages("with-pdf", 1)
    addPdf("with-pdf")

    const result = await exportBook("with-pdf", tmpDir, webAssetsDir)
    const files = unzipSync(result.zipBuffer)
    expect(files["with-pdf.pdf"]).toBeDefined()
    expect(Buffer.from(files["with-pdf.pdf"]).toString()).toContain("%PDF")
  })

  it("includes images directory", async () => {
    createTestDb("with-imgs")
    addPages("with-imgs", 1)
    addImageFile("with-imgs", "my-img")

    const result = await exportBook("with-imgs", tmpDir, webAssetsDir)
    const files = unzipSync(result.zipBuffer)
    expect(files["images/my-img.png"]).toBeDefined()
    expect(Buffer.from(files["images/my-img.png"]).toString()).toBe("fake-png-data")
  })

  it("includes config.yaml when present", async () => {
    createTestDb("with-config")
    addPages("with-config", 1)
    addConfigYaml("with-config")

    const result = await exportBook("with-config", tmpDir, webAssetsDir)
    const files = unzipSync(result.zipBuffer)
    expect(files["config.yaml"]).toBeDefined()
    const content = new TextDecoder().decode(files["config.yaml"])
    expect(content).toContain("concurrency: 4")
  })

  it("exports even when storyboard is not accepted", async () => {
    createTestDb("not-accepted")
    addPages("not-accepted", 1)

    const result = await exportBook("not-accepted", tmpDir, webAssetsDir)
    expect(result.zipBuffer).toBeInstanceOf(Uint8Array)
    expect(result.filename).toBe("not-accepted.zip")
  })

  it("throws for non-existent book", async () => {
    await expect(exportBook("ghost", tmpDir, webAssetsDir)).rejects.toThrow("not found")
  })

  it("throws when web assets directory is missing", async () => {
    createTestDb("missing-assets")
    addPages("missing-assets", 1)

    await expect(exportBook("missing-assets", tmpDir, path.join(tmpDir, "missing-assets-dir")))
      .rejects.toThrow("Web assets directory not found")
  })

  it("includes all book directory contents recursively", async () => {
    createTestDb("full-book")
    addPages("full-book", 2)
    addPdf("full-book")
    addImageFile("full-book", "img-a")
    addImageFile("full-book", "img-b")
    addConfigYaml("full-book")

    const result = await exportBook("full-book", tmpDir, webAssetsDir)
    const files = unzipSync(result.zipBuffer)
    const paths = Object.keys(files).sort()

    expect(paths).toContain("full-book.db")
    expect(paths).toContain("full-book.pdf")
    expect(paths).toContain("config.yaml")
    expect(paths).toContain("images/img-a.png")
    expect(paths).toContain("images/img-b.png")
  })
})
