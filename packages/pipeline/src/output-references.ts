import type { Storage } from "@adt/storage"
import type { OutputKind, OutputReference } from "@adt/types"

/** Inspection pointers accompany the semantic signature; version increments
 * never enter that signature. Physical inputs are identified by their hashes. */
export function captureOutputReferences(storage: Storage, kind: OutputKind, language?: string): OutputReference[] {
  const inputs: Array<[string, string]> = [["config", "book"]]
  if (["translation", "easy-read", "preparation"].includes(kind)) inputs.push(["text-catalog", "book"])
  if (["translation", "preparation"].includes(kind)) inputs.push(["easy-read", "book"])
  if (kind === "caption") inputs.push(["book-summary", "book"])
  if (language && kind === "preparation") inputs.push(["text-catalog-translation", language])
  if (language && ["audio", "timestamps"].includes(kind)) inputs.push(["core-tts-catalog", language])
  return inputs.flatMap(([node, itemId]) => {
    const row = storage.getLatestNodeData(node, itemId)
    return row ? [{ node, itemId, version: row.version }] : []
  })
}
