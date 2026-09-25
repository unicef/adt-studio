import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { extractPdfStream, samplePageEdges } from "@adt/pdf"
import type { Storage } from "@adt/storage"
import { getStorageBookDir, withBookWriter, extractionHash, writeExtractionManifest, hashExtractionAsset, flushExtractionAsset, syncDirectory, verifyExtractionInventory, ExtractionAdmissionError } from "@adt/storage"
import type { ExtractionManifest } from "@adt/types"
import { prepareExtractionAdmission } from "./extraction-admission.js"
import type { AppConfig, FigureExtractionMode } from "@adt/types"
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

/** Resolve the new mode while preserving the behavior of existing books. */
export function resolveFigureExtractionMode(
  config: Pick<AppConfig, "figure_extraction_mode" | "vector_text_grouping">,
): FigureExtractionMode {
  if (config.figure_extraction_mode) return config.figure_extraction_mode
  return config.vector_text_grouping === false ? "off" : "all"
}

/** The extraction flags derived from the resolved figure-extraction mode. */
export function figureExtractionFlags(
  config: Pick<AppConfig, "figure_extraction_mode" | "vector_text_grouping">,
): { vectorTextGrouping: boolean; keepCoveredRasters: boolean } {
  const mode = resolveFigureExtractionMode(config)
  return { vectorTextGrouping: mode !== "off", keepCoveredRasters: mode === "auto" }
}

export interface ExtractOptions {
  pdfPath: string
  startPage?: number
  endPage?: number
  spreadMode?: boolean
  spreadPairs?: number[]
  vectorTextGrouping?: boolean
  /** Keep standalone rasters whose artwork a composite figure absorbed
   *  (figure-extraction "auto"); meaningfulness dedups downstream. */
  keepCoveredRasters?: boolean
  /** Detect and remove repeated identical text stamps (watermarks) from
   *  page renders, figure crops, and extracted text. */
  removeWatermarks?: boolean
  /** Whether the book renders fixed-layout. Gates the entire positioned-text
   *  extraction pipeline (stream-order recorder + paragraph parsing), which is
   *  consumed only by fixed-layout rendering, and enables the metric-based
   *  spacing cleanup. Reflowable books skip all of it. */
  fixedLayout?: boolean
  fontsCacheDir?: string
  signal?: AbortSignal
}

export async function extractPDF(
  options: ExtractOptions,
  storage: Storage,
  progress: Progress
): Promise<"extracted" | "reused"> {
  const bookDir = getStorageBookDir(storage)
  return withBookWriter(bookDir, async () => {
    const admission = prepareExtractionAdmission(bookDir, options)
    if (admission.outcome === "reused") return "reused"
    options.signal?.throwIfAborted()
    const manifest: ExtractionManifest = {
      schemaVersion: 1, attemptId: randomUUID(), status: "extracting",
      sourceHash: admission.sourceHash, inputs: admission.inputs,
      inputFingerprint: extractionHash(JSON.stringify(admission.inputs)),
      pages: [], assets: [], nodes: [], images: [],
    }
    writeExtractionManifest(bookDir, manifest)
    try {
      const sourceName = `${path.basename(bookDir)}.pdf`
      const snapshotPath = path.join(bookDir, sourceName)
      if (!fs.existsSync(snapshotPath)) fs.writeFileSync(snapshotPath, admission.pdfBuffer, { flag: "wx" })
      const snapshot = fs.readFileSync(snapshotPath)
      if (extractionHash(snapshot) !== admission.sourceHash) throw new ExtractionAdmissionError("EXTRACTION_SOURCE_CHANGED")
      await extractInitialPDF({ ...options, ...admission.inputs, pdfPath: snapshotPath }, storage, progress, snapshot, manifest)
      options.signal?.throwIfAborted()
      if (manifest.pages.length !== admission.expectedPages || manifest.pages.length === 0) throw new ExtractionAdmissionError("EXTRACTION_INCOMPLETE")
      manifest.assets.push({ path: sourceName, hash: admission.sourceHash })
      for (const asset of manifest.assets) flushExtractionAsset(bookDir, asset.path)
      flushExtractionAsset(bookDir, `${path.basename(bookDir)}.db`)
      syncDirectory(path.join(bookDir, "images"))
      manifest.status = "complete"
      verifyExtractionInventory(bookDir, manifest)
      writeExtractionManifest(bookDir, manifest)
    } catch (error) {
      // Keep the attempt and all partial output. A failed diagnostics write must
      // never turn the existing extracting record into a reusable extraction.
      manifest.status = "failed"
      writeExtractionManifest(bookDir, manifest)
      progress.emit({ type: "step-error", step: "extract", error: "EXTRACTION_INCOMPLETE: Extraction did not complete; partial data was retained." })
      throw error
    }
    progress.emit({ type: "step-complete", step: "extract" })
    return "extracted"
  })
}

