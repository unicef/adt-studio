import { captureStoryboardSource, publishStoryboardSource } from "./storyboard-source-state.js"
import fs from "node:fs"
import path from "node:path"
import {
  SectioningMode, PartManifest, PIPELINE, getStageClearOrder,
  type AppConfig, type StageName,
} from "@adt/types"
import {
  createBookStorage, withBookWriter, recoverSectioningTransition,
  writeSectioningLifecycle, configHash,
  assertExtractionReadable, resolveBookPaths,
  type Storage,
} from "@adt/storage"
import { withSourceGenerationTracking } from "./source-generation-state.js"
import { BOOK_OUTLINE_NODE, BOOK_OUTLINE_ITEM } from "./book-outline.js"
import { TYPE_SCALE_NODE, TYPE_SCALE_ITEM } from "./type-scale.js"
import { loadBookConfig } from "./config.js"
import { isFixedLayoutBook } from "./fixed-layout-rendering.js"
import { FIXED_LAYOUT_SECTIONING_NODE, publishedPageLayouts } from "./render-sectioning.js"
import { createPromptEngine } from "@adt/llm"
import { buildPageSectioningConfig } from "./page-sectioning.js"
import { buildTranslationConfig } from "./translation.js"
import { buildBookOutlineConfig, readBookOutline } from "./book-outline.js"

export class SectioningSafetyError extends Error {
  readonly status = 409

  constructor(readonly code: "PACKAGE_RECOVERY_UNSAFE" | "STORYBOARD_PAGE_OUTSIDE_WINDOW" | "PACKAGE_INPUTS_CHANGED" | "PACKAGE_FILES_INCOMPLETE" | "SECTIONING_WINDOW_INVALID" | "SECTIONING_REGENERATION_BLOCKED" | "STORYBOARD_INPUT_CHANGED" | "STORYBOARD_PUBLICATION_INCOMPLETE" | "STORYBOARD_PAGE_INPUT_MISSING", message: string) {
    super(message.startsWith(`${code}:`) ? message : `${code}: ${message}`)
    this.name = "SectioningSafetyError"
  }
}

export const effectiveSectioningMode = (config: AppConfig) => SectioningMode.parse(config.page_sectioning?.mode ?? "dynamic")

/** Dynamic Liquid includes cannot use the prompt engine's static fingerprint.
 * For that uncommon case bind the complete prompt roots conservatively, so a
 * changed include cannot spend old consent. This is admission, not cache state. */
function promptRootBasis(roots: readonly string[]): unknown[] {
  const visited = new Set<string>()
  const visit = (file: string): unknown[] => {
    try {
      const actual = fs.realpathSync(file)
      if (visited.has(actual)) return [file, actual]
      visited.add(actual)
      if (fs.statSync(actual).isDirectory()) return [file, ...fs.readdirSync(actual).sort().map(name => visit(path.join(actual, name)))]
      return [file, configHash(fs.readFileSync(actual, "utf8"))]
    } catch (error) { return [file, (error as NodeJS.ErrnoException).code ?? "unreadable"] }
  }
  return roots.map(visit)
}
export const sectioningInvalidationSteps = () => {
  const affected = getStageClearOrder("sectioning")
  return PIPELINE.filter((stage) => affected.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name))
}

export function requiredPartRange(bookDir: string) {
  const partFile = path.join(bookDir, "part.json")
  try { return PartManifest.parse(JSON.parse(fs.readFileSync(partFile, "utf8"))).range }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw new SectioningSafetyError("SECTIONING_WINDOW_INVALID", "The saved part window is invalid or unreadable. Restore a valid part manifest before running this book. Saved content is retained.")
  }
}

export function activeSectioningPages(storage: Storage, config: AppConfig, bookDir: string) {
  const range = requiredPartRange(bookDir)
  const start = range?.startPage ?? config.start_page ?? 1
  const end = range?.endPage ?? config.end_page ?? Infinity
  return storage.getPages().filter((page) => page.pageNumber >= start && page.pageNumber <= end)
}

/** A replacement receipt is scoped to this book, effective configuration and
 * persisted page window. It is admission evidence, not output freshness. */
