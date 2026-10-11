import fs from "node:fs"
import path from "node:path"
import {
  SectioningMode, PartManifest, PIPELINE, getStageClearOrder, getStageDependents,
  STAGE_ORDER, type AppConfig, type StageName,
} from "@adt/types"
import {
  createBookStorage, withBookWriter, recoverSectioningTransition,
  readSectioningLifecycle, writeSectioningLifecycle, configHash,
  assertExtractionReadable, resolveBookPaths,
  type Storage,
} from "@adt/storage"
import { loadBookConfig } from "./config.js"
import { preflightSectioning, SectioningPreflightError } from "./sectioning-preflight.js"
import { FIXED_LAYOUT_SECTIONING_NODE } from "./render-sectioning.js"
import { PageSectioningOutput, WebRenderingOutput } from "@adt/types"
import { stampGeneratedRendering } from "./sectioning-sync-evidence.js"
import { reconcileTextCatalog } from "./catalog-reconciliation.js"

export class SectioningSafetyError extends Error {
  constructor(readonly code: "SECTIONING_REGENERATION_BLOCKED" | "SECTIONING_STALE" | "STORYBOARD_INPUT_CHANGED" | "STORYBOARD_PUBLICATION_INCOMPLETE", message: string) {
    super(message)
    this.name = "SectioningSafetyError"
  }
}

export const effectiveSectioningMode = (config: AppConfig) => SectioningMode.parse(config.page_sectioning?.mode ?? "dynamic")
export const sectioningInvalidationSteps = () => {
  const affected = getStageClearOrder("sectioning")
  return PIPELINE.filter((stage) => affected.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name))
}

export function activeSectioningPages(storage: Storage, config: AppConfig, bookDir: string) {
  const partFile = path.join(bookDir, "part.json")
  const range = fs.existsSync(partFile)
    ? PartManifest.parse(JSON.parse(fs.readFileSync(partFile, "utf8"))).range
    : null
  const start = range?.startPage ?? config.start_page ?? 1
  const end = range?.endPage ?? config.end_page ?? Infinity
  return storage.getPages().filter((page) => page.pageNumber >= start && page.pageNumber <= end)
}

export function assertPersistedSectioning(storage: Storage, config: AppConfig, bookDir: string): void {
  const pages = activeSectioningPages(storage, config, bookDir)
  const values = new Map<string, unknown>()
  for (const page of pages) {
    try {
      const row = storage.getLatestNodeData("page-sectioning", page.pageId)
      if (row) values.set(page.pageId, row.data)
      else if (storage.getAllNodeVersions("page-sectioning", page.pageId).length) values.set(page.pageId, null)
    } catch { values.set(page.pageId, null) }
  }
  const result = preflightSectioning(effectiveSectioningMode(config), pages, values)
  if (result.total) throw new SectioningPreflightError(result)
}

export function assertSectioningCurrent(storage: Storage, config: AppConfig, bookDir: string): void {
  assertPersistedSectioning(storage, config, bookDir)
  const lifecycle = readSectioningLifecycle(bookDir)
  if (!lifecycle?.sectioningReady || lifecycle.mode !== effectiveSectioningMode(config)) {
    throw new SectioningSafetyError("SECTIONING_STALE", "Sectioning has not completed under the current mode, or its mode provenance is unknown. Existing content is kept. Re-run Sectioning; incompatible protected pages require explicit replacement confirmation.")
  }
}

/** Legacy callers cannot acquire destructive full-run admission. SPEC-0010
 * prepares each resumed stage through the shared preservation-aware planner. */
export function assertSectioningReplacementSafe(storage: Storage): void {
  if (storage.getNodeItemIds("page-sectioning").length > 0) {
    throw new SectioningSafetyError("SECTIONING_REGENERATION_BLOCKED", "Full extraction reruns cannot safely reconcile existing Sectioning. Saved manual or unknown-origin pages are kept. Run Sectioning directly, or use the verified CLI Sectioning–Storyboard range with explicit replacement confirmation.")
  }
}

