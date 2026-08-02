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
  //
  // `options.fixedLayout` only covers the extraction-based `fixed_layout`
  // render strategy. LLM-overlay books render absolutely-positioned `#content`
  // boxes (`data-fl-reference-width`, `opacity-0`) that are visually
  // fixed-layout but report as reflowable — the reflowable override collapses
  // their auto-height `#content` to zero, so the reader (LIP) shows a blank
  // page. Detect the overlay signature directly and treat those as fixed too.
  const fixedLayout = options.fixedLayout || hasFixedLayoutContent(pnldDir)
  injectWebpubStyles(pnldDir, { fixedLayout })

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
  const pageList = reorganize(pnldDir, rawPages, language, fixedLayout)

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
function reorganize(
  pnldDir: string,
  rawPages: PageEntry[],
  language: string,
  fixedLayout: boolean,
): PageEntry[] {
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
    path.join(stylesDir, "fontawesome-all-min.css"),
  )

  // 2. Fonts → resources/fonts (bundled webfonts + FontAwesome glyph fonts)
  fs.mkdirSync(fontsDir, { recursive: true })
  moveDirContents(path.join(assetsDir, "fonts"), fontsDir)
  moveDirContents(path.join(assetsDir, "libs", "fontawesome", "webfonts"), fontsDir)

  // 3. Scripts → resources/scripts. Spec §5.2 requires every script to live in
  //    this folder, with no extra dots in the filename.
  moveFile(path.join(assetsDir, "auto-fit.js"), path.join(scriptsDir, "auto-fit.js"))
  moveFile(
    path.join(assetsDir, "activities.bundle.local.js"),
    path.join(scriptsDir, "activities-bundle-local.js"),
  )

  // 3b. Activity sound effects (.mp3) → resources/audios (edital: audio there).
  //     The activities bundle finds them via <meta name="adt-sounds-base">.
  moveDirContents(path.join(assetsDir, "sounds"), path.join(resourcesDir, "audios"))

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

  // 5b. Preserve the ADT runtime layer (config, translations, manifests,
  //     feature data, activities bundle) into resources/data/ so activities work
  //     and the reader can reach every feature — before assets/ + content/ go.
  buildAdtSidecar(pnldDir)

  // 5c. Move per-language audio/video out of the sidecar into the edital's
  //     per-type folders (resources/{audios,videos}); the JSON data stays in
  //     resources/data. (Page images already went to resources/images in step 4.)
  relocateMedia(pnldDir)

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
      rewriteContentPage(html, pageNumbers.get(sectionId) ?? null, language, fixedLayout),
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
  fixedLayout = false,
): string {
  let out = html
    .replace(/\.\/content\/tailwind_output\.css/g, "../resources/styles/tailwind_output.css")
    .replace(/\.\/assets\/fonts\.css/g, "../resources/styles/fonts.css")
    .replace(
      /\.\/assets\/libs\/fontawesome\/css\/all\.min\.css/g,
      "../resources/styles/fontawesome-all-min.css",
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

  // Spec §5.9.3 requires a schema.org/Book itemscope as the first child of <body>.
  if (!/itemtype="https:\/\/schema\.org\/Book"/.test(out)) {
    out = out
      .replace(/(<body\b[^>]*>)/i, '$1\n    <div itemscope itemtype="https://schema.org/Book">')
      .replace(/<\/body>/i, "    </div>\n</body>")
  }

  // Activity pages load the standalone activities bundle (submit/validate +
  // confetti/toast + next-page nav), like WebPub. `adt-base` points the runtime
  // loaders at the `resources/data/` data sidecar (pages live in content/, so it
  // resolves one level up) — the loaders fetch the JSON there exactly like
  // adt/webpub fetch under `./`.
  if (out.includes('data-section-type="activity_')) {
    out = out.replace(
      /<\/head>/i,
      '    <meta name="adt-base" content="../resources/data/" />\n' +
        '    <meta name="adt-sounds-base" content="../resources/audios/" />\n</head>',
    )
    out = out.replace(
      /<\/body>/i,
      '    <script src="../resources/scripts/activities-bundle-local.js"></script>\n</body>',
    )
  }

  // Fixed-layout / LLM-overlay pages ship an absolutely-positioned `#content`
  // box that the ADT runtime normally reveals (`opacity-0` → visible) and the
  // web reader normally scales. The runtime is stripped from the PNLD, so a
  // self-contained script reveals `#content` and scales it to the reader
  // viewport (LIP). Only injected on pages that actually carry the box.
  if (fixedLayout && hasFixedLayoutBox(out)) {
    out = out.replace(/<\/body>/i, `${fixedLayoutFitScript()}\n</body>`)
  }

  // Pagination: one printed page per content file, marked at the top of <main>.
  if (pageNumber != null) {
    out = out.replace(/<main\b[^>]*>/i, (m) => `${m}\n${paginationMarkup(pageNumber, language)}`)
  }
  return out
}

/**
 * Self-contained scaler for the fixed-layout / LLM-overlay `#content` box.
 * Replaces the ADT runtime (stripped from the PNLD) and the WebPub
 * `fixedLayoutWebFit` script (never baked into these pages): removes the
 * `opacity-0` gate, then centres and scales `#content` to fit the reader
 * viewport by its authored `data-fl-reference-width` (falling back to the
 * inline width). Re-fits on resize. No ADT dock var — LIP supplies its own
 * chrome — so the whole viewport is available.
 */
function fixedLayoutFitScript(): string {
  return `    <script>
      (function () {
        var c = document.getElementById("content");
        if (!c) return;
        c.classList.remove("opacity-0");
        var H = parseFloat(c.style.height) || c.offsetHeight || 1;
        var ref = parseFloat(c.getAttribute("data-fl-reference-width"));
        var refW = ref > 0 ? ref : (parseFloat(c.style.width) || c.offsetWidth || 1);
        function fit() {
          var s = Math.min(1, window.innerWidth / refW, window.innerHeight / H);
          c.style.position = "absolute";
          c.style.left = "50%";
          c.style.top = "50%";
          c.style.margin = "0";
          c.style.transformOrigin = "center center";
          c.style.transform = "translate(-50%, -50%) scale(" + s + ")";
          c.style.opacity = "1";
          c.style.visibility = "visible";
        }
        fit();
        window.addEventListener("resize", fit);
        window.addEventListener("load", fit);
      })();
    </script>`
}

/**
 * True when the HTML carries an LLM-overlay / fixed-layout `#content` box — an
 * absolutely-positioned wrapper scaled by `data-fl-reference-width`. Both the
 * per-page fit-script injection and the book-level `hasFixedLayoutContent`
 * detection key off this same signature.
 */
function hasFixedLayoutBox(html: string): boolean {
  return /<div\b[^>]*\bid="content"[^>]*\bdata-fl-reference-width=/i.test(html)
}

/**
 * True when any top-level `.html` page in `dir` carries a fixed-layout `#content`
 * box. Runs after copy + strip, while the pages still sit at the pnld root
 * (pre-reorg), to decide whether the fixed-layout reader overrides + scaler are
 * needed even when the book's render strategy reports reflowable.
 */
function hasFixedLayoutContent(dir: string): boolean {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) continue
    if (hasFixedLayoutBox(fs.readFileSync(path.join(dir, entry.name), "utf-8"))) return true
  }
  return false
}

