import fs from "node:fs"
import path from "node:path"
import { countPdfPages, computeGroups } from "@adt/pdf"
import { EXTRACTION_CONTRACT_VERSION, ExtractionInputs, PartManifest, type AppConfig } from "@adt/types"
import { extractionHash, readExtractionManifest, inspectExtractionDestination, ExtractionAdmissionError, BookBusyError, assertBookWriter, resolveBookPaths, withBookWriter } from "@adt/storage"
import type { ExtractOptions } from "./pdf-extraction.js"
import { figureExtractionFlags } from "./pdf-extraction.js"
import { isFixedLayoutBook } from "./fixed-layout-rendering.js"
import { loadBookConfig } from "./config.js"

/** The same production resolver feeds API, CLI and the extraction fingerprint. */
export function extractionOptionsFromConfig(pdfPath: string, config: AppConfig): ExtractOptions {
  return {
    pdfPath,
    startPage: config.start_page,
    endPage: config.end_page,
    spreadMode: config.spread_mode,
    spreadPairs: config.spread_pairs,
    ...figureExtractionFlags(config),
    removeWatermarks: config.remove_watermarks === true,
    fixedLayout: isFixedLayoutBook(config),
  }
}

export function prepareExtractionAdmission(bookDir: string, options: ExtractOptions) {
  assertBookWriter(bookDir)
  try {
    const previous = readExtractionManifest(bookDir)
    if (previous && previous.status !== "complete") throw new ExtractionAdmissionError("EXTRACTION_INCOMPLETE")
    const pdfBuffer = fs.readFileSync(options.pdfPath)
    const sourceHash = extractionHash(pdfBuffer)
    if (previous && sourceHash !== previous.sourceHash) throw new ExtractionAdmissionError("EXTRACTION_SOURCE_CHANGED")
    const count = countPdfPages(pdfBuffer)
    let startPage = options.startPage ?? 1
    let endPage = options.endPage ?? count
    const partFile = path.join(bookDir, "part.json")
    if (fs.existsSync(partFile)) {
      const { range } = PartManifest.parse(JSON.parse(fs.readFileSync(partFile, "utf8")))
      if ((options.startPage !== undefined && options.startPage !== range.startPage) ||
        (options.endPage !== undefined && options.endPage !== range.endPage)) throw new Error("Part window is fixed")
      startPage = range.startPage
      endPage = range.endPage
    }
    if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1 || endPage < startPage || startPage > count) throw new Error("Invalid window")
    endPage = Math.min(endPage, count)
    if (options.spreadPairs?.some((n) => !Number.isInteger(n) || n < 1)) throw new Error("Invalid spreads")
    const spreadMode = options.spreadMode ?? false
    const groups = computeGroups(startPage - 1, endPage, { spreadMode, spreadPairs: options.spreadPairs })
    const inputs = ExtractionInputs.parse({
      contractVersion: EXTRACTION_CONTRACT_VERSION,
      startPage, endPage, spreadMode,
      // Keep only effective manual pairs, in extraction order (ignore duplicates,
      // out-of-window pairs and pairs shadowed by the extractor's greedy rule).
      spreadPairs: spreadMode ? [] : groups.filter((g) => g.length === 2).map((g) => g[0] + 1),
      vectorTextGrouping: options.vectorTextGrouping ?? true,
      keepCoveredRasters: options.keepCoveredRasters ?? false,
      removeWatermarks: options.removeWatermarks ?? false,
      fixedLayout: options.fixedLayout ?? false,
    })
    const outcome = inspectExtractionDestination(bookDir, sourceHash, inputs)
    return { pdfBuffer, sourceHash, inputs, outcome, expectedPages: groups.length }
  } catch (error) {
    if (error instanceof ExtractionAdmissionError || error instanceof BookBusyError) throw error
    throw new ExtractionAdmissionError("EXTRACTION_INPUT_INVALID")
  }
}

/** A reused extraction cannot enter the legacy full-stage/DAG body. */
export function assertSafeExtractionRun(label: string, booksRoot: string, configPath?: string): void {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  withBookWriter(bookDir, () => {
    const config = loadBookConfig(label, booksRoot, configPath)
    const admission = prepareExtractionAdmission(bookDir, extractionOptionsFromConfig(path.join(bookDir, `${label}.pdf`), config))
    if (admission.outcome === "reused") throw new ExtractionAdmissionError("UNSAFE_RESUME_UNAVAILABLE")
  })
}
