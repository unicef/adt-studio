import fs from "node:fs"
import path from "node:path"
import {
  type BookFont,
  type BookFontFace,
  BookFontRegistry,
  type FontAssignmentOutput,
  FONT_REGISTRY_NODE,
  FONT_REGISTRY_ITEM_ID,
  FONT_ASSIGNMENT_NODE,
  FONT_ASSIGNMENT_ITEM_ID,
  GOOGLE_FONTS,
  bookFontsReferencedIn,
  normalizeFontKey,
} from "@adt/types"
import type { Storage } from "@adt/storage"

const WOFF2_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

type FetchText = (url: string) => Promise<string>
type FetchBytes = (url: string) => Promise<Buffer>

export interface FontsCacheFetchers {
  fetchText?: FetchText
  fetchBytes?: FetchBytes
}

async function defaultFetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": WOFF2_UA } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.text()
}

async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": WOFF2_UA } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export function resolveFontsCacheDir(booksDir: string): string {
  return process.env.FONTS_CACHE_DIR || path.join(path.resolve(booksDir), ".fonts-cache")
}

export interface CachedGoogleFont {
  family: string
  key: string
  dir: string
  faces: BookFontFace[]
}

interface GoogleFontManifest {
  family: string
  fetchedAt: string
  faces: BookFontFace[]
}

function googleFamilyDir(cacheDir: string, family: string): string {
  return path.join(cacheDir, "google", normalizeFontKey(family))
}

export function readCachedGoogleFont(cacheDir: string, family: string): CachedGoogleFont | null {
  const dir = googleFamilyDir(cacheDir, family)
  const manifestPath = path.join(dir, "manifest.json")
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as GoogleFontManifest
    if (!Array.isArray(manifest.faces) || manifest.faces.length === 0) return null
    for (const face of manifest.faces) {
      if (!fs.existsSync(path.join(dir, face.file))) return null
    }
    return { family: manifest.family, key: normalizeFontKey(family), dir, faces: manifest.faces }
  } catch {
    return null
  }
}

interface ParsedCss2Face {
  style: "normal" | "italic"
  weight: number
  url: string
  unicodeRange?: string
}

