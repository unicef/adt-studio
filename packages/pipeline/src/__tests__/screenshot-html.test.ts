import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  buildScreenshotHtml,
  FITB_HYDRATION_SCRIPT,
  SCREENSHOT_CONTENT_SECURITY_POLICY,
} from "../screenshot-html.js"

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

  it("emits a CSP that permits only the generated FITB hydration script", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)
    const html = await buildScreenshotHtml({
      sectionHtml: '<p>Complete [[blank:item-1:answer]]</p>',
      label: "book",
      images: new Map(),
      webAssetsDir,
    })
    const scriptContent = FITB_HYDRATION_SCRIPT
      .replace(/^<script>/, "")
      .replace(/<\/script>$/, "")
    const hash = createHash("sha256").update(scriptContent).digest("base64")

    expect(SCREENSHOT_CONTENT_SECURITY_POLICY).toContain(
      `script-src 'sha256-${hash}'`,
    )
    expect(html).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${SCREENSHOT_CONTENT_SECURITY_POLICY}" />`,
    )
    expect(html).toContain(FITB_HYDRATION_SCRIPT)
  })
})
