import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import {
  WebRenderingOutput,
  PageSectioningOutput,
  type TextCatalogOutput,
  type GlossaryOutput,
  type QuizGenerationOutput,
  type TTSOutput,
  type Quiz,
} from "@adt/types"
import { createBookStorage, type Storage } from "@adt/storage"
import {
  renderPageHtml,
  NAV_HTML,
  buildPreviewTailwindCss,
  buildGlossaryJson,
  getBaseLanguage,
  normalizeLocale,
  renderQuizHtml,
  buildQuizAnswers,
  buildTextCatalog,
  pad3,
  loadBookConfig,
} from "@adt/pipeline"

// ---------------------------------------------------------------------------
// MIME type helper
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".map": "application/json",
  ".dic": "application/octet-stream",
}

function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
}

// ---------------------------------------------------------------------------
// Caches (built lazily per book)
// ---------------------------------------------------------------------------

// No Tailwind cache — preview is a dev tool; staleness causes more pain than rebuild cost

// ---------------------------------------------------------------------------
// Helpers to read book data from storage
// ---------------------------------------------------------------------------

function getBookLanguage(storage: Storage): string {
  const configRow = storage.getLatestNodeData("config", "book")
  const config = configRow?.data as { language?: string } | undefined
  return normalizeLocale(config?.language ?? "en")
}

function getBookTitle(storage: Storage): string {
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as { title?: string | null } | undefined
  return metadata?.title ?? "ADT Preview"
}

function getTextCatalog(storage: Storage): TextCatalogOutput {
  const pages = storage.getPages()
  return buildTextCatalog(storage, pages)
}

function getGlossary(storage: Storage): GlossaryOutput | undefined {
  const row = storage.getLatestNodeData("glossary", "book")
  return row?.data as GlossaryOutput | undefined
}

function getQuizData(storage: Storage): QuizGenerationOutput | undefined {
  const row = storage.getLatestNodeData("quiz-generation", "book")
  return row?.data as QuizGenerationOutput | undefined
}

function buildTextsMap(
  storage: Storage,
  lang: string,
  sourceLanguage: string,
  catalog: TextCatalogOutput | undefined,
): Record<string, string> {
  const normalizedLang = normalizeLocale(lang)
  const baseLang = getBaseLanguage(normalizedLang)
  const textsMap: Record<string, string> = {}

  if (baseLang === sourceLanguage) {
    if (catalog?.entries) {
      for (const e of catalog.entries) textsMap[e.id] = e.text
    }
  } else {
    const legacyLang = normalizedLang.replace("-", "_")
    const transRow =
      storage.getLatestNodeData("text-catalog-translation", normalizedLang) ??
      storage.getLatestNodeData("text-catalog-translation", legacyLang)
    if (transRow) {
      const translated = transRow.data as TextCatalogOutput
      for (const e of translated.entries) textsMap[e.id] = e.text
    }
  }
  return textsMap
}

