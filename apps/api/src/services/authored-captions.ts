import { HTTPException } from "hono/http-exception"
import type { Storage } from "@adt/storage"
import { ImageCaptioningOutput, WebRenderingOutput, type OutputStatus } from "@adt/types"
import { outputEvidence, authoredImageAlts } from "@adt/pipeline"

function altConflicts(rendering: WebRenderingOutput): Map<string, Set<string>> {
  const conflicts = new Map<string, Set<string>>()
  const first = authoredImageAlts(rendering, (id, alt) => {
    const values = conflicts.get(id) ?? new Set<string>()
    values.add(alt)
    conflicts.set(id, values)
  })
  for (const [id, values] of conflicts) values.add(first.get(id)!)
  return conflicts
}

/** Legacy conflicts may be retained or reduced during unrelated edits. Only
 * newly introduced contradictory values are rejected, regardless of producer. */
export function assertImageAltConflicts(previous: WebRenderingOutput | undefined, next: WebRenderingOutput): Set<string> {
  const before = altConflicts(previous ?? { sections: [] })
  const after = altConflicts(next)
  for (const [id, values] of after) if ([...values].some((alt) => !before.get(id)?.has(alt))) {
    throw new HTTPException(409, { message: `Conflicting captions for shared image: ${id}. Use one caption for this image before saving.` })
  }
  return new Set(after.keys())
}

/** Explicit authored HTML edits update the authoritative caption collection.
 * Invoke inside the same transaction as the rendering and catalog save. */
export function saveAuthoredImageAlts(storage: Storage, pageId: string, rendering: WebRenderingOutput, outputs: OutputStatus[]): void {
  const previous = WebRenderingOutput.safeParse(storage.getLatestNodeData("web-rendering", pageId)?.data)
  const oldAlts = previous.success ? authoredImageAlts(previous.data) : new Map<string, string>()
  const conflicts = assertImageAltConflicts(previous.success ? previous.data : undefined, rendering)
  // Insertion placeholders are not authored captions. Meaningful alt authored
  // before the first Save still belongs in the authoritative caption store.
  const changed = [...authoredImageAlts(rendering)].filter(([id, alt]) => !conflicts.has(id) && alt !== id && (oldAlts.has(id) || alt.trim()) && oldAlts.get(id) !== alt)
  const byOwner = new Map<string, ImageCaptioningOutput>()
  for (const [id, alt] of changed) {
    const owner = storage.getImageMeta(id)?.pageId
    if (!owner) continue // Missing physical input stays missing in the inventory.
    const collection = byOwner.get(owner) ?? ImageCaptioningOutput.parse(storage.getLatestNodeData("image-captioning", owner)?.data ?? { captions: [] })
    const index = collection.captions.findIndex((entry) => entry.imageId === id)
    const old = collection.captions[index]
    const content = { caption: alt, decorative: old?.decorative === true }
    if (old?.caption === alt) continue
    // Another caption editor may have changed the authoritative value since
    // this HTML's alt was written. Require a refresh instead of losing that edit.
    if (old && oldAlts.get(id) !== old.caption) throw new HTTPException(409, { message: `Caption changed for ${id}. Refresh before saving this HTML edit.` })
    const status = outputs.find((output) => output.identity.kind === "caption" && output.identity.id === id)
    const entry = { ...old, imageId: id, reasoning: old?.reasoning ?? "", ...content, source: "manual" as const,
      review: undefined, input: status ? outputEvidence(status.signature, content) : undefined }
    if (index < 0) collection.captions.push(entry)
    else collection.captions[index] = entry
    byOwner.set(owner, collection)
  }
  for (const [owner, collection] of byOwner) storage.putNodeData("image-captioning", owner, collection)
}
