import fs from "node:fs"
import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import type { PackagingWarning } from "@adt/types"
import { createBookStorage, withBookWriter, recoverSectioningTransition, resolveBookPaths } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { readRetainedPackageOwnership } from "./retained-package-reader.js"
import { publishedAdtDirectory, requiredPartRange, resolveReadingOrder, SectioningSafetyError, assertPackageFilesAvailable, packageFilesAvailable, packageAdtWeb, packageWebpub, packageEpub, packagePnld, loadBookConfig, normalizeLocale, isFixedLayoutBook } from "@adt/pipeline"
import { createZipStream, type ZipStreamOptions } from "./zip-util.js"
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
export function readBookTitle(label: string, resolvedDir: string): string {
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

/** What the rebuild had to leave out of the exported bundle. */
export interface PrepareExportResult {
  warnings: PackagingWarning[]
}

/**
 * Prepare export by rebuilding the adt/ (and optionally webpub/) directories.
 * Called as a separate step before the actual download so the client can show
 * a spinner during the rebuild.
 */
export async function prepareExport(
  label: string,
  format: "project" | "webpub" | "scorm" | "adt" | "epub" | "pnld",
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
  features?: ExportFeatures,
  defaultSettingsOverride?: ExportDefaultSettings,
  promptsDir = path.resolve("prompts"),
): Promise<PrepareExportResult> {
  const { bookDir } = resolveBookPaths(label, booksDir)
  if (!fs.existsSync(bookDir)) throwBookNotFound(label)
  // A project archive preserves source data and excludes generated bundles.
  // It must remain available even when regeneration is safely blocked.
  if (format === "project") return { warnings: [] }
  return withBookWriter(bookDir, () => {
    return prepareAdmittedExport(label, format, booksDir, webAssetsDir, configPath, features, defaultSettingsOverride, promptsDir)
  })
}

async function prepareAdmittedExport(
  label: string,
  format: "project" | "webpub" | "scorm" | "adt" | "epub" | "pnld",
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
  features?: ExportFeatures,
  defaultSettingsOverride?: ExportDefaultSettings,
  promptsDir = path.resolve("prompts"),
): Promise<PrepareExportResult> {
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
      promptsDir, configDir: configPath ? path.join(path.dirname(configPath), "config") : path.resolve("config"),
      bookDir,
      label: safeLabel,
      language,
      outputLanguages: finalLanguages.length > 0 ? finalLanguages : outputLanguages,
      title,
      webAssetsDir,
      applyBodyBackground: config.apply_body_background,
      config,
      speechConfig: config.speech,
      features,
      defaultSettings: mergedDefaultSettings,
      lockedSettings: config.locked_settings,
      fixedLayout: isFixedLayoutBook(config),
      reflowableFont: config.reflowable_font,
      quizMatchBookStyle: config.quiz_generation?.match_book_style ?? true,
      // EPUB glossary implementation (word-level spec / in-flow pages / both).
      epubGlossary: config.epub_glossary,
    }

    const { warnings } = await packageAdtWeb(storage, opts)
    if (format === "adt" || format === "scorm") warmDownloadProofs(storage, bookDir, format === "scorm" ? "scorm" : "web")

    if (format === "webpub") {
      packageWebpub(storage, opts)
    } else if (format === "epub") {
      packageEpub(storage, opts)
    } else if (format === "pnld") {
      packagePnld(storage, opts)
    }

    return { warnings }
  } finally {
    storage.close()
  }
}

/** The build just staged and verified this bundle. Record the download's
 * ownership and required-file proofs for this process now, while the user is
 * already waiting on the build, so the download that follows starts warm.
 * Warming only: the download still checks both and refuses on failure. */
function warmDownloadProofs(storage: Storage, bookDir: string, format: "scorm" | "web") {
  const directory = publishedAdtDirectory(bookDir)
  try {
    readRetainedPackageOwnership(storage, path.join(bookDir, `${path.basename(bookDir)}.db`), directory)
    packageFilesAvailable(directory, { format })
  } catch { /* The download re-checks and reports any refusal. */ }
}

/** Keep YAML, lifecycle and SQLite from different transitions out of one ZIP.
 * The existing ZIP producer yields while reading larger books, so admission
 * must last until it has finished reading, not merely until it returns a stream. */
function createProjectZipStream(bookDir: string) {
  return createAdmittedZipStream(bookDir, bookDir, {
    excludeDirs: new Set(["adt", "webpub", ".adt-package-work"]),
    excludeFiles: new Set([".book-writer.json", ".book-writer.json.recovery"]),
  })
}

