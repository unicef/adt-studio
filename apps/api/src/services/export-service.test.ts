import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb, createBookStorage, withBookWriter, writeSectioningLifecycle } from "@adt/storage"
import { unzipSync } from "fflate"
import { packageEpub } from "@adt/pipeline"
import { prepareExport, exportProject, exportAdt, exportScorm, exportWebpub, exportEpub, exportPnld } from "./export-service.js"

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

/** Collect a ReadableStream into a single Uint8Array. */
async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    totalLength += value.length
  }
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

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
  for (const file of ["base.bundle.min.js", "base.bundle.local.js", "activities.bundle.local.js"]) {
    fs.writeFileSync(path.join(dir, file), 'window.__ADT_BUNDLE_TEST__ = "ok";\n')
  }
  fs.writeFileSync(path.join(dir, "fonts.css"), "body { font-family: serif; }")
  fs.mkdirSync(path.join(dir, "libs/fontawesome/css"), { recursive: true })
  fs.writeFileSync(path.join(dir, "libs/fontawesome/css/all.min.css"), "/* test icons */")
  fs.writeFileSync(
    path.join(dir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"
  )
}

describe("exportProject", () => {
  it("allows usable output export after a generation preference change and preserves project backup", async () => {
    createTestDb("stale-export")
    addPagesAndRenderings("stale-export", 1)
    const dir = path.join(tmpDir, "stale-export")
    fs.mkdirSync(path.join(dir, "adt"))
    fs.writeFileSync(path.join(dir, "adt", "retained.txt"), "saved package")
    writeSectioningLifecycle(dir, "dynamic", false)
    await expect(prepareExport("stale-export", "webpub", tmpDir, webAssetsDir)).resolves.toEqual({ warnings: [] })
    await expect(prepareExport("stale-export", "project", tmpDir, "")).resolves.toEqual({ warnings: [] })
    const archive = await exportProject("stale-export", tmpDir)
    expect(unzipSync(await streamToBuffer(archive.stream))[".sectioning-lifecycle.json"]).toBeDefined()
  })
  it("rejects a busy book before returning a ZIP stream", async () => {
    createTestDb("busy-export")
    let release!: () => void
    const held = withBookWriter(path.join(tmpDir, "busy-export"), () => new Promise<void>((resolve) => { release = resolve }))
    try {
      await expect(exportProject("busy-export", tmpDir)).rejects.toMatchObject({ code: "BOOK_BUSY" })
    } finally { release(); await held }
  })
  it.each([false, true])("retains writer admission while a large archive is read (cancelled: %s)", async (cancelled) => {
    const label = "export-admission"
    createTestDb(label)
    const bookDir = path.join(tmpDir, label)
    for (let n = 0; n < 120; n++) fs.writeFileSync(path.join(bookDir, `fixture-${n}.txt`), "saved content")
    const { stream } = await exportProject(label, tmpDir)
    expect(() => withBookWriter(bookDir, () => {})).toThrow(/active writer/)
    if (cancelled) await stream.cancel()
    else await streamToBuffer(stream)
    await vi.waitFor(() => expect(fs.existsSync(path.join(bookDir, ".book-writer.json"))).toBe(false))
    expect(() => withBookWriter(bookDir, () => {})).not.toThrow()
  })

  it("preserves lifecycle provenance without exporting live process ownership", async () => {
    const label = "portable-lifecycle"
    createTestDb(label)
    const bookDir = path.join(tmpDir, label)
    writeSectioningLifecycle(bookDir, "page", false)
    await withBookWriter(bookDir, async () => {
      const result = await exportProject(label, tmpDir)
      const files = unzipSync(await streamToBuffer(result.stream))
      expect(files[".book-writer.json"]).toBeUndefined()
      expect(files[".book-writer.json.recovery"]).toBeUndefined()
      expect(JSON.parse(new TextDecoder().decode(files[".sectioning-lifecycle.json"])))
        .toEqual({ version: 1, mode: "page", sectioningReady: false, storyboardPending: true })
    })
  })

  it("produces a valid ZIP containing the db file", async () => {
    createTestDb("export-test")
    addPages("export-test", 1)

    const result = await exportProject("export-test", tmpDir)
    expect(result.stream).toBeInstanceOf(ReadableStream)
    expect(result.filename).toBe("export-test-project.zip")

    const zipBuffer = await streamToBuffer(result.stream)
    const files = unzipSync(zipBuffer)
    expect(files["export-test.db"]).toBeDefined()
  })

  it("includes PDF in the ZIP", async () => {
    createTestDb("with-pdf")
    addPages("with-pdf", 1)
    addPdf("with-pdf")

    const result = await exportProject("with-pdf", tmpDir)
    const zipBuffer = await streamToBuffer(result.stream)
    const files = unzipSync(zipBuffer)
    expect(files["with-pdf.pdf"]).toBeDefined()
    expect(Buffer.from(files["with-pdf.pdf"]).toString()).toContain("%PDF")
  })

  it("includes images directory", async () => {
    createTestDb("with-imgs")
    addPages("with-imgs", 1)
    addImageFile("with-imgs", "my-img")

    const result = await exportProject("with-imgs", tmpDir)
    const zipBuffer = await streamToBuffer(result.stream)
    const files = unzipSync(zipBuffer)
    expect(files["images/my-img.png"]).toBeDefined()
    expect(Buffer.from(files["images/my-img.png"]).toString()).toBe("fake-png-data")
  })

  it("includes config.yaml when present", async () => {
    createTestDb("with-config")
    addPages("with-config", 1)
    addConfigYaml("with-config")

    const result = await exportProject("with-config", tmpDir)
    const zipBuffer = await streamToBuffer(result.stream)
    const files = unzipSync(zipBuffer)
    expect(files["config.yaml"]).toBeDefined()
    const content = new TextDecoder().decode(files["config.yaml"])
    expect(content).toContain("concurrency: 4")
  })

  it("exports even when storyboard is not accepted", async () => {
    createTestDb("not-accepted")
    addPages("not-accepted", 1)

    const result = await exportProject("not-accepted", tmpDir)
    expect(result.stream).toBeInstanceOf(ReadableStream)
    expect(result.filename).toBe("not-accepted-project.zip")
  })

  it("names a processed part archive with the part convention", async () => {
    // An imported part carries part.json in the book dir; the returned project
    // archive should be named like the coordinator's handout plus "-processed".
    createTestDb("my-book-p051-100")
    addPages("my-book-p051-100", 1)
    fs.writeFileSync(
      path.join(tmpDir, "my-book-p051-100", "part.json"),
      JSON.stringify({
        adtPart: 1,
        sourceLabel: "my-book",
        title: null,
        range: { startPage: 51, endPage: 100 },
        pageCount: 200,
        fingerprint: {},
        identityHash: "id",
        semanticsHash: "sem",
        createdAt: "2026-01-01T00:00:00.000Z",
        partLabelSuggestion: "my-book-p051-100",
      })
    )

    const result = await exportProject("my-book-p051-100", tmpDir)
    // No metadata title → display name falls back to the label.
    expect(result.filename).toBe("my-book-p051-100-part-51-100-processed.zip")
    expect(result.safeFilename).toBe("my-book-p051-100-processed.zip")
  })

  it("throws for non-existent book", async () => {
    await expect(exportProject("ghost", tmpDir)).rejects.toThrow("not found")
  })

  it("does not require generated web assets to preserve a project archive", async () => {
    createTestDb("missing-assets")
    addPages("missing-assets", 1)

    await expect(prepareExport("missing-assets", "project", tmpDir, path.join(tmpDir, "missing-assets-dir"), undefined, undefined))
      .resolves.toEqual({ warnings: [] })
    expect(fs.existsSync(path.join(tmpDir, "missing-assets", "adt"))).toBe(false)
  })

  it("includes all book directory contents recursively", async () => {
    createTestDb("full-book")
    addPages("full-book", 2)
    addPdf("full-book")
    addImageFile("full-book", "img-a")
    addImageFile("full-book", "img-b")
    addConfigYaml("full-book")
    const styleguidesDir = path.join(tmpDir, "full-book", "styleguides")
    fs.mkdirSync(styleguidesDir, { recursive: true })
    fs.writeFileSync(
      path.join(styleguidesDir, "full-book-generated.md"),
      "# Generated style guide",
    )

    const result = await exportProject("full-book", tmpDir)
    const zipBuffer = await streamToBuffer(result.stream)
    const files = unzipSync(zipBuffer)
    const paths = Object.keys(files).sort()

    expect(paths).toContain("full-book.db")
    expect(paths).toContain("full-book.pdf")
    expect(paths).toContain("config.yaml")
    expect(paths).toContain("images/img-a.png")
    expect(paths).toContain("images/img-b.png")
    expect(paths).toContain("styleguides/full-book-generated.md")
  })
})

