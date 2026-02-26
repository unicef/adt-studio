import fs from "node:fs"
import path from "node:path"
import { zipSync } from "fflate"
import { parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import { packageAdtWeb, loadBookConfig, normalizeLocale } from "@adt/pipeline"

export interface ExportResult {
  zipBuffer: Uint8Array
  filename: string
}

export async function exportBook(
  label: string,
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
): Promise<ExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    if (!webAssetsDir || !fs.existsSync(webAssetsDir)) {
      throw new Error("Web assets directory not found")
    }

    // Always rebuild ADT package before export to ensure compiled assets are fresh
    const config = loadBookConfig(safeLabel, resolvedDir, configPath)
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as {
      title?: string | null
      language_code?: string | null
    } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")
    const outputLanguages = Array.from(
      new Set(
        (config.output_languages && config.output_languages.length > 0
          ? config.output_languages
          : [language]).map((code) => normalizeLocale(code))
      )
    )
    const title = metadata?.title ?? safeLabel

    await packageAdtWeb(storage, {
      bookDir,
      label: safeLabel,
      language,
      outputLanguages,
      title,
      webAssetsDir,
      applyBodyBackground: config.apply_body_background,
    })
  } finally {
    storage.close()
  }

  // Recursively collect all files in the book directory
  const zipFiles: Record<string, Uint8Array> = {}
  collectFiles(bookDir, "", zipFiles)

  const zipBuffer = zipSync(zipFiles)

  return {
    zipBuffer,
    filename: `${safeLabel}.zip`,
  }
}

function collectFiles(
  dir: string,
  prefix: string,
  out: Record<string, Uint8Array>
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      collectFiles(entryPath, zipPath, out)
    } else if (entry.isFile()) {
      out[zipPath] = new Uint8Array(fs.readFileSync(entryPath))
    }
  }
}
