import type { Storage } from "@adt/storage"
import type { OutputStatus } from "@adt/types"

/** Resolve the persisted collection behind the shared output identity. */
export function outputLocation(output: OutputStatus, storage: Storage) {
  const { identity } = output
  const languageItem = (node: string) => storage.getLatestNodeData(node, identity.language!) ? identity.language! : identity.language!.replace("-", "_")
  switch (identity.kind) {
    case "translation": return { node: "text-catalog-translation", itemId: languageItem("text-catalog-translation"), field: "entries", idField: "id" }
    case "preparation": return { node: "core-tts-catalog", itemId: languageItem("core-tts-catalog"), field: "entries", idField: "id" }
    case "image-translation": return { node: "image-translation", itemId: `${identity.id}_tr_${identity.language}`, field: "self", idField: "sourceImageId" }
    case "timestamps": return { node: "tts-timestamps", itemId: languageItem("tts-timestamps"), field: "timings", idField: "textId" }
    case "audio": return { node: "tts", itemId: languageItem("tts"), field: "entries", idField: "textId" }
    case "easy-read": return { node: "easy-read", itemId: "book", field: "blocks", idField: "easyReadId" }
    case "caption": return { node: "image-captioning", itemId: storage.getImageMeta(identity.id)?.pageId ?? output.pageIds[0], field: "captions", idField: "imageId" }
  }
}

export function outputReviewEntries(data: Record<string, unknown>, output: OutputStatus, location: ReturnType<typeof outputLocation>): Record<string, unknown>[] {
  return (reviewCollectionEntries(data, location.field) ?? []).filter((entry) => entry[location.idField] === output.identity.id &&
    (!["audio", "timestamps"].includes(output.identity.kind) || (entry.voiceSlot ?? "primary") === (output.identity.voiceSlot ?? "primary")))
}

export function canReviewOutputCollection(data: Record<string, unknown>, field: string): boolean {
  return reviewCollectionEntries(data, field) !== null
}

function reviewCollectionEntries(data: Record<string, unknown>, field: string): Record<string, unknown>[] | null {
  const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  const records = (value: unknown): value is Record<string, unknown>[] => Array.isArray(value) && value.every(record)
  if (field === "self") return record(data) ? [data] : null
  if (field === "timings") {
    const entries = record(data.entries) ? Object.values(data.entries) : null
    return records(entries) ? entries : null
  }
  if (field === "blocks") return records(data.blocks) && data.blocks.every(block => records(block.entries))
    ? data.blocks.flatMap(block => block.entries as Record<string, unknown>[]) : null
  return records(data[field]) ? data[field] : null
}
