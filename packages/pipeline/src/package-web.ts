import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/**
 * Tailwind v4 resolves `@import "tailwindcss"` relative to the postcss `from`
 * path. webAssetsDir / book directories don't have their own node_modules,
 * so we route the postcss invocation through this package's own directory
 * where tailwindcss + @tailwindcss/postcss are installed.
 */
const PIPELINE_PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const TAILWIND_VIRTUAL_FROM = path.join(PIPELINE_PACKAGE_DIR, "_tailwind_input.css")
import { parseDocument, DomUtils } from "htmlparser2"
import temml from "temml"
import type { Storage } from "@adt/storage"
import type {
  ContentNodeData,
  PageSectioningOutput,
  PageSectioningSection,
  TextCatalogOutput,
  EasyReadOutput,
  GlossaryOutput,
  QuizGenerationOutput,
  BookSummaryOutput,
  BookMetadata,
  SpeechConfig,
  TTSOutput,
  WordTimestampOutput,
  TocGenerationOutput,
  Quiz,
  ImageCaptioningOutput,
} from "@adt/types"
import { WebRenderingOutput as WebRenderingOutputSchema } from "@adt/types"
import { googleFontsReferencedIn, googleFontsCss2Url } from "@adt/types"
import { reflowableFontChain } from "@adt/types"
import { bundleGoogleFontsIntoCss } from "./google-fonts-bundle.js"
import type { Progress } from "./progress.js"
import { nullProgress } from "./progress.js"
import { getGlossaryItemTextId } from "./glossary.js"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"
import { buildTextCatalog } from "./text-catalog.js"
import { flattenEasyReadEntries } from "./easy-read.js"
import { normalizeHtmlSectionSemantics } from "./html-semantics.js"

export interface PackageAdtWebOptions {
  bookDir: string
  label: string
  language: string
  outputLanguages: string[]
  title: string
  webAssetsDir: string
  bundleVersion?: string
  applyBodyBackground?: boolean
  speechConfig?: SpeechConfig
  features?: {
    glossary?: boolean
    readAloud?: boolean
    quizzes?: boolean
    signLanguage?: boolean
  }
  defaultSettings?: {
    dockLayout?: {
      width?: "compact" | "full"
      position?: "top" | "bottom"
      align?: "center" | "spread"
    }
    theme?: "light" | "dark" | "system"
    iconSize?: "sm" | "md" | "lg"
    reduceMotion?: boolean
  }
  lockedSettings?: ("dockLayout" | "theme" | "iconSize" | "reduceMotion")[]
  fixedLayout?: boolean
  /** `reflowable_font` config value (font id or "auto"). Selects the reflowable
   *  base font; ignored for fixed-layout books. */
  reflowableFont?: string
}

interface PageEntry {
  section_id: string
  href: string
  page_number?: number
}

interface RuntimeTimecodeEntry {
  timecodes: [null, {
    word_timestamps: Array<{ text: string; start: number; end: number }>
  }]
}

// ---------------------------------------------------------------------------
// Build-cache helpers
// ---------------------------------------------------------------------------

function collectDirectoryFingerprint(dirPath: string, prefix = ""): Array<[string, number, number]> {
  if (!fs.existsSync(dirPath)) return []
  const entries: Array<[string, number, number]> = []
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      entries.push(...collectDirectoryFingerprint(path.join(dirPath, entry.name), rel))
    } else {
      const stat = fs.statSync(path.join(dirPath, entry.name))
      entries.push([rel, stat.size, Math.trunc(stat.mtimeMs)])
    }
  }
  return entries
}

