import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import {
  BookOutlineAuditResponse,
  BookOutlineOutput,
  PageSectioningOutput,
  parseBookLabel,
  type BookOutlineAppliedHeading,
  type ContentNodeData,
} from "@adt/types"
import { createBookStorage } from "@adt/storage"

function collectAppliedHeadings(
  pageId: string,
  nodes: ContentNodeData[],
  output: BookOutlineAppliedHeading[],
): void {
  for (const node of nodes) {
    if (node.outlineEntryId && node.role) {
      output.push({
        outlineEntryId: node.outlineEntryId,
        pageId,
        nodeId: node.nodeId,
        role: node.role,
        text: node.text ?? "",
        ...(node.headingLevel !== undefined && { headingLevel: node.headingLevel }),
        ...(node.headingStyleClusterId !== undefined && {
          headingStyleClusterId: node.headingStyleClusterId,
        }),
      })
    }
    if (node.children) collectAppliedHeadings(pageId, node.children, output)
  }
}

export function createBookOutlineRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/book-outline — latest outline plus current tree assignments.
  app.get("/books/:label/book-outline", (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const bookDir = path.join(path.resolve(booksDir), safeLabel)
    if (!fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const row = storage.getLatestNodeData("book-outline", "book")
      if (!row) return c.json(null)

      const outline = BookOutlineOutput.safeParse(row.data)
      if (!outline.success) {
        throw new HTTPException(500, {
          message: `Stored book outline is invalid: ${outline.error.message}`,
        })
      }

      const appliedHeadings: BookOutlineAppliedHeading[] = []
      for (const page of storage.getPages()) {
        const sectioningRow = storage.getLatestNodeData("page-sectioning", page.pageId)
        if (!sectioningRow) continue
        const sectioning = PageSectioningOutput.safeParse(sectioningRow.data)
        if (!sectioning.success) continue
        for (const section of sectioning.data.sections) {
          collectAppliedHeadings(page.pageId, section.nodes, appliedHeadings)
        }
      }

      return c.json(
        BookOutlineAuditResponse.parse({
          version: row.version,
          outline: outline.data,
          appliedHeadings,
        }),
      )
    } finally {
      storage.close()
    }
  })

  return app
}
