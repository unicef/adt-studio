import fs from "node:fs"
import path from "node:path"
import type sqlite from "node-sqlite3-wasm"
import type { ExtractedPage, ExtractedImage, PdfMetadata } from "@adt/pdf"
import { parseBookLabel } from "@adt/types"
import type { Storage, PageData, NodeDataRow } from "./storage.js"
import { openBookDb } from "./db.js"

export interface BookPaths {
  bookDir: string
  dbPath: string
  imagesDir: string
}

export function resolveBookPaths(label: string, booksRoot: string): BookPaths {
  const safeLabel = parseBookLabel(label)
  const resolvedRoot = path.resolve(booksRoot)
  const bookDir = path.resolve(resolvedRoot, safeLabel)

  ensureWithinRoot(bookDir, resolvedRoot)

  return {
    bookDir,
    dbPath: path.join(bookDir, `${safeLabel}.db`),
    imagesDir: path.join(bookDir, "images"),
  }
}

export function createBookStorage(label: string, booksRoot: string): Storage {
  const paths = resolveBookPaths(label, booksRoot)

  fs.mkdirSync(paths.bookDir, { recursive: true })
  fs.mkdirSync(paths.imagesDir, { recursive: true })

  const db = openBookDb(paths.dbPath)

  return {
    clearExtractedData(): void {
      clearImageFiles(paths.imagesDir)
      clearExtractedRows(db)
    },

    putPdfMetadata(data: PdfMetadata): void {
      db.run(
        `INSERT INTO pdf_metadata (id, data) VALUES (1, ?)
         ON CONFLICT (id) DO UPDATE SET data = excluded.data`,
        [JSON.stringify(data)]
      )
    },

    putExtractedPage(page: ExtractedPage): void {
      db.run(
        `INSERT INTO pages (page_id, page_number, text)
         VALUES (?, ?, ?)
         ON CONFLICT (page_id) DO UPDATE SET
           page_number = excluded.page_number,
           text = excluded.text`,
        [page.pageId, page.pageNumber, page.text]
      )

      writeImage(db, paths.imagesDir, page.pageImage, page.pageId, "extract")

      for (const img of page.images) {
        writeImage(db, paths.imagesDir, img, page.pageId, "extract")
      }
    },

    getPages(): PageData[] {
      const rows = db.all(
        "SELECT page_id, page_number, text FROM pages ORDER BY page_number"
      ) as Array<{ page_id: string; page_number: number; text: string }>
      return rows.map((r) => ({
        pageId: r.page_id,
        pageNumber: r.page_number,
        text: r.text,
      }))
    },

    getPageImageBase64(pageId: string): string {
      const rows = db.all(
        "SELECT path FROM images WHERE image_id = ?",
        [`${pageId}_page`]
      ) as Array<{ path: string }>
      if (rows.length === 0) {
        throw new Error(`No page image found for ${pageId}`)
      }
      const filePath = path.resolve(paths.bookDir, rows[0].path)
      ensureWithinRoot(filePath, paths.bookDir)
      return fs.readFileSync(filePath).toString("base64")
    },

    putNodeData(node: string, itemId: string, data: unknown): number {
      const rows = db.all(
        "SELECT MAX(version) as max_version FROM node_data WHERE node = ? AND item_id = ?",
        [node, itemId]
      ) as Array<{ max_version: number | null }>
      const nextVersion = (rows[0]?.max_version ?? 0) + 1
      db.run(
        "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
        [node, itemId, nextVersion, JSON.stringify(data)]
      )
      return nextVersion
    },

    getLatestNodeData(node: string, itemId: string): NodeDataRow | null {
      const rows = db.all(
        "SELECT version, data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        [node, itemId]
      ) as Array<{ version: number; data: string }>
      if (rows.length === 0) return null
      return {
        version: rows[0].version,
        data: JSON.parse(rows[0].data),
      }
    },

    appendLlmLog(entry: unknown): void {
      db.run(
        "INSERT INTO llm_log (timestamp, data) VALUES (?, ?)",
        [new Date().toISOString(), JSON.stringify(entry)]
      )
    },

    close(): void {
      db.close()
    },
  }
}

function clearImageFiles(imagesDir: string): void {
  const imageFiles = fs.readdirSync(imagesDir)
  for (const file of imageFiles) {
    fs.rmSync(path.join(imagesDir, file), {
      recursive: true,
      force: true,
    })
  }
}

function clearExtractedRows(db: sqlite.Database): void {
  db.exec("BEGIN IMMEDIATE")
  try {
    db.run("DELETE FROM images")
    db.run("DELETE FROM pages")
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

function writeImage(
  db: sqlite.Database,
  imagesDir: string,
  image: ExtractedImage,
  pageId: string,
  source: "page" | "extract" | "crop"
): void {
  const filename = `${image.imageId}.png`
  fs.writeFileSync(path.join(imagesDir, filename), image.pngBuffer)

  db.run(
    `INSERT INTO images
       (image_id, page_id, path, hash, width, height, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (image_id) DO UPDATE SET
       page_id = excluded.page_id,
       path = excluded.path,
       hash = excluded.hash,
       width = excluded.width,
       height = excluded.height,
       source = excluded.source`,
    [
      image.imageId,
      pageId,
      `images/${filename}`,
      image.hash,
      image.width,
      image.height,
      source,
    ]
  )
}

function ensureWithinRoot(target: string, root: string): void {
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes books root")
  }
}
