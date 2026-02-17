import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { parseBookLabel } from "@adt/types"
import { openBookDb, createBookStorage } from "@adt/storage"

const TranslationBody = z
  .object({
    entries: z.array(
      z.object({ id: z.string(), text: z.string() })
    ),
  })
  .strict()

export function createTextCatalogRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/text-catalog — Get text catalog with optional translations
  app.get("/books/:label/text-catalog", (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const db = openBookDb(dbPath)
    try {
      // Get source catalog
      const catalogRows = db.all(
        "SELECT data, version FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        ["text-catalog", "book"]
      ) as Array<{ data: string; version: number }>

      if (catalogRows.length === 0) {
        return c.json(null)
      }

      const catalog = JSON.parse(catalogRows[0].data)

      // Get all translated catalogs
      const translationRows = db.all(
        `SELECT item_id, data, version FROM node_data
         WHERE node = ? AND (item_id, version) IN (
           SELECT item_id, MAX(version) FROM node_data WHERE node = ? GROUP BY item_id
         )`,
        ["text-catalog-translation", "text-catalog-translation"]
      ) as Array<{ item_id: string; data: string; version: number }>

      const translations: Record<string, { entries: Array<{ id: string; text: string }>; version: number }> = {}
      for (const row of translationRows) {
        try {
          const parsed = JSON.parse(row.data)
          translations[row.item_id] = { entries: parsed.entries, version: row.version }
        } catch {
          // skip corrupted
        }
      }

      return c.json({
        entries: catalog.entries,
        generatedAt: catalog.generatedAt,
        version: catalogRows[0].version,
        translations,
      })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/text-catalog-translation/:language — Update a translation
  app.put("/books/:label/text-catalog-translation/:language", async (c) => {
    const { label, language } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = TranslationBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid translation data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const version = storage.putNodeData(
        "text-catalog-translation",
        language,
        parsed.data
      )
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  return app
}