export function parseCss2FontFaces(css: string): ParsedCss2Face[] {
  const faces: ParsedCss2Face[] = []
  for (const m of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
    const block = m[1]
    const url = /url\((https:\/\/[^)'"]+\.woff2)\)/.exec(block)?.[1]
    if (!url) continue
    const style = /font-style\s*:\s*italic/i.test(block) ? "italic" : "normal"
    const weightRaw = /font-weight\s*:\s*(\d+)/i.exec(block)?.[1]
    const weight = weightRaw ? Number(weightRaw) : 400
    const unicodeRange = /unicode-range\s*:\s*([^;]+);/i.exec(block)?.[1]?.trim()
    faces.push({ style, weight, url, unicodeRange })
  }
  return faces
}

function css2Url(familySpec: string): string {
  return `https://fonts.googleapis.com/css2?family=${familySpec}&display=swap`
}

function familySpecCandidates(family: string): string[] {
  const f = family.trim().replace(/\s+/g, "+")
  return [
    `${f}:ital,wght@0,400;0,700;1,400;1,700`,
    `${f}:wght@400;700`,
    f,
  ]
}

export async function fetchGoogleFontFaces(
  family: string,
  fetchers: FontsCacheFetchers = {},
): Promise<ParsedCss2Face[]> {
  const fetchText = fetchers.fetchText ?? defaultFetchText
  let lastError: unknown
  for (const spec of familySpecCandidates(family)) {
    try {
      const css = await fetchText(css2Url(spec))
      const faces = parseCss2FontFaces(css)
      if (faces.length > 0) return faces
      lastError = new Error(`css2 response for "${family}" contained no @font-face`)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function validateGoogleFamily(
  family: string,
  fetchers: FontsCacheFetchers = {},
): Promise<boolean> {
  const fetchText = fetchers.fetchText ?? defaultFetchText
  try {
    const css = await fetchText(css2Url(family.trim().replace(/\s+/g, "+")))
    return parseCss2FontFaces(css).length > 0
  } catch {
    return false
  }
}

export interface EnsureCachedResult {
  cached: CachedGoogleFont[]
  failed: Array<{ family: string; error: string }>
}

export async function ensureGoogleFontsCached(
  families: string[],
  cacheDir: string,
  fetchers: FontsCacheFetchers = {},
): Promise<EnsureCachedResult> {
  const fetchBytes = fetchers.fetchBytes ?? defaultFetchBytes
  const cached: CachedGoogleFont[] = []
  const failed: Array<{ family: string; error: string }> = []

  for (const family of [...new Set(families.filter(Boolean))]) {
    const existing = readCachedGoogleFont(cacheDir, family)
    if (existing) {
      cached.push(existing)
      continue
    }
    const key = normalizeFontKey(family)
    const dir = googleFamilyDir(cacheDir, family)
    try {
      const parsed = await fetchGoogleFontFaces(family, fetchers)
      fs.mkdirSync(dir, { recursive: true })
      const faces: BookFontFace[] = []
      for (const [i, face] of parsed.entries()) {
        const file = `${key}-${face.style}-${face.weight}-${i}.woff2`
        fs.writeFileSync(path.join(dir, file), await fetchBytes(face.url))
        faces.push({
          file,
          weight: face.weight,
          style: face.style,
          format: "woff2",
          unicodeRange: face.unicodeRange,
        })
      }
      const manifest: GoogleFontManifest = {
        family,
        fetchedAt: new Date().toISOString(),
        faces,
      }
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2))
      cached.push({ family, key, dir, faces })
    } catch (err) {
      failed.push({ family, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { cached, failed }
}

export interface GoogleCatalogFamily {
  family: string
  category?: string
  /** Number of available styles (weights × italics). */
  variants?: number
  /** Whether the family ships variable-font axes. */
  variable?: boolean
  /** Google popularity rank — lower is more popular. */
  popularity?: number
  /** ISO date the family was added to Google Fonts (e.g. `2012-09-30`). */
  dateAdded?: string
}

const CATALOG_URL = "https://fonts.google.com/metadata/fonts"
const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function parseGoogleFontsCatalog(raw: string): GoogleCatalogFamily[] {
  const json = JSON.parse(raw.replace(/^\)\]\}'/, "")) as {
    familyMetadataList?: Array<{
      family?: unknown
      category?: unknown
      fonts?: unknown
      axes?: unknown
      popularity?: unknown
      dateAdded?: unknown
    }>
  }
  if (!Array.isArray(json.familyMetadataList)) return []
  return json.familyMetadataList
    .filter((f): f is typeof f & { family: string } => typeof f.family === "string")
    .map((f) => ({
      family: f.family,
      category: typeof f.category === "string" ? f.category : undefined,
      variants:
        f.fonts && typeof f.fonts === "object" ? Object.keys(f.fonts).length : undefined,
      variable: Array.isArray(f.axes) ? f.axes.length > 0 : undefined,
      popularity: typeof f.popularity === "number" ? f.popularity : undefined,
      dateAdded: typeof f.dateAdded === "string" ? f.dateAdded : undefined,
    }))
}

interface CatalogCache {
  fetchedAt: number
  families: GoogleCatalogFamily[]
}

export async function fetchGoogleFontsCatalog(
  cacheDir: string,
  fetchers: FontsCacheFetchers = {},
  now = Date.now(),
): Promise<GoogleCatalogFamily[]> {
  const fetchText = fetchers.fetchText ?? defaultFetchText
  const cachePath = path.join(cacheDir, "google-catalog.json")

  let cached: CatalogCache | null = null
  try {
    cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as CatalogCache
  } catch {
    cached = null
  }
  if (!Array.isArray(cached?.families) || cached.families.length === 0) cached = null
  if (cached && !cached.families.some((f) => f.popularity !== undefined)) cached = null
  if (cached && now - cached.fetchedAt < CATALOG_TTL_MS) return cached.families

  let fetched: GoogleCatalogFamily[] = []
  try {
    fetched = parseGoogleFontsCatalog(await fetchText(CATALOG_URL))
  } catch {
    fetched = []
  }
  if (fetched.length > 0) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true })
      fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: now, families: fetched }))
    } catch {
      return fetched
    }
    return fetched
  }

  if (cached) return cached.families
  return GOOGLE_FONTS.map((f) => ({ family: f.family }))
}

export interface BookFontPromptEntry {
  family: string
  role: BookFont["role"]
  category: string | null
  usage_notes: string | null
}

export function buildBookFontsPromptContext(storage: Storage): BookFontPromptEntry[] {
  const registry = readBookFontRegistry(storage)
  if (registry.fonts.length === 0) return []
  const assignment = storage.getLatestNodeData(FONT_ASSIGNMENT_NODE, FONT_ASSIGNMENT_ITEM_ID)
    ?.data as FontAssignmentOutput | null
  return registry.fonts.map((f) => ({
    family: f.family,
    role: f.role,
    category: f.category ?? null,
    usage_notes:
      assignment?.assignments?.find((a) => a.font_id === f.id)?.usage_notes ?? null,
  }))
}