/**
 * The PNLD page-break marker (spec §pagination): a `doc-pagebreak` paragraph
 * with a screen-reader "Página" label and the numeral in a `page_number` span
 * carrying `data-book="pagina"` and a spelled-out `aria-label` (pt-BR).
 *
 * The whole paragraph is `sr-only`: the marker must stay in the DOM (VALIDE and
 * screen-reader / reader page-list navigation resolve `data-book="pagina"`), but
 * the numeral should not render inline — it sits in `<main>` outside the scaled
 * `#content` box, so left visible it floats as a stray number at the page top,
 * and the reader already shows the current page in its own chrome.
 */
function paginationMarkup(pageNumber: number, language: string): string {
  const spoken = spellPageNumber(pageNumber, language)
  const aria = spoken ? ` aria-label="${escapeXml(spoken)}"` : ""
  return `      <p role="doc-pagebreak" class="sr-only"><span>${escapeXml(pageWord(language))} </span><span class="page_number" data-book="pagina"${aria}>${pageNumber}</span></p>`
}

/** Rewrite `url(...)` font references in the relocated stylesheets. */
function rewriteStylesheets(stylesDir: string): void {
  const rewrites: Array<[string, (css: string) => string]> = [
    // fonts.css: url('./fonts/x') → url('../fonts/x')
    ["fonts.css", (css) => css.replace(/url\((['"]?)\.\/fonts\//g, "url($1../fonts/")],
    // FontAwesome: url(../webfonts/x) → url(../fonts/x)
    ["fontawesome-all-min.css", (css) => css.replace(/url\((['"]?)\.\.\/webfonts\//g, "url($1../fonts/")],
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

/**
 * Preserve the ADT runtime layer into a `resources/data/` sidecar, mirroring the
 * adt/webpub layout (`assets/` + `content/`) so the standalone activities
 * bundle works unchanged via `<meta name="adt-base">`. Carries everything the
 * reader + bundle need: the config, interface translations, page/toc manifests,
 * and the per-language feature data (read-aloud audio, sign-language video,
 * glossary/texts/timecode). Must run before `assets/` and `content/` are
 * deleted; `content/` itself stays HTML-only. (The activities bundle is not
 * carried here — it moves to `resources/scripts/` earlier in the reorg.)
 *
 * Locale folders are lowercased to satisfy the spec's folder-naming rule
 * (§5.2.1). The activities bundle derives its fetch language from
 * `config.languages`, so those locale codes are lowercased in lockstep,
 * leaving each page's `<html lang>` (the semantic locale) untouched.
 */
export function buildAdtSidecar(pnldDir: string): void {
  const data = path.join(pnldDir, "resources", "data")
  const assets = path.join(pnldDir, "assets")
  const content = path.join(pnldDir, "content")

  moveFile(path.join(assets, "config.json"), path.join(data, "assets", "config.json"))
  moveDir(path.join(assets, "interface_translations"), path.join(data, "assets", "interface_translations"))
  moveFile(path.join(content, "pages.json"), path.join(data, "content", "pages.json"))
  moveFile(path.join(content, "toc.json"), path.join(data, "content", "toc.json"))
  moveDir(path.join(content, "i18n"), path.join(data, "content", "i18n"))

  lowercaseChildDirs(path.join(data, "assets", "interface_translations"))
  lowercaseChildDirs(path.join(data, "content", "i18n"))
  lowercaseConfigLanguages(path.join(data, "assets", "config.json"))
}

/**
 * Lowercase every immediate subdirectory name (spec §5.2.1: all folders
 * lowercase). Renames via a temp name so the case actually changes on
 * case-insensitive filesystems.
 */
function lowercaseChildDirs(dir: string): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const lower = entry.name.toLowerCase()
    if (lower === entry.name) continue
    const tmp = path.join(dir, `__lc_${lower}`)
    fs.renameSync(path.join(dir, entry.name), tmp)
    fs.renameSync(tmp, path.join(dir, lower))
  }
}

/**
 * Lowercase the locale codes in `config.languages` so the activities bundle
 * resolves the now-lowercase i18n / interface_translations folders (it picks
 * its fetch language from this config, not from `<html lang>`).
 */
function lowercaseConfigLanguages(configPath: string): void {
  if (!fs.existsSync(configPath)) return
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    const langs = config?.languages
    if (!langs) return
    if (typeof langs.default === "string") langs.default = langs.default.toLowerCase()
    if (Array.isArray(langs.available)) {
      langs.available = langs.available.map((l: unknown) =>
        typeof l === "string" ? l.toLowerCase() : l,
      )
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  } catch {
    // Malformed config — leave as-is rather than failing the export.
  }
}

// Media extension → its edital resource folder + the i18n map file (a JSON in
// resources/data) whose values are rewritten to point at the relocated file.
// Only per-language audio/video live under resources/data; image variants are
// already moved to resources/images (with their original names) during reorg,
// so images are intentionally not handled here.
const MEDIA_DEST: Record<string, { folder: string; map: string }> = {
  ".mp3": { folder: "audios", map: "audios.json" },
  ".flac": { folder: "audios", map: "audios.json" },
  ".mp4": { folder: "videos", map: "videos.json" },
}

/**
 * Move ADT media out of `resources/data/content/i18n/<lang>/…` into the edital's
 * flat per-type folders `resources/{audios,videos}/` (V18d/e) — the one place
 * the PNLD tree can't mirror the adt layout. The same filename can exist per
 * language (e.g. sign-language video differs pt-br vs en-us), so files are
 * renamed `<lang>__<original>` to avoid collisions in the flat folder. The
 * matching i18n map (`audios.json`/`videos.json`, which stays as JSON in
 * `resources/data/`) is rewritten so the reader resolves `resources/<type>/<value>`.
 * The JSON data itself is left in place — the runtime loaders fetch it under
 * `resources/data/` via `adt-base`, exactly like adt/webpub under `./`.
 *
 * NB: this only makes sense if the *reader* (VALIDE / LIP) resolves the maps —
 * the shipped activities bundle plays no i18n media, so the relocated values are
 * inert inside the package.
 */
export function relocateMedia(pnldDir: string): void {
  const dataDir = path.join(pnldDir, "resources", "data")
  if (!fs.existsSync(dataDir)) return
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    )

  // map-file path → { oldName → newName }, applied after the files are moved.
  const remaps = new Map<string, Map<string, string>>()

  for (const file of walk(dataDir)) {
    const dest = MEDIA_DEST[path.extname(file).toLowerCase()]
    if (!dest) continue
    // Only relocate media that lives under an i18n/<lang>/ subtree; anything
    // else has no per-language map to rewrite, so leave it in place.
    const rel = path.relative(dataDir, file).replace(/\\/g, "/").split("/")
    const i18nIdx = rel.indexOf("i18n")
    const lang = i18nIdx >= 0 ? rel[i18nIdx + 1] : undefined
    if (!lang) continue
    const oldName = path.basename(file)
    const newName = `${lang}__${oldName}`

    const destDir = path.join(pnldDir, "resources", dest.folder)
    fs.mkdirSync(destDir, { recursive: true })
    fs.renameSync(file, path.join(destDir, newName))

    const mapPath = path.join(dataDir, "content", "i18n", lang, dest.map)
    if (!remaps.has(mapPath)) remaps.set(mapPath, new Map())
    remaps.get(mapPath)?.set(oldName, newName)
  }

  for (const [mapPath, renames] of remaps) {
    if (!fs.existsSync(mapPath)) continue
    const map = JSON.parse(fs.readFileSync(mapPath, "utf-8")) as Record<string, unknown>
    for (const k of Object.keys(map)) {
      const renamed = typeof map[k] === "string" ? renames.get(map[k] as string) : undefined
      if (renamed) map[k] = renamed
    }
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2))
  }

  // Drop the emptied audio/video dirs; the JSON keeps resources/data alive.
  pruneEmptyDirs(dataDir)
}

/** Remove empty directories bottom-up, including `dir` itself if it empties. */
function pruneEmptyDirs(dir: string): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name))
  }
  if (fs.readdirSync(dir).length === 0) fs.rmSync(dir, { recursive: true })
}

function moveDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.rmSync(dest, { recursive: true, force: true })
  fs.renameSync(src, dest)
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
// Cover image
// ---------------------------------------------------------------------------

// PNLD cover dimensions: exactly 2560×1600 (landscape) or 1600×2560 (portrait).
// The source cover is scaled to fit that box and letterboxed on white.
const COVER_LONG = 2560
const COVER_SHORT = 1600

/**
 * Ensure the root cover is `cover.jpeg` at the spec dimensions — the reader
 * rejects the package otherwise. The source cover (PNG, what adt emits, or a
 * JPEG) is decoded, scaled to fit the spec size preserving aspect (letterboxed
 * on white), and re-encoded to `cover.jpeg`. If the file isn't a decodable
 * image the original is kept as-is rather than failing the export (a real book
 * always has a valid cover). Returns the cover href, or undefined when absent.
 */
export function ensureJpegCover(pnldDir: string): string | undefined {
  const src = ["cover.png", "cover.jpg", "cover.jpeg"]
    .map((n) => path.join(pnldDir, n))
    .find((p) => fs.existsSync(p))
  if (!src) return undefined

  const buf = fs.readFileSync(src)
  const decoded = decodeImage(buf)
  const jpegPath = path.join(pnldDir, "cover.jpeg")

  if (!decoded) {
    // Not a decodable image. A JPEG-by-content survives as cover.jpeg; anything
    // else is left untouched rather than failing the export.
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      if (path.resolve(src) !== path.resolve(jpegPath)) fs.renameSync(src, jpegPath)
      return "cover.jpeg"
    }
    return path.basename(src)
  }

  const resized = resizeCoverContain(decoded)
  const encoded = jpeg.encode({ data: resized.data, width: resized.width, height: resized.height }, 85)
  fs.writeFileSync(jpegPath, encoded.data)
  if (path.resolve(src) !== path.resolve(jpegPath)) fs.rmSync(src)
  return "cover.jpeg"
}

/** Decode a PNG or JPEG buffer to `{ data: RGBA, width, height }`, or null. */
function decodeImage(buf: Buffer): { data: Uint8Array; width: number; height: number } | null {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return PNG.sync.read(buf)
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      return jpeg.decode(buf, { useTArray: true, formatAsRGBA: true })
    }
  } catch {
    // Corrupt or unsupported — fall through.
  }
  return null
}

