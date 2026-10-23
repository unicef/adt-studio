import { BookBusyError, withBookWriter, type Storage } from "@adt/storage"
import { TranslatedImageAsset, type OutputStatus } from "@adt/types"
import { inputSignature, buildEasyReadSourceBlocks, retainedEasyRead, retainedCoreTts } from "@adt/pipeline"
import { outputLocation, outputReviewEntries, canReviewOutputCollection } from "./output-review.js"

const migrationNode = "legacy-output-baseline"

export function legacyOutputBaselineRevision(storage: Storage): number {
  return storage.getLatestNodeData(migrationNode, "book")?.version ?? 0
}

/** First-open compatibility assumption ratified in SPEC-0001 review Note 7.
 * This accepts retained content, not its authorship or generation history.
 * A book-level receipt prevents a later restore from accepting old content
 * against new inputs. Busy books retry on the next book/summary read.
 */
export function acceptLegacyOutputBaseline(storage: Storage, read: () => OutputStatus[]): boolean {
  if (!storage.bookDir || storage.getLatestNodeData(migrationNode, "book")) return false
  try {
    return withBookWriter(storage.bookDir, () => storage.transaction(() => {
      if (storage.getLatestNodeData(migrationNode, "book")) return false
      const changed = new Map<string, { node: string; itemId: string; data: Record<string, unknown> }>()
      const collections = new Map<string, { node: string; itemId: string; data: Record<string, unknown> }>()
      const rows = new Map<string, ReturnType<Storage["getLatestNodeData"]>>()
      const snapshot: Storage = { ...storage, getLatestNodeData(node, itemId) {
        const key = JSON.stringify([node, itemId])
        if (!rows.has(key)) rows.set(key, storage.getLatestNodeData(node, itemId))
        return rows.get(key)!
      } }
      const outputs = read()
      const retained = new Map<string, Record<string, unknown> | undefined>()
      for (const output of outputs) {
        // Missing/omitted/ambiguous content cannot be certified by this
        // compatibility assumption. Preserve it and its existing warning.
        if (!output.usable || output.excluded || output.warnings.some((warning) =>
          warning.reason === "source-conflict" || warning.reason === "output-conflict")) continue
        const location = outputLocation(output, snapshot)
        const key = JSON.stringify([location.node, location.itemId])
        const pending = collections.get(key)
        let row = pending ?? snapshot.getLatestNodeData(location.node, location.itemId)
        let contentHash = output.contentHash
        if (!row && output.identity.kind === "image-translation") {
          // Pre-manifest translations live in the image inventory. Preserve
          // its recorded identity and path; opening must not hash/copy bytes.
          const image = storage.getImageMeta(location.itemId)
          const asset = image && TranslatedImageAsset.safeParse({ ...image,
            imageId: location.itemId, sourceImageId: output.identity.id, language: output.identity.language })
          if (asset?.success) {
            row = { node: location.node, itemId: location.itemId, data: asset.data }
            contentHash = inputSignature(asset.data.hash)
          }
        }
        // Rehydrate only absent active identities, using the same resolver as
        // the catalog. Preserve raw current entries/copies and unknown fields.
        let data = pending?.data ?? (row?.data && typeof row.data === "object" ? structuredClone(row.data) as Record<string, unknown> : undefined)
        // Malformed current data may still have usable retained history. Leave
        // the raw row and its warning intact; migration must not prevent reads.
        if (data && !canReviewOutputCollection(data, location.field)) continue
        if ((output.identity.kind === "easy-read" || output.identity.kind === "preparation") &&
          (!data || !outputReviewEntries(data, output, location).length)) {
          if (!retained.has(key)) {
            const projected = output.identity.kind === "easy-read"
              ? retainedEasyRead(snapshot, buildEasyReadSourceBlocks(snapshot, storage.getPages()))
              : retainedCoreTts(snapshot, output.identity.language!, outputs.filter(item => item.identity.kind === "preparation" && item.identity.language === output.identity.language).map(item => item.identity.id))
            retained.set(key, projected as Record<string, unknown> | undefined)
          }
          const projected = retained.get(key)
          const candidates = projected && outputReviewEntries(projected, output, location).filter(entry =>
            entry.input == null && entry.review == null && contentHashForEntry(output, entry) === contentHash)
          if (projected && candidates?.length) {
            data ??= { ...structuredClone(projected), [location.field]: [] }
            if (location.field === "entries") (data.entries as unknown[]).push(...structuredClone(candidates))
            else {
              const blocks = data.blocks as Array<Record<string, unknown> & { entries: Record<string, unknown>[] }>
              for (const block of projected.blocks as typeof blocks) {
                const entries = block.entries.filter(entry => candidates.includes(entry))
                if (!entries.length) continue
                const current = blocks.find(item => item.pageId === block.pageId && item.sectionId === block.sectionId)
                if (current) current.entries.push(...structuredClone(entries))
                else blocks.push({ ...structuredClone(block), entries: structuredClone(entries) })
              }
            }
          }
        }
        if (!data) continue
        collections.set(key, { node: location.node, itemId: location.itemId, data })
        // A projection's chosen copy cannot certify contradictory hidden data.
        const matching = outputReviewEntries(data, output, location)
        if (matching.some(entry => contentHashForEntry(output, entry) !== contentHash)) continue
        for (const entry of matching) {
          if (entry.input != null || entry.review != null || entry.speechInputSignature != null) continue
          if (output.identity.kind === "preparation" && entry.speechText !== output.text) continue
          entry.review = { signature: output.signature, contentHash, action: "keep" }
          changed.set(key, { node: location.node, itemId: location.itemId, data })
        }
      }
      // Metadata-only: do not use speech publication (which snapshots legacy
      // bytes). Thousands of entries share one new version per collection.
      for (const { node, itemId, data } of changed.values()) storage.putNodeData(node, itemId, data)
      storage.putNodeData(migrationNode, "book", { version: 1 })
      return changed.size > 0
    }))
  } catch (error) {
    if (error instanceof BookBusyError) return false
    throw error
  }
}

function contentHashForEntry(output: OutputStatus, entry: Record<string, unknown>): string {
  switch (output.identity.kind) {
    case "caption": return inputSignature({ caption: entry.caption, decorative: entry.decorative === true })
    case "translation": case "easy-read": return inputSignature(entry.text)
    case "preparation": return inputSignature(entry.speechText)
    case "audio": return inputSignature(entry.audioHash ?? entry.fileName)
    case "timestamps": return inputSignature({ words: entry.words, duration: entry.duration })
    case "image-translation": return inputSignature(entry.hash ?? entry.relativePath)
  }
}
