import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import {
  WebRenderingOutput,
  PageSectioningOutput,
  type SpeechConfig,
  type TextCatalogOutput,
  type EasyReadOutput,
  type GlossaryOutput,
  type QuizGenerationOutput,
  type TTSOutput,
  type WordTimestampOutput,
  type TocGenerationOutput,
  type Quiz,
  type ContentNodeData,
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
  flattenEasyReadEntries,
  pad3,
  loadBookConfig,
  buildPreferredImageAltMap,
  buildDecorativeImageIdSet,
  rewriteImageUrls,
  convertLatexToMathml,
  isFixedLayoutBook,
  resolveReflowableFontChain,
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
  ".mp4": "video/mp4",
  ".webm": "video/webm",
}

function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
}

/** Highest mtime across the adt-runtime React source — used to detect when
 *  the pre-built bundle is out of date relative to its sources. */
function maxSourceMtime(_webAssetsDir: string): number {
  // The runtime source moved from assets/adt/{base.js,modules/} to
  // apps/adt-runtime/src/. Walk that tree instead.
  const runtimeSrc = path.resolve(_webAssetsDir, "../../apps/adt-runtime/src")
  if (!fs.existsSync(runtimeSrc)) return 0
  let max = 0
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        const m = fs.statSync(full).mtimeMs
        if (m > max) max = m
      }
    }
  }
  walk(runtimeSrc)
  return max
}

function getPreviewBundleVersion(webAssetsDir: string): string {
  const candidates = [
    maxSourceMtime(webAssetsDir),
  ]

  for (const fileName of ["base.bundle.min.js", "base.bundle.local.js"]) {
    const bundlePath = path.join(webAssetsDir, fileName)
    if (fs.existsSync(bundlePath)) {
      candidates.push(fs.statSync(bundlePath).mtimeMs)
    }
  }

  const latest = Math.max(...candidates, 1)
  return String(Math.trunc(latest))
}

function getPreviewContentVersion(storage: Storage, webAssetsDir: string): string {
  const assetVersion = getPreviewBundleVersion(webAssetsDir)
  const fingerprint = storage.getNodeVersionFingerprint(["accessibility-assessment"])
    .map((entry) => {
      const row = storage.getLatestNodeData(entry.node, entry.itemId)
      return {
        ...entry,
        dataHash: hashValue(row?.data ?? null),
      }
    })
  const hash = createHash("sha256")
    .update(assetVersion)
    .update(JSON.stringify(fingerprint))
    .digest("hex")
    .slice(0, 12)
  return `${assetVersion}-${hash}`
}

function hashValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex")
}

function setNoStoreHeaders(c: { header: (name: string, value: string) => void }): void {
  c.header("Cache-Control", "no-store, max-age=0")
  c.header("Pragma", "no-cache")
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
  const config = configRow?.data as { language?: string; editing_language?: string } | undefined
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as { language_code?: string | null } | undefined
  return normalizeLocale(config?.language ?? config?.editing_language ?? metadata?.language_code ?? "en")
}

function getBookTitle(storage: Storage): string {
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as { title?: string | null } | undefined
  return metadata?.title ?? "ADT Preview"
}

