import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Storage, PageData } from "@adt/storage"
import {
  computePackagingInputHash,
  buildGlossaryJson,
  packageAdtWeb,
  packageWebpub,
  renderPageHtml,
  resolveReflowableFontChain,
  renderQuizHtml,
  rewriteImageUrls,
  convertLatexToMathml,
  convertLatexString,
} from "../package-web.js"

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
    getSignLanguageVideos: () => [],
    getSignLanguageVideoPath: () => null,
    getNodeVersionFingerprint: (excludeNodes: string[] = []) =>
      Object.entries(nodeData)
        .filter(([node]) => !excludeNodes.includes(node))
        .flatMap(([node, items]) =>
          Object.keys(items).map((itemId) => ({ node, itemId, version: 1 })),
        )
        .sort((a, b) => a.node.localeCompare(b.node) || a.itemId.localeCompare(b.itemId)),
    close: () => {},
  }
}

function createWebAssets(webAssetsDir: string): void {
  fs.mkdirSync(webAssetsDir, { recursive: true })
  // Pre-built runtime bundles. In production these come from
  // apps/adt-runtime/build.config.mjs; in tests we write them directly so
  // buildJsBundle's "copy from webAssetsDir" path is exercised without
  // pulling in the real React build.
  const bundleStub = 'window.__ADT_BUNDLE_TEST__ = "ok";\n'
  fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), bundleStub)
  fs.writeFileSync(path.join(webAssetsDir, "base.bundle.local.js"), bundleStub)
  fs.writeFileSync(
    path.join(webAssetsDir, "base.bundle.min.js.map"),
    '{"version":3,"sources":["base.tsx"],"mappings":""}',
  )
  fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(webAssetsDir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}

