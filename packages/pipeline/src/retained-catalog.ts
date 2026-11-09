import type { Storage } from "@adt/storage"
import { CoreTtsCatalogOutput, EasyReadOutput, TextCatalogOutput } from "@adt/types"
import { indexEasyReadEntries } from "./easy-read.js"

/** Source retirement changes membership, not ownership. When a stable source ID
 * reappears, use its last retained output before planning replacement. A current
 * entry always wins, including a deliberately restored older entity version. */
export function retainedCoreTts(storage: Storage, language: string, activeIds: Iterable<string>): CoreTtsCatalogOutput | undefined {
  const itemId = storage.getLatestNodeData("core-tts-catalog", language) ? language : language.replace("-", "_")
  const current = CoreTtsCatalogOutput.safeParse(storage.getLatestNodeData("core-tts-catalog", itemId)?.data)
  const entries = new Map((current.success ? current.data.entries : []).map((entry) => [entry.id, entry]))
  const missing = new Set([...activeIds].filter((id) => !entries.has(id)))
  if (missing.size) for (const row of storage.getAllNodeVersions("core-tts-catalog", itemId).sort((a, b) => b.version - a.version)) {
    const parsed = CoreTtsCatalogOutput.safeParse(row.data)
    if (!parsed.success) continue
    for (const entry of parsed.data.entries) if (missing.delete(entry.id)) entries.set(entry.id, entry)
    if (!missing.size) break
  }
  return entries.size ? { language, entries: [...entries.values()], generatedAt: current.success ? current.data.generatedAt : "retained" } : undefined
}

export function retainedEasyRead(storage: Storage, activeBlocks: EasyReadOutput["blocks"]): EasyReadOutput | undefined {
  const current = EasyReadOutput.safeParse(storage.getLatestNodeData("easy-read", "book")?.data)
  const entries = indexEasyReadEntries(current.success ? current.data : undefined)
  const activeIds = new Set(activeBlocks.flatMap((block) => block.entries.map((entry) => entry.easyReadId)))
  const missing = new Set([...activeIds].filter((id) => !entries.has(id)))
  if (missing.size) for (const row of storage.getAllNodeVersions("easy-read", "book").sort((a, b) => b.version - a.version)) {
    const parsed = EasyReadOutput.safeParse(row.data)
    if (!parsed.success) continue
    for (const entry of indexEasyReadEntries(parsed.data).values()) if (missing.delete(entry.easyReadId)) entries.set(entry.easyReadId, entry)
    if (!missing.size) break
  }
  if (!entries.size && !current.success) return undefined
  const blocks = current.success ? structuredClone(current.data.blocks) : []
  for (const sourceBlock of activeBlocks) {
    let block = blocks.find((candidate) => candidate.pageId === sourceBlock.pageId && candidate.sectionId === sourceBlock.sectionId)
    if (!block) { block = { ...sourceBlock, entries: [] }; blocks.push(block) }
    for (const source of sourceBlock.entries) {
      if (block.entries.some((entry) => entry.easyReadId === source.easyReadId)) continue
      const retained = entries.get(source.easyReadId)
      if (retained) block.entries.push({ ...retained, originalText: source.originalText, pageId: source.pageId, sectionId: source.sectionId, sectionIndex: source.sectionIndex })
    }
  }
  // Membership comes from activeBlocks in the catalog. Raw retired references
  // remain available so a surviving generated copy cannot hide a correction.
  return { generatedAt: current.success ? current.data.generatedAt : "retained", blocks }
}

/** Read projection for editors, Preview and export. Retained history supplies
 * the canonical value; current sources alone decide membership and location. */
export function activeEasyRead(storage: Storage, sourceBlocks: EasyReadOutput["blocks"]): EasyReadOutput | undefined {
  const retained = retainedEasyRead(storage, sourceBlocks)
  if (!retained) return undefined
  const authority = indexEasyReadEntries(retained)
  return { ...retained, blocks: sourceBlocks.map((block) => ({
    ...block,
    entries: block.entries.flatMap((source) => {
      const entry = authority.get(source.easyReadId)
      return entry ? [{ ...entry, originalText: source.originalText, pageId: source.pageId, sectionId: source.sectionId, sectionIndex: source.sectionIndex }] : []
    }),
  })) }
}

/** Reactivated source IDs recover their own historical corrections. Never infer
 * authorship or copy a neighboring/positional entry onto a new identity. */
export function retainedTranslation(storage: Storage, language: string, activeIds: Iterable<string>): TextCatalogOutput | undefined {
  const itemId = storage.getLatestNodeData("text-catalog-translation", language) ? language : language.replace("-", "_")
  const currentData = storage.getLatestNodeData("text-catalog-translation", itemId)?.data as Partial<TextCatalogOutput> | undefined
  const current = readTranslationEntries(currentData)
  // Keep every candidate for an ambiguous ID inspectable. Ambiguity protects
  // that ID; it must not prevent an unrelated ID recovering its correction.
  const entries = current ? [...current] : []
  const present = new Set(entries.map((entry) => entry.id))
  const missing = new Set([...activeIds].filter((id) => !present.has(id)))
  if (missing.size) for (const row of storage.getAllNodeVersions("text-catalog-translation", itemId).sort((a, b) => b.version - a.version)) {
    const retained = readTranslationEntries(row.data)
    if (!retained) continue
    // Take the complete group from its newest retained version before marking
    // the ID found. Never collapse duplicates or mix candidates across versions.
    const recovered = retained.filter((entry) => missing.has(entry.id))
    entries.push(...recovered)
    for (const entry of recovered) missing.delete(entry.id)
    if (!missing.size) break
  }
  if (!current && !entries.length) return undefined
  return { entries, generatedAt: typeof currentData?.generatedAt === "string" ? currentData.generatedAt : "retained" }
}

/** Match the editor's legacy readability boundary: validate the complete list,
 * without requiring a top-level timestamp or stripping retained entry metadata.
 * Invalid lists are unavailable; they are never partially normalized on read. */
export function readTranslationEntries(data: unknown): TextCatalogOutput["entries"] | undefined {
  const entries = (data as Partial<TextCatalogOutput> | null)?.entries
  return TextCatalogOutput.shape.entries.safeParse(entries).success ? entries : undefined
}
