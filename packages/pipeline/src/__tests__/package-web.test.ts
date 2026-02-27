import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Storage, PageData } from "@adt/storage"
import { packageAdtWeb, renderPageHtml, rewriteImageUrls } from "../package-web.js"

function createMockStorage(
  pages: PageData[],
  nodeData: Record<string, Record<string, unknown>>,
): Storage {
  return {
    getLatestNodeData(node: string, itemId: string) {
      const data = nodeData[node]?.[itemId]
      return data !== undefined ? { version: 1, data } : null
    },
    getPages: () => pages,
    getPageImageBase64: () => "",
    getImageBase64: () => "",
    getPageImages: () => [],
    putNodeData: () => 1,
    clearExtractedData: () => {},
    putExtractedPage: () => {},
    appendLlmLog: () => {},
    close: () => {},
  }
}

function createWebAssets(webAssetsDir: string): void {
  fs.mkdirSync(webAssetsDir, { recursive: true })
  fs.writeFileSync(
    path.join(webAssetsDir, "base.js"),
    'window.__ADT_BUNDLE_TEST__ = "ok";\n',
  )
  fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(webAssetsDir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}

describe("renderPageHtml", () => {
  it("includes font preload links before stylesheet links", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).toContain(
      '<link rel="preload" href="./assets/fonts/Merriweather-VariableFont.woff2" as="font" type="font/woff2" crossorigin>',
    )
    expect(html).toContain(
      '<link rel="preload" href="./assets/fonts/Merriweather-Italic-VariableFont.woff2" as="font" type="font/woff2" crossorigin>',
    )

    // Preloads should appear before the fonts.css stylesheet
    const preloadPos = html.indexOf('rel="preload"')
    const stylesheetPos = html.indexOf('href="./assets/fonts.css"')
    expect(preloadPos).toBeLessThan(stylesheetPos)
  })
})

describe("packageAdtWeb", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "package-web-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("uses a safe default locale, avoids page-number carryover, and escapes inline answer JSON", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
      { pageId: "pg002", pageNumber: 2, text: "Page two" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>First page</div>",
              activityAnswers: {
                q1: "</script><script>alert('x')</script>",
              },
            },
          ],
        },
        pg002: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>Second page</div>",
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 10,
              isPruned: false,
            },
          ],
        },
        pg002: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg002_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: null,
              isPruned: false,
            },
          ],
        },
      },
      "text-catalog-translation": {
        fr: {
          entries: [{ id: "tx001", text: "Bonjour" }],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["fr"],
      title: "Book Title",
      webAssetsDir,
    })

    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; href: string; page_number?: number }>
    expect(pagesJson).toHaveLength(2)
    expect(pagesJson[0]).toEqual({ section_id: "pg001_sec001", href: "index.html", page_number: 10 })
    expect(pagesJson[1]).toEqual({ section_id: "pg002_sec001", href: "pg002_sec001.html" })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { languages: { default: string; available: string[] } }
    expect(configJson.languages.available).toEqual(["fr"])
    expect(configJson.languages.default).toBe("fr")

    const pageHtml = fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf-8")
    expect(pageHtml).toContain("window.correctAnswers = JSON.parse(")
    expect(pageHtml).not.toContain("</script><script>alert('x')</script>")
    expect(pageHtml).toContain("\\u003c/script\\u003e\\u003cscript\\u003e")

    const bundlePath = path.join(bookDir, "adt", "assets", "base.bundle.min.js")
    expect(fs.existsSync(bundlePath)).toBe(true)
    expect(fs.readFileSync(bundlePath, "utf-8")).toContain("__ADT_BUNDLE_TEST__")
    expect(fs.existsSync(`${bundlePath}.map`)).toBe(true)
  })

  it("inserts quiz pages even when the anchor page has no rendered sections", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
      { pageId: "pg002", pageNumber: 2, text: "Page two" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [],
        },
        pg002: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>Second page</div>",
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 10,
              isPruned: false,
            },
          ],
        },
      },
      "quiz-generation": {
        book: {
          generatedAt: "2026-01-01T00:00:00.000Z",
          language: "en",
          pagesPerQuiz: 3,
          quizzes: [
            {
              quizIndex: 0,
              afterPageId: "pg001",
              pageIds: ["pg001"],
              question: "What is 2+2?",
              options: [
                { text: "3", explanation: "Nope" },
                { text: "4", explanation: "Yes" },
              ],
              answerIndex: 1,
              reasoning: "...",
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; href: string; page_number?: number }>

    expect(pagesJson).toEqual([
      { section_id: "qz001", href: "index.html" },
      { section_id: "pg002_sec001", href: "pg002_sec001.html" },
    ])
    expect(fs.existsSync(path.join(bookDir, "adt", "index.html"))).toBe(true)
  })

  it("sets activities true in config.json when a section has an activity type", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_multiple_choice",
              reasoning: "ok",
              html: '<section role="activity"><div>Pick one</div></section>',
              activityAnswers: { "item-1": true },
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "activity_multiple_choice",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { features: { activities: boolean } }
    expect(configJson.features.activities).toBe(true)
  })

  it("sets activities true from rendered section type even without section metadata", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_multiple_choice",
              reasoning: "ok",
              html: '<section role="activity"><div>Pick one</div></section>',
              activityAnswers: { "item-1": true },
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { features: { activities: boolean } }
    expect(configJson.features.activities).toBe(true)
  })

  it("orders rendered sections by sectionIndex before writing pages.json", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 1,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>Second section</div>",
            },
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>First section</div>",
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionId: "pg001_sec002",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; href: string; page_number?: number }>
    expect(pagesJson).toEqual([
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
      { section_id: "pg001_sec002", href: "pg001_sec002.html", page_number: 1 },
    ])
  })
})

describe("rewriteImageUrls", () => {
  it("rewrites src URL from API path to local images/ path", () => {
    const html = `<img src="/api/books/mybook/images/abc123">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out, referencedImages } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).toContain('src="images/photo.jpg"')
    // referencedImages contains image IDs (not filenames) — callers use IDs to look up files
    expect(referencedImages).toContain("abc123")
  })

  it("removes explicit width and height attributes", () => {
    const html = `<img src="/api/books/mybook/images/abc123" width="1200" height="900">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).not.toMatch(/width="/)
    expect(out).not.toMatch(/height="/)
  })

  it("adds max-width inline style to prevent overflow", () => {
    const html = `<img src="/api/books/mybook/images/abc123">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).toContain("max-width: 100%")
    expect(out).toContain("height: auto")
  })

  it("preserves existing inline styles when adding max-width", () => {
    const html = `<img src="/api/books/mybook/images/abc123" style="border: 1px solid red;">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).toContain("border: 1px solid red")
    expect(out).toContain("max-width: 100%")
  })

  it("does not duplicate max-width if style already contains it", () => {
    const html = `<img src="/api/books/mybook/images/abc123" style="max-width: 50%;">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    const matches = (out.match(/max-width/g) ?? []).length
    expect(matches).toBe(1)
  })

  it("does not include unreferenced images in referencedImages", () => {
    const html = `<img src="/api/books/mybook/images/unknown">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { referencedImages } = rewriteImageUrls(html, "mybook", imageMap)
    expect(referencedImages).toHaveLength(0)
  })

  it("leaves non-API image srcs unchanged", () => {
    const html = `<img src="https://example.com/photo.jpg">`
    const imageMap = new Map<string, string>()
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).toContain('src="https://example.com/photo.jpg"')
  })
})
