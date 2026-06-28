import fs from "node:fs"
import path from "node:path"
import type sqlite from "node-sqlite3-wasm"
import type { ExtractedPage, ExtractedImage } from "@adt/pdf"
import type { LlmLogEntry } from "@adt/llm"
import { parseBookLabel } from "@adt/types"
import type { Storage, PageData, ImageData, NodeDataRow, CroppedImageInput, SegmentedImageInput, SignLanguageVideoData, TranslatedImageInput } from "./storage.js"
import { openBookDb } from "./db.js"

export interface BookPaths {
  bookDir: string
  dbPath: string
  imagesDir: string
  debugImagesDir: string
  videosDir: string
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
    debugImagesDir: path.join(bookDir, ".debug-images"),
    videosDir: path.join(bookDir, "videos"),
  }
}

export function createBookStorage(label: string, booksRoot: string): Storage {
  const paths = resolveBookPaths(label, booksRoot)

  fs.mkdirSync(paths.bookDir, { recursive: true })
  fs.mkdirSync(paths.imagesDir, { recursive: true })
  fs.mkdirSync(paths.debugImagesDir, { recursive: true })
  fs.mkdirSync(paths.videosDir, { recursive: true })

  const db = openBookDb(paths.dbPath)

  return {
    clearExtractedData(): void {
      clearImageFiles(paths.imagesDir)
      clearImageFiles(paths.debugImagesDir)
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

    getImageDimensions(imageId: string): { width: number; height: number } | null {
      const rows = db.all(
        "SELECT width, height FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ width: number; height: number }>
      if (rows.length === 0) return null
      return { width: rows[0].width, height: rows[0].height }
    },

    getImageMeta(imageId: string): { pageId: string; relativePath: string } | null {
      const rows = db.all(
        "SELECT page_id, path FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ page_id: string; path: string }>
      if (rows.length === 0) return null
      return { pageId: rows[0].page_id, relativePath: rows[0].path }
    },

    getPageImages(pageId: string): ImageData[] {
      const rows = db.all(
        "SELECT image_id, width, height, render_method, bounds_x, bounds_y, bounds_w, bounds_h FROM images WHERE page_id = ? ORDER BY image_id",
        [pageId]
      ) as Array<{
        image_id: string
        width: number
        height: number
        render_method: string | null
        bounds_x: number | null
        bounds_y: number | null
        bounds_w: number | null
        bounds_h: number | null
      }>
      return rows.map((r) => {
        const image: ImageData = {
          imageId: r.image_id,
          width: r.width,
          height: r.height,
          renderMethod: r.render_method as ImageData["renderMethod"],
        }
        if (r.bounds_x !== null && r.bounds_y !== null && r.bounds_w !== null && r.bounds_h !== null) {
          image.bounds = { x: r.bounds_x, y: r.bounds_y, width: r.bounds_w, height: r.bounds_h }
        }
        return image
      })
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

      const b = input.bounds
      db.run(
        `INSERT INTO images
           (image_id, page_id, path, hash, width, height, source, bounds_x, bounds_y, bounds_w, bounds_h)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (image_id) DO UPDATE SET
           page_id = excluded.page_id,
           path = excluded.path,
           hash = excluded.hash,
           width = excluded.width,
           height = excluded.height,
           source = excluded.source,
           bounds_x = excluded.bounds_x,
           bounds_y = excluded.bounds_y,
           bounds_w = excluded.bounds_w,
           bounds_h = excluded.bounds_h`,
        [
          segId,
          input.pageId,
          `images/${filename}`,
          "",
          input.width,
          input.height,
          "segment",
          b ? b.x : null,
          b ? b.y : null,
          b ? b.width : null,
          b ? b.height : null,
        ]
      )
    },

    putTranslatedImage(input: TranslatedImageInput): string {
      const safeLang = input.languageCode.replace(/[^a-zA-Z0-9-]/g, "_")
      const newImageId = `${input.sourceImageId}_tr_${safeLang}`
      const filename = `${newImageId}.png`
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
          newImageId,
          input.pageId,
          `images/${filename}`,
          "",
          input.width,
          input.height,
          "translate",
        ]
      )
      return newImageId
    },

    clearTranslatedImages(filter?: { sourceImageIds?: string[]; languageCodes?: string[] }): void {
      const conditions: string[] = ["source = 'translate'"]
      const params: string[] = []

      if (filter?.sourceImageIds && filter.sourceImageIds.length > 0) {
        const likeClauses = filter.sourceImageIds.map(() => "image_id LIKE ?").join(" OR ")
        conditions.push(`(${likeClauses})`)
        for (const id of filter.sourceImageIds) {
          params.push(`${id}_tr_%`)
        }
      }

      if (filter?.languageCodes && filter.languageCodes.length > 0) {
        const langLikes = filter.languageCodes.map(() => "image_id LIKE ?").join(" OR ")
        conditions.push(`(${langLikes})`)
        for (const lang of filter.languageCodes) {
          const safeLang = lang.replace(/[^a-zA-Z0-9-]/g, "_")
          params.push(`%_tr_${safeLang}`)
        }
      }

      const where = conditions.join(" AND ")
      const rows = db.all(
        `SELECT image_id, path FROM images WHERE ${where}`,
        params
      ) as Array<{ image_id: string; path: string }>

      for (const row of rows) {
        const filePath = path.resolve(paths.bookDir, row.path)
        const rel = path.relative(paths.bookDir, filePath)
        if (rel.startsWith("..") || path.isAbsolute(rel)) continue
        try {
          fs.rmSync(filePath, { force: true })
        } catch {
          // Best effort — DB row is removed below either way
        }
      }

      if (rows.length > 0) {
        db.run(`DELETE FROM images WHERE ${where}`, params)
      }
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

    getNodeVersionFingerprint(excludeNodes: string[] = []): Array<{ node: string; itemId: string; version: number }> {
      let sql = "SELECT node, item_id, MAX(version) as version FROM node_data"
      const params: string[] = []
      if (excludeNodes.length > 0) {
        sql += ` WHERE node NOT IN (${excludeNodes.map(() => "?").join(", ")})`
        params.push(...excludeNodes)
      }
      sql += " GROUP BY node, item_id ORDER BY node, item_id"
      const rows = db.all(sql, params) as Array<{ node: string; item_id: string; version: number }>
      return rows.map((r) => ({ node: r.node, itemId: r.item_id, version: r.version }))
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

    putDebugImage(hash: string, data: Buffer): void {
      if (!/^[0-9a-f]{16}$/.test(hash)) {
        throw new Error(`Invalid debug image hash: ${hash}`)
      }
      const filePath = path.join(paths.debugImagesDir, `${hash}.png`)
      if (fs.existsSync(filePath)) return
      fs.writeFileSync(filePath, data)
    },

    clearDebugImages(): void {
      clearImageFiles(paths.debugImagesDir)
    },

    putSignLanguageVideo(videoId: string, buffer: Buffer, originalName: string, mimeType: string): void {
      const ext = mimeType === "video/webm" ? ".webm" : ".mp4"
      const filename = `${videoId}${ext}`
      const filePath = path.join(paths.videosDir, filename)
      fs.writeFileSync(filePath, buffer)
      try {
        db.run(
          `INSERT INTO sign_language_videos (video_id, section_id, path, original_name, mime_type, size_bytes, created_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?)`,
          [videoId, `videos/${filename}`, originalName, mimeType, buffer.length, new Date().toISOString()]
        )
      } catch (err) {
        // Clean up the written file if DB insert fails
        try { fs.unlinkSync(filePath) } catch { /* ignore */ }
        throw err
      }
    },

    getSignLanguageVideos(): SignLanguageVideoData[] {
      const rows = db.all(
        "SELECT video_id, section_id, original_name, mime_type, size_bytes, created_at FROM sign_language_videos ORDER BY created_at"
      ) as Array<{ video_id: string; section_id: string | null; original_name: string; mime_type: string; size_bytes: number; created_at: string }>
      return rows.map((r) => ({
        videoId: r.video_id,
        sectionId: r.section_id,
        originalName: r.original_name,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        createdAt: r.created_at,
      }))
    },

    assignSignLanguageVideo(videoId: string, sectionId: string | null): void {
      db.run("UPDATE sign_language_videos SET section_id = ? WHERE video_id = ?", [sectionId, videoId])
    },

    deleteSignLanguageVideo(videoId: string): void {
      const rows = db.all("SELECT path FROM sign_language_videos WHERE video_id = ?", [videoId]) as Array<{ path: string }>
      if (rows.length > 0) {
        const filePath = path.resolve(paths.bookDir, rows[0].path)
        if (filePath.startsWith(paths.bookDir + path.sep)) {
          try { fs.unlinkSync(filePath) } catch { /* file may already be gone */ }
        }
        db.run("DELETE FROM sign_language_videos WHERE video_id = ?", [videoId])
      }
    },

    deleteAllSignLanguageVideos(): void {
      const rows = db.all("SELECT path FROM sign_language_videos") as Array<{ path: string }>
      for (const row of rows) {
        const filePath = path.resolve(paths.bookDir, row.path)
        if (filePath.startsWith(paths.bookDir + path.sep)) {
          try { fs.unlinkSync(filePath) } catch { /* file may already be gone */ }
        }
      }
      db.run("DELETE FROM sign_language_videos")
    },

    getSignLanguageVideoPath(videoId: string): string | null {
      const rows = db.all("SELECT path FROM sign_language_videos WHERE video_id = ?", [videoId]) as Array<{ path: string }>
      if (rows.length === 0) return null
      const filePath = path.resolve(paths.bookDir, rows[0].path)
      if (!filePath.startsWith(paths.bookDir + path.sep)) return null
      return filePath
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
       (image_id, page_id, path, hash, width, height, source, render_method, bounds_x, bounds_y, bounds_w, bounds_h)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (image_id) DO UPDATE SET
       page_id = excluded.page_id,
       path = excluded.path,
       hash = excluded.hash,
       width = excluded.width,
       height = excluded.height,
       source = excluded.source,
       render_method = excluded.render_method,
       bounds_x = excluded.bounds_x,
       bounds_y = excluded.bounds_y,
       bounds_w = excluded.bounds_w,
       bounds_h = excluded.bounds_h`,
    [
      image.imageId,
      pageId,
      `images/${filename}`,
      image.hash,
      image.width,
      image.height,
      source,
      image.renderMethod ?? null,
      image.bounds?.x ?? null,
      image.bounds?.y ?? null,
      image.bounds?.width ?? null,
      image.bounds?.height ?? null,
    ]
  )
}

function ensureWithinRoot(target: string, root: string): void {
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes books root")
  }
}
