import fs from "node:fs"
import path from "node:path"
import { JSDOM } from "jsdom"
import type { Storage } from "@adt/storage"
import type { BookMetadata, EpubGlossaryConfig, TocGenerationOutput, WordTimestampOutput } from "@adt/types"
import { type PackageAdtWebOptions, EXPORT_MIME_TYPES, NON_READER_FILES, copyDirRecursive, injectWebpubStyles, getWordTimestamps, pad3 } from "./web.js"
import { htmlToXhtml } from "../html-semantics.js"
import { stripRuntimeBundle } from "./strip-runtime-bundle.js"

/**
 * Canonical word-id format used by SMIL fragment refs, EPUB packaging
 * word-spans, and the runtime viewer's word highlighting. Mirror in
 * `assets/adt/modules/tts_highlighter_utils.js:wordIdFor`.
 */
function wordIdFor(dataId: string, idx: number): string {
  return `${dataId}_w${pad3(idx)}`
}
import { buildSmil, formatMediaDuration, type SmilParagraph } from "../smil.js"
import { tokenizeWords } from "../word-tokenize.js"
import { styleMapToInline } from "../fixed-layout-rendering.js"
import {
  buildGlossaryDocument,
  loadGlossaryEntries,
  wrapGlossaryTerms,
  type GlossaryBacklink,
  type GlossaryEntry,
} from "../epub-glossary.js"
import {
  buildGlossaryPages,
  glossaryPageHrefPlaceholder,
  planGlossaryBoundaries,
  resolveGlossaryPageHrefs,
  windowIndexForPage,
  type GlossaryPageEntry,
  type GlossaryPageFile,
} from "../epub-glossary-pages.js"

export type PackageEpubOptions = PackageAdtWebOptions & {
  /** EPUB glossary implementation (book config `epub_glossary`). */
  epubGlossary?: EpubGlossaryConfig
}

interface PageEntry {
  section_id: string
  href: string
  page_number?: number
}

/**
 * Visual affordance for in-text glossary references (EPUB only). The web
 * runtime marks terms at runtime with `.glossary-term`; the EPUB packager
 * instead emits `<a epub:type="glossref" class="glossref">`, and the reader
 * adds no styling of its own, so a dotted underline (the standard dictionary
 * "tap for a definition" signal) is shipped here. `!important` + the
 * `-webkit-` prefix defend against Tailwind Preflight's `a` reset and
 * aggressive reader CSS / older e-reader WebKit. Injected via
 * `injectWebpubStyles({ extraCss })` so it stays out of the web/webpub output.
 */
const GLOSSREF_CSS = `
.glossref {
  -webkit-text-decoration: underline dotted !important;
  text-decoration: underline dotted !important;
  text-underline-offset: 0.15em;
  text-decoration-thickness: from-font;
  cursor: pointer;
}`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Package an EPUB 3 from the existing ADT web package.
 *
 * Follows the same pattern as `packageWebpub`: copies `adt/` into
 * `epub/OEBPS/`, injects reader-override styles, then layers EPUB-specific
 * metadata files (OPF, NCX, container.xml, navigation document) on top.
 *
 * Requires `packageAdtWeb` to have been run first.
 */