export function getWordTimestamps(
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
): Record<string, RuntimeTimecodeEntry> {
  const map: Record<string, RuntimeTimecodeEntry> = {}

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

export interface ComputePackagingInputHashOptions {
  storage: Storage
  bookDir: string
  label: string
  language: string
  outputLanguages: string[]
  title: string
  webAssetsDir: string
  bundleVersion?: string
  applyBodyBackground?: boolean
  config: Record<string, unknown>
}

export function computePackagingInputHash(options: ComputePackagingInputHashOptions): string {
  const hash = createHash("sha256")

  // 1. Storage entity versions and content (exclude outputs like accessibility-assessment)
  const fingerprint = options.storage.getNodeVersionFingerprint(["accessibility-assessment"])
    .map((entry) => {
      const row = options.storage.getLatestNodeData(entry.node, entry.itemId)
      return {
        ...entry,
        dataHash: hashValue(row?.data ?? null),
      }
    })
  hash.update(JSON.stringify(fingerprint))

  // 2. Packaging options that affect output
  hash.update(JSON.stringify({
    label: options.label,
    language: options.language,
    outputLanguages: options.outputLanguages,
    title: options.title,
    bundleVersion: options.bundleVersion ?? "1",
    applyBodyBackground: options.applyBodyBackground ?? false,
  }))

  // 3. Book config (affects rendering, accessibility, etc.)
  hash.update(JSON.stringify(options.config))

  // 4. Web assets directory fingerprint (file names + sizes + mtimes)
  const assetEntries = collectDirectoryFingerprint(options.webAssetsDir).sort((a, b) => a[0].localeCompare(b[0]))
  hash.update(JSON.stringify(assetEntries))

  // 5. Images directory fingerprint
  const imagesDir = path.join(options.bookDir, "images")
  const imageEntries = collectDirectoryFingerprint(imagesDir).sort((a, b) => a[0].localeCompare(b[0]))
  hash.update(JSON.stringify(imageEntries))

  // 6. Videos directory fingerprint
  const videosDir = path.join(options.bookDir, "videos")
  const videoEntries = collectDirectoryFingerprint(videosDir).sort((a, b) => a[0].localeCompare(b[0]))
  hash.update(JSON.stringify(videoEntries))

  return hash.digest("hex")
}

function hashValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex")
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Package all pipeline outputs into a standalone web application at
 * `{bookDir}/adt/`. The output is a self-contained directory that can be
 * opened directly in a browser (file://) or served by any static HTTP server.
 */
export async function packageAdtWeb(
  storage: Storage,
  options: PackageAdtWebOptions,
  progress: Progress = nullProgress,
): Promise<void> {
  const {
    bookDir,
    label,
    language: rawLanguage,
    outputLanguages: rawOutputLanguages,
    title,
    webAssetsDir,
    bundleVersion = "1",
    applyBodyBackground,
    speechConfig,
    features,
    defaultSettings,
    lockedSettings,
    fixedLayout,
    reflowableFont,
  } = options
  const language = normalizeLocale(rawLanguage)
  const outputLanguages = Array.from(new Set(rawOutputLanguages.map((code) => normalizeLocale(code))))
  // Reflowable base font (serif/sans default from the detected profile, or an
  // explicit override). undefined for fixed-layout / Merriweather-default.
  const bodyFontFamily = resolveReflowableFontChain(storage, { fixedLayout, reflowableFont })

  const step = "package-web" as const
  progress.emit({ type: "step-start", step })
  progress.emit({ type: "step-progress", step, message: "Setting up directories..." })

  const adtDir = path.join(bookDir, "adt")
  const imageDir = path.join(adtDir, "images")
  const contentDir = path.join(adtDir, "content")

  // Clear & create directory structure
  if (fs.existsSync(adtDir)) fs.rmSync(adtDir, { recursive: true })
  fs.mkdirSync(imageDir, { recursive: true })
  fs.mkdirSync(contentDir, { recursive: true })

  // ------------------------------------------------------------------
  // Collect data from storage
  // ------------------------------------------------------------------
  const pages = storage.getPages()
  const imageMap = buildImageMap(path.join(bookDir, "images"))

  // Always rebuild the text catalog to avoid staleness; only persist if changed
  const catalog = await buildTextCatalog(storage, pages)
  const catalogRow = storage.getLatestNodeData("text-catalog", "book")
  const storedEntries = catalogRow
    ? JSON.stringify((catalogRow.data as TextCatalogOutput).entries)
    : null
  if (JSON.stringify(catalog.entries) !== storedEntries) {
    storage.putNodeData("text-catalog", "book", catalog)
  }

  const glossaryRow = storage.getLatestNodeData("glossary", "book")
  const glossary = glossaryRow?.data as GlossaryOutput | undefined

  const quizRow = storage.getLatestNodeData("quiz-generation", "book")
  const quizData = quizRow?.data as QuizGenerationOutput | undefined

  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as { title?: string | null; cover_page_number?: number | null } | undefined

  const summaryRow = storage.getLatestNodeData("book-summary", "book")
  const bookSummary = (summaryRow?.data as BookSummaryOutput | undefined)?.summary

  const tocRow = storage.getLatestNodeData("toc-generation", "book")
  const llmToc = tocRow?.data as TocGenerationOutput | undefined

  const easyReadRow = storage.getLatestNodeData("easy-read", "book")
  const easyRead = easyReadRow?.data as EasyReadOutput | undefined
  const easyReadEntries = flattenEasyReadEntries(easyRead)

  // ------------------------------------------------------------------
  // Process pages
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Processing pages..." })

  const pageList: PageEntry[] = []
  const tocEntries: Array<{ section_id: string; href: string; title: string; chapter_id: string }> = []
  let hasMath = false
  let hasActivitySections = false
  const copiedImages = new Set<string>()
  const sectionIdToPageIndex = new Map<string, number>()

  // Build a map from afterPageId -> quizzes for interleaving
  const quizzesByAfterPageId = new Map<string, Quiz[]>()
  if ((features?.quizzes !== false) && quizData?.quizzes) {
    for (const quiz of quizData.quizzes) {
      const existing = quizzesByAfterPageId.get(quiz.afterPageId) ?? []
      existing.push(quiz)
      quizzesByAfterPageId.set(quiz.afterPageId, existing)
    }
  }

  for (const page of pages) {
    const quizzes = quizzesByAfterPageId.get(page.pageId) ?? []

    const structuringRow = storage.getLatestNodeData("page-sectioning", page.pageId)
    const sectioning = structuringRow?.data as PageSectioningOutput | undefined
    const imageCaptionMap = loadImageCaptionMap(storage, page.pageId)
    const decorativeImageIds = buildDecorativeImageIdSet(storage, page.pageId)

    const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
    if (renderRow) {
      const parsed = WebRenderingOutputSchema.safeParse(renderRow.data)
      if (parsed.success) {
        const rendering = parsed.data

        // One HTML file per rendered section (stable by sectionIndex), skip pruned
        const sections = [...rendering.sections].sort((a, b) => a.sectionIndex - b.sectionIndex)
        for (const rs of sections) {
          const sectionMeta = sectioning?.sections[rs.sectionIndex]
          if (sectionMeta?.isPruned) continue
          const sectionId = sectionMeta?.sectionId ?? `${page.pageId}_sec${String(rs.sectionIndex + 1).padStart(3, "0")}`

          if (rs.sectionType.startsWith("activity_") || sectionMeta?.sectionType.startsWith("activity_")) {
            hasActivitySections = true
          }

          // Rewrite image URLs and copy referenced images
          const preferredImageAltMap = buildPreferredImageAltMap(storage, page.pageId, sectionMeta)
          let { html: rewrittenHtml, referencedImages } = rewriteImageUrls(
            rs.html,
            label,
            imageMap,
            preferredImageAltMap,
            decorativeImageIds,
          )

          for (const imageId of referencedImages) {
            if (!copiedImages.has(imageId)) {
              const filename = imageMap.get(imageId)
              if (filename) {
                fs.copyFileSync(
                  path.join(bookDir, "images", filename),
                  path.join(imageDir, filename),
                )
                copiedImages.add(imageId)
              }
            }
          }

          // Convert LaTeX math to MathML
          const sectionHasMath = containsMathContent(rewrittenHtml)
          if (sectionHasMath) {
            hasMath = true
            rewrittenHtml = convertLatexToMathml(rewrittenHtml)
          }

          const isFirstPage = pageList.length === 0
          const filename = isFirstPage ? "index.html" : `${sectionId}.html`

          const headingText = sectionMeta ? findHeadingText(sectionMeta) : null

          // For fixed-layout pages, extract viewport from the rendered content div.
          // Viewport matches content dimensions (2x render scale) exactly — no
          // transform needed, Apple Books scales the viewport to fit the screen.
          let fixedViewport: { width: number; height: number } | undefined
          if (fixedLayout) {
            const vp = rewrittenHtml.match(/width:(\d+)px;height:(\d+)px/)
            if (vp) {
              fixedViewport = { width: parseInt(vp[1], 10), height: parseInt(vp[2], 10) }
            }
          }

          const pageHtml = renderPageHtml({
            content: rewrittenHtml,
            language,
            sectionId,
            pageTitle: title,
            pageHeading: headingText?.text ?? title,
            pageIndex: pageList.length + 1,
            activityAnswers: rs.activityAnswers,
            hasMath: sectionHasMath,
            bundleVersion,
            applyBodyBackground,
            fixedViewport,
            bodyFontFamily,
          })
          fs.writeFileSync(path.join(adtDir, filename), pageHtml)

          const entry: PageEntry = {
            section_id: sectionId,
            href: filename,
          }
          if (sectionMeta?.pageNumber !== null && sectionMeta?.pageNumber !== undefined) {
            entry.page_number = sectionMeta.pageNumber
          }
          pageList.push(entry)

          // Track sectionId → pageIndex for sign language video mapping
          sectionIdToPageIndex.set(sectionId, pageList.length) // pageIndex = pageList.length (1-based, already pushed)

          // Build TOC entry from first heading text in this section
          if (headingText) {
            tocEntries.push({
              section_id: sectionId,
              href: filename,
              title: headingText.text,
              chapter_id: headingText.textId,
            })
          }
        }
      }
    }

    // Insert quiz pages after this page (even if page content was skipped)
    for (const quiz of quizzes) {
      const quizIndex = quizData!.quizzes.indexOf(quiz)
      const quizId = `qz${pad3(quizIndex + 1)}`

      const isFirstPage = pageList.length === 0
      const quizFilename = isFirstPage ? "index.html" : `${quizId}.html`

      const quizHtmlContent = renderQuizHtml(quiz, quizId, catalog)
      const quizPageHtml = renderPageHtml({
        content: quizHtmlContent,
        language,
        sectionId: quizId,
        pageTitle: title,
        pageHeading: quiz.question,
        pageIndex: pageList.length + 1,
        activityAnswers: buildQuizAnswers(quiz, quizId),
        hasMath: false,
        bundleVersion,
        skipContentWrapper: true,
        applyBodyBackground,
        bodyFontFamily,
      })
      fs.writeFileSync(path.join(adtDir, quizFilename), quizPageHtml)

      pageList.push({ section_id: quizId, href: quizFilename })
    }
  }

  // ------------------------------------------------------------------
  // Write manifests
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Writing manifests..." })

  writeJson(path.join(contentDir, "pages.json"), pageList)

  // Table of contents — prefer LLM-generated TOC, fallback to heading-based
  if (llmToc && llmToc.entries.length > 0) {
    // Map LLM entries to the flat format expected by the runtime, resolving
    // hrefs from the page list (the first page is always index.html)
    const hrefMap = new Map(pageList.map((p) => [p.section_id, p.href]))
    const tocJson = llmToc.entries.map((e) => ({
      section_id: e.sectionId,
      href: hrefMap.get(e.sectionId) ?? e.href,
      title: e.title,
      chapter_id: e.chapterId,
      level: e.level,
    }))
    writeJson(path.join(contentDir, "toc.json"), tocJson)
  } else {
    writeJson(path.join(contentDir, "toc.json"), tocEntries)
  }

  // ------------------------------------------------------------------
  // Cover image
  // ------------------------------------------------------------------
  if (metadata?.cover_page_number !== null && metadata?.cover_page_number !== undefined) {
    const coverPageId = pages.find(
      (p) => p.pageNumber === metadata.cover_page_number,
    )?.pageId
    if (coverPageId) {
      const coverImageId = `${coverPageId}_page`
      const coverFilename = imageMap.get(coverImageId)
      if (coverFilename) {
        fs.copyFileSync(
          path.join(bookDir, "images", coverFilename),
          path.join(adtDir, `cover${path.extname(coverFilename)}`),
        )
      }
    }
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  const navDir = path.join(contentDir, "navigation")
  fs.mkdirSync(navDir, { recursive: true })
  fs.writeFileSync(path.join(navDir, "nav.html"), NAV_HTML)

  // ------------------------------------------------------------------
  // i18n — per-language content
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Packaging translations and audio..." })

  const sourceLanguage = getBaseLanguage(language)
  const hasTTS = (features?.readAloud !== false) && outputLanguages.some(
    (lang) => {
      const legacyLang = lang.replace("-", "_")
      return (
        storage.getLatestNodeData("tts", lang) !== null ||
        storage.getLatestNodeData("tts", legacyLang) !== null
      )
    },
  )
  const highlightEnabled = hasTTS && speechConfig?.word_highlighting === true

  for (const lang of outputLanguages) {
    const localeDir = path.join(contentDir, "i18n", lang)
    fs.mkdirSync(localeDir, { recursive: true })

    // texts.json
    const baseLang = getBaseLanguage(lang)
    let textsMap: Record<string, string> = {}
    if (baseLang === sourceLanguage) {
      // Source language — use original catalog
      if (catalog?.entries) {
        for (const e of catalog.entries) textsMap[e.id] = e.text
      }
      for (const e of easyReadEntries) textsMap[e.id] = e.text
    } else {
      // Translated language
      const legacyLang = lang.replace("-", "_")
      const transRow =
        storage.getLatestNodeData("text-catalog-translation", lang) ??
        storage.getLatestNodeData("text-catalog-translation", legacyLang)
      if (transRow) {
        const translated = transRow.data as TextCatalogOutput
        for (const e of translated.entries) textsMap[e.id] = e.text
      }
    }
    // Convert any LaTeX in text catalog entries to MathML
    for (const [id, text] of Object.entries(textsMap)) {
      if (containsMathContent(text)) {
        textsMap[id] = convertLatexString(text)
      }
    }
    writeJson(path.join(localeDir, "texts.json"), textsMap)

    // audios.json + copy audio files
    const audioMap: Record<string, string> = {}

    if (features?.readAloud !== false) {
      const audioDir = path.join(localeDir, "audio")
      fs.mkdirSync(audioDir, { recursive: true })

      const legacyLang = lang.replace("-", "_")
      const ttsRow =
        storage.getLatestNodeData("tts", lang) ??
        storage.getLatestNodeData("tts", legacyLang)
      const ttsData = ttsRow?.data as TTSOutput | undefined

      if (ttsData?.entries) {
        for (const entry of ttsData.entries) {
          const srcFile = path.join(bookDir, "audio", lang, entry.fileName)
          const legacySrcFile = path.join(bookDir, "audio", legacyLang, entry.fileName)
          const resolvedSrcFile = fs.existsSync(srcFile) ? srcFile : legacySrcFile
          if (fs.existsSync(resolvedSrcFile)) {
            const destFile = path.join(audioDir, entry.fileName)
            fs.copyFileSync(resolvedSrcFile, destFile)
            audioMap[entry.textId] = entry.fileName
          }
        }
      }
    }
    writeJson(path.join(localeDir, "audios.json"), audioMap)

    // timecode/timecode_output.json — word timings consumed by the reader runtime
    const timecodeDir = path.join(localeDir, "timecode")
    fs.mkdirSync(timecodeDir, { recursive: true })
    writeJson(
      path.join(timecodeDir, "timecode_output.json"),
      highlightEnabled
        ? buildRuntimeTimecodeMap(getWordTimestamps(storage, lang))
        : {},
    )

    // videos.json — map "video-{pageIndex}" → video filename for assigned sign language videos
    // The ADT JS runtime expects keys prefixed with "video-" and files in a "video/" directory.
    // Each video is assigned to a sectionId which maps 1:1 to a pageIndex.
    const videosMap: Record<string, string> = {}
    if (features?.signLanguage !== false) {
      const allVideos = storage.getSignLanguageVideos()
      const videoDir = path.join(localeDir, "video")
      if (allVideos.some((v) => v.sectionId)) {
        fs.mkdirSync(videoDir, { recursive: true })
        for (const video of allVideos) {
          if (!video.sectionId) continue
          const ext = video.mimeType === "video/webm" ? ".webm" : ".mp4"
          // Use section-based naming (e.g. sl_pg001_sec001.mp4) matching audio file conventions
          const filename = `sl_${video.sectionId}${ext}`
          const srcPath = storage.getSignLanguageVideoPath(video.videoId)
          if (srcPath && fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, path.join(videoDir, filename))
            const idx = sectionIdToPageIndex.get(video.sectionId)
            if (idx !== undefined) {
              videosMap[`video-${idx}`] = filename
            }
          }
        }
      }
    }
    writeJson(path.join(localeDir, "videos.json"), videosMap)

    // images.json — map original imageId → localized variant filename for this language.
    // Variants are produced by the image-translation step and stored as
    // `${sourceImageId}_tr_${languageCode}` in the book images directory.
    const imagesMap: Record<string, string> = {}
    const variantSuffix = `_tr_${lang.replace(/[^a-zA-Z0-9-]/g, "_")}`
    for (const originalImageId of copiedImages) {
      const variantId = `${originalImageId}${variantSuffix}`
      const variantFilename = imageMap.get(variantId)
      if (!variantFilename) continue
      const destPath = path.join(imageDir, variantFilename)
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(
          path.join(bookDir, "images", variantFilename),
          destPath,
        )
      }
      imagesMap[originalImageId] = variantFilename
    }
    writeJson(path.join(localeDir, "images.json"), imagesMap)

    if (features?.glossary !== false) {
      const glossaryJson = buildGlossaryJson(glossary, catalog, textsMap, baseLang === sourceLanguage)
      writeJson(path.join(localeDir, "glossary.json"), glossaryJson)
    }
  }

  // ------------------------------------------------------------------
  // config.json
  // ------------------------------------------------------------------
  const hasGlossary = (features?.glossary !== false) && (glossary !== undefined && glossary.items.some((item) => !item.pruned))
  const hasQuiz = (features?.quizzes !== false) && (quizData !== undefined && quizData.quizzes.length > 0)
  const hasEasyRead = easyReadEntries.length > 0

  const hasSignLanguageVideos = (features?.signLanguage !== false) && storage.getSignLanguageVideos().some((v) => v.sectionId !== null)

  const configJson: Record<string, unknown> = {
    title,
    bundleVersion,
    languages: {
      available: outputLanguages,
      default: pickDefaultLanguage(language, outputLanguages),
    },
    features: {
      signLanguage: hasSignLanguageVideos,
      easyRead: hasEasyRead,
      glossary: hasGlossary,
      eli5: false,
      readAloud: hasTTS,
      autoplay: true,
      showTutorial: true,
      showNavigationControls: true,
      describeImages: true,
      notepad: false,
      state: true,
      characterDisplay: false,
      highlight: highlightEnabled,
      activities: hasQuiz || hasActivitySections,
    },
    analytics: {
      enabled: false,
      siteId: 0,
      trackerUrl: "https://unisitetracker.unicef.io/matomo.php",
      srcUrl: "https://unisitetracker.unicef.io/matomo.js",
    },
  }
  if (defaultSettings && Object.keys(defaultSettings).length > 0) {
    configJson.defaultSettings = defaultSettings
  }
  if (lockedSettings && lockedSettings.length > 0) {
    configJson.lockedSettings = lockedSettings
  }
  if (fixedLayout) {
    configJson.fixedLayout = true
  }

  // ------------------------------------------------------------------
  // Copy web assets
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Copying web assets..." })

  const assetsDir = path.join(adtDir, "assets")
  copyDirRecursive(webAssetsDir, assetsDir, new Set(["interface_translations"]))

  // Copy only required interface translations
  const itSrc = path.join(webAssetsDir, "interface_translations")
  if (fs.existsSync(itSrc)) {
    const itDest = path.join(assetsDir, "interface_translations")
    fs.mkdirSync(itDest, { recursive: true })
    for (const lang of outputLanguages) {
      const langSrc = path.join(itSrc, lang)
      const baseLangSrc = path.join(itSrc, getBaseLanguage(lang))
      const src = fs.existsSync(langSrc) ? langSrc : fs.existsSync(baseLangSrc) ? baseLangSrc : null
      if (src) {
        copyDirRecursive(src, path.join(itDest, lang))
      }
    }
  }

  // Write config.json (overwrites the template one from assets)
  writeJson(path.join(assetsDir, "config.json"), configJson)

  // ------------------------------------------------------------------
  // Build JS bundle (base.js → base.bundle.min.js)
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Building JS bundle..." })
  await buildJsBundle(webAssetsDir, assetsDir)

  // ------------------------------------------------------------------
  // Build Tailwind CSS
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Building Tailwind CSS..." })
  await buildTailwindCss(adtDir, webAssetsDir)

  // ------------------------------------------------------------------
  // SCORM + Offline support
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Generating offline & SCORM support..." })

  const activityIds = collectActivityIds(adtDir, pageList)
  generateScormAdapter(assetsDir, activityIds)

  // Bundle any Google Fonts the book uses (fetch the woff2, inline as base64
  // @font-face) so they render under file:// / offline; the online <link> in
  // each page stays as the fallback when the fetch fails. Runs before
  // inlineFontsInCss, which only rewrites local ./fonts/ urls and leaves these
  // data: URIs alone.
  progress.emit({ type: "step-progress", step, message: "Bundling fonts..." })
  const bundledFonts = await bundleGoogleFontsIntoCss(adtDir)
  if (bundledFonts.length > 0) {
    progress.emit({ type: "step-progress", step, message: `Bundled fonts: ${bundledFonts.join(", ")}` })
  }

  // Inline fonts as base64 in fonts.css so `@font-face` works under file://
  // (browsers treat each file:// path as a unique origin and block cross-origin
  // font requests; data: URIs sidestep this entirely).
  inlineFontsInCss(adtDir)

  // Offline preloader must run after all asset writes — it snapshots the
  // final state of every file it inlines (page HTML, content JSON, nav.html).
  generateOfflinePreloader(adtDir, outputLanguages)

  generateImsManifest(adtDir, title, label, pageList)

  // Render AGENTS.md from Liquid template with book-specific data
  const agentsMdTemplate = path.join(path.dirname(webAssetsDir), "AGENTS.md.liquid")
  if (fs.existsSync(agentsMdTemplate)) {
    const agentsMd = await renderAgentsMd(agentsMdTemplate, {
      title,
      label,
      summary: bookSummary,
      language,
      outputLanguages,
      pageList,
      catalog,
      glossary,
      quizData,
      imageMap,
      configJson,
      hasGlossary,
      hasQuiz,
    })
    fs.writeFileSync(path.join(adtDir, "AGENTS.md"), agentsMd)
  }

  progress.emit({ type: "step-complete", step })
}

// ---------------------------------------------------------------------------
// WebPub packaging
// ---------------------------------------------------------------------------

const WEBPUB_MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".js": "application/javascript",
  ".json": "application/json",
}

