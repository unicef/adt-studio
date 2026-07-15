import fs from "node:fs"
import { extractPdfStream, type ExtractStreamResult } from "@adt/pdf"
import type { Storage } from "@adt/storage"
import type { Progress } from "./progress.js"
import { toBookMetadata } from "./metadata-model.js"
import { ensureBookGoogleFontsCached } from "./fonts-bundle.js"

export interface ExtractOptions {
  pdfPath: string
  startPage?: number
  endPage?: number
  spreadMode?: boolean
  vectorTextGrouping?: boolean
  /** Whether the book renders fixed-layout. Gates the entire positioned-text
   *  extraction pipeline (stream-order recorder + paragraph parsing), which is
   *  consumed only by fixed-layout rendering, and enables the metric-based
   *  spacing cleanup. Reflowable books skip all of it. */
  fixedLayout?: boolean
  fontsCacheDir?: string
}

export async function extractPDF(
  options: ExtractOptions,
  storage: Storage,
  progress: Progress
): Promise<void> {
  const { pdfPath, startPage, endPage, spreadMode, vectorTextGrouping, fixedLayout, fontsCacheDir } =
    options

  progress.emit({ type: "step-start", step: "extract" })

  try {
    if (fontsCacheDir) {
      progress.emit({ type: "step-progress", step: "extract", message: "Caching book fonts..." })
      const { failed } = await ensureBookGoogleFontsCached(storage, fontsCacheDir)
      for (const f of failed) {
        progress.emit({
          type: "step-progress",
          step: "extract",
          message: `Font "${f.family}" could not be downloaded yet (${f.error}) — will retry at package time`,
        })
      }
    }

    const pdfBuffer = fs.readFileSync(pdfPath)

    const { pdfMetadata, pages } = extractPdfStream(
      { pdfBuffer, startPage, endPage, spreadMode, vectorTextGrouping, fixedLayout },
      (p) => {
        progress.emit({
          type: "step-progress",
          step: "extract",
          message: `page ${p.page}/${p.totalPages}`,
          page: p.page,
          totalPages: p.totalPages,
        })
      }
    )

    storage.clearExtractedData()
    storage.putNodeData("metadata", "book", toBookMetadata(pdfMetadata))

    let serifChars = 0
    let sansChars = 0
    for await (const page of pages) {
      storage.putExtractedPage(page)
      // Store positioned text (paragraphs + viewport dims). Always available so
      // fixed-layout rendering doesn't need a separate pre-extraction step.
      storage.putNodeData("positioned-text", page.pageId, page.positionedText)
      // Store extraction debug info (grouping decisions, render method choices)
      if (page.extractionDebug) {
        storage.putNodeData("extraction-debug", page.pageId, page.extractionDebug)
      }
      serifChars += page.fontStats?.serifChars ?? 0
      sansChars += page.fontStats?.sansChars ?? 0
    }

    // Book-level font profile: the dominant body-text category (serif vs sans)
    // across all pages, used to pick a reflowable base font. null when the book
    // has no extractable text.
    const category =
      serifChars === 0 && sansChars === 0 ? null : serifChars >= sansChars ? "serif" : "sans"
    storage.putNodeData("font-profile", "book", { category, serifChars, sansChars })

    progress.emit({ type: "step-complete", step: "extract" })
  } catch (err) {
    progress.emit({
      type: "step-error",
      step: "extract",
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
