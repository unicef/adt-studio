/**
 * Offline bundling of Google Fonts.
 *
 * Fixed-layout pages declare Google family names (e.g. `'Mouse Memoirs'`) and
 * load them via a `<link>` to the Google CDN — fine online, but `file://` /
 * SCORM / EPUB bundles have no network. This module fetches the css2
 * stylesheet + its woff2 files at package time, writes each woff2 into the
 * book's `assets/fonts/` directory, and rewrites every woff2 URL to a local
 * `./fonts/<file>` path — producing self-contained `@font-face` rules appended
 * to the book's `assets/fonts.css`. `@font-face` `url()` loads work under
 * `file://` (only `fetch()` is origin-blocked), so the fonts are linked rather
 * than base64-inlined. All failures degrade gracefully to the online `<link>`.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { googleFontsCss2Url, googleFontsReferencedIn } from "@adt/types"

// A modern desktop-browser UA so Google serves woff2 (older/empty UAs get ttf).
const WOFF2_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const DEFAULT_CACHE_DIR = path.join(os.tmpdir(), "adt-google-fonts-cache")

type FetchText = (url: string) => Promise<string>
type FetchBytes = (url: string) => Promise<Buffer>

export interface BuildGoogleFontFaceOptions {
  /** Where to cache fetched woff2 files (keyed by URL). Defaults to a dir in
   *  the OS temp folder, so repeated packaging is fast and works offline once
   *  warm. */
  cacheDir?: string
  /** Injectable fetchers (tests). Default to global `fetch` with a browser UA. */
  fetchText?: FetchText
  fetchBytes?: FetchBytes
  excludeFamilies?: string[]
}

/** Every `https://….woff2` URL referenced by `url(...)` in a css2 response. */
export function extractWoff2Urls(css: string): string[] {
  const urls = new Set<string>()
  const re = /url\((https:\/\/[^)'"]+\.woff2)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) urls.add(m[1])
  return [...urls]
}

/** Rewrite each `url(https://….woff2)` to a local `./fonts/<file>` path using
 *  the provided URL→filename map. URLs absent from the map are left untouched
 *  (they keep working online via the page's Google CDN `<link>`). */
export function linkWoff2Urls(css: string, fileByUrl: Map<string, string>): string {
  return css.replace(/url\((https:\/\/[^)'"]+\.woff2)\)/g, (full, url: string) => {
    const file = fileByUrl.get(url)
    return file ? `url('./fonts/${file}')` : full
  })
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

function cachePathFor(url: string, cacheDir: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 32)
  return path.join(cacheDir, `${hash}.woff2`)
}

async function fetchWoff2Bytes(url: string, cacheDir: string, fetchBytes: FetchBytes): Promise<Buffer> {
  const cp = cachePathFor(url, cacheDir)
  try {
    if (fs.existsSync(cp)) return fs.readFileSync(cp)
  } catch {
    // fall through to fetch
  }
  const bytes = await fetchBytes(url)
  try {
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(cp, bytes)
  } catch {
    // cache is best-effort
  }
  return bytes
}

/** Stable local filename for a Google woff2 URL (deterministic across runs). */
export function woff2FileName(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)
  return `gf-${hash}.woff2`
}

/**
 * Fetch `@font-face` CSS for the given Google families, write each woff2 into
 * `outFontsDir`, and rewrite every woff2 URL to a local `./fonts/<file>` path
 * (so it works under `file://`). Returns "" — and logs a warning — on any
 * failure, so callers keep the online `<link>`.
 */
export async function buildLinkedGoogleFontFaceCss(
  families: string[],
  outFontsDir: string,
  opts: BuildGoogleFontFaceOptions = {},
): Promise<string> {
  const url = googleFontsCss2Url(families)
  if (!url) return ""
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE_DIR
  const fetchText = opts.fetchText ?? defaultFetchText
  const fetchBytes = opts.fetchBytes ?? defaultFetchBytes
  try {
    const css = await fetchText(url)
    const urls = extractWoff2Urls(css)
    const bytesByUrl = new Map<string, Buffer>()
    // allSettled (not Promise.all): a single woff2 failure must NOT discard the
    // fonts that fetched fine — link what succeeded, leave any failed URL
    // remote (its @font-face still works online), and warn.
    const results = await Promise.allSettled(
      urls.map(async (u): Promise<[string, Buffer]> => [u, await fetchWoff2Bytes(u, cacheDir, fetchBytes)]),
    )
    let failed = 0
    for (const r of results) {
      if (r.status === "fulfilled") bytesByUrl.set(r.value[0], r.value[1])
      else failed++
    }
    // Nothing fetched → behave like a total failure (rely on the online <link>)
    // rather than appending all-remote @font-face rules.
    if (bytesByUrl.size === 0) return ""
    fs.mkdirSync(outFontsDir, { recursive: true })
    const fileByUrl = new Map<string, string>()
    for (const [u, bytes] of bytesByUrl) {
      const file = woff2FileName(u)
      fs.writeFileSync(path.join(outFontsDir, file), bytes)
      fileByUrl.set(u, file)
    }
    if (failed > 0) {
      console.warn(
        `[google-fonts] ${failed}/${urls.length} woff2 fetch(es) failed; those stay online-only`,
      )
    }
    return linkWoff2Urls(css, fileByUrl)
  } catch (err) {
    console.warn(
      `[google-fonts] offline bundling skipped (using online <link> fallback): ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return ""
  }
}

/**
 * Detect the Google families used across a packaged book's page HTML, download
 * their woff2 into `assets/fonts/`, and append linked `@font-face` rules to
 * `assets/fonts.css`. Returns the families bundled (empty when none are used or
 * the fetch failed).
 *
 * Must run after page HTML is written and `assets/fonts.css` exists.
 */
export async function bundleGoogleFontsIntoCss(
  adtDir: string,
  opts: BuildGoogleFontFaceOptions = {},
): Promise<string[]> {
  const cssPath = path.join(adtDir, "assets", "fonts.css")
  if (!fs.existsSync(cssPath)) return []

  const excluded = new Set(opts.excludeFamilies ?? [])
  const families = new Set<string>()
  for (const name of fs.readdirSync(adtDir)) {
    if (!name.endsWith(".html")) continue
    const html = fs.readFileSync(path.join(adtDir, name), "utf-8")
    for (const fam of googleFontsReferencedIn(html)) {
      if (!excluded.has(fam)) families.add(fam)
    }
  }
  if (families.size === 0) return []

  const outFontsDir = path.join(adtDir, "assets", "fonts")
  const faceCss = await buildLinkedGoogleFontFaceCss([...families], outFontsDir, opts)
  if (!faceCss) return []

  const existing = fs.readFileSync(cssPath, "utf-8")
  fs.writeFileSync(
    cssPath,
    `${existing}\n\n/* Google Fonts — linked woff2 for offline / file:// use */\n${faceCss}\n`,
  )
  return [...families]
}
