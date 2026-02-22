import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { BookMetadata, type ProgressEvent } from "@adt/types"
import { createBookStorage, resolveBookPaths, openBookDb } from "@adt/storage"
import { extractPDF } from "../pdf-extraction.js"
import type { Progress } from "../progress.js"

const RAVEN_PDF = path.resolve(
  import.meta.dirname,
  "../../../../tests/fixtures/raven.pdf"
)

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  dirs.length = 0
})

function collectingProgress(): { progress: Progress; events: ProgressEvent[] } {
  const events: ProgressEvent[] = []
  return {
    events,
    progress: {
      emit(event) {
        events.push(event)
      },
    },
  }
}

describe("extractPDF", () => {
  it(
    "extracts pages from raven.pdf and writes to storage",
    { timeout: 60_000 },
    async () => {
      const booksRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "adt-pipeline-test-")
      )
      dirs.push(booksRoot)

      const label = "test-raven"
      const storage = createBookStorage(label, booksRoot)
      const { progress, events } = collectingProgress()

      try {
        const result = await extractPDF(
          { pdfPath: RAVEN_PDF, startPage: 1, endPage: 3 },
          storage,
          progress
        )

        // Verify extraction result
        expect(result.pages).toHaveLength(3)
        expect(result.totalPagesInPdf).toBe(12)
        expect(result.pdfMetadata).toBeDefined()

        // Verify progress events
        const starts = events.filter((e) => e.type === "step-start")
        const completes = events.filter((e) => e.type === "step-complete")
        const progresses = events.filter((e) => e.type === "step-progress")
        expect(starts).toHaveLength(1)
        expect(completes).toHaveLength(1)
        expect(progresses.length).toBeGreaterThanOrEqual(3)

        // Verify DB contents
        const paths = resolveBookPaths(label, booksRoot)
        const db = openBookDb(paths.dbPath)

        const pageRows = db.all(
          "SELECT * FROM pages ORDER BY page_number"
        ) as Array<{ page_id: string; page_number: number; text: string }>
        expect(pageRows).toHaveLength(3)
        expect(pageRows[0].page_id).toBe("pg001")
        expect(pageRows[2].page_id).toBe("pg003")

        const imageRows = db.all("SELECT * FROM images") as Array<{
          image_id: string
        }>
        // Each page has a page image + extracted images
        expect(imageRows.length).toBeGreaterThanOrEqual(3)

        // Verify PDF metadata stored in node_data
        const metaRows = db.all(
          "SELECT data FROM node_data WHERE node = 'metadata' AND item_id = 'book'"
        ) as Array<{ data: string }>
        expect(metaRows).toHaveLength(1)
        const metadata = BookMetadata.parse(JSON.parse(metaRows[0].data))
        expect(metadata.reasoning).toBe("Extracted from embedded PDF metadata.")

        // Verify image files exist on disk
        for (const row of imageRows) {
          const imgPath = path.join(
            paths.imagesDir,
            `${row.image_id}.png`
          )
          expect(fs.existsSync(imgPath)).toBe(true)
        }

        db.close()

        // Re-run with a smaller range; previous pages/images should be cleared first.
        await extractPDF(
          { pdfPath: RAVEN_PDF, startPage: 1, endPage: 1 },
          storage,
          progress
        )

        const dbAfterRerun = openBookDb(paths.dbPath)
        const pageRowsAfterRerun = dbAfterRerun.all(
          "SELECT page_id FROM pages ORDER BY page_number"
        ) as Array<{ page_id: string }>
        expect(pageRowsAfterRerun).toEqual([{ page_id: "pg001" }])

        const imagePageIds = dbAfterRerun.all(
          "SELECT DISTINCT page_id FROM images ORDER BY page_id"
        ) as Array<{ page_id: string }>
        expect(imagePageIds).toEqual([{ page_id: "pg001" }])
        dbAfterRerun.close()
      } finally {
        storage.close()
      }
    }
  )
})
