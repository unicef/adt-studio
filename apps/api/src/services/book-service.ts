import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"
import { parseBookLabel, BookLabel, BookMetadata } from "@adt/types"
import { openBookDb, createBookStorage } from "@adt/storage"

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
  storyboardAccepted: boolean
  proofCompleted: boolean
}

export interface BookDetail extends BookSummary {
  metadata: BookMetadata | null
}

function isSchemaMismatchError(err: unknown): err is Error {
  return err instanceof Error && err.message.includes("Schema version mismatch")
}

function isStoryboardAccepted(db: ReturnType<typeof openBookDb>): boolean {
  const rows = db.all(
    "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
    ["storyboard-acceptance", "book"]
  ) as Array<{ data: string }>
  return rows.length > 0
}

function isProofCompleted(db: ReturnType<typeof openBookDb>): boolean {
  const rows = db.all(
    "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
    ["proof-status", "book"]
  ) as Array<{ data: string }>
  if (rows.length === 0) return false
  try {
    const data = JSON.parse(rows[0].data) as { status?: string }
    return data.status === "completed"
  } catch {
    return false
  }
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
    let storyboardAccepted = false
    let proofCompleted = false

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

          storyboardAccepted = isStoryboardAccepted(db)
          proofCompleted = isProofCompleted(db)
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
      storyboardAccepted,
      proofCompleted,
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
  let needsRebuild = false
  let rebuildReason: string | null = null
  let storyboardAccepted = false
  let proofCompleted = false

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

        storyboardAccepted = isStoryboardAccepted(db)
        proofCompleted = isProofCompleted(db)
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
    storyboardAccepted,
    proofCompleted,
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
    publisher: null,
    languageCode: null,
    pageCount: 0,
    hasSourcePdf: true,
    needsRebuild: false,
    rebuildReason: null,
    storyboardAccepted: false,
    proofCompleted: false,
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

export function acceptStoryboard(
  label: string,
  booksDir: string
): { version: number; acceptedAt: string } {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    const pages = storage.getPages()
    if (pages.length === 0) {
      throw new Error("No pages found")
    }

    // Check that every page has a web-rendering
    for (const page of pages) {
      const rendering = storage.getLatestNodeData("web-rendering", page.pageId)
      if (!rendering) {
        throw new Error(
          `Not all pages have been rendered (missing: ${page.pageId})`
        )
      }
    }

    const acceptedAt = new Date().toISOString()
    const version = storage.putNodeData("storyboard-acceptance", "book", {
      acceptedAt,
      renderedPageCount: pages.length,
    })

    return { version, acceptedAt }
  } finally {
    storage.close()
  }
}
