import fs from "node:fs"
import path from "node:path"
import { Zip, ZipDeflate, ZipPassThrough } from "fflate"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import { packageAdtWeb, packageWebpub, packageEpub, loadBookConfig, normalizeLocale, isFixedLayoutBook } from "@adt/pipeline"

/** File extensions that are already compressed — skip deflation to save CPU */
const COMPRESSED_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif",
  ".mp3", ".mp4", ".ogg", ".wav", ".aac", ".m4a", ".opus", ".flac",
  ".zip", ".gz", ".br", ".zst",
  ".woff", ".woff2",
  ".pdf", ".db",
])

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
  enableFeedback?: boolean
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

  return {
    stream: createZipStream(bookDir, new Set(["adt", "webpub"])),
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

/**
 * Collect relative file paths under a directory (lightweight — no file content read).
 */
function collectFilePaths(dir: string, prefix = "", excludeDirs?: Set<string>): string[] {
  const result: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (excludeDirs && !prefix && excludeDirs.has(entry.name)) continue
      result.push(...collectFilePaths(path.join(dir, entry.name), zipPath, excludeDirs))
    } else if (entry.isFile()) {
      result.push(zipPath)
    }
  }
  return result
}

/**
 * Create a streaming ZIP of a directory. Files are read and compressed one at a
 * time so memory stays bounded regardless of total directory size.
 */
function createZipStream(sourceDir: string, excludeDirs?: Set<string>): ReadableStream<Uint8Array> {
  const filePaths = collectFilePaths(sourceDir, "", excludeDirs)

  return new ReadableStream({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return }
        if (chunk.length > 0) controller.enqueue(chunk)
        if (final) controller.close()
      })

      for (let i = 0; i < filePaths.length; i++) {
        const relPath = filePaths[i]
        const absPath = path.join(sourceDir, relPath)
        const data = new Uint8Array(fs.readFileSync(absPath))
        const ext = path.extname(relPath).toLowerCase()

        const file = COMPRESSED_EXTS.has(ext)
          ? new ZipPassThrough(relPath)
          : new ZipDeflate(relPath, { level: 6 })

        zip.add(file)
        file.push(data, true)

        // Yield to event loop every 50 files to avoid blocking
        if (i % 50 === 49) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
      zip.end()
    },
  })
}