async function getTextCatalog(storage: Storage): Promise<TextCatalogOutput> {
  const pages = storage.getPages()
  return await buildTextCatalog(storage, pages)
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
    const easyReadRow = storage.getLatestNodeData("easy-read", "book")
    const easyReadEntries = flattenEasyReadEntries(easyReadRow?.data as EasyReadOutput | undefined)
    for (const e of easyReadEntries) textsMap[e.id] = e.text
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

function getWordTimestamps(
  storage: Storage,
  language: string,
): WordTimestampOutput | undefined {
  const normalizedLanguage = normalizeLocale(language)
  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const row =
    storage.getLatestNodeData("tts-timestamps", normalizedLanguage) ??
    storage.getLatestNodeData("tts-timestamps", legacyLanguage)
  return row?.data as WordTimestampOutput | undefined
}

function buildRuntimeTimecodeMap(
  timestamps: WordTimestampOutput | undefined,
): Record<string, {
  timecodes: [null, {
    word_timestamps: Array<{ text: string; start: number; end: number }>
  }]
}> {
  const map: Record<string, {
    timecodes: [null, {
      word_timestamps: Array<{ text: string; start: number; end: number }>
    }]
  }> = {}

  for (const [textId, entry] of Object.entries(timestamps?.entries ?? {})) {
    if (entry.words.length === 0) continue
    map[textId] = {
      timecodes: [
        null,
        {
          word_timestamps: entry.words.map((word) => ({
            text: word.word,
            start: word.start,
            end: word.end,
          })),
        },
      ],
    }
  }

  return map
}

/** Build a map from sectionId → 1-based pageIndex matching the manifest order */
function buildSectionIdToPageIndex(storage: Storage): Map<string, number> {
  const pages = storage.getPages()
  const quizData = getQuizData(storage)
  const quizzesByAfterPageId = new Map<string, Quiz[]>()
  if (quizData?.quizzes) {
    for (const quiz of quizData.quizzes) {
      const existing = quizzesByAfterPageId.get(quiz.afterPageId) ?? []
      existing.push(quiz)
      quizzesByAfterPageId.set(quiz.afterPageId, existing)
    }
  }

  const map = new Map<string, number>()
  let index = 0
  for (const page of pages) {
    const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
    if (renderRow) {
      const parsed = WebRenderingOutput.safeParse(renderRow.data)
      if (parsed.success && parsed.data.sections.length > 0) {
        const structuringRow = storage.getLatestNodeData("page-sectioning", page.pageId)
        const structuringParsed = structuringRow ? PageSectioningOutput.safeParse(structuringRow.data) : null
        const sectioning = structuringParsed?.success ? structuringParsed.data : undefined
        const sections = [...parsed.data.sections].sort((a, b) => a.sectionIndex - b.sectionIndex)
        for (const rs of sections) {
          const sectionMeta = sectioning?.sections?.[rs.sectionIndex]
          if (sectionMeta?.isPruned) continue
          index++
          const sectionId = sectionMeta?.sectionId ?? `${page.pageId}_sec${String(rs.sectionIndex + 1).padStart(3, "0")}`
          map.set(sectionId, index)
        }
      }
    }
    // Quiz pages also increment the index but aren't tied to a sectionId for video purposes
    const quizzes = quizzesByAfterPageId.get(page.pageId)
    if (quizzes) {
      index += quizzes.length
    }
  }
  return map
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
        const structuringRow = storage.getLatestNodeData("page-sectioning", page.pageId)
        const structuringParsed = structuringRow
          ? PageSectioningOutput.safeParse(structuringRow.data)
          : null
        const sectioning = structuringParsed?.success ? structuringParsed.data : undefined

        // One entry per rendered section (stable by sectionIndex), skip pruned
        const sections = [...parsed.data.sections].sort((a, b) => a.sectionIndex - b.sectionIndex)
        for (const rs of sections) {
          const sectionMeta = sectioning?.sections?.[rs.sectionIndex]
          // Skip sections that are pruned in the sectioning data
          if (sectionMeta?.isPruned) continue
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

/** DFS-find the first non-pruned heading leaf in a content-node tree. */
function findFirstHeadingLeaf(
  nodes: ContentNodeData[],
): { text: string; nodeId: string } | null {
  for (const n of nodes) {
    if (n.isPruned) continue
    if (n.role === "heading" && typeof n.text === "string" && n.text.length > 0) {
      return { text: n.text, nodeId: n.nodeId }
    }
    if (n.children && n.children.length > 0) {
      const found = findFirstHeadingLeaf(n.children)
      if (found) return found
    }
  }
  return null
}

/** Build toc.json — prefer LLM-generated TOC, fallback to heading-based */
function buildTocManifest(storage: Storage): Array<{ section_id: string; href: string; title: string; chapter_id: string; level?: number }> {
  // Check for LLM-generated TOC first
  const tocRow = storage.getLatestNodeData("toc-generation", "book")
  if (tocRow) {
    const tocData = tocRow.data as TocGenerationOutput
    if (tocData.entries.length > 0) {
      // Build href map from pages manifest for accurate hrefs
      const pagesManifest = buildPagesManifest(storage)
      const hrefMap = new Map(pagesManifest.map((p) => [p.section_id, p.href]))
      return tocData.entries.map((e) => ({
        section_id: e.sectionId,
        href: hrefMap.get(e.sectionId) ?? e.href,
        title: e.title,
        chapter_id: e.chapterId,
        level: e.level,
      }))
    }
  }

  // Fallback: build from headings
  return buildHeadingBasedToc(storage)
}

/** Fallback TOC: one entry per section that contains a heading */
function buildHeadingBasedToc(storage: Storage): Array<{ section_id: string; href: string; title: string; chapter_id: string }> {
  const pages = storage.getPages()
  const toc: Array<{ section_id: string; href: string; title: string; chapter_id: string }> = []

  for (const page of pages) {
    const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
    if (!renderRow) continue
    const parsed = WebRenderingOutput.safeParse(renderRow.data)
    if (!parsed.success || parsed.data.sections.length === 0) continue

    const sectioningRow = storage.getLatestNodeData("page-sectioning", page.pageId)
    const sectioningParsed = sectioningRow ? PageSectioningOutput.safeParse(sectioningRow.data) : null
    const sectioning = sectioningParsed?.success ? sectioningParsed.data : undefined

    const sections = [...parsed.data.sections].sort((a, b) => a.sectionIndex - b.sectionIndex)
    for (const rs of sections) {
      const sectionMeta = sectioning?.sections?.[rs.sectionIndex]
      if (!sectionMeta || sectionMeta.isPruned) continue

      const sectionId = sectionMeta.sectionId ?? `${page.pageId}_sec${String(rs.sectionIndex + 1).padStart(3, "0")}`

      const heading = findFirstHeadingLeaf(sectionMeta.nodes)
      if (heading) {
        toc.push({
          section_id: sectionId,
          href: `${sectionId}.html`,
          title: heading.text,
          chapter_id: heading.nodeId,
        })
      }
    }
  }

  return toc
}

/** Build config.json that reflects actual book capabilities */
function buildPreviewConfig(
  storage: Storage,
  language: string,
  webAssetsDir: string,
  speechConfig?: SpeechConfig,
  configuredOutputLanguages?: string[],
  fixedLayout?: boolean,
) {
  const glossary = getGlossary(storage)
  const hasGlossary = glossary !== undefined && glossary.items.length > 0

  const legacyLanguage = language.replace("-", "_")
  const ttsRow =
    storage.getLatestNodeData("tts", language) ??
    storage.getLatestNodeData("tts", legacyLanguage)
  const hasTTS = ttsRow !== null
  const highlightEnabled = hasTTS && speechConfig?.word_highlighting === true

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

  const hasSignLanguageVideos = storage.getSignLanguageVideos().some((v) => v.sectionId !== null)
  const easyReadRow = storage.getLatestNodeData("easy-read", "book")
  const hasEasyRead = flattenEasyReadEntries(easyReadRow?.data as EasyReadOutput | undefined).length > 0

  // Available languages = the source language + every translation actually
  // present in the DB. We restrict against the book's configured
  // `output_languages` so partial / in-progress translations don't leak into
  // the language picker, but always include the source language even if it
  // isn't listed there. Falls back to `[language]` when no translations exist.
  const sourceLang = normalizeLocale(language)
  const allowed = new Set(
    (configuredOutputLanguages ?? []).map((l) => normalizeLocale(l)),
  )
  const availableSet = new Set<string>([sourceLang])
  for (const lang of allowed) {
    if (lang === sourceLang) continue
    const legacy = lang.replace("-", "_")
    const hasTranslation =
      storage.getLatestNodeData("text-catalog-translation", lang) !== null ||
      storage.getLatestNodeData("text-catalog-translation", legacy) !== null
    if (hasTranslation) availableSet.add(lang)
  }
  const available = Array.from(availableSet)

  return {
    title: getBookTitle(storage),
    bundleVersion: getPreviewContentVersion(storage, webAssetsDir),
    languages: {
      available,
      default: sourceLang,
    },
    features: {
      signLanguage: hasSignLanguageVideos,
      easyRead: hasEasyRead,
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
      highlight: highlightEnabled,
      activities: hasQuiz || hasActivitySections,
    },
    analytics: {
      enabled: false,
      siteId: 0,
      trackerUrl: "",
      srcUrl: "",
    },
    ...(fixedLayout ? { fixedLayout: true } : {}),
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

  /** Open storage, run callback, close on exit. Supports async callbacks. */
  function withStorage<T>(label: string, fn: (storage: Storage, safeLabel: string, bookDir: string) => T): T {
    const { safeLabel, bookDir } = resolveBook(label)
    const storage = createBookStorage(safeLabel, booksDir)
    let result: T
    try {
      result = fn(storage, safeLabel, bookDir)
    } catch (err) {
      storage.close()
      throw err
    }
    if (result instanceof Promise) {
      return result.finally(() => storage.close()) as T
    }
    storage.close()
    return result
  }

  // /assets/config.json — Dynamic config reflecting book capabilities
  app.get("/books/:label/adt-preview/assets/config.json", (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const bookConfig = loadBookConfig(safeLabel, booksDir, configPath)
    const previewConfig = withStorage(c.req.param("label"), (storage) => {
      const language = getBookLanguage(storage)
      return buildPreviewConfig(
        storage,
        language,
        webAssetsDir,
        bookConfig.speech,
        bookConfig.output_languages,
        isFixedLayoutBook(bookConfig),
      )
    })
    setNoStoreHeaders(c)
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(previewConfig))
  })

  // /assets/* — Static files from webAssetsDir
  app.get("/books/:label/adt-preview/assets/*", async (c) => {
    resolveBook(c.req.param("label")) // validate label
    const assetPath = c.req.path.split("/adt-preview/assets/")[1]
    if (!assetPath) throw new HTTPException(400, { message: "Missing asset path" })

    // Prevent path traversal
    const resolved = path.resolve(webAssetsDir, assetPath)
    if (!resolved.startsWith(path.resolve(webAssetsDir))) {
      throw new HTTPException(403, { message: "Forbidden" })
    }

    // Auto-build the runtime bundle on-the-fly if it's missing OR stale
    // relative to apps/adt-runtime/src (dev mode). Normally pre-built by
    // `pnpm --filter @adt/api bundle`. Skip in packaged mode
    // (ADT_RESOURCES_ZIP) where esbuild isn't available inside the pkg'd binary.
    if (
      (assetPath === "base.bundle.min.js" || assetPath === "base.bundle.local.js") &&
      !process.env.ADT_RESOURCES_ZIP
    ) {
      const buildScript = path.resolve(webAssetsDir, "../../apps/adt-runtime/build.config.mjs")
      if (fs.existsSync(buildScript)) {
        const bundleMtime = fs.existsSync(resolved) ? fs.statSync(resolved).mtimeMs : 0
        const isStale = bundleMtime === 0 || maxSourceMtime(webAssetsDir) > bundleMtime
        if (isStale) {
          // Re-import with a cache-busting URL so repeated invocations pick
          // up source changes when using watch mode. Convert to a file:// URL
          // so Node's ESM loader doesn't read the Windows drive letter as a
          // URL scheme.
          const buildScriptUrl = pathToFileURL(buildScript)
          buildScriptUrl.searchParams.set("t", String(Date.now()))
          await import(buildScriptUrl.href)
        }
      }
    }

    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      throw new HTTPException(404, { message: "Asset not found" })
    }

    c.header("Content-Type", getMimeType(resolved))
    return c.body(fs.readFileSync(resolved))
  })

  // /convert-math — Convert LaTeX in HTML to MathML (used by storyboard preview)
  app.post("/books/:label/adt-preview/convert-math", async (c) => {
    resolveBook(c.req.param("label")) // validate label
    const body = await c.req.json()
    const html = typeof body?.html === "string" ? body.html : ""
    if (!html) return c.json({ html: "" })
    const converted = convertLatexToMathml(html)
    return c.json({ html: converted })
  })

  // /content/pages.json — All rendered pages
  app.get("/books/:label/adt-preview/content/pages.json", (c) => {
    const pages = withStorage(c.req.param("label"), (storage) => buildPagesManifest(storage))
    setNoStoreHeaders(c)
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(pages))
  })

  // /content/toc.json
  app.get("/books/:label/adt-preview/content/toc.json", (c) => {
    const toc = withStorage(c.req.param("label"), (storage) => buildTocManifest(storage))
    setNoStoreHeaders(c)
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(toc))
  })

  // /content/navigation/nav.html
  app.get("/books/:label/adt-preview/content/navigation/nav.html", (c) => {
    resolveBook(c.req.param("label"))
    c.header("Content-Type", "text/html; charset=utf-8")
    return c.body(NAV_HTML)
  })

  // /content/tailwind_output.css — rebuilt on every request (no cache, dev tool)
  // GET: generates CSS from DB content only.
  // POST: accepts { extraHtml } to include unsaved content (e.g., AI edits) in the scan.

  /** Collect all rendered HTML from the DB + optional extra HTML for Tailwind scanning. */
  async function generateTailwindCss(safeLabel: string, extraHtml?: string): Promise<string> {
    const storage = createBookStorage(safeLabel, booksDir)
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
      const catalog = await getTextCatalog(storage)
      if (quizData?.quizzes) {
        for (let i = 0; i < quizData.quizzes.length; i++) {
          const quizId = `qz${pad3(i + 1)}`
          allHtml += renderQuizHtml(quizData.quizzes[i], quizId, catalog) + "\n"
        }
      }

      // Include unsaved content (e.g., AI-edited section HTML) so new Tailwind classes
      // are picked up before the edit is persisted to the DB.
      if (extraHtml) allHtml += "\n" + extraHtml

      return await buildPreviewTailwindCss(allHtml, webAssetsDir)
    } finally {
      storage.close()
    }
  }

  app.get("/books/:label/adt-preview/content/tailwind_output.css", async (c) => {
    const { safeLabel } = resolveBook(c.req.param("label"))
    const css = await generateTailwindCss(safeLabel)
    setNoStoreHeaders(c)
    c.header("Content-Type", "text/css")
    return c.body(css)
  })

  app.post("/books/:label/adt-preview/content/tailwind_output.css", async (c) => {
    const { safeLabel } = resolveBook(c.req.param("label"))
    const body = await c.req.json<{ extraHtml?: string }>()
    const css = await generateTailwindCss(safeLabel, body.extraHtml)
    setNoStoreHeaders(c)
    c.header("Content-Type", "text/css")
    return c.body(css)
  })

  // /content/i18n/:lang/texts.json — Text catalog
  app.get("/books/:label/adt-preview/content/i18n/:lang/texts.json", async (c) => {
    const lang = c.req.param("lang")
    const textsMap = await withStorage(c.req.param("label"), async (storage) => {
      const language = getBookLanguage(storage)
      const sourceLanguage = getBaseLanguage(language)
      const catalog = await getTextCatalog(storage)
      return buildTextsMap(storage, lang, sourceLanguage, catalog)
    })
    setNoStoreHeaders(c)
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(textsMap))
  })

  // /content/i18n/:lang/glossary.json — Glossary data
  app.get("/books/:label/adt-preview/content/i18n/:lang/glossary.json", async (c) => {
    const lang = c.req.param("lang")
    const glossaryJson = await withStorage(c.req.param("label"), async (storage) => {
      const language = getBookLanguage(storage)
      const sourceLanguage = getBaseLanguage(language)
      const catalog = await getTextCatalog(storage)
      const glossary = getGlossary(storage)
      const textsMap = buildTextsMap(storage, lang, sourceLanguage, catalog)
      const baseLang = getBaseLanguage(lang)
      return buildGlossaryJson(glossary, catalog, textsMap, baseLang === sourceLanguage)
    })
    setNoStoreHeaders(c)
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
    setNoStoreHeaders(c)
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(audioMap))
  })

  // /content/i18n/:lang/timecode/timecode_output.json — word-level read-aloud timings
  app.get("/books/:label/adt-preview/content/i18n/:lang/timecode/timecode_output.json", (c) => {
    const lang = normalizeLocale(c.req.param("lang"))
    const safeLabel = parseBookLabel(c.req.param("label"))
    const bookConfig = loadBookConfig(safeLabel, booksDir, configPath)
    const timecodes = bookConfig.speech?.word_highlighting === true
      ? withStorage(c.req.param("label"), (storage) =>
          buildRuntimeTimecodeMap(getWordTimestamps(storage, lang))
        )
      : {}
    setNoStoreHeaders(c)
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(timecodes))
  })

  // /content/i18n/:lang/videos.json — Sign language video mapping
  // The ADT JS runtime expects keys like "video-{pageIndex}" and files served from "video/" path.
  // Each video is assigned to a sectionId which maps 1:1 to a pageIndex.
  app.get("/books/:label/adt-preview/content/i18n/:lang/videos.json", (c) => {
    const videosMap = withStorage(c.req.param("label"), (storage) => {
      const map: Record<string, string> = {}
      const sectionToIndex = buildSectionIdToPageIndex(storage)
      for (const video of storage.getSignLanguageVideos()) {
        if (video.sectionId) {
          const ext = video.mimeType === "video/webm" ? ".webm" : ".mp4"
          const filename = `sl_${video.sectionId}${ext}`
          const idx = sectionToIndex.get(video.sectionId)
          if (idx !== undefined) {
            map[`video-${idx}`] = filename
          }
        }
      }
      return map
    })
    setNoStoreHeaders(c)
    c.header("Content-Type", "application/json")
    return c.body(JSON.stringify(videosMap))
  })

  // /content/i18n/:lang/video/* — Serve sign language video files
  // URL uses section-based names (sl_pg001_sec001.mp4) that map back to stored video files via the DB
  app.get("/books/:label/adt-preview/content/i18n/:lang/video/*", (c) => {
    const { label } = c.req.param()

    const requestedFile = c.req.path.split("/video/").pop()
    if (!requestedFile) throw new HTTPException(400, { message: "Missing video path" })

    // Extract sectionId from the filename (e.g. "sl_pg001_sec001.mp4" → "pg001_sec001")
    const match = requestedFile.match(/^sl_(.+)\.\w+$/)
    if (!match) throw new HTTPException(400, { message: "Invalid video filename" })
    const sectionId = match[1]

    const storage = createBookStorage(label, booksDir)
    try {
      const video = storage.getSignLanguageVideos().find((v) => v.sectionId === sectionId)
      if (!video) throw new HTTPException(404, { message: "No video assigned to this section" })

      const filePath = storage.getSignLanguageVideoPath(video.videoId)
      if (!filePath || !fs.existsSync(filePath)) {
        throw new HTTPException(404, { message: "Video file not found" })
      }

      c.header("Content-Type", getMimeType(filePath))
      c.header("Cache-Control", "public, max-age=86400")
      return c.body(fs.readFileSync(filePath))
    } finally {
      storage.close()
    }
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
  app.get("/books/:label/adt-preview/:filename", async (c) => {
    const { label, filename } = c.req.param()
    if (!filename.endsWith(".html")) throw new HTTPException(404, { message: "Not found" })
    const pageId = filename.replace(/\.html$/, "")

    const safeLabel = parseBookLabel(label)
    const config = loadBookConfig(safeLabel, booksDir, configPath)
    const applyBodyBackground = config.apply_body_background
    const embed = c.req.query("embed") === "1"

    return await withStorage(label, async (storage) => {
      const title = getBookTitle(storage)
      const language = getBookLanguage(storage)
      // Reflowable base font (serif/sans default or override) — matches the
      // packaged output so the preview shows the same typography.
      const bodyFontFamily = resolveReflowableFontChain(storage, {
        fixedLayout: isFixedLayoutBook(config),
        reflowableFont: config.reflowable_font,
      })

      // Check if this is a quiz page (qzNNN)
      const quizMatch = pageId.match(/^qz(\d{3})$/)
      if (quizMatch) {
        const quizIndex = parseInt(quizMatch[1], 10) - 1
        const quizData = getQuizData(storage)
        if (!quizData?.quizzes || quizIndex < 0 || quizIndex >= quizData.quizzes.length) {
          throw new HTTPException(404, { message: `No quiz data for: ${pageId}` })
        }
        const quiz = quizData.quizzes[quizIndex]
        const catalog = await getTextCatalog(storage)

        const quizHtmlContent = renderQuizHtml(quiz, pageId, catalog)
        // Determine page index from the manifest
      const manifest = buildPagesManifest(storage)
      const manifestIndex = manifest.findIndex((e) => e.section_id === pageId)
      const previewBundleVersion = getPreviewContentVersion(storage, webAssetsDir)

      const html = renderPageHtml({
        content: quizHtmlContent,
        language,
        sectionId: pageId,
        pageTitle: title,
        pageIndex: manifestIndex >= 0 ? manifestIndex + 1 : 1,
        activityAnswers: buildQuizAnswers(quiz, pageId),
        hasMath: false,
        bundleVersion: previewBundleVersion,
        skipContentWrapper: true,
        applyBodyBackground,
        embed,
        bodyFontFamily,
      })

        setNoStoreHeaders(c)
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
      const previewBundleVersion = getPreviewContentVersion(storage, webAssetsDir)

      const sectionMeta = sectioningParsed?.success
        ? sectioningParsed.data.sections[targetSectionIndex]
        : undefined
      const preferredImageAltMap = buildPreferredImageAltMap(storage, ownerPageId, sectionMeta)
      const decorativeImageIds = buildDecorativeImageIdSet(storage, ownerPageId)
      const { html: previewSectionHtml } = rewriteImageUrls(
        renderedSection.html,
        label,
        new Map<string, string>(),
        preferredImageAltMap,
        decorativeImageIds,
      )

      const previewHasMath = /(?:\\\(|\\\)|\\\[|\\\]|\$[^$]+\$|\\frac|\\sqrt|\\sum|\\int|\\text\{|\\hat\{|\\circ)/.test(previewSectionHtml)

      const html = renderPageHtml({
        content: convertLatexToMathml(previewSectionHtml),
        language,
        sectionId: pageId,
        pageTitle: title,
        pageIndex: manifestIndex >= 0 ? manifestIndex + 1 : 1,
        activityAnswers: renderedSection.activityAnswers,
        hasMath: previewHasMath,
        bundleVersion: previewBundleVersion,
        applyBodyBackground,
        embed,
        bodyFontFamily,
      })

      setNoStoreHeaders(c)
      c.header("Content-Type", "text/html; charset=utf-8")
      return c.body(html)
    })
  })

  return app
}
