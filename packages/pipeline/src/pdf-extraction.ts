import fs from "node:fs"
import { extractPdfStream, samplePageEdges, type ExtractStreamResult } from "@adt/pdf"
import type { Storage } from "@adt/storage"
import type { Progress } from "./progress.js"
import { toBookMetadata } from "./metadata-model.js"
import { ensureBookGoogleFontsCached } from "./fonts-bundle.js"
import {
  tallyFontSizes,
  mergeTallies,
  deriveTypeScaleFromHistogram,
  TYPE_SCALE_NODE,
  TYPE_SCALE_ITEM,
} from "./type-scale.js"
import { detectSpreads, type SpreadEdgeSample } from "./spread-detection.js"

export interface ExtractOptions {
  pdfPath: string
  startPage?: number
  endPage?: number
  spreadMode?: boolean
  spreadPairs?: number[]
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
  const { pdfPath, startPage, endPage, spreadMode, spreadPairs, vectorTextGrouping, fixedLayout, fontsCacheDir } =
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
      { pdfBuffer, startPage, endPage, spreadMode, spreadPairs, vectorTextGrouping, fixedLayout },
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
    // Character-weighted font-size histogram across all pages, used to derive
    // the book-wide type scale (body + heading tiers) below.
    const sizeHist = new Map<number, number>()
    // In single-page mode, sample each page's inner edges as we go so we can
    // suggest likely spreads afterwards — the page render is already in hand,
    // so this is essentially free (no second pass over the images).
    const edgeSamples: SpreadEdgeSample[] = []
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
      mergeTallies(sizeHist, tallyFontSizes(page.positionedText))

      if (!spreadMode) {
        try {
          const { leftEdge, rightEdge } = samplePageEdges(page.pageImage.buffer)
          edgeSamples.push({
            pageNumber: page.pageNumber,
            leftEdge,
            rightEdge,
            textLength: page.text?.length ?? 0,
          })
        } catch {
          // Non-fatal — spread suggestions are best-effort.
        }
      }
    }

    // Store spread suggestions (single-page base only). Empty array clears any
    // stale suggestions from a previous run.
    storage.putNodeData("spread-suggestions", "book", {
      suggestions: !spreadMode && edgeSamples.length >= 2 ? detectSpreads(edgeSamples) : [],
    })

    // Book-level font profile: the dominant body-text category (serif vs sans)
    // across all pages, used to pick a reflowable base font. null when the book
    // has no extractable text.
    const category =
      serifChars === 0 && sansChars === 0 ? null : serifChars >= sansChars ? "serif" : "sans"
    storage.putNodeData("font-profile", "book", { category, serifChars, sansChars })

    // Book-level type scale: baseline size per text role, derived from the
    // extracted font sizes. Shared as CSS tokens at render time so every page
    // renders paragraphs/headings at the same size. null when no text.
    const typeScale = deriveTypeScaleFromHistogram(sizeHist)
    if (typeScale) storage.putNodeData(TYPE_SCALE_NODE, TYPE_SCALE_ITEM, typeScale)

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
