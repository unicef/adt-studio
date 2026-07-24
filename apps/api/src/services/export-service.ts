import fs from "node:fs"
import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import { packageAdtWeb, packageWebpub, packageEpub, loadBookConfig, normalizeLocale, isFixedLayoutBook } from "@adt/pipeline"
import { createZipStream } from "./zip-util.js"
import { readPartInfo } from "./book-service.js"

export interface ExportResult {
  stream: ReadableStream<Uint8Array>
  filename: string
  safeFilename: string
}

function throwBookNotFound(label: string): never {
  throw new HTTPException(404, { message: `Book not found: ${label}` })
}

function throwWebAssetsMissing(): never {
  throw new HTTPException(500, { message: "Web assets directory not found" })
}

function throwAdtDirMissing(): never {
  throw new HTTPException(400, { message: "ADT directory not found — run the pipeline first" })
}

/**
 * Read book title from metadata for use in export filenames.
 * Falls back to the safe label if metadata is not available.
 */
function readBookTitle(label: string, resolvedDir: string): string {
  const storage = createBookStorage(label, resolvedDir)
  try {
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { title?: string | null } | null
    return metadata?.title ?? label
  } finally {
    storage.close()
  }
}

export interface ExportFeatures {
  glossary?: boolean
  readAloud?: boolean
  quizzes?: boolean
  signLanguage?: boolean
  languages?: string[]
}

export interface ExportDefaultSettings {
  dockLayout?: {
    width?: "compact" | "full"
    position?: "top" | "bottom"
    align?: "center" | "spread"
  }
  theme?: "light" | "dark" | "system"
  iconSize?: "sm" | "md" | "lg"
  reduceMotion?: boolean
}

/**
 * Prepare export by rebuilding the adt/ (and optionally webpub/) directories.
 * Called as a separate step before the actual download so the client can show
 * a spinner during the rebuild.
 */
export async function prepareExport(
  label: string,
  format: "project" | "webpub" | "scorm" | "adt" | "epub",
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
  features?: ExportFeatures,
  defaultSettingsOverride?: ExportDefaultSettings,
): Promise<void> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throwBookNotFound(safeLabel)
  }
  if (!webAssetsDir || !fs.existsSync(webAssetsDir)) {
    throwWebAssetsMissing()
  }

  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    const config = loadBookConfig(safeLabel, resolvedDir, configPath)
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as {
      title?: string | null
      language_code?: string | null
    } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")
    const outputLanguages = Array.from(
      new Set(
        [language, ...(config.output_languages ?? [])].map((code) => normalizeLocale(code))
      )
    )
    const title = metadata?.title ?? safeLabel

    const normalizedRequested = features?.languages?.map(normalizeLocale) ?? []
    const finalLanguages = normalizedRequested.length > 0
      ? normalizedRequested.filter((lang) => outputLanguages.includes(lang))
      : outputLanguages

    const yamlDefaultSettings = config.default_settings
      ? {
          ...(config.default_settings.dock_layout
            ? { dockLayout: config.default_settings.dock_layout }
            : {}),
          ...(config.default_settings.theme !== undefined
            ? { theme: config.default_settings.theme }
            : {}),
          ...(config.default_settings.icon_size !== undefined
            ? { iconSize: config.default_settings.icon_size }
            : {}),
          ...(config.default_settings.reduce_motion !== undefined
            ? { reduceMotion: config.default_settings.reduce_motion }
            : {}),
        }
      : undefined

    // Preview-captured values (from request body) override YAML per top-level
    // key. dockLayout merges one level deep — fields the override didn't touch
    // fall back to YAML.
    const mergedDefaultSettings = (() => {
      if (!yamlDefaultSettings && !defaultSettingsOverride) return undefined
      const yaml = yamlDefaultSettings ?? {}
      const override = defaultSettingsOverride ?? {}
      return {
        ...yaml,
        ...override,
        ...(yaml.dockLayout || override.dockLayout
          ? { dockLayout: { ...yaml.dockLayout, ...override.dockLayout } }
          : {}),
      }
    })()

    const opts = {
      bookDir,
      label: safeLabel,
      language,
      outputLanguages: finalLanguages.length > 0 ? finalLanguages : outputLanguages,
      title,
      webAssetsDir,
      applyBodyBackground: config.apply_body_background,
      speechConfig: config.speech,
      features,
      defaultSettings: mergedDefaultSettings,
      lockedSettings: config.locked_settings,
      fixedLayout: isFixedLayoutBook(config),
      reflowableFont: config.reflowable_font,
      quizMatchBookStyle: config.quiz_generation?.match_book_style ?? true,
    }

    await packageAdtWeb(storage, opts)

    if (format === "webpub") {
      packageWebpub(storage, opts)
    } else if (format === "epub") {
      packageEpub(storage, opts)
    }
  } finally {
    storage.close()
  }
}

