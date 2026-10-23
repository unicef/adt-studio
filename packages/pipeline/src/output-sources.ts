import { inputSignature } from "./output-freshness.js"
import type { Storage } from "@adt/storage"
import type { AppConfig, ImageCaptioningOutput, TextCatalogEntry, TextCatalogOutput } from "@adt/types"
import { buildTextCatalogSnapshot } from "./text-catalog.js"
import { buildImageInventory } from "./catalog-reconciliation.js"
import { buildEasyReadSourceBlocks, flattenEasyReadEntries } from "./easy-read.js"
import { retainedEasyRead } from "./retained-catalog.js"

/** Legacy duplicate IDs use the first value in reading order everywhere. */
export function firstCatalogEntries<T extends { id: string }>(entries: readonly T[]): Map<string, T> {
  const result = new Map<string, T>()
  for (const entry of entries) if (!result.has(entry.id)) result.set(entry.id, entry)
  return result
}

/** Bind explicit replacement to every retained copy, including hidden values. */
export function conflictingCatalogHashes(entries: readonly TextCatalogEntry[]): Map<string, string> {
  const groups = new Map<string, TextCatalogEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.id) ?? []
    group.push(entry)
    groups.set(entry.id, group)
  }
  return new Map([...groups].filter(([, group]) => group.some((entry) =>
    entry.text !== group[0].text || entry.source !== group[0].source
  )).map(([id, group]) => [id, inputSignature(group)]))
}

/** One complete ordered display-source snapshot for Language, Speech and their
 * read model. Missing captions/Easy Read retain empty slots: omitting them only
 * in one runner changes neighboring preparation signatures on every run. */
export function buildOutputSources(storage: Storage, config: AppConfig) {
  const pages = storage.getPages()
  const snapshot = buildTextCatalogSnapshot(storage, pages)
  const hasAuthored = pages.some((page) => storage.getLatestNodeData("web-rendering", page.pageId)) ||
    storage.getLatestNodeData("glossary", "book") || storage.getLatestNodeData("quiz-generation", "book")
  const catalog = hasAuthored ? snapshot : (storage.getLatestNodeData("text-catalog", "book")?.data as TextCatalogOutput | undefined) ?? snapshot
  const inventory = buildImageInventory(storage)
  const entries = firstCatalogEntries(catalog.entries)
  for (const image of inventory) {
    const caption = image.pageId ? (storage.getLatestNodeData("image-captioning", image.pageId)?.data as ImageCaptioningOutput | undefined)?.captions.find((entry) => entry.imageId === image.id) : undefined
    if (!caption?.decorative && image.catalogLocations.length && !entries.has(image.id)) entries.set(image.id, { id: image.id, text: "", locations: image.catalogLocations })
  }
  const easyBlocks = buildEasyReadSourceBlocks(storage, pages)
  const easy = retainedEasyRead(storage, easyBlocks)
  if (config.easy_read?.enabled) {
    const existing = firstCatalogEntries(flattenEasyReadEntries(easy))
    for (const entry of flattenEasyReadEntries({ blocks: easyBlocks, generatedAt: "" })) {
      entries.set(entry.id, { ...entry, text: existing.get(entry.id)?.text ?? "" })
    }
  }
  return { entries: [...entries.values()], catalog, inventory, easyBlocks, easy }
}

/** Project target text onto the identical source order, retaining missing slots
 * and dropping retired entries without accidentally substituting a language. */
export function translatedDisplayEntries(storage: Storage, language: string, sources: readonly TextCatalogEntry[]): TextCatalogEntry[] {
  const row = storage.getLatestNodeData("text-catalog-translation", language) ?? storage.getLatestNodeData("text-catalog-translation", language.replace("-", "_"))
  const byId = firstCatalogEntries((row?.data as TextCatalogOutput | undefined)?.entries ?? [])
  return sources.map((source) => ({ ...source, text: byId.get(source.id)?.text ?? "" }))
}
