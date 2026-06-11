import fs from "node:fs"
import path from "node:path"
import type { Storage } from "@adt/storage"
import type { BookMetadata } from "@adt/types"
import { stripRuntimeBundle } from "./strip-runtime-bundle.js"
import {
  type PackageAdtWebOptions,
  type PageEntry,
  copyDirRecursive,
  injectWebpubStyles,
  writeJson,
} from "./web.js"

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

  // The reading app owns the UI; ship content + feature data only.
  stripRuntimeBundle(webpubDir)

  // Override config: disable navigation controls and tutorial for embedded reading
  let features: Record<string, unknown> = {}
  const configPath = path.join(webpubDir, "assets", "config.json")
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    config.features.showNavigationControls = false
    config.features.showTutorial = false
    writeJson(configPath, config)
    features = config.features ?? {}
  }

  // Inject CSS into HTML pages to prevent readers (e.g. Thorium) from applying
  // column-based pagination which breaks the single-page ADT layout.
  injectWebpubStyles(webpubDir, { fixedLayout: options.fixedLayout })

  // The full runtime is stripped, so load the standalone activities bundle on
  // pages that host interactive activities — it renders the Submit/Next control
  // and validates answers (the bundle file survives stripRuntimeBundle).
  injectActivitiesBundle(webpubDir)

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

  // Navigation collections the reader uses to build its own UI
  const toc = buildTocCollection(webpubDir)

  const pageListNav = pageList
    .filter((page) => page.page_number != null)
    .map((page) => ({ href: page.href, title: String(page.page_number) }))

  const landmarks: Array<Record<string, string>> = []
  const coverLink = links.find((link) => link.rel === "cover")
  if (coverLink) landmarks.push({ rel: "cover", href: coverLink.href })
  if (readingOrder.length > 0) {
    landmarks.push({ rel: "bodymatter", href: readingOrder[0].href })
  }

  manifestMetadata.accessibility = buildAccessibilityMetadata(features, toc.length > 0)

  // Write manifest
  const manifest = {
    "@context": "https://readium.org/webpub-manifest/context.jsonld",
    metadata: manifestMetadata,
    links,
    readingOrder,
    resources,
    ...(toc.length > 0 ? { toc } : {}),
    ...(pageListNav.length > 0 ? { pageList: pageListNav } : {}),
    ...(landmarks.length > 0 ? { landmarks } : {}),
  }
  writeJson(path.join(webpubDir, "manifest.json"), manifest)
}

interface TocFileEntry {
  href: string
  title: string
  level?: number
}

export interface TocLink {
  href: string
  title: string
  children?: TocLink[]
}

/**
 * Nest a flat list of TOC entries into a hierarchy of Link Objects using each
 * entry's `level`. Entries without a level are treated as top-level.
 */
export function nestTocEntries(entries: TocFileEntry[]): TocLink[] {
  const root: TocLink[] = []
  const stack: Array<{ level: number; link: TocLink }> = []
  for (const entry of entries) {
    const level = entry.level ?? 1
    const link: TocLink = { href: entry.href, title: entry.title }
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop()
    if (stack.length === 0) {
      root.push(link)
    } else {
      const parent = stack[stack.length - 1].link
      ;(parent.children ??= []).push(link)
    }
    stack.push({ level, link })
  }
  return root
}

function buildTocCollection(webpubDir: string): TocLink[] {
  const tocPath = path.join(webpubDir, "content", "toc.json")
  if (!fs.existsSync(tocPath)) return []
  try {
    const entries = JSON.parse(fs.readFileSync(tocPath, "utf-8")) as TocFileEntry[]
    return nestTocEntries(entries)
  } catch {
    return []
  }
}

const ACTIVITY_SECTION_MARKER = 'data-section-type="activity_'
const ACTIVITIES_SCRIPT_TAG = '    <script src="./assets/activities.bundle.local.js"></script>\n'

/**
 * Inject the standalone activities bundle into every WebPub page that hosts an
 * interactive activity. Non-activity pages are left untouched so they don't
 * boot an idle runtime.
 */
export function injectActivitiesBundle(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      injectActivitiesBundle(fullPath)
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      const html = fs.readFileSync(fullPath, "utf-8")
      if (!html.includes(ACTIVITY_SECTION_MARKER)) continue
      if (html.includes("activities.bundle.local.js")) continue
      fs.writeFileSync(fullPath, html.replace("</body>", `${ACTIVITIES_SCRIPT_TAG}</body>`))
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

/**
 * Derive a schema.org-based accessibility object from the ADT feature flags.
 * Only features we can substantiate from the packaged data are claimed; no
 * WCAG/EPUB conformance is asserted (that would require certification).
 */
function buildAccessibilityMetadata(
  features: Record<string, unknown>,
  hasToc: boolean,
): Record<string, unknown> {
  const on = (key: string): boolean => features[key] === true

  const accessMode = ["textual", "visual"]
  const feature = ["readingOrder"]
  if (hasToc) feature.push("tableOfContents")
  if (on("describeImages")) feature.push("alternativeText")
  if (on("readAloud")) {
    accessMode.push("auditory")
    feature.push("synchronizedAudioText")
  }
  if (on("signLanguage")) feature.push("signLanguage")

  const provided: string[] = []
  if (on("readAloud")) provided.push("read-aloud audio synchronized with the text")
  if (on("describeImages")) provided.push("alternative text for images")
  if (on("signLanguage")) provided.push("sign-language video")
  const summary = provided.length > 0
    ? `Includes ${provided.join(", ")}.`
    : "Structured text with a navigable reading order."

  return {
    accessMode,
    accessModeSufficient: [["textual", "visual"]],
    feature,
    hazard: ["none"],
    summary,
  }
}