function createMinimalStorage(): Storage {
  return createMockStorage(
    [{ pageId: "pg001", pageNumber: 1, text: "Page one" }],
    {
      "web-rendering": {
        pg001: {
          sections: [
            { sectionIndex: 0, sectionType: "content", reasoning: "ok", html: "<div>Hello</div>" },
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
              nodes: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    },
  )
}

describe("renderPageHtml", () => {
  it("does not emit font preload links (fonts are inlined as base64 in fonts.css for file:// support)", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect((html.match(/<main\b/g) ?? [])).toHaveLength(1)
    expect(html).toContain('<main class="w-full">')
    expect(html).toContain('<div id="content" class="opacity-0">')
    expect(html).not.toContain('rel="preload"')
    expect(html).not.toContain("Merriweather-VariableFont.woff2")
    expect(html).toContain('href="./assets/fonts.css"')
  })

  it("injects a Google Fonts stylesheet for fonts the page actually uses", () => {
    const html = renderPageHtml({
      content: `<p><span style="font-family:'Mouse Memoirs',Merriweather,serif">Hi</span></p>`,
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).toContain("fonts.googleapis.com/css2?family=Mouse+Memoirs")
    expect(html).toContain('rel="preconnect"')
  })

  it("injects a reflowable base-font override and loads it from Google", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
      bodyFontFamily: "'Atkinson Hyperlegible','Merriweather',sans-serif",
    })

    // Base-font override style is present and targets body + block elements.
    expect(html).toContain("'Atkinson Hyperlegible','Merriweather',sans-serif")
    expect(html).toMatch(/<style>[\s\S]*body, p, h1[\s\S]*font-family:/)
    // The body family is also loaded from Google Fonts.
    expect(html).toContain("fonts.googleapis.com/css2?family=Atkinson+Hyperlegible")
  })

  it("omits the base-font override when bodyFontFamily is unset", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })
    expect(html).not.toContain("Atkinson Hyperlegible")
  })

  it("does not inject Google Fonts links when no registered font is used", () => {
    const html = renderPageHtml({
      content: `<p><span style="font-family:Palatino,Merriweather,serif">Hi</span></p>`,
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).not.toContain("fonts.googleapis.com")
  })

  it("uses offline/SCORM scripts instead of type=module in normal mode", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).toContain('src="./assets/offline-preloader.js"')
    expect(html).toContain('src="./assets/scorm.js"')
    expect(html).toContain('src="./assets/base.bundle.local.js"')
    expect(html).not.toContain('type="module"')
  })

  it("keeps type=module script in embed mode", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
      embed: true,
    })

    expect(html).toContain('type="module"')
    expect(html).toContain("base.bundle.min.js")
    expect(html).not.toContain("offline-preloader.js")
    expect(html).not.toContain("scorm.js")
  })

  it("does not reference woff2 fonts directly (they are inlined as base64 in fonts.css)", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).not.toContain("woff2")
  })

  it("injects an sr-only h1 fallback when content has no headings", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Book Title",
      pageHeading: "Lesson heading",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).toContain('<h1 class="sr-only" id="page-heading">Lesson heading</h1>')
  })


  it("promotes the first content heading to h1 before using the shell fallback", () => {
    const html = renderPageHtml({
      content: '<div id="content"><section><h2 data-id="tx001">Lesson heading</h2><p>Hello</p></section></div>',
      language: "en",
      sectionId: "pg001",
      pageTitle: "Book Title",
      pageHeading: "Lesson heading",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).toContain('<h1 data-id="tx001">Lesson heading</h1>')
    expect(html).not.toContain('id="page-heading"')
    expect(html).not.toContain('<h2 data-id="tx001">Lesson heading</h2>')
  })

  it("does not inject a fallback h1 when content already has one", () => {
    const html = renderPageHtml({
      content: '<div id="content"><section><h1>Visible heading</h1><p>Hello</p></section></div>',
      language: "en",
      sectionId: "pg001",
      pageTitle: "Book Title",
      pageHeading: "Lesson heading",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect((html.match(/<h1\b/g) ?? [])).toHaveLength(1)
    expect(html).not.toContain('id="page-heading"')
  })
})

describe("resolveReflowableFontChain", () => {
  const fakeStorage = (category: string | null) =>
    ({
      getLatestNodeData: (node: string) =>
        node === "font-profile" ? { data: { category }, version: 1 } : null,
    }) as unknown as Storage

  it("returns undefined for fixed-layout books (keep original fonts)", () => {
    expect(resolveReflowableFontChain(fakeStorage("sans"), { fixedLayout: true })).toBeUndefined()
  })

  it("returns undefined when the resolved font is the Merriweather default", () => {
    expect(resolveReflowableFontChain(fakeStorage("serif"), {})).toBeUndefined()
    expect(resolveReflowableFontChain(fakeStorage(null), {})).toBeUndefined()
  })

  it("returns the chain for a sans-serif book", () => {
    expect(resolveReflowableFontChain(fakeStorage("sans"), {})).toBe(
      "'Atkinson Hyperlegible','Merriweather',sans-serif",
    )
  })

  it("honors an explicit override", () => {
    expect(resolveReflowableFontChain(fakeStorage("serif"), { reflowableFont: "lora" })).toBe(
      "Lora,'Merriweather',serif",
    )
  })
})

describe("renderQuizHtml", () => {
  it("does not emit the invalid activity role", () => {
    const html = renderQuizHtml(
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
      "qz001",
      undefined,
    )

    expect(html).toContain('<section')
    expect(html).not.toContain('role="activity"')
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
              nodes: [],
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
              nodes: [],
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
    expect((pageHtml.match(/<main\b/g) ?? [])).toHaveLength(1)
    expect(pageHtml).toContain("window.correctAnswers = JSON.parse(")
    expect(pageHtml).not.toContain("</script><script>alert('x')</script>")
    expect(pageHtml).toContain("\\u003c/script\\u003e\\u003cscript\\u003e")

    const bundlePath = path.join(bookDir, "adt", "assets", "base.bundle.min.js")
    expect(fs.existsSync(bundlePath)).toBe(true)
    expect(fs.readFileSync(bundlePath, "utf-8")).toContain("__ADT_BUNDLE_TEST__")

    // Offline preloader generated
    const preloaderPath = path.join(bookDir, "adt", "assets", "offline-preloader.js")
    expect(fs.existsSync(preloaderPath)).toBe(true)
    const preloader = fs.readFileSync(preloaderPath, "utf-8")
    expect(preloader).toContain("window.fetch")
    expect(preloader).toContain("INLINE")

    // Local bundle generated (no export statement)
    const localBundlePath = path.join(bookDir, "adt", "assets", "base.bundle.local.js")
    expect(fs.existsSync(localBundlePath)).toBe(true)

    // SCORM adapter generated
    const scormPath = path.join(bookDir, "adt", "assets", "scorm.js")
    expect(fs.existsSync(scormPath)).toBe(true)
    expect(fs.readFileSync(scormPath, "utf-8")).toContain("LMSInitialize")

    // SCORM manifest generated
    const manifestPath = path.join(bookDir, "adt", "imsmanifest.xml")
    expect(fs.existsSync(manifestPath)).toBe(true)
    const manifest = fs.readFileSync(manifestPath, "utf-8")
    expect(manifest).toContain("ADL SCORM")
    expect(manifest).toContain("index.html")
  })

  it("packages persisted Easy Read entries for the source language", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [{ pageId: "pg001", pageNumber: 1, text: "Page one" }]
    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: '<p data-id="pg001_tx001">Original text</p>',
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
              nodes: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
      "text-catalog": {
        book: {
          entries: [{ id: "pg001_tx001", text: "Original text", pageId: "pg001" }],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      "easy-read": {
        book: {
          generatedAt: "2026-01-02T00:00:00.000Z",
          blocks: [
            {
              pageId: "pg001",
              pageNumber: 1,
              sectionId: "pg001_sec001",
              sectionIndex: 0,
              sectionType: "content",
              entries: [
                {
                  sourceId: "pg001_tx001",
                  easyReadId: "pg001_tx001_easy_read",
                  originalText: "Original text",
                  text: "Easy text",
                  pageId: "pg001",
                  sectionId: "pg001_sec001",
                  sectionIndex: 0,
                },
              ],
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

    const textsJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "i18n", "en", "texts.json"), "utf-8"),
    ) as Record<string, string>
    expect(textsJson.pg001_tx001).toBe("Original text")
    expect(textsJson.pg001_tx001_easy_read).toBe("Easy text")

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { features: { easyRead: boolean } }
    expect(configJson.features.easyRead).toBe(true)
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
              nodes: [],
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

    const quizHtml = fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf-8")
    expect((quizHtml.match(/<main\b/g) ?? [])).toHaveLength(1)
    expect(quizHtml).not.toContain('role="activity"')

    // SCORM adapter should include the quiz activity ID
    const scorm = fs.readFileSync(path.join(bookDir, "adt", "assets", "scorm.js"), "utf-8")
    expect(scorm).toContain('"qz001"')
  })

  it("packages reader timecodes and enables word highlighting when timestamps exist", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    const audioDir = path.join(bookDir, "audio", "en")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(audioDir, { recursive: true })
    createWebAssets(webAssetsDir)
    fs.writeFileSync(path.join(audioDir, "pg001_t001.mp3"), "audio")

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: '<p data-id="pg001_t001">Hello world</p>',
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
              nodes: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
      "tts": {
        en: {
          entries: [
            {
              textId: "pg001_t001",
              language: "en",
              fileName: "pg001_t001.mp3",
              voice: "alloy",
              model: "gpt-4o-mini-tts",
              cached: false,
            },
          ],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      "tts-timestamps": {
        en: {
          entries: {
            pg001_t001: {
              textId: "pg001_t001",
              language: "en",
              duration: 0.9,
              words: [
                { word: "Hello", start: 0, end: 0.45 },
                { word: "world", start: 0.45, end: 0.9 },
              ],
            },
          },
          generatedAt: "2026-01-01T00:00:00.000Z",
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
      speechConfig: { word_highlighting: true },
    })

    const timecodes = JSON.parse(
      fs.readFileSync(
        path.join(bookDir, "adt", "content", "i18n", "en", "timecode", "timecode_output.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>
    expect(timecodes).toEqual({
      pg001_t001: {
        timecodes: [
          null,
          {
            word_timestamps: [
              { text: "Hello", start: 0, end: 0.45 },
              { text: "world", start: 0.45, end: 0.9 },
            ],
          },
        ],
      },
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { features: { highlight: boolean } }
    expect(configJson.features.highlight).toBe(true)

    const preloader = fs.readFileSync(
      path.join(bookDir, "adt", "assets", "offline-preloader.js"),
      "utf-8",
    )
    expect(preloader).toContain("timecode/timecode_output.json")
  })

  it("emits defaultSettings and lockedSettings in config.json when provided", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    await packageAdtWeb(createMinimalStorage(), {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book",
      webAssetsDir,
      defaultSettings: {
        dockLayout: { width: "compact", position: "top", align: "center" },
        theme: "light",
        iconSize: "lg",
        reduceMotion: true,
      },
      lockedSettings: ["dockLayout", "theme", "iconSize", "reduceMotion"],
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as {
      defaultSettings: {
        dockLayout: { width: string; position: string; align: string }
        theme: string
        iconSize: string
        reduceMotion: boolean
      }
      lockedSettings: string[]
    }
    expect(configJson.defaultSettings.dockLayout).toEqual({
      width: "compact",
      position: "top",
      align: "center",
    })
    expect(configJson.defaultSettings.theme).toBe("light")
    expect(configJson.defaultSettings.iconSize).toBe("lg")
    expect(configJson.defaultSettings.reduceMotion).toBe(true)
    expect(configJson.lockedSettings).toEqual([
      "dockLayout",
      "theme",
      "iconSize",
      "reduceMotion",
    ])
  })

  it("omits defaultSettings and lockedSettings when not provided", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    await packageAdtWeb(createMinimalStorage(), {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book",
      webAssetsDir,
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as Record<string, unknown>
    expect(configJson.defaultSettings).toBeUndefined()
    expect(configJson.lockedSettings).toBeUndefined()
  })

  it("omits lockedSettings when given an empty array", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    await packageAdtWeb(createMinimalStorage(), {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book",
      webAssetsDir,
      lockedSettings: [],
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as Record<string, unknown>
    expect(configJson.lockedSettings).toBeUndefined()
  })

  it("enables highlight fallback when TTS exists without stored word timestamps", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    const audioDir = path.join(bookDir, "audio", "en")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(audioDir, { recursive: true })
    createWebAssets(webAssetsDir)
    fs.writeFileSync(path.join(audioDir, "pg001_t001.mp3"), "audio")

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: '<p data-id="pg001_t001">Hello, world.</p>',
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
              nodes: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
      "tts": {
        en: {
          entries: [
            {
              textId: "pg001_t001",
              language: "en",
              fileName: "pg001_t001.mp3",
              voice: "alloy",
              model: "gpt-4o-mini-tts",
              cached: false,
            },
          ],
          generatedAt: "2026-01-01T00:00:00.000Z",
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
      speechConfig: { word_highlighting: true },
    })

    const timecodes = JSON.parse(
      fs.readFileSync(
        path.join(bookDir, "adt", "content", "i18n", "en", "timecode", "timecode_output.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>
    expect(timecodes).toEqual({})

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { features: { readAloud: boolean; highlight: boolean } }
    expect(configJson.features.readAloud).toBe(true)
    expect(configJson.features.highlight).toBe(true)
  })

  it("uses explicit glossary ids when building translated glossary json", () => {
    const glossaryJson = buildGlossaryJson(
      {
        items: [
          {
            id: "gl_manual_soil",
            source: "manual",
            word: "Soil",
            definition: "The top layer of earth",
            variations: ["soils"],
            emojis: ["🪨"],
          },
        ],
        pageCount: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
      undefined,
      {
        gl_manual_soil: "Sol",
        gl_manual_soil_def: "La couche superieure de la terre",
      },
      false,
    )

    expect(glossaryJson).toEqual({
      Sol: {
        word: "Sol",
        definition: "La couche superieure de la terre",
        variations: ["soils"],
        emoji: "🪨",
      },
    })
  })

  it("disables word-level highlight when speech.word_highlighting is false", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    const audioDir = path.join(bookDir, "audio", "en")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(audioDir, { recursive: true })
    createWebAssets(webAssetsDir)
    fs.writeFileSync(path.join(audioDir, "pg001_t001.mp3"), "audio")

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: '<p data-id="pg001_t001">Hello, world.</p>',
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
              nodes: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
      "tts": {
        en: {
          entries: [
            {
              textId: "pg001_t001",
              language: "en",
              fileName: "pg001_t001.mp3",
              voice: "alloy",
              model: "gpt-4o-mini-tts",
              cached: false,
            },
          ],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      "tts-timestamps": {
        en: {
          entries: {
            pg001_t001: {
              textId: "pg001_t001",
              language: "en",
              duration: 0.9,
              words: [
                { word: "Hello", start: 0, end: 0.45 },
                { word: "world", start: 0.45, end: 0.9 },
              ],
            },
          },
          generatedAt: "2026-01-01T00:00:00.000Z",
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
      speechConfig: { word_highlighting: false },
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { features: { readAloud: boolean; highlight: boolean } }
    expect(configJson.features.readAloud).toBe(true)
    expect(configJson.features.highlight).toBe(false)

    const timecodes = JSON.parse(
      fs.readFileSync(
        path.join(bookDir, "adt", "content", "i18n", "en", "timecode", "timecode_output.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>
    expect(timecodes).toEqual({})
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
              nodes: [],
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

    const activityHtml = fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf-8")
    expect(activityHtml).not.toContain('role="activity"')
  })

  it("uses image_associated_text as a fallback alt source for single-image sections", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    const imagesDir = path.join(bookDir, "images")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(imagesDir, { recursive: true })
    createWebAssets(webAssetsDir)
    fs.writeFileSync(path.join(imagesDir, "pg001_im001.png"), "pngdata")

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: '<section data-section-type="content" data-section-id="pg001_sec001"><img data-id="pg001_im001" src="/api/books/book/images/pg001_im001"></section>',
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
              nodes: [
                {
                  nodeId: "pg001_sec001_ig001",
                  isPruned: false,
                  structure: "image_group",
                  children: [
                    {
                      nodeId: "pg001_im001",
                      isPruned: false,
                      role: "image",
                    },
                    {
                      nodeId: "pg001_gp001_tx001",
                      isPruned: false,
                      role: "caption",
                      text: "A lifecycle diagram with six stages",
                    },
                  ],
                },
              ],
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

    const pageHtml = fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf-8")
    expect(pageHtml).toContain('alt="A lifecycle diagram with six stages"')
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

  it("converts LaTeX math to MathML in output HTML and does not include MathJax script", async () => {
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
              sectionType: "content",
              reasoning: "ok",
              html: '<div>The area is $\\pi r^2$ and the fraction is $$\\frac{1}{2}$$</div>',
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
              nodes: [],
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
      title: "Math Book",
      webAssetsDir,
    })

    const pageHtml = fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf-8")
    // LaTeX should be replaced with MathML
    expect(pageHtml).toContain("<math")
    expect(pageHtml).not.toContain("$\\pi r^2$")
    expect(pageHtml).not.toContain("$$\\frac{1}{2}$$")
    // MathJax script should not be included (we use static MathML now)
    expect(pageHtml).not.toContain("mathjax")
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
              nodes: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionId: "pg001_sec002",
              sectionType: "content",
              nodes: [],
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

  it("invokes apps/adt-runtime/build.config.mjs when only pre-built ESM exists", async () => {
    // Lay out a fake monorepo root so buildJsBundle can resolve
    // <webAssetsDir>/../../apps/adt-runtime/build.config.mjs.
    const monorepoTmp = fs.mkdtempSync(path.join(os.tmpdir(), "adt-pkg-bundle-esm-"))
    const bookDir = path.join(monorepoTmp, "book")
    const webAssetsDir = path.join(monorepoTmp, "assets", "adt")
    const runtimeDir = path.join(monorepoTmp, "apps", "adt-runtime")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(webAssetsDir, { recursive: true })
    fs.mkdirSync(runtimeDir, { recursive: true })

    // Required non-bundle assets
    fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
    fs.writeFileSync(
      path.join(webAssetsDir, "tailwind_css.css"),
      "@tailwind base;\n",
    )

    // Partial pre-build: only ESM. The IIFE must be produced by invoking the
    // central build script.
    const preBuiltEsm = '/* pre-built ESM marker */\nconsole.log("esm");'
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), preBuiltEsm)

    // Fake build script writes both bundles into the expected location
    fs.writeFileSync(
      path.join(runtimeDir, "build.config.mjs"),
      [
        "import fs from 'node:fs'",
        "import path from 'node:path'",
        "import { fileURLToPath } from 'node:url'",
        "const __dirname = path.dirname(fileURLToPath(import.meta.url))",
        "const outDir = path.resolve(__dirname, '../../assets/adt')",
        "fs.writeFileSync(path.join(outDir, 'base.bundle.min.js'), '__ADT_BUILD_SCRIPT_ESM__')",
        "fs.writeFileSync(path.join(outDir, 'base.bundle.local.js'), '__ADT_BUILD_SCRIPT_IIFE__')",
      ].join("\n"),
    )

    try {
      const storage = createMinimalStorage()
      await packageAdtWeb(storage, {
        bookDir,
        label: "book",
        language: "en",
        outputLanguages: ["en"],
        title: "Test",
        webAssetsDir,
      })

      const assetsDir = path.join(bookDir, "adt", "assets")
      // Build script overwrote the partial ESM and produced the IIFE
      expect(fs.readFileSync(path.join(assetsDir, "base.bundle.min.js"), "utf-8")).toContain(
        "__ADT_BUILD_SCRIPT_ESM__",
      )
      expect(fs.readFileSync(path.join(assetsDir, "base.bundle.local.js"), "utf-8")).toContain(
        "__ADT_BUILD_SCRIPT_IIFE__",
      )
    } finally {
      fs.rmSync(monorepoTmp, { recursive: true, force: true })
    }
  })

  it("invokes apps/adt-runtime/build.config.mjs when only pre-built IIFE exists", async () => {
    const monorepoTmp = fs.mkdtempSync(path.join(os.tmpdir(), "adt-pkg-bundle-iife-"))
    const bookDir = path.join(monorepoTmp, "book")
    const webAssetsDir = path.join(monorepoTmp, "assets", "adt")
    const runtimeDir = path.join(monorepoTmp, "apps", "adt-runtime")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(webAssetsDir, { recursive: true })
    fs.mkdirSync(runtimeDir, { recursive: true })

    fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
    fs.writeFileSync(
      path.join(webAssetsDir, "tailwind_css.css"),
      "@tailwind base;\n",
    )

    // Partial pre-build: only IIFE
    const preBuiltIife = '/* pre-built IIFE marker */\nconsole.log("iife");'
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.local.js"), preBuiltIife)

    fs.writeFileSync(
      path.join(runtimeDir, "build.config.mjs"),
      [
        "import fs from 'node:fs'",
        "import path from 'node:path'",
        "import { fileURLToPath } from 'node:url'",
        "const __dirname = path.dirname(fileURLToPath(import.meta.url))",
        "const outDir = path.resolve(__dirname, '../../assets/adt')",
        "fs.writeFileSync(path.join(outDir, 'base.bundle.min.js'), '__ADT_BUILD_SCRIPT_ESM__')",
        "fs.writeFileSync(path.join(outDir, 'base.bundle.local.js'), '__ADT_BUILD_SCRIPT_IIFE__')",
      ].join("\n"),
    )

    try {
      const storage = createMinimalStorage()
      await packageAdtWeb(storage, {
        bookDir,
        label: "book",
        language: "en",
        outputLanguages: ["en"],
        title: "Test",
        webAssetsDir,
      })

      const assetsDir = path.join(bookDir, "adt", "assets")
      expect(fs.readFileSync(path.join(assetsDir, "base.bundle.min.js"), "utf-8")).toContain(
        "__ADT_BUILD_SCRIPT_ESM__",
      )
      expect(fs.readFileSync(path.join(assetsDir, "base.bundle.local.js"), "utf-8")).toContain(
        "__ADT_BUILD_SCRIPT_IIFE__",
      )
    } finally {
      fs.rmSync(monorepoTmp, { recursive: true, force: true })
    }
  })

  it("copies both bundles without rebuilding when both pre-built files exist", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    // Both pre-built — override createWebAssets defaults with distinct markers
    const esmContent = '/* pre-built ESM */\nconsole.log("esm");'
    const iifeContent = '/* pre-built IIFE */\nconsole.log("iife");'
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), esmContent)
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.local.js"), iifeContent)
    // The sourcemap stub from createWebAssets is irrelevant — buildJsBundle
    // does not copy it. Remove it so the assertion below tests the contract
    // (no .map in the output) rather than the fixture.
    fs.rmSync(path.join(webAssetsDir, "base.bundle.min.js.map"), { force: true })

    const storage = createMinimalStorage()
    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Test",
      webAssetsDir,
    })

    const assetsDir = path.join(bookDir, "adt", "assets")

    // Both files are exact copies of pre-built content
    expect(fs.readFileSync(path.join(assetsDir, "base.bundle.min.js"), "utf-8")).toBe(esmContent)
    expect(fs.readFileSync(path.join(assetsDir, "base.bundle.local.js"), "utf-8")).toBe(iifeContent)

    // buildJsBundle does not copy the sourcemap to the per-book output
    expect(fs.existsSync(path.join(assetsDir, "base.bundle.min.js.map"))).toBe(false)
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

  it("strips legacy section role attributes while rewriting HTML", () => {
    const html = `<div id="content"><section role="article" data-section-type="content"><img src="/api/books/mybook/images/abc123"></section></div>`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).not.toContain('role="article"')
    expect(out).toContain('<section data-section-type="content">')
  })


  it("normalizes shared activity_matching semantics while rewriting HTML", () => {
    const html = `<section data-section-type="activity_matching"><div class="activity-item" tabindex="0" data-activity-item="item-1">Word</div><div class="dropzone" tabindex="0" aria-label="Drop here" id="target1"><div id="dropzone-1" role="region" aria-live="polite"></div></div></section>`
    const { html: out } = rewriteImageUrls(html, "mybook", new Map())
    expect(out).toContain('class="activity-item" tabindex="0" data-activity-item="item-1" role="button"')
    expect(out).toContain('class="dropzone" tabindex="0" aria-label="Drop here" id="target1" role="button"')
    expect(out).toContain('id="dropzone-1" aria-live="polite" class="dropzone-slot"')
    expect(out).not.toContain('role="region"')
  })

  it("normalizes shared activity_true_false semantics while rewriting HTML", () => {
    const html = `<section data-section-type="activity_true_false"><label><input type="radio" value="true" aria-label="True" class="sr-only peer"><div class="choice-chip"></div></label><label><input type="radio" value="false" aria-label="False" class="sr-only peer"><div class="choice-chip"></div></label></section>`
    const { html: out } = rewriteImageUrls(html, "mybook", new Map())
    expect(out).not.toContain('aria-label="True"')
    expect(out).not.toContain('aria-label="False"')
    expect(out).toContain('<span class="sr-only" data-generated-a11y-label="true">True</span>')
    expect(out).toContain('<span class="sr-only" data-generated-a11y-label="true">False</span>')
  })

  it("normalizes shared activity_fill_in_a_table semantics while rewriting HTML", () => {
    const html = `<section data-section-type="activity_fill_in_a_table"><table><thead><tr><th data-id="a"></th><th data-id="b">Found it!</th><th data-id="c">Expression</th></tr></thead><tbody><tr><td data-id="d">0</td><td data-id="e"></td><td data-id="f"></td></tr></tbody></table><input type="text" id="field-1" data-activity-item="item-1"></section>`
    const { html: out } = rewriteImageUrls(html, "mybook", new Map())
    expect(out).toContain('<td data-id="a"></td>')
    expect(out).toContain('<th data-id="b" scope="col">Found it!</th>')
    expect(out).toContain('<th data-id="c" scope="col">Expression</th>')
    expect(out).toContain('<th data-id="d" scope="row">0</th>')
    expect(out).toContain('data-activity-item="item-1" aria-label="Answer"')
  })

  it("adds alt text from caption data when missing", () => {
    const html = `<img data-id="abc123" src="/api/books/mybook/images/abc123">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const altMap = new Map([["abc123", "A labeled diagram"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap, altMap)
    expect(out).toContain('alt="A labeled diagram"')
  })

  it("preserves existing alt text when caption data is also available", () => {
    const html = `<img data-id="abc123" src="/api/books/mybook/images/abc123" alt="Existing alt">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const altMap = new Map([["abc123", "Caption alt"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap, altMap)
    expect(out).toContain('alt="Existing alt"')
    expect(out).not.toContain('alt="Caption alt"')
  })


  it("writes empty alt text when the shared policy marks an inferred duplicate image as decorative", () => {
    const html = [
      `<img data-id="logo1" src="/api/books/mybook/images/logo1">`,
      `<img data-id="logo2" src="/api/books/mybook/images/logo2">`,
    ].join("")
    const imageMap = new Map([
      ["logo1", "logo1.png"],
      ["logo2", "logo2.png"],
    ])
    const altMap = new Map([
      ["logo1", "UNICEF logo with the words for every child."],
      ["logo2", ""],
    ])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap, altMap)
    expect(out).toContain('data-id="logo1" src="images/logo1.png" style="max-width: 100%; height: auto;" alt="UNICEF logo with the words for every child."')
    expect(out).toContain('data-id="logo2" src="images/logo2.png" style="max-width: 100%; height: auto;" alt=""')
  })

  it("marks decorative images with empty alt, role and aria-hidden, ignoring any caption", () => {
    const html = `<img data-id="deco1" src="/api/books/mybook/images/deco1">`
    const imageMap = new Map([["deco1", "deco1.png"]])
    const altMap = new Map([["deco1", "A caption that should be ignored"]])
    const decorative = new Set(["deco1"])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap, altMap, decorative)
    expect(out).toContain('alt=""')
    expect(out).toContain('role="presentation"')
    expect(out).toContain('aria-hidden="true"')
    expect(out).not.toContain("A caption that should be ignored")
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

describe("convertLatexToMathml", () => {
  it("converts inline $...$ LaTeX to MathML", () => {
    const result = convertLatexToMathml("<p>The equation $x^2$ is simple.</p>")
    expect(result).toContain("<math")
    expect(result).toContain("</math>")
    expect(result).not.toContain("$x^2$")
  })

  it("converts display $$...$$ LaTeX to MathML with display=block", () => {
    const result = convertLatexToMathml('<p>$$\\frac{1}{2}$$</p>')
    expect(result).toContain('display="block"')
    expect(result).toContain("<mfrac>")
  })

  it("converts \\(...\\) inline delimiters", () => {
    const result = convertLatexToMathml("<p>Inline \\(a + b\\) math</p>")
    expect(result).toContain("<math")
    expect(result).not.toContain("\\(a + b\\)")
  })

  it("converts \\[...\\] display delimiters", () => {
    const result = convertLatexToMathml("<p>\\[a + b = c\\]</p>")
    expect(result).toContain('display="block"')
  })

  it("leaves non-math content unchanged", () => {
    const html = "<p>No math here</p>"
    expect(convertLatexToMathml(html)).toBe(html)
  })

  it("leaves invalid LaTeX as-is on parse error", () => {
    const html = "<p>$\\invalid{$</p>"
    const result = convertLatexToMathml(html)
    // Should either convert or leave as-is, not throw
    expect(result).toContain("<p>")
  })

  it("handles multiple math expressions in one string", () => {
    const result = convertLatexToMathml("<p>$a$ and $b$</p>")
    const mathCount = (result.match(/<math/g) ?? []).length
    expect(mathCount).toBe(2)
  })

  it("converts undelimited LaTeX with \\text{} in text nodes", () => {
    const html = '<p data-id="tx001">V_{\\text{empilhamento I}} = 6\\ \\text{cubos}</p>'
    const result = convertLatexToMathml(html)
    expect(result).toContain("<math")
    expect(result).not.toContain("\\text{")
  })

  it("converts undelimited LaTeX with \\hat{} and ^\\circ", () => {
    const html = '<p data-id="tx001">m(A\\hat{O}B) + m(B\\hat{O}C) = 37^\\circ + 53^\\circ = 90^\\circ</p>'
    const result = convertLatexToMathml(html)
    expect(result).toContain("<math")
    expect(result).not.toContain("\\hat{")
  })

  it("does not modify text nodes without LaTeX", () => {
    const html = "<p>Just plain text here</p>"
    expect(convertLatexToMathml(html)).toBe(html)
  })
})

describe("convertLatexString", () => {
  it("converts undelimited LaTeX in plain text (text catalog entry)", () => {
    const text = "\\left(2\\frac{3}{4}x + 9\\right) + \\left(2\\frac{3}{4}x + 9\\right)"
    const result = convertLatexString(text)
    expect(result).toContain("<math")
    expect(result).not.toContain("\\frac")
    expect(result).not.toContain("\\left")
  })

  it("converts delimited LaTeX in plain text", () => {
    const result = convertLatexString("The area is $\\pi r^2$")
    expect(result).toContain("<math")
    expect(result).not.toContain("$\\pi")
  })

  it("leaves plain text without LaTeX unchanged", () => {
    const text = "Just a normal sentence."
    expect(convertLatexString(text)).toBe(text)
  })

  it("converts LaTeX with \\hat and ^\\circ", () => {
    const text = "m(A\\hat{O}B) = 37^\\circ"
    const result = convertLatexString(text)
    expect(result).toContain("<math")
    expect(result).not.toContain("\\hat{")
  })

  it("does not convert mixed prose with embedded math as a single expression", () => {
    const text = "the molecular structure space M = (X, V), where X ∈ ℝ^{N×3} denotes atomic coordinates"
    const result = convertLatexString(text)
    // Should NOT be wrapped in a single <math> tag — it's prose, not a formula
    expect(result).not.toMatch(/^<math/)
    // The original text should be largely preserved
    expect(result).toContain("molecular structure space")
  })
})

describe("convertLatexToMathml (HTML)", () => {
  it("does not convert mixed prose text nodes as math", () => {
    const html = '<p data-id="tx001">the retrieval-augmented diffusion process where X ∈ ℝ^{N×3} denotes atomic coordinates</p>'
    const result = convertLatexToMathml(html)
    // Should preserve the prose — not wrap in <math>
    expect(result).toContain("retrieval-augmented diffusion")
    expect(result).not.toMatch(/>.*<math.*retrieval/)
  })

  it("still converts pure math text nodes", () => {
    const html = '<p data-id="tx001">V_{\\text{empilhamento I}} = 6\\ \\text{cubos}</p>'
    const result = convertLatexToMathml(html)
    expect(result).toContain("<math")
  })

  it("does not convert snake_case identifiers in prose as math", () => {
    const html = '<p>Set the variable_name to the desired value and review snake_case style.</p>'
    const result = convertLatexToMathml(html)
    expect(result).toBe(html)
    expect(result).not.toContain("<math")
  })

  it("does not mangle snake_case words embedded in math-containing prose", () => {
    const html = '<p>Please configure the variable_name setting before running any experiments where X_i represents each independent measurement taken during the trial.</p>'
    const result = convertLatexToMathml(html)
    // snake_case word must be preserved verbatim
    expect(result).toContain("variable_name")
    // X_i should be converted to math
    expect(result).toContain("<math")
  })
})

describe("packageWebpub", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "package-webpub-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  async function buildAdtFirst(
    bookDir: string,
    webAssetsDir: string,
    storage: Storage,
    title = "Test Book",
  ) {
    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title,
      webAssetsDir,
    })
  }

  function setupBook() {
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
              sectionType: "content",
              reasoning: "ok",
              html: "<div>First page</div>",
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
              nodes: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
      metadata: {
        book: {
          title: "Test Book",
          authors: ["Author"],
          publisher: "Publisher",
          language_code: "en",
        },
      },
    })

    return { bookDir, webAssetsDir, storage }
  }

  it("disables showNavigationControls and showTutorial in config", async () => {
    const { bookDir, webAssetsDir, storage } = setupBook()
    await buildAdtFirst(bookDir, webAssetsDir, storage)
    packageWebpub(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Test Book",
      webAssetsDir,
    })

    const config = JSON.parse(
      fs.readFileSync(path.join(bookDir, "webpub", "assets", "config.json"), "utf-8"),
    )
    expect(config.features.showNavigationControls).toBe(false)
    expect(config.features.showTutorial).toBe(false)
  })

  it("injects CSS overrides into HTML pages", async () => {
    const { bookDir, webAssetsDir, storage } = setupBook()
    await buildAdtFirst(bookDir, webAssetsDir, storage)
    packageWebpub(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Test Book",
      webAssetsDir,
    })

    const html = fs.readFileSync(path.join(bookDir, "webpub", "index.html"), "utf-8")
    expect(html).toContain("columns: auto !important")
    expect(html).toContain("flex-direction: column !important")
    expect(html).toContain("max-width: 100% !important")
  })

  it("writes a valid webpub manifest with scrolled presentation", async () => {
    const { bookDir, webAssetsDir, storage } = setupBook()
    await buildAdtFirst(bookDir, webAssetsDir, storage)
    packageWebpub(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "My Test Book",
      webAssetsDir,
    })

    const manifest = JSON.parse(
      fs.readFileSync(path.join(bookDir, "webpub", "manifest.json"), "utf-8"),
    )
    expect(manifest["@context"]).toBe("https://readium.org/webpub-manifest/context.jsonld")
    expect(manifest.metadata.title).toBe("My Test Book")
    expect(manifest.metadata.language).toBe("en")
    expect(manifest.metadata.presentation.overflow).toBe("scrolled")
    expect(manifest.metadata.presentation.spread).toBe("none")
    expect(manifest.metadata.author).toBe("Author")
    expect(manifest.metadata.publisher).toBe("Publisher")
    expect(manifest.readingOrder).toHaveLength(1)
    expect(manifest.readingOrder[0].type).toBe("text/html")
    expect(manifest.readingOrder[0].href).toBe("index.html")
    expect(manifest.links[0]).toEqual({
      rel: "self",
      href: "manifest.json",
      type: "application/webpub+json",
    })
    expect(manifest.resources.length).toBeGreaterThan(0)
  })

  it("throws when ADT package has not been built", () => {
    const bookDir = path.join(tmpDir, "book")
    fs.mkdirSync(bookDir, { recursive: true })
    const storage = createMockStorage([], {})

    expect(() =>
      packageWebpub(storage, {
        bookDir,
        label: "book",
        language: "en",
        outputLanguages: ["en"],
        title: "Test",
        webAssetsDir: tmpDir,
      })
    ).toThrow("ADT package not found")
  })

  it("changes the packaging hash when a web asset changes without changing size", () => {
    const bookDir = path.join(tmpDir, "hash-book")
    const webAssetsDir = path.join(tmpDir, "hash-assets")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const assetPath = path.join(webAssetsDir, "base.js")
    fs.writeFileSync(assetPath, 'console.log("alpha")\n')
    fs.utimesSync(assetPath, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"))

    const storage = createMockStorage([], {})
    const baseOptions = {
      storage,
      bookDir,
      label: "hash-book",
      language: "en",
      outputLanguages: ["en"],
      title: "Hash Book",
      webAssetsDir,
      config: {},
    }

    const firstHash = computePackagingInputHash(baseOptions)

    fs.writeFileSync(assetPath, 'console.log("omega")\n')
    fs.utimesSync(assetPath, new Date("2026-01-02T00:00:00.000Z"), new Date("2026-01-02T00:00:00.000Z"))

    const secondHash = computePackagingInputHash(baseOptions)

    expect('console.log("alpha")\n'.length).toBe('console.log("omega")\n'.length)
    expect(firstHash).not.toBe(secondHash)
  })

  it("changes the packaging hash when node data changes without changing versions", () => {
    const bookDir = path.join(tmpDir, "hash-book-data")
    const webAssetsDir = path.join(tmpDir, "hash-assets-data")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const nodeData = {
      "easy-read": {
        book: {
          blocks: [
            {
              entries: [
                { easyReadId: "tx001_easy_read", text: "Easy Read text one" },
              ],
            },
          ],
        },
      },
    }
    const storage = createMockStorage([], nodeData)
    const baseOptions = {
      storage,
      bookDir,
      label: "hash-book-data",
      language: "en",
      outputLanguages: ["en"],
      title: "Hash Book",
      webAssetsDir,
      config: {},
    }

    const firstHash = computePackagingInputHash(baseOptions)
    nodeData["easy-read"].book = {
      blocks: [
        {
          entries: [
            { easyReadId: "tx001_easy_read", text: "Easy Read text two" },
          ],
        },
      ],
    }
    const secondHash = computePackagingInputHash(baseOptions)

    expect(firstHash).not.toBe(secondHash)
  })
})