export async function exportProject(
  label: string,
  booksDir: string,
): Promise<ExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throwBookNotFound(safeLabel)
  }

  const title = readBookTitle(safeLabel, resolvedDir)

  // When this book is an imported page-range part, name the returned archive
  // with the same part convention as the coordinator's handout (exportPart),
  // plus a "-processed" marker — so the coordinator can tell, from the filename
  // alone, that it's a finished part of a known book/range ready to merge.
  // The merge identifies a part from part.json *inside* the zip, never the
  // filename, so this is purely cosmetic.
  const part = readPartInfo(bookDir)
  if (part) {
    const { startPage, endPage } = part.range
    const pad3 = (n: number) => String(n).padStart(3, "0")
    return {
      stream: createZipStream(bookDir, { excludeDirs: new Set(["adt", "webpub"]) }),
      filename: `${title}-part-${startPage}-${endPage}-processed.zip`,
      safeFilename: `${part.sourceLabel}-p${pad3(startPage)}-${pad3(endPage)}-processed.zip`,
    }
  }

  return {
    stream: createZipStream(bookDir, { excludeDirs: new Set(["adt", "webpub"]) }),
    filename: `${title}-project.zip`,
    safeFilename: `${safeLabel}-project.zip`,
  }
}

export async function exportWebpub(
  label: string,
  booksDir: string,
): Promise<ExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throwBookNotFound(safeLabel)
  }

  const title = readBookTitle(safeLabel, resolvedDir)
  const webpubDir = path.join(bookDir, "webpub")

  return {
    stream: createZipStream(webpubDir),
    filename: `${title}.webpub`,
    safeFilename: `${safeLabel}.webpub`,
  }
}

export async function exportScorm(
  label: string,
  booksDir: string,
): Promise<ExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throwBookNotFound(safeLabel)
  }

  const title = readBookTitle(safeLabel, resolvedDir)
  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throwAdtDirMissing()
  }

  return {
    stream: createZipStream(adtDir),
    filename: `${title}-scorm.zip`,
    safeFilename: `${safeLabel}-scorm.zip`,
  }
}

export async function exportAdt(
  label: string,
  booksDir: string,
): Promise<ExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throwBookNotFound(safeLabel)
  }

  const title = readBookTitle(safeLabel, resolvedDir)
  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throwAdtDirMissing()
  }

  return {
    stream: createZipStream(adtDir),
    filename: `${title}-adt.zip`,
    safeFilename: `${safeLabel}-adt.zip`,
  }
}

export interface EpubExportResult {
  stream: ReadableStream<Uint8Array>
  filename: string
  safeFilename: string
}

export async function exportEpub(
  label: string,
  booksDir: string,
): Promise<EpubExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  let title = safeLabel
  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { title?: string | null } | null
    title = metadata?.title ?? safeLabel
  } finally {
    storage.close()
  }

  const epubDir = path.join(bookDir, "epub")
  if (!fs.existsSync(epubDir)) {
    throw new Error("EPUB directory not found — run prepare-export first")
  }

  return {
    stream: createZipStream(epubDir),
    filename: `${title}.epub`,
    safeFilename: `${safeLabel}.epub`,
  }
}
