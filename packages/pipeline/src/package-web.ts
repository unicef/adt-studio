import fs from "node:fs"
import path from "node:path"
import { parseDocument, DomUtils } from "htmlparser2"
import type { Storage } from "@adt/storage"
import type {
  WebRenderingOutput,
  PageSectioningOutput,
  TextCatalogOutput,
  GlossaryOutput,
  QuizGenerationOutput,
  TTSOutput,
  Quiz,
} from "@adt/types"
import { WebRenderingOutput as WebRenderingOutputSchema } from "@adt/types"
import type { Progress } from "./progress.js"
import { nullProgress } from "./progress.js"

export interface PackageAdtWebOptions {
  bookDir: string
  label: string
  language: string
  outputLanguages: string[]
  title: string
  webAssetsDir: string
  bundleVersion?: string
}

interface PageEntry {
  section_id: string
  href: string
  page_number?: number
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
    language,
    outputLanguages,
    title,
    webAssetsDir,
    bundleVersion = "1",
  } = options

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

  const catalogRow = storage.getLatestNodeData("text-catalog", "book")
  const catalog = catalogRow?.data as TextCatalogOutput | undefined

  const glossaryRow = storage.getLatestNodeData("glossary", "book")
  const glossary = glossaryRow?.data as GlossaryOutput | undefined

  const quizRow = storage.getLatestNodeData("quiz-generation", "book")
  const quizData = quizRow?.data as QuizGenerationOutput | undefined

  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as { title?: string | null; cover_page_number?: number | null } | undefined

  // ------------------------------------------------------------------
  // Process pages
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Processing pages..." })

  const pageList: PageEntry[] = []
  let hasMath = false
  const copiedImages = new Set<string>()

  // Build a map from afterPageId -> quizzes for interleaving
  const quizzesByAfterPageId = new Map<string, Quiz[]>()
  if (quizData?.quizzes) {
    for (const quiz of quizData.quizzes) {
      const existing = quizzesByAfterPageId.get(quiz.afterPageId) ?? []
      existing.push(quiz)
      quizzesByAfterPageId.set(quiz.afterPageId, existing)
    }
  }

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]
    const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
    if (!renderRow) continue

    const parsed = WebRenderingOutputSchema.safeParse(renderRow.data)
    if (!parsed.success) continue
    const rendering = parsed.data

    const sectioningRow = storage.getLatestNodeData("page-sectioning", page.pageId)
    const sectioning = sectioningRow?.data as PageSectioningOutput | undefined

    // Determine page number from sectioning
    let pageNumber: number | undefined
    if (sectioning?.sections) {
      for (const s of sectioning.sections) {
        if (s.pageNumber !== null) pageNumber = s.pageNumber
      }
    }

    // Concatenate section HTML and merge activity answers
    const { html: sectionHtml, activityAnswers } = combineSections(rendering)

    // Rewrite image URLs and copy referenced images
    const { html: rewrittenHtml, referencedImages } = rewriteImageUrls(
      sectionHtml,
      label,
      imageMap,
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

    // Check for math content
    if (containsMathContent(rewrittenHtml)) hasMath = true

    // Generate page HTML
    const pageHtml = renderPageHtml({
      content: rewrittenHtml,
      language,
      sectionId: page.pageId,
      pageTitle: title,
      pageIndex: pi + 1,
      activityAnswers,
      hasMath: containsMathContent(rewrittenHtml),
      bundleVersion,
    })

    fs.writeFileSync(path.join(adtDir, `${page.pageId}.html`), pageHtml)

    const entry: PageEntry = {
      section_id: page.pageId,
      href: `${page.pageId}.html`,
    }
    if (pageNumber !== undefined) entry.page_number = pageNumber
    pageList.push(entry)

    // Insert quiz pages after this page
    const quizzes = quizzesByAfterPageId.get(page.pageId)
    if (quizzes) {
      for (const quiz of quizzes) {
        const quizIndex = quizData!.quizzes.indexOf(quiz)
        const quizId = `qz${pad3(quizIndex + 1)}`

        const quizHtmlContent = renderQuizHtml(quiz, quizId, catalog)
        const quizPageHtml = renderPageHtml({
          content: quizHtmlContent,
          language,
          sectionId: quizId,
          pageTitle: title,
          pageIndex: pageList.length + 1,
          activityAnswers: buildQuizAnswers(quiz, quizId),
          hasMath: false,
          bundleVersion,
        })

        fs.writeFileSync(path.join(adtDir, `${quizId}.html`), quizPageHtml)
        pageList.push({ section_id: quizId, href: `${quizId}.html` })
      }
    }
  }

  // ------------------------------------------------------------------
  // Write manifests
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Writing manifests..." })

  writeJson(path.join(contentDir, "pages.json"), pageList)

  // Table of contents — built from first section per page that has a heading
  // For now, write an empty toc (the Python version uses plate.table_of_contents
  // which we don't have; the runner handles empty toc gracefully)
  writeJson(path.join(contentDir, "toc.json"), [])

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

  const sourceLanguage = language.toLowerCase().split("-")[0]

  for (const lang of outputLanguages) {
    const localeDir = path.join(contentDir, "i18n", lang)
    fs.mkdirSync(localeDir, { recursive: true })

    // texts.json
    const baseLang = lang.toLowerCase().split("-")[0]
    let textsMap: Record<string, string> = {}
    if (baseLang === sourceLanguage) {
      // Source language — use original catalog
      if (catalog?.entries) {
        for (const e of catalog.entries) textsMap[e.id] = e.text
      }
    } else {
      // Translated language
      const transRow = storage.getLatestNodeData("text-catalog-translation", lang)
      if (transRow) {
        const translated = transRow.data as TextCatalogOutput
        for (const e of translated.entries) textsMap[e.id] = e.text
      }
    }
    writeJson(path.join(localeDir, "texts.json"), textsMap)

    // audios.json + copy audio files
    const audioDir = path.join(localeDir, "audio")
    fs.mkdirSync(audioDir, { recursive: true })

    const ttsRow = storage.getLatestNodeData("tts", lang)
    const ttsData = ttsRow?.data as TTSOutput | undefined
    const audioMap: Record<string, string> = {}

    if (ttsData?.entries) {
      for (const entry of ttsData.entries) {
        const srcFile = path.join(bookDir, "audio", lang, entry.fileName)
        if (fs.existsSync(srcFile)) {
          const destFile = path.join(audioDir, entry.fileName)
          fs.copyFileSync(srcFile, destFile)
          audioMap[entry.textId] = entry.fileName
        }
      }
    }
    writeJson(path.join(localeDir, "audios.json"), audioMap)

    // videos.json (empty placeholder)
    writeJson(path.join(localeDir, "videos.json"), {})

    // glossary.json
    const glossaryJson = buildGlossaryJson(glossary, catalog, textsMap, baseLang === sourceLanguage)
    writeJson(path.join(localeDir, "glossary.json"), glossaryJson)
  }

  // ------------------------------------------------------------------
  // config.json
  // ------------------------------------------------------------------
  const hasGlossary = glossary !== undefined && glossary.items.length > 0
  const hasQuiz = quizData !== undefined && quizData.quizzes.length > 0
  const hasTTS = outputLanguages.some(
    (lang) => storage.getLatestNodeData("tts", lang) !== null,
  )

  const configJson = {
    title,
    bundleVersion,
    languages: {
      available: outputLanguages,
      default: pickDefaultLanguage(language, outputLanguages),
    },
    features: {
      signLanguage: false,
      easyRead: false,
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
      highlight: false,
      activities: hasQuiz,
    },
    analytics: {
      enabled: false,
      siteId: 0,
      trackerUrl: "https://unisitetracker.unicef.io/matomo.php",
      srcUrl: "https://unisitetracker.unicef.io/matomo.js",
    },
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
      const baseLangSrc = path.join(itSrc, lang.split("-")[0])
      const src = fs.existsSync(langSrc) ? langSrc : fs.existsSync(baseLangSrc) ? baseLangSrc : null
      if (src) {
        copyDirRecursive(src, path.join(itDest, lang))
      }
    }
  }

  // Write config.json (overwrites the template one from assets)
  writeJson(path.join(assetsDir, "config.json"), configJson)

  // ------------------------------------------------------------------
  // Build Tailwind CSS
  // ------------------------------------------------------------------
  progress.emit({ type: "step-progress", step, message: "Building Tailwind CSS..." })
  await buildTailwindCss(adtDir, webAssetsDir)

  progress.emit({ type: "step-complete", step })
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
}