function createBookWithMetadata(label: string, title: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "metadata",
      "book",
      1,
      JSON.stringify({
        title,
        authors: ["Author"],
        publisher: null,
        language_code: "en",
        cover_page_number: 1,
        reasoning: "test",
      }),
    ]
  )
  db.close()
}

function addPagesAndRenderings(label: string, count: number): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (let i = 1; i <= count; i++) {
      const pageId = `${label}_p${i}`
      const sectionId = `${pageId}_sec001`
      storage.putExtractedPage({
        pageId,
        pageNumber: i,
        text: `Page ${i}`,
        pageImage: {
          imageId: `${pageId}_page`,
          buffer: Buffer.from("fake-png"),
          format: "png",
          hash: `hash${i}`,
          width: 800,
          height: 600,
        },
        images: [],
      })
      storage.putNodeData("page-sectioning", pageId, {
        reasoning: "ok",
        sections: [
          {
            sectionId,
            sectionType: "content",
            nodes: [],
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: i,
            isPruned: false,
          },
        ],
      })
      storage.putNodeData("web-rendering", pageId, {
        sections: [
          {
            sectionId,
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<p>Rendered page ${i}</p>`,
          },
        ],
      })
    }
  } finally {
    storage.close()
  }
}

it.each(["adt", "scorm", "webpub", "epub", "pnld"] as const)("exports saved harmless inline CSS through %s without rewriting history or accepting a missing resource", async format => {
  const label = "saved-inline-css"
  createBookWithMetadata(label, "Readable styling")
  addPagesAndRenderings(label, 3)
  const styles = ["color red", "font-family: 'Open Sans", "color:red; }"]
  const s = createBookStorage(label, tmpDir)
  let before: unknown
  try {
    for (let i = 0; i < styles.length; i++) {
      const id = `${label}_p${i + 1}`
      const row = s.getLatestNodeData("web-rendering", id)!.data as { sections: { html: string }[] }
      row.sections[0].html += `<p style="${styles[i]}">Saved styling</p>`
      s.putNodeData("web-rendering", id, row)
    }
    before = s.getPages().map(page => s.getAllNodeVersions("web-rendering", page.pageId))
  } finally { s.close() }
  const image = path.join(tmpDir, label, `images/${label}_p1_page.png`)
  const imageBytes = fs.readFileSync(image)
  await prepareExport(label, format, tmpDir, webAssetsDir)
  const download = { adt: exportAdt, scorm: exportScorm, webpub: exportWebpub, epub: exportEpub, pnld: exportPnld }[format]
  const members = unzipSync(await streamToBuffer((await download(label, tmpDir)).stream))
  expect(Object.keys(members).length).toBeGreaterThan(0)
  const after = createBookStorage(label, tmpDir)
  try {
    expect(after.getPages().map(page => after.getAllNodeVersions("web-rendering", page.pageId))).toEqual(before)
    const row = after.getLatestNodeData("web-rendering", `${label}_p1`)!.data as { sections: { html: string }[] }
    row.sections[0].html += '<img src="images/required-but-missing.png">'
    after.putNodeData("web-rendering", `${label}_p1`, row)
  } finally { after.close() }
  await expect(prepareExport(label, format, tmpDir, webAssetsDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
  // Failure-atomic preparation retains the preceding downloadable artifact.
  expect(unzipSync(await streamToBuffer((await download(label, tmpDir)).stream))).toEqual(members)
  expect(fs.readFileSync(image)).toEqual(imageBytes)
}, 30_000)

describe("exportWebpub", () => {
  it("produces a valid ZIP of the webpub directory", async () => {
    createBookWithMetadata("webpub-test", "Test Book")
    addPagesAndRenderings("webpub-test", 1)

    await prepareExport("webpub-test", "webpub", tmpDir, webAssetsDir)
    const result = await exportWebpub("webpub-test", tmpDir)
    expect(result.stream).toBeInstanceOf(ReadableStream)
    expect(result.filename).toBe("Test Book.webpub")
    expect(result.safeFilename).toBe("webpub-test.webpub")

    const zipBuffer = await streamToBuffer(result.stream)
    const files = unzipSync(zipBuffer)
    expect(files["manifest.json"]).toBeDefined()
  })

  it("returns safeFilename for non-ASCII titles", async () => {
    createBookWithMetadata("sinhala-book", "\u0DC3\u0DD2\u0D82\u0DC4\u0DBD \u0DB4\u0DD9\u0DA7")
    addPagesAndRenderings("sinhala-book", 1)

    await prepareExport("sinhala-book", "webpub", tmpDir, webAssetsDir)
    const result = await exportWebpub("sinhala-book", tmpDir)
    expect(result.filename).toBe("\u0DC3\u0DD2\u0D82\u0DC4\u0DBD \u0DB4\u0DD9\u0DA7.webpub")
    expect(result.safeFilename).toBe("sinhala-book.webpub")
  })

  it("falls back to label when metadata has no title", async () => {
    createTestDb("no-title")
    addPagesAndRenderings("no-title", 1)

    await prepareExport("no-title", "webpub", tmpDir, webAssetsDir)
    const result = await exportWebpub("no-title", tmpDir)
    expect(result.filename).toBe("no-title.webpub")
    expect(result.safeFilename).toBe("no-title.webpub")
  })

  it("disables navigation controls and tutorial in webpub config", async () => {
    createBookWithMetadata("webpub-config", "Config Test")
    addPagesAndRenderings("webpub-config", 1)

    await prepareExport("webpub-config", "webpub", tmpDir, webAssetsDir)

    const configPath = path.join(tmpDir, "webpub-config", "webpub", "assets", "config.json")
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    expect(config.features.showNavigationControls).toBe(false)
    expect(config.features.showTutorial).toBe(false)
  })

  it("injects webpub CSS overrides into HTML pages", async () => {
    createBookWithMetadata("webpub-css", "CSS Test")
    addPagesAndRenderings("webpub-css", 1)

    await prepareExport("webpub-css", "webpub", tmpDir, webAssetsDir)

    const indexPath = path.join(tmpDir, "webpub-css", "webpub", "index.html")
    const html = fs.readFileSync(indexPath, "utf-8")
    expect(html).toContain("WebPub / EPUB reader overrides")
    expect(html).toContain("columns: auto !important")
  })

  it("includes readingOrder in manifest", async () => {
    createBookWithMetadata("webpub-manifest", "Manifest Test")
    addPagesAndRenderings("webpub-manifest", 2)

    await prepareExport("webpub-manifest", "webpub", tmpDir, webAssetsDir)

    const manifestPath = path.join(tmpDir, "webpub-manifest", "webpub", "manifest.json")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
    expect(manifest.metadata.title).toBe("Manifest Test")
    expect(manifest.metadata.presentation.overflow).toBe("scrolled")
    expect(manifest.metadata.presentation.spread).toBe("none")
    expect(manifest.readingOrder.length).toBeGreaterThan(0)
    expect(manifest.readingOrder[0].type).toBe("text/html")
  })

  it("throws for non-existent book", async () => {
    await expect(exportWebpub("ghost", tmpDir)).rejects.toThrow("not found")
  })

  it("throws when web assets directory is missing (prepareExport)", async () => {
    createBookWithMetadata("missing-assets", "Missing")
    addPagesAndRenderings("missing-assets", 1)

    await expect(prepareExport("missing-assets", "webpub", tmpDir, path.join(tmpDir, "no-assets")))
      .rejects.toThrow("Web assets directory not found")
  })
})

describe("exportEpub", () => {
  it("produces a valid EPUB ZIP with required structure", async () => {
    createBookWithMetadata("epub-test", "Test Book")
    addPagesAndRenderings("epub-test", 2)

    await prepareExport("epub-test", "epub", tmpDir, webAssetsDir)
    const result = await exportEpub("epub-test", tmpDir)
    expect(result.filename).toBe("Test Book.epub")
    expect(result.safeFilename).toBe("epub-test.epub")

    const buf = await streamToBuffer(result.stream)
    const files = unzipSync(buf)
    expect(files["mimetype"]).toBeDefined()
    expect(new TextDecoder().decode(files["mimetype"])).toBe("application/epub+zip")
    expect(files["META-INF/container.xml"]).toBeDefined()
    expect(files["OEBPS/content.opf"]).toBeDefined()
    expect(files["OEBPS/toc.xhtml"]).toBeDefined()
    expect(files["OEBPS/toc.ncx"]).toBeDefined()
  })

  it("includes content pages as HTML files from ADT package", async () => {
    createBookWithMetadata("epub-pages", "Pages Book")
    addPagesAndRenderings("epub-pages", 2)

    await prepareExport("epub-pages", "epub", tmpDir, webAssetsDir)
    const result = await exportEpub("epub-pages", tmpDir)
    const buf = await streamToBuffer(result.stream)
    const files = unzipSync(buf)

    // Should have content pages in OEBPS/ (copied from adt/)
    const htmlFiles = Object.keys(files).filter(f =>
      f.startsWith("OEBPS/") && (f.endsWith(".html") || f.endsWith(".xhtml")) &&
      !f.includes("toc.") && !f.includes("content/")
    )
    expect(htmlFiles.length).toBeGreaterThanOrEqual(2)

    // Content should be proper HTML documents
    const content = new TextDecoder().decode(files[htmlFiles[0]])
    expect(content).toContain("<!DOCTYPE html>")
  })

  it("includes content pages in OPF manifest and spine", async () => {
    createBookWithMetadata("epub-opf", "OPF Test")
    addPagesAndRenderings("epub-opf", 2)

    await prepareExport("epub-opf", "epub", tmpDir, webAssetsDir)
    const result = await exportEpub("epub-opf", tmpDir)
    const buf = await streamToBuffer(result.stream)
    const files = unzipSync(buf)
    const opf = new TextDecoder().decode(files["OEBPS/content.opf"])

    expect(opf).toContain('version="3.0"')
    expect(opf).toContain("<dc:title>OPF Test</dc:title>")
    expect(opf).toContain("<dc:language>en</dc:language>")
    expect(opf).toContain("<dc:creator>Author</dc:creator>")
    // Spine entries
    expect(opf).toContain("itemref idref=")
  })

  it("falls back to label when metadata has no title", async () => {
    createTestDb("epub-no-title")
    addPagesAndRenderings("epub-no-title", 1)

    await prepareExport("epub-no-title", "epub", tmpDir, webAssetsDir)
    const result = await exportEpub("epub-no-title", tmpDir)
    expect(result.filename).toBe("epub-no-title.epub")
    expect(result.safeFilename).toBe("epub-no-title.epub")
  })

  it("throws for non-existent book", async () => {
    await expect(exportEpub("ghost", tmpDir)).rejects.toThrow("not found")
  })

  it("reflowable EPUB does not include rendition:layout metadata", async () => {
    createBookWithMetadata("epub-reflow", "Reflowable Book")
    addPagesAndRenderings("epub-reflow", 1)

    await prepareExport("epub-reflow", "epub", tmpDir, webAssetsDir)
    const result = await exportEpub("epub-reflow", tmpDir)
    const buf = await streamToBuffer(result.stream)
    const files = unzipSync(buf)
    const opf = new TextDecoder().decode(files["OEBPS/content.opf"])

    expect(opf).not.toContain("rendition:layout")
    expect(opf).not.toContain("pre-paginated")
  })
})

describe("exportPnld", () => {
  it("produces a PNLD ZIP with the mandated root structure", async () => {
    createBookWithMetadata("pnld-test", "PNLD Book")
    addPagesAndRenderings("pnld-test", 2)

    await prepareExport("pnld-test", "pnld", tmpDir, webAssetsDir)
    const result = await exportPnld("pnld-test", tmpDir)
    expect(result.filename).toBe("PNLD Book.zip")
    expect(result.safeFilename).toBe("pnld-test-pnld.zip")

    const buf = await streamToBuffer(result.stream)
    const files = unzipSync(buf)
    // Root structural files (no OCF mimetype / META-INF).
    expect(files["content.opf"]).toBeDefined()
    expect(files["toc.ncx"]).toBeDefined()
    expect(files["index.html"]).toBeDefined()
    expect(files["mimetype"]).toBeUndefined()
    // Content pages live under content/, nothing at the root.
    const rootHtml = Object.keys(files).filter(
      (f) => f.endsWith(".html") && !f.includes("/"),
    )
    expect(rootHtml).toEqual(["index.html"])
    const contentPages = Object.keys(files).filter(
      (f) => f.startsWith("content/") && f.endsWith(".html"),
    )
    expect(contentPages.length).toBeGreaterThanOrEqual(2)
  })

  it("places assets under resources/ and rewrites references", async () => {
    createBookWithMetadata("pnld-res", "Resources Book")
    addPagesAndRenderings("pnld-res", 2)

    await prepareExport("pnld-res", "pnld", tmpDir, webAssetsDir)
    const result = await exportPnld("pnld-res", tmpDir)
    const files = unzipSync(await streamToBuffer(result.stream))

    const hasResources = Object.keys(files).some((f) => f.startsWith("resources/"))
    expect(hasResources).toBe(true)

    const page = Object.keys(files).find((f) => f.startsWith("content/") && f.endsWith(".html"))!
    const html = new TextDecoder().decode(files[page])
    // Content-relative asset references point back up into resources/.
    expect(html).toContain("../resources/styles/")
    expect(html).toContain(`<meta name="robots" content="noindex, nofollow"`)
    // No external references (self-contained requirement).
    expect(html).not.toContain("fonts.googleapis.com")
  })

  it("writes an OPF with required metadata and accessibility features", async () => {
    createBookWithMetadata("pnld-opf", "OPF PNLD")
    addPagesAndRenderings("pnld-opf", 2)

    await prepareExport("pnld-opf", "pnld", tmpDir, webAssetsDir)
    const result = await exportPnld("pnld-opf", tmpDir)
    const files = unzipSync(await streamToBuffer(result.stream))
    const opf = new TextDecoder().decode(files["content.opf"])

    expect(opf).toContain('version="3.0"')
    expect(opf).toContain("<dc:title>OPF PNLD</dc:title>")
    expect(opf).toContain("<dc:publisher>")
    expect(opf).toContain('<meta property="schema:accessibilityFeature">structuralNavigation</meta>')
    expect(opf).toContain('<meta property="schema:accessibilityAPI">ARIA</meta>')
    expect(opf).toContain('<item id="nav" href="index.html"')
    expect(opf).toContain("itemref idref=")

    const index = new TextDecoder().decode(files["index.html"])
    expect(index).toContain('<nav role="doc-toc" id="toc"')
  })

  it("throws for non-existent book", async () => {
    await expect(exportPnld("ghost", tmpDir)).rejects.toThrow("not found")
  })
})

describe("exportEpub — fixed-layout", () => {
  function createFixedLayoutBook(label: string, title: string): void {
    const bookDir = path.join(tmpDir, label)
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
    const db = openBookDb(path.join(bookDir, `${label}.db`))
    db.run(
      "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
      [
        "metadata",
        "book",
        1,
        JSON.stringify({
          title,
          authors: ["Illustrator"],
          publisher: null,
          language_code: "en",
          cover_page_number: 1,
          reasoning: "test",
        }),
      ]
    )
    db.close()

    // Write config.yaml registering a fixed_layout render strategy as the
    // default (this is what triggers fixed-layout output).
    fs.writeFileSync(
      path.join(bookDir, "config.yaml"),
      "default_render_strategy: fixed_layout\nrender_strategies:\n  fixed_layout:\n    render_type: fixed_layout\n"
    )
  }

  function addFixedLayoutPages(label: string, count: number): void {
    const storage = createBookStorage(label, tmpDir)
    try {
      for (let i = 1; i <= count; i++) {
        const pageId = `${label}_p${i}`
        const sectionId = `${pageId}_sec001`
        storage.putExtractedPage({
          pageId,
          pageNumber: i,
          text: `Page ${i} text`,
          pageImage: {
            imageId: `${pageId}_page`,
            buffer: Buffer.from("fake-png"),
            format: "png",
            hash: `hash${i}`,
            width: 800,
            height: 600,
          },
          images: [],
        })

        // Positioned text output (sub-product of the extract step)
        storage.putNodeData("positioned-text", pageId, {
          paragraphs: [
            {
              top: 100,
              left: 144,
              lineHeight: 96,
              html: '<span style="font-family:Palatino,serif;font-size:48.0pt;color:#000000">Hello World</span>',
            },
          ],
          pageWidth: 400,
          pageHeight: 300,
          renderWidth: 800,
          renderHeight: 600,
        })

        // Fixed-layout sectioning (one section per page) — tree shape with
        // a sidecar `placement` map for the PDF coordinates.
        storage.putNodeData("page-sectioning", pageId, {
          reasoning: "Fixed-layout mode",
          sections: [
            {
              sectionId,
              sectionType: "fixed-layout-page",
              nodes: [
                { nodeId: `${pageId}_page`, role: "image", isPruned: false },
              ],
              placement: {
                [`${pageId}_page`]: {
                  bounds: { x: 0, y: 0, width: 400, height: 300 },
                },
              },
              viewport: { width: 400, height: 300 },
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: i,
              isPruned: false,
            },
          ],
        })

        // Fixed-layout rendered HTML (page image + positioned text overlay)
        storage.putNodeData("web-rendering", pageId, {
          sections: [
            {
              sectionId,
            sectionIndex: 0,
              sectionType: "fixed-layout-page",
              reasoning: "Fixed-layout",
              html: `<div id="content" style="position:relative;width:400px;height:300px;margin:0 auto;overflow:hidden">
  <img src="/api/books/${label}/images/${pageId}_page" alt="" data-id="${pageId}_page" style="position:absolute;top:0;left:0;width:100%;height:100%"/>
  <div class="text-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%">
    <p data-id="${pageId}_p000" style="position:absolute;top:50px;left:72px;line-height:48px"><span style="font-family:Palatino,serif;font-size:48px;color:#000000">Hello World</span></p>
  </div>
</div>`,
            },
          ],
        })
      }
    } finally {
      storage.close()
    }
  }

  it("produces EPUB with pre-paginated rendition metadata", async () => {
    createFixedLayoutBook("fl-epub", "Storybook")
    addFixedLayoutPages("fl-epub", 2)

    await prepareExport("fl-epub", "epub", tmpDir, webAssetsDir)
    const result = await exportEpub("fl-epub", tmpDir)
    const buf = await streamToBuffer(result.stream)
    const files = unzipSync(buf)
    const opf = new TextDecoder().decode(files["OEBPS/content.opf"])

    expect(opf).toContain("rendition:layout")
    expect(opf).toContain("pre-paginated")
    expect(opf).toContain("rendition:spread")
    expect(opf).toContain("none")
  })

  it("content pages have fixed viewport meta", async () => {
    createFixedLayoutBook("fl-viewport", "Viewport Book")
    addFixedLayoutPages("fl-viewport", 1)

    await prepareExport("fl-viewport", "epub", tmpDir, webAssetsDir)
    const result = await exportEpub("fl-viewport", tmpDir)
    const buf = await streamToBuffer(result.stream)
    const files = unzipSync(buf)

    const htmlFiles = Object.keys(files).filter(f =>
      f.startsWith("OEBPS/") && (f.endsWith(".html") || f.endsWith(".xhtml")) &&
      !f.includes("toc.") && !f.includes("content/")
    )
    expect(htmlFiles.length).toBeGreaterThanOrEqual(1)

    const html = new TextDecoder().decode(files[htmlFiles[0]])
    // Fixed-layout pages have viewport matching page dimensions (1x)
    expect(html).toContain("width=400")
    expect(html).toContain("height=300")
    expect(html).not.toContain("device-width")
  })

  it("content pages contain positioned text with data-id attributes", async () => {
    createFixedLayoutBook("fl-text", "Text Overlay Book")
    addFixedLayoutPages("fl-text", 1)

    await prepareExport("fl-text", "epub", tmpDir, webAssetsDir)
    const result = await exportEpub("fl-text", tmpDir)
    const buf = await streamToBuffer(result.stream)
    const files = unzipSync(buf)

    const htmlFiles = Object.keys(files).filter(f =>
      f.startsWith("OEBPS/") && (f.endsWith(".html") || f.endsWith(".xhtml")) &&
      !f.includes("toc.") && !f.includes("content/")
    )
    const html = new TextDecoder().decode(files[htmlFiles[0]])

    // Should contain positioned text spans with data-id for TTS/accessibility
    expect(html).toContain("data-id=")
    expect(html).toContain("Hello")
    expect(html).toContain("World")
    // Page image should be present
    expect(html).toContain("_page")
  })
})


it.each(["adt", "scorm", "webpub", "epub", "pnld"] as const)("keeps origin receipts internal to %s and preserves project reopen", async format => {
  const label = "internal-receipt"
  createBookWithMetadata(label, label); addPagesAndRenderings(label, 2); addPdf(label)
  await prepareExport(label, format, tmpDir, webAssetsDir)
  const download = { adt: exportAdt, scorm: exportScorm, webpub: exportWebpub, epub: exportEpub, pnld: exportPnld }[format]
  const directory = format === "adt" || format === "scorm" ? "adt" : format
  const relative = format === "epub" ? "OEBPS/.build-owners" : format === "pnld" ? "resources/data/.build-owners" : ".build-owners"
  const receiptFile = path.join(tmpDir, label, directory, relative), receipt = fs.readFileSync(receiptFile)
  const files = unzipSync(await streamToBuffer((await download(label, tmpDir)).stream))
  expect.soft(Object.keys(files).some(file => path.basename(file) === ".build-owners")).toBe(false)
  for (const [file, bytes] of Object.entries(files)) {
    if (!["manifest.json", "content.opf", "imsmanifest.xml"].includes(path.basename(file))) continue
    const text = new TextDecoder().decode(bytes)
    expect.soft(text).not.toContain(".build-owners")
    const hrefs: string[] = file.endsWith("manifest.json")
      ? [...JSON.parse(text).readingOrder, ...JSON.parse(text).resources].map(entry => entry.href)
      : [...text.matchAll(/href="([^"]+)"/g)].map(match => match[1])
    for (const href of hrefs) if (!/^(?:[a-z]+:|\/\/|#)/i.test(href)) expect(files[path.posix.join(path.posix.dirname(file), decodeURIComponent(href.split("#")[0]))], `${file}: ${href}`).toBeDefined()
  }
  expect(fs.readFileSync(receiptFile)).toEqual(receipt)
  if (format === "webpub" || format === "epub" || format === "pnld" || format === "scorm") {
    const manifestFile = path.join(tmpDir, label, directory, format === "webpub" ? "manifest.json" : format === "epub" ? "OEBPS/content.opf" : format === "pnld" ? "content.opf" : "imsmanifest.xml")
    const original = fs.readFileSync(manifestFile, "utf8")
    const declaredReceipt = format === "pnld" ? "resources/data/.build-owners" : ".build-owners"
    const legacy = format === "webpub"
      ? JSON.stringify({ ...JSON.parse(original), resources: [...JSON.parse(original).resources, { href: declaredReceipt, type: "application/octet-stream" }] })
      : format === "scorm" ? original.replace("</resource>", `<file href="${declaredReceipt}"/></resource>`)
      : original.replace("</manifest>", `<item id="internal-proof" href="${declaredReceipt}" media-type="application/octet-stream"/></manifest>`)
    fs.writeFileSync(manifestFile, legacy)
    await expect(download(label, tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect(fs.readFileSync(manifestFile, "utf8")).toBe(legacy)
    await prepareExport(label, format, tmpDir, webAssetsDir)
    expect(fs.readFileSync(manifestFile, "utf8")).not.toContain(".build-owners")
    await streamToBuffer((await download(label, tmpDir)).stream)
  }
  const project = unzipSync(await streamToBuffer((await exportProject(label, tmpDir)).stream))
  // Project policy is unchanged: generated EPUB/PNLD directories were already
  // preserved, and must not lose their internal proof due to reader filtering.
  if (format === "epub" || format === "pnld") expect(Buffer.from(project[`${format}/${relative}`])).toEqual(receipt)
  const reopenedRoot = path.join(tmpDir, "reopened"), reopenedDir = path.join(reopenedRoot, label)
  for (const [name, bytes] of Object.entries(project)) {
    const file = path.join(reopenedDir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes)
  }
  const reopened = createBookStorage(label, reopenedRoot)
  try {
    expect(reopened.getBookIdentity()).toBe(JSON.parse(receipt.toString()).bookId)
    expect(reopened.getPages()).toHaveLength(2)
    expect(reopened.getAllNodeVersions("web-rendering", label + "_p1")).toHaveLength(1)
  } finally { reopened.close() }
})

it.each(["webpub", "epub", "pnld"] as const)("binds real %s exports to their originating book and keeps relocated copies usable", async format => {
  for (const label of ["owned-a", "foreign-b"]) {
    createBookWithMetadata(label, label)
    addPagesAndRenderings(label, 1)
    await prepareExport(label, format, tmpDir, webAssetsDir)
  }
  const download = { webpub: exportWebpub, epub: exportEpub, pnld: exportPnld }[format]
  const a = path.join(tmpDir, "owned-a"), b = path.join(tmpDir, "foreign-b")
  fs.cpSync(a, path.join(tmpDir, "relocated"), { recursive: true })
  fs.renameSync(path.join(tmpDir, "relocated/owned-a.db"), path.join(tmpDir, "relocated/relocated.db"))
  expect((await streamToBuffer((await download("relocated", tmpDir)).stream)).length).toBeGreaterThan(0)
  fs.rmSync(path.join(a, format), { recursive: true })
  fs.cpSync(path.join(b, format), path.join(a, format), { recursive: true })
  const receiptPath = format === "epub" ? "OEBPS/.build-owners" : format === "pnld" ? "resources/data/.build-owners" : ".build-owners"
  const before = fs.readFileSync(path.join(a, format, receiptPath))
  await expect(download("owned-a", tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
  expect(fs.readFileSync(path.join(a, format, receiptPath))).toEqual(before)
  await prepareExport("owned-a", format, tmpDir, webAssetsDir)
  expect((await streamToBuffer((await download("owned-a", tmpDir)).stream)).length).toBeGreaterThan(0)
})

it.each(["webpub", "epub", "pnld"] as const)("refuses retained %s pages after their explicit owner changes", async format => {
  const label = "changed-owner"
  createBookWithMetadata(label, label)
  addPagesAndRenderings(label, 2)
  await prepareExport(label, format, tmpDir, webAssetsDir)
  const download = { webpub: exportWebpub, epub: exportEpub, pnld: exportPnld }[format]
  expect((await streamToBuffer((await download(label, tmpDir)).stream)).length).toBeGreaterThan(0)
  const directory = path.join(tmpDir, label)
  const receiptPath = path.join(directory, format, format === "epub" ? "OEBPS/.build-owners" : format === "pnld" ? "resources/data/.build-owners" : ".build-owners")
  const receipt = fs.readFileSync(receiptPath)
  // Contradictory imported state: the same section ID now names another page.
  // This must not authorize an intact artifact from its retired owner.
  const db = openBookDb(path.join(directory, label + ".db"))
  try {
    const source = (id: string) => JSON.parse((db.get("SELECT data FROM node_data WHERE node='page-sectioning' AND item_id=?", [id]) as { data: string }).data)
    const one = source(label + "_p1"), two = source(label + "_p2")
    const rendering = JSON.parse((db.get("SELECT data FROM node_data WHERE node='web-rendering' AND item_id=?", [label + "_p2"]) as { data: string }).data)
    db.run("UPDATE node_data SET data=? WHERE node='page-sectioning' AND item_id=?", [JSON.stringify({ ...one, sections: [] }), label + "_p1"])
    db.run("UPDATE node_data SET data=? WHERE node='page-sectioning' AND item_id=?", [JSON.stringify({ ...two, sections: [...two.sections, { ...one.sections[0], pageNumber: 2 }] }), label + "_p2"])
    db.run("UPDATE node_data SET data=? WHERE node='web-rendering' AND item_id=?", [JSON.stringify({ sections: [...rendering.sections, { sectionId: one.sections[0].sectionId, sectionIndex: 1, sectionType: "content", reasoning: "Imported owner", html: "<main>New owner</main>" }] }), label + "_p2"])
  } finally { db.close() }
  await expect(download(label, tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
  expect(fs.readFileSync(receiptPath)).toEqual(receipt)
  await prepareExport(label, format, tmpDir, webAssetsDir)
  expect((await streamToBuffer((await download(label, tmpDir)).stream)).length).toBeGreaterThan(0)
})

it.each(["webpub", "epub", "pnld"] as const)("requires complete declared files in real %s downloads", async format => {
  const label = "declared-files"
  createBookWithMetadata(label, label)
  addPagesAndRenderings(label, 1)
  await prepareExport(label, format, tmpDir, webAssetsDir)
  const download = { webpub: exportWebpub, epub: exportEpub, pnld: exportPnld }[format]
  const directory = path.join(tmpDir, label, format)
  const content = format === "epub" ? path.join(directory, "OEBPS") : directory
  const page = format === "epub" ? `${label}_p1_sec001.xhtml` : format === "pnld" ? `content/${label}_p1_sec001.html` : `${label}_p1_sec001.html`
  const manifest = format === "webpub" ? "manifest.json" : "content.opf"
  const refused = async () => {
    const outcome = await download(label, tmpDir).then(async result => { await streamToBuffer(result.stream); return "accepted" }, error => error.code)
    expect(outcome).toBe("PACKAGE_FILES_INCOMPLETE")
  }
  expect((await streamToBuffer((await download(label, tmpDir)).stream)).length).toBeGreaterThan(0)
  const manifestText = fs.readFileSync(path.join(content, manifest), "utf8")
  const stylesheet = format === "webpub"
    ? JSON.parse(manifestText).resources.find((entry: { href: string }) => entry.href.endsWith(".css"))?.href
    : manifestText.match(/href="([^"]+\.css)"/)?.[1]
  expect(stylesheet).toBeTruthy()
  for (const member of [page, manifest, stylesheet]) {
    const file = path.join(content, member), bytes = fs.readFileSync(file)
    fs.unlinkSync(file)
    await refused()
    expect(fs.existsSync(file)).toBe(false)
    fs.mkdirSync(file)
    await refused()
    fs.rmdirSync(file)
    fs.writeFileSync(file, "")
    await refused()
    fs.writeFileSync(file, bytes)
    expect((await streamToBuffer((await download(label, tmpDir)).stream)).length).toBeGreaterThan(0)
  }
  const file = path.join(content, manifest), original = fs.readFileSync(file, "utf8")
  // Keep the page file, but remove its declaration: filenames alone do not
  // establish a usable reading order or spine.
  if (format === "webpub") {
    const value = JSON.parse(original)
    value.readingOrder = []
    fs.writeFileSync(file, JSON.stringify(value))
  } else fs.writeFileSync(file, original.replace(/<itemref\b[^>]*\/>/g, ""))
  await refused()
  fs.writeFileSync(file, original)
  const outsideHref = format === "epub" ? "../../outside-canary" : "../outside-canary"
  fs.writeFileSync(path.join(tmpDir, label, "outside-canary"), "PRIVATE")
  if (format === "webpub") {
    const value = JSON.parse(original)
    value.resources.push({ href: outsideHref })
    fs.writeFileSync(file, JSON.stringify(value))
  } else fs.writeFileSync(file, original.replace("</manifest>", `<item id="outside" href="${outsideHref}"/></manifest>`))
  await refused()
  fs.writeFileSync(file, original)
  const target = path.join(content, page), aliasTarget = target + ".original"
  fs.renameSync(target, aliasTarget)
  try {
    fs.symlinkSync(aliasTarget, target)
    await refused()
    fs.unlinkSync(target)
  } catch (error) {
    if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error
  }
  fs.renameSync(aliasTarget, target)
  fs.unlinkSync(target)
  await prepareExport(label, format, tmpDir, webAssetsDir)
  expect((await streamToBuffer((await download(label, tmpDir)).stream)).length).toBeGreaterThan(0)
})

it.each(["epub", "pnld"] as const)("rejects malformed XML in real %s reader structure", async format => {
  const label = "xml-structure"
  createBookWithMetadata(label, label)
  addPagesAndRenderings(label, 1)
  await prepareExport(label, format, tmpDir, webAssetsDir)
  const download = format === "epub" ? exportEpub : exportPnld
  const directory = path.join(tmpDir, label, format)
  const opf = path.join(directory, format === "epub" ? "OEBPS/content.opf" : "content.opf")
  const original = fs.readFileSync(opf, "utf8")
  const refused = async () => {
    const outcome = await download(label, tmpDir).then(async result => { await streamToBuffer(result.stream); return "accepted" }, error => error.code)
    expect(outcome).toBe("PACKAGE_FILES_INCOMPLETE")
  }
  for (const malformed of [
    original.replace("</package>", ""),
    original.replace("</spine>", "</wrong-spine>"),
    original.replace('version="3.0"', 'version=3.0'),
    original.replace('xmlns="http://www.idpf.org/2007/opf"', 'xmlns="urn:wrong-format"'),
  ]) {
    fs.writeFileSync(opf, malformed)
    await refused()
    expect(fs.readFileSync(opf, "utf8")).toBe(malformed)
  }
  fs.writeFileSync(opf, original)
  for (const relative of format === "epub" ? ["OEBPS/xml-structure_p1_sec001.xhtml", "OEBPS/toc.xhtml", "OEBPS/toc.ncx"] : ["toc.ncx"]) {
    const file = path.join(directory, relative), bytes = fs.readFileSync(file, "utf8")
    const damaged = bytes.replace(/<\/(html|ncx)>\s*$/, "")
    expect(damaged).not.toBe(bytes)
    fs.writeFileSync(file, damaged)
    await refused()
    expect(fs.readFileSync(file, "utf8")).toBe(damaged)
    fs.writeFileSync(file, bytes)
  }
  if (format === "epub") {
    const container = path.join(directory, "META-INF/container.xml")
    const xml = fs.readFileSync(container, "utf8")
    for (const malformed of [xml.replace("</container>", ""), xml.replace("</rootfiles>", "</wrong-rootfiles>")]) {
      fs.writeFileSync(container, malformed)
      await refused()
      expect(fs.readFileSync(container, "utf8")).toBe(malformed)
    }
    fs.writeFileSync(container, xml)
  }
  expect((await streamToBuffer((await download(label, tmpDir)).stream)).length).toBeGreaterThan(0)
})

it("validates the actual EPUB converter's narration overlay and restored target bytes", async () => {
  const label = "reader-overlay", id = `${label}_p1`, textId = "narration"
  createBookWithMetadata(label, label); addPagesAndRenderings(label, 1)
  const source = createBookStorage(label, tmpDir)
  try {
    const row = source.getLatestNodeData("web-rendering", id)!.data as { sections: { html: string }[] }
    row.sections[0].html = `<p data-id="${textId}">Hello world</p>`
    source.putNodeData("web-rendering", id, row)
    source.putNodeData("tts-timestamps", "en", { entries: { [textId]: { textId, language: "en", duration: 1,
      words: [{ word: "Hello", start: 0, end: 0.5 }, { word: "world", start: 0.5, end: 1 }] } }, generatedAt: "2026-01-01T00:00:00.000Z" })
  } finally { source.close() }
  await prepareExport(label, "adt", tmpDir, webAssetsDir)
  const bookDir = path.join(tmpDir, label), adt = path.join(bookDir, "adt")
  // Isolate converter input from speech generation; real saved timestamps and
  // the actual converter produce the OPF association, SMIL and XHTML targets.
  fs.mkdirSync(path.join(adt, "content/i18n/en/audio"), { recursive: true })
  fs.writeFileSync(path.join(adt, "content/i18n/en/audio/narration.wav"), "original audio bytes")
  fs.writeFileSync(path.join(adt, "content/i18n/en/audios.json"), JSON.stringify({ [textId]: "narration.wav" }))
  const storage = createBookStorage(label, tmpDir)
  try { await packageEpub(storage, { bookDir, label, title: label, language: "en", outputLanguages: ["en"], webAssetsDir }) }
  finally { storage.close() }
  const dir = path.join(bookDir, "epub/OEBPS"), smil = path.join(dir, `smil/${id}_sec001.smil`)
  const original = fs.readFileSync(smil, "utf8")
  expect(original).toContain("narration.wav")
  const download = async () => unzipSync(await streamToBuffer((await exportEpub(label, tmpDir)).stream))
  const valid = await download()
  for (const damaged of [original.replace("</smil>", ""), original.replace("narration.wav", "missing.wav"), original.replace(`${id}_sec001.xhtml`, "missing.xhtml")]) {
    fs.writeFileSync(smil, damaged)
    await expect(download()).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect(fs.readFileSync(smil, "utf8")).toBe(damaged)
  }
  fs.writeFileSync(smil, original)
  expect(await download()).toEqual(valid)
})