/** Build the pages.json manifest — one entry per rendered section, interleaving quiz pages */
function buildPagesManifest(storage: Storage): Array<{ section_id: string; href: string; page_number?: number }> {
  const pages = storage.getPages()
  const quizData = getQuizData(storage)

  // Build a map from afterPageId -> quizzes for interleaving
  const quizzesByAfterPageId = new Map<string, Quiz[]>()
  if (quizData?.quizzes) {
    for (const quiz of quizData.quizzes) {
      const existing = quizzesByAfterPageId.get(quiz.afterPageId) ?? []
      existing.push(quiz)
      quizzesByAfterPageId.set(quiz.afterPageId, existing)
    }
  }

  const list: Array<{ section_id: string; href: string; page_number?: number }> = []
  for (const page of pages) {
    const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
    if (renderRow) {
      const parsed = WebRenderingOutput.safeParse(renderRow.data)
      if (parsed.success && parsed.data.sections.length > 0) {
        // Get sectioning data for sectionIds and page numbers
        const sectioningRow = storage.getLatestNodeData("page-sectioning", page.pageId)
        const sectioningParsed = sectioningRow
          ? PageSectioningOutput.safeParse(sectioningRow.data)
          : null
        const sectioning = sectioningParsed?.success ? sectioningParsed.data : undefined

        // One entry per rendered section (stable by sectionIndex)
        const sections = [...parsed.data.sections].sort((a, b) => a.sectionIndex - b.sectionIndex)
        for (const rs of sections) {
          const sectionMeta = sectioning?.sections?.[rs.sectionIndex]
          const sectionId = sectionMeta?.sectionId ?? `${page.pageId}_sec${String(rs.sectionIndex + 1).padStart(3, "0")}`
          const entry: { section_id: string; href: string; page_number?: number } = {
            section_id: sectionId,
            href: `${sectionId}.html`,
          }
          if (sectionMeta?.pageNumber !== null && sectionMeta?.pageNumber !== undefined) {
            entry.page_number = sectionMeta.pageNumber
          }
          list.push(entry)
        }
      }
    }

    // Insert quiz pages after this page
    const quizzes = quizzesByAfterPageId.get(page.pageId)
    if (quizzes) {
      for (const quiz of quizzes) {
        const quizIndex = quizData!.quizzes.indexOf(quiz)
        const quizId = `qz${pad3(quizIndex + 1)}`
        list.push({ section_id: quizId, href: `${quizId}.html` })
      }
    }
  }
  return list
}

