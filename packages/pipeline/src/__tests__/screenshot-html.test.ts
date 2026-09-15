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
      label: "book",
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
      label: "book",
      images: new Map([["img001", { base64: "YWJjMTIz" }]]),
      webAssetsDir,
      language: "en",
    })

    expect((html.match(/<main\b/g) ?? [])).toHaveLength(1)
    expect(html).toContain('<div id="content" class="container">')
    expect(html).toContain('src="data:image/jpeg;base64,YWJjMTIz"')
    expect(html).not.toContain('role="article"')
  })


  it("promotes the first content heading to h1 for screenshot parity", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)

    const html = await buildScreenshotHtml({
      sectionHtml: '<section data-section-id="s1"><h2 data-id="tx001">Lesson heading</h2><p>Hello</p></section>',
      label: "book",
      images: new Map(),
      webAssetsDir,
      language: "en",
    })

    expect(html).toContain('<h1 data-id="tx001">Lesson heading</h1>')
    expect(html).not.toContain('<h2 data-id="tx001">Lesson heading</h2>')
  })

  it("loads imported presentation assets and recovers images projected under a temporary label", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)

    const html = await buildScreenshotHtml({
      sectionHtml: '<section><img src="/api/books/adt-recovery-temp/images/pg001_im001"></section>',
      label: "final-book",
      images: new Map([["pg001_im001", { base64: "YWJjMTIz" }]]),
      webAssetsDir,
      baseHref: "http://127.0.0.1:3001/api/books/final-book/adt/",
      stylesheets: ["assets/fonts.css", "assets/book.css"],
      contentClassName: "container storybook-root",
    })

    expect(html).toContain('<base href="http://127.0.0.1:3001/api/books/final-book/adt/" />')
    expect(html).toContain('<link rel="stylesheet" href="assets/book.css" />')
    expect(html).toContain('<div id="content" class="container storybook-root">')
    expect(html).toContain('src="data:image/jpeg;base64,YWJjMTIz"')
    expect(html).not.toContain("adt-recovery-temp")
  })
})
