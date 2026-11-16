import { normalizeLocale } from "@adt/pipeline"
import type { AdtImportUnreadableDetails } from "@adt/types"

import { extractAdtBundleArchiveFiles } from "./bundle-reader.js"
import { recoveredPageCount } from "./catalog.js"
import { previewCoverDataUri } from "./preview-cover.js"

const MANIFEST_PATH = /^(?:[^/]+\/)?manifest\.json$/
const COVER_PATH = /^(?:[^/]+\/)?cover\.(?:png|jpe?g|webp)$/i
const IMAGE_PATH = /^images\/[^/]+\.(?:gif|jpe?g|png|svg|webp)$/i

const decoder = new TextDecoder("utf-8")

function looseJson(bytes: Uint8Array | undefined): unknown {
  if (!bytes) return null
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown
  } catch {
    return null
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function coverMimeType(filePath: string): string {
  if (/\.webp$/i.test(filePath)) return "image/webp"
  if (/\.jpe?g$/i.test(filePath)) return "image/jpeg"
  return "image/png"
}

/**
 * What can still be shown about an ADT export the strict reader rejected: the
 * title, cover and a few counts, read leniently so one broken field does not
 * hide the rest. Each part that cannot be read is null. Display only — the
 * import keeps using the strict reader and still refuses the archive.
 * Returns null when the ZIP itself cannot be opened.
 */
export function readUnreadableAdtDetails(zipBuffer: Buffer): AdtImportUnreadableDetails | null {
  let files: Record<string, Uint8Array>
  try {
    files = extractAdtBundleArchiveFiles(zipBuffer)
  } catch {
    return null
  }
  const manifestPath = Object.keys(files).find((path) => MANIFEST_PATH.test(path))
  const root = manifestPath ? manifestPath.slice(0, -"manifest.json".length) : ""
  const manifest = record(looseJson(manifestPath ? files[manifestPath] : undefined))
  const book = record(manifest?.book)
  const languages = record(manifest?.languages)
  const config = record(looseJson(files[`${root}assets/config.json`]))
  const indexHtml = files[`${root}index.html`]
  const htmlTitle = indexHtml
    ? decoder.decode(indexHtml).match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null
    : null

  const pagesJson = looseJson(files[`${root}content/pages.json`])
  const pages = Array.isArray(pagesJson)
    ? pagesJson.flatMap((page) => {
        const entry = record(page)
        const sectionId = text(entry?.section_id)
        const href = text(entry?.href)
        return sectionId && href ? [{ section_id: sectionId, href }] : []
      })
    : null
  const toc = looseJson(files[`${root}content/toc.json`])

  const coverPath = Object.keys(files)
    .filter((path) => path.startsWith(root) && COVER_PATH.test(path))
    .sort()[0]
  const imageCount = Object.keys(files)
    .filter((path) => path.startsWith(root) && IMAGE_PATH.test(path.slice(root.length)))
    .length

  const source = text(languages?.source)
  const sourceLanguage = source ? normalizeLocale(source) : null
  // Same rule as the full preview: translations only, without the source.
  const output = Array.isArray(languages?.output)
    ? [...new Set(languages.output.flatMap((language) => {
        const value = text(language)
        return value ? [normalizeLocale(value)] : []
      }))].filter((language) => language !== sourceLanguage)
    : null

  return {
    title: text(book?.title) ?? text(config?.title) ?? text(htmlTitle),
    coverBase64: coverPath ? previewCoverDataUri({ bytes: files[coverPath], mimeType: coverMimeType(coverPath) }) : null,
    pageCount: pages && pages.length > 0 ? recoveredPageCount(pages) : null,
    imageCount: imageCount > 0 ? imageCount : null,
    tocEntryCount: Array.isArray(toc) ? toc.length : null,
    sourceLanguage,
    outputLanguages: output,
  }
}
