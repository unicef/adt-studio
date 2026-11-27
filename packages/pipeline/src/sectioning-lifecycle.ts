import { SectioningMode, PIPELINE, getStageClearOrder, type AppConfig, type ExtractRerunRequest, type StageName } from "@adt/types"
import {
  createBookStorage, withBookWriter, recoverSectioningTransition,
  writeSectioningLifecycle, assertExtractionReadable, resolveBookPaths, ExtractionAdmissionError, type Storage,
} from "@adt/storage"
import { admitExtractRerun } from "./extraction-rerun.js"
import { sectioningConfigInputs } from "./generation-config.js"
import { loadBookConfig } from "./config.js"
import { SectioningSafetyError } from "./sectioning-errors.js"

// Preserve existing imports while keeping each policy in its owning module.
export { SectioningSafetyError } from "./sectioning-errors.js"
export { requiredPartRange, activeSectioningPages } from "./sectioning-window.js"
export { sectioningReplacementSignature } from "./sectioning-replacement-signature.js"
export { createStoryboardPublication } from "./storyboard-publication.js"

export const effectiveSectioningMode = (config: AppConfig) => SectioningMode.parse(config.page_sectioning?.mode ?? "dynamic")

export const sectioningInvalidationSteps = () => {
  const affected = getStageClearOrder("sectioning")
  return PIPELINE.filter((stage) => affected.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name))
}

/** Full extraction still lacks safe downstream resume (SPEC-0010). Sectioning
 * reruns instead use SPEC-0002's version-bound protected replacement path. */
export function assertSectioningReplacementSafe(storage: Storage): void {
  if (storage.getNodeItemIds("page-sectioning").length > 0) {
    throw new SectioningSafetyError("SECTIONING_REGENERATION_BLOCKED", "Full extraction reruns cannot safely reconcile existing Sectioning. Saved manual or unknown-origin pages are kept. Run Sectioning directly in Studio. Existing-book CLI resume remains unavailable.")
  }
}

/** Today's refusal of a run from Extract on a book that already has an
 * extraction. Returns only for a book a first extraction may use. */
export function assertFirstExtraction(bookDir: string, storage: Storage): void {
  assertExtractionReadable(bookDir)
  assertSectioningReplacementSafe(storage)
  if (storage.getPages().length) {
    throw new SectioningSafetyError("SECTIONING_REGENERATION_BLOCKED", "Re-extraction of an existing book requires preservation-safe CLI/Extract admission. Existing pages and assets are kept.")
  }
}

/** `extraction` is the run request's Extract re-run field (SPEC-0003 RAC-21
 * resume, RAC-22 retry, RAC-23 replace). Without it a run from Extract is
 * refused exactly as before. */
export function prepareSectioningRun(label: string, booksRoot: string, from: StageName, _to: StageName, _configPath?: string, extraction?: ExtractRerunRequest): void {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  withBookWriter(bookDir, () => {
    recoverSectioningTransition(bookDir)
    const rerun = from === "extract" ? extraction : undefined
    // A retry exists for the record this check refuses, so a re-run is
    // admitted first. A book that is not Extract-only still gets the check.
    if (!rerun) assertExtractionReadable(bookDir)
    const storage = createBookStorage(label, booksRoot)
    try {
      if (rerun && admitExtractRerun(storage, rerun)) return
      if (from === "extract") assertFirstExtraction(bookDir, storage)
      // A re-run is admitted above or refused: it never becomes a first extraction.
      if (rerun) throw new ExtractionAdmissionError("EXTRACTION_RERUN_STALE")
    } finally { storage.close() }
  })
}

export function completeSectioning(label: string, booksRoot: string, config: AppConfig, configPath?: string): void {
  const current = loadBookConfig(label, booksRoot, configPath)
  if (JSON.stringify(sectioningConfigInputs(current)) !== JSON.stringify(sectioningConfigInputs(config))) {
    throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Configuration changed during Sectioning. The run cannot establish current output.")
  }
  const { bookDir } = resolveBookPaths(label, booksRoot)
  writeSectioningLifecycle(bookDir, effectiveSectioningMode(config), true)
}
