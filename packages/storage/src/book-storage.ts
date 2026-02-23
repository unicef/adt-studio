import fs from "node:fs"
import path from "node:path"
import type sqlite from "node-sqlite3-wasm"
import type { ExtractedPage, ExtractedImage } from "@adt/pdf"
import type { LlmLogEntry } from "@adt/llm"
import { parseBookLabel } from "@adt/types"
import type { Storage, PageData, ImageData, NodeDataRow, CroppedImageInput, SegmentedImageInput } from "./storage.js"
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

    clearNodesByType(nodes: string[]): void {
      if (nodes.length === 0) return
      const placeholders = nodes.map(() => "?").join(", ")
      db.exec("BEGIN IMMEDIATE")
      try {
        db.run(`DELETE FROM node_data WHERE node IN (${placeholders})`, nodes)
        db.exec("COMMIT")
      } catch (err) {
        db.exec("ROLLBACK")
        throw err
      }
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

    getImageBase64(imageId: string): string {
      const rows = db.all(
        "SELECT path FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ path: string }>
      if (rows.length === 0) {
        throw new Error(`No image found for ${imageId}`)
      }
      const filePath = path.resolve(paths.bookDir, rows[0].path)
      ensureWithinRoot(filePath, paths.bookDir)
      return fs.readFileSync(filePath).toString("base64")
    },

    getPageImages(pageId: string): ImageData[] {
      const rows = db.all(
        "SELECT image_id, width, height FROM images WHERE page_id = ? ORDER BY image_id",
        [pageId]
      ) as Array<{ image_id: string; width: number; height: number }>
      return rows.map((r) => ({
        imageId: r.image_id,
        width: r.width,
        height: r.height,
      }))
    },

    putCroppedImage(input: CroppedImageInput): void {
      const cropId = `${input.imageId}_crop_v${input.version}`
      const filename = `${cropId}.png`
      fs.writeFileSync(path.join(paths.imagesDir, filename), input.buffer)

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
          cropId,
          input.pageId,
          `images/${filename}`,
          "",
          input.width,
          input.height,
          "crop",
        ]
      )
    },

    putSegmentedImage(input: SegmentedImageInput): void {
      const segIndex = String(input.segmentIndex).padStart(3, "0")
      const segId = `${input.sourceImageId}_seg${segIndex}_v${input.version}`
      const filename = `${segId}.png`
      fs.writeFileSync(path.join(paths.imagesDir, filename), input.buffer)

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
          segId,
          input.pageId,
          `images/${filename}`,
          "",
          input.width,
          input.height,
          "segment",
        ]
      )
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

    markStepStarted(step: string): void {
      db.run(
        `INSERT INTO step_runs (step, status, started_at) VALUES (?, 'running', ?)
         ON CONFLICT (step) DO UPDATE SET status='running', started_at=excluded.started_at, completed_at=NULL, error=NULL, message=NULL`,
        [step, new Date().toISOString()]
      )
    },

    markStepCompleted(step: string): void {
      db.run(
        `INSERT INTO step_runs (step, status, completed_at) VALUES (?, 'done', ?)
         ON CONFLICT (step) DO UPDATE SET status='done', completed_at=excluded.completed_at`,
        [step, new Date().toISOString()]
      )
    },

    markStepSkipped(step: string): void {
      db.run(
        `INSERT INTO step_runs (step, status, completed_at) VALUES (?, 'skipped', ?)
         ON CONFLICT (step) DO UPDATE SET status='skipped', completed_at=excluded.completed_at`,
        [step, new Date().toISOString()]
      )
    },

    recordStepError(step: string, error: string): void {
      db.run(
        `INSERT INTO step_runs (step, status, error) VALUES (?, 'error', ?)
         ON CONFLICT (step) DO UPDATE SET status='error', error=excluded.error`,
        [step, error]
      )
    },

    updateStepMessage(step: string, message: string): void {
      db.run(
        `INSERT INTO step_runs (step, status, message) VALUES (?, 'running', ?)
         ON CONFLICT (step) DO UPDATE SET message=excluded.message`,
        [step, message]
      )
    },

    getStepRuns(): Array<{ step: string; status: string; error: string | null; message: string | null }> {
      return db.all("SELECT step, status, error, message FROM step_runs") as Array<{
        step: string; status: string; error: string | null; message: string | null
      }>
    },

    clearStepRuns(steps: string[]): void {
      if (steps.length === 0) return
      const placeholders = steps.map(() => "?").join(", ")
      db.run(`DELETE FROM step_runs WHERE step IN (${placeholders})`, steps)
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

    appendLlmLog(entry: LlmLogEntry): void {
      db.run(
        "INSERT INTO llm_log (request_id, timestamp, step, item_id, success, error_count, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          entry.requestId,
          entry.timestamp,
          entry.taskType,
          entry.pageId ?? "",
          entry.success ? 1 : 0,
          entry.errorCount,
          JSON.stringify(entry),
        ]
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
    db.run("DELETE FROM node_data")
    db.run("DELETE FROM images")
    db.run("DELETE FROM pages")
    db.run("DELETE FROM step_runs")
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
  const ext = image.format === "jpeg" ? "jpg" : "png"
  const filename = `${image.imageId}.${ext}`
  fs.writeFileSync(path.join(imagesDir, filename), image.buffer)

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
