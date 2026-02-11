import fs from "node:fs"
import path from "node:path"
import { zipSync } from "fflate"
import { parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"

export interface ExportResult {
  zipBuffer: Uint8Array
  filename: string
}

export function exportBook(label: string, booksDir: string): ExportResult {
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
