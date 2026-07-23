import fs from "node:fs"
import path from "node:path"
import jpeg from "jpeg-js"
import { PNG } from "pngjs"
import type { Storage } from "@adt/storage"
import type { BookMetadata, TocGenerationOutput } from "@adt/types"
import {
  type PackageAdtWebOptions,
  type PageEntry,
  EXPORT_MIME_TYPES,
  NON_READER_FILES,
  copyDirRecursive,
  injectWebpubStyles,
} from "./web.js"
import { stripRuntimeBundle } from "./strip-runtime-bundle.js"

export type PackagePnldOptions = PackageAdtWebOptions

/**
 * Package a PNLD "Obra Digital" (.zip) from the existing ADT web package.
 *
 * Follows the same pattern as `packageEpub`: copies `adt/` into a `pnld/`
 * working dir, strips the embedded runtime, then reorganises the tree into the
 * layout the FNDE PNLD Anos Finais 2028-2031 spec (Anexo 03) mandates:
 *
 *   pnld/
 *   ├── content/            ← only .html content pages
 *   ├── resources/
 *   │   ├── images/  fonts/  styles/  scripts/  audios/  videos/
 *   ├── content.opf         ← OPF 3.0 package (root)
 *   ├── toc.ncx             ← NCX navigation (root)
 *   ├── index.html          ← main page / nav document (root)
 *   └── cover.<ext>         ← cover image (root)
 *
 * The package is validated by the official VALIDE Desktop reader. Pagination
 * (`doc-pagebreak` markers) and the `pagina`/`sumario` `data-book` roles are
 * emitted; the remaining semantic `data-book` roles (unit/chapter titles,
 * glossary, footnotes, credits, …) are left for a follow-up pass once we can
 * iterate against VALIDE.
 *
 * Requires `packageAdtWeb` to have been run first.
 */
export function packagePnld(storage: Storage, options: PackagePnldOptions): void {
  const { bookDir, title, language } = options

  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throw new Error("ADT package not found — run packageAdtWeb first")
  }

  const pnldDir = path.join(bookDir, "pnld")
  if (fs.existsSync(pnldDir)) fs.rmSync(pnldDir, { recursive: true })

  // Copy adt/ -> pnld/, skipping SCORM/non-reader files
  copyDirRecursive(adtDir, pnldDir, NON_READER_FILES)

  // VALIDE provides its own reader chrome, so drop the embedded runtime
  // (React bundle, offline preloader, SCORM adapter) exactly like EPUB/WebPub.
  stripRuntimeBundle(pnldDir)

  // Reader-override styles (reflowable column overrides / fixed-layout scaler).
  // Injected while pages still sit at the pnld/ root, before the reorg.
  injectWebpubStyles(pnldDir, { fixedLayout: options.fixedLayout })

  // ------------------------------------------------------------------
  // Read reading order + metadata (before the tree is reorganised)
  // ------------------------------------------------------------------
  const pagesJsonPath = path.join(pnldDir, "content", "pages.json")
  const rawPages: PageEntry[] = fs.existsSync(pagesJsonPath)
    ? (JSON.parse(fs.readFileSync(pagesJsonPath, "utf-8")) as PageEntry[])
    : []

  const metadata = storage.getLatestNodeData("metadata", "book")?.data as
    | BookMetadata
    | undefined
  const authors = metadata?.authors ?? []
  const publisher = metadata?.publisher ?? undefined

  const llmToc = storage.getLatestNodeData("toc-generation", "book")?.data as
    | TocGenerationOutput
    | undefined

  // ------------------------------------------------------------------
  // Reorganise adt/ layout into the PNLD content/ + resources/ structure
  // ------------------------------------------------------------------
  // pageList maps each spine entry to its final `content/<section_id>.html`
  // href (adt names the first page `index.html`, which PNLD reserves for the
  // nav document, so every page is renamed to its section id).
  const pageList = reorganize(pnldDir, rawPages, language)

  // ------------------------------------------------------------------
  // Cover image (root). The reader requires cover.jpg/cover.jpeg, so a PNG
  // cover (what adt usually emits) is converted to JPEG.
  // ------------------------------------------------------------------
  const coverHref = ensureJpegCover(pnldDir)

  // ------------------------------------------------------------------
  // Enumerate every packaged file for the OPF manifest
  // ------------------------------------------------------------------
  const allFiles: Array<{ href: string; mediaType: string }> = []
  collectFiles(pnldDir, pnldDir, allFiles)

  // ------------------------------------------------------------------
  // Write the structural files (root)
  // ------------------------------------------------------------------
  fs.writeFileSync(
    path.join(pnldDir, "content.opf"),
    buildOpf({ title, authors, publisher, language, pageList, allFiles, coverHref }),
  )
  fs.writeFileSync(path.join(pnldDir, "toc.ncx"), buildNcx(title, language, pageList))
  fs.writeFileSync(
    path.join(pnldDir, "index.html"),
    buildIndex(title, language, authors, pageList, llmToc),
  )
}