/**
 * Scale an RGBA image to the spec cover size (matching the source orientation),
 * preserving aspect ratio and letterboxing the remainder on white. Bilinear
 * sampling; alpha is composited over white so JPEG (no alpha) has no fringing.
 */
function resizeCoverContain(img: {
  data: Uint8Array
  width: number
  height: number
}): { data: Buffer; width: number; height: number } {
  const { data: src, width: sw, height: sh } = img
  const targetW = sw >= sh ? COVER_LONG : COVER_SHORT
  const targetH = sw >= sh ? COVER_SHORT : COVER_LONG

  const scale = Math.min(targetW / sw, targetH / sh)
  const drawW = Math.max(1, Math.round(sw * scale))
  const drawH = Math.max(1, Math.round(sh * scale))
  const offX = Math.floor((targetW - drawW) / 2)
  const offY = Math.floor((targetH - drawH) / 2)

  const out = Buffer.alloc(targetW * targetH * 4, 0xff) // opaque white
  const rx = sw / drawW
  const ry = sh / drawH
  const rgba = [0, 0, 0, 0]
  for (let dy = 0; dy < drawH; dy++) {
    const sy = Math.min(sh - 1, Math.max(0, (dy + 0.5) * ry - 0.5))
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, sh - 1)
    const wy = sy - y0
    for (let dx = 0; dx < drawW; dx++) {
      const sx = Math.min(sw - 1, Math.max(0, (dx + 0.5) * rx - 0.5))
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, sw - 1)
      const wx = sx - x0
      const i00 = (y0 * sw + x0) * 4
      const i01 = (y0 * sw + x1) * 4
      const i10 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      const o = ((dy + offY) * targetW + (dx + offX)) * 4
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - wx) + src[i01 + c] * wx
        const bot = src[i10 + c] * (1 - wx) + src[i11 + c] * wx
        rgba[c] = top * (1 - wy) + bot * wy
      }
      const a = rgba[3] / 255
      out[o] = Math.round(rgba[0] * a + 255 * (1 - a))
      out[o + 1] = Math.round(rgba[1] * a + 255 * (1 - a))
      out[o + 2] = Math.round(rgba[2] * a + 255 * (1 - a))
      out[o + 3] = 255
    }
  }
  return { data: out, width: targetW, height: targetH }
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
  <div itemscope itemtype="https://schema.org/Book">
    <nav role="doc-toc" id="toc" data-book="sumario">
      <h1>${escapeXml(sumarioHeading(language))}</h1>
      <ol>
${tocItems}
      </ol>
    </nav>
  </div>
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
