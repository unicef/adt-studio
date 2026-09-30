import fs from "node:fs"
import path from "node:path"
import {
  SectioningMode, PartManifest, PIPELINE, getStageClearOrder, getStageDependents,
  STAGE_ORDER, type AppConfig, type StageName,
} from "@adt/types"
import {
  createBookStorage, withBookWriter, recoverSectioningTransition,
  readSectioningLifecycle, writeSectioningLifecycle, configHash,
  type Storage,
} from "@adt/storage"
import { loadBookConfig } from "./config.js"
import { preflightSectioning, SectioningPreflightError } from "./sectioning-preflight.js"

export class SectioningSafetyError extends Error {
  constructor(readonly code: "SECTIONING_REGENERATION_BLOCKED" | "SECTIONING_STALE" | "STORYBOARD_INPUT_CHANGED", message: string) {
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
    throw new SectioningSafetyError("SECTIONING_STALE", "Sectioning has not completed under the current mode, or its mode provenance is unknown. Existing content is kept. Re-run Sectioning when preservation-safe regeneration is available.")
  }
}

/** Safe rollout fallback while SPEC-0002's protection is unavailable. */
export function assertSectioningReplacementSafe(storage: Storage): void {
  if (storage.getNodeItemIds("page-sectioning").length > 0) {
    throw new SectioningSafetyError("SECTIONING_REGENERATION_BLOCKED", "Sectioning regeneration is blocked because existing manual or unknown-origin content cannot yet be protected. Saved versions are kept; mode changes do not authorize replacement.")
  }
}

export function prepareSectioningRun(label: string, booksRoot: string, from: StageName, to: StageName, configPath?: string): void {
  const bookDir = path.join(path.resolve(booksRoot), label)
  withBookWriter(bookDir, () => {
    recoverSectioningTransition(bookDir)
    const config = loadBookConfig(label, booksRoot, configPath)
    const storage = createBookStorage(label, booksRoot)
    try {
      const stages = STAGE_ORDER.slice(STAGE_ORDER.indexOf(from), STAGE_ORDER.indexOf(to) + 1)
      if (stages.includes("sectioning") || from === "extract") assertSectioningReplacementSafe(storage)
      if (from === "extract" && storage.getPages().length) {
        throw new SectioningSafetyError("SECTIONING_REGENERATION_BLOCKED", "Re-extraction of an existing book requires preservation-safe CLI/Extract admission. Existing pages and assets are kept.")
      }
      if (stages.includes("storyboard") && !stages.includes("sectioning")) assertSectioningCurrent(storage, config, bookDir)
      const lifecycle = readSectioningLifecycle(bookDir)
      if (getStageDependents("storyboard").includes(from) && lifecycle && (!lifecycle.sectioningReady || lifecycle.mode !== effectiveSectioningMode(config))) {
        throw new SectioningSafetyError("SECTIONING_STALE", "Sectioning is stale after a mode change. Downstream generation is blocked; saved output remains inspectable.")
      }
    } finally { storage.close() }
  })
}

export function completeSectioning(label: string, booksRoot: string, config: AppConfig, configPath?: string): void {
  const current = loadBookConfig(label, booksRoot, configPath)
  if (JSON.stringify(current) !== JSON.stringify(config)) {
    throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Configuration changed during Sectioning. The run cannot establish current output.")
  }
  writeSectioningLifecycle(path.join(path.resolve(booksRoot), label), effectiveSectioningMode(config), true)
}

/** Stage rendering versions in memory, then publish together in the existing
 * SQLite transaction. Provider failures/cancellation/conflicts keep the prior
 * active versions. Debug logs/screenshots are attempt evidence, not output. */
export function createStoryboardPublication(storage: Storage, label: string, booksRoot: string, configPath?: string) {
  const bookDir = path.join(path.resolve(booksRoot), label)
  const config = loadBookConfig(label, booksRoot, configPath)
  assertSectioningCurrent(storage, config, bookDir)
  const pages = activeSectioningPages(storage, config, bookDir)
  const fingerprint = () => configHash(JSON.stringify({
    config: loadBookConfig(label, booksRoot, configPath),
    lifecycle: readSectioningLifecycle(bookDir),
    pages: activeSectioningPages(storage, loadBookConfig(label, booksRoot, configPath), bookDir),
    sectioning: pages.map((page) => [page.pageId, storage.getLatestNodeData("page-sectioning", page.pageId)]),
    rendering: pages.map((page) => [page.pageId, storage.getLatestNodeData("web-rendering", page.pageId)]),
  }))
  const captured = fingerprint()
  const pending: Array<{ node: string; itemId: string; data: unknown }> = []
  const staged: Storage = {
    ...storage,
    getPages: () => pages,
    putNodeData(node, itemId, data) {
      const versions = storage.getAllNodeVersions(node, itemId)
      pending.push({ node, itemId, data: structuredClone(data) })
      return Math.max(0, ...versions.map((row) => row.version)) + pending.filter((row) => row.node === node && row.itemId === itemId).length
    },
    getLatestNodeData(node, itemId) {
      const row = [...pending].reverse().find((row) => row.node === node && row.itemId === itemId)
      return row ? { version: 0, data: row.data } : storage.getLatestNodeData(node, itemId)
    },
  }
  return {
    storage: staged,
    publish() {
      storage.transaction(() => {
        if (fingerprint() !== captured) throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Configuration or Sectioning/rendering versions changed after preflight. No rendering was published; retry against current data.")
        for (const row of pending) storage.putNodeData(row.node, row.itemId, row.data)
        const downstream = getStageDependents("storyboard")
        storage.clearStepRuns(PIPELINE.filter((stage) => downstream.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name)))
      })
    },
  }
}
