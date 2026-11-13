import {
  recoverSectioningTransition, assertExtractionReadable, resolveBookPaths,
  configHash, type Storage,
} from "@adt/storage"
import { captureStoryboardSource, publishStoryboardSource } from "./storyboard-source-state.js"
import { withSourceGenerationTracking } from "./source-generation-state.js"
import { loadBookConfig } from "./config.js"
import { isFixedLayoutBook } from "./fixed-layout-rendering.js"
import { FIXED_LAYOUT_SECTIONING_NODE, publishedPageLayouts } from "./render-sectioning.js"
import { activeSectioningPages } from "./sectioning-window.js"
import { SectioningSafetyError } from "./sectioning-errors.js"

const pageDiagnostic = (pageIds: readonly string[]) => `${pageIds.slice(0, 20).join(", ")}; total=${pageIds.length}`
const incompletePublication = (pageIds: readonly string[]) => new SectioningSafetyError(
  "STORYBOARD_PUBLICATION_INCOMPLETE", `${pageDiagnostic(pageIds)}; A layout switch requires every active page to finish. Previous output is retained.`,
)

/** Buffer one page until its HTML/tree pair is ready. Only a real layout switch
 * buffers the full active window; ordinary publication is incremental. */
export function createStoryboardPublication(storage: Storage, label: string, booksRoot: string, configPath?: string) {
  const { bookDir } = resolveBookPaths(label, booksRoot)
  recoverSectioningTransition(bookDir)
  assertExtractionReadable(bookDir)
  const config = loadBookConfig(label, booksRoot, configPath)
  const pages = activeSectioningPages(storage, config, bookDir)
  // Also covers targeted rendering and the fresh CLI DAG. Publication retains
  // its transactional witness validation if damage occurs after admission.
  if (pages.length) storage.assertHistoryEvidence?.()
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
      const changed = inputs() !== captured ? pageIds : pageIds.filter((id) => outputVersion(id) !== outputs.get(id))
      if (changed.length) {
        throw new SectioningSafetyError("STORYBOARD_INPUT_CHANGED", `${pageDiagnostic(changed)}; Storyboard inputs changed during rendering. Retry using the current saved content.`)
      }
      const missing = pageIds.filter(pageId => !pending.get(pageId)?.has("web-rendering"))
      if (missing.length) throw incompletePublication(missing)
      for (const pageId of pageIds) {
        const priorSource = captureStoryboardSource(storage, pageId)
        const writes = pending.get(pageId)
        if (!writes) throw incompletePublication([pageId])
        if (!writes.has(FIXED_LAYOUT_SECTIONING_NODE) && storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId)?.data != null) {
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
        throw incompletePublication(pages.filter(page => !pageIds.includes(page.pageId)).map(page => page.pageId))
      }
    },
    discardPage(pageId: string) { pending.delete(pageId) },
    publishPage(pageId: string, sectionIds?: readonly string[]) {
      if (sectionIds) refreshedOwners.set(pageId, sectionIds)
      if (!layoutSwitch) commit([pageId])
    },
    publish(expectedPageIds: readonly string[] = [...pending.keys()]) {
      if (layoutSwitch) {
        const missing = pages.filter(page => !pending.get(page.pageId)?.has("web-rendering")).map(page => page.pageId)
        if (missing.length) throw incompletePublication(missing)
        commit(pages.map((page) => page.pageId))
      } else {
        const remaining = expectedPageIds.filter((id) => !published.has(id))
        if (remaining.length) commit(remaining)
      }
    },
  }
}