/**
 * Package the book as a Readium WebPub directory at `{bookDir}/webpub/`.
 *
 * Assumes ADT web packaging has already been run (i.e. `{bookDir}/adt/` exists).
 * Copies the ADT directory to `{bookDir}/webpub/`, adds a Readium WebPub
 * manifest, and tweaks config for embedded reading. The caller is responsible
 * for zipping the result into a `.webpub` file.
 */
export function packageWebpub(
  storage: Storage,
  options: PackageAdtWebOptions,
): void {
  const { bookDir, title } = options

  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throw new Error("ADT package not found — run packageAdtWeb first")
  }

  const webpubDir = path.join(bookDir, "webpub")

  // Copy adt/ -> webpub/
  if (fs.existsSync(webpubDir)) fs.rmSync(webpubDir, { recursive: true })
  copyDirRecursive(adtDir, webpubDir)

  // Override config: disable navigation controls and tutorial for embedded reading
  const configPath = path.join(webpubDir, "assets", "config.json")
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    config.features.showNavigationControls = false
    config.features.showTutorial = false
    writeJson(configPath, config)
  }

  // Inject CSS into HTML pages to prevent readers (e.g. Thorium) from applying
  // column-based pagination which breaks the single-page ADT layout.
  injectWebpubStyles(webpubDir, { fixedLayout: options.fixedLayout })

  // Load metadata for manifest
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as BookMetadata | undefined

  const manifestMetadata: Record<string, unknown> = {
    "@type": "http://schema.org/Book",
    title,
    language: options.language,
    modified: new Date().toISOString(),
    // Tell readers to scroll each page rather than paginating into columns,
    // and not to display two pages side-by-side (spread).
    presentation: {
      overflow: "scrolled",
      spread: "none",
    },
  }
  if (metadata?.authors?.length) {
    manifestMetadata.author = metadata.authors.join(", ")
  }
  if (metadata?.publisher) {
    manifestMetadata.publisher = metadata.publisher
  }

  // Links
  const links: Array<Record<string, string>> = [
    { rel: "self", href: "manifest.json", type: "application/webpub+json" },
  ]
  for (const [filename, mimeType] of [
    ["cover.png", "image/png"],
    ["cover.jpg", "image/jpeg"],
    ["cover.jpeg", "image/jpeg"],
  ] as const) {
    if (fs.existsSync(path.join(webpubDir, filename))) {
      links.push({ rel: "cover", href: filename, type: mimeType })
      break
    }
  }

  // Reading order from pages.json
  const pagesPath = path.join(webpubDir, "content", "pages.json")
  const pageList = JSON.parse(fs.readFileSync(pagesPath, "utf-8")) as PageEntry[]
  const readingOrder = pageList.map((page) => ({
    href: page.href,
    type: "text/html",
    title: page.page_number != null ? String(page.page_number) : page.section_id,
  }))

  // Enumerate all files as resources
  const resources: Array<{ href: string; type: string }> = []
  collectWebpubResources(webpubDir, webpubDir, resources)

  // Write manifest
  const manifest = {
    "@context": "https://readium.org/webpub-manifest/context.jsonld",
    metadata: manifestMetadata,
    links,
    readingOrder,
    resources,
  }
  writeJson(path.join(webpubDir, "manifest.json"), manifest)
}

const REFLOWABLE_OVERRIDE_CSS = `<style>
/* ── WebPub / EPUB reader overrides (reflowable) ──
   EPUB readers like Thorium inject their own column-based pagination.
   The ADT pages use Tailwind flex centering and responsive breakpoints
   that don't work well in reflowable EPUB viewports. Override everything
   to simple block flow with single-column layout. */

/* Prevent reader column pagination */
:root, html, body {
  columns: auto !important;
  column-width: auto !important;
  column-count: auto !important;
  column-gap: normal !important;
  overflow: visible !important;
}

/* Body: block flow, no flex centering, no viewport-height minimum */
body {
  display: block !important;
  min-height: auto !important;
  height: auto !important;
  max-width: none !important;
  max-height: none !important;
}

/* Content wrapper: block flow, visible (JS fade-in won't run in readers) */
#content {
  display: block !important;
  min-height: auto !important;
  height: auto !important;
  max-width: 100% !important;
  opacity: 1 !important;
}

/* Force single-column layout for all section containers.
   Side-by-side (lg:flex-row) layouts squeeze text in narrow
   reader viewports. */
section > div {
  flex-direction: column !important;
  max-width: 100% !important;
}

/* Remove max-width constraints on nested containers (max-w-6xl, max-w-xl, etc.) */
.container,
section [class*="max-w-"] {
  max-width: 100% !important;
}

/* Responsive images */
img {
  max-width: 100% !important;
  height: auto !important;
}
</style>`

const FIXED_LAYOUT_OVERRIDE_CSS = `<style>
/* ── EPUB reader overrides (fixed-layout) ──
   Preserve absolute positioning for fixed-layout pages while
   ensuring content is visible and the viewport is respected. */

/* Prevent reader column pagination */
:root, html, body {
  columns: auto !important;
  column-width: auto !important;
  column-count: auto !important;
  column-gap: normal !important;
}

/* Body: fill viewport, no flex centering */
body {
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
  min-height: auto !important;
  overflow: hidden !important;
}

/* Override Tailwind Preflight img reset that breaks positioned images */
#content img {
  max-width: none !important;
}

/* Content wrapper: preserve position:relative and explicit dimensions */
#content {
  opacity: 1 !important;
  margin: 0 !important;
}

/* Positioned text must stay absolute */
.text-overlay {
  position: absolute !important;
}
.text-overlay p {
  position: absolute !important;
}

/* SMIL media-overlay active class — declared in the OPF as
   media:active-class. EPUB readers toggle this on the active text
   element during read-aloud playback. */
.-epub-media-overlay-active {
  background: rgba(255, 235, 59, 0.4);
  border-radius: 0.15em;
}
</style>`

export interface InjectWebpubStylesOptions {
  fixedLayout?: boolean
}

/**
 * Walk all .html files in `dir` and inject a `<style>` block right before
 * `</head>` that overrides reader-injected column pagination CSS.
 */
export function injectWebpubStyles(dir: string, options?: InjectWebpubStylesOptions): void {
  const css = options?.fixedLayout ? FIXED_LAYOUT_OVERRIDE_CSS : REFLOWABLE_OVERRIDE_CSS
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      injectWebpubStyles(fullPath, options)
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      let html = fs.readFileSync(fullPath, "utf-8")
      html = html.replace("</head>", `${css}\n</head>`)
      fs.writeFileSync(fullPath, html)
    }
  }
}

function collectWebpubResources(
  baseDir: string,
  dir: string,
  out: Array<{ href: string; type: string }>,
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectWebpubResources(baseDir, fullPath, out)
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/")
      const ext = path.extname(entry.name).toLowerCase()
      out.push({
        href: relPath,
        type: WEBPUB_MIME_TYPES[ext] ?? "application/octet-stream",
      })
    }
  }
}


// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