export function packageEpub(
  storage: Storage,
  options: PackageEpubOptions,
): void {
  const { bookDir, title, language } = options

  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throw new Error("ADT package not found — run packageAdtWeb first")
  }

  const epubDir = path.join(bookDir, "epub")
  const oebpsDir = path.join(epubDir, "OEBPS")

  // Clean previous build
  if (fs.existsSync(epubDir)) fs.rmSync(epubDir, { recursive: true })

  // Copy adt/ -> epub/OEBPS/, skipping SCORM-specific files
  copyDirRecursive(adtDir, oebpsDir, NON_READER_FILES)

  // EPUB readers provide nav/settings/playback natively (read-aloud via the
  // SMIL overlays below), so drop the embedded runtime (React bundle, offline
  // preloader, SCORM adapter). The glossary is lowered to EPUB-native markup
  // (glossref + doc-glossary + landmarks) below.
  stripRuntimeBundle(oebpsDir)

  // ------------------------------------------------------------------
  // Glossary (load once before the page loop)
  // ------------------------------------------------------------------
  // EPUB-native glossary, built to the EPUB 3 Dictionaries & Glossaries
  // model the BookFusion reader consumes: first occurrences of terms become
  // `<a epub:type="glossref">` anchors pointing at `<dt id>` entries in
  // glossary.xhtml, the reader resolves them into definition popovers, and a
  // `<nav epub:type="landmarks">` glossary entry surfaces the Glossary tab.
  // The web runtime is stripped (see stripRuntimeBundle), so this is the
  // only glossary surface in an EPUB export.
  const glossaryEntries = loadGlossaryEntriesForLang(oebpsDir, language)
  // Entry id → backlinks to each in-text occurrence ("Used in").
  const backlinksByEntry = new Map<string, GlossaryBacklink[]>()

  // How the glossary is realised (config `epub_glossary.mode`):
  // - `word` (default): doc-glossary popover model only (above).
  // - `page`: in-flow glossary pages replace glossary.xhtml — for readers
  //   that don't implement the glossary spec (Apple Books etc.). In-text
  //   glossrefs link to the owning glossary page; entries link back.
  // - `both`: spec surface for capable readers plus browsable pages.
  const glossaryMode = glossaryEntries.length > 0 ? (options.epubGlossary?.mode ?? "word") : "word"

  // Inject reader-override CSS. The glossref affordance (dotted underline) is
  // EPUB-only — passed as extraCss here rather than baked into the shared
  // override blocks, so it never ships in the web/webpub output (which marks
  // terms at runtime instead and emits no glossref anchors). Only injected
  // when the book actually has glossary terms.
  injectWebpubStyles(oebpsDir, {
    fixedLayout: options.fixedLayout,
    neutralizeFixedLayoutFit: true,
    extraCss: glossaryEntries.length > 0 ? GLOSSREF_CSS : undefined,
  })

  // ------------------------------------------------------------------
  // Convert content HTML pages to XHTML (required by EPUB 3 / Apple Books)
  // ------------------------------------------------------------------
  const pagesJsonPath = path.join(oebpsDir, "content", "pages.json")
  const rawPages = JSON.parse(fs.readFileSync(pagesJsonPath, "utf-8")) as PageEntry[]
  // Placement boundaries for in-flow glossary pages (page/both modes) and
  // the per-window occurrence lists that populate them.
  const glossaryBoundaries =
    glossaryMode !== "word"
      ? planGlossaryBoundaries(rawPages, options.epubGlossary?.page_placements ?? ["end"])
      : []
  const occurrencesByWindow = new Map<number, Map<string, GlossaryBacklink[]>>()
  // Page files whose glossrefs carry placeholder hrefs (page mode) — the
  // final `file#fragment` target is only known after the glossary pages are
  // chunked, so those files get a resolve pass afterwards.
  const glossaryHrefFixupFiles: string[] = []

  // Quizzes run via the standalone activities bundle (the JS runtime), which
  // works across EPUB readers (Apple Books, Thorium). Quiz pages are authored as
  // reflowable HTML (device-width viewport, flow layout); in a fixed-layout book
  // that leaves them uncentered and jarring across page turns, so give them the
  // book's fixed viewport to render as proper pre-paginated pages — same layout
  // type, size, and centering as every other page. `refViewport` is the most
  // common fixed viewport across the book's content pages; the generated
  // glossary pages (below) are sized from it too.
  const refViewport = options.fixedLayout
    ? findReferenceViewport(oebpsDir, rawPages)
    : null
  // Quiz pages carry the activities bundle, so they also need the OPF `scripted`
  // property for the reading system to enable scripting.
  const scriptedHrefs = new Set<string>()
  for (const [pageIndex, page] of rawPages.entries()) {
    if (!page.href.endsWith(".html")) continue
    const htmlPath = path.join(oebpsDir, page.href)
    if (!fs.existsSync(htmlPath)) continue

    const rawHtml = fs.readFileSync(htmlPath, "utf-8")
    const isQuizPage = rawHtml.includes('data-section-type="activity_quiz"')
    let html = rawHtml
    // Fixed-layout: swap the quiz page's responsive viewport for the book's fixed
    // one so the reader lays it out (and centers it) like its pre-paginated
    // neighbours instead of floating.
    if (isQuizPage && refViewport) {
      html = html.replace(
        /(<meta name="viewport" content=")width=device-width[^"]*(")/,
        `$1width=${refViewport.width}, height=${refViewport.height}$2`,
      )
    }
    let xhtml = convertPageToXhtml(html)
    const xhtmlHref = page.href.replace(/\.html$/, ".xhtml")

    if (isQuizPage) {
      // Ship the activities bundle so the reader runs the interactive quiz, and
      // mark the page scripted in the OPF.
      xhtml = xhtml.replace(
        "</body>",
        `    <script src="./assets/activities.bundle.local.js"></script>\n</body>`,
      )
      scriptedHrefs.add(xhtmlHref)
    }

    if (glossaryEntries.length > 0) {
      const windowIdx =
        glossaryBoundaries.length > 0 ? windowIndexForPage(glossaryBoundaries, pageIndex) : -1
      // In page mode the in-text links target the owning glossary page; in
      // word/both they keep the spec target (glossary.xhtml popovers).
      const hrefForEntry =
        glossaryMode === "page"
          ? (entryId: string) => glossaryPageHrefPlaceholder(windowIdx, entryId)
          : undefined
      const result = hrefForEntry
        ? wrapGlossaryTerms(xhtml, glossaryEntries, hrefForEntry)
        : wrapGlossaryTerms(xhtml, glossaryEntries)
      xhtml = result.xhtml
      const label = page.page_number != null ? `p. ${page.page_number}` : page.section_id
      for (const occ of result.occurrences) {
        const list = backlinksByEntry.get(occ.entryId) ?? []
        list.push({ href: `${xhtmlHref}#${occ.fragment}`, label })
        backlinksByEntry.set(occ.entryId, list)
        if (windowIdx >= 0) {
          const window = occurrencesByWindow.get(windowIdx) ?? new Map<string, GlossaryBacklink[]>()
          const windowList = window.get(occ.entryId) ?? []
          windowList.push({ href: `${xhtmlHref}#${occ.fragment}`, label })
          window.set(occ.entryId, windowList)
          occurrencesByWindow.set(windowIdx, window)
        }
      }
      if (glossaryMode === "page" && result.occurrences.length > 0) {
        glossaryHrefFixupFiles.push(xhtmlHref)
      }
    }

    fs.writeFileSync(path.join(oebpsDir, xhtmlHref), xhtml)
    fs.unlinkSync(htmlPath)
    page.href = xhtmlHref
  }

  // ------------------------------------------------------------------
  // Glossary surfaces (glossary.xhtml and/or in-flow pages) + cleanup
  // ------------------------------------------------------------------
  let glossaryHref: string | undefined
  let glossaryHeading: string | undefined
  // In-flow glossary pages surfaced in the TOC (first file per window).
  let glossaryTocEntries: Array<{ href: string; label: string }> = []
  // Landmark target for `epub:type="glossary"`: the spec document when it
  // exists, otherwise the first in-flow glossary page.
  let glossaryLandmarkHref: string | undefined
  // Glossary pages carrying the sign-language toggle script — their OPF
  // manifest items must declare the `scripted` property.
  let glossaryScriptedHrefs = new Set<string>()

  if (backlinksByEntry.size > 0) {
    glossaryHeading = loadGlossaryHeading(oebpsDir, language)
  }

  // Sign-language videos attached to glossary terms feed every glossary
  // surface: the doc-glossary popover (below) and the in-flow pages. The
  // files already live in the bundle (packageAdtWeb copies them next to the
  // page videos); glossary.json carries the per-entry href.
  const glossaryVideoHrefs = new Map<string, string>()
  for (const entry of glossaryEntries) {
    if (entry.video) glossaryVideoHrefs.set(entry.sourceId, entry.video)
  }

  if (glossaryMode !== "page" && backlinksByEntry.size > 0) {
    glossaryHref = "glossary.xhtml"
    const doc = buildGlossaryDocument({
      language,
      heading: glossaryHeading!,
      entries: glossaryEntries,
      backlinksByEntry,
      videoHrefBySourceId: glossaryVideoHrefs,
    })
    fs.writeFileSync(path.join(oebpsDir, glossaryHref), doc)
    glossaryLandmarkHref = glossaryHref
  }

  if (glossaryMode !== "word" && occurrencesByWindow.size > 0) {
    const windows: GlossaryPageEntry[][] = glossaryBoundaries.map((_, w) => {
      const window = occurrencesByWindow.get(w)
      if (!window) return []
      return glossaryEntries
        .filter((e) => window.has(e.id))
        .map((e) => ({ entry: e, backlinks: window.get(e.id)! }))
    })
    const built = buildGlossaryPages({
      language,
      heading: glossaryHeading!,
      windows,
      // Same reference viewport the quiz pages get, so generated glossary
      // pages match the book's page size even when the cover or a spread is
      // authored at different dimensions.
      fixedViewport: refViewport ?? undefined,
      videoHrefBySourceId: glossaryVideoHrefs,
      signLanguageLabel: loadInterfaceLabel(oebpsDir, language, "sign-language-label", "Sign language"),
    })
    glossaryScriptedHrefs = new Set(built.files.filter((f) => f.hasScript).map((f) => f.filename))
    for (const f of built.files) {
      fs.writeFileSync(path.join(oebpsDir, f.filename), f.xhtml)
    }
    if (glossaryMode === "page") {
      for (const href of glossaryHrefFixupFiles) {
        const p = path.join(oebpsDir, href)
        fs.writeFileSync(p, resolveGlossaryPageHrefs(fs.readFileSync(p, "utf-8"), built.hrefByWindowEntry))
      }
    }
    // Splice into the reading order after each window's boundary page —
    // descending so earlier splices don't shift later boundary indices.
    const filesByWindow = new Map<number, GlossaryPageFile[]>()
    for (const f of built.files) {
      const list = filesByWindow.get(f.windowIndex) ?? []
      list.push(f)
      filesByWindow.set(f.windowIndex, list)
    }
    for (let w = glossaryBoundaries.length - 1; w >= 0; w--) {
      const files = filesByWindow.get(w)
      if (!files || files.length === 0) continue
      rawPages.splice(
        glossaryBoundaries[w] + 1,
        0,
        ...files.map((f) => ({ section_id: f.sectionId, href: f.filename })),
      )
    }
    glossaryTocEntries = built.files
      .filter((f) => f.isWindowStart)
      .map((f) => ({ href: f.filename, label: glossaryHeading! }))
    glossaryLandmarkHref = glossaryLandmarkHref ?? glossaryTocEntries[0]?.href
  }

  // Update pages.json with .xhtml hrefs (and any inserted glossary pages)
  fs.writeFileSync(pagesJsonPath, JSON.stringify(rawPages, null, 2))

  // The runtime is stripped; per-language glossary.json files are now
  // orphaned. Drop them so the package isn't shipping dead weight.
  stripOrphanGlossaryJson(oebpsDir)

  // ------------------------------------------------------------------
  // SMIL media overlays (fixed-layout only)
  // ------------------------------------------------------------------
  // Word-level read-aloud sync. Per-page .smil files reference the word
  // <span id> elements emitted by the renderer + whisper word timestamps.
  // Generated before file enumeration so collectFiles picks them up into
  // the OPF manifest automatically.
  //
  // Gated on the export dialog's read-aloud toggle (`features.readAloud`)
  // — disabling audio also disables SMIL, since SMIL is just sync metadata
  // for the audio. Word-level vs paragraph-level fallback inside the SMIL
  // builder is gated by whether tts-timestamps exist in storage (which is
  // in turn gated by `speech.word_highlighting` at speech-generation time)
  // and by whether the page has per-word `<span id>` (only fixed-layout
  // emits these; reflowable falls back to paragraph-level highlights).
  const smilEntries = options.features?.readAloud !== false
    ? generateSmilFiles(storage, oebpsDir, rawPages, language)
    : []

  // ------------------------------------------------------------------
  // Load metadata
  // ------------------------------------------------------------------
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as BookMetadata | undefined
  const authors = metadata?.authors ?? []
  const publisher = metadata?.publisher ?? undefined

  const tocRow = storage.getLatestNodeData("toc-generation", "book")
  const llmToc = tocRow?.data as TocGenerationOutput | undefined

  // ------------------------------------------------------------------
  // Read pages.json for reading order
  // ------------------------------------------------------------------
  const pagesPath = path.join(oebpsDir, "content", "pages.json")
  const pageList = JSON.parse(fs.readFileSync(pagesPath, "utf-8")) as PageEntry[]

  // ------------------------------------------------------------------
  // Enumerate all files for OPF manifest
  // ------------------------------------------------------------------
  const allFiles: Array<{ href: string; mediaType: string }> = []
  collectFiles(oebpsDir, oebpsDir, allFiles)

  // ------------------------------------------------------------------
  // Detect cover image
  // ------------------------------------------------------------------
  let coverHref: string | undefined
  for (const name of ["cover.png", "cover.jpg", "cover.jpeg"]) {
    if (fs.existsSync(path.join(oebpsDir, name))) {
      coverHref = name
      break
    }
  }

  // ------------------------------------------------------------------
  // Write EPUB-specific files
  // ------------------------------------------------------------------

  // mimetype (must be first file in ZIP, uncompressed — export service handles this)
  fs.writeFileSync(path.join(epubDir, "mimetype"), "application/epub+zip")

  // META-INF/container.xml
  fs.mkdirSync(path.join(epubDir, "META-INF"), { recursive: true })
  fs.writeFileSync(path.join(epubDir, "META-INF", "container.xml"), CONTAINER_XML)

  // META-INF/com.apple.ibooks.display-options.xml (Apple Books compatibility)
  if (options.fixedLayout) {
    fs.writeFileSync(
      path.join(epubDir, "META-INF", "com.apple.ibooks.display-options.xml"),
      IBOOKS_DISPLAY_OPTIONS,
    )
  }

  // OEBPS/content.opf
  fs.writeFileSync(
    path.join(oebpsDir, "content.opf"),
    buildOpf({
      title,
      authors,
      publisher,
      language,
      pageList,
      allFiles,
      coverHref,
      fixedLayout: options.fixedLayout,
      smilEntries,
      glossaryHref,
      scriptedHrefs: new Set([...scriptedHrefs, ...glossaryScriptedHrefs]),
    }),
  )

  // OEBPS/toc.xhtml (EPUB 3 navigation document)
  fs.writeFileSync(
    path.join(oebpsDir, "toc.xhtml"),
    buildNavDocument(
      language,
      title,
      pageList,
      llmToc,
      glossaryLandmarkHref,
      glossaryHeading,
      glossaryTocEntries,
    ),
  )

  // OEBPS/toc.ncx (EPUB 2 fallback)
  fs.writeFileSync(
    path.join(oebpsDir, "toc.ncx"),
    buildNcx(title, pageList, glossaryTocEntries),
  )
}

