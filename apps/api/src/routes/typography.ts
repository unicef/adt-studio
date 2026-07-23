import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { BookTypography, parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import { readTypography, resolveDetectedTypography, TYPOGRAPHY_NODE, TYPOGRAPHY_ITEM } from "@adt/pipeline"

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function requireBook(booksDir: string, safeLabel: string): void {
  const dbPath = path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)
  if (!fs.existsSync(dbPath)) {
    throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
  }
}

export function createTypographyRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/typography — the saved typography, or accessible defaults.
  app.get("/books/:label/typography", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    requireBook(booksDir, safeLabel)
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const saved = storage.getLatestNodeData(TYPOGRAPHY_NODE, TYPOGRAPHY_ITEM)
      return c.json({
        data: readTypography(storage),
        version: saved?.version ?? 0,
        isDefault: !saved,
        // The book's detected-scale sizes, so the editor can "Reset to detected".
        detected: resolveDetectedTypography(storage),
      })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/typography — save the edited typography scale.
  app.put("/books/:label/typography", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    requireBook(booksDir, safeLabel)

    // Bad JSON must be a 400, not a global 500 (matches the fonts route).
    const body = await c.req.json().catch(() => null)
    if (body === null) {
      throw new HTTPException(400, { message: "Invalid JSON body." })
    }
    // Shape, className pattern, px range and weight range are all enforced by
    // the BookTypography schema (see packages/types/src/typography.ts).
    const parsed = BookTypography.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, { message: `Invalid typography: ${parsed.error.message}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const version = storage.putNodeData(TYPOGRAPHY_NODE, TYPOGRAPHY_ITEM, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  return app
}
