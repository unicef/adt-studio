import { z } from "zod"

/** One authored spoken script for a content node (SPEC-0014). */
export const ElementAudioEntry = z.object({
  nodeId: z.string().min(1),
  text: z.string(),
})
export type ElementAudioEntry = z.infer<typeof ElementAudioEntry>

/**
 * Authoritative per-page store for authored element scripts.
 *
 * `item_id` is the page id. This is user-authored content, not a derived
 * output: it is kept out of every clear/delete list (ADR-028). The text
 * catalog reads it and emits a synthetic `${nodeId}_audio` entry.
 */
export const ElementAudioOutput = z
  .object({
    entries: z.array(ElementAudioEntry),
    generatedAt: z.string(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.entries.forEach((entry, index) => {
      if (seen.has(entry.nodeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entries", index, "nodeId"],
          message: `Duplicate nodeId: ${entry.nodeId}`,
        })
      }
      seen.add(entry.nodeId)
    })
  })
export type ElementAudioOutput = z.infer<typeof ElementAudioOutput>

/** `node_data` node name. Authored content: never add it to a clear list. */
export const ELEMENT_AUDIO_NODE = "element-audio"

/** Optional `element_audio.json` manifest: authored element ids with audio. */
export const ElementAudioManifest = z.array(z.string())
export type ElementAudioManifest = z.infer<typeof ElementAudioManifest>

const ELEMENT_AUDIO_SUFFIX = "_audio"

// v1 scope: only image leaves (SPEC-0014). Text and container ids are deferred
// to SPEC-0008, so a real text id ending in `_audio` must not be mistaken for
// the synthetic entry.
const IMAGE_ID_BASE_RE = /_im\d{3,}(?:_|$)/

/**
 * v1 authoring scope: `element-audio` accepts image leaves only. The artifact
 * schema stays generic so SPEC-0008 can widen the write path without a data
 * migration.
 */
export function isElementAudioNodeId(nodeId: string): boolean {
  return IMAGE_ID_BASE_RE.test(nodeId)
}

/** The synthetic text-catalog id used as internal plumbing. */
export function elementAudioTextId(nodeId: string): string {
  return `${nodeId}${ELEMENT_AUDIO_SUFFIX}`
}

/** Returns the element's nodeId for a synthetic image-audio id, or null. */
export function parseElementAudioTextId(id: string): string | null {
  if (!id.endsWith(ELEMENT_AUDIO_SUFFIX)) return null
  const nodeId = id.slice(0, -ELEMENT_AUDIO_SUFFIX.length)
  return nodeId.length > 0 && IMAGE_ID_BASE_RE.test(nodeId) ? nodeId : null
}

export function isElementAudioTextId(id: string): boolean {
  return parseElementAudioTextId(id) !== null
}
