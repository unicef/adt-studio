import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel, TTSOutput } from "@adt/types"
import { openBookDb } from "@adt/storage"

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

export function createTTSRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/tts — Get all TTS entries (all languages)
  app.get("/books/:label/tts", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = path.join(
      path.resolve(booksDir),
      safeLabel,
      `${safeLabel}.db`
    )

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      // TTS is stored per language: node="tts", item_id=language code
      const rows = db.all(
        `SELECT item_id, data FROM node_data
         WHERE node = 'tts'
         ORDER BY version DESC`,
      ) as Array<{ item_id: string; data: string }>

      // Deduplicate by language (take latest version)
      const seen = new Set<string>()
      const entries: Array<{ textId: string; fileName: string; language: string }> = []

      for (const row of rows) {
        if (seen.has(row.item_id)) continue
        seen.add(row.item_id)

        let parsed: unknown
        try {
          parsed = JSON.parse(row.data)
        } catch {
          continue
        }

        const validated = TTSOutput.safeParse(parsed)
        if (!validated.success) continue

        for (const entry of validated.data.entries) {
          entries.push({
            textId: entry.textId,
            fileName: entry.fileName,
            language: entry.language,
          })
        }
      }

      return c.json({ entries })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/audio/:language/:fileName — Serve audio file
  app.get("/books/:label/audio/:language/:fileName", (c) => {
    const { label, language, fileName } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)

    // Validate language and fileName to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(language)) {
      throw new HTTPException(400, { message: "Invalid language" })
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
      throw new HTTPException(400, { message: "Invalid file name" })
    }

    const audioPath = path.resolve(bookDir, "audio", language, fileName)
    // Verify path doesn't escape book directory
    if (!audioPath.startsWith(bookDir + path.sep)) {
      throw new HTTPException(400, { message: "Invalid audio path" })
    }

    let stat: fs.Stats
    try {
      stat = fs.statSync(audioPath)
    } catch {
      throw new HTTPException(404, {
        message: `Audio file not found: ${fileName}`,
      })
    }
    if (!stat.isFile()) {
      throw new HTTPException(404, {
        message: `Audio file not found: ${fileName}`,
      })
    }

    const audioBuffer = fs.readFileSync(audioPath)
    const ext = path.extname(fileName).toLowerCase()
    const contentType =
      ext === ".mp3" ? "audio/mpeg"
        : ext === ".wav" ? "audio/wav"
          : ext === ".ogg" ? "audio/ogg"
            : "audio/mpeg"
    c.header("Content-Type", contentType)
    c.header("Cache-Control", "public, max-age=86400")
    return c.body(audioBuffer)
  })

  return app
}
