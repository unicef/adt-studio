import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { TocGenerationOutput, WebRenderingOutput, parseBookLabel } from "@adt/types"
import type { ContentNodeData } from "@adt/types"
import { openBookDb, createBookStorage, readCurrentNodeRow } from "@adt/storage"
import { getRenderSectioning } from "@adt/pipeline"

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

export function createTocRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/toc — Get latest TOC
  app.get("/books/:label/toc", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = path.join(
      path.resolve(booksDir),
      safeLabel,
      `${safeLabel}.db`,
    )

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      // Current-pointer version (falls back to MAX) so a rollback is reflected.
      const row = readCurrentNodeRow(db, "toc-generation", "book")

      if (!row) {
        return c.json(null)
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(row.data)
      } catch {
        throw new HTTPException(500, {
          message: `Stored TOC data is corrupted for book: ${safeLabel}`,
        })
      }

      const validated = TocGenerationOutput.safeParse(parsed)
      if (!validated.success) {
        throw new HTTPException(500, {
          message: `Stored TOC data is invalid for book: ${safeLabel}`,
        })
      }

      return c.json({ ...validated.data, version: row.version })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/toc — Update TOC
  app.put("/books/:label/toc", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }
    const parsed = TocGenerationOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid TOC data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const version = storage.putNodeData("toc-generation", "book", parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // GET /books/:label/toc/sections — Available sections for linking
  app.get("/books/:label/toc/sections", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const sections: Array<{ sectionId: string; href: string; title: string; pageNumber: number }> = []

      for (const page of pages) {
        const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
        if (!renderRow) continue
        const renderParsed = WebRenderingOutput.safeParse(renderRow.data)
        if (!renderParsed.success) continue

        const sectioning = getRenderSectioning(storage, page.pageId)

        const findFirstHeadingText = (nodes: ContentNodeData[]): string | null => {
          const stack: ContentNodeData[] = [...nodes]
          while (stack.length > 0) {
            const node = stack.shift()!
            if (node.isPruned) continue
            if (node.role === "heading" && node.text) return node.text
            if (node.children) stack.unshift(...node.children)
          }
          return null
        }

        for (const rs of renderParsed.data.sections) {
          const meta = sectioning?.sections?.[rs.sectionIndex]
          if (meta?.isPruned) continue

          const sectionId = meta?.sectionId ?? `${page.pageId}_sec${String(rs.sectionIndex + 1).padStart(3, "0")}`
          const title = meta ? (findFirstHeadingText(meta.nodes) ?? sectionId) : sectionId

          sections.push({
            sectionId,
            href: `${sectionId}.html`,
            title,
            pageNumber: page.pageNumber,
          })
        }
      }

      return c.json(sections)
    } finally {
      storage.close()
    }
  })

  return app
}