// ---------------------------------------------------------------------------
// File enumeration
// ---------------------------------------------------------------------------

function collectFiles(
  baseDir: string,
  dir: string,
  out: Array<{ href: string; mediaType: string }>,
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(baseDir, fullPath, out)
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/")
      const ext = path.extname(entry.name).toLowerCase()
      out.push({
        href: relPath,
        mediaType: EXPORT_MIME_TYPES[ext] ?? "application/octet-stream",
      })
    }
  }
}

// ---------------------------------------------------------------------------
// EPUB structural documents
// ---------------------------------------------------------------------------

const IBOOKS_DISPLAY_OPTIONS = `<?xml version="1.0" encoding="UTF-8"?>
<display_options>
  <platform name="*">
    <option name="specified-fonts">true</option>
    <option name="fixed-layout">true</option>
    <option name="open-to-spread">false</option>
  </platform>
</display_options>`

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

interface SmilEntry {
  /** Page href the SMIL file is bound to (e.g. `pg001_sec001.xhtml`). */
  pageHref: string
  /** Path to the SMIL inside OEBPS (e.g. `smil/pg001_sec001.smil`). */
  smilHref: string
  /** Sum of audio durations covered by the SMIL, in seconds. */
  durationSeconds: number
}

/**
 * Walk page XHTML files and emit per-page `.smil` documents. Mirrors the
 * viewer's count-guard: word-level when source span count matches whisper
 * word count, paragraph-level fallback otherwise.
 */
