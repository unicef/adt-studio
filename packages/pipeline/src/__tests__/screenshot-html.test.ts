import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildScreenshotHtml } from "../screenshot-html.js"

function createWebAssets(webAssetsDir: string): void {
  fs.mkdirSync(webAssetsDir, { recursive: true })
  fs.writeFileSync(
    path.join(webAssetsDir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}

describe("buildScreenshotHtml", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshot-html-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("wraps screenshot content in a page-level main and generated #content wrapper", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)

    const html = await buildScreenshotHtml({
      sectionHtml: '<section data-section-id="s1"><p>Hello</p></section>',
      images: new Map(),
      webAssetsDir,
      language: "en",
    })

    expect((html.match(/<main\b/g) ?? [])).toHaveLength(1)
    expect(html).toContain('<body class="min-h-screen flex items-center justify-center">')
    expect(html).toContain('<main class="w-full">')
    expect(html).toContain('<div id="content">')
  })

  it("preserves an existing #content wrapper and inlines matching image sources", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)

    const html = await buildScreenshotHtml({
      sectionHtml: '<div id="content" class="container"><section role="article"><img src="/api/books/book/images/img001"></section></div>',
      images: new Map([["img001", { base64: "YWJjMTIz" }]]),
      webAssetsDir,
      language: "en",
    })

    expect((html.match(/<main\b/g) ?? [])).toHaveLength(1)
    expect(html).toContain('<div id="content" class="container">')
    expect(html).toContain('src="data:image/jpeg;base64,YWJjMTIz"')
    expect(html).not.toContain('role="article"')
  })

  it("inlines images whose src still names the book the project was copied from", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)

    const html = await buildScreenshotHtml({
      sectionHtml: '<section><img src="/api/books/original-book/images/img001" data-id="img001"><img src="/api/books/original-book/images/missing"></section>',
      images: new Map([["img001", { base64: "YWJjMTIz" }]]),
      webAssetsDir,
      language: "en",
    })

    expect(html).toContain('src="data:image/jpeg;base64,YWJjMTIz"')
    expect(html).toContain('src="/api/books/original-book/images/missing"')
  })


  it("promotes the first content heading to h1 for screenshot parity", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)

    const html = await buildScreenshotHtml({
      sectionHtml: '<section data-section-id="s1"><h2 data-id="tx001">Lesson heading</h2><p>Hello</p></section>',
      images: new Map(),
      webAssetsDir,
      language: "en",
    })

    expect(html).toContain('<h1 data-id="tx001">Lesson heading</h1>')
    expect(html).not.toContain('<h2 data-id="tx001">Lesson heading</h2>')
  })
})