async function extractInitialPDF(
  options: ExtractOptions, storage: Storage, progress: Progress,
  pdfBuffer: Buffer, manifest: ExtractionManifest,
): Promise<void> {
  const bookDir = getStorageBookDir(storage)
  const putExtractionNode = (node: string, itemId: string, data: unknown) => {
    const version = storage.putNodeData(node, itemId, data)
    manifest.nodes.push({ node, itemId, version, hash: extractionHash(JSON.stringify(data)) })
  }
  const { startPage, endPage, spreadMode, spreadPairs, vectorTextGrouping, keepCoveredRasters, removeWatermarks, fixedLayout, fontsCacheDir } =
    options

  progress.emit({ type: "step-start", step: "extract" })

  // Let the event loop turn once so `step-start` (already written to step_runs
  // and queued on the SSE stream) can reach the client before the synchronous
  // setup below — readFileSync of the whole PDF, then mupdf WASM open/metadata/
  // page-count — blocks it. setImmediate rather than setTimeout: resuming from
  // the check phase means the poll phase in between has serviced pending socket
  // reads. Measured on a 5.7MB book this cuts the first GET /step-status from
  // ~640ms to ~380ms (warm) and ~2.2s to ~1.9s (cold); it does not close the
  // gap on its own, since extraction keeps the loop busy afterwards. The
  // client-side optimistic "queued" state is what actually makes the UI
  // immediate — this just gets the authoritative status out sooner.
  await new Promise((resolve) => setImmediate(resolve))

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

  const { pdfMetadata, pages } = extractPdfStream(
    { pdfBuffer, startPage, endPage, spreadMode, spreadPairs, vectorTextGrouping, keepCoveredRasters, removeWatermarks, fixedLayout },
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

  putExtractionNode("metadata", "book", toBookMetadata(pdfMetadata))

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
    options.signal?.throwIfAborted()
    storage.putExtractedPage(page)
    manifest.pages.push({ pageId: page.pageId, pageNumber: page.pageNumber, textHash: extractionHash(page.text) })
    for (const image of [page.pageImage, ...page.images]) {
      const relative = storage.getImageMeta(image.imageId)?.relativePath
      if (!relative) throw new ExtractionAdmissionError("EXTRACTION_ASSETS_INVALID")
      manifest.assets.push({ path: relative, hash: hashExtractionAsset(bookDir, relative) })
      manifest.images.push({ imageId: image.imageId, pageId: page.pageId, path: relative, width: image.width, height: image.height })
    }
    // Store positioned text (paragraphs + viewport dims). Always available so
    // fixed-layout rendering doesn't need a separate pre-extraction step.
    putExtractionNode("positioned-text", page.pageId, page.positionedText)
    // Store extraction debug info (grouping decisions, render method choices)
    if (page.extractionDebug) {
      putExtractionNode("extraction-debug", page.pageId, page.extractionDebug)
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
  putExtractionNode("spread-suggestions", "book", {
    suggestions: !spreadMode && edgeSamples.length >= 2 ? detectSpreads(edgeSamples) : [],
  })

  // Book-level font profile: the dominant body-text category (serif vs sans)
  // across all pages, used to pick a reflowable base font. null when the book
  // has no extractable text.
  const category =
    serifChars === 0 && sansChars === 0 ? null : serifChars >= sansChars ? "serif" : "sans"
  putExtractionNode("font-profile", "book", { category, serifChars, sansChars })

  // Book-level type scale: baseline size per text role, derived from the
  // extracted font sizes. Shared as CSS tokens at render time so every page
  // renders paragraphs/headings at the same size. null when no text.
  const typeScale = deriveTypeScaleFromHistogram(sizeHist)
  if (typeScale) putExtractionNode(TYPE_SCALE_NODE, TYPE_SCALE_ITEM, typeScale)
}