export function renderPageHtml(opts: RenderPageOptions): string {
  const mathScript = opts.hasMath
    ? `    <script src="./assets/libs/mathjax/es5/tex-mml-chtml.js"></script>\n`
    : ""

  const answersScript =
    opts.activityAnswers && Object.keys(opts.activityAnswers).length > 0
      ? `\n    <script type="text/javascript">\n        window.correctAnswers = JSON.parse('${escapeInlineScriptJson(JSON.stringify(opts.activityAnswers))}');\n    </script>`
      : ""

  return `<!DOCTYPE html>
<html lang="${escapeAttr(opts.language)}">

<head>
    <meta charset="utf-8" />
    <meta content="width=device-width, initial-scale=1" name="viewport" />
    <title>${escapeHtml(opts.pageTitle)}</title>
    <meta name="title-id" content="${escapeAttr(opts.sectionId)}" />
    <meta name="page-section-id" content="${opts.pageIndex}" />
    <link href="./content/tailwind_output.css" rel="stylesheet">
    <link href="./assets/libs/fontawesome/css/all.min.css" rel="stylesheet">
    <link href="./assets/fonts.css" rel="stylesheet">
${mathScript}</head>

<body class="min-h-screen flex items-center justify-center">
    <div id="content">
    ${opts.content}
    </div>
${answersScript}
    <div class="relative z-50" id="interface-container"></div>
    <div class="relative z-50" id="nav-container"></div>
    <script src="./assets/base.bundle.min.js?v=${escapeAttr(opts.bundleVersion)}" type="module"></script>
</body>

</html>
`
}

