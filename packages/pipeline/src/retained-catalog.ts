import type { Storage } from "@adt/storage"
import { CoreTtsCatalogOutput, EasyReadOutput } from "@adt/types"

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
  const entries = new Map((current.success ? current.data.blocks : []).flatMap((block) => block.entries.map((entry) => [entry.easyReadId, entry] as const)))
  const activeIds = new Set(activeBlocks.flatMap((block) => block.entries.map((entry) => entry.easyReadId)))
  const missing = new Set([...activeIds].filter((id) => !entries.has(id)))
  if (missing.size) for (const row of storage.getAllNodeVersions("easy-read", "book").sort((a, b) => b.version - a.version)) {
    const parsed = EasyReadOutput.safeParse(row.data)
    if (!parsed.success) continue
    for (const entry of parsed.data.blocks.flatMap((block) => block.entries)) if (missing.delete(entry.easyReadId)) entries.set(entry.easyReadId, entry)
    if (!missing.size) break
  }
  if (!entries.size && !current.success) return undefined
  return { generatedAt: current.success ? current.data.generatedAt : "retained", blocks: activeBlocks.map((block) => ({ ...block,
    entries: block.entries.flatMap((source) => {
      const entry = entries.get(source.easyReadId)
      return entry ? [{ ...entry, pageId: source.pageId, sectionId: source.sectionId, sectionIndex: source.sectionIndex }] : []
    }),
  })) }
}
