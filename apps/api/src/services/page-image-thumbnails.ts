import crypto from "node:crypto"
import fs from "node:fs"
import { renderImageThumbnailJpeg } from "@adt/pdf"

const DEFAULT_LIMITS = { maxCacheBytes: 32 * 1024 * 1024, idleClearMs: 10 * 60_000 }

let limits = { ...DEFAULT_LIMITS }

const thumbnails = new Map<string, Buffer>()
let cachedBytes = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null

function touchIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(clearPageImageThumbnails, limits.idleClearMs)
  idleTimer.unref?.()
}

function readCached(key: string): Buffer | undefined {
  const jpeg = thumbnails.get(key)
  if (!jpeg) return undefined
  thumbnails.delete(key)
  thumbnails.set(key, jpeg)
  return jpeg
}

function storeCached(key: string, jpeg: Buffer): void {
  if (jpeg.byteLength > limits.maxCacheBytes) return
  thumbnails.set(key, jpeg)
  cachedBytes += jpeg.byteLength
  while (cachedBytes > limits.maxCacheBytes) {
    const [oldest, evicted] = thumbnails.entries().next().value as [string, Buffer]
    thumbnails.delete(oldest)
    cachedBytes -= evicted.byteLength
  }
}

export interface PageImageThumbnailTag {
  etag: string
}

export function pageImageThumbnailTag(imagePath: string, hash: string, width: number): PageImageThumbnailTag {
  const { mtimeMs, size } = fs.statSync(imagePath)
  const version = crypto
    .createHash("sha1")
    .update(`${imagePath}|${hash}|${Math.round(mtimeMs)}|${size}`)
    .digest("base64url")
    .slice(0, 16)
  return { etag: `"${version}-${width}"` }
}

export interface PageImageThumbnail {
  jpeg: Buffer
  etag: string
}

export function renderPageImageThumbnail(
  imagePath: string,
  width: number,
  tag: PageImageThumbnailTag,
): PageImageThumbnail {
  touchIdleTimer()
  const key = `${imagePath}|${tag.etag}`
  const cached = readCached(key)
  if (cached) return { jpeg: cached, etag: tag.etag }
  const { jpeg } = renderImageThumbnailJpeg(fs.readFileSync(imagePath), width)
  storeCached(key, jpeg)
  return { jpeg, etag: tag.etag }
}

export function clearPageImageThumbnails(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  thumbnails.clear()
  cachedBytes = 0
}

export function configurePageImageThumbnails(next: Partial<typeof DEFAULT_LIMITS> | null): void {
  limits = { ...DEFAULT_LIMITS, ...next }
}

export interface PageImageThumbnailStats {
  cachedBytes: number
  cachedKeys: string[]
}

export function pageImageThumbnailStats(): PageImageThumbnailStats {
  return { cachedBytes, cachedKeys: [...thumbnails.keys()] }
}