// ---------------------------------------------------------------------------
// Quiz HTML generation
// ---------------------------------------------------------------------------

function pad3(n: number): string {
  return String(n).padStart(3, "0")
}

function renderQuizHtml(
  quiz: Quiz,
  quizId: string,
  catalog: TextCatalogOutput | undefined,
): string {
  const questionId = quizId
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

<div class="container content mx-auto w-full min-h-screen px-8 py-8 flex items-center justify-center" id="content">
    <section
        id="simple-main"
        role="activity"
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

function buildQuizAnswers(quiz: Quiz, quizId: string): Record<string, boolean> {
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

/** Rewrite image URLs from /api/books/{label}/images/{id} to images/{filename} */
export function rewriteImageUrls(
  html: string,
  label: string,
  imageMap: Map<string, string>,
): { html: string; referencedImages: string[] } {
  const prefix = `/api/books/${label}/images/`
  const referencedImages: string[] = []
  const doc = parseDocument(html)

  const imgs = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "img",
    doc.children,
  )

  for (const img of imgs) {
    const src = img.attribs.src ?? ""
    if (src.startsWith(prefix)) {
      const imageId = src.slice(prefix.length)
      const filename = imageMap.get(imageId)
      if (filename) {
        img.attribs.src = `images/${filename}`
        referencedImages.push(imageId)
      }
    }
    // Also handle data-id based images
    const dataId = img.attribs["data-id"]
    if (dataId && imageMap.has(dataId) && !img.attribs.src?.startsWith("images/")) {
      const filename = imageMap.get(dataId)!
      img.attribs.src = `images/${filename}`
      if (!referencedImages.includes(dataId)) {
        referencedImages.push(dataId)
      }
    }
  }

  return { html: DomUtils.getOuterHTML(doc), referencedImages }
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
// Section helpers
// ---------------------------------------------------------------------------

export function combineSections(rendering: WebRenderingOutput): {
  html: string
  activityAnswers?: Record<string, string | boolean | number>
} {
  let allHtml = ""
  let mergedAnswers: Record<string, string | boolean | number> | undefined

  for (const section of rendering.sections) {
    allHtml += section.html + "\n"
    if (section.activityAnswers) {
      if (!mergedAnswers) mergedAnswers = {}
      Object.assign(mergedAnswers, section.activityAnswers)
    }
  }

  return { html: allHtml.trim(), activityAnswers: mergedAnswers }
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
    const glId = `gl${pad3(i + 1)}`
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
  "\\$",
  "\\$$",
  "\\\\(",
  "\\\\[",
  "<math",
  "\\begin{",
]

function containsMathContent(html: string): boolean {
  return MATH_INDICATORS.some((indicator) => html.includes(indicator))
}

// ---------------------------------------------------------------------------
// Tailwind CSS build
// ---------------------------------------------------------------------------

async function buildTailwindCss(
  adtDir: string,
  webAssetsDir: string,
): Promise<void> {
  // Dynamic imports to avoid issues if not installed
  const postcss = (await import("postcss")).default
  const tailwindcss = (await import("tailwindcss")).default

  const inputCssPath = path.join(webAssetsDir, "tailwind_css.css")
  const inputCss = fs.existsSync(inputCssPath)
    ? fs.readFileSync(inputCssPath, "utf-8")
    : "@tailwind base;\n@tailwind components;\n@tailwind utilities;"

  const tailwindConfig = {
    content: [
      path.join(adtDir, "**/*.html"),
      path.join(adtDir, "**/*.js"),
    ],
    theme: {
      extend: {
        keyframes: {
          tutorialPopIn: {
            "0%": { opacity: "0", transform: "scale(0.9)" },
            "100%": { opacity: "1", transform: "scale(1)" },
          },
          pulseBorder: {
            "0%": { boxShadow: "0 0 0 0 rgba(49,130,206,0.7)" },
            "70%": { boxShadow: "0 0 0 10px rgba(49,130,206,0)" },
            "100%": { boxShadow: "0 0 0 0 rgba(49,130,206,0)" },
          },
        },
        animation: {
          tutorialPopIn: "tutorialPopIn 0.3s ease-out forwards",
          pulseBorder: "pulseBorder 2s infinite",
        },
        boxShadow: {
          tutorial: "0 0 0 4px rgba(49,130,206,0.3)",
        },
      },
    },
    plugins: [],
  }

  const result = await postcss([tailwindcss(tailwindConfig)]).process(inputCss, {
    from: undefined,
  })

  const outputPath = path.join(adtDir, "content", "tailwind_output.css")
  fs.writeFileSync(outputPath, result.css)
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
  const tailwindcss = (await import("tailwindcss")).default

  const inputCssPath = path.join(webAssetsDir, "tailwind_css.css")
  const inputCss = fs.existsSync(inputCssPath)
    ? fs.readFileSync(inputCssPath, "utf-8")
    : "@tailwind base;\n@tailwind components;\n@tailwind utilities;"

  // Also scan the ADT bundle assets for Tailwind classes used by the interface
  const contentSources: Array<{ raw: string; extension: string }> = [
    { raw: contentHtml, extension: "html" },
  ]
  for (const file of ["interface.html", "base.bundle.min.js"]) {
    const filePath = path.join(webAssetsDir, file)
    if (fs.existsSync(filePath)) {
      contentSources.push({
        raw: fs.readFileSync(filePath, "utf-8"),
        extension: path.extname(file).slice(1),
      })
    }
  }

  const tailwindConfig = {
    content: contentSources,
    theme: {
      extend: {
        keyframes: {
          tutorialPopIn: {
            "0%": { opacity: "0", transform: "scale(0.9)" },
            "100%": { opacity: "1", transform: "scale(1)" },
          },
          pulseBorder: {
            "0%": { boxShadow: "0 0 0 0 rgba(49,130,206,0.7)" },
            "70%": { boxShadow: "0 0 0 10px rgba(49,130,206,0)" },
            "100%": { boxShadow: "0 0 0 0 rgba(49,130,206,0)" },
          },
        },
        animation: {
          tutorialPopIn: "tutorialPopIn 0.3s ease-out forwards",
          pulseBorder: "pulseBorder 2s infinite",
        },
        boxShadow: {
          tutorial: "0 0 0 4px rgba(49,130,206,0.3)",
        },
      },
    },
    plugins: [],
  }

  const result = await postcss([tailwindcss(tailwindConfig)]).process(inputCss, {
    from: undefined,
  })

  return result.css
}

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

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
  const preferredBase = preferredLanguage.toLowerCase().split("-")[0]
  const matchingBase = availableLanguages.find(
    (lang) => lang.toLowerCase().split("-")[0] === preferredBase,
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

function copyDirRecursive(
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

function escapeHtml(s: string): string {
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

export const NAV_HTML = `<nav aria-label="Content Index Menu" aria-labelledby="navPopupTitle" aria-hidden="true" inert class="fixed w-64 sm:w-80 bg-white shadow-lg p-5 border-r border-gray-300 transform -translate-x-full transition-transform duration-300 ease-in-out z-20 hidden rounded-lg top-2 left-0 bottom-2 h-[calc(100vh-5rem)] flex flex-col" id="navPopup" role="navigation">
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
