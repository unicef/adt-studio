import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { BookTypography, parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import { readTypography, TYPOGRAPHY_NODE, TYPOGRAPHY_ITEM } from "@adt/pipeline"

const MIN_PX = 8
const MAX_PX = 200
// className becomes a CSS selector (`.<className>`), so keep it to safe chars.
const CLASS_RE = /^[a-zA-Z0-9_-]+$/

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
      })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/typography — save the edited typography scale.
  app.put("/books/:label/typography", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    requireBook(booksDir, safeLabel)

    const body = await c.req.json()
    const parsed = BookTypography.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, { message: `Invalid typography: ${parsed.error.message}` })
    }
    if (parsed.data.styles.length === 0) {
      throw new HTTPException(400, { message: "Typography must include at least one style." })
    }
    for (const s of parsed.data.styles) {
      if (!CLASS_RE.test(s.className)) {
        throw new HTTPException(400, { message: `Invalid style class name: ${s.className}` })
      }
      for (const px of [s.desktopPx, s.mobilePx]) {
        if (!Number.isFinite(px) || px < MIN_PX || px > MAX_PX) {
          throw new HTTPException(400, {
            message: `Font sizes must be between ${MIN_PX} and ${MAX_PX}px.`,
          })
        }
      }
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
