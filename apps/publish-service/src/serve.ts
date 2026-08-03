const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  vtt: "text/vtt",
  pdf: "application/pdf",
  wasm: "application/wasm",
  zip: "application/zip",
  epub: "application/epub+zip",
}

const DEFAULT_CONTENT_TYPE = "application/octet-stream"

/** Content-addressed filenames such as `main.9f3a71c2.js` or `logo-9f3a71c2.svg`. */
const HASHED_ASSET = /[.\-_][0-9a-f]{8,}\.[A-Za-z0-9]+$/

/** Extensions whose bytes are regenerated on every republish and are therefore served
 *  from the same URL with different content — they must revalidate. */
const REVALIDATE_EXTENSIONS = new Set([
  "html",
  "htm",
  "json",
  "xml",
  "js",
  "mjs",
  "css",
  "vtt",
  "txt",
  "md",
])

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"
export const NO_CACHE_CACHE_CONTROL = "no-cache"
export const MEDIA_CACHE_CONTROL = "public, max-age=3600"

export function extensionOf(pathname: string): string {
  const name = pathname.slice(pathname.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase()
}

export function contentTypeFor(pathname: string): string {
  return CONTENT_TYPES[extensionOf(pathname)] ?? DEFAULT_CONTENT_TYPE
}

export function cacheControlFor(pathname: string): string {
  const extension = extensionOf(pathname)
  if (extension === "html" || extension === "htm") return NO_CACHE_CACHE_CONTROL
  if (HASHED_ASSET.test(pathname)) return IMMUTABLE_CACHE_CONTROL
  if (REVALIDATE_EXTENSIONS.has(extension)) return NO_CACHE_CACHE_CONTROL
  return MEDIA_CACHE_CONTROL
}

export function isHtmlRequest(pathname: string): boolean {
  const extension = extensionOf(pathname)
  return extension === "" || extension === "html" || extension === "htm"
}

/** Splits `/p/<token>/some/path` into the snapshot-relative path, defaulting bare and
 *  directory-style requests to `index.html`. */
export function snapshotPathFromUrl(requestUrl: string, token: string): string {
  const { pathname } = new URL(requestUrl)
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return ""
  }

  const prefix = `/p/${token}`
  if (!decoded.startsWith(prefix)) return ""

  let rest = decoded.slice(prefix.length)
  if (rest.startsWith("/")) rest = rest.slice(1)
  if (rest.length === 0 || rest.endsWith("/")) return `${rest}index.html`
  return rest
}
