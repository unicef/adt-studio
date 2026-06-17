import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createAdtPreviewRoutes } from "./adt-preview.js"

describe("ADT preview routes", () => {
  let tmpDir: string
  let webAssetsDir: string
  const label = "preview-book"

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-preview-route-"))
    webAssetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-preview-assets-"))
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), "console.log('ok')")

    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one",
        pageImage: {
          imageId: `${label}_p1_page`,
          buffer: Buffer.from("fake-png-data"),
          format: "png",
          hash: "hash-1",
          width: 100,
          height: 100,
        },
        images: [],
      })

      storage.putNodeData("metadata", "book", {
        title: "Preview Book",
        language_code: "en",
        reasoning: "test",
      })
      storage.putNodeData("config", "book", { language: "en" })
      storage.putNodeData("page-sectioning", `${label}_p1`, {
        reasoning: "ok",
        sections: [
          {
            sectionId: `${label}_p1_sec001`,
            sectionType: "content",
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
            nodes: [],
          },
          {
            sectionId: `${label}_p1_sec002`,
            sectionType: "content",
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
            nodes: [
              {
                nodeId: `${label}_p1_n001`,
                isPruned: false,
                structure: "image_group",
                children: [
                  { nodeId: "hero-image", isPruned: false, role: "image" },
                ],
              },
              {
                nodeId: `${label}_p1_n002`,
                isPruned: false,
                structure: "image_group",
                children: [
                  { nodeId: "hero-image-duplicate", isPruned: false, role: "image" },
                ],
              },
            ],
          },
        ],
      })
      storage.putNodeData("image-captioning", `${label}_p1`, {
        captions: [
          { imageId: "hero-image", caption: "Preview hero image" },
          { imageId: "hero-image-duplicate", caption: "Preview hero image" },
        ],
      })
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec001"><p>First section body</p></section>`,
          },
          {
            sectionIndex: 1,
            sectionType: "content",
            reasoning: "ok",
            html: `<section role="article" data-section-id="${label}_p1_sec002"><img data-id="hero-image" src="/api/books/${label}/images/hero-image"><img data-id="hero-image-duplicate" src="/api/books/${label}/images/hero-image-duplicate"><p>Second section body</p></section>`,
          },
        ],
      })
    } finally {
      storage.close()
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(webAssetsDir, { recursive: true, force: true })
  })

  it("auto-builds base.bundle.min.js by invoking apps/adt-runtime/build.config.mjs when stale", async () => {
    // The preview route resolves `apps/adt-runtime/build.config.mjs` relative
    // to `<webAssetsDir>/../../`. To exercise the auto-build path we lay out
    // a fake monorepo root that mirrors that resolution.
    const monorepoTmp = fs.mkdtempSync(path.join(os.tmpdir(), "adt-preview-monorepo-"))
    const fakeWebAssets = path.join(monorepoTmp, "assets", "adt")
    const runtimeDir = path.join(monorepoTmp, "apps", "adt-runtime")
    const runtimeSrc = path.join(runtimeDir, "src")
    fs.mkdirSync(fakeWebAssets, { recursive: true })
    fs.mkdirSync(runtimeSrc, { recursive: true })
    // Reuse the same book storage layout in the new webAssetsDir
    fs.writeFileSync(path.join(runtimeSrc, "boot.tsx"), "// fake source")
    // Fake build script writes the bundle into the expected location
    fs.writeFileSync(
      path.join(runtimeDir, "build.config.mjs"),
      [
        "import fs from 'node:fs'",
        "import path from 'node:path'",
        "import { fileURLToPath } from 'node:url'",
        "const __dirname = path.dirname(fileURLToPath(import.meta.url))",
        "const outDir = path.resolve(__dirname, '../../assets/adt')",
        "fs.mkdirSync(outDir, { recursive: true })",
        "fs.writeFileSync(path.join(outDir, 'base.bundle.min.js'), '/* auto-built */')",
      ].join("\n"),
    )

    try {
      const app = createAdtPreviewRoutes(tmpDir, fakeWebAssets, path.resolve(process.cwd(), "config.yaml"))
      const res = await app.request(`/books/${label}/adt-preview/assets/base.bundle.min.js`)

      expect(res.status).toBe(200)
      const bundlePath = path.join(fakeWebAssets, "base.bundle.min.js")
      expect(fs.existsSync(bundlePath)).toBe(true)
      expect(fs.readFileSync(bundlePath, "utf-8")).toContain("auto-built")
    } finally {
      fs.rmSync(monorepoTmp, { recursive: true, force: true })
    }
  })

  it("renders the requested section id instead of falling back to the first section", async () => {
    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/${label}_p1_sec002.html`)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("Second section body")
    expect(html).not.toContain("First section body")
  })

  it("returns 404 for unknown section ids on an existing page", async () => {
    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/${label}_p1_sec999.html`)

    expect(res.status).toBe(404)
  })


  it("applies shared section-role cleanup and image alt fallbacks in preview output", async () => {
    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/${label}_p1_sec002.html`)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).not.toContain('role="article"')
    expect(html).toContain('data-id="hero-image" src="/api/books/preview-book/images/hero-image" alt="Preview hero image"')
    expect(html).toContain('data-id="hero-image-duplicate" src="/api/books/preview-book/images/hero-image-duplicate" alt=""')
  })

  it("hides decorative images from assistive tech in preview output", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("image-captioning", `${label}_p1`, {
        captions: [
          { imageId: "hero-image", caption: "", decorative: true },
          { imageId: "hero-image-duplicate", caption: "Preview hero image" },
        ],
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/${label}_p1_sec002.html`)

    expect(res.status).toBe(200)
    const html = await res.text()
    // Decorative image: empty alt, presentation role, hidden from a11y tree.
    expect(html).toMatch(/data-id="hero-image"[^>]*\srole="presentation"/)
    expect(html).toMatch(/data-id="hero-image"[^>]*\saria-hidden="true"/)
    // Non-decorative image still gets its caption as alt.
    expect(html).toContain('data-id="hero-image-duplicate" src="/api/books/preview-book/images/hero-image-duplicate" alt="Preview hero image"')
  })

  it("preserves preview image-alt cleanup while converting latex to mathml", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec001"><p>First section body</p></section>`,
          },
          {
            sectionIndex: 1,
            sectionType: "content",
            reasoning: "ok",
            html: `<section role="article" data-section-id="${label}_p1_sec002"><img data-id="hero-image" src="/api/books/${label}/images/hero-image"><p>The area is $\pi r^2$</p></section>`,
          },
        ],
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/${label}_p1_sec002.html`)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).not.toContain('role="article"')
    expect(html).toContain('alt="Preview hero image"')
    expect(html).toContain('<math')
  })

  it("includes quiz pages anchored to pages without rendered sections in pages.json", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: `${label}_p2`,
        pageNumber: 2,
        text: "Page two",
        pageImage: {
          imageId: `${label}_p2_page`,
          buffer: Buffer.from("fake-png-data-2"),
          format: "png",
          hash: "hash-2",
          width: 100,
          height: 100,
        },
        images: [],
      })
      storage.putNodeData("quiz-generation", "book", {
        generatedAt: "2026-01-01T00:00:00.000Z",
        language: "en",
        pagesPerQuiz: 3,
        quizzes: [
          {
            quizIndex: 0,
            afterPageId: `${label}_p2`,
            pageIds: [`${label}_p2`],
            question: "What is 2+2?",
            options: [
              { text: "3", explanation: "Nope" },
              { text: "4", explanation: "Yes" },
            ],
            answerIndex: 1,
            reasoning: "test",
          },
        ],
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/content/pages.json`)

    expect(res.status).toBe(200)
    const pages = await res.json() as Array<{ section_id: string; href: string }>
    expect(pages.at(-1)).toEqual({ section_id: "qz001", href: "qz001.html" })
  })

  it("serves runtime timecodes and enables highlight when word timestamps exist", async () => {
    fs.writeFileSync(
      path.join(tmpDir, label, "config.yaml"),
      "speech:\n  word_highlighting: true\n",
    )
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("tts", "en", {
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
      })
      storage.putNodeData("tts-timestamps", "en", {
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
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))

    const timecodeRes = await app.request(
      `/books/${label}/adt-preview/content/i18n/en/timecode/timecode_output.json`,
    )
    expect(timecodeRes.status).toBe(200)
    expect(await timecodeRes.json()).toEqual({
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

    const configRes = await app.request(`/books/${label}/adt-preview/assets/config.json`)
    expect(configRes.status).toBe(200)
    const config = await configRes.json() as { bundleVersion: string; features: { highlight: boolean } }
    expect(config.features.highlight).toBe(true)
    expect(config.bundleVersion).not.toBe("1")
  })

  it("enables highlight fallback when TTS exists without stored word timestamps", async () => {
    fs.writeFileSync(
      path.join(tmpDir, label, "config.yaml"),
      "speech:\n  word_highlighting: true\n",
    )
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("tts", "en", {
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
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))

    const timecodeRes = await app.request(
      `/books/${label}/adt-preview/content/i18n/en/timecode/timecode_output.json`,
    )
    expect(timecodeRes.status).toBe(200)
    expect(await timecodeRes.json()).toEqual({})

    const configRes = await app.request(`/books/${label}/adt-preview/assets/config.json`)
    expect(configRes.status).toBe(200)
    const config = await configRes.json() as { features: { readAloud: boolean; highlight: boolean } }
    expect(config.features.readAloud).toBe(true)
    expect(config.features.highlight).toBe(true)
  })

  it("disables word-level highlight when speech.word_highlighting is false", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("tts", "en", {
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
      })
      storage.putNodeData("tts-timestamps", "en", {
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
      })
    } finally {
      storage.close()
    }

    fs.writeFileSync(
      path.join(tmpDir, label, "config.yaml"),
      "speech:\n  word_highlighting: false\n",
    )

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))

    const configRes = await app.request(`/books/${label}/adt-preview/assets/config.json`)
    expect(configRes.status).toBe(200)
    const config = await configRes.json() as { features: { readAloud: boolean; highlight: boolean } }
    expect(config.features.readAloud).toBe(true)
    expect(config.features.highlight).toBe(false)

    const timecodeRes = await app.request(
      `/books/${label}/adt-preview/content/i18n/en/timecode/timecode_output.json`,
    )
    expect(timecodeRes.status).toBe(200)
    expect(await timecodeRes.json()).toEqual({})
  })

  it("cache-busts embedded preview assets with the latest bundle source version", async () => {
    // bundleVersion derives from the highest mtime in apps/adt-runtime/src/**
    // (plus mtimes of any pre-built bundles in webAssetsDir). Lay out a fake
    // monorepo root so we can control the source-tree mtime.
    const monorepoTmp = fs.mkdtempSync(path.join(os.tmpdir(), "adt-preview-version-"))
    const fakeWebAssets = path.join(monorepoTmp, "assets", "adt")
    const runtimeSrc = path.join(monorepoTmp, "apps", "adt-runtime", "src")
    fs.mkdirSync(fakeWebAssets, { recursive: true })
    fs.mkdirSync(runtimeSrc, { recursive: true })
    // Seed the storage in a fresh tmpDir to keep the preview route happy
    const monorepoBooks = path.join(monorepoTmp, "books")
    fs.mkdirSync(monorepoBooks, { recursive: true })
    // Re-seed minimal book data in the new books dir
    const storage = createBookStorage(label, monorepoBooks)
    try {
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one",
        pageImage: {
          imageId: `${label}_p1_page`,
          buffer: Buffer.from("fake-png-data"),
          format: "png",
          hash: "hash-1",
          width: 100,
          height: 100,
        },
        images: [],
      })
      storage.putNodeData("metadata", "book", {
        title: "Preview Book",
        language_code: "en",
        reasoning: "test",
      })
      storage.putNodeData("config", "book", { language: "en" })
      storage.putNodeData("page-sectioning", `${label}_p1`, {
        reasoning: "ok",
        sections: [
          {
            sectionId: `${label}_p1_sec001`,
            sectionType: "content",
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
            nodes: [],
          },
        ],
      })
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec001"><p>First section body</p></section>`,
          },
        ],
      })
    } finally {
      storage.close()
    }

    const sourceFile = path.join(runtimeSrc, "boot.tsx")
    fs.writeFileSync(sourceFile, "// preview source\n")
    const expectedVersion = new Date("2030-01-01T00:00:00.000Z")
    fs.utimesSync(sourceFile, expectedVersion, expectedVersion)

    try {
      const app = createAdtPreviewRoutes(monorepoBooks, fakeWebAssets, path.resolve(process.cwd(), "config.yaml"))

      const configRes = await app.request(`/books/${label}/adt-preview/assets/config.json`)
      expect(configRes.status).toBe(200)
      const config = await configRes.json() as { bundleVersion: string }

      const htmlRes = await app.request(`/books/${label}/adt-preview/${label}_p1_sec001.html?embed=1`)
      expect(htmlRes.status).toBe(200)
      const html = await htmlRes.text()

      expect(config.bundleVersion).toMatch(new RegExp(`^${Math.trunc(expectedVersion.getTime())}-[a-f0-9]{12}$`))
      expect(html).toContain(`./assets/base.bundle.min.js?v=${config.bundleVersion}`)

      const beforeEasyReadVersion = config.bundleVersion
      const updatedStorage = createBookStorage(label, monorepoBooks)
      try {
        updatedStorage.putNodeData("easy-read", "book", {
          generatedAt: "2030-01-01T00:00:00.000Z",
          blocks: [],
        })
      } finally {
        updatedStorage.close()
      }

      const updatedConfigRes = await app.request(`/books/${label}/adt-preview/assets/config.json`)
      expect(updatedConfigRes.status).toBe(200)
      const updatedConfig = await updatedConfigRes.json() as { bundleVersion: string }
      expect(updatedConfig.bundleVersion).toMatch(new RegExp(`^${Math.trunc(expectedVersion.getTime())}-[a-f0-9]{12}$`))
      expect(updatedConfig.bundleVersion).not.toBe(beforeEasyReadVersion)
    } finally {
      fs.rmSync(monorepoTmp, { recursive: true, force: true })
    }
  })

  it("uses metadata language for preview i18n when no config language is stored", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.clearNodesByType(["config"])
      storage.putNodeData("metadata", "book", {
        title: "Preview Book",
        language_code: "es",
        reasoning: "test",
      })
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec001"><p data-id="pg001_tx001">Texto original.</p></section>`,
          },
        ],
      })
      storage.putNodeData("easy-read", "book", {
        generatedAt: "2026-01-01T00:00:00.000Z",
        blocks: [
          {
            pageId: `${label}_p1`,
            pageNumber: 1,
            sectionId: `${label}_p1_sec001`,
            sectionIndex: 0,
            sectionType: "content",
            entries: [
              {
                sourceId: "pg001_tx001",
                easyReadId: "pg001_tx001_easy_read",
                originalText: "Texto original.",
                text: "Texto facil.",
                pageId: `${label}_p1`,
                sectionId: `${label}_p1_sec001`,
                sectionIndex: 0,
              },
            ],
          },
        ],
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))

    const configRes = await app.request(`/books/${label}/adt-preview/assets/config.json`)
    expect(configRes.status).toBe(200)
    expect(configRes.headers.get("Cache-Control")).toBe("no-store, max-age=0")
    const config = await configRes.json() as { languages: { available: string[]; default: string } }
    expect(config.languages).toEqual({ available: ["es"], default: "es" })

    const textsRes = await app.request(`/books/${label}/adt-preview/content/i18n/es/texts.json`)
    expect(textsRes.status).toBe(200)
    expect(textsRes.headers.get("Cache-Control")).toBe("no-store, max-age=0")
    const texts = await textsRes.json() as Record<string, string>
    expect(texts.pg001_tx001).toBe("Texto original.")
    expect(texts.pg001_tx001_easy_read).toBe("Texto facil.")
  })

  it("orders pages.json sections by sectionIndex when rendering rows are out of order", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 1,
            sectionType: "content",
            reasoning: "ok",
            html: `<section role="article" data-section-id="${label}_p1_sec002"><img data-id="hero-image" src="/api/books/${label}/images/hero-image"><img data-id="hero-image-duplicate" src="/api/books/${label}/images/hero-image-duplicate"><p>Second section body</p></section>`,
          },
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec001"><p>First section body</p></section>`,
          },
        ],
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/content/pages.json`)

    expect(res.status).toBe(200)
    const pages = await res.json() as Array<{ section_id: string; href: string }>
    expect(pages[0]).toEqual({ section_id: `${label}_p1_sec001`, href: `${label}_p1_sec001.html`, page_number: 1 })
    expect(pages[1]).toEqual({ section_id: `${label}_p1_sec002`, href: `${label}_p1_sec002.html`, page_number: 1 })
  })
})