export interface RenderPageOptions {
  content: string
  language: string
  sectionId: string
  pageTitle: string
  pageIndex: number
  activityAnswers?: Record<string, string | boolean | number>
  hasMath: boolean
  bundleVersion: string
  pageHeading?: string
  /** When true, content is placed directly inside the page-level <main> without adding a
   *  generated <div id="content"> wrapper. Used for quiz pages whose template provides
   *  its own #content element. */
  skipContentWrapper?: boolean
  applyBodyBackground?: boolean
  /** When true, renders a minimal page without navigation/sidebar chrome.
   *  Content is visible immediately (no opacity-0). Used for storyboard preview. */
  embed?: boolean
  /** Fixed viewport dimensions for fixed-layout pages (e.g., pre-paginated EPUB).
   *  When set, overrides the responsive viewport meta with a fixed size. */
  fixedViewport?: { width: number; height: number }
  /** CSS font-family chain for the reflowable base font (e.g.
   *  `'Atkinson Hyperlegible','Merriweather',sans-serif`). When set, overrides
   *  the global Merriweather rule from fonts.css and the family is loaded via
   *  Google Fonts. Omit (fixed-layout / serif default) to keep Merriweather. */
  bodyFontFamily?: string
}

/**
 * Add `opacity-0` to the first `<div id="content">` element's class list.
 * Used when the LLM-generated content already provides its own wrapper div so
 * we don't add a duplicate — but still need the fade-in class for the ADT animation.
 */
function injectOpacityClass(html: string): string {
  return html.replace(
    /(<div\b[^>]*\bid="content"[^>]*)>/,
    (_, opening) => {
      if (/\bopacity-0\b/.test(opening)) return opening + ">"
      const hasClass = /\bclass="/.test(opening)
      if (hasClass) {
        return opening.replace(/\bclass="([^"]*)"/, 'class="$1 opacity-0"') + ">"
      }
      return opening + ' class="opacity-0">'
    }
  )
}

export function promoteFirstHeadingToH1(html: string): string {
  if (/<h1\b/i.test(html)) return html
  return html.replace(/<h([2-6])(\b[^>]*)>([\s\S]*?)<\/h\1>/i, '<h1$2>$3</h1>')
}

/**
 * Resolve the reflowable base-font CSS chain for a book, or undefined when no
 * override is needed (fixed-layout books keep original fonts; the serif default
 * Merriweather is already the global font). Reads the book-level `font-profile`
 * node (detected serif/sans category) and the explicit `reflowableFont` setting.
 */
export function resolveReflowableFontChain(
  storage: Storage,
  opts: { fixedLayout?: boolean; reflowableFont?: string },
): string | undefined {
  const row = storage.getLatestNodeData("font-profile", "book")
  // The font profile only records the auto-detected categories (serif/sans).
  const category = (row?.data as { category?: "serif" | "sans" | null } | undefined)?.category ?? null
  // Single source of truth — same resolution packaging, preview, and pages use.
  return reflowableFontChain(category, opts) ?? undefined
}

export function renderPageHtml(opts: RenderPageOptions): string {
  // LaTeX is converted to static MathML at build time by Temml,
  // so no client-side math library is needed.
  const mathScript = ""

  const answersScript =
    opts.activityAnswers && Object.keys(opts.activityAnswers).length > 0
      ? `\n    <script type="text/javascript">\n        window.correctAnswers = JSON.parse('${escapeInlineScriptJson(JSON.stringify(opts.activityAnswers))}');\n    </script>`
      : ""

  const normalizedContent = promoteFirstHeadingToH1(opts.content)

  // INVARIANT: every page MUST render all TTS-scannable content inside
  // <div id="content">. The reader's gatherAudioElements scans #content for
  // [data-id] elements to build the TTS queue; anything outside #content is
  // invisible to read-aloud. skipContentWrapper is only safe when the source
  // content already provides its own <div id="content"> wrapper.
  //
  // When content already has <div id="content"> (LLM-generated), use it directly to avoid
  // a duplicate #content element.
  // Inject opacity-0 into the existing wrapper for the fade-in animation (skip in embed mode).
  const contentAlreadyWrapped = /^\s*<div\b[^>]*\bid="content"/.test(normalizedContent)
  const skipOpacity = opts.embed || opts.fixedViewport

  const contentBlock = opts.skipContentWrapper
    ? `      ${normalizedContent}`
    : contentAlreadyWrapped
      ? `      ${!skipOpacity ? injectOpacityClass(normalizedContent) : normalizedContent}`
      : `      <div id="content"${skipOpacity ? "" : ` class="opacity-0"`}>
        ${normalizedContent}
      </div>`

  const fallbackPageHeading = (opts.pageHeading ?? opts.pageTitle).trim()
  const fallbackHeadingHtml = /<h1\b/i.test(normalizedContent) || fallbackPageHeading.length === 0
    ? ""
    : `      <h1 class="sr-only" id="page-heading">${escapeHtml(fallbackPageHeading)}</h1>
`

  const mainBlock = opts.fixedViewport
    ? `    <main>
${contentBlock}
    </main>`
    : `    <main class="w-full">
${fallbackHeadingHtml}${contentBlock}
    </main>`

  // Extract data-background-color from content to apply on <body>
  let bodyStyle = ""
  if (opts.applyBodyBackground !== false) {
    const bgMatch = normalizedContent.match(/data-background-color="([^"]*)"/)
    bodyStyle = bgMatch?.[1]
      ? ` style="background-color: ${escapeAttr(bgMatch[1])};"`
      : ""
  }

  // In embed mode, hide non-essential chrome. The React runtime mounts the
  // activity Submit/Skip buttons inside #nav-container, so it must stay
  // visible — BottomDock self-hides via embedModeAtom (see ui.atoms.ts).
  const embedStyles = opts.embed
    ? `
    <style>
      /* Hide navigation, sidebar, and other chrome in embed mode */
      #back-forward-buttons, #nav-popup,
      #open-sidebar, #sidebar, #tts-quick-toggle-button, #play-bar,
      #sl-quick-toggle-button, #sign-language-video,
      #explain-me-button, #eli5-content, #notepad-button, #notepad-content { display: none !important; }
    </style>`
    : ""

  // Reflowable base-font override: re-declare the same elements fonts.css
  // targets with the chosen family, placed last in <head> so it wins. Omitted
  // for fixed-layout / serif-default books (keeps the global Merriweather).
  const bodyFontStyle = opts.bodyFontFamily
    ? `\n    <style>\n      body, p, h1, h2, h3, h4, h5, h6, span, div, button, input, textarea, select { font-family: ${opts.bodyFontFamily}; }\n    </style>`
    : ""

  // Load any Google Fonts the page actually uses — fixed-layout pages declare
  // the Google family on their text runs, and the reflowable base-font style
  // (above) declares the body family. The bundled Merriweather remains the
  // fallback for everything else.
  const googleFamilies = googleFontsReferencedIn(normalizedContent + bodyFontStyle)
  const googleFontsUrl = googleFontsCss2Url(googleFamilies)
  const googleFontsLinks = googleFontsUrl
    ? `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="${escapeAttr(googleFontsUrl)}" rel="stylesheet">`
    : ""

  return `<!DOCTYPE html>
<html lang="${escapeAttr(opts.language)}">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="${opts.fixedViewport ? `width=${opts.fixedViewport.width}, height=${opts.fixedViewport.height}` : "width=device-width, initial-scale=1"}" />
    <title>${escapeHtml(opts.pageTitle)}</title>
    <meta name="title-id" content="${escapeAttr(opts.sectionId)}" />
    <meta name="page-section-id" content="${opts.pageIndex}" />
    <link href="./content/tailwind_output.css" rel="stylesheet">
    <link href="./assets/libs/fontawesome/css/all.min.css" rel="stylesheet">
    <link href="./assets/fonts.css" rel="stylesheet">${googleFontsLinks}
${mathScript}${embedStyles}${bodyFontStyle}</head>

<body${opts.fixedViewport ? ` style="margin:0;overflow:hidden;width:${opts.fixedViewport.width}px;height:${opts.fixedViewport.height}px"` : ` class="min-h-screen flex items-center justify-center"${bodyStyle}`}>
${mainBlock}
${answersScript}
    <div class="relative z-50" id="interface-container"></div>
    <div class="relative z-50" id="nav-container"></div>
${opts.embed
      ? `    <script src="./assets/base.bundle.min.js?v=${escapeAttr(opts.bundleVersion)}" type="module"></script>`
      : `    <script src="./assets/offline-preloader.js"></script>
    <script src="./assets/scorm.js"></script>
    <script src="./assets/base.bundle.local.js"></script>`}
</body>

</html>
`
}

// ---------------------------------------------------------------------------
// Quiz HTML generation
// ---------------------------------------------------------------------------

export function pad3(n: number): string {
  return String(n).padStart(3, "0")
}

export function renderQuizHtml(
  quiz: Quiz,
  quizId: string,
  catalog: TextCatalogOutput | undefined,
): string {
  const questionId = `${quizId}_que`
  const texts = new Map<string, string>()
  if (catalog?.entries) {
    for (const e of catalog.entries) texts.set(e.id, e.text)
  }

  const correctAnswers: Record<string, boolean> = {}
  const explanationMapping: Record<string, string> = {}

  for (let i = 0; i < quiz.options.length; i++) {
    const optionId = `${quizId}_o${i}`
    correctAnswers[optionId] = i === quiz.answerIndex

    const expId = `${quizId}_o${i}_exp`
    if (texts.has(expId)) {
      explanationMapping[optionId] = expId
    }
  }

  let optionsHtml = ""
  for (let i = 0; i < quiz.options.length; i++) {
    const optionId = `${quizId}_o${i}`
    const optionText = texts.get(optionId) ?? quiz.options[i].text
    const expId = explanationMapping[optionId]
    const expText = expId ? (texts.get(expId) ?? quiz.options[i].explanation) : ""
    const expIdAttr = expId ? ` data-explanation-id="${escapeAttr(expId)}"` : ""

    optionsHtml += `
                    <label
                        class="activity-option w-full max-w-xl cursor-pointer rounded-2xl border-2 border-gray-900 bg-[#FFFAF5] px-8 py-6 text-center text-xl font-medium text-gray-900 shadow-[0_6px_0_0_rgba(0,0,0,0.65)] transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-green-300 hover:translate-y-[-2px] hover:shadow-[0_8px_0_0_rgba(0,0,0,0.55)]"
                        data-activity-item="${escapeAttr(optionId)}"
                        data-explanation="${escapeAttr(expText)}"${expIdAttr}
                        tabindex="0"
                    >
                        <input
                            type="radio"
                            name="${escapeAttr(quizId)}"
                            value="${escapeAttr(optionId)}"
                            data-activity-item="${escapeAttr(optionId)}"
                            class="sr-only"
                            aria-labelledby="${escapeAttr(optionId)}-option-label"
                        />
                        <span
                            id="${escapeAttr(optionId)}-option-label"
                            class="option-text block text-lg md:text-2xl text-gray-900"
                            data-id="${escapeAttr(optionId)}"
                        >
                            ${escapeHtml(optionText)}
                        </span>

                        <div class="feedback-container hidden w-full rounded-md border border-transparent bg-transparent px-3 py-2 text-gray-700" aria-live="polite">
                            <span aria-hidden="true" class="feedback-icon mr-2"></span>
                            <span class="feedback-text"></span>
                        </div>

                        <span class="validation-mark hidden"></span>
                    </label>`
  }

  const questionText = texts.get(questionId) ?? quiz.question

  return `<style>
    .activity-option.selected-option {
        border-color: #1d4ed8;
        border-width: 4px;
        background-color: rgba(59, 130, 246, 0.18);
        box-shadow: 0 14px 0 rgba(29, 78, 216, 0.35);
        transform: translateY(-3px);
    }

    .activity-option.selected-option .option-text {
        color: #1e3a8a;
        font-weight: 600;
    }
</style>

<div id="content" class="container content mx-auto w-full min-h-screen px-8 py-8 flex items-center justify-center opacity-0">
    <section
        id="simple-main"
        data-section-type="activity_quiz"
        data-id="${escapeAttr(quizId)}"
        data-area-id="${escapeAttr(quizId)}"
        data-correct-answers='${escapeAttr(JSON.stringify(correctAnswers))}'
        data-option-explanations='${escapeAttr(JSON.stringify(explanationMapping))}'
    >
        <div class="flex w-full flex-col items-center gap-10 px-6 py-10">
            <div class="w-full max-w-3xl rounded-3xl p-10">
                <header class="text-center">
                    <p
                        id="${escapeAttr(quizId)}-question-label"
                        class="text-3xl font-bold text-gray-900 tracking-tight"
                        data-id="${escapeAttr(questionId)}"
                    >
                        ${escapeHtml(questionText)}
                    </p>
                </header>

                <div
                    class="mt-8 flex flex-col items-center gap-6"
                    role="group"
                    aria-labelledby="${escapeAttr(quizId)}-question-label"
                >
${optionsHtml}
                </div>

                <div class="mt-10 flex flex-col items-center gap-4">
                    <div data-submit-target class="flex flex-wrap items-center justify-center gap-4"></div>
                </div>

            </div>
        </div>
    </section>
</div>

<script type="application/json" id="quiz-correct-answers">
${JSON.stringify(correctAnswers)}
</script>
<script type="application/json" id="quiz-explanations">
${JSON.stringify(explanationMapping)}
</script>`
}

