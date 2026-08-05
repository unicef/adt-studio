import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb, createBookStorage } from "@adt/storage"
import { unzipSync } from "fflate"
import { prepareExport, exportProject, exportAdt, exportWebpub, exportEpub, exportPnld } from "./export-service.js"

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
  fs.writeFileSync(path.join(dir, "base.js"), 'window.__ADT_BUNDLE_TEST__ = "ok";\n')
  fs.writeFileSync(path.join(dir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(dir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"
  )
}

describe("exportProject", () => {
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

  it("throws when web assets directory is missing (prepareExport)", async () => {
    createTestDb("missing-assets")
    addPages("missing-assets", 1)

    await expect(prepareExport("missing-assets", "project", tmpDir, path.join(tmpDir, "missing-assets-dir"), undefined, undefined))
      .rejects.toThrow("Web assets directory not found")
  })

  it("includes all book directory contents recursively", async () => {
    createTestDb("full-book")
    addPages("full-book", 2)
    addPdf("full-book")
    addImageFile("full-book", "img-a")
    addImageFile("full-book", "img-b")
    addConfigYaml("full-book")

    const result = await exportProject("full-book", tmpDir)
    const zipBuffer = await streamToBuffer(result.stream)
    const files = unzipSync(zipBuffer)
    const paths = Object.keys(files).sort()

    expect(paths).toContain("full-book.db")
    expect(paths).toContain("full-book.pdf")
    expect(paths).toContain("config.yaml")
    expect(paths).toContain("images/img-a.png")
    expect(paths).toContain("images/img-b.png")
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
    addPages("no-title", 1)

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
    addPages("epub-no-title", 1)

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
