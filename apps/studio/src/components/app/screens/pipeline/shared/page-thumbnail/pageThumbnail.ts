import { getPageThumbnailUrl } from "@/api/client"

const BUCKET = 100
const MIN_WIDTH = 100
const MAX_WIDTH = 1600

export const PAGE_VIEW_THUMBNAIL_WIDTH = 1200
export const PAGE_PREVIEW_LOW_WIDTH = 300

export function thumbnailWidth(pixels: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(pixels / BUCKET) * BUCKET))
}

export function pageThumbnailSources(label: string, pageId: string, cssWidth: number): { src: string; srcSet: string } {
  const one = thumbnailWidth(cssWidth)
  const two = thumbnailWidth(cssWidth * 2)
  const src = getPageThumbnailUrl(label, pageId, one)
  return { src, srcSet: two === one ? src : `${src} 1x, ${getPageThumbnailUrl(label, pageId, two)} 2x` }
}

export function pageViewThumbnailUrl(label: string, pageId: string): string {
  return getPageThumbnailUrl(label, pageId, PAGE_VIEW_THUMBNAIL_WIDTH)
}

const loaded = new Map<string, { url: string; width: number }>()

function widthOf(url: string): number {
  return Number(new URL(url, window.location.href).searchParams.get("width")) || 0
}

export function rememberLoadedThumbnail(label: string, pageId: string, url: string): void {
  if (!url) return
  const key = `${label}/${pageId}`
  const width = widthOf(url)
  const previous = loaded.get(key)
  if (!previous || width >= previous.width) loaded.set(key, { url, width })
}

export function loadedThumbnail(label: string, pageId: string): string | null {
  return loaded.get(`${label}/${pageId}`)?.url ?? null
}

export function lowResThumbnail(label: string, pageId: string): string {
  return loadedThumbnail(label, pageId) ?? getPageThumbnailUrl(label, pageId, PAGE_PREVIEW_LOW_WIDTH)
}

export function preloadPageThumbnail(label: string, pageId: string, width = PAGE_VIEW_THUMBNAIL_WIDTH): void {
  const url = getPageThumbnailUrl(label, pageId, width)
  const image = new Image()
  image.decoding = "async"
  image.onload = () => rememberLoadedThumbnail(label, pageId, url)
  image.src = url
}
