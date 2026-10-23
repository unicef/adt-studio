import type { Storage } from "@adt/storage"
import { CoreTtsCatalogOutput, EasyReadOutput } from "@adt/types"
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