export function readBookFontRegistry(storage: Storage): BookFontRegistry {
  const row = storage.getLatestNodeData(FONT_REGISTRY_NODE, FONT_REGISTRY_ITEM_ID)
  const parsed = BookFontRegistry.safeParse(row?.data ?? { fonts: [] })
  return parsed.success ? parsed.data : { fonts: [] }
}

export async function ensureBookGoogleFontsCached(
  storage: Storage,
  cacheDir: string,
  fetchers: FontsCacheFetchers = {},
): Promise<EnsureCachedResult> {
  const registry = readBookFontRegistry(storage)
  const googleFamilies = registry.fonts.filter((f) => f.source === "google").map((f) => f.family)
  if (googleFamilies.length === 0) return { cached: [], failed: [] }

  const result = await ensureGoogleFontsCached(googleFamilies, cacheDir, fetchers)

  let changed = false
  for (const font of registry.fonts) {
    if (font.source !== "google") continue
    const entry = result.cached.find((c) => c.family === font.family)
    if (entry && JSON.stringify(font.faces) !== JSON.stringify(entry.faces)) {
      font.faces = entry.faces
      changed = true
    }
  }
  if (changed) {
    storage.putNodeData(FONT_REGISTRY_NODE, FONT_REGISTRY_ITEM_ID, registry)
  }
  return result
}

const CSS_FORMAT: Record<BookFontFace["format"], string> = {
  woff2: "woff2",
  woff: "woff",
  truetype: "truetype",
  opentype: "opentype",
}

function fontFaceRule(family: string, face: BookFontFace, fileName: string): string {
  const lines = [
    `@font-face {`,
    `  font-family: '${family.replace(/'/g, "\\'")}';`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
    `  font-display: swap;`,
    `  src: url('./fonts/${fileName}') format('${CSS_FORMAT[face.format]}');`,
  ]
  if (face.unicodeRange) lines.push(`  unicode-range: ${face.unicodeRange};`)
  lines.push(`}`)
  return lines.join("\n")
}

export interface BundleBookFontsOptions {
  bookFontsDir: string
  googleCacheDir: string
  fetchers?: FontsCacheFetchers
}

export async function bundleBookFontsIntoCss(
  adtDir: string,
  registry: BookFontRegistry,
  opts: BundleBookFontsOptions,
): Promise<string[]> {
  const cssPath = path.join(adtDir, "assets", "fonts.css")
  if (!fs.existsSync(cssPath) || registry.fonts.length === 0) return []

  let allHtml = ""
  for (const name of fs.readdirSync(adtDir)) {
    if (name.endsWith(".html")) allHtml += fs.readFileSync(path.join(adtDir, name), "utf-8")
  }
  const referencedIds = new Set(bookFontsReferencedIn(allHtml, registry).map((f) => f.id))
  const needed = registry.fonts.filter((f) => referencedIds.has(f.id))
  if (needed.length === 0) return []

  const googleFamilies = needed.filter((f) => f.source === "google").map((f) => f.family)
  const { failed } = await ensureGoogleFontsCached(googleFamilies, opts.googleCacheDir, opts.fetchers)
  if (failed.length > 0) {
    const detail = failed.map((f) => `${f.family} (${f.error})`).join("; ")
    throw new Error(`Google font(s) required by this book could not be downloaded: ${detail}`)
  }

  const outFontsDir = path.join(adtDir, "assets", "fonts")
  fs.mkdirSync(outFontsDir, { recursive: true })

  const rules: string[] = []
  const bundled: string[] = []
  for (const font of needed) {
    const resolved = resolveFontFiles(font, opts)
    if (!resolved) continue
    for (const { face, sourcePath } of resolved) {
      fs.copyFileSync(sourcePath, path.join(outFontsDir, face.file))
      rules.push(fontFaceRule(font.family, face, face.file))
    }
    bundled.push(font.family)
  }
  if (rules.length === 0) return []

  const existing = fs.readFileSync(cssPath, "utf-8")
  fs.writeFileSync(
    cssPath,
    `${existing}\n\n/* Book fonts (user uploads + selected Google Fonts) */\n${rules.join("\n")}\n`,
  )
  return bundled
}

function resolveFontFiles(
  font: BookFont,
  opts: BundleBookFontsOptions,
): Array<{ face: BookFontFace; sourcePath: string }> | null {
  if (font.source === "google") {
    const entry = readCachedGoogleFont(opts.googleCacheDir, font.family)
    if (!entry) return null
    return entry.faces.map((face) => ({ face, sourcePath: path.join(entry.dir, face.file) }))
  }
  const out: Array<{ face: BookFontFace; sourcePath: string }> = []
  for (const face of font.faces) {
    const sourcePath = path.join(opts.bookFontsDir, face.file)
    if (fs.existsSync(sourcePath)) out.push({ face, sourcePath })
  }
  return out.length > 0 ? out : null
}
