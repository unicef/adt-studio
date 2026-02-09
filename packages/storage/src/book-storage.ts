import fs from "node:fs"
import path from "node:path"
import type sqlite from "node-sqlite3-wasm"
import type { ExtractedPage, ExtractedImage, PdfMetadata } from "@adt/pdf"
import { BookLabel } from "@adt/types"
import type { Storage } from "./storage.js"
import { openBookDb } from "./db.js"

export interface BookPaths {
  bookDir: string
  dbPath: string
  imagesDir: string
}

export function resolveBookPaths(label: string, booksRoot: string): BookPaths {
  const safeLabel = validateLabel(label)
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
      db.exec("BEGIN IMMEDIATE")
      try {
        db.run("DELETE FROM images")
        db.run("DELETE FROM pages")
        db.exec("COMMIT")
      } catch (err) {
        db.exec("ROLLBACK")
        throw err
      }

      const imageFiles = fs.readdirSync(paths.imagesDir)
      for (const file of imageFiles) {
        fs.rmSync(path.join(paths.imagesDir, file), {
          recursive: true,
          force: true,
        })
      }
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

    close(): void {
      db.close()
    },
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

function validateLabel(label: string): string {
  const parsed = BookLabel.safeParse(label)
  if (!parsed.success) {
    throw new Error("Invalid book label: label must be filesystem-safe")
  }
  return parsed.data
}

function ensureWithinRoot(target: string, root: string): void {
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes books root")
  }
}