export function buildQuizAnswers(quiz: Quiz, quizId: string): Record<string, boolean> {
  const answers: Record<string, boolean> = {}
  for (let i = 0; i < quiz.options.length; i++) {
    answers[`${quizId}_o${i}`] = i === quiz.answerIndex
  }
  return answers
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Scan the images directory and build imageId → filename map */
export function buildImageMap(imagesDir: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!fs.existsSync(imagesDir)) return map

  for (const file of fs.readdirSync(imagesDir)) {
    const ext = path.extname(file)
    if (ext === ".jpg" || ext === ".png") {
      const id = path.basename(file, ext)
      map.set(id, file)
    }
  }
  return map
}


function loadImageCaptionMap(storage: Storage, pageId: string): Map<string, string> {
  const row = storage.getLatestNodeData("image-captioning", pageId)
  if (!row) return new Map<string, string>()

  const data = row.data as ImageCaptioningOutput
  const map = new Map<string, string>()
  for (const caption of data.captions ?? []) {
    if (caption.caption?.trim()) {
      map.set(caption.imageId, caption.caption.trim())
    }
  }
  return map
}

/** Build the set of image IDs the user has marked as decorative for a page. */
export function buildDecorativeImageIdSet(storage: Storage, pageId: string): Set<string> {
  const row = storage.getLatestNodeData("image-captioning", pageId)
  const ids = new Set<string>()
  if (!row) return ids

  const data = row.data as ImageCaptioningOutput
  for (const caption of data.captions ?? []) {
    if (caption.decorative) ids.add(caption.imageId)
  }
  return ids
}

/** Collect every non-pruned image_group node in a section along with its image id. */
function collectImageGroups(section: PageSectioningSection): Array<{ group: ContentNodeData; imageId: string }> {
  const out: Array<{ group: ContentNodeData; imageId: string }> = []
  const walk = (node: ContentNodeData): void => {
    if (node.isPruned) return
    if (node.structure === "image_group") {
      const imageLeaf = node.children?.find((c) => c.role === "image" && !c.isPruned)
      if (imageLeaf) out.push({ group: node, imageId: imageLeaf.nodeId })
    }
    if (node.children) {
      for (const c of node.children) walk(c)
    }
  }
  for (const n of section.nodes) walk(n)
  return out
}

/** Collect all non-pruned leaf texts matching a role within a subtree. */
function collectLeafTextsByRole(node: ContentNodeData, role: string): string[] {
  const out: string[] = []
  const walk = (n: ContentNodeData): void => {
    if (n.isPruned) return
    if (n.role === role && n.text) {
      const trimmed = n.text.replace(/\s+/g, " ").trim()
      if (trimmed.length > 0) out.push(trimmed)
    }
    if (n.children) {
      for (const c of n.children) walk(c)
    }
  }
  walk(node)
  return out
}

function buildSectionImageAltMap(section: PageSectioningSection): Map<string, string> {
  const imageGroups = collectImageGroups(section)
  const map = new Map<string, string>()
  if (imageGroups.length !== 1) return map

  const captions = collectLeafTextsByRole(imageGroups[0].group, "caption")
  if (captions.length === 0) return map

  map.set(imageGroups[0].imageId, captions.join(" "))
  return map
}

function applyDuplicateImageAltPolicy(
  section: PageSectioningSection,
  altTextByImageId: Map<string, string>,
): Map<string, string> {
  const normalizedAltToFirstImageId = new Map<string, string>()
  const normalizedAltMap = new Map(altTextByImageId)

  for (const { imageId } of collectImageGroups(section)) {
    const altText = normalizedAltMap.get(imageId)?.trim()
    if (!altText) continue

    const dedupeKey = altText.replace(/\s+/g, " ").trim().toLowerCase()
    if (!dedupeKey) continue

    if (normalizedAltToFirstImageId.has(dedupeKey)) {
      normalizedAltMap.set(imageId, "")
      continue
    }

    normalizedAltToFirstImageId.set(dedupeKey, imageId)
  }

  return normalizedAltMap
}

export function buildPreferredImageAltMap(
  storage: Storage,
  pageId: string,
  section?: PageSectioningSection,
): Map<string, string> {
  const imageCaptionMap = loadImageCaptionMap(storage, pageId)
  const sectionImageAltMap = section ? buildSectionImageAltMap(section) : new Map<string, string>()
  const preferredImageAltMap = new Map(sectionImageAltMap)
  for (const [imageId, altText] of imageCaptionMap) {
    preferredImageAltMap.set(imageId, altText)
  }
  return section ? applyDuplicateImageAltPolicy(section, preferredImageAltMap) : preferredImageAltMap
}

export function normalizeSectionRoles(html: string): string {
  return normalizeHtmlSectionSemantics(html)
}

/** Rewrite image URLs from /api/books/{label}/images/{id} to images/{filename} */
export function rewriteImageUrls(
  html: string,
  label: string,
  imageMap: Map<string, string>,
  altTextByImageId?: Map<string, string>,
  decorativeImageIds?: Set<string>,
): { html: string; referencedImages: string[] } {
  const prefix = `/api/books/${label}/images/`
  const referencedImages: string[] = []
  const doc = parseDocument(normalizeSectionRoles(html))

  const imgs = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "img",
    doc.children,
  )

  for (const img of imgs) {
    let resolvedImageId: string | undefined
    const src = img.attribs.src ?? ""
    if (src.startsWith(prefix)) {
      const imageId = src.slice(prefix.length)
      const filename = imageMap.get(imageId)
      if (filename) {
        resolvedImageId = imageId
        img.attribs.src = `images/${filename}`
        referencedImages.push(imageId)
        delete img.attribs.width
        delete img.attribs.height
        const existingStyle = img.attribs.style ?? ""
        // Don't add responsive sizing to absolutely-positioned images (fixed-layout)
        if (!existingStyle.includes("position:absolute")) {
          const sizeStyle = "max-width: 100%; height: auto;"
          if (!existingStyle.includes("max-width")) {
            img.attribs.style = existingStyle
              ? `${existingStyle.trimEnd().replace(/;$/, "")}; ${sizeStyle}`
              : sizeStyle
          }
        }
      }
    }
    // Also handle data-id based images
    const dataId = img.attribs["data-id"]
    if (dataId && imageMap.has(dataId) && !img.attribs.src?.startsWith("images/")) {
      const filename = imageMap.get(dataId)!
      resolvedImageId = dataId
      img.attribs.src = `images/${filename}`
      if (!referencedImages.includes(dataId)) {
        referencedImages.push(dataId)
      }
      delete img.attribs.width
      delete img.attribs.height
      const existingStyle = img.attribs.style ?? ""
      // Don't add responsive sizing to absolutely-positioned images (fixed-layout)
      if (!existingStyle.includes("position:absolute")) {
        const sizeStyle = "max-width: 100%; height: auto;"
        if (!existingStyle.includes("max-width")) {
          img.attribs.style = existingStyle
            ? `${existingStyle.trimEnd().replace(/;$/, "")}; ${sizeStyle}`
            : sizeStyle
        }
      }
    }

    const imageIdForAlt = resolvedImageId ?? dataId
    const isDecorative = imageIdForAlt ? decorativeImageIds?.has(imageIdForAlt) ?? false : false
    if (isDecorative) {
      // Decorative image: needs no caption, hidden from assistive technology.
      img.attribs.alt = ""
      img.attribs.role = "presentation"
      img.attribs["aria-hidden"] = "true"
    } else {
      const hasPreferredAlt = imageIdForAlt ? altTextByImageId?.has(imageIdForAlt) ?? false : false
      const altText = imageIdForAlt ? altTextByImageId?.get(imageIdForAlt)?.trim() ?? "" : ""
      if (hasPreferredAlt && (img.attribs.alt === undefined || img.attribs.alt.trim() === "")) {
        img.attribs.alt = altText
      }
    }
  }

  const normalizedHtml = DomUtils.getOuterHTML(doc).replace(/(<img\b[^>]*?)\salt(?=[\s>])/g, "$1 alt=\"\"")
  return { html: normalizedHtml, referencedImages }
}

/**
 * Convert an HTML fragment to well-formed XHTML.
 * Uses htmlparser2 to parse and re-serialize in XML mode, and replaces
 * HTML named entities with their numeric equivalents.
 */
export function htmlToXhtml(html: string): string {
  const doc = parseDocument(html)
  let xhtml = DomUtils.getOuterHTML(doc, { xmlMode: true })
  // Replace common HTML named entities not valid in XML
  xhtml = xhtml.replace(/&nbsp;/g, "&#160;")
  xhtml = xhtml.replace(/&mdash;/g, "&#8212;")
  xhtml = xhtml.replace(/&ndash;/g, "&#8211;")
  xhtml = xhtml.replace(/&lsquo;/g, "&#8216;")
  xhtml = xhtml.replace(/&rsquo;/g, "&#8217;")
  xhtml = xhtml.replace(/&ldquo;/g, "&#8220;")
  xhtml = xhtml.replace(/&rdquo;/g, "&#8221;")
  xhtml = xhtml.replace(/&hellip;/g, "&#8230;")
  xhtml = xhtml.replace(/&bull;/g, "&#8226;")
  xhtml = xhtml.replace(/&copy;/g, "&#169;")
  return xhtml
}

// ---------------------------------------------------------------------------
// Glossary helpers
// ---------------------------------------------------------------------------