function generateSmilFiles(
  storage: Storage,
  oebpsDir: string,
  pages: PageEntry[],
  language: string,
): SmilEntry[] {
  const wts: WordTimestampOutput | undefined = getWordTimestamps(storage, language)
  if (!wts || Object.keys(wts.entries ?? {}).length === 0) return []

  const audiosJsonPath = path.join(oebpsDir, "content", "i18n", language, "audios.json")
  if (!fs.existsSync(audiosJsonPath)) return []
  const audiosMap = JSON.parse(fs.readFileSync(audiosJsonPath, "utf-8")) as Record<string, string>

  const smilDir = path.join(oebpsDir, "smil")
  fs.mkdirSync(smilDir, { recursive: true })

  const entries: SmilEntry[] = []
  for (const page of pages) {
    if (!page.href.endsWith(".xhtml")) continue
    const xhtmlPath = path.join(oebpsDir, page.href)
    if (!fs.existsSync(xhtmlPath)) continue
    const xhtml = fs.readFileSync(xhtmlPath, "utf-8")

    const paragraphs: SmilParagraph[] = []
    for (const p of parseParagraphs(xhtml)) {
      const audioFile = audiosMap[p.paragraphId]
      const tsEntry = wts.entries[p.paragraphId]
      if (!audioFile || !tsEntry || tsEntry.words.length === 0) continue
      paragraphs.push({
        paragraphId: p.paragraphId,
        // SMIL lives at OEBPS/smil/{file}; audio at OEBPS/content/i18n/{lang}/audio/{file}.
        audioPath: `../content/i18n/${language}/audio/${audioFile}`,
        audioDuration: tsEntry.duration,
        wordIds: p.wordIds,
        whisperWords: tsEntry.words.map((w) => ({ word: w.word, start: w.start, end: w.end })),
      })
    }
    if (paragraphs.length === 0) continue

    const smilFileName = `${page.section_id}.smil`
    const result = buildSmil({
      // SMIL is in `smil/`; pages are at OEBPS root.
      pageHref: `../${page.href}`,
      paragraphs,
    })
    if (!result) continue

    fs.writeFileSync(path.join(smilDir, smilFileName), result.xml)
    entries.push({
      pageHref: page.href,
      smilHref: `smil/${smilFileName}`,
      durationSeconds: result.durationSeconds,
    })
  }
  return entries
}

/**
 * Walk the page DOM for any element with `data-id` (the same convention the
 * text-catalog uses to find audio-bearing elements) and capture the word
 * `<span id>` children inside. Reflowable pages typically use `<h1>`,
 * `<p>`, `<li>`, `<td>` etc. — fixed-layout uses `<p>` exclusively. Both
 * flow through the same SMIL builder; reflowable always lands on
 * paragraph-level fallback because no word ids are emitted there.
 *
 * `<img>` elements are excluded — image audio (alt-text descriptions)
 * doesn't currently flow through the EPUB media overlay pipeline. The
 * paragraph-level fallback for reflowable highlights the whole text
 * element, which is what readers expect for non-fixed content.
 */
function parseParagraphs(xhtml: string): Array<{ paragraphId: string; wordIds: string[] }> {
  const dom = new JSDOM(xhtml, { contentType: "application/xhtml+xml" })
  const doc = dom.window.document
  const out: Array<{ paragraphId: string; wordIds: string[] }> = []
  for (const el of doc.querySelectorAll("[data-id]")) {
    if (el.tagName.toLowerCase() === "img") continue
    const paragraphId = el.getAttribute("data-id")
    if (!paragraphId) continue
    const wordIds: string[] = []
    for (const wordEl of el.querySelectorAll("span[id]")) {
      const id = wordEl.getAttribute("id")
      if (id && /_w\d+$/.test(id)) wordIds.push(id)
    }
    out.push({ paragraphId, wordIds })
  }
  return out
}

