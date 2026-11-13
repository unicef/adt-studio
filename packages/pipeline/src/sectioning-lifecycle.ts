import { SectioningMode, PIPELINE, getStageClearOrder, type AppConfig, type StageName } from "@adt/types"
import {
  createBookStorage, withBookWriter, recoverSectioningTransition,
  writeSectioningLifecycle, assertExtractionReadable, resolveBookPaths, type Storage,
} from "@adt/storage"
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

export function prepareSectioningRun(label: string, booksRoot: string, from: StageName, _to: StageName, _configPath?: string): void {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  withBookWriter(bookDir, () => {
    recoverSectioningTransition(bookDir)
    assertExtractionReadable(bookDir)
    const storage = createBookStorage(label, booksRoot)
    try {
      if (from === "extract") assertSectioningReplacementSafe(storage)
      if (from === "extract" && storage.getPages().length) {
        throw new SectioningSafetyError("SECTIONING_REGENERATION_BLOCKED", "Re-extraction of an existing book requires preservation-safe CLI/Extract admission. Existing pages and assets are kept.")
      }
    } finally { storage.close() }
  })
}

export function completeSectioning(label: string, booksRoot: string, config: AppConfig, configPath?: string): void {
  const current = loadBookConfig(label, booksRoot, configPath)
  if (JSON.stringify(current) !== JSON.stringify(config)) {
    throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Configuration changed during Sectioning. The run cannot establish current output.")
  }
  const { bookDir } = resolveBookPaths(label, booksRoot)
  writeSectioningLifecycle(bookDir, effectiveSectioningMode(config), true)
}
