import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { GlossaryOutput, parseBookLabel } from "@adt/types"
import { openBookDb, createBookStorage } from "@adt/storage"

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

export function createGlossaryRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/glossary — Get latest glossary
  app.get("/books/:label/glossary", (c) => {
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
      const rows = db.all(
        "SELECT data, version FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        ["glossary", "book"]
      ) as Array<{ data: string; version: number }>

      if (rows.length === 0) {
        return c.json(null)
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rows[0].data)
      } catch {
        throw new HTTPException(500, {
          message: `Stored glossary data is corrupted for book: ${safeLabel}`,
        })
      }

      const validated = GlossaryOutput.safeParse(parsed)
      if (!validated.success) {
        throw new HTTPException(500, {
          message: `Stored glossary data is invalid for book: ${safeLabel}`,
        })
      }

      return c.json({ ...validated.data, version: rows[0].version })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/glossary — Update glossary
  app.put("/books/:label/glossary", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    const body = await c.req.json()
    const parsed = GlossaryOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid glossary data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const version = storage.putNodeData("glossary", "book", parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  return app
}
