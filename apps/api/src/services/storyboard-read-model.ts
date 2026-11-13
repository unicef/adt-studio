import { createHash } from "node:crypto"
import type { NodeDataRow, Storage } from "@adt/storage"
import type { StoryboardCoverage } from "@adt/types"
import { ambiguousPublicOutputIdsFromOwners, publicOutputOwners, requiredPartRange, resolveReadingOrder, storyboardCoverage, storyboardSourceWarnings } from "@adt/pipeline"
import { HistoryIntegrityError } from "@adt/storage"
import { bookStateKey } from "./book-state-memo.js"

type PageFacts = {
  key: string
  owners: Map<string, Set<string>>
  projectionKey?: string
  coverage?: StoryboardCoverage
  renderable?: string[]
  warnings?: ReturnType<typeof storyboardSourceWarnings>
  readingOwners?: Map<string, string | null>
}
type ReadModel = {
  coverage: StoryboardCoverage
  renderable: string[]
  warnings: ReturnType<typeof storyboardSourceWarnings>
  readingOwners: Map<string, string | null>
  ownershipError?: HistoryIntegrityError
}
const books = new Map<string, { generation: string; pages: Map<string, PageFacts>; variants: Map<string, ReadModel> }>()
const signature = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

/** Materialize only the current page inputs for one admitted read. Cross-request
 * entries retain hashes and derived IDs/warnings, never source HTML or a handle.
 * Actual payloads are hashed so an external same-version rewrite is visible. */
function pageView(storage: Storage, page: ReturnType<Storage["getPages"]>[number]) {
  const { pageId } = page
  const rows = new Map<string, NodeDataRow | null | SyntaxError>()
  const key = (node: string, id: string) => JSON.stringify([node, id])
  const read = (node: string, id: string) => {
    let row: NodeDataRow | null | SyntaxError
    try { row = storage.getLatestNodeData(node, id) }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; row = error }
    rows.set(key(node, id), row)
    return row
  }
  for (const node of ["page-sectioning", "fixed-layout-sectioning", "web-rendering", "positioned-text", "image-filtering"]) read(node, pageId)
  const rendering = rows.get(key("web-rendering", pageId))
  if (rendering && !(rendering instanceof SyntaxError)) read("source-generation-state", JSON.stringify(["web-rendering", pageId, rendering.version]))
  const images = storage.getPageImages(pageId, true)
  const fingerprint = signature([[...rows].map(([id, row]) => [id, row instanceof SyntaxError ? { unreadable: true } : row]), images])
  const view: Storage = {
    ...storage,
    getPages: () => [page],
    getLatestNodeData(node, id) {
      const slot = key(node, id)
      if (!rows.has(slot)) throw new Error("Uncaptured Storyboard read dependency")
      const row = rows.get(slot)!
      if (row instanceof SyntaxError) throw row
      return row
    },
    getPageImages(id, includeStoredAsset) {
      if (id !== pageId) throw new Error("Uncaptured Storyboard image dependency")
      return includeStoredAsset ? images : images.map(({ storedAsset: _asset, ...image }) => image)
    },
  }
  return { key: fingerprint, view }
}

/** Current coverage and source-warning contributions share one admitted read.
 * The whole-book key is only a no-change fast path; after a save, unchanged
 * pages retain their derived facts while global identity collisions are checked. */
export function readStoryboardModel(storage: Storage, bookDir: string, pageIds: string[]): ReadModel {
  const part = requiredPartRange(bookDir)
  const generation = bookStateKey(storage, bookDir)
  const variant = JSON.stringify([pageIds, part])
  let book = books.get(bookDir)
  if (!book) book = { generation, pages: new Map(), variants: new Map() }
  if (book.generation !== generation) { book.generation = generation; book.variants.clear() }
  const hit = book.variants.get(variant)
  if (hit) return hit
  const pages = storage.getPages()
  const present = new Set(pages.map(page => page.pageId))
  for (const id of book.pages.keys()) if (!present.has(id)) book.pages.delete(id)
  const views = new Map<string, ReturnType<typeof pageView>>()
  const owners = publicOutputOwners(storage, [], true)
  for (const page of pages) {
    const { pageId } = page
    const snapshot = pageView(storage, page)
    const pageKey = signature([snapshot.key, page])
    views.set(pageId, snapshot)
    let facts = book.pages.get(pageId)
    if (facts?.key !== pageKey) {
      facts = { key: pageKey, owners: publicOutputOwners(snapshot.view, [pageId], false) }
      book.pages.set(pageId, facts)
    }
    for (const [id, contributions] of facts.owners) owners.set(id, new Set([...(owners.get(id) ?? []), ...contributions]))
  }
  const ambiguous = ambiguousPublicOutputIdsFromOwners(owners)
  const namespace = JSON.stringify([[...ambiguous].sort(), part])
  const result: ReadModel = { coverage: { complete: pageIds.length > 0, included: 0, rendered: 0, missingPages: [], missingSections: [] }, renderable: [], warnings: [], readingOwners: new Map() }
  // Keep unreadable quizzes out of independent coverage, but never turn them
  // into an empty set authorizing a retained package.
  const quizzesByPage = new Map<string, string[]>()
  try {
    for (const item of resolveReadingOrder(storage, { includeSections: false }, ambiguous).items) {
      if (item.kind === "quiz") quizzesByPage.set(item.quiz.afterPageId, [...(quizzesByPage.get(item.quiz.afterPageId) ?? []), item.id])
    }
  } catch (error) {
    if (!(error instanceof HistoryIntegrityError)) throw error
    result.ownershipError = error
  }
  for (const [pageId, snapshot] of views) {
    const facts = book.pages.get(pageId)!
    if (facts.projectionKey !== namespace) {
      const renderable: string[] = []
      facts.coverage = storyboardCoverage(snapshot.view, [pageId], id => { renderable.push(id); return true }, ambiguous)
      facts.renderable = renderable
      facts.warnings = storyboardSourceWarnings(snapshot.view, [pageId])
      facts.readingOwners = new Map(resolveReadingOrder(snapshot.view, { pageIds: [pageId], includeQuizzes: false }, ambiguous).items.map(item => [item.id, item.kind === "section" ? item.pageId : null]))
      facts.projectionKey = namespace
    }
    for (const [id, owner] of facts.readingOwners!) result.readingOwners.set(id, owner)
    for (const id of quizzesByPage.get(pageId) ?? []) result.readingOwners.set(id, null)
  }
  for (const pageId of pageIds) {
    const facts = book.pages.get(pageId)
    if (!facts) { result.coverage.complete = false; result.coverage.missingPages.push(pageId); continue }
    const coverage = facts.coverage!
    result.coverage.complete &&= coverage.complete
    result.coverage.included += coverage.included
    result.coverage.rendered += coverage.rendered
    result.coverage.missingPages.push(...coverage.missingPages)
    result.coverage.missingSections.push(...coverage.missingSections)
    result.renderable.push(...facts.renderable!)
    result.warnings.push(...facts.warnings!)
  }
  if (book.variants.size >= 4) book.variants.delete(book.variants.keys().next().value!)
  book.variants.set(variant, result)
  books.delete(bookDir)
  if (books.size >= 128) books.delete(books.keys().next().value!)
  books.set(bookDir, book)
  return result
}

export function currentReadingOwners(storage: Storage, bookDir: string) {
  const result = readStoryboardModel(storage, bookDir, storage.getPages().map(page => page.pageId))
  if (result.ownershipError) throw result.ownershipError
  return result.readingOwners
}
