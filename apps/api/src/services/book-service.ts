import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"
import { parseBookLabel, BookLabel, BookMetadata } from "@adt/types"
import { openBookDb } from "@adt/storage"

export interface BookSummary {
  label: string
  title: string | null
  authors: string[]
  pageCount: number
  hasSourcePdf: boolean
}

export interface BookDetail extends BookSummary {
  metadata: BookMetadata | null
}

export function listBooks(booksDir: string): BookSummary[] {
  const resolvedDir = path.resolve(booksDir)
  if (!fs.existsSync(resolvedDir)) return []

  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true })
  const books: BookSummary[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!BookLabel.safeParse(entry.name).success) continue

    const label = entry.name
    const bookDir = path.join(resolvedDir, label)
    const dbPath = path.join(bookDir, `${label}.db`)
    const pdfPath = path.join(bookDir, `${label}.pdf`)

    let title: string | null = null
    let authors: string[] = []
    let pageCount = 0

    if (fs.existsSync(dbPath)) {
      const db = openBookDb(dbPath)
      try {
        const pages = db.all("SELECT COUNT(*) as count FROM pages") as Array<{
          count: number
        }>
        pageCount = pages[0]?.count ?? 0

        const metaRows = db.all(
          "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
          ["metadata", "book"]
        ) as Array<{ data: string }>

        if (metaRows.length > 0) {
          const parsed = BookMetadata.safeParse(JSON.parse(metaRows[0].data))
          if (parsed.success) {
            title = parsed.data.title
            authors = parsed.data.authors
          }
        }
      } finally {
        db.close()
      }
    }

    books.push({
      label,
      title,
      authors,
      pageCount,
      hasSourcePdf: fs.existsSync(pdfPath),
    })
  }

  books.sort((a, b) => a.label.localeCompare(b.label))
  return books
}

export function getBook(label: string, booksDir: string): BookDetail {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  const dbPath = path.join(bookDir, `${safeLabel}.db`)
  const pdfPath = path.join(bookDir, `${safeLabel}.pdf`)

  let title: string | null = null
  let authors: string[] = []
  let pageCount = 0
  let metadata: BookMetadata | null = null

  if (fs.existsSync(dbPath)) {
    const db = openBookDb(dbPath)
    try {
      const pages = db.all("SELECT COUNT(*) as count FROM pages") as Array<{
        count: number
      }>
      pageCount = pages[0]?.count ?? 0

      const metaRows = db.all(
        "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        ["metadata", "book"]
      ) as Array<{ data: string }>

      if (metaRows.length > 0) {
        const parsed = BookMetadata.safeParse(JSON.parse(metaRows[0].data))
        if (parsed.success) {
          metadata = parsed.data
          title = parsed.data.title
          authors = parsed.data.authors
        }
      }
    } finally {
      db.close()
    }
  }

  return {
    label: safeLabel,
    title,
    authors,
    pageCount,
    hasSourcePdf: fs.existsSync(pdfPath),
    metadata,
  }
}

export function createBook(
  label: string,
  pdfBuffer: Buffer,
  booksDir: string,
  configOverrides?: Record<string, unknown>
): BookSummary {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (fs.existsSync(bookDir)) {
    throw new Error(`Book already exists: ${safeLabel}`)
  }

  fs.mkdirSync(bookDir, { recursive: true })
  fs.writeFileSync(path.join(bookDir, `${safeLabel}.pdf`), pdfBuffer)

  if (configOverrides && Object.keys(configOverrides).length > 0) {
    fs.writeFileSync(
      path.join(bookDir, "config.yaml"),
      yaml.dump(configOverrides)
    )
  }

  return {
    label: safeLabel,
    title: null,
    authors: [],
    pageCount: 0,
    hasSourcePdf: true,
  }
}

export function deleteBook(label: string, booksDir: string): void {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!bookDir.startsWith(resolvedDir + path.sep)) {
    throw new Error("Invalid book path")
  }

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  fs.rmSync(bookDir, { recursive: true, force: true })
}