/**
 * The most common fixed viewport (`width=W, height=H`) declared across the
 * book's pages. Fixed-layout content pages carry an explicit pixel viewport;
 * quiz pages (authored reflowable) ship `width=device-width` and are ignored.
 * Returns null when no page declares a fixed viewport.
 */
function findReferenceViewport(
  oebpsDir: string,
  pages: PageEntry[],
): { width: number; height: number } | null {
  const counts = new Map<string, number>()
  for (const page of pages) {
    if (!page.href.endsWith(".html")) continue
    const p = path.join(oebpsDir, page.href)
    if (!fs.existsSync(p)) continue
    const m = fs
      .readFileSync(p, "utf-8")
      .match(/content="width=(\d+), height=(\d+)"/)
    if (m) {
      const key = `${m[1]}x${m[2]}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let best: string | null = null
  let bestN = 0
  for (const [key, n] of counts) {
    if (n > bestN) {
      bestN = n
      best = key
    }
  }
  if (!best) return null
  const [w, h] = best.split("x").map(Number)
  return { width: w, height: h }
}

function buildOpf(opts: {
  title: string
  authors: string[]
  publisher?: string
  language: string
  pageList: PageEntry[]
  allFiles: Array<{ href: string; mediaType: string }>
  coverHref?: string
  fixedLayout?: boolean
  smilEntries?: SmilEntry[]
  glossaryHref?: string
  /** Page hrefs whose manifest item needs the `scripted` property, including
   *  quiz pages and fixed-layout glossary pages with sign-language controls. */
  scriptedHrefs?: Set<string>
}): string {
  const { title, authors, publisher, language, pageList, allFiles, coverHref, fixedLayout, scriptedHrefs, smilEntries, glossaryHref } = opts
  const smilByPage = new Map<string, SmilEntry>()
  for (const e of smilEntries ?? []) smilByPage.set(e.pageHref, e)
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")

  // Metadata
  const metaLines: string[] = [
    `    <dc:identifier>urn:uuid:${crypto.randomUUID()}</dc:identifier>`,
    `    <dc:title>${escapeXml(title)}</dc:title>`,
    `    <dc:language>${escapeXml(language)}</dc:language>`,
    `    <meta property="dcterms:modified">${now}</meta>`,
  ]
  for (const author of authors) {
    metaLines.push(`    <dc:creator>${escapeXml(author)}</dc:creator>`)
  }
  if (publisher) {
    metaLines.push(`    <dc:publisher>${escapeXml(publisher)}</dc:publisher>`)
  }
  if (coverHref) {
    metaLines.push(`    <meta name="cover" content="cover-image"/>`)
  }
  if (fixedLayout) {
    metaLines.push(`    <meta property="rendition:layout">pre-paginated</meta>`)
    metaLines.push(`    <meta property="rendition:spread">none</meta>`)
  }

  // SMIL manifest items get stable, predictable ids so spine itemrefs can
  // reference them via `media-overlay`. Derived from the SMIL filename
  // (which uses section_id) — using page href would collapse the cover /
  // first-page case where href is `index.xhtml` rather than the section id.
  const smilHrefToOverlayId = new Map<string, string>()
  for (const e of smilEntries ?? []) {
    const sectionId = e.smilHref.replace(/^smil\//, "").replace(/\.smil$/, "")
    smilHrefToOverlayId.set(e.smilHref, `overlay-${sectionId}`)
  }

  // SMIL media overlay metadata. Per-overlay duration goes alongside the
  // page metadata via `refines`; the total runs as a top-level
  // `media:duration`. media:active-class names the CSS class an EPUB
  // reader toggles on the active text element during playback.
  if (smilEntries && smilEntries.length > 0) {
    const totalDuration = smilEntries.reduce((s, e) => s + e.durationSeconds, 0)
    metaLines.push(`    <meta property="media:duration">${formatMediaDuration(totalDuration)}</meta>`)
    metaLines.push(`    <meta property="media:active-class">-epub-media-overlay-active</meta>`)
    // media:playback-active-class names the class added to the document
    // currently being read aloud. Apple's Asset Guide lists it alongside
    // media:active-class; emitting both is harmless on readers that ignore it.
    metaLines.push(`    <meta property="media:playback-active-class">-epub-media-overlay-playing</meta>`)
    for (const e of smilEntries) {
      const overlayId = smilHrefToOverlayId.get(e.smilHref)!
      metaLines.push(
        `    <meta property="media:duration" refines="#${escapeXml(overlayId)}">${formatMediaDuration(e.durationSeconds)}</meta>`,
      )
    }
  }

  // Manifest — enumerate all files in OEBPS
  const manifestLines: string[] = [
    `    <item id="nav" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
  ]

  // Track IDs to avoid duplicates (toc.xhtml and toc.ncx are already listed)
  const skipHrefs = new Set(["toc.xhtml", "toc.ncx", "content.opf"])
  const pageHrefs = new Set(pageList.map(p => p.href))
  const hrefToItemId = new Map<string, string>()
  // Page href → SMIL overlay item id (for the `media-overlay` attribute on
  // the content document's manifest item). EPUB 3 Media Overlays spec puts
  // this association on the manifest, not the spine.
  const pageHrefToOverlayId = new Map<string, string>()
  for (const e of smilEntries ?? []) {
    pageHrefToOverlayId.set(e.pageHref, smilHrefToOverlayId.get(e.smilHref)!)
  }
  let itemIndex = 0

  for (const file of allFiles) {
    if (skipHrefs.has(file.href)) continue

    const itemId = file.href === coverHref
      ? "cover-image"
      : smilHrefToOverlayId.get(file.href) ?? `item-${++itemIndex}`
    hrefToItemId.set(file.href, itemId)

    const props: string[] = []
    if (file.href === coverHref) props.push("cover-image")
    // Reflowable page docs are `scripted` by default; JS-quiz pages are scripted
    // regardless of the book's layout. Fixed-layout glossary pages with sign
    // language controls are also included in scriptedHrefs.
    if (
      (!fixedLayout && pageHrefs.has(file.href)) ||
      scriptedHrefs?.has(file.href)
    ) {
      props.push("scripted")
    }
    const propsAttr = props.length > 0 ? ` properties="${props.join(" ")}"` : ""
    const overlayId = pageHrefToOverlayId.get(file.href)
    const overlayAttr = overlayId ? ` media-overlay="${escapeXml(overlayId)}"` : ""

    manifestLines.push(
      `    <item id="${escapeXml(itemId)}" href="${escapeXml(file.href)}" media-type="${file.mediaType}"${propsAttr}${overlayAttr}/>`,
    )
  }

  // Spine — reading order from pages.json. The media-overlay association
  // lives on the manifest item (above), not on the spine itemref.
  const spineLines = pageList.map((page) => {
    const itemId = hrefToItemId.get(page.href) ?? escapeXml(page.section_id)
    return `    <itemref idref="${escapeXml(itemId)}"/>`
  })
  // Glossary is reachable from in-text glossrefs and the landmarks nav;
  // `linear="no"` keeps it out of the linear reading flow but in-spine so
  // those hrefs resolve.
  if (glossaryHref) {
    const itemId = hrefToItemId.get(glossaryHref)
    if (itemId) {
      spineLines.push(`    <itemref idref="${escapeXml(itemId)}" linear="no"/>`)
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"${fixedLayout ? ` prefix="rendition: http://www.idpf.org/vocab/rendition/#"` : ""}>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${metaLines.join("\n")}
  </metadata>
  <manifest>
${manifestLines.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineLines.join("\n")}
  </spine>
</package>`
}

function buildNavDocument(
  language: string,
  title: string,
  pageList: PageEntry[],
  llmToc?: TocGenerationOutput,
  glossaryLandmarkHref?: string,
  glossaryHeading?: string,
  glossaryTocEntries: Array<{ href: string; label: string }> = [],
): string {
  let tocItems: string
  // In-flow glossary pages: the first file of each placement gets a TOC
  // entry; continuation chunks (fixed-layout) stay spine-only.
  const glossaryTocByHref = new Map(glossaryTocEntries.map((e) => [e.href, e.label]))
  const isGlossaryPage = (p: PageEntry) => /^glp\d+$/.test(p.section_id)

  if (llmToc && llmToc.entries.length > 0) {
    // Use LLM-generated TOC — map sectionIds to page hrefs
    const sectionMap = new Map(pageList.map((p) => [p.section_id, p.href]))
    const items = llmToc.entries
      .map((e) => {
        const href = sectionMap.get(e.sectionId)
        if (!href) return ""
        const indent = "      " + "  ".repeat(Math.max(0, e.level - 1))
        return `${indent}<li><a href="${escapeXml(href)}">${escapeXml(e.title)}</a></li>`
      })
      .filter(Boolean)
    // The LLM TOC predates the inserted glossary pages, so they are appended
    // as top-level entries.
    for (const e of glossaryTocEntries) {
      items.push(`      <li><a href="${escapeXml(e.href)}">${escapeXml(e.label)}</a></li>`)
    }
    tocItems = items.join("\n")
  } else {
    // Fallback: one entry per page
    tocItems = pageList
      .map((p) => {
        if (isGlossaryPage(p)) {
          const label = glossaryTocByHref.get(p.href)
          if (!label) return ""
          return `      <li><a href="${escapeXml(p.href)}">${escapeXml(label)}</a></li>`
        }
        const label = p.page_number != null ? `Page ${p.page_number}` : p.section_id
        return `      <li><a href="${escapeXml(p.href)}">${escapeXml(label)}</a></li>`
      })
      .filter(Boolean)
      .join("\n")
  }

  // The glossary landmark surfaces the reader's Glossary tab. It points at
  // the non-linear glossary.xhtml when that exists (word/both modes) or at
  // the first in-flow glossary page (page mode).
  const landmarksNav =
    glossaryLandmarkHref && glossaryHeading
      ? `
  <nav epub:type="landmarks" hidden="">
    <ol>
      <li><a epub:type="glossary" href="${escapeXml(glossaryLandmarkHref)}">${escapeXml(glossaryHeading)}</a></li>
    </ol>
  </nav>`
      : ""

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${tocItems}
    </ol>
  </nav>${landmarksNav}
</body>
</html>`
}

function buildNcx(
  title: string,
  pageList: PageEntry[],
  glossaryTocEntries: Array<{ href: string; label: string }> = [],
): string {
  const glossaryTocByHref = new Map(glossaryTocEntries.map((e) => [e.href, e.label]))
  let playOrder = 0
  const navPoints = pageList
    .map((p) => {
      let label: string
      if (/^glp\d+$/.test(p.section_id)) {
        // Only the first glossary page of a placement is navigable;
        // continuation chunks (fixed-layout) stay spine-only.
        const glossaryLabel = glossaryTocByHref.get(p.href)
        if (!glossaryLabel) return ""
        label = glossaryLabel
      } else {
        label = p.page_number != null ? `Page ${p.page_number}` : p.section_id
      }
      playOrder += 1
      return `    <navPoint id="navpoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${escapeXml(label)}</text></navLabel>
      <content src="${escapeXml(p.href)}"/>
    </navPoint>`
    })
    .filter(Boolean)
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// ---------------------------------------------------------------------------
// Glossary helpers
// ---------------------------------------------------------------------------

/**
 * Read `content/i18n/<lang>/glossary.json` and assign stable EPUB ids.
 * Empty list if the file is absent or empty — callers branch on length.
 */
function loadGlossaryEntriesForLang(oebpsDir: string, language: string): GlossaryEntry[] {
  const p = path.join(oebpsDir, "content", "i18n", language, "glossary.json")
  if (!fs.existsSync(p)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"))
    return loadGlossaryEntries(raw)
  } catch {
    return []
  }
}

/**
 * Read a UI label from interface_translations for the export language,
 * falling back if the catalog is missing or the key isn't translated.
 */
function loadInterfaceLabel(
  oebpsDir: string,
  language: string,
  key: string,
  fallback: string,
): string {
  const p = path.join(
    oebpsDir,
    "assets",
    "interface_translations",
    language,
    "interface_translations.json",
  )
  if (!fs.existsSync(p)) return fallback
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, string>
    return raw[key]?.trim() || fallback
  } catch {
    return fallback
  }
}

function loadGlossaryHeading(oebpsDir: string, language: string): string {
  return loadInterfaceLabel(oebpsDir, language, "glossary-label", "Glossary")
}

/**
 * Remove `content/i18n/<lang>/glossary.json` from every language directory.
 * The runtime that consumed these is stripped from EPUB exports
 * (stripRuntimeBundle); the EPUB-native glossary surface (glossary.xhtml +
 * glossrefs) is generated above, so the JSON catalogs are dead weight.
 */
function stripOrphanGlossaryJson(oebpsDir: string): void {
  const i18nDir = path.join(oebpsDir, "content", "i18n")
  if (!fs.existsSync(i18nDir)) return
  for (const entry of fs.readdirSync(i18nDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const gjson = path.join(i18nDir, entry.name, "glossary.json")
    if (fs.existsSync(gjson)) fs.unlinkSync(gjson)
  }
}

/**
 * Mirror `data-id` to `id` on every element that has the former but not
 * the latter. The renderer/LLM uses `data-id` as the semantic anchor for
 * in-app TTS/audio mapping; EPUB readers only honour the standard `id`
 * attribute when resolving SMIL `<text src="…#id"/>` fragment references.
 * Without this pass, every paragraph-level media-overlay reference fails
 * to resolve and Apple Books silently disables read-aloud.
 *
 * Implementation is a regex pass rather than a DOM round-trip so the
 * output stays byte-equivalent to the htmlToXhtml() result outside the
 * inserted `id=` attribute — important for tests and for not perturbing
 * the existing well-formed XHTML.
 */
export function mirrorDataIdToId(xhtml: string): string {
  // Captures: tag name, attrs, optional self-closing slash. Re-emits the
  // slash at the end so `<img …/>` doesn't turn into `<img …/ id="x">`.
  return xhtml.replace(
    /<([a-zA-Z][\w-]*)((?:\s+[^>\s][^>]*?)?)(\s*\/?)>/g,
    (match, tag, attrs, selfClose) => {
      const dataIdMatch = attrs.match(/\sdata-id="([^"]+)"/)
      if (!dataIdMatch) return match
      if (/\sid\s*=/.test(attrs)) return match
      return `<${tag}${attrs} id="${dataIdMatch[1]}"${selfClose}>`
    },
  )
}

/**
 * Wrap every word inside `[data-id]` elements in
 * `<span id="${dataId}_w${NNN}">…</span>` so SMIL `<text src="…#…_wNNN"/>`
 * references resolve in EPUB readers. Uses the same Unicode tokenizer as
 * the live viewer (`tokenizeWords` / `WORD_PATTERN`), so word counts agree
 * with Whisper alignment and with runtime word highlighting.
 *
 * Two paths:
 * - When the paragraph carries `data-segments` (fixed-layout), tokenise the
 *   concatenated segment text and emit per-word spans that wrap per-segment
 *   style fragments. Words that straddle style runs become ONE word span
 *   containing two `<span style>` fragments (the "lahars" case) — required
 *   for epubcheck (no duplicate ids) and for SMIL alignment (Whisper emits
 *   one timestamp for the spoken word).
 * - Otherwise (reflowable), walk text nodes and wrap each word, preserving
 *   inline elements (`<em>`, `<strong>`, glossary spans) verbatim.
 *
 * `<img data-id="…">` is skipped: image audio (alt-text descriptions)
 * doesn't currently flow through the EPUB media overlay pipeline.
 *
 * Runs on the HTML *before* `htmlToXhtml` so the subsequent XHTML
 * normaliser handles void-tag closing for us — keeps this function from
 * needing its own XML serializer.
 */
export function wrapWordSpans(html: string): string {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  for (const el of Array.from(doc.querySelectorAll("[data-id]"))) {
    if (el.tagName.toLowerCase() === "img") continue
    const dataId = el.getAttribute("data-id")
    if (!dataId) continue

    const segmentsAttr = el.getAttribute("data-segments")
    if (segmentsAttr) {
      wrapBySegments(el, dataId, segmentsAttr, doc)
    } else {
      const counter = { idx: 0 }
      wrapTextNodes(el, dataId, counter, doc)
    }
  }

  return dom.serialize()
}

/**
 * Fixed-layout path: re-emit the paragraph's children from `data-segments`,
 * tokenising the concatenated segment text and using positional overlap to
 * split words across style runs where needed. Replaces the paragraph's
 * existing inner DOM — caller has already filtered out `img[data-id]`.
 */
function wrapBySegments(
  parent: Element,
  dataId: string,
  segmentsAttr: string,
  doc: Document,
): void {
  let segments: { text?: string; style?: Record<string, string> }[]
  try {
    segments = JSON.parse(segmentsAttr)
  } catch {
    return
  }
  if (!Array.isArray(segments) || segments.length === 0) return

  const concatText = segments.map((s) => s?.text ?? "").join("")
  const segOffsets: number[] = []
  {
    let cursor = 0
    for (const s of segments) {
      segOffsets.push(cursor)
      cursor += (s?.text ?? "").length
    }
  }

  // Build the styled `<span>` pieces that cover [start, end) in concat
  // coordinates. Each style run becomes one span; adjacent runs stay
  // separate so the visual styling survives intact.
  const buildPieces = (start: number, end: number): Element[] => {
    const out: Element[] = []
    for (let i = 0; i < segments.length; i++) {
      const segStart = segOffsets[i]
      const segText = segments[i]?.text ?? ""
      const segEnd = segStart + segText.length
      if (segEnd <= start) continue
      if (segStart >= end) break
      const slice = segText.slice(
        Math.max(start, segStart) - segStart,
        Math.min(end, segEnd) - segStart,
      )
      if (slice.length === 0) continue
      const styleStr = segments[i]?.style ? styleMapToInline(segments[i].style!) : ""
      if (styleStr) {
        const span = doc.createElement("span")
        span.setAttribute("style", styleStr)
        span.appendChild(doc.createTextNode(slice))
        out.push(span)
      } else {
        // Wrap unstyled text in a span so callers always get Element nodes;
        // the only consumer (appendChild loop below) handles both.
        const span = doc.createElement("span")
        span.appendChild(doc.createTextNode(slice))
        out.push(span)
      }
    }
    return out
  }

  // Clear and re-emit.
  while (parent.firstChild) parent.removeChild(parent.firstChild)

  let wordIdx = 0
  for (const tok of tokenizeWords(concatText)) {
    if (tok.type === "separator") {
      // Separators (whitespace, punctuation) stay OUTSIDE the word-index
      // wrapper so word boxes remain tight for SMIL highlighting, but they
      // must still carry the segment's style: in fixed-layout the font-size
      // lives only on the per-segment span, and the paragraph itself has no
      // font-size. A bare text node would inherit the page default (~16px),
      // so a space between two 48px display words renders ~4px wide and the
      // words look unspaced. Route the separator through buildPieces so each
      // run of whitespace gets the surrounding segment's font metrics.
      if (tok.text.length > 0) {
        for (const piece of buildPieces(tok.start, tok.end)) parent.appendChild(piece)
      }
      continue
    }
    wordIdx += 1
    const wrap = doc.createElement("span")
    wrap.setAttribute("id", wordIdFor(dataId, wordIdx))
    // Fixed-layout words carry font-size only on the inner per-segment
    // spans; the word wrapper itself would inherit the page's ~16px
    // default. The media-overlay read-aloud highlight (media:active-class)
    // paints the *wrapper's* inline background box, whose height is the
    // wrapper's own font content-area — so without a matching font-size the
    // yellow bar renders as a ~16px sliver behind a 48px word. Mirror the
    // word's own (largest) segment size onto the wrapper so the highlight
    // covers the whole word. Purely a paint-box hint: all glyphs live in the
    // styled pieces, so the wrapper renders no text and its width/advance is
    // unchanged. Emitted inline so the runtime auto-fit script shrinks it in
    // lockstep with the pieces it also targets.
    const wordFontSize = maxSegmentFontSize(segments, segOffsets, tok.start, tok.end)
    if (wordFontSize !== undefined) wrap.setAttribute("style", `font-size:${wordFontSize}px`)
    for (const piece of buildPieces(tok.start, tok.end)) wrap.appendChild(piece)
    parent.appendChild(wrap)
  }
}

/**
 * Largest `font-size` (in px) among the segments overlapping [start, end)
 * in concat coordinates, or `undefined` when none of them declares one.
 * Fixed-layout segment sizes are always authored in px by the renderer, so
 * a bare number of px is a safe round-trip.
 */
function maxSegmentFontSize(
  segments: { text?: string; style?: Record<string, string> }[],
  segOffsets: number[],
  start: number,
  end: number,
): number | undefined {
  let max = 0
  for (let i = 0; i < segments.length; i++) {
    const segStart = segOffsets[i]
    const segEnd = segStart + (segments[i]?.text ?? "").length
    if (segEnd <= start) continue
    if (segStart >= end) break
    const fsRaw = segments[i]?.style?.["font-size"]
    if (!fsRaw) continue
    const fs = parseFloat(fsRaw)
    if (Number.isFinite(fs) && fs > max) max = fs
  }
  return max > 0 ? max : undefined
}

function wrapTextNodes(
  parent: Element,
  dataId: string,
  counter: { idx: number },
  doc: Document,
): void {
  // Snapshot children so the mutation below doesn't disturb iteration.
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      const text = child.textContent ?? ""
      if (text.length === 0) continue
      const fragment = doc.createDocumentFragment()
      for (const tok of tokenizeWords(text)) {
        if (tok.type === "separator") {
          fragment.appendChild(doc.createTextNode(tok.text))
        } else {
          counter.idx += 1
          const span = doc.createElement("span")
          span.setAttribute("id", wordIdFor(dataId, counter.idx))
          span.appendChild(doc.createTextNode(tok.text))
          fragment.appendChild(span)
        }
      }
      child.parentNode!.replaceChild(fragment, child)
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      // Recurse — inline tags (em, strong, glossary span…) wrap whole words
      // in practice. A word that crosses an inline boundary would split
      // across two word ids, mirroring the rare-case Whisper behaviour.
      wrapTextNodes(child as Element, dataId, counter, doc)
    }
  }
}

/**
 * Convert an HTML content page to well-formed XHTML for EPUB 3.
 *
 * - Adds XML declaration and XHTML namespace
 * - Converts HTML to XML-safe markup (self-closing tags, etc.)
 * - Preserves all inline styles and content
 * - Mirrors `data-id` to `id` so SMIL fragment refs resolve in EPUB readers
 * - Wraps words in `<span id="…_wNNN">` so SMIL word-level fragments resolve
 */
function convertPageToXhtml(html: string): string {
  // Wrap words first on raw HTML (JSDOM is forgiving there); subsequent
  // htmlToXhtml normalises void-tag closing and entity references for the
  // EPUB consumer. Then mirror data-id → id for paragraph-level fragments.
  const xhtmlBody = mirrorDataIdToId(htmlToXhtml(wrapWordSpans(html)))

  // The htmlToXhtml parser strips the doctype and may mangle the html tag.
  // Rebuild a clean XHTML document with proper namespace.
  // Extract lang attribute from original
  const langMatch = html.match(/lang="([^"]*)"/)
  const lang = langMatch ? langMatch[1] : "en"

  // Extract <head> content (between <head> and </head>)
  const headMatch = xhtmlBody.match(/<head[^>]*>([\s\S]*?)<\/head>/)
  const headContent = headMatch ? headMatch[1] : ""

  // Extract <body> with attributes and content
  const bodyMatch = xhtmlBody.match(/<body([^>]*)>([\s\S]*?)<\/body>/)
  const bodyAttrs = bodyMatch ? bodyMatch[1] : ""
  const bodyContent = bodyMatch ? bodyMatch[2] : ""

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(lang)}">
<head>
${headContent}
</head>
<body${bodyAttrs}>
${bodyContent}
</body>
</html>`
}