export function prepareSectioningRun(label: string, booksRoot: string, from: StageName, to: StageName, configPath?: string): void {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  withBookWriter(bookDir, () => {
    recoverSectioningTransition(bookDir)
    assertExtractionReadable(bookDir)
    const config = loadBookConfig(label, booksRoot, configPath)
    const storage = createBookStorage(label, booksRoot)
    try {
      const stages = STAGE_ORDER.slice(STAGE_ORDER.indexOf(from), STAGE_ORDER.indexOf(to) + 1)
      if (from === "extract") assertSectioningReplacementSafe(storage)
      if (from === "extract" && storage.getPages().length) {
        throw new SectioningSafetyError("SECTIONING_REGENERATION_BLOCKED", "Re-extraction of an existing book requires preservation-safe CLI/Extract admission. Existing pages and assets are kept.")
      }
      if (stages.includes("storyboard") && !stages.includes("sectioning")) assertSectioningCurrent(storage, config, bookDir)
      const lifecycle = readSectioningLifecycle(bookDir)
      if (getStageDependents("storyboard").includes(from) && lifecycle && (!lifecycle.sectioningReady || lifecycle.mode !== effectiveSectioningMode(config))) {
        throw new SectioningSafetyError("SECTIONING_STALE", "Sectioning is stale after a mode change. Downstream generation is blocked; saved output remains inspectable.")
      }
      if (getStageDependents("storyboard").includes(from) && lifecycle?.storyboardPending) {
        throw new SectioningSafetyError("SECTIONING_STALE", "Storyboard still contains retained output from before Sectioning changed. Run Storyboard for the active book before generating downstream output or exporting it.")
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
  const storage = createBookStorage(label, booksRoot)
  try {
    // Skipping protected work is not proof of compatibility. Validate the
    // complete persisted active window, including every retained page.
    assertPersistedSectioning(storage, config, bookDir)
    writeSectioningLifecycle(bookDir, effectiveSectioningMode(config), true)
  } finally { storage.close() }
}

/** Stage rendering versions in memory, then publish together in the existing
 * SQLite transaction. Provider failures/cancellation/conflicts keep the prior
 * active versions. Debug logs/screenshots are attempt evidence, not output. */
export function createStoryboardPublication(storage: Storage, label: string, booksRoot: string, configPath?: string, selectedPageIds?: string[], stampOutput = true) {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  recoverSectioningTransition(bookDir)
  assertExtractionReadable(bookDir)
  const config = loadBookConfig(label, booksRoot, configPath)
  assertSectioningCurrent(storage, config, bookDir)
  const allPages = activeSectioningPages(storage, config, bookDir)
  const pages = selectedPageIds ? allPages.filter((page) => selectedPageIds.includes(page.pageId)) : allPages
  const fingerprint = () => configHash(JSON.stringify({
    config: loadBookConfig(label, booksRoot, configPath),
    lifecycle: readSectioningLifecycle(bookDir),
    pages: activeSectioningPages(storage, loadBookConfig(label, booksRoot, configPath), bookDir),
    sectioning: pages.map((page) => [page.pageId, storage.getLatestNodeData("page-sectioning", page.pageId)]),
    rendering: pages.map((page) => [page.pageId, storage.getLatestNodeData("web-rendering", page.pageId)]),
    positioned: pages.map((page) => [page.pageId, storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, page.pageId)]),
  }))
  const captured = fingerprint()
  const pending: Array<{ node: string; itemId: string; data: unknown }> = []
  const staged: Storage = {
    ...storage,
    close() {},
    getPages: () => pages,
    putNodeData(node, itemId, data) {
      const versions = storage.getAllNodeVersions(node, itemId)
      pending.push({ node, itemId, data: structuredClone(data) })
      return Math.max(0, ...versions.map((row) => row.version)) + pending.filter((row) => row.node === node && row.itemId === itemId).length
    },
    getLatestNodeData(node, itemId) {
      const row = [...pending].reverse().find((row) => row.node === node && row.itemId === itemId)
      return row ? { version: Math.max(0, ...storage.getAllNodeVersions(node, itemId).map((value) => value.version)) + pending.filter((value) => value.node === node && value.itemId === itemId).length, data: row.data } : storage.getLatestNodeData(node, itemId)
    },
  }
  return {
    storage: staged,
    publish(expectedPageIds: readonly string[] = []) {
      storage.transaction(() => {
        if (fingerprint() !== captured) throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Configuration or Sectioning/rendering versions changed after preflight. No rendering was published; retry against current data.")
        const rendered = new Set(pending.filter((row) => row.node === "web-rendering" && row.data != null).map((row) => row.itemId))
        if (expectedPageIds.some((pageId) => !rendered.has(pageId))) {
          throw new SectioningSafetyError("STORYBOARD_PUBLICATION_INCOMPLETE", "Storyboard did not produce output for every requested page. Previous output and render trees are kept; check the page inputs before retrying.")
        }
        const positioned = new Set(pending.filter((row) => row.node === FIXED_LAYOUT_SECTIONING_NODE).map((row) => row.itemId))
        for (const row of pending) {
          if (row.node === "web-rendering"
            && !positioned.has(row.itemId)
            && storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, row.itemId)?.data != null) {
            // This page now renders from semantic Sectioning. Deactivate the
            // old positioned tree only when its replacement HTML publishes;
            // cancellation/conflict/transaction failure leaves both intact.
            storage.putNodeData(FIXED_LAYOUT_SECTIONING_NODE, row.itemId, null)
          }
          const semantic = storage.getLatestNodeData("page-sectioning", row.itemId)
          const source = PageSectioningOutput.safeParse(semantic?.data)
          const renderedOutput = WebRenderingOutput.safeParse(row.data)
          // Whole-stage generation owns all returned sections. Targeted repair
          // supplies evidence itself and retains untouched siblings' evidence.
          const data = stampOutput && row.node === "web-rendering" && !positioned.has(row.itemId) && source.success && renderedOutput.success
            ? stampGeneratedRendering(renderedOutput.data, source.data, row.itemId, semantic!.version)
            : row.data
          storage.putNodeData(row.node, row.itemId, data)
        }
        const downstream = getStageDependents("storyboard")
        reconcileTextCatalog(storage, { preserveRendering: true })
        storage.clearStepRuns(PIPELINE.filter((stage) => downstream.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name)))
      })
      // Clear the conservative mode-change barrier only after the entire active
      // rendering set commits. A crash or metadata-write failure leaves it
      // blocked, never marks an incomplete/rolled-back layout as usable.
      const rendered = new Set(pending.filter((row) => row.node === "web-rendering" && row.data != null).map((row) => row.itemId))
      if (!selectedPageIds && pages.every((page) => rendered.has(page.pageId))) {
        writeSectioningLifecycle(bookDir, effectiveSectioningMode(config), true, false)
      }
    },
  }
}
