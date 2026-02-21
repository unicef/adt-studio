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

  // Verify storyboard is accepted
  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    const acceptance = storage.getLatestNodeData("storyboard-acceptance", "book")
    if (!acceptance) {
      throw new Error("Storyboard must be accepted before export")
    }

    // Build ADT package if not already built and web assets are available
    const adtDir = path.join(bookDir, "adt")
    const pagesJson = path.join(adtDir, "content", "pages.json")
    if (!fs.existsSync(pagesJson) && webAssetsDir && fs.existsSync(webAssetsDir)) {
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
    }

    // Add index.html that redirects to the first page (only if adt/ exists)
    if (fs.existsSync(adtDir)) {
      ensureAdtIndexHtml(adtDir)
    }
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

/**
 * Create an index.html in the adt/ directory that redirects to the first page.
 */
function ensureAdtIndexHtml(adtDir: string): void {
  const indexPath = path.join(adtDir, "index.html")
  if (fs.existsSync(indexPath)) return

  const pagesJsonPath = path.join(adtDir, "content", "pages.json")
  if (!fs.existsSync(pagesJsonPath)) return

  let firstHref = "pg001.html"
  try {
    const pages = JSON.parse(fs.readFileSync(pagesJsonPath, "utf-8")) as Array<{ href?: string }>
    if (pages.length > 0 && pages[0].href) {
      firstHref = pages[0].href
    }
  } catch { /* use default */ }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0; url=./${firstHref}" />
  <title>Redirecting…</title>
</head>
<body>
  <p>Loading book… <a href="./${firstHref}">Click here</a> if not redirected.</p>
</body>
</html>
`
  fs.writeFileSync(indexPath, html)
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