export function buildGlossaryJson(
  glossary: GlossaryOutput | undefined,
  catalog: TextCatalogOutput | undefined,
  textsMap: Record<string, string>,
  isSourceLanguage: boolean,
): Record<string, { word: string; definition: string; variations: string[]; emoji: string }> {
  if (!glossary?.items) return {}

  const result: Record<string, { word: string; definition: string; variations: string[]; emoji: string }> = {}

  for (let i = 0; i < glossary.items.length; i++) {
    const item = glossary.items[i]
    if (item.pruned) continue
    const glId = getGlossaryItemTextId(item, i)
    const defId = `${glId}_def`

    // Use translated text if available, otherwise fall back to source
    const word = textsMap[glId] ?? item.word
    const definition = textsMap[defId] ?? item.definition

    result[word] = {
      word,
      definition,
      variations: item.variations,
      emoji: item.emojis.join(""),
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Math detection
// ---------------------------------------------------------------------------

const MATH_INDICATORS = [
  "$",
  "\\(",
  "\\[",
  "<math",
  "\\begin{",
  // HTML-encoded forms (htmlparser2's getOuterHTML encodes $ as &#x24;)
  "&#x24;",
]

/**
 * Regex that matches LaTeX commands commonly found undelimited in LLM output.
 * Matches: \text{}, \hat{}, \frac{}{}, \sqrt{}, \vec{}, \bar{}, \overline{},
 * \circ, ^\circ, _{...}, ^{...}, \times, \div, \pm, \leq, \geq, \neq,
 * \mathcal{}, \mathbb{}, \in, \leftarrow, etc.
 * Also matches bare subscript/superscript like X_i or X^2, but NOT snake_case
 * identifiers like `variable_name` — the base letter must not be preceded by
 * another letter, and the subscript char must not be followed by another letter.
 */
const UNDELIMITED_LATEX_RE = /\\(?:text|mbox|hat|frac|sqrt|vec|bar|overline|underline|mathbf|mathrm|mathit|mathcal|mathbb|mathfrak|mathscr|circ|times|div|pm|mp|leq|geq|neq|approx|equiv|sim|in|notin|subset|supset|cup|cap|leftarrow|rightarrow|Leftarrow|Rightarrow|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|phi|psi|infty|partial|nabla|sum|prod|int|lim|log|ln|sin|cos|tan|sec|csc|cot|left|right|cdot|ldots|cdots|quad|qquad|binom|tag)\b|[_^]\{|(?<![A-Za-z])[A-Za-z][_^][A-Za-z0-9](?![A-Za-z])/

function containsMathContent(html: string): boolean {
  if (MATH_INDICATORS.some((indicator) => html.includes(indicator))) return true
  return UNDELIMITED_LATEX_RE.test(html)
}

/**
 * Returns true if the text is mixed prose with embedded math, rather than a
 * pure math expression. We detect this by looking for 3+ consecutive regular
 * English words — pure LaTeX expressions rarely have that.
 */
function isMixedContent(text: string): boolean {
  const words = text.split(/\s+/)
  let consecutive = 0
  for (const word of words) {
    if (/^[a-zA-Z]{3,}[.,;:!?]?$/.test(word)) {
      consecutive++
      if (consecutive >= 3) return true
    } else {
      consecutive = 0
    }
  }
  return false
}

/**
 * For mixed prose+math text nodes, find individual LaTeX expressions and
 * convert them to MathML inline, preserving the surrounding prose text.
 *
 * Matches compound expressions like `\mathcal{Z}_m`, `Z_r`, `f_\theta`,
 * `\{P_i, M_i\}`, etc. Each expression must contain at least one LaTeX
 * marker (backslash command, subscript, or superscript).
 */
function convertInlineLatexFragments(text: string): string {
  // First: handle \{...\} groups (escaped brace groups with content)
  text = text.replace(/\\{(?:[^{}]|\{[^{}]*\})*\\}/g, (expr) => {
    const mathml = tryTemml(expr.trim(), false) ?? tryTemml(expr.trim(), true)
    return mathml ?? expr
  })

  // Match LaTeX expressions: optional leading alphanumeric, one or more "atoms",
  // with optional alphanumeric glue between atoms.
  // Atoms: \command{...}, _\command{...}, _{...}, ^{...}, _x, ^x, \{ or \}
  // The expression must start at a word boundary (not inside an identifier),
  // and bare `_x`/`^x` subscripts cannot be followed by more letters — this
  // prevents snake_case identifiers like `variable_name` from being matched.
  const LATEX_EXPR_RE = /(?<![A-Za-z0-9])[A-Za-z0-9]*(?:(?:\\[a-zA-Z]+(?:\{(?:[^{}]|\{[^{}]*\})*\})*|[_^]\\[a-zA-Z]+(?:\{(?:[^{}]|\{[^{}]*\})*\})*|[_^]\{(?:[^{}]|\{[^{}]*\})*\}|[_^][A-Za-z0-9](?![A-Za-z])|\\[{}])[A-Za-z0-9]*)+/g

  text = text.replace(LATEX_EXPR_RE, (expr) => {
    const trimmed = expr.trim()
    if (!trimmed) return expr
    const mathml = tryTemml(trimmed, false) ?? tryTemml(trimmed, true)
    return mathml ?? expr
  })

  return text
}

// ---------------------------------------------------------------------------
// LaTeX → MathML conversion
// ---------------------------------------------------------------------------

/**
 * Render LaTeX via Temml. Returns null on failure.
 * Temml may embed errors as `<span class="temml-error">` instead of throwing,
 * so we check the output for error spans as well.
 */
function tryTemml(latex: string, displayMode: boolean): string | null {
  try {
    const result = temml.renderToString(latex, { displayMode })
    if (result.includes("temml-error")) return null
    return result
  } catch {
    return null
  }
}

/**
 * Try inline mode first, fall back to display mode if that fails.
 * Handles commands like \tag{} and \\ that require display mode.
 */
function renderLatexWithFallback(latex: string): string | null {
  return tryTemml(latex, false) ?? tryTemml(latex, true)
}

/**
 * Decode HTML entities for $ that htmlparser2 serialization may produce,
 * so that LaTeX delimiters can be matched by the regex patterns below.
 */
function decodeDollarEntities(s: string): string {
  return s.replace(/&#x24;/g, "$").replace(/&#36;/g, "$")
}

/**
 * Decode common HTML entities that Liquid's `escape` filter introduces into
 * LaTeX content (e.g., `>` → `&gt;`, `<` → `&lt;`). Without this, temml
 * receives `\tau&gt;0` instead of `\tau>0` and fails to parse.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Convert a plain text string containing LaTeX to MathML.
 * Handles delimited ($, $$, \(, \[) and undelimited LaTeX.
 * Used for text catalog entries (texts.json) that are plain strings.
 *
 * For mixed prose+math (e.g. "the space M = (X, V), where X ∈ ℝ^{N×3}"),
 * only delimited math is converted — the undelimited pass is skipped to
 * avoid rendering the entire paragraph as a math expression.
 */
export function convertLatexString(text: string): string {
  text = decodeDollarEntities(text)

  let converted = convertDelimitedLatex(text)

  // If delimited conversion didn't change anything, try undelimited.
  if (converted === text && UNDELIMITED_LATEX_RE.test(text)) {
    // Pure math expression — render as a single block
    if (!isMixedContent(text)) {
      return renderLatexWithFallback(text.trim()) ?? converted
    }
    // Mixed prose+math — convert individual LaTeX fragments inline
    return convertInlineLatexFragments(converted)
  }

  return converted
}

/**
 * Replace delimited LaTeX math ($$, $, \[, \() with MathML.
 */
function convertDelimitedLatex(text: string): string {
  // Process display math first ($$...$$ and \[...\]) then inline ($...$ and \(...\))
  // to avoid $$...$$ being matched as two inline $...$ blocks.
  // Decode HTML entities (e.g., &gt; → >) inside captured LaTeX before rendering,
  // since Liquid's escape filter encodes <, >, & in text content.

  // $$...$$ — display math
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, latex: string) =>
    tryTemml(decodeHtmlEntities(latex.trim()), true) ?? _match
  )

  // \[...\] — display math
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_match, latex: string) =>
    tryTemml(decodeHtmlEntities(latex.trim()), true) ?? _match
  )

  // $...$ — inline math (avoid matching escaped \$ or empty $$)
  // Negative lookbehind for backslash; content must be non-empty and not start/end with space
  text = text.replace(/(?<!\\)\$([^\s$](?:[^$]*[^\s$])?)\$/g, (_match, latex: string) =>
    tryTemml(decodeHtmlEntities(latex.trim()), false) ?? _match
  )

  // \(...\) — inline math
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_match, latex: string) =>
    tryTemml(decodeHtmlEntities(latex.trim()), false) ?? _match
  )

  return text
}

/**
 * Replace LaTeX math in HTML content with MathML rendered by Temml.
 * Handles delimited math ($, $$, \(, \[) and undelimited LaTeX in text nodes.
 */
export function convertLatexToMathml(html: string): string {
  html = decodeDollarEntities(html)

  // First pass: convert delimited math anywhere in the string
  html = convertDelimitedLatex(html)

  // Second pass: convert undelimited LaTeX in text nodes (content between > and <).
  // For pure math nodes, render the entire text as a single expression.
  // For mixed prose+math, find and convert individual LaTeX fragments inline.
  html = html.replace(/(>)([^<]+)(<)/g, (_match, open: string, text: string, close: string) => {
    if (!UNDELIMITED_LATEX_RE.test(text)) return _match
    if (text.includes("<math")) return _match
    const decoded = decodeHtmlEntities(text)
    if (isMixedContent(decoded)) {
      const converted = convertInlineLatexFragments(decoded)
      return converted !== decoded ? `${open}${converted}${close}` : _match
    }
    const mathml = renderLatexWithFallback(decoded.trim())
    return mathml ? `${open}${mathml}${close}` : _match
  })

  return html
}

// ---------------------------------------------------------------------------
// Tailwind CSS build
// ---------------------------------------------------------------------------

async function buildTailwindCss(
  adtDir: string,
  webAssetsDir: string,
): Promise<void> {
  const outputPath = path.join(adtDir, "content", "tailwind_output.css")

  // In Tauri sidecar mode, postcss/tailwindcss cannot run inside the pkg binary.
  // bundle.mjs pre-builds tailwind_output.css into webAssetsDir before zipping.
  const preBuilt = path.join(webAssetsDir, "tailwind_output.css")
  if (fs.existsSync(preBuilt)) {
    fs.copyFileSync(preBuilt, outputPath)
    return
  }

  // Dynamic imports to avoid issues if not installed
  const postcss = (await import("postcss")).default
  // @tailwindcss/postcss is the Tailwind v4 plugin. Theme/colors live in CSS
  // (tailwind_css.css → globals.css) via the @theme inline directive, so the
  // plugin needs no JS-side config.
  const tailwindcss = (await import("@tailwindcss/postcss")).default

  const inputCssPath = path.join(webAssetsDir, "tailwind_css.css")
  const inputCss = fs.existsSync(inputCssPath)
    ? fs.readFileSync(inputCssPath, "utf-8")
    : '@import "tailwindcss";'

  // Inject content sources via @source directives. Tailwind v4 scans only
  // files on disk, so compiled chrome bundles + book HTML files are
  // referenced by absolute path.
  const sourceDirectives = [
    `@source "${toPosix(path.join(adtDir, "**/*.html"))}";`,
    `@source "${toPosix(path.join(adtDir, "**/*.js"))}";`,
  ].join("\n")

  const result = await postcss([tailwindcss({ base: adtDir })]).process(
    `${sourceDirectives}\n${inputCss}`,
    { from: TAILWIND_VIRTUAL_FROM },
  )

  fs.writeFileSync(outputPath, result.css)
}

