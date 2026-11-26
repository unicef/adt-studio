import type { Storage } from "@adt/storage"
import {
  ELEMENT_AUDIO_NODE,
  ElementAudioEntry,
  elementAudioTextId,
  isElementAudioNodeId,
} from "@adt/types"

/**
 * One artifact row's valid entries: image leaves with non-empty trimmed text.
 * The catalog and the classification set must use the same rule, or a row can
 * be display text for one and authored audio for the other.
 */
export function authoredElementAudioEntries(data: unknown): ElementAudioEntry[] {
  const candidates = (data as { entries?: unknown } | null)?.entries
  if (!Array.isArray(candidates)) return []
  const seen = new Set<string>()
  const entries: ElementAudioEntry[] = []
  for (const candidate of candidates) {
    const parsed = ElementAudioEntry.safeParse(candidate)
    if (!parsed.success) continue
    const text = parsed.data.text.trim()
    if (text.length === 0) continue
    if (!isElementAudioNodeId(parsed.data.nodeId)) continue
    if (seen.has(parsed.data.nodeId)) continue
    seen.add(parsed.data.nodeId)
    entries.push({ nodeId: parsed.data.nodeId, text })
  }
  return entries
}

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
    for (const entry of authoredElementAudioEntries(data)) ids.add(elementAudioTextId(entry.nodeId))
  }
  return ids
}
