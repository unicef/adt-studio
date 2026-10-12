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
  return { generatedAt: current.success ? current.data.generatedAt : "retained", blocks: activeBlocks.map((block) => ({ ...block,
    entries: block.entries.flatMap((source) => {
      // Every active reference resolves the same protected-first value. Raw
      // conflicting legacy copies remain in the retained entity version, so
      // removing one consumer cannot expose a generated copy over a correction.
      const entry = entries.get(source.easyReadId)
      return entry ? [{ ...entry, originalText: source.originalText, pageId: source.pageId, sectionId: source.sectionId, sectionIndex: source.sectionIndex }] : []
    }),
  })) }
}

/** Reactivated source IDs recover their own historical corrections. Never infer
 * authorship or copy a neighboring/positional entry onto a new identity. */
export function retainedTranslation(storage: Storage, language: string, activeIds: Iterable<string>): TextCatalogOutput | undefined {
  const itemId = storage.getLatestNodeData("text-catalog-translation", language) ? language : language.replace("-", "_")
  const current = TextCatalogOutput.safeParse(storage.getLatestNodeData("text-catalog-translation", itemId)?.data)
  const entries = new Map((current.success ? current.data.entries : []).map((entry) => [entry.id, entry]))
  // A read must keep ambiguous legacy membership inspectable. Mutation paths
  // reject it before calling providers or publishing a replacement.
  if (current.success && entries.size !== current.data.entries.length) return current.data
  const missing = new Set([...activeIds].filter((id) => !entries.has(id)))
  if (missing.size) for (const row of storage.getAllNodeVersions("text-catalog-translation", itemId).sort((a, b) => b.version - a.version)) {
    const parsed = TextCatalogOutput.safeParse(row.data)
    if (!parsed.success) continue
    const recovered = parsed.data.entries.filter((entry) => missing.has(entry.id))
    // Keep duplicate historical candidates intact as well: generation must not
    // silently pick one correction when a retired source becomes active again.
    if (new Set(recovered.map((entry) => entry.id)).size !== recovered.length) return { entries: [...entries.values(), ...recovered], generatedAt: current.success ? current.data.generatedAt : "retained" }
    for (const entry of recovered) if (missing.delete(entry.id)) entries.set(entry.id, entry)
    if (!missing.size) break
  }
  if (!current.success && !entries.size) return undefined
  if (current.success && entries.size === current.data.entries.length) return current.data
  return { entries: [...entries.values()], generatedAt: current.success ? current.data.generatedAt : "retained" }
}
