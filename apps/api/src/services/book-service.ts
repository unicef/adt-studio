import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"
import { parseBookLabel, BookLabel, BookMetadata, BookSummaryOutput } from "@adt/types"
import { openBookDb } from "@adt/storage"

export interface BookSummary {
  label: string
  title: string | null
  authors: string[]
  publisher: string | null
  languageCode: string | null
  pageCount: number
  hasSourcePdf: boolean
  needsRebuild: boolean
  rebuildReason: string | null
}

export interface BookDetail extends BookSummary {
  metadata: BookMetadata | null
  bookSummary: BookSummaryOutput | null
}

function isSchemaMismatchError(err: unknown): err is Error {
  return err instanceof Error && err.message.includes("Schema version mismatch")
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
    let publisher: string | null = null
    let languageCode: string | null = null
    let pageCount = 0
    let needsRebuild = false
    let rebuildReason: string | null = null

    if (fs.existsSync(dbPath)) {
      try {
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
              publisher = parsed.data.publisher
              languageCode = parsed.data.language_code
            }
          }

        } finally {
          db.close()
        }
      } catch (err) {
        if (isSchemaMismatchError(err)) {
          needsRebuild = true
          rebuildReason =
            "Book data uses an older storage schema and must be rebuilt."
        } else {
          throw err
        }
      }
    }

    books.push({
      label,
      title,
      authors,
      publisher,
      languageCode,
      pageCount,
      hasSourcePdf: fs.existsSync(pdfPath),
      needsRebuild,
      rebuildReason,
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
  let publisher: string | null = null
  let languageCode: string | null = null
  let pageCount = 0
  let metadata: BookMetadata | null = null
  let bookSummary: BookSummaryOutput | null = null
  let needsRebuild = false
  let rebuildReason: string | null = null

  if (fs.existsSync(dbPath)) {
    try {
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
            publisher = parsed.data.publisher
            languageCode = parsed.data.language_code
          }
        }

        const summaryRows = db.all(
          "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
          ["book-summary", "book"]
        ) as Array<{ data: string }>

        if (summaryRows.length > 0) {
          const parsed = BookSummaryOutput.safeParse(JSON.parse(summaryRows[0].data))
          if (parsed.success) {
            bookSummary = parsed.data
          }
        }
      } finally {
        db.close()
      }
    } catch (err) {
      if (isSchemaMismatchError(err)) {
        needsRebuild = true
        rebuildReason =
          "Book data uses an older storage schema and must be rebuilt."
      } else {
        throw err
      }
    }
  }

  return {
    label: safeLabel,
    title,
    authors,
    publisher,
    languageCode,
    pageCount,
    hasSourcePdf: fs.existsSync(pdfPath),
    needsRebuild,
    rebuildReason,
    metadata,
    bookSummary,
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
    publisher: null,
    languageCode: null,
    pageCount: 0,
    hasSourcePdf: true,
    needsRebuild: false,
    rebuildReason: null,
  }
}

export function getBookConfig(
  label: string,
  booksDir: string
): Record<string, unknown> | null {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  const configPath = path.join(bookDir, "config.yaml")
  if (!fs.existsSync(configPath)) {
    return null
  }

  const content = fs.readFileSync(configPath, "utf-8")
  const parsed = yaml.load(content)
  return (parsed as Record<string, unknown>) ?? null
}

export function updateBookConfig(
  label: string,
  booksDir: string,
  overrides: Record<string, unknown>
): void {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  const configPath = path.join(bookDir, "config.yaml")

  if (!overrides || Object.keys(overrides).length === 0) {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
    }
    return
  }

  fs.writeFileSync(configPath, yaml.dump(overrides))
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

