import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import { openBookDb } from "@adt/storage"

function getDbPath(label: string, booksDir: string): string {
  const safeLabel = parseBookLabel(label)
  return path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)
}

function requireDb(label: string, booksDir: string) {
  const safeLabel = parseBookLabel(label)
  const dbPath = getDbPath(safeLabel, booksDir)
  if (!fs.existsSync(dbPath)) {
    throw new HTTPException(404, {
      message: `Book not found: ${safeLabel}`,
    })
  }
  return { safeLabel, dbPath }
}

function parseLogsQuery(query: Record<string, string>) {
  const step = query.step || undefined
  const itemId = query.itemId || undefined
  const rawLimit = parseInt(query.limit ?? "50", 10)
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200)
  const rawOffset = parseInt(query.offset ?? "0", 10)
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0)
  return { step, itemId, limit, offset }
}

export function createDebugRoutes(
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // GET /books/:label/debug/llm-logs — paginated log query
  app.get("/books/:label/debug/llm-logs", (c) => {
    const { label } = c.req.param()
    const { dbPath } = requireDb(label, booksDir)

    const { step, itemId, limit, offset } = parseLogsQuery(c.req.query())

    const db = openBookDb(dbPath)
    try {
      const conditions: string[] = []
      const params: (string | number)[] = []

      if (step) {
        conditions.push("step = ?")
        params.push(step)
      }
      if (itemId) {
        conditions.push("item_id = ?")
        params.push(itemId)
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

      // Get total count
      const countRows = db.all(
        `SELECT COUNT(*) as count FROM llm_log ${where}`,
        params
      ) as Array<{ count: number }>
      const total = countRows[0].count

      // Get paginated logs (newest first)
      const logRows = db.all(
        `SELECT id, timestamp, step, item_id, data FROM llm_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ) as Array<{ id: number; timestamp: string; step: string; item_id: string; data: string }>

      const logs = logRows.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        step: row.step,
        itemId: row.item_id,
        data: JSON.parse(row.data),
      }))

      return c.json({ logs, total })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/debug/stats — aggregate pipeline metrics
  app.get("/books/:label/debug/stats", (c) => {
    const { label } = c.req.param()
    const { dbPath } = requireDb(label, booksDir)

    const db = openBookDb(dbPath)
    try {
      // Aggregate stats using json_extract on the data column
      const stepRows = db.all(`
        SELECT
          step,
          COUNT(*) as calls,
          SUM(CASE WHEN json_extract(data, '$.cacheHit') = 1 THEN 1 ELSE 0 END) as cacheHits,
          SUM(CASE WHEN json_extract(data, '$.cacheHit') = 0 OR json_extract(data, '$.cacheHit') IS NULL THEN 1 ELSE 0 END) as cacheMisses,
          COALESCE(SUM(json_extract(data, '$.usage.inputTokens')), 0) as inputTokens,
          COALESCE(SUM(json_extract(data, '$.usage.outputTokens')), 0) as outputTokens,
          ROUND(AVG(json_extract(data, '$.durationMs')), 0) as avgDurationMs,
          SUM(CASE WHEN json_array_length(json_extract(data, '$.validationErrors')) > 0 THEN 1 ELSE 0 END) as errorCount
        FROM llm_log
        GROUP BY step
        ORDER BY step
      `) as Array<{
        step: string
        calls: number
        cacheHits: number
        cacheMisses: number
        inputTokens: number
        outputTokens: number
        avgDurationMs: number
        errorCount: number
      }>

      // Compute totals
      const totals = {
        calls: 0,
        cacheHits: 0,
        cacheMisses: 0,
        inputTokens: 0,
        outputTokens: 0,
        errorCount: 0,
      }
      for (const row of stepRows) {
        totals.calls += row.calls
        totals.cacheHits += row.cacheHits
        totals.cacheMisses += row.cacheMisses
        totals.inputTokens += row.inputTokens
        totals.outputTokens += row.outputTokens
        totals.errorCount += row.errorCount
      }

      // Full-pipeline job tracking was removed; keep nullable field for compatibility.
      const pipelineRun = null

      return c.json({ steps: stepRows, totals, pipelineRun })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/debug/config — active merged config
  app.get("/books/:label/debug/config", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const bookDir = path.join(path.resolve(booksDir), safeLabel)

    if (!fs.existsSync(bookDir)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    // Dynamic import to avoid coupling at module level
    const { loadBookConfig } = await import("@adt/pipeline")
    const merged = loadBookConfig(safeLabel, booksDir, configPath)
    const hasBookOverride = fs.existsSync(path.join(bookDir, "config.yaml"))

    return c.json({ merged, hasBookOverride })
  })

  // GET /books/:label/debug/llm-image/:hash — resolve LLM log image hash to binary
  app.get("/books/:label/debug/llm-image/:hash", (c) => {
    const { label, hash } = c.req.param()

    if (!/^[0-9a-f]{16}$/.test(hash)) {
      throw new HTTPException(400, { message: "Invalid hash format" })
    }

    const { safeLabel, dbPath } = requireDb(label, booksDir)
    const bookDir = path.join(path.resolve(booksDir), safeLabel)
    const debugImagePath = path.resolve(bookDir, ".debug-images", `${hash}.png`)

    const db = openBookDb(dbPath)
    try {
      // Check file-based debug screenshots first.
      if (
        debugImagePath.startsWith(bookDir + path.sep) &&
        fs.existsSync(debugImagePath)
      ) {
        const buf = fs.readFileSync(debugImagePath)
        c.header("Content-Type", "image/png")
        c.header("Cache-Control", "public, max-age=86400")
        return c.body(new Uint8Array(buf))
      }

      const rows = db.all(
        "SELECT image_id, path FROM images",
        []
      ) as Array<{ image_id: string; path: string }>

      for (const row of rows) {
        const imagePath = path.resolve(bookDir, row.path)
        if (!imagePath.startsWith(bookDir + path.sep)) continue

        let buf: Buffer
        try {
          buf = fs.readFileSync(imagePath)
        } catch {
          continue
        }

        const base64 = buf.toString("base64")
        const logHash = createHash("sha256").update(base64).digest("hex").slice(0, 16)
        if (logHash === hash) {
          const ext = path.extname(imagePath).toLowerCase()
          const contentType =
            ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png"
          c.header("Content-Type", contentType)
          c.header("Cache-Control", "public, max-age=86400")
          return c.body(new Uint8Array(buf))
        }
      }

      throw new HTTPException(404, { message: `Image not found for hash: ${hash}` })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/debug/versions/:node/:itemId — version history
  app.get("/books/:label/debug/versions/:node/:itemId", (c) => {
    const { label, node, itemId } = c.req.param()
    const { dbPath } = requireDb(label, booksDir)

    const includeData = c.req.query("includeData") === "true"

    const db = openBookDb(dbPath)
    try {
      if (includeData) {
        const rows = db.all(
          "SELECT version, data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC",
          [node, itemId]
        ) as Array<{ version: number; data: string }>

        const versions = rows.map((row) => ({
          version: row.version,
          data: JSON.parse(row.data),
        }))
        return c.json({ versions })
      } else {
        const rows = db.all(
          "SELECT version FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC",
          [node, itemId]
        ) as Array<{ version: number }>

        const versions = rows.map((row) => ({ version: row.version }))
        return c.json({ versions })
      }
    } finally {
      db.close()
    }
  })

  return app
}
