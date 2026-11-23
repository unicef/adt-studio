import fs from "node:fs"
import path from "node:path"
import { countPdfPages, computeGroups } from "@adt/pdf"
import { EXTRACTION_CONTRACT_VERSION, ExtractionInputs, PartManifest, PROJECT_IDENTITY_FILE, ProjectIdentity, type AppConfig, type ExtractionManifest } from "@adt/types"
import { extractionHash, readExtractionManifest, inspectExtractionDestination, ExtractionAdmissionError, BookBusyError, assertBookWriter, resolveBookPaths, withBookWriter } from "@adt/storage"
import type { ExtractOptions } from "./pdf-extraction.js"
import { figureExtractionFlags } from "./figure-extraction-config.js"
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
  return resolveExtraction(bookDir, options)
}

/** SPEC-0003 RAC-22/23, reset step 2: what a retry or replace will extract,
 * resolved as initial admission resolves it, before anything is discarded.
 * `previous` is the book's extraction record when it has a readable one. The
 * PDF must still be the one that record and the project identity name. Reads
 * only: any refusal leaves the book untouched. */
export function prepareExtractionReset(bookDir: string, options: ExtractOptions, previous: ExtractionManifest | null) {
  return resolveExtraction(bookDir, options, { previous })
}

/** The source of a reset is the PDF the project was created from. */
function assertResetSource(bookDir: string, sourceHash: string): "reset" {
  const file = path.join(bookDir, PROJECT_IDENTITY_FILE)
  if (fs.existsSync(file)) {
    const identity = ProjectIdentity.safeParse(JSON.parse(fs.readFileSync(file, "utf8")))
    if (identity.data?.sourceKind !== "pdf" || identity.data.sourceFingerprint !== sourceHash) throw new ExtractionAdmissionError("EXTRACTION_SOURCE_CHANGED")
  }
  return "reset"
}

interface ResolvedExtraction<Outcome> { pdfBuffer: Buffer; sourceHash: string; inputs: ExtractionInputs; outcome: Outcome; expectedPages: number }
function resolveExtraction(bookDir: string, options: ExtractOptions): ResolvedExtraction<"initial" | "reused">
function resolveExtraction(bookDir: string, options: ExtractOptions, reset: { previous: ExtractionManifest | null }): ResolvedExtraction<"reset">
function resolveExtraction(bookDir: string, options: ExtractOptions, reset?: { previous: ExtractionManifest | null }): ResolvedExtraction<"initial" | "reused" | "reset"> {
  assertBookWriter(bookDir)
  try {
    const previous = reset ? reset.previous : readExtractionManifest(bookDir)
    if (!reset && previous && previous.status !== "complete") throw new ExtractionAdmissionError("EXTRACTION_INCOMPLETE")
    const pdfBuffer = fs.readFileSync(options.pdfPath)
    const sourceHash = extractionHash(pdfBuffer)
    if (previous && sourceHash !== previous.sourceHash) throw new ExtractionAdmissionError("EXTRACTION_SOURCE_CHANGED")
    const count = countPdfPages(pdfBuffer)
    let startPage = options.startPage ?? 1
    let endPage = options.endPage ?? count
    const partFile = path.join(bookDir, "part.json")
    if (fs.existsSync(partFile)) {
      const { range } = PartManifest.parse(JSON.parse(fs.readFileSync(partFile, "utf8")))
      // A mandatory part window cannot be shortened like an optional CLI end.
      if (range.endPage > count) throw new Error("Part window exceeds source PDF")
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
    const outcome = reset ? assertResetSource(bookDir, sourceHash) : inspectExtractionDestination(bookDir, sourceHash, inputs)
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