/** Convert Windows backslashes to forward slashes for `@source` paths. */
function toPosix(p: string): string {
  return p.replace(/\\/g, "/")
}

/**
 * Build Tailwind CSS for preview and return the CSS string.
 * Scans the given content HTML plus all web asset files for used classes.
 */
export async function buildPreviewTailwindCss(
  contentHtml: string,
  webAssetsDir: string,
): Promise<string> {
  const postcss = (await import("postcss")).default
  const tailwindcss = (await import("@tailwindcss/postcss")).default

  const inputCssPath = path.join(webAssetsDir, "tailwind_css.css")
  const inputCss = fs.existsSync(inputCssPath)
    ? fs.readFileSync(inputCssPath, "utf-8")
    : '@import "tailwindcss";'

  // Tailwind v4 scans files on disk only — there's no equivalent to v3's
  // `content: [{ raw, extension }]`. For dynamic content (HTML built from
  // the DB rows), write to a temp file and reference it via @source.
  // For chrome classes, scan apps/adt-runtime/src directly so JSX class
  // strings are picked up before they get minified into the bundle.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-twv4-"))
  const tempHtml = path.join(tempDir, "preview-content.html")
  fs.writeFileSync(tempHtml, contentHtml)

  const sourceDirectives = [
    `@source "${toPosix(tempHtml)}";`,
    `@source "${toPosix(path.resolve(webAssetsDir, "../../apps/adt-runtime/src"))}";`,
    `@source "${toPosix(path.join(webAssetsDir, "base.bundle.min.js"))}";`,
  ].join("\n")

  try {
    const result = await postcss([tailwindcss({ base: webAssetsDir })]).process(
      `${sourceDirectives}\n${inputCss}`,
      { from: TAILWIND_VIRTUAL_FROM },
    )
    return result.css
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// JS bundle build (base.js → base.bundle.min.js via esbuild)
// ---------------------------------------------------------------------------

async function buildJsBundle(
  webAssetsDir: string,
  outputAssetsDir: string,
): Promise<void> {
  // The runtime bundle is produced by apps/adt-runtime/build.config.mjs and
  // emitted into webAssetsDir as base.bundle.min.js (ESM) +
  // base.bundle.local.js (IIFE). bundle.mjs pre-builds these for sidecar
  // mode (esbuild can't run inside the pkg binary). In dev mode we trigger
  // the build script on-demand if the pre-built files are missing.
  const preBuiltEsm = path.join(webAssetsDir, "base.bundle.min.js")
  const preBuiltIife = path.join(webAssetsDir, "base.bundle.local.js")

  if (!fs.existsSync(preBuiltEsm) || !fs.existsSync(preBuiltIife)) {
    // Resolve apps/adt-runtime/build.config.mjs relative to webAssetsDir
    // (which is typically <monorepo>/assets/adt). The script writes the
    // bundles back into webAssetsDir.
    const buildScript = path.resolve(
      webAssetsDir,
      "../../apps/adt-runtime/build.config.mjs",
    )
    if (fs.existsSync(buildScript)) {
      // Convert to a file:// URL so Node's ESM loader doesn't read the
      // Windows drive letter as a URL scheme.
      const buildScriptUrl = pathToFileURL(buildScript)
      buildScriptUrl.searchParams.set("t", String(Date.now()))
      await import(buildScriptUrl.href)
    }
  }

  if (fs.existsSync(preBuiltEsm)) {
    fs.copyFileSync(preBuiltEsm, path.join(outputAssetsDir, "base.bundle.min.js"))
  }
  if (fs.existsSync(preBuiltIife)) {
    fs.copyFileSync(preBuiltIife, path.join(outputAssetsDir, "base.bundle.local.js"))
  }
}

// ---------------------------------------------------------------------------
// AGENTS.md template rendering
// ---------------------------------------------------------------------------

interface AgentsMdContext {
  title: string
  label: string
  summary: string | undefined
  language: string
  outputLanguages: string[]
  pageList: PageEntry[]
  catalog: TextCatalogOutput | undefined
  glossary: GlossaryOutput | undefined
  quizData: QuizGenerationOutput | undefined
  imageMap: Map<string, string>
  configJson: unknown
  hasGlossary: boolean
  hasQuiz: boolean
}

async function renderAgentsMd(
  templatePath: string,
  ctx: AgentsMdContext,
): Promise<string> {
  const { Liquid } = await import("liquidjs")
  const liquid = new Liquid({ strictVariables: false })
  const template = fs.readFileSync(templatePath, "utf-8")

  const entries = ctx.catalog?.entries ?? []

  // Find sample entries for examples
  const sampleBodyText = entries.find((e) => /_gp\d+_tx\d+$/.test(e.id)) ?? { id: "pg001_gp001_tx001", text: "" }
  const sampleImageText = entries.find((e) => /_im\d+$/.test(e.id)) ?? { id: "pg001_im001", text: "" }

  // Derive the page ID from the first content page's section_id (e.g. "pg002_sec001" → "pg002_sec001")
  const samplePageId = ctx.pageList.find((p) => p.section_id.startsWith("pg") && p.page_number !== undefined)?.section_id
    ?? ctx.pageList[0]?.section_id ?? "pg001_sec001"

  // Glossary sample
  let sampleGlossary: Record<string, unknown> | undefined
  if (ctx.glossary?.items?.length) {
    const item = ctx.glossary.items[0]
    const glId = getGlossaryItemTextId(item, 0)
    sampleGlossary = {
      id: glId,
      defId: `${glId}_def`,
      word: item.word,
      definition: item.definition,
      variations: item.variations,
      variationsJson: JSON.stringify(item.variations),
      emoji: item.emojis.join(""),
    }
  }

  // Quiz sample
  let sampleQuiz: Record<string, unknown> | undefined
  if (ctx.quizData?.quizzes?.length) {
    const quiz = ctx.quizData.quizzes[0]
    const quizId = "qz001"
    const correctAnswers: Record<string, boolean> = {}
    const explanations: Record<string, string> = {}
    const options = quiz.options.map((opt, i) => {
      const optId = `${quizId}_o${i}`
      const expId = `${optId}_exp`
      correctAnswers[optId] = i === quiz.answerIndex
      explanations[optId] = expId
      return {
        id: optId,
        text: opt.text,
        expId,
        expText: opt.explanation,
      }
    })
    sampleQuiz = {
      id: quizId,
      question: quiz.question,
      options,
      correctAnswersJson: JSON.stringify(correctAnswers),
      explanationsJson: JSON.stringify(explanations),
    }
  }

  // Page images — collect all pg{NNN}_page.* filenames
  const pageImages: string[] = []
  for (const [id, filename] of ctx.imageMap) {
    if (id.endsWith("_page")) {
      pageImages.push(filename)
    }
  }
  pageImages.sort()

  return liquid.parseAndRender(template, {
    title: ctx.title,
    label: ctx.label,
    summary: ctx.summary,
    language: ctx.language,
    outputLanguages: ctx.outputLanguages,
    totalPages: ctx.pageList.length,
    firstPages: ctx.pageList.slice(0, 5),
    samplePageId,
    sampleBodyText,
    sampleImageText,
    sampleGlossary,
    sampleQuiz,
    hasGlossary: ctx.hasGlossary,
    hasQuiz: ctx.hasQuiz,
    configJsonFormatted: JSON.stringify(ctx.configJson, null, 2),
    pageImages,
  })
}

// ---------------------------------------------------------------------------
// SCORM + Offline support generators
// ---------------------------------------------------------------------------

/**
 * Rewrite `assets/fonts.css` so each `@font-face` `url('./fonts/X.woff2')`
 * becomes a `data:font/woff2;base64,...` URI, then delete `assets/fonts/`.
 * Required for `file://` (double-click) mode: browsers treat every file path
 * as a unique origin and block cross-origin font fetches, even though the
 * woff2 lives in the same directory tree.
 */
function inlineFontsInCss(adtDir: string): void {
  const cssPath = path.join(adtDir, "assets", "fonts.css")
  if (!fs.existsSync(cssPath)) return
  const original = fs.readFileSync(cssPath, "utf-8")
  const updated = original.replace(
    /url\(\s*['"]?(?:\.\/)?fonts\/([^'")]+\.woff2)['"]?\s*\)\s*format\(\s*['"]woff2['"]\s*\)/g,
    (_match, file: string) => {
      const fontPath = path.join(adtDir, "assets", "fonts", file)
      const b64 = fs.readFileSync(fontPath).toString("base64")
      return `url('data:font/woff2;base64,${b64}') format('woff2')`
    },
  )
  if (updated === original) return
  fs.writeFileSync(cssPath, updated)
  fs.rmSync(path.join(adtDir, "assets", "fonts"), { recursive: true, force: true })
}

/**
 * Generate `assets/offline-preloader.js` — inlines all JSON/HTML files that
 * the ADT bundle fetches at startup and monkey-patches `window.fetch` to
 * serve them from memory. This allows the ADT to work when opened via
 * `file://` (double-click). On HTTP/HTTPS the patch falls through to real
 * `fetch()`, so it's transparent.
 */
function generateOfflinePreloader(
  adtDir: string,
  outputLanguages: string[],
): void {
  const inline: Record<string, unknown> = {}

  const readTextSafe = (rel: string): string | null => {
    const p = path.join(adtDir, rel)
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null
  }
  const readJsonSafe = (rel: string): unknown | null => {
    const text = readTextSafe(rel)
    if (text === null) return null
    try { return JSON.parse(text) } catch { return null }
  }

  // Shared files
  // Note: interface.html is no longer emitted — the React runtime mounts
  // the chrome imperatively into <div id="interface-container">, so there's
  // nothing to inline. The legacy fragment was inlined here to avoid an
  // extra round-trip on page load; that round-trip no longer exists.

  for (const rel of [
    "assets/config.json",
    "content/pages.json",
    "content/toc.json",
  ]) {
    const data = readJsonSafe(rel)
    if (data !== null) inline[`./${rel}`] = data
  }

  const navHtml = readTextSafe("content/navigation/nav.html")
  if (navHtml !== null) inline["./content/navigation/nav.html"] = navHtml

  // Inline every page HTML at the bundle root (index.html + pgNNN_secMMM.html).
  // The glossary "show on page" feature fetches these to scan for terms,
  // which fails under file:// without inlining.
  for (const name of fs.readdirSync(adtDir)) {
    if (!name.endsWith(".html")) continue
    const text = readTextSafe(name)
    if (text !== null) inline[`./${name}`] = text
  }

  // Per-language files
  for (const lang of outputLanguages) {
    const itPath = `assets/interface_translations/${lang}/interface_translations.json`
    const itData = readJsonSafe(itPath)
    if (itData !== null) inline[`./${itPath}`] = itData

    for (const file of [
      "texts.json",
      "audios.json",
      "videos.json",
      "images.json",
      "glossary.json",
      "timecode/timecode_output.json",
    ]) {
      const rel = `content/i18n/${lang}/${file}`
      const data = readJsonSafe(rel)
      if (data !== null) inline[`./${rel}`] = data
    }
  }

  const js = `// offline-preloader.js — auto-generated, do not edit by hand
(function () {
  var INLINE = ${JSON.stringify(inline)};
  var BASE_DIR = (function () {
    var href = location.href.split("?")[0].split("#")[0];
    return href.slice(0, href.lastIndexOf("/") + 1);
  })();
  function lookup(url) {
    var clean = String(url).split("?")[0].split("#")[0];
    if (BASE_DIR && clean.indexOf(BASE_DIR) === 0) clean = clean.slice(BASE_DIR.length);
    if (clean.indexOf("./") === 0) clean = clean.slice(2);
    var withDot = "./" + clean;
    if (Object.prototype.hasOwnProperty.call(INLINE, withDot)) return withDot;
    if (Object.prototype.hasOwnProperty.call(INLINE, clean)) return clean;
    return null;
  }
  var _realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    // Normalize Request objects to their URL string.
    var raw = (url && typeof url === "object" && typeof url.url === "string") ? url.url : url;
    var key = lookup(raw);
    if (key !== null) {
      var data = INLINE[key];
      var isJson = key.slice(-5) === ".json";
      var body = isJson ? JSON.stringify(data) : data;
      var ct = isJson ? "application/json" : "text/html; charset=utf-8";
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "Content-Type": ct } })
      );
    }
    return _realFetch(url, opts);
  };
  if (location.protocol === 'file:') {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.tagName === 'LINK' && node.rel === 'manifest') {
            node.parentNode.removeChild(node);
          }
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`
  fs.writeFileSync(path.join(adtDir, "assets", "offline-preloader.js"), js)
}

/**
 * Generate `assets/scorm.js` — a SCORM 1.2 adapter that tracks learner
 * progress across all activity types. Exits silently when no LMS is present.
 *
 * @param activityIds - All activity IDs in the ADT (quiz IDs + inline activity IDs).
 *   When empty, the ADT is content-only and is marked `passed` on first visit.
 */
function generateScormAdapter(
  assetsDir: string,
  activityIds: string[],
): void {
  const js = `// scorm.js — SCORM 1.2 adapter, auto-generated, do not edit by hand
(function () {
  'use strict';

  // --- Find the SCORM 1.2 API by traversing parent frames ---
  function findAPI(win) {
    var depth = 0;
    while (depth < 7) {
      if (win.API) return win.API;
      if (!win.parent || win.parent === win) break;
      win = win.parent;
      depth++;
    }
    return null;
  }

  var API = findAPI(window);
  if (!API) return; // Not in a SCORM LMS — exit silently

  // --- Initialize the session ---
  API.LMSInitialize('');

  // --- Identify the current page ---
  var metaTitleId = document.querySelector('meta[name="title-id"]');
  var pageId = metaTitleId ? metaTitleId.getAttribute('content') : '';

  // All activity IDs in this ADT (embedded at generation time)
  var ALL_ACTIVITY_IDS = ${JSON.stringify(activityIds)};
  var hasActivities = ALL_ACTIVITY_IDS.length > 0;

  // --- Record where the learner is ---
  API.LMSSetValue('cmi.core.lesson_location', pageId);

  // --- Set lesson status ---
  if (hasActivities) {
    applyStatus();
    watchForCompletions();
  } else {
    // Content-only ADT — mark as passed on first visit
    var existingStatus = API.LMSGetValue('cmi.core.lesson_status') || '';
    if (existingStatus !== 'passed') {
      API.LMSSetValue('cmi.core.lesson_status', 'passed');
      API.LMSSetValue('cmi.core.score.raw', '100');
      API.LMSSetValue('cmi.core.score.min', '0');
      API.LMSSetValue('cmi.core.score.max', '100');
    }
  }

  API.LMSCommit('');

  // --- Session close ---
  window.addEventListener('beforeunload', function () {
    if (hasActivities) applyStatus();
    API.LMSCommit('');
    API.LMSFinish('');
  });

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  function getCompletedIds() {
    var completed = [];
    try {
      completed = JSON.parse(localStorage.getItem('completedActivities') || '[]');
    } catch (e) { /* ignore */ }

    var ids = {};
    for (var i = 0; i < completed.length; i++) {
      if (typeof completed[i] === 'string') {
        var dashIdx = completed[i].indexOf('-');
        var actId = dashIdx > -1 ? completed[i].substring(0, dashIdx) : completed[i];
        ids[actId] = true;
      }
    }
    return ids;
  }

  function applyStatus() {
    var completedIds = getCompletedIds();
    var completedCount = 0;
    for (var i = 0; i < ALL_ACTIVITY_IDS.length; i++) {
      if (completedIds[ALL_ACTIVITY_IDS[i]]) completedCount++;
    }

    var score = Math.round((completedCount / ALL_ACTIVITY_IDS.length) * 100);
    API.LMSSetValue('cmi.core.score.raw', String(score));
    API.LMSSetValue('cmi.core.score.min', '0');
    API.LMSSetValue('cmi.core.score.max', '100');

    if (completedCount === ALL_ACTIVITY_IDS.length) {
      API.LMSSetValue('cmi.core.lesson_status', 'passed');
    } else {
      var existingStatus = API.LMSGetValue('cmi.core.lesson_status') || '';
      if (existingStatus !== 'passed') {
        API.LMSSetValue('cmi.core.lesson_status', 'incomplete');
      }
    }
  }

  function watchForCompletions() {
    var _origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      _origSetItem(key, value);
      if (key === 'completedActivities') {
        applyStatus();
        API.LMSCommit('');
      }
    };

    window.addEventListener('storage', function (e) {
      if (e.key === 'completedActivities') {
        applyStatus();
        API.LMSCommit('');
      }
    });
  }
})();
`
  fs.writeFileSync(path.join(assetsDir, "scorm.js"), js)
}

/**
 * Generate `imsmanifest.xml` at the ADT root for SCORM 1.2 LMS upload.
 * Lists all HTML pages as file entries within a single SCO.
 */
function generateImsManifest(
  adtDir: string,
  title: string,
  label: string,
  pageList: PageEntry[],
): void {
  const identifier = `ADT_${label.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
  const escapedTitle = escapeHtml(title)

  const fileEntries = pageList
    .filter((p) => p.href !== "index.html") // index.html already listed above
    .map((p) => `      <file href="${escapeAttr(p.href)}"/>`)
    .join("\n")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeAttr(identifier)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                       http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>

  <organizations default="ADT_ORG">
    <organization identifier="ADT_ORG">
      <title>${escapedTitle}</title>
      <item identifier="ITEM_1" identifierref="RESOURCE_1">
        <title>${escapedTitle}</title>
      </item>
    </organization>
  </organizations>

  <resources>
    <resource identifier="RESOURCE_1"
              type="webcontent"
              adlcp:scormtype="sco"
              href="index.html">
      <file href="index.html"/>
${fileEntries}
    </resource>
  </resources>

</manifest>
`
  fs.writeFileSync(path.join(adtDir, "imsmanifest.xml"), xml)
}

/**
 * Scan all HTML files in the ADT directory for `data-area-id` attributes
 * and return the unique set of activity IDs.
 * Also includes quiz section IDs from the page list (entries starting with "qz").
 */
function collectActivityIds(adtDir: string, pageList: PageEntry[]): string[] {
  const ids = new Set<string>()

  // Quiz IDs from page list
  for (const page of pageList) {
    if (page.section_id.startsWith("qz")) {
      ids.add(page.section_id)
    }
  }

  // Scan HTML files for data-area-id (used by activity sections)
  for (const entry of fs.readdirSync(adtDir)) {
    if (!entry.endsWith(".html")) continue
    const html = fs.readFileSync(path.join(adtDir, entry), "utf-8")
    const matches = html.matchAll(/data-area-id="([^"]+)"/g)
    for (const match of matches) {
      ids.add(match[1])
    }
  }

  return Array.from(ids).sort()
}

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

/**
 * Find the first heading-role leaf anywhere in a section's tree.
 * Returns the nodeId and text of the first heading leaf found, or null.
 */
function findHeadingText(
  section: import("@adt/types").PageSectioningSection,
): { textId: string; text: string } | null {
  const walk = (node: ContentNodeData): { textId: string; text: string } | null => {
    if (node.isPruned) return null
    if (node.role === "heading" && node.text) {
      return { textId: node.nodeId, text: node.text }
    }
    if (node.children) {
      for (const c of node.children) {
        const hit = walk(c)
        if (hit) return hit
      }
    }
    return null
  }
  for (const n of section.nodes) {
    const hit = walk(n)
    if (hit) return hit
  }
  return null
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

function pickDefaultLanguage(
  preferredLanguage: string,
  availableLanguages: string[],
): string {
  if (availableLanguages.includes(preferredLanguage)) {
    return preferredLanguage
  }
  const preferredBase = getBaseLanguage(preferredLanguage)
  const matchingBase = availableLanguages.find(
    (lang) => getBaseLanguage(lang) === preferredBase,
  )
  return matchingBase ?? availableLanguages[0] ?? preferredLanguage
}

function escapeInlineScriptJson(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
}

export function copyDirRecursive(
  src: string,
  dest: string,
  skip?: Set<string>,
): void {
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src)) {
    if (skip?.has(entry)) continue
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    const stat = fs.statSync(srcPath)
    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// ---------------------------------------------------------------------------
// Static HTML: Navigation component
// ---------------------------------------------------------------------------

export const NAV_HTML = `<nav aria-label="Content Index Menu" aria-labelledby="navPopupTitle" aria-hidden="true" inert class="fixed w-64 sm:w-80 bg-white shadow-lg p-5 border-r border-gray-300 -translate-x-full z-20 hidden rounded-lg top-2 left-0 bottom-2 h-[calc(100vh-5rem)] flex flex-col" id="navPopup" role="navigation">
    <div class="nav__toggle flex flex-col gap-4 mb-4">
        <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold" data-id="toc-title" id="navPopupTitle">Contents</h3>
            <button aria-label="Close navigation" class="nav__toggle text-gray-700 text-xl p-2" id="nav-close" type="button"><i class="fas fa-close"></i></button>
        </div>
        <div aria-label="Navigation tabs" class="flex rounded-md bg-gray-100 p-1" role="tablist">
            <button aria-controls="nav-panel-toc" aria-selected="true" class="flex-1 rounded-md px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" data-nav-tab="toc" id="nav-tab-toc" role="tab" type="button">
                <span data-id="toc-title">Table of Contents</span>
            </button>
            <button aria-controls="nav-panel-pages" aria-selected="false" class="flex-1 rounded-md px-3 py-2 text-sm font-semibold text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" data-nav-tab="pages" id="nav-tab-pages" role="tab" type="button">
                <span data-id="nav-page-tab-label">Page List</span>
            </button>
        </div>
        <a class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-white focus:border-2 focus:border-blue-600 focus:rounded" href="#content">Table of Contents</a>
    </div>
    <div class="nav__panels flex-1 min-h-0 overflow-hidden">
        <div aria-labelledby="nav-tab-toc" class="h-full" data-nav-panel="toc" id="nav-panel-toc" role="tabpanel">
            <ol class="nav__list overflow-y-auto h-full text-base pr-2" data-id="nav-toc-list" data-nav-type="toc" id="nav-toc-list"></ol>
        </div>
        <div aria-labelledby="nav-tab-pages" class="h-full hidden" data-nav-panel="pages" id="nav-panel-pages" role="tabpanel">
            <ol class="nav__list overflow-y-auto h-full text-base pr-2" data-id="nav-page-list" data-nav-type="pages" id="nav-page-list"></ol>
        </div>
    </div>
</nav>
`