// ---------------------------------------------------------------------------
// Reorganisation
// ---------------------------------------------------------------------------

/**
 * Move the copied `adt/` tree into the PNLD `content/` + `resources/*` layout
 * and rewrite the internal references in each content page. Returns the final
 * page list (reading order) with `href` pointing at `content/<section_id>.html`.
 */
function reorganize(pnldDir: string, rawPages: PageEntry[], language: string): PageEntry[] {
  const resourcesDir = path.join(pnldDir, "resources")
  const stylesDir = path.join(resourcesDir, "styles")
  const fontsDir = path.join(resourcesDir, "fonts")
  const scriptsDir = path.join(resourcesDir, "scripts")
  const imagesDir = path.join(resourcesDir, "images")
  const contentDir = path.join(pnldDir, "content")

  const assetsDir = path.join(pnldDir, "assets")
  const adtContentDir = path.join(pnldDir, "content")

  // 1. Styles → resources/styles (extract before deleting assets/ and content/)
  fs.mkdirSync(stylesDir, { recursive: true })
  moveFile(path.join(adtContentDir, "tailwind_output.css"), path.join(stylesDir, "tailwind_output.css"))
  moveFile(path.join(assetsDir, "fonts.css"), path.join(stylesDir, "fonts.css"))
  moveFile(
    path.join(assetsDir, "libs", "fontawesome", "css", "all.min.css"),
    path.join(stylesDir, "fontawesome-all.min.css"),
  )

  // 2. Fonts → resources/fonts (bundled webfonts + FontAwesome glyph fonts)
  fs.mkdirSync(fontsDir, { recursive: true })
  moveDirContents(path.join(assetsDir, "fonts"), fontsDir)
  moveDirContents(path.join(assetsDir, "libs", "fontawesome", "webfonts"), fontsDir)

  // 3. Scripts → resources/scripts (only non-runtime scripts survive the strip)
  moveFile(path.join(assetsDir, "auto-fit.js"), path.join(scriptsDir, "auto-fit.js"))

  // 4. Images → resources/images
  moveDirContents(path.join(pnldDir, "images"), imagesDir)

  // 5. Content pages → content/<section_id>.html.
  //    Snapshot the page files first, then wipe the adt content/ dir (pages.json,
  //    toc.json, i18n, navigation …) and rebuild it holding only HTML pages.
  const pageFiles = new Map<string, string>() // section_id -> source path at root
  const pageList: PageEntry[] = []
  for (const page of rawPages) {
    const srcPath = path.join(pnldDir, page.href)
    if (!fs.existsSync(srcPath)) continue
    pageFiles.set(page.section_id, srcPath)
    pageList.push({ ...page, href: `content/${page.section_id}.html` })
  }
  const stagedPages = new Map<string, string>() // section_id -> HTML (read before wipe)
  for (const [sectionId, srcPath] of pageFiles) {
    stagedPages.set(sectionId, fs.readFileSync(srcPath, "utf-8"))
  }

  // 6. Remove everything that isn't part of the PNLD structure.
  if (fs.existsSync(adtContentDir)) fs.rmSync(adtContentDir, { recursive: true })
  if (fs.existsSync(assetsDir)) fs.rmSync(assetsDir, { recursive: true })
  removeStrayRootFiles(pnldDir)

  // 7. Write the rewritten content pages into the fresh content/ dir.
  fs.mkdirSync(contentDir, { recursive: true })
  const pageNumbers = new Map(pageList.map((p) => [p.section_id, p.page_number ?? null]))
  for (const [sectionId, html] of stagedPages) {
    fs.writeFileSync(
      path.join(contentDir, `${sectionId}.html`),
      rewriteContentPage(html, pageNumbers.get(sectionId) ?? null, language),
    )
  }

  // 8. Rewrite CSS url() references now that fonts moved to resources/fonts.
  rewriteStylesheets(stylesDir)

  return pageList
}