function createAdmittedZipStream(bookDir: string, directory: string, options?: ZipStreamOptions): ReadableStream<Uint8Array> {
  let cancelled = false
  return new ReadableStream({
    start(controller) {
      return withBookWriter(bookDir, async () => {
        recoverSectioningTransition(bookDir)
        const reader = createZipStream(directory, options).getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) { if (!cancelled) controller.close(); break }
            if (!cancelled) {
              // A cancelled consumer must not release admission while the
              // eager ZIP producer is still reading later source files.
              try { controller.enqueue(value) } catch { cancelled = true }
            }
          }
        } finally { reader.releaseLock() }
      })
    },
    cancel() { cancelled = true },
  })
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
      stream: createProjectZipStream(bookDir),
      filename: `${title}-part-${startPage}-${endPage}-processed.zip`,
      safeFilename: `${part.sourceLabel}-p${pad3(startPage)}-${pad3(endPage)}-processed.zip`,
    }
  }

  return {
    stream: createProjectZipStream(bookDir),
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
    stream: readableDerivedPackageZip(bookDir, webpubDir),
    filename: `${title}.webpub`,
    safeFilename: `${safeLabel}.webpub`,
  }
}

/** Derived reader formats keep the source package's owner membership even
 * after relocating/rewriting HTML. An old export cannot broaden a saved part. */
function readableDerivedPackageZip(bookDir: string, directory: string, contentRoot = directory) {
  return withBookWriter(bookDir, () => {
    if (requiredPartRange(bookDir)) {
      const storage = createBookStorage(path.basename(bookDir), path.dirname(bookDir))
      try {
        const allowed = resolveReadingOrder(storage).positionById
        let entries: unknown
        try { entries = JSON.parse(fs.readFileSync(path.join(contentRoot, ".build-owners"), "utf8")).entries }
        catch { /* Unproven retained membership requires explicit preparation. */ }
        if (!Array.isArray(entries) || !entries.length || entries.some(row => !Array.isArray(row) || typeof row[0] !== "string" || !allowed.has(row[0]))) {
          throw new SectioningSafetyError("PACKAGE_FILES_INCOMPLETE", "Prepare the export again within the current part window.")
        }
      } finally { storage.close() }
    }
    return createAdmittedZipStream(bookDir, directory)
  })
}

function readablePackageZip(bookDir: string, directory: string, format: "scorm" | "web") {
  return withBookWriter(bookDir, () => {
    requiredPartRange(bookDir)
    const storage = createBookStorage(path.basename(bookDir), path.dirname(bookDir))
    try {
      // Older bundles can still name an owner rejected by today's resolver.
      // Downloads may be partial but cannot distribute retired or unowned pages.
      if (!readRetainedPackageOwnership(storage, path.join(bookDir, `${path.basename(bookDir)}.db`), directory).allOwned) {
        throw new SectioningSafetyError("PACKAGE_FILES_INCOMPLETE", "Prepare the export again from the current saved content.")
      }
      assertPackageFilesAvailable(directory, { format })
    } finally { storage.close() }
    // The ZIP producer may yield between files; keep shared admission until it finishes.
    return createAdmittedZipStream(bookDir, directory)
  })
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
  const adtDir = publishedAdtDirectory(bookDir)
  if (!fs.existsSync(adtDir)) {
    throwAdtDirMissing()
  }

  return {
    stream: readablePackageZip(bookDir, adtDir, "scorm"),
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
  const adtDir = publishedAdtDirectory(bookDir)
  if (!fs.existsSync(adtDir)) {
    throwAdtDirMissing()
  }

  return {
    stream: readablePackageZip(bookDir, adtDir, "web"),
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
    stream: readableDerivedPackageZip(bookDir, epubDir, path.join(epubDir, "OEBPS")),
    filename: `${title}.epub`,
    safeFilename: `${safeLabel}.epub`,
  }
}

export async function exportPnld(
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
  const pnldDir = path.join(bookDir, "pnld")
  if (!fs.existsSync(pnldDir)) {
    throw new HTTPException(400, { message: "PNLD directory not found — run prepare-export first" })
  }

  return {
    stream: readableDerivedPackageZip(bookDir, pnldDir),
    filename: `${title}.zip`,
    safeFilename: `${safeLabel}-pnld.zip`,
  }
}
