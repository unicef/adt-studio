import { strToU8, unzipSync } from "fflate"

import { ADT_BUNDLE_READER_LIMITS } from "./adt-bundle-reader.js"

const MAX_UNCOMPRESSED_ARCHIVE_BYTES = 512 * 1024 * 1024
const MAX_OFFLINE_PRELOADER_BYTES = 64 * 1024 * 1024
const MAX_OFFLINE_CACHE_SOURCE_BYTES = 128 * 1024 * 1024

export class AdtBundleEditorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdtBundleEditorError"
  }
}
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new AdtBundleEditorError("The bundle offline cache is not valid UTF-8")
  }
}

export function refreshOfflinePreloader(
  files: Record<string, Uint8Array>,
  root: string,
  outputLanguages: readonly string[],
): void {
  const preloaderPath = `${root}assets/offline-preloader.js`
  const preloaderBytes = files[preloaderPath]
  if (!preloaderBytes) return
  if (preloaderBytes.byteLength > MAX_OFFLINE_PRELOADER_BYTES) {
    throw new AdtBundleEditorError("The bundle offline cache exceeds its size limit")
  }

  const inline = Object.create(null) as Record<string, unknown>
  let sourceBytes = preloaderBytes.byteLength
  const readText = (relativePath: string, limit: number): string | null => {
    const bytes = files[`${root}${relativePath}`]
    if (!bytes) return null
    if (bytes.byteLength > limit) {
      throw new AdtBundleEditorError(`Bundle offline cache source exceeds its size limit: ${relativePath}`)
    }
    sourceBytes += bytes.byteLength
    if (sourceBytes > MAX_OFFLINE_CACHE_SOURCE_BYTES) {
      throw new AdtBundleEditorError("Bundle offline cache sources exceed their combined size limit")
    }
    return decode(bytes)
  }
  const readJson = (relativePath: string): unknown | null => {
    const text = readText(relativePath, ADT_BUNDLE_READER_LIMITS.jsonBytes)
    if (text === null) return null
    try {
      return JSON.parse(text)
    } catch {
      throw new AdtBundleEditorError(`The edited bundle contains invalid JSON: ${relativePath}`)
    }
  }

  for (const relativePath of [
    "assets/config.json",
    "content/pages.json",
    "content/toc.json",
  ]) {
    const data = readJson(relativePath)
    if (data !== null) inline[`./${relativePath}`] = data
  }

  const navigation = readText("content/navigation/nav.html", ADT_BUNDLE_READER_LIMITS.htmlBytes)
  if (navigation !== null) inline["./content/navigation/nav.html"] = navigation

  for (const filePath of Object.keys(files).sort()) {
    if (!filePath.startsWith(root)) continue
    const relativePath = filePath.slice(root.length)
    if (relativePath.includes("/") || !relativePath.endsWith(".html")) continue
    const text = readText(relativePath, ADT_BUNDLE_READER_LIMITS.htmlBytes)
    if (text !== null) inline[`./${relativePath}`] = text
  }

  for (const language of outputLanguages) {
    const interfacePath = `assets/interface_translations/${language}/interface_translations.json`
    const interfaceData = readJson(interfacePath)
    if (interfaceData !== null) inline[`./${interfacePath}`] = interfaceData
    for (const fileName of [
      "texts.json",
      "audios.json",
      "videos.json",
      "images.json",
      "glossary.json",
      "timecode/timecode_output.json",
    ]) {
      const relativePath = `content/i18n/${language}/${fileName}`
      const data = readJson(relativePath)
      if (data !== null) inline[`./${relativePath}`] = data
    }
  }

  const source = decode(preloaderBytes)
  const marker = "  var INLINE = "
  const start = source.indexOf(marker)
  const end = start < 0 ? -1 : source.indexOf(";\n  var BASE_DIR", start + marker.length)
  if (start < 0 || end < 0) {
    throw new AdtBundleEditorError("The bundle offline cache has an unsupported format")
  }
  const refreshed = strToU8(
    `${source.slice(0, start + marker.length)}${JSON.stringify(inline)}${source.slice(end)}`,
  )
  if (refreshed.byteLength > MAX_OFFLINE_PRELOADER_BYTES) {
    throw new AdtBundleEditorError("The edited bundle offline cache exceeds its size limit")
  }
  files[preloaderPath] = refreshed
}

export function extractAdtBundleArchiveFiles(zipBuffer: Buffer): Record<string, Uint8Array> {
  if (zipBuffer.byteLength > ADT_BUNDLE_READER_LIMITS.archiveBytes) {
    throw new AdtBundleEditorError("ADT bundle exceeds the compressed archive size limit")
  }
  let totalBytes = 0
  try {
    return unzipSync(zipBuffer, {
      filter(info) {
        if (!Number.isSafeInteger(info.originalSize) || info.originalSize < 0) {
          throw new AdtBundleEditorError("ADT bundle contains an invalid archive entry")
        }
        totalBytes += info.originalSize
        if (totalBytes > MAX_UNCOMPRESSED_ARCHIVE_BYTES) {
          throw new AdtBundleEditorError("ADT bundle exceeds the expanded archive size limit")
        }
        return true
      },
    })
  } catch (error) {
    if (error instanceof AdtBundleEditorError) throw error
    throw new AdtBundleEditorError("Invalid or unsupported ADT ZIP bundle")
  }
}