/**
 * Rewrite a content page's asset references for the content/ subfolder location
 * and, when the page carries a printed page number, inject the spec's
 * `doc-pagebreak` marker at the top of `<main>`.
 */
export function rewriteContentPage(
  html: string,
  pageNumber: number | null = null,
  language = "pt-BR",
): string {
  let out = html
    .replace(/\.\/content\/tailwind_output\.css/g, "../resources/styles/tailwind_output.css")
    .replace(/\.\/assets\/fonts\.css/g, "../resources/styles/fonts.css")
    .replace(
      /\.\/assets\/libs\/fontawesome\/css\/all\.min\.css/g,
      "../resources/styles/fontawesome-all.min.css",
    )
    .replace(/\.\/assets\/auto-fit\.js/g, "../resources/scripts/auto-fit.js")
    .replace(/(src|href)="images\//g, '$1="../resources/images/')
    // Self-contained requirement: no external references. Bundled fonts.css
    // already carries the same families as @font-face rules.
    .replace(/[ \t]*<link\b[^>]*rel="preconnect"[^>]*>\n?/g, "")
    .replace(/[ \t]*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>\n?/g, "")

  // Content pages must declare robots noindex/nofollow (spec §5.9.2).
  if (!/name="robots"/.test(out)) {
    out = out.replace(
      /(<meta charset="[^"]*"\s*\/?>)/i,
      '$1\n    <meta name="robots" content="noindex, nofollow" />',
    )
  }

  // Spec requires the content language on <body> (adt only sets it on <html>).
  out = out.replace(/<body\b(?![^>]*\blang=)([^>]*)>/i, `<body lang="${escapeXml(language)}"$1>`)

  // Pagination: one printed page per content file, marked at the top of <main>.
  if (pageNumber != null) {
    out = out.replace(/<main\b[^>]*>/i, (m) => `${m}\n${paginationMarkup(pageNumber, language)}`)
  }
  return out
}

/**
 * The PNLD page-break marker (spec §pagination): a `doc-pagebreak` paragraph
 * with a screen-reader "Página" label and the numeral in a `page_number` span
 * carrying `data-book="pagina"` and a spelled-out `aria-label` (pt-BR).
 */
function paginationMarkup(pageNumber: number, language: string): string {
  const spoken = spellPageNumber(pageNumber, language)
  const aria = spoken ? ` aria-label="${escapeXml(spoken)}"` : ""
  return `      <p role="doc-pagebreak"><span class="screen-reader-only">${escapeXml(pageWord(language))}</span><span class="page_number" data-book="pagina"${aria}>${pageNumber}</span></p>`
}

/** Rewrite `url(...)` font references in the relocated stylesheets. */
function rewriteStylesheets(stylesDir: string): void {
  const rewrites: Array<[string, (css: string) => string]> = [
    // fonts.css: url('./fonts/x') → url('../fonts/x')
    ["fonts.css", (css) => css.replace(/url\((['"]?)\.\/fonts\//g, "url($1../fonts/")],
    // FontAwesome: url(../webfonts/x) → url(../fonts/x)
    ["fontawesome-all.min.css", (css) => css.replace(/url\((['"]?)\.\.\/webfonts\//g, "url($1../fonts/")],
    // Tailwind output rarely references fonts, but rewrite defensively.
    [
      "tailwind_output.css",
      (css) =>
        css
          .replace(/url\((['"]?)\.\/fonts\//g, "url($1../fonts/")
          .replace(/url\((['"]?)\.\.\/webfonts\//g, "url($1../fonts/"),
    ],
  ]
  for (const [name, fn] of rewrites) {
    const p = path.join(stylesDir, name)
    if (fs.existsSync(p)) fs.writeFileSync(p, fn(fs.readFileSync(p, "utf-8")))
  }
}

/** Remove leftover adt files at the pnld root that aren't part of the PNLD structure. */
function removeStrayRootFiles(pnldDir: string): void {
  for (const entry of fs.readdirSync(pnldDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // `images` is emptied by moveDirContents; drop the husk. Everything the
      // spec keeps (content, resources) is created explicitly elsewhere.
      if (entry.name === "images") fs.rmSync(path.join(pnldDir, entry.name), { recursive: true })
      continue
    }
    // Keep the cover; drop stray root .html (the renamed content pages were read
    // into memory already) and any other loose files.
    if (/^cover\.(png|jpe?g)$/i.test(entry.name)) continue
    fs.rmSync(path.join(pnldDir, entry.name))
  }
}

function moveFile(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.renameSync(src, dest)
}

function moveDirContents(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name)
    const to = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      moveDirContents(from, to)
    } else {
      fs.renameSync(from, to)
    }
  }
}

// ---------------------------------------------------------------------------
// File enumeration
// ---------------------------------------------------------------------------

/**
 * Ensure the root cover is `cover.jpg`/`cover.jpeg` — the reader rejects the
 * package otherwise. An existing JPEG cover is kept as-is; a PNG cover (what adt
 * usually emits) is decoded and re-encoded to `cover.jpeg`, and the PNG dropped.
 * Returns the cover href, or undefined when no cover is present.
 */
export function ensureJpegCover(pnldDir: string): string | undefined {
  const existingJpeg = ["cover.jpg", "cover.jpeg"].find((n) =>
    fs.existsSync(path.join(pnldDir, n)),
  )
  if (existingJpeg) return existingJpeg

  const pngPath = path.join(pnldDir, "cover.png")
  if (!fs.existsSync(pngPath)) return undefined

  const png = PNG.sync.read(fs.readFileSync(pngPath))
  const encoded = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 85)
  fs.writeFileSync(path.join(pnldDir, "cover.jpeg"), encoded.data)
  fs.rmSync(pngPath)
  return "cover.jpeg"
}

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
      out.push({ href: relPath, mediaType: EXPORT_MIME_TYPES[ext] ?? "application/octet-stream" })
    }
  }
}

// ---------------------------------------------------------------------------
// Structural documents
// ---------------------------------------------------------------------------

export function buildOpf(opts: {
  title: string
  authors: string[]
  publisher?: string
  language: string
  pageList: PageEntry[]
  allFiles: Array<{ href: string; mediaType: string }>
  coverHref?: string
}): string {
  const { title, authors, publisher, language, pageList, allFiles, coverHref } = opts
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  const today = now.slice(0, 10)

  // Metadata — the tags the PNLD spec (§5.7) requires in every work.
  const metaLines: string[] = [
    `    <dc:identifier id="pub-id">urn:uuid:${crypto.randomUUID()}</dc:identifier>`,
    `    <dc:title>${escapeXml(title)}</dc:title>`,
    `    <dc:language>${escapeXml(language)}</dc:language>`,
    `    <dc:publisher>${escapeXml(publisher || title)}</dc:publisher>`,
    `    <dc:date>${today}</dc:date>`,
    `    <dc:description>${escapeXml(title)}</dc:description>`,
    `    <meta property="dcterms:modified">${now}</meta>`,
  ]
  if (authors.length > 0) {
    for (const author of authors) metaLines.push(`    <dc:creator>${escapeXml(author)}</dc:creator>`)
  } else {
    metaLines.push(`    <dc:creator>${escapeXml(publisher || title)}</dc:creator>`)
  }
  // Mandatory accessibility metadata (spec §5.7).
  metaLines.push(`    <meta property="schema:accessibilityFeature">structuralNavigation</meta>`)
  metaLines.push(`    <meta property="schema:accessibilityFeature">tableOfContents</meta>`)
  metaLines.push(`    <meta property="schema:accessibilityAPI">ARIA</meta>`)
  if (coverHref) metaLines.push(`    <meta name="cover" content="cover-image"/>`)

  // Manifest — nav (index.html) + ncx first, then every packaged file.
  const manifestLines: string[] = [
    `    <item id="nav" href="index.html" media-type="text/html" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
  ]
  const skipHrefs = new Set(["index.html", "toc.ncx", "content.opf"])
  const hrefToItemId = new Map<string, string>()
  let itemIndex = 0
  for (const file of allFiles) {
    if (skipHrefs.has(file.href)) continue
    const itemId = file.href === coverHref ? "cover-image" : `item-${++itemIndex}`
    hrefToItemId.set(file.href, itemId)
    const propsAttr = file.href === coverHref ? ` properties="cover-image"` : ""
    manifestLines.push(
      `    <item id="${itemId}" href="${escapeXml(file.href)}" media-type="${file.mediaType}"${propsAttr}/>`,
    )
  }

  // Spine — reading order from pages.json (identical to the nav / ncx order).
  const spineLines = pageList.map((page) => {
    const itemId = hrefToItemId.get(page.href) ?? escapeXml(page.section_id)
    return `    <itemref idref="${escapeXml(itemId)}"/>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
${metaLines.join("\n")}
  </metadata>
  <manifest>
${manifestLines.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineLines.join("\n")}
  </spine>
  <guide>
    <reference type="cover" title="Cover" href="${escapeXml(coverHref ?? "index.html")}"/>
  </guide>
</package>`
}

export function buildNcx(title: string, language: string, pageList: PageEntry[]): string {
  const navPoints = pageList
    .map((p, i) => {
      const label = pageLabel(p, language)
      return `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(label)}</text></navLabel>
      <content src="${escapeXml(p.href)}"/>
    </navPoint>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${escapeXml(language)}">
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

export function buildIndex(
  title: string,
  language: string,
  authors: string[],
  pageList: PageEntry[],
  llmToc?: TocGenerationOutput,
): string {
  let tocItems: string
  if (llmToc && llmToc.entries.length > 0) {
    const sectionMap = new Map(pageList.map((p) => [p.section_id, p.href]))
    tocItems = llmToc.entries
      .map((e) => {
        const href = sectionMap.get(e.sectionId)
        if (!href) return ""
        const indent = "      " + "  ".repeat(Math.max(0, e.level - 1))
        return `${indent}<li><a href="${escapeXml(href)}">${escapeXml(e.title)}</a></li>`
      })
      .filter(Boolean)
      .join("\n")
  } else {
    tocItems = pageList
      .map((p) => `      <li><a href="${escapeXml(p.href)}">${escapeXml(pageLabel(p, language))}</a></li>`)
      .join("\n")
  }

  const author = authors[0] ?? ""
  return `<!DOCTYPE html>
<html lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(title)}</title>
  <meta name="description" content="${escapeXml(title)}" />
  <meta name="author" content="${escapeXml(author)}" />
  <meta name="robots" content="noindex, nofollow" />
</head>
<body lang="${escapeXml(language)}">
  <nav role="doc-toc" id="toc" data-book="sumario">
    <h1>${escapeXml(sumarioHeading(language))}</h1>
    <ol>
${tocItems}
    </ol>
  </nav>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pageLabel(page: PageEntry, language: string): string {
  if (page.page_number == null) return page.section_id
  return `${pageWord(language)} ${page.page_number}`
}

function pageWord(language: string): string {
  const base = language.toLowerCase().slice(0, 2)
  if (base === "pt" || base === "es") return "Página"
  return "Page"
}

function sumarioHeading(language: string): string {
  const base = language.toLowerCase().slice(0, 2)
  if (base === "pt") return "Sumário"
  if (base === "es") return "Sumario"
  return "Table of Contents"
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// Cardinal number words for the page-break `aria-label`. PNLD targets pt-BR;
// other languages fall back to the numeral (no aria-label).
const PT_UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"]
const PT_TEENS = ["dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"]
const PT_TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]
const PT_HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"]

/** Spelled-out page number for the aria-label, or null when we use the numeral. */
function spellPageNumber(n: number, language: string): string | null {
  if (!Number.isInteger(n) || n < 0) return null
  if (language.toLowerCase().slice(0, 2) !== "pt") return null
  return spellPtBr(n)
}

/** Spell a non-negative integer in Brazilian Portuguese cardinals (0–9999). */
function spellPtBr(n: number): string {
  if (n === 0) return "zero"
  if (n >= 10000) return String(n) // out of range for page numbers; leave numeric
  const thousands = Math.floor(n / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (thousands > 0) parts.push(thousands === 1 ? "mil" : `${spellPtBrUnder1000(thousands)} mil`)
  if (rest > 0) parts.push(spellPtBrUnder1000(rest))
  // pt-BR inserts "e" before a final chunk that is < 100 or an exact hundred.
  if (parts.length === 2) return parts.join(rest < 100 || rest % 100 === 0 ? " e " : " ")
  return parts[0]
}

function spellPtBrUnder1000(n: number): string {
  if (n === 100) return "cem"
  const h = Math.floor(n / 100)
  const rem = n % 100
  const segs: string[] = []
  if (h > 0) segs.push(PT_HUNDREDS[h])
  if (rem > 0) segs.push(spellPtBrUnder100(rem))
  return segs.join(" e ")
}

function spellPtBrUnder100(n: number): string {
  if (n < 10) return PT_UNITS[n]
  if (n < 20) return PT_TEENS[n - 10]
  const t = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? PT_TENS[t] : `${PT_TENS[t]} e ${PT_UNITS[u]}`
}