/** Build config.json that reflects actual book capabilities */
function buildPreviewConfig(storage: Storage, language: string) {
  const glossary = getGlossary(storage)
  const hasGlossary = glossary !== undefined && glossary.items.length > 0

  const legacyLanguage = language.replace("-", "_")
  const ttsRow =
    storage.getLatestNodeData("tts", language) ??
    storage.getLatestNodeData("tts", legacyLanguage)
  const hasTTS = ttsRow !== null

  const quizRow = storage.getLatestNodeData("quiz-generation", "book")
  const quizData = quizRow?.data as { quizzes?: unknown[] } | undefined
  const hasQuiz = quizData !== undefined && (quizData.quizzes?.length ?? 0) > 0

  // Also check if any rendered sections are activity types
  let hasActivitySections = false
  if (!hasQuiz) {
    const pages = storage.getPages()
    for (const page of pages) {
      const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
      if (renderRow) {
        const parsed = WebRenderingOutput.safeParse(renderRow.data)
        if (parsed.success) {
          if (parsed.data.sections.some((s) => s.sectionType.startsWith("activity_"))) {
            hasActivitySections = true
            break
          }
        }
      }
    }
  }

  return {
    title: getBookTitle(storage),
    bundleVersion: "1",
    languages: {
      available: [language],
      default: language,
    },
    features: {
      signLanguage: false,
      easyRead: false,
      glossary: hasGlossary,
      eli5: false,
      readAloud: hasTTS,
      autoplay: false,
      showTutorial: false,
      showNavigationControls: true,
      describeImages: false,
      notepad: false,
      state: false,
      characterDisplay: false,
      highlight: false,
      activities: hasQuiz || hasActivitySections,
    },
    analytics: {
      enabled: false,
      siteId: 0,
      trackerUrl: "",
      srcUrl: "",
    },
  }
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createAdtPreviewRoutes(
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
): Hono {
  const app = new Hono()

  // Allow browser caching — the iframe URL includes a cache-busting version
  // parameter (v-{timestamp}) that changes on repackage, so stale content
  // is never served while repeat requests within the same session are fast.


  // Helper: resolve book + validate
  function resolveBook(label: string) {
    const safeLabel = parseBookLabel(label)
    const resolvedBooksDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedBooksDir, safeLabel)
    if (!fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }
    return { safeLabel, bookDir }
  }

  /** Open storage, run callback, close on exit */
  function withStorage<T>(label: string, fn: (storage: Storage, safeLabel: string, bookDir: string) => T): T {
    const { safeLabel, bookDir } = resolveBook(label)
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      return fn(storage, safeLabel, bookDir)
    } finally {
      storage.close()
    }
  }

  // /assets/config.json — Dynamic config reflecting book capabilities
  app.get("/books/:label/adt-preview/assets/config.json", (c) => {
    const config = withStorage(c.req.param("label"), (storage) => {
      const language = getBookLanguage(storage)
      return buildPreviewConfig(storage, language)
    })
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(config))
  })

  // /assets/* — Static files from webAssetsDir
  app.get("/books/:label/adt-preview/assets/*", (c) => {
    resolveBook(c.req.param("label")) // validate label
    const assetPath = c.req.path.split("/adt-preview/assets/")[1]
    if (!assetPath) throw new HTTPException(400, { message: "Missing asset path" })

    // Prevent path traversal
    const resolved = path.resolve(webAssetsDir, assetPath)
    if (!resolved.startsWith(path.resolve(webAssetsDir))) {
      throw new HTTPException(403, { message: "Forbidden" })
    }

    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      throw new HTTPException(404, { message: "Asset not found" })
    }

    c.header("Content-Type", getMimeType(resolved))
    return c.body(fs.readFileSync(resolved))
  })

  // /content/pages.json — All rendered pages
  app.get("/books/:label/adt-preview/content/pages.json", (c) => {
    const pages = withStorage(c.req.param("label"), (storage) => buildPagesManifest(storage))
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(pages))
  })

  // /content/toc.json
  app.get("/books/:label/adt-preview/content/toc.json", (c) => {
    resolveBook(c.req.param("label"))
    c.header("Content-Type", "application/json")
    return c.body("[]")
  })

  // /content/navigation/nav.html
  app.get("/books/:label/adt-preview/content/navigation/nav.html", (c) => {
    resolveBook(c.req.param("label"))
    c.header("Content-Type", "text/html; charset=utf-8")
    return c.body(NAV_HTML)
  })

  // /content/tailwind_output.css — rebuilt on every request (no cache, dev tool)
  app.get("/books/:label/adt-preview/content/tailwind_output.css", async (c) => {
    const { safeLabel } = resolveBook(c.req.param("label"))

    const storage = createBookStorage(safeLabel, booksDir)
    let css: string
    try {
      const pages = storage.getPages()
      let allHtml = ""
      for (const page of pages) {
        const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
        if (renderRow) {
          const parsed = WebRenderingOutput.safeParse(renderRow.data)
          if (parsed.success) {
            for (const section of parsed.data.sections) {
              allHtml += section.html + "\n"
            }
          }
        }
      }

      // Include quiz HTML so Tailwind scans quiz classes
      const quizData = getQuizData(storage)
      const catalog = getTextCatalog(storage)
      if (quizData?.quizzes) {
        for (let i = 0; i < quizData.quizzes.length; i++) {
          const quizId = `qz${pad3(i + 1)}`
          allHtml += renderQuizHtml(quizData.quizzes[i], quizId, catalog) + "\n"
        }
      }

      css = await buildPreviewTailwindCss(allHtml, webAssetsDir)
    } finally {
      storage.close()
    }

    c.header("Content-Type", "text/css")
    return c.body(css)
  })

  // /content/i18n/:lang/texts.json — Text catalog
  app.get("/books/:label/adt-preview/content/i18n/:lang/texts.json", (c) => {
    const lang = c.req.param("lang")
    const textsMap = withStorage(c.req.param("label"), (storage) => {
      const language = getBookLanguage(storage)
      const sourceLanguage = getBaseLanguage(language)
      const catalog = getTextCatalog(storage)
      return buildTextsMap(storage, lang, sourceLanguage, catalog)
    })
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(textsMap))
  })

  // /content/i18n/:lang/glossary.json — Glossary data
  app.get("/books/:label/adt-preview/content/i18n/:lang/glossary.json", (c) => {
    const lang = c.req.param("lang")
    const glossaryJson = withStorage(c.req.param("label"), (storage) => {
      const language = getBookLanguage(storage)
      const sourceLanguage = getBaseLanguage(language)
      const catalog = getTextCatalog(storage)
      const glossary = getGlossary(storage)
      const textsMap = buildTextsMap(storage, lang, sourceLanguage, catalog)
      const baseLang = getBaseLanguage(lang)
      return buildGlossaryJson(glossary, catalog, textsMap, baseLang === sourceLanguage)
    })
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(glossaryJson))
  })

  // /content/i18n/:lang/audios.json — Audio file mapping
  app.get("/books/:label/adt-preview/content/i18n/:lang/audios.json", (c) => {
    const lang = normalizeLocale(c.req.param("lang"))
    const audioMap = withStorage(c.req.param("label"), (storage) => {
      const legacyLang = lang.replace("-", "_")
      const ttsRow =
        storage.getLatestNodeData("tts", lang) ??
        storage.getLatestNodeData("tts", legacyLang)
      const ttsData = ttsRow?.data as TTSOutput | undefined
      const map: Record<string, string> = {}
      if (ttsData?.entries) {
        for (const entry of ttsData.entries) map[entry.textId] = entry.fileName
      }
      return map
    })
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(audioMap))
  })

  // /content/i18n/:lang/videos.json — Empty (no video support in preview)
  app.get("/books/:label/adt-preview/content/i18n/:lang/videos.json", (c) => {
    resolveBook(c.req.param("label"))
    c.header("Content-Type", "application/json")
    return c.body("{}")
  })

  // /content/i18n/:lang/audio/* — Serve audio files
  app.get("/books/:label/adt-preview/content/i18n/:lang/audio/*", (c) => {
    const { label } = c.req.param()
    const lang = normalizeLocale(c.req.param("lang"))
    const legacyLang = lang.replace("-", "_")
    const { bookDir } = resolveBook(label)

    const audioFile = c.req.path.split(`/audio/`).pop()
    if (!audioFile) throw new HTTPException(400, { message: "Missing audio path" })

    const preferredAudioDir = path.join(bookDir, "audio", lang)
    const legacyAudioDir = path.join(bookDir, "audio", legacyLang)
    const audioDir = fs.existsSync(preferredAudioDir) ? preferredAudioDir : legacyAudioDir
    const resolved = path.resolve(audioDir, audioFile)
    if (!resolved.startsWith(path.resolve(audioDir))) {
      throw new HTTPException(403, { message: "Forbidden" })
    }

    if (!fs.existsSync(resolved)) {
      throw new HTTPException(404, { message: "Audio file not found" })
    }

    c.header("Content-Type", getMimeType(resolved))
    return c.body(fs.readFileSync(resolved))
  })

  // /images/* — Proxy to book images directory
  app.get("/books/:label/adt-preview/images/*", (c) => {
    const { label } = c.req.param()
    const { bookDir } = resolveBook(label)
    const imagePath = c.req.path.split("/adt-preview/images/")[1]
    if (!imagePath) throw new HTTPException(400, { message: "Missing image path" })

    const imagesDir = path.join(bookDir, "images")
    const resolved = path.resolve(imagesDir, imagePath)
    if (!resolved.startsWith(path.resolve(imagesDir))) {
      throw new HTTPException(403, { message: "Forbidden" })
    }

    if (!fs.existsSync(resolved)) {
      throw new HTTPException(404, { message: "Image not found" })
    }

    c.header("Content-Type", getMimeType(resolved))
    return c.body(fs.readFileSync(resolved))
  })

  // /:pageId.html — Rendered page with ADT bundle chrome
  // Registered last so specific content/assets/images routes match first
  app.get("/books/:label/adt-preview/:filename", (c) => {
    const { label, filename } = c.req.param()
    if (!filename.endsWith(".html")) throw new HTTPException(404, { message: "Not found" })
    const pageId = filename.replace(/\.html$/, "")

    const safeLabel = parseBookLabel(label)
    const config = loadBookConfig(safeLabel, booksDir, configPath)
    const applyBodyBackground = config.apply_body_background
    const embed = c.req.query("embed") === "1"

    return withStorage(label, (storage) => {
      const title = getBookTitle(storage)
      const language = getBookLanguage(storage)

      // Check if this is a quiz page (qzNNN)
      const quizMatch = pageId.match(/^qz(\d{3})$/)
      if (quizMatch) {
        const quizIndex = parseInt(quizMatch[1], 10) - 1
        const quizData = getQuizData(storage)
        if (!quizData?.quizzes || quizIndex < 0 || quizIndex >= quizData.quizzes.length) {
          throw new HTTPException(404, { message: `No quiz data for: ${pageId}` })
        }
        const quiz = quizData.quizzes[quizIndex]
        const catalog = getTextCatalog(storage)

        const quizHtmlContent = renderQuizHtml(quiz, pageId, catalog)
        // Determine page index from the manifest
        const manifest = buildPagesManifest(storage)
        const manifestIndex = manifest.findIndex((e) => e.section_id === pageId)

        const html = renderPageHtml({
          content: quizHtmlContent,
          language,
          sectionId: pageId,
          pageTitle: title,
          pageIndex: manifestIndex >= 0 ? manifestIndex + 1 : 1,
          activityAnswers: buildQuizAnswers(quiz, pageId),
          hasMath: false,
          bundleVersion: "1",
          skipContentWrapper: true,
          applyBodyBackground,
          embed,
        })

        c.header("Content-Type", "text/html; charset=utf-8")
        return c.body(html)
      }

      // Content page — require sectionId format (e.g. pg001_sec001).
      // This prevents ambiguous fallback to unrelated sections.
      const sectionIdMatch = pageId.match(/^(.+)_sec(\d{3})$/)
      if (!sectionIdMatch) {
        throw new HTTPException(404, { message: `Section not found: ${pageId}` })
      }
      const ownerPageId = sectionIdMatch[1]
      const fallbackSectionIndex = parseInt(sectionIdMatch[2], 10) - 1

      const renderRow = storage.getLatestNodeData("web-rendering", ownerPageId)
      if (!renderRow) {
        throw new HTTPException(404, { message: `No rendering data for page: ${ownerPageId}` })
      }

      const parsed = WebRenderingOutput.safeParse(renderRow.data)
      if (!parsed.success) {
        throw new HTTPException(500, { message: "Invalid rendering data" })
      }

      // Get sectioning to look up sectionId → sectionIndex mapping
      const sectioningRow = storage.getLatestNodeData("page-sectioning", ownerPageId)
      const sectioningParsed = sectioningRow
        ? PageSectioningOutput.safeParse(sectioningRow.data)
        : null
      const resolvedIndex = sectioningParsed?.success
        ? sectioningParsed.data.sections.findIndex((s) => s.sectionId === pageId)
        : -1
      const targetSectionIndex = resolvedIndex >= 0 ? resolvedIndex : fallbackSectionIndex
      const renderedSection = parsed.data.sections.find((s) => s.sectionIndex === targetSectionIndex)

      if (!renderedSection || targetSectionIndex < 0) {
        throw new HTTPException(404, { message: `Section not found: ${pageId}` })
      }

      // Determine page index from manifest (includes quiz pages)
      const manifest = buildPagesManifest(storage)
      const manifestIndex = manifest.findIndex((e) => e.section_id === pageId)

      const html = renderPageHtml({
        content: renderedSection.html,
        language,
        sectionId: pageId,
        pageTitle: title,
        pageIndex: manifestIndex >= 0 ? manifestIndex + 1 : 1,
        activityAnswers: renderedSection.activityAnswers,
        hasMath: false,
        bundleVersion: "1",
        applyBodyBackground,
        embed,
      })

      c.header("Content-Type", "text/html; charset=utf-8")
      return c.body(html)
    })
  })

  return app
}
