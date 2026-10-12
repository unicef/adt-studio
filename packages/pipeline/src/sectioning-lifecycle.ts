import fs from "node:fs"
import path from "node:path"
import {
  SectioningMode, PartManifest, PIPELINE, getStageClearOrder, getStageDependents,
  type AppConfig, type StageName,
} from "@adt/types"
import {
  createBookStorage, withBookWriter, recoverSectioningTransition,
  writeSectioningLifecycle, configHash,
  assertExtractionReadable, resolveBookPaths,
  type Storage,
} from "@adt/storage"
import { loadBookConfig } from "./config.js"
import { isFixedLayoutBook } from "./fixed-layout-rendering.js"
import { FIXED_LAYOUT_SECTIONING_NODE } from "./render-sectioning.js"

export class SectioningSafetyError extends Error {
  constructor(readonly code: "SECTIONING_REGENERATION_BLOCKED" | "STORYBOARD_INPUT_CHANGED" | "STORYBOARD_PUBLICATION_INCOMPLETE" | "STORYBOARD_PAGE_INPUT_MISSING", message: string) {
    super(message.startsWith(`${code}:`) ? message : `${code}: ${message}`)
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

/** Buffer one page until its HTML/tree pair is ready. Only a real layout switch
 * buffers the full active window; ordinary publication is incremental. */
export function createStoryboardPublication(storage: Storage, label: string, booksRoot: string, configPath?: string) {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  recoverSectioningTransition(bookDir)
  assertExtractionReadable(bookDir)
  const config = loadBookConfig(label, booksRoot, configPath)
  const pages = activeSectioningPages(storage, config, bookDir)
  const fixed = isFixedLayoutBook(config)
  const layoutSwitch = pages.some(({ pageId }) => {
    try {
      const output = storage.getLatestNodeData("web-rendering", pageId)?.data
      return output != null && (storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId)?.data != null) !== fixed
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      // Unreadable output is not usable evidence of a prior layout. Publication
      // still compares exact selected versions before replacing this page.
      return false
    }
  })
  const inputs = () => configHash(JSON.stringify({
    config: loadBookConfig(label, booksRoot, configPath),
    pages: activeSectioningPages(storage, loadBookConfig(label, booksRoot, configPath), bookDir),
    sectioning: pages.map((page) => [page.pageId, storage.getSelectedNodeVersion("page-sectioning", page.pageId)]),
    positionedText: pages.map((page) => [page.pageId, storage.getSelectedNodeVersion("positioned-text", page.pageId)]),
    images: pages.map((page) => [page.pageId, storage.getSelectedNodeVersion("image-filtering", page.pageId), storage.getPageImages(page.pageId)]),
  }))
  const captured = inputs()
  const outputVersion = (pageId: string) => configHash(JSON.stringify([
    storage.getSelectedNodeVersion("web-rendering", pageId),
    storage.getSelectedNodeVersion(FIXED_LAYOUT_SECTIONING_NODE, pageId),
  ]))
  const outputs = new Map(pages.map(({ pageId }) => [pageId, outputVersion(pageId)]))
  const pending = new Map<string, Map<string, unknown>>()
  const published = new Set<string>()
  const staged: Storage = {
    ...storage,
    getPages: () => pages,
    putNodeData(node, itemId, data) {
      if (!outputs.has(itemId) || !["web-rendering", FIXED_LAYOUT_SECTIONING_NODE].includes(node)) {
        throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Invalid Storyboard publication scope.")
      }
      const writes = pending.get(itemId) ?? new Map<string, unknown>()
      writes.set(node, structuredClone(data))
      pending.set(itemId, writes)
      return (storage.getSelectedNodeVersion(node, itemId) ?? 0) + 1
    },
    getLatestNodeData(node, itemId) {
      const writes = pending.get(itemId)
      return writes?.has(node) ? { version: 0, data: writes.get(node) } : storage.getLatestNodeData(node, itemId)
    },
  }
  function commit(pageIds: readonly string[]) {
    storage.transaction(() => {
      if (inputs() !== captured || pageIds.some((id) => outputVersion(id) !== outputs.get(id))) {
        throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Storyboard inputs changed during rendering. Retry using the current saved content.")
      }
      for (const pageId of pageIds) {
        const writes = pending.get(pageId)
        if (!writes?.has("web-rendering")) throw new SectioningSafetyError("STORYBOARD_PUBLICATION_INCOMPLETE", "Storyboard did not produce every requested page. Previous output is kept.")
        if (!writes.has(FIXED_LAYOUT_SECTIONING_NODE) && storage.getSelectedNodeVersion(FIXED_LAYOUT_SECTIONING_NODE, pageId) !== null) {
          storage.putNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId, null)
        }
        for (const [node, data] of writes) storage.putNodeData(node, pageId, data)
      }
      const downstream = getStageDependents("storyboard")
      storage.clearStepRuns(PIPELINE.filter((stage) => downstream.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name)))
    })
    for (const id of pageIds) {
      pending.delete(id)
      published.add(id)
      outputs.set(id, outputVersion(id))
    }
  }
  return {
    storage: staged,
    layoutSwitch,
    assertScope(pageIds: readonly string[]) {
      if (layoutSwitch && (pageIds.length !== pages.length || pages.some((page) => !pageIds.includes(page.pageId)))) {
        throw new SectioningSafetyError("STORYBOARD_PUBLICATION_INCOMPLETE", "A layout switch requires rendering every active page. Run the whole Storyboard stage.")
      }
    },
    discardPage(pageId: string) { pending.delete(pageId) },
    publishPage(pageId: string) { if (!layoutSwitch) commit([pageId]) },
    publish(expectedPageIds: readonly string[] = [...pending.keys()]) {
      if (layoutSwitch) {
        if (pages.some((page) => !pending.get(page.pageId)?.has("web-rendering"))) {
          throw new SectioningSafetyError("STORYBOARD_PUBLICATION_INCOMPLETE", "The layout switch did not finish every active page. Previous output and render trees are kept.")
        }
        commit(pages.map((page) => page.pageId))
      } else {
        const remaining = expectedPageIds.filter((id) => !published.has(id))
        if (remaining.length) commit(remaining)
      }
    },
  }
}
