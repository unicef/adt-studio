import type { Storage } from "@adt/storage"
import {
  ELEMENT_AUDIO_NODE,
  ElementAudioEntry,
  elementAudioTextId,
  isElementAudioNodeId,
} from "@adt/types"

/**
 * Synthetic text-catalog ids that are actually authored in the element-audio
 * artifact. Classification, muting, batching and neighbour context must use
 * this set instead of the `_audio` id shape: a legacy rendered image can have
 * its own id ending in `_audio` without being authored here.
 */
export function collectElementAudioTextIds(storage: Storage): Set<string> {
  const ids = new Set<string>()
  for (const pageId of storage.getNodeItemIds?.(ELEMENT_AUDIO_NODE) ?? []) {
    const data = storage.getLatestNodeData(ELEMENT_AUDIO_NODE, pageId)?.data
    const entries = (data as { entries?: unknown } | null)?.entries
    if (!Array.isArray(entries)) continue
    for (const candidate of entries) {
      const parsed = ElementAudioEntry.safeParse(candidate)
      if (parsed.success && isElementAudioNodeId(parsed.data.nodeId)) {
        ids.add(elementAudioTextId(parsed.data.nodeId))
      }
    }
  }
  return ids
}