export function sectioningReplacementSignature(storage: Storage, label: string, booksRoot: string, configPath?: string, promptsDir?: string): string {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  const config = loadBookConfig(label, booksRoot, configPath)
  const range = requiredPartRange(bookDir)
  const outlineStatus = storage.getStepRuns().find(step => step.step === BOOK_OUTLINE_NODE)?.status
  const outlineReady = (outlineStatus === "done" || outlineStatus === "skipped") && !!readBookOutline(storage)
  const sectioning = buildPageSectioningConfig(config)
  const metadata = storage.getLatestNodeData("metadata", "book")?.data as { language_code?: string | null } | undefined
  const translation = buildTranslationConfig(config, metadata?.language_code ?? null)
  const selected = [{ name: sectioning.promptName, model: sectioning.modelId }]
  if (sectioning.maxRefinements > 0) selected.push({ name: sectioning.refinementPromptName, model: sectioning.modelId })
  if (translation) selected.push({ name: translation.promptName, model: translation.modelId })
  if (!outlineReady) {
    const outline = buildBookOutlineConfig(config)
    selected.push(...[outline.promptName, ...(outline.promptName === "book_outline" ? ["book_outline_chunk"] : []), "book_outline_synthesis"].map(name => ({ name, model: outline.modelId })))
  }
  const promptRoots = [path.join(bookDir, "prompts"), ...(promptsDir ? [promptsDir] : [])]
  const engine = createPromptEngine(promptRoots, { basePromptModelId: config.base_prompt_model })
  const prompts = selected.map(({ name, model }) => {
    try {
      const resolved = engine.resolvePrompt(name, { modelId: model })
      // Unlike cache identity, consent binds the selected version as well as
      // resolved content/includes: a byte-identical restore is a new selection.
      return [name, resolved.filePath, engine.fingerprint(name, { modelId: model })]
    } catch (error) {
      // Older usable books may have no installed template. This read must not
      // block opening them; adding/restoring the template changes the receipt.
      return [name, error instanceof Error ? error.message : "unreadable prompt",
        error instanceof Error && error.message.startsWith("Dynamic prompt includes") ? promptRootBasis(promptRoots) : null]
    }
  })
  return configHash(JSON.stringify({
    bookDir, config, range, prompts,
    historyRecovery: storage.getSelectedNodeVersion("history-recovery-state", "book"),
    outline: storage.getSelectedNodeVersion(BOOK_OUTLINE_NODE, BOOK_OUTLINE_ITEM),
    outlineReady,
    typeScale: storage.getSelectedNodeVersion(TYPE_SCALE_NODE, TYPE_SCALE_ITEM),
    metadata: storage.getSelectedNodeVersion("metadata", "book"),
    // Selected versions distinguish a restore or invalidation from the previous
    // input. Extraction records bind image identities without opening asset files.
    pages: activeSectioningPages(storage, config, bookDir).map(page => ({
      page,
      imageFiltering: storage.getSelectedNodeVersion("image-filtering", page.pageId),
      positioned: storage.getSelectedNodeVersion("positioned-text", page.pageId),
      images: storage.getPageImages(page.pageId, true),
    })),
  }))
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
      return [...publishedPageLayouts(storage, pageId)].some(layout => (layout === "fixed") !== fixed)
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
  const refreshedOwners = new Map<string, readonly string[]>()
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
    withSourceGenerationTracking(storage, () => {
      if (inputs() !== captured || pageIds.some((id) => outputVersion(id) !== outputs.get(id))) {
        throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", "Storyboard inputs changed during rendering. Retry using the current saved content.")
      }
      for (const pageId of pageIds) {
        const priorSource = captureStoryboardSource(storage, pageId)
        const writes = pending.get(pageId)
        if (!writes?.has("web-rendering")) throw new SectioningSafetyError("STORYBOARD_PUBLICATION_INCOMPLETE", "Storyboard did not produce every requested page. Previous output is kept.")
        if (!writes.has(FIXED_LAYOUT_SECTIONING_NODE) && storage.getSelectedNodeVersion(FIXED_LAYOUT_SECTIONING_NODE, pageId) !== null) {
          storage.putNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId, null)
        }
        for (const [node, data] of writes) storage.putNodeData(node, pageId, data)
        publishStoryboardSource(storage, pageId, priorSource, refreshedOwners.get(pageId))
      }
      storage.clearNodesByType(["accessibility-assessment"])
      // The shared source-input comparison invalidates only affected source
      // generators. Catalog outputs/attempts keep their own freshness evidence;
      // a Storyboard rerun does not erase unrelated completion telemetry.
    }, [])
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
    publishPage(pageId: string, sectionIds?: readonly string[]) {
      if (sectionIds) refreshedOwners.set(pageId, sectionIds)
      if (!layoutSwitch) commit([pageId])
    },
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
